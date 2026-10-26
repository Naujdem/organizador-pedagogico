/* ============================================================
   viewer.js · Visor de documentos dentro de la app
   openSource(recurso) abre el archivo en un visor en vez de descargarlo:
     · PDF, imágenes, audio, video y texto → nativo del navegador.
     · Word (.docx) → docx-preview;  Excel (.xlsx) → lector propio (js/xlsx-view.js). Ambos locales, sin internet.
     · PowerPoint → se ve el PDF «para ver» que se adjunta al documento (source.previewBlobId);
       el botón «Descargar» baja el .pptx original para editarlo.
       El PDF también se sube a Drive si se pidió (previewFileId / previewWebViewLink).
   Lo que no se puede previsualizar ofrece «Descargar» y no baja nada hasta que se toque.
   Los enlaces externos y los archivos solo en Drive se abren en una pestaña nueva.
   ============================================================ */
import * as db from './db.js';
import {esc, modal, toast, download} from './ui.js';
import {readXlsx} from './xlsx-view.js';

const EXT_MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', md: 'text/plain', csv: 'text/plain',
};
const ext = name => (String(name || '').split('.').pop() || '').toLowerCase();
export const isPresentation = name => /^(pptx?|ppsx|odp)$/.test(ext(name));

function kindOf(blob, name = '') {
  const e = ext(name);
  if (e === 'docx') return {kind: 'docx', mime: blob.type};
  if (e === 'xlsx') return {kind: 'xlsx', mime: blob.type};
  let m = (blob.type || '').toLowerCase();
  if (m.includes('wordprocessingml.document')) return {kind: 'docx', mime: m};
  if (m.includes('spreadsheetml.sheet')) return {kind: 'xlsx', mime: m};
  if (!m || m === 'application/octet-stream') m = EXT_MIME[e] || m;
  if (m === 'application/pdf') return {kind: 'pdf', mime: m};
  if (m.startsWith('image/')) return {kind: 'img', mime: m};
  if (m.startsWith('audio/')) return {kind: 'audio', mime: m};
  if (m.startsWith('video/')) return {kind: 'video', mime: m};
  if (m.startsWith('text/')) return {kind: 'text', mime: m};
  return {kind: 'none', mime: m};
}

/* Las librerías de Word se cargan solo cuando se abre un .docx (y quedan en caché para uso sin internet) */
const loaded = {};
function loadScript(path) {
  return loaded[path] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/' + path, import.meta.url).href;
    s.onload = res; s.onerror = () => { delete loaded[path]; rej(new Error('No se pudo cargar ' + path)); };
    document.head.append(s);
  });
}

async function drawDocx(body, blob) {
  await loadScript('jszip.min.js');
  await loadScript('docx-preview.min.js');
  body.innerHTML = '<div class="viewer-docx"></div>';
  await window.docx.renderAsync(blob, body.firstChild, null, {inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true});
}

