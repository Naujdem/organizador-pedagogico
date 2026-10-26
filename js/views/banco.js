/* ============================================================
   banco.js · «Buscar»: todos los documentos de todas las bibliotecas
   A la vista solo lo esencial: buscador + biblioteca. Los filtros finos
   (Grado · Materia · Unidad · Tema · Carpeta · Tipo) están en «Más filtros».
   Selección múltiple → «Crear guía» (puente al Módulo 2).
   También exporta showDetail (ficha de un documento) para otras pantallas.
   ============================================================ */
import * as db from '../db.js';
import {ALL_TYPES, TYPE_LABEL, typesForKind, CLASES_ID, NO_FOLDER, libraryIdOf, librariesList, foldersFor,
  filterResources, unitsFor, topicsFor, nameMap, sortGrades} from '../store.js';
import {esc, options, modal, toast, confirmDlg, listAttrs, viewToggle} from '../ui.js';
import {openResourceForm} from './recurso-form.js';
import {openSource} from '../viewer.js';
import {moveDialog, canMove} from './mover.js';

/* Se conservan al navegar a otra sección y volver */
const F = {libraryId: '', folderId: '', gradeId: '', subjectId: '', unitId: '', topicId: '', type: '', text: ''};
const picked = new Set();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const fab = {label: 'Nuevo documento', onClick: () => openResourceForm({defaults: F, onSaved: () => dispatchEvent(new Event('hashchange'))})};

