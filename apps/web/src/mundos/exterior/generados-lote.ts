// El LOTE de los olivos generados: todo lo generado en pocas mallas compartidas (una BatchedMesh por material de corteza, madera muerta y olivas; una malla
// instanciada por material de hoja; unos puntos), montado a tramos por la cola propia, y las cartulinas recortadas a la silueta (AG-2.2). MU5-n (A3-2a): antes dentro
// de Generados en apps/web/motor/07ab_generados.js; el código es el de siempre, movido: lo que antes leía del cierre de Generados (el constructor M, las recetas, los
// materiales, la profundidad, las siluetas y la matriz de cada olivo) lo pide aquí a `ctx` (CtxLote), que da generados.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface CtxLote {
  THREE: A;
  /** el constructor de olivos (apps/web/olivo), ya cargado */
  M(): A;
  /** las recetas por clave (el MISMO objeto de Generados: «p<i>:<nivel>» los propios, «v<j>:<nivel>» las variantes) */
  recetas: Record<string, A>;
  /** los materiales del constructor (con el parche del motor) y los de profundidad con el fundido */
  mats(): A;
  prof(): A;
  /** las siluetas de las cartulinas (?cartulina=silueta): las da siluetasG y las lee construyeG */
  sil(): A;
  ponSil(s: A): void;
  silPend(): boolean;
  /** la transformación de cada olivo (su sitio, la exageración y, en las variantes, el estirado a su copa) */
  matrizDe(c: A, r: A, variante: boolean): A;
  /** la fábrica de materiales: apuntaCartulina (lo que dice ?debug de las cartulinas) */
  Materiales: { apuntaCartulina(nombre: string, datos: unknown): void };
}

