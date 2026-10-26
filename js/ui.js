/* ============================================================
   ui.js · Organizador Pedagógico
   Utilidades de interfaz compartidas: $, esc, options, toast, diálogos.
   ============================================================ */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/* <option>s a partir de una lista [{id, name}] */
export function options(list, selected, placeholder) {
  const head = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return head + list.map(o =>
    `<option value="${esc(o.id)}"${o.id === selected ? ' selected' : ''}>${esc(o.name ?? o.title ?? o.label)}</option>`
  ).join('');
}

let toastT;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}

/* Diálogo modal reutilizable. Devuelve el <dialog>; se cierra con dlg.close() */
export function modal(html, {onClose} = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.innerHTML = html;
  document.body.append(dlg);
  dlg.addEventListener('close', () => { onClose && onClose(); dlg.remove(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}

export const confirmDlg = (msg, okLabel = 'Eliminar') => new Promise(res => {
  const dlg = modal(`<form method="dialog"><p>${esc(msg)}</p>
    <div class="btns"><button value="no">Cancelar</button><button value="ok" class="danger solid">${esc(okLabel)}</button></div></form>`);
  dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'));
});

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- Modo de vista de los documentos: lista o mosaico ----------
   Una sola preferencia para toda la app (se recuerda en este dispositivo).
   Las pantallas dibujan su lista con listAttrs() y ponen viewToggle() donde quieran el interruptor;
   un solo clic delegado cambia todas las listas visibles sin volver a dibujarlas. */
const VIEW_KEY = 'op_viewMode';
export function getViewMode() {
  try { return localStorage.getItem(VIEW_KEY) === 'tiles' ? 'tiles' : 'list'; } catch (_) { return 'list'; }
}
export const listAttrs = (extra = '') => `class="list${getViewMode() === 'tiles' ? ' tiles' : ''}${extra ? ' ' + extra : ''}" data-viewlist`;
export function viewToggle() {
  const m = getViewMode();
  const b = (v, icon, label) =>
    `<button type="button" class="${m === v ? 'on' : ''}" data-viewmode="${v}" aria-pressed="${m === v}" aria-label="${label}" title="${label}">${icon}</button>`;
  return `<span class="viewtoggle" role="group" aria-label="Forma de ver los documentos">${b('list', '☰', 'Ver como lista')}${b('tiles', '▦', 'Ver como mosaico')}</span>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-viewmode]');
  if (!b) return;
  const m = b.dataset.viewmode === 'tiles' ? 'tiles' : 'list';
  try { localStorage.setItem(VIEW_KEY, m); } catch (_) {}
  document.querySelectorAll('[data-viewlist]').forEach(l => l.classList.toggle('tiles', m === 'tiles'));
  document.querySelectorAll('[data-viewmode]').forEach(x => {
    x.classList.toggle('on', x.dataset.viewmode === m); x.setAttribute('aria-pressed', String(x.dataset.viewmode === m));
  });
});
