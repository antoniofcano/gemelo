// AG-1.5a: cuánto trabajo hay entre dos `yield` del generador del lote de olivos generados (construyeG de apps/web/motor/07ab_generados.js), en Node,
// con lotes REALES del fixture de Hituelo (?olivos=gen y ?olivos=escalera). Cada next() del generador es un bloque atómico: la cola propia de
// Generados (corre) no puede partirlo, así que su coste entero cae en el fotograma que lo ejecuta.
// Por tramo (de un yield al siguiente) registra:
//   - recuentos DETERMINISTAS (el guardián pruebas/guardianes/lote_tramos.test.js pone topes a estos, no a los ms): geometrías añadidas a las mallas
//     por lotes y sus vértices e índices copiados (y los de la mayor de ellas, geoMayor: un addGeometry de three es atómico), instancias escritas (addInstance de BatchedMesh, setMatrixAt de InstancedMesh y puntos), mallas
//     creadas, bytes de búfer reservados (atributos y texturas de las mallas por lotes; matrices, colores y aFun de las instanciadas) e instancias
//     recorridas al calcular cajas y esferas (y cuántos de esos cálculos: cada uno es atómico, de three);
//   - ms de Node (mediana de REPS repeticiones): un indicador RELATIVO entre tramos, no los ms de Chrome ni los de un aparato.
// Y la huella sha256 del lote acabado (matrices, colores, geometrías, puntos, lo que sale): con ella se comprueba que repartir el trabajo en más
// tramos no cambia el resultado. Escribe una línea JSON {mal, lotes: [...], top: [...], maximos, huellas}.
// Uso: node pruebas/olivo/lote_tramos.mjs [--reps N] [--top N]   (GEMELO_TRAMOS_REPS); sin el fixture (npm run fixture), mal no queda vacío.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RAIZ, THREE, contexto, espera } from "./_contexto_generados.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const REPS = arg("--reps", Number(process.env.GEMELO_TRAMOS_REPS || 5)), TOP = arg("--top", 5);
const mal = [];

// ---- three con contadores: las mallas del lote son subclases que apuntan lo que hacen (el motor no lo nota: instanceof y is* siguen valiendo)
const cnt = {}, registro = [], ops = {};   // ops: ms de Node por operación en el tramo (diagnóstico, fuera de lo determinista)
function cero() { Object.assign(cnt, { geometrias: 0, vertices: 0, indices: 0, instancias: 0, mallas: 0, cajas: 0, calculos: 0, geoMayor: 0 }); for (const k in ops) delete ops[k]; }
function cronometra(nombre, f) { const t0 = process.hrtime.bigint(), r = f(); ops[nombre] = (ops[nombre] || 0) + Number(process.hrtime.bigint() - t0) / 1e6; return r; }
cero();
class BM extends THREE.BatchedMesh {
  constructor(...a) { const t0 = process.hrtime.bigint(); super(...a); registro.push(this); cnt.mallas++; ops.nuevaBatched = (ops.nuevaBatched || 0) + Number(process.hrtime.bigint() - t0) / 1e6; }
  addGeometry(g, ...a) {
    const n = g.attributes.position.count + (g.index ? g.index.count : 0);
    cnt.geometrias++; cnt.vertices += g.attributes.position.count; cnt.indices += g.index ? g.index.count : 0; cnt.geoMayor = Math.max(cnt.geoMayor, n);
    return cronometra("addGeometry", () => super.addGeometry(g, ...a)); }
  addInstance(id) { cnt.instancias++; return super.addInstance(id); }
  computeBoundingBox() { cnt.cajas += this.instanceCount; cnt.calculos++; return cronometra("cajaBatched", () => super.computeBoundingBox()); }
  computeBoundingSphere() { cnt.cajas += this.instanceCount; cnt.calculos++; return cronometra("esferaBatched", () => super.computeBoundingSphere()); }
}
class IM extends THREE.InstancedMesh {
  // el constructor de three llena las matrices con la identidad (setMatrixAt de cada una): eso cuenta en bytes, no en instancias escritas
  constructor(...a) { const t0 = process.hrtime.bigint(); IM.construyendo = true; super(...a); IM.construyendo = false; registro.push(this); cnt.mallas++; ops.nuevaInstanciada = (ops.nuevaInstanciada || 0) + Number(process.hrtime.bigint() - t0) / 1e6; }
  setMatrixAt(i, m) { if (!IM.construyendo) cnt.instancias++; return super.setMatrixAt(i, m); }
  computeBoundingBox() { cnt.cajas += this.count; cnt.calculos++; return cronometra("cajaInstanciada", () => super.computeBoundingBox()); }
  computeBoundingSphere() { cnt.cajas += this.count; cnt.calculos++; return cronometra("esferaInstanciada", () => super.computeBoundingSphere()); }
}
class PT extends THREE.Points { constructor(...a) { super(...a); registro.push(this); cnt.mallas++; } }
const T3 = Object.assign({}, THREE, { BatchedMesh: BM, InstancedMesh: IM, Points: PT });
// los bytes reservados por las mallas registradas (lo que ya existe en este momento)
function bytesDe(o) {
  let b = 0; const tex = t => (t && t.image && t.image.data ? t.image.data.byteLength : 0);
  if (o.isBatchedMesh) {
    Object.values(o.geometry.attributes).forEach(a => { b += a.array.byteLength; }); if (o.geometry.index) b += o.geometry.index.array.byteLength;
    b += tex(o._matricesTexture) + tex(o._indirectTexture) + tex(o._colorsTexture);
  } else if (o.isInstancedMesh) {
    b += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
    Object.values(o.geometry.attributes).forEach(a => { if (a.isInstancedBufferAttribute) b += a.array.byteLength; });
  } else if (o.isPoints) Object.values(o.geometry.attributes).forEach(a => { b += a.array.byteLength; });
  return b;
}
const bytes = () => registro.reduce((s, o) => s + bytesDe(o), 0);

