/* Inicio: buscador, las clases de hoy (si hay) y tus bibliotecas. Al escribir, el buscador muestra documentos de todas las bibliotecas. */
import * as db from '../db.js';
import {nameMap, TYPE_LABEL, librariesList, libraryCounts, libraryIdOf, filterResources, CLASES_ID} from '../store.js';
import {esc, listAttrs} from '../ui.js';
import {libraryDialog} from './biblioteca.js';
import {showDetail} from './banco.js';

export const todayStr = () => new Date().toLocaleDateString('en-CA');   // AAAA-MM-DD en hora local

const docs = n => `${n} documento${n === 1 ? '' : 's'}`;
/* «Mis clases» abre la estructura académica; las demás abren su biblioteca */
const hrefOf = l => l.kind === 'clases' ? '#/estructura' : `#/biblioteca/${encodeURIComponent(l.id)}`;

let query = '';   // lo escrito en el buscador (se conserva al abrir un documento y volver)

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

  const todayHtml = items.length ? `
    <h3>Hoy · ${esc(new Date().toLocaleDateString('es-CO', {weekday: 'long', day: 'numeric', month: 'long'}))}</h3>
    ${items.map(({p, s}) => `
      <div class="card session${s.done ? ' done' : ''}">
        <b>${esc(subjects[p.subjectId]?.name || 'Materia')} · ${esc(grades[p.gradeId]?.name || '')}</b>
        <div>${esc(s.objective || 'Sin objetivo')}</div>
        <div class="m hint">${(s.resourceIds || []).map(id => resources[id] && !resources[id].deletedAt
          ? `<span class="badge">${TYPE_LABEL[resources[id].type]?.icon || ''} ${esc(resources[id].title)}</span>` : '').join('')}</div>
      </div>`).join('')}` : '';

  root.innerHTML = `
    <h2>Inicio</h2>
    <div class="search"><input id="hq" type="search" placeholder="Buscar en todos mis documentos…" value="${esc(query)}" aria-label="Buscar en todos mis documentos"></div>
    <div id="results"></div>
    <div id="home">
    ${todayHtml}
    <h3>Bibliotecas</h3>
    <div class="libs">
      ${libs.map(l => `<a class="lib" href="${hrefOf(l)}" style="--c:${esc(l.color || '#0284c7')}">
        <span class="ico" aria-hidden="true">${l.icon || '📁'}</span>
        <b>${esc(l.name)}</b>
        <span class="n">${docs(counts[l.id] || 0)}</span></a>`).join('')}
      <button class="lib new" id="newlib"><span aria-hidden="true">＋</span>Nueva biblioteca</button>
    </div>
    </div>`;

  /* Buscador: mientras haya texto, los resultados reemplazan a las bibliotecas */
  async function drawResults() {
    const q = query.trim();
    root.querySelector('#home').hidden = !!q;
    const box = root.querySelector('#results');
    if (!q) { box.innerHTML = ''; return; }
    const rows = await filterResources({text: q});
    box.innerHTML = `<div class="count">${docs(rows.length)}</div>` + (rows.length
      ? `<div ${listAttrs()}>${rows.map(r => {
          const t = TYPE_LABEL[r.type] || TYPE_LABEL.otro;
          const lid = libraryIdOf(r), lib = libMap[lid];
          const where = lid === CLASES_ID ? (lib?.name || 'Mis clases') : [lib?.name, folders[r.folderId]?.name].filter(Boolean).join(' · ');
          return `<div class="row"><button class="body" data-open="${r.id}">
            <div class="t"><span class="ic">${t.icon}</span> ${esc(r.title)}</div>
            <div class="m"><span class="badge">${t.label}</span>${esc(where)}</div>
          </button></div>`;
        }).join('')}</div>`
      : '<div class="empty">Ningún documento coincide.</div>');
  }
  let timer;
  root.querySelector('#hq').oninput = e => { query = e.target.value; clearTimeout(timer); timer = setTimeout(drawResults, 150); };
  await drawResults();

  root.onclick = async e => {
    if (e.target.closest('#newlib')) return libraryDialog({onSaved: () => render(root)});
    const o = e.target.closest('[data-open]');
    if (o) showDetail(await db.get('resources', o.dataset.open), () => render(root));
  };
}
