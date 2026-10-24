/* Bibliotecas y carpetas: datos, pantallas (Inicio, biblioteca, Buscar, formulario) y sincronización */
import 'fake-indexeddb/auto';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><body><main id="view"></main><div id="net"></div><button id="fab"></button></body>', {url: 'http://localhost/'});
for (const k of ['window', 'document', 'location', 'Event', 'HashChangeEvent', 'HTMLElement', 'localStorage'])
  Object.defineProperty(globalThis, k, {value: dom.window[k], configurable: true});
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.dispatchEvent = e => dom.window.dispatchEvent(e);
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function (v) { if (v !== undefined) this.returnValue = v; this.open = false; this.dispatchEvent(new dom.window.Event('close')); };

const R = new URL('../js/', import.meta.url).pathname;
const db = await import(R + 'db.js'); const st = await import(R + 'store.js'); const sync = await import(R + 'sync.js');
const tick = () => new Promise(r => setTimeout(r, 30));
const change = (el, v) => { el.value = v; el.dispatchEvent(new dom.window.Event('change', {bubbles: true})); };
const submit = f => f.dispatchEvent(new dom.window.Event('submit', {cancelable: true, bubbles: true}));
const lastDialog = () => [...document.querySelectorAll('dialog')].pop();
const root = document.getElementById('view');

await db.open(); await st.seedIfEmpty();

/* Un documento que ya existía ANTES de las bibliotecas (sin libraryId) */
const [g7] = (await db.live('grades')).filter(g => g.name === '7°');
const quim = (await db.live('subjects')).find(s => s.name === 'Química');
const legacy = await db.create('resources', {title: 'Taller viejo', type: 'taller', subjectId: quim.id, gradeIds: [g7.id], topicIds: [], tags: []});

/* ---------- Datos ---------- */
await st.seedLibraries();
await st.seedLibraries();                                                        // idempotente
let libs = await st.librariesList();
assert.deepEqual(libs.map(l => l.name), ['Mis clases', 'Maestría', 'Estudio', 'Personal'], 'siembra las 4 bibliotecas en orden');
assert.equal(libs[0].id, st.CLASES_ID); assert.equal(libs[0].kind, 'clases');
assert.ok(libs.slice(1).every(l => l.kind === 'libre'));
assert.equal((await db.all('syncQueue')).filter(e => e.store === 'libraries').length, 0, 'la siembra no llena la cola de sincronización');
assert.equal(st.libraryIdOf(legacy), st.CLASES_ID, 'un documento sin libraryId es de Mis clases');
assert.equal((await st.filterResources({libraryId: st.CLASES_ID})).length, 1, 'lo anterior aparece en Mis clases');
assert.equal((await st.filterResources({libraryId: 'seed-lib-maestria'})).length, 0, 'y no en Maestría');
assert.deepEqual(await st.libraryCounts(), {[st.CLASES_ID]: 1});

/* ---------- Formulario: biblioteca libre = solo carpeta ---------- */
const form = await import(R + 'views/recurso-form.js');
await form.openResourceForm({defaults: {libraryId: 'seed-lib-maestria'}});
let d = lastDialog();
assert.equal(d.querySelector('#class-fields').hidden, true, 'en Maestría se ocultan materia, grados, unidad y temas');
assert.equal(d.querySelector('#libre-fields').hidden, false, 'y se muestra la carpeta');
assert.equal(d.querySelector('#f-type').value, 'trabajo', 'tipo por defecto de una biblioteca libre');
assert.ok(d.querySelector('#f-type option[value="lectura"]') && !d.querySelector('#f-type option[value="pada"]'), 'tipos de estudio, sin tipos de clase');
change(d.querySelector('#f-folder'), '__new'); await tick();
assert.equal(d.querySelector('#new-folder').hidden, false, '«Nueva carpeta» muestra su recuadro');
d.querySelector('#f-title').value = 'Ensayo sobre pedagogías críticas';
submit(d.querySelector('#rf')); await tick();
assert.equal((await db.all('folders')).length, 0, 'carpeta nueva sin nombre no se crea');
assert.equal((await st.filterResources({text: 'ensayo sobre'})).length, 0, 'ni se guarda el documento');
d.querySelector('#f-newfolder').value = 'Seminario de investigación';
submit(d.querySelector('#rf')); await tick(); await tick();
const [sem] = await st.foldersFor('seed-lib-maestria');
assert.ok(sem && sem.name === 'Seminario de investigación', 'se creó la carpeta en Maestría');
const ens = (await st.filterResources({text: 'ensayo sobre'}))[0];
assert.equal(ens.libraryId, 'seed-lib-maestria'); assert.equal(ens.folderId, sem.id);
assert.equal(ens.subjectId, undefined); assert.deepEqual(ens.gradeIds, []); assert.equal(ens.unitId, undefined);
assert.equal((await st.filterResources({libraryId: 'seed-lib-maestria', folderId: sem.id})).length, 1, 'filtro por carpeta');
assert.equal((await st.filterResources({libraryId: st.CLASES_ID})).length, 1, 'Mis clases sigue con su único documento');

