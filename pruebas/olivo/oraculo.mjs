// Oráculo del constructor de olivos (ADR-0017): ejecuta el código ORIGINAL de Antonio en Node con three 0.128.0 y sin DOM, y da su
// «receta» canónica y su SHA-256. Es la vara de medir del módulo apps/web/olivo/: misma entrada → mismos bytes.
// Hay dos referencias (ninguna se versiona; viven en referencia/ en la raíz del repo):
//   - referencia/olivos-en-el-gemelo.html — la maqueta «Olivos en el gemelo»: su MOTOR (el constructor sin interfaz, con userData.rol por
//     malla y la madera fina en dos mallas, «ramas» y «brotes»). ES LA FUENTE de las huellas.
//   - referencia/olivos-tipo.html — el constructor «Olivos tipo» (olivo-2) con su interfaz: su build(). Se comprueba que el MOTOR da el MISMO
//     árbol: todas las piezas iguales byte a byte salvo la madera fina, que en build() va en una sola malla y en el MOTOR en dos con los mismos
//     prismas (mismo multiconjunto de prismas: posiciones, normales y uv).
//
//   node pruebas/olivo/oraculo.mjs                 escribe pruebas/olivo/huellas-olivo-2.json (7 tipos × 7 épocas × 5 semillas), comprueba
//                                                  que la misma semilla da el mismo hash en 3 repeticiones y la equivalencia MOTOR = build()
//   node pruebas/olivo/oraculo.mjs --comprueba     compara con el JSON ya escrito (no escribe)
//   GEMELO_REFERENCIA_OLIVOS, GEMELO_REFERENCIA_MAQUETA   otras copias de las dos referencias
//
// Del HTML se toman, por marcas de texto y no por número de línea: TIPOS…ESTADOS, olivaGeo, rellenoGeo, toconGeo/corteGeo, rngFrom y rama(),
// y build() (más generar() en el MOTOR). Los materiales son de relleno (MeshStandardMaterial con nombre): la receta guarda qué material lleva
// cada pieza, no sus texturas. La interfaz (DOM, cámara, controles, texturas dibujadas) no se ejecuta.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const THREE_GEN = path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen", "build", "three.module.js");
export const REFERENCIA = process.env.GEMELO_REFERENCIA_OLIVOS || path.join(RAIZ, "referencia", "olivos-tipo.html");
export const MAQUETA = process.env.GEMELO_REFERENCIA_MAQUETA || path.join(RAIZ, "referencia", "olivos-en-el-gemelo.html");
export const HUELLAS = path.join(RAIZ, "pruebas", "olivo", "huellas-olivo-2.json");
export const SEMILLAS = [1, 7, 1003, 65537, 4294967295];
export const SEMILLAS_ALTAS = [2147483648, 3000000017];   // ≥ 2^31: el rango de los ids provisionales (semillaDeCopa sin copas_id)

/** Trozo de la referencia entre dos marcas (la inicial incluida; la final, según `incluyeFin`) */
function trozo(src, ini, fin, incluyeFin) {
  const a = src.indexOf(ini); if (a < 0) throw new Error("referencia: no encuentro «" + ini + "»");
  const b = src.indexOf(fin, a); if (b < 0) throw new Error("referencia: no encuentro «" + fin + "» tras «" + ini + "»");
  return src.slice(a, incluyeFin ? b + fin.length : b);
}
const linea = (src, ini) => trozo(src, ini, "\n", false);

/** El código que hace falta para build(): `cual` = "tipo" (olivos-tipo.html) o "motor" (el MOTOR de olivos-en-el-gemelo.html) */
export function extrae(src, cual) {
  if (cual === "motor") src = trozo(src, "const MOTOR=(function(){", "return {generar,", false);
  const partes = [
    trozo(src, "const TIPOS = {", "let estado=", false),
    trozo(src, "const olivaGeo=", "return g;})();", true),
    linea(src, "const rellenoGeo="),
    linea(src, "const toconGeo="),
    trozo(src, "function rngFrom(seed)", "let arbol=null;", false),
    cual === "motor" ? trozo(src, "function build(OPC){", "  return {arbol, escala:", false) : trozo(src, "function build(){", "  scene.add(arbol);", false),
  ];
  return partes.join("\n");
}

