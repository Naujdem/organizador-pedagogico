/* ============================================================
   drive.js · Organizador Pedagógico
   Google Drive PERSONAL del docente (sin servidor propio ni suscripción).
     - Scope mínimo «drive.file»: la app solo ve los archivos que ella misma crea.
     - Cada docente pega su propio «Client ID» de Google (Ajustes), así los
       archivos y los permisos son suyos y no dependen de nadie más.
     - El token dura ~1 h y vive solo en memoria; se renueva con un toque.
   API: driveConfigured(), driveConnected(), driveConnect(), driveUpload(blob, name)
   ============================================================ */
import * as db from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Organizador Pedagógico';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';

let tok = null;   // {t, exp}

export const driveConfigured = async () => !!(await db.metaGet('gClientId'));
export const driveConnected = () => !!(tok && tok.exp > Date.now() + 60000);

function loadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = ok;
    s.onerror = () => ko(new Error('No se pudo cargar Google (¿sin internet?)'));
    document.head.append(s);
  });
}

/* Debe llamarse desde un toque del usuario (abre la ventana de Google) */
export async function driveConnect() {
  const clientId = await db.metaGet('gClientId');
  if (!clientId) throw new Error('Falta el Client ID de Google (Ajustes).');
  if (!navigator.onLine) throw new Error('Necesitas internet para conectar con Drive.');
  await loadGis();
  return new Promise((ok, ko) => {
    google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: r => {
        if (r.error) return ko(new Error(r.error_description || r.error));
        tok = {t: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000};
        ok();
      },
      error_callback: e => ko(new Error((e && e.type) || 'La ventana de Google se cerró')),
    }).requestAccessToken();
  });
}

async function gd(url, opt = {}) {
  if (!driveConnected()) throw new Error('Drive no está conectado.');
  const r = await fetch(url, {...opt, headers: {Authorization: 'Bearer ' + tok.t, ...opt.headers}});
  if (r.status === 401) { tok = null; throw new Error('La sesión de Drive caducó. Vuelve a conectar.'); }
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).error.message; } catch (_) {}
    const e = new Error('Drive ' + r.status + (m ? ': ' + m : '')); e.status = r.status; throw e;
  }
  return r;
}

/* Busca la carpeta «Organizador Pedagógico» y la crea si no existe */
async function folderId() {
  let id = await db.metaGet('gFolderId');
  if (id) {
    try {
      const j = await (await gd(`${API}/files/${id}?fields=id,trashed`)).json();
      if (!j.trashed) return id;
    } catch (e) { if (e.status !== 404) throw e; }
  }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await (await gd(`${API}/files?q=${q}&fields=files(id)&spaces=drive`)).json();
  if (found.files && found.files.length) id = found.files[0].id;
  else {
    const r = await gd(`${API}/files?fields=id`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: FOLDER, mimeType: 'application/vnd.google-apps.folder'}),
    });
    id = (await r.json()).id;
  }
  await db.metaSet('gFolderId', id);
  return id;
}

/* Sube un archivo a la carpeta y devuelve {fileId, mimeType, webViewLink} */
export async function driveUpload(blob, name) {
  const parent = await folderId();
  const b = 'op' + Math.random().toString(36).slice(2);
  const meta = {name, parents: [parent]};
  const body = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(meta),
    `\r\n--${b}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob,
    `\r\n--${b}--`,
  ]);
  const r = await gd(`${UP}/files?uploadType=multipart&fields=id,mimeType,webViewLink`, {
    method: 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + b}, body,
  });
  const j = await r.json();
  return {fileId: j.id, mimeType: j.mimeType, webViewLink: j.webViewLink};
}
