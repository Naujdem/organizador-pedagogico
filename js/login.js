/* ============================================================
   login.js · Pantalla de entrada (como SimulaPro)
   Correo + contraseña, «Continuar con Google» y «Regístrate».
   «Continuar sin cuenta» deja usar la app solo en este dispositivo
   (así nunca queda bloqueada sin internet).
   ============================================================ */
import {esc, toast} from './ui.js';

const GUEST = 'op_guest';
const get = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };

export const hasSession = () => {
  try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (_) { return false; }
};
export const forgetGuest = () => set(GUEST, null);

/* Se muestra al abrir la app solo si no hay sesión ni se eligió «sin cuenta» */
export function maybeShowLogin() {
  if (/[?&](code|error)=/.test(location.search)) return;   // volviendo de Google: se está canjeando la sesión
  if (hasSession() || get(GUEST)) return;
  showLogin();
}

export function showLogin() {
  document.getElementById('login')?.remove();
  const el = document.createElement('div');
  el.id = 'login'; el.className = 'login';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Iniciar sesión');
  let mode = 'in';   // 'in' = entrar · 'up' = registrarse

  const draw = (msg = '', ok = false) => {
    const up = mode === 'up';
    el.innerHTML = `<form class="login-card" novalidate>
      <h1 class="login-title">Organizador Pedagógico</h1>
      <p class="login-sub">${up ? 'Crea tu cuenta para guardar todo en la nube.' : 'Planea, organiza y guarda tus recursos.'}</p>
      <input id="l-mail" type="email" inputmode="email" autocomplete="email" placeholder="Correo" aria-label="Correo" required>
      <input id="l-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="Contraseña" aria-label="Contraseña" required>
      ${up ? '<input id="l-pass2" type="password" autocomplete="new-password" placeholder="Repite la contraseña" aria-label="Repite la contraseña" required>' : ''}
      <p class="login-msg${ok ? ' ok' : ''}" role="alert">${esc(msg)}</p>
      <button class="primary login-main" id="l-go">${up ? 'Crear cuenta' : 'Entrar'}</button>
      <button type="button" class="login-alt" id="l-google">Continuar con Google</button>
      <button type="button" class="ghost login-link" id="l-toggle">${up ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Regístrate'}</button>
      <button type="button" class="ghost login-link muted" id="l-guest">Continuar sin cuenta (solo en este dispositivo)</button>
    </form>`;
    const $ = s => el.querySelector(s);
    const busy = (b, on) => el.querySelectorAll('button').forEach(x => x.disabled = on);

    $('#l-toggle').onclick = () => { mode = up ? 'in' : 'up'; draw(); };
    $('#l-guest').onclick = () => { set(GUEST, '1'); el.remove(); };
    $('#l-google').onclick = async () => {
      busy(0, true);
      try { const {signInWithGoogle} = await import('./cloud.js'); await signInWithGoogle(); }
      catch (e) { busy(0, false); $('.login-msg').textContent = e.message || String(e); }
    };
    $('form').onsubmit = async e => {
      e.preventDefault();
      const email = $('#l-mail').value.trim(), pass = $('#l-pass').value;
      const fail = m => { $('.login-msg').className = 'login-msg'; $('.login-msg').textContent = m; };
      if (!email || !pass) return fail('Escribe tu correo y tu contraseña.');
      if (up && pass !== $('#l-pass2').value) return fail('Las contraseñas no coinciden.');
      busy(0, true); $('#l-go').textContent = up ? 'Creando…' : 'Entrando…';
      try {
        const cloud = await import('./cloud.js');
        if (up) {
          const {needsConfirm} = await cloud.signUpWithPassword(email, pass);
          if (needsConfirm) { mode = 'in'; return draw('Te enviamos un correo: confirma tu cuenta y luego entra.', true); }
        } else await cloud.signInWithPassword(email, pass);
        set(GUEST, null); el.remove(); toast('Sesión iniciada');
        import('./sync.js').then(m => m.syncNow()).catch(() => {});
        dispatchEvent(new Event('op-auth'));
      } catch (err) {
        busy(0, false); $('#l-go').textContent = up ? 'Crear cuenta' : 'Entrar'; fail(err.message || String(err));
      }
    };
    $('#l-mail').focus?.();
  };
  document.body.append(el);
  draw();
  return el;
}
