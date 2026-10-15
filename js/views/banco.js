/* ============================================================
   banco.js · Banco de recursos (pantalla principal del Módulo 1)
   Organización MATRICIAL, no carpetas: filtros combinables por
   Grado · Materia · Unidad · Tema · Tipo + búsqueda de texto.
   Selección múltiple → «Crear guía» (puente al Módulo 2).
   ============================================================ */
import * as db from '../db.js';
import {RESOURCE_TYPES, TYPE_LABEL, filterResources, unitsFor, topicsFor, nameMap} from '../store.js';
import {esc, options, modal, toast, confirmDlg} from '../ui.js';
import {openResourceForm} from './recurso-form.js';

/* Se conservan al navegar a otra sección y volver */
const F = {gradeId: '', subjectId: '', unitId: '', topicId: '', type: '', text: ''};
const picked = new Set();

export const fab = {label: 'Nuevo recurso', onClick: () => openResourceForm({defaults: F, onSaved: () => dispatchEvent(new Event('hashchange'))})};

export async function render(root) {
  const [grades, subjects] = await Promise.all([db.live('grades'), db.live('subjects')]);
  grades.sort((a, b) => a.order - b.order);

  root.innerHTML = `
    <h2>Recursos</h2>
    <div class="search"><input id="q" type="search" placeholder="Buscar por título, nota o etiqueta…" value="${esc(F.text)}" aria-label="Buscar"></div>
    <div class="filters">
      <select id="fg" aria-label="Grado"></select>
      <select id="fs" aria-label="Materia"></select>
      <select id="fu" aria-label="Unidad"></select>
      <select id="ft" aria-label="Tema"></select>
    </div>
    <div class="chips" id="types" role="group" aria-label="Tipo de recurso"></div>
    <div class="count" id="count"></div>
    <div class="list" id="list"></div>
    <div id="selbar"></div>`;
  const $ = s => root.querySelector(s);

  async function drawFilters() {
    $('#fg').innerHTML = options(grades, F.gradeId, 'Todos los grados');
    $('#fs').innerHTML = options(subjects, F.subjectId, 'Todas las materias');
    const units = await unitsFor({subjectId: F.subjectId || undefined, gradeId: F.gradeId || undefined});
    if (F.unitId && !units.some(u => u.id === F.unitId)) { F.unitId = ''; F.topicId = ''; }
    $('#fu').innerHTML = options(units.map(u => ({id: u.id, name: u.title})), F.unitId, 'Todas las unidades');
    const topics = await topicsFor(F.unitId);
    if (F.topicId && !topics.some(t => t.id === F.topicId)) F.topicId = '';
    $('#ft').innerHTML = options(topics.map(t => ({id: t.id, name: t.title})), F.topicId, 'Todos los temas');
    $('#ft').disabled = !F.unitId;
    $('#types').innerHTML =
      `<button class="chip${F.type ? '' : ' on'}" data-t="">Todos</button>` +
      RESOURCE_TYPES.map(t => `<button class="chip${F.type === t.id ? ' on' : ''}" data-t="${t.id}">${t.icon} ${t.label}</button>`).join('') +
      (Object.values(F).some(Boolean) ? '<button class="chip" data-clear="1">✕ Limpiar</button>' : '');
  }

  async function drawList() {
    const [rows, sMap, gMap] = await Promise.all([filterResources(F), nameMap('subjects'), nameMap('grades')]);
    $('#count').textContent = rows.length === 1 ? '1 recurso' : `${rows.length} recursos`;
    $('#list').innerHTML = rows.length ? rows.map(r => {
      const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
      const g = (r.gradeIds || []).map(id => gMap[id]?.name).filter(Boolean).join(', ');
      const meta = [g, sMap[r.subjectId]?.name].filter(Boolean).join(' · ');
      return `<div class="row${picked.has(r.id) ? ' picked' : ''}" data-id="${r.id}">
        <input class="pick" type="checkbox" data-id="${r.id}" aria-label="Seleccionar ${esc(r.title)}"${picked.has(r.id) ? ' checked' : ''}>
        <button class="body" data-open="${r.id}">
          <div class="t">${t.icon} ${esc(r.title)}</div>
          <div class="m"><span class="badge${r.type === 'pada' ? ' pada' : ''}">${t.label}${r.typeLabel ? ': ' + esc(r.typeLabel) : ''}</span>${esc(meta)}
            ${r.source?.kind === 'drive' ? '☁' : ''}${r.syncState === 'pending' ? '<span class="badge pend">pendiente</span>' : ''}</div>
        </button></div>`;
    }).join('') : `<div class="empty">${Object.values(F).some(Boolean)
      ? 'Ningún recurso coincide con estos filtros.' : 'Aún no tienes recursos. Toca ＋ para agregar el primero.'}</div>`;
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
  $('#fg').onchange = e => { F.gradeId = e.target.value; refresh(); };
  $('#fs').onchange = e => { F.subjectId = e.target.value; refresh(); };
  $('#fu').onchange = e => { F.unitId = e.target.value; F.topicId = ''; refresh(); };
  $('#ft').onchange = e => { F.topicId = e.target.value; drawList(); drawFilters(); };
  $('#types').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.clear) { Object.keys(F).forEach(k => F[k] = ''); $('#q').value = ''; }
    else F.type = b.dataset.t;
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

/* ---------- Detalle de un recurso ---------- */
async function showDetail(r, refresh) {
  if (!r) return;
  const [sMap, gMap, uMap, tMap] = await Promise.all([nameMap('subjects'), nameMap('grades'), nameMap('units'), nameMap('topics')]);
  const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
  const rows = [
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
      <button id="d-del" class="danger">Eliminar</button>
      <button id="d-close">Cerrar</button>
    </div>`);
  const $ = s => dlg.querySelector(s);
  $('#d-close').onclick = () => dlg.close();
  $('#d-edit').onclick = () => { dlg.close(); openResourceForm({resource: r, onSaved: refresh}); };
  $('#d-del').onclick = async () => {
    if (await confirmDlg(`¿Eliminar «${r.title}»?`)) { await db.remove('resources', r); dlg.close(); toast('Recurso eliminado'); refresh(); }
  };
  if ($('#d-open')) $('#d-open').onclick = () => openSource(r);
}

async function openSource(r) {
  const s = r.source;
  if (s.kind === 'link') return window.open(s.url, '_blank', 'noopener');
  /* Copia local primero (funciona sin internet); si no hay, Drive */
  if (s.blobId) {
    const blob = await db.getBlob(s.blobId);
    if (blob) return window.open(URL.createObjectURL(blob), '_blank');
  }
  if (s.kind === 'drive' && s.webViewLink) return window.open(s.webViewLink, '_blank', 'noopener');
  toast('El archivo no está disponible en este dispositivo.');
}
