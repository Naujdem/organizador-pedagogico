/* ============================================================
   db.js · Organizador Pedagógico
   Capa de datos local-first sobre IndexedDB (sin librerías).
     open()                     → abre la base (crea/migra el esquema)
     put / get / all / del      → CRUD básico por almacén
     create(store, datos)       → registro nuevo con id, fechas y deviceId
     update(store, rec, cambios)→ actualiza y marca updatedAt
     remove(store, rec)         → borrado LÓGICO (deletedAt) para poder sincronizar
     live(store)                → registros no borrados
     byIndex(store, idx, valor) → consulta por índice (incluye multiEntry)
     exportAll / importAll      → respaldo completo en JSON
   Cada escritura deja una entrada en 'syncQueue' para la futura sincronización.
   ============================================================ */
import {ulid} from './ulid.js';

const DB_NAME = 'organizador-pedagogico';
const DB_VERSION = 1;

/* Almacén → {opciones, índices}. '*' al inicio = multiEntry (arreglos). */
const SCHEMA = {
  profile:   {idx: []},
  grades:    {idx: ['order']},
  subjects:  {idx: []},
  units:     {idx: ['subjectId', 'gradeId', 'periodId', '[subjectId+gradeId]']},
  topics:    {idx: ['unitId']},
  resources: {idx: ['type', 'subjectId', 'unitId', 'updatedAt', '*gradeIds', '*topicIds', '*tags']},
  plannings: {idx: ['unitId', '[subjectId+gradeId]']},
  courses:   {idx: ['gradeId']},
  students:  {idx: ['courseId', 'externalId']},
  blobs:     {idx: []},                       // archivos y fotos locales
  meta:      {idx: [], noKey: true},          // clave/valor (deviceId, token, etc.)
};
export const STORES = Object.keys(SCHEMA).filter(s => !SCHEMA[s].noKey && s !== 'blobs');

let dbP = null;

export function open() {
  if (dbP) return dbP;
  dbP = new Promise((ok, ko) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result, t = r.transaction;
      for (const [name, def] of Object.entries(SCHEMA)) {
        const s = d.objectStoreNames.contains(name)
          ? t.objectStore(name)
          : d.createObjectStore(name, def.noKey ? undefined : {keyPath: 'id'});
        for (const raw of def.idx) {
          const multi = raw.startsWith('*');
          const spec = multi ? raw.slice(1) : raw;
          const compound = spec.startsWith('[');
          const key = compound ? spec.slice(1, -1).split('+') : spec;
          if (!s.indexNames.contains(spec)) s.createIndex(spec, key, {multiEntry: multi});
        }
      }
      if (!d.objectStoreNames.contains('syncQueue'))
        d.createObjectStore('syncQueue', {keyPath: 'seq', autoIncrement: true});
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbP;
}

/* Ejecuta f(objectStore) dentro de una transacción y devuelve su resultado */
async function tx(stores, mode, f) {
  const d = await open();
  return new Promise((ok, ko) => {
    const t = d.transaction(stores, mode);
    let out;
    try { out = f(...[].concat(stores).map(n => t.objectStore(n))); } catch (e) { return ko(e); }
    /* Si f devolvió una petición IDB se entrega su resultado (aunque sea undefined) */
    t.oncomplete = () => ok(out && typeof out === 'object' && 'readyState' in out ? out.result : out);
    t.onerror = t.onabort = () => ko(t.error);
  });
}

export const put = (s, v, k) => tx(s, 'readwrite', o => o.put(v, k));
export const get = (s, k) => tx(s, 'readonly', o => o.get(k));
export const all = s => tx(s, 'readonly', o => o.getAll());
export const del = (s, k) => tx(s, 'readwrite', o => o.delete(k));
export const clear = s => tx(s, 'readwrite', o => o.clear());

export async function byIndex(store, index, value) {
  return tx(store, 'readonly', o => o.index(index).getAll(value));
}

export const live = async s => (await all(s)).filter(r => !r.deletedAt);

/* ---------- Metadatos y deviceId ---------- */
export const metaGet = k => get('meta', k);
export const metaSet = (k, v) => put('meta', v, k);

let _deviceId = null;
export async function deviceId() {
  if (_deviceId) return _deviceId;
  let id = await metaGet('deviceId');
  if (!id) { id = ulid(); await metaSet('deviceId', id); }
  return (_deviceId = id);
}

/* ---------- Registros con estructura Base ---------- */
async function enqueue(store, rec, op) {
  await tx('syncQueue', 'readwrite', o => o.add({store, id: rec.id, op, ts: Date.now()}));
  try { dispatchEvent(new Event('op-changed')); } catch (_) {}   // la app decide si sincroniza
}

export async function create(store, data = {}) {
  const now = Date.now();
  const rec = {id: ulid(), createdAt: now, updatedAt: now, deviceId: await deviceId(), ...data};
  await put(store, rec);
  await enqueue(store, rec, 'upsert');
  return rec;
}

export async function update(store, rec, changes = {}) {
  const next = {...rec, ...changes, updatedAt: Date.now(), deviceId: await deviceId()};
  await put(store, next);
  await enqueue(store, next, 'upsert');
  return next;
}

/* Borrado lógico: el registro queda como tombstone para propagar el borrado */
export function remove(store, rec) {
  return update(store, rec, {deletedAt: Date.now()});
}

/* ---------- Archivos locales (Blob) ---------- */
export async function saveBlob(blob) {
  const id = ulid();
  await put('blobs', {id, blob, mimeType: blob.type, size: blob.size, createdAt: Date.now()});
  return id;
}
export async function getBlob(id) {
  const r = await get('blobs', id);
  return r ? r.blob : null;
}

/* ---------- Respaldo completo ---------- */
export async function exportAll() {
  const out = {app: 'organizador-pedagogico', version: DB_VERSION, exportedAt: Date.now(), data: {}};
  for (const s of STORES) out.data[s] = await all(s);
  return out;
}

/* Mezcla un respaldo: por cada id gana el registro con updatedAt más reciente (last-write-wins) */
export async function importAll(backup) {
  if (!backup || backup.app !== 'organizador-pedagogico' || !backup.data)
    throw new Error('El archivo no es un respaldo válido del Organizador Pedagógico.');
  let added = 0, replaced = 0;
  for (const s of STORES) {
    const local = Object.fromEntries((await all(s)).map(r => [r.id, r]));
    for (const r of backup.data[s] || []) {
      const l = local[r.id];
      if (!l) { await put(s, r); added++; }
      else if ((r.updatedAt || 0) > (l.updatedAt || 0)) { await put(s, r); replaced++; }
    }
  }
  return {added, replaced};
}
