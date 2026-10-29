// VRM sintético para las pruebas (ADR-0020 §2): un humanoide de cajas con esqueleto VRM 1.0, piel, una cara con morph «blink», MToon con texturas, muelles y contorno.
// Licencia CC0-1.0, autor «Gemelo (sintético)»: lo genera este guion; no hay ningún modelo ajeno ni fichero versionado.
//   node tuberia/avatares/sintetico.mjs <salida.vrm> [subdivision] [pixeles_textura]
// `subdivision` (def. 8) reparte cada cara de cada caja en n×n cuadrados (12·n² triángulos por caja: con 14 salen ≈ 37 k, por encima del tope del ADR);
// `pixeles` (def. 1280) es el lado de las dos texturas PNG (por encima de 1024: la tubería las baja).
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { empaquetaGlb } from "./vrm.mjs";

const NOMBRES = ["hips", "spine", "chest", "neck", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
// [padre, traslación local]
const HUESOS = [[-1, [0, 0.95, 0]], [0, [0, 0.1, 0]], [1, [0, 0.2, 0]], [2, [0, 0.25, 0]], [3, [0, 0.08, 0]],
  [0, [0.09, -0.05, 0]], [5, [0, -0.42, 0]], [6, [0, -0.42, 0]], [0, [-0.09, -0.05, 0]], [8, [0, -0.42, 0]], [9, [0, -0.42, 0]],
  [2, [0.15, 0.2, 0]], [11, [0.28, 0, 0]], [12, [0.26, 0, 0]], [2, [-0.15, 0.2, 0]], [14, [-0.28, 0, 0]], [15, [-0.26, 0, 0]]];
// caja de cada hueso: [centro relativo, tamaño, ¿piel? (si no, ropa)]
const CAJAS = [[[0, 0, 0], [0.3, 0.2, 0.18], 0], [[0, 0.1, 0], [0.28, 0.14, 0.17], 0], [[0, 0.1, 0], [0.32, 0.24, 0.19], 0], [[0, 0.05, 0], [0.08, 0.1, 0.08], 1], [[0, 0.1, 0], [0.2, 0.24, 0.22], 1],
  [[0, -0.21, 0], [0.12, 0.42, 0.13], 0], [[0, -0.21, 0], [0.1, 0.42, 0.11], 0], [[0, -0.03, 0.05], [0.1, 0.06, 0.24], 0],
  [[0, -0.21, 0], [0.12, 0.42, 0.13], 0], [[0, -0.21, 0], [0.1, 0.42, 0.11], 0], [[0, -0.03, 0.05], [0.1, 0.06, 0.24], 0],
  [[0.14, 0, 0], [0.28, 0.08, 0.08], 0], [[0.13, 0, 0], [0.26, 0.07, 0.07], 1], [[0.1, 0, 0], [0.2, 0.06, 0.1], 1],
  [[-0.14, 0, 0], [0.28, 0.08, 0.08], 0], [[-0.13, 0, 0], [0.26, 0.07, 0.07], 1], [[-0.1, 0, 0], [0.2, 0.06, 0.1], 1]];

// ---- PNG mínimo (RGBA, sin filtro): suficiente para una textura de degradado
function png(px, f) {
  const fila = 1 + px * 4, raw = Buffer.alloc(fila * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const o = y * fila + 1 + x * 4, c = f(x / px, y / px); raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255; }
  const trozo = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, "latin1"); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(px, 0); ihdr.writeUInt32BE(px, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(raw, { level: 9 })), trozo("IEND", Buffer.alloc(0))]);
}

