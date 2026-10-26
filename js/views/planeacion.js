/* ============================================================
   planeacion.js · Planeaciones por unidad → sesiones
   Cada sesión lleva fecha, tema, objetivo, actividades y recursos
   adjuntos desde el banco (selector con filtro por materia y grado).
   La fecha alimenta «Clases de hoy» en Inicio.
   ============================================================ */
import * as db from '../db.js';
import {ulid} from '../ulid.js';
import {unitsFor, topicsFor, filterResources, nameMap, TYPE_LABEL, sortGrades} from '../store.js';
import {esc, options, modal, toast, confirmDlg} from '../ui.js';

let openId = null;   // planeación abierta en el editor

export const fab = {label: 'Nueva planeación', onClick: () => newPlanning()};

export async function render(root) {
  if (openId) {
    const p = await db.get('plannings', openId);
    if (p && !p.deletedAt) return editor(root, p);
    openId = null;
  }
  const [plans, subjects, grades, units] = await Promise.all([
    db.live('plannings'), nameMap('subjects'), nameMap('grades'), nameMap('units')]);
  root.innerHTML = `<h2>Planeación</h2>
    <div class="list">${plans.length ? plans.sort((a, b) => b.updatedAt - a.updatedAt).map(p => {
      const n = (p.sessions || []).length, d = (p.sessions || []).filter(s => s.done).length;
      return `<div class="row"><button class="body" data-open="${p.id}">
        <div class="t">${esc(units[p.unitId]?.title || 'Unidad')}</div>
        <div class="m">${esc(subjects[p.subjectId]?.name || '')} · ${esc(grades[p.gradeId]?.name || '')}
          ${p.periodName ? '· ' + esc(p.periodName) : ''} · ${d}/${n} sesiones</div></button></div>`;
    }).join('') : '<div class="empty">Aún no hay planeaciones. Toca ＋ para crear la primera.</div>'}</div>`;
  root.onclick = e => {
    const b = e.target.closest('[data-open]');
    if (b) { openId = b.dataset.open; dispatchEvent(new Event('hashchange')); }
  };
}

async function newPlanning() {
  const [subjects, grades] = await Promise.all([db.live('subjects'), db.live('grades')]);
  sortGrades(grades);
  if (!subjects.length || !grades.length) return toast('Primero crea materias y grados en Mis clases (desde Inicio).');
  const st = {subjectId: subjects[0].id, gradeId: grades[0].id};
  const dlg = modal(`<form id="np"><h2>Nueva planeación</h2>
    <label for="n-s">Materia</label><select id="n-s">${options(subjects, st.subjectId)}</select>
    <label for="n-g">Grado</label><select id="n-g">${options(grades, st.gradeId)}</select>
    <label for="n-u">Unidad</label><select id="n-u"></select>
    <label for="n-p">Periodo (opcional)</label><input id="n-p" placeholder="Ej. Periodo 2">
    <div class="btns"><button type="button" id="n-c">Cancelar</button><button class="primary">Crear</button></div></form>`);
  const $ = s => dlg.querySelector(s);
  async function fill() {
    const u = await unitsFor(st);
    $('#n-u').innerHTML = u.length ? options(u.map(x => ({id: x.id, name: x.title}))) : '<option value="">(sin unidades: créalas en Mis clases)</option>';
  }
  $('#n-s').onchange = e => { st.subjectId = e.target.value; fill(); };
  $('#n-g').onchange = e => { st.gradeId = e.target.value; fill(); };
  $('#n-c').onclick = () => dlg.close();
  await fill();
  $('#np').onsubmit = async e => {
    e.preventDefault();
    const unitId = $('#n-u').value;
    if (!unitId) return toast('Elige una unidad (créala en Mis clases).');
    const p = await db.create('plannings', {...st, unitId, periodName: $('#n-p').value.trim() || undefined, sessions: []});
    openId = p.id; dlg.close(); dispatchEvent(new Event('hashchange'));
  };
}

async function editor(root, p) {
  const [subjects, grades, units, topics, resources] = await Promise.all([
    nameMap('subjects'), nameMap('grades'), nameMap('units'), nameMap('topics'), nameMap('resources')]);
  const sessions = [...(p.sessions || [])].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  root.innerHTML = `
    <button id="back" class="ghost">← Planeaciones</button>
    <h2>${esc(units[p.unitId]?.title || 'Unidad')}</h2>
    <p class="hint">${esc(subjects[p.subjectId]?.name || '')} · ${esc(grades[p.gradeId]?.name || '')}${p.periodName ? ' · ' + esc(p.periodName) : ''}</p>
    ${sessions.map(s => `<div class="session${s.done ? ' done' : ''}" data-id="${s.id}">
      <label class="chk"><input type="checkbox" data-done="${s.id}"${s.done ? ' checked' : ''}> <b>${esc(s.date || 'Sin fecha')}</b>
        ${s.topicId && topics[s.topicId] ? ' · ' + esc(topics[s.topicId].title) : ''}</label>
      <div>${esc(s.objective || '')}</div>
      ${s.activities ? `<div class="hint" style="white-space:pre-line">${esc(s.activities)}</div>` : ''}
      <div>${(s.resourceIds || []).map(id => resources[id] && !resources[id].deletedAt
        ? `<span class="badge">${TYPE_LABEL[resources[id].type]?.icon || ''} ${esc(resources[id].title)}</span>` : '').join('')}</div>
      <div class="btns"><button data-edit="${s.id}">Editar</button><button class="danger" data-del="${s.id}">Eliminar</button></div>
    </div>`).join('') || '<div class="empty">Sin sesiones todavía.</div>'}
    <div class="btns"><button class="primary" id="add">＋ Sesión</button><button class="danger" id="delp">Eliminar planeación</button></div>`;

  const $ = s => root.querySelector(s);
  const save = async list => { p = await db.update('plannings', p, {sessions: list}); };
  const redraw = () => dispatchEvent(new Event('hashchange'));

  $('#back').onclick = () => { openId = null; redraw(); };
  $('#add').onclick = () => sessionForm(p, null, async s => { await save([...(p.sessions || []), s]); redraw(); });
  $('#delp').onclick = async () => {
    if (await confirmDlg('¿Eliminar esta planeación y sus sesiones?')) { await db.remove('plannings', p); openId = null; redraw(); }
  };
  root.onclick = async e => {
    const d = e.target.closest('[data-done]');
    if (d) { await save((p.sessions || []).map(s => s.id === d.dataset.done ? {...s, done: d.checked} : s)); return redraw(); }
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const cur = (p.sessions || []).find(s => s.id === ed.dataset.edit);
      return sessionForm(p, cur, async s => { await save(p.sessions.map(x => x.id === s.id ? s : x)); redraw(); });
    }
    const dl = e.target.closest('[data-del]');
    if (dl && await confirmDlg('¿Eliminar esta sesión?')) { await save(p.sessions.filter(s => s.id !== dl.dataset.del)); redraw(); }
  };
}

