// Lo que cambia entre three r128 (el gemelo hasta la F1c, ADR-0016; y el three-gen del generador) y 0.186 (el gemelo desde la F1c): el resto del módulo pasa por aquí
// y no pregunta por la versión. Probado con 0.128.0 y 0.186.1 (pruebas/guardianes/olivo.test.js).

/** Número de revisión del three del anfitrión (128, 186…) */
export const revision = THREE => parseInt(THREE.REVISION, 10);

/** Marca una textura de color (fotos, dibujos) como sRGB: `encoding = sRGBEncoding` hasta r151, `colorSpace = SRGBColorSpace` desde r152 */
export function texturaDeColor(THREE, tex) {
  if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/**
 * Color de material en valores LINEALES tal cual (como los trataba r128). Desde r152, `new Color(0xrrggbb)` y `color.set(hex)` convierten
 * de sRGB a lineal; `setRGB(r, g, b)` sin espacio de color no convierte en ninguna versión. Así el número es el mismo en las dos.
 */
export function colorLineal(color, hex) {
  return color.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/** Fusiona geometrías: `BufferGeometryUtils.mergeBufferGeometries` (r128) o `mergeGeometries` (desde r151). `utils` lo pasa el anfitrión */
export function fusiona(utils, geos, grupos) {
  const f = utils.mergeGeometries || utils.mergeBufferGeometries;
  if (!f) throw new Error("BufferGeometryUtils sin mergeGeometries ni mergeBufferGeometries");
  return f.call(utils, geos, !!grupos);
}

/** Nombre del varying de coordenadas de textura del mapa en el sombreador: `vUv` hasta r150, `vMapUv` desde r151 */
export const uvDelMapa = THREE => (revision(THREE) >= 151 ? "vMapUv" : "vUv");

/**
 * Recorte por frustum de una InstancedMesh. En r128 la malla instanciada se recorta con la esfera de su geometría BASE (una ramita de 0,6 m
 * en el origen del árbol), así que un árbol de 9 m desaparecería al salir su pie de la vista: se desactiva el recorte. Desde r151 hay
 * `computeBoundingSphere()` de las instancias y se usa.
 */
export function limitesDeInstancias(im) {
  if (typeof im.computeBoundingSphere === "function" && im.isInstancedMesh) { im.computeBoundingSphere(); im.frustumCulled = true; }
  else im.frustumCulled = false;
  return im;
}

/** Exporta a glb con el GLTFExporter del anfitrión: `parseAsync` (r15x+) o `parse(objeto, ok, opciones)` (r128) */
export function exportaGlb(exportador, objeto, opciones) {
  const o = Object.assign({ binary: true }, opciones || {});
  if (typeof exportador.parseAsync === "function") return exportador.parseAsync(objeto, o);
  return new Promise((ok, ko) => {
    try {
      if (exportador.parse.length >= 4) exportador.parse(objeto, ok, ko, o);   // firma nueva: (input, onDone, onError, options)
      else exportador.parse(objeto, ok, o);
    } catch (e) { ko(e); }
  });
}

/** Índice como atributo: Uint16 si cabe (WebGL1 sin OES_element_index_uint), Uint32 si no; como hace three con un array */
export function atributoIndice(THREE, indice) {
  let max = 0; for (let i = 0; i < indice.length; i++) if (indice[i] > max) max = indice[i];
  return max > 65535 ? new THREE.BufferAttribute(indice, 1) : new THREE.BufferAttribute(Uint16Array.from(indice), 1);
}
