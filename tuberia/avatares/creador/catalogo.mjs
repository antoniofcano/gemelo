// Catálogo v2 de los avatares por piezas (AV4, ADR-0025, contratos/avatares.md §9): de lo que deja cuerpos.py (<id>.vrm con sus piezas dentro y <id>.avatar.json con
// cuerpo y piezas) a <salida>/<id>.vrm (+ .br/.zst/.gz) y catalogo.json v2 con cuerpos, piezas y paletas. Cada cuerpo pasa la tubería de siempre (licencia del meta,
// optimización, topes del FICHERO: construye.mjs) y aquí se mide además lo que se DIBUJA de un avatar completo (cuerpo + la pieza más cara de cada tipo, contra
// topes_combinacion). Con --provisionales <carpeta>, los avatares cerrados de v1 (los CC0 de fuentes.json) van en avatares[].
//   node tuberia/avatares/creador/catalogo.mjs --origen <carpeta de cuerpos.py> --salida <carpeta fuera del repo> [--provisionales <carpeta de descarga.mjs>]
// Sale con 1 si rechaza algo (lo rechazado no se escribe). Las paletas son las del motor (Aspecto de 26_presencia.js) y las de la portada: lo vigila el guardián.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { construye, procesa, escribeVRM, fueraDelRepo, validaCatalogo } from "../construye.mjs";
import { creaIO, TOPES } from "../optimiza.mjs";

/** Los topes del fichero de un cuerpo: lleva todas sus piezas (≈ 18 k triángulos y 6 materiales), aunque se dibujen pocas; sin texturas (decisión 128) */
export const TOPES_CUERPO = Object.assign({}, TOPES, { triangulos_objetivo: 20000, triangulos_max: 24000, texturas_max: 1, materiales_max: 8 });
/** Lo que se dibuja de un avatar completo: lo que cuenta para el Quest (26b dibuja 3 a la vez; ADR-0020 §5 partía de 15.000 triángulos y ≤ 4 materiales por avatar) */
export const TOPES_COMBINACION = { triangulos: 15000, primitivas: 7 };   // 7 = cuerpo (piel, ojos y la ropa base: 4) + pelo + vello + sombrero; la ropa de faena (2) sustituye a la base (2)
/** Paletas (contratos/avatares.md §9): índice = tono / arriba / abajo / pelo_color de la receta. Iguales a Aspecto.PIELES/ROPA/PELO del motor y a las de la portada */
export const PALETAS = {
  piel: ["#f6dcc8", "#eec5a6", "#e0ac86", "#cf9670", "#b97d57", "#a06844", "#855436", "#6b412a", "#523020", "#3b2217"]
    .map((color, i) => ({ id: "tono-" + (i + 1), nombre: "Tono " + (i + 1) + (i === 0 ? ", el más claro" : i === 9 ? ", el más oscuro" : ""), color })),
  ropa: [["verde-olivo", "Verde olivo", "#6b7f3a"], ["aceituna-negra", "Aceituna negra", "#2f2a2a"], ["tierra", "Tierra", "#8a5a3b"], ["almagra", "Almagra", "#a8432f"],
    ["trigo", "Trigo", "#d8b65e"], ["cielo", "Cielo", "#6f9fc6"], ["adelfa", "Adelfa", "#d77a9a"], ["cal", "Cal", "#ece7dc"], ["pizarra", "Pizarra", "#4b5563"], ["lavanda", "Lavanda", "#8b7bb5"]]
    .map(([id, nombre, color]) => ({ id, nombre, color })),
  pelo: [["negro", "Negro", "#1f1a17"], ["castano-oscuro", "Castaño oscuro", "#3d2a1e"], ["castano", "Castaño", "#6a4a30"], ["castano-claro", "Castaño claro", "#8f6a45"],
    ["rubio", "Rubio", "#c9a465"], ["cobrizo", "Cobrizo", "#a5522c"], ["canoso", "Canoso", "#9a9690"], ["blanco", "Blanco", "#e6e3dc"]]
    .map(([id, nombre, color]) => ({ id, nombre, color }))
};
const EDADES = ["peque", "joven", "adulta", "mayor"];
/** Piezas que el guion genera pero que, vistas las capturas, no salen bien todavía: van dentro del VRM (no se dibujan) pero NO se ofrecen (no entran en el catálogo) */
export const RETENIDAS = { "vello-bigote": "AV4: 18-82 triángulos sobre el labio; en las capturas apenas se ve (a rehacer)" };
const ROPA_BASE = ["ropa_base", "ropa_abajo"];

