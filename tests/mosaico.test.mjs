/* Interruptor lista / mosaico: cambia todas las listas, se recuerda y marca el botón activo */
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<body></body>', {url: 'http://localhost/'});
for (const k of ['window', 'document', 'localStorage', 'Event'])
  Object.defineProperty(globalThis, k, {value: dom.window[k], configurable: true});
const ui = await import(new URL('../js/ui.js', import.meta.url).pathname);

assert.equal(ui.getViewMode(), 'list', 'por defecto: lista');
document.body.innerHTML = `<div>${ui.viewToggle()}</div><div ${ui.listAttrs()} id="a"></div><div ${ui.listAttrs()} id="b"></div>`;
const A = document.getElementById('a'), B = document.getElementById('b');
assert.ok(!A.classList.contains('tiles'));
assert.equal(document.querySelector('[data-viewmode="list"]').getAttribute('aria-pressed'), 'true');

document.querySelector('[data-viewmode="tiles"]').dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
assert.ok(A.classList.contains('tiles') && B.classList.contains('tiles'), 'todas las listas pasan a mosaico');
assert.equal(ui.getViewMode(), 'tiles'); assert.equal(localStorage.getItem('op_viewMode'), 'tiles', 'se recuerda');
assert.equal(document.querySelector('[data-viewmode="tiles"]').getAttribute('aria-pressed'), 'true');
assert.ok(document.querySelector('[data-viewmode="list"]').getAttribute('aria-pressed') === 'false');

assert.match(ui.listAttrs(), /list tiles/, 'una pantalla nueva ya nace en mosaico');
document.querySelector('[data-viewmode="list"]').dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
assert.ok(!A.classList.contains('tiles') && ui.getViewMode() === 'list', 'y se puede volver a lista');
console.log('MOSAICO OK');
