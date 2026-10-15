/* ============================================================
   sync.js · Sincronización local ⇄ nube (tabla op_records)
   - IndexedDB sigue siendo la fuente local: la app funciona sin internet.
   - Cada cambio local queda en 'syncQueue' (db.js); aquí se sube a Supabase.
   - Lo que cambió en la nube se baja y se mezcla: gana el updatedAt más reciente.
   - NO se sincronizan: estudiantes (datos de menores), archivos locales (blobs)
     ni el perfil. Los archivos viajan por tu Google Drive.
   ============================================================ */
import * as db from './db.js';
import {mergeDuplicates} from './dedupe.js';

export const SYNC_STORES = ['grades', 'subjects', 'units', 'topics', 'resources', 'plannings', 'courses'];
const CHUNK = 200, PAGE = 1000;

/* Sube lo pendiente y baja lo nuevo. sb = cliente Supabase, userId = auth.uid() */
export async function syncWith(sb, userId) {
  /* Si cambió la cuenta, se empieza de cero para no mezclar usuarios */
  if ((await db.metaGet('syncUser')) !== userId) {
    await db.metaSet('syncUser', userId);
    await db.metaSet('lastPull', null);
    await db.metaSet('syncSeeded', false);
  }
  const pulled = await pull(sb);
  await mergeDuplicates();                              // grados/materias repetidos entre dispositivos
  const pushed = await push(sb, userId);
  await db.metaSet('lastSync', Date.now());
  return {pulled, pushed};
}

/* ---------- Bajar ---------- */
async function pull(sb) {
  const since = await db.metaGet('lastPull');
  let applied = 0, latest = since || null;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('op_records')
      .select('store,id,data,updated_at,deleted_at,server_updated_at')
      .order('server_updated_at', {ascending: true}).order('id', {ascending: true})
      .range(from, from + PAGE - 1);
    if (since) q = q.gte('server_updated_at', since);   // gte: las filas de un mismo lote comparten hora
    const {data, error} = await q;
    if (error) throw new Error(error.message);
    for (const row of data) {
      if (!SYNC_STORES.includes(row.store)) continue;
      const local = await db.get(row.store, row.id);
      if (!local || (row.updated_at || 0) > (local.updatedAt || 0)) {
        await db.put(row.store, row.data);              // directo: no vuelve a la cola
        applied++;
      }
      if (!latest || row.server_updated_at > latest) latest = row.server_updated_at;
    }
    if (data.length < PAGE) break;
  }
  if (latest) await db.metaSet('lastPull', latest);
  return applied;
}

/* ---------- Subir ---------- */
async function push(sb, userId) {
  const queue = await db.all('syncQueue');
  const wanted = new Map();                             // 'store/id' → {store,id}
  for (const e of queue) if (SYNC_STORES.includes(e.store)) wanted.set(e.store + '/' + e.id, {store: e.store, id: e.id});
  if (!(await db.metaGet('syncSeeded')))                // primera vez: sube todo lo que ya existía
    for (const s of SYNC_STORES) for (const r of await db.all(s)) wanted.set(s + '/' + r.id, {store: s, id: r.id});

  const rows = [];
  for (const {store, id} of wanted.values()) {
    const rec = await db.get(store, id);
    if (rec) rows.push({user_id: userId, store, id, data: rec, updated_at: rec.updatedAt || 0, deleted_at: rec.deletedAt || null});
  }
  for (let i = 0; i < rows.length; i += CHUNK) {
    const {error} = await sb.from('op_records').upsert(rows.slice(i, i + CHUNK), {onConflict: 'user_id,store,id'});
    if (error) throw new Error(error.message);
  }
  /* Se vacía de la cola solo lo que ya se subió (lo escrito durante la subida queda para la próxima) */
  const maxSeq = queue.reduce((m, e) => Math.max(m, e.seq), 0);
  for (const e of queue) if (e.seq <= maxSeq) await db.del('syncQueue', e.seq);
  await db.metaSet('syncSeeded', true);
  return rows.length;
}

/* ---------- Disparador con el cliente real (carga perezosa) ---------- */
let running = null;

export const hasStoredSession = () => {
  try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (_) { return false; }
};

/* Devuelve {pulled, pushed}, o null si no se puede sincronizar ahora (sin internet o sin sesión) */
export function syncNow() {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine || !hasStoredSession()) return null;
    const {cloud, currentUser} = await import('./cloud.js');
    const user = await currentUser();
    if (!user) return null;
    return syncWith(await cloud(), user.id);
  })().finally(() => { running = null; });
  return running;
}