/** Por nodo con malla: { nombre: { primitivas, triangulos, materiales: [nombres] } } (del VRM optimizado) */
export async function mallas(bytes) {
  const doc = await creaIO().readBinary(new Uint8Array(bytes)), out = {};
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const e = out[n.getName()] = { primitivas: 0, triangulos: 0, materiales: [], porMaterial: {} };
    for (const p of m.listPrimitives()) {
      const ix = p.getIndices(), t = (ix ? ix.getCount() : p.getAttribute("POSITION").getCount()) / 3, mat = p.getMaterial() ? p.getMaterial().getName() : "";
      e.primitivas++; e.triangulos += t; if (!e.materiales.includes(mat)) e.materiales.push(mat);
      e.porMaterial[mat] = (e.porMaterial[mat] || 0) + t;
    }
  }
  return out;
}

/** El avatar completo más caro de un cuerpo: cuerpo y ojos + la pieza más cara de cada tipo; si la ropa cubre la ropa base, esa parte del cuerpo no se dibuja */
export function peorCombinacion(nodos, piezas) {
  const cuerpo = nodos.cuerpo || { primitivas: 0, triangulos: 0, porMaterial: {} }, ojos = nodos.ojos || { primitivas: 0, triangulos: 0 };
  let tri = cuerpo.triangulos + ojos.triangulos, prim = cuerpo.primitivas + ojos.primitivas;
  for (const tipo of ["pelo", "vello", "ropa", "accesorio"]) {
    let peor = null;
    for (const p of piezas.filter(x => x.tipo === tipo)) {
      const n = nodos[p.malla]; if (!n) continue;
      let t = n.triangulos, q = n.primitivas;
      if (p.cubre_ropa_base) for (const m of ROPA_BASE) if (cuerpo.porMaterial[m]) { t -= cuerpo.porMaterial[m]; q -= 1; }
      if (!peor || t > peor.t) peor = { t, q, id: p.id };
    }
    if (peor) { tri += peor.t; prim += peor.q; }
  }
  return { triangulos: tri, primitivas: prim };
}

