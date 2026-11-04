// La fábrica de los dos modos con WebGLRenderer clásico (clasico: three 0.186.1; super: super-three 0.185.0, por alias en construye.mjs).
// El sombreador propio es un ShaderMaterial con las matrices de siempre (projectionMatrix, modelViewMatrix, normalMatrix): super-three, con
// multiview, las cambia por las de cada vista (prefijo `#define projectionMatrix projectionMatrices[VIEW_ID]`, WebGLProgram.js), así que el mismo GLSL vale.
import { VRButton } from "three/addons/webxr/VRButton.js";

const VERT = `
varying vec3 vN; varying float vY;
void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vY = position.y; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
uniform vec3 colorA; uniform vec3 colorB; varying vec3 vN; varying float vY;
void main() { float k = 0.5 + 0.5 * vN.y; vec3 c = mix(colorA, colorB, k) * (0.85 + 0.15 * sin(vY * 40.0)); gl_FragColor = vec4(c, 1.0); }`;

export function fabricaWebGL(modo) {
  return {
    VRButton,
    renderizador: modo === "super" ? "super-three WebGLRenderer (multiviewStereo)" : "three WebGLRenderer (sin multiview)",
    sombreador(THREE, a, b) { return new THREE.ShaderMaterial({ uniforms: { colorA: { value: a }, colorB: { value: b } }, vertexShader: VERT, fragmentShader: FRAG }); },
    async crea(THREE, p, lienzo) {
      const op = { canvas: lienzo, antialias: p.msaa };
      // super-three: la opción es `multiviewStereo` (node_modules/super-three/src/renderers/WebGLRenderer.js:86, «multiviewStereo = false»),
      // que llega a `new WebXRManager( _this, _gl, extensions, multiviewStereo )` (:565) y allí `scope.isMultiview = useMultiview &&
      // extensions.has( 'OCULUS_multiview' )` (webxr/WebXRManager.js:492) pide la capa con textureType 'texture-array'. En three 0.186.1 no existe.
      if (modo === "super") op.multiviewStereo = p.mv;
      const renderer = new THREE.WebGLRenderer(op);
      return {
        renderer,
        gl: renderer.getContext(),
        dibuja(escena, camara) { renderer.render(escena, camara); },
        multiviewActivo() { return modo === "super" ? !!renderer.xr.isMultiview : false; },
      };
    },
  };
}
