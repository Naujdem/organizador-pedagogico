/* ============================================================
   pdf-pages.js · Organizar páginas de un PDF
   organizePdf(recurso, blob): miniaturas de las páginas para quitar, mover
   y agregar páginas de otro PDF. Al guardar se elige: reemplazar el original
   o crear una copia nueva en la misma biblioteca.
   Librerías locales (vendor/), cargadas solo al abrir esta pantalla:
     · pdf.js  → dibuja las miniaturas
     · pdf-lib → arma el PDF nuevo
   ============================================================ */
import * as db from './db.js';
import {esc, modal, toast} from './ui.js';

const V = p => new URL('../vendor/' + p, import.meta.url).href;
let pdfjs, pdfLib;
async function libs() {
  if (!pdfjs) {
    pdfjs = await import(V('pdf.min.mjs'));
    pdfjs.GlobalWorkerOptions.workerSrc = V('pdf.worker.min.mjs');
  }
  if (!pdfLib) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = V('pdf-lib.min.js'); s.onload = ok; s.onerror = () => fail(new Error('No se pudo cargar pdf-lib'));
      document.head.append(s);
    });
    pdfLib = window.PDFLib;
  }
}

/* Dibuja la página n (1…) como imagen pequeña */
async function miniatura(doc, n, ancho = 150) {
  const page = await doc.getPage(n);
  const v1 = page.getViewport({scale: 1});
  const vp = page.getViewport({scale: ancho / v1.width});
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({canvas: c, canvasContext: c.getContext('2d'), viewport: vp}).promise;
  return c.toDataURL('image/jpeg', 0.7);
}

/* Lee un PDF: bytes para pdf-lib y documento de pdf.js para las miniaturas */
async function leerPdf(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({data: bytes.slice()}).promise;   // pdf.js se queda con su copia
  return {bytes, doc};
}

