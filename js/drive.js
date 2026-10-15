/* ============================================================
   drive.js · Organizador Pedagógico
   Google Drive PERSONAL del docente, igual que en SimulaPro:
     - Se conecta UNA sola vez (botón en Ajustes). El permiso permanente lo guarda
       la función «drive-token» de tu Supabase (el navegador nunca lo ve).
     - Después, los archivos se suben solos a la carpeta «Organizador Pedagógico».
     - Scope mínimo «drive.file»: la app solo ve los archivos que ella misma crea.
     - El token de acceso dura ~1 h, vive solo en memoria y se renueva solo.
   API: driveLinked(), driveAutoLink(), driveConnect(), driveUpload(blob, name), preloadGis()
   ============================================================ */
import * as db from './db.js';
import {GOOGLE_CLIENT_ID} from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Organizador Pedagógico';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(code, message) { super(message); this.code = code; }   // 'noconnect' | 'reconnect' | 'login' | 'other'
}

/* Cliente de Supabase (se puede reemplazar en las pruebas) */
let clientProvider = async () => (await import('./cloud.js')).cloud();
export const setClientProvider = f => { clientProvider = f; };

/* ¿Ya se conectó Drive en este dispositivo? (la validez real se comprueba al subir) */
export const driveLinked = async () => !!(await db.metaGet('driveLinked'));

/* ---------- Google Identity Services ---------- */
let gis = null;
export function preloadGis() {                 // cargarlo antes del clic evita que bloqueen la ventana emergente
  if (gis) return gis;
  gis = new Promise((ok, ko) => {
    if (window.google && google.accounts && google.accounts.oauth2) return ok();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { gis = null; ko(new DriveError('other', 'No se pudo cargar Google (¿sin internet?)')); };
    document.head.append(s);
  });
  return gis;
}

function requestCode() {
  return new Promise((ok, ko) => {
    if (!(window.google && google.accounts && google.accounts.oauth2))
      return ko(new DriveError('other', 'Google aún no cargó. Inténtalo de nuevo en unos segundos.'));
    google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE, ux_mode: 'popup', prompt: 'consent',
      callback: r => r.code ? ok(r.code) : ko(new DriveError('other', 'No se concedió el permiso de Google Drive.')),
      error_callback: () => ko(new DriveError('other', 'Se cerró la ventana de Google o fue bloqueada.')),
    }).requestCode();
  });
}

/* ---------- Token de acceso (función drive-token) ---------- */
let cached = null, inflight = null;                // cached = {t, exp}

async function callFn(body) {
  const sb = await clientProvider();
  const {data: {session} = {}} = await sb.auth.getSession();
  if (!session) throw new DriveError('login', 'Inicia sesión para usar Google Drive.');
  const {data, error} = await sb.functions.invoke('drive-token', {body});
  if (error) throw new DriveError('other', 'No se pudo hablar con la función drive-token de Supabase (¿está desplegada?).');
  return data || {};
}

function keep(r) {
  if (!r.access_token) throw new DriveError('other', r.message || 'Google no entregó el permiso.');
  cached = {t: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 - 60000};
  return r.access_token;
}

function getToken() {
  if (cached && cached.exp > Date.now()) return Promise.resolve(cached.t);
  if (inflight) return inflight;
  inflight = (async () => {
    const r = await callFn({action: 'token'});
    if (r.error === 'noconnect' || r.error === 'reconnect') {
      cached = null; await db.metaSet('driveLinked', false);
      throw new DriveError(r.error, 'Falta conectar Google Drive (Ajustes).');
    }
    if (r.error) throw new DriveError('other', r.message || 'Error de Google Drive.');
    return keep(r);
  })().finally(() => { inflight = null; });
  return inflight;
}

/* El permiso vive en tu cuenta (en Supabase), no en el dispositivo. Si ya conectaste Drive
   desde otro dispositivo o en otra sesión, esto lo detecta solo, sin pedirte nada.
   Solo corre con sesión iniciada. Devuelve true si Drive queda conectado. */
export async function driveAutoLink() {
  if (await driveLinked()) return true;
  if (!navigator.onLine) return false;
  let hasSession = false;
  try { hasSession = Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (_) {}
  if (!hasSession) return false;
  try { await getToken(); } catch (_) { return false; }     // sin permiso guardado: falta el primer «Conectar»
  await db.metaSet('driveLinked', true);
  return true;
}

/* Debe llamarse desde un toque del usuario (abre la ventana de Google) */
export async function driveConnect() {
  if (!navigator.onLine) throw new DriveError('other', 'Necesitas internet para conectar con Drive.');
  await preloadGis();
  const code = await requestCode();
  const r = await callFn({action: 'connect', code});
  if (r.error) throw new DriveError('other', r.message || 'No se pudo conectar Google Drive.');
  keep(r);
  await db.metaSet('driveLinked', true);
}

/* ---------- Drive ---------- */
async function gd(url, opt = {}) {
  const t = await getToken();
  const r = await fetch(url, {...opt, headers: {Authorization: 'Bearer ' + t, ...opt.headers}});
  if (r.status === 401) { cached = null; throw new DriveError('reconnect', 'La sesión de Drive caducó. Vuelve a intentarlo.'); }
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).error.message; } catch (_) {}
    const e = new DriveError('other', 'Drive ' + r.status + (m ? ': ' + m : '')); e.status = r.status; throw e;
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
  const body = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({name, parents: [parent]}),
    `\r\n--${b}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob,
    `\r\n--${b}--`,
  ]);
  const r = await gd(`${UP}/files?uploadType=multipart&fields=id,mimeType,webViewLink`, {
    method: 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + b}, body,
  });
  const j = await r.json();
  return {fileId: j.id, mimeType: j.mimeType, webViewLink: j.webViewLink};
}
