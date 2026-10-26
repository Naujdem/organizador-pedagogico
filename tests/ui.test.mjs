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
await db.open(); await st.seedIfEmpty(); await st.seedLibraries();
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
assert.equal(root.querySelectorAll('.lib:not(.new)').length, 4, 'inicio muestra las 4 bibliotecas');
assert.match(root.querySelector('.lib[href="#/estructura"]').textContent, /Mis clases[\s\S]*2 documentos/, 'Mis clases cuenta sus documentos y abre la estructura');
assert.match(root.innerHTML, /Reciente/, 'inicio muestra lo reciente');

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
// Grado nuevo con «＋ Otro»: se crea, se marca en el recurso y la unidad nueva queda en ese grado
await form.openResourceForm({defaults: {}});
const d5 = [...document.querySelectorAll('dialog')].pop();
assert.equal(d5.querySelector('#new-grade').hidden, true, 'recuadro de grado oculto por defecto');
const other = d5.querySelector('#f-gradeother'); other.checked = true; other.dispatchEvent(new dom.window.Event('change', {bubbles: true})); await tick();
assert.equal(d5.querySelector('#new-grade').hidden, false, '«Otro» en grados muestra el recuadro');
d5.querySelector('#f-newgrade').value = '12°';
change(d5.querySelector('#f-subject'), quim.id); await tick();
change(d5.querySelector('#f-unit'), '__new'); await tick();
d5.querySelector('#f-newunit').value = 'Química orgánica';
d5.querySelector('#f-title').value = 'Recurso de grado nuevo';
d5.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick(); await tick();
const g12 = (await db.live('grades')).find(x => x.name === '12°');
assert.ok(g12 && g12.level === 'media', 'se creó el grado 12° (Media)');
const rg = (await st.filterResources({text: 'recurso de grado nuevo'}))[0];
assert.deepEqual(rg.gradeIds, [g12.id], 'el recurso quedó en el grado nuevo');
assert.equal((await db.get('units', rg.unitId)).gradeId, g12.id, 'la unidad nueva quedó en el grado nuevo');
// «Otro» con el nombre de un grado que ya existe lo reutiliza
await form.openResourceForm({defaults: {}});
const d6 = [...document.querySelectorAll('dialog')].pop();
const o6 = d6.querySelector('#f-gradeother'); o6.checked = true; o6.dispatchEvent(new dom.window.Event('change', {bubbles: true})); await tick();
d6.querySelector('#f-newgrade').value = '7°'; d6.querySelector('#f-title').value = 'Grado repetido';
d6.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick(); await tick();
assert.equal((await db.live('grades')).filter(x => x.name === '7°').length, 1, 'no duplica grados');
// Validación: unidad nueva sin nombre no guarda
await form.openResourceForm({defaults: {gradeId: g7.id, subjectId: quim.id}});
const d4 = [...document.querySelectorAll('dialog')].pop();
change(d4.querySelector('#f-unit'), '__new'); await tick();
d4.querySelector('#f-title').value = 'No debe guardarse';
d4.querySelector('#rf').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick();
assert.equal((await st.filterResources({text: 'no debe guardarse'})).length, 0, 'unidad nueva sin nombre no guarda');
[...document.querySelectorAll('dialog')].forEach(d => d.close());

