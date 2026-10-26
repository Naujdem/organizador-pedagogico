/* ============================================================
   estructura.js · «Mis clases»: la estructura académica (el «eje» de la matriz)
   Es lo que se abre desde la biblioteca «Mis clases» en Inicio. Se navega de arriba hacia abajo:
     Grados → Materias → Unidades y temas → Recursos del tema (por tipo)
   Todo se puede agregar, editar y eliminar en su nivel.
   ============================================================ */
import * as db from '../db.js';
import {RESOURCE_TYPES, TYPE_LABEL, LEVELS, levelLabel, levelForName, sortGrades, unitsFor, topicsFor, cascadeDeleteUnit, filterResources, norm,
  subjectsForGrade, addSubjectToGrade, removeSubjectFromGrade} from '../store.js';
import {esc, modal, toast, confirmDlg, listAttrs, viewToggle} from '../ui.js';
import {openResourceForm} from './recurso-form.js';
import {openSource} from '../viewer.js';

/* Diálogo simple de uno o varios campos de texto → promesa con los valores (o null) */
function ask(title, fields) {
  return new Promise(res => {
    const dlg = modal(`<form method="dialog"><h2>${esc(title)}</h2>
      ${fields.map((f, i) => `<label for="a${i}">${esc(f.label)}</label>` + (f.options
        ? `<select id="a${i}">${f.options.map(o => `<option value="${esc(o.id)}"${o.id === f.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
        : `<input id="a${i}" value="${esc(f.value || '')}" ${f.required ? 'required' : ''} ${f.type ? `type="${f.type}"` : ''}>`)).join('')}
      <div class="btns"><button value="no" formnovalidate>Cancelar</button><button class="primary" value="ok">Guardar</button></div></form>`);
    dlg.addEventListener('close', () => res(dlg.returnValue === 'ok' ? fields.map((_, i) => dlg.querySelector('#a' + i).value.trim()) : null));
  });
}

/* Diálogo de opciones: devuelve el valor del botón elegido (o null) */
function choose(title, text, options) {
  return new Promise(res => {
    const dlg = modal(`<div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="btns" style="flex-direction:column;align-items:stretch">${options.map(o =>
        `<button type="button" data-v="${o.v}" class="${o.danger ? 'danger' : ''}">${esc(o.label)}</button>`).join('')}
        <button type="button" class="ghost" data-v="">Cancelar</button></div></div>`);
    dlg.querySelectorAll('[data-v]').forEach(b => b.onclick = () => dlg.close(b.dataset.v));
    dlg.addEventListener('close', () => res(dlg.returnValue || null));
  });
}

/* Nueva materia en un grado: escribir el nombre o elegir una que ya existe pero no está en este grado */
function askSubject(grade, others) {
  return new Promise(res => {
    const dlg = modal(`<form><h2>Nueva materia en ${esc(grade.name)}</h2>
      <label for="ns-n">Nombre</label><input id="ns-n" required>
      ${others.length ? `<p class="hint" style="margin-top:14px">O agrega una que ya existe en otros grados:</p>
        <div class="chips">${others.map(o => `<button type="button" class="chip" data-add="${o.id}">${esc(o.name)}</button>`).join('')}</div>` : ''}
      <div class="btns"><button type="button" data-cancel>Cancelar</button><button class="primary">Guardar</button></div></form>`);
    let out = null;
    dlg.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { out = {existingId: b.dataset.add}; dlg.close(); });
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    dlg.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const name = dlg.querySelector('#ns-n').value.trim();
      if (name) { out = {name}; dlg.close(); }
    };
    dlg.addEventListener('close', () => res(out));
  });
}

/* Dónde está el usuario (se conserva al cambiar de sección y volver) */
const nav = {gradeId: '', subjectId: '', topicId: ''};

const iconBtn = (act, id, label, icon) =>
  `<button class="ghost" data-act="${act}" data-id="${id}" aria-label="${esc(label)}">${icon}</button>`;

/* Al borrar un tema se quita de los recursos que lo usaban (no quedan referencias rotas) */
async function cascadeDeleteTopic(topic) {
  for (const r of await db.byIndex('resources', 'topicIds', topic.id))
    if (!r.deletedAt) await db.update('resources', r, {topicIds: (r.topicIds || []).filter(i => i !== topic.id)});
  await db.remove('topics', topic);
}