export async function render(root) {
  const [grades, subjects, libs] = await Promise.all([db.live('grades'), db.live('subjects'), librariesList()]);
  sortGrades(grades);
  const kindOf = id => libs.find(l => l.id === id)?.kind || (id === CLASES_ID ? 'clases' : 'libre');
  const classMode = () => !F.libraryId || kindOf(F.libraryId) === 'clases';   // ¿mostrar Grado/Materia/Unidad/Tema?
  const hiddenActive = () => ['gradeId', 'subjectId', 'unitId', 'topicId', 'folderId', 'type'].some(k => F[k]);

  root.innerHTML = `
    <h2>Buscar</h2>
    <div class="search"><input id="q" type="search" placeholder="Buscar por título, nota o etiqueta…" value="${esc(F.text)}" aria-label="Buscar"></div>
    <div class="chips" id="libs" role="group" aria-label="Biblioteca"></div>
    <details class="more" id="more"${hiddenActive() ? ' open' : ''}>
      <summary>Más filtros</summary>
      <div class="filters">
        <select id="fg" aria-label="Grado"></select>
        <select id="fs" aria-label="Materia"></select>
        <select id="fu" aria-label="Unidad"></select>
        <select id="ft" aria-label="Tema"></select>
        <select id="ff" aria-label="Carpeta"></select>
      </div>
      <div class="chips" id="types" role="group" aria-label="Tipo de documento"></div>
    </details>
    <div class="count"><span><span id="count"></span><span id="clear"></span></span>${viewToggle()}</div>
    <div ${listAttrs()} id="list"></div>
    <div id="selbar"></div>`;
  const $ = s => root.querySelector(s);

  function drawClear() {
    $('#clear').innerHTML = Object.values(F).some(Boolean) ? '<button class="chip" data-clear="1">✕ Limpiar</button>' : '';
  }

  async function drawFilters() {
    const cls = classMode();
    $('#libs').innerHTML = `<button class="chip${F.libraryId ? '' : ' on'}" data-l="">Todas</button>` +
      libs.map(l => `<button class="chip${F.libraryId === l.id ? ' on' : ''}" data-l="${esc(l.id)}">${l.icon || ''} ${esc(l.name)}</button>`).join('');
    for (const id of ['fg', 'fs', 'fu', 'ft']) $('#' + id).hidden = !cls;
    $('#ff').hidden = cls;
    if (cls) {
      $('#fg').innerHTML = options(grades, F.gradeId, 'Todos los grados');
      $('#fs').innerHTML = options(subjects, F.subjectId, 'Todas las materias');
      const units = await unitsFor({subjectId: F.subjectId || undefined, gradeId: F.gradeId || undefined});
      if (F.unitId && !units.some(u => u.id === F.unitId)) { F.unitId = ''; F.topicId = ''; }
      $('#fu').innerHTML = options(units.map(u => ({id: u.id, name: u.title})), F.unitId, 'Todas las unidades');
      const topics = await topicsFor(F.unitId);
      if (F.topicId && !topics.some(t => t.id === F.topicId)) F.topicId = '';
      $('#ft').innerHTML = options(topics.map(t => ({id: t.id, name: t.title})), F.topicId, 'Todos los temas');
      $('#ft').disabled = !F.unitId;
    } else {
      const folders = await foldersFor(F.libraryId);
      if (F.folderId && F.folderId !== NO_FOLDER && !folders.some(f => f.id === F.folderId)) F.folderId = '';
      $('#ff').innerHTML = options(folders, F.folderId, 'Todas las carpetas') +
        `<option value="${NO_FOLDER}"${F.folderId === NO_FOLDER ? ' selected' : ''}>Sin carpeta</option>`;
    }
    const types = F.libraryId ? typesForKind(kindOf(F.libraryId)) : ALL_TYPES;
    $('#types').innerHTML =
      `<button class="chip${F.type ? '' : ' on'}" data-t="">Todos los tipos</button>` +
      types.map(t => `<button class="chip${F.type === t.id ? ' on' : ''}" data-t="${t.id}">${t.icon} ${t.label}</button>`).join('');
    drawClear();
  }

  async function drawList() {
    const [rows, sMap, gMap, lMap, fMap] = await Promise.all([
      filterResources(F), nameMap('subjects'), nameMap('grades'), nameMap('libraries'), nameMap('folders')]);
    $('#count').textContent = plural(rows.length, 'documento', 'documentos');
    drawClear();
    $('#list').innerHTML = rows.length ? rows.map(r => {
      const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
      const lid = libraryIdOf(r);
      let meta;
      if (lid === CLASES_ID) {
        const g = (r.gradeIds || []).map(id => gMap[id]?.name).filter(Boolean).join(', ');
        meta = [g, sMap[r.subjectId]?.name].filter(Boolean).join(' · ');
      } else meta = [lMap[lid]?.name, fMap[r.folderId]?.name].filter(Boolean).join(' · ');
      return `<div class="row${picked.has(r.id) ? ' picked' : ''}" data-id="${r.id}">
        <input class="pick" type="checkbox" data-id="${r.id}" aria-label="Seleccionar ${esc(r.title)}"${picked.has(r.id) ? ' checked' : ''}>
        <button class="body" data-open="${r.id}">
          <div class="t"><span class="ic">${t.icon}</span> ${esc(r.title)}</div>
          <div class="m"><span class="badge${r.type === 'pada' ? ' pada' : ''}">${t.label}${r.typeLabel ? ': ' + esc(r.typeLabel) : ''}</span>${esc(meta)}
            ${r.source?.kind === 'drive' ? '☁' : ''}${r.syncState === 'pending' ? '<span class="badge pend">pendiente</span>' : ''}</div>
        </button></div>`;
    }).join('') : `<div class="empty">${Object.values(F).some(Boolean)
      ? 'Ningún documento coincide con estos filtros.' : 'Aún no tienes documentos. Toca ＋ para agregar el primero.'}</div>`;
    drawSelbar();
  }

  function drawSelbar() {
    $('#selbar').innerHTML = picked.size
      ? `<div class="selbar"><span>${picked.size} seleccionado${picked.size > 1 ? 's' : ''}</span>
         <span><button id="clr">Quitar</button> <button id="mkguide">Crear guía</button></span></div>` : '';
  }

  async function refresh() { await drawFilters(); await drawList(); }

  /* ---- Eventos (delegados) ---- */
  let t;
  $('#q').oninput = e => { F.text = e.target.value; clearTimeout(t); t = setTimeout(drawList, 150); };
  $('#libs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    F.libraryId = b.dataset.l;
    Object.assign(F, {folderId: '', gradeId: '', subjectId: '', unitId: '', topicId: '', type: ''});   // otra biblioteca, otros filtros
    refresh();
  };
  $('#fg').onchange = e => { F.gradeId = e.target.value; refresh(); };
  $('#fs').onchange = e => { F.subjectId = e.target.value; refresh(); };
  $('#fu').onchange = e => { F.unitId = e.target.value; F.topicId = ''; refresh(); };
  $('#ft').onchange = e => { F.topicId = e.target.value; drawList(); drawFilters(); };
  $('#ff').onchange = e => { F.folderId = e.target.value; drawList(); };
  $('#types').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    F.type = b.dataset.t;
    refresh();
  };
  $('#clear').onclick = e => {
    if (!e.target.closest('[data-clear]')) return;
    Object.keys(F).forEach(k => F[k] = ''); $('#q').value = '';
    refresh();
  };
  $('#list').onclick = async e => {
    const pick = e.target.closest('.pick');
    if (pick) {
      pick.checked ? picked.add(pick.dataset.id) : picked.delete(pick.dataset.id);
      pick.closest('.row').classList.toggle('picked', pick.checked);
      return drawSelbar();
    }
    const o = e.target.closest('[data-open]');
    if (o) showDetail(await db.get('resources', o.dataset.open), refresh);
  };
  $('#selbar').onclick = e => {
    if (e.target.id === 'clr') { picked.clear(); drawList(); }
    if (e.target.id === 'mkguide') {
      try { localStorage.setItem('op_guideDraft', JSON.stringify([...picked])); } catch (_) {}
      toast('Selección guardada. El generador de guías es el Módulo 2 (próximamente).', 4000);
    }
  };

  await refresh();
}

