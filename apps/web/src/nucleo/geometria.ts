// AG-1.13b: varias geometrías indexadas en una sola, con su color por vértice. La usan la fauna (aves y conejos, src/mundos/exterior/fauna.ts) y los perros
// (perros.ts) para dibujar cada pieza con una InstancedMesh en lugar de una malla por caja. Antes vivía dentro de 16b_fauna.js (AG-1.13) y luego en
// apps/web/motor/02k_fusiona.js; MU5-n (A3-8a): aquí, y el módulo del motor queda de talón (`var fusionaGeometrias = Nucleo.creaFusionaGeometrias(THREE);`).
// No importa three (MUNDOS §1: el núcleo no lo importa salvo el renderizador): recibe la BufferGeometry y el BufferAttribute de quien la crea.
//   fusionaGeometrias(partes, conUv?)   partes = [[geometría indexada, THREE.Color], …]; devuelve la BufferGeometry fusionada (position, normal, color, index Uint16 y, si
//                                       conUv, uv: para los perros con la textura del pelaje) y libera (dispose) las de entrada.

/** Lo que se usa de three: BufferGeometry y BufferAttribute. */
export interface ThreeGeometria { BufferGeometry: new () => any; BufferAttribute: new (a: ArrayLike<number>, n: number) => any }
/** Una pieza: la geometría indexada (de three) y su color ({ r, g, b }, un THREE.Color). */
export type ParteGeometria = [any, { r: number; g: number; b: number }];

export function creaFusionaGeometrias(THREE: ThreeGeometria) {
  return function fusionaGeometrias(partes: ParteGeometria[], conUv?: boolean) {
    var nv = 0, ni = 0; partes.forEach(function (p) { nv += p[0].attributes.position.count; ni += p[0].index.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = conUv ? new Float32Array(nv * 2) : null, idx = new Uint16Array(ni), o = 0, oi = 0;
    partes.forEach(function (p) {
      var g = p[0], n = g.attributes.position.count, c = p[1]; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      for (var k = 0; k < n; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
      for (var t = 0; t < g.index.count; t++) idx[oi + t] = g.index.array[t] + o;
      o += n; oi += g.index.count; g.dispose();
    });
    var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
  };
}
