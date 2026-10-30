// Comprueba los cuerpos base que deja cuerpos.py (AV3): que pasan la tubería de siempre (licencia del meta, optimización, topes: construye.mjs) y que
// @pixiv/three-vrm 3.5.5 con la three 0.186.1 del cliente los carga en Node (huesos obligatorios, blink y aa que mueven su morph). Imprime la tabla.
//   node tuberia/avatares/creador/comprueba.mjs --origen <carpeta de cuerpos.py> [--salida pruebas/salida/avatares-cuerpos]
// Necesita `npm ci` en tuberia/avatares y en apps/web. Sale con 1 si algún cuerpo falla.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { construye } from "../construye.mjs";
import { TOPES } from "../optimiza.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..", "..");
const NM = path.join(RAIZ, "apps", "web", "node_modules");
const OBLIGATORIOS = ["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
// Presupuesto de un cuerpo base (AVATARES-FAMILIA.md §5 y §12): por debajo del objetivo de la tubería para dejar sitio a pelo y ropa (AV4),
// sin texturas (el color va en el motor, decisión 128) y ≤ 3 materiales (piel, ropa_base, ojos).
export const PRESUPUESTO_CUERPO = { triangulos: 12000, materiales: 3, texturas: 0 };

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
async function compruebaEnThreeVRM(bytes) {
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
  return fallos;
}

async function main() {
  const a = process.argv.slice(2), arg = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const origen = arg("--origen") || process.env.GEMELO_AVATARES_ORIGEN, salida = arg("--salida") || path.join(RAIZ, "pruebas", "salida", "avatares-cuerpos");
  if (!origen) throw new Error("falta --origen (la carpeta de cuerpos.py)");
  const r = await construye({ origen, salida, log: m => console.error(m) });
  const lados = Object.fromEntries(fs.readdirSync(origen).filter(f => f.endsWith(".avatar.json")).map(f => { const j = JSON.parse(fs.readFileSync(path.join(origen, f), "utf8")); return [j.id, j]; }));
  const medidas = fs.existsSync(path.join(origen, "cuerpos.json")) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(origen, "cuerpos.json"), "utf8")).cuerpos.map(c => [c.id, c])) : {};
  let mal = r.rechazados.length;
  const filas = ["| Cuerpo | Edad | Complexión | ¿Se ofrece? | Altura | Triángulos | Primitivas | Materiales | Texturas | Peso | Tras gzip | three-vrm |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const av of r.catalogo.avatares) {
    const bytes = fs.readFileSync(path.join(salida, av.fichero)), c = (lados[av.id] || {}).cuerpo || {}, m = medidas[av.id] || {};
    const fallos = await compruebaEnThreeVRM(bytes);
    if (av.triangulos > PRESUPUESTO_CUERPO.triangulos) fallos.push(av.triangulos + " triángulos > " + PRESUPUESTO_CUERPO.triangulos);
    if (av.materiales > PRESUPUESTO_CUERPO.materiales) fallos.push(av.materiales + " materiales > " + PRESUPUESTO_CUERPO.materiales);
    if (av.texturas > PRESUPUESTO_CUERPO.texturas) fallos.push(av.texturas + " texturas > " + PRESUPUESTO_CUERPO.texturas);
    if (fallos.length) mal++;
    filas.push("| " + [av.id, c.edad, c.complexion, c.ofrecer === false ? "**no** (132)" : "sí", m.altura_m ? m.altura_m.toFixed(2) + " m" : "?", av.triangulos.toLocaleString("es-ES"), av.primitivas, av.materiales, av.texturas,
      (av.bytes / 1024).toFixed(0) + " kB", (zlib.gzipSync(bytes, { level: 6 }).length / 1024).toFixed(0) + " kB", fallos.length ? "FALLA: " + fallos.join("; ") : "carga"].join(" | ") + " |");
  }
  for (const x of r.rechazados) filas.push("| " + x.fichero + " | RECHAZADO por la tubería: " + x.motivos.join("; ") + " |");
  console.log("Topes de la tubería: " + TOPES.triangulos_objetivo + "/" + TOPES.triangulos_max + " triángulos, " + TOPES.materiales_max + " materiales, " + TOPES.texturas_max + " texturas, " + (TOPES.bytes_max / 1048576) + " MB. Presupuesto de cuerpo: " + JSON.stringify(PRESUPUESTO_CUERPO));
  console.log(filas.join("\n"));
  if (mal) { console.error("comprueba: " + mal + " cuerpo(s) con fallos"); process.exitCode = 1; }
}
main().catch(e => { console.error("comprueba: " + (e.stack || e.message)); process.exit(2); });
