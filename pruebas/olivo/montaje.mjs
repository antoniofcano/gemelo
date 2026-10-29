// Montar la MISMA receta con three 0.128.0 y con 0.186.1 da el mismo grupo: mismos triángulos y misma huella de lo montado (atributos,
// índices, matrices y colores de instancia, transformaciones y sombras). En cada nivel de detalle. Imprime JSON; sale con 1 si difieren.
// Lo usa pruebas/guardianes/olivo.test.js.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const imp = f => import(pathToFileURL(path.join(OLIVO, f)).href);
const T128 = await imp("node_modules/three-gen/build/three.module.js"), T186 = await imp("node_modules/three-r186/build/three.module.js");
const O = await imp("index.js");

function materialesDePrueba(THREE) {
  const M = {}; for (const n of O.MATERIALES) { M[n] = n === "puntos" ? new THREE.PointsMaterial({ vertexColors: true }) : /_sombra$/.test(n) ? new THREE.MeshDepthMaterial() : new THREE.MeshStandardMaterial(); M[n].name = n; }
  return M;
}
/** Huella de un grupo montado (independiente de la versión de three) */
export function huellaGrupo(g) {
  const h = crypto.createHash("sha256"), b = a => h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  h.update(JSON.stringify([g.scale.toArray(), g.userData.padre.length]) + "\n");
  for (const m of g.children) {
    h.update(JSON.stringify([m.isInstancedMesh ? "I" : m.isPoints ? "P" : "M", m.material.name, m.position.toArray(), m.quaternion.toArray(), m.scale.toArray(), m.castShadow, m.receiveShadow,
      m.customDepthMaterial ? m.customDepthMaterial.name : null, m.userData.rol || null, m.isInstancedMesh ? m.count : null]) + "\n");
    for (const k of Object.keys(m.geometry.attributes).sort()) { h.update(k + "\n"); b(m.geometry.attributes[k].array); }
    if (m.geometry.index) b(Uint32Array.from(m.geometry.index.array));
    if (m.isInstancedMesh) { b(m.instanceMatrix.array.subarray(0, m.count * 16)); if (m.instanceColor) b(m.instanceColor.array); }
  }
  return h.digest("hex");
}

const CASOS = [["centenario3", "envero", 7], ["planton", "madura", 1], ["adulto2", "verde", 3000000017]];
const filas = [], mal = [];
for (const [tipo, epoca, semilla] of CASOS) {
  const r = O.receta({ tipo, epoca, semilla });
  for (const k of O.NIVELES) {
    const rk = O.aNivel(r, k), fila = { tipo, epoca, semilla, nivel: k, receta: O.triangulosNivel(rk) };
    for (const [v, T] of [["0.128.0", T128], ["0.186.1", T186]]) {
      const g = O.montaOlivo(T, rk, materialesDePrueba(T));
      fila[v] = { revision: T.REVISION, triangulos: O.triangulosDe(g), llamadas: g.children.length, huella: huellaGrupo(g).slice(0, 16) };
    }
    if (fila["0.128.0"].huella !== fila["0.186.1"].huella || fila["0.128.0"].triangulos !== fila["0.186.1"].triangulos || fila["0.128.0"].triangulos !== fila.receta) mal.push(tipo + "/" + epoca + "/" + semilla + "/" + k);
    filas.push(fila);
  }
}
console.log(JSON.stringify({ filas, mal }));
process.exit(mal.length ? 1 : 0);
