import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';

const root = new URL('../js/', import.meta.url).pathname;
const db = await import(root + 'db.js');
const st = await import(root + 'store.js');

await db.open();
await st.seedIfEmpty();
await st.seedIfEmpty();                                   // idempotente
const grades = await db.live('grades'), subjects = await db.live('subjects');
assert.equal(grades.length, 6, 'siembra 6 grados una sola vez');
assert.equal(subjects.length, 4);

const g7 = grades.find(g => g.name === '7°'), g8 = grades.find(g => g.name === '8°');
const quim = subjects.find(s => s.name === 'Química'), bio = subjects.find(s => s.name === 'Biología');

const u = await db.create('units', {subjectId: quim.id, gradeId: g7.id, title: 'Mezclas', order: 1});
const t1 = await db.create('topics', {unitId: u.id, title: 'Separación', order: 1});
const t2 = await db.create('topics', {unitId: u.id, title: 'Soluciones', order: 2});

const mk = (title, type, extra = {}) => db.create('resources', {title, type, gradeIds: [], topicIds: [], tags: [], ...extra});
const r1 = await mk('Taller: Mezclas', 'taller', {subjectId: quim.id, gradeIds: [g7.id], unitId: u.id, topicIds: [t1.id], tags: ['laboratorio']});
const r2 = await mk('Video: Destilación', 'video', {subjectId: quim.id, gradeIds: [g7.id, g8.id], unitId: u.id, topicIds: [t1.id], tags: ['destilación']});
const r3 = await mk('Evaluación Soluciones', 'evaluacion', {subjectId: quim.id, gradeIds: [g8.id], unitId: u.id, topicIds: [t2.id]});
const r4 = await mk('Guía Fotosíntesis', 'guia', {subjectId: bio.id, gradeIds: [g7.id], tags: ['fotosíntesis']});
const r5 = await mk('PADA Mezclas', 'pada', {subjectId: quim.id, gradeIds: [g7.id], unitId: u.id, topicIds: [t1.id]});

const ids = rows => rows.map(r => r.id).sort();
const eq = (rows, exp, msg) => assert.deepEqual(ids(rows), ids(exp), msg);

eq(await st.filterResources({}), [r1, r2, r3, r4, r5], 'sin filtros: todos');
eq(await st.filterResources({gradeId: g7.id}), [r1, r2, r4, r5], 'por grado (multiEntry)');
eq(await st.filterResources({gradeId: g8.id}), [r2, r3], 'recurso en varios grados');
eq(await st.filterResources({subjectId: bio.id}), [r4], 'por materia');
eq(await st.filterResources({gradeId: g7.id, subjectId: quim.id}), [r1, r2, r5], 'grado + materia');
eq(await st.filterResources({unitId: u.id, type: 'pada'}), [r5], 'unidad + tipo');
eq(await st.filterResources({topicId: t1.id}), [r1, r2, r5], 'por tema (multiEntry)');
eq(await st.filterResources({gradeId: g7.id, subjectId: quim.id, unitId: u.id, topicId: t1.id, type: 'taller'}), [r1], '5 filtros combinados');
eq(await st.filterResources({text: 'fotosintesis'}), [r4], 'búsqueda sin tildes (etiqueta con tilde)');
eq(await st.filterResources({text: 'DESTILACION video'}), [r2], 'búsqueda multi-palabra sin mayúsculas');
eq(await st.filterResources({type: 'tarea'}), [], 'sin coincidencias');

// Cascada de opciones
eq(await st.unitsFor({subjectId: quim.id, gradeId: g7.id}), [u], 'unidades por materia+grado');
eq(await st.unitsFor({subjectId: bio.id}), [], 'otra materia sin unidades');
assert.equal((await st.topicsFor(u.id)).length, 2);

// Borrado lógico: desaparece de filtros pero queda el tombstone para sincronizar
await db.remove('resources', r2);
eq(await st.filterResources({gradeId: g7.id}), [r1, r4, r5], 'borrado lógico oculta el recurso');
const tomb = await db.get('resources', r2.id);
assert.ok(tomb.deletedAt, 'tombstone conservado');

// Cola de sincronización registra upserts
const q = await new Promise(ok => {
  const req = indexedDB.open('organizador-pedagogico');
  req.onsuccess = () => { const g = req.result.transaction('syncQueue').objectStore('syncQueue').getAll(); g.onsuccess = () => ok(g.result); };
});
assert.ok(q.length >= 12 && q.every(j => j.store && j.id && j.op === 'upsert'), 'syncQueue llena');

// Borrar unidad en cascada: temas borrados y recursos sin unidad
await st.cascadeDeleteUnit(await db.get('units', u.id));
assert.equal((await st.topicsFor(u.id)).length, 0, 'temas borrados');
const r1b = await db.get('resources', r1.id);
assert.ok(!r1b.unitId && r1b.topicIds.length === 0 && !r1b.deletedAt, 'recurso conservado y desvinculado');

// Respaldo: exportar → vaciar → importar
const backup = await db.exportAll();
assert.ok(backup.data.resources.length === 5);
await db.clear('resources');
const res = await db.importAll(JSON.parse(JSON.stringify(backup)));
assert.equal((await db.all('resources')).length, 5);
// last-write-wins: un cambio local más reciente NO se pisa con un respaldo viejo
const cur = await db.get('resources', r1.id);
await db.update('resources', cur, {title: 'Editado después'});
await db.importAll(JSON.parse(JSON.stringify(backup)));
assert.equal((await db.get('resources', r1.id)).title, 'Editado después', 'LWW respeta lo más reciente');
await assert.rejects(() => db.importAll({foo: 1}), /respaldo válido/, 'rechaza archivos ajenos');

// IDs ordenables por tiempo
const {ulid} = await import(root + 'ulid.js');
const a = ulid(1000), b = ulid(2000);
assert.ok(a < b && a.length === 26, 'ULID ordenable, 26 caracteres');

console.log('TODAS LAS PRUEBAS PASARON');
