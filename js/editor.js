/* ============================================================
   editor.js · Editor de documentos tipo Word (con imágenes) → PDF
   openEditor(recurso) abre a pantalla completa el documento cuyo source es
     {kind: 'editor', blobId, mimeType: 'text/html', name}
   El HTML vive como archivo local (blob) igual que los demás archivos: se guarda solo
   mientras escribes. «Descargar PDF» usa la impresión del navegador → «Guardar como PDF».
   Sin dependencias: contenteditable + execCommand (funciona en todos los navegadores).
   ============================================================ */
import * as db from './db.js';
import {esc, toast} from './ui.js';

const LADO_MAX = 1400;   // px: las fotos grandes se reducen para no llenar el dispositivo

/* Reduce la imagen y la devuelve como data URL (PNG si puede tener transparencia, si no JPEG) */
function prepararImagen(file) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(/png|gif|svg|webp/.test(file.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/* Documento nuevo: crea el archivo HTML vacío y devuelve el source para el recurso */
export async function newEditorSource(title) {
  const html = `<h1>${esc(title)}</h1><p><br></p>`;
  const blobId = await db.saveBlob(new Blob([html], {type: 'text/html'}));
  return {kind: 'editor', blobId, mimeType: 'text/html', size: html.length, name: title + '.html'};
}

const B = (cmd, label, title, arg = '') =>
  `<button type="button" data-cmd="${cmd}" data-arg="${arg}" title="${title}" aria-label="${title}">${label}</button>`;

export async function openEditor(resource) {
  let r = resource;
  const blob = r.source?.blobId ? await db.getBlob(r.source.blobId) : null;
  /* Los archivos no viajan con la sincronización: abrirlo vacío aquí y guardar borraría el original */
  if (r.source?.blobId && !blob) return toast('Este documento se escribió en otro dispositivo; ábrelo allá (o descarga allá el PDF).', 6000);
  const inicial = blob ? await blob.text() : `<h1>${esc(r.title)}</h1><p><br></p>`;

  const dlg = document.createElement('dialog');
  dlg.className = 'editor-dlg';
  dlg.innerHTML = `
    <div class="ed-top">
      <button type="button" id="ed-close">← Cerrar</button>
      <strong class="ed-title">${esc(r.title)}</strong>
      <span class="ed-state hint" id="ed-state">Guardado</span>
      <button type="button" class="primary" id="ed-pdf">Descargar PDF</button>
    </div>
    <div class="ed-bar" role="toolbar" aria-label="Formato">
      ${B('undo', '↶', 'Deshacer')}${B('redo', '↷', 'Rehacer')}
      <select id="ed-block" aria-label="Estilo de párrafo">
        <option value="p">Texto normal</option><option value="h1">Título</option>
        <option value="h2">Subtítulo</option><option value="h3">Apartado</option>
      </select>
      ${B('bold', '<b>N</b>', 'Negrita')}${B('italic', '<i>K</i>', 'Cursiva')}
      ${B('underline', '<u>S</u>', 'Subrayado')}${B('strikeThrough', '<s>ab</s>', 'Tachado')}
      <label class="ed-color" title="Color del texto">A<input type="color" id="ed-color" value="#0369a1" aria-label="Color del texto"></label>
      ${B('insertUnorderedList', '•', 'Lista con viñetas')}${B('insertOrderedList', '1.', 'Lista numerada')}
      ${B('justifyLeft', '⇤', 'Alinear a la izquierda')}${B('justifyCenter', '↔', 'Centrar')}
      ${B('justifyRight', '⇥', 'Alinear a la derecha')}${B('justifyFull', '☰', 'Justificar')}
      <button type="button" id="ed-img" title="Insertar imagen">🖼 Imagen</button>
      <button type="button" id="ed-table" title="Insertar tabla">▦ Tabla</button>
      ${B('insertHorizontalRule', '―', 'Línea divisoria')}
      <span id="ed-imgsize" class="ed-imgsize" hidden>Imagen:
        <button type="button" data-w="25">25%</button><button type="button" data-w="50">50%</button>
        <button type="button" data-w="75">75%</button><button type="button" data-w="100">100%</button>
        <button type="button" data-w="del" title="Quitar imagen">🗑</button></span>
      <input type="file" id="ed-file" accept="image/*" multiple hidden>
    </div>
    <div class="ed-scroll"><article class="ed-hoja" id="ed-hoja" contenteditable="true" spellcheck="true" lang="es"></article></div>
    <p class="hint ed-foot">Puedes pegar (Ctrl+V) o arrastrar imágenes. En «Descargar PDF» elige «Guardar como PDF».</p>`;
  document.body.append(dlg);
  dlg.showModal();

  const $ = s => dlg.querySelector(s);
  const hoja = $('#ed-hoja');
  hoja.innerHTML = inicial;
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('defaultParagraphSeparator', false, 'p');

  /* ---- Guardado automático ---- */
  let t, cambiado = false, guardando = Promise.resolve();
  const estado = s => { $('#ed-state').textContent = s; };
  async function guardar() {
    if (!cambiado) return;
    cambiado = false;
    const html = hoja.innerHTML;
    const b = new Blob([html], {type: 'text/html'});
    let blobId = r.source?.blobId;
    if (blobId) await db.put('blobs', {id: blobId, blob: b, mimeType: b.type, size: b.size, createdAt: Date.now()});
    else blobId = await db.saveBlob(b);
    r = await db.update('resources', r, {source: {...r.source, kind: 'editor', blobId, mimeType: 'text/html', size: b.size}});
    estado('Guardado');
  }
  const programar = () => {
    cambiado = true; estado('Guardando…');
    clearTimeout(t);
    t = setTimeout(() => { guardando = guardando.then(guardar).catch(e => { estado('Sin guardar'); toast('No se pudo guardar: ' + e.message, 5000); }); }, 1200);
  };
  hoja.addEventListener('input', programar);

  /* ---- Barra de formato ---- */
  $('.ed-bar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // no perder la selección
  $('.ed-bar').addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    hoja.focus();
    document.execCommand(b.dataset.cmd, false, b.dataset.arg || null);
    programar();
  });
  $('#ed-block').onchange = e => { hoja.focus(); document.execCommand('formatBlock', false, e.target.value); programar(); };
  $('#ed-color').oninput = e => { hoja.focus(); document.execCommand('foreColor', false, e.target.value); programar(); };
  document.addEventListener('selectionchange', marcarBloque);
  function marcarBloque() {
    const n = getSelection().anchorNode;
    if (!n || !hoja.contains(n)) return;
    const blk = (n.nodeType === 1 ? n : n.parentElement).closest('h1,h2,h3,p,li');
    $('#ed-block').value = blk && /^H[123]$/.test(blk.tagName) ? blk.tagName.toLowerCase() : 'p';
  }

  /* ---- Imágenes: botón, pegar y arrastrar ---- */
  async function insertarImagenes(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    for (const f of imgs) {
      try {
        const src = await prepararImagen(f);
        hoja.focus();
        document.execCommand('insertHTML', false, `<img src="${src}" alt="${esc(f.name)}" style="width:100%">`);
      } catch (e) { toast(e.message); }
    }
    if (imgs.length) programar();
    return imgs.length > 0;
  }
  $('#ed-img').onclick = () => $('#ed-file').click();
  $('#ed-file').onchange = e => { insertarImagenes(e.target.files); e.target.value = ''; };
  hoja.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); insertarImagenes(files); }
  });
  hoja.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.some(f => f.type.startsWith('image/'))) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (pos) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); }
    insertarImagenes(files);
  });

  /* Tocar una imagen la selecciona para cambiar su tamaño o quitarla */
  let imgSel = null;
  hoja.addEventListener('click', e => {
    if (imgSel) imgSel.classList.remove('sel');
    imgSel = e.target.tagName === 'IMG' ? e.target : null;
    if (imgSel) imgSel.classList.add('sel');
    $('#ed-imgsize').hidden = !imgSel;
  });
  $('#ed-imgsize').onclick = e => {
    const w = e.target.dataset.w;
    if (!w || !imgSel) return;
    if (w === 'del') { imgSel.remove(); imgSel = null; $('#ed-imgsize').hidden = true; }
    else imgSel.style.width = w + '%';
    programar();
  };

  /* ---- Tabla ---- */
  $('#ed-table').onclick = () => {
    const f = Math.min(30, Math.max(1, parseInt(prompt('¿Cuántas filas?', '3'), 10) || 0));
    const c = Math.min(10, Math.max(1, parseInt(prompt('¿Cuántas columnas?', '3'), 10) || 0));
    if (!f || !c) return;
    const fila = tag => '<tr>' + `<${tag}><br></${tag}>`.repeat(c) + '</tr>';
    hoja.focus();
    document.execCommand('insertHTML', false, `<table><tbody>${fila('th')}${fila('td').repeat(f - 1)}</tbody></table><p><br></p>`);
    programar();
  };

  /* ---- PDF ---- */
  $('#ed-pdf').onclick = () => {
    if (imgSel) imgSel.classList.remove('sel');
    const antes = document.title;
    document.title = r.title;                 // el navegador lo propone como nombre del PDF
    document.body.classList.add('imprimiendo');
    const fin = () => { document.body.classList.remove('imprimiendo'); document.title = antes; removeEventListener('afterprint', fin); };
    addEventListener('afterprint', fin);
    window.print();
    setTimeout(fin, 1000);                     // algunos móviles no disparan afterprint
  };

  /* ---- Cerrar (también con Esc) guardando lo pendiente ---- */
  async function cerrar() {
    clearTimeout(t);
    await guardando; await guardar().catch(() => {});
    document.removeEventListener('selectionchange', marcarBloque);
    dlg.close(); dlg.remove();
    dispatchEvent(new HashChangeEvent('hashchange'));   // refresca la lista (tamaño, fecha)
  }
  $('#ed-close').onclick = cerrar;
  dlg.addEventListener('cancel', e => { e.preventDefault(); cerrar(); });
  hoja.focus();
}