async function drawXlsx(body, blob) {
  await loadScript('jszip.min.js');
  const sheets = await readXlsx(await blob.arrayBuffer(), window.JSZip);
  if (!sheets.length) { body.innerHTML = '<div class="empty">El libro está vacío.</div>'; return; }
  body.innerHTML = '<div class="viewer-xlsx"><div class="chips" id="x-tabs"></div><div class="xwrap" id="x-grid"></div></div>';
  const show = i => {
    const s = sheets[i];
    const w = Math.max(1, ...s.rows.map(r => r.length));
    body.querySelector('#x-tabs').innerHTML = sheets.map((x, j) =>
      `<button type="button" class="chip${j === i ? ' on' : ''}" data-i="${j}">${esc(x.name)}</button>`).join('');
    body.querySelector('#x-grid').innerHTML = s.rows.length
      ? `<table>${s.rows.map(r => `<tr>${Array.from({length: w}, (_, c) => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</table>` +
        (s.truncated ? '<p class="hint">Se muestran solo las primeras filas. Descarga el archivo para verlo completo.</p>' : '')
      : '<div class="empty">Esta hoja está vacía.</div>';
  };
  body.querySelector('#x-tabs').onclick = e => { const b = e.target.closest('[data-i]'); if (b) show(Number(b.dataset.i)); };
  show(0);
}

/* view = {blob, name} lo que se muestra · dl = {blob, name, label} lo que baja «Descargar» (o null) */
function openViewer(title, view, dl) {
  const {kind, mime} = kindOf(view.blob, view.name);
  let url = '';
  const dlg = modal(`<div class="viewer">
    <div class="viewer-bar"><b class="viewer-title">${esc(title)}</b>
      <span class="viewer-acts">${dl ? `<button type="button" id="v-dl">⬇ ${esc(dl.label || 'Descargar')}</button>` : ''}
      <button type="button" id="v-x" class="primary">Cerrar</button></span></div>
    <div class="viewer-body" id="v-body"><div class="empty">Cargando…</div></div></div>`, {onClose: () => url && URL.revokeObjectURL(url)});
  dlg.classList.add('viewer-dlg');
  const body = dlg.querySelector('#v-body');
  dlg.querySelector('#v-x').onclick = () => dlg.close();
  if (dl) dlg.querySelector('#v-dl').onclick = () => download(dl.name, dl.blob);

  const fail = err => {
    console.error(err);
    body.innerHTML = `<div class="empty">No se pudo mostrar este archivo.<br><span class="hint">${dl ? 'Usa «Descargar» para abrirlo con otra aplicación.' : ''}</span></div>`;
  };
  if (kind === 'docx') { drawDocx(body, view.blob).catch(fail); return; }
  if (kind === 'xlsx') { drawXlsx(body, view.blob).catch(fail); return; }
  if (kind === 'none') {
    body.innerHTML = `<div class="empty">Este tipo de archivo (${esc(mime || ext(view.name) || 'desconocido')}) no se puede ver aquí.<br>
      <span class="hint">${isPresentation(view.name)
        ? 'Para verlo aquí, edita el documento y adjunta el mismo archivo guardado como PDF.'
        : 'Usa «Descargar» para abrirlo con otra aplicación.'}</span></div>`;
    return;
  }
  if (kind === 'text') { view.blob.text().then(t => { body.innerHTML = `<pre class="viewer-text">${esc(t)}</pre>`; }); return; }
  url = URL.createObjectURL(view.blob.type === mime ? view.blob : new Blob([view.blob], {type: mime}));
  if (kind === 'pdf') body.innerHTML = `<iframe class="viewer-frame" src="${url}" title="${esc(title)}"></iframe>`;
  else if (kind === 'img') body.innerHTML = `<img class="viewer-img" src="${url}" alt="${esc(title)}">`;
  else if (kind === 'audio') body.innerHTML = `<audio class="viewer-media" src="${url}" controls></audio>`;
  else body.innerHTML = `<video class="viewer-media" src="${url}" controls playsinline></video>`;
}

export async function openSource(r) {
  const s = r && r.source;
  if (!s) return;
  if (s.kind === 'link') return window.open(s.url, '_blank', 'noopener');
  /* Copia local primero (funciona sin internet); si no hay, Drive */
  const main = s.blobId ? await db.getBlob(s.blobId) : null;
  const name = s.name || r.title;
  const preview = s.previewBlobId ? await db.getBlob(s.previewBlobId) : null;
  if (preview) {   // p. ej. PowerPoint: se ve el PDF y se descarga el original para editar
    const pn = s.previewName || r.title + '.pdf';
    return openViewer(r.title, {blob: preview, name: pn.toLowerCase().endsWith('.pdf') ? pn : pn + '.pdf'},
      main ? {blob: main, name, label: isPresentation(name) ? 'Descargar .pptx (editar)' : 'Descargar original'} : null);
  }
  if (s.previewWebViewLink) return window.open(s.previewWebViewLink, '_blank', 'noopener');   // el PDF solo está en Drive
  if (main) return openViewer(r.title, {blob: main, name}, {blob: main, name, label: 'Descargar'});
  if (s.kind === 'drive' && s.webViewLink) return window.open(s.webViewLink, '_blank', 'noopener');
  toast('El archivo no está disponible en este dispositivo.');
}