/** Genera un VRM 1.0 sintético (Buffer). `meta` se mezcla sobre el meta de VRM 1.0 (para las pruebas de licencia); `contorno` pone contorno de MToon en la piel. */
export function generaVRM({ subdivision = 8, pixeles = 1280, meta = {}, contorno = true } = {}) {
  // posiciones de mundo de los huesos
  const mundo = [];
  HUESOS.forEach(([p, t], i) => { const b = p < 0 ? [0, 0, 0] : mundo[p]; mundo[i] = [b[0] + t[0], b[1] + t[1], b[2] + t[2]]; });
  // geometría
  const grupos = [{ piel: [], ropa: [] }];
  const prim = { piel: { P: [], N: [], T: [], J: [], I: [] }, ropa: { P: [], N: [], T: [], J: [], I: [] } };
  const cara = { P: [], N: [], T: [], J: [], I: [], D: [] };
  const n = subdivision;
  function caja(dst, c, s, hueso, inclineD) {
    const caras = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [nn, u, v] of caras) {
      const base = dst.P.length / 3;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const a = i / n * 2 - 1, b = j / n * 2 - 1;
        for (let k = 0; k < 3; k++) dst.P.push(c[0 + k] + (nn[k] + u[k] * a + v[k] * b) * s[k] / 2);
        dst.N.push(...nn); dst.T.push(i / n, j / n); dst.J.push(hueso, 0, 0, 0);
        if (dst.D) dst.D.push(0, inclineD ? -0.02 * (1 - (j / n)) : 0, 0);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i, b = a + 1, c2 = a + n + 1, d = c2 + 1;
        // orientación: u × v debe apuntar a la normal; si no, se invierte
        const det = nn[0] * (u[1] * v[2] - u[2] * v[1]) - nn[1] * (u[0] * v[2] - u[2] * v[0]) + nn[2] * (u[0] * v[1] - u[1] * v[0]);
        if (det > 0) dst.I.push(a, b, d, a, d, c2); else dst.I.push(a, d, b, a, c2, d);
      }
    }
  }
  CAJAS.forEach(([c, s, esPiel], i) => caja(esPiel ? prim.piel : prim.ropa, [mundo[i][0] + c[0], mundo[i][1] + c[1], mundo[i][2] + c[2]], s, i));
  caja(cara, [mundo[4][0], mundo[4][1] + 0.1, mundo[4][2] + 0.115], [0.14, 0.06, 0.02], 4, true);

  // binario
  const trozos = [], vistas = [], accesores = [];
  const alinea = () => { const l = trozos.reduce((a, b) => a + b.length, 0); if (l % 4) trozos.push(Buffer.alloc(4 - (l % 4))); };
  function acc(buf, tipo, comp, cuenta, extra = {}, objetivo) {
    alinea(); const off = trozos.reduce((a, b) => a + b.length, 0); trozos.push(buf);
    vistas.push(Object.assign({ buffer: 0, byteOffset: off, byteLength: buf.length }, objetivo ? { target: objetivo } : {}));
    accesores.push(Object.assign({ bufferView: vistas.length - 1, componentType: comp, count: cuenta, type: tipo }, extra));
    return accesores.length - 1;
  }
  const f32 = a => Buffer.from(new Float32Array(a).buffer), u32 = a => Buffer.from(new Uint32Array(a).buffer), u8 = a => Buffer.from(new Uint8Array(a));
  const minmax = (a, k) => { const mn = Array(k).fill(Infinity), mx = Array(k).fill(-Infinity); for (let i = 0; i < a.length; i++) { mn[i % k] = Math.min(mn[i % k], a[i]); mx[i % k] = Math.max(mx[i % k], a[i]); } return { min: mn, max: mx }; };
  function primitiva(d, material, conMorph) {
    const cuenta = d.P.length / 3, w = [];
    for (let i = 0; i < cuenta; i++) w.push(1, 0, 0, 0);
    const atributos = {
      POSITION: acc(f32(d.P), "VEC3", 5126, cuenta, minmax(d.P, 3), 34962), NORMAL: acc(f32(d.N), "VEC3", 5126, cuenta, {}, 34962), TEXCOORD_0: acc(f32(d.T), "VEC2", 5126, cuenta, {}, 34962),
      JOINTS_0: acc(u8(d.J), "VEC4", 5121, cuenta, {}, 34962), WEIGHTS_0: acc(f32(w), "VEC4", 5126, cuenta, {}, 34962)
    };
    const p = { attributes: atributos, indices: acc(u32(d.I), "SCALAR", 5125, d.I.length, {}, 34963), material, mode: 4 };
    if (conMorph) p.targets = [{ POSITION: acc(f32(d.D), "VEC3", 5126, cuenta, minmax(d.D, 3), 34962) }];
    return p;
  }
  const mallaCuerpo = { name: "Cuerpo", primitives: [primitiva(prim.piel, 0), primitiva(prim.ropa, 1)] };
  const mallaCara = { name: "Cara", primitives: [primitiva(cara, 0, true)], extras: { targetNames: ["blink"] } };
  // pesos del morph a 0 por defecto; los nombres de los morph van en extras.targetNames (convención de glTF)
  // inverse bind matrices (traslación inversa a la posición del hueso)
  const ibm = []; mundo.forEach(m => ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -m[0], -m[1], -m[2], 1));
  const aIbm = acc(f32(ibm), "MAT4", 5126, mundo.length);

  // imágenes
  const imagen = (f) => { alinea(); const off = trozos.reduce((a, b) => a + b.length, 0), b = png(pixeles, f); trozos.push(b); vistas.push({ buffer: 0, byteOffset: off, byteLength: b.length }); return vistas.length - 1; };
  const img0 = imagen((x, y) => [Math.round(200 + 40 * x), Math.round(150 + 60 * y), Math.round(120 + 40 * (x + y) / 2)]);
  const img1 = imagen((x, y) => [Math.round(160 + 60 * y), Math.round(110 + 50 * x), Math.round(100 + 30 * y)]);

  // nodos: 0..16 huesos, 17 Cuerpo, 18 Cara
  const nodos = HUESOS.map(([, t], i) => ({ name: NOMBRES[i], translation: t, children: [] }));
  HUESOS.forEach(([p], i) => { if (p >= 0) nodos[p].children.push(i); });
  nodos.forEach(n2 => { if (!n2.children.length) delete n2.children; });
  nodos.push({ name: "Cuerpo", mesh: 0, skin: 0 }, { name: "Cara", mesh: 1, skin: 0, weights: [0] });
  const mtoonPiel = { specVersion: "1.0", shadeColorFactor: [0.7, 0.55, 0.5], shadeMultiplyTexture: { index: 1 }, giEqualizationFactor: 0.9 };
  if (contorno) Object.assign(mtoonPiel, { outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.002, outlineColorFactor: [0, 0, 0] });
  const humanBones = {}; NOMBRES.forEach((nm, i) => { humanBones[nm] = { node: i }; });
  const json = {
    asset: { version: "2.0", generator: "gemelo tuberia/avatares/sintetico.mjs" },
    extensionsUsed: ["VRMC_materials_mtoon", "VRMC_springBone", "VRMC_vrm"],
    scene: 0, scenes: [{ nodes: [0, 17, 18] }], nodes: nodos,
    skins: [{ joints: NOMBRES.map((_, i) => i), skeleton: 0, inverseBindMatrices: aIbm }],
    meshes: [mallaCuerpo, mallaCara],
    materials: [
      { name: "Piel", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 }, extensions: { VRMC_materials_mtoon: mtoonPiel } },
      { name: "Ropa", pbrMetallicRoughness: { baseColorFactor: [0.25, 0.4, 0.2, 1], metallicFactor: 0 }, extensions: { VRMC_materials_mtoon: { specVersion: "1.0", shadeColorFactor: [0.12, 0.2, 0.1] } } }
    ],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }], images: [{ bufferView: img0, mimeType: "image/png", name: "piel" }, { bufferView: img1, mimeType: "image/png", name: "sombra" }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    accessors: accesores, bufferViews: vistas, buffers: [{ byteLength: 0 }],
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: Object.assign({
          name: "Sintético de pruebas", version: "1", authors: ["Gemelo (sintético)"], copyrightInformation: "CC0 1.0: dominio público", contactInformation: "ninguno",
          licenseUrl: "https://vrm.dev/licenses/1.0/", avatarPermission: "everyone", commercialUsage: "corporation", creditNotation: "unnecessary", allowRedistribution: true, modification: "allowModificationRedistribution",
          allowExcessivelyViolentUsage: false, allowExcessivelySexualUsage: false, allowPoliticalOrReligiousUsage: false, allowAntisocialOrHateUsage: false
        }, meta),
        humanoid: { humanBones },
        expressions: { preset: { blink: { morphTargetBinds: [{ node: 18, index: 0, weight: 1 }], isBinary: true } } },
        lookAt: { type: "bone", offsetFromHeadBone: [0, 0.1, 0.1] }, firstPerson: { meshAnnotations: [{ node: 18, type: "auto" }] }
      },
      VRMC_springBone: {
        specVersion: "1.0", colliders: [{ node: 4, shape: { sphere: { offset: [0, 0.1, 0], radius: 0.1 } } }],
        colliderGroups: [{ name: "cabeza", colliders: [0] }], springs: [{ name: "cuello", joints: [{ node: 3, hitRadius: 0.02, stiffness: 1, gravityPower: 0, dragForce: 0.4 }, { node: 4, hitRadius: 0.02 }], colliderGroups: [0] }]
      }
    }
  };
  alinea();
  const bin = Buffer.concat(trozos); json.buffers[0].byteLength = bin.length;
  return empaquetaGlb(json, bin);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , salida, sub, px] = process.argv;
  if (!salida) { console.error("uso: node sintetico.mjs <salida.vrm> [subdivision] [pixeles]"); process.exit(2); }
  const b = generaVRM({ subdivision: sub ? +sub : 8, pixeles: px ? +px : 1280 });
  fs.writeFileSync(salida, b); console.log(salida + ": " + b.length + " bytes");
}
