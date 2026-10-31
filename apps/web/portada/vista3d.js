// Vista previa 3D de un avatar VRM para la portada (ADR-0020, P7d; contratos/avatares.md). Se carga con import() SOLO al abrir la
// pantalla del avatar: three y @pixiv/three-vrm no pesan en la portada ni en el resto de pantallas. Todo de su mismo origen
// (el .vrm sale de /avatares/<id>.vrm?v=<sha256>, el mismo que usará el motor); nada en línea (CSP estricta: el tamaño se pone con
// renderer.setSize(…, false) y el CSS). Si no hay WebGL o algo falla, lanza y la portada se queda con la lista accesible.
"use strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const ALTURA_M = 1.6;          // como en el mundo (ADR-0020 §5)
const VELOCIDAD_GIRO = 0.6;    // rad/s
export const PASO_BOTON = Math.PI / 8;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

/** Libera geometrías, materiales y texturas de lo que cuelga de `raiz` (regla: todo recurso de GPU se libera). */
function libera(raiz) {
  raiz.traverse(o => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

/** Pose de reposo con los brazos abajo y, si no se pide quieto, el paso en bucle (huesos normalizados del VRM). */
function posa(vrm, t, quieto) {
  const h = vrm.humanoid, mueve = (b, eje, val) => { const o = h.getNormalizedBoneNode(b); if (o) o.rotation[eje] = val; };
  const paso = quieto ? 0 : Math.sin(t * 3.2);
  mueve("leftUpperArm", "z", -1.15); mueve("rightUpperArm", "z", 1.15);
  mueve("leftUpperArm", "x", paso * 0.35); mueve("rightUpperArm", "x", -paso * 0.35);
  mueve("leftUpperLeg", "x", -paso * 0.5); mueve("rightUpperLeg", "x", paso * 0.5);
  h.update();
}

/**
 * Crea la vista sobre un <canvas>. Lanza si no hay WebGL.
 * `quieto`: sin giro ni paso solos (prefers-reduced-motion); se gira con los botones.
 * Devuelve { carga(url, sha256, { realista }), viste(v), quita(), gira(rad), pausa(bool), destruye() }.
 */
export function creaVista(canvas, { quieto = false, alPerder = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xffffff, 0x8a8470, 1.4));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(1.5, 2.5, 3); escena.add(sol);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(0, ALTURA_M * 0.55, 4.2); cam.lookAt(0, ALTURA_M * 0.5, 0);

  let vrm = null, activa = true, parada = quieto, previo = 0, t = 0, raf = 0, ficha = 0, sucio = true;
  const ajusta = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); sucio = true;
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(ajusta) : null;
  ro?.observe(canvas); ajusta();
  const perdido = e => { e.preventDefault(); alPerder(); };
  canvas.addEventListener("webglcontextlost", perdido);

  const bucle = ts => {
    raf = 0; if (!activa) return;
    if (!document.hidden) {
      const dt = previo ? Math.min(0.1, (ts - previo) / 1000) : 0; previo = ts;
      if (vrm) {
        if (!parada) { t += dt; vrm.scene.rotation.y += VELOCIDAD_GIRO * dt; posa(vrm, t, false); }
        if (!parada || sucio) { vrm.update(dt); renderer.render(escena, cam); sucio = false; }
      } else if (sucio) { renderer.render(escena, cam); sucio = false; }
    } else previo = 0;
    raf = requestAnimationFrame(bucle);
  };
  raf = requestAnimationFrame(bucle);

  const sueltaVrm = () => { if (vrm) { escena.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); vrm = null; sucio = true; } };

  return {
    /** Baja el VRM (mismo origen), comprueba su huella y lo pone en escena. Rechaza si no coincide o si falla la carga. `realista` (los cuerpos del creador, AV4):
     *  a su tamaño de verdad (cada edad con su altura), sin estirarlo a 1,6 m. */
    async carga(url, sha256, { realista = false } = {}) {
      const mia = ++ficha;
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) throw new Error("http " + r.status);
      const buf = await r.arrayBuffer();
      if (!globalThis.crypto?.subtle) throw new Error("sin crypto.subtle: no se puede comprobar la huella");
      if (hex(await crypto.subtle.digest("SHA-256", buf)) !== sha256) throw new Error("la huella no coincide");
      const gltf = await new GLTFLoader().register(p => new VRMLoaderPlugin(p)).parseAsync(buf, "");
      const nuevo = gltf.userData.vrm;
      if (!nuevo) throw new Error("no es un VRM");
      if (mia !== ficha || !activa) { libera(gltf.scene); return; }
      if (nuevo.meta?.metaVersion === "0") VRMUtils.rotateVRM0(nuevo);
      if (!realista) {
        const caja = new THREE.Box3().setFromObject(nuevo.scene), alto = caja.max.y - caja.min.y || 1, k = ALTURA_M / alto;
        nuevo.scene.scale.multiplyScalar(k);
        nuevo.scene.position.y -= caja.min.y * k;
      }
      sueltaVrm();
      vrm = nuevo; escena.add(vrm.scene); posa(vrm, 0, true); sucio = true;
    },
    /** AV4: las piezas de la receta y sus colores, como el motor (26b_avatares.js): v = { mallas: {pieza_x: true}, cubre, colores: {piel, ropa_base, ropa_abajo, pelo, sombrero} }.
     *  Las piezas se buscan por el nombre ORIGINAL del nodo (userData.name); lo oculto no se dibuja. */
    viste(v) {
      if (!vrm || !v) return;
      const raiz = vrm.scene;
      raiz.traverse(o => {
        let pieza = null;
        for (let p = o; p && p !== raiz; p = p.parent) { const n = p.userData?.name; if (n && /^pieza_/.test(n)) { pieza = p; break; } }
        if (pieza === o) o.visible = !!v.mallas[o.userData.name];
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          const nombre = String(m.name || "").replace(/\.\d+$/, ""), c = v.colores[nombre];
          if (c && m.color) m.color.set(c);
          if (!pieza && /^ropa_/.test(nombre)) o.visible = !v.cubre;
        }
      });
      sucio = true;
    },
    quita() { ficha++; sueltaVrm(); },
    /** Gira a mano (los botones «Girar»), en radianes. */
    gira(rad) { if (vrm) { vrm.scene.rotation.y += rad; sucio = true; } },
    pausa(p) { parada = !!p; if (parada && vrm) posa(vrm, 0, true); sucio = true; },
    destruye() {
      activa = false; ficha++; if (raf) cancelAnimationFrame(raf);
      ro?.disconnect(); canvas.removeEventListener("webglcontextlost", perdido);
      sueltaVrm(); libera(escena); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