export async function construyeV2({ origen, salida, provisionales = null, compresion = "cuantizacion", log = () => {} }) {
  const o = fueraDelRepo(origen, "el origen"), s = fueraDelRepo(salida, "la salida");
  fs.mkdirSync(s, { recursive: true });
  const lados = fs.readdirSync(o).filter(f => f.endsWith(".avatar.json")).sort();
  const cuerpos = [], piezas = new Map(), rechazados = [], escritos = [], ids = new Set(), combinaciones = {};
  for (const l of lados) {
    const extra = JSON.parse(fs.readFileSync(path.join(o, l), "utf8")), base = l.slice(0, -".avatar.json".length), f = base + ".vrm";
    if (!extra.cuerpo || !Array.isArray(extra.piezas)) continue;   // no es un cuerpo del creador
    try {
      const r = await procesa(base, fs.readFileSync(path.join(o, f)), extra, { compresion, topes: TOPES_CUERPO, ids });
      if (r.motivos) { rechazados.push({ fichero: f, motivos: r.motivos }); log("RECHAZADO " + f + ": " + r.motivos.join("; ")); continue; }
      const nodos = await mallas(r.bytes), motivos = [];
      const ofrecidas = extra.piezas.filter(p => !RETENIDAS[p.id]);
      for (const p of ofrecidas) {
        const n = nodos[p.malla]; if (!n) { motivos.push("falta la malla " + p.malla + " en el VRM"); continue; }
        const prev = piezas.get(p.id), fila = { id: p.id, tipo: p.tipo, nombre: p.nombre, malla: p.malla, materiales: n.materiales, triangulos: n.triangulos };
        for (const k of ["cubre_ropa_base", "sombrero", "color"]) if (p[k] !== undefined) fila[k] = p[k];
        if (prev) { prev.triangulos = Math.max(prev.triangulos, fila.triangulos); prev.edades.add(extra.cuerpo.edad); }
        else piezas.set(p.id, Object.assign(fila, { edades: new Set([extra.cuerpo.edad]) }));
      }
      const peor = peorCombinacion(nodos, ofrecidas);
      if (peor.triangulos > TOPES_COMBINACION.triangulos) motivos.push("avatar completo de " + peor.triangulos + " triángulos > " + TOPES_COMBINACION.triangulos);
      if (peor.primitivas > TOPES_COMBINACION.primitivas) motivos.push("avatar completo de " + peor.primitivas + " primitivas > " + TOPES_COMBINACION.primitivas);
      if (motivos.length) { rechazados.push({ fichero: f, motivos }); log("RECHAZADO " + f + ": " + motivos.join("; ")); continue; }
      const e = r.entrada, solo = ["cuerpo", "ojos"].reduce((a, k) => ({ t: a.t + (nodos[k] ? nodos[k].triangulos : 0), p: a.p + (nodos[k] ? nodos[k].primitivas : 0) }), { t: 0, p: 0 });
      combinaciones[e.id] = peor;
      const fila = {
        id: e.id, nombre: e.nombre, ...(e.descripcion ? { descripcion: e.descripcion } : {}), edad: extra.cuerpo.edad, complexion: extra.cuerpo.complexion, ofrecer: extra.cuerpo.ofrecer === true,
        fichero: e.fichero, sha256: e.sha256, bytes: e.bytes, vrm_version: e.vrm_version, triangulos: solo.t, primitivas: solo.p, materiales: e.materiales, texturas: e.texturas,
        autor: e.autor, licencia: e.licencia, fuente: e.fuente, piezas: ofrecidas.map(p => p.id).sort(), mirada: ["huesos", "expresion"].includes(extra.mirada) ? extra.mirada : "ninguna"
      };
      ids.add(e.id); escribeVRM(s, e.id, r.bytes, escritos); cuerpos.push(fila);
      log("ok " + f + " → " + e.id + ".vrm  cuerpo " + solo.t + " tri; con todo, " + peor.triangulos + " tri y " + peor.primitivas + " primitivas; fichero " + e.triangulos + " tri, " + (e.bytes / 1024).toFixed(0) + " kB");
    } catch (err) { rechazados.push({ fichero: f, motivos: [err.message] }); log("RECHAZADO " + f + ": " + err.message); }
  }
  let avatares = [];
  if (provisionales) {
    const r = await construye({ origen: provisionales, salida: s, compresion, log });
    rechazados.push(...r.rechazados); escritos.push(...r.escritos.filter(x => x !== "catalogo.json")); avatares = r.catalogo.avatares;
  }
  cuerpos.sort((a, b) => (a.id < b.id ? -1 : 1));
  const listaPiezas = [...piezas.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map(p => {
    const { edades, ...resto } = p, ed = EDADES.filter(x => edades.has(x));
    return ed.length === EDADES.length ? resto : Object.assign(resto, { edades: ed });
  });
  const catalogo = { v: 2, compresion, topes: TOPES_CUERPO, topes_combinacion: TOPES_COMBINACION, paletas: PALETAS, cuerpos, piezas: listaPiezas, ...(avatares.length ? { avatares } : {}) };
  if (cuerpos.length) {
    const err = validaCatalogo(catalogo); if (err.length) throw new Error("el catálogo no cumple contratos/avatares.schema.json: " + err.join("; "));
    fs.writeFileSync(path.join(s, "catalogo.json"), JSON.stringify(catalogo, null, 2) + "\n"); escritos.push("catalogo.json");
  }
  return { catalogo, rechazados, escritos, combinaciones };
}

async function main() {
  const a = process.argv.slice(2), arg = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const origen = arg("--origen") || process.env.GEMELO_AVATARES_ORIGEN, salida = arg("--salida") || process.env.GEMELO_AVATARES;
  if (!origen || !salida) throw new Error("faltan --origen y --salida (carpetas fuera del repo)");
  const r = await construyeV2({ origen, salida, provisionales: arg("--provisionales") || null, compresion: arg("--compresion") || "cuantizacion", log: m => console.error(m) });
  console.log(JSON.stringify({ cuerpos: r.catalogo.cuerpos.map(c => c.id), piezas: r.catalogo.piezas.map(p => p.id), combinaciones: r.combinaciones, rechazados: r.rechazados }));
  if (r.rechazados.length) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error("catalogo: " + e.message); process.exit(2); });