/* ---------- Detalle de un documento ---------- */
export async function showDetail(r, refresh) {
  if (!r) return;
  const [sMap, gMap, uMap, tMap, lMap, fMap] = await Promise.all([
    nameMap('subjects'), nameMap('grades'), nameMap('units'), nameMap('topics'), nameMap('libraries'), nameMap('folders')]);
  const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
  const lid = libraryIdOf(r);
  const rows = [
    ['Biblioteca', lid !== CLASES_ID ? lMap[lid]?.name : undefined],
    ['Carpeta', fMap[r.folderId]?.name],
    ['Materia', sMap[r.subjectId]?.name],
    ['Grados', (r.gradeIds || []).map(i => gMap[i]?.name).filter(Boolean).join(', ')],
    ['Unidad', uMap[r.unitId]?.title],
    ['Temas', (r.topicIds || []).map(i => tMap[i]?.title).filter(Boolean).join(', ')],
    ['Etiquetas', (r.tags || []).join(', ')],
    r.pada ? ['Ajuste PADA', r.pada.adjustmentType] : null,
  ].filter(x => x && x[1]);

  const dlg = modal(`
    <h2>${t.icon} ${esc(r.title)}</h2>
    <p><span class="badge${r.type === 'pada' ? ' pada' : ''}">${t.label}${r.typeLabel ? ': ' + esc(r.typeLabel) : ''}</span></p>
    ${rows.map(([k, v]) => `<p><b>${k}:</b> ${esc(v)}</p>`).join('')}
    ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}
    <div class="btns">
      ${r.source ? '<button class="primary" id="d-open">Abrir</button>' : ''}
      <button id="d-edit">Editar</button>
      ${canMove(r) ? '<button id="d-move">Mover</button>' : ''}
      <button id="d-del" class="danger">Eliminar</button>
      <button id="d-close">Cerrar</button>
    </div>`);
  const $ = s => dlg.querySelector(s);
  $('#d-close').onclick = () => dlg.close();
  $('#d-edit').onclick = () => { dlg.close(); openResourceForm({resource: r, onSaved: refresh}); };
  if ($('#d-move')) $('#d-move').onclick = () => { dlg.close(); moveDialog(r, refresh); };
  $('#d-del').onclick = async () => {
    if (await confirmDlg(`¿Eliminar «${r.title}»?`)) { await db.remove('resources', r); dlg.close(); toast('Documento eliminado'); refresh && refresh(); }
  };
  if ($('#d-open')) $('#d-open').onclick = () => openSource(r);
}
