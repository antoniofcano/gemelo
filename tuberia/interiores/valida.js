// Validador de mundos interiores (contratos/mundo-interior.md, ADR-0033, PLAN MU0-7; v1.2, luz aparte y máquinas: ADR-0034): dice si un glb y su manifiesto mundo.json
// pueden entrar en el gemelo y cuánto cuestan en cada perfil. No hace falta el motor: lo usa quien modela (eje B) para saber
// antes de entregar si su modelo cabe en el Quest.
//   node tuberia/interiores/valida.js <carpeta con mundo.json | ruta de mundo.json> [--json]
// Sale con 0 si pasa y con 1 si no. No usa la red. Reutiliza lo que el repo ya fija: ajv (esquema), gltf-validator (Khronos)
// y @gltf-transform (lectura del glb y tamaño de las imágenes); lo propio son solo las reglas del contrato.
"use strict";
const fs = require("fs"), path = require("path");
const Ajv2020 = require("ajv/dist/2020").default, validador = require("gltf-validator");
const { NodeIO, ImageUtils, getBounds } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");

const ESQ = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "contratos", "mundo-interior.schema.json"), "utf8"));
const PRES = ESQ.$defs.presupuesto.const;
const MB = 1024 * 1024, CAJA_MAX = 200;   // metros: un interior más grande que esto no es un interior (¿unidades?)
let compilado = null;
function esquema() { if (!compilado) compilado = new Ajv2020({ strict: true, allErrors: true }).compile(ESQ); return compilado; }

/** punto en polígono (par-impar), en planta [x, z] */
function dentro(p, anillo) {
  let s = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, zi] = anillo[i], [xj, zj] = anillo[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) s = !s;
  }
  return s;
}
function area(anillo) { let a = 0; for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) a += (anillo[j][0] + anillo[i][0]) * (anillo[j][1] - anillo[i][1]); return Math.abs(a) / 2; }
function cruzan(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function simple(anillo) {
  const n = anillo.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cruzan(anillo[i], anillo[(i + 1) % n], anillo[j], anillo[(j + 1) % n])) return false;
  }
  return true;
}

/** Lo que cuesta dibujar el glb: recorre la escena (un nodo con malla cuenta una vez por instancia en el árbol). */
function mide(doc) {
  const raiz = doc.getRoot(), escena = raiz.getDefaultScene() || raiz.listScenes()[0];
  const m = { triangulos: 0, llamadas: 0, materiales: raiz.listMaterials().length, texturas: 0, texturas_mb: 0, lado_max: 0, modos: new Set(), morph: 0 };
  if (escena) escena.traverse(n => {
    const malla = n.getMesh(); if (!malla) return;
    for (const pr of malla.listPrimitives()) {
      m.llamadas++; m.modos.add(pr.getMode());
      if (pr.listTargets().length) m.morph++;
      const ind = pr.getIndices(), pos = pr.getAttribute("POSITION"), k = ind ? ind.getCount() : pos ? pos.getCount() : 0;
      if (pr.getMode() === 4) m.triangulos += Math.floor(k / 3); else if (pr.getMode() === 5 || pr.getMode() === 6) m.triangulos += Math.max(0, k - 2);
    }
  });
  for (const t of raiz.listTextures()) {
    const img = t.getImage(), tam = img ? ImageUtils.getSize(img, t.getMimeType()) : null;
    m.texturas++;
    if (tam) { m.lado_max = Math.max(m.lado_max, tam[0], tam[1]); m.texturas_mb += tam[0] * tam[1] * 4 * 4 / 3 / MB; }   // RGBA8 con mipmaps
  }
  m.texturas_mb = Math.round(m.texturas_mb * 10) / 10;
  return m;
}

/**
 * v1.2: la luz aparte (luz.modo «mapa») y las máquinas (maquinas[]), contra el glb leído. Reglas en contratos/mundo-interior.md §1c y §1d.
 * Devuelve {maquinas, mapas} para las medidas.
 */
