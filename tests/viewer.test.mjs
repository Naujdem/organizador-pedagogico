/* Lector de .xlsx del visor: hojas, textos compartidos, números, fechas, booleanos y fórmulas */
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const {readXlsx} = await import('../js/xlsx-view.js');
const {isPresentation} = await import('../js/viewer.js').catch(() => ({}));   // viewer.js usa document/db: solo se prueba si carga

const z = new JSZip();
z.file('xl/workbook.xml', `<workbook xmlns="x" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
  <sheet name="Notas" sheetId="1" r:id="rId1"/><sheet name="Vacía" sheetId="2" r:id="rId2"/></sheets></workbook>`);
z.file('xl/_rels/workbook.xml.rels', `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`);
z.file('xl/sharedStrings.xml', `<sst><si><t>Nombre</t></si><si><r><t>Ana </t></r><r><t>María</t></r></si></sst>`);
z.file('xl/styles.xml', `<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
z.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Nota</t></is></c><c r="C1"><v>3</v></c></row>
  <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><f>2+2.5</f><v>4.5</v></c><c r="C3" s="1"><v>45000</v></c><c r="D3" t="b"><v>1</v></c></row>
</sheetData></worksheet>`);
z.file('xl/worksheets/sheet2.xml', `<worksheet><sheetData/></worksheet>`);

const sheets = await readXlsx(await z.generateAsync({type: 'arraybuffer'}), JSZip);
assert.equal(sheets.length, 2);
assert.deepEqual(sheets.map(s => s.name), ['Notas', 'Vacía']);
const r = sheets[0].rows;
assert.deepEqual(r[0], ['Nombre', 'Nota', '3']);
assert.deepEqual(r[1], [], 'las filas vacías intermedias se conservan');
assert.equal(r[2][0], 'Ana María', 'texto con formato mixto');
assert.equal(r[2][1], '4.5', 'resultado de la fórmula');
assert.equal(r[2][2], '15/03/2023', 'fecha (serie 45000)');
assert.equal(r[2][3], 'VERDADERO');
assert.equal(sheets[1].rows.length, 0);
if (isPresentation) { assert.ok(isPresentation('clase.PPTX') && isPresentation('a.ppt') && !isPresentation('a.pdf')); }
console.log('VISOR OK');
