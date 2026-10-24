/* ============================================================
   store.js · Organizador Pedagógico
   Consultas de dominio sobre db.js:
     RESOURCE_TYPES, TYPE_LABEL    → tipos de recurso
     seedIfEmpty()                 → grados y materias iniciales (primera vez)
     filterResources(filtros)      → filtrado MATRICIAL: Grado·Materia·Unidad·Tema·Tipo·texto
     unitsFor / topicsFor          → opciones en cascada para los selectores
     nameMap(store)                → id → registro (para pintar nombres)
   ============================================================ */
import * as db from './db.js';

export const RESOURCE_TYPES = [
  {id: 'video',      label: 'Video',      icon: '🎬'},
  {id: 'taller',     label: 'Taller',     icon: '🧪'},
  {id: 'diapo',      label: 'Diapositivas', icon: '📊'},
  {id: 'evaluacion', label: 'Evaluación', icon: '📝'},
  {id: 'lap',        label: 'Laboratorio', icon: '🔬'},
  {id: 'guia',       label: 'Guía',       icon: '📄'},
  {id: 'tarea',      label: 'Tarea',      icon: '🏠'},
  {id: 'pada',       label: 'PADA',       icon: '♿'},
  {id: 'otro',       label: 'Otro',       icon: '📎'},
];
/* Tipos para bibliotecas libres (Maestría, Estudio, Personal…): documentos que no son de clase */
const EXTRA_TYPES = [
  {id: 'trabajo', label: 'Trabajo', icon: '📑'},
  {id: 'lectura', label: 'Lectura', icon: '📖'},
  {id: 'apunte',  label: 'Apunte',  icon: '🗒️'},
];
export const ALL_TYPES = [...RESOURCE_TYPES, ...EXTRA_TYPES];
export const TYPE_LABEL = Object.fromEntries(ALL_TYPES.map(t => [t.id, t]));
const LIBRE_TYPE_IDS = ['trabajo', 'lectura', 'apunte', 'video', 'diapo', 'otro'];
/* kind = 'clases' (tipos de clase) o 'libre' (tipos de estudio/trabajo) */
export const typesForKind = kind => kind === 'libre' ? LIBRE_TYPE_IDS.map(id => TYPE_LABEL[id]) : RESOURCE_TYPES;

/* ---------- Bibliotecas ----------
   «Mis clases» (kind 'clases') guarda la estructura Grado·Materia·Unidad·Tema de siempre.
   Las demás (kind 'libre') son carpetas de un nivel. Un recurso SIN libraryId es de «Mis clases»,
   así lo que ya existía queda ahí sin migrar nada. */
export const CLASES_ID = 'seed-lib-clases';
export const NO_FOLDER = '__none';   // filtro: documentos sin carpeta
export const DEFAULT_LIBRARIES = [
  {id: CLASES_ID,             name: 'Mis clases', icon: '🏫', color: '#0284c7', kind: 'clases', order: 1},
  {id: 'seed-lib-maestria',   name: 'Maestría',   icon: '🎓', color: '#7c3aed', kind: 'libre',  order: 2},
  {id: 'seed-lib-estudio',    name: 'Estudio',    icon: '📚', color: '#16a34a', kind: 'libre',  order: 3},
  {id: 'seed-lib-personal',   name: 'Personal',   icon: '🏠', color: '#d97706', kind: 'libre',  order: 4},
];
export const libraryIdOf = r => r.libraryId || CLASES_ID;

/* Siembra las 4 bibliotecas iniciales (una vez por dispositivo). Se guardan con updatedAt 1 y sin pasar
   por la cola: si la nube ya tiene una versión (renombrada, por ejemplo), esa gana al sincronizar. */
export async function seedLibraries() {
  if (await db.metaGet('seededLibs')) return;
  const have = new Set((await db.all('libraries')).map(l => l.id));
  const dev = await db.deviceId();
  for (const l of DEFAULT_LIBRARIES)
    if (!have.has(l.id)) await db.put('libraries', {...l, createdAt: 1, updatedAt: 1, deviceId: dev});
  await db.metaSet('lastPull', null);        // la próxima sincronización baja todo desde cero
  await db.metaSet('seededLibs', true);
}

export async function librariesList() {
  return (await db.live('libraries')).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
}

export async function foldersFor(libraryId) {
  if (!libraryId) return [];
  return (await db.byIndex('folders', 'libraryId', libraryId)).filter(f => !f.deletedAt)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'es'));
}

/* Un documento más, por biblioteca: {libraryId: n} */
export async function libraryCounts() {
  const out = {};
  for (const r of await db.live('resources')) { const k = libraryIdOf(r); out[k] = (out[k] || 0) + 1; }
  return out;
}

/* Al borrar una carpeta sus documentos se conservan, solo quedan «sin carpeta» */
export async function removeFolder(folder) {
  for (const r of await db.live('resources'))
    if (r.folderId === folder.id) await db.update('resources', r, {folderId: undefined});
  await db.remove('folders', folder);
}

/* Una biblioteca solo se elimina vacía (sin documentos); sus carpetas se van con ella */
export async function removeLibrary(lib) {
  for (const f of await foldersFor(lib.id)) await db.remove('folders', f);
  await db.remove('libraries', lib);
}