export async function render(root) {
  const [grades, subjects] = await Promise.all([db.live('grades'), db.live('subjects')]);
  sortGrades(grades);
  const grade = grades.find(g => g.id === nav.gradeId);
  const subject = grade && subjectsForGrade(subjects, grade.id).find(s => s.id === nav.subjectId);
  const topicRec = subject && nav.topicId ? await db.get('topics', nav.topicId) : null;
  const topic = topicRec && !topicRec.deletedAt ? topicRec : null;
  if (!grade) Object.assign(nav, {gradeId: '', subjectId: '', topicId: ''});
  else if (!subject) Object.assign(nav, {subjectId: '', topicId: ''});
  else if (!topic) nav.topicId = '';

  const crumbs = [`<button class="ghost" data-act="go" data-lv="0">🏫 Mis clases</button>`];
  if (grade) crumbs.push(`<button class="ghost" data-act="go" data-lv="1">${esc(grade.name)}</button>`);
  if (subject) crumbs.push(`<button class="ghost" data-act="go" data-lv="2">${esc(subject.name)}</button>`);
  if (topic) crumbs.push(`<b>${esc(topic.title)}</b>`);

  let body;
  if (!grade) body = await levelGrades(grades);
  else if (!subject) body = await levelSubjects(grade, subjects);
  else if (!topic) body = await levelUnits(grade, subject);
  else body = await levelTopic(grade, subject, topic);

  root.innerHTML = `<a class="back" href="#/inicio">← Inicio</a>
    <h2>Mis clases</h2>
    <p class="crumbs" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${crumbs.join(' <span class="hint">›</span> ')}</p>${body}`;
  const again = () => render(root);

  root.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;

    /* ---- Navegación ---- */
    if (act === 'go') {
      const lv = +b.dataset.lv;
      if (lv < 3) nav.topicId = '';
      if (lv < 2) nav.subjectId = '';
      if (lv < 1) nav.gradeId = '';
      return again();
    }
    if (act === 'open-grade') { nav.gradeId = id; nav.subjectId = ''; nav.topicId = ''; return again(); }
    if (act === 'open-subject') { nav.subjectId = id; nav.topicId = ''; return again(); }
    if (act === 'open-topic') { nav.topicId = id; return again(); }

    /* ---- Grados ---- */
    if (act === 'add-grade') {
      const v = await ask('Nuevo grado', [{label: 'Nombre (ej. 3°, 7°)', required: true},
        {label: 'Nivel', value: '', options: [{id: '', label: 'Automático (según el número)'}, ...LEVELS]}]);
      if (!v) return;
      await db.create('grades', {name: v[0], level: v[1] || levelForName(v[0]), order: Math.max(0, ...grades.map(g => g.order || 0)) + 1});
      return again();
    }
    if (act === 'edit-grade') {
      const rec = await db.get('grades', id);
      const v = await ask('Editar grado', [{label: 'Nombre', value: rec.name, required: true},
        {label: 'Nivel', value: rec.level || 'basica', options: LEVELS}]);
      if (!v) return;
      await db.update('grades', rec, {name: v[0], level: v[1] || rec.level || 'basica'});
      return again();
    }
    if (act === 'del-grade') {
      if (!(await confirmDlg('¿Eliminar este grado? Los recursos que lo usan conservarán su contenido.'))) return;
      await db.remove('grades', await db.get('grades', id));
      if (nav.gradeId === id) Object.assign(nav, {gradeId: '', subjectId: '', topicId: ''});
      toast('Eliminado'); return again();
    }

    /* ---- Materias ---- */
    if (act === 'add-subject') {
      const here = subjectsForGrade(subjects, nav.gradeId);
      const v = await askSubject(grade, subjects.filter(s => !here.includes(s)));
      if (!v) return;
      if (v.existingId) await addSubjectToGrade(await db.get('subjects', v.existingId), nav.gradeId);
      else {
        const same = subjects.find(s => norm(s.name) === norm(v.name));       // mismo nombre: se reutiliza
        if (!same) await db.create('subjects', {name: v.name, color: '#0ea5e9', gradeIds: [nav.gradeId]});
        else if (here.includes(same)) toast('Esa materia ya está en este grado.');
        else await addSubjectToGrade(same, nav.gradeId);
      }
      return again();
    }
    if (act === 'edit-subject') {
      const rec = await db.get('subjects', id);
      const v = await ask('Editar materia', [{label: 'Nombre', value: rec.name, required: true}]);
      if (!v) return;
      await db.update('subjects', rec, {name: v[0]});
      return again();
    }
    if (act === 'del-subject') {
      const rec = await db.get('subjects', id);
      const n = (await unitsFor({subjectId: id, gradeId: nav.gradeId})).length;
      const choice = await choose(`Quitar «${rec.name}»`,
        `En ${grade.name} se eliminarán sus ${n} unidad${n === 1 ? '' : 'es'} con sus temas. Los recursos conservan su contenido.`,
        [{v: 'grade', label: `Quitar solo de ${grade.name}`}, {v: 'all', label: 'Eliminar en todos los grados', danger: true}]);
      if (!choice) return;
      if (choice === 'grade') await removeSubjectFromGrade(rec, nav.gradeId, grades);
      else await db.remove('subjects', rec);
      if (nav.subjectId === id) Object.assign(nav, {subjectId: '', topicId: ''});
      toast(choice === 'grade' ? `Quitada de ${grade.name}` : 'Eliminada en todos los grados'); return again();
    }

    /* ---- Unidades ---- */
    if (act === 'add-unit') {
      const n = (await unitsFor({subjectId: nav.subjectId, gradeId: nav.gradeId})).length;
      const v = await ask('Nueva unidad', [{label: 'Título', required: true}]);
      if (!v) return;
      await db.create('units', {subjectId: nav.subjectId, gradeId: nav.gradeId, title: v[0], order: n + 1});
      return again();
    }
    if (act === 'edit-unit') {
      const rec = await db.get('units', id);
      const v = await ask('Editar unidad', [{label: 'Título', value: rec.title, required: true}]);
      if (!v) return;
      await db.update('units', rec, {title: v[0]});
      return again();
    }
    if (act === 'del-unit') {
      if (!(await confirmDlg('¿Eliminar la unidad y sus temas? Los recursos quedan sin unidad.'))) return;
      await cascadeDeleteUnit(await db.get('units', id));
      toast('Eliminado'); return again();
    }

    /* ---- Temas ---- */
    if (act === 'add-topic') {
      const n = (await topicsFor(id)).length;
      const v = await ask('Nuevo tema', [{label: 'Título', required: true}, {label: 'Descripción (opcional)'}]);
      if (!v) return;
      await db.create('topics', {unitId: id, title: v[0], description: v[1] || undefined, order: n + 1});
      return again();
    }
    if (act === 'edit-topic') {
      const rec = await db.get('topics', id);
      const v = await ask('Editar tema', [{label: 'Título', value: rec.title, required: true}, {label: 'Descripción (opcional)', value: rec.description || ''}]);
      if (!v) return;
      await db.update('topics', rec, {title: v[0], description: v[1] || undefined});
      return again();
    }
    if (act === 'del-topic') {
      if (!(await confirmDlg('¿Eliminar este tema? Los recursos se conservan, solo pierden este tema.'))) return;
      await cascadeDeleteTopic(await db.get('topics', id));
      if (nav.topicId === id) nav.topicId = '';
      toast('Eliminado'); return again();
    }

    /* ---- Recursos del tema ---- */
    if (act === 'add-res') {
      return openResourceForm({
        defaults: {gradeId: nav.gradeId, subjectId: nav.subjectId, unitId: topic.unitId, topicId: nav.topicId, type: b.dataset.type || undefined},
        onSaved: again,
      });
    }
    if (act === 'edit-res') return openResourceForm({resource: await db.get('resources', id), onSaved: again});
    if (act === 'open-res') return openSource(await db.get('resources', id));
    if (act === 'del-res') {
      const r = await db.get('resources', id);
      if (await confirmDlg(`¿Eliminar «${r.title}»?`)) { await db.remove('resources', r); toast('Recurso eliminado'); again(); }
    }
  };
}