/* Reutiliza la carpeta si se escribe el mismo nombre */
await form.openResourceForm({defaults: {libraryId: 'seed-lib-maestria'}});
d = lastDialog();
change(d.querySelector('#f-folder'), '__new'); await tick();
d.querySelector('#f-newfolder').value = 'seminario de investigacion'; d.querySelector('#f-title').value = 'Lectura de Freire';
change(d.querySelector('#f-type'), 'lectura');
submit(d.querySelector('#rf')); await tick(); await tick();
assert.equal((await st.foldersFor('seed-lib-maestria')).length, 1, 'no duplica carpetas');
assert.equal((await st.filterResources({text: 'freire'}))[0].type, 'lectura');

/* Documento suelto (sin carpeta) y filtro «Sin carpeta» */
await db.create('resources', {title: 'Apunte suelto', type: 'apunte', libraryId: 'seed-lib-maestria', gradeIds: [], topicIds: [], tags: []});
assert.equal((await st.filterResources({libraryId: 'seed-lib-maestria', folderId: st.NO_FOLDER})).length, 1, 'sin carpeta');
assert.equal((await st.filterResources({libraryId: 'seed-lib-maestria'})).length, 3);

/* Mover un documento de clase a otra biblioteca (cambiar la biblioteca al editar) y volver */
await form.openResourceForm({resource: legacy});
d = lastDialog();
assert.equal(d.querySelector('#f-lib').value, st.CLASES_ID, 'un documento antiguo se edita dentro de Mis clases');
assert.equal(d.querySelector('#class-fields').hidden, false);
change(d.querySelector('#f-lib'), 'seed-lib-estudio'); await tick();
assert.equal(d.querySelector('#class-fields').hidden, true);
assert.ok(d.querySelector('#f-type option[value="lectura"]'), 'aparecen los tipos de estudio');
assert.equal(d.querySelector('#f-type').value, 'taller', 'al editar se conserva el tipo actual del documento');
submit(d.querySelector('#rf')); await tick(); await tick();
let moved = await db.get('resources', legacy.id);
assert.equal(moved.libraryId, 'seed-lib-estudio'); assert.equal(moved.subjectId, undefined, 'al mudarse deja los datos de clase');
await form.openResourceForm({resource: moved});
d = lastDialog(); change(d.querySelector('#f-lib'), st.CLASES_ID); await tick();
change(d.querySelector('#f-type'), 'taller');
submit(d.querySelector('#rf')); await tick(); await tick();
moved = await db.get('resources', legacy.id);
assert.equal(moved.libraryId, undefined, 'volver a Mis clases = sin libraryId (compatible con lo anterior)');
[...document.querySelectorAll('dialog')].forEach(x => x.close());

/* ---------- Inicio ---------- */
const inicio = await import(R + 'views/inicio.js');
await inicio.render(root);
const card = id => root.querySelector(`.lib[href="${id}"]`);
assert.match(card('#/estructura').textContent, /Mis clases[\s\S]*1 documento\b/);
assert.match(card('#/biblioteca/seed-lib-maestria').textContent, /Maestría[\s\S]*3 documentos/);
assert.match(card('#/biblioteca/seed-lib-personal').textContent, /Personal[\s\S]*0 documentos/);
assert.ok(root.querySelector('#newlib'), 'hay botón para crear biblioteca');
assert.match(root.innerHTML, /Reciente/);

