/* ============================================================
   dedupe.js · Fusiona grados y materias repetidos
   Pasa cuando dos dispositivos siembran sus propios datos iniciales.
   Gana el más antiguo (todos los dispositivos eligen el mismo, así convergen);
   los recursos, unidades, planeaciones y cursos se re-apuntan y el repetido
   se marca como borrado.
   ============================================================ */
import * as db from './db.js';
import {norm} from './store.js';

/* [almacén que referencia, campo, ¿es arreglo?] */
const REFS = {
  grades: [['units', 'gradeId'], ['plannings', 'gradeId'], ['courses', 'gradeId'], ['resources', 'gradeIds', true]],
  subjects: [['units', 'subjectId'], ['plannings', 'subjectId'], ['resources', 'subjectId']],
};

export async function mergeDuplicates() {
  let merged = 0;
  for (const store of ['grades', 'subjects']) {
    const live = (await db.live(store)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
    const groups = new Map();
    for (const r of live) {
      const k = norm(r.name).trim();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const keep = g[0], dups = g.slice(1), dupIds = new Set(dups.map(d => d.id));
      for (const [refStore, field, isArray] of REFS[store]) {
        for (const rec of await db.live(refStore)) {
          if (isArray) {
            const arr = rec[field] || [];
            if (arr.some(i => dupIds.has(i)))
              await db.update(refStore, rec, {[field]: [...new Set(arr.map(i => dupIds.has(i) ? keep.id : i))]});
          } else if (dupIds.has(rec[field])) await db.update(refStore, rec, {[field]: keep.id});
        }
      }
      if (store === 'subjects') {                              // la materia conservada se ve en la unión de los grados
        const all = g.some(x => !x.gradeIds);
        const union = all ? undefined : [...new Set(g.flatMap(x => x.gradeIds))];
        if (all !== !keep.gradeIds || (union && union.length !== (keep.gradeIds || []).length))
          await db.update('subjects', keep, {gradeIds: union});
      }
      for (const d of dups) await db.remove(store, d);
      merged += dups.length;
    }
  }
  return merged;
}
