/* ============================================================
   xlsx-view.js · Lector mínimo de .xlsx para el visor (solo lectura)
   readXlsx(arrayBuffer, JSZip) → [{name, rows: string[][], truncated}]
   Usa los valores guardados en el archivo (también el resultado de las fórmulas).
   No soporta el formato antiguo .xls ni macros; en esos casos el visor ofrece descargar.
   ============================================================ */
const MAX_ROWS = 2000, MAX_COLS = 60;
const parse = txt => new DOMParser().parseFromString(txt, 'application/xml');
const kids = (el, name) => [...el.getElementsByTagName(name)];
const colIndex = ref => [...ref.replace(/[0-9]/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const fmtDate = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export async function readXlsx(buf, JSZip) {
  const zip = await JSZip.loadAsync(buf);
  const text = async p => { const f = zip.file(p); return f ? f.async('string') : ''; };

  const sst = (await text('xl/sharedStrings.xml'))
    ? kids(parse(await text('xl/sharedStrings.xml')), 'si').map(si => kids(si, 't').map(t => t.textContent).join(''))
    : [];

  /* Formatos de fecha: ids integrados 14-22 y 45-47, o formatos propios con d/m/y */
  const dateFmt = new Set();
  const stylesXml = await text('xl/styles.xml');
  if (stylesXml) {
    const st = parse(stylesXml);
    const custom = {};
    kids(st, 'numFmt').forEach(n => { custom[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const xfs = st.getElementsByTagName('cellXfs')[0];
    if (xfs) [...xfs.children].forEach((xf, i) => {
      const id = xf.getAttribute('numFmtId');
      const n = Number(id);
      const code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
      if ((n >= 14 && n <= 22) || (n >= 45 && n <= 47) || (/[dmy]/i.test(code) && !/0|#/.test(code))) dateFmt.add(i);
    });
  }

  const wb = parse(await text('xl/workbook.xml'));
  const rels = parse(await text('xl/_rels/workbook.xml.rels'));
  const target = {};
  kids(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });

  const sheets = [];
  for (const s of kids(wb, 'sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : 'xl/' + path;
    const xml = await text(path);
    if (!xml) continue;
    const rows = [];
    let truncated = false;
    for (const row of kids(parse(xml), 'row')) {
      const rIdx = Number(row.getAttribute('r')) - 1;
      if (rIdx >= MAX_ROWS) { truncated = true; break; }
      const out = rows[rIdx] = [];
      for (const c of kids(row, 'c')) {
        const ci = colIndex(c.getAttribute('r') || '');
        if (ci < 0 || ci >= MAX_COLS) continue;
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let val = v;
        if (t === 's') val = sst[Number(v)] ?? '';
        else if (t === 'inlineStr') val = kids(c, 't').map(x => x.textContent).join('');
        else if (t === 'b') val = v === '1' ? 'VERDADERO' : 'FALSO';
        else if (t === 'e') val = v;
        else if (v !== '' && dateFmt.has(Number(c.getAttribute('s'))) && !isNaN(Number(v)))
          val = fmtDate(new Date(Math.round((Number(v) - 25569) * 86400000)));
        out[ci] = val;
      }
    }
    sheets.push({name: s.getAttribute('name') || 'Hoja', rows: Array.from(rows, r => r || []), truncated});
  }
  return sheets;
}
