// Visor de prueba del prototipo F1d: carga un tileset 3D Tiles 1.1 con 3DTilesRendererJS y three moderno, en el marco LOCAL del gemelo.
// No es el motor (apps/web/motor/, three 0.128.0): sirve para medir la tubería (doc/sistema/TILES3D.md).
//   ?tileset=<url>   (por defecto ./tileset/tileset.json)
//   ?error=<px>      errorTarget de 3DTilesRendererJS (por defecto el suyo, 16)
//   ?escena=lejos|cerca
// Gancho de pruebas: window.__t3d = { tiles, renderer, scene, camera, pon(escena), listo(), mide(), instancias(n), alturaEn(x, y) }.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TilesRenderer } from "3d-tiles-renderer";

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xb8c8d8);
renderer.info.autoReset = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 20000);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x6b5a40, 1.6));
const sol = new THREE.DirectionalLight(0xfff2dd, 2.2); sol.position.set(-300, 500, 200); scene.add(sol);

const tiles = new TilesRenderer(q.get("tileset") || "./tileset/tileset.json");
if (q.get("error")) tiles.errorTarget = Number(q.get("error"));
tiles.setCamera(camera);
tiles.setResolutionFromRenderer(camera, renderer);
scene.add(tiles.group);

// Marco: la raíz lleva el transform LOCAL → ECEF; se deshace y se pasa de z arriba (3D Tiles) a y arriba (three).
// Resultado: la escena queda en el marco del motor de hoy, x = este, y = altura sobre z0, z = −norte (metros relativos a centro_utm).
let raiz = null;
tiles.addEventListener("load-root-tileset", e => {
  raiz = e.tileset;
  const T = new THREE.Matrix4().fromArray(raiz.root.transform || new THREE.Matrix4().elements);
  tiles.group.matrixAutoUpdate = false;
  tiles.group.matrix.copy(new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(T.invert()));
  tiles.group.updateMatrixWorld(true);
});
// cada modelo cargado sabe de qué tesela es (uri y extras.gemelo: cuadro, olivos, huella): así una instancia k se resuelve en CPU
tiles.addEventListener("load-model", e => { e.scene.userData.tesela = { uri: e.tile.content && e.tile.content.uri, gemelo: (e.tile.extras || {}).gemelo || null }; });
let errores = 0;
tiles.addEventListener("load-error", e => { errores++; console.error("tesela con fallo:", e.url, e.error && e.error.message); });

const controles = new OrbitControls(camera, renderer.domElement);
const ESCENAS = {                                       // las mismas que pruebas/guardianes/_navegador.js
  lejos: { az: -0.55, el: 0.62, dist: 600, ox: 0, oy: -130 },
  cerca: { az: -0.4, el: 0.5, dist: 45, ox: -130, oy: -125 },
};
function pon(nombre) {
  const e = ESCENAS[nombre] || ESCENAS.lejos, t = new THREE.Vector3(e.ox, 4, -e.oy);
  controles.target.copy(t);
  camera.position.set(t.x + e.dist * Math.cos(e.el) * Math.sin(e.az), t.y + e.dist * Math.sin(e.el), t.z + e.dist * Math.cos(e.el) * Math.cos(e.az));
  controles.update();
}
pon(q.get("escena") || "lejos");

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); tiles.setResolutionFromRenderer(camera, renderer);
});

let ultimo = { calls: 0, triangles: 0 };
function fotograma() {
  controles.update();
  camera.updateMatrixWorld();
  tiles.update();
  renderer.render(scene, camera);
  ultimo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
renderer.setAnimationLoop(fotograma);

const s = () => tiles.stats;
window.__t3d = {
  tiles, renderer, scene, camera, pon,
  /** ya cargó la raíz y no queda nada en cola, bajando ni procesando */
  listo: () => !!raiz && tiles.root && s().queued + s().downloading + s().parsing === 0 && tiles.loadProgress === 1,
  /** cifras del último fotograma (SwiftShader: llamadas, triángulos y memoria sí; fps NO) */
  mide: () => {
    fotograma();
    const vis = [...tiles.visibleTiles].map(t => t.content && t.content.uri).filter(Boolean).sort();
    return {
      llamadas: ultimo.calls, triangulos: ultimo.triangles, geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
      cacheMB: +(tiles.lruCache.cachedBytes / 1048576).toFixed(2), visibles: vis, cargadas: s().inCache, fallos: s().failed + errores,
    };
  },
  /** las primeras n instancias de olivo visibles: tesela (uri), k (_INDICE_COPA: posición en la lista de copas de la tesela), número local
   *  de tipo (_TIPO) y posición en la escena. El id del registro lo resuelve quien llama: lista de copas de la tesela + huella (TILES3D.md) */
  instancias: n => {
    const out = [];
    tiles.group.traverse(o => {
      if (!o.isInstancedMesh || !o.visible || out.length >= n) return;
      const ix = o.geometry.attributes._INDICE_COPA, ti = o.geometry.attributes._TIPO, m = new THREE.Matrix4(), p = new THREE.Vector3();
      let g = o; while (g && !g.userData.tesela) g = g.parent;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count && out.length < n; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m.premultiply(o.matrixWorld));
        out.push({ uri: g ? g.userData.tesela.uri : null, huella: g && g.userData.tesela.gemelo ? g.userData.tesela.gemelo.huella : null, k: ix ? ix.getX(i) : -1, tipo: ti ? ti.getX(i) : null, pos: p.toArray() });
      }
    });
    return out;
  },
  /** altura del terreno visible en (x, y) del marco local, por rayo vertical */
  alturaEn: (x, y) => {
    const r = new THREE.Raycaster(new THREE.Vector3(x, 5000, -y), new THREE.Vector3(0, -1, 0)), hits = [];
    tiles.group.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.visible) hits.push(...r.intersectObject(o, false)); });
    hits.sort((a, b) => a.distance - b.distance);
    return hits.length ? hits[0].point.y : null;
  },
};
