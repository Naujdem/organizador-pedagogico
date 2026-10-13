/* ULID mínimo: 10 caracteres de tiempo + 16 aleatorios (Crockford base32).
   Se ordena por fecha de creación y se genera sin conexión sin colisiones. */
const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now()) {
  let t = '', n = now;
  for (let i = 0; i < 10; i++) { t = ENC[n % 32] + t; n = Math.floor(n / 32); }
  const r = new Uint8Array(16);
  (globalThis.crypto || {getRandomValues: a => a.map(() => Math.random() * 256)}).getRandomValues(r);
  let rnd = '';
  for (let i = 0; i < 16; i++) rnd += ENC[r[i] % 32];
  return t + rnd;
}
