// Página de horneado de impostores (contratos/olivo-impostor.md, ADR-0019 §2). Código de NAVEGADOR (WebGL2, three 0.186.1 del motor y el
// constructor de olivos): la abre tuberia/olivos/impostores.mjs en Chrome sin pantalla y la misma servirá para hornear en el navegador (plan B).
//
// Monta cada variante con montaOlivo y los materiales del constructor tal como los pone el motor (creaMateriales con srgb, colores de material y
// por vértice/instancia leídos como sRGB: 07ab_generados.js) y la fotografía desde las 8 × 8 direcciones hemi-octaédricas (impostor.js) con
// cámara ortográfica, sin luz:
//   pasada 0 (color): el albedo lineal (diffuseColor tras mapa, color, marcas y recorte alfa), con alfa 1 donde hay árbol;
//   pasada 1 (normales): la normal en el marco del árbol (de cara a la cámara) y, en el alfa, la oclusión de copa (contrato §3).
// Cada vista se dibuja a SUPER× (512 px) en un objetivo de coma flotante y se reduce aquí: la cobertura es la fracción de submuestras con árbol, el
// color es la media de las cubiertas pasada a sRGB, y debajo de lo transparente se extiende el color vecino (para que el filtrado no oscurezca bordes).
//   window.__impostor.hornea({ epoca, fuentes: [url de los bytes sin comprimir de cada receta E2] }) → { color, normales (subidos a /recoge/), variantes }
//   window.__impostor.compara({ fuente, epoca }) → color medio del árbol con la luz de la referencia «Olivos tipo» (r128) y con la del motor (0.186)
import * as THREE from "three";
import * as T128 from "three-gen";
import * as O from "/apps/web/olivo/index.js";
import { IMPOSTOR, direccionDeVista, baseDeVista } from "/apps/web/olivo/impostor.js";

const N = IMPOSTOR.REJILLA, V = IMPOSTOR.VISTA, VN = IMPOSTOR.VISTA_NORMAL, SS = IMPOSTOR.SUPER, S = V * SS, PL = IMPOSTOR.POR_LADO;
const LADO = IMPOSTOR.LADO, LADO_N = IMPOSTOR.LADO_NORMAL, RED_N = S / VN;   // 512 → 64: bloques de 8 × 8

// ---------- GLSL del horneado
const GLSL_LIN = "vec3 ot_lin(vec3 c){ return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }\n";
const uPasada = { value: 0 }, uCentroCopa = { value: new THREE.Vector3() }, uSemiCopa = { value: new THREE.Vector3(1, 1, 1) }, uDirVista = { value: new THREE.Vector3(0, 0, 1) };
const OCL = "float ot_ocl(vec3 p){ float q = length((p - uCentroCopa) / uSemiCopa); return mix(" + IMPOSTOR.OCLUSION_MIN.toFixed(4) + ", 1.0, smoothstep(0.15, 1.0, q)); }\n";
function parcheHorneado(sh) {
  Object.assign(sh.uniforms, { uPasada, uCentroCopa, uSemiCopa, uDirVista });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_LIN + "varying vec3 vArbol;\n")
    .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n vec4 ot_p = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n ot_p = instanceMatrix * ot_p;\n#endif\n vArbol = (modelMatrix * ot_p).xyz;");
  const cab = "uniform int uPasada; uniform vec3 uCentroCopa; uniform vec3 uSemiCopa; uniform vec3 uDirVista; varying vec3 vArbol;\n" + OCL;
  sh.fragmentShader = sh.fragmentShader.replace("void main() {", cab + "void main() {");
  const conNormal = sh.fragmentShader.includes("#include <normal_fragment_maps>");
  const albedo = "\n if (uPasada == 0) { gl_FragColor = vec4(diffuseColor.rgb, 1.0); return; }\n";
  if (conNormal) {
    sh.fragmentShader = sh.fragmentShader.replace("#include <alphatest_fragment>", "#include <alphatest_fragment>" + albedo)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n if (uPasada == 1) { vec3 ot_n = normalize((vec4(normal, 0.0) * viewMatrix).xyz); gl_FragColor = vec4(ot_n * 0.5 + 0.5, ot_ocl(vArbol)); return; }");
  } else {   // puntos (olivas de E2): sin normal; la suya es la de la vista
    sh.fragmentShader = sh.fragmentShader.replace("#include <alphatest_fragment>", "#include <alphatest_fragment>" + albedo +
      " if (uPasada == 1) { gl_FragColor = vec4(normalize(uDirVista) * 0.5 + 0.5, ot_ocl(vArbol)); return; }\n");
  }
}

