/* ============================================================
   mover.js · «Mover» un documento a otra carpeta (o a otra biblioteca libre)
   moveDialog(resource, onMoved) → cuadro con Biblioteca + Carpeta (o carpeta nueva).
   Solo para documentos de bibliotecas libres (Maestría, Estudio, Personal…):
   los de «Mis clases» se ordenan por grado, materia, unidad y tema (botón Editar).
   ============================================================ */
import * as db from '../db.js';
import {librariesList, foldersFor, libraryIdOf, NO_FOLDER, norm, CLASES_ID} from '../store.js';
import {esc, options, modal, toast} from '../ui.js';

const NEW = '__new';

export const canMove = r => libraryIdOf(r) !== CLASES_ID;

export async function moveDialog(r, onMoved) {
  const libs = (await librariesList()).filter(l => l.kind !== 'clases');
  if (!libs.length) return toast('No hay bibliotecas para mover este documento.');
  const st = {libraryId: libs.some(l => l.id === r.libraryId) ? r.libraryId : libs[0].id, folderId: r.folderId || ''};
  const dlg = modal(`<form id="mv"><h2>Mover «${esc(r.title)}»</h2>
    <label for="mv-l">Biblioteca</label><select id="mv-l">${options(libs.map(l => ({id: l.id, name: `${l.icon || ''} ${l.name}`.trim()})), st.libraryId)}</select>
    <label for="mv-f">Carpeta</label><select id="mv-f"></select>
    <div id="mv-new" hidden><label for="mv-n">Nombre de la carpeta nueva</label><input id="mv-n" maxlength="60" placeholder="Ej. Seminario de investigación"></div>
    <div class="btns"><button type="button" id="mv-x">Cancelar</button><button class="primary">Mover</button></div></form>`);
  const $ = s => dlg.querySelector(s);

  async function fillFolders() {
    const folders = await foldersFor(st.libraryId);
    if (st.folderId && st.folderId !== NEW && !folders.some(f => f.id === st.folderId)) st.folderId = '';
    $('#mv-f').innerHTML = `<option value="">— Sin carpeta —</option>` + options(folders, st.folderId) +
      `<option value="${NEW}"${st.folderId === NEW ? ' selected' : ''}>＋ Carpeta nueva…</option>`;
    $('#mv-new').hidden = st.folderId !== NEW;
  }
  $('#mv-l').onchange = e => { st.libraryId = e.target.value; st.folderId = ''; fillFolders(); };
  $('#mv-f').onchange = e => { st.folderId = e.target.value; $('#mv-new').hidden = st.folderId !== NEW; if (st.folderId === NEW) $('#mv-n').focus(); };
  $('#mv-x').onclick = () => dlg.close();
  $('#mv').onsubmit = async e => {
    e.preventDefault();
    let folderId = st.folderId;
    if (folderId === NEW) {
      const name = $('#mv-n').value.trim();
      if (!name) return toast('Escribe el nombre de la carpeta nueva.');
      const mine = await foldersFor(st.libraryId);
      const same = mine.find(f => norm(f.name) === norm(name));
      folderId = same ? same.id : (await db.create('folders', {libraryId: st.libraryId, name, order: mine.length + 1})).id;
    }
    const moved = await db.update('resources', r, {libraryId: st.libraryId, folderId: folderId || undefined});
    dlg.close();
    toast('Documento movido');
    onMoved && onMoved(moved);
  };
  await fillFolders();
  return dlg;
}
