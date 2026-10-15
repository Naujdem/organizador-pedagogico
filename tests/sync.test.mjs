import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';

const root = new URL('../js/', import.meta.url).pathname;
const db = await import(root + 'db.js');
const st = await import(root + 'store.js');
const {syncWith} = await import(root + 'sync.js');

/* ---- Nube simulada: imita op_records, el upsert y el trigger de updated_at ---- */
function fakeCloud() {
  const rows = new Map(); let clock = 1000;
  const key = r => `${r.user_id}|${r.store}|${r.id}`;
  const iso = () => new Date(++clock * 1000).toISOString();
  return {
    rows,
    from() {
      return {
        upsert: async (list) => {
          const stamp = iso();                                  // un lote comparte hora, como now()
          for (const r of list) {
            const old = rows.get(key(r));
            if (old && r.updated_at < old.updated_at) continue; // trigger: ignora el dato más viejo
            rows.set(key(r), {...r, server_updated_at: stamp});
          }
          return {error: null};
        },
        select() {
          const b = {f: null, from: 0, to: 1e9};
          const q = {
            order: () => q, gte: (_, v) => { b.f = v; return q; },
            range: (a, z) => { b.from = a; b.to = z; return q; },
            then: (ok) => {
              let d = [...rows.values()].filter(r => !b.f || r.server_updated_at >= b.f)
                .sort((x, y) => x.server_updated_at.localeCompare(y.server_updated_at) || x.id.localeCompare(y.id));
              ok({data: d.slice(b.from, b.to + 1), error: null});
            },
          };
          return q;
        },
      };
    },
  };
}

await db.open();
await st.seedIfEmpty();
const cloud = fakeCloud();

/* 1) Primera sincronización: sube todo lo existente (6 grados + 4 materias) */
let r = await syncWith(cloud, 'user-A');
assert.equal(r.pushed, 10, 'sube la siembra inicial');
assert.equal(cloud.rows.size, 10);
assert.equal((await db.all('syncQueue')).length, 0, 'la cola queda vacía');

/* 2) Un cambio local se sube; se ve el borrado lógico */
const g = (await db.live('grades'))[0];
const g2 = await db.update('grades', g, {name: '6° A'});
const sub = (await db.live('subjects'))[0];
await db.remove('subjects', sub);
r = await syncWith(cloud, 'user-A');
assert.equal(r.pushed, 2);
const up = [...cloud.rows.values()].find(x => x.id === g.id);
assert.equal(up.data.name, '6° A');
const del = [...cloud.rows.values()].find(x => x.id === sub.id);
assert.ok(del.deleted_at, 'el borrado viaja como deleted_at');

/* 3) Otro dispositivo crea una unidad en la nube → se baja */
const rec = {id: '01ZZZZZZZZZZZZZZZZZZZZZZZZ', title: 'Unidad remota', subjectId: sub.id, gradeId: g.id, createdAt: 1, updatedAt: Date.now() + 5, deviceId: 'otro'};
cloud.rows.set(`user-A|units|${rec.id}`, {user_id: 'user-A', store: 'units', id: rec.id, data: rec, updated_at: rec.updatedAt, deleted_at: null, server_updated_at: new Date(9e9).toISOString()});
r = await syncWith(cloud, 'user-A');
assert.equal(r.pulled, 1);
assert.equal((await db.get('units', rec.id)).title, 'Unidad remota');
assert.equal((await db.all('syncQueue')).length, 0, 'lo bajado no vuelve a la cola');

/* 4) Gana el más reciente: la nube tiene un dato más viejo que el local → no lo pisa */
const local = await db.update('units', await db.get('units', rec.id), {title: 'Editada aquí'});
const stale = {...rec, title: 'Vieja', updatedAt: rec.updatedAt - 1000};
cloud.rows.set(`user-A|units|${rec.id}`, {user_id: 'user-A', store: 'units', id: rec.id, data: stale, updated_at: stale.updatedAt, deleted_at: null, server_updated_at: new Date(9.1e9).toISOString()});
await syncWith(cloud, 'user-A');
assert.equal((await db.get('units', rec.id)).title, 'Editada aquí', 'el local más nuevo se conserva');
assert.equal(cloud.rows.get(`user-A|units|${rec.id}`).data.title, 'Editada aquí', 'y se sube a la nube');

/* 5) Idempotente: sin cambios no sube nada */
r = await syncWith(cloud, 'user-A');
assert.equal(r.pushed, 0);

/* 6) Cambio de cuenta: se reinicia y vuelve a subir todo bajo el otro usuario */
r = await syncWith(cloud, 'user-B');
assert.ok(r.pushed >= 10, 'otra cuenta recibe una copia completa');
assert.ok([...cloud.rows.values()].every(x => x.store !== 'students'), 'estudiantes nunca viajan');


/* 7) Duplicados: otro dispositivo sembró sus propios «7°» y «Química» con IDs distintos */
const g7 = (await db.live('grades')).find(x => x.name === '7°');
const q = (await db.live('subjects')).find(x => x.name === 'Química');
const dupG = {id: '01DUPLICATEGRADE000000000', name: '7°', level: 'basica', order: 2, createdAt: Date.now() + 10, updatedAt: Date.now() + 10, deviceId: 'otro'};
const dupS = {id: '01DUPLICATESUBJECT0000000', name: 'Quimica', color: '#fff', createdAt: Date.now() + 10, updatedAt: Date.now() + 10, deviceId: 'otro'};
const res = {id: '01RESOURCEDEOTRO0000000000', title: 'Del otro', type: 'taller', subjectId: dupS.id, gradeIds: [dupG.id, g7.id], topicIds: [], tags: [], createdAt: 1, updatedAt: Date.now() + 20, deviceId: 'otro'};
let n = 0;
for (const [store, rec] of [['grades', dupG], ['subjects', dupS], ['resources', res]])
  cloud.rows.set(`user-A|${store}|${rec.id}`, {user_id: 'user-A', store, id: rec.id, data: rec, updated_at: rec.updatedAt, deleted_at: null, server_updated_at: new Date((9.5e9) + (n++) * 1000).toISOString()});
await syncWith(cloud, 'user-A');
assert.equal((await db.live('grades')).filter(x => x.name === '7°').length, 1, 'un solo 7°');
assert.equal((await db.live('subjects')).filter(x => /^quimica$/i.test(x.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).length, 1, 'una sola Química');
const fixed = await db.get('resources', res.id);
assert.equal(fixed.subjectId, q.id, 'el recurso apunta a la materia que se conserva');
assert.deepEqual(fixed.gradeIds, [g7.id], 'gradeIds sin repetidos');
assert.ok((await db.get('grades', dupG.id)).deletedAt, 'el repetido queda como borrado');
await syncWith(cloud, 'user-A');
assert.equal([...cloud.rows.values()].find(x => x.id === dupG.id).deleted_at > 0, true, 'el borrado del repetido viaja a la nube');

console.log('SYNC OK');
