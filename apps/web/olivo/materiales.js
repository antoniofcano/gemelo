// Materiales del olivo (los de la referencia): corteza (foto de campo o dibujada), pies con oquedades y madera muerta (sombreador de marcas),
// musgo, madera muerta, raíces, corte de poda, tutor, olivas, relleno y ramitas con recorte alfa (alphaTest) y sus materiales de sombra.
// Los colores se ponen con setRGB (valores lineales tal cual, como en r128) para que el número sea el mismo con three 0.128 y 0.186.
// `parche(material, nombre)` permite al anfitrión encadenar su propio onBeforeCompile (p. ej. el parcheTiempo del gemelo: luz, nubes y helada).
import { colorLineal, texturaDeColor, uvDelMapa } from "./compat.js";
import { ESTADOS } from "./tipos.js";
import { dibujaCorteza, dibujaRamita, dibujaRelleno } from "./texturas.js";

/** Nombres de material que puede pedir una receta (montaOlivo falla si falta uno) */
export const MATERIALES = ["corteza", "pies", "musgo", "muerta", "raiz", "corte", "tutor", "oliva", "relleno", "relleno_sombra",
  "ramita0", "ramita1", "ramita0_sombra", "ramita1_sombra", "puntos"];

/** Encadena un onBeforeCompile al que ya tenga el material, y da a la combinación su propia clave de programa */
export function encadena(mat, fn, clave) {
  const previo = mat.onBeforeCompile, clavePrevia = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  mat.onBeforeCompile = function (sh, r) { if (previo) previo.call(this, sh, r); fn.call(this, sh, r); };
  mat.customProgramCacheKey = () => clavePrevia() + "|" + (clave || fn.toString().length);
  return mat;
}

/** Las marcas por vértice de los pies (aHueco: oquedad que oscurece; aMuerta: madera sin corteza con su foto), como conMarcas() de la referencia */
function conMarcas(THREE, mat, texMuerta) {
  const vUv = uvDelMapa(THREE);
  return encadena(mat, sh => {
    sh.uniforms.tMuerta = { value: texMuerta };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aHueco; attribute float aMuerta; varying float vHueco; varying float vMuerta;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHueco=aHueco; vMuerta=aMuerta;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D tMuerta; varying float vHueco; varying float vMuerta;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n#ifdef USE_MAP\n" + (texMuerta ? " diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(tMuerta," + vUv + "*vec2(0.5,0.6)).rgb*1.12,smoothstep(0.15,0.55,vMuerta));\n" : "") +
        "#endif\n diffuseColor.rgb*=mix(1.0,0.09,smoothstep(0.25,0.85,vHueco));");
  }, "marcas" + (texMuerta ? "+muerta" : ""));
}

/**
 * @param THREE     el three del anfitrión
 * @param fotos     lo que da cargaFotos() ({corteza, musgo, muerta: ImageBitmap|null}) o null (sin fotos: corteza dibujada y colores lisos)
 * @param opciones  { epoca (las ramitas y el relleno llevan flor según la época; por defecto "envero"), parche(material, nombre), srgb (marca
 *                  las texturas como sRGB, para un anfitrión con gestión de color; por defecto no, como r128) }
 * @returns { nombre → material } y además .avisos (lo que falta) y .libera()
 */
export function creaMateriales(THREE, fotos, opciones) {
  const o = opciones || {}, f = fotos || {}, avisos = [].concat(f.avisos || []), texturas = [];
  const flor = (ESTADOS[o.epoca || "envero"] || ESTADOS.envero).flor;
  const tex = (img, desdeBitmap) => {
    if (!img) return null;
    const t = desdeBitmap ? new THREE.Texture(img) : new THREE.CanvasTexture(img);
    if (desdeBitmap) t.flipY = false;   // el ImageBitmap ya viene volteado (texturas.js)
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.needsUpdate = true;
    if (o.srgb) texturaDeColor(THREE, t);
    texturas.push(t); return t;
  };
  const S = (props, hex) => { const m = new THREE.MeshStandardMaterial(props); colorLineal(m.color, hex); return m; };
  const dibujada = dibujaCorteza();
  if (!dibujada) avisos.push("sin lienzo (OffscreenCanvas ni documento): materiales sin textura dibujada");
  const texCorteza = tex(f.corteza, true) || tex(dibujada, false), conFoto = !!f.corteza;
  const texMusgo = tex(f.musgo, true), texMuerta = tex(f.muerta, true);
  const D = THREE.DoubleSide;
  const M = {};
  M.corteza = S({ map: texCorteza, roughness: 0.95, side: D }, conFoto ? 0xe6e0d6 : 0xbdb6a8);
  M.pies = conMarcas(THREE, S({ map: texCorteza, roughness: 0.95, side: D }, conFoto ? 0xe6e0d6 : 0xbdb6a8), texMuerta);
  M.musgo = conMarcas(THREE, S({ map: texMusgo || texCorteza, roughness: 0.97, side: D }, texMusgo ? 0xe6e0d6 : 0xa9a28f), texMuerta);
  M.muerta = S({ map: texMuerta, roughness: 0.8, side: D }, texMuerta ? 0xf0ebe3 : 0xcfc6b8);
  M.raiz = S({ map: texCorteza, roughness: 0.95, side: D }, 0xf4efe6);
  M.corte = S({ roughness: 0.85, side: D }, 0xffffff);   // el color del corte va por instancia (receta.corte)
  M.tutor = S({ roughness: 0.9 }, 0xcdb88f);
  M.oliva = S({ roughness: 0.5 }, 0xffffff);
  const ramitas = [dibujaRamita(11, flor), dibujaRamita(29, flor)].map(c => { const t = tex(c, false); if (t) t.anisotropy = 4; return t; });
  const texRel = tex(dibujaRelleno(flor), false); if (texRel) texRel.anisotropy = 4;
  M.relleno = S({ map: texRel, alphaTest: 0.5, side: D, roughness: 0.9 }, 0xffffff);
  M.relleno_sombra = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texRel, alphaTest: 0.5 });
  [0, 1].forEach(i => {
    M["ramita" + i] = S({ map: ramitas[i], alphaTest: 0.45, side: D, roughness: 0.85 }, 0xffffff);
    M["ramita" + i + "_sombra"] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ramitas[i], alphaTest: 0.45 });
  });
  M.puntos = new THREE.PointsMaterial({ size: 0.045, vertexColors: true });
  if (o.parche) for (const n of MATERIALES) o.parche(M[n], n);
  Object.defineProperty(M, "avisos", { value: avisos });
  Object.defineProperty(M, "libera", { value: () => { texturas.forEach(t => t.dispose()); MATERIALES.forEach(n => M[n].dispose()); } });
  return M;
}
