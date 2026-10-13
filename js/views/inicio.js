/* Inicio: clases de hoy (desde Planeación) y accesos rápidos */
import * as db from '../db.js';
import {nameMap, TYPE_LABEL} from '../store.js';
import {esc} from '../ui.js';

export const todayStr = () => new Date().toLocaleDateString('en-CA');   // AAAA-MM-DD en hora local

export async function render(root) {
  const [plans, subjects, grades, resources] = await Promise.all([
    db.live('plannings'), nameMap('subjects'), nameMap('grades'), nameMap('resources'),
  ]);
  const today = todayStr();
  const items = [];
  for (const p of plans)
    for (const s of p.sessions || [])
      if (s.date === today) items.push({p, s});

  const nRes = Object.values(resources).filter(r => !r.deletedAt).length;

  root.innerHTML = `
    <h2>Hoy</h2>
    <p class="hint">${new Date().toLocaleDateString('es-CO', {weekday: 'long', day: 'numeric', month: 'long'})}</p>
    ${items.length ? items.map(({p, s}) => `
      <div class="card session${s.done ? ' done' : ''}">
        <b>${esc(subjects[p.subjectId]?.name || 'Materia')} · ${esc(grades[p.gradeId]?.name || '')}</b>
        <div>${esc(s.objective || 'Sin objetivo')}</div>
        <div class="m hint">${(s.resourceIds || []).map(id => resources[id] && !resources[id].deletedAt
          ? `<span class="badge">${TYPE_LABEL[resources[id].type]?.icon || ''} ${esc(resources[id].title)}</span>` : '').join('')}</div>
      </div>`).join('')
      : '<div class="empty">No tienes clases programadas para hoy.<br><a href="#/planeacion">Ir a Planeación</a></div>'}
    <h3>Accesos rápidos</h3>
    <div class="btns">
      <a href="#/banco"><button class="primary">🗂️ Recursos (${nRes})</button></a>
      <a href="#/planeacion"><button>📅 Planeación</button></a>
      <a href="#/estructura"><button>🧭 Estructura</button></a>
    </div>`;
}
