// Visor 3D de los escalones de un olivo (OF8b, doc/sistema/OFICINA.md §9.1): UN WebGLRenderer, un lienzo sobre una cuadrícula de celdas y en cada
// celda un escalón (E0, E1, E2, E2-VR) del MISMO árbol, con la misma cámara (OrbitControls de three: girar y acercar mueve todos a la vez).
// Escena, luz, suelo y fondo de la herramienta del constructor (herramienta/main.js, la referencia «Olivos tipo»); three 0.128 («three-gen»), el
// del constructor, como anfitrión: así se ve como el artefacto y no entra un segundo three en el trozo. Dibuja bajo demanda (al girar o cambiar de
// tamaño), no en bucle. libera() suelta todo lo de la GPU (árboles, materiales, texturas, suelo, controles y el renderer con su contexto).
// No decide nada: el encuadre, el reparto de celdas y los rótulos son de apps/web/oficina/visor_olivo_puro.js (se prueban en Node).
// Se pide con import() perezoso desde la oficina (alias «gemelo-olivo-visor» de apps/web/vite.oficina.config.js): sin abrir el visor no se baja.
import * as THREE from "three-gen";
import { OrbitControls } from "three-gen/examples/jsm/controls/OrbitControls.js";
import { cargaFotos, colorLineal, creaMateriales, liberaOlivo, montaOlivo } from "./index.js";

/** Las fotos de la corteza (texturas/, ADR-0017; Vite les pone hash en el build): las mismas de la herramienta */
const FOTOS_URL = {
  corteza: new URL("./texturas/corteza.jpg", import.meta.url).href,
  musgo: new URL("./texturas/musgo.jpg", import.meta.url).href,
  muerta: new URL("./texturas/muerta.jpg", import.meta.url).href,
};
const FONDO = 0xdfe4dc, SUELO = 0x9c7a58;

/** ¿Hay WebGL en este aparato? (sin crear el renderer) */
export function hayWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

/**
 * @param host       el elemento que cubre el lienzo (position: relative; el lienzo lo llena)
 * @param opciones   { pixelRatio, celdas: () => [{ k, x, y, w, h, visible }] (rectángulos GL de cada escalón, px CSS), alPerder(): el contexto se perdió }
 */