// ---- la huella del lote acabado: todo lo que se dibuja y lo que sale
function huella(out) {
  const h = crypto.createHash("sha256"), m = new THREE.Matrix4(), c = new THREE.Vector4(), f = a => h.update(Buffer.from(new Float64Array(a).buffer));
  const arr = a => h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  for (const ch of out.children) {
    h.update(ch.type + ":" + ch.name + "|");
    if (ch.isBatchedMesh) {
      h.update(ch.instanceCount + "/" + ch._maxInstanceCount + "/" + ch._maxVertexCount + "/" + ch._maxIndexCount + "|");
      for (let i = 0; i < ch.instanceCount; i++) { ch.getMatrixAt(i, m); f(m.elements); ch.getColorAt(i, c); f(c.toArray()); h.update(ch.getGeometryIdAt(i) + (ch.getVisibleAt(i) ? "v" : "o")); }
      Object.keys(ch.geometry.attributes).sort().forEach(k => { h.update(k); arr(ch.geometry.attributes[k].array); }); if (ch.geometry.index) arr(ch.geometry.index.array);
      f(ch.boundingBox.min.toArray().concat(ch.boundingBox.max.toArray(), ch.boundingSphere.center.toArray(), [ch.boundingSphere.radius]));
    } else if (ch.isInstancedMesh) {
      h.update(ch.count + "|"); arr(ch.instanceMatrix.array); arr(ch.instanceColor.array); arr(ch.geometry.attributes.aFun.array);
      f(ch.boundingSphere.center.toArray().concat([ch.boundingSphere.radius], ch.boundingBox.min.toArray(), ch.boundingBox.max.toArray()));
    } else if (ch.isPoints) {
      ["position", "color", "aFun"].forEach(k => arr(ch.geometry.attributes[k].array)); f(ch.geometry.boundingSphere.center.toArray().concat([ch.geometry.boundingSphere.radius]));
    }
  }
  const S = out.userData.salen;
  if (S) h.update(JSON.stringify({ B: Object.fromEntries(Object.entries(S.B).map(([k, v]) => [k, v.ids])), I: Object.fromEntries(Object.entries(S.I).map(([k, v]) => [k, v.n])), P: S.P ? S.P.n : null }));
  return h.digest("hex").slice(0, 24);
}
const mediana = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// un lote: REPS veces el generador entero, tramo a tramo. Los recuentos deben salir iguales en cada repetición (si no, no son deterministas)
function mideLote(G, sel) {
  const items = G._prueba.elementos(sel), tramos = [], ms = [], opsT = []; let hu = null;
  for (let rep = 0; rep < REPS; rep++) {
    registro.length = 0;
    const gen = G._prueba.construye(items); let k = 0, r = null;
    do {
      cero(); const b0 = bytes(), t0 = process.hrtime.bigint();
      r = gen.next();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6, rec = Object.assign({ bytes: bytes() - b0 }, cnt);
      if (rep === 0) { tramos.push(rec); ms.push([]); opsT.push({}); }
      else if (JSON.stringify(tramos[k]) !== JSON.stringify(rec)) mal.push("los recuentos del tramo " + k + " cambian entre repeticiones");
      Object.keys(ops).forEach(o => { (opsT[k][o] = opsT[k][o] || []).push(ops[o]); });
      ms[k].push(dt); k++;
    } while (!r.done);
    if (!r.value) { mal.push("el generador del lote no devuelve el grupo"); return null; }
    const hh = huella(r.value); if (hu && hh !== hu) mal.push("la huella del lote cambia entre repeticiones"); hu = hh;
    r.value.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.dispose && (o.isBatchedMesh || o.isInstancedMesh)) o.dispose(); });
  }
  tramos.forEach((t, i) => { t.i = i; t.ms = +mediana(ms[i]).toFixed(2); t.msOps = Object.fromEntries(Object.entries(opsT[i]).map(([o, v]) => [o, +mediana(v).toFixed(2)])); });
  const arboles = new Set(sel.map(p => p.c.i)).size, niveles = {};
  sel.forEach(p => { niveles[p.niv] = (niveles[p.niv] || 0) + 1; });
  return { arboles, piezas: sel.length, niveles, tramos: tramos.length, huella: hu, msTotal: +tramos.reduce((s, t) => s + t.ms, 0).toFixed(1), detalle: tramos };
}

