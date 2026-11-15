// Los olivos LEJANOS de la escalera (MU5-n, A3-2b; antes apps/web/motor/07ac_lejanos.js, que queda como talón). Componente «lejanos» de los mundos ["exterior"] con un
// libera() que suelta de verdad: la malla instanciada, su geometría y su material, las dos texturas de los atlas (y las imágenes decodificadas de sus ImageBitmap), la
// textura de siluetas, el blanco del horneado del sustituto y el trabajo «Lsil» de la Cola.
// L2-08 (auditoría de noviembre de 2026): los ImageBitmap de los atlas de impostores se pasaban a THREE.Texture y nunca se les hacía close() (three no los cierra al
// hacer dispose: solo los detecta; los atlas suman 26,7 MiB de GPU y la imagen decodificada se quedaba en la memoria del proceso toda la visita). Ahora cada textura cierra
// su bitmap al liberarse. Y si un atlas llegaba y el otro fallaba, Promise.all fallaba y la textura que sí llegó se quedaba sin liberar: ahora se espera a los dos
// (allSettled) y la que llegó se libera.
// Medido / deducido / ilustrativo (regla 5): los impostores son la imagen de la variante de olivo generada (ILUSTRATIVA, con las medidas de la copa del LiDAR); de lejos
// solo la ortofoto es medida.
// Del legado recibe por argumento lo que necesita (THREE, el renderizador, el Estado, el grupo de los olivos, la Cola, Generados y la fábrica de materiales).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";
import { fundidoTsl } from "./generados-sombreado.ts";
import { colorSrgbTsl } from "./tiempo-parche.ts";
import { aplicaInstancia, columnaInstancia } from "../comun/instancia-tsl.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo; el motor son números, arrays y GLSL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsLejanos {
  THREE: T3;
  renderer: T3;
  Estado: { exag: number };
  gArboles: { add(o: unknown): void; remove(o: unknown): void; visible: boolean };
  Materiales: Materiales;
  /** 02b: la Cola del exterior (pon, cancela) */
  ColaExt: { pon(clave: string, prio: number, gen: Generator, fin?: (v: unknown) => void): unknown; cancela(clave: string): unknown } | null;
  /** 07ab: los olivos generados y sus lejanos (el constructor, los parches de luz y de fundido); se carga antes que este módulo */
  Generados: T3;
  /** fetch al mismo origen (los atlas <huella>.webp) y createImageBitmap: se reciben para probar sin red ni navegador */
  fetch(url: string, init?: unknown): Promise<T3>;
  crearBitmap(blob: unknown, opciones: unknown): Promise<T3>;
}

export const ID_LEJANOS = "lejanos";
/** los nombres de los materiales en la fábrica (tabla de MATERIALES §1, filas 14 y 15): son también la clave de su variante TSL */
export const MATERIAL_IMPOSTOR_LEJANO = "impostor-lejano";
export const MATERIAL_IMPOSTOR_SUSTITUTO = "impostor-sustituto";