export function creaVisor(host, opciones) {
  const o = opciones || {};
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(o.pixelRatio || 1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;   // la cuenta es de todas las celdas de un dibujo
  const lienzo = renderer.domElement;
  lienzo.setAttribute("aria-hidden", "true");   // lo que dice el dibujo va en los rótulos de cada celda
  host.appendChild(lienzo);

  const scene = new THREE.Scene();
  scene.background = colorLineal(new THREE.Color(), FONDO);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  const luz = (L, hex) => { colorLineal(L.color, hex); return L; };
  const hemi = luz(new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6), 0xeef2ea); colorLineal(hemi.groundColor, 0x6b5a44); scene.add(hemi);
  const sol = luz(new THREE.DirectionalLight(0xffffff, 0.85), 0xfff1dc);
  sol.position.set(7, 12, 5); sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 }); sol.shadow.bias = -0.0006;
  scene.add(sol);
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ roughness: 1 }));
  colorLineal(suelo.material.color, SUELO); suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; scene.add(suelo);

  const controles = new OrbitControls(camera, lienzo);
  controles.enableDamping = false;            // sin bucle: cada gesto pide un dibujo
  controles.maxPolarAngle = Math.PI * 0.495;  // no se mete bajo el suelo

  let fotos = null, materiales = null, epocaMat = null, arboles = [], pedido = 0, vivo = true;
  const pide = () => { if (!pedido && vivo) pedido = requestAnimationFrame(() => { pedido = 0; dibuja(); }); };
  controles.addEventListener("change", pide);

  function ajusta() {
    const w = host.clientWidth, h = host.clientHeight;
    if (w && h) renderer.setSize(w, h, false);
  }
  const vigia = new ResizeObserver(() => { ajusta(); pide(); });
  vigia.observe(host);
  const perdido = e => { e.preventDefault(); if (o.alPerder) o.alPerder(); };
  lienzo.addEventListener("webglcontextlost", perdido);

  function dibuja() {
    if (!vivo) return;
    ajusta();
    renderer.info.reset();
    renderer.setScissorTest(false); renderer.clear();
    renderer.setScissorTest(true);
    for (const c of (o.celdas ? o.celdas() : [])) {
      if (!c.visible) continue;
      for (const a of arboles) a.grupo.visible = a.k === c.k;
      renderer.setViewport(c.x, c.y, c.w, c.h); renderer.setScissor(c.x, c.y, c.w, c.h);
      camera.aspect = c.w / c.h; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
  }

  function quitaArboles() { for (const a of arboles) { scene.remove(a.grupo); liberaOlivo(a.grupo); } arboles = []; }

  const api = {
    /** Pone los escalones de un olivo: recetas { E0: receta, … } (ya calculadas con receta() y aNivel()), su época (materiales) y la cámara */
    async pon(recetas, epoca, enc) {
      if (!fotos) fotos = await cargaFotos(FOTOS_URL);
      if (!vivo) return;
      quitaArboles();
      if (epocaMat !== epoca) { if (materiales) materiales.libera(); materiales = creaMateriales(THREE, fotos, { epoca }); epocaMat = epoca; }
      for (const [k, r] of Object.entries(recetas)) { const grupo = montaOlivo(THREE, r, materiales); scene.add(grupo); arboles.push({ k, grupo }); }
      if (enc) api.camara(enc);
      dibuja();
    },
    /** Coloca la cámara (lo que da encuadre(): posicion, objetivo y límites del zoom) */
    camara(enc) {
      camera.near = enc.cerca; camera.far = enc.lejos;
      controles.minDistance = enc.minDistancia; controles.maxDistance = enc.maxDistancia;
      controles.target.fromArray(enc.objetivo); camera.position.fromArray(enc.posicion);
      controles.update(); pide();
    },
    /** Dónde está la cámara ahora (para girar y acercar con los botones) */
    vista: () => ({ posicion: camera.position.toArray(), objetivo: controles.target.toArray(), minDistancia: controles.minDistance, maxDistancia: controles.maxDistance }),
    mueve(posicion) { camera.position.fromArray(posicion); controles.update(); pide(); },
    dibuja,
    avisos: () => (fotos ? fotos.avisos.slice() : []),
    /** Para la prueba de Chrome: lo que dibujó el último fotograma (todas las celdas) y lo que hay en la GPU */
    info: () => ({ llamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles, geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures, escalones: arboles.map(a => a.k) }),
    /** Para la prueba de Chrome: por celda, la parte de sus píxeles que no son el fondo (dibuja y lee en el mismo paso) */
    muestreo() {
      dibuja();
      const gl = renderer.getContext(), pr = renderer.getPixelRatio(), fondo = scene.background.toArray().map(v => Math.round(v * 255)), out = {};
      for (const c of (o.celdas ? o.celdas() : [])) {
        if (!c.visible) continue;
        const w = Math.max(1, Math.floor(c.w * pr)), h = Math.max(1, Math.floor(c.h * pr)), px = new Uint8Array(w * h * 4);
        // el último render fue el de la última celda; se vuelve a dibujar cada una antes de leerla
        for (const a of arboles) a.grupo.visible = a.k === c.k;
        renderer.setScissorTest(true); renderer.setViewport(c.x, c.y, c.w, c.h); renderer.setScissor(c.x, c.y, c.w, c.h);
        camera.aspect = c.w / c.h; camera.updateProjectionMatrix(); renderer.render(scene, camera); renderer.setScissorTest(false);
        gl.readPixels(Math.floor(c.x * pr), Math.floor(c.y * pr), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let distintos = 0;
        for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - fondo[0]) + Math.abs(px[i + 1] - fondo[1]) + Math.abs(px[i + 2] - fondo[2]) > 24) distintos++;
        out[c.k] = distintos / (w * h);
      }
      return out;
    },
    /** Suelta todo lo de la GPU y quita el lienzo. Después, el visor no sirve: se crea otro. */
    libera() {
      vivo = false;
      if (pedido) cancelAnimationFrame(pedido);
      vigia.disconnect(); lienzo.removeEventListener("webglcontextlost", perdido);
      controles.removeEventListener("change", pide); controles.dispose();
      quitaArboles();
      if (materiales) materiales.libera();
      suelo.geometry.dispose(); suelo.material.dispose();
      if (sol.shadow.map) sol.shadow.map.dispose();
      if (fotos) for (const k of Object.keys(fotos)) if (fotos[k] && typeof fotos[k].close === "function") fotos[k].close();
      renderer.dispose(); renderer.forceContextLoss();
      lienzo.remove();
    },
  };
  return api;
}