function luzYMaquinas(man, doc, errores, avisos) {
  const raiz = doc.getRoot(), maqs = Array.isArray(man.maquinas) ? man.maquinas : [];
  const luz = man.luz || { modo: "base" }, mapa = luz.modo === "mapa";
  const unlit = m => !!m.getExtension("KHR_materials_unlit");
  const uvLuz = m => { const i = m.getOcclusionTextureInfo(); return m.getOcclusionTexture() && i && i.getTexCoord() === 1; };
  // los nodos de las máquinas y lo que cuelga de ellos (lo que se mueve)
  const porNombre = new Map();
  for (const n of raiz.listNodes()) porNombre.set(n.getName(), (porNombre.get(n.getName()) || []).concat([n]));
  if (mapa && !(luz.escala > 0)) errores.push("luz «mapa» sin escala (lo que vale el blanco del mapa)");
  const PIDE = { giro: ["pivote", "eje"], vaiven: ["pivote", "eje", "recorrido"], traslacion: ["pivote", "eje", "recorrido"], textura: ["material", "uv"] };
  const deMaq = new Map(), ids = new Set();
  for (const q of maqs) {
    if (!q || !q.id) continue;
    ids.add(q.id);
    if (("velocidad" in q) === ("relacion" in q)) errores.push("la máquina «" + q.id + "» lleva velocidad o relación, una sola de las dos");
    const faltan = (PIDE[q.tipo] || []).filter(k => !(k in q));
    if (faltan.length) errores.push("la máquina «" + q.id + "» (" + q.tipo + ") pide " + faltan.join(", "));
    const ns = porNombre.get(q.nodo) || [];
    if (ns.length !== 1) { errores.push("la máquina «" + q.id + "» mueve el nodo «" + q.nodo + "», que " + (ns.length ? "está repetido en el glb" : "no está en el glb")); continue; }
    if (deMaq.has(ns[0])) errores.push("el nodo «" + q.nodo + "» lo mueven dos máquinas («" + deMaq.get(ns[0]).id + "» y «" + q.id + "»)");
    deMaq.set(ns[0], q);
  }
  const animados = new Set(raiz.listAnimations().flatMap(a => a.listChannels().map(c => c.getTargetNode())));
  for (const [n, q] of deMaq) {
    if (animados.has(n)) errores.push("la máquina «" + q.id + "»: su nodo también lo mueve una animación del glb (o clip o máquina, no los dos)");
    if (q.pivote) { const w = n.getWorldTranslation(); if (Math.hypot(w[0] - q.pivote[0], w[1] - q.pivote[1], w[2] - q.pivote[2]) > 0.01) errores.push("la máquina «" + q.id + "»: el pivote [" + q.pivote.join(", ") + "] no es el origen del nodo en el glb [" + w.map(v => Math.round(v * 1000) / 1000).join(", ") + "]"); }
    if (q.eje && Math.abs(Math.hypot(...q.eje) - 1) > 1e-3) errores.push("la máquina «" + q.id + "»: el eje no es unitario");
    if (q.uv && Math.abs(Math.hypot(...q.uv) - 1) > 1e-3) errores.push("la máquina «" + q.id + "»: la dirección uv no es unitaria");
    if (q.tipo === "textura") {
      const m = raiz.listMaterials().find(x => x.getName() === q.material);
      if (!m || !m.getBaseColorTexture()) errores.push("la máquina «" + q.id + "»: el material «" + q.material + "» " + (m ? "no tiene textura de color que correr" : "no está en el glb"));
    }
    if (q.luz === "propia" && !(q.sonda || luz.sonda)) errores.push("la máquina «" + q.id + "» lleva luz propia y no hay sonda (luz.sonda o la suya)");
  }
  // relaciones: a una máquina que existe y sin ciclos
  const rel = new Map(maqs.filter(q => q && q.relacion).map(q => [q.id, q.relacion.con]));
  for (const [id, con] of rel) {
    if (!ids.has(con)) { errores.push("la máquina «" + id + "» se relaciona con «" + con + "», que no existe"); continue; }
    const vistos = new Set([id]); let k = con;
    while (rel.has(k) && !vistos.has(k)) { vistos.add(k); k = rel.get(k); }
    if (vistos.has(k) && rel.has(k)) { errores.push("la máquina «" + id + "»: sus relaciones forman un ciclo"); }
  }
  // lo que se mueve: el nodo de una máquina y todo lo que cuelga de él
  const mueve = new Map();
  const baja = (n, q) => { mueve.set(n, q); for (const h of n.listChildren()) baja(h, deMaq.get(h) || q); };
  for (const [n, q] of deMaq) if (!mueve.has(n)) baja(n, q);
  let mapas = 0;
  const escena = raiz.getDefaultScene() || raiz.listScenes()[0];
  if (escena) escena.traverse(n => {
    const malla = n.getMesh(); if (!malla) return;
    const q = mueve.get(n);
    for (const pr of malla.listPrimitives()) {
      const m = pr.getMaterial(); if (!m) continue;
      if (uvLuz(m) && !pr.getAttribute("TEXCOORD_1")) errores.push("el material «" + m.getName() + "» lleva su mapa en texCoord 1 y una primitiva de «" + n.getName() + "» no tiene TEXCOORD_1");
      if (!mapa) continue;
      if (unlit(m)) {
        if (q && q.luz === "propia") errores.push("«" + n.getName() + "» es de la máquina «" + q.id + "», con luz propia: su material «" + m.getName() + "» no puede ser unlit");
        else if (!uvLuz(m) && m.getAlphaMode() === "OPAQUE") errores.push("luz «mapa»: el material «" + m.getName() + "» (opaco, unlit) no lleva su mapa de luz en occlusionTexture con texCoord 1");
      } else if (!(q && q.luz === "propia")) errores.push("luz «mapa»: el material «" + m.getName() + "» de «" + n.getName() + "» tiene luz (no es unlit) y no es de una máquina con luz propia");
    }
  });
  if (mapa) mapas = new Set(raiz.listMaterials().filter(uvLuz).map(m => m.getOcclusionTexture())).size;
  if (!mapa && raiz.listMaterials().some(m => unlit(m) && uvLuz(m))) avisos.push("hay materiales unlit con mapa en texCoord 1 pero luz.modo no es «mapa»: el motor no lo usará");
  return { maquinas: deMaq.size, mapas_luz: mapas };
}

