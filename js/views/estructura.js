/* ============================================================
   estructura.js · Estructura académica (el «eje» de la matriz)
   Grados, Materias y, por materia+grado, Unidades con sus Temas.
   Sin esto no hay nada que filtrar en el banco de recursos.
   ============================================================ */
import * as db from '../db.js';
import {unitsFor, topicsFor, cascadeDeleteUnit} from '../store.js';
import {esc, options, modal, toast, confirmDlg} from '../ui.js';

/* Diálogo simple de uno o varios campos de texto → promesa con los valores (o null) */
function ask(title, fields) {
  return new Promise(res => {
    const dlg = modal(`<form method="dialog"><h2>${esc(title)}</h2>
      ${fields.map((f, i) => `<label for="a${i}">${esc(f.label)}</label>
        <input id="a${i}" value="${esc(f.value || '')}" ${f.required ? 'required' : ''} ${f.type ? `type="${f.type}"` : ''}>`).join('')}
      <div class="btns"><button value="no" formnovalidate>Cancelar</button><button class="primary" value="ok">Guardar</button></div></form>`);
    dlg.addEventListener('close', () => res(dlg.returnValue === 'ok' ? fields.map((_, i) => dlg.querySelector('#a' + i).value.trim()) : null));
  });
}

const sel = {subjectId: '', gradeId: ''};

export async function render(root) {
  const [grades, subjects] = await Promise.all([db.live('grades'), db.live('subjects')]);
  grades.sort((a, b) => a.order - b.order);
  if (!sel.subjectId && subjects[0]) sel.subjectId = subjects[0].id;
  if (!sel.gradeId && grades[0]) sel.gradeId = grades[0].id;

  const units = sel.subjectId && sel.gradeId ? await unitsFor(sel) : [];
  const topicsByUnit = {};
  for (const u of units) topicsByUnit[u.id] = await topicsFor(u.id);

  root.innerHTML = `
    <h2>Estructura académica</h2>
    <div class="split">
      <div class="card"><h3>Grados</h3>
        ${grades.map(g => `<div class="row" data-id="${g.id}"><div class="body"><b>${esc(g.name)}</b>
          <span class="hint"> ${g.level === 'media' ? 'Media' : 'Básica'}</span></div>
          <button class="ghost" data-act="edit-grade" data-id="${g.id}" aria-label="Editar ${esc(g.name)}">✎</button>
          <button class="ghost" data-act="del-grade" data-id="${g.id}" aria-label="Eliminar ${esc(g.name)}">🗑</button></div>`).join('') || '<p class="hint">Sin grados.</p>'}
        <div class="btns"><button id="add-grade">＋ Grado</button></div></div>
      <div class="card"><h3>Materias</h3>
        ${subjects.map(s => `<div class="row" data-id="${s.id}"><div class="body"><b>${esc(s.name)}</b></div>
          <button class="ghost" data-act="edit-subject" data-id="${s.id}" aria-label="Editar ${esc(s.name)}">✎</button>
          <button class="ghost" data-act="del-subject" data-id="${s.id}" aria-label="Eliminar ${esc(s.name)}">🗑</button></div>`).join('') || '<p class="hint">Sin materias.</p>'}
        <div class="btns"><button id="add-subject">＋ Materia</button></div></div>
    </div>

    <h3>Unidades y temas</h3>
    <div class="filters">
      <select id="us" aria-label="Materia">${options(subjects, sel.subjectId)}</select>
      <select id="ug" aria-label="Grado">${options(grades, sel.gradeId)}</select>
    </div>
    ${units.map(u => `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">${esc(u.title)}</b>
        <button class="ghost" data-act="edit-unit" data-id="${u.id}" aria-label="Editar unidad">✎</button>
        <button class="ghost" data-act="del-unit" data-id="${u.id}" aria-label="Eliminar unidad">🗑</button></div>
      ${topicsByUnit[u.id].map(t => `<div style="display:flex;gap:8px;align-items:center;padding-left:12px">
        <span style="flex:1">• ${esc(t.title)}</span>
        <button class="ghost" data-act="edit-topic" data-id="${t.id}" aria-label="Editar tema">✎</button>
        <button class="ghost" data-act="del-topic" data-id="${t.id}" aria-label="Eliminar tema">🗑</button></div>`).join('')}
      <div class="btns"><button data-act="add-topic" data-id="${u.id}">＋ Tema</button></div></div>`).join('')
      || '<div class="empty">Esta materia y grado aún no tienen unidades.</div>'}
    <div class="btns"><button id="add-unit" class="primary"${sel.subjectId && sel.gradeId ? '' : ' disabled'}>＋ Unidad</button></div>`;

  const again = () => render(root);
  const $ = s => root.querySelector(s);
  $('#us').onchange = e => { sel.subjectId = e.target.value; again(); };
  $('#ug').onchange = e => { sel.gradeId = e.target.value; again(); };

  $('#add-grade').onclick = async () => {
    const v = await ask('Nuevo grado', [{label: 'Nombre (ej. 7°)', required: true}, {label: 'Nivel: basica o media', value: 'basica'}]);
    if (!v) return;
    await db.create('grades', {name: v[0], level: /med/i.test(v[1]) ? 'media' : 'basica', order: grades.length + 1});
    again();
  };
  $('#add-subject').onclick = async () => {
    const v = await ask('Nueva materia', [{label: 'Nombre', required: true}]);
    if (!v) return;
    await db.create('subjects', {name: v[0], color: '#2f9e5f'});
    again();
  };
  $('#add-unit').onclick = async () => {
    const v = await ask('Nueva unidad', [{label: 'Título', required: true}]);
    if (!v) return;
    await db.create('units', {subjectId: sel.subjectId, gradeId: sel.gradeId, title: v[0], order: units.length + 1});
    again();
  };

  root.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    const store = act.endsWith('grade') ? 'grades' : act.endsWith('subject') ? 'subjects' : act.endsWith('unit') ? 'units' : 'topics';
    if (act === 'add-topic') {
      const v = await ask('Nuevo tema', [{label: 'Título', required: true}]);
      if (!v) return;
      const n = (topicsByUnit[id] || []).length;
      await db.create('topics', {unitId: id, title: v[0], order: n + 1});
      return again();
    }
    const rec = await db.get(store, id);
    if (act.startsWith('edit')) {
      const key = store === 'units' || store === 'topics' ? 'title' : 'name';
      const v = await ask('Editar', [{label: 'Nombre', value: rec[key], required: true}]);
      if (!v) return;
      await db.update(store, rec, {[key]: v[0]});
      return again();
    }
    if (act.startsWith('del')) {
      const msg = store === 'units' ? '¿Eliminar la unidad y sus temas? Los recursos quedan sin unidad.'
        : store === 'grades' || store === 'subjects' ? '¿Eliminar? Los recursos que lo usan conservarán su contenido.'
        : '¿Eliminar este tema?';
      if (!(await confirmDlg(msg))) return;
      if (store === 'units') await cascadeDeleteUnit(rec); else await db.remove(store, rec);
      if (store === 'subjects' && sel.subjectId === id) sel.subjectId = '';
      if (store === 'grades' && sel.gradeId === id) sel.gradeId = '';
      toast('Eliminado');
      again();
    }
  };
}
