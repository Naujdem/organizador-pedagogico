/* ============================================================
   app.js · Organizador Pedagógico
   Arranque: abre la base, siembra datos iniciales, registra el service worker
   y enruta por hash (#/banco, #/planeacion…). Cada vista exporta:
     render(root)  → dibuja la vista
     fab?          → {label, onClick} acción del botón flotante «＋»
   ============================================================ */
import * as db from './db.js';
import {seedIfEmpty, seedLibraries} from './store.js';
import {$, $$, toast} from './ui.js';

const ROUTES = {
  inicio:     () => import('./views/inicio.js'),
  biblioteca: () => import('./views/biblioteca.js'),      // #/biblioteca/<id>: una biblioteca libre
  banco:      () => import('./views/banco.js'),            // «Buscar»
  planeacion: () => import('./views/planeacion.js'),
  estructura: () => import('./views/estructura.js'),
  ajustes:    () => import('./views/ajustes.js'),
  /* Módulos siguientes (aún sin construir; por ahora fuera del menú, se activan cuando existan) */
  guias:      () => import('./views/pronto.js').then(m => m.make('Generador de guías', 'Módulo 2: convierte recursos en guías PDF listas para fotocopiar.')),
  lab:        () => import('./views/pronto.js').then(m => m.make('Bitácora de laboratorio', 'Módulo 3: protocolos y registro de prácticas con fotos.')),
  notas:      () => import('./views/pronto.js').then(m => m.make('Notas con OCR', 'Módulo 4: digitaliza planillas manuscritas y expórtalas a Excel.')),
};

const view = $('#view'), fab = $('#fab');
let current = 0;
/* Pantallas que viven «dentro» de Inicio (bibliotecas y Mis clases) mantienen iluminado ese botón */
const NAV_OF = {estructura: 'inicio', biblioteca: 'inicio'};

async function go() {
  const name = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'inicio';
  const key = ROUTES[name] ? name : 'inicio';
  const token = ++current;
  view.onclick = null;                       // el clic de la pantalla anterior no debe seguir activo en la nueva
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (NAV_OF[key] || key)));
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
  await seedLibraries();
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
        dispatchEvent(new Event('op-auth'));
      }
    } catch (e) { toast('No se pudo iniciar sesión: ' + (e.message || e), 7000); }
  }
  import('./login.js').then(m => m.maybeShowLogin()).catch(() => {});   // pantalla de entrada si no hay sesión

  /* Sincronización en segundo plano (solo si hay sesión e internet) */
  const sync = () => import('./sync.js').then(m => m.syncNow()).catch(e => console.warn('sync:', e.message));
  let st; addEventListener('op-changed', () => { clearTimeout(st); st = setTimeout(sync, 3000); });
  addEventListener('online', sync);
  sync();
  /* Drive: si el permiso ya existe en tu cuenta, se conecta solo (al abrir, al volver la red y al iniciar sesión) */
  const driveLink = () => import('./drive.js').then(m => m.driveAutoLink()).catch(() => {});
  addEventListener('online', driveLink); addEventListener('op-auth', driveLink);
  driveLink();
  go();
}
boot();
