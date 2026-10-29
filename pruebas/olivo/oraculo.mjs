// Oráculo del constructor de olivos (ADR-0017): ejecuta el build() ORIGINAL de la referencia (el constructor de olivos-tipo de Antonio,
// referencia/olivos-tipo.html, que no se versiona) en Node con three 0.128.0 y sin DOM, y da su «receta» canónica y su SHA-256.
// Es la vara de medir del módulo apps/web/olivo/: misma entrada → mismos bytes.
//
//   node pruebas/olivo/oraculo.mjs                 escribe pruebas/olivo/huellas-olivo-2.json (7 tipos × 7 épocas × 5 semillas) y comprueba
//                                                  que la misma semilla da el mismo hash en 3 repeticiones
//   node pruebas/olivo/oraculo.mjs --comprueba     compara con el JSON ya escrito (no escribe)
//   GEMELO_REFERENCIA_OLIVOS=<html>                otra copia de la referencia (por defecto referencia/olivos-tipo.html en la raíz del repo)
//
// Del HTML se toman, por marcas de texto y no por número de línea: TIPOS…ESTADOS, olivaGeo, rellenoGeo, toconGeo/corteGeo, rngFrom y rama(),
// y build() hasta «scene.add(arbol)». Los materiales son de relleno (MeshStandardMaterial con nombre): la receta guarda qué material lleva cada
// pieza, no sus texturas. La interfaz (DOM, cámara, controles, texturas dibujadas) no se toca.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const THREE_GEN = path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen", "build", "three.module.js");
export const REFERENCIA = process.env.GEMELO_REFERENCIA_OLIVOS || path.join(RAIZ, "referencia", "olivos-tipo.html");
export const HUELLAS = path.join(RAIZ, "pruebas", "olivo", "huellas-olivo-2.json");
export const SEMILLAS = [1, 7, 1003, 65537, 4294967295];

/** Trozo de la referencia entre dos marcas (la inicial incluida; la final, según `incluyeFin`) */
function trozo(src, ini, fin, incluyeFin) {
  const a = src.indexOf(ini); if (a < 0) throw new Error("referencia: no encuentro «" + ini + "»");
  const b = src.indexOf(fin, a); if (b < 0) throw new Error("referencia: no encuentro «" + fin + "» tras «" + ini + "»");
  return src.slice(a, incluyeFin ? b + fin.length : b);
}
const linea = (src, ini) => trozo(src, ini, "\n", false);

/** El código de la referencia que hace falta para build(), con sus marcas */
export function extrae(src) {
  const partes = [
    trozo(src, "const TIPOS = {", "let estado=", false),
    trozo(src, "const olivaGeo=", "return g;})();", true),
    linea(src, "const rellenoGeo="),
    linea(src, "const toconGeo="),
    trozo(src, "function rngFrom(seed)", "let arbol=null;", false),
    trozo(src, "function build(){", "  scene.add(arbol);", true),
  ];
  return partes.join("\n");
}

export async function cargaOraculo(ruta = REFERENCIA) {
  if (!fs.existsSync(ruta)) throw new Error("no está la referencia " + ruta + " (no se versiona; ver ADR-0017)");
  if (!fs.existsSync(THREE_GEN)) throw new Error("falta three 0.128.0 (cd apps/web/olivo && npm i)");
  const THREE = await import(pathToFileURL(THREE_GEN).href);
  const src = fs.readFileSync(ruta, "utf8"), codigo = extrae(src);
  const prologo = `
    const window = {}; const scene = { add(){}, remove(){} };
    let estado = "envero", P = null, semilla = 7, arbol = null; const PODA_BASE = 0.2;
    const M = n => { const m = new THREE.MeshStandardMaterial(); m.name = n; return m; };
    const barkMat = M("corteza"), piesMat = M("pies"), musgoMat = M("musgo"), muertaMat = M("muerta"), raizMat = M("raiz"),
      corteMat = M("corte"), tutorMat = M("tutor"), olivaMat = M("oliva"), rellenoMat = M("relleno"), rellenoSombra = M("relleno_sombra"),
      ramitaMat = [M("ramita0"), M("ramita1")], ramitaSombra = [M("ramita0_sombra"), M("ramita1_sombra")];
  `;
  const epilogo = `
    return arbol; }
    return {
      TIPOS, ESTADOS, GEOS: { oliva: olivaGeo, relleno: rellenoGeo, tocon: toconGeo, corte: corteGeo },
      construye(tipo, epoca, s, parametros) { P = Object.assign({}, TIPOS[tipo], parametros || {}); estado = epoca; semilla = s;
        const a = build(); return { arbol: a, cuenta: window.__cuenta, corte: corteMat.color.toArray() }; }
    };`;
  const fabrica = new Function("THREE", prologo + codigo.replace(/\n {2}scene\.add\(arbol\);$/, "") + epilogo);
  const o = fabrica(THREE);
  o.THREE = THREE; o.codigo = codigo;
  o.huellaCodigo = crypto.createHash("sha256").update(codigo).digest("hex");
  return o;
}