/* ---------- Nivel 1: grados ---------- */
async function levelGrades(grades) {
  return `<h3>Grados</h3>
    <div class="list">${grades.map((g, i) => (i === 0 || (g.level || 'basica') !== (grades[i - 1].level || 'basica')
        ? `<div class="hint" style="margin-top:${i ? 10 : 0}px"><b>${levelLabel(g.level)}</b></div>` : '') + `<div class="row">
      <button class="body" data-act="open-grade" data-id="${g.id}"><div class="t">${esc(g.name)}</div>
        <div class="m">${levelLabel(g.level)}</div></button>
      ${iconBtn('edit-grade', g.id, 'Editar ' + g.name, '✎')}${iconBtn('del-grade', g.id, 'Eliminar ' + g.name, '🗑')}</div>`).join('')
      || '<div class="empty">Aún no hay grados.</div>'}</div>
    <div class="btns"><button class="primary" data-act="add-grade">＋ Grado</button></div>`;
}

/* ---------- Nivel 2: materias del grado ---------- */
async function levelSubjects(grade, subjects) {
  const rows = [];
  for (const s of subjectsForGrade(subjects, grade.id)) {
    const nUnits = (await unitsFor({subjectId: s.id, gradeId: grade.id})).length;
    const nRes = (await filterResources({gradeId: grade.id, subjectId: s.id})).length;
    rows.push(`<div class="row">
      <button class="body" data-act="open-subject" data-id="${s.id}"><div class="t">${esc(s.name)}</div>
        <div class="m">${nUnits} unidad${nUnits === 1 ? '' : 'es'} · ${nRes} recurso${nRes === 1 ? '' : 's'}</div></button>
      ${iconBtn('edit-subject', s.id, 'Editar ' + s.name, '✎')}${iconBtn('del-subject', s.id, 'Quitar ' + s.name, '🗑')}</div>`);
  }
  return `<h3>Materias de ${esc(grade.name)}</h3>
    <div class="list">${rows.join('') || '<div class="empty">Aún no hay materias.</div>'}</div>
    <div class="btns"><button class="primary" data-act="add-subject">＋ Materia</button></div>`;
}

