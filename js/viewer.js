/* ============================================================
   viewer.js · Visor de documentos dentro de la app
   openSource(recurso) abre el archivo en un visor (PDF, imágenes, audio, video, texto)
   en vez de descargarlo. Si el tipo no se puede previsualizar (Word, Excel…),
   ofrece un botón «Descargar» y no baja nada hasta que se toque.
   Los enlaces externos y los archivos solo en Drive se abren en una pestaña nueva.
   ============================================================ */
import * as db from './db.js';
import {esc, modal, toast, download} from './ui.js';

const EXT_MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', md: 'text/plain', csv: 'text/plain',
};

function kindOf(blob, name = '') {
  let m = (blob.type || '').toLowerCase();
  if (!m || m === 'application/octet-stream') m = EXT_MIME[(name.split('.').pop() || '').toLowerCase()] || m;
  if (m === 'application/pdf') return {kind: 'pdf', mime: m};
  if (m.startsWith('image/')) return {kind: 'img', mime: m};
  if (m.startsWith('audio/')) return {kind: 'audio', mime: m};
  if (m.startsWith('video/')) return {kind: 'video', mime: m};
  if (m.startsWith('text/')) return {kind: 'text', mime: m};
  return {kind: 'none', mime: m};
}

function openViewer(title, blob, name) {
  const {kind, mime} = kindOf(blob, name);
  const fileName = name || title;
  let url = '';
  const dlg = modal(`<div class="viewer">
    <div class="viewer-bar"><b class="viewer-title">${esc(title)}</b>
      <span class="viewer-acts"><button type="button" id="v-dl">⬇ Descargar</button>
      <button type="button" id="v-x" class="primary">Cerrar</button></span></div>
    <div class="viewer-body" id="v-body"></div></div>`, {onClose: () => url && URL.revokeObjectURL(url)});
  dlg.classList.add('viewer-dlg');
  const body = dlg.querySelector('#v-body');
  dlg.querySelector('#v-x').onclick = () => dlg.close();
  dlg.querySelector('#v-dl').onclick = () => download(fileName, blob);

  if (kind === 'none') {
    body.innerHTML = `<div class="empty">Este tipo de archivo (${esc(mime || 'desconocido')}) no se puede ver aquí.<br>
      <span class="hint">Usa «Descargar» para abrirlo con otra aplicación.</span></div>`;
    return;
  }
  if (kind === 'text') {
    blob.text().then(t => { body.innerHTML = `<pre class="viewer-text">${esc(t)}</pre>`; });
    return;
  }
  url = URL.createObjectURL(blob.type === mime ? blob : new Blob([blob], {type: mime}));
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
  if (s.blobId) {
    const blob = await db.getBlob(s.blobId);
    if (blob) return openViewer(r.title, blob, s.name);
  }
  if (s.kind === 'drive' && s.webViewLink) return window.open(s.webViewLink, '_blank', 'noopener');
  toast('El archivo no está disponible en este dispositivo.');
}
