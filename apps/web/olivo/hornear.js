// Hornear y exportar (hornear() y exportarGLB() de la referencia): el árbol tal cual, con las instancias horneadas en mallas normales
// (glTF básico no tiene instancias), las oquedades y la madera muerta en el color de vértice. El GLTFExporter lo pone el anfitrión.
import { exportaGlb } from "./compat.js";

export function hornear(THREE, src) {
  const out = new THREE.Group(); out.name = "olivo"; out.scale.copy(src.scale);
  const m4 = new THREE.Matrix4(), mi = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  src.updateMatrixWorld(true);
  src.children.forEach(o => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, idx = g.index ? g.index.array : null;
    const cnt = o.isInstancedMesh ? o.count : 1, nv = P.count;
    const pos = new Float32Array(nv * cnt * 3), nor = new Float32Array(nv * cnt * 3), uv = U ? new Float32Array(nv * cnt * 2) : null, col = new Float32Array(nv * cnt * 3);
    const ni = idx ? idx.length * cnt : nv * cnt, ind = ni > 0 && nv * cnt > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const H_ = g.attributes.aHueco, M_ = g.attributes.aMuerta;
    let w = 0;
    for (let k = 0; k < cnt; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m4.multiplyMatrices(o.matrix, mi); } else m4.copy(o.matrix);
      n3.getNormalMatrix(m4);
      if (o.isInstancedMesh && o.instanceColor) o.getColorAt(k, c); else c.setRGB(1, 1, 1);
      for (let i = 0; i < nv; i++) {
        const j = k * nv + i;
        v.fromBufferAttribute(P, i).applyMatrix4(m4); pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); nor[j * 3] = v.x; nor[j * 3 + 1] = v.y; nor[j * 3 + 2] = v.z;
        if (uv) { uv[j * 2] = U.getX(i); uv[j * 2 + 1] = U.getY(i); }
        let r = c.r, gg = c.g, b = c.b;
        if (H_) {
          const h = Math.min(1, Math.max(0, (H_.getX(i) - 0.25) / 0.6)), mu = Math.min(1, Math.max(0, (M_.getX(i) - 0.15) / 0.4));
          const f = 1 - 0.9 * h; r *= f * (1 + 0.45 * mu); gg *= f * (1 + 0.4 * mu); b *= f * (1 + 0.3 * mu);
        }
        col[j * 3] = r; col[j * 3 + 1] = gg; col[j * 3 + 2] = b;
      }
      if (idx) for (let t = 0; t < idx.length; t++) ind[w++] = idx[t] + k * nv; else for (let t = 0; t < nv; t++) ind[w++] = t + k * nv;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(ind, 1));
    const om = Array.isArray(o.material) ? o.material[0] : o.material;
    const mat = new THREE.MeshStandardMaterial({ map: om.map || null, color: om.color.clone(), roughness: om.roughness, metalness: 0,
      side: om.side, alphaTest: om.alphaTest || 0, vertexColors: true });
    const m = new THREE.Mesh(geo, mat); m.name = o.isInstancedMesh ? "instancias" : "madera"; out.add(m);
  });
  return out;
}

/** glb (ArrayBuffer) del árbol horneado, con el GLTFExporter que pase el anfitrión (`new GLTFExporter()`) */
export function glb(THREE, grupo, exportador, opciones) {
  return exportaGlb(exportador, hornear(THREE, grupo), Object.assign({ binary: true, maxTextureSize: 1024 }, opciones || {}));
}