// ---------- materiales: los del motor (07ab_generados.js: srgb, color de material como sRGB) + el parche del horneado
const porEpoca = {};
function materiales(epoca) {
  if (!porEpoca[epoca]) porEpoca[epoca] = O.creaMateriales(THREE, null, { epoca, srgb: true, parche: (m) => {
    if (m.isMeshDepthMaterial) return;
    if (m.color) m.color.convertSRGBToLinear();   // el convenio del motor (parcheGen de 07ab): el número de la referencia es un color «tal como se ve»
    O.encadena(m, parcheHorneado, "impostor-horneado");
  } });
  return porEpoca[epoca];
}

let renderer = null;
function dibujante() {
  if (renderer) return renderer;
  const lienzo = document.createElement("canvas"); lienzo.width = lienzo.height = 8;
  const gl = lienzo.getContext("webgl2", { antialias: false, alpha: true });
  if (!gl) throw new Error("sin WebGL2");
  renderer = new THREE.WebGLRenderer({ canvas: lienzo, context: gl, antialias: false, alpha: true });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  return renderer;
}

const bytesDe = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ": http " + r.status); return new Uint8Array(await r.arrayBuffer()); };
const aSrgb = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const b8 = x => Math.max(0, Math.min(255, Math.round(x * 255)));

/** La caja del árbol montado (con instancias), y la de su follaje (ramitas y relleno) para la oclusión de copa */
function cajas(arbol) {
  arbol.updateMatrixWorld(true);
  const todo = new THREE.Box3(), copa = new THREE.Box3(), b = new THREE.Box3();
  arbol.traverse(m => {
    if (!m.geometry) return;
    if (m.isInstancedMesh) { m.computeBoundingBox(); b.copy(m.boundingBox).applyMatrix4(m.matrixWorld); }
    else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); }
    todo.union(b);
    if (/^(ramita|relleno)/.test(m.name)) copa.union(b);
  });
  if (copa.isEmpty()) copa.copy(todo);
  return { todo, copa };
}

/** Extiende el color de lo cubierto a lo transparente de una celda (w × w, rgb Float32 ×3, cub Float32): media de vecinos, hasta `pasos` anillos; lo que quede, la media de la celda */
function extiende(w, rgb, cub, comp, pasos) {
  const listo = new Uint8Array(w * w); let media = new Float64Array(comp), nm = 0;
  for (let p = 0; p < w * w; p++) if (cub[p] > 0) { listo[p] = 1; for (let c = 0; c < comp; c++) media[c] += rgb[p * comp + c]; nm++; }
  for (let s = 0; s < pasos; s++) {
    const nuevos = [];
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (listo[p]) continue;
      let n = 0; const acc = new Float64Array(comp);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
        const q = yy * w + xx; if (!listo[q]) continue;
        for (let c = 0; c < comp; c++) acc[c] += rgb[q * comp + c]; n++;
      }
      if (n) nuevos.push([p, Array.from(acc, v => v / n)]);
    }
    if (!nuevos.length) break;
    for (const [p, v] of nuevos) { listo[p] = 1; for (let c = 0; c < comp; c++) rgb[p * comp + c] = v[c]; }
  }
  for (let c = 0; c < comp; c++) media[c] = nm ? media[c] / nm : 0.5;
  for (let p = 0; p < w * w; p++) if (!listo[p]) for (let c = 0; c < comp; c++) rgb[p * comp + c] = media[c];
}

/**
 * Hornea los atlas de una época. o: { epoca, fuentes: [url de cada receta E2 SIN comprimir (contrato olivo-horneado §1), en el orden de las celdas] }.
 * Sube a /recoge/color y /recoge/normales el RGBA8 crudo de cada atlas (fila 0 = la de ARRIBA, como el fichero de imagen) y devuelve las cajas.
 */
