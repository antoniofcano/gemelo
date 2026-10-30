// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: OlivosTiles
// Consume: 01_datos (D), 02_mundo (copas), 04b_escena3d (Escena3D), 06_arboles (gArboles)
// ===============================================================================
  // ---------- los olivos del tileset (F1d paso 4, ADR-0015; contrato tileset v2 en contratos/tileset.schema.json), solo cuando hay escena 3D Tiles (04b_escena3d.js).
  // Sin tileset no actúa. Con él, los olivos de media y larga distancia los dibuja el tileset (las instancias EXT_mesh_gpu_instancing de cada
  // glb, que 04b_escena3d.js ya no retira) y los de cerca siguen siendo del motor: el detalle de cerca de siempre (07b_arboles.js) y, con ?olivos=gen,
  // los generados (07ab_generados.js). Para que ningún olivo se dibuje dos veces, una MÁSCARA: 07b dice qué olivos dibuja de cerca (índices de copas[])
  // y en cada malla del tileset esas instancias se apartan al final y no se dibujan (count menor; ver Mascara), sin rehacer el glb.
  // Identidad (doc/sistema/TILES3D.md, «Identidad y tipo por instancia»): instancia → k = _INDICE_COPA → g = lst[k] → copas[g], con las copas de la
  // tesela rehechas aquí desde el json (la regla de olivo de 02_mundo.js dentro del cuadrado de extras.gemelo, en el orden de copas[]). Antes de
  // resolver nada se comprueban las huellas (crypto.subtle): la del registro (huella_registro) y la de cada tesela. Si el registro no casa, el json no
  // es el del tileset: fuera los olivos del tileset y el motor dibuja los suyos como siempre. Si no casa una tesela, sus olivos se retiran (se avisa)
  // en vez de dar a un árbol el id de otro. Sin crypto.subtle (contexto no seguro) se avisa y se resuelve solo por el índice.
  // _TIPO y sus nombres (extras.gemelo.tipos) se guardan por olivo para el catálogo de 07a (tipo(g), tipos()); no se dibuja por tipo todavía.
  // Presupuesto: los triángulos de olivo que el tileset manda a dibujar (sin los apartados) cuentan en el tope de 07b (TOPE_TRI): se restan del de
  // los generados y entran en su triEst.

  // [puro:inicio] — copas de cada tesela, huellas y máscara: sin THREE ni DOM; pruebas/guardianes/escena3d.test.js evalúa este trozo tal cual en Node
  var IdTiles = (function () {
    /** índices g de copas[] (objetos {x, y, oliv} como los de 02_mundo.js) de los olivos con x0 ≤ x < x0+lado e y0 ≤ y < y0+lado, en el orden de copas[] */
    function copasDe(cs, cuad) {
      var x0 = cuad[0], y0 = cuad[1], L = cuad[2], r = [];
      for (var g = 0; g < cs.length; g++) { var c = cs[g]; if (c.oliv && c.x >= x0 && c.x < x0 + L && c.y >= y0 && c.y < y0 + L) r.push(g); }
      return Int32Array.from(r);
    }
    /** ids de todas las copas: copas_id si el índice lo trae (id_fuente «copas_id»); si no, su índice (id_fuente «indice») */
    function ids(n, copasId) { var r = new Uint32Array(n); for (var g = 0; g < n; g++) r[g] = copasId ? copasId[g] : g; return r; }
    function de(todos, lst) { var r = new Uint32Array(lst.length); for (var k = 0; k < lst.length; k++) r[k] = todos[lst[k]]; return r; }
    /** "sha256:" + hex del SHA-256 de los ids como Uint32 little-endian (las máquinas de destino lo son); promesa */
    function huella(u32, subtle) {
      return subtle.digest("SHA-256", u32).then(function (b) {
        var h = new Uint8Array(b), s = "sha256:";
        for (var i = 0; i < h.length; i++) s += (h[i] < 16 ? "0" : "") + h[i].toString(16);
        return s;
      });
    }
    /** La máscara de una malla instanciada: ix = _INDICE_COPA (k por instancia), lst = las copas de la tesela y attrs = [{array, size}] con TODOS los
     *  atributos por instancia (matriz, color, _INDICE_COPA, _TIPO…), que se permutan juntos. reparte(m) pone primero, en su orden, las instancias cuyo
     *  olivo no está marcado (m[g] = 1: lo dibuja el motor de cerca) y detrás las marcadas; devuelve cuántas se dibujan (el count de la malla) o −1 si
     *  no cambió nada. Sin nada marcado, los arrays vuelven a ser exactamente los del glb. */
    function Mascara(ix, lst, attrs) {
      var n = ix.length, gDe = new Int32Array(n), oculta = new Uint8Array(n), base = attrs.map(function (a) { return a.array.slice(0, n * a.size); }), visibles = n, inicial = true;
      for (var i = 0; i < n; i++) { var k = ix[i]; gDe[i] = k >= 0 && k < lst.length && k === Math.floor(k) ? lst[k] : -1; }
      function reparte(m) {
        var cambia = inicial, i, nv = 0; inicial = false;
        for (i = 0; i < n; i++) { var o = gDe[i] >= 0 && m[gDe[i]] ? 1 : 0; if (o !== oculta[i]) { oculta[i] = o; cambia = true; } if (!o) nv++; }
        if (!cambia) return -1;
        var v = 0, h = nv;
        for (i = 0; i < n; i++) {
          var dst = oculta[i] ? h++ : v++;
          for (var a = 0; a < attrs.length; a++) { var s = attrs[a].size; attrs[a].array.set(base[a].subarray(i * s, i * s + s), dst * s); }
        }
        visibles = nv; return nv;
      }
      function apartadoG(g) { for (var i = 0; i < n; i++) if (gDe[i] === g) return !!oculta[i]; return null; }   // null: ese olivo no está en esta malla
      return { n: n, gDe: gDe, reparte: reparte, apartadoG: apartadoG, visibles: function () { return visibles; } };
    }
    return { copasDe: copasDe, ids: ids, de: de, huella: huella, Mascara: Mascara };
  })();
  // [puro:fin]

  var OlivosTiles = (function () {
    var estado = Escena3D.resumen().estado === "sin" ? "apagado" : "esperando", motivo = "", avisados = {}, porHuella = true;
    var G = null, ids = null, teselas = [], marcas = new Uint8Array(copas.length), deCerca = [], tipoG = null, nombres = null, visPuesta = null;
    var subtle = typeof crypto !== "undefined" && crypto && crypto.subtle ? crypto.subtle : null;
    function avisa(s) { if (avisados[s]) return; avisados[s] = true; console.warn("olivos del tileset: " + s); }
    function retira(T) {   // fuera de la escena y liberadas (si la tesela sigue cargada; las de una tesela que descarga la librería, las libera ella)
      T.mallas.forEach(function (o) { o.removeFromParent(); o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); o.dispose(); });
      T.mallas = []; T.masc = []; T.hecha = false;
    }
    function apaga(porque, callado) {
      if (estado === "sin" || estado === "apagado") return;
      estado = "sin"; motivo = porque; if (!callado) avisa(porque + " (los olivos los dibuja el motor como siempre)");
      teselas.forEach(retira); teselas = [];
    }
    function descarta(T, porque) { avisa(porque); retira(T); teselas = teselas.filter(function (x) { return x !== T; }); }

    // ----- ganchos de 04b_escena3d.js
    function alRaiz(ts) {   // load-root-tileset
      if (estado !== "esperando") return;
      G = ts && ts.extras && ts.extras.gemelo;
      if (!G || G.contrato_tileset !== 2) return apaga("el tileset no trae el contrato tileset v2");
      if (G.id_fuente === "copas_id" && !D.copas_id) return apaga("el tileset identifica por copas_id y el json no lo trae");
      if (G.id_fuente !== "copas_id" && D.copas_id) return apaga("el tileset identifica por índice y el json trae copas_id");
      ids = IdTiles.ids(copas.length, G.id_fuente === "copas_id" ? D.copas_id : null);
      nombres = G.tipos || { "-1": null }; tipoG = new Int16Array(copas.length).fill(-1);
      if (!subtle) {
        porHuella = false; estado = "activo";
        avisa("sin crypto.subtle (¿contexto no seguro?): no se comprueban las huellas y los olivos se resuelven solo por el índice");
        teselas.forEach(prepara); return;
      }
      estado = "comprobando";
      IdTiles.huella(ids, subtle).then(function (h) {
        if (estado !== "comprobando") return;
        if (h !== G.huella_registro) return apaga("la huella del registro no es la del tileset: el json no es del que salió");
        estado = "activo"; teselas.forEach(prepara);
      }, function (e) { apaga("no se pudo calcular la huella del registro: " + (e && e.message || e)); });
    }
    function alModelo(raizM, tile) {   // load-model: true = este módulo se queda con los olivos del glb; false = 04b los retira
      if (estado === "apagado" || estado === "sin") return false;
      var mallas = [];
      raizM.traverse(function (o) { if (o.isInstancedMesh && o.geometry.getAttribute("_INDICE_COPA")) mallas.push(o); });
      if (!mallas.length) return false;
      var e = tile && tile.extras && tile.extras.gemelo;
      if (!e || !e.cuadro) { avisa("tesela con olivos sin extras.gemelo (" + (tile && tile.content && tile.content.uri) + "): se retiran"); return false; }
      var T = { tile: tile, raizM: raizM, uri: tile.content && tile.content.uri, e: e, mallas: mallas, masc: [], hecha: false, fuera: false };
      mallas.forEach(function (m) { m.visible = false; });   // hasta comprobar su huella
      teselas.push(T);
      if (estado === "activo") prepara(T);
      return true;
    }
    function alSoltar(raizM) {   // dispose-model: la librería libera geometría y materiales; aquí solo se olvida la tesela
      teselas = teselas.filter(function (T) { if (T.raizM !== raizM) return true; T.fuera = true; return false; });
    }
    function prepara(T) {
      var lst = IdTiles.copasDe(copas, T.e.cuadro);
      if (lst.length !== T.e.olivos) return descarta(T, T.uri + ": las copas rehechas desde el json son " + lst.length + " olivos y la tesela trae " + T.e.olivos);
      if (T.mallas.some(function (m) { return m.count !== lst.length; })) return descarta(T, T.uri + ": instancias distintas de extras.gemelo.olivos");
      (porHuella ? IdTiles.huella(IdTiles.de(ids, lst), subtle) : Promise.resolve(null)).then(function (h) {
        if (T.fuera || estado !== "activo" || !T.mallas.length) return;
        if (porHuella && h !== T.e.huella) return descarta(T, T.uri + ": su huella no es la de sus copas en el json; sus olivos no se resuelven");
        T.mallas.forEach(function (m) {
          m.computeBoundingSphere();   // con todas las instancias, antes de apartar ninguna (three la calcula una vez)
          var gm = m.geometry, ix = gm.getAttribute("_INDICE_COPA"), tp = gm.getAttribute("_TIPO"), attrs = [{ array: m.instanceMatrix.array, size: 16, a: m.instanceMatrix }];
          if (m.instanceColor) attrs.push({ array: m.instanceColor.array, size: m.instanceColor.itemSize, a: m.instanceColor });
          Object.keys(gm.attributes).forEach(function (k) { var a = gm.attributes[k]; if (a.isInstancedBufferAttribute) attrs.push({ array: a.array, size: a.itemSize, a: a }); });
          var M = IdTiles.Mascara(ix.array.slice(0, m.count), lst, attrs);
          if (tp) for (var i = 0; i < M.n; i++) if (M.gDe[i] >= 0) tipoG[M.gDe[i]] = tp.array[i];
          T.masc.push({ m: m, M: M, attrs: attrs });
        });
        T.hecha = true; repartirT(T); visPuesta = null;
      }, function (e) { descarta(T, T.uri + ": " + (e && e.message || e)); });
    }
    function repartirT(T) {
      T.masc.forEach(function (x) {
        var nv = x.M.reparte(marcas); if (nv < 0) return;
        x.m.count = nv; x.attrs.forEach(function (a) { a.a.needsUpdate = true; });
      });
    }

    // ----- de 07b_arboles.js (reclasifica): los índices g de copas[] que el motor dibuja de cerca (su detalle visible y los generados)
    function cerca(lst) {
      var i;
      for (i = 0; i < deCerca.length; i++) marcas[deCerca[i]] = 0;
      for (i = 0; i < lst.length; i++) marcas[lst[i]] = 1;
      deCerca = lst.slice();
      teselas.forEach(function (T) { if (T.hecha) repartirT(T); });
    }
    // cada fotograma (desde 04b): las mallas del tileset solo se ven si se ven los árboles del motor (no en los modos Ortofoto ni Nube)
    function fotograma() {
      var v = estado === "activo" && gArboles.visible; if (v === visPuesta) return; visPuesta = v;
      teselas.forEach(function (T) { T.mallas.forEach(function (m) { m.visible = v && T.hecha; }); });
    }
    /** triángulos de olivo que el tileset manda a dibujar (instancias no apartadas de las mallas visibles de teselas visibles) */
    function triangulos() {
      if (estado !== "activo") return 0;
      var t = 0;
      teselas.forEach(function (T) {
        if (!T.hecha || (T.tile.traversal && !T.tile.traversal.visible)) return;
        T.masc.forEach(function (x) { if (!x.m.visible) return; var g = x.m.geometry, n = g.index ? g.index.count : g.getAttribute("position").count; t += x.m.count * n / 3; });
      });
      return t;
    }
    function resumen() {
      var inst = 0, vis = 0, hechas = 0;
      teselas.forEach(function (T) { if (T.hecha) hechas++; T.masc.forEach(function (x) { inst += x.M.n; vis += x.m.count; }); });
      return { estado: estado, motivo: motivo, porHuella: porHuella, teselas: teselas.length, hechas: hechas, instancias: inst, dibujadas: vis, apartadas: inst - vis, cerca: deCerca.length, triangulos: triangulos(), catalogo: G && G.catalogo_tipos || null };
    }
    /** _TIPO del olivo g (número local del tileset) y su nombre de catálogo (null = sin asignar); null si ninguna tesela cargada lo trajo todavía */
    function tipo(g) { if (!tipoG || g < 0 || g >= tipoG.length) return null; var n = tipoG[g], nm = nombres[String(n)]; return { n: n, nombre: nm === undefined ? null : nm }; }
    function tipos() { return nombres ? { catalogo: G.catalogo_tipos, nombres: JSON.parse(JSON.stringify(nombres)) } : null; }
    /** pruebas: en qué teselas cargadas está el olivo g y si está apartado en cada una */
    function instanciasDe(g) { var r = []; teselas.forEach(function (T) { T.masc.forEach(function (x) { var o = x.M.apartadoG(g); if (o !== null) r.push({ uri: T.uri, apartado: o, visible: x.m.visible }); }); }); return r; }

    if (estado === "esperando") Escena3D.engancha({ alRaiz: alRaiz, alModelo: alModelo, alSoltar: alSoltar, alApagar: function (m) { apaga(m, true); }, fotograma: fotograma });
    return { dibuja: function () { return estado === "activo"; }, cerca: cerca, triangulos: triangulos, resumen: resumen, tipo: tipo, tipos: tipos, instanciasDe: instanciasDe };
  })();
