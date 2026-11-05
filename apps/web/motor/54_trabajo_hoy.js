// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02_mundo (suelo), 02c_componentes (Componentes), 02e_entidades (Entidades, Usables), 03_escena (scene, exag),
//   09_camara (elige), 13_parcelas (parcelas), 14_historia (lista), 29_vr (ficha)
// Nota: Componente «trabajo-hoy» (F4b, W1): un tractor ilustrativo en cada haza con tarea en curso (DEDUCIDO), APAGADO por defecto (?trabajo=1). Solo se registra; nadie lo nombra. No pide nada: escucha el evento mundo:hoy. De lo que la derivación cree que consume, solo D, suelo, Componentes, Entidades, scene y exag son usos: $, Usables, elige, parcelas, lista, quita y ficha son palabras de sus textos o nombres propios. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/trabajo_hoy.test.js.
// ===============================================================================
  // ---------- trabajo en vivo, paso estático (F4b, tarea W1): un tractor de juguete en la haza que OlivarTrack dice que tiene una tarea en curso. DEDUCIDO (regla 5):
  // lo único que se sabe es «en esta parcela hay una tarea abierta»; no se sabe quién, cuántas personas, a qué hora, ni dónde dentro de la haza. NADA POR PERSONA: no se
  // pinta gente, ni números de trabajadores, ni nombres; un tractor por haza con tarea, siempre el mismo sitio (el centro de la haza) y el mismo aspecto. El tractor es
  // ILUSTRATIVO (una silueta de cajas, a escala doble para verse), y su sitio es el de la haza, no una posición medida.
  // De dónde sale el dato: del evento «mundo:hoy» que emite 53_mundo_hoy.js tras leer /api/mundo/hoy (trabajoSemana.porParcela: solo las parcelas con tareas EN CURSO y
  // solo si la lectura viene completa). Este módulo no pide nada (ni un fetch: el motor solo habla con su origen) y, sin ese evento o con la lectura incompleta, no
  // dibuja nada y no da errores. Si el id de la parcela no está en el índice de la finca, no se pinta (no se inventa el sitio).
  // APAGADO POR DEFECTO (?trabajo=1 lo enciende): OlivarTrack está apagado en el servidor a la espera de un token propio de solo lectura.
  // Presupuesto (regla 6, cifras de DISEÑO, no medidas): una InstancedMesh (1 llamada), hasta 16 tractores de 72 triángulos = 1.152 triángulos, sin texturas, sin sombras;
  // dispose() de la geometría, el material y la malla al liberar. La ficha (al acercarse o por Usables) lleva el rótulo «deducido».
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/trabajo_hoy.test.js)
  var TrabajoHoyPuro = (function () {
    var MAX = 16, ESCALA = 2, RADIO_CERCA = 30;
    var ID = /^[\p{L}\p{N}:_.#()/-]{1,120}$/u;
    // el tractor: cajas [centro x, y, z, mitades x, y, z, color]; +z hacia delante. 6 cajas × 12 triángulos = 72
    var CAJAS = [
      [0, 0.85, 0, 0.8, 0.35, 1.5, "#2f7d32"],      // capó y cuerpo
      [0, 1.65, -0.55, 0.75, 0.55, 0.7, "#f2f2ee"],  // cabina
      [-0.95, 0.65, -0.75, 0.2, 0.65, 0.65, "#222222"], [0.95, 0.65, -0.75, 0.2, 0.65, 0.65, "#222222"],   // ruedas de atrás
      [-0.9, 0.4, 1.0, 0.15, 0.4, 0.4, "#222222"], [0.9, 0.4, 1.0, 0.15, 0.4, 0.4, "#222222"]              // ruedas de delante
    ];
    var TRI_TRACTOR = CAJAS.length * 12;
    function color(hex) { var k = parseInt(hex.slice(1), 16); return [(k >> 16 & 255) / 255, (k >> 8 & 255) / 255, (k & 255) / 255]; }
    // la geometría sin índice: posiciones, normales (planas) y colores (sRGB; quien dibuja decide) en Float32Array
    function geometria() {
      var CARAS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], pos = [], nor = [], col = [];
      CAJAS.forEach(function (c) {
        var cc = color(c[6]);
        CARAS.forEach(function (nn) {
          var u = nn[0] ? [0, 1, 0] : [1, 0, 0], v = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];   // v = n × u
          var h = [c[3], c[4], c[5]];
          function p(a, b) { return [c[0] + nn[0] * h[0] + a * u[0] * h[0] + b * v[0] * h[0], c[1] + nn[1] * h[1] + a * u[1] * h[1] + b * v[1] * h[1], c[2] + nn[2] * h[2] + a * u[2] * h[2] + b * v[2] * h[2]]; }
          // dos triángulos por cara; antihorarios vistos desde fuera (u × v = n)
          [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (qq) { var pp = p(qq[0], qq[1]); pos.push(pp[0], pp[1], pp[2]); nor.push(nn[0], nn[1], nn[2]); col.push(cc[0], cc[1], cc[2]); });
        });
      });
      return { posicion: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col), triangulos: pos.length / 9 };
    }
    // un giro fijo por haza (de su id): el mismo siempre, sin azar
    function giro(id) { var h = 2166136261; for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return (h % 360) * Math.PI / 180; }
    // del payload de «mundo:hoy»: { trabajo: { parcelas: [ids], cuando } } → { ids, cuando } o null. Solo ids con la forma de OlivarTrack; sin repetidos
    function lee(d) {
      var t = d && typeof d === "object" ? d.trabajo : null;
      if (!t || typeof t !== "object" || !Array.isArray(t.parcelas)) return null;
      var visto = {}, ids = [];
      t.parcelas.forEach(function (x) { if (typeof x === "string" && ID.test(x) && !visto[x]) { visto[x] = 1; ids.push(x); } });
      return ids.length ? { ids: ids.slice(0, MAX), cuando: typeof t.cuando === "string" ? t.cuando : null } : null;
    }
    // los sitios: solo las parcelas que el índice de la finca conoce y con centro [este, norte] válido (si no, no se pinta: no se inventa el sitio)
    function sitios(ids, parcelas) {
      var out = [];
      (ids || []).forEach(function (id) {
        var p = (parcelas || []).filter(function (x) { return x && x.id === id; })[0];
        if (!p || !Array.isArray(p.centro) || !isFinite(p.centro[0]) || !isFinite(p.centro[1])) return;
        out.push({ id: id, nombre: typeof p.nombre === "string" && p.nombre.trim() ? p.nombre.trim().slice(0, 80) : id, x: p.centro[0], y: p.centro[1], giro: giro(id) });
      });
      return out;
    }
    function coste(k) { return { llamadas: k > 0 ? 1 : 0, triangulos: k * TRI_TRACTOR }; }
    function dia(iso) { return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : null; }
    // la ficha (texto llano, nunca HTML): el rótulo «deducido» va primero; dice lo que NO se sabe
    function ficha(s, cuando) {
      var d = dia(cuando);
      return { titulo: "Trabajo hoy · " + s.nombre, destacado: "Deducido: hoy hay una tarea en curso en esta haza",
        lineas: ["OlivarTrack tiene una tarea abierta en esta parcela. No dice quién, cuántas personas ni dónde están.", "El tractor es ilustrativo y está en el centro de la haza: no es una posición medida."],
        pie: "OlivarTrack" + (d ? ", leído el " + d : "") + " · deducido" };
    }
    return { MAX: MAX, ESCALA: ESCALA, RADIO_CERCA: RADIO_CERCA, TRI_TRACTOR: TRI_TRACTOR, geometria: geometria, giro: giro, lee: lee, sitios: sitios, coste: coste, ficha: ficha };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/trabajo_hoy.test.js con un three de verdad)
  function TrabajoHoyMotor(n) {
    var P = TrabajoHoyPuro, vivo = true, puestos = [], cuando = null, malla = null, geo = null, mat = null, exagHecha = -1, retira = null;
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(P.ESCALA, P.ESCALA, P.ESCALA);
    function idEnt(s) { return "trabajo:" + s.id; }
    function de(id) { for (var i = 0; i < puestos.length; i++) if (idEnt(puestos[i]) === id) return puestos[i]; return null; }
    function posDe(s) { return { x: s.x, y: suelo(s.x, s.y) * exag, z: -s.y }; }
    function crea() {
      var g = P.geometria();
      geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(g.posicion, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(g.normal, 3));
      var c = new THREE.Color(), lin = new Float32Array(g.color.length);
      for (var i = 0; i < g.color.length; i += 3) { c.setRGB(g.color[i], g.color[i + 1], g.color[i + 2], THREE.SRGBColorSpace); lin[i] = c.r; lin[i + 1] = c.g; lin[i + 2] = c.b; }   // sRGB a lineal (gestión de color de three)
      geo.setAttribute("color", new THREE.BufferAttribute(lin, 3));
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      malla = new THREE.InstancedMesh(geo, mat, P.MAX);
      malla.name = "trabajo de hoy (tractores, deducido)"; malla.count = 0; malla.visible = false; malla.castShadow = malla.receiveShadow = false; malla.frustumCulled = false;
      malla.raycast = function () {};   // se elige por la ficha de Entidades (cercanía), no por la malla
      scene.add(malla);
    }
    function escribe() {
      exagHecha = exag;
      if (!puestos.length) { if (malla) { malla.count = 0; malla.visible = false; } return; }
      if (!malla) crea();
      puestos.forEach(function (s, i) {
        var p = posDe(s); pv.set(p.x, p.y, p.z); q.setFromAxisAngle(eje, s.giro);
        malla.setMatrixAt(i, m4.compose(pv, q, sv));
      });
      malla.count = puestos.length; malla.instanceMatrix.needsUpdate = true; malla.visible = true;
    }
    n.on("mundo:hoy", function (d) {
      if (!vivo) return;
      var t = P.lee(d); cuando = t ? t.cuando : null;
      puestos = t ? P.sitios(t.ids, D.parcelas) : [];   // sin datos, lectura incompleta o parcela desconocida: nada
      escribe();
    });
    retira = Entidades.registra({ tipo: "trabajo", dueno: "54_trabajo_hoy", prioridad: 10, sinAnillo: true,
      ficha: function (id) { var s = de(id); return s ? P.ficha(s, cuando) : null; },
      existe: function (id) { return !!de(id); },
      lista: function () { return puestos.map(function (s) { return { id: idEnt(s) }; }); },
      pos: function (id) { var s = de(id); return s ? posDe(s) : null; },
      cerca: function (x, y) {
        var mejor = null, md = 1e9; puestos.forEach(function (s) { var d = Math.hypot(s.x - x, s.y - y); if (d < md) { md = d; mejor = s; } });
        return mejor ? { id: idEnt(mejor), d: md } : null;
      }, radioCerca: P.RADIO_CERCA });
    // si cambia la exageración vertical, los tractores se vuelven a posar en el suelo
    function tarde() { if (vivo && puestos.length && exag !== exagHecha) escribe(); }
    function estado() { var c = P.coste(puestos.length); return { tractores: puestos.length, llamadas: c.llamadas, triangulos: c.triangulos, ids: puestos.map(function (s) { return s.id; }) }; }
    function libera() {
      vivo = false; puestos = [];
      if (retira) { retira(); retira = null; }
      if (malla) { scene.remove(malla); if (malla.dispose) malla.dispose(); malla = null; }
      if (geo) { geo.dispose(); geo = null; } if (mat) { mat.dispose(); mat = null; }
    }
    return { tarde: tarde, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?trabajo=1 lo enciende; por defecto, apagado.
  Componentes.registra({
    id: "trabajo-hoy", version: 1,
    consume: ["Entidades", "parcelas", "ficha"],
    expone: [],
    eventos: { escucha: ["mundo:hoy"], emite: [] },
    bandera: { defecto: false, url: "trabajo" },
    // DISEÑO, no medido: 1 InstancedMesh y hasta 16 tractores de 72 triángulos (1.152); sin texturas ni sombras
    presupuesto: { llamadas: 1, triangulos: 1152 },
    fases: { tarde: 1 },
    monta: function (n) { return TrabajoHoyMotor(n); },
    actualiza: { tarde: function (dt, t, api) { api.tarde(); } },
    libera: function (api) { if (api) api.libera(); }
  });
