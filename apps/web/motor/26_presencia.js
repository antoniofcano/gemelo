// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro, sitioJunto
// Consume: 01_datos (D, $), 02_mundo (suelo, copas), 02e_entidades (Entidades), 03_escena (exag, modo), 04d_sombreado_tiles (hash),
//   06_arboles (tronco), 12_paseo (paseando, persona), 12b_llegada (Llegada), 13b_hazas (HazasPuro), 14_historia (lista), 15_tiempo (rumbo, hace),
//   16_vida (quad, vidaPaseo, dron)
// Nota: No es un componente ni monta nada: el protocolo y la lógica pura de la presencia compartida (PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro) y sitioJunto. La presencia que los usa es el componente de 38_presencia_compartida.js (C5). El trozo entre [puro:inicio] y [puro:fin] lo evalúan en Node pruebas/guardianes/presencia.test.js, presencia_red.test.js y muneco_aspecto.test.js.
// ===============================================================================
  // ---------- presencia compartida (F2, contratos/presencia.md): el protocolo y la lógica pura que comparten la presencia y quien la usa. Este fichero NO es un
  // componente ni monta nada: define el códec de la pose, el búfer de interpolación, la lógica de la sala (SalaPose), el chat, el aspecto y el muñeco, el sitio
  // donde dejarte junto a alguien o a una baliza (Encuentro, sitioJunto: también los usa 19_balizas.js) y nada más. La presencia que los usa es el componente
  // «presencia-compartida» (38_presencia_compartida.js, C5), que habla con la sala por el componente de la red (37_red.js, el único que conoce LiveKit);
  // los avatares VRM, el componente de 26b_avatares.js.

  // [puro:inicio] — códec de pose, búfer de interpolación, la lógica de la sala (SalaPose) y el chat: sin THREE ni DOM; pruebas/guardianes/presencia.test.js evalúa este trozo tal cual en Node
  var PoseCodec = (function () {
    var VERSION = 1, ESCRITORIO = 1, QUEST = 2, BYTES = { 1: 24, 2: 56 };
    var PIE = 0, QUAD = 1, DRON = 2;   // modo de quien publica, bits 4-5 del byte 1 (P6; los receptores de antes los ignoran: sigue siendo la v1)
    var R2 = Math.SQRT2, IR2 = Math.SQRT1_2, QMAX = 1023, I32MAX = 2147483647, I32MIN = -2147483648;
    function cm(v) {   // metros → centímetros enteros (int32); fuera del int32 o no finita es un error del que llama
      var c = Math.round(v * 100);
      if (!isFinite(c) || c > I32MAX || c < I32MIN) throw new RangeError("posición fuera del contrato de pose: " + v);
      return c;
    }
    // cuaternión [x, y, z, w] → u32 «smallest-three»: bits 30-31 = índice de la componente mayor (se vuelve positiva y no viaja); 3 × 10 bits = las otras tres
    function empaquetaQ(q) {
      var l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      if (!(l > 1e-9) || !isFinite(l)) throw new RangeError("cuaternión no válido");
      var im = 0, j, a = [0, 0, 0], k = 0;
      for (j = 1; j < 4; j++) if (Math.abs(q[j]) > Math.abs(q[im])) im = j;
      var s = q[im] < 0 ? -1 / l : 1 / l;
      for (j = 0; j < 4; j++) {
        if (j === im) continue;
        var v = Math.round((q[j] * s + IR2) / R2 * QMAX); a[k++] = v < 0 ? 0 : v > QMAX ? QMAX : v;
      }
      return ((im << 30) | (a[0] << 20) | (a[1] << 10) | a[2]) >>> 0;
    }
    function desempaquetaQ(u, out) {
      var im = u >>> 30, a = [(u >>> 20) & 1023, (u >>> 10) & 1023, u & 1023], k = 0, s = 0;
      for (var j = 0; j < 4; j++) { if (j === im) continue; var v = a[k++] / QMAX * R2 - IR2; out[j] = v; s += v * v; }
      out[im] = Math.sqrt(Math.max(0, 1 - s));
      return out;
    }
    function escribePieza(dv, o, pz) { dv.setInt32(o, cm(pz.p[0]), true); dv.setInt32(o + 4, cm(pz.p[1]), true); dv.setInt32(o + 8, cm(pz.p[2]), true); dv.setUint32(o + 12, empaquetaQ(pz.q), true); }
    function leePieza(dv, o) { return { p: [dv.getInt32(o, true) / 100, dv.getInt32(o + 4, true) / 100, dv.getInt32(o + 8, true) / 100], q: desempaquetaQ(dv.getUint32(o + 12, true), [0, 0, 0, 1]) }; }
    // pose = { tipo: 1|2, seq: u16, t: ms u32 del reloj del emisor, cab: {p:[x,y,z] m, q:[x,y,z,w]}, izq, der: {p, q} o null (solo tipo 2), modo: 0 a pie | 1 quad | 2 dron (si falta, a pie) } → Uint8Array de 24 o 56 B
    function codifica(pose) {
      var tipo = pose.tipo === QUEST ? QUEST : ESCRITORIO, b = new Uint8Array(BYTES[tipo]), dv = new DataView(b.buffer);
      var modo = pose.modo === QUAD || pose.modo === DRON ? pose.modo : PIE;
      var band = tipo | (tipo === QUEST && pose.izq ? 4 : 0) | (tipo === QUEST && pose.der ? 8 : 0) | (modo << 4);
      dv.setUint8(0, VERSION); dv.setUint8(1, band); dv.setUint16(2, pose.seq & 0xffff, true); dv.setUint32(4, pose.t >>> 0, true);
      escribePieza(dv, 8, pose.cab);
      if (tipo === QUEST) { if (pose.izq) escribePieza(dv, 24, pose.izq); if (pose.der) escribePieza(dv, 40, pose.der); }
      return b;
    }
    // Uint8Array (o ArrayBuffer) → pose, o null si no es una pose de esta versión (longitud, versión o tipo desconocidos: se descarta, no se adivina)
    function decodifica(b) {
      if (b instanceof ArrayBuffer) b = new Uint8Array(b);
      if (!b || typeof b.byteLength !== "number" || b.byteLength < 2) return null;
      var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), ver = dv.getUint8(0), band = dv.getUint8(1), tipo = band & 3;
      if (ver !== VERSION || !BYTES[tipo] || b.byteLength !== BYTES[tipo]) return null;
      var modo = (band >> 4) & 3;   // 3 está reservado: se toma como a pie (no se descarta la pose por eso); los bits 6-7, reservados, se ignoran
      var pose = { tipo: tipo, seq: dv.getUint16(2, true), t: dv.getUint32(4, true), cab: leePieza(dv, 8), izq: null, der: null, modo: modo === 3 ? PIE : modo };
      if (tipo === QUEST) { if (band & 4) pose.izq = leePieza(dv, 24); if (band & 8) pose.der = leePieza(dv, 40); }
      return pose;
    }
    return { VERSION: VERSION, ESCRITORIO: ESCRITORIO, QUEST: QUEST, BYTES: BYTES, PIE: PIE, QUAD: QUAD, DRON: DRON, codifica: codifica, decodifica: decodifica, empaquetaQ: empaquetaQ, desempaquetaQ: desempaquetaQ };
  })();

  // Búfer de interpolación de UN visitante remoto: guarda las últimas poses (por orden de secuencia), estima el desfase de relojes (mínimo de llegada − envío)
  // y devuelve la pose de «retardo» ms atrás, interpolada (posición lineal, giro nlerp); si falta la siguiente, extrapola como mucho EXTRA ms y luego se queda quieto.
  var BufferPose = (function () {
    var MAX = 12, EXTRA = 120;
    function crea() { return { m: [], seq: -1, tBajo: 0, tExt: 0, desfase: Infinity, viejas: 0 }; }
    function recibe(b, pose, ahora) {
      if (b.seq >= 0) { var d = (pose.seq - b.seq) & 0xffff; if (d === 0 || d >= 0x8000) { b.viejas++; return false; } }   // repetida o más vieja que la última: fuera
      var t = b.seq >= 0 ? b.tExt + ((pose.t - b.tBajo) | 0) : pose.t;   // el reloj del emisor es u32 y da la vuelta: se desenrolla con la diferencia con signo
      b.seq = pose.seq; b.tBajo = pose.t >>> 0; b.tExt = t;
      if (ahora - t < b.desfase) b.desfase = ahora - t;
      b.m.push({ t: t, tipo: pose.tipo, cab: pose.cab, izq: pose.izq, der: pose.der, modo: pose.modo | 0 });
      if (b.m.length > MAX) b.m.shift();
      return true;
    }
    function lerpP(a, c, k, o) { o[0] = a[0] + (c[0] - a[0]) * k; o[1] = a[1] + (c[1] - a[1]) * k; o[2] = a[2] + (c[2] - a[2]) * k; }
    function nlerpQ(a, c, k, o) {
      var s = a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3] < 0 ? -1 : 1, l = 0, i;
      for (i = 0; i < 4; i++) { o[i] = a[i] * (1 - k) + c[i] * s * k; l += o[i] * o[i]; }
      l = Math.sqrt(l) || 1; for (i = 0; i < 4; i++) o[i] /= l;
    }
    function pieza(a, c, k, o) {   // a o c pueden faltar (una mano que se pierde): se toma la que haya
      if (!a && !c) return false; if (!a) a = c; if (!c) c = a;
      lerpP(a.p, c.p, k, o.p); nlerpQ(a.q, c.q, Math.max(0, Math.min(1, k)), o.q); return true;
    }
    // out = { cab: {p, q}, izq: {p, q}, der: {p, q}, hayIzq, hayDer, tipo, t } (se reutiliza); devuelve false si aún no hay nada
    function muestra(b, ahora, retardo, out) {
      var m = b.m, n = m.length; if (!n) return false;
      var tr = ahora - b.desfase - retardo, a = m[0], c = m[0], k = 0, i;
      if (tr >= m[n - 1].t) {
        a = n > 1 ? m[n - 2] : m[n - 1]; c = m[n - 1];
        var dtc = c.t - a.t; k = dtc > 0 ? 1 + Math.min(tr - c.t, EXTRA) / dtc : 1;
      } else if (tr > m[0].t) {
        for (i = 1; i < n; i++) if (m[i].t > tr) { a = m[i - 1]; c = m[i]; k = (tr - a.t) / (c.t - a.t); break; }
      }
      out.tipo = c.tipo; out.modo = c.modo | 0; out.t = Math.min(tr, c.t + (k > 1 ? Math.min(tr - c.t, EXTRA) : 0));
      pieza(a.cab, c.cab, k, out.cab);
      out.hayIzq = pieza(a.izq, c.izq, Math.min(k, 1), out.izq); out.hayDer = pieza(a.der, c.der, Math.min(k, 1), out.der);
      return true;
    }
    function salida() { return { cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: { p: [0, 0, 0], q: [0, 0, 0, 1] }, der: { p: [0, 0, 0], q: [0, 0, 0, 1] }, hayIzq: false, hayDer: false, tipo: 1, modo: 0, t: 0 }; }
    return { MAX: MAX, EXTRA: EXTRA, crea: crea, recibe: recibe, muestra: muestra, salida: salida };
  })();
  // El aspecto del muñeco lejano (AV2, decisión 131; criterios C2, C3, C5, C7 y C13 de doc/sistema/AVATARES-FAMILIA.md): 10 tonos de piel (ninguno «de serie»: lo que no se
  // ha elegido se reparte por el alias), color de ropa de arriba y de abajo por persona (10 nombres del campo, para cualquier cuerpo), altura (3) y complexión (3) que escalan el
  // muñeco, y el apoyo que lleva (a pie, bastón, andador o silla de ruedas). NADA depende del género. Lo que llega por los metadatos de la sala son campos OPCIONALES del contrato
  // `presencia` v1 (contratos/presencia.md): un cliente de antes los ignora, y sin ellos el muñeco es el de siempre (camisa 0-5, piel 0-4, pantalón del paseante).
  var Aspecto = (function () {
    // los 10 tonos de la maqueta (prototipos/avatares), de muy claro a muy oscuro; la ropa, con nombres del campo (verde olivo, aceituna negra, tierra, almagra, trigo, cielo, adelfa, cal, pizarra, lavanda)
    var PIELES = [0xf6dcc8, 0xeec5a6, 0xe0ac86, 0xcf9670, 0xb97d57, 0xa06844, 0x855436, 0x6b412a, 0x523020, 0x3b2217];
    var ROPA = [0x6b7f3a, 0x2f2a2a, 0x8a5a3b, 0xa8432f, 0xd8b65e, 0x6f9fc6, 0xd77a9a, 0xece7dc, 0x4b5563, 0x8b7bb5];
    var CAMISAS = [0xc0533a, 0x3f7cc2, 0xe0b23a, 0x5d9b4a, 0x8a5bb0, 0xe8e2d4], PANTALON = 0x37455c;   // los de antes (camisa 0-5) y el pantalón fijo del paseante
    // AV4 (ADR-0025): los colores del pelo y del vello del VRM (negro, castaño oscuro, castaño, castaño claro, rubio, cobrizo, canoso, blanco). Las tres paletas son las del
    // catálogo v2 (contratos/avatares.md §9) y las de la portada: lo vigila pruebas/guardianes/avatares.test.js
    var PELO = [0x1f1a17, 0x3d2a1e, 0x6a4a30, 0x8f6a45, 0xc9a465, 0xa5522c, 0x9a9690, 0xe6e3dc];
    var PIEL_ANTES = [1, 2, 4, 6, 7];   // piel 0-4 de antes → el tono más cercano de los 10
    var ALTURAS = { baja: 0.93, media: 1, alta: 1.07 }, COMPLEXIONES = { delgada: 0.84, media: 1, ancha: 1.24 }, MOVILIDADES = ["pie", "baston", "andador", "silla"];
    function ent(v, a, b) { return typeof v === "number" && v % 1 === 0 && v >= a && v <= b ? v : null; }
    function opc(v, lista, def) { return typeof v === "string" && Object.prototype.hasOwnProperty.call(lista, v) ? v : def; }
    // lo que trae `avatar` de los metadatos (lo que no cuadra toma el valor neutro: nulo o «media»/«pie»)
    // AV4 (ADR-0025): la receta del creador por piezas (cuerpo, pelo, color de pelo, vello, ropa y accesorios: ids del catálogo v2, que aquí solo se comprueban de forma;
    // lo que no esté en el catálogo lo trata 26b_avatares.js como ausente)
    var ID = /^[a-z0-9-]{1,32}$/;
    function id(v) { return typeof v === "string" && ID.test(v) ? v : null; }
    function lee(av) {
      av = av && typeof av === "object" ? av : {};
      var acc = Array.isArray(av.acc) ? av.acc.filter(function (x) { return id(x); }).slice(0, 3) : [];
      return { tono: ent(av.tono, 0, 9), arriba: ent(av.arriba, 0, 9), abajo: ent(av.abajo, 0, 9), altura: opc(av.altura, ALTURAS, "media"), complexion: opc(av.complexion, COMPLEXIONES, "media"),
        movilidad: MOVILIDADES.indexOf(av.movilidad) >= 0 ? av.movilidad : "pie",
        cuerpo: id(av.cuerpo), pelo: id(av.pelo), peloColor: ent(av.pelo_color, 0, 9), vello: id(av.vello), ropa: id(av.ropa), acc: acc };
    }
    function hash(t) { var h = 2166136261; t = String(t); for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    // lo que se dibuja de una persona. info = SalaPose.leeInfo(...): { camisa, piel, alias, aspecto }. Sin tono elegido, el de antes (piel 0-4)
    // si la api lo mandó distinto del de serie (1); si no, uno repartido por el alias, para que nadie tenga «el tono por defecto».
    function viste(info) {
      var as = info.aspecto || lee(null), tono = as.tono;
      if (tono === null) tono = info.piel !== 1 && info.piel >= 0 && info.piel <= 4 ? PIEL_ANTES[info.piel] : hash(info.alias) % 10;
      return {
        piel: PIELES[tono], tono: tono, camisa: as.arriba !== null ? ROPA[as.arriba] : CAMISAS[info.camisa], pantalon: as.abajo !== null ? ROPA[as.abajo] : PANTALON,
        propioPiel: as.tono !== null, propioCamisa: as.arriba !== null,   // lo que ELIGIÓ la persona manda sobre los colores del catálogo VRM
        fa: ALTURAS[as.altura], fc: COMPLEXIONES[as.complexion], mov: as.movilidad,
        pelo: PELO[as.peloColor !== null && as.peloColor < PELO.length ? as.peloColor : hash(info.alias) % PELO.length], receta: as   // AV4: el color del pelo del VRM y la receta entera
      };
    }
    // cuántas cajas de accesorios pide: el sombrero (1) y el apoyo (silla 2: asiento y respaldo; bastón 1; andador 3: barra y dos laterales)
    var CAJAS_APOYO = { pie: 0, baston: 1, andador: 3, silla: 2 }, CAJAS_MAX = 4;
    function cajas(sombrero, mov) { return (sombrero ? 1 : 0) + (CAJAS_APOYO[mov] || 0); }
    return { PIELES: PIELES, ROPA: ROPA, PELO: PELO, CAMISAS: CAMISAS, PANTALON: PANTALON, PIEL_ANTES: PIEL_ANTES, ALTURAS: ALTURAS, COMPLEXIONES: COMPLEXIONES, MOVILIDADES: MOVILIDADES, CAJAS_MAX: CAJAS_MAX, lee: lee, viste: viste, cajas: cajas, hash: hash };
  })();
  // Sala de verdad (?presencia=red): a quién se manda la pose en cada tic (10 Hz a los cercanos, 2 Hz a toda la sala), quién está cerca (entra a 55 m y sale a 65 m),
  // a qué ritmo le llega cada uno (y por tanto con qué retardo se dibuja) y quién está «en vista aérea» (conectado y sin pose reciente: decisión 60).
  // No sabe nada de LiveKit: la presencia le pasa lo que recibe por la red (37_red.js) y publica lo que devuelve tic(). Los metadatos de la sala se leen como DATOS (leeInfo()).
  var SalaPose = (function () {
    var TICK = 100, CADA_LEJOS = 5, ENTRA = 55, SALE = 65, SIN_POSE = 2000, RAPIDO = 300, RET_CERCA = 150, RET_LEJOS = 650;
    var ROLES = ["hogar", "guia", "corresponsal", "admin"], DISPOSITIVOS = ["escritorio", "movil", "quest"], SOMBREROS = ["ninguno", "paja", "gorra"];
    function crea(seq) { return { otros: Object.create(null), seq: (seq | 0) & 0xffff, nTick: 0, tTick: null, enviados: 0, recibidos: 0, viejos: 0, malos: 0 }; }
    function entra(s, id, info) {
      var o = s.otros[id];
      if (!o) o = s.otros[id] = { id: id, info: info || null, buf: BufferPose.crea(), tUlt: null, intervalo: 500, cerca: false, cab: null, tipo: 0, modo: 0 };
      else if (info) o.info = info;
      return o;
    }
    function sale(s, id) { delete s.otros[id]; }
    // una pose que llega: se descarta si no es del contrato o si es vieja; el intervalo entre llegadas (media móvil) dice si llega a 10 o a 2 Hz
    function recibe(s, id, bytes, ahora) {
      var p = PoseCodec.decodifica(bytes); if (!p) { s.malos++; return false; }
      var o = entra(s, id);
      if (o.tUlt !== null && ahora - o.tUlt > SIN_POSE) { o.buf = BufferPose.crea(); o.tUlt = null; o.intervalo = 500; }   // vuelve tras un rato (vista aérea o recarga): se empieza de cero
      if (!BufferPose.recibe(o.buf, p, ahora)) { s.viejos++; return false; }
      if (o.tUlt !== null) o.intervalo = o.intervalo * 0.7 + Math.min(2000, Math.max(0, ahora - o.tUlt)) * 0.3;
      o.tUlt = ahora; o.cab = p.cab.p; o.tipo = p.tipo; o.modo = p.modo; s.recibidos++;
      return true;
    }
    function conPose(o, ahora) { return o.tUlt !== null && ahora - o.tUlt <= SIN_POSE; }
    // cada 100 ms: devuelve null si aún no toca, [] si no hay que mandar nada (en vista aérea, pose = null, no se publica) o [{ bytes, destinos }]
    // (destinos = null: a toda la sala; si no, las identidades cercanas). La cercanía la calcula el emisor con la última pose de cada uno.
    function tic(s, ahora, pose) {
      if (s.tTick !== null && ahora - s.tTick < TICK) return null;
      s.tTick = s.tTick === null || ahora - s.tTick > 3 * TICK ? ahora : s.tTick + TICK; s.nTick++;
      var cerca = [], id, o, d;
      for (id in s.otros) {
        o = s.otros[id];
        if (!pose || !conPose(o, ahora)) { o.cerca = false; continue; }
        d = Math.hypot(pose.cab.p[0] - o.cab[0], pose.cab.p[2] - o.cab[2]);
        o.cerca = o.cerca ? d < SALE : d < ENTRA;
        if (o.cerca) cerca.push(id);
      }
      if (!pose) return [];
      var todos = s.nTick % CADA_LEJOS === 0;
      if (!todos && !cerca.length) return [];
      s.seq = (s.seq + 1) & 0xffff; pose.seq = s.seq; s.enviados++;
      return [{ bytes: PoseCodec.codifica(pose), destinos: todos ? null : cerca }];
    }
    function retardo(o) { return o.intervalo < RAPIDO ? RET_CERCA : RET_LEJOS; }
    // el apartado Gente: quien tiene pose reciente «pasea» (o va con gafas); quien no, está «en vista aérea» (no se dibuja)
    function gente(s, ahora) {
      var l = [], id, o;
      for (id in s.otros) { o = s.otros[id]; l.push({ id: id, info: o.info, enMundo: conPose(o, ahora), estado: conPose(o, ahora) ? (o.tipo === PoseCodec.QUEST ? "con gafas" : o.modo === PoseCodec.QUAD ? "en quad" : o.modo === PoseCodec.DRON ? "con el dron" : "paseando") : "en vista aérea" }); }
      return l.sort(function (a, b) { var x = (a.info && a.info.alias) || "", y = (b.info && b.info.alias) || ""; return x < y ? -1 : x > y ? 1 : 0; });
    }
    // a quién se dibuja (avatar, minimapa, «Ir con»): a quien está en la sala, con pose reciente (no «en vista aérea») y no has bloqueado tú
    function seVe(s, id, ahora, bloqueados) { var o = s.otros[id]; return !!o && !(bloqueados && bloqueados[id]) && conPose(o, ahora); }
    function entero(v, a, b, def) { return typeof v === "number" && v % 1 === 0 && v >= a && v <= b ? v : def; }
    // metadatos del token (los pone la api): se comprueban tipo y límites de cada campo; lo que no cuadra toma un valor neutro
    function leeInfo(txt) {
      var m = null;
      try { m = JSON.parse(typeof txt === "string" && txt ? txt : "{}"); } catch (e) { m = null; }
      if (!m || typeof m !== "object") m = {};
      var av = m.avatar && typeof m.avatar === "object" ? m.avatar : {}, alias = typeof m.alias === "string" ? Chat.limpia(m.alias) : null;
      return {
        alias: alias ? Array.from(alias).slice(0, 24).join("") : "Visitante",
        rol: ROLES.indexOf(m.rol) >= 0 ? m.rol : "hogar",
        dispositivo: DISPOSITIVOS.indexOf(m.dispositivo) >= 0 ? m.dispositivo : "escritorio",
        camisa: entero(av.camisa, 0, 5, 0), piel: entero(av.piel, 0, 4, 1), sombrero: SOMBREROS.indexOf(av.sombrero) >= 0 ? SOMBREROS.indexOf(av.sombrero) : 1,
        vrm: typeof av.vrm === "string" && /^[a-z0-9-]{1,32}$/.test(av.vrm) ? av.vrm : null,   // P7c (ADR-0020 §6): id del catálogo de avatares; si no cuadra, el muñeco
        aspecto: Aspecto.lee(av)   // AV2: tono, ropa, altura, complexión y apoyo (opcionales; ver Aspecto)
      };
    }
    return { TICK: TICK, SIN_POSE: SIN_POSE, crea: crea, entra: entra, sale: sale, recibe: recibe, tic: tic, retardo: retardo, gente: gente, conPose: conPose, seVe: seVe, leeInfo: leeInfo };
  })();

  // Chat de la sala (tema «chat», fiable, decisión 40: no se guarda en ningún sitio). Texto UTF-8 de como mucho 280 caracteres; se quitan los caracteres
  // de control y los de dirección (para que nadie disfrace un mensaje) y se juntan los espacios. Lo que llega se trata como texto, nunca como HTML.
  var Chat = (function () {
    var MAX = 280, RARO = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
    var enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null, dec = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
    function limpia(t) {
      if (typeof t !== "string") return null;
      var s = t.replace(RARO, " ").replace(/\s+/g, " ").trim();
      if (!s) return null;
      var c = Array.from(s);
      return c.length > MAX ? c.slice(0, MAX).join("").trim() : s;
    }
    function codifica(t) { var s = limpia(t); return s === null ? null : enc.encode(s); }
    function decodifica(b) {
      if (b instanceof ArrayBuffer) b = new Uint8Array(b);
      if (!b || typeof b.byteLength !== "number" || !b.byteLength || b.byteLength > MAX * 4) return null;
      var s; try { s = dec.decode(b); } catch (e) { return null; }
      return Array.from(s).length > MAX ? null : limpia(s);
    }
    return { MAX: MAX, limpia: limpia, codifica: codifica, decodifica: decodifica };
  })();
  // El muñeco de los demás (P5): el mismo del paseante local (12_paseo.js: cuerpo, cabeza, dos piernas y dos brazos) con su misma
  // animación de paso, calculada en el RECEPTOR con la velocidad horizontal que sale de la interpolación (la pose no trae nada de
  // esto: el contrato v1 no cambia). Los pies van al suelo de ESTE mundo (suelo local × exageración); de la pose solo se usan la
  // posición horizontal, la orientación de la cabeza y, con gafas, la altura de la cabeza sobre el suelo (para agacharse).
  var Muneco = (function () {
    var ALTURA = 1.6, PASO = 3.4, VREF = 1.7, AMP = 0.75, BRAZO = 0.8, BOTE = 0.03;   // los de su paseo (12_paseo.js)
    var SUAVE_V = 8, GIRO = 6, V_ANDA = 0.25, V_MAX = 8, SALTO = 5, AGACHO_MAX = 0.9;
    var SENTADO_P = 1.15, SENTADO_B = 1.05, MANDO_B = 1.0;   // los de 16_vida.js (vidaPaseo): en quad, piernas 1,15 y brazos 1,05 rad; con el dron, brazos 1,0
    var SILLA_BAJA = 0.31, SILLA_B = 0.55;   // AV2: cuánto baja el cuerpo sentado en su silla (cadera a ≈ 0,55 m) y el ángulo de los brazos hacia las ruedas
    var V_MAX_QUAD = 14;   // en quad se va a 12 m/s: la velocidad suavizada no se recorta a la de andar
    function crea() { return { x: null, z: null, vel: 0, paso: 0, yaw: 0 }; }
    function ang(d) { return Math.atan2(Math.sin(d), Math.cos(d)); }
    // st: estado del avatar; x, z: posición interpolada (ejes de three); yawCab: hacia dónde apunta su cabeza (giro en y; 0 = −z);
    // dt en s; sueloLocal: suelo(x, −z) de este mundo (sin exagerar); hCab: altura de su cabeza sobre el suelo según la pose;
    // conManos: trae manos (Quest) → los brazos no se animan; modo (P6): 0 a pie, 1 en quad (sentado: piernas y brazos adelante, sin paso, el cuerpo
    // 0,2 m detrás del centro del quad, como el paseante local en 16_vida.js), 2 con el dron (de pie, brazos al mando, sin paso).
    // Devuelve en `o` lo que se necesita para colocar las piezas (y el vehículo: o.vehiculo, o.yVeh, o.atras).
    // silla (AV2, decisión 131, criterio C7): a pie (modo 0) y con la silla de ruedas puesta, va SENTADO como en el quad (piernas 1,15 rad, sin paso) pero con los brazos a las ruedas, a la
    // misma velocidad y por los mismos caminos; el cuerpo baja SILLA_BAJA para que la cadera quede a ≈ 0,55 m y la cabeza a ≈ 1,3 m. o.vehiculo = 3 (la silla: se dibuja aparte).
    function avanza(st, x, z, yawCab, dt, sueloLocal, exag, hCab, conManos, o, modo, silla) {
      o = o || {}; modo = modo === 1 || modo === 2 ? modo : 0;
      if (st.x === null) { st.x = x; st.z = z; st.yaw = yawCab; }
      var dx = x - st.x, dz = z - st.z, d = Math.sqrt(dx * dx + dz * dz), v = dt > 0 && d < SALTO ? d / dt : 0;   // un salto (vuelve tras un hueco) no es andar
      var k = Math.min(1, dt * SUAVE_V);
      st.vel += (Math.min(v, modo === 1 ? V_MAX_QUAD : V_MAX) - st.vel) * k;
      // gira hacia donde anda; quieto, hacia donde apunta. Suave: como mucho GIRO rad/s… en proporción a lo que falta
      // en quad o con el dron el cuerpo va hacia donde apunta la cabeza (el emisor publica su rumbo; en quad, el del quad, que también da marcha atrás)
      var obj = !modo && st.vel > V_ANDA && d > 1e-6 ? Math.atan2(-dx, -dz) : yawCab;
      st.yaw = ang(st.yaw + ang(obj - st.yaw) * Math.min(1, dt * GIRO));
      st.x = x; st.z = z; o.vehiculo = modo; o.atras = 0;
      if (!modo && silla) {
        var ms = Math.min(1, st.vel / VREF);
        st.paso += st.vel * dt * PASO;   // solo para el vaivén de los brazos
        o.vehiculo = 3; o.yVeh = 0; o.yPies = sueloLocal * exag - SILLA_BAJA; o.yaw = st.yaw; o.vel = st.vel; o.mov = ms;
        o.piernaI = o.piernaD = SENTADO_P;
        o.brazoI = o.brazoD = conManos ? 0 : SILLA_B + Math.sin(st.paso) * 0.2 * ms;
        o.agacho = 0; o.yCab = o.yPies + ALTURA;
        return o;
      }
      if (modo) {   // sentado en el quad o quieto con el mando: sin paso ni bote
        var q = modo === 1;
        o.yVeh = sueloLocal * exag + 0.02; o.yPies = sueloLocal * exag - (q ? 0.02 : 0); o.atras = q ? 0.2 : 0;
        o.yaw = st.yaw; o.vel = st.vel; o.mov = 0;
        o.piernaI = o.piernaD = q ? SENTADO_P : 0;
        o.brazoI = o.brazoD = conManos ? 0 : q ? SENTADO_B : MANDO_B;
        o.agacho = 0; o.yCab = o.yPies + ALTURA;
        return o;
      }
      st.paso += st.vel * dt * PASO;
      var mov = Math.min(1, st.vel / VREF), sw = Math.sin(st.paso) * AMP * mov;
      o.yPies = sueloLocal * exag + Math.abs(Math.sin(st.paso)) * BOTE * mov;
      o.yaw = st.yaw; o.vel = st.vel; o.mov = mov;
      o.piernaI = sw; o.piernaD = -sw;
      o.brazoI = conManos ? 0 : -sw * BRAZO; o.brazoD = conManos ? 0 : sw * BRAZO;
      o.agacho = Math.max(0, Math.min(AGACHO_MAX, ALTURA - (isFinite(hCab) ? hCab : ALTURA)));
      o.yCab = o.yPies + ALTURA - o.agacho;
      return o;
    }
    // piezas del muñeco (las mismas medidas que el paseante de 12_paseo.js), con el pivote ARRIBA (hombro, cadera, cuello):
    // [ancho, largo, fondo, x, y del pivote, ¿pierna?, ¿brazo?]. y del pivote sin agacharse; agachado, baja el cuerpo y encogen las piernas
    var PIEZAS = [[0.46, 0.62, 0.25, 0, 1.48, 0, 0], [0.17, 0.86, 0.2, -0.12, 0.86, 1, 0], [0.17, 0.86, 0.2, 0.12, 0.86, 1, 0], [0.11, 0.58, 0.12, -0.3, 1.46, 0, 1], [0.11, 0.58, 0.12, 0.3, 1.46, 0, 1]];
    return { ALTURA: ALTURA, SILLA_BAJA: SILLA_BAJA, SILLA_B: SILLA_B, SENTADO_P: SENTADO_P, SENTADO_B: SENTADO_B, MANDO_B: MANDO_B, crea: crea, avanza: avanza, PIEZAS: PIEZAS };
  })();
  // «Ir con alguien» (I1): dónde dejarte cuando vas a donde está otra persona (Encuentro; el salto lo hace Llegada, 12b_llegada.js). A 2,5 m de ella (si no cabe, 3, 2, 3,5 o 4 m), por el lado desde el que
  // llegas y, si ahí hay árbol, probando cada 30° alrededor; mirándola. Un sitio vale si no cae dentro de ninguna copa (radio medio de su perfil LiDAR)
  // ni a menos de rTronco + 0,2 m de un tronco y está dentro de la finca (3 m de margen, como el paseo). Si ninguno está libre de copas, el primero libre
  // de troncos; si ni eso, el primero empujado fuera de los troncos como hace el paseo (12_paseo.js). t, desde = {x este, y norte};
  // obst = [{x, y, r}] (r = radio de la copa; 0 si no se sabe); ext = D.ext [oeste, norte, este, sur]; opc = {rTronco (0,55 a pie, 1,05 en quad), suelo(x, y)}.
  // Devuelve {x, y, ang (rumbo del paseo: 0 norte, π/2 este), z (suelo, si se da la función), libre: "copa" | "tronco" | "empujado", d}.
  var Encuentro = (function () {
    var DISTS = [2.5, 3, 2, 3.5, 4], BALIZA = [4.5, 4, 5, 3.5, 5.5], PASO = Math.PI / 6, MARGEN = 3, HOLGURA = 0.2;
    function dentro(x, y, ext) { return !ext || (x >= ext[0] + MARGEN && x <= ext[2] - MARGEN && y >= ext[3] + MARGEN && y <= ext[1] - MARGEN); }
    function mide(x, y, obst, rT) {   // 2 = libre de copas y troncos, 1 = solo de troncos, 0 = toca un tronco
      var r = 2;
      for (var i = 0; i < obst.length; i++) {
        var o = obst[i], d = Math.hypot(x - o.x, y - o.y);
        if (d < rT + HOLGURA) return 0;
        if (d < (o.r || 0)) r = 1;
      }
      return r;
    }
    function punto(t, desde, obst, ext, opc) {
      opc = opc || {}; obst = obst || [];
      var DS = opc.dists && opc.dists.length ? opc.dists : DISTS, rT = opc.rTronco > 0 ? opc.rTronco : 0.55, dx = desde ? desde.x - t.x : 0, dy = desde ? desde.y - t.y : -1;
      var base = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : -Math.PI / 2;   // ángulo matemático (desde el este, antihorario); sin dirección clara, por el sur
      var mejor = null, nivelMejor = -1, primero = null;
      for (var i = 0; i < DS.length && nivelMejor < 2; i++) {
        for (var k = 0; k < 12; k++) {
          var a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * PASO, x = t.x + Math.cos(a) * DS[i], y = t.y + Math.sin(a) * DS[i];
          if (!dentro(x, y, ext)) continue;
          if (!primero) primero = { x: x, y: y };
          var n = mide(x, y, obst, rT);
          if (n > nivelMejor) { nivelMejor = n; mejor = { x: x, y: y, d: DS[i] }; if (n === 2) break; }
        }
      }
      var libre = nivelMejor === 2 ? "copa" : "tronco";
      if (nivelMejor < 1) {   // todo cerca toca algún tronco: el primero, empujado fuera de cada tronco (como el paseo)
        mejor = primero || { x: t.x + Math.cos(base) * DS[0], y: t.y + Math.sin(base) * DS[0] }; libre = "empujado";
        for (var j = 0; j < obst.length; j++) {
          var o = obst[j], ex = mejor.x - o.x, ey = mejor.y - o.y, dd = Math.hypot(ex, ey), R = rT + HOLGURA;
          if (dd < R) { dd = dd || 0.001; mejor.x = o.x + ex / dd * R; mejor.y = o.y + ey / dd * R; }
        }
        if (ext) { mejor.x = Math.max(ext[0] + MARGEN, Math.min(ext[2] - MARGEN, mejor.x)); mejor.y = Math.max(ext[3] + MARGEN, Math.min(ext[1] - MARGEN, mejor.y)); }
        mejor.d = Math.hypot(mejor.x - t.x, mejor.y - t.y);
      }
      mejor.ang = Math.atan2(t.x - mejor.x, t.y - mejor.y); mejor.libre = libre;
      if (typeof opc.suelo === "function") mejor.z = opc.suelo(mejor.x, mejor.y);
      return mejor;
    }
    // I4: quién está en una parcela (las balizas como punto de encuentro): de los puntos que se dibujan (las entidades «persona» de Entidades.lista: ya sin vista aérea ni
    // bloqueados), los que caen dentro de su linde; dentro(x, y, [anillo]) es HazasPuro.dentroPoligono (13b_hazas.js). Alias en orden alfabético
    function enParcela(puntos, linde, dentro) {
      var l = []; if (!puntos || !linde || typeof dentro !== "function") return l;
      for (var i = 0; i < puntos.length; i++) if (dentro(puntos[i].x, puntos[i].y, [linde])) l.push(puntos[i].alias);
      return l.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    }
    return { DISTS: DISTS, BALIZA: BALIZA, punto: punto, enParcela: enParcela };
  })();
  // [puro:fin]

  // el sitio libre junto a t = {x este, y norte} (Encuentro.punto) con los árboles de alrededor (copas: radio medio del perfil LiDAR); dists, las distancias
  // a probar (por defecto 2,5-4 m: ir con alguien; Encuentro.BALIZA, 4-5,5 m: ir a una baliza); desde, de dónde llegas
  function sitioJunto(t, desde, dists, rTronco) {
    var obst = [], R2 = 196;   // 14 m alrededor
    for (var i = 0; i < copas.length; i++) {
      var o = copas[i], dx = o.x - t.x, dy = o.y - t.y;
      if (dx * dx + dy * dy < R2) obst.push({ x: o.x, y: o.y, r: o.perfil.reduce(function (s, v) { return s + v; }, 0) / 8 });
    }
    return Encuentro.punto(t, desde, obst, D.ext, { dists: dists, rTronco: rTronco, suelo: suelo });
  }
