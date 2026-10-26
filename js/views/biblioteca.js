/* ============================================================
   biblioteca.js · Una biblioteca libre (Maestría, Estudio, Personal…)
   Ruta: #/biblioteca/<id>.  Biblioteca → carpeta (un nivel) → documentos.
   «Mis clases» NO pasa por aquí: abre Estructura (Grado → Materia → Unidad → Tema).
   Exporta libraryDialog() para crear / editar una biblioteca (lo usa Inicio).
   ============================================================ */
import * as db from '../db.js';
import {TYPE_LABEL, NO_FOLDER, foldersFor, filterResources, removeFolder, removeLibrary, librariesList, norm} from '../store.js';
import {esc, modal, toast, confirmDlg, listAttrs, viewToggle} from '../ui.js';
import {openResourceForm} from './recurso-form.js';
import {showDetail} from './banco.js';

const ICONS = ['🎓', '📚', '🏠', '🏫', '🧠', '💼', '🔬', '📝', '🗂️', '🌱', '💡', '🎨'];
const COLORS = ['#7c3aed', '#16a34a', '#d97706', '#0284c7', '#dc2626', '#db2777', '#0d9488', '#475569'];

const sel = {};                                  // biblioteca → carpeta elegida ('' = todas, NO_FOLDER = sin carpeta)
let text = '';                                   // búsqueda dentro de la biblioteca
const cur = {libraryId: '', folderId: ''};       // para el botón «＋» flotante
const redraw = () => dispatchEvent(new Event('hashchange'));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const fab = {
  label: 'Nuevo documento',
  onClick: () => openResourceForm({defaults: {libraryId: cur.libraryId, folderId: cur.folderId}, onSaved: redraw}),
};

/* Crear o editar una biblioteca: nombre + icono + color */
export function libraryDialog({library, onSaved} = {}) {
  const l = library || {};
  const dlg = modal(`<form id="lf"><h2>${library ? 'Editar biblioteca' : 'Nueva biblioteca'}</h2>
    <label for="lf-n">Nombre</label>
    <input id="lf-n" required maxlength="40" value="${esc(l.name || '')}" placeholder="Ej. Investigación, Cursos, Ideas">
    <label>Icono</label>
    <div class="grades">${ICONS.map(i =>
      `<label class="chk"><input type="radio" name="lf-i" value="${i}"${(l.icon || ICONS[0]) === i ? ' checked' : ''}> ${i}</label>`).join('')}</div>
    <label>Color</label>
    <div class="swatches">${COLORS.map(c =>
      `<label class="swatch" style="--c:${c}"><input type="radio" name="lf-c" value="${c}"${(l.color || COLORS[0]) === c ? ' checked' : ''} aria-label="Color ${c}"><span></span></label>`).join('')}</div>
    <div class="btns"><button type="button" id="lf-x">Cancelar</button><button class="primary">Guardar</button></div></form>`);
  const $ = s => dlg.querySelector(s);
  const pick = n => (dlg.querySelector(`input[name="${n}"]:checked`) || {}).value;
  $('#lf-x').onclick = () => dlg.close();
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const name = $('#lf-n').value.trim();
    if (!name) return toast('Escribe un nombre.');
    const data = {name, icon: pick('lf-i') || l.icon || ICONS[0], color: pick('lf-c') || l.color || COLORS[0]};
    let saved;
    if (library) saved = await db.update('libraries', library, data);
    else {
      const order = Math.max(0, ...(await librariesList()).map(x => x.order || 0)) + 1;
      saved = await db.create('libraries', {...data, kind: 'libre', order});
    }
    dlg.close();
    onSaved && onSaved(saved);
  };
  return dlg;
}

/* Diálogo de un solo campo de texto → texto escrito, o null si cancela */
function askText(title, label, value = '') {
  return new Promise(res => {
    const dlg = modal(`<form method="dialog"><h2>${esc(title)}</h2>
      <label for="at-v">${esc(label)}</label><input id="at-v" required maxlength="60" value="${esc(value)}">
      <div class="btns"><button value="no" formnovalidate>Cancelar</button><button class="primary" value="ok">Guardar</button></div></form>`);
    dlg.addEventListener('close', () => res(dlg.returnValue === 'ok' ? (dlg.querySelector('#at-v').value.trim() || null) : null));
  });
}

