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
export const TYPE_LABEL = Object.fromEntries(RESOURCE_TYPES.map(t => [t.id, t]));

export async function seedIfEmpty() {
  if (await db.metaGet('seeded')) return;
  if ((await db.all('grades')).length === 0) {
    const grades = [
      ['6°', 'basica'], ['7°', 'basica'], ['8°', 'basica'], ['9°', 'basica'],
      ['10°', 'media'], ['11°', 'media'],
    ];
    for (const [i, [name, level]] of grades.entries()) await db.create('grades', {name, level, order: i + 1});
  }
  if ((await db.all('subjects')).length === 0) {
    const subjects = [
      ['Ciencias Naturales', '#2f9e5f'], ['Biología', '#3b8b3b'],
      ['Química', '#c8772d'], ['Física', '#2d6fc8'],
    ];
    for (const [name, color] of subjects) await db.create('subjects', {name, color});
  }
  await db.metaSet('seeded', true);
}

/* Normaliza para buscar sin tildes ni mayúsculas */
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Filtrado matricial ----------
   filtros = {gradeId, subjectId, unitId, topicId, type, text}  (todos opcionales, se combinan con AND)
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