/* Crear una biblioteca nueva desde Inicio */
root.querySelector('#newlib').click(); await tick();
d = lastDialog();
assert.match(d.textContent, /Nueva biblioteca/);
d.querySelector('input[name="lf-i"][value="🧠"]').checked = true;
d.querySelector('#lf-n').value = '';
submit(d.querySelector('#lf')); await tick();
assert.equal((await st.librariesList()).length, 4, 'sin nombre no se crea');
d.querySelector('#lf-n').value = 'Investigación';
submit(d.querySelector('#lf')); await tick(); await tick();
libs = await st.librariesList();
const inv = libs.find(l => l.name === 'Investigación');
assert.ok(inv && inv.kind === 'libre' && inv.icon === '🧠' && inv.order === 5, 'biblioteca nueva al final, tipo libre');
assert.ok(card(`#/biblioteca/${inv.id}`), 'aparece en Inicio');

/* ---------- Pantalla de una biblioteca ---------- */
const bib = await import(R + 'views/biblioteca.js');
location.hash = '#/biblioteca/seed-lib-maestria';
await bib.render(root);
assert.match(root.querySelector('h2').textContent, /Maestría/);
assert.equal(root.querySelectorAll('#list .row').length, 3, 'lista los 3 documentos de Maestría');
const chipTexts = [...root.querySelectorAll('#folders .chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
assert.deepEqual(chipTexts, ['Todos 3', 'Sin carpeta 1', 'Seminario de investigación 2', '＋ Carpeta']);
root.querySelector(`[data-f="${sem.id}"]`).click(); await tick(); await tick();
assert.equal(root.querySelectorAll('#list .row').length, 2, 'filtra por carpeta');
assert.ok(root.querySelector('[data-act="edit-folder"]'), 'carpeta elegida: se puede renombrar');
root.querySelector('#q').value = 'freire'; root.querySelector('#q').dispatchEvent(new dom.window.Event('input', {bubbles: true})); await new Promise(r => setTimeout(r, 200));
assert.equal(root.querySelectorAll('#list .row').length, 1, 'búsqueda dentro de la carpeta');
root.querySelector('#q').value = ''; root.querySelector('#q').dispatchEvent(new dom.window.Event('input', {bubbles: true})); await new Promise(r => setTimeout(r, 200));

/* Nueva carpeta desde la biblioteca */
root.querySelector('[data-act="add-folder"]').click(); await tick();
d = lastDialog(); d.querySelector('#at-v').value = 'Tesis'; d.close('ok'); await tick(); await tick();
const tesis = (await st.foldersFor('seed-lib-maestria')).find(f => f.name === 'Tesis');
assert.ok(tesis, 'se creó la carpeta Tesis');
assert.equal(root.querySelectorAll('#list .row').length, 0, 'queda seleccionada y vacía');
assert.match(root.querySelector('#list').textContent, /Ningún documento coincide|vacía/);
/* Eliminar carpeta con documentos: se conservan, quedan sin carpeta */
root.querySelector(`[data-f="${sem.id}"]`).click(); await tick(); await tick();
root.querySelector('[data-act="del-folder"]').click(); await tick();
lastDialog().close('ok'); await tick(); await tick();
assert.equal((await st.foldersFor('seed-lib-maestria')).some(f => f.id === sem.id), false, 'carpeta eliminada');
assert.equal((await st.filterResources({libraryId: 'seed-lib-maestria', folderId: st.NO_FOLDER})).length, 3, 'sus documentos quedan sin carpeta, no se pierden');
/* Biblioteca con documentos no se elimina; vacía sí */
root.querySelector('[data-act="del-lib"]').click(); await tick();
assert.ok(await db.get('libraries', 'seed-lib-maestria') && !(await db.get('libraries', 'seed-lib-maestria')).deletedAt, 'con documentos no se elimina');
assert.equal(document.querySelectorAll('dialog').length, 0, 'ni siquiera pregunta');
location.hash = `#/biblioteca/${inv.id}`;
await bib.render(root);
assert.match(root.querySelector('#list').textContent, /está vacía/, 'biblioteca nueva vacía');
root.querySelector('[data-act="del-lib"]').click(); await tick();
lastDialog().close('ok'); await tick(); await tick();
assert.ok((await db.get('libraries', inv.id)).deletedAt, 'una biblioteca vacía sí se elimina');
location.hash = '#/biblioteca/no-existe';
await bib.render(root);
assert.equal(location.hash, '#/inicio', 'una biblioteca inexistente vuelve a Inicio');
location.hash = `#/biblioteca/${st.CLASES_ID}`;
await bib.render(root);
assert.equal(location.hash, '#/estructura', 'Mis clases se abre como estructura académica');

/* ---------- Buscar ---------- */
const banco = await import(R + 'views/banco.js');
await banco.render(root);
assert.match(root.querySelector('h2').textContent, /Buscar/);
assert.ok(root.querySelector('#libs [data-l=""]') && root.querySelector('#libs [data-l="seed-lib-maestria"]'), 'chips de biblioteca');
assert.equal(root.querySelectorAll('#list .row').length, 4, 'sin filtro: los 4 documentos de todas las bibliotecas');
root.querySelector('#libs [data-l="seed-lib-maestria"]').click(); await tick(); await tick();
assert.equal(root.querySelectorAll('#list .row').length, 3, 'filtra por biblioteca');
assert.equal(root.querySelector('#fg').hidden, true, 'en una biblioteca libre se ocultan Grado/Materia/Unidad/Tema');
assert.equal(root.querySelector('#ff').hidden, false, 'y aparece Carpeta');
assert.ok(root.querySelector('#types [data-t="lectura"]') && !root.querySelector('#types [data-t="pada"]'), 'tipos de esa biblioteca');
root.querySelector('#clear [data-clear]').click(); await tick(); await tick();
assert.equal(root.querySelectorAll('#list .row').length, 4, 'limpiar vuelve a todo');

/* ---------- Respaldo y sincronización ---------- */
assert.ok(sync.SYNC_STORES.includes('libraries') && sync.SYNC_STORES.includes('folders'), 'bibliotecas y carpetas se sincronizan');
const backup = await db.exportAll();
assert.ok(backup.data.libraries.length >= 5 && backup.data.folders.length >= 2, 'el respaldo incluye bibliotecas y carpetas');

/* Nube simulada mínima: lo que sube el push llega a op_records */
const rows = new Map();
const cloud = {from: () => ({
  upsert: async list => { for (const r of list) rows.set(`${r.store}|${r.id}`, r); return {error: null}; },
  select: () => { const q = {order: () => q, gte: () => q, range: () => q, then: ok => ok({data: [], error: null})}; return q; },
})};
await sync.syncWith(cloud, 'user-X');
assert.ok(rows.has('libraries|seed-lib-maestria') && rows.has('libraries|' + inv.id), 'bibliotecas suben a la nube');
assert.ok([...rows.values()].some(r => r.store === 'folders' && r.data.name === 'Tesis'), 'carpetas suben a la nube');
assert.ok([...rows.values()].find(r => r.id === inv.id).deleted_at, 'el borrado de una biblioteca viaja como deleted_at');

/* Una versión de la nube (renombrada en otro dispositivo) gana sobre la siembra local (updatedAt 1) */
await db.put('libraries', {id: 'seed-lib-personal', name: 'Mi vida', icon: '🏠', color: '#d97706', kind: 'libre', order: 4, createdAt: 1, updatedAt: 1, deviceId: 'a'});
const cloud2 = {from: () => ({
  upsert: async () => ({error: null}),
  select: () => { const q = {order: () => q, gte: () => q, range: () => q, then: ok => ok({data: [
    {store: 'libraries', id: 'seed-lib-personal', data: {id: 'seed-lib-personal', name: 'Vida personal', icon: '🏠', color: '#d97706', kind: 'libre', order: 4, createdAt: 1, updatedAt: 999, deviceId: 'b'}, updated_at: 999, deleted_at: null, server_updated_at: new Date(9e9).toISOString()},
  ], error: null})}; return q; },
})};
await db.metaSet('lastPull', null);
await sync.syncWith(cloud2, 'user-X');
assert.equal((await db.get('libraries', 'seed-lib-personal')).name, 'Vida personal', 'la versión de la nube gana a la siembra');

console.log('BIBLIOTECAS OK');