/**
 * valida(manifiesto, bytes) → { ok, errores[], avisos[], medidas, perfiles }
 * manifiesto: el objeto de mundo.json; bytes: Uint8Array del glb.
 */
async function valida(manifiesto, bytes) {
  const errores = [], avisos = [];
  const esq = esquema();
  if (!esq(manifiesto)) for (const e of esq.errors) errores.push("mundo.json" + (e.instancePath || "") + ": " + e.message);
  const inf = await validador.validateBytes(bytes, { format: "glb", maxIssues: 50, externalResourceFunction: () => Promise.reject(new Error("recurso externo")) });
  const msgs = inf.issues.messages || [];
  msgs.filter(x => x.severity === 0).slice(0, 10).forEach(x => errores.push("gltf-validator: " + x.code + " " + (x.pointer || "") + " " + x.message));
  if (inf.issues.numWarnings) avisos.push("gltf-validator: " + inf.issues.numWarnings + " avisos (" + [...new Set(msgs.filter(x => x.severity === 1).map(x => x.code))].slice(0, 6).join(", ") + ")");
  const I = inf.info || {};
  const usadas = I.extensionsUsed || [];
  for (const e of usadas) if (!PRES.extensiones.includes(e)) errores.push("extensión no admitida en v1: " + e + (e === "KHR_lights_punctual" ? " (sin luces: la luz va horneada)" : /draco|meshopt|basisu|ktx|webp|avif/i.test(e) ? " (pediría un decodificador que el motor no carga)" : ""));
  let doc = null;
  try { doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes); }
  catch (e) { errores.push("el glb no se puede leer (¿no es autocontenido?): " + e.message); }
  let medidas = null; const perfiles = {};
  if (doc) {
    const raiz = doc.getRoot();
    if (raiz.listCameras().length) errores.push("sin cámaras: el glb trae " + raiz.listCameras().length);
    if (raiz.listSkins().length) errores.push("sin esqueletos en v1: el glb trae " + raiz.listSkins().length);
    medidas = mide(doc);
    if (medidas.morph) errores.push("sin morph targets en v1: " + medidas.morph + " primitivas los llevan");
    const malos = [...medidas.modos].filter(x => x !== 4);
    if (malos.length) errores.push("solo triángulos (modo 4): hay primitivas en modo " + malos.join(", "));
    for (const t of raiz.listTextures()) if (!PRES.imagenes.includes(t.getMimeType())) errores.push("imagen «" + (t.getName() || t.getURI()) + "» en " + t.getMimeType() + ": solo PNG o JPEG en v1");
    const anims = raiz.listAnimations();
    for (const a of anims) for (const c of a.listChannels()) if (!["translation", "rotation", "scale"].includes(c.getTargetPath())) errores.push("animación «" + a.getName() + "»: solo mueve nodos (translation, rotation, scale), no " + c.getTargetPath());
    const enGlb = anims.map(a => a.getName()).sort(), enMan = (manifiesto.animaciones || []).map(a => a.nombre).sort();
    if (JSON.stringify(enGlb) !== JSON.stringify(enMan)) errores.push("las animaciones del glb [" + enGlb.join(", ") + "] no son las del manifiesto [" + enMan.join(", ") + "]");
    medidas.animaciones = enGlb.length; medidas.modos = [...medidas.modos];
    Object.assign(medidas, luzYMaquinas(manifiesto, doc, errores, avisos));
    const escena = raiz.getDefaultScene() || raiz.listScenes()[0];
    if (escena) {
      const { min, max } = getBounds(escena);
      medidas.caja = { min: min.map(v => Math.round(v * 100) / 100), max: max.map(v => Math.round(v * 100) / 100) };
      for (let k = 0; k < 3; k++) if (max[k] - min[k] > CAJA_MAX) errores.push("el modelo mide " + (max[k] - min[k]).toFixed(0) + " m en " + "xyz"[k] + ": más de " + CAJA_MAX + " m (¿está en metros?)");
      if (min[1] < -0.5) avisos.push("hay geometría " + (-min[1]).toFixed(2) + " m por debajo del origen (el origen va en el suelo de la puerta principal)");
      const fuera = (p, holgura) => p[0] < min[0] - holgura || p[0] > max[0] + holgura || p[2] < min[2] - holgura || p[2] > max[2] + holgura;
      (manifiesto.puertas || []).forEach(pu => { if (fuera(pu.pos, 0.5)) errores.push("la puerta «" + pu.id + "» cae fuera del modelo"); });
      (manifiesto.puntos || []).forEach(pt => { if (fuera(pt.pos, 0.5)) errores.push("el punto «" + pt.id + "» cae fuera del modelo"); });
    } else errores.push("el glb no tiene escena");
    for (const [nom, tope] of Object.entries(PRES.perfiles)) {
      const excesos = [];
      for (const k of ["triangulos", "llamadas", "texturas_mb", "lado_max", "materiales"]) if (medidas[k] > tope[k]) excesos.push(k + " " + medidas[k] + " > " + tope[k]);
      perfiles[nom] = { cabe: !excesos.length, excesos };
    }
    if (!perfiles[PRES.objetivo].cabe) errores.push("no cabe en el perfil «" + PRES.objetivo + "»: " + perfiles[PRES.objetivo].excesos.join("; "));
  }
  // las reglas del manifiesto que el esquema no puede decir
  const zonas = Array.isArray(manifiesto.zonas) ? manifiesto.zonas : [], puertas = Array.isArray(manifiesto.puertas) ? manifiesto.puertas : [];
  const repes = (lista, campo, que) => { const v = lista.map(x => x && x[campo]); const r = v.filter((x, i) => v.indexOf(x) !== i); if (r.length) errores.push(que + " repetido: " + [...new Set(r)].join(", ")); };
  repes(manifiesto.maquinas || [], "id", "id de máquina");
  repes(zonas, "id", "id de zona"); repes(puertas, "id", "id de puerta"); repes(manifiesto.puntos || [], "id", "id de punto"); repes(manifiesto.animaciones || [], "nombre", "nombre de animación");
  for (const z of zonas) if (Array.isArray(z.anillo) && z.anillo.length >= 3) {
    if (!simple(z.anillo)) errores.push("la zona «" + z.id + "» se corta a sí misma");
    if (area(z.anillo) < 0.5) errores.push("la zona «" + z.id + "» tiene menos de 0,5 m²");
  }
  const pisa = p => zonas.find(z => Array.isArray(z.anillo) && dentro([p[0], p[2]], z.anillo) && Math.abs(z.y - p[1]) <= 0.1);
  puertas.forEach((pu, i) => {
    if (i === 0 && pu.pos && (Math.hypot(pu.pos[0], pu.pos[2]) > 0.05 || Math.abs(pu.pos[1]) > 0.05)) errores.push("la puerta principal («" + pu.id + "», la primera) va en el origen (0, 0, 0) y está en [" + pu.pos.join(", ") + "]");
    if (pu.llegada && pu.llegada.pos && !pisa(pu.llegada.pos)) errores.push("la llegada de la puerta «" + pu.id + "» no cae dentro de ninguna zona a su cota");
    if (pu.a === manifiesto.id) errores.push("la puerta «" + pu.id + "» lleva a su propio mundo");
  });
  if (!puertas.some(pu => pu.a === "exterior")) avisos.push("ninguna puerta lleva al exterior");
  return { ok: !errores.length, errores, avisos, medidas, perfiles };
}

