import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';

/* Navegador mínimo: el módulo solo usa window/google al conectar */
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator', {value: {onLine: true}, configurable: true});

const root = new URL('../js/', import.meta.url).pathname;
const db = await import(root + 'db.js');
const drive = await import(root + 'drive.js');
await db.open();

/* ---- Supabase simulado: sesión + función drive-token ---- */
let session = {user: {id: 'u1'}}, linked = false, calls = [];
const fnReply = body => {
  calls.push(body.action);
  if (body.action === 'connect') { linked = body.code === 'CODIGO'; return linked ? {access_token: 'TOK1', expires_in: 3600} : {error: 'other', message: 'código inválido'}; }
  if (body.action === 'token') return linked ? {access_token: 'TOK2', expires_in: 3600} : {error: 'noconnect'};
};
drive.setClientProvider(async () => ({
  auth: {getSession: async () => ({data: {session}})},
  functions: {invoke: async (_n, {body}) => ({data: fnReply(body), error: null})},
}));

/* ---- Google Identity Services simulado (ventana emergente) ---- */
globalThis.google = {accounts: {oauth2: {initCodeClient: o => ({requestCode: () => o.callback({code: 'CODIGO'})})}}};

/* ---- API de Drive simulada ---- */
const seen = [];
globalThis.fetch = async (url, opt = {}) => {
  seen.push({url: String(url), auth: opt.headers && opt.headers.Authorization, method: opt.method || 'GET'});
  const ok = j => ({ok: true, status: 200, json: async () => j});
  if (/\/files\?q=/.test(url)) return ok({files: []});                          // no hay carpeta
  if (/\/files\?fields=id$/.test(url)) return ok({id: 'CARPETA1'});             // se crea la carpeta
  if (/upload\/drive/.test(url)) return ok({id: 'ARCHIVO1', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/ARCHIVO1/view'});
  return {ok: false, status: 404, json: async () => ({})};
};

/* 1) Sin conectar: subir falla con «noconnect» y no se marca como conectado */
assert.equal(await drive.driveLinked(), false);
await assert.rejects(() => drive.driveUpload(new Blob(['x'], {type: 'application/pdf'}), 'a.pdf'), e => e.code === 'noconnect');

/* 2) Conectar una vez (ventana de Google → código → función) */
await drive.driveConnect();
assert.equal(await drive.driveLinked(), true, 'queda conectado en este dispositivo');
assert.ok(calls.includes('connect'));

/* 3) Subir: crea la carpeta una vez y sube el archivo con el token */
const up = await drive.driveUpload(new Blob(['hola'], {type: 'application/pdf'}), 'guia.pdf');
assert.deepEqual(up, {fileId: 'ARCHIVO1', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/ARCHIVO1/view'});
assert.ok(seen.every(s => /^Bearer TOK/.test(s.auth)), 'todas las llamadas llevan el token');
assert.equal(await db.metaGet('gFolderId'), 'CARPETA1');

/* 4) El token se reutiliza (no llama a la función en cada archivo) */
const before = calls.length;
await drive.driveUpload(new Blob(['otro']), 'otro.bin');
assert.equal(calls.length, before, 'token en memoria');

/* 5) Sin sesión de Supabase: pide iniciar sesión */
session = null;
await assert.rejects(() => drive.driveConnect(), e => e.code === 'login');

/* 6) Google rechaza el token (401): error «reconnect» y se descarta el token guardado */
session = {user: {id: 'u1'}};
linked = false;
globalThis.fetch = async () => ({ok: false, status: 401, json: async () => ({})});
await assert.rejects(() => drive.driveUpload(new Blob(['x']), 'x'), e => e.code === 'reconnect');

console.log('DRIVE OK');