async function hornea(o) {
  const t0 = performance.now(), R = dibujante(), mats = materiales(o.epoca);
  if (!o.fuentes.length || o.fuentes.length > PL * PL) throw new Error("de 1 a " + PL * PL + " variantes por atlas");
  const color = new Uint8Array(LADO * LADO * 4), normales = new Uint8Array(LADO_N * LADO_N * 4);
  const rtA = new THREE.WebGLRenderTarget(S, S, { type: THREE.FloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const rtN = rtA.clone(), bufA = new Float32Array(S * S * 4), bufN = new Float32Array(S * S * 4);
  const escena = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100), variantes = [];
  const cRGB = new Float32Array(V * V * 3), cCub = new Float32Array(V * V), nRGB = new Float32Array(VN * VN * 4), nCub = new Float32Array(VN * VN);
  const tamPunto = mats.puntos.size;
  try {
    for (let k = 0; k < o.fuentes.length; k++) {
      const { receta, cabecera } = O.decodifica(await bytesDe(o.fuentes[k]));
      if (cabecera.nivel !== IMPOSTOR.NIVEL) throw new Error("la fuente " + k + " es " + cabecera.nivel + ", no " + IMPOSTOR.NIVEL);
      const arbol = O.montaOlivo(THREE, receta, mats); escena.add(arbol);
      const { todo, copa } = cajas(arbol), esfera = todo.getBoundingSphere(new THREE.Sphere());
      const centro = todo.getCenter(new THREE.Vector3()), semi = esfera.radius * IMPOSTOR.MARGEN;
      copa.getCenter(uCentroCopa.value); copa.getSize(uSemiCopa.value).multiplyScalar(0.5).max(new THREE.Vector3(0.05, 0.05, 0.05));
      Object.assign(cam, { left: -semi, right: semi, top: semi, bottom: -semi, near: 0.01, far: 4 * semi }); cam.updateProjectionMatrix();
      mats.puntos.size = tamPunto * S / (2 * semi);   // ortográfica: el tamaño del punto va en píxeles (0,045 m a la escala de la vista)
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const d = direccionDeVista(i, j, N), { u } = baseDeVista(d);
        cam.position.set(centro.x + d[0] * 2 * semi, centro.y + d[1] * 2 * semi, centro.z + d[2] * 2 * semi); cam.up.set(u[0], u[1], u[2]); cam.lookAt(centro); cam.updateMatrixWorld(true);
        uDirVista.value.set(d[0], d[1], d[2]);
        uPasada.value = 0; R.setRenderTarget(rtA); R.clear(); R.render(escena, cam); R.readRenderTargetPixels(rtA, 0, 0, S, S, bufA);
        uPasada.value = 1; R.setRenderTarget(rtN); R.clear(); R.render(escena, cam); R.readRenderTargetPixels(rtN, 0, 0, S, S, bufN);
        // color: bloques SS × SS → 1 píxel (filas desde ABAJO, como WebGL)
        for (let py = 0; py < V; py++) for (let px = 0; px < V; px++) {
          let n = 0, r = 0, g = 0, b = 0;
          for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
            const q = ((py * SS + sy) * S + px * SS + sx) * 4;
            if (bufA[q + 3] > 0.5) { n++; r += bufA[q]; g += bufA[q + 1]; b += bufA[q + 2]; }
          }
          const p = py * V + px; cCub[p] = n / (SS * SS);
          if (n) { cRGB[p * 3] = aSrgb(r / n); cRGB[p * 3 + 1] = aSrgb(g / n); cRGB[p * 3 + 2] = aSrgb(b / n); }
        }
        // normales y oclusión: bloques RED_N × RED_N → 1 píxel
        for (let py = 0; py < VN; py++) for (let px = 0; px < VN; px++) {
          let n = 0, x = 0, y = 0, z = 0, a = 0;
          for (let sy = 0; sy < RED_N; sy++) for (let sx = 0; sx < RED_N; sx++) {
            const q = ((py * RED_N + sy) * S + px * RED_N + sx) * 4;
            if (bufA[q + 3] > 0.5) { n++; x += bufN[q] * 2 - 1; y += bufN[q + 1] * 2 - 1; z += bufN[q + 2] * 2 - 1; a += bufN[q + 3]; }
          }
          const p = py * VN + px; nCub[p] = n;
          if (n) { const l = Math.hypot(x, y, z) || 1; nRGB[p * 4] = x / l; nRGB[p * 4 + 1] = y / l; nRGB[p * 4 + 2] = z / l; nRGB[p * 4 + 3] = a / n; }
        }
        extiende(V, cRGB, cCub, 3, 16); extiende(VN, nRGB, nCub, 4, 8);
        // al atlas, en filas del FICHERO (fila 0 arriba): la fila py (desde abajo) de la celda va a la fila (arriba de la celda) + (V − 1 − py)
        const cx = ((k % PL) * N + i) * V, cyAbajo = (Math.floor(k / PL) * N + j) * V;
        for (let py = 0; py < V; py++) {
          const fila = LADO - 1 - (cyAbajo + py);
          for (let px = 0; px < V; px++) {
            const p = py * V + px, q = (fila * LADO + cx + px) * 4;
            color[q] = b8(cRGB[p * 3]); color[q + 1] = b8(cRGB[p * 3 + 1]); color[q + 2] = b8(cRGB[p * 3 + 2]); color[q + 3] = b8(cCub[p]);
          }
        }
        const nx = ((k % PL) * N + i) * VN, nyAbajo = (Math.floor(k / PL) * N + j) * VN;
        for (let py = 0; py < VN; py++) {
          const fila = LADO_N - 1 - (nyAbajo + py);
          for (let px = 0; px < VN; px++) {
            const p = py * VN + px, q = (fila * LADO_N + nx + px) * 4, l = Math.hypot(nRGB[p * 4], nRGB[p * 4 + 1], nRGB[p * 4 + 2]) || 1;
            for (let c = 0; c < 3; c++) normales[q + c] = b8(nRGB[p * 4 + c] / l * 0.5 + 0.5);
            normales[q + 3] = b8(nRGB[p * 4 + 3]);
          }
        }
        cRGB.fill(0); cCub.fill(0); nRGB.fill(0); nCub.fill(0);
      }
      const r3 = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
      variantes.push({ celda: k, tipo: receta.entrada.tipo, semilla: receta.entrada.semilla, caja: [r3(todo.min), r3(todo.max)], centro: r3(centro), semilado: +semi.toFixed(4),
        copa: { centro: r3(uCentroCopa.value), semiejes: r3(uSemiCopa.value) }, medidas: { altura_m: receta.medidas.altura_m, copa_m: receta.medidas.copa_m } });
      escena.remove(arbol); O.liberaOlivo(arbol);
    }
  } finally { mats.puntos.size = tamPunto; R.setRenderTarget(null); rtA.dispose(); rtN.dispose(); }
  await sube("color", color); await sube("normales", normales);
  return { variantes, ms: Math.round(performance.now() - t0), three: THREE.REVISION, agente: navigator.userAgent };
}
async function sube(nombre, bytes) { const r = await fetch("/recoge/" + nombre, { method: "POST", body: bytes }); if (!r.ok) throw new Error("no se pudo subir " + nombre); }

