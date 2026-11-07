// La voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032, decisiones 205-212): la lógica pura del corro (MU5-n, A3-6b: antes el trozo puro de
// apps/web/motor/47b_corro.js). Movida tal cual: EL AVISO «cercania» (el texto de contratos/voz-consentimiento.md palabra por palabra, con su AVISO_VERSION y la
// declaración de mayor de edad; EIPD-VOZ), lo que se acepta de la api (validado: es dato de fuera), invitar solo a menos de 8 m, la salida por lejanía con su
// histéresis, la vista aérea, quién habla, las altas y bajas y el icono. Sin DOM ni three: vive en red/voz/ con la voz. El componente que la usa (lo que se ve:
// la caja, los diálogos, las láminas, los halos y los iconos) es mundos/comun/corro.ts. Si cambias una palabra del aviso, sube AVISO_VERSION,
// VOZ_CERCANIA_AVISO_VERSION de apps/api/src/presencia/consentimiento_voz.ts y el contrato en el mismo commit (lo comprueba pruebas/guardianes/corro.test.js).

// [puro:inicio] (sin DOM ni THREE: lo prueban corro.test.ts y, en Node, pruebas/guardianes/corro.test.js como Mundos.CorroPuro)
export const CorroPuro: any = (function () {
  // ---- el aviso «cercania» (decisión 211; contratos/voz-consentimiento.md, «Aviso «cercania», versión 1»: este texto es el de allí, palabra por palabra; lo
  // comprueba corro.test.js). AVISO_VERSION es la de apps/api/src/presencia/consentimiento_voz.ts (VOZ_CERCANIA_AVISO_VERSION; otro guardián compara las dos).
  // Si cambias una palabra, sube las dos y el contrato en el mismo commit. [BORRADOR] pendiente de la asesoría (EIPD-VOZ §13.5).
  var AVISO_VERSION: any = 1;
  var AVISO: any = {
    version: AVISO_VERSION, borrador: true,
    titulo: "Hablar con quien pasea cerca (voz por cercanía)",
    tPasa: "Qué va a pasar", tNoPasa: "Qué no va a pasar",
    pasa: [
      "Podrás invitar a hablar a quien esté cerca de ti en la visita libre, y te podrán invitar. Solo hablaréis si la otra persona acepta: sin aceptar, nadie te oye y no oyes a nadie.",
      "Un corro es de 2 a 5 hogares. Todos veis quién está dentro y solo os oís entre vosotros; cuanto más lejos, más bajo (a más de 20 m dejáis de oíros).",
      "Tu micrófono solo se abre cuando pulsas el botón de hablar (o la tecla T, o el gatillo en las gafas) y se cierra al volver a pulsar, tras un minuto sin que hables y al salir del corro. Mientras está abierto lo verás: «● Tu micro está abierto».",
      "Hablarás con personas que quizá no conozcas y no hay nadie moderando en directo, como sí lo hay en las visitas guiadas. Si algo te molesta: Salir del corro, Silenciar a alguien, Bloquear (no podrá volver a invitarte) o Avisar a la oficina con un motivo. La oficina puede suspender la voz de un hogar.",
      "Puede oírse lo que suena a tu alrededor (otra persona de la casa, la tele). Te recomendamos usar auriculares."
    ],
    noPasa: [
      "No se graba nada: ni la voz ni lo que se dice; tampoco se transcribe.",
      "Nadie de fuera del corro te oye, aunque esté a tu lado: solo quien ha aceptado entra en la conversación.",
      "No se guarda con quién has hablado: solo un registro de quién entró y salió de cada corro y cuándo, para poder atender un aviso; se borra pasada la campaña y un año más.",
      "La voz por cercanía no se activa sola: la activas tú y la apagas cuando quieras en Configuración → Voz (o en el panel de las gafas). Apagarla o retirar este permiso te saca al momento de cualquier corro."
    ],
    declaracion: "Soy mayor de edad y no dejaré que hablen menores con mi cuenta.",
    masInfo: "Más detalles en la página de privacidad.",
    enlace: { texto: "Más detalles en la página de privacidad", href: "/#privacidad" },
    nota: "Texto provisional, pendiente de revisión por la asesoría.",
    activar: "Activar", ahoraNo: "Ahora no"
  };
  var URL: any = { estado: "/api/presencia/corros/estado", corros: "/api/presencia/corros", ajuste: "/api/presencia/corros/ajuste", invitaciones: "/api/presencia/corros/invitaciones",
    salir: "/api/presencia/corros/salir", bloqueos: "/api/presencia/corros/bloqueos", avisos: "/api/presencia/corros/avisos", consentimiento: "/api/presencia/voz/consentimiento?ambito=cercania" };
  // los motivos de un aviso (apps/api/src/presencia/cercania.ts, MOTIVOS_AVISO) con su texto, y el tope del texto libre (TEXTO_AVISO_MAX)
  var MOTIVOS: any = [["insultos", "Insultos"], ["acoso", "Acoso"], ["contenido_sexual", "Contenido sexual"], ["parece_menor", "Parece un menor"], ["otro", "Otro motivo"]], TEXTO_MAX: any = 280;
  // decisión 206 (provisional): invitar a menos de 8 m; salir solo a más de 40 m de todos durante 60 s, con histéresis (vuelve a «cerca» a 35 m o menos:
  // [SUPUESTO del agente]); 60 s en vista aérea. Hasta 5 hogares por corro (205). Sondeos de la api (s): en un corro o con invitaciones, con la voz activada, apagada
  var DIST: any = { invitar: 8, lejos: 40, vuelve: 35 }, LEJOS_S: any = 60, AEREA_S: any = 60, MAX_HOGARES: any = 5, SONDEO: any = { corro: 5, activa: 10, apagada: 30 }, PUBLICOS_S: any = 10;
  var ICONOS_MAX: any = 8, HALOS_MAX: any = 4, ALTO_ICONO: any = 0.9, ALTO_HALO: any = 0.42;   // m sobre los ojos del grupo (icono) y de quien habla (halo)
  var ICONO_TITULO: any = "Corro con voz", ICONO_TEXTO: any = "Hablan entre ellos: no les oyes y ellos no te oyen.";
  var MOTIVOS_SALIDA: any = ["salir", "lejos", "cambio_de_sala", "vista_aerea"];
  var PREFIJO: any = /^h_[A-Za-z0-9_-]{22}$/, IDENTIDAD: any = /^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/, ID: any = /^[A-Za-z0-9_-]{12}$/, SALA: any = /^corro-[A-Za-z0-9_-]{12}$/;
  function num(x?: any) { return typeof x === "number" && isFinite(x); }
  function txt(v?: any, max?: any) { return typeof v === "string" ? v.slice(0, max || 80) : ""; }
  // el prefijo de hogar (h_<22>) de una identidad de la sala (h_<22>_<8>); "" si no lo es
  function prefijoDe(identidad?: any) { return typeof identidad === "string" && IDENTIDAD.test(identidad) ? identidad.slice(0, 24) : ""; }
  function consentimiento(j?: any) { return j && typeof j === "object" && j.version === AVISO_VERSION && j.aceptada === true ? "si" : "no"; }
  function vacio() { return { disponible: false, activa: false, consentimiento: "no", suspendida: false, puedo: false, corro: null, recibidas: [], enviadas: [] }; }
  function quien(q?: any) { return q && typeof q === "object" && typeof q.prefijo === "string" && PREFIJO.test(q.prefijo) ? { prefijo: q.prefijo, alias: txt(q.alias, 40) || "Visitante" } : null; }
  // GET /api/presencia/corros/estado → lo que se usa, validado (lo que no encaja se descarta: es DATO que llega de fuera)
  function leeEstado(j?: any) {
    var v: any = vacio(); if (!j || typeof j !== "object") return v;
    v.disponible = j.disponible === true; v.activa = !!(j.ajuste && j.ajuste.activa === true); v.consentimiento = consentimiento(j.consentimiento);
    v.suspendida = !!(j.suspension && typeof j.suspension === "object"); v.puedo = v.disponible && j.puedo === true;
    var c: any = j.corro;
    if (c && typeof c === "object" && typeof c.sala === "string" && SALA.test(c.sala) && Array.isArray(c.miembros)) {
      var ms: any = c.miembros.map(function (m?: any) { var q: any = quien(m); return q ? { prefijo: q.prefijo, alias: q.alias, yo: !!(m && m.yo === true) } : null; }).filter(Boolean).slice(0, MAX_HOGARES);
      v.corro = { id: c.sala.slice(6), sala: c.sala, miembros: ms };
    }
    var inv: any = j.invitaciones && typeof j.invitaciones === "object" ? j.invitaciones : {};
    function listaInv(l?: any, campo?: any) { return (Array.isArray(l) ? l : []).map(function (i?: any) { var q: any = i && quien(i[campo]); return q && typeof i.id === "string" && ID.test(i.id) ? { id: i.id, quien: q, caduca: Date.parse(i.caduca_en) || 0 } : null; }).filter(Boolean); }
    v.recibidas = listaInv(inv.recibidas, "de"); v.enviadas = listaInv(inv.enviadas, "a");
    return v;
  }
  // GET /api/presencia/corros → [{ id, prefijos }] (para los iconos de quien está fuera)
  function leePublicos(j?: any) {
    var l: any = j && Array.isArray(j.corros) ? j.corros : [];
    return l.map(function (c?: any) { return c && typeof c.id === "string" && ID.test(c.id) && Array.isArray(c.prefijos) ? { id: c.id, prefijos: c.prefijos.filter(function (p?: any) { return typeof p === "string" && PREFIJO.test(p); }).slice(0, MAX_HOGARES) } : null; }).filter(Boolean);
  }
  // el tema «corro» de la sala libre (livekit-roles v8): solo lo manda la api, sin participante; { v: 1, que: "corro" | "invitacion" } → ¿hay que mirar el estado?
  function temaVale(texto?: any, de?: any) { if (de) return false; try { var j: any = JSON.parse(texto); return !!j && j.v === 1 && (j.que === "corro" || j.que === "invitacion"); } catch (e: any) { return false; } }
  function miembroDe(e?: any, identidad?: any) { var p: any = prefijoDe(identidad); return p && e && e.corro ? e.corro.miembros.filter(function (m?: any) { return m.prefijo === p; })[0] || null : null; }
  // ¿se puede invitar a esa identidad, a esa distancia (m, o null sin pose)? "" si sí; si no, el motivo
  function puedeInvitar(e?: any, identidad?: any, d?: any, yoPrefijo?: any) {
    var p: any = prefijoDe(identidad);
    if (!e || !e.puedo) return "no_puedes";
    if (!p) return "no_disponible";
    if (p === yoPrefijo) return "mismo_hogar";
    if (miembroDe(e, identidad)) return "ya_en_tu_corro";
    if (e.corro && e.corro.miembros.length >= MAX_HOGARES) return "corro_lleno";
    if (e.enviadas.some(function (i?: any) { return i.quien.prefijo === p; })) return "pendiente";
    if (!num(d) || d > DIST.invitar) return "lejos";
    return "";
  }
  function textoNoInvita(m?: any, alias?: any) {
    var a: any = alias || "esa persona";
    return ({ no_puedes: "Activa la voz por cercanía en Configuración → Voz para invitar a hablar.", lejos: "Acércate a menos de " + DIST.invitar + " m de " + a + " para invitarle a hablar.",
      ya_en_tu_corro: a + " ya está en tu corro.", corro_lleno: "Tu corro ya tiene cinco hogares.", pendiente: "Ya has invitado a " + a + ": espera su respuesta.",
      mismo_hogar: "Es tu propio hogar.", no_disponible: "Esa persona no está disponible para hablar ahora." } as any)[m] || "No se puede invitar ahora.";
  }
  // ¿lejos de todos? o = { distancias: [m | null], lejos (antes), t (s lejos hasta ahora), dt } → { lejos, t, sale }. Sin nadie a la vista, cuenta como lejos
  function lejania(o?: any) {
    var ds: any = (o && o.distancias || []).filter(num), cerca: any = ds.some(function (d?: any) { return d <= DIST.vuelve; }), todos: any = ds.every(function (d?: any) { return d > DIST.lejos; });
    var l: any = cerca ? false : todos ? true : !!(o && o.lejos), t: any = l ? (num(o.t) ? o.t : 0) + (num(o.dt) && o.dt > 0 ? o.dt : 0) : 0;
    return { lejos: l, t: t, sale: l && t >= LEJOS_S };
  }
  // ¿en vista aérea demasiado tiempo? o = { aerea, t, dt } → { t, sale }
  function aerea(o?: any) { var t: any = o && o.aerea ? (num(o.t) ? o.t : 0) + (num(o.dt) && o.dt > 0 ? o.dt : 0) : 0; return { t: t, sale: t >= AEREA_S }; }
  function textoSalida(m?: any) {
    return ({ salir: "Has salido del corro.", lejos: "Has salido del corro: llevabas un minuto lejos de los demás.", cambio_de_sala: "Has salido del corro al cambiar de sala.",
      vista_aerea: "Has salido del corro: llevabas un minuto en la vista aérea.", aviso: "Aviso enviado a la oficina. Has salido del corro." } as any)[m] || "Has salido del corro.";
  }
  // «Habla Ana.» / «Hablan Ana y Luis.» / «Hablan Ana, Luis y Eva.»; "" si no habla nadie
  function textoHablan(alias?: any) {
    var l: any = (alias || []).filter(function (a?: any) { return typeof a === "string" && a; });
    if (!l.length) return "";
    if (l.length === 1) return "Habla " + l[0] + ".";
    return "Hablan " + l.slice(0, -1).join(", ") + " y " + l[l.length - 1] + ".";
  }
  // lo que dicen las altas y bajas del corro entre dos estados: [texto]
  function cambios(antes?: any, ahora?: any) {
    var a: any = antes && antes.corro ? antes.corro.miembros : [], b: any = ahora && ahora.corro ? ahora.corro.miembros : [], out: any = [];
    var pa: any = a.map(function (m?: any) { return m.prefijo; }), pb: any = b.map(function (m?: any) { return m.prefijo; });
    if (!a.length && b.length) out.push("Estás en un corro con " + b.filter(function (m?: any) { return !m.yo; }).map(function (m?: any) { return m.alias; }).join(", ") + ". Solo os oís entre vosotros.");
    else if (a.length && b.length) {
      b.forEach(function (m?: any) { if (!m.yo && pa.indexOf(m.prefijo) < 0) out.push(m.alias + " ha entrado en el corro."); });
      a.forEach(function (m?: any) { if (!m.yo && pb.indexOf(m.prefijo) < 0) out.push(m.alias + " ha salido del corro."); });
    } else if (a.length && !b.length) out.push("El corro se ha deshecho.");
    return out;
  }
  // lo que se enseña de tu corro: e (leeEstado), hablan = { prefijo: true }, callados = { prefijo: true } → { visible, titulo, filas, enviadas, hablan }
  function vista(e?: any, hablan?: any, callados?: any) {
    var c: any = e && e.corro, env: any = e ? e.enviadas : [];
    if (!e || !e.disponible || (!c && !env.length)) return { visible: false, titulo: "", filas: [], enviadas: [], hablan: "" };
    var filas: any = c ? c.miembros.map(function (m?: any) { return { prefijo: m.prefijo, alias: m.yo ? "Tú" : m.alias, yo: m.yo, habla: !!(hablan && hablan[m.prefijo]), callado: !m.yo && !!(callados && callados[m.prefijo]) }; }) : [];
    return { visible: true, titulo: c ? ICONO_TITULO + " (" + filas.length + ")" : "Invitaciones", filas: filas,
      enviadas: env.map(function (i?: any) { return { id: i.id, alias: i.quien.alias }; }), hablan: textoHablan(filas.filter(function (f?: any) { return f.habla && !f.yo; }).map(function (f?: any) { return f.alias; })) };
  }
  // el centro de un grupo (cabezas en la escena: [{ x, y, z }]) → dónde va su icono, o null
  function centro(cabezas?: any) {
    var l: any = (cabezas || []).filter(function (c?: any) { return c && num(c.x) && num(c.y) && num(c.z); }); if (!l.length) return null;
    var x: any = 0, z: any = 0, y: any = -Infinity; l.forEach(function (c?: any) { x += c.x; z += c.z; y = Math.max(y, c.y); });
    return { x: x / l.length, y: y + ALTO_ICONO, z: z / l.length, n: l.length };
  }
  function textoError(j?: any, defecto?: any) { return j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje.slice(0, 200) : defecto; }
  return { AVISO_VERSION: AVISO_VERSION, AVISO: AVISO, URL: URL, MOTIVOS: MOTIVOS, TEXTO_MAX: TEXTO_MAX, DIST: DIST, LEJOS_S: LEJOS_S, AEREA_S: AEREA_S, MAX_HOGARES: MAX_HOGARES,
    SONDEO: SONDEO, PUBLICOS_S: PUBLICOS_S, ICONOS_MAX: ICONOS_MAX, HALOS_MAX: HALOS_MAX, ALTO_HALO: ALTO_HALO, ICONO_TITULO: ICONO_TITULO, ICONO_TEXTO: ICONO_TEXTO, MOTIVOS_SALIDA: MOTIVOS_SALIDA,
    prefijoDe: prefijoDe, consentimiento: consentimiento, vacio: vacio, leeEstado: leeEstado, leePublicos: leePublicos, temaVale: temaVale, miembroDe: miembroDe,
    puedeInvitar: puedeInvitar, textoNoInvita: textoNoInvita, lejania: lejania, aerea: aerea, textoSalida: textoSalida, textoHablan: textoHablan, cambios: cambios, vista: vista,
    centro: centro, textoError: textoError };
})();
// [puro:fin]
