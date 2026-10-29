// Herramienta del constructor de olivos: un árbol del módulo con el encuadre, la luz y el suelo de la referencia «Olivos tipo», para
// compararlos a ojo y en capturas. Expone window.__olivo para las pruebas (pruebas/olivo/navegador.mjs). No es parte del gemelo.
import * as T128 from "three-gen";
import * as T186 from "three-r186";
import * as O from "../index.js";

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const THREE = q.get("three") === "186" ? T186 : T128;
$("three").value = q.get("three") === "186" ? "186" : "128";
Object.keys(O.TIPOS).forEach(k => $("tipo").add(new Option(O.TIPOS[k].nombre, k)));
Object.keys(O.ESTADOS).forEach(k => $("epoca").add(new Option(O.ESTADOS[k].n, k)));
$("tipo").value = q.get("tipo") || "centenario3"; $("epoca").value = q.get("epoca") || "envero";
$("semilla").value = q.get("semilla") || "7"; $("nivel").value = q.get("nivel") || "E0";

// escena como la de la referencia (luces, suelo, cámara y encuadre)
const visor = $("visor");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE === T186) { renderer.outputColorSpace = THREE.LinearSRGBColorSpace; THREE.ColorManagement.enabled = false; }   // como r128
visor.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = O.colorLineal(new THREE.Color(), 0xdfe4dc);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(9, 4.5, 10);
const objetivo = new THREE.Vector3();
const luz = (L, hex) => { O.colorLineal(L.color, hex); return L; };
const hemi = luz(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6), 0xeef2ea); O.colorLineal(hemi.groundColor, 0x6b5a44); scene.add(hemi);
const sol = luz(new THREE.DirectionalLight(0xffffff, 0.85), 0xfff1dc);
sol.position.set(7, 12, 5); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 }); sol.shadow.bias = -0.0006;
scene.add(sol);
if (THREE === T186) { hemi.intensity *= Math.PI; sol.intensity *= Math.PI; renderer.useLegacyLights = true; }   // r155+: luces físicas
const suelo = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ roughness: 1 }));
O.colorLineal(suelo.material.color, 0x9c7a58); suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; scene.add(suelo);

let materiales = null, epocaMat = null, arbol = null, fotos = null;
async function mats(epoca) {
  if (!fotos) { fotos = await O.cargaFotos("./"); $("avisos").textContent = fotos.avisos.join(" · "); }
  if (epocaMat !== epoca) { if (materiales) materiales.libera(); materiales = O.creaMateriales(THREE, fotos, { epoca }); epocaMat = epoca; }
  return materiales;
}
function encuadra(sz) {
  objetivo.set(0, sz.y * 0.45, 0);
  const d = Math.max(sz.y, Math.max(sz.x, sz.z)) * 1.9 + 1.5, dir = camera.position.clone().sub(objetivo).normalize();
  camera.position.copy(objetivo).add(dir.multiplyScalar(d)); camera.lookAt(objetivo);
}
function resize() {
  const w = visor.clientWidth, h = visor.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(() => { resize(); dibuja(); }).observe(visor);
const dibuja = () => renderer.render(scene, camera);

const entrada = () => ({ tipo: $("tipo").value, epoca: $("epoca").value, semilla: Number($("semilla").value) });
async function genera() {
  const e = entrada(), nivel = $("nivel").value, M = await mats(e.epoca), t0 = performance.now();
  const r = O.receta(e), rk = O.aNivel(r, nivel), ms = performance.now() - t0;
  if (arbol) { scene.remove(arbol); O.liberaOlivo(arbol); }
  arbol = O.montaOlivo(THREE, rk, M); scene.add(arbol);
  const m = r.medidas; encuadra(new THREE.Vector3(m.copa_m, m.altura_m, m.copa_m)); resize(); dibuja();
  $("ficha").textContent = m.altura_m.toFixed(1) + " m de alto · " + m.copa_m.toFixed(1) + " m de copa · " + m.pies + " pies · " + nivel + ": " +
    O.triangulosNivel(rk).toLocaleString("es-ES") + " triángulos, " + rk.piezas.length + " mallas · generado en " + Math.round(ms) + " ms";
  return { ms, triangulos: O.triangulosNivel(rk), llamadas: rk.piezas.length, huella: await O.huella(r) };
}
["tipo", "epoca", "semilla", "nivel"].forEach(id => $(id).addEventListener("change", () => genera()));
$("three").addEventListener("change", () => { q.set("three", $("three").value); location.search = q.toString(); });

// ---- para las pruebas
/** Mide el hilo principal mientras se generan `n` árboles: hueco máximo entre latidos (MessageChannel) = la tarea más larga */
function sonda() {
  const ch = new MessageChannel(); let ultimo = performance.now(), max = 0, vivo = true, latidos = 0;
  ch.port1.onmessage = () => { const t = performance.now(); max = Math.max(max, t - ultimo); ultimo = t; latidos++; if (vivo) ch.port2.postMessage(0); };
  ch.port2.postMessage(0);
  return () => { vivo = false; return { max, latidos }; };
}
window.__olivo = {
  revision: THREE.REVISION, O, genera, vista: (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); objetivo.set(tx, ty, tz); camera.lookAt(objetivo); dibuja(); },
  async ponNivel(k) { $("nivel").value = k; return genera(); },
  /** n árboles por la fábrica (trabajador o rebanadas), con la sonda puesta; devuelve huellas, tiempos y el hueco máximo del hilo principal */
  async fabrica(modo, casos) {
    const f = O.creaFabrica({ trabajador: modo === "trabajador", rebanadaMs: 3 });
    const fin = sonda(), t0 = performance.now(), recetas = [], ms = [];
    for (const e of casos) { const ti = performance.now(); recetas.push(await f.receta(e)); ms.push(performance.now() - ti); }
    const total = performance.now() - t0, s = fin(), rb = f.rebanadas ? f.rebanadas.slice() : [];
    const huellas = []; for (const r of recetas) huellas.push(await O.huella(r));   // después de la sonda: la huella no es parte de generar
    f.cierra();
    const orden = rb.slice().sort((a, b) => a - b), p99 = orden.length ? orden[Math.floor(orden.length * 0.99)] : null;
    return { modo: f.modo, huellas, ms, total, huecoMax: s.max, latidos: s.latidos, rebanadaMax: rb.length ? Math.max(...rb) : null, rebanadaP99: p99, rebanadas: rb.length, rebanadasLista: rb };
  },
  /** huella exacta y estructural de un caso, y sus flotantes (base64) para compararlos con Node */
  async estructura(e, conFlotantes) {
    const r = O.receta(e), b64 = a => { let s = ""; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    const out = { huella: await O.huella(r), estructura: await O.huellaEstructura(r) };
    if (conFlotantes) out.flotantes = r.piezas.map(p => ({ atrib: p.atrib ? Object.fromEntries(Object.entries(p.atrib).map(([k, a]) => [k, b64(a)])) : null, matrices: p.matrices ? b64(p.matrices) : null, colores: p.colores ? b64(p.colores) : null }));
    return out;
  },
  /** el hueco máximo del hilo principal SIN generar nada durante `ms` (lo que pone la propia máquina: otras tareas, el planificador del SO) */
  async reposo(ms) { const fin = sonda(); await new Promise(ok => setTimeout(ok, ms)); return fin(); },
  /** la huella de un caso en el hilo principal, de una vez */
  async huellaHilo(e) { return O.huella(O.receta(e)); },
  memoria: () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  info: () => ({ llamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles, geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures }),
};
window.__olivo.listo = genera().then(r => (window.__olivo.primero = r, true));
