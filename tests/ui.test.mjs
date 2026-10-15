import 'fake-indexeddb/auto';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><body><main id="view"></main><div id="net"></div><button id="fab"></button></body>', {url: 'http://localhost/'});
for (const k of ['window','document','location','Event','HashChangeEvent','HTMLElement','localStorage'])
  Object.defineProperty(globalThis, k, {value: dom.window[k], configurable: true});
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.dispatchEvent = e => dom.window.dispatchEvent(e);
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function (v) { if (v !== undefined) this.returnValue = v; this.open = false; this.dispatchEvent(new dom.window.Event('close')); };

const R = new URL('../js/', import.meta.url).pathname;
const db = await import(R + 'db.js'); const st = await import(R + 'store.js');
await db.open(); await st.seedIfEmpty();
const [g7] = (await db.live('grades')).filter(g => g.name === '7°');
const quim = (await db.live('subjects')).find(s => s.name === 'Química');
const u = await db.create('units', {subjectId: quim.id, gradeId: g7.id, title: 'Mezclas', order: 1});
const t = await db.create('topics', {unitId: u.id, title: 'Separación', order: 1});
await db.create('resources', {title: 'Taller <b>Mezclas</b>', type: 'taller', subjectId: quim.id, gradeIds: [g7.id], unitId: u.id, topicIds: [t.id], tags: []});
await db.create('resources', {title: 'Video Destilación', type: 'video', gradeIds: [], topicIds: [], tags: []});

const root = document.getElementById('view');
const tick = () => new Promise(r => setTimeout(r, 30));
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', {bubbles: true})); };

// Inicio
await (await import(R + 'views/inicio.js')).render(root);
assert.match(root.innerHTML, /Recursos \(2\)/, 'inicio cuenta recursos');

// Banco
const banco = await import(R + 'views/banco.js');
await banco.render(root);
assert.equal(root.querySelectorAll('.row').length, 2, 'banco lista 2');
assert.equal(root.querySelector('.t b'), null, 'título con HTML no crea elementos (XSS)');
assert.ok([...root.querySelectorAll('.t')].some(e => /<b>Mezclas<\/b>/.test(e.textContent)), 'se muestra como texto');
change(root.querySelector('#fg'), g7.id); await tick();
assert.equal(root.querySelectorAll('.row').length, 1, 'filtro grado');
change(root.querySelector('#fs'), quim.id); await tick();
change(root.querySelector('#fu'), u.id); await tick();
assert.equal(root.querySelector('#ft').disabled, false, 'tema se habilita con unidad');
change(root.querySelector('#ft'), t.id); await tick();
assert.equal(root.querySelectorAll('.row').length, 1, 'filtro tema');
root.querySelector('[data-t="video"]').click(); await tick();
assert.equal(root.querySelectorAll('.row').length, 0, 'tipo video + filtros = vacío');
root.querySelector('[data-clear]').click(); await tick();
assert.equal(root.querySelectorAll('.row').length, 2, 'limpiar filtros');
const pick = root.querySelector('.pick'); pick.checked = true; pick.dispatchEvent(new dom.window.Event('click', {bubbles: true}));
assert.ok(root.querySelector('.selbar'), 'barra de selección aparece');

// Formulario (cascada) y detalle
const form = await import(R + 'views/recurso-form.js');
await form.openResourceForm({defaults: {gradeId: g7.id, subjectId: quim.id}});
const dlg = document.querySelector('dialog');
assert.ok(dlg.querySelector('#f-unit option[value="' + u.id + '"]'), 'unidad aparece en cascada');
change(dlg.querySelector('#f-unit'), u.id); await tick();
assert.ok(dlg.querySelector('#f-topics input'), 'temas aparecen tras elegir unidad');
dlg.querySelector('#f-title').value = 'Nuevo desde form';
dlg.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick(); await tick();
const all = await st.filterResources({text: 'nuevo desde'});
assert.equal(all.length, 1, 'el formulario guarda'); assert.deepEqual(all[0].gradeIds, [g7.id]);

