// Comprueba los cuerpos que deja cuerpos.py (AV3 y AV4): que pasan la tubería v2 (licencia del meta, optimización, topes del fichero y del avatar completo:
// catalogo.mjs) y que @pixiv/three-vrm 3.5.5 con la three 0.186.1 del cliente los carga en Node (huesos obligatorios, blink y aa que mueven su morph, el brazo
// baja desde la T, cada pieza es un nodo con su nombre y se puede ocultar). Imprime la tabla (cuerpo solo y avatar completo) y la de las piezas.
//   node tuberia/avatares/creador/comprueba.mjs --origen <carpeta de cuerpos.py> [--salida pruebas/salida/avatares-cuerpos]
// Necesita `npm ci` en tuberia/avatares y en apps/web. Sale con 1 si algún cuerpo falla.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { construyeV2, TOPES_CUERPO, TOPES_COMBINACION } from "./catalogo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..", "..");
const NM = path.join(RAIZ, "apps", "web", "node_modules");
const OBLIGATORIOS = ["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
// Presupuesto del cuerpo solo (AVATARES-FAMILIA.md §13-14): deja sitio a pelo y ropa dentro de los 15.000 del avatar completo (TOPES_COMBINACION), sin texturas
// (el color va en el motor, decisión 128) y ≤ 4 materiales en el cuerpo (piel, ropa_base, ropa_abajo y ojos).
export const PRESUPUESTO_CUERPO = { triangulos: 12000, primitivas: 4, texturas: 0 };

async function cargaVRM(bytes) {
  const u = p => pathToFileURL(path.join(NM, p)).href;
  const THREE = await import(u("three/build/three.module.js")), { GLTFLoader } = await import(u("three/examples/jsm/loaders/GLTFLoader.js"));
  const V = await import(u("@pixiv/three-vrm/lib/three-vrm.module.js"));
  const l = new GLTFLoader(); l.register(p => new V.VRMLoaderPlugin(p));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const g = await l.parseAsync(ab, "");
  return { THREE, g, vrm: g.userData.vrm };
}

/** Lo que three-vrm ve de un cuerpo: [] si todo bien, o la lista de fallos */
async function compruebaEnThreeVRM(bytes, piezas) {
  const fallos = [], { THREE, g, vrm } = await cargaVRM(bytes);
  if (!vrm) return ["three-vrm no lo reconoce como VRM"];
  if (vrm.meta.metaVersion !== "1") fallos.push("meta de VRM " + vrm.meta.metaVersion + " (se espera 1.0)");
  for (const n of OBLIGATORIOS) if (!vrm.humanoid.getNormalizedBoneNode(n)) fallos.push("falta el hueso " + n);
  for (const e of ["blink", "aa"]) {
    if (!vrm.expressionManager || !vrm.expressionManager.getExpression(e)) { fallos.push("falta la expresión " + e); continue; }
    vrm.expressionManager.resetValues(); vrm.expressionManager.setValue(e, 1); vrm.update(1 / 60);
    let inf = 0; g.scene.traverse(o => { if (o.isMesh && o.morphTargetInfluences) inf = Math.max(inf, ...o.morphTargetInfluences); });
    if (inf < 0.99) fallos.push("la expresión " + e + " no mueve su morph");
  }
  // los brazos, abajo desde la T (como hace 26b): la mano baja de verdad
  vrm.expressionManager.resetValues();
  vrm.humanoid.getNormalizedBoneNode("leftUpperArm").rotation.set(0, 0, -1.25); vrm.update(1 / 60); g.scene.updateMatrixWorld(true);
  const mano = vrm.humanoid.getRawBoneNode("leftHand").getWorldPosition(new THREE.Vector3()), hombro = vrm.humanoid.getRawBoneNode("leftUpperArm").getWorldPosition(new THREE.Vector3());
  if (hombro.y - mano.y < 0.25) fallos.push("con el brazo abajo la mano no baja (" + (hombro.y - mano.y).toFixed(2) + " m): ¿el reposo no está en T?");
  // las piezas: un nodo con su nombre original (userData.name, como las busca 26b) y con mallas con piel (siguen al esqueleto)
  for (const p of piezas) {
    let nodo = null; g.scene.traverse(o => { if (o.userData && o.userData.name === p.malla) nodo = o; });
    if (!nodo) { fallos.push("no está la pieza " + p.malla); continue; }
    let conPiel = 0; nodo.traverse(o => { if (o.isSkinnedMesh) conPiel++; });
    if (!conPiel) fallos.push(p.malla + " no va pegada al esqueleto");
  }
  if (vrm.humanoid.getRawBoneNode("leftEye")) fallos.push("tiene huesos de ojos: el catálogo diría mirada «ninguna»");
  return fallos;
}

async function main() {
  const a = process.argv.slice(2), arg = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const origen = arg("--origen") || process.env.GEMELO_AVATARES_ORIGEN, salida = arg("--salida") || path.join(RAIZ, "pruebas", "salida", "avatares-cuerpos");
  if (!origen) throw new Error("falta --origen (la carpeta de cuerpos.py)");
  const r = await construyeV2({ origen, salida, log: m => console.error(m) });
  const lados = Object.fromEntries(fs.readdirSync(origen).filter(f => f.endsWith(".avatar.json")).map(f => { const j = JSON.parse(fs.readFileSync(path.join(origen, f), "utf8")); return [j.id, j]; }));
  const medidas = fs.existsSync(path.join(origen, "cuerpos.json")) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(origen, "cuerpos.json"), "utf8")).cuerpos.map(c => [c.id, c])) : {};
  let mal = r.rechazados.length;
  const filas = ["| Cuerpo | Edad | Complexión | ¿Se ofrece? | Altura | Cuerpo solo (tri / prim) | Avatar completo (tri / prim) | Materiales | Texturas | Fichero | Tras gzip | three-vrm |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const c of r.catalogo.cuerpos) {
    const bytes = fs.readFileSync(path.join(salida, c.fichero)), m = medidas[c.id] || {}, comb = r.combinaciones[c.id];
    const fallos = await compruebaEnThreeVRM(bytes, (lados[c.id] || {}).piezas || []);
    if (c.triangulos > PRESUPUESTO_CUERPO.triangulos) fallos.push(c.triangulos + " triángulos de cuerpo > " + PRESUPUESTO_CUERPO.triangulos);
    if (c.primitivas > PRESUPUESTO_CUERPO.primitivas) fallos.push(c.primitivas + " primitivas de cuerpo > " + PRESUPUESTO_CUERPO.primitivas);
    if (c.texturas > PRESUPUESTO_CUERPO.texturas) fallos.push(c.texturas + " texturas > " + PRESUPUESTO_CUERPO.texturas);
    if (fallos.length) mal++;
    filas.push("| " + [c.id, c.edad, c.complexion, c.ofrecer ? "sí" : "**no** (132)", m.altura_m ? m.altura_m.toFixed(2) + " m" : "?", c.triangulos.toLocaleString("es-ES") + " / " + c.primitivas,
      comb.triangulos.toLocaleString("es-ES") + " / " + comb.primitivas, c.materiales, c.texturas, (c.bytes / 1024).toFixed(0) + " kB", (zlib.gzipSync(bytes, { level: 6 }).length / 1024).toFixed(0) + " kB",
      fallos.length ? "FALLA: " + fallos.join("; ") : "carga"].join(" | ") + " |");
  }
  for (const x of r.rechazados) filas.push("| " + x.fichero + " | RECHAZADO: " + x.motivos.join("; ") + " |");
  const piezas = ["| Pieza | Tipo | Materiales | Triángulos (máx.) | Edades |", "|---|---|---|---|---|"].concat(r.catalogo.piezas.map(p => "| " + [p.id, p.tipo, p.materiales.join(", "), p.triangulos.toLocaleString("es-ES"), (p.edades || ["todas"]).join(", ")].join(" | ") + " |"));
  console.log("Topes del fichero: " + JSON.stringify(TOPES_CUERPO) + ". Avatar completo: " + JSON.stringify(TOPES_COMBINACION) + ". Cuerpo solo: " + JSON.stringify(PRESUPUESTO_CUERPO));
  console.log(filas.join("\n")); console.log(""); console.log(piezas.join("\n"));
  if (mal) { console.error("comprueba: " + mal + " cuerpo(s) con fallos"); process.exitCode = 1; }
}
main().catch(e => { console.error("comprueba: " + (e.stack || e.message)); process.exit(2); });
