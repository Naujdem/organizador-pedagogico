/* ============================================================
   app.js · Organizador Pedagógico
   Arranque: abre la base, siembra datos iniciales, registra el service worker
   y enruta por hash (#/banco, #/planeacion…). Cada vista exporta:
     render(root)  → dibuja la vista
     fab?          → {label, onClick} acción del botón flotante «＋»
   ============================================================ */
import * as db from './db.js';
import {seedIfEmpty} from './store.js';
import {$, $$, toast} from './ui.js';

const ROUTES = {
  inicio:     () => import('./views/inicio.js'),
  banco:      () => import('./views/banco.js'),
  planeacion: () => import('./views/planeacion.js'),
  estructura: () => import('./views/estructura.js'),
  ajustes:    () => import('./views/ajustes.js'),
  /* Módulos siguientes (aún sin construir) */
  guias:      () => import('./views/pronto.js').then(m => m.make('Generador de guías', 'Módulo 2: convierte recursos en guías PDF listas para fotocopiar.')),
  lab:        () => import('./views/pronto.js').then(m => m.make('Bitácora de laboratorio', 'Módulo 3: protocolos y registro de prácticas con fotos.')),
  notas:      () => import('./views/pronto.js').then(m => m.make('Notas con OCR', 'Módulo 4: digitaliza planillas manuscritas y expórtalas a Excel.')),
};

const view = $('#view'), fab = $('#fab');
let current = 0;

async function go() {
  const name = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'inicio';
  const key = ROUTES[name] ? name : 'inicio';
  const token = ++current;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === key));
  view.innerHTML = '<p class="hint">Cargando…</p>';
  try {
    const mod = await ROUTES[key]();
    if (token !== current) return;           // el usuario ya navegó a otra vista
    view.innerHTML = '';
    await mod.render(view);
    fab.hidden = !mod.fab;
    fab.onclick = mod.fab ? mod.fab.onClick : null;
    if (mod.fab) fab.setAttribute('aria-label', mod.fab.label);
    view.focus({preventScroll: true});
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty">No se pudo abrir esta sección.<br><small>${String(e.message || e)}</small></div>`;
  }
}

function netUI() {
  const n = $('#net');
  n.classList.toggle('off', !navigator.onLine);
  n.title = navigator.onLine ? 'Con conexión' : 'Sin conexión: todo se guarda en este dispositivo';
}

async function boot() {
  await db.open();
  await seedIfEmpty();
  addEventListener('hashchange', go);
  addEventListener('online', netUI); addEventListener('offline', netUI);
  netUI();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  /* ¿Volvemos de Google? Canjea el código y regresa a la pantalla donde estabas */
  if (/[?&](code|error)=/.test(location.search)) {
    try {
      const {finishLogin} = await import('./cloud.js');
      if (await finishLogin()) {
        let back = '#/ajustes'; try { back = sessionStorage.getItem('op_return') || back; sessionStorage.removeItem('op_return'); } catch (_) {}
        location.hash = back;
        toast('Sesión iniciada');
      }
    } catch (e) { toast('No se pudo iniciar sesión: ' + (e.message || e), 7000); }
  }
  go();
}
boot();
