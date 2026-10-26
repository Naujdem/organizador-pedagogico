/* Primaria: niveles por número, orden de grados y migración de datos existentes (una sola vez) */
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
const R = new URL('../js/', import.meta.url).pathname;
const db = await import(R + 'db.js'); const st = await import(R + 'store.js');

assert.equal(st.levelForName('0°'), 'primaria');
assert.equal(st.levelForName('3°'), 'primaria');
assert.equal(st.levelForName('5'), 'primaria');
assert.equal(st.levelForName('6°'), 'basica');
assert.equal(st.levelForName('9°'), 'basica');
assert.equal(st.levelForName('10°'), 'media');
assert.equal(st.levelForName('Transición'), 'basica');
assert.equal(st.levelLabel('primaria'), 'Primaria');

const sorted = st.sortGrades([{name: '11°', level: 'media', order: 6}, {name: '2°', level: 'primaria', order: 2},
  {name: '6°', level: 'basica', order: 1}, {name: '1°', level: 'primaria', order: 1}]);
assert.deepEqual(sorted.map(g => g.name), ['1°', '2°', '6°', '11°']);

/* Datos de antes de Primaria: 6°–11° con order 1–6, materias sin gradeIds, y la siembra ya hecha */
await db.open();
for (const [i, n] of [6, 7, 8, 9, 10, 11].entries())
  await db.create('grades', {id: 'seed-grade-' + n, name: n + '°', level: n >= 10 ? 'media' : 'basica', order: i + 1});
await db.create('subjects', {id: 'seed-subject-ciencias-naturales', name: 'Ciencias Naturales', color: '#2f9e5f'});
await db.create('subjects', {id: 'seed-subject-quimica', name: 'Química', color: '#c8772d'});
await db.create('subjects', {id: 'mia', name: 'Ecología', color: '#000', gradeIds: ['seed-grade-6']});
await db.metaSet('seeded', true);

await st.addPrimariaOnce();
await st.addPrimariaOnce();                                   // idempotente
const grades = st.sortGrades(await db.live('grades'));
assert.deepEqual(grades.map(g => g.name), ['1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°']);
assert.ok(grades.slice(0, 5).every(g => g.level === 'primaria'));
const subj = Object.fromEntries((await db.live('subjects')).map(s => [s.id, s]));
assert.equal(subj['seed-subject-ciencias-naturales'].gradeIds, undefined, 'Ciencias Naturales sigue en todos los grados');
assert.equal(st.subjectsForGrade(Object.values(subj), 'seed-grade-1').map(s => s.name).join(), 'Ciencias Naturales', 'en 1° solo Ciencias Naturales');
assert.ok(st.subjectsForGrade(Object.values(subj), 'seed-grade-8').some(s => s.name === 'Química'), 'Química sigue en 8°');
assert.deepEqual(subj.mia.gradeIds, ['seed-grade-6'], 'una materia con grados propios no se toca');

/* Si el usuario ya tenía un «3°», no se duplica */
await db.metaSet('primariaAdded', false);
const before = (await db.live('grades')).length;
await st.addPrimariaOnce();
assert.equal((await db.live('grades')).length, before, 'no duplica grados existentes');
console.log('PRIMARIA OK');