// ---------- comparación de color (decisión 70): el mismo árbol con la luz de la referencia y con la del motor
// fondo opaco de un color clave (sin antialias): es árbol todo píxel que no sea exactamente la clave
const CLAVE = [255, 0, 255];
function mediaDelArbol(R, w, h) {
  const gl = R.getContext(), px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let n = 0, r = 0, g = 0, b = 0;
  for (let p = 0; p < w * h; p++) if (px[p * 4] !== CLAVE[0] || px[p * 4 + 1] !== CLAVE[1] || px[p * 4 + 2] !== CLAVE[2]) { n++; r += px[p * 4]; g += px[p * 4 + 1]; b += px[p * 4 + 2]; }
  return { pixeles: n, srgb: n ? [r / n, g / n, b / n].map(x => Math.round(x)) : null };
}
async function compara(o) {
  const w = 512, h = 512, out = {};
  const bytes = await bytesDe(o.fuente), { receta } = O.decodifica(bytes);
  const casos = [
    { nombre: "referencia_r128_con_sombras", T: T128, sombras: true },
    { nombre: "referencia_r128_sin_sombras", T: T128, sombras: false },
    { nombre: "motor_sin_calibrar", T: THREE, sombras: false, motor: true, calibracion: false },
    { nombre: "motor_sin_calibrar_con_sombras", T: THREE, sombras: true, motor: true, calibracion: false },
    { nombre: "motor_calibrado", T: THREE, sombras: false, motor: true },
    { nombre: "motor_calibrado_con_sombras", T: THREE, sombras: true, motor: true },
    { nombre: "motor_calibrado_oclusion_045", T: THREE, sombras: false, motor: true, ao: 0.45 },
    { nombre: "albedo_calibrado", T: THREE, albedo: true },
  ].concat((o.extra || []).map(e => Object.assign({ T: THREE, motor: true }, e)));
  for (const c of casos) {
    const T = c.T, lienzo = document.createElement("canvas"); lienzo.width = w; lienzo.height = h;
    const R = new T.WebGLRenderer({ canvas: lienzo, antialias: false, alpha: false, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(w, h, false);
    R.shadowMap.enabled = !!c.sombras; R.shadowMap.type = T.PCFSoftShadowMap;
    let mats;
    if (T === T128) mats = O.creaMateriales(T, null, { epoca: o.epoca });   // la referencia: r128, sin gestión de color (como la herramienta)
    else {
      R.outputColorSpace = THREE.SRGBColorSpace;
      const k = c.k || 1, ao = c.ao || 1, kc = c.kc || 1;   // pruebas de corrección: factor del follaje (lineal), oclusión de copa mínima, factor de la corteza
      if (c.ao) { const { copa } = cajas(O.montaOlivo(THREE, receta, materiales(o.epoca))); copa.getCenter(uCentroCopa.value); copa.getSize(uSemiCopa.value).multiplyScalar(0.5); }
      mats = c.albedo ? materiales(o.epoca) : O.creaMateriales(THREE, null, { epoca: o.epoca, srgb: true, calibracion: c.calibracion, parche: (m, n) => {
        if (m.isMeshDepthMaterial) return; if (m.color) m.color.convertSRGBToLinear();
        const fol = /^(ramita|relleno)/.test(n), f = (fol ? k : /^(corteza|pies|musgo|raiz|muerta)$/.test(n) ? kc : 1).toFixed(4);
        O.encadena(m, sh => {
          Object.assign(sh.uniforms, { uCentroCopa, uSemiCopa });
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_LIN + "varying vec3 vArbol;\n")
            .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n vec4 ot_p = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n ot_p = instanceMatrix * ot_p;\n#endif\n vArbol = (modelMatrix * ot_p).xyz;");
          sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform vec3 uCentroCopa; uniform vec3 uSemiCopa; varying vec3 vArbol;\nvoid main() {")
            .replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\n diffuseColor.rgb *= " + f + (c.ao ? " * mix(" + ao.toFixed(3) + ", 1.0, smoothstep(0.15, 1.0, length((vArbol - uCentroCopa) / uSemiCopa)))" : "") + ";");
        }, "motor-color-" + f + "-" + ao);
      } });
    }
    const escena = new T.Scene(), arbol = O.montaOlivo(T, receta, mats); escena.add(arbol);
    escena.background = new T.Color(); escena.background.setRGB(CLAVE[0] / 255, CLAVE[1] / 255, CLAVE[2] / 255);   // la clave sale tal cual (0 y 1 no cambian con sRGB)
    if (T === T128) {   // la luz de la herramienta («Olivos tipo»)
      const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 0.6); O.colorLineal(hemi.color, 0xeef2ea); O.colorLineal(hemi.groundColor, 0x6b5a44); escena.add(hemi);
      const sol = new T.DirectionalLight(0xffffff, 0.85); O.colorLineal(sol.color, 0xfff1dc); sol.position.set(7, 12, 5); escena.add(sol);
      if (c.sombras) { sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 }); sol.shadow.bias = -0.0006; }
    } else if (!c.albedo) {   // la del motor a pleno día y cielo despejado (03_escena + 15_tiempo: sol 0,93 · 1,5π, cielo 0,9 · 1,1π)
      const hemi = new T.HemisphereLight(0xffffff, 0x8a7a60, 0.9 * Math.PI * 1.1); escena.add(hemi);
      const sol = new T.DirectionalLight(0xffffff, 0.93 * Math.PI * 1.5); sol.color.setRGB(1, 0.94, 0.82, THREE.SRGBColorSpace); sol.position.set(7, 12, 5); escena.add(sol);
      if (c.sombras) { sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 }); sol.shadow.bias = -0.0006; }
    }
    arbol.traverse(m => { if (m.isMesh || m.isInstancedMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const caja = new T.Box3().setFromObject(arbol), sz = caja.getSize(new T.Vector3()), obj = new T.Vector3(0, sz.y * 0.45, 0);
    const cam = new T.PerspectiveCamera(38, 1, 0.1, 200), dir = new T.Vector3(9, 4.5, 10).normalize();
    cam.position.copy(obj).add(dir.multiplyScalar(Math.max(sz.y, sz.x, sz.z) * 1.9 + 1.5)); cam.lookAt(obj);
    if (c.albedo) { uPasada.value = 0; R.outputColorSpace = THREE.LinearSRGBColorSpace; }   // el albedo sale lineal (el sombreador vuelve antes de la conversión): se pasa a sRGB al medir
    R.render(escena, cam);
    out[c.nombre] = mediaDelArbol(R, w, h);
    if (c.albedo && out[c.nombre].srgb) out[c.nombre].srgb = out[c.nombre].srgb.map(x => Math.round(255 * aSrgb(x / 255)));   // (aprox.: la media de lo lineal)
    const png = await new Promise(ok => lienzo.toBlob(ok, "image/png"));
    await fetch("/recoge/compara_" + c.nombre + ".png", { method: "POST", body: png });
    if (T === T128) mats.libera();
    else if (!c.albedo) mats.libera();
    R.dispose();
  }
  return out;
}

window.__impostor = { hornea, compara, listo: true, three: THREE.REVISION };
