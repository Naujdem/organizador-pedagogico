/* Inicio: las clases de hoy (si hay), tus bibliotecas y lo reciente */
import * as db from '../db.js';
import {nameMap, TYPE_LABEL, librariesList, libraryCounts, libraryIdOf, CLASES_ID} from '../store.js';
import {esc} from '../ui.js';
import {libraryDialog} from './biblioteca.js';
import {showDetail} from './banco.js';

export const todayStr = () => new Date().toLocaleDateString('en-CA');   // AAAA-MM-DD en hora local

const docs = n => `${n} documento${n === 1 ? '' : 's'}`;
/* «Mis clases» abre la estructura académica; las demás abren su biblioteca */
const hrefOf = l => l.kind === 'clases' ? '#/estructura' : `#/biblioteca/${encodeURIComponent(l.id)}`;

export async function render(root) {
  const [plans, subjects, grades, resources, folders, libs, counts] = await Promise.all([
    db.live('plannings'), nameMap('subjects'), nameMap('grades'), nameMap('resources'), nameMap('folders'),
    librariesList(), libraryCounts(),
  ]);
  const libMap = Object.fromEntries(libs.map(l => [l.id, l]));
  const today = todayStr();
  const items = [];
  for (const p of plans)
    for (const s of p.sessions || [])
      if (s.date === today) items.push({p, s});

  const recent = Object.values(resources).filter(r => !r.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  const todayHtml = items.length ? `
    <h3>Hoy · ${esc(new Date().toLocaleDateString('es-CO', {weekday: 'long', day: 'numeric', month: 'long'}))}</h3>
    ${items.map(({p, s}) => `
      <div class="card session${s.done ? ' done' : ''}">
        <b>${esc(subjects[p.subjectId]?.name || 'Materia')} · ${esc(grades[p.gradeId]?.name || '')}</b>
        <div>${esc(s.objective || 'Sin objetivo')}</div>
        <div class="m hint">${(s.resourceIds || []).map(id => resources[id] && !resources[id].deletedAt
          ? `<span class="badge">${TYPE_LABEL[resources[id].type]?.icon || ''} ${esc(resources[id].title)}</span>` : '').join('')}</div>
      </div>`).join('')}` : '';

  const recentHtml = recent.length ? `
    <h3>Reciente</h3>
    <div class="list">${recent.map(r => {
      const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
      const lid = libraryIdOf(r), lib = libMap[lid];
      const where = [lib?.name, folders[r.folderId]?.name].filter(Boolean).join(' · ');
      return `<div class="row"><button class="body" data-open="${r.id}">
        <div class="t">${t.icon} ${esc(r.title)}</div>
        <div class="m"><span class="badge">${t.label}</span>${esc(lid === CLASES_ID ? (lib?.name || 'Mis clases') : where)}</div>
      </button></div>`;
    }).join('')}</div>` : '';

  root.innerHTML = `
    <h2>Inicio</h2>
    ${todayHtml}
    <h3>Bibliotecas</h3>
    <div class="libs">
      ${libs.map(l => `<a class="lib" href="${hrefOf(l)}" style="--c:${esc(l.color || '#0284c7')}">
        <span class="ico" aria-hidden="true">${l.icon || '📁'}</span>
        <b>${esc(l.name)}</b>
        <span class="n">${docs(counts[l.id] || 0)}</span></a>`).join('')}
      <button class="lib new" id="newlib"><span aria-hidden="true">＋</span>Nueva biblioteca</button>
    </div>
    ${recentHtml}`;

  root.onclick = async e => {
    if (e.target.closest('#newlib')) return libraryDialog({onSaved: () => render(root)});
    const o = e.target.closest('[data-open]');
    if (o) showDetail(await db.get('resources', o.dataset.open), () => render(root));
  };
}
