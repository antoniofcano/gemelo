// La escena sintética (ilustrativa, sin datos de la finca): la misma para los tres modos. Recibe el THREE de su build y la fábrica del material
// con sombreador propio (ShaderMaterial en clasico y super; NodeMaterial de TSL en nuevo: el WebGPURenderer no ejecuta ShaderMaterial).
// Todo con frustumCulled = false: las llamadas no dependen de hacia dónde mire la persona (la GPU recorta igual), así cada caso dibuja lo mismo.
// Delante de la persona (−z), en un rectángulo de 24 × 22 m, como una calle de olivar vista desde dentro.
import { reparto } from "./plan.js";

function azar(semilla) { let s = semilla >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// una textura de 256 × 256 hecha a mano (tierra con ruido), para que el suelo y los Standard muestreen como las teselas del gemelo
function textura(THREE, r) {
  const L = 256, d = new Uint8Array(L * L * 4);
  for (let i = 0; i < L * L; i++) { const v = 0.75 + 0.25 * r(); d[4 * i] = 150 * v; d[4 * i + 1] = 128 * v; d[4 * i + 2] = 92 * v; d[4 * i + 3] = 255; }
  const t = new THREE.DataTexture(d, L, L, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** p: los parámetros de plan.lee(); sombreador(THREE, colorA, colorB) → material. Devuelve { escena, camara, plan, animar(ms), libera() } */
export function creaEscena(THREE, p, sombreador) {
  const plan = reparto(p.n, p.tri), r = azar(20261104), recursos = [];
  const guarda = x => (recursos.push(x), x);
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x9fb8c8);
  escena.fog = new THREE.Fog(0x9fb8c8, 30, 120);
  escena.add(new THREE.HemisphereLight(0xdfe8f0, 0x6b5a3e, 1.2));
  const sol = new THREE.DirectionalLight(0xfff2dc, 2.2); sol.position.set(20, 40, 10); escena.add(sol);
  const camara = new THREE.PerspectiveCamera(70, 1, 0.05, 400); camara.position.set(0, 1.6, 0);
  const tex = guarda(textura(THREE, r));
  const pon = (m, x, y, z) => { m.position.set(x, y, z); m.frustumCulled = false; escena.add(m); return m; };
  const lugar = () => [-12 + 24 * r(), -3 - 22 * r()];

  // suelo: 1 llamada
  const gSuelo = guarda(new THREE.PlaneGeometry(60, 60, plan.suelo.seg, plan.suelo.seg)); gSuelo.rotateX(-Math.PI / 2);
  const pos = gSuelo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, 0.15 * Math.sin(pos.getX(i) * 0.7) * Math.cos(pos.getZ(i) * 0.5)); gSuelo.computeVertexNormals();
  tex.repeat.set(12, 12);
  pon(new THREE.Mesh(gSuelo, guarda(new THREE.MeshLambertMaterial({ map: tex }))), 0, 0, -10);

  // InstancedMesh: las «copas» (Lambert), una llamada cada una
  const gCopa = guarda(new THREE.IcosahedronGeometry(0.8, 1)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), s = new THREE.Vector3();
  for (let k = 0; k < plan.instanciados.mallas; k++) {
    const im = new THREE.InstancedMesh(gCopa, guarda(new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.24 + 0.05 * r(), 0.35, 0.28) })), plan.instanciados.porMalla);
    for (let i = 0; i < plan.instanciados.porMalla; i++) { const [x, z] = lugar(); const k1 = 0.7 + 0.6 * r(); e.set(x, 1.2 + 0.4 * r(), z); s.set(k1, 0.8 * k1, k1); im.setMatrixAt(i, m4.compose(e, q, s)); }
    pon(im, 0, 0, 0);
  }

  // mallas sueltas: sombreador propio, Lambert y Standard (una llamada cada una; un material por cada 10, como el reparto por teselas)
  const gEsfera = guarda(new THREE.SphereGeometry(0.35, plan.esfera.w, plan.esfera.h));
  const mats = (cuantos, hace) => { const L = []; for (let i = 0; i < Math.max(1, Math.ceil(cuantos / 10)); i++) L.push(guarda(hace(i))); return L; };
  const grupos = [
    [plan.sombreador, mats(plan.sombreador, () => sombreador(THREE, new THREE.Color().setHSL(0.08, 0.5, 0.35), new THREE.Color().setHSL(0.15, 0.4, 0.6)))],
    [plan.lambert, mats(plan.lambert, () => new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.1 + 0.2 * r(), 0.3, 0.45) }))],
    [plan.standard, mats(plan.standard, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.0, color: new THREE.Color().setHSL(0.1, 0.2, 0.7) }))],
  ];
  for (const [cuantos, L] of grupos) for (let i = 0; i < cuantos; i++) { const [x, z] = lugar(); pon(new THREE.Mesh(gEsfera, L[Math.floor(i / 10)]), x, 0.4 + 2.2 * r(), z); }

  return {
    escena, camara, plan,
    animar(ms) { sol.position.x = 20 * Math.cos(ms * 1e-4); },   // algo cambia cada fotograma (las matrices se actualizan igual)
    libera() { recursos.forEach(x => x.dispose && x.dispose()); },
  };
}