function texto(nombre, r) {
  const l = [(r.ok ? "PASA" : "NO PASA") + " · " + nombre];
  if (r.medidas) {
    const m = r.medidas;
    l.push("  triángulos " + m.triangulos + " · llamadas " + m.llamadas + " · materiales " + m.materiales + " · texturas " + m.texturas + " (" + m.texturas_mb + " MB en GPU, lado máx. " + m.lado_max + " px) · animaciones " + m.animaciones + (m.maquinas ? " · máquinas " + m.maquinas : "") + (m.mapas_luz ? " · mapas de luz " + m.mapas_luz : ""));
    l.push("  perfiles: " + Object.entries(r.perfiles).map(([k, v]) => k + (v.cabe ? " cabe" : " NO cabe (" + v.excesos.join("; ") + ")")).join(" · "));
    l.push("  (topes de partida [SUPUESTO], sin medir en el Quest: contratos/mundo-interior.md)");
  }
  r.errores.forEach(e => l.push("  ✗ " + e)); r.avisos.forEach(a => l.push("  ! " + a));
  return l.join("\n");
}

async function principal(argv) {
  const arg = argv.find(a => !a.startsWith("--"));
  if (!arg) { console.error("uso: node tuberia/interiores/valida.js <carpeta | mundo.json> [--json]"); return 2; }
  const man = fs.statSync(arg).isDirectory() ? path.join(arg, "mundo.json") : arg;
  const m = JSON.parse(fs.readFileSync(man, "utf8"));
  const glb = path.join(path.dirname(man), String(m.glb || ""));
  if (!m.glb || !fs.existsSync(glb)) { console.error("no encuentro el glb del manifiesto: " + (m.glb || "(sin campo glb)")); return 1; }
  const r = await valida(m, new Uint8Array(fs.readFileSync(glb)));
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 1) : texto(path.basename(path.dirname(man)) + "/" + m.glb, r));
  return r.ok ? 0 : 1;
}

module.exports = { valida, mide, dentro, simple, area, luzYMaquinas, PRES };
if (require.main === module) principal(process.argv.slice(2)).then(c => { process.exitCode = c; }, e => { console.error(e); process.exitCode = 1; });
