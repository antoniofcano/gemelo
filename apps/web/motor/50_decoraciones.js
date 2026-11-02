// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $, ALTO, FACTOR_R8, FACTOR_R8_GEN), 02_mundo (suelo, copas), 02b_cola (Cola),
//   02c_componentes (Bus, ConfigPuro, Componentes), 02e_entidades (Entidades), 03_escena (scene, camera, exag), 06_arboles (radioEn),
//   07ab_generados (Generados), 09_camara (objetivo, camara, suelta, elige), 12_paseo (paseando, primera), 14_historia (lista), 15_tiempo (hace),
//   16_vida (quita, mira), 29_vr (VRX, ficha)
// Nota: Componente «decoraciones-olivo» (P7g D3, decisiones 175-179): la pieza de temporada colgada de los olivos cercanos al foco (flores, cinta, farolillo, cosecha, luces, lazo), ILUSTRATIVA, una InstancedMesh por pieza con mergeGeometries de three (import() al montarse; ≤ 6 llamadas y ≤ 64 piezas). Solo se registra; nadie lo nombra. Sin servidor no crea nada; no habla con la api: la lista le llega por el Bus («decoraciones:cambian», la pide con «decoraciones:pide»). Complementa la ficha del olivo con la fila «Decoración». Publica window.__decoraciones (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/decoraciones.test.js.
// ===============================================================================
  // ---------- las decoraciones de los olivos (P7g D3; decisiones 175-179; doc/sistema/DECORACIONES.md y contratos/decoraciones.md): la pieza del catálogo de
  // temporada que una familia ha colgado de un olivo de su haza (flores, cinta, farolillo, cosecha, luces o lazo), dibujada en su copa a ~0,6-0,8 de su altura.
  // Es ILUSTRATIVA (regla 5): no mide nada, la eligió la familia; la ficha del olivo lo dice (Entidades.complementa).
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?decoraciones=0 (o genera_motor.mjs --sin 50_decoraciones.js) lo quita y el motor pinta
  // lo mismo que antes. Sin servidor (sin D.base /teselas/… ni ?api=) no crea nada ni pide nada.
  // De dónde salen los datos: este componente NO habla con la api. La lista blanca de cada haza (GET /api/hazas/{id}/olivos, campo «decoracion») ya la pide
  // y la refresca el componente de la personalización (42_personalizacion.js), que la publica por el Bus («decoraciones:cambian», contratos/eventos.json);
  // al montarse, este pide la última con «decoraciones:pide». Sin ese componente encendido, no hay decoraciones que dibujar (y no se pide nada dos veces).
  // La época la decide la api (al poner la pieza): aquí se dibuja lo que venga y se ignora cualquier código que no esté en el catálogo.
  // Técnica (regla 12: la de three): cada pieza es una malla pequeña hecha con geometrías de three (círculos, planos, cilindros, conos, icosaedros y
  // octaedros), fundidas con mergeGeometries (three/addons/utils/BufferGeometryUtils.js, pedido con import() al montarse) y con su color en los vértices.
  // Instanciada: UNA InstancedMesh por pieza (6 como mucho), con un tope de MAX instancias EN TOTAL (las más cercanas al foco: quien pasea, la cabeza en
  // VR o, en la vista aérea, lo que se mira). Se recalcula en la fase «tarde» cada 0,5 s y solo se reescriben las matrices si cambia lo elegido, la
  // exageración o pasan 4 s (relieve fino recién llegado); es poco trabajo (≤ 64 matrices), sin Cola. libera() lo suelta todo (geometrías y materiales).
  // Presupuesto (regla 6): ≤ 6 llamadas (una por pieza con algo a la vista) y ≤ MAX × 40 = 2.560 triángulos; sin texturas. Medido por cálculo en Node
  // (pruebas/guardianes/decoraciones.test.js, con el three de verdad); en Chrome, escrito y sin ejecutar (decoraciones_chrome.test.js, por el banco).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/decoraciones.test.js)
  var DecoracionesPuro = (function () {
    var MAX = 64, CERCA_M = 80, REESCRIBE_S = 4, MUEVE_M = 2, RE_FINCA = /^[a-z0-9_-]{1,32}$/, RE_PIEZA = /^[a-z]{1,16}$/;
    // el catálogo de contratos/decoraciones.json (v 1): el guardián comprueba que es el mismo. «triangulos» es el tope de cada malla
    var CATALOGO = [
      { id: "flores", nombre: "Flores", epoca: "primavera", triangulos: 32 },
      { id: "cinta", nombre: "Cinta de color", epoca: "verano", triangulos: 24 },
      { id: "farolillo", nombre: "Farolillo", epoca: "otono", triangulos: 36 },
      { id: "cosecha", nombre: "Cosecha", epoca: "otono", triangulos: 40 },
      { id: "luces", nombre: "Luces", epoca: "invierno", triangulos: 40 },
      { id: "lazo", nombre: "Lazo", epoca: "invierno", triangulos: 24 }
    ];
    var POR_ID = {}; CATALOGO.forEach(function (p) { POR_ID[p.id] = p; });
    var MAX_TRI = CATALOGO.reduce(function (a, p) { return Math.max(a, p.triangulos); }, 0);
    // cómo es cada pieza: primitivas de three (tipo y argumentos del constructor), dónde van (p, en metros desde el punto del que cuelga; +x hacia fuera de
    // la copa, +y arriba), giro (r, radianes xyz), escala (s) y color (sRGB). El origen es el punto de la copa del que cuelga. «brilla»: material sin luz.
    var CIRCULO = Math.PI / 2;
    function enArco(n, f) { var o = []; for (var i = 0; i < n; i++) o.push(f(n > 1 ? i / (n - 1) : 0.5, i)); return o; }
    var FORMAS = {
      // 6 florecillas de 5 pétalos (un círculo de 5 lados cada una) en guirnalda: 30 triángulos
      flores: { brilla: false, partes: enArco(6, function (t, i) { return { g: "Circle", a: [0.07, 5], p: [0.02, -0.06 - 0.1 * Math.sin(t * Math.PI), -0.3 + 0.6 * t], r: [0, CIRCULO, 0], color: ["#f4a6c8", "#fff4e0", "#ffd34d"][i % 3] }; }) },
      // dos tiras de 6 tramos colgando en V: 24 triángulos
      cinta: { brilla: false, partes: [
        { g: "Plane", a: [0.06, 0.7, 1, 6], p: [0.02, -0.35, -0.05], r: [0.12, CIRCULO, 0], ondea: 0.03, color: "#d8323c" },
        { g: "Plane", a: [0.06, 0.6, 1, 6], p: [0.02, -0.3, 0.05], r: [-0.12, CIRCULO, 0], ondea: 0.03, color: "#2f6fd6" }] },
      // un farolillo: cuerpo de 6 lados con sus tapas (24) y su sombrerete (6): 30 triángulos
      farolillo: { brilla: true, partes: [
        { g: "Cylinder", a: [0.11, 0.11, 0.26, 6, 1, false], p: [0.04, -0.25, 0], color: "#ff9a2e" },
        { g: "Cone", a: [0.13, 0.08, 6, 1, true], p: [0.04, -0.08, 0], color: "#4a3420" }] },
      // dos aceitunas (un icosaedro de 20 caras cada una, algo alargadas): 40 triángulos
      cosecha: { brilla: false, partes: [
        { g: "Icosahedron", a: [0.06, 0], p: [0.03, -0.12, -0.04], s: [1, 1.3, 1], color: "#3b2a3f" },
        { g: "Icosahedron", a: [0.06, 0], p: [0.03, -0.2, 0.05], s: [1, 1.3, 1], color: "#6f7d2a" }] },
      // 5 bombillas (un octaedro de 8 caras cada una) en una guirnalda que se descuelga: 40 triángulos
      luces: { brilla: true, partes: enArco(5, function (t, i) { var z = -0.4 + 0.8 * t; return { g: "Octahedron", a: [0.05, 0], p: [0.03, -0.1 - 0.15 * (1 - Math.pow(z / 0.4, 2)), z], color: ["#ffe27a", "#ff6b6b", "#7ad1ff", "#9cff8a", "#ffb36b"][i] }; }) },
      // un lazo: dos lazadas (conos de 4 lados con su base, 8 + 8) y el nudo (un octaedro, 8): 24 triángulos
      lazo: { brilla: false, partes: [
        { g: "Cone", a: [0.08, 0.16, 4, 1, false], p: [0.03, -0.1, -0.08], r: [-CIRCULO, 0, 0], color: "#c8102e" },
        { g: "Cone", a: [0.08, 0.16, 4, 1, false], p: [0.03, -0.1, 0.08], r: [CIRCULO, 0, 0], color: "#c8102e" },
        { g: "Octahedron", a: [0.04, 0], p: [0.03, -0.1, 0], color: "#9e0b22" }] }
    };
    function pieza(id) { return typeof id === "string" && POR_ID.hasOwnProperty(id) ? POR_ID[id] : null; }
    function clave(finca, copas) { return finca + ":" + copas; }
    // la lista que publica la personalización ([{ finca, copas_id, pieza, mia }]) → solo lo que vale y se conoce, sin repetir olivo (gana el primero), en orden
    // de clave (estable: la misma lista da siempre el mismo orden). Un código que no está en el catálogo se ignora (contratos/olivos-haza.schema.json).
    function indexa(l) {
      var visto = {}, out = [];
      (Array.isArray(l) ? l : []).forEach(function (o) {
        if (!o || typeof o !== "object" || !RE_FINCA.test(o.finca) || !(Number.isInteger(o.copas_id) && o.copas_id >= 0 && o.copas_id <= 4294967295)) return;
        if (typeof o.pieza !== "string" || !RE_PIEZA.test(o.pieza) || !pieza(o.pieza)) return;
        var k = clave(o.finca, o.copas_id); if (visto[k]) return; visto[k] = true;
        out.push({ clave: k, finca: o.finca, copas_id: o.copas_id, pieza: o.pieza, mia: o.mia === true });
      });
      return out.sort(function (a, b) { return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0; });
    }
    // un número de 0 a 1 que solo depende del olivo (el giro y la altura de su pieza no cambian de una vuelta a otra)
    function azar(n, sal) { var x = Math.sin((n % 100003) * 12.9898 + sal * 78.233) * 43758.5453; return x - Math.floor(x); }
    // dónde va la pieza de un olivo: copa = { x, y (norte), h, perfil[8] } en metros locales; radio(perfil, ang) el de la copa en esa dirección (06_arboles);
    // factor, el de la copa dibujada (FACTOR_R8 o FACTOR_R8_GEN); suelo, la cota del terreno; exag, la exageración. → { x, y, z (escena), giro, escala, alto }
    // A una dirección fija por olivo (de su id), a ALTO ∈ [0,62, 0,78] de su altura y a 0,85 del radio de la copa en esa dirección (asoma sin flotar).
    function coloca(copa, n, radio, factor, suelo, exag) {
      var ang = azar(n, 1) * 2 * Math.PI, alto = 0.62 + 0.16 * azar(n, 2), r = Math.max(0.3, radio(copa.perfil, ang) * factor * 0.85);
      var px = copa.x + Math.cos(ang) * r, py = copa.y + Math.sin(ang) * r, h = Math.max(1, copa.h);
      return { x: px, y: (suelo + h * alto) * exag, z: -py, giro: ang, escala: Math.min(1.5, Math.max(0.8, h / 4)), alto: alto };
    }
    // el foco: en VR la cabeza, paseando la cámara y, en la vista aérea, el punto que se mira (objetivo). → { x, z } de la escena
    function foco(o) {
      if (o.vr && o.cab) return { x: o.cab.x, z: o.cab.z };
      if (o.paseando || !o.objetivo) return { x: o.camara.x, z: o.camara.z };
      return { x: o.objetivo.x, z: o.objetivo.z };
    }
    // las que se dibujan: de las decoraciones válidas (indexa) cuyo olivo está en este mundo (posDe(item) → { x, z } o null), las que están a menos de cerca m
    // del foco, las max más cercanas; a igual distancia, por clave (orden estable). → [{ item, x, z, d2 }]
    function eligeCercanas(items, posDe, f, cerca, max) {
      var r = [], c2 = cerca * cerca;
      for (var i = 0; i < items.length; i++) {
        var p = posDe(items[i]); if (!p) continue;
        var dx = p.x - f.x, dz = p.z - f.z, d2 = dx * dx + dz * dz; if (d2 >= c2) continue;
        r.push({ item: items[i], x: p.x, z: p.z, d2: d2 });
      }
      r.sort(function (a, b) { return a.d2 - b.d2 || (a.item.clave < b.item.clave ? -1 : a.item.clave > b.item.clave ? 1 : 0); });
      return r.length > max ? r.slice(0, max) : r;
    }
    // lo elegido, repartido por pieza (cada grupo en orden de clave: la misma selección da las mismas instancias) y su firma (cambia si cambia algo)
    function reparte(sel) {
      var por = {}, firma = [];
      sel.forEach(function (s) { (por[s.item.pieza] = por[s.item.pieza] || []).push(s.item); });
      Object.keys(por).forEach(function (k) { por[k].sort(function (a, b) { return a.clave < b.clave ? -1 : 1; }); });
      CATALOGO.forEach(function (p) { if (por[p.id]) firma.push(p.id + "=" + por[p.id].map(function (x) { return x.clave; }).join(",")); });
      return { por: por, firma: firma.join(";") };
    }
    // ¿hay que volver a elegir? si cambió la lista o el foco se movió más de MUEVE_M
    function seMovio(a, b) { return !a || !b || Math.hypot(a.x - b.x, a.z - b.z) > MUEVE_M; }
    // el coste: llamadas (una por pieza con algo) y triángulos (los de cada malla por sus instancias); tri = { id: triángulos de su malla }
    function coste(por, tri) {
      var l = 0, t = 0; Object.keys(por).forEach(function (k) { if (por[k].length) { l++; t += (tri[k] || 0) * por[k].length; } });
      return { llamadas: l, triangulos: t };
    }
    // la fila de la ficha del olivo (honestidad, regla 5)
    function fila(item) {
      var p = item && pieza(item.pieza); if (!p) return null;
      return { k: "Decoración", v: p.nombre, de: "ilustrativa: la eligió " + (item.mia ? "tu familia" : "la familia de esa haza") + "; no la mide el gemelo" };
    }
    return { MAX: MAX, CERCA_M: CERCA_M, REESCRIBE_S: REESCRIBE_S, MUEVE_M: MUEVE_M, MAX_TRI: MAX_TRI, CATALOGO: CATALOGO, FORMAS: FORMAS,
      pieza: pieza, clave: clave, indexa: indexa, azar: azar, coloca: coloca, foco: foco, eligeCercanas: eligeCercanas, reparte: reparte, seMovio: seMovio, coste: coste, fila: fila };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/decoraciones.test.js con el three de verdad y un mundo de mentira)
  // una primitiva de three con los argumentos de FORMAS
  function decoracionesPrimitiva(t, a) {
    if (t === "Circle") return new THREE.CircleGeometry(a[0], a[1]);
    if (t === "Plane") return new THREE.PlaneGeometry(a[0], a[1], a[2], a[3]);
    if (t === "Cylinder") return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3], a[4], a[5]);
    if (t === "Cone") return new THREE.ConeGeometry(a[0], a[1], a[2], a[3], a[4]);
    if (t === "Icosahedron") return new THREE.IcosahedronGeometry(a[0], a[1]);
    if (t === "Octahedron") return new THREE.OctahedronGeometry(a[0], a[1]);
    return null;
  }
  // las mallas de las piezas: las primitivas de FORMAS, sin índice ni uv, con su color (lineal) en los vértices, fundidas en una geometría por pieza
  function decoracionesGeometria(id, U) {
    var forma = DecoracionesPuro.FORMAS[id]; if (!forma) return null;
    var partes = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    forma.partes.forEach(function (pt) {
      var g0 = decoracionesPrimitiva(pt.g, pt.a); if (!g0) return;
      var g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
      if (g.getAttribute("uv")) g.deleteAttribute("uv");
      if (pt.ondea) { var po = g.getAttribute("position"); for (var i = 0; i < po.count; i++) po.setX(i, po.getX(i) + pt.ondea * Math.sin(po.getY(i) * 9)); }
      e.set((pt.r || [0, 0, 0])[0], (pt.r || [0, 0, 0])[1], (pt.r || [0, 0, 0])[2]); q.setFromEuler(e);
      s.set.apply(s, pt.s || [1, 1, 1]); v.set(pt.p[0], pt.p[1], pt.p[2]);
      g.applyMatrix4(m.compose(v, q, s));
      c.set(pt.color);   // THREE.Color pasa el sRGB a lineal (gestión de color de three)
      var nv = g.getAttribute("position").count, col = new Float32Array(nv * 3);
      for (var k = 0; k < nv; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      partes.push(g);
    });
    var r = U.mergeGeometries(partes, false); partes.forEach(function (x) { x.dispose(); });
    if (r) r.computeVertexNormals();
    return r;
  }

  function DecoracionesMotor(n, cargaUtiles) {
    var P = DecoracionesPuro, API = ConfigPuro.prefijoApi(location.search, D.base);
    var st = { api: !!API, lib: API ? "pidiendo" : "sin servidor", validas: 0, enMundo: 0, elegidas: 0, llamadas: 0, triangulos: 0, reescrituras: 0, porPieza: {} };
    function estado() { var o = {}; Object.keys(st).forEach(function (k) { o[k] = k === "porPieza" ? JSON.parse(JSON.stringify(st.porPieza)) : st[k]; }); return o; }
    if (!API) return { tarde: function () {}, libera: function () {}, estado: estado };   // sin servidor: ni crea nada ni pide nada
    var fincaMundo = String(D.finca_id || "finca"), vivo = true, U = null, items = [], porClave = {}, copaPorId = null;
    var grupo = null, mallas = {}, triDe = {}, matLuz = null, matBrillo = null, firma = "", focoHecho = null, exagHecha = -1, tReescribe = 0, sucio = true;
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();

    function copaDe(it) {
      if (it.finca !== fincaMundo) return null;   // otra finca: ese olivo no está en este mundo
      if (!copaPorId) { copaPorId = {}; copas.forEach(function (c) { if (c.oliv && c.id >= 0) copaPorId[c.id] = c; }); }
      return copaPorId[it.copas_id] || null;
    }
    function posDe(it) { var c = copaDe(it); return c ? { x: c.x, z: -c.y } : null; }
    function factorDe(c) { return typeof Generados !== "undefined" && Generados.rotulo(c.i) ? FACTOR_R8_GEN : FACTOR_R8; }

    // ---- los datos, por el Bus (los publica la personalización)
    function recibe(d) {
      items = P.indexa(d && d.lista); porClave = {};
      items.forEach(function (it) { porClave[it.clave] = it; });
      st.validas = items.length; st.enMundo = items.filter(function (it) { return !!copaDe(it); }).length; sucio = true;
    }
    n.on("decoraciones:cambian", recibe);

    // ---- la ficha del olivo: la fila «Decoración», rotulada como ilustrativa
    var quitaCompl = Entidades.complementa("olivo", function (f, id) {
      var m = /^olivo:([a-z0-9_-]{1,32}):(\d{1,10})$/.exec(String(id || "")); if (!m) return;
      var fl = P.fila(porClave[P.clave(m[1], +m[2])]); if (fl) f.filas = (f.filas || []).concat([fl]);
    });

    // ---- las mallas: una InstancedMesh por pieza, creada la primera vez que hace falta (MAX instancias: el tope es para todas juntas)
    function malla(id) {
      if (mallas[id]) return mallas[id];
      var geo = decoracionesGeometria(id, U); if (!geo) return null;
      if (!grupo) { grupo = new THREE.Group(); grupo.name = "decoraciones de los olivos"; scene.add(grupo); }
      var forma = P.FORMAS[id], mat;
      if (forma.brilla) mat = matBrillo || (matBrillo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      else mat = matLuz || (matLuz = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      var im = new THREE.InstancedMesh(geo, mat, P.MAX);
      im.name = "decoración " + id; im.count = 0; im.visible = false; im.castShadow = im.receiveShadow = false;
      im.raycast = function () {};   // el olivo se elige por su copa (06_arboles), no por su pieza
      grupo.add(im); mallas[id] = im; triDe[id] = geo.getAttribute("position").count / 3;
      return im;
    }
    function escribe(por) {
      P.CATALOGO.forEach(function (p) {
        var l = por[p.id] || [], im = l.length ? malla(p.id) : mallas[p.id];
        if (!im) return;
        for (var i = 0; i < l.length; i++) {
          var c = copaDe(l[i]), o = P.coloca(c, l[i].copas_id, radioEn, factorDe(c), suelo(c.x, c.y), exag);
          q.setFromAxisAngle(eje, o.giro); pv.set(o.x, o.y, o.z); sv.set(o.escala, o.escala, o.escala);
          im.setMatrixAt(i, m4.compose(pv, q, sv));
        }
        im.count = l.length; im.visible = l.length > 0;
        if (l.length) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      });
      var k = P.coste(por, triDe); st.llamadas = k.llamadas; st.triangulos = k.triangulos;
      st.porPieza = {}; Object.keys(por).forEach(function (id) { st.porPieza[id] = por[id].length; });
      exagHecha = exag; tReescribe = 0; st.reescrituras++;
    }
    function tarde(dt) {
      if (!vivo || !U) return;
      tReescribe += dt || 0;
      var vr = typeof VRX !== "undefined" && VRX && VRX.on;
      var f = P.foco({ vr: vr, cab: vr ? VRX.cab : null, paseando: typeof paseando !== "undefined" && paseando, camara: camera.position, objetivo: typeof objetivo !== "undefined" ? objetivo : null });
      if (!sucio && !P.seMovio(f, focoHecho) && exag === exagHecha && tReescribe < P.REESCRIBE_S) return;
      var r = P.reparte(P.eligeCercanas(items, posDe, f, P.CERCA_M, P.MAX)); st.elegidas = 0; Object.keys(r.por).forEach(function (k) { st.elegidas += r.por[k].length; });
      focoHecho = f;
      if (r.firma !== firma || sucio || exag !== exagHecha || tReescribe >= P.REESCRIBE_S) { firma = r.firma; escribe(r.por); }
      sucio = false;
    }
    function vacia() {
      Object.keys(mallas).forEach(function (k) { var im = mallas[k]; if (grupo) grupo.remove(im); im.geometry.dispose(); if (im.dispose) im.dispose(); });
      if (matLuz) matLuz.dispose(); if (matBrillo) matBrillo.dispose();
      if (grupo) scene.remove(grupo);
      grupo = null; mallas = {}; triDe = {}; matLuz = matBrillo = null; firma = ""; st.llamadas = st.triangulos = 0; st.porPieza = {};
    }
    cargaUtiles().then(function (u) { if (!vivo) return; U = u; st.lib = "lista"; sucio = true; }, function (e) { if (vivo) st.lib = "sin utilidades de three: " + String(e && e.message || e).slice(0, 80); });
    n.on("depura:lineas", function (d) { if (d && d.lineas && st.llamadas) d.lineas.push("Decoraciones: " + st.llamadas + " llamadas · " + st.elegidas + " piezas · " + st.triangulos + " triángulos (ilustrativas)"); });
    window.__decoraciones = function (que) { if (que === "libera") { Componentes.libera("decoraciones-olivo"); return null; } return estado(); };   // pruebas y ?debug
    n.limpia(function () { try { delete window.__decoraciones; } catch (e) { window.__decoraciones = undefined; } });
    Bus.emite("decoraciones:pide", {});   // la última lista, si la personalización ya la tenía (si no, llegará sola)
    function libera() { vivo = false; vacia(); if (quitaCompl) { quitaCompl(); quitaCompl = null; } items = []; porClave = {}; copaPorId = null; }
    return { tarde: tarde, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?decoraciones=0 lo apaga; ?decoraciones=1 lo enciende.
  Componentes.registra({
    id: "decoraciones-olivo", version: 1,
    consume: ["copas", "radioEn", "Generados", "objetivo", "paseando", "VRX"],
    expone: [],
    eventos: { escucha: ["decoraciones:cambian", "depura:lineas"], emite: ["decoraciones:pide"] },
    bandera: { defecto: true, url: "decoraciones" },
    // ≤ 6 llamadas (una InstancedMesh por pieza con algo a la vista) y ≤ MAX (64) instancias en total de ≤ 40 triángulos: 2.560. Sin texturas.
    // Contado en Node con el three de verdad (decoraciones.test.js): flores 30, cinta 24, farolillo 30, cosecha 40, luces 40 y lazo 24 triángulos por pieza.
    presupuesto: { llamadas: 6, triangulos: 2560 },
    fases: { tarde: 0.5 },
    monta: function (n) { return DecoracionesMotor(n, function () { return import("three/addons/utils/BufferGeometryUtils.js"); }); },
    actualiza: { tarde: function (dt, t, api) { api.tarde(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