export function creaLejanos(d: DepsLejanos) {
  const THREE = d.THREE, renderer = d.renderer, Estado = d.Estado, gArboles = d.gArboles, Materiales = d.Materiales, ColaExt = d.ColaExt, Generados = d.Generados;
  // activo(): con ?olivos=escalera desde el principio; con ?olivos=gen y variantes horneadas (O8c), cuando Generados lo decide con el manifiesto
  var activo = function () { return Generados.escalera(); }, via: string = activo() ? "esperando" : "apagado", motivo = "", U2 = 1600, CEL = 128, CAPA_S = 1, repartido = false;
  var olivos: any = null, malla: any = null, matrices: any = null, posDe: any = {}, exagM = -1, nv = 0, triPor = 0, texMiB = 0, rt: any = null, uCapa = { value: 0 }, tCapa = 0, avisoImp: any = false;
  var texImp: any[] = [];   // las dos texturas de los atlas de impostores (con sus ImageBitmap): se liberan con libera() (L2-08)
  const materiales = Materiales.de(ID_LEJANOS);   // los dos materiales (impostor y sustituto) se piden con dueño «lejanos» y se liberan con su libera()
  // MU5-n: los dos pasan por la fábrica (define + crea); el clásico es el de siempre, movido. Su parche es la misma función de siempre (three usa su texto como clave del programa)
  Materiales.define(MATERIAL_IMPOSTOR_LEJANO, { clasico: function (o: any) { return clasicoImpostor(o); } });
  Materiales.define(MATERIAL_IMPOSTOR_SUSTITUTO, { clasico: function (o: any) { return clasicoSustituto(o); } });
  function ponParche(m: any, _nombre: string, fn: any) { m.onBeforeCompile = fn; return m; }
  // ---- A4-0: las variantes TSL de los dos (MATERIALES §9), APAGADAS: solo con el WebGPURenderer (MU6). Las mismas cuentas que el GLSL de arriba, en nodos, con los
  // MISMOS { value } (uCapa, uCentro, uSemi, el uNVar del sustituto) y el fundido y la luz de los olivos generados (Generados.lejanos: sus uniformes uFun y uBanda y
  // los nodos del tiempo). NO se puede decir que sean equivalentes hasta las capturas de MU6. Lo que cambia por fuerza en nodos:
  //   · el marco de cada olivo (modelMatrix · instanceMatrix) se lee de la copia de la matriz de instancia (instancia-tsl.ts: three no deja leer la suya) y su
  //     inversa se hace a mano (WGSL no tiene inverse()): la de la parte 3 × 3 por sus cofactores, que también dan la matriz de las normales;
  //   · el mapa se lee en vOtUV dentro de colorNode (el NodeMaterial no deja cambiar el vMapUv de su mapa): el material TSL no lleva map;
  //   · la normal del atlas va en normalNode, en el espacio de la vista, como el clásico tras normal_fragment_maps;
  //   · three aplica la matriz de instancia ANTES de positionNode (r186): el positionNode la aplica él (aplicaInstancia), a lo que el clásico pone en «transformed».
  function lejanosTsl(c: any) {
    const W = c.THREE, T = c.TSL, L = Generados.lejanos || {};
    const capa = T.uniform(uCapa.value).onObjectUpdate(function () { return uCapa.value; });
    const ign = function (p: any) { return T.fract(T.fract(T.dot(p, T.vec2(0.06711056, 0.00583715))).mul(52.9829189)); };   // ot_ign
    const cubre = ign(T.screenCoordinate.xy.add(T.vec2(17, 31))).lessThan(capa);   // ot_ign(gl_FragCoord.xy + (17, 31)) < uCapa: se dibuja
    const fundido = L.uniformes ? fundidoTsl(T, L.uniformes) : null;   // el de los olivos generados (parcheFundido): el MISMO uFun y uBanda
    const nt = L.tiempoTsl ? L.tiempoTsl() : null, NT = nt ? nt(T) : null;   // la sombra de nubes y la escarcha (parcheLuz), en la posición del mundo
    function base(m: any, opciones: any) {
      Object.keys(opciones).forEach(function (k) { m[k] = opciones[k]; });
      Materiales.recorte(m);   // el alphaToCoverage de AG-2.1, como el clásico
      if (NT) m.outputNode = NT.salida(T.positionWorld.xz);
      return m;
    }
    return { W, T, capa, cubre, fundido, base };
  }
  function tslImpostor(o: any, c: any) {
    const { W, T, cubre, fundido, base } = lejanosTsl(c), tCol = o.tCol, tNor = o.tNor, f = o.f, tP = o.tP;
    const C: any[] = [], S: number[] = [];
    for (let k = 0; k < 4; k++) { const v = f.variantes[Math.min(k, f.variantes.length - 1)]; C.push(new W.Vector3().fromArray(v.centro)); S.push(v.semilado); }
    const uCentro = T.uniformArray(C, "vec3"), uSemi = T.uniformArray(S, "float");
    const k = T.int(T.attribute("aVar", "float").add(0.5)), kf = T.float(k), Ck = uCentro.element(k), Sk = uSemi.element(k);
    // el marco del árbol: IM = modelMatrix · instanceMatrix (columnas a0, a1, a2 y la traslación t)
    const col = function (j: number) { return T.modelWorldMatrix.mul(columnaInstancia(W, T, j)); };
    const a0 = col(0).xyz, a1 = col(1).xyz, a2 = col(2).xyz, t = col(3).xyz;
    const r0 = T.cross(a1, a2), r1 = T.cross(a2, a0), r2 = T.cross(a0, a1), det = T.dot(a0, r0);
    const invA = function (v: any) { return T.vec3(T.dot(r0, v), T.dot(r1, v), T.dot(r2, v)).div(det); };   // inverse(mat3(IM)) · v
    const d = T.normalize(invA(T.cameraPosition.sub(t)).sub(Ck));   // ot_d: la cámara en el marco del árbol, desde el centro de la variante
    const oct = function (v: any) { const y = T.max(0, v.y), s0 = T.abs(v.x).add(y).add(T.abs(v.z)), s = T.select(s0.greaterThan(0), s0, T.float(1)); return T.vec2(v.x.div(s).add(v.z.div(s)), v.x.div(s).sub(v.z.div(s))); };
    const dirV = function (ij: any) { const a = ij.x.mul(2 / 7).sub(1), b = ij.y.mul(2 / 7).sub(1), x = a.add(b).mul(0.5), z = a.sub(b).mul(0.5); return T.normalize(T.vec3(x, T.max(0, T.float(1).sub(T.abs(x)).sub(T.abs(z))), z)); };
    const marco = function (v: any) { const r0b = T.cross(T.vec3(0, 1, 0), v), r = T.select(T.length(r0b).lessThan(1e-6), T.vec3(1, 0, 0), T.normalize(r0b)); return { r, u: T.cross(v, r) }; };
    const ij = T.floor(T.clamp(oct(d).add(1).mul(3.5), 0, 7).add(0.5)), B = marco(d), BV = marco(dirV(ij));
    let off: any, xy: any = null;
    if (tP) {   // AG-2.2: el vértice aIdx del polígono de la celda (ij) de la variante, reproyectado al plano girado a la cámara
      const q = T.textureLoad(tP, T.ivec2(T.int(T.attribute("aIdx", "float").add(0.5)), k.mul(64).add(T.int(ij.y.add(0.5)).mul(8)).add(T.int(ij.x.add(0.5))))).xy.mul(2).sub(1);
      const m00 = T.dot(B.r, BV.r), m01 = T.dot(B.r, BV.u), m10 = T.dot(B.u, BV.r), m11 = T.dot(B.u, BV.u), dt = m00.mul(m11).sub(m10.mul(m01));   // mat2 ot_M (por columnas)
      const inv = T.vec2(m11.mul(q.x).sub(m10.mul(q.y)), m00.mul(q.y).sub(m01.mul(q.x))).div(dt);
      xy = T.select(T.abs(dt).greaterThan(1e-3), inv, q);
      off = B.r.mul(xy.x).add(B.u.mul(xy.y));
    } else off = B.r.mul(T.positionGeometry.x).add(B.u.mul(T.positionGeometry.y));
    const vOtQ = T.varying(T.vec2(T.dot(off, BV.r), T.dot(off, BV.u)));
    const vOtUV = T.varying(T.vec2(T.mod(kf, 2).mul(8).add(ij.x), T.floor(kf.div(2)).mul(8).add(ij.y)).add(T.vec2(T.dot(off, BV.r), T.dot(off, BV.u)).mul(0.5).add(0.5)).div(16));
    const vOtXY = xy ? T.varying(xy) : null;
    const n0 = T.varying(r0.div(det)), n1 = T.varying(r1.div(det)), n2 = T.varying(r2.div(det));   // transpose(inverse(mat3(IM))), por columnas
    const m = base(new W.MeshLambertNodeMaterial(), { alphaTest: 0.5 });
    m.positionNode = aplicaInstancia(W, T, Ck.add(off.mul(Sk)));   // transformed = ot_C + ot_off · ot_S y luego la instancia (three la aplica antes de positionNode)
    m.colorNode = colorSrgbTsl(T, T.materialColor.mul(T.texture(tCol, vOtUV)), false);
    const nAt = T.texture(tNor, vOtUV).xyz.mul(2).sub(1), nMundo = T.normalize(n0.mul(nAt.x).add(n1.mul(nAt.y)).add(n2.mul(nAt.z)));
    m.normalNode = T.normalize(T.cameraViewMatrix.mul(T.vec4(nMundo, 0)).xyz);
    let dentro = T.abs(vOtQ.x).lessThanEqual(1).and(T.abs(vOtQ.y).lessThanEqual(1)).and(cubre);
    if (vOtXY) dentro = dentro.and(T.abs(vOtXY.x).lessThanEqual(1)).and(T.abs(vOtXY.y).lessThanEqual(1));
    m.maskNode = fundido ? dentro.and(fundido) : dentro;
    return m;
  }
  function tslSustituto(o: any, c: any) {
    const { W, T, cubre, fundido, base } = lejanosTsl(c), tex = o.tex, tP = o.tP, uNV = { value: nv };
    const nV = T.uniform(uNV.value).onObjectUpdate(function () { return uNV.value; });
    const aVar = T.attribute("aVar", "float"), aVista = T.attribute("aVista", "float");
    const m = base(new W.MeshLambertNodeMaterial(), { alphaTest: 0.5, side: W.DoubleSide });
    let uv: any = T.uv();
    if (tP) {   // AG-2.2: el vértice aIdx del polígono de la celda (aVar, aVista): sus (u, w) dan la uv y la posición en el plano
      const pq = T.textureLoad(tP, T.ivec2(T.int(T.attribute("aIdx", "float").add(0.5)), T.int(aVar.add(0.5)).mul(2).add(T.int(aVista.add(0.5))))).xy;
      uv = pq;
      m.positionNode = aplicaInstancia(W, T, T.select(aVista.lessThan(0.5), T.vec3(pq.x.sub(0.5), pq.y, 0), T.vec3(0, pq.y, T.float(0.5).sub(pq.x))));
    }
    const vUv = T.varying(T.vec2(aVista, aVar).add(uv).div(T.vec2(2, nV)));
    m.colorNode = colorSrgbTsl(T, tex ? T.materialColor.mul(T.texture(tex, vUv)) : T.materialColor, false);   // sin horneado (sin GPU), como el clásico sin mapa
    m.maskNode = fundido ? cubre.and(fundido) : cubre;
    return m;
  }
  Materiales.define(MATERIAL_IMPOSTOR_LEJANO, { tsl: function (o: any, c: any) { return tslImpostor(o, c); } });
  Materiales.define(MATERIAL_IMPOSTOR_SUSTITUTO, { tsl: function (o: any, c: any) { return tslSustituto(o, c); } });   // lo que hacía Materiales.parchea sin clave propia, dentro del clásico del define
  var info = { dibujados: 0, entran: 0, salen: 0 }, sinGPU = false, cajas: any = null, ids: any = null;
  // AG-2.2 (?cartulina=silueta, doc/sistema/CARTULINAS.md): cada celda del atlas (impostor: variante × vista; sustituto: variante × plano) con el
  // polígono de K vértices que abraza lo opaco, en una textura de datos (K × celdas, RGBA32F: u, v de la celda) que el sombreador de vértices lee por
  // instancia con texelFetch. Impostor: los polígonos vienen con el atlas en la fila del manifiesto (tubería: `siluetas`); sustituto: se calculan al
  // hornear, por la Cola. Sin ellos, o con ?cartulina=rect (defecto), el cuadrado de siempre.
  var SIL_K = 6, tPoli: any = null, silInfo: any = null;
  function inicia(ls: any) { olivos = ls; olivos.forEach(function (c: any, k: any) { posDe[c.i] = k; }); }
  function hayCapa() { return via === "sustituto" || via === "impostor"; }
  // cada fotograma (desde 07b): en cuanto están las variantes E2, se monta la capa; luego entra con su tramado. true si el reparto debe rehacerse
  function paso(dt: any) {
    if (!activo()) return false;
    if (via === "apagado") via = "esperando";
    if (via === "esperando") {
      if (Generados.estado() === "sin") { via = "sin"; motivo = "sin constructor"; return true; }
      if (!Generados.activo() || !olivos) return false;
      var G = Generados.lejanos, n = G.nVariantes(), rs = [];
      for (var j = 0; j < n; j++) { var r = G.variante(j); if (!r) return false; rs.push(r); }
      nv = n; monta(rs); return true;
    }
    // al acabar de entrar, true: 07b reparte otra vez (con la escalera horneada, aparta entonces del tileset todos los olivos)
    if (hayCapa() && repartido && uCapa.value < 1) { tCapa += Math.min(dt, 0.1); uCapa.value = Math.min(1, tCapa / CAPA_S); return uCapa.value >= 1; }
    return false;
  }
  function monta(rs: any) {
    var f = Generados.lejanos.impostor();
    if (f && !f.motivo) { via = "cargando impostores"; impostores(f, rs).catch(function (e: any) { avisoImp = "impostores: " + String(e && e.message || e).slice(0, 80); sustituto(rs); }); return; }
    if (f && f.motivo) avisoImp = "impostores ignorados: " + f.motivo;
    sustituto(rs);
  }
  // ---- los impostores de O8b: los dos atlas, comprobados, y su material
  function atlas(a: any, srgb: any) {
    var M = Generados.lejanos.constructor();
    return d.fetch(Generados.lejanos.dir() + a.huella + ".webp", { credentials: "same-origin" })
      .then(function (r: any) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
      .then(function (ab: any) {
        var b = new Uint8Array(ab); if (b.length !== a.bytes) throw new Error("tamaño " + b.length + " ≠ " + a.bytes);
        return M.huellaBytes(b).then(function (h: any) {
          if (h !== a.huella) throw new Error("huella distinta");
          // fila 0 del fichero arriba y v hacia arriba (contrato §2): el mapa de bits se voltea al decodificarlo (three no voltea un ImageBitmap)
          return d.crearBitmap(new Blob([b], { type: "image/webp" }), { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
        });
      })
      .then(function (bm: any) {
        if (bm.width !== a.lado || bm.height !== a.lado) throw new Error("lado " + bm.width + " ≠ " + a.lado);
        var t = new THREE.Texture(bm); t.flipY = false; t.premultiplyAlpha = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
        t.addEventListener("dispose", function () { try { bm.close(); } catch (e) { /* ya cerrado */ } });   // L2-08: three no cierra el ImageBitmap al hacer dispose
        if (renderer.initTexture) renderer.initTexture(t);   // subida a la GPU ahora, no en el primer fotograma que la use
        return t;
      });
  }
  function impostores(f: any, rs: any) {
    return Promise.allSettled([atlas(f.color, true), atlas(f.normales, false)]).then(function (rs2: any) {
      var tx = rs2.filter(function (r: any) { return r.status === "fulfilled"; }).map(function (r: any) { return r.value; }), fallo = rs2.find(function (r: any) { return r.status === "rejected"; });
      if (fallo || !activo() || via !== "cargando impostores") { tx.forEach(function (t: any) { t.dispose(); }); if (fallo) throw fallo.reason; return; }   // L2-08: si uno falla, el que llegó se libera (monta() cae al sustituto)
      var P = Materiales.cartulina.silueta ? polisImpostor(f) : null;
      texImp = tx; ponMalla(P ? geoPoli(1) : geoCuadro(), matImpostor(tx[0], tx[1], f, P), rs, null); malla.userData.sinEscala = true;
      triPor = P ? SIL_K - 2 : 2; texMiB = (f.color.lado * f.color.lado + f.normales.lado * f.normales.lado) * 4 * 4 / 3 / 1048576; via = "impostor"; tCapa = 0; uCapa.value = 0;
    });
  }
  // los polígonos del impostor de la fila del manifiesto (contratos/olivo-impostor.md §4, `siluetas`), comprobados: K vértices por celda, 64 celdas por variante
  function polisImpostor(f: any) {
    var S = f.siluetas, nc = Math.min(4, f.variantes.length) * 64;
    if (!S || S.vertices !== SIL_K || !Array.isArray(S.poligonos) || S.poligonos.length !== nc) { silInfo = { fuente: "impostor", motivo: S ? "siluetas de otra forma: cuadrado" : "la fila no trae siluetas: cuadrado" }; return null; }
    var d = new Float32Array(SIL_K * 256 * 4), a = 0;
    for (var c = 0; c < nc; c++) {
      var q = S.poligonos[c]; if (!Array.isArray(q) || q.length !== 2 * SIL_K) { silInfo = { fuente: "impostor", motivo: "un polígono mal formado: cuadrado" }; return null; }
      for (var i = 0; i < SIL_K; i++) {
        var u = +q[2 * i], v = +q[2 * i + 1];
        if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) { silInfo = { fuente: "impostor", motivo: "un vértice fuera de la celda: cuadrado" }; return null; }
        d[(c * SIL_K + i) * 4] = u; d[(c * SIL_K + i) * 4 + 1] = v;
      }
      a += areaPoli(q);
    }
    silInfo = { fuente: "impostor", celdas: nc, area: +(a / nc).toFixed(3), triangulos: SIL_K - 2 };
    Materiales.apuntaCartulina("lejanos-impostor", { area: silInfo.area, triangulosRect: 2, triangulos: SIL_K - 2, celdas: nc });
    return texPoli(d, 256);
  }
  function areaPoli(q: any) { var s = 0, n = q.length / 2; for (var i = 0; i < n; i++) { var j = (i + 1) % n; s += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]; } return Math.abs(s) / 2; }
  function texPoli(d: any, filas: any) {
    var t = new THREE.DataTexture(d, SIL_K, filas, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; tPoli = t; return t;
  }
  // la geometría de la silueta: K vértices por plano (aIdx = el vértice del polígono; la posición la pone el sombreador), en abanico (K − 2 triángulos)
  function geoPoli(planos: any) {
    var P = [], N = [], U = [], I = [], X = [], V = [];
    for (var v = 0; v < planos; v++) {
      for (var k = 0; k < SIL_K; k++) { P.push(0, 0, 0); if (planos > 1) N.push(0, 1, 0); else N.push(0, 0, 1); U.push(0, 0); X.push(k); V.push(v); }
      for (var t = 1; t < SIL_K - 1; t++) I.push(v * SIL_K, v * SIL_K + t, v * SIL_K + t + 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute("aIdx", new THREE.Float32BufferAttribute(X, 1)); if (planos > 1) g.setAttribute("aVista", new THREE.Float32BufferAttribute(V, 1));
    g.setIndex(I);
    return g;
  }
  function geoCuadro() {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }
  // GLSL de la disposición del formato 1, la misma que apps/web/olivo/impostor.js (octaDeDireccion, direccionDeVista, baseDeVista, celdaUV);
  // pruebas/olivo/escalera_motor.mjs comprueba que estas fórmulas dan lo mismo que las de JS
  var GLSL_IMP = [
    "vec2 ot_oct(vec3 d) { float y = max(0.0, d.y); float s = abs(d.x) + y + abs(d.z); s = s > 0.0 ? s : 1.0; return vec2(d.x / s + d.z / s, d.x / s - d.z / s); }",
    "vec3 ot_dirV(vec2 ij) { float a = -1.0 + 2.0 * ij.x / 7.0, b = -1.0 + 2.0 * ij.y / 7.0; float x = (a + b) * 0.5, z = (a - b) * 0.5; return normalize(vec3(x, max(0.0, 1.0 - abs(x) - abs(z)), z)); }",
    "void ot_base(vec3 d, out vec3 r, out vec3 u) { r = cross(vec3(0.0, 1.0, 0.0), d); r = length(r) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(r); u = cross(d, r); }"].join("\n");
  // el trozo del sombreador de vértices: el cuadrado girado a la cámara en el marco del árbol y la celda de la vista más cercana
  var GLSL_IMP_V = " int ot_k = int(aVar + 0.5); vec3 ot_C = uCentro[ot_k]; float ot_S = uSemi[ot_k]; mat4 ot_IM = modelMatrix * instanceMatrix;\n" +
    " vec3 ot_d = normalize((inverse(ot_IM) * vec4(cameraPosition, 1.0)).xyz - ot_C);\n" +
    " vec2 ot_ij = floor(clamp((ot_oct(ot_d) + 1.0) * 3.5, 0.0, 7.0) + 0.5); vec3 ot_r, ot_u, ot_rv, ot_uv; ot_base(ot_d, ot_r, ot_u); ot_base(ot_dirV(ot_ij), ot_rv, ot_uv);\n" +
    " vec3 ot_off = position.x * ot_r + position.y * ot_u; transformed = ot_C + ot_off * ot_S;\n" +
    " vOtQ = vec2(dot(ot_off, ot_rv), dot(ot_off, ot_uv));\n" +
    " vOtUV = (vec2(mod(float(ot_k), 2.0) * 8.0 + ot_ij.x, floor(float(ot_k) / 2.0) * 8.0 + ot_ij.y) + vOtQ * 0.5 + 0.5) / 16.0;\n" +
    " mat3 ot_nm = transpose(inverse(mat3(ot_IM))); vOtN0 = ot_nm[0]; vOtN1 = ot_nm[1]; vOtN2 = ot_nm[2];";
  // AG-2.2: con silueta, el vértice k del polígono de la celda (ij) de la variante: q en [−1, 1]² de la celda y la posición del plano girado a la
  // cámara que se proyecta en q (la inversa de la reproyección a la vista: ot_M); vOtXY lleva la posición para descartar lo mismo que el cuadrado
  var GLSL_IMP_SIL = " vec2 ot_q = texelFetch(tPoli, ivec2(int(aIdx + 0.5), ot_k * 64 + int(ot_ij.y + 0.5) * 8 + int(ot_ij.x + 0.5)), 0).xy * 2.0 - 1.0;\n" +
    " mat2 ot_M = mat2(dot(ot_r, ot_rv), dot(ot_r, ot_uv), dot(ot_u, ot_rv), dot(ot_u, ot_uv)); vec2 ot_xy = abs(determinant(ot_M)) > 1e-3 ? inverse(ot_M) * ot_q : ot_q; vOtXY = ot_xy;\n" +
    " vec3 ot_off = ot_xy.x * ot_r + ot_xy.y * ot_u;";
  function matImpostor(tCol: any, tNor: any, f: any, tP: any) { return materiales.crea(MATERIAL_IMPOSTOR_LEJANO, { tCol, tNor, f, tP }); }
  function clasicoImpostor(o: any) {
    var tCol = o.tCol, tNor = o.tNor, f = o.f, tP = o.tP;
    var C = [], S = [];
    for (var k = 0; k < 4; k++) { var v = f.variantes[Math.min(k, f.variantes.length - 1)]; C.push(new THREE.Vector3().fromArray(v.centro)); S.push(v.semilado); }
    var m = Materiales.recorte(new THREE.MeshLambertMaterial({ map: tCol, alphaTest: 0.5 })), U = { uCentro: { value: C }, uSemi: { value: S }, tNorm: { value: tNor } };
    ponParche(m, "impostor-lejano", function (sh: any) {
      sh.uniforms.uCentro = U.uCentro; sh.uniforms.uSemi = U.uSemi; sh.uniforms.tNorm = U.tNorm; sh.uniforms.uCapa = uCapa;
      Generados.lejanos.parcheLuz(sh); Generados.lejanos.parcheFundido(sh);
      // después de los parches: así el cuadrado ya está colocado cuando la sombra de nubes lee «transformed»
      var V = tP ? GLSL_IMP_V.replace(" vec3 ot_off = position.x * ot_r + position.y * ot_u;", GLSL_IMP_SIL) : GLSL_IMP_V, dSil = tP ? "attribute float aIdx; uniform highp sampler2D tPoli; varying vec2 vOtXY;\n" : "";
      if (tP) sh.uniforms.tPoli = { value: tP };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aVar; uniform vec3 uCentro[4]; uniform float uSemi[4]; varying vec2 vOtQ; varying vec2 vOtUV; varying vec3 vOtN0, vOtN1, vOtN2;\n" + dSil + GLSL_IMP)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + V + "\n#ifdef USE_MAP\n vMapUv = vOtUV;\n#endif\n");   // uv_vertex va antes que begin_vertex: el mapa se reescribe aquí
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float uCapa; uniform sampler2D tNorm; varying vec2 vOtQ; varying vec2 vOtUV; varying vec3 vOtN0, vOtN1, vOtN2;\n" + (tP ? "varying vec2 vOtXY;\n" : "") +
        "void main() {\n if (abs(vOtQ.x) > 1.0 || abs(vOtQ.y) > 1.0 || " + (tP ? "abs(vOtXY.x) > 1.0 || abs(vOtXY.y) > 1.0 || " : "") + "ot_ign(gl_FragCoord.xy + vec2(17.0, 31.0)) >= uCapa) discard;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = normalize((viewMatrix * vec4(normalize(mat3(vOtN0, vOtN1, vOtN2) * (texture2D(tNorm, vOtUV).xyz * 2.0 - 1.0)), 0.0)).xyz);");
    });
    m.customProgramCacheKey = function () { return "lejanos-impostor-1" + (tP ? "-sil" + SIL_K : ""); };
    return m;
  }
  // ---- el sustituto: la silueta de cada variante, horneada a una textura (2 vistas por variante) y dos planos cruzados por olivo
  function sustituto(rs: any) {
    var gs: any[] = [];   // C-07: lo montado para hornear se suelta también si el horneado falla
    var sueltaGs = function () { gs.splice(0).forEach(function (g: any) { Generados.lejanos.libera(g); }); };
    try {
      rs.forEach(function (r: any) { var g = Generados.lejanos.monta(r); g.scale.set(1, 1, 1); g.updateMatrixWorld(true); gs.push(g); });
      cajas = gs.map(function (g: any) { return new THREE.Box3().setFromObject(g); });
      var tex = sinGPU ? null : hornea(gs);
      sueltaGs();
      texMiB = tex ? 2 * CEL * nv * CEL * 4 * 4 / 3 / 1048576 : 0;
      var ponSus = function (tP: any) { ponMalla(tP ? geoPoli(2) : geoCruz(), matSustituto(tex, tP), rs, cajas); triPor = tP ? 2 * (SIL_K - 2) : 4; via = "sustituto"; tCapa = 0; uCapa.value = 0; };
      if (!tex || !Materiales.cartulina.silueta) { ponSus(null); return; }
      // AG-2.2: las siluetas de las 2 · nv celdas, del alfa del horneado (una lectura de la GPU, una vez) y por la Cola; mientras, «siluetas» (pendientes() lo cuenta)
      via = "siluetas";
      var gen = siluetasSustitutoG(), fin = function (tP: any) { if (via === "siluetas") ponSus(tP); };
      if (typeof ColaExt !== "undefined" && ColaExt && ColaExt.pon) ColaExt.pon("Lsil", 60, gen, fin); else { var x; do { x = gen.next(); } while (!x.done); fin(x.value); }
    } catch (e: any) { sueltaGs(); via = "sin"; motivo = String(e && e.message || e).slice(0, 80); console.warn("olivos lejanos: " + motivo + " (de lejos, solo la ortofoto)"); }
  }
  function* siluetasSustitutoG() {
    try {
      var M = Generados.lejanos.constructor(), W = 2 * CEL, H = nv * CEL, px = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); yield;
      var L = [{ datos: px, ancho: W, alto: H }].concat(M.mipsCaja(px, W, H)), polis = [], a = 0, ok = 0; yield;
      for (var j = 0; j < nv; j++) for (var v = 0; v < 2; v++) {
        var s = M.siluetaDe(L, [v / 2, j / nv, (v + 1) / 2, (j + 1) / nv], { umbral: 0.5, vertices: SIL_K, filaArriba: false }), P = null;
        if (M.compensaSilueta(s)) { P = s.poligono.map(function (p: any) { return [p[0] * 2 - v, p[1] * nv - j]; }); a += s.area; ok++; } else a += 1;
        polis.push(P); yield;
      }
      var d = M.poligonosFijos(polis, SIL_K), d4 = new Float32Array(SIL_K * 2 * nv * 4);
      for (var i = 0; i < d.length / 2; i++) { d4[i * 4] = d[i * 2]; d4[i * 4 + 1] = d[i * 2 + 1]; }
      silInfo = { fuente: "sustituto", celdas: 2 * nv, conSilueta: ok, area: +(a / (2 * nv)).toFixed(3), triangulos: SIL_K - 2 };
      Materiales.apuntaCartulina("lejanos-sustituto", { area: silInfo.area, triangulosRect: 2, triangulos: SIL_K - 2, celdas: 2 * nv });
      return texPoli(d4, 2 * nv);
    } catch (e: any) { silInfo = { fuente: "sustituto", motivo: String(e && e.message || e).slice(0, 80) }; return null; }
  }
  function hornea(gs: any) {
    var W = 2 * CEL, H = nv * CEL, t = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
    t.texture.colorSpace = THREE.SRGBColorSpace;   // en 8 bits, mejor codificado en sRGB (lo deshace la lectura): sin bandas en los verdes oscuros
    var sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, Math.PI));   // irradiancia π × Lambert 1/π: el albedo tal cual
    var prevRT = renderer.getRenderTarget(), prevXR = renderer.xr.enabled, cc = new THREE.Color(), ca = renderer.getClearAlpha(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    renderer.getClearColor(cc); renderer.xr.enabled = false; renderer.setClearColor(0x000000, 0); t.scissorTest = true;
    Materiales.recortes(false);   // AG-2.1: el blanco del horneado no tiene MSAA y su alfa tiene que seguir siendo el del recorte duro: sin alphaToCoverage mientras se hornea
    var hecho = false;   // C-07: si un render falla (contexto perdido, un programa que no compila), el blanco se suelta aquí: aún no está en rt
    try {
      gs.forEach(function (g: any, j: any) {
        var b = cajas[j], cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2, hy = (b.max.y - b.min.y) / 2;
        sc.add(g);
        for (var v = 0; v < 2; v++) {   // vista 0: desde +Z mirando a −Z (horizontal = x); vista 1: desde +X mirando a −X (horizontal = −z)
          var hx = v === 0 ? (b.max.x - b.min.x) / 2 : (b.max.z - b.min.z) / 2, fondo = v === 0 ? b.max.z - b.min.z : b.max.x - b.min.x;
          cam.left = -hx; cam.right = hx; cam.top = hy; cam.bottom = -hy; cam.near = 0.01; cam.far = fondo + 2; cam.updateProjectionMatrix();
          if (v === 0) { cam.position.set(cx, cy, b.max.z + 1); cam.lookAt(cx, cy, b.min.z); } else { cam.position.set(b.max.x + 1, cy, cz); cam.lookAt(b.min.x, cy, cz); }
          cam.updateMatrixWorld(true);
          t.viewport.set(v * CEL, j * CEL, CEL, CEL); t.scissor.set(v * CEL, j * CEL, CEL, CEL);
          renderer.setRenderTarget(t); renderer.render(sc, cam);   // autoClear con la tijera: limpia solo su celda
        }
        sc.remove(g);
      });
      hecho = true;
    } finally { Materiales.recortes(true); renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXR; renderer.setClearColor(cc, ca); if (!hecho) t.dispose(); }
    rt = t; return t.texture;
  }
  // dos planos verticales que se cruzan en el eje del pie, en coordenadas unidad (la caja de la variante los estira): vista 0 en el plano XY, vista 1 en el ZY
  function geoCruz() {
    var P = [], N = [], U = [], V = [], I = [];
    for (var v = 0; v < 2; v++) for (var k = 0; k < 4; k++) {
      var u = k === 1 || k === 2 ? 1 : 0, w = k >= 2 ? 1 : 0;
      if (v === 0) P.push(u - 0.5, w, 0); else P.push(0, w, 0.5 - u);
      N.push(0, 1, 0); U.push(u, w); V.push(v);
    }
    I.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setAttribute("aVista", new THREE.Float32BufferAttribute(V, 1)); g.setIndex(I);
    return g;
  }
  function matSustituto(tex: any, tP: any) { return materiales.crea(MATERIAL_IMPOSTOR_SUSTITUTO, { tex, tP }); }
  function clasicoSustituto(o: any) {
    var tex = o.tex, tP = o.tP;
    var m = Materiales.recorte(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide })), uNV = { value: nv };
    ponParche(m, "impostor-sustituto", function (sh: any) {
      sh.uniforms.uNVar = uNV; sh.uniforms.uCapa = uCapa; if (tP) sh.uniforms.tPoli = { value: tP };
      // AG-2.2: con silueta, el vértice aIdx del polígono de la celda (aVar, aVista): sus (u, w) dan la uv y la posición en el plano
      var q = tP ? " vec2 ot_pq = texelFetch(tPoli, ivec2(int(aIdx + 0.5), int(aVar + 0.5) * 2 + int(aVista + 0.5)), 0).xy;\n" : "", uv = tP ? "ot_pq" : "uv";
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aVar; attribute float aVista; uniform float uNVar;" + (tP ? " attribute float aIdx; uniform highp sampler2D tPoli;" : ""))
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n" + q + "#ifdef USE_MAP\n vMapUv = (vec2(aVista, aVar) + " + uv + ") / vec2(2.0, uNVar);\n#endif");
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform float uCapa;\nvoid main() {\n if (ot_ign(gl_FragCoord.xy + vec2(17.0, 31.0)) >= uCapa) discard;");
      Generados.lejanos.parcheLuz(sh); Generados.lejanos.parcheFundido(sh);
      // después de los parches (la sombra de nubes lee «transformed» ya colocado): el plano 0 en XY (x = u − 0,5) y el 1 en ZY (z = 0,5 − u), como geoCruz
      if (tP) sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed = aVista < 0.5 ? vec3(ot_pq.x - 0.5, ot_pq.y, 0.0) : vec3(0.0, ot_pq.y, 0.5 - ot_pq.x);");
    });
    m.customProgramCacheKey = function () { return "lejanos-sustituto" + (tP ? "-sil" + SIL_K : ""); };
    return m;
  }
  function ponMalla(geo: any, mat: any, rs: any, cj: any) {
    var n = olivos.length;
    geo.setAttribute("aFun", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    geo.setAttribute("aVar", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    malla = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); malla.name = "olivos-lejanos"; malla.frustumCulled = false; malla.count = 0; malla.visible = false;   // vacía no se dibuja (con count 0 three paga igual la pasada)
    malla.userData.rs = rs; malla.userData.cajas = cj;
    gArboles.add(malla); exagM = -1;
  }
  // la matriz de cada olivo: la de su variante en 3D (07ab) y, en el sustituto, la caja de la variante (centro x/z, base y tamaño)
  function matricesDe() {
    var rs = malla.userData.rs, cj = malla.userData.cajas, m = new THREE.Matrix4(), mc = new THREE.Matrix4(), s = new THREE.Vector3();
    matrices = new Float32Array(olivos.length * 16);
    olivos.forEach(function (c: any, k: any) {
      var j = c.i % nv; m.copy(Generados.lejanos.matriz(c, rs[j]));
      if (malla.userData.sinEscala) m.multiply(mc.makeScale(1 / rs[j].escala[0], 1 / rs[j].escala[1], 1 / rs[j].escala[2]));   // el marco del impostor ya lleva receta.escala (contrato §1)
      if (cj) { var b = cj[j]; b.getSize(s); mc.makeScale(Math.max(s.x, 1e-3), Math.max(s.y, 1e-3), Math.max(s.z, 1e-3)).setPosition((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2); m.multiply(mc); }
      m.toArray(matrices, k * 16);
    });
    exagM = Estado.exag;
  }
  /** El reparto de los lejanos (desde 07b): cada olivo a menos de U2 m de la cámara que no está del todo en 3D (GEN.fase de 07ab) */
  function reparte(cam: any, GEN: any) {
    if (!malla || !hayCapa()) return info;
    repartido = true;   // el tramado de entrada de la capa (uCapa) empieza con el primer reparto, no al montarla
    if (exagM !== Estado.exag || !matrices) matricesDe();
    if (!ids) ids = new Int32Array(olivos.length);
    var A = malla.instanceMatrix.array, F = malla.geometry.attributes.aFun.array, V = malla.geometry.attributes.aVar.array, k = 0, en = 0, sa = 0;
    for (var q = 0; q < olivos.length; q++) {
      var c = olivos[q], f = GEN.fase ? GEN.fase(c.i) : 0;
      if (f === 1) continue;   // en 3D
      var dx = c.x - cam.x, dz = -c.y - cam.z, dy = Math.max(0, cam.y - (c.gz || 0) * Estado.exag);
      if (dx * dx + dz * dz + dy * dy >= U2 * U2) continue;
      A.set(matrices.subarray(q * 16, q * 16 + 16), k * 16); F[k] = f === 2 ? 2 + 3 * (GEN.ranura ? GEN.ranura(c.i) : 0) : f === 3 ? 1 : 0; V[k] = c.i % nv; ids[k] = c.i;
      if (f === 2) sa++; else if (f === 3) en++;
      k++;
    }
    malla.count = k; malla.visible = k > 0; malla.instanceMatrix.needsUpdate = true; malla.geometry.attributes.aFun.needsUpdate = true; malla.geometry.attributes.aVar.needsUpdate = true;
    info = { dibujados: k, entran: en, salen: sa }; return info;
  }
  /** la capa ya entró entera (uCapa = 1): con la escalera horneada, 07b aparta entonces todos los olivos del tileset */
  function capaCompleta() { return hayCapa() && uCapa.value >= 1; }
  function triangulos() { return malla && hayCapa() ? malla.count * triPor : 0; }
  // también mientras la capa entra con su tramado (o va a entrar: hay capa y los olivos se ven): las pruebas miden con la capa entera
  function pendientes() { return activo() && ((via === "esperando" || via === "cargando impostores" || via === "siluetas") && Generados.activo() || hayCapa() && (repartido || gArboles.visible) && uCapa.value < 1) ? 1 : 0; }
  function resumen() { return activo() ? { fuente: via, motivo: motivo, aviso2: avisoImp || undefined, dibujados: info.dibujados, entran: info.entran, salen: info.salen, triangulos: triangulos(), llamadas: malla && hayCapa() && malla.count ? 1 : 0, capa: +uCapa.value.toFixed(2), texturaMiB: +texMiB.toFixed(2), cartulina: Materiales.cartulina.modo, silueta: silInfo || undefined } : null; }
  let suelto = false;
  /** quita la malla de los olivos lejanos y suelta todo lo suyo: geometría, material (los de la fábrica), las dos texturas de los atlas (con sus ImageBitmap), la textura de
   *  siluetas, el blanco del horneado y el trabajo de la Cola. Después la capa no existe: pendientes() y triangulos() dan 0. Llamarlo dos veces no libera dos veces. */
  function libera(): void {
    if (suelto) return; suelto = true;
    if (ColaExt && ColaExt.cancela) ColaExt.cancela("Lsil");   // las siluetas del sustituto, si aún estaban por la Cola
    if (malla) { gArboles.remove(malla); malla.geometry.dispose(); malla.dispose(); malla = null; }
    materiales.libera();
    texImp.forEach(function (t: any) { t.dispose(); }); texImp = [];   // sus ImageBitmap se cierran con su dispose (L2-08)
    if (tPoli) { tPoli.dispose(); tPoli = null; }
    if (rt) { rt.dispose(); rt = null; }
    matrices = null; cajas = null; ids = null; via = "apagado"; repartido = false; uCapa.value = 0; info = { dibujados: 0, entran: 0, salen: 0 };
  }
  /** el componente (ADR-0023): el ciclo de vida de la capa de lejanos. Solo ciclo de vida: sin ?olivos=escalera (o variantes horneadas) no crea nada ni gasta nada; lo que dibuja
   *  lo cuenta triangulos()/resumen() para el tope de 07b. Lo registra 90_final.js (el objeto lo usa el legado desde el primer fotograma). */
  const componente: Manifiesto = {
    id: ID_LEJANOS, version: 1,
    consume: ["Materiales", "gArboles", "Generados", "ColaExt", "Estado"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 1, triangulos: 0 },   // UNA llamada con la malla instanciada de toda la finca; sus triángulos (4 por olivo el sustituto, 2 el impostor) cuentan en el tope de 07b (triangulos())
    mundos: ["exterior"],
    monta: function () { return { libera }; },
    libera: function () { libera(); }
  };
  return { inicia, paso, hayCapa, capaCompleta, reparte, triangulos, pendientes, resumen, libera, materiales, componente,
    _prueba: { sinGPU: function () { sinGPU = true; }, malla: function () { return malla; }, cajas: function () { return cajas; }, ids: function () { return ids && malla ? Array.from(ids.subarray(0, malla.count)) : []; } } };
}
export type Lejanos = ReturnType<typeof creaLejanos>;