export async function seedIfEmpty() {
  if (await db.metaGet('seeded')) return;
  if ((await db.all('grades')).length === 0) {
    const grades = [
      ['6°', 'basica'], ['7°', 'basica'], ['8°', 'basica'], ['9°', 'basica'],
      ['10°', 'media'], ['11°', 'media'],
    ];
    for (const [i, [name, level]] of grades.entries()) await db.create('grades', {id: 'seed-grade-' + (i + 6), name, level, order: i + 1});
  }
  if ((await db.all('subjects')).length === 0) {
    const subjects = [
      ['Ciencias Naturales', '#2f9e5f'], ['Biología', '#3b8b3b'],
      ['Química', '#c8772d'], ['Física', '#2d6fc8'],
    ];
    for (const [name, color] of subjects) await db.create('subjects', {id: 'seed-subject-' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'), name, color});
  }
  await db.metaSet('seeded', true);
}

/* Normaliza para buscar sin tildes ni mayúsculas */
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Filtrado matricial ----------
   filtros = {libraryId, folderId, gradeId, subjectId, unitId, topicId, type, text}  (todos opcionales, se combinan con AND)
   Estrategia: se parte del índice más selectivo y el resto se filtra en memoria. */
export async function filterResources(f = {}) {
  let rows;
  if (f.topicId)        rows = await db.byIndex('resources', 'topicIds', f.topicId);
  else if (f.unitId)    rows = await db.byIndex('resources', 'unitId', f.unitId);
  else if (f.gradeId)   rows = await db.byIndex('resources', 'gradeIds', f.gradeId);
  else if (f.subjectId) rows = await db.byIndex('resources', 'subjectId', f.subjectId);
  else if (f.type)      rows = await db.byIndex('resources', 'type', f.type);
  else                  rows = await db.all('resources');

  const q = norm(f.text).split(/\s+/).filter(Boolean);
  rows = rows.filter(r => {
    if (r.deletedAt) return false;
    if (f.gradeId && !(r.gradeIds || []).includes(f.gradeId)) return false;
    if (f.subjectId && r.subjectId !== f.subjectId) return false;
    if (f.unitId && r.unitId !== f.unitId) return false;
    if (f.topicId && !(r.topicIds || []).includes(f.topicId)) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.libraryId && libraryIdOf(r) !== f.libraryId) return false;
    if (f.folderId === NO_FOLDER) { if (r.folderId) return false; }
    else if (f.folderId && r.folderId !== f.folderId) return false;
    if (q.length) {
      const hay = norm([r.title, r.notes, ...(r.tags || [])].join(' '));
      if (!q.every(w => hay.includes(w))) return false;
    }
    return true;
  });
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* ---------- Opciones en cascada ---------- */
export async function unitsFor({subjectId, gradeId} = {}) {
  let rows = (await db.live('units'));
  if (subjectId) rows = rows.filter(u => u.subjectId === subjectId);
  if (gradeId) rows = rows.filter(u => u.gradeId === gradeId);
  return rows.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function topicsFor(unitId) {
  if (!unitId) return [];
  const rows = (await db.byIndex('topics', 'unitId', unitId)).filter(t => !t.deletedAt);
  return rows.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function nameMap(store) {
  return Object.fromEntries((await db.all(store)).map(r => [r.id, r]));
}

/* Al borrar un padre se limpian las referencias para que no queden recursos «huérfanos» */
export async function cascadeDeleteUnit(unit) {
  for (const t of await topicsFor(unit.id)) await db.remove('topics', t);
  for (const r of await db.byIndex('resources', 'unitId', unit.id))
    if (!r.deletedAt) await db.update('resources', r, {unitId: undefined, topicIds: []});
  await db.remove('units', unit);
}

/* ---------- Materias por grado ----------
   Una materia sin `gradeIds` se ve en TODOS los grados (comportamiento original).
   Con `gradeIds` solo se ve en esos grados. */
export const subjectsForGrade = (subjects, gradeId) => subjects.filter(s => !s.gradeIds || s.gradeIds.includes(gradeId));

export async function addSubjectToGrade(subject, gradeId) {
  if (!subject.gradeIds || subject.gradeIds.includes(gradeId)) return subject;
  return db.update('subjects', subject, {gradeIds: [...subject.gradeIds, gradeId]});
}

/* Una materia usada en estos grados debe verse en ellos (p. ej. al guardar un recurso) */
export async function ensureSubjectInGrades(subjectId, gradeIds) {
  let subj = subjectId && await db.get('subjects', subjectId);
  if (!subj || subj.deletedAt) return;
  for (const g of gradeIds) subj = await addSubjectToGrade(subj, g);
}

/* Quita la materia SOLO de este grado: se eliminan sus unidades y temas en ese grado;
   los recursos conservan su contenido. Si era su último grado, la materia se elimina. */
export async function removeSubjectFromGrade(subject, gradeId, grades) {
  for (const u of await unitsFor({subjectId: subject.id, gradeId})) await cascadeDeleteUnit(u);
  const rest = (subject.gradeIds || grades.map(g => g.id)).filter(i => i !== gradeId);
  return rest.length ? db.update('subjects', subject, {gradeIds: rest}) : db.remove('subjects', subject);
}