export async function render(root) {
  const id = decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]);
  const lib = id ? await db.get('libraries', id) : null;
  if (!lib || lib.deletedAt) { location.hash = '#/inicio'; return; }
  if (lib.kind === 'clases') { location.hash = '#/estructura'; return; }

  if (cur.libraryId !== lib.id) text = '';
  const [folders, all] = await Promise.all([foldersFor(lib.id), filterResources({libraryId: lib.id})]);
  const counts = {all: all.length, none: all.filter(r => !r.folderId).length};
  for (const f of folders) counts[f.id] = all.filter(r => r.folderId === f.id).length;
  let folderSel = sel[lib.id] || '';
  if (folderSel === NO_FOLDER ? !counts.none : (folderSel && !folders.some(f => f.id === folderSel))) folderSel = '';
  sel[lib.id] = folderSel;
  cur.libraryId = lib.id; cur.folderId = folderSel;
  const folder = folders.find(f => f.id === folderSel);

  const chip = (v, label, n) => `<button class="chip${folderSel === v ? ' on' : ''}" data-f="${esc(v)}">${label} <span class="n">${n}</span></button>`;
  root.innerHTML = `
    <a class="back" href="#/inicio">← Inicio</a>
    <div class="libhead"><span class="libico" style="--c:${esc(lib.color || '#0284c7')}">${lib.icon || '📁'}</span><h2>${esc(lib.name)}</h2>
      <button class="ghost" data-act="edit-lib" aria-label="Editar biblioteca">✎</button>
      <button class="ghost" data-act="del-lib" aria-label="Eliminar biblioteca">🗑</button></div>
    <div class="search"><input id="q" type="search" placeholder="Buscar en ${esc(lib.name)}…" value="${esc(text)}" aria-label="Buscar en ${esc(lib.name)}"></div>
    <div class="chips" id="folders" role="group" aria-label="Carpetas">
      ${chip('', 'Todos', counts.all)}
      ${folders.length && counts.none ? chip(NO_FOLDER, 'Sin carpeta', counts.none) : ''}
      ${folders.map(f => chip(f.id, esc(f.name), counts[f.id])).join('')}
      <button class="chip" data-act="add-folder">＋ Carpeta</button>
    </div>
    ${folder ? `<div class="btns" style="margin-top:0"><button class="ghost" data-act="edit-folder">✎ Renombrar carpeta</button>
      <button class="ghost" data-act="del-folder">🗑 Eliminar carpeta</button></div>` : ''}
    <div class="count"><span id="count"></span>${viewToggle()}</div>
    <div ${listAttrs()} id="list"></div>`;
  const $ = s => root.querySelector(s);

  async function drawList() {
    const rows = await filterResources({libraryId: lib.id, folderId: folderSel, text});
    const byId = Object.fromEntries(folders.map(f => [f.id, f]));
    $('#count').textContent = plural(rows.length, 'documento', 'documentos');
    $('#list').innerHTML = rows.length ? rows.map(r => {
      const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
      const where = !folderSel && r.folderId ? esc(byId[r.folderId]?.name || '') : '';
      return `<div class="row"><button class="body" data-open="${r.id}">
        <div class="t"><span class="ic">${t.icon}</span> ${esc(r.title)}</div>
        <div class="m"><span class="badge">${t.label}${r.typeLabel ? ': ' + esc(r.typeLabel) : ''}</span>${where}
          ${r.source?.kind === 'drive' ? '☁' : ''}${r.syncState === 'pending' ? '<span class="badge pend">pendiente</span>' : ''}</div>
      </button></div>`;
    }).join('') : `<div class="empty">${text || folderSel
      ? 'Ningún documento coincide.'
      : `«${esc(lib.name)}» está vacía. Toca ＋ para agregar el primer documento.${folders.length ? '' :
        '<br><span class="hint">Con «＋ Carpeta» puedes ordenarlos (por ejemplo, una carpeta por seminario o por curso).</span>'}`}</div>`;
  }

  let t;
  $('#q').oninput = e => { text = e.target.value; clearTimeout(t); t = setTimeout(drawList, 150); };

  root.onclick = async e => {
    const f = e.target.closest('[data-f]');
    if (f) { sel[lib.id] = f.dataset.f; return render(root); }
    const o = e.target.closest('[data-open]');
    if (o) return showDetail(await db.get('resources', o.dataset.open), () => render(root));
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;

    if (act === 'add-folder') {
      const name = await askText('Nueva carpeta', 'Nombre (ej. Seminario de investigación)');
      if (!name) return;
      const same = folders.find(x => norm(x.name) === norm(name));
      if (same) { toast('Esa carpeta ya existe.'); sel[lib.id] = same.id; return render(root); }
      sel[lib.id] = (await db.create('folders', {libraryId: lib.id, name, order: folders.length + 1})).id;
      return render(root);
    }
    if (act === 'edit-folder') {
      const name = await askText('Renombrar carpeta', 'Nombre', folder.name);
      if (!name) return;
      await db.update('folders', folder, {name});
      return render(root);
    }
    if (act === 'del-folder') {
      const n = counts[folder.id];
      if (!(await confirmDlg(`¿Eliminar la carpeta «${folder.name}»? ${n ? `Sus ${plural(n, 'documento', 'documentos')} se conservan, solo quedan sin carpeta.` : ''}`.trim()))) return;
      await removeFolder(folder);
      sel[lib.id] = '';
      toast('Carpeta eliminada'); return render(root);
    }
    if (act === 'edit-lib') return libraryDialog({library: lib, onSaved: () => render(root)});
    if (act === 'del-lib') {
      if (all.length) return toast(`«${lib.name}» tiene ${plural(all.length, 'documento', 'documentos')}. Muévelos o elimínalos primero.`, 5000);
      if (!(await confirmDlg(`¿Eliminar la biblioteca «${lib.name}» y sus carpetas?`))) return;
      await removeLibrary(lib);
      toast('Biblioteca eliminada'); location.hash = '#/inicio';
    }
  };

  await drawList();
}