// ---------- receta canónica (la misma forma que da apps/web/olivo/nucleo.js; ver contratos/olivo-generado.md §2)
const f32 = a => new Float32Array(a), u32 = a => Uint32Array.from(a), i32 = a => Int32Array.from(a);
export function recetaDe(o, construido, entrada) {
  const nombreGeo = new Map(Object.entries(o.GEOS).map(([k, g]) => [g, k]));
  const piezas = construido.arbol.children.map(m => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material, g = m.geometry;
    const p = { clase: m.isInstancedMesh ? "instancias" : "malla", mat: mat.name, geo: nombreGeo.get(g) || (/^ramita/.test(mat.name) ? "ramita" : "propia"),
      sombra: [!!m.castShadow, !!m.receiveShadow], prof: m.customDepthMaterial ? m.customDepthMaterial.name : null,
      pos: m.position.toArray(), rot: m.quaternion.toArray(), esc: m.scale.toArray() };
    if (p.geo === "propia") {
      p.atrib = {};
      for (const k of ["position", "normal", "uv", "aHueco", "aMuerta"]) if (g.attributes[k]) p.atrib[k] = f32(g.attributes[k].array);
      p.indice = u32(g.index.array);
    }
    if (m.isInstancedMesh) {
      p.n = m.count; p.matrices = f32(m.instanceMatrix.array.subarray(0, m.count * 16));
      p.colores = m.instanceColor ? f32(m.instanceColor.array.subarray(0, m.count * 3)) : null;
      p.nodo = m.userData.nodo ? i32(m.userData.nodo) : null;
    }
    return p;
  });
  const c = Object.assign({}, construido.cuenta); delete c.ms; delete c.marcas; delete c.ajuste; delete c.triangulos;
  return { v: "olivo-2", entrada, escala: construido.arbol.scale.toArray(), corte: construido.corte, cuenta: c,
    padre: i32(construido.arbol.userData.padre), piezas };
}

/** Bytes canónicos de una receta: JSON de cada registro + cada array tipado con su cabecera (nombre:tipo:longitud), little-endian */
export function* trozosCanonicos(r) {
  const T = s => Buffer.from(s, "utf8");
  const arr = (nombre, a) => { const tipo = a.constructor.name; return [T(nombre + ":" + tipo + ":" + a.length + "\n"), Buffer.from(a.buffer, a.byteOffset, a.byteLength)]; };
  yield T(JSON.stringify({ v: r.v, entrada: r.entrada, escala: r.escala, corte: r.corte, cuenta: r.cuenta, piezas: r.piezas.length }) + "\n");
  yield* arr("padre", r.padre);
  for (const p of r.piezas) {
    yield T(JSON.stringify({ clase: p.clase, mat: p.mat, geo: p.geo, sombra: p.sombra, prof: p.prof, pos: p.pos, rot: p.rot, esc: p.esc, n: p.n === undefined ? null : p.n }) + "\n");
    if (p.atrib) for (const k of ["position", "normal", "uv", "aHueco", "aMuerta"]) if (p.atrib[k]) yield* arr(k, p.atrib[k]);
    if (p.indice) yield* arr("indice", p.indice);
    if (p.matrices) yield* arr("matrices", p.matrices);
    if (p.colores) yield* arr("colores", p.colores);
    if (p.nodo) yield* arr("nodo", p.nodo);
  }
}
export function huella(r) { const h = crypto.createHash("sha256"); for (const t of trozosCanonicos(r)) h.update(t); return h.digest("hex"); }

