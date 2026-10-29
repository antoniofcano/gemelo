// Huella (SHA-256) de una receta: sus bytes canónicos (contratos/olivo-generado.md §2). Sin dependencias: Web Crypto (navegador, trabajador y Node ≥ 20).
const enc = new TextEncoder();
const ATRIB = ["position", "normal", "uv", "aHueco", "aMuerta"];

/** Los trozos canónicos de una receta, en orden: JSON de cada registro y cada array tipado con su cabecera «nombre:tipo:longitud» */
export function trozosCanonicos(r) {
  const t = [], T = s => t.push(enc.encode(s));
  const arr = (nombre, a) => { T(nombre + ":" + a.constructor.name + ":" + a.length + "\n"); t.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); };
  T(JSON.stringify({ v: r.v, entrada: r.entrada, escala: r.escala, corte: r.corte, cuenta: r.cuenta, piezas: r.piezas.length }) + "\n");
  arr("padre", r.padre);
  for (const p of r.piezas) {
    T(JSON.stringify({ clase: p.clase, mat: p.mat, geo: p.geo, sombra: p.sombra, prof: p.prof, pos: p.pos, rot: p.rot, esc: p.esc, n: p.n === undefined ? null : p.n }) + "\n");
    if (p.atrib) for (const k of ATRIB) if (p.atrib[k]) arr(k, p.atrib[k]);
    if (p.indice) arr("indice", p.indice);
    if (p.matrices) arr("matrices", p.matrices);
    if (p.colores) arr("colores", p.colores);
    if (p.nodo) arr("nodo", p.nodo);
  }
  return t;
}

/** SHA-256 en hexadecimal de la receta (asíncrono: Web Crypto) */
export async function huella(r) {
  return sha(trozosCanonicos(r));
}
async function sha(trozos) {
  const n = trozos.reduce((s, x) => s + x.length, 0), todo = new Uint8Array(n);
  let o = 0; for (const x of trozos) { todo.set(x, o); o += x.length; }
  const h = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", todo));
  return Array.from(h, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Huella ESTRUCTURAL: todo lo entero (cuántas piezas, cuántos vértices e instancias, índices, nodo, padre, cuenta) y los flotantes de los
 * metadatos redondeados a 1e-6, sin los arrays de flotantes. La huella exacta (huella) depende del motor de JavaScript en el último bit
 * (Math.sin/cos de V8 de Chrome 131 frente a Node 24: medido, ver ADR-0017); esta no, salvo que un último bit cambie una decisión.
 */
export async function huellaEstructura(r) {
  const red = x => Array.isArray(x) ? x.map(red) : typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x;
  const t = [enc.encode(JSON.stringify({ v: r.v, entrada: r.entrada, escala: red(r.escala), corte: red(r.corte), cuenta: r.cuenta }) + "\n")];
  const ent = a => { t.push(enc.encode(a.constructor.name + ":" + a.length + "\n"), new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); };
  ent(r.padre);
  for (const p of r.piezas) {
    t.push(enc.encode(JSON.stringify({ clase: p.clase, mat: p.mat, geo: p.geo, sombra: p.sombra, prof: p.prof, n: p.n === undefined ? null : p.n,
      vertices: p.atrib ? p.atrib.position.length / 3 : null, pos: red(p.pos) }) + "\n"));
    if (p.indice) ent(p.indice);
    if (p.nodo) ent(p.nodo);
  }
  return sha(t);
}

/** Mayor diferencia absoluta entre los flotantes de dos recetas con la misma estructura (Infinity si no la tienen) */
export function diferenciaMax(a, b) {
  if (a.piezas.length !== b.piezas.length) return Infinity;
  let d = 0;
  const cmp = (x, y) => { if (!x && !y) return; if (!x || !y || x.length !== y.length) { d = Infinity; return; } for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i])); };
  a.piezas.forEach((p, i) => { const q = b.piezas[i]; if (p.atrib) for (const k of ATRIB) cmp(p.atrib[k], q.atrib && q.atrib[k]); cmp(p.matrices, q.matrices); cmp(p.colores, q.colores); });
  return d;
}

/** Huella de los metadatos de niveles de detalle (rol y rejilla por pieza, brote por prisma de la madera fina): aparte de la olivo-2 */
export async function huellaNiveles(r) {
  const t = [enc.encode(JSON.stringify(r.piezas.map(p => [p.rol || null, p.rejilla || null])) + "\n")];
  r.piezas.forEach((p, i) => { if (p.brote) { t.push(enc.encode("brote:" + i + ":" + p.brote.length + "\n"), p.brote); } });
  return sha(t);
}