async function carga(ruta, cual) {
  if (!fs.existsSync(ruta)) throw new Error("no está la referencia " + ruta + " (no se versiona; ver ADR-0017)");
  if (!fs.existsSync(THREE_GEN)) throw new Error("falta three 0.128.0 (cd apps/web/olivo && npm i)");
  const THREE = await import(pathToFileURL(THREE_GEN).href);
  const src = fs.readFileSync(ruta, "utf8"), codigo = extrae(src, cual);
  const prologo = `
    const window = {}; const scene = { add(){}, remove(){} };
    let estado = "envero", P = null, semilla = 7, arbol = null; const PODA_BASE = 0.2;
    const M = n => { const m = new THREE.MeshStandardMaterial(); m.name = n; return m; };
    const barkMat = M("corteza"), piesMat = M("pies"), musgoMat = M("musgo"), muertaMat = M("muerta"), raizMat = M("raiz"),
      corteMat = M("corte"), tutorMat = M("tutor"), olivaMat = M("oliva"), rellenoMat = M("relleno"), rellenoSombra = M("relleno_sombra"),
      ramitaMat = [M("ramita0"), M("ramita1")], ramitaSombra = [M("ramita0_sombra"), M("ramita1_sombra")];
  `;
  // el MOTOR: generar(params, epoca, sem) hace P = TIPOS[params.tipo] + params y semilla = sem>>>0 || 1 (así lo copia el epílogo)
  const construye = cual === "motor"
    ? `construye(tipo, epoca, s, parametros) { const params = Object.assign({ tipo }, parametros || {}); P = Object.assign({}, TIPOS[params.tipo || "centenario3"], params);
         estado = epoca; semilla = s >>> 0 || 1; const a = build({}); return { arbol: a, cuenta: window.__cuenta, corte: corteMat.color.toArray() }; }`
    : `construye(tipo, epoca, s, parametros) { P = Object.assign({}, TIPOS[tipo], parametros || {}); estado = epoca; semilla = s;
         const a = build(); return { arbol: a, cuenta: window.__cuenta, corte: corteMat.color.toArray() }; }`;
  const epilogo = `
    return arbol; }
    return { TIPOS, ESTADOS, GEOS: { oliva: olivaGeo, relleno: rellenoGeo, tocon: toconGeo, corte: corteGeo }, ${construye} };`;
  const o = new Function("THREE", prologo + codigo + epilogo)(THREE);
  o.THREE = THREE; o.codigo = codigo; o.cual = cual;
  o.huellaCodigo = crypto.createHash("sha256").update(codigo).digest("hex");
  return o;
}
/** El oráculo de las huellas: el MOTOR de la maqueta */
export const cargaOraculo = (ruta = MAQUETA) => carga(ruta, "motor");
/** El build() de «Olivos tipo», para la equivalencia */
export const cargaConstructor = (ruta = REFERENCIA) => carga(ruta, "tipo");