/** Huella de las geometrías compartidas (oliva, relleno, tocón, corte y la tarjeta de ramita) */
export function huellaGeos(o) {
  const h = crypto.createHash("sha256"), T = o.THREE;
  const geos = Object.assign({}, o.GEOS, { ramita: new T.PlaneGeometry(0.3, 0.6).translate(0, 0.27, 0) });
  for (const k of Object.keys(geos).sort()) {
    const g = geos[k]; h.update(k + "\n");
    for (const a of ["position", "normal", "uv"]) if (g.attributes[a]) h.update(Buffer.from(f32(g.attributes[a].array).buffer));
    if (g.index) h.update(Buffer.from(u32(g.index.array).buffer));
  }
  return h.digest("hex");
}

export const triangulos = r => r.piezas.reduce((t, p) => t + (p.indice ? p.indice.length / 3 : ({ oliva: 20, relleno: 2, tocon: 14, corte: 9, ramita: 2 })[p.geo]) * (p.clase === "instancias" ? p.n : 1), 0);

async function principal() {
  const comprueba = process.argv.includes("--comprueba");
  const o = await cargaOraculo();
  const tipos = Object.keys(o.TIPOS), epocas = Object.keys(o.ESTADOS);
  // 1) determinismo: misma semilla → mismo hash en 3 repeticiones (cada tipo, dos épocas, con otras construcciones por medio)
  for (const tipo of tipos) for (const epoca of ["reposo", "madura"]) {
    const hs = [];
    for (let k = 0; k < 3; k++) { hs.push(huella(recetaDe(o, o.construye(tipo, epoca, 7), { tipo, epoca, semilla: 7 }))); o.construye(tipos[(k + 3) % tipos.length], "flor", 1003); }
    if (new Set(hs).size !== 1) throw new Error("no determinista: " + tipo + " " + epoca + " → " + hs.join(" "));
  }
  // 2) huellas de 7 × 7 × 5
  const casos = [], t0 = Date.now();
  for (const tipo of tipos) for (const epoca of epocas) for (const semilla of SEMILLAS) {
    const ti = performance.now(), r = recetaDe(o, o.construye(tipo, epoca, semilla), { tipo, epoca, semilla }), ms = performance.now() - ti;
    casos.push({ tipo, epoca, semilla, sha256: huella(r), triangulos: triangulos(r), ms: Math.round(ms) });
  }
  const salida = { gen_version: "olivo-2", generado_por: "pruebas/olivo/oraculo.mjs", three: "0.128.0", referencia_sha256: o.huellaCodigo, geos_sha256: huellaGeos(o),
    nota: "SHA-256 de la receta canónica (contratos/olivo-generado.md §2) del build() de la referencia; ms es orientativo (Node, sin DOM) y no entra en la comparación",
    casos };
  if (comprueba) {
    const prev = JSON.parse(fs.readFileSync(HUELLAS, "utf8"));
    const mal = casos.filter((c, i) => !prev.casos[i] || prev.casos[i].sha256 !== c.sha256).map(c => c.tipo + "/" + c.epoca + "/" + c.semilla);
    if (prev.referencia_sha256 !== salida.referencia_sha256) console.log("AVISO: la referencia ha cambiado (" + prev.referencia_sha256.slice(0, 12) + " → " + salida.referencia_sha256.slice(0, 12) + ")");
    console.log(mal.length ? "DIFIEREN " + mal.length + ": " + mal.slice(0, 10).join(", ") : "las " + casos.length + " huellas coinciden");
    process.exit(mal.length ? 1 : 0);
  }
  const cab = Object.assign({}, salida); delete cab.casos;
  fs.writeFileSync(HUELLAS, JSON.stringify(cab, null, 1).replace(/\n}$/, ',\n "casos": [\n') + casos.map(c => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n");
  console.log(casos.length + " huellas en " + path.relative(RAIZ, HUELLAS) + " (" + Math.round((Date.now() - t0) / 1000) + " s); determinismo en 3 repeticiones: sí");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal().catch(e => { console.error(e.stack || e); process.exit(1); });
