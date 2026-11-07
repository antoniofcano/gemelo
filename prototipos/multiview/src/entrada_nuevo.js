// modo nuevo: three 0.187.0, WebGPURenderer({ forceWebGL: true, multiview }) (src/renderers/common/Renderer.js:179 «multiview = false» y :824
// «this.xr = new XRManager( this, multiview )»; XRManager.js:1256 lo enciende si hay `OVR_multiview2` y capas). &mv=0: el mismo renderizador sin
// multiview (separa el coste del renderizador nuevo del ahorro del multiview). &directo=0: sin DirectRenderPipeline (con la pasada de salida
// intermedia que añade con salida sRGB, MULTIVIEW.md §2.4). El sombreador propio, en TSL: el WebGPURenderer no ejecuta ShaderMaterial.
import * as THREE from "three/webgpu";
import { mix, normalWorld, positionLocal, sin, uniform, float, vec4 } from "three/tsl";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { arranca } from "./humo.js";

const fabrica = {
  VRButton,
  renderizador: "three WebGPURenderer (forceWebGL)",
  sombreador(THREE, a, b) {
    const m = new THREE.MeshBasicNodeMaterial();
    const k = normalWorld.y.mul(0.5).add(0.5);
    m.colorNode = vec4(mix(uniform(a), uniform(b), k).mul(float(0.85).add(sin(positionLocal.y.mul(40)).mul(0.15))), 1);
    return m;
  },
  async crea(THREE, p, lienzo) {
    const renderer = new THREE.WebGPURenderer({ canvas: lienzo, antialias: p.msaa, forceWebGL: p.api !== "webgpu", multiview: p.mv });
    await renderer.init();
    const webgpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);   // con api=webgpu y sin navigator.gpu, three cae a WebGL en silencio: se dice el real
    const tubo = p.directo ? new THREE.DirectRenderPipeline(renderer) : null;
    return {
      renderer,
      backend: webgpu ? "WebGPU" : "WebGL",
      gl: renderer.backend && renderer.backend.gl,
      dibuja: tubo ? (escena, camara) => tubo.render(escena, camara) : (escena, camara) => renderer.render(escena, camara),
      multiviewActivo() { return typeof renderer.xr.useMultiview === "function" ? renderer.xr.useMultiview() : null; },
    };
  },
};

arranca(THREE, fabrica, __MODO__).catch(e => { document.getElementById("estado").textContent = "Error: " + e.message; console.error(e); });
