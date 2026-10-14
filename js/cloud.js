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