export function creaLote(ctx: CtxLote) {
  var THREE = ctx.THREE;
  /** suelta un lote: sus geometrías y sus mallas por lotes e instanciadas (los materiales son compartidos: no se tocan) */
  function libera(g: A) {
    g.traverse(function (o: A) { if (o.geometry) o.geometry.dispose(); if (o.isBatchedMesh || o.isInstancedMesh) o.dispose(); });
  }

  // ---- el lote: todo lo generado en pocas mallas compartidas (las olivas, sin índices: icosaedro y octaedro)
  var BARK: A = { corteza: 1, pies: 1, musgo: 1, raiz: 1, tutor: 1 }, TINTE: A = { musgo: [0.82, 0.8, 0.7], raiz: [1.05, 1.04, 1.02], tutor: [0.95, 0.85, 0.65] };
  function geoDe(atrib: A, indice: A, marcas: A) {
    var g = new THREE.BufferGeometry(), n = atrib.position.length / 3;
    g.setAttribute("position", new THREE.BufferAttribute(atrib.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(atrib.normal || new Float32Array(n * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(atrib.uv || new Float32Array(n * 2), 2));
    if (marcas) { g.setAttribute("aHueco", new THREE.BufferAttribute(atrib.aHueco || new Float32Array(n), 1)); g.setAttribute("aMuerta", new THREE.BufferAttribute(atrib.aMuerta || new Float32Array(n), 1)); }
    if (indice) g.setIndex(new THREE.BufferAttribute(indice, 1));
    return g;
  }
  /** Caja y esfera de una geometría de origen, calculadas UNA vez (EV-perf) con los mismos vértices y la misma cuenta que el cálculo perezoso de BatchedMesh
   *  (getBoundingBoxAt/getBoundingSphereAt: los vértices que referencia el índice; la esfera, centrada en la caja): así addGeometry las copia y no hay recorrido de
   *  vértices por lote. Clave débil: la propia `atrib` (la de G[gk] es la misma en todos los lotes); al soltarse la receta o la finca, se suelta con ella. */
  var limitesDe = (function () {
    var cache = new WeakMap();
    return function (atrib: A, indice: A) {
      var c = cache.get(atrib); if (c && c.indice === indice) return c;
      var P = atrib.position, n = indice ? indice.length : P.length / 3, i, x, y, z, k;
      var mn: A = [Infinity, Infinity, Infinity], mx: A = [-Infinity, -Infinity, -Infinity];
      for (i = 0; i < n; i++) { k = (indice ? indice[i] : i) * 3; x = P[k]; y = P[k + 1]; z = P[k + 2]; if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x; if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y; if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z; }
      var caja = new THREE.Box3(new THREE.Vector3(mn[0], mn[1], mn[2]), new THREE.Vector3(mx[0], mx[1], mx[2])), centro = caja.getCenter(new THREE.Vector3()), r2 = 0, d;
      for (i = 0; i < n; i++) { k = (indice ? indice[i] : i) * 3; x = P[k] - centro.x; y = P[k + 1] - centro.y; z = P[k + 2] - centro.z; d = x * x + y * y + z * z; if (d > r2) r2 = d; }
      c = { indice: indice, caja: caja, esfera: new THREE.Sphere(centro, Math.sqrt(r2)) }; cache.set(atrib, c); return c;
    };
  })();
  /** La geometría de un lote con sus límites ya puestos (clones: setGeometryAt los vuelve a clonar al guardarlos, así que la geometría puede soltarse sin más) */
  function geoLote(atrib: A, indice: A, marcas: A) { var g = geoDe(atrib, indice, marcas), l = limitesDe(atrib, indice); g.boundingBox = l.caja.clone(); g.boundingSphere = l.esfera.clone(); return g; }
  // las mallas instanciadas de hoja: por material, salvo las dos tarjetas de E1/E2 (O9b), que comparten material y cambian de geometría
  var GEO_INST: A = { ramita0: "ramita", ramita1: "ramita", relleno: "relleno", tarjeta: "tarjeta", tarjetaO: "tarjetaO" };
  function claveInst(z: A) { return z.geo === "tarjeta" || z.geo === "tarjetaO" ? z.geo : z.mat; }
  // ---- AG-2.2 (?cartulina=silueta, doc/sistema/CARTULINAS.md): cada cartulina de hoja, con el polígono de 6 vértices que abraza lo opaco de su
  // textura (la del material, con sus mipmaps de cobertura: los mismos texeles que lee la GPU) en lugar del rectángulo; las mismas uv. Una vez, al
  // montar los materiales, por la cola propia (generador: una textura por rebanada), nunca por fotograma. Sin canvas 2D (Node) o sin nada opaco, el rectángulo.
  var SIL_PIEZAS: A = [["ramita0", "ramita", "ramita0"], ["ramita1", "ramita", "ramita1"], ["relleno", "relleno", "relleno"], ["tarjeta", "tarjeta", "tarjeta"], ["tarjetaO", "tarjetaO", "tarjeta"]], SIL_VERTICES = 6;
  function nivelesDe(t: A) {
    var M = ctx.M();
    if (!t) return null;
    if (t.mipmaps && t.mipmaps.length && t.mipmaps[0].data) return t.mipmaps.map(function (d: A) { return { datos: d.data, ancho: d.width, alto: d.height }; });
    var c = t.image, g = c && c.getContext ? c.getContext("2d") : null; if (!g) return null;
    var d0 = g.getImageData(0, 0, c.width, c.height).data;
    return [{ datos: d0, ancho: c.width, alto: c.height }].concat(M.mipsCaja(d0, c.width, c.height));   // los mipmaps de la GPU (?olivosMips=0): media de 2 × 2
  }
  function* siluetasG() {
    var M = ctx.M(), mats = ctx.mats();
    var G = M.geos(), out: A = {}, porTex = new Map();
    try {
      for (var i = 0; i < SIL_PIEZAS.length; i++) {
        var k = SIL_PIEZAS[i][0], gk = SIL_PIEZAS[i][1], mat = mats[SIL_PIEZAS[i][2]], t = mat && mat.map;
        if (!t) continue;
        if (!porTex.has(t)) { porTex.set(t, nivelesDe(t)); yield; }
        var L = porTex.get(t); if (!L) continue;
        var areas: A = [], opacos: A = [], umbral = mat.alphaTest;
        var g = M.recortaQuads(G[gk].atrib, G[gk].indice, function (u0: A, v0: A, u1: A, v1: A) {
          var s = M.siluetaDe(L, [u0, v0, u1, v1], { umbral: umbral, vertices: SIL_VERTICES });
          opacos.push(s.opaco); var ok = M.compensaSilueta(s); areas.push(ok ? s.area : 1);
          return ok ? s.poligono : null;
        });
        var rect = G[gk].indice.length / 3, media = function (a: A) { return a.length ? +(a.reduce(function (x: A, y: A) { return x + y; }, 0) / a.length).toFixed(3) : 1; };
        out[k] = { atrib: g.atrib, indice: g.indice, triangulos: g.triangulos, extra: g.triangulos - rect };
        ctx.Materiales.apuntaCartulina("gen-" + k, { opaco: media(opacos), area: media(areas), triangulosRect: rect, triangulos: g.triangulos });
        yield;
      }
      ctx.ponSil(out);
    } catch (e: A) { ctx.ponSil(null); ctx.Materiales.apuntaCartulina("gen", { error: String(e && e.message || e).slice(0, 80) }); }
  }
  function* construyeG(items: A) {
    var M = ctx.M(), mats = ctx.mats(), prof = ctx.prof(), recetas = ctx.recetas, SIL = ctx.sil(), matrizDe = ctx.matrizDe;
    var G = M.geos(), out = new THREE.Group(), m4 = new THREE.Matrix4(), mp = new THREE.Matrix4(), mi = new THREE.Matrix4(), col = new THREE.Vector4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
    if (ctx.silPend()) yield { espera: function () { return ctx.silPend(); } };   // AG-2.2: el primer lote espera a las siluetas (una vez)
    var sel = items.map(function (x: A) { return x.p; }), cod = 0;   // el código de cada pieza va en el alfa de su color en las mallas por lotes (1 − código / 2)
    var salen: A = { B: {}, I: {}, P: null }, hay2 = items.some(function (x: A) { return x.cod === 2; });
    // 1) recuento para dar a cada malla su tamaño justo
    var cap: A = { corteza: { i: 0, v: 0, x: 0 }, muerta: { i: 0, v: 0, x: 0 }, olivas: { i: 0, v: 0, x: 0 } }, inst: A = { ramita0: 0, ramita1: 0, relleno: 0, tarjeta: 0, tarjetaO: 0 }, npuntos = 0, vistas: A = {};
    function cuenta(b: A, geoClave: A, atrib: A, indice: A, n: A) {
      if (!vistas[b + geoClave]) { vistas[b + geoClave] = true; cap[b].v += atrib.position.length / 3; cap[b].x += indice ? indice.length : 0; }
      cap[b].i += n;
    }
    sel.forEach(function (p: A, ip: A) {
      var r = recetas[p.clave];
      r.piezas.forEach(function (z: A, iz: A) {
        var gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
        if (z.clase === "malla" && BARK[z.mat]) cuenta("corteza", gk, z.atrib, z.indice, 1);
        else if (z.clase === "malla" && z.mat === "muerta") cuenta("muerta", gk, z.atrib, z.indice, 1);
        else if (z.geo === "tocon") cuenta("corteza", "tocon", G.tocon.atrib, G.tocon.indice, z.n);
        else if (z.geo === "corte") cuenta("muerta", "corte", G.corte.atrib, G.corte.indice, z.n);
        else if (z.geo === "oliva" || z.geo === "octa") cuenta("olivas", z.geo, G[z.geo].atrib, G[z.geo].indice, z.n);
        else if (z.clase === "instancias" && inst[claveInst(z)] !== undefined) inst[claveInst(z)] += z.n;
        else if (z.clase === "puntos") npuntos += z.n;
      });
    });
    yield;
    // 2) las mallas
    var B: A = {}, geoId: A = {}, ix: A = { ramita0: 0, ramita1: 0, relleno: 0, tarjeta: 0, tarjetaO: 0 }, I: A = {}, pts: A = npuntos ? { p: new Float32Array(npuntos * 3), c: new Float32Array(npuntos * 3), f: new Float32Array(npuntos), n: 0 } : null;
    var matDe: A = { corteza: mats.pies, muerta: mats.muerta, olivas: mats.oliva };
    Object.keys(cap).forEach(function (b: A) {
      if (!cap[b].i) return;
      var bm = new THREE.BatchedMesh(cap[b].i, cap[b].v, cap[b].x, matDe[b]); bm.name = "gen-" + b; bm.castShadow = b !== "olivas"; bm.receiveShadow = b !== "olivas"; B[b] = bm; out.add(bm);   // las olivas no proyectan sombra: muchas y diminutas
      if (prof[b]) bm.customDepthMaterial = prof[b];   // la sombra con el mismo fundido (la misma profundidad que la de serie)
    });
    Object.keys(inst).forEach(function (k: A) {
      if (!inst[k]) return;
      var gk = GEO_INST[k], mk = k === "tarjetaO" ? "tarjeta" : k, gs = SIL && SIL[k] || G[gk], g = geoDe(gs.atrib, gs.indice, false);   // AG-2.2: la silueta, si la hay   // las dos tarjetas (O9b) comparten material: atlas con y sin olivas
      g.setAttribute("aFun", new THREE.InstancedBufferAttribute(new Float32Array(inst[k]), 1));   // el código de fundido de cada instancia
      var im = new THREE.InstancedMesh(g, mats[mk], inst[k]); im.name = "gen-" + k; im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = mats[mk + "_sombra"];
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst[k] * 3), 3); I[k] = im; out.add(im);
    });
    yield;   // AG-1.5a: reservar las mallas (MB de búfer) y copiar las geometrías del primer árbol, en tramos distintos
    // obra: vértices + índices copiados a las mallas por lotes (addGeometry) desde el último yield. Antes de una pieza cuya geometría nueva haría pasar
    // de OBRA_GEO lo ya copiado, se cede: así una geometría grande (la corteza de un E0, ~40 k vértices y ~120 k índices) va sola en su tramo, que
    // three no puede partir (addGeometry es atómico), y las pequeñas no se le suman (pruebas/olivo/lote_tramos.mjs lo mide y lo vigila)
    // La primera geometría de cada malla por lotes, además, reserva y rellena sus búferes enteros (cap: los vértices e índices de todo el lote) y cuenta como tal.
    var obra = 0, OBRA_GEO = 60000, iniciada: A = {};
    function tamGeo(atrib: A, indice: A) { return atrib.position.length / 3 + (indice ? indice.length : 0); }
    function costeGeo(b: A, atrib: A, indice: A) { return tamGeo(atrib, indice) + (iniciada[b] ? 0 : cap[b].v + cap[b].x); }
    function idGeo(b: A, gk: A, atrib: A, indice: A) {
      var k = b + gk;
      if (geoId[k] === undefined) { obra += costeGeo(b, atrib, indice); iniciada[b] = true; geoId[k] = B[b].addGeometry(geoLote(atrib, indice, b === "corteza")); }
      return geoId[k];
    }
    function nuevaGeo(z: A, gk: A) {   // lo que costaría la pieza z si su geometría aún no está en su malla por lotes (0 si ya está o no va por lotes)
      var b = z.clase === "malla" ? (BARK[z.mat] ? "corteza" : z.mat === "muerta" ? "muerta" : null) : z.clase === "instancias" ? (z.geo === "tocon" ? "corteza" : z.geo === "corte" ? "muerta" : (z.geo === "oliva" || z.geo === "octa") ? "olivas" : null) : null;
      if (!b || geoId[b + gk] !== undefined) return 0;
      return z.clase === "malla" ? costeGeo(b, z.atrib, z.indice) : costeGeo(b, G[z.geo].atrib, G[z.geo].indice);
    }
    function ponBatch(b: A, gid: A, m: A, rgb: A) {
      var id = B[b].addInstance(gid); B[b].setMatrixAt(id, m); col.set(rgb[0], rgb[1], rgb[2], 1 - cod / 2); B[b].setColorAt(id, col);
      if (cod === 2) (salen.B[b] || (salen.B[b] = { m: B[b], ids: [] })).ids.push(id);
    }
    for (var ip = 0; ip < sel.length; ip++) {
      var p = sel[ip], r = recetas[p.clave], T = matrizDe(p.c, r, !p.propio);
      cod = items[ip].cod;
      if (cod === 2 && !salen.marcado) {   // desde aquí, lo que sale (va al final): lo de antes en cada malla instanciada y en los puntos se queda al ocultarlo
        salen.marcado = true; Object.keys(I).forEach(function (k: A) { salen.I[k] = { m: I[k], n: ix[k] }; }); if (pts) salen.n0 = pts.n;
      }
      for (var iz = 0; iz < r.piezas.length; iz++) {
        var z = r.piezas[iz], gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
        if (obra > 0 && obra + nuevaGeo(z, gk) > OBRA_GEO) { obra = 0; yield; }
        mp.compose(v.fromArray(z.pos), q.fromArray(z.rot), s3.fromArray(z.esc)); m4.multiplyMatrices(T, mp);
        if (z.clase === "malla" && (BARK[z.mat] || z.mat === "muerta")) { var b = BARK[z.mat] ? "corteza" : "muerta"; ponBatch(b, idGeo(b, gk, z.atrib, z.indice), m4, TINTE[z.mat] || [1, 1, 1]); continue; }
        if (z.clase === "puntos") { for (var k2 = 0; k2 < z.n; k2++) { v.fromArray(z.posiciones, k2 * 3).applyMatrix4(m4); pts.p.set([v.x, v.y, v.z], pts.n * 3); pts.c.set(z.colores.subarray(k2 * 3, k2 * 3 + 3), pts.n * 3); pts.f[pts.n] = cod; pts.n++; } continue; }
        if (z.clase !== "instancias") continue;
        var bb = z.geo === "tocon" ? "corteza" : z.geo === "corte" ? "muerta" : (z.geo === "oliva" || z.geo === "octa") ? "olivas" : null;
        var ki = claveInst(z), gid = bb ? idGeo(bb, z.geo, G[z.geo].atrib, G[z.geo].indice) : -1, im2 = bb ? null : I[ki];
        for (var k3 = 0; k3 < z.n; k3++) {
          mi.fromArray(z.matrices, k3 * 16); mi.premultiply(m4);
          var rgb = z.colores ? [z.colores[k3 * 3], z.colores[k3 * 3 + 1], z.colores[k3 * 3 + 2]] : z.geo === "corte" ? r.corte : [1, 1, 1];
          if (bb) ponBatch(bb, gid, mi, rgb);
          else if (im2) { var n3 = ix[ki]++; im2.setMatrixAt(n3, mi); im2.instanceColor.setXYZ(n3, rgb[0], rgb[1], rgb[2]); im2.geometry.attributes.aFun.array[n3] = cod; }
          if (k3 % 512 === 511) yield;
        }
      }
      obra = 0; yield;
    }
    // las cajas y esferas de recorte, con TODAS las instancias ya puestas (en las mallas por lotes, no la de la primera geometría). Cada cálculo de
    // three recorre todas las instancias de su malla y no se puede partir: uno por tramo (AG-1.5a; juntos, ~3-4 ms de Node con lotes del fixture)
    var kI: A = Object.keys(I), kB: A = Object.keys(B), j;
    for (j = 0; j < kI.length; j++) { var Ik = I[kI[j]]; Ik.instanceMatrix.needsUpdate = true; Ik.instanceColor.needsUpdate = true; Ik.geometry.attributes.aFun.needsUpdate = true; Ik.computeBoundingSphere(); yield; Ik.computeBoundingBox(); yield; }
    for (j = 0; j < kB.length; j++) { B[kB[j]].computeBoundingBox(); yield; B[kB[j]].computeBoundingSphere(); yield; }
    if (pts && pts.n) {
      var gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(pts.p, 3)); gp.setAttribute("color", new THREE.BufferAttribute(pts.c, 3)); gp.setAttribute("aFun", new THREE.BufferAttribute(pts.f, 1)); gp.computeBoundingSphere();
      var pm = new THREE.Points(gp, mats.puntos); pm.name = "gen-puntos"; out.add(pm);   // las olivas en puntos (E2), con su esfera de recorte de las posiciones ya en el lote (generados_motor.mjs comprueba que cubre todo)
      if (salen.marcado) salen.P = { m: pm, n: salen.n0 === undefined ? pts.n : salen.n0 };
    }
    out.userData.salen = hay2 ? salen : null;
    return out;
  }

  return { construyeG: construyeG, siluetasG: siluetasG, libera: libera, geoDe: geoDe, claveInst: claveInst, limitesDe: limitesDe };
}
export type Lote = ReturnType<typeof creaLote>;