// ---------- receta canónica (la misma forma que da apps/web/olivo/nucleo.js; ver contratos/olivo-generado.md §2)
const f32 = a => new Float32Array(a), u32 = a => Uint32Array.from(a), i32 = a => Int32Array.from(a);
export function recetaDe(o, construido, entrada) {
  const nombreGeo = new Map(Object.entries(o.GEOS).map(([k, g]) => [g, k]));
  const piezas = construido.arbol.children.map(m => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material, g = m.geometry;
    const p = { clase: m.isInstancedMesh ? "instancias" : "malla", mat: mat.name, geo: nombreGeo.get(g) || (/^ramita/.test(mat.name) ? "ramita" : "propia"),
      sombra: [!!m.castShadow, !!m.receiveShadow], prof: m.customDepthMaterial ? m.customDepthMaterial.name : null,
      pos: m.position.toArray(), rot: m.quaternion.toArray(), esc: m.scale.toArray(), rol: m.userData.rol || null, rejilla: g.userData.rejilla || null };
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

/**
 * ¿El MOTOR (b) da el mismo árbol que build() (a)? Todas las piezas iguales byte a byte (sin contar rol ni rejilla), salvo la madera fina:
 * la malla única de a frente a «ramas» + «brotes» de b, que deben tener los mismos prismas (12 vértices: posición, normal y uv) en cualquier orden.
 * Devuelve null si son el mismo árbol, o el motivo.
 */
export function equivalentes(a, b) {
  const bytesDe = (p, conRol) => { const q = Object.assign({}, p); if (!conRol) { q.rol = null; q.rejilla = null; } return Buffer.concat([...trozosCanonicos({ v: "", entrada: null, escala: null, corte: null, cuenta: null, padre: new Int32Array(0), piezas: [q] })]); };
  if (JSON.stringify([a.escala, a.corte, a.cuenta]) !== JSON.stringify([b.escala, b.corte, b.cuenta])) return "escala, corte o cuenta distintos";
  if (!Buffer.from(a.padre.buffer).equals(Buffer.from(b.padre.buffer))) return "padre distinto";
  const k = b.piezas.findIndex(p => p.rol === "ramas");
  if (k < 0 || !b.piezas[k + 1] || b.piezas[k + 1].rol !== "brotes" || b.piezas.length !== a.piezas.length + 1) return "no encuentro ramas + brotes";
  for (let i = 0; i < a.piezas.length; i++) {
    if (i === k) continue;
    const j = i < k ? i : i + 1;
    if (!bytesDe(a.piezas[i]).equals(bytesDe(b.piezas[j]))) return "pieza " + i + " (" + a.piezas[i].mat + ") distinta";
  }
  const prismas = (...ps) => {
    const l = [];
    for (const p of ps) { const nv = p.atrib.position.length / 3;
      if (nv % 12 || p.indice.length !== nv / 12 * 30) return null;
      for (let v = 0; v < nv; v += 12) l.push(Buffer.concat([Buffer.from(p.atrib.position.buffer, v * 12, 144), Buffer.from(p.atrib.normal.buffer, v * 12, 144), Buffer.from(p.atrib.uv.buffer, v * 8, 96)]).toString("base64")); }
    return l.sort();
  };
  const pa = prismas(a.piezas[k]), pb = prismas(b.piezas[k], b.piezas[k + 1]);
  if (!pa || !pb || pa.length !== pb.length || pa.some((x, i) => x !== pb[i])) return "la madera fina no tiene los mismos prismas";
  return null;
}

export const triangulos = r => r.piezas.reduce((t, p) => t + (p.indice ? p.indice.length / 3 : ({ oliva: 20, relleno: 2, tocon: 14, corte: 9, ramita: 2 })[p.geo]) * (p.clase === "instancias" ? p.n : 1), 0);

/**
 * Metadatos de niveles de detalle de una receta de build() (a), sacados del MOTOR (b), que es el mismo árbol: rol y rejilla por pieza y, en
 * la madera fina (una sola pieza en olivo-2), `brote` por prisma (1 = el prisma es de un brote de superficie, la malla «brotes» del MOTOR).
 * No entran en la huella olivo-2; tienen la suya (huellaNiveles).
 */
export function metadatosNiveles(a, b) {
  const k = b.piezas.findIndex(p => p.rol === "ramas");
  const prisma = (p, v) => Buffer.concat([Buffer.from(p.atrib.position.buffer, v * 12, 144), Buffer.from(p.atrib.normal.buffer, v * 12, 144), Buffer.from(p.atrib.uv.buffer, v * 8, 96)]).toString("base64");
  const deBrotes = new Map(), bp = b.piezas[k + 1];
  for (let v = 0; v < bp.atrib.position.length / 3; v += 12) { const q = prisma(bp, v); deBrotes.set(q, (deBrotes.get(q) || 0) + 1); }
  return a.piezas.map((p, i) => {
    const j = i < k ? i : i === k ? k : i + 1, q = b.piezas[j];
    const m = { rol: q.rol || null, rejilla: q.rejilla || null };
    if (i === k) {
      const n = p.atrib.position.length / 36; m.brote = new Uint8Array(n);
      for (let t = 0; t < n; t++) { const x = prisma(p, t * 12), c = deBrotes.get(x); if (c) { m.brote[t] = 1; deBrotes.set(x, c - 1); } }
    }
    return m;
  });
}
/** Huella de los metadatos de niveles (rol, rejilla y brote), aparte de la olivo-2 */
export function huellaNiveles(metas) {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(metas.map(m => [m.rol, m.rejilla])) + "\n");
  metas.forEach((m, i) => { if (m.brote) { h.update("brote:" + i + ":" + m.brote.length + "\n"); h.update(Buffer.from(m.brote.buffer, m.brote.byteOffset, m.brote.byteLength)); } });
  return h.digest("hex");
}

async function principal() {
  const comprueba = process.argv.includes("--comprueba");
  const o = await cargaConstructor(), om = await cargaOraculo();
  const tipos = Object.keys(o.TIPOS), epocas = Object.keys(o.ESTADOS);
  // 1) determinismo: misma semilla → mismo hash en 3 repeticiones (cada tipo, dos épocas, con otras construcciones por medio)
  for (const tipo of tipos) for (const epoca of ["reposo", "madura"]) {
    const hs = [];
    for (let k = 0; k < 3; k++) { hs.push(huella(recetaDe(o, o.construye(tipo, epoca, 7), { tipo, epoca, semilla: 7 }))); o.construye(tipos[(k + 3) % tipos.length], "flor", 1003); }
    if (new Set(hs).size !== 1) throw new Error("no determinista: " + tipo + " " + epoca + " → " + hs.join(" "));
  }
  // 2) huellas de 7 × 7 × 5, más las semillas altas (≥ 2^31, las de los ids provisionales) en dos épocas
  const lista = [];
  for (const tipo of tipos) for (const epoca of epocas) for (const semilla of SEMILLAS) lista.push({ tipo, epoca, semilla });
  for (const tipo of tipos) for (const epoca of ["reposo", "envero"]) for (const semilla of SEMILLAS_ALTAS) lista.push({ tipo, epoca, semilla, alta: true });
  const casos = [], t0 = Date.now();
  for (const { tipo, epoca, semilla, alta } of lista) {
    const ti = performance.now(), r = recetaDe(o, o.construye(tipo, epoca, semilla), { tipo, epoca, semilla }), ms = performance.now() - ti;
    const rm = recetaDe(om, om.construye(tipo, epoca, semilla), { tipo, epoca, semilla });
    const motivo = equivalentes(r, rm);
    if (motivo) throw new Error("el MOTOR de la maqueta y el build() de «Olivos tipo» NO dan el mismo árbol en " + tipo + "/" + epoca + "/" + semilla + ": " + motivo);
    const c = { tipo, epoca, semilla, sha256: huella(r), niveles_sha256: huellaNiveles(metadatosNiveles(r, rm)), triangulos: triangulos(r), ms: Math.round(ms) };
    if (alta) c.alta = true;
    casos.push(c);
  }
  const salida = { gen_version: "olivo-2", generado_por: "pruebas/olivo/oraculo.mjs", three: "0.128.0", constructor_sha256: o.huellaCodigo, maqueta_sha256: om.huellaCodigo, geos_sha256: huellaGeos(o),
    nota: "sha256: receta canónica olivo-2 (contratos/olivo-generado.md §2) del build() de «Olivos tipo»; niveles_sha256: rol, rejilla y brote por prisma sacados del MOTOR de «Olivos en el gemelo», que da el mismo árbol (comprobado en cada caso); ms es orientativo (Node, sin DOM) y no entra en la comparación",
    casos };
  if (comprueba) {
    const prev = JSON.parse(fs.readFileSync(HUELLAS, "utf8"));
    const mal = casos.filter((c, i) => !prev.casos[i] || prev.casos[i].sha256 !== c.sha256 || prev.casos[i].niveles_sha256 !== c.niveles_sha256).map(c => c.tipo + "/" + c.epoca + "/" + c.semilla);
    if (prev.constructor_sha256 !== salida.constructor_sha256) console.log("AVISO: la referencia ha cambiado (" + prev.constructor_sha256.slice(0, 12) + " → " + salida.constructor_sha256.slice(0, 12) + ")");
    console.log(mal.length ? "DIFIEREN " + mal.length + ": " + mal.slice(0, 10).join(", ") : "las " + casos.length + " huellas coinciden");
    process.exit(mal.length ? 1 : 0);
  }
  const cab = Object.assign({}, salida); delete cab.casos;
  fs.writeFileSync(HUELLAS, JSON.stringify(cab, null, 1).replace(/\n}$/, ',\n "casos": [\n') + casos.map(c => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n");
  console.log(casos.length + " huellas en " + path.relative(RAIZ, HUELLAS) + " (" + Math.round((Date.now() - t0) / 1000) + " s); determinismo en 3 repeticiones: sí; MOTOR = build() en los " + casos.length + " casos: sí");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal().catch(e => { console.error(e.stack || e); process.exit(1); });
