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

// Estructura, Planeación, Ajustes
await (await import(R + 'views/estructura.js')).render(root);
change(root.querySelector('#us'), quim.id); await tick(); change(root.querySelector('#ug'), g7.id); await tick();
assert.match(root.innerHTML, /Mezclas/); assert.match(root.innerHTML, /Separación/);
const plan = await import(R + 'views/planeacion.js');
await db.create('plannings', {subjectId: quim.id, gradeId: g7.id, unitId: u.id, sessions: [{id: 's1', date: new Date().toLocaleDateString('en-CA'), objective: 'Separar mezclas', resourceIds: [], done: false}]});
await plan.render(root); assert.match(root.innerHTML, /Mezclas/);
await (await import(R + 'views/inicio.js')).render(root);
assert.match(root.innerHTML, /Separar mezclas/, 'clases de hoy en inicio');
await (await import(R + 'views/ajustes.js')).render(root); assert.match(root.innerHTML, /Respaldo/);
console.log('SMOKE UI OK');
