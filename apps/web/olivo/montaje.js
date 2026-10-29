// Montaje: de una receta (arrays tipados, contratos/olivo-generado.md §2) a un THREE.Group con el three del ANFITRIÓN (r128 o 0.186).
// No calcula nada del árbol: copia los arrays a atributos. Cada InstancedMesh lleva userData.nodo (la rama que sostiene cada instancia) y el
// grupo userData.padre (el árbol de ramas), para cortar una rama con todo lo que sostiene.
import { atributoIndice, limitesDeInstancias } from "./compat.js";

const cacheCompartidas = new WeakMap();   // THREE → { geos → { nombre → BufferGeometry } }

function geometria(THREE, atrib, indice) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(atrib.position, 3));
  if (atrib.normal) g.setAttribute("normal", new THREE.BufferAttribute(atrib.normal, 3));
  if (atrib.uv) g.setAttribute("uv", new THREE.BufferAttribute(atrib.uv, 2));
  if (atrib.aHueco) g.setAttribute("aHueco", new THREE.BufferAttribute(atrib.aHueco, 1));
  if (atrib.aMuerta) g.setAttribute("aMuerta", new THREE.BufferAttribute(atrib.aMuerta, 1));
  if (indice) g.setIndex(atributoIndice(THREE, indice));
  g.computeBoundingSphere();
  return g;
}

/** Las geometrías compartidas (oliva, relleno, tocón, corte, ramita) del anfitrión, creadas una vez desde los arrays del núcleo */
export function compartidas(THREE, geos) {
  let porGeos = cacheCompartidas.get(THREE);
  if (!porGeos) { porGeos = new WeakMap(); cacheCompartidas.set(THREE, porGeos); }
  let c = porGeos.get(geos);
  if (!c) {
    c = {};
    for (const [k, a] of Object.entries(geos)) { c[k] = geometria(THREE, a.atrib, a.indice); c[k].userData.compartida = true; }
    porGeos.set(geos, c);
  }
  return c;
}

/**
 * @param THREE     el three del anfitrión
 * @param receta    lo que da recetaG (o el trabajador)
 * @param materiales { nombre → THREE.Material } (creaMateriales); falta uno → error
 * @param opciones  { geos: geosCompartidas del núcleo }
 * @returns THREE.Group en metros, +Y arriba, pivote en la base del tronco, norte = −Z; los niveles de detalle (E1, E2, E2-VR) los saca
 *          niveles.js (aNivel) de este grupo, que es el E0
 */
export function montaOlivo(THREE, receta, materiales, opciones) {
  const o = opciones || {};
  if (!o.geos) throw new Error("montaOlivo necesita opciones.geos (geosCompartidas)");
  const C = compartidas(THREE, o.geos), arbol = new THREE.Group();
  arbol.name = "olivo";
  const mat = n => { const m = materiales[n]; if (!m) throw new Error("falta el material «" + n + "»"); return m; };
  for (const p of receta.piezas) {
    let m;
    if (p.clase === "puntos") {   // olivas de E2 (niveles.js)
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p.posiciones, 3)); g.setAttribute("color", new THREE.BufferAttribute(p.colores, 3));
      g.computeBoundingSphere();
      m = new THREE.Points(g, mat(p.mat));
      if (p.nodo) m.userData.nodo = p.nodo;
    } else if (p.clase === "malla") {
      const g = geometria(THREE, p.atrib, p.indice);
      if (p.rejilla) g.userData.rejilla = p.rejilla;   // tubo de (segs+1) × (rad+1) vértices: lo usa aNivel para bajar su resolución
      m = new THREE.Mesh(g, mat(p.mat));
    } else {
      m = new THREE.InstancedMesh(C[p.geo], mat(p.mat), p.n);
      m.instanceMatrix.array.set(p.matrices); m.instanceMatrix.needsUpdate = true;
      let col = p.colores;
      if (!col && p.geo === "corte") { col = new Float32Array(p.n * 3); for (let i = 0; i < p.n; i++) col.set(receta.corte, i * 3); }  // color del corte por árbol
      if (col) m.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      if (p.nodo) m.userData.nodo = p.nodo;
      limitesDeInstancias(m);
    }
    m.name = p.mat;
    if (p.rol) m.userData.rol = p.rol;   // ramas, brotes, ramitas, relleno, olivas (como el MOTOR de la maqueta)
    m.position.fromArray(p.pos); m.quaternion.fromArray(p.rot); m.scale.fromArray(p.esc);
    m.castShadow = p.sombra[0]; m.receiveShadow = p.sombra[1];
    if (p.prof) m.customDepthMaterial = mat(p.prof);
    arbol.add(m);
  }
  arbol.scale.fromArray(receta.escala);
  arbol.userData.padre = receta.padre;
  arbol.userData.alto = receta.medidas.altura_m; arbol.userData.copa = receta.medidas.copa_m;   // como la maqueta (aclareo de E2-VR)
  arbol.userData.olivo = { v: receta.v, entrada: receta.entrada, medidas: receta.medidas, cuenta: receta.cuenta };
  return arbol;
}

/** Triángulos que dibuja un grupo montado (instancias incluidas) */
export function triangulosDe(grupo) {
  let t = 0;
  grupo.traverse(m => { if (!m.geometry || m.isPoints) return; const g = m.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3; t += c * (m.isInstancedMesh ? m.count : 1); });
  return t;
}

/** Libera las geometrías propias del árbol (las compartidas no: son de todos) */
export function liberaOlivo(grupo) {
  grupo.traverse(m => { if (m.geometry && !m.geometry.userData.compartida) m.geometry.dispose(); if (m.isInstancedMesh && m.dispose) m.dispose(); });
}