/* ---------- Nivel 3: unidades y temas ---------- */
async function levelUnits(grade, subject) {
  const units = await unitsFor({subjectId: subject.id, gradeId: grade.id});
  const cards = [];
  for (const u of units) {
    const topics = await topicsFor(u.id);
    const lines = [];
    for (const t of topics) {
      const n = (await filterResources({topicId: t.id})).length;
      lines.push(`<div class="row"><button class="body" data-act="open-topic" data-id="${t.id}">
        <div class="t">${esc(t.title)}</div>
        <div class="m">${n} recurso${n === 1 ? '' : 's'}${t.description ? ' · ' + esc(t.description) : ''}</div></button>
        ${iconBtn('edit-topic', t.id, 'Editar tema', '✎')}${iconBtn('del-topic', t.id, 'Eliminar tema', '🗑')}</div>`);
    }
    cards.push(`<div class="card" style="margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">${esc(u.title)}</b>
        ${iconBtn('edit-unit', u.id, 'Editar unidad', '✎')}${iconBtn('del-unit', u.id, 'Eliminar unidad', '🗑')}</div>
      <div class="list">${lines.join('') || '<p class="hint">Sin temas todavía.</p>'}</div>
      <div class="btns"><button data-act="add-topic" data-id="${u.id}">＋ Tema</button></div></div>`);
  }
  const loose = (await filterResources({gradeId: grade.id, subjectId: subject.id})).filter(r => !(r.topicIds || []).length).length;
  return `<h3>${esc(subject.name)} · ${esc(grade.name)}</h3>
    ${cards.join('') || '<div class="empty">Esta materia y grado aún no tienen unidades.</div>'}
    <div class="btns"><button class="primary" data-act="add-unit">＋ Unidad</button></div>
    ${loose ? `<p class="hint">${loose} recurso${loose === 1 ? '' : 's'} de esta materia y grado no tiene${loose === 1 ? '' : 'n'} tema. <a href="#/banco">Verlos en Buscar</a></p>` : ''}`;
}

/* ---------- Nivel 4: recursos del tema, por tipo ---------- */
async function levelTopic(grade, subject, topic) {
  const rows = await filterResources({topicId: topic.id});
  const groups = RESOURCE_TYPES.map(t => ({t, items: rows.filter(r => (TYPE_LABEL[r.type] ? r.type : 'otro') === t.id)})).filter(g => g.items.length);
  return `<h3>${esc(topic.title)}</h3>
    ${topic.description ? `<p class="hint">${esc(topic.description)}</p>` : ''}
    <div class="btns">${iconBtn('edit-topic', topic.id, 'Editar tema', '✎ Editar tema')}${iconBtn('del-topic', topic.id, 'Eliminar tema', '🗑 Eliminar tema')}
      <span style="margin-left:auto">${viewToggle()}</span></div>
    ${groups.map(({t, items}) => `<h3>${t.icon} ${esc(t.label)} <span class="hint">(${items.length})</span></h3>
      <div ${listAttrs()}>${items.map(r => `<div class="row"><div class="body"><div class="t"><span class="ic">${t.icon}</span> ${esc(r.title)}</div>
        ${[r.typeLabel, ...(r.tags || []), r.notes].filter(Boolean).length ? `<div class="m">${esc([r.typeLabel, ...(r.tags || []), r.notes].filter(Boolean).join(' · '))}</div>` : ''}</div>
        ${r.source ? `<button class="ghost" data-act="open-res" data-id="${r.id}" aria-label="Abrir">↗</button>` : ''}
        ${iconBtn('edit-res', r.id, 'Editar ' + r.title, '✎')}${iconBtn('del-res', r.id, 'Eliminar ' + r.title, '🗑')}</div>`).join('')}</div>`).join('')
      || '<div class="empty">Este tema aún no tiene recursos.</div>'}
    <h3>Agregar recurso</h3>
    <div class="chips">${RESOURCE_TYPES.map(t => `<button class="chip" data-act="add-res" data-type="${t.id}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>`;
}