async function sessionForm(p, cur, onSave) {
  const topics = await topicsFor(p.unitId);
  const s = cur ? {...cur, resourceIds: [...(cur.resourceIds || [])]} : {id: ulid(), date: '', objective: '', activities: '', resourceIds: [], done: false};
  const dlg = modal(`<form id="sf"><h2>${cur ? 'Editar sesión' : 'Nueva sesión'}</h2>
    <label for="s-d">Fecha</label><input id="s-d" type="date" value="${esc(s.date || '')}">
    <label for="s-t">Tema</label><select id="s-t">${options(topics.map(t => ({id: t.id, name: t.title})), s.topicId, '— Sin tema —')}</select>
    <label for="s-o">Objetivo</label><textarea id="s-o">${esc(s.objective)}</textarea>
    <label for="s-a">Actividades (inicio / desarrollo / cierre)</label><textarea id="s-a">${esc(s.activities)}</textarea>
    <label for="s-e">Evaluación</label><input id="s-e" value="${esc(s.evaluation || '')}">
    <label>Recursos</label><div id="s-r" class="hint"></div>
    <div class="btns"><button type="button" id="s-pick">＋ Adjuntar del banco</button></div>
    <div class="btns"><button type="button" id="s-c">Cancelar</button><button class="primary">Guardar</button></div></form>`);
  const $ = x => dlg.querySelector(x);
  const drawRes = async () => {
    const m = await nameMap('resources');
    $('#s-r').innerHTML = s.resourceIds.map(id => m[id] && !m[id].deletedAt
      ? `<span class="badge">${TYPE_LABEL[m[id].type]?.icon || ''} ${esc(m[id].title)} <a href="#" data-rm="${id}" aria-label="Quitar">✕</a></span>` : '').join('') || 'Ninguno';
  };
  $('#s-r').onclick = e => { const a = e.target.closest('[data-rm]'); if (a) { e.preventDefault(); s.resourceIds = s.resourceIds.filter(i => i !== a.dataset.rm); drawRes(); } };
  $('#s-c').onclick = () => dlg.close();
  $('#s-pick').onclick = () => resourcePicker(p, s.resourceIds, ids => { s.resourceIds = ids; drawRes(); });
  await drawRes();
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    Object.assign(s, {date: $('#s-d').value, topicId: $('#s-t').value || undefined, objective: $('#s-o').value.trim(),
      activities: $('#s-a').value.trim(), evaluation: $('#s-e').value.trim() || undefined});
    dlg.close(); await onSave(s);
  };
}

/* Selector reutilizable: lista del banco filtrada por la materia y el grado de la planeación */
async function resourcePicker(p, current, onDone) {
  const chosen = new Set(current);
  const dlg = modal(`<h2>Adjuntar recursos</h2>
    <input id="pk-q" type="search" placeholder="Buscar…" aria-label="Buscar">
    <label class="chk"><input type="checkbox" id="pk-all"> Mostrar de todas las materias y grados</label>
    <div class="list" id="pk-l" style="margin-top:10px"></div>
    <div class="btns"><button id="pk-c">Cancelar</button><button class="primary" id="pk-ok">Listo</button></div>`);
  const $ = x => dlg.querySelector(x);
  async function draw() {
    const f = {text: $('#pk-q').value};
    if (!$('#pk-all').checked) { f.subjectId = p.subjectId; f.gradeId = p.gradeId; }
    const rows = await filterResources(f);
    $('#pk-l').innerHTML = rows.map(r => `<label class="row chk"><input class="pick" type="checkbox" value="${r.id}"${chosen.has(r.id) ? ' checked' : ''}>
      <span>${TYPE_LABEL[r.type]?.icon || ''} ${esc(r.title)}</span></label>`).join('') || '<div class="empty">Sin resultados.</div>';
  }
  $('#pk-l').onchange = e => { e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value); };
  $('#pk-q').oninput = draw; $('#pk-all').onchange = draw;
  $('#pk-c').onclick = () => dlg.close();
  $('#pk-ok').onclick = () => { onDone([...chosen]); dlg.close(); };
  draw();
}