// Formulario: materia y unidad nuevas + «Otro» con recuadro
await form.openResourceForm({defaults: {gradeId: g7.id}});
const d2 = [...document.querySelectorAll('dialog')].pop();
assert.equal(d2.querySelector('#type-other').hidden, true, '«¿Qué es?» oculto por defecto');
change(d2.querySelector('#f-type'), 'otro'); await tick();
assert.equal(d2.querySelector('#type-other').hidden, false, 'Otro muestra el recuadro');
d2.querySelector('#f-typelabel').value = 'Rúbrica';
change(d2.querySelector('#f-subject'), '__new'); await tick();
assert.equal(d2.querySelector('#new-subject').hidden, false, 'materia nueva muestra su recuadro');
d2.querySelector('#f-newsubject').value = 'Geología';
change(d2.querySelector('#f-unit'), '__new'); await tick();
assert.equal(d2.querySelector('#new-unit').hidden, false, 'unidad nueva muestra su recuadro');
d2.querySelector('#f-newunit').value = 'La Tierra';
d2.querySelector('#f-title').value = 'Rúbrica de exposición';
d2.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick(); await tick();
const geo = (await db.live('subjects')).find(x => x.name === 'Geología');
assert.ok(geo, 'se creó la materia nueva');
const tierra = (await db.live('units')).find(x => x.title === 'La Tierra');
assert.ok(tierra && tierra.subjectId === geo.id && tierra.gradeId === g7.id, 'se creó la unidad en la materia y el grado');
const rub = (await st.filterResources({text: 'rúbrica de exposición'}))[0];
assert.equal(rub.type, 'otro'); assert.equal(rub.typeLabel, 'Rúbrica'); assert.equal(rub.unitId, tierra.id); assert.equal(rub.subjectId, geo.id);
// Si escribe el nombre de una materia que ya existe, se reutiliza (no se duplica)
await form.openResourceForm({defaults: {gradeId: g7.id}});
const d3 = [...document.querySelectorAll('dialog')].pop();
change(d3.querySelector('#f-subject'), '__new'); await tick();
d3.querySelector('#f-newsubject').value = 'geologia';
d3.querySelector('#f-title').value = 'Otro con materia repetida';
d3.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick(); await tick();
assert.equal((await db.live('subjects')).filter(x => /geolog/i.test(x.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).length, 1, 'no duplica materias');
// Validación: unidad nueva sin nombre no guarda
await form.openResourceForm({defaults: {gradeId: g7.id, subjectId: quim.id}});
const d4 = [...document.querySelectorAll('dialog')].pop();
change(d4.querySelector('#f-unit'), '__new'); await tick();
d4.querySelector('#f-title').value = 'No debe guardarse';
d4.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick();
assert.equal((await st.filterResources({text: 'no debe guardarse'})).length, 0, 'unidad nueva sin nombre no guarda');
[...document.querySelectorAll('dialog')].forEach(d => d.close());

// Estructura, Planeación, Ajustes
const est = await import(R + 'views/estructura.js');
await est.render(root);
assert.match(root.innerHTML, /7°/, 'estructura: lista de grados');
const click = sel => { root.querySelector(sel).click(); return tick(); };
await click(`[data-act="open-grade"][data-id="${g7.id}"]`);
assert.match(root.innerHTML, /Materias de 7°/); assert.match(root.innerHTML, /Química/, 'estructura: materias del grado');
assert.match(root.querySelector(`[data-act="open-subject"][data-id="${quim.id}"]`).textContent, /1 unidad.*2 recursos/, 'conteos');
await click(`[data-act="open-subject"][data-id="${quim.id}"]`);
assert.match(root.innerHTML, /Mezclas/); assert.match(root.innerHTML, /Separación/, 'estructura: unidades y temas');
await click(`[data-act="open-topic"][data-id="${t.id}"]`);
assert.match(root.innerHTML, /🧪 Taller/, 'estructura: recursos agrupados por tipo');
assert.equal(root.querySelector('.t b'), null, 'estructura: sin HTML inyectado');
assert.ok(root.querySelector('[data-act="add-res"][data-type="diapo"]'), 'botón agregar Diapositivas');
assert.ok(root.querySelector('[data-act="add-res"][data-type="lap"]'), 'botón agregar Laboratorio');
await click('[data-act="del-res"]'); document.querySelector('dialog').close('ok'); await tick(); await tick();
assert.match(root.innerHTML, /aún no tiene recursos/, 'eliminar recurso desde el tema');
await click('[data-lv="0"]'); assert.match(root.innerHTML, /Grados/, 'migas de pan vuelven al inicio');
const plan = await import(R + 'views/planeacion.js');
await db.create('plannings', {subjectId: quim.id, gradeId: g7.id, unitId: u.id, sessions: [{id: 's1', date: new Date().toLocaleDateString('en-CA'), objective: 'Separar mezclas', resourceIds: [], done: false}]});
await plan.render(root); assert.match(root.innerHTML, /Mezclas/);
await (await import(R + 'views/inicio.js')).render(root);
assert.match(root.innerHTML, /Separar mezclas/, 'clases de hoy en inicio');
await (await import(R + 'views/ajustes.js')).render(root); assert.match(root.innerHTML, /Respaldo/);
console.log('SMOKE UI OK');