export async function organizePdf(r, blob) {
  await libs();
  const fuentes = [await leerPdf(blob)];           // 0 = el original; los que agregues van después
  /* Cada página: {f: índice de la fuente, n: número de página en esa fuente, img} */
  let paginas = Array.from({length: fuentes[0].doc.numPages}, (_, i) => ({f: 0, n: i + 1, img: ''}));

  const dlg = modal(`<div class="pp">
    <div class="viewer-bar"><b class="viewer-title">📄 Organizar páginas · ${esc(r.title)}</b>
      <span class="viewer-acts">
        <button type="button" id="pp-add">＋ Agregar de otro PDF</button>
        <button type="button" id="pp-x">Cancelar</button>
        <button type="button" id="pp-save" class="primary">Guardar</button></span></div>
    <p class="hint" id="pp-info"></p>
    <div class="pp-grid" id="pp-grid"></div>
    <input type="file" id="pp-file" accept="application/pdf,.pdf" hidden></div>`);
  dlg.classList.add('viewer-dlg');
  const $ = s => dlg.querySelector(s);
  let cambios = false;

  function dibujar() {
    $('#pp-info').textContent = `${paginas.length} página${paginas.length === 1 ? '' : 's'}. Usa ◀ ▶ para mover y 🗑 para quitar.`;
    $('#pp-grid').innerHTML = paginas.map((p, i) => `
      <figure class="pp-page${p.f ? ' nueva' : ''}">
        ${p.img ? `<img src="${p.img}" alt="Página ${i + 1}">` : '<div class="pp-cargando">…</div>'}
        <figcaption>
          <button type="button" data-a="izq" data-i="${i}" title="Mover antes" aria-label="Mover la página ${i + 1} antes"${i ? '' : ' disabled'}>◀</button>
          <b>${i + 1}</b>
          <button type="button" data-a="der" data-i="${i}" title="Mover después" aria-label="Mover la página ${i + 1} después"${i < paginas.length - 1 ? '' : ' disabled'}>▶</button>
          <button type="button" data-a="del" data-i="${i}" title="Quitar" aria-label="Quitar la página ${i + 1}">🗑</button>
        </figcaption></figure>`).join('');
  }
  /* Miniaturas una a una (así se ve algo enseguida aunque el PDF sea largo) */
  async function cargarMiniaturas() {
    for (const p of paginas) {
      if (p.img || !dlg.open) continue;
      p.img = await miniatura(fuentes[p.f].doc, p.n).catch(() => '');
      const i = paginas.indexOf(p);
      const fig = $('#pp-grid').children[i];
      if (fig && p.img) fig.querySelector('.pp-cargando, img').outerHTML = `<img src="${p.img}" alt="Página ${i + 1}">`;
    }
  }

  $('#pp-grid').onclick = e => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const i = Number(b.dataset.i), a = b.dataset.a;
    if (a === 'del') {
      if (paginas.length === 1) return toast('El PDF debe quedar con al menos una página.');
      paginas.splice(i, 1);
    } else {
      const j = a === 'izq' ? i - 1 : i + 1;
      [paginas[i], paginas[j]] = [paginas[j], paginas[i]];
    }
    cambios = true; dibujar();
  };

  /* ---- Agregar páginas de otro PDF: se eligen y se insertan donde digas ---- */
  $('#pp-add').onclick = () => $('#pp-file').click();
  $('#pp-file').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let otra;
    try { otra = await leerPdf(file); } catch (err) { return toast('No se pudo abrir ese PDF: ' + err.message, 5000); }
    const total = otra.doc.numPages;
    const sel = new Set(Array.from({length: total}, (_, i) => i + 1));
    const elige = modal(`<div class="pp">
      <h2>Páginas de «${esc(file.name)}»</h2>
      <p class="hint">Marca las que quieres agregar.</p>
      <div class="btns" style="justify-content:flex-start"><button type="button" id="e-all">Todas</button><button type="button" id="e-none">Ninguna</button></div>
      <div class="pp-grid" id="e-grid">${Array.from({length: total}, (_, i) => `
        <label class="pp-page pp-elige"><div class="pp-cargando">…</div>
          <span><input type="checkbox" value="${i + 1}" checked> ${i + 1}</span></label>`).join('')}</div>
      <label for="e-pos">¿Dónde ponerlas?</label>
      <select id="e-pos"><option value="${paginas.length}">Al final</option><option value="0">Al principio</option>
        ${paginas.slice(0, -1).map((_, i) => `<option value="${i + 1}">Después de la página ${i + 1}</option>`).join('')}</select>
      <div class="btns"><button type="button" id="e-x">Cancelar</button><button type="button" class="primary" id="e-ok">Agregar</button></div></div>`);
    elige.classList.add('viewer-dlg');
    const q = s => elige.querySelector(s);
    const marcar = v => q('#e-grid').querySelectorAll('input').forEach(c => { c.checked = v; v ? sel.add(+c.value) : sel.delete(+c.value); });
    q('#e-all').onclick = () => marcar(true);
    q('#e-none').onclick = () => marcar(false);
    q('#e-grid').onchange = ev => { ev.target.checked ? sel.add(+ev.target.value) : sel.delete(+ev.target.value); };
    q('#e-x').onclick = () => elige.close();
    const imgs = {};
    q('#e-ok').onclick = () => {
      if (!sel.size) return toast('Marca al menos una página.');
      fuentes.push(otra);
      const f = fuentes.length - 1;
      const nuevas = [...sel].sort((a, b) => a - b).map(n => ({f, n, img: imgs[n] || ''}));
      paginas.splice(Number(q('#e-pos').value), 0, ...nuevas);
      elige.close(); cambios = true; dibujar(); cargarMiniaturas();
      toast(`${nuevas.length} página${nuevas.length === 1 ? '' : 's'} agregada${nuevas.length === 1 ? '' : 's'}`);
    };
    for (let n = 1; n <= total && elige.open; n++) {
      imgs[n] = await miniatura(otra.doc, n).catch(() => '');
      const box = q('#e-grid')?.children[n - 1]?.querySelector('.pp-cargando');
      if (box && imgs[n]) box.outerHTML = `<img src="${imgs[n]}" alt="Página ${n}">`;
    }
  };

  /* ---- Guardar: reemplazar o copia nueva ---- */
  $('#pp-x').onclick = () => dlg.close();
  $('#pp-save').onclick = () => {
    if (!cambios) return toast('No hay cambios para guardar.');
    const pregunta = modal(`<form method="dialog">
      <h2>¿Cómo quieres guardarlo?</h2>
      <p class="hint">«Reemplazar» cambia este PDF. «Copia nueva» deja el original como está y crea otro documento al lado.</p>
      <div class="btns" style="flex-wrap:wrap">
        <button value="no">Cancelar</button>
        <button value="copia">Guardar como copia nueva</button>
        <button value="reemplazar" class="primary">Reemplazar el original</button></div></form>`);
    pregunta.addEventListener('close', () => {
      if (pregunta.returnValue === 'copia' || pregunta.returnValue === 'reemplazar') guardar(pregunta.returnValue);
    });
  };

  async function guardar(modo) {
    const btn = $('#pp-save'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const {PDFDocument} = pdfLib;
      const out = await PDFDocument.create();
      const cargados = await Promise.all(fuentes.map(f => PDFDocument.load(f.bytes, {ignoreEncryption: true})));
      for (const p of paginas) {
        const [pg] = await out.copyPages(cargados[p.f], [p.n - 1]);
        out.addPage(pg);
      }
      const pdf = new Blob([await out.save()], {type: 'application/pdf'});
      const s = r.source;
      if (modo === 'reemplazar') {
        await db.put('blobs', {id: s.blobId, blob: pdf, mimeType: pdf.type, size: pdf.size, createdAt: Date.now()});
        await db.update('resources', r, {source: {...s, size: pdf.size}});
        toast(s.kind === 'drive' ? 'PDF reemplazado en este dispositivo (la copia de Drive no cambia).' : 'PDF reemplazado', 5000);
      } else {
        const title = r.title + ' (editado)';
        const name = (s.name || r.title).replace(/\.pdf$/i, '') + ' (editado).pdf';
        const {id, createdAt, updatedAt, deviceId, ...rest} = r;
        await db.create('resources', {...rest, title, syncState: 'local-only',
          source: {kind: 'local', blobId: await db.saveBlob(pdf), mimeType: pdf.type, size: pdf.size, name}});
        toast('Copia creada: «' + title + '»');
      }
      dlg.close();
      dispatchEvent(new HashChangeEvent('hashchange'));   // refresca la lista
    } catch (err) {
      console.error(err);
      toast('No se pudo guardar: ' + err.message, 6000);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }

  dibujar();
  cargarMiniaturas();
}
