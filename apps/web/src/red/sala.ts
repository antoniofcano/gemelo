// La lógica de la sala de la presencia (F2, contratos/presencia.md v1; MU5-n, A3-6a: antes el trozo puro de apps/web/motor/26_presencia.js, que queda como talón):
// el aspecto que llega en los metadatos (Aspecto), a quién se manda la pose y con qué retardo se dibuja a cada uno (SalaPose), el chat (Chat), si la presencia en red
// arranca sola (AutoPresencia) y su reintento (Reintento). Movidos tal cual. Lo que llega de la sala (metadatos, identidades, bytes) es DATO de otras personas y se
// valida aquí con el contrato. Sin three ni DOM: es red (MUNDOS §1, solo importa de datos/). Lo prueban sala.test.ts y pruebas/guardianes/presencia*.test.js.
import { BufferPose, PoseCodec } from "./pose.ts";

// [puro:inicio] — el aspecto, la lógica de la sala (SalaPose) y el chat: sin THREE ni DOM
// El aspecto del muñeco lejano (AV2, decisión 131; criterios C2, C3, C5, C7 y C13 de doc/sistema/AVATARES-FAMILIA.md): 10 tonos de piel (ninguno «de serie»: lo que no se
// ha elegido se reparte por el alias), color de ropa de arriba y de abajo por persona (10 nombres del campo, para cualquier cuerpo), altura (3) y complexión (3) que escalan el
// muñeco, y el apoyo que lleva (a pie, bastón, andador o silla de ruedas). NADA depende del género. Lo que llega por los metadatos de la sala son campos OPCIONALES del contrato
// `presencia` v1 (contratos/presencia.md): un cliente de antes los ignora, y sin ellos el muñeco es el de siempre (camisa 0-5, piel 0-4, pantalón del paseante).
export const Aspecto: any = (function () {
  // los 10 tonos de la maqueta (prototipos/avatares), de muy claro a muy oscuro; la ropa, con nombres del campo (verde olivo, aceituna negra, tierra, almagra, trigo, cielo, adelfa, cal, pizarra, lavanda)
  var PIELES: any = [0xf6dcc8, 0xeec5a6, 0xe0ac86, 0xcf9670, 0xb97d57, 0xa06844, 0x855436, 0x6b412a, 0x523020, 0x3b2217];
  var ROPA: any = [0x6b7f3a, 0x2f2a2a, 0x8a5a3b, 0xa8432f, 0xd8b65e, 0x6f9fc6, 0xd77a9a, 0xece7dc, 0x4b5563, 0x8b7bb5];
  var CAMISAS: any = [0xc0533a, 0x3f7cc2, 0xe0b23a, 0x5d9b4a, 0x8a5bb0, 0xe8e2d4], PANTALON: any = 0x37455c;   // los de antes (camisa 0-5) y el pantalón fijo del paseante
  // OF10 (decisión 107): la oficina, siempre visible, con CHALECO verde oliva (el tronco del muñeco; más claro que el «verde olivo» de la ropa de las familias,
  // ROPA[0], para que no se confundan) e INSIGNIA (una caja clara en el pecho, del instanciado del sombrero). Ilustrativo (regla 5)
  var CHALECO: any = 0xa3b236, INSIGNIA: any = 0xf4ecc2;
  // AV4 (ADR-0025): los colores del pelo y del vello del VRM (negro, castaño oscuro, castaño, castaño claro, rubio, cobrizo, canoso, blanco). Las tres paletas son las del
  // catálogo v2 (contratos/avatares.md §9) y las de la portada: lo vigila pruebas/guardianes/avatares.test.js
  var PELO: any = [0x1f1a17, 0x3d2a1e, 0x6a4a30, 0x8f6a45, 0xc9a465, 0xa5522c, 0x9a9690, 0xe6e3dc];
  var PIEL_ANTES: any = [1, 2, 4, 6, 7];   // piel 0-4 de antes → el tono más cercano de los 10
  var ALTURAS: any = { baja: 0.93, media: 1, alta: 1.07 }, COMPLEXIONES: any = { delgada: 0.84, media: 1, ancha: 1.24 }, MOVILIDADES: any = ["pie", "baston", "andador", "silla"];
  function ent(v?: any, a?: any, b?: any) { return typeof v === "number" && v % 1 === 0 && v >= a && v <= b ? v : null; }
  function opc(v?: any, lista?: any, def?: any) { return typeof v === "string" && Object.prototype.hasOwnProperty.call(lista, v) ? v : def; }
  // lo que trae `avatar` de los metadatos (lo que no cuadra toma el valor neutro: nulo o «media»/«pie»)
  // AV4 (ADR-0025): la receta del creador por piezas (cuerpo, pelo, color de pelo, vello, ropa y accesorios: ids del catálogo v2, que aquí solo se comprueban de forma;
  // lo que no esté en el catálogo lo trata 26b_avatares.js como ausente)
  var ID: any = /^[a-z0-9-]{1,32}$/;
  function id(v?: any) { return typeof v === "string" && ID.test(v) ? v : null; }
  function lee(av?: any) {
    av = av && typeof av === "object" ? av : {};
    var acc: any = Array.isArray(av.acc) ? av.acc.filter(function (x?: any) { return id(x); }).slice(0, 3) : [];
    return { tono: ent(av.tono, 0, 9), arriba: ent(av.arriba, 0, 9), abajo: ent(av.abajo, 0, 9), altura: opc(av.altura, ALTURAS, "media"), complexion: opc(av.complexion, COMPLEXIONES, "media"),
      movilidad: MOVILIDADES.indexOf(av.movilidad) >= 0 ? av.movilidad : "pie",
      cuerpo: id(av.cuerpo), pelo: id(av.pelo), peloColor: ent(av.pelo_color, 0, 9), vello: id(av.vello), ropa: id(av.ropa), acc: acc };
  }
  function hash(t?: any) { var h: any = 2166136261; t = String(t); for (var i: any = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // lo que se dibuja de una persona. info = SalaPose.leeInfo(...): { camisa, piel, alias, aspecto }. Sin tono elegido, el de antes (piel 0-4)
  // si la api lo mandó distinto del de serie (1); si no, uno repartido por el alias, para que nadie tenga «el tono por defecto».
  function viste(info?: any) {
    var as: any = info.aspecto || lee(null), tono: any = as.tono;
    if (tono === null) tono = info.piel !== 1 && info.piel >= 0 && info.piel <= 4 ? PIEL_ANTES[info.piel] : hash(info.alias) % 10;
    return {
      piel: PIELES[tono], tono: tono, camisa: as.arriba !== null ? ROPA[as.arriba] : CAMISAS[info.camisa], pantalon: as.abajo !== null ? ROPA[as.abajo] : PANTALON,
      propioPiel: as.tono !== null, propioCamisa: as.arriba !== null,   // lo que ELIGIÓ la persona manda sobre los colores del catálogo VRM
      fa: ALTURAS[as.altura], fc: COMPLEXIONES[as.complexion], mov: as.movilidad,
      pelo: PELO[as.peloColor !== null && as.peloColor < PELO.length ? as.peloColor : hash(info.alias) % PELO.length], receta: as,   // AV4: el color del pelo del VRM y la receta entera
      oficial: !!info.oficial, chaleco: info.oficial ? CHALECO : null   // OF10: la oficina lleva chaleco (y su insignia: una caja más, ver cajas())
    };
  }
  // cuántas cajas de accesorios pide: el sombrero (1), el apoyo (silla 2: asiento y respaldo; bastón 1; andador 3: barra y dos laterales) y, la oficina, su insignia (1, la última)
  var CAJAS_APOYO: any = { pie: 0, baston: 1, andador: 3, silla: 2 }, CAJAS_MAX: any = 5;
  function cajas(sombrero?: any, mov?: any, oficial?: any) { return (sombrero ? 1 : 0) + (CAJAS_APOYO[mov] || 0) + (oficial ? 1 : 0); }
  return { PIELES: PIELES, ROPA: ROPA, PELO: PELO, CAMISAS: CAMISAS, PANTALON: PANTALON, PIEL_ANTES: PIEL_ANTES, ALTURAS: ALTURAS, COMPLEXIONES: COMPLEXIONES, MOVILIDADES: MOVILIDADES, CAJAS_MAX: CAJAS_MAX, CHALECO: CHALECO, INSIGNIA: INSIGNIA, lee: lee, viste: viste, cajas: cajas, hash: hash };
})();
// Sala de verdad (?presencia=red): a quién se manda la pose en cada tic (10 Hz a los cercanos, 2 Hz a toda la sala), quién está cerca (entra a 55 m y sale a 65 m),
// a qué ritmo le llega cada uno (y por tanto con qué retardo se dibuja) y quién está «en vista aérea» (conectado y sin pose reciente: decisión 60).
// No sabe nada de LiveKit: la presencia le pasa lo que recibe por la red (37_red.js) y publica lo que devuelve tic(). Los metadatos de la sala se leen como DATOS (leeInfo()).
export const SalaPose: any = (function () {
  var TICK: any = 100, CADA_LEJOS: any = 5, ENTRA: any = 55, SALE: any = 65, SIN_POSE: any = 2000, RAPIDO: any = 300, RET_CERCA: any = 150, RET_LEJOS: any = 650;
  var ROLES: any = ["hogar", "guia", "corresponsal", "oficina", "admin"], OFICIALES: any = ["oficina", "admin"], DISPOSITIVOS: any = ["escritorio", "movil", "quest"], SOMBREROS: any = ["ninguno", "paja", "gorra"];
  function crea(seq?: any) { return { otros: Object.create(null), seq: (seq | 0) & 0xffff, nTick: 0, tTick: null, enviados: 0, recibidos: 0, viejos: 0, malos: 0 }; }
  function entra(s?: any, id?: any, info?: any) {
    var o: any = s.otros[id];
    if (!o) o = s.otros[id] = { id: id, info: info || null, buf: BufferPose.crea(), tUlt: null, intervalo: 500, cerca: false, cab: null, tipo: 0, modo: 0 };
    else if (info) o.info = info;
    return o;
  }
  function sale(s?: any, id?: any) { delete s.otros[id]; }
  // una pose que llega: se descarta si no es del contrato o si es vieja; el intervalo entre llegadas (media móvil) dice si llega a 10 o a 2 Hz
  function recibe(s?: any, id?: any, bytes?: any, ahora?: any) {
    var p: any = PoseCodec.decodifica(bytes); if (!p) { s.malos++; return false; }
    var o: any = entra(s, id);
    if (o.tUlt !== null && ahora - o.tUlt > SIN_POSE) { o.buf = BufferPose.crea(); o.tUlt = null; o.intervalo = 500; }   // vuelve tras un rato (vista aérea o recarga): se empieza de cero
    if (!BufferPose.recibe(o.buf, p, ahora)) { s.viejos++; return false; }
    if (o.tUlt !== null) o.intervalo = o.intervalo * 0.7 + Math.min(2000, Math.max(0, ahora - o.tUlt)) * 0.3;
    o.tUlt = ahora; o.cab = p.cab.p; o.tipo = p.tipo; o.modo = p.modo; s.recibidos++;
    return true;
  }
  function conPose(o?: any, ahora?: any) { return o.tUlt !== null && ahora - o.tUlt <= SIN_POSE; }
  // cada 100 ms: devuelve null si aún no toca, [] si no hay que mandar nada (en vista aérea, pose = null, no se publica) o [{ bytes, destinos }]
  // (destinos = null: a toda la sala; si no, las identidades cercanas). La cercanía la calcula el emisor con la última pose de cada uno.
  function tic(s?: any, ahora?: any, pose?: any) {
    if (s.tTick !== null && ahora - s.tTick < TICK) return null;
    s.tTick = s.tTick === null || ahora - s.tTick > 3 * TICK ? ahora : s.tTick + TICK; s.nTick++;
    var cerca: any = [], id: any, o: any, d: any;
    for (id in s.otros) {
      o = s.otros[id];
      if (!pose || !conPose(o, ahora)) { o.cerca = false; continue; }
      d = Math.hypot(pose.cab.p[0] - o.cab[0], pose.cab.p[2] - o.cab[2]);
      o.cerca = o.cerca ? d < SALE : d < ENTRA;
      if (o.cerca) cerca.push(id);
    }
    if (!pose) return [];
    var todos: any = s.nTick % CADA_LEJOS === 0;
    if (!todos && !cerca.length) return [];
    s.seq = (s.seq + 1) & 0xffff; pose.seq = s.seq; s.enviados++;
    return [{ bytes: PoseCodec.codifica(pose), destinos: todos ? null : cerca }];
  }
  function retardo(o?: any) { return o.intervalo < RAPIDO ? RET_CERCA : RET_LEJOS; }
  // el apartado Gente: quien tiene pose reciente «pasea» (o va con gafas); quien no, está «en vista aérea» (no se dibuja)
  function gente(s?: any, ahora?: any) {
    var l: any = [], id: any, o: any;
    for (id in s.otros) { o = s.otros[id]; l.push({ id: id, info: o.info, enMundo: conPose(o, ahora), estado: conPose(o, ahora) ? (o.tipo === PoseCodec.QUEST ? "con gafas" : o.modo === PoseCodec.QUAD ? "en quad" : o.modo === PoseCodec.DRON ? "con el dron" : "paseando") : "en vista aérea" }); }
    // la oficina, primera (OF10, OFICINA.md §6); luego por alias
    return l.sort(function (a?: any, b?: any) {
      var oa: any = a.info && a.info.oficial ? 0 : 1, ob: any = b.info && b.info.oficial ? 0 : 1; if (oa !== ob) return oa - ob;
      var x: any = (a.info && a.info.alias) || "", y: any = (b.info && b.info.alias) || ""; return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  // a quién se dibuja (avatar, minimapa, «Ir con»): a quien está en la sala, con pose reciente (no «en vista aérea») y no has bloqueado tú
  function seVe(s?: any, id?: any, ahora?: any, bloqueados?: any) { var o: any = s.otros[id]; return !!o && !(bloqueados && bloqueados[id]) && conPose(o, ahora); }
  function entero(v?: any, a?: any, b?: any, def?: any) { return typeof v === "number" && v % 1 === 0 && v >= a && v <= b ? v : def; }
  // metadatos del token (los pone la api): se comprueban tipo y límites de cada campo; lo que no cuadra toma un valor neutro
  function leeInfo(txt?: any) {
    var m: any = null;
    try { m = JSON.parse(typeof txt === "string" && txt ? txt : "{}"); } catch (e: any) { m = null; }
    if (!m || typeof m !== "object") m = {};
    var av: any = m.avatar && typeof m.avatar === "object" ? m.avatar : {}, alias: any = typeof m.alias === "string" ? Chat.limpia(m.alias) : null;
    var rol: any = ROLES.indexOf(m.rol) >= 0 ? m.rol : "hogar", oficial: any = OFICIALES.indexOf(rol) >= 0;
    // OF10 (decisión 107): la oficina se ve como «Oficina» (la api ya lo pone así; aquí se asegura) y ningún otro alias que la nombre se enseña (no suplanta:
    // «Oficina», «0ficina», «La oficina de Ana»… se ven como «Visitante»; se compara sin tildes, espacios ni signos y con 0 → o, 1 → i)
    if (oficial) alias = "Oficina";
    else if (alias && /oficina/.test(alias.normalize("NFD").toLowerCase().replace(/0/g, "o").replace(/[1l|!]/g, "i").replace(/[^a-z]/g, ""))) alias = null;
    return {
      alias: alias ? Array.from(alias).slice(0, 24).join("") : "Visitante",
      rol: rol, oficial: oficial,
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
export const Chat: any = (function () {
  var MAX: any = 280, RARO: any = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
  var enc: any = typeof TextEncoder !== "undefined" ? new TextEncoder() : null, dec: any = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
  function limpia(t?: any) {
    if (typeof t !== "string") return null;
    var s: any = t.replace(RARO, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    var c: any = Array.from(s);
    return c.length > MAX ? c.slice(0, MAX).join("").trim() : s;
  }
  function codifica(t?: any) { var s: any = limpia(t); return s === null ? null : enc.encode(s); }
  function decodifica(b?: any) {
    if (b instanceof ArrayBuffer) b = new Uint8Array(b);
    if (!b || typeof b.byteLength !== "number" || !b.byteLength || b.byteLength > MAX * 4) return null;
    var s: any; try { s = dec.decode(b); } catch (e: any) { return null; }
    return Array.from(s).length > MAX ? null : limpia(s);
  }
  return { MAX: MAX, limpia: limpia, codifica: codifica, decodifica: decodifica };
})();
// F2b: ¿arranca sola la presencia en red? Función pura. busqueda = location.search; prefijo = ConfigPuro.prefijoApi(...) (null sin api: file://, fixture, banco);
// ajuste = la casilla «Ver a los demás y chatear» de Ajustes (true por defecto). Devuelve "sim"|"red" si la URL lo manda (como siempre), "0" si la URL la apaga,
// "pregunta" si hay que preguntar a la api (sin ?presencia=, con api y con la casilla marcada) y "" si no se hace nada (como antes de F2b).
// Y cuando la api contesta, decideRed(respuesta) dice si arranca: solo con { red: true } exacto; cualquier otra cosa (error, 401, forma rara) = no.
export const AutoPresencia: any = (function () {
  function decide(busqueda?: any, prefijo?: any, ajuste?: any) {
    var m: any = /[?&]presencia=([^&]*)/.exec(busqueda || "");
    if (m) return m[1] === "sim" ? "sim" : m[1] === "red" ? "red" : m[1] === "0" ? "0" : "";   // otro valor (p. ej. 1): como hasta ahora, sin nada
    return prefijo && ajuste !== false ? "pregunta" : "";
  }
  function decideRed(j?: any) { return !!j && typeof j === "object" && j.red === true; }
  return { decide: decide, decideRed: decideRed };
})();
// F2b: el reintento de la presencia que arrancó sola. Función pura: espera(fallos) = ms hasta el siguiente intento tras el fallo n.º «fallos» (30 s, 60 s, 120 s…
// con tope de 10 min) o -1 cuando ya se intentó MAX veces (se deja en paz hasta recargar la página). Así un servidor caído no recibe más de un intento cada 30 s o más.
export const Reintento: any = (function () {
  var BASE: any = 30000, TOPE: any = 600000, MAX: any = 6;
  function espera(fallos?: any) { if (!(fallos >= 1) || fallos > MAX) return -1; return Math.min(TOPE, BASE * Math.pow(2, fallos - 1)); }
  return { espera: espera, BASE: BASE, TOPE: TOPE, MAX: MAX };
})();
// [puro:fin]
