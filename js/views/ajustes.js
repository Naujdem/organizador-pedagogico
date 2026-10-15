/* ============================================================
   ajustes.js · Perfil, Google Drive y respaldo
   El respaldo .json es el seguro independiente de Drive: contiene
   todos tus datos y se puede restaurar en otro dispositivo.
   ============================================================ */
import * as db from '../db.js';
import {driveConnect, driveLinked, preloadGis} from '../drive.js';
import {esc, toast, download} from '../ui.js';

export async function render(root) {
  const [profile] = await db.live('profile');
  const p = profile || {};

  root.innerHTML = `
    <h2>Ajustes</h2>
    <div class="card"><h3>Perfil e institución</h3>
      <label for="p-n">Nombre del docente</label><input id="p-n" value="${esc(p.teacherName || '')}">
      <label for="p-i">Institución</label><input id="p-i" value="${esc(p.institution?.name || '')}">
      <label for="p-y">Año lectivo</label><input id="p-y" value="${esc(p.academicYear || String(new Date().getFullYear()))}">
      <div class="btns"><button class="primary" id="p-save">Guardar perfil</button></div></div>

    <div class="card" style="margin-top:14px"><h3>Google Drive</h3>
      <p class="hint">Conéctalo una sola vez y tus archivos adjuntos se guardarán solos en <b>tu</b> Drive, en la carpeta «Organizador Pedagógico», para abrirlos desde cualquier dispositivo. La app solo ve lo que ella misma sube. Necesitas haber iniciado sesión.</p>
      <p class="hint" id="g-state"></p>
      <div class="btns"><button class="primary" id="g-conn">Conectar Google Drive</button></div></div>

    <div class="card" style="margin-top:14px"><h3>Cuenta y nube</h3>
      <p class="hint" id="c-state">Sin iniciar sesión. Inicia sesión con Google para guardar tus datos en la nube.</p>
      <div class="btns">
        <button class="primary" id="c-login">Iniciar sesión</button>
        <button id="c-logout" hidden>Cerrar sesión</button>
        <button id="c-sync">Sincronizar ahora</button>
        <button id="c-test">Probar conexión</button></div></div>

    <div class="card" style="margin-top:14px"><h3>Respaldo</h3>
      <p class="hint">Descarga una copia completa de tus datos o restaura una anterior. Al restaurar se conserva el registro más reciente de cada elemento.</p>
      <div class="btns"><button id="b-exp">Descargar respaldo</button>
        <button id="b-imp">Restaurar respaldo…</button></div>
      <input type="file" id="b-file" accept="application/json,.json" hidden></div>`;

  const $ = s => root.querySelector(s);

  $('#p-save').onclick = async () => {
    const data = {teacherName: $('#p-n').value.trim(), academicYear: $('#p-y').value.trim(),
      institution: {...(p.institution || {}), name: $('#p-i').value.trim()}};
    profile ? await db.update('profile', profile, data) : await db.create('profile', data);
    toast('Perfil guardado');
  };
  /* ---- Google Drive (una sola conexión) ---- */
  const drawDrive = async () => {
    const on = await driveLinked();
    $('#g-state').textContent = on ? '✓ Drive conectado: los archivos que adjuntes se guardan solos.' : 'Aún no está conectado.';
    $('#g-conn').textContent = on ? 'Reconectar Drive' : 'Conectar Google Drive';
  };
  drawDrive();
  preloadGis().catch(() => {});                       // cargado de antemano, la ventana de Google no se bloquea
  $('#g-conn').onclick = async () => {
    try { await driveConnect(); toast('Drive conectado'); drawDrive(); }
    catch (e) { toast(e.message || String(e), 6000); }
  };
  /* ---- Cuenta de Google (Supabase) ---- */
  async function drawAccount() {
    try {
      const {currentUser} = await import('../cloud.js');
      const u = await currentUser();
      $('#c-state').innerHTML = u ? `Sesión iniciada como <b>${esc(u.email || 'usuario')}</b>.` : 'Sin iniciar sesión. Inicia sesión con Google para guardar tus datos en la nube.';
      $('#c-login').hidden = !!u; $('#c-logout').hidden = !u;
    } catch (_) { /* sin internet o sin Supabase: se deja el estado por defecto */ }
  }
  $('#c-login').onclick = async () => {
    const {showLogin} = await import('../login.js'); showLogin();
  };
  addEventListener('op-auth', () => drawAccount(), {once: true});
  $('#c-logout').onclick = async () => {
    try {
      const {signOut} = await import('../cloud.js'); await signOut();
      const {forgetGuest, showLogin} = await import('../login.js'); forgetGuest();
      toast('Sesión cerrada'); drawAccount(); showLogin();
    }
    catch (e) { toast(e.message || String(e), 6000); }
  };
  drawAccount();
  $('#c-sync').onclick = async () => {
    const b = $('#c-sync'); b.disabled = true; b.textContent = 'Sincronizando…';
    try {
      const {syncNow} = await import('../sync.js');
      const r = await syncNow();
      toast(r ? `Sincronizado: ${r.pushed} subidos, ${r.pulled} recibidos` : 'Inicia sesión y conéctate a internet para sincronizar.', 5000);
    } catch (e) { toast('Error al sincronizar: ' + (e.message || e), 8000); }
    b.disabled = false; b.textContent = 'Sincronizar ahora';
  };
  $('#c-test').onclick = async () => {
    const b = $('#c-test'); b.disabled = true; b.textContent = 'Probando…';
    try {
      const {testConnection} = await import('../cloud.js');
      toast(await testConnection(), 5000);
    } catch (e) { toast('Error: ' + (e.message || e), 8000); }
    b.disabled = false; b.textContent = 'Probar conexión';
  };
  $('#b-exp').onclick = async () => {
    const data = await db.exportAll();
    download(`organizador-respaldo-${new Date().toLocaleDateString('en-CA')}.json`,
      new Blob([JSON.stringify(data)], {type: 'application/json'}));
  };
  $('#b-imp').onclick = () => $('#b-file').click();
  $('#b-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await db.importAll(JSON.parse(await f.text()));
      toast(`Restaurado: ${r.added} nuevos, ${r.replaced} actualizados`, 4000);
    } catch (err) { toast(err.message, 5000); }
  };
}
