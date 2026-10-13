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
