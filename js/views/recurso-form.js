/* ============================================================
   recurso-form.js · Formulario de recurso (crear / editar)
   Selectores en cascada: Materia + Grados → Unidad → Temas.
   Fuente del contenido: enlace (YouTube, web), archivo local o archivo en Drive.
   openResourceForm({resource?, defaults?, onSaved?})
   ============================================================ */
import * as db from '../db.js';
import {RESOURCE_TYPES, unitsFor, topicsFor} from '../store.js';
import {driveConnected, driveUpload} from '../drive.js';
import {esc, options, modal, toast} from '../ui.js';

export async function openResourceForm({resource, defaults = {}, onSaved} = {}) {
  const [grades, subjects, allRes] = await Promise.all([db.live('grades'), db.live('subjects'), db.live('resources')]);
  grades.sort((a, b) => a.order - b.order);
  const r = resource || {};
  const st = {
    subjectId: r.subjectId ?? defaults.subjectId ?? '',
    gradeIds: new Set(r.gradeIds ?? (defaults.gradeId ? [defaults.gradeId] : [])),
    unitId: r.unitId ?? defaults.unitId ?? '',
    topicIds: new Set(r.topicIds ?? (defaults.topicId ? [defaults.topicId] : [])),
  };
  const kind = r.source?.kind || 'link';
  const canDrive = driveConnected();

  const dlg = modal(`
  <form id="rf">
    <h2>${resource ? 'Editar recurso' : 'Nuevo recurso'}</h2>
    <label for="f-title">Título</label>
    <input id="f-title" required value="${esc(r.title || '')}" placeholder="Ej. Taller: mezclas y separación">

    <label for="f-type">Tipo</label>
    <select id="f-type">${RESOURCE_TYPES.map(t =>
      `<option value="${t.id}"${(r.type || defaults.type || 'taller') === t.id ? ' selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>

    <label for="f-subject">Materia</label>
    <select id="f-subject">${options(subjects, st.subjectId, '— Sin materia —')}</select>

    <label>Grados</label>
    <div class="grades" id="f-grades">${grades.map(g =>
      `<label class="chk"><input type="checkbox" value="${g.id}"${st.gradeIds.has(g.id) ? ' checked' : ''}> ${esc(g.name)}</label>`).join('')}</div>

    <label for="f-unit">Unidad</label>
    <select id="f-unit"></select>

    <label>Temas</label>
    <div id="f-topics" class="grades"></div>

    <label for="f-tags">Etiquetas (separadas por coma)</label>
    <input id="f-tags" value="${esc((r.tags || []).join(', '))}" placeholder="fotosíntesis, laboratorio">

    <div id="pada-box" hidden>
      <label for="f-pbase">PADA: recurso base que adapta</label>
      <select id="f-pbase">${options(allRes.filter(x => x.type !== 'pada' && x.id !== r.id), r.pada?.baseResourceId, '— Ninguno —')}</select>
      <label for="f-padj">Tipo de ajuste</label>
      <input id="f-padj" value="${esc(r.pada?.adjustmentType || '')}" placeholder="Ej. Lectura simplificada, más tiempo, apoyo visual">
      <p class="hint">Podrás vincular estudiantes concretos cuando exista el módulo de Notas.</p>
    </div>

    <label>Contenido</label>
    <div>
      <label class="chk"><input type="radio" name="src" value="link"${kind === 'link' ? ' checked' : ''}> Enlace (YouTube, página web)</label>
      <label class="chk"><input type="radio" name="src" value="local"${kind === 'local' || kind === 'drive' ? ' checked' : ''}> Archivo (PDF, Word, imagen…)</label>
      <label class="chk"><input type="radio" name="src" value="none"${kind === 'none' ? ' checked' : ''}> Solo notas, sin archivo</label>
    </div>
    <div id="src-link"><input id="f-url" type="url" inputmode="url" value="${esc(r.source?.url || '')}" placeholder="https://…"></div>
    <div id="src-file" hidden>
      <input id="f-file" type="file">
      ${r.source && (r.source.kind === 'local' || r.source.kind === 'drive')
        ? `<p class="hint">Archivo actual conservado. Elige otro solo si quieres reemplazarlo.</p>` : ''}
      <label class="chk"><input type="checkbox" id="f-drive"${canDrive ? '' : ' disabled'}> Subir también a mi Google Drive
        ${canDrive ? '' : '<span class="hint">(conecta Drive en Ajustes)</span>'}</label>
    </div>

    <label for="f-notes">Notas</label>
    <textarea id="f-notes">${esc(r.notes || '')}</textarea>

    <div class="btns">
      <button type="button" id="f-cancel">Cancelar</button>
      <button class="primary" id="f-save">Guardar</button>
    </div>
  </form>`);

  const $ = s => dlg.querySelector(s);

  /* ---- Cascada Unidad → Temas ---- */
  async function fillUnits() {
    const units = (await unitsFor({subjectId: st.subjectId || undefined}))
      .filter(u => !st.gradeIds.size || st.gradeIds.has(u.gradeId));
    if (st.unitId && !units.some(u => u.id === st.unitId)) { st.unitId = ''; st.topicIds.clear(); }
    $('#f-unit').innerHTML = options(units.map(u => ({id: u.id, name: u.title})), st.unitId, '— Sin unidad —');
    await fillTopics();
  }
  async function fillTopics() {
    const topics = await topicsFor(st.unitId);
    for (const id of [...st.topicIds]) if (!topics.some(t => t.id === id)) st.topicIds.delete(id);
    $('#f-topics').innerHTML = topics.length
      ? topics.map(t => `<label class="chk"><input type="checkbox" value="${t.id}"${st.topicIds.has(t.id) ? ' checked' : ''}> ${esc(t.title)}</label>`).join('')
      : '<span class="hint">Elige una unidad con temas (créalos en Estructura).</span>';
  }
  function togglePada() { $('#pada-box').hidden = $('#f-type').value !== 'pada'; }
  function toggleSrc() {
    const v = dlg.querySelector('input[name=src]:checked').value;
    $('#src-link').hidden = v !== 'link'; $('#src-file').hidden = v !== 'local';
  }

  $('#f-subject').onchange = e => { st.subjectId = e.target.value; fillUnits(); };
  $('#f-grades').onchange = e => {
    e.target.checked ? st.gradeIds.add(e.target.value) : st.gradeIds.delete(e.target.value);
    fillUnits();
  };
  $('#f-unit').onchange = e => { st.unitId = e.target.value; st.topicIds.clear(); fillTopics(); };
  $('#f-topics').onchange = e => { e.target.checked ? st.topicIds.add(e.target.value) : st.topicIds.delete(e.target.value); };
  $('#f-type').onchange = togglePada;
  dlg.querySelectorAll('input[name=src]').forEach(i => i.onchange = toggleSrc);
  $('#f-cancel').onclick = () => dlg.close();
  togglePada(); toggleSrc(); await fillUnits();

  $('#rf').onsubmit = async e => {
    e.preventDefault();
    const title = $('#f-title').value.trim();
    if (!title) return toast('Escribe un título.');
    const btn = $('#f-save'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const type = $('#f-type').value;
      const choice = dlg.querySelector('input[name=src]:checked').value;
      let source = r.source;
      let syncState = r.syncState || 'local-only';

      if (choice === 'none') { source = undefined; }
      else if (choice === 'link') {
        const url = $('#f-url').value.trim();
        if (url) source = {kind: 'link', url};
        else if (r.source?.kind !== 'link') source = undefined;
      } else {
        const file = $('#f-file').files[0];
        if (file) {
          const blobId = await db.saveBlob(file);
          source = {kind: 'local', blobId, mimeType: file.type, size: file.size, name: file.name};
          syncState = 'local-only';
          if ($('#f-drive').checked && driveConnected()) {
            try {
              const up = await driveUpload(file, file.name);
              source = {kind: 'drive', ...up, blobId, size: file.size, name: file.name};
              syncState = 'synced';
            } catch (err) { toast('Guardado aquí; no se pudo subir a Drive: ' + err.message, 5000); }
          }
        }
      }

      const data = {
        title, type,
        subjectId: $('#f-subject').value || undefined,
        gradeIds: [...st.gradeIds],
        unitId: st.unitId || undefined,
        topicIds: [...st.topicIds],
        tags: $('#f-tags').value.split(',').map(s => s.trim()).filter(Boolean),
        notes: $('#f-notes').value.trim() || undefined,
        source, syncState,
        pada: type === 'pada'
          ? {studentIds: r.pada?.studentIds || [], adjustmentType: $('#f-padj').value.trim(), baseResourceId: $('#f-pbase').value || undefined}
          : undefined,
      };
      const saved = resource ? await db.update('resources', resource, data) : await db.create('resources', data);
      dlg.close();
      toast('Recurso guardado');
      onSaved && onSaved(saved);
    } catch (err) {
      console.error(err);
      toast('No se pudo guardar: ' + err.message, 5000);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  };
}
