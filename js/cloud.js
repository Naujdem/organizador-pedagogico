/* ============================================================
   cloud.js · Conexión con Supabase (carga perezosa)
   Supabase se descarga solo cuando hace falta, así la app
   sigue abriendo sin internet.
   ============================================================ */
import {SUPABASE_URL, SUPABASE_ANON_KEY} from './config.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let clientP = null;

export function cloud() {
  if (!clientP) {
    clientP = import(CDN)
      .then(({createClient}) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          flowType: 'pkce',          // evita choques con las rutas #/ de la app
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }))
      .catch(e => { clientP = null; throw e; });   // permite reintentar si no había internet
  }
  return clientP;
}

/* Prueba: ¿se llega a Supabase y existe la tabla op_records? */
export async function testConnection() {
  const sb = await cloud();
  const {error} = await sb.from('op_records').select('id', {head: true, count: 'exact'});
  if (error) throw new Error(error.message);
  return 'Conexión OK: la tabla op_records responde.';
}

/* ---------- Sesión con Google ---------- */
/* Vuelve a esta misma página (funciona en localhost y en GitHub Pages) */
const here = () => location.origin + location.pathname;

export async function signInWithGoogle() {
  if (!navigator.onLine) throw new Error('Necesitas internet para iniciar sesión.');
  const sb = await cloud();
  try { sessionStorage.setItem('op_return', location.hash || '#/ajustes'); } catch (_) {}
  const {error} = await sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: here()}});
  if (error) throw new Error(error.message);       // si todo va bien, el navegador se va a Google
}

export async function signOut() {
  const sb = await cloud();
  const {error} = await sb.auth.signOut();
  if (error) throw new Error(error.message);
}

/* Usuario actual o null (lee la sesión guardada; no necesita red si ya existe) */
export async function currentUser() {
  const sb = await cloud();
  const {data, error} = await sb.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session ? data.session.user : null;
}

/* Al volver de Google la URL trae ?code=… : el cliente lo canjea por la sesión.
   Devuelve true si se estaba completando un inicio de sesión. */
export async function finishLogin() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  const err = q.get('error_description') || q.get('error');
  const sb = await cloud();                         // detectSessionInUrl canjea el código
  if (!err) await sb.auth.getSession();             // espera a que termine el canje
  history.replaceState(null, '', here() + (location.hash || ''));   // limpia ?code= de la barra
  if (err) throw new Error(err);
  return true;
}
