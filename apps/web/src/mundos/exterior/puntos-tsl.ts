// Los puntos con el WebGPURenderer (A4-0, para las variantes apagadas de MU6: MATERIALES §5, «Los puntos», y MULTIVIEW §2.3). Con el backend WebGPU un punto
// (Points) mide siempre 1 px: el tamaño del material no vale. Lo que three ofrece (r186) es el MISMO PointsNodeMaterial dibujado sobre un objeto que no sea Points
// (un Sprite con count = n): entonces cada punto es un cuadrado de dos triángulos, instanciado, del tamaño de su size o su sizeNode en píxeles y con la misma
// atenuación por distancia que el WebGLRenderer (PointsNodeMaterial.setupVertexSprite).
//
// Cómo se usa sin tocar la lógica de cada módulo: con la variante TSL (material.isNodeMaterial), el módulo llama a espejoSprites(THREE, puntos) tras crear su
// Points. El Points sigue siendo el suyo (su geometría, su drawRange, su posición, su visibilidad), pero pasa a una capa que la cámara no dibuja (CAPA_OCULTA) y
// cuelga de él un Sprite con una geometría instanciada que lee los MISMOS arrays de la del Points (la posición de cada punto como «puntoPos»; el color y los demás
// atributos con su nombre) y sigue su drawRange y la versión de cada atributo antes de cada dibujo. En three las capas no se heredan: el hijo se dibuja.
// Los materiales leen la posición y la uv del punto con centroPunto y uvPunto, que valen igual en un Points y en el Sprite; su positionNode TIENE que ser el
// centro del punto (PointsNodeMaterial.setupPositionView: sin positionNode, el centro sería la esquina del cuadrado).
// COSTE [SIN MEDIR]: 2 triángulos por punto (la nube LiDAR: hasta su presupuesto de puntos × 2) y una segunda copia en la tarjeta de los atributos de cada
// Points (la del Points no se dibuja, pero three la sube si se dibujara). Hay que medirlo en el banco (MU6): es la «trampa del 1 px» de MULTIVIEW §2.3.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

/** la capa en la que se esconde el Points cuyo espejo dibuja (la cámara dibuja la 0) */
export const CAPA_OCULTA = 31;
/** el nombre del atributo de la posición de cada punto en la geometría del espejo (la «position» es la del cuadrado) */
export const POS_PUNTO = "puntoPos";

/** la posición del punto: en un Points, la de su vértice; en el espejo (Sprite), la del atributo por instancia */
export function centroPunto(T: A): A {
  return T.Fn(function (_e: A, b: A) { return b && b.object && !b.object.isPoints && b.geometry && b.geometry.hasAttribute(POS_PUNTO) ? T.attribute(POS_PUNTO, "vec3") : T.positionGeometry; })();
}
/** la uv dentro del punto ((0, 0) abajo a la izquierda): en un Points, gl_PointCoord vuelto (pointUV); en el espejo, la del cuadrado */
export function uvPunto(T: A): A {
  return T.Fn(function (_e: A, b: A) { return b && b.object && b.object.isPoints ? T.pointUV : T.uv(); })();
}

/** Cuelga del Points su espejo de sprites instanciados (ver arriba) y lo devuelve. Se suelta solo con la geometría del Points (su «dispose»). */
export function espejoSprites(THREE: A, puntos: A): A {
  const src = puntos.geometry, g = new THREE.InstancedBufferGeometry();
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  const pares: Array<[A, A]> = [];
  Object.keys(src.attributes).forEach(function (k) {
    const a = src.attributes[k], b = new THREE.InstancedBufferAttribute(a.array, a.itemSize, a.normalized);
    g.setAttribute(k === "position" ? POS_PUNTO : k, b); pares.push([a, b]);
  });
  const n = src.attributes.position ? src.attributes.position.count : 0;
  const s = new THREE.Sprite(puntos.material);
  s.geometry = g; s.name = (puntos.name || "puntos") + "-sprites"; s.frustumCulled = false; s.renderOrder = puntos.renderOrder;
  // antes de cada dibujo: cuántos (el drawRange del Points, desde 0: los módulos solo usan su count) y los datos nuevos (la versión de cada atributo).
  // Con 0 instancias three no dibuja (getDrawParameters devuelve null)
  s.onBeforeRender = function () {
    const dr = src.drawRange, k = Math.max(0, Math.min(n, isFinite(dr.count) ? dr.count : n));
    g.instanceCount = k; s.count = Math.max(1, k);
    for (let i = 0; i < pares.length; i++) { const p = pares[i] as [A, A]; if (p[1].version !== p[0].version) p[1].version = p[0].version; }
    if (s.material !== puntos.material) s.material = puntos.material;
  };
  puntos.layers.set(CAPA_OCULTA); puntos.add(s); puntos.userData.espejo = s;
  const suelta = function () { g.dispose(); if (s.parent) s.parent.remove(s); src.removeEventListener("dispose", suelta); };
  src.addEventListener("dispose", suelta);
  return s;
}