// Pantalla de entrada
const lg = await import(R + 'login.js');
lg.maybeShowLogin();
let ov = document.getElementById('login');
assert.ok(ov, 'sin sesión ni «sin cuenta» se muestra la pantalla de entrada');
assert.match(ov.textContent, /Entrar/); assert.match(ov.textContent, /Continuar con Google/); assert.match(ov.textContent, /Regístrate/);
ov.querySelector('#l-toggle').click();
assert.ok(ov.querySelector('#l-pass2'), 'Regístrate pide repetir la contraseña');
assert.match(ov.textContent, /Crear cuenta/);
ov.querySelector('#l-mail').value = 'a@b.co'; ov.querySelector('#l-pass').value = 'abc123'; ov.querySelector('#l-pass2').value = 'otra';
ov.querySelector('form').dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true})); await tick();
assert.match(ov.querySelector('.login-msg').textContent, /no coinciden/, 'valida contraseñas distintas');
ov.querySelector('#l-toggle').click(); ov.querySelector('#l-guest').click();
assert.equal(document.getElementById('login'), null, '«Continuar sin cuenta» cierra la pantalla');
lg.maybeShowLogin();
assert.equal(document.getElementById('login'), null, 'y no vuelve a aparecer');
lg.forgetGuest(); lg.maybeShowLogin();
assert.ok(document.getElementById('login'), 'al cerrar sesión se vuelve a pedir');
document.getElementById('login').remove();

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

// Materias por grado: quitar solo de 7°, seguir en los demás, volver a agregarla y eliminar en todos
const g6 = (await db.live('grades')).find(g => g.name === '6°');
const fis = (await db.live('subjects')).find(x => x.name === 'Física');
const sel = id => `[data-act="open-subject"][data-id="${id}"]`;
const geoRec = (await db.live('subjects')).find(x => x.name === 'Geología');
assert.deepEqual(geoRec.gradeIds, [g7.id], 'una materia creada desde el formulario queda en el grado elegido');
await click(`[data-act="open-grade"][data-id="${g7.id}"]`);
assert.ok(root.querySelector(sel(fis.id)), 'Física aparece en 7°');
await click(`[data-act="del-subject"][data-id="${fis.id}"]`);
const dq = document.querySelector('dialog');
assert.match(dq.textContent, /Quitar solo de 7°/); assert.match(dq.textContent, /Eliminar en todos los grados/);
dq.querySelector('[data-v="grade"]').click(); await tick(); await tick();
assert.equal(root.querySelector(sel(fis.id)), null, 'ya no está en 7°');
const fisAfter = await db.get('subjects', fis.id);
assert.ok(!fisAfter.deletedAt, 'la materia sigue existiendo'); assert.equal(fisAfter.gradeIds.length, 5, 'queda en los demás grados de 6° a 11° (la siembra no la pone en Primaria)');
await click('[data-lv="0"]'); await click(`[data-act="open-grade"][data-id="${g6.id}"]`);
assert.ok(root.querySelector(sel(fis.id)), 'sigue en 6°');
await click('[data-lv="0"]'); await click(`[data-act="open-grade"][data-id="${g7.id}"]`);
await click('[data-act="add-subject"]');
const da = document.querySelector('dialog');
assert.ok(da.querySelector(`[data-add="${fis.id}"]`), 'ofrece volver a agregar Física');
da.querySelector(`[data-add="${fis.id}"]`).click(); await tick(); await tick();
assert.ok(root.querySelector(sel(fis.id)), 'Física vuelve a 7°');
await click(`[data-act="del-subject"][data-id="${fis.id}"]`);
document.querySelector('dialog [data-v="all"]').click(); await tick(); await tick();
assert.ok((await db.get('subjects', fis.id)).deletedAt, 'eliminar en todos los grados borra la materia');
await click('[data-lv="0"]');
const plan = await import(R + 'views/planeacion.js');
await db.create('plannings', {subjectId: quim.id, gradeId: g7.id, unitId: u.id, sessions: [{id: 's1', date: new Date().toLocaleDateString('en-CA'), objective: 'Separar mezclas', resourceIds: [], done: false}]});
await plan.render(root); assert.match(root.innerHTML, /Mezclas/);
await (await import(R + 'views/inicio.js')).render(root);
assert.match(root.innerHTML, /Separar mezclas/, 'clases de hoy en inicio');
await (await import(R + 'views/ajustes.js')).render(root); assert.match(root.innerHTML, /Respaldo/);
console.log('SMOKE UI OK');