// ---- los lotes reales: el fixture de Hituelo, recorrido como en generados_motor.mjs (2b y 2c); cada lote nuevo que se coloca se mide al momento
// (sus recetas aún están: colocaLote solo suelta las propias que ya no usa)
const FX = path.join(RAIZ, "pruebas", "salida", "fixture", "hituelo", "indice.json");
const lotes = [];
if (!fs.existsSync(FX)) mal.push("sin el fixture (npm run fixture): los tramos NO se han medido");
else {
  const I = JSON.parse(fs.readFileSync(FX, "utf8"));
  for (const busqueda of ["?olivos=gen", "?olivos=escalera"]) {
    const cx = contexto(busqueda, null, { THREE: T3 });
    for (let k = 0; k < 20 && cx.__G.estado() === "cargando"; k++) await espera();
    if (cx.__G.estado() !== "activo") { mal.push(busqueda + ": Generados no arranca (" + cx.__G.estado() + ")"); continue; }
    Object.assign(cx.D, { copas: I.copas, copas_id: I.copas_id, copas_param: I.copas_param, copas_semilla: I.copas_semilla, centro_utm: I.centro_utm });
    const ol = I.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] })).filter(c => !(c.h > 8));
    const x0 = Math.min(...ol.map(c => c.x)), x1 = Math.max(...ol.map(c => c.x)), y0 = ol.reduce((s, c) => s + c.y, 0) / ol.length;
    let ultimo = null;
    // paseando a 1,7 m por el centro del fixture, de oeste a este, con paradas hasta que el lote de cada parada esté dibujado
    for (let n = 0; n <= 4; n++) {
      const fx = x0 + (x1 - x0) * n / 4, fz = -y0; cx.camera.position.set(fx, 1.7, fz);
      for (let r = 0; r < 40; r++) {
        cx.__G.actualiza(fx, fz, 550000, ol, 1, false);
        for (let f = 0; f < 200; f++) {
          cx.__G.paso(0.1, 50);
          const lo = cx.__G._prueba.lote();
          if (lo && lo !== ultimo) { ultimo = lo; const m = mideLote(cx.__G, cx.__G._prueba.selLote()); if (m) lotes.push(Object.assign({ modo: busqueda.slice(8), parada: n }, m)); }
        }
        if (cx.__G.pendientes() === 0) break;
      }
    }
  }
  if (!lotes.length) mal.push("no se colocó ningún lote en el fixture");
}

// los tramos más largos (por ms de Node) y los máximos por recuento, de todos los lotes
const todos = lotes.flatMap((l, j) => l.detalle.map(t => Object.assign({ lote: j, modo: l.modo, de: l.tramos }, t)));
const top = todos.slice().sort((a, b) => b.ms - a.ms).slice(0, TOP);
const maximos = {};
["geometrias", "vertices", "indices", "instancias", "mallas", "bytes", "cajas", "calculos", "geoMayor"].forEach(k => { maximos[k] = todos.reduce((m, t) => Math.max(m, t[k]), 0); });
maximos.msNode = todos.reduce((m, t) => Math.max(m, t.ms), 0);
const salida = { mal, reps: REPS, lotes: lotes.map(l => { const o = Object.assign({}, l); delete o.detalle; return o; }), top, maximos, huellas: lotes.map(l => l.modo + "/" + l.parada + ":" + l.huella) };
if (process.argv.includes("--detalle")) salida.detalle = lotes.map(l => l.detalle);
console.log(JSON.stringify(salida));
