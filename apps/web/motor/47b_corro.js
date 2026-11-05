// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 01a_aparato (Aparato), 02c_componentes (ConfigPuro, Componentes), 02d_laminas (LaminasPuro, Laminas),
//   02e_entidades (Entidades), 03_escena (visor, scene, camera), 08_marcadores (pendiente), 12_paseo (persona, teclas),
//   14_historia (hist, marca, lista, aviso), 15_tiempo (hace), 16_vida (mira), 29_vr (VRX, panel, ficha, PanelVR), 31_hud (Hud),
//   33_ajustes (Ajustes)
// Nota: Componente «corro-voz» (F3k-2 y F3k-3, ADR-0032; decisiones 205-212, provisionales): la voz por cercanía en la visita libre, en corros con aceptación. Solo se registra; nadie lo nombra. Sin servidor, sin LiveKit (503) o con el interruptor de la oficina apagado no crea nada. Con él: Configuración → Voz → «Voz por cercanía» (apagada por defecto; el aviso «cercania» v1 con la declaración de mayor de edad ANTES de activarla), invitar desde el avatar y desde Gente a menos de 8 m (Presencia.accionesPersona), la invitación con «Aceptar» / «Ahora no» (foco en «Ahora no»; en VR, una lámina), la lista del corro con quién habla (aria-live y un halo), silenciar, bloquear, avisar a la oficina y salir con las rutas de la api, el icono de corro con voz para quien no está (Entidades, tipo «corro») y las salidas solas (lejos, cambio de sala, vista aérea). La voz la pone 45_voz.js (Voz.entraCorro) y el micro 47_habla.js. Emite «corro:estado»; escucha «voz:habla», «voz:estado» y «depura:lineas». ?corro=0 lo apaga. Publica window.__corro (pruebas). Todo con textContent. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/corro.test.js.
// ===============================================================================
  // ---------- la voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032, decisiones 205-212; contratos/presencia.md «Los corros»,
  // contratos/voz-consentimiento.md «El ámbito cercania», contratos/livekit-roles.json v8). Decisión de Antonio (2026-11-05): se construye para probarla con
  // cuentas de prueba, APAGADA por defecto; 205-209 y 212, provisionales con la opción recomendada del ADR.
  // Componente «corro-voz» (ADR-0023; ?corro=0 lo apaga). Por qué un módulo nuevo y no dentro de 45/47: 45 es el audio (una sala de voz y sus pistas) y 47 el
  // micro de cada uno; esto es el CORRO (quién está, invitar, aceptar, salir, moderar uno mismo) y el ajuste, con su lógica pura aparte. Reúsa:
  //  · 45_voz.js (Voz.entraCorro: el token de POST /api/presencia/corros/token y la sala «corro-<id>» como segunda conexión de la red; Voz.silencia; la curva
  //    de distancia por ámbito del trozo puro de 45) y 47_habla.js (Hablar con botón, T y gatillo izquierdo; el cierre del micro tras 60 s de silencio), sin tocarlos desde aquí;
  //  · 38_presencia_compartida.js (Presencia.accionesPersona: las acciones en la ficha del avatar que se toca o se apunta con el rayo, y en su fila de Gente;
  //    Presencia.distancia, cabeza, puntos, estado);
  //  · Ajustes (Configuración → Voz), PanelVR (dos filas en «Comodidad»), Laminas (el aviso, la invitación y el aviso a la oficina en VR), Hud.aviso (lo que
  //    pasa, en su región aria-live), Entidades (tocar el icono de un corro) y el tema «corro» de la sala libre (37_red.js).
  // Lo que hace:
  //  · Sin servidor (sin prefijo de api), sin LiveKit en el servidor (503) o con el interruptor de la oficina apagado (disponible: false): nada se ve y nada
  //    se crea (ni pestaña, ni DOM, ni mallas). Con él: GET /api/presencia/corros/estado al montarse, al llegar el tema «corro» y cada 5-30 s.
  //  · Configuración → Voz → «Voz por cercanía» (apagada por defecto; se guarda en la cuenta): al marcarla se enseña ANTES el aviso «cercania» v1 (lo que va
  //    a pasar y lo que no, y la declaración de mayor de edad); «Activar» solo con la declaración marcada; el foco empieza en «Ahora no». Aceptar = PUT del
  //    consentimiento (?ambito=cercania, { version, adulto: true }) y PUT del ajuste. Desmarcarla apaga (la api te saca del corro). Retirar el permiso, aparte.
  //  · Invitar (solo a menos de 8 m, con la voz activada): en la ficha del avatar y en Gente; la invitación recibida, «Aceptar» / «Ahora no» (foco en «Ahora no»;
  //    en VR, una lámina con dos zonas). Aceptada, la voz entra en la sala del corro (Voz.entraCorro) y Hablar funciona como en las guiadas.
  //  · En el corro: la lista de quién está (alias), quién habla (texto en la lista y en su región aria-live, y un halo sobre su avatar), «Silenciar» (solo en tu
  //    aparato), «Bloquear su voz» y «Avisar a la oficina» (motivo de lista y texto ≤ 280; sin audio) con las rutas de la api, y «Salir del corro».
  //  · Quien no está ve sobre el grupo un icono de corro con voz; al tocarlo, «Hablan entre ellos: no les oyes y ellos no te oyen».
  //  · Sale solo (POST …/corros/salir con su motivo): a más de 40 m de todos durante 60 s (histéresis: vuelve a contar como cerca por debajo de 35 m
  //    [SUPUESTO del agente]), al cambiar de sala (o entrar en una guiada) y tras 60 s en vista aérea. Nada se graba.
  // Todo con textContent: alias, motivos y mensajes de la api son DATOS. Presupuesto: DOM en pantalla; 2 llamadas (halos e iconos, instanciados, 2 triángulos
  // cada uno; solo con algo que enseñar) y, en VR, como mucho una lámina a la vez (el aviso, ≈ 5,2 MB sin mipmaps, solo mientras se ve).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/corro.test.js)
  var CorroPuro = (function () {
    // ---- el aviso «cercania» (decisión 211; contratos/voz-consentimiento.md, «Aviso «cercania», versión 1»: este texto es el de allí, palabra por palabra; lo
    // comprueba corro.test.js). AVISO_VERSION es la de apps/api/src/presencia/consentimiento_voz.ts (VOZ_CERCANIA_AVISO_VERSION; otro guardián compara las dos).
    // Si cambias una palabra, sube las dos y el contrato en el mismo commit. [BORRADOR] pendiente de la asesoría (EIPD-VOZ §13.5).
    var AVISO_VERSION = 1;
    var AVISO = {
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
    var URL = { estado: "/api/presencia/corros/estado", corros: "/api/presencia/corros", ajuste: "/api/presencia/corros/ajuste", invitaciones: "/api/presencia/corros/invitaciones",
      salir: "/api/presencia/corros/salir", bloqueos: "/api/presencia/corros/bloqueos", avisos: "/api/presencia/corros/avisos", consentimiento: "/api/presencia/voz/consentimiento?ambito=cercania" };
    // los motivos de un aviso (apps/api/src/presencia/cercania.ts, MOTIVOS_AVISO) con su texto, y el tope del texto libre (TEXTO_AVISO_MAX)
    var MOTIVOS = [["insultos", "Insultos"], ["acoso", "Acoso"], ["contenido_sexual", "Contenido sexual"], ["parece_menor", "Parece un menor"], ["otro", "Otro motivo"]], TEXTO_MAX = 280;
    // decisión 206 (provisional): invitar a menos de 8 m; salir solo a más de 40 m de todos durante 60 s, con histéresis (vuelve a «cerca» a 35 m o menos:
    // [SUPUESTO del agente]); 60 s en vista aérea. Hasta 5 hogares por corro (205). Sondeos de la api (s): en un corro o con invitaciones, con la voz activada, apagada
    var DIST = { invitar: 8, lejos: 40, vuelve: 35 }, LEJOS_S = 60, AEREA_S = 60, MAX_HOGARES = 5, SONDEO = { corro: 5, activa: 10, apagada: 30 }, PUBLICOS_S = 10;
    var ICONOS_MAX = 8, HALOS_MAX = 4, ALTO_ICONO = 0.9, ALTO_HALO = 0.42;   // m sobre los ojos del grupo (icono) y de quien habla (halo)
    var ICONO_TITULO = "Corro con voz", ICONO_TEXTO = "Hablan entre ellos: no les oyes y ellos no te oyen.";
    var MOTIVOS_SALIDA = ["salir", "lejos", "cambio_de_sala", "vista_aerea"];
    var PREFIJO = /^h_[A-Za-z0-9_-]{22}$/, IDENTIDAD = /^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/, ID = /^[A-Za-z0-9_-]{12}$/, SALA = /^corro-[A-Za-z0-9_-]{12}$/;
    function num(x) { return typeof x === "number" && isFinite(x); }
    function txt(v, max) { return typeof v === "string" ? v.slice(0, max || 80) : ""; }
    // el prefijo de hogar (h_<22>) de una identidad de la sala (h_<22>_<8>); "" si no lo es
    function prefijoDe(identidad) { return typeof identidad === "string" && IDENTIDAD.test(identidad) ? identidad.slice(0, 24) : ""; }
    function consentimiento(j) { return j && typeof j === "object" && j.version === AVISO_VERSION && j.aceptada === true ? "si" : "no"; }
    function vacio() { return { disponible: false, activa: false, consentimiento: "no", suspendida: false, puedo: false, corro: null, recibidas: [], enviadas: [] }; }
    function quien(q) { return q && typeof q === "object" && typeof q.prefijo === "string" && PREFIJO.test(q.prefijo) ? { prefijo: q.prefijo, alias: txt(q.alias, 40) || "Visitante" } : null; }
    // GET /api/presencia/corros/estado → lo que se usa, validado (lo que no encaja se descarta: es DATO que llega de fuera)
    function leeEstado(j) {
      var v = vacio(); if (!j || typeof j !== "object") return v;
      v.disponible = j.disponible === true; v.activa = !!(j.ajuste && j.ajuste.activa === true); v.consentimiento = consentimiento(j.consentimiento);
      v.suspendida = !!(j.suspension && typeof j.suspension === "object"); v.puedo = v.disponible && j.puedo === true;
      var c = j.corro;
      if (c && typeof c === "object" && typeof c.sala === "string" && SALA.test(c.sala) && Array.isArray(c.miembros)) {
        var ms = c.miembros.map(function (m) { var q = quien(m); return q ? { prefijo: q.prefijo, alias: q.alias, yo: !!(m && m.yo === true) } : null; }).filter(Boolean).slice(0, MAX_HOGARES);
        v.corro = { id: c.sala.slice(6), sala: c.sala, miembros: ms };
      }
      var inv = j.invitaciones && typeof j.invitaciones === "object" ? j.invitaciones : {};
      function listaInv(l, campo) { return (Array.isArray(l) ? l : []).map(function (i) { var q = i && quien(i[campo]); return q && typeof i.id === "string" && ID.test(i.id) ? { id: i.id, quien: q, caduca: Date.parse(i.caduca_en) || 0 } : null; }).filter(Boolean); }
      v.recibidas = listaInv(inv.recibidas, "de"); v.enviadas = listaInv(inv.enviadas, "a");
      return v;
    }
    // GET /api/presencia/corros → [{ id, prefijos }] (para los iconos de quien está fuera)
    function leePublicos(j) {
      var l = j && Array.isArray(j.corros) ? j.corros : [];
      return l.map(function (c) { return c && typeof c.id === "string" && ID.test(c.id) && Array.isArray(c.prefijos) ? { id: c.id, prefijos: c.prefijos.filter(function (p) { return typeof p === "string" && PREFIJO.test(p); }).slice(0, MAX_HOGARES) } : null; }).filter(Boolean);
    }
    // el tema «corro» de la sala libre (livekit-roles v8): solo lo manda la api, sin participante; { v: 1, que: "corro" | "invitacion" } → ¿hay que mirar el estado?
    function temaVale(texto, de) { if (de) return false; try { var j = JSON.parse(texto); return !!j && j.v === 1 && (j.que === "corro" || j.que === "invitacion"); } catch (e) { return false; } }
    function miembroDe(e, identidad) { var p = prefijoDe(identidad); return p && e && e.corro ? e.corro.miembros.filter(function (m) { return m.prefijo === p; })[0] || null : null; }
    // ¿se puede invitar a esa identidad, a esa distancia (m, o null sin pose)? "" si sí; si no, el motivo
    function puedeInvitar(e, identidad, d, yoPrefijo) {
      var p = prefijoDe(identidad);
      if (!e || !e.puedo) return "no_puedes";
      if (!p) return "no_disponible";
      if (p === yoPrefijo) return "mismo_hogar";
      if (miembroDe(e, identidad)) return "ya_en_tu_corro";
      if (e.corro && e.corro.miembros.length >= MAX_HOGARES) return "corro_lleno";
      if (e.enviadas.some(function (i) { return i.quien.prefijo === p; })) return "pendiente";
      if (!num(d) || d > DIST.invitar) return "lejos";
      return "";
    }
    function textoNoInvita(m, alias) {
      var a = alias || "esa persona";
      return { no_puedes: "Activa la voz por cercanía en Configuración → Voz para invitar a hablar.", lejos: "Acércate a menos de " + DIST.invitar + " m de " + a + " para invitarle a hablar.",
        ya_en_tu_corro: a + " ya está en tu corro.", corro_lleno: "Tu corro ya tiene cinco hogares.", pendiente: "Ya has invitado a " + a + ": espera su respuesta.",
        mismo_hogar: "Es tu propio hogar.", no_disponible: "Esa persona no está disponible para hablar ahora." }[m] || "No se puede invitar ahora.";
    }
    // ¿lejos de todos? o = { distancias: [m | null], lejos (antes), t (s lejos hasta ahora), dt } → { lejos, t, sale }. Sin nadie a la vista, cuenta como lejos
    function lejania(o) {
      var ds = (o && o.distancias || []).filter(num), cerca = ds.some(function (d) { return d <= DIST.vuelve; }), todos = ds.every(function (d) { return d > DIST.lejos; });
      var l = cerca ? false : todos ? true : !!(o && o.lejos), t = l ? (num(o.t) ? o.t : 0) + (num(o.dt) && o.dt > 0 ? o.dt : 0) : 0;
      return { lejos: l, t: t, sale: l && t >= LEJOS_S };
    }
    // ¿en vista aérea demasiado tiempo? o = { aerea, t, dt } → { t, sale }
    function aerea(o) { var t = o && o.aerea ? (num(o.t) ? o.t : 0) + (num(o.dt) && o.dt > 0 ? o.dt : 0) : 0; return { t: t, sale: t >= AEREA_S }; }
    function textoSalida(m) {
      return { salir: "Has salido del corro.", lejos: "Has salido del corro: llevabas un minuto lejos de los demás.", cambio_de_sala: "Has salido del corro al cambiar de sala.",
        vista_aerea: "Has salido del corro: llevabas un minuto en la vista aérea.", aviso: "Aviso enviado a la oficina. Has salido del corro." }[m] || "Has salido del corro.";
    }
    // «Habla Ana.» / «Hablan Ana y Luis.» / «Hablan Ana, Luis y Eva.»; "" si no habla nadie
    function textoHablan(alias) {
      var l = (alias || []).filter(function (a) { return typeof a === "string" && a; });
      if (!l.length) return "";
      if (l.length === 1) return "Habla " + l[0] + ".";
      return "Hablan " + l.slice(0, -1).join(", ") + " y " + l[l.length - 1] + ".";
    }
    // lo que dicen las altas y bajas del corro entre dos estados: [texto]
    function cambios(antes, ahora) {
      var a = antes && antes.corro ? antes.corro.miembros : [], b = ahora && ahora.corro ? ahora.corro.miembros : [], out = [];
      var pa = a.map(function (m) { return m.prefijo; }), pb = b.map(function (m) { return m.prefijo; });
      if (!a.length && b.length) out.push("Estás en un corro con " + b.filter(function (m) { return !m.yo; }).map(function (m) { return m.alias; }).join(", ") + ". Solo os oís entre vosotros.");
      else if (a.length && b.length) {
        b.forEach(function (m) { if (!m.yo && pa.indexOf(m.prefijo) < 0) out.push(m.alias + " ha entrado en el corro."); });
        a.forEach(function (m) { if (!m.yo && pb.indexOf(m.prefijo) < 0) out.push(m.alias + " ha salido del corro."); });
      } else if (a.length && !b.length) out.push("El corro se ha deshecho.");
      return out;
    }
    // lo que se enseña de tu corro: e (leeEstado), hablan = { prefijo: true }, callados = { prefijo: true } → { visible, titulo, filas, enviadas, hablan }
    function vista(e, hablan, callados) {
      var c = e && e.corro, env = e ? e.enviadas : [];
      if (!e || !e.disponible || (!c && !env.length)) return { visible: false, titulo: "", filas: [], enviadas: [], hablan: "" };
      var filas = c ? c.miembros.map(function (m) { return { prefijo: m.prefijo, alias: m.yo ? "Tú" : m.alias, yo: m.yo, habla: !!(hablan && hablan[m.prefijo]), callado: !m.yo && !!(callados && callados[m.prefijo]) }; }) : [];
      return { visible: true, titulo: c ? ICONO_TITULO + " (" + filas.length + ")" : "Invitaciones", filas: filas,
        enviadas: env.map(function (i) { return { id: i.id, alias: i.quien.alias }; }), hablan: textoHablan(filas.filter(function (f) { return f.habla && !f.yo; }).map(function (f) { return f.alias; })) };
    }
    // el centro de un grupo (cabezas en la escena: [{ x, y, z }]) → dónde va su icono, o null
    function centro(cabezas) {
      var l = (cabezas || []).filter(function (c) { return c && num(c.x) && num(c.y) && num(c.z); }); if (!l.length) return null;
      var x = 0, z = 0, y = -Infinity; l.forEach(function (c) { x += c.x; z += c.z; y = Math.max(y, c.y); });
      return { x: x / l.length, y: y + ALTO_ICONO, z: z / l.length, n: l.length };
    }
    function textoError(j, defecto) { return j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje.slice(0, 200) : defecto; }
    return { AVISO_VERSION: AVISO_VERSION, AVISO: AVISO, URL: URL, MOTIVOS: MOTIVOS, TEXTO_MAX: TEXTO_MAX, DIST: DIST, LEJOS_S: LEJOS_S, AEREA_S: AEREA_S, MAX_HOGARES: MAX_HOGARES,
      SONDEO: SONDEO, PUBLICOS_S: PUBLICOS_S, ICONOS_MAX: ICONOS_MAX, HALOS_MAX: HALOS_MAX, ALTO_HALO: ALTO_HALO, ICONO_TITULO: ICONO_TITULO, ICONO_TEXTO: ICONO_TEXTO, MOTIVOS_SALIDA: MOTIVOS_SALIDA,
      prefijoDe: prefijoDe, consentimiento: consentimiento, vacio: vacio, leeEstado: leeEstado, leePublicos: leePublicos, temaVale: temaVale, miembroDe: miembroDe,
      puedeInvitar: puedeInvitar, textoNoInvita: textoNoInvita, lejania: lejania, aerea: aerea, textoSalida: textoSalida, textoHablan: textoHablan, cambios: cambios, vista: vista,
      centro: centro, textoError: textoError };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa en Node pruebas/guardianes/corro.test.js con un DOM, una api, una presencia, una voz y una red de mentira)
  function CorroMotor(n, R, P, Vz) {
    var C = CorroPuro, vivo = true, hayApi = !!(ConfigPuro.prefijoApi(location.search, D && D.base));
    var E = C.vacio(), sinApi = false, pidiendo = false, pideYa = true, tSondeo = 0, tPublicos = C.PUBLICOS_S, publicos = [], iconos = [];
    var hablan = Object.create(null), callados = Object.create(null), lejos = { lejos: false, t: 0 }, aereaT = 0, saliendo = false, entrando = false, tVoz = 0, cercaClave = "";
    var quitaAj = null, sinc = false, quitaFilas = [], quitaAcc = null, quitaTipo = null, quitaTema = null, caja = null, invEl = null, dlg = null, dlgFoco = null, LAM = "corro-lamina", lam = null, tLamMsg = 0;
    var ignoradas = Object.create(null);   // invitaciones a las que ya se dijo «Ahora no» (hasta que la api deje de listarlas)
    var est = { estados: 0, invitaciones: 0, aceptadas: 0, rechazadas: 0, salidas: 0, bloqueos: 0, avisos: 0, activaciones: 0, apagados: 0, entradasVoz: 0, errores: 0 };
    var g3 = null;   // lo de la GPU (halos e iconos), solo al hacer falta
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    function vr() { return !!(typeof VRX !== "undefined" && VRX && VRX.on); }
    function px() { return Aparato.clase() === "quest" ? 56 : 44; }
    var CSS_BTN = "font:600 15px/1.2 system-ui,sans-serif;color:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.7);margin:2px 4px";
    var CSS_BTN2 = CSS_BTN + ";background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.5)";

    // ---- la api (mismo origen; todo con la sesión). { status, j }; status 0 si no hubo respuesta
    function llama(metodo, url, cuerpo) {
      var o = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
      if (cuerpo !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
      return fetch(url, o).then(function (r) { return r.status === 204 ? { status: 204, j: null } : r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, j: j }; }); },
        function () { return { status: 0, j: null }; });
    }
    function dice(t) {   // lo que pasa: en pantalla, en la región aria-live del HUD (Hud.aviso); en VR, una lámina corta
      if (!t) return;
      if (vr()) { lamMensaje(t); return; }
      try { if (typeof Hud !== "undefined" && Hud && Hud.aviso) Hud.aviso(t, 5000); } catch (e) {}
    }
    function pres() { return P && P.estado ? P.estado() : null; }
    function enLibre() { var e = pres(); return !!(e && e.activo && e.variante === "red" && e.conectado && e.sala === "general"); }
    function yoPrefijo() { var e = pres(); return e ? C.prefijoDe(e.identidad) : ""; }
    function identidadesDe(prefijo) { return (P && P.puntos ? P.puntos() : []).map(function (q) { return q.id; }).filter(function (id) { return C.prefijoDe(id) === prefijo; }); }

    // ---- el estado (GET …/corros/estado)
    function refresca() {
      if (!hayApi || sinApi || pidiendo || !vivo) return Promise.resolve(E);
      pidiendo = true; pideYa = false; tSondeo = 0;
      return llama("GET", C.URL.estado).then(function (r) {
        pidiendo = false; if (!vivo) return E;
        if (r.status === 503 || r.status === 404) { sinApi = true; ponEstado(C.vacio()); return E; }   // sin LiveKit en el servidor (o sin la ruta): nada, y no se vuelve a preguntar
        if (r.status === 200) { est.estados++; ponEstado(C.leeEstado(r.j)); }
        return E;   // 401 (sin sesión) u otro: igual que antes, y se vuelve a preguntar más tarde
      });
    }
    function ponEstado(nuevo) {
      var antes = E; E = nuevo;
      C.cambios(antes, E).forEach(dice);
      Object.keys(ignoradas).forEach(function (id) { if (!E.recibidas.some(function (i) { return i.id === id; })) delete ignoradas[id]; });
      if (!E.corro) { lejos = { lejos: false, t: 0 }; aereaT = 0; }
      if (E.disponible) registraAjustes(); else quitaAjustes();
      ponCasilla(E.activa);
      sincronizaVoz();
      repintaTodo();
      if (P && P.repintaGente) P.repintaGente();
      n.emite("corro:estado", { disponible: E.disponible, activa: E.activa, puedo: E.puedo, corro: !!E.corro, miembros: E.corro ? E.corro.miembros.length : 0, recibidas: E.recibidas.length, enviadas: E.enviadas.length });
    }
    // la voz: en el corro, dentro de su sala; sin corro, fuera de cualquier sala de corro
    function sincronizaVoz() {
      if (!Vz || !vivo) return;
      var v = Vz.estado();
      if (E.corro && E.puedo && !v.guiada && v.sala !== E.corro.sala && !v.entrando && !entrando && tVoz <= 0) {
        if (v.corro) { Vz.sale(); }   // de otro corro (no debería): primero fuera
        entrando = true; est.entradasVoz++;
        Vz.entraCorro().then(function (ok) { entrando = false; if (!ok && vivo) { tVoz = 5; pideYa = true; } repintaTodo(); });
      } else if (!E.corro && v.corro) Vz.sale();
    }

    // ---- salir (con su motivo, contratos/api.openapi.yaml: salir, lejos, cambio_de_sala, vista_aerea)
    function sale(motivo) {
      if (saliendo || !E.corro) return Promise.resolve(false);
      saliendo = true; est.salidas++;
      if (Vz && Vz.estado().corro) Vz.sale();
      return llama("POST", C.URL.salir, { motivo: C.MOTIVOS_SALIDA.indexOf(motivo) >= 0 ? motivo : "salir" }).then(function (r) {
        saliendo = false; lejos = { lejos: false, t: 0 }; aereaT = 0;
        if (r.status === 204) { E = Object.assign({}, E, { corro: null }); dice(C.textoSalida(motivo)); }
        else dice(C.textoError(r.j, "No se pudo salir del corro: inténtalo otra vez."));
        return refresca().then(function () { return r.status === 204; });
      });
    }
    function salidasSolas(dt) {
      if (!E.corro || saliendo) return;
      var p = pres(), v = Vz ? Vz.estado() : null;
      if ((p && p.conectado && p.sala !== "general") || (v && v.guiada)) { sale("cambio_de_sala"); return; }
      if (!p || !p.conectado) return;   // reconectando: no se cuenta nada
      var a = C.aerea({ aerea: !!p.enVistaAerea, t: aereaT, dt: dt }); aereaT = a.t;
      if (a.sale) { sale("vista_aerea"); return; }
      var ds = [];
      E.corro.miembros.forEach(function (m) { if (!m.yo) identidadesDe(m.prefijo).forEach(function (id) { ds.push(P.distancia(id)); }); });
      lejos = C.lejania({ distancias: ds, lejos: lejos.lejos, t: lejos.t, dt: dt });
      if (lejos.sale) sale("lejos");
    }

    // ---- activar y apagar (Configuración → Voz, el panel de VR): el aviso antes, siempre; quien manda es la api (sin consentimiento vigente, 409)
    function pideActivar() {
      if (!E.disponible) return Promise.resolve(false);
      return muestraAviso();
    }
    function activa() {   // tras «Activar» en el aviso (con la declaración marcada)
      return llama("PUT", C.URL.consentimiento, { version: C.AVISO_VERSION, adulto: true }).then(function (r) {
        if (r.status !== 200 || C.consentimiento(r.j) !== "si") throw { j: r.j, d: r.status === 409 && r.j && r.j.error === "version_distinta" ? "El aviso ha cambiado: recarga la página para leerlo de nuevo." : "No se pudo guardar tu respuesta. Inténtalo otra vez." };
        return llama("PUT", C.URL.ajuste, { activa: true });
      }).then(function (r) {
        if (r.status !== 200 || !r.j || r.j.activa !== true) throw { j: r.j, d: "No se pudo activar la voz por cercanía. Inténtalo otra vez." };
        est.activaciones++; E.activa = true; E.consentimiento = "si"; ponCasilla(true); dice("Voz por cercanía activada: invita a hablar a quien esté cerca, o espera a que te inviten.");
        return refresca().then(function () { return true; });
      });
    }
    function apaga() {
      return llama("PUT", C.URL.ajuste, { activa: false }).then(function (r) {
        if (r.status !== 200) { ponCasilla(E.activa); dice(C.textoError(r.j, "No se pudo apagar la voz por cercanía. Inténtalo otra vez.")); return false; }
        est.apagados++; E.activa = false; if (Vz && Vz.estado().corro) Vz.sale(); ponCasilla(false); dice("Voz por cercanía apagada.");
        return refresca().then(function () { return true; });
      });
    }
    function alterna() { if (E.activa) return apaga(); return pideActivar(); }
    function retira() {
      return llama("DELETE", C.URL.consentimiento).then(function (r) {
        if (r.status !== 204 && r.status !== 200) { dice("No se pudo retirar tu permiso. Inténtalo otra vez."); return false; }
        E.consentimiento = "no"; E.activa = false; if (Vz && Vz.estado().corro) Vz.sale(); ponCasilla(false);
        dice("Has retirado tu permiso de voz por cercanía."); return refresca().then(function () { return true; });
      });
    }

    // ---- Configuración → Voz (Ajustes.registra): la casilla refleja la cuenta (la api); marcarla enseña el aviso y no se marca hasta aceptar
    function registraAjustes() {
      if (quitaAj || typeof Ajustes === "undefined" || !Ajustes || !Ajustes.registra) return;
      sinc = true;
      quitaAj = Ajustes.registra("voz", { cercania: { tipo: "bool", def: false } },
        { id: "voz", t: "Voz", nota: "Voz por cercanía en la visita libre: apagada por defecto. Se guarda en tu cuenta (vale en todos tus aparatos). Nada se graba.",
          campos: [{ k: "cercania", t: "Voz por cercanía: hablar con quien pasea cerca, si os invitáis",
            nota: "Al marcarla verás antes qué va a pasar y qué no; solo se activa si lo aceptas. Invitas desde su avatar o desde Gente, a menos de 8 m; nadie te oye sin aceptar tu invitación." },
          { boton: "Retirar mi permiso de voz por cercanía", id: "ajCercaniaRetira", alClic: function () { retira(); },
            activo: function () { return E.consentimiento === "si"; }, texto: function () { return E.consentimiento === "si" ? "Retirar mi permiso de voz por cercanía" : "Permiso de voz por cercanía: no dado"; },
            nota: "Retirarlo apaga la voz por cercanía y te saca al momento de cualquier corro. Se te vuelve a pedir si la activas otra vez." }] },
        alAjuste) || null;
      sinc = false;
    }
    function quitaAjustes() { if (quitaAj) { var q = quitaAj; quitaAj = null; try { q(); } catch (e) {} } }
    function ponCasilla(v) {
      if (!quitaAj || !Ajustes.pon) return;
      sinc = true; try { if (Ajustes.lee("voz.cercania") !== !!v) Ajustes.pon("voz.cercania", !!v); } catch (e) {} sinc = false;
      try { if (Ajustes.pinta) Ajustes.pinta(); } catch (e) {}
    }
    function alAjuste(k, v) {
      if (sinc || k !== "voz.cercania" || !vivo) return;
      if (v === E.activa) return;
      if (v) { ponCasilla(false); pideActivar(); } else apaga();
    }

    // ---- diálogos en pantalla (modal con foco y Esc; el foco empieza en el botón «no»): el aviso y el aviso a la oficina
    function abreDialogo(id, titulo, cuerpo, bNo, bSi, alNo, alSi) {
      cierraDialogo();
      try { dlgFoco = document.activeElement || null; } catch (e) { dlgFoco = null; }
      var h = px(), tit = el("h2", { id: id + "T", style: "margin:0 0 8px;font:700 18px/1.3 system-ui,sans-serif" }, [titulo]);
      var err = el("p", { id: id + "Error", role: "alert", hidden: true, style: "margin:0 0 8px;color:#ffb4b4;font-weight:600" });
      var no = el("button", { id: id + "No", type: "button", style: CSS_BTN2 + ";min-height:" + h + "px;min-width:" + h + "px" }, [bNo]);
      var si = el("button", { id: id + "Si", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [bSi]);
      var caja2 = el("div", { style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(520px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;text-align:left" },
        [tit].concat(cuerpo, [err, el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, si])]));
      var raiz = el("div", { id: id, role: "dialog", "aria-modal": "true", "aria-labelledby": id + "T", tabindex: "-1", style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [caja2]);
      dlg = { raiz: raiz, err: err, si: si, no: no, ocupado: false };
      no.addEventListener("click", function () { if (!dlg || dlg.ocupado) return; alNo(); });
      si.addEventListener("click", function () { if (!dlg || dlg.ocupado || si.disabled) return; alSi(); });
      raiz.addEventListener("keydown", function (e) {
        e.stopPropagation && e.stopPropagation();   // al escribir o moverse por el diálogo, las teclas no mueven al paseante
        if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); if (dlg && !dlg.ocupado) alNo(); return; }
        if (e.key !== "Tab") return;
        var orden = Array.prototype.slice.call(raiz.querySelectorAll ? raiz.querySelectorAll("input,textarea,a,button") : []).filter(function (x) { return !x.disabled; });
        if (!orden.length) return;
        var i = orden.indexOf(document.activeElement), d = e.shiftKey ? -1 : 1;
        if (i < 0 || (d === 1 && i === orden.length - 1) || (d === -1 && i === 0)) { if (e.preventDefault) e.preventDefault(); orden[i < 0 || d === 1 ? 0 : orden.length - 1].focus(); }
      });
      (visor || document.body).appendChild(raiz);
      try { no.focus(); } catch (e) {}   // aceptar es siempre una decisión expresa
      return dlg;
    }
    function errorDialogo(t) { if (dlg) { dlg.err.textContent = t || ""; dlg.err.hidden = !t; } }
    function ocupaDialogo(si, texto) { if (!dlg) return; dlg.ocupado = si; dlg.no.disabled = si; dlg.si.disabled = si || dlg.si._bloqueado; if (texto) dlg.si.textContent = texto; }
    function cierraDialogo() {
      if (!dlg) return; var d = dlg; dlg = null;
      if (d.raiz.parentNode) d.raiz.parentNode.removeChild(d.raiz);
      try { if (dlgFoco && dlgFoco.focus) dlgFoco.focus(); } catch (e) {} dlgFoco = null;
    }

    // el aviso «cercania» (pantalla: diálogo; VR: lámina). Promesa de true si quedó activada
    var avisoP = null;
    function muestraAviso() {
      if (avisoP) return avisoP.promesa;
      var res; avisoP = { promesa: new Promise(function (r) { res = r; }), res: function (x) { var a = avisoP; avisoP = null; cierraLamina("aviso"); cierraDialogo(); repintaTodo(); res(x); return a; }, decl: false, error: "", ocupado: false, vr: vr() };
      if (avisoP.vr) lamAviso(); else dialogoAviso();
      return avisoP.promesa;
    }
    function aceptaAviso() {
      if (!avisoP || avisoP.ocupado || !avisoP.decl) return;
      avisoP.ocupado = true; avisoP.error = ""; ocupaDialogo(true, "Guardando…"); errorDialogo(""); repintaLamina();
      activa().then(function () { if (avisoP) avisoP.res(true); }, function (e) {
        est.errores++; if (!avisoP) return; avisoP.ocupado = false; avisoP.error = C.textoError(e && e.j, e && e.d || "No se pudo activar."); ocupaDialogo(false, C.AVISO.activar); errorDialogo(avisoP.error); repintaLamina();
      });
    }
    function rechazaAviso() { if (!avisoP || avisoP.ocupado) return; ponCasilla(E.activa); avisoP.res(false); dice("De acuerdo: la voz por cercanía sigue apagada."); }
    function dialogoAviso() {
      var A = C.AVISO, h = px();
      var ul = function (l) { return el("ul", { style: "margin:0 0 8px;padding-left:20px" }, l.map(function (t) { return el("li", { style: "margin:4px 0" }, [t]); })); };
      var casilla = el("input", { id: "corroAvisoDecl", type: "checkbox", style: "width:" + Math.round(h * 0.5) + "px;height:" + Math.round(h * 0.5) + "px;margin:0 10px 0 0;flex:none" });
      var decl = el("label", { style: "display:flex;align-items:center;min-height:" + h + "px;margin:6px 0;font-weight:600;cursor:pointer" }, [casilla, A.declaracion]);
      var cuerpo = [el("h3", { style: "margin:8px 0 2px;font-size:15px" }, [A.tPasa]), ul(A.pasa), el("h3", { style: "margin:8px 0 2px;font-size:15px" }, [A.tNoPasa]), ul(A.noPasa), decl,
        el("a", { id: "corroAvisoEnlace", href: A.enlace.href, target: "_blank", rel: "noopener noreferrer", style: "color:#7fe9ff;display:inline-block;min-height:" + h + "px;line-height:" + h + "px" }, [A.enlace.texto]),
        el("p", { style: "margin:4px 0 10px;font-size:12px;opacity:0.75" }, [A.nota])];
      var d = abreDialogo("corroAviso", A.titulo, cuerpo, A.ahoraNo, A.activar, rechazaAviso, aceptaAviso);
      d.si._bloqueado = true; d.si.disabled = true;   // «Activar», deshabilitado hasta marcar la declaración
      casilla.addEventListener("change", function () { if (!avisoP) return; avisoP.decl = !!casilla.checked; d.si._bloqueado = !avisoP.decl; d.si.disabled = !avisoP.decl || avisoP.ocupado; });
    }

    // avisar a la oficina (motivo de lista y, si quieres, un texto ≤ 280; sin audio). Quien avisa sale de su corro (lo hace la api)
    var avisarP = null;
    function abreAvisar(identidad, alias) {
      if (avisarP) return;
      avisarP = { identidad: identidad, alias: alias, motivo: "", texto: "", ocupado: false, error: "" };
      if (vr()) { lamAvisar(); return; }
      var h = px(), grupo = el("fieldset", { style: "border:0;margin:0 0 8px;padding:0" }, [el("legend", { style: "font-weight:600;margin:0 0 4px" }, ["Motivo"])]);
      C.MOTIVOS.forEach(function (m) {
        var r = el("input", { type: "radio", name: "corroMotivo", value: m[0], style: "width:" + Math.round(h * 0.45) + "px;height:" + Math.round(h * 0.45) + "px;margin:0 10px 0 0" });
        r.addEventListener("change", function () { if (!avisarP) return; avisarP.motivo = m[0]; if (dlg) { dlg.si._bloqueado = false; dlg.si.disabled = avisarP.ocupado; } });
        grupo.appendChild(el("label", { style: "display:flex;align-items:center;min-height:" + h + "px;cursor:pointer" }, [r, m[1]]));
      });
      var cuenta = el("span", { style: "font-size:12px;opacity:0.75" }, ["0/" + C.TEXTO_MAX]);
      var area = el("textarea", { id: "corroAvisoTexto", maxLength: C.TEXTO_MAX, rows: 3, "aria-label": "Qué ha pasado (opcional, como mucho " + C.TEXTO_MAX + " caracteres)", style: "width:100%;box-sizing:border-box;font:inherit;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);color:inherit;padding:6px" });
      area.addEventListener("input", function () { if (!avisarP) return; avisarP.texto = String(area.value || "").slice(0, C.TEXTO_MAX); cuenta.textContent = avisarP.texto.length + "/" + C.TEXTO_MAX; });
      var cuerpo = [grupo, el("label", { style: "display:block;margin:0 0 2px" }, ["Qué ha pasado (opcional)"]), area, cuenta,
        el("p", { style: "margin:6px 0 10px;font-size:13px;opacity:0.85" }, ["No se envía audio: llega a la oficina quién avisa, cuándo, en qué corro y el motivo. Al avisar sales del corro."])];
      var d = abreDialogo("corroAvisar", "Avisar a la oficina sobre " + alias, cuerpo, "Cancelar", "Enviar aviso", cierraAvisar, enviaAvisar);
      d.si._bloqueado = true; d.si.disabled = true;   // hasta elegir un motivo
    }
    function cierraAvisar() { avisarP = null; cierraLamina("avisar"); cierraDialogo(); }
    function enviaAvisar() {
      var a = avisarP; if (!a || a.ocupado || !a.motivo) return;
      a.ocupado = true; ocupaDialogo(true, "Enviando…"); repintaLamina();
      var cuerpo = { identidad: a.identidad, motivo: a.motivo }, t = a.texto.trim(); if (t) cuerpo.texto = t;
      llama("POST", C.URL.avisos, cuerpo).then(function (r) {
        if (r.status === 201) { est.avisos++; cierraAvisar(); if (Vz && Vz.estado().corro) Vz.sale(); dice(C.textoSalida("aviso")); pideYa = true; return; }
        est.errores++; if (avisarP !== a) return; a.ocupado = false; a.error = C.textoError(r.j, "No se pudo enviar el aviso. Inténtalo otra vez."); ocupaDialogo(false, "Enviar aviso"); errorDialogo(a.error); repintaLamina();
      });
    }

    // ---- invitar, aceptar, «Ahora no», bloquear, silenciar
    function invita(identidad, alias) {
      var m = C.puedeInvitar(E, identidad, P && P.distancia ? P.distancia(identidad) : null, yoPrefijo());
      if (m) { dice(C.textoNoInvita(m, alias)); return Promise.resolve(false); }
      return llama("POST", C.URL.invitaciones, { identidad: identidad }).then(function (r) {
        if (r.status === 201) { est.invitaciones++; dice("Has invitado a " + alias + ". Solo hablaréis si acepta."); pideYa = true; return true; }
        dice(C.textoError(r.j, "No se pudo invitar.")); return false;
      });
    }
    function invitacion() { var ahora = Date.now(); return E.recibidas.filter(function (i) { return i.caduca > ahora && !ignoradas[i.id]; })[0] || null; }
    function aceptaInv(i) {
      if (!i) return Promise.resolve(false);
      ignoradas[i.id] = true; pintaInvitacion();
      return llama("POST", C.URL.invitaciones + "/" + i.id + "/aceptar", {}).then(function (r) {
        if (r.status === 200) { est.aceptadas++; pideYa = true; return refresca().then(function () { return true; }); }
        dice(C.textoError(r.j, "No se pudo aceptar la invitación.")); pideYa = true; return false;
      });
    }
    function rechazaInv(i) {
      if (!i) return Promise.resolve(false);
      ignoradas[i.id] = true; pintaInvitacion(); est.rechazadas++;
      return llama("POST", C.URL.invitaciones + "/" + i.id + "/rechazar", {}).then(function (r) { pideYa = true; return r.status === 204; });
    }
    function retiraInv(id) { return llama("DELETE", C.URL.invitaciones + "/" + id).then(function () { pideYa = true; refresca(); }); }
    function bloquea(identidad, alias) {
      return llama("POST", C.URL.bloqueos, { identidad: identidad }).then(function (r) {
        if (r.status === 201) { est.bloqueos++; dice("Has bloqueado la voz de " + alias + ": no podrá invitarte ni entrar en tu corro. No se le dice."); pideYa = true; return true; }
        dice(C.textoError(r.j, "No se pudo bloquear.")); return false;
      });
    }
    function silencia(clave, si) { if (si) callados[clave] = true; else delete callados[clave]; if (Vz && Vz.silencia) Vz.silencia(clave, !!si); repintaTodo(); if (P && P.repintaGente) P.repintaGente(); }
    function callado(identidad) { return !!(callados[identidad] || callados[C.prefijoDe(identidad)]); }

    // ---- las acciones sobre una persona (su ficha al tocarla o apuntarla, y su fila de Gente): Presencia.accionesPersona
    function acciones(identidad, o) {
      if (!E.disponible || !E.activa) return [];
      var l = [], alias = o && o.alias ? o.alias : "Visitante", mio = C.miembroDe(E, identidad), corto = o && o.modo === "vr";
      if (!C.puedeInvitar(E, identidad, o ? o.distancia : null, yoPrefijo())) l.push({ id: "invitar", txt: corto ? "Invitar a hablar" : "Invitar a hablar a " + alias, fn: function () { invita(identidad, alias); } });
      if (mio) { var cal = callado(identidad); l.push({ id: "silenciar", txt: cal ? "Volver a oír" : "Silenciar", fn: function () { silencia(C.prefijoDe(identidad), !cal); } }); }
      l.push({ id: "bloquear", txt: "Bloquear su voz", fn: function () { bloquea(identidad, alias); } });
      l.push({ id: "avisar", txt: "Avisar a la oficina", fn: function () { abreAvisar(identidad, alias); } });
      return l;
    }

    // ---- la pantalla: la invitación recibida (no modal: el mundo sigue) y la caja del corro (lista, quién habla, enviadas, Salir)
    function pintaInvitacion() {
      var i = invitacion();
      if (!i || vr() || !E.disponible) { if (invEl) { if (invEl.parentNode) invEl.parentNode.removeChild(invEl); invEl = null; } if (i && vr() && E.disponible && !lam) lamInvitacion(i); else if (!i && lam && lam.tipo === "invitacion") cierraLamina("invitacion"); return; }
      if (invEl && invEl._id === i.id) return;
      if (invEl && invEl.parentNode) invEl.parentNode.removeChild(invEl);
      var h = px(), no = el("button", { id: "corroInvNo", type: "button", style: CSS_BTN2 + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Ahora no"]);
      var si = el("button", { id: "corroInvSi", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Aceptar"]);
      invEl = el("div", { id: "corroInvitacion", role: "alertdialog", "aria-modal": "false", "aria-labelledby": "corroInvT", "aria-describedby": "corroInvD",
        style: "position:absolute;left:50%;top:120px;transform:translateX(-50%);z-index:61;width:max-content;max-width:min(420px,calc(100% - 24px));padding:12px 14px;border-radius:16px;background:rgba(16,20,24,0.95);border:1px solid rgba(64,240,255,0.6);color:#fff;font:15px/1.4 system-ui,sans-serif;box-sizing:border-box" },
        [el("p", { id: "corroInvT", style: "margin:0 0 4px;font-weight:700" }, [i.quien.alias + " te invita a hablar en corro."]),
          el("p", { id: "corroInvD", style: "margin:0 0 8px;font-size:13px;opacity:0.9" }, ["Solo os oiréis si aceptas. Puedes salir cuando quieras. Nada se graba."]),
          el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, si])]);
      invEl._id = i.id;
      no.addEventListener("click", function () { rechazaInv(i); });
      si.addEventListener("click", function () { aceptaInv(i); });
      invEl.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); rechazaInv(i); } });
      (visor || document.body).appendChild(invEl);
      try { no.focus(); } catch (e) {}   // el foco en «Ahora no» (como el aviso de F3j): aceptar es una decisión expresa
    }
    var claveCaja = "";
    function pintaCaja() {
      var w = C.vista(E, hablanPorPrefijo(), callados);
      if (!w.visible || vr()) { if (caja) caja.hidden = true; claveCaja = ""; return; }
      var k = JSON.stringify(w); if (caja && !caja.hidden && k === claveCaja) return; claveCaja = k;
      if (!caja) {
        caja = el("section", { id: "corroCaja", "aria-label": "Tu corro con voz", style: "position:absolute;left:12px;top:56px;z-index:31;width:min(300px,calc(100% - 24px));max-height:46%;overflow:auto;padding:8px 10px;border-radius:12px;background:rgba(16,20,24,0.9);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box" });
        caja._t = el("h3", { style: "margin:0 0 4px;font-size:14px" }); caja._l = el("ul", { style: "list-style:none;margin:0;padding:0" });
        caja._h = el("p", { id: "corroHablan", role: "status", "aria-live": "polite", "aria-atomic": "true", style: "margin:4px 0;font-weight:600;color:#ffd58a" });
        caja._e = el("ul", { style: "list-style:none;margin:4px 0 0;padding:0" });
        caja._s = el("button", { id: "corroSalir", type: "button", style: CSS_BTN + ";min-height:" + px() + "px;background:rgba(229,72,77,0.18);border-color:rgba(229,72,77,0.8)" }, ["Salir del corro"]);
        caja._s.addEventListener("click", function () { sale("salir"); });
        caja._n = el("p", { style: "margin:4px 0 0;font-size:11px;opacity:0.75" }, ["Solo os oís quienes estáis en esta lista. Nada se graba."]);
        [caja._t, caja._l, caja._h, caja._e, caja._s, caja._n].forEach(function (x) { caja.appendChild(x); });
        (visor || document.body).appendChild(caja);
      }
      caja.hidden = false; caja._t.textContent = w.titulo; caja._h.textContent = w.hablan; caja._s.hidden = !E.corro; caja._n.hidden = !E.corro;
      while (caja._l.firstChild) caja._l.removeChild(caja._l.firstChild);
      w.filas.forEach(function (f) {
        var hijos = [el("span", {}, [(f.habla ? "🔊 " : "") + f.alias + (f.habla ? " · habla" : "") + (f.callado ? " · silenciado por ti" : "")])];
        if (!f.yo) {
          var b = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px", "aria-pressed": f.callado ? "true" : "false", title: "Solo en este aparato; nadie se entera" }, [f.callado ? "Volver a oír" : "Silenciar"]);
          b.addEventListener("click", function () { silencia(f.prefijo, !f.callado); });
          hijos.push(b);
          var ids = identidadesDe(f.prefijo);   // bloquear y avisar piden su identidad en la sala libre: la de su avatar, si se le ve
          if (ids.length) {
            var bb = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Bloquear"]);
            bb.addEventListener("click", function () { bloquea(ids[0], f.alias); });
            var ba = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Avisar"]);
            ba.addEventListener("click", function () { abreAvisar(ids[0], f.alias); });
            hijos.push(bb, ba);
          }
        }
        caja._l.appendChild(el("li", { style: "margin:3px 0" }, hijos));
      });
      while (caja._e.firstChild) caja._e.removeChild(caja._e.firstChild);
      w.enviadas.forEach(function (i) {
        var r = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Retirar"]);
        r.addEventListener("click", function () { retiraInv(i.id); });
        caja._e.appendChild(el("li", { style: "margin:3px 0;opacity:0.85" }, [el("span", {}, ["Esperando a " + i.alias + "…"]), r]));
      });
    }
    function hablanPorPrefijo() { var o = {}; Object.keys(hablan).forEach(function (id) { var p = C.prefijoDe(id); if (p) o[p] = true; }); return o; }
    function repintaTodo() { if (!vivo) return; pintaInvitacion(); pintaCaja(); if (typeof PanelVR !== "undefined" && PanelVR && PanelVR.repinta) PanelVR.repinta(); }

    // ---- VR: una lámina a la vez (el aviso, la invitación, el aviso a la oficina o un mensaje de 3 s), tocada con el rayo o el gatillo
    function cierraLamina(tipo) { if (lam && (!tipo || lam.tipo === tipo)) { var l = lam; lam = null; if (typeof Laminas !== "undefined" && Laminas && Laminas.hay && Laminas.hay(LAM)) Laminas.cierra(LAM, "cerrada"); if (l.alCierra) l.alCierra(); } }
    function repintaLamina() { if (lam && typeof Laminas !== "undefined" && Laminas && Laminas.hay && Laminas.hay(LAM) && Laminas.repinta) Laminas.repinta(LAM); }
    function abreLamina(tipo, o, alCierra) {
      if (typeof Laminas === "undefined" || !Laminas || !Laminas.abre) return false;
      if (lam) cierraLamina();
      lam = { tipo: tipo, zonas: [], alCierra: alCierra || null };
      var l = lam;
      Laminas.abre({ id: LAM, ancho: o.ancho, alto: o.alto, w: o.w, h: o.h, firma: o.firma,
        pinta: function (cx, w, hh) { l.zonas = []; o.pinta(cx, w, hh, function (z) { l.zonas.push(z); }); },
        alTocar: function (u, v, t) { var x = t ? t.x : u * o.w, y = t ? t.y : v * o.h; for (var i = 0; i < l.zonas.length; i++) { var z = l.zonas[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { z.fn(); return true; } } return true; },
        alCierra: function (motivo) { if (lam === l && motivo !== "cerrada") { lam = null; if (l.alCierra) l.alCierra(); } } });
      return true;
    }
    function fondo(cx, w, h) { cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, h); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, h - 4); cx.textBaseline = "top"; cx.textAlign = "left"; }
    function texto(cx, t, x, y, ancho, font, color, salto) { cx.font = font; cx.fillStyle = color || "#ffffff"; var ls = LaminasPuro.lineas(t, ancho, function (s) { return cx.measureText(s).width; }); ls.forEach(function (l, i) { cx.fillText(l, x, y + i * salto); }); return y + ls.length * salto; }
    function boton(cx, zona, z, txt, on, off) {
      cx.fillStyle = off ? "rgba(255,255,255,0.06)" : on ? "rgba(64,240,255,0.3)" : "rgba(255,255,255,0.12)"; cx.fillRect(z.x, z.y, z.w, z.h);
      cx.fillStyle = off ? "rgba(255,255,255,0.4)" : "#ffffff"; cx.font = "600 36px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center"; cx.fillText(txt, z.x + z.w / 2, z.y + z.h / 2); cx.textAlign = "left"; cx.textBaseline = "top";
      if (!off) zona(z);
    }
    function lamAviso() {
      var A = C.AVISO;
      abreLamina("aviso", { ancho: 1.4, alto: 1.82, w: 1000, h: 1300, firma: function () { return JSON.stringify(avisoP ? [avisoP.decl, avisoP.error, avisoP.ocupado] : 0); },
        pinta: function (cx, w, h, zona) {
          fondo(cx, w, h); var y = 24, an = w - 64;
          y = texto(cx, A.titulo, 32, y, an, "700 36px system-ui, sans-serif", "#ffffff", 44) + 6;
          y = texto(cx, A.tPasa, 32, y, an, "700 28px system-ui, sans-serif", "#7fe9ff", 34);
          A.pasa.forEach(function (t) { y = texto(cx, "• " + t, 32, y, an, "24px system-ui, sans-serif", "#ffffff", 30) + 4; });
          y = texto(cx, A.tNoPasa, 32, y + 4, an, "700 28px system-ui, sans-serif", "#7fe9ff", 34);
          A.noPasa.forEach(function (t) { y = texto(cx, "• " + t, 32, y, an, "24px system-ui, sans-serif", "#ffffff", 30) + 4; });
          var d = { x: 32, y: y + 8, w: w - 64, h: 80, fn: function () { if (avisoP && !avisoP.ocupado) { avisoP.decl = !avisoP.decl; repintaLamina(); } } };
          cx.fillStyle = "rgba(255,255,255,0.08)"; cx.fillRect(d.x, d.y, d.w, d.h); cx.strokeStyle = "#ffffff"; cx.lineWidth = 3; cx.strokeRect(d.x + 16, d.y + 20, 40, 40);
          if (avisoP && avisoP.decl) { cx.fillStyle = "#40f0ff"; cx.fillRect(d.x + 24, d.y + 28, 24, 24); }
          texto(cx, A.declaracion, d.x + 72, d.y + 12, d.w - 88, "600 26px system-ui, sans-serif", "#ffffff", 30); zona(d);
          y = d.y + d.h + 8; y = texto(cx, A.masInfo + " " + A.nota, 32, y, an, "22px system-ui, sans-serif", "rgba(255,255,255,0.7)", 28);
          if (avisoP && avisoP.error) texto(cx, avisoP.error, 32, y + 4, an, "600 24px system-ui, sans-serif", "#ffb4b4", 30);
          var by = h - 120;
          boton(cx, zona, { x: 32, y: by, w: w / 2 - 48, h: 96, fn: rechazaAviso }, A.ahoraNo, false, !!(avisoP && avisoP.ocupado));
          boton(cx, zona, { x: w / 2 + 16, y: by, w: w / 2 - 48, h: 96, fn: aceptaAviso }, avisoP && avisoP.ocupado ? "Guardando…" : A.activar, true, !(avisoP && avisoP.decl) || !!(avisoP && avisoP.ocupado));
        } }, function () { if (avisoP) { ponCasilla(E.activa); avisoP.res(false); } });   // se cerró sola (lejos, al salir de VR): cuenta como «Ahora no»
    }
    function lamInvitacion(i) {
      abreLamina("invitacion", { ancho: 0.9, alto: 0.42, w: 720, h: 336, firma: function () { return i.id; },
        pinta: function (cx, w, h, zona) {
          fondo(cx, w, h); var y = texto(cx, i.quien.alias + " te invita a hablar en corro.", 28, 22, w - 56, "700 34px system-ui, sans-serif", "#ffffff", 40);
          texto(cx, "Solo os oiréis si aceptas. Nada se graba.", 28, y + 4, w - 56, "26px system-ui, sans-serif", "rgba(255,255,255,0.85)", 32);
          boton(cx, zona, { x: 28, y: h - 116, w: w / 2 - 40, h: 92, fn: function () { cierraLamina("invitacion"); rechazaInv(i); } }, "Ahora no", false, false);
          boton(cx, zona, { x: w / 2 + 12, y: h - 116, w: w / 2 - 40, h: 92, fn: function () { cierraLamina("invitacion"); aceptaInv(i); } }, "Aceptar", true, false);
        } });
    }
    function lamAvisar() {
      abreLamina("avisar", { ancho: 1.0, alto: 0.96, w: 800, h: 768, firma: function () { return JSON.stringify(avisarP ? [avisarP.motivo, avisarP.ocupado, avisarP.error] : 0); },
        pinta: function (cx, w, h, zona) {
          fondo(cx, w, h); var a = avisarP; if (!a) return;
          var y = texto(cx, "Avisar a la oficina sobre " + a.alias, 28, 20, w - 56, "700 32px system-ui, sans-serif", "#ffffff", 38) + 4;
          C.MOTIVOS.forEach(function (m) {
            var z = { x: 28, y: y, w: w - 56, h: 72, fn: function () { if (avisarP && !avisarP.ocupado) { avisarP.motivo = m[0]; repintaLamina(); } } };
            cx.fillStyle = a.motivo === m[0] ? "rgba(64,240,255,0.3)" : "rgba(255,255,255,0.08)"; cx.fillRect(z.x, z.y, z.w, z.h);
            texto(cx, (a.motivo === m[0] ? "● " : "○ ") + m[1], z.x + 20, z.y + 18, z.w - 40, "600 30px system-ui, sans-serif", "#ffffff", 34); zona(z); y += 80;
          });
          y = texto(cx, "Sin audio. En las gafas no se escribe texto; al avisar sales del corro.", 28, y + 4, w - 56, "22px system-ui, sans-serif", "rgba(255,255,255,0.75)", 28);
          if (a.error) texto(cx, a.error, 28, y + 2, w - 56, "600 22px system-ui, sans-serif", "#ffb4b4", 28);
          boton(cx, zona, { x: 28, y: h - 108, w: w / 2 - 40, h: 88, fn: cierraAvisar }, "Cancelar", false, a.ocupado);
          boton(cx, zona, { x: w / 2 + 12, y: h - 108, w: w / 2 - 40, h: 88, fn: enviaAvisar }, a.ocupado ? "Enviando…" : "Enviar aviso", true, !a.motivo || a.ocupado);
        } }, function () { avisarP = null; });
    }
    function lamMensaje(t) {
      if (lam && lam.tipo !== "mensaje") return;   // no tapa un aviso ni una invitación
      tLamMsg = 3;
      abreLamina("mensaje", { ancho: 0.9, alto: 0.24, w: 720, h: 192, firma: function () { return t; }, pinta: function (cx, w, h) { fondo(cx, w, h); texto(cx, t, 24, 24, w - 48, "600 30px system-ui, sans-serif", "#ffffff", 36); } });
    }

    // ---- VR: dos filas del panel, en «Comodidad» (en «Ir a» ya no caben: la parcela, Gente y el micro)
    if (typeof PanelVR !== "undefined" && PanelVR && PanelVR.filas) {
      quitaFilas.push(PanelVR.filas("comodidad", { id: "cercania", orden: 60, alto: 88, visible: function () { return E.disponible; },
        firma: function () { return String(E.activa); }, pinta: function (cx, y, W, h) { h.fila("Voz por cercanía", y); },
        botones: function (b, y) { b("vcer", 420, y, 470, 64, "Voz por cercanía: " + (E.activa ? "activada" : "apagada"), function () { alterna(); }, E.activa); } }));
      quitaFilas.push(PanelVR.filas("comodidad", { id: "corro", orden: 61, alto: 170, visible: function () { return E.disponible && !!E.corro; },
        firma: function () { return JSON.stringify(C.vista(E, hablanPorPrefijo(), callados)); },
        pinta: function (cx, y, W) {
          var w = C.vista(E, hablanPorPrefijo(), callados); cx.fillStyle = "#ffffff"; cx.textBaseline = "top"; cx.font = "600 30px system-ui, sans-serif"; cx.fillText(w.titulo, 40, y + 4, W - 80);
          cx.font = "24px system-ui, sans-serif"; cx.fillText(w.filas.map(function (f) { return (f.habla ? "🔊 " : "") + f.alias; }).join(" · "), 40, y + 42, W - 80);
          cx.fillStyle = "#ffd58a"; cx.fillText(w.hablan, 40, y + 72, W - 80);
        },
        botones: function (b, y) { b("vsal", 40, y + 100, 520, 64, "Salir del corro", function () { sale("salir"); }, false); },
        debug: function () { return { corro: estado() }; } }));
      quitaFilas = quitaFilas.filter(Boolean);
    }

    // ---- lo que se ve en el mundo: un halo sobre quien habla de tu corro y el icono de cada corro del que no eres (InstancedMesh con su lienzoDe; 2 llamadas)
    function lienzoDe(dibuja) { var c = document.createElement("canvas"); c.width = 128; c.height = 128; var cx = c.getContext("2d"); if (cx) dibuja(cx); var t = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; }
    function monta3D() {
      if (g3 || typeof THREE === "undefined" || typeof scene === "undefined" || !scene) return g3;
      var geo = new THREE.PlaneGeometry(1, 1);
      var tH = lienzoDe(function (cx) { cx.strokeStyle = "rgba(255,213,138,0.95)"; cx.lineWidth = 14; cx.beginPath(); cx.ellipse(64, 64, 52, 22, 0, 0, Math.PI * 2); cx.stroke(); });
      var tI = lienzoDe(function (cx) {
        cx.fillStyle = "rgba(16,20,24,0.85)"; cx.beginPath(); cx.arc(64, 64, 60, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = "#40f0ff"; cx.lineWidth = 6; cx.stroke();
        cx.fillStyle = "#ffffff"; [[44, 52], [84, 52]].forEach(function (c) { cx.beginPath(); cx.arc(c[0], c[1], 12, 0, Math.PI * 2); cx.fill(); cx.fillRect(c[0] - 14, c[1] + 16, 28, 26); });
        cx.strokeStyle = "#ffd58a"; cx.lineWidth = 5; cx.beginPath(); cx.arc(64, 48, 22, Math.PI * 1.2, Math.PI * 1.8); cx.stroke();
      });
      var mat = function (t) { return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }); };
      var halos = new THREE.InstancedMesh(geo, mat(tH), C.HALOS_MAX), icos = new THREE.InstancedMesh(geo, mat(tI), C.ICONOS_MAX);
      [halos, icos].forEach(function (m) { m.count = 0; m.visible = false; m.renderOrder = 5; scene.add(m); });
      g3 = { geo: geo, tex: [tH, tI], halos: halos, icos: icos, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() };
      return g3;
    }
    function libera3D() {
      if (!g3) return; var g = g3; g3 = null;
      [g.halos, g.icos].forEach(function (m) { scene.remove(m); m.material.dispose(); if (m.dispose) m.dispose(); });
      g.geo.dispose(); g.tex.forEach(function (t) { t.dispose(); });
    }
    function calculaIconos() {   // los corros de los que no eres, con alguien a la vista: su centro (escena)
      var mio = E.corro ? E.corro.id : "", out = [];
      if (!E.disponible || !enLibre()) { iconos = out; return; }
      var pts = P && P.puntos ? P.puntos() : [];
      publicos.forEach(function (c) {
        if (c.id === mio || out.length >= C.ICONOS_MAX) return;
        var cabs = []; pts.forEach(function (q) { if (c.prefijos.indexOf(C.prefijoDe(q.id)) >= 0) { var h = P.cabeza(q.id); if (h) cabs.push(h); } });
        var ce = C.centro(cabs); if (ce) out.push({ id: c.id, x: ce.x, y: ce.y, z: ce.z, n: c.prefijos.length });
      });
      iconos = out;
    }
    function mundo() {
      if (!vivo || !hayApi || sinApi) return;
      var hs = [];
      if (E.corro) Object.keys(hablan).forEach(function (id) { if (hs.length < C.HALOS_MAX && C.miembroDe(E, id)) { var c = P && P.cabeza ? P.cabeza(id) : null; if (c) hs.push({ x: c.x, y: c.y + C.ALTO_HALO, z: c.z }); } });
      calculaIconos();
      if (!hs.length && !iconos.length) { if (g3) { g3.halos.visible = false; g3.icos.visible = false; g3.halos.count = 0; g3.icos.count = 0; } return; }
      var g = monta3D(); if (!g) return;
      camera.getWorldQuaternion(g.q);
      var ponInst = function (m, l, tam) { m.count = l.length; m.visible = l.length > 0; l.forEach(function (o, i) { g.p.set(o.x, o.y, o.z); g.s.set(tam[0], tam[1], 1); g.m4.compose(g.p, g.q, g.s); m.setMatrixAt(i, g.m4); }); if (l.length) { m.instanceMatrix.needsUpdate = true; if (m.computeBoundingSphere) m.computeBoundingSphere(); } };   // su volumen, con las matrices ya escritas (AG-1.3)
      ponInst(g.halos, hs, [0.5, 0.5]); ponInst(g.icos, iconos, [0.55, 0.55]);
    }
    // tocar el icono (pantalla) o apuntarlo con el rayo (VR): una ficha que lo explica (Entidades, tipo «corro»)
    function iconoDe(id) { var m = /^corro:(.+)$/.exec(String(id)); return m ? iconos.filter(function (i) { return i.id === m[1]; })[0] || null : null; }
    var pv = null;
    function iconoEnPantalla(cx, cy, r) {
      if (!iconos.length) return null; pv = pv || new THREE.Vector3();
      var mejor = null, md = 28;
      iconos.forEach(function (i) { pv.set(i.x, i.y, i.z).project(camera); if (pv.z > 1) return; var sx = (pv.x * 0.5 + 0.5) * r.width + r.left, sy = (-pv.y * 0.5 + 0.5) * r.height + r.top, d = Math.hypot(cx - sx, cy - sy); if (d < md) { md = d; mejor = i; } });
      return mejor ? { id: "corro:" + mejor.id, s: md / 28 } : null;
    }
    function iconoEnRayo(rr) {
      var o = rr.ray.origin, d = rr.ray.direction, mejor = null, ms = 1e9;
      iconos.forEach(function (i) { var t = (i.x - o.x) * d.x + (i.y - o.y) * d.y + (i.z - o.z) * d.z; if (t < 0.4 || t > 300) return; var e = Math.hypot(o.x + d.x * t - i.x, o.y + d.y * t - i.y, o.z + d.z * t - i.z), s = e / Math.max(0.4, t * 0.01); if (s < 1 && s < ms) { ms = s; mejor = { id: "corro:" + i.id, t: t, s: s }; } });
      return mejor;
    }
    if (hayApi && typeof Entidades !== "undefined" && Entidades && Entidades.registra) quitaTipo = Entidades.registra({ tipo: "corro", dueno: "47b_corro", prioridad: 25, pantalla: iconoEnPantalla, rayo: iconoEnRayo,
      ficha: function (id) { var i = iconoDe(id); return i ? { titulo: C.ICONO_TITULO, lineas: [C.ICONO_TEXTO], filas: [{ k: "Hogares", v: String(i.n) }] } : null; },
      existe: function (id) { return !!iconoDe(id); }, pos: function (id) { var i = iconoDe(id); return i ? { x: i.x, y: i.y, z: i.z } : null; }, radio: function () { return 0.5; }, sinAnillo: true });

    // ---- quién habla (de la voz: «voz:habla»; solo llegan las voces que oyes, y la tuya)
    n.on("voz:habla", function (d) { if (!vivo || !d || d.yo || typeof d.identidad !== "string") return; if (d.habla) hablan[d.identidad] = true; else delete hablan[d.identidad]; pintaCaja(); if (typeof PanelVR !== "undefined" && PanelVR && PanelVR.repinta) PanelVR.repinta(); });
    n.on("voz:estado", function (d) { if (!vivo) return; if (!d || !d.corro) hablan = Object.create(null); });
    n.on("depura:lineas", function (d) { if (E.disponible && d && d.lineas) d.lineas.push("corro · " + (E.activa ? "activa" : "apagada") + (E.corro ? " · " + E.corro.miembros.length + " hogares" : "") + (E.recibidas.length ? " · " + E.recibidas.length + " invitaciones" : "") + " · iconos " + iconos.length); });
    // el tema «corro» de la sala libre: «mira tu estado» (solo de la api, sin participante)
    var SR = hayApi && R ? R.sala("visita") : null;
    if (SR && SR.escucha) quitaTema = SR.escucha("corro", function (datos, de) { var t = ""; try { t = typeof TextDecoder !== "undefined" ? new TextDecoder().decode(datos) : String(datos); } catch (e) { t = ""; } if (C.temaVale(t, de)) pideYa = true; });
    if (hayApi && P && P.accionesPersona) quitaAcc = P.accionesPersona(acciones);

    // ---- fase «tarde» (cada 0,25 s): sondeo, iconos, salidas solas, la invitación que caduca, el botón de Gente a menos de 8 m, la voz
    function tarde(dt) {
      if (!vivo || !hayApi || sinApi) return;
      tSondeo += dt; tPublicos += dt; if (tVoz > 0) tVoz -= dt;
      var cada = E.corro || E.recibidas.length || E.enviadas.length ? C.SONDEO.corro : E.disponible && E.activa ? C.SONDEO.activa : C.SONDEO.apagada;
      if (pideYa || tSondeo >= cada) refresca();
      if (E.disponible && enLibre() && tPublicos >= C.PUBLICOS_S) { tPublicos = 0; llama("GET", C.URL.corros).then(function (r) { if (vivo && r.status === 200) publicos = C.leePublicos(r.j); }); }
      salidasSolas(dt);
      if (E.recibidas.length && !invitacion() && (invEl || (lam && lam.tipo === "invitacion"))) pintaInvitacion();   // caducó o se contestó
      else if (invitacion() && !invEl && !lam) pintaInvitacion();
      if (E.puedo && P && P.puntos) {   // Gente solo enseña «Invitar» a menos de 8 m: se repinta cuando cambia quién está tan cerca
        var k = P.puntos().filter(function (q) { var d = P.distancia(q.id); return typeof d === "number" && d <= C.DIST.invitar; }).map(function (q) { return q.id; }).join("|");
        if (k !== cercaClave) { cercaClave = k; if (P.repintaGente) P.repintaGente(); }
      }
      sincronizaVoz();
      if (tLamMsg > 0) { tLamMsg -= dt; if (tLamMsg <= 0) cierraLamina("mensaje"); }
      if (avisoP && avisoP.vr !== vr()) { var a = avisoP; a.res(false); }   // se cambió de pantalla a VR (o al revés) con el aviso abierto: cuenta como «Ahora no»
      if (avisarP && dlg && vr()) cierraAvisar();
      pintaCaja();
    }
    function estado() {
      var w = C.vista(E, hablanPorPrefijo(), callados);
      return { activo: hayApi && !sinApi, disponible: E.disponible, activa: E.activa, consentimiento: E.consentimiento, puedo: E.puedo, suspendida: E.suspendida,
        corro: E.corro ? E.corro.sala : "", miembros: w.filas.map(function (f) { return f.alias; }), hablan: w.hablan, recibidas: E.recibidas.length, enviadas: E.enviadas.length,
        invitacion: !!invitacion(), aviso: !!avisoP, avisar: !!avisarP, lamina: lam ? lam.tipo : "", iconos: iconos.length, publicos: publicos.length, vistos: P && P.puntos ? P.puntos().length : 0, lejos: lejos.lejos, tLejos: Math.round(lejos.t * 10) / 10,
        tAerea: Math.round(aereaT * 10) / 10, pestana: !!quitaAj, callados: Object.keys(callados), medidas: Object.assign({}, est) };
    }
    function libera() {
      vivo = false;
      if (avisoP) { var a = avisoP; a.res(false); }
      cierraAvisar(); cierraDialogo(); cierraLamina();
      if (invEl && invEl.parentNode) invEl.parentNode.removeChild(invEl); invEl = null;
      if (caja && caja.parentNode) caja.parentNode.removeChild(caja); caja = null;
      quitaFilas.splice(0).forEach(function (q) { try { q(); } catch (e) {} });
      [quitaAcc, quitaTipo, quitaTema].forEach(function (q) { if (q) try { q(); } catch (e) {} }); quitaAcc = quitaTipo = quitaTema = null;
      quitaAjustes(); libera3D();
      if (Vz && Vz.estado && Vz.estado().corro) Vz.sale();   // la api lo saca sola tras 60 s sin conexión (su barrido)
      if (window.__corro === api) window.__corro = undefined;
    }
    // gancho de pruebas: el estado; «refresca», «invita» (identidad), «acepta» y «ahoraNo» (la invitación de arriba), «sale» (motivo), «activa» (enseña el aviso),
    // «declara» (marca la declaración del aviso), «aceptaAviso», «ahoraNoAviso», «apaga», «retira», «silencia» ({ clave, si }), «bloquea» y «avisar» (identidad), «mundo»
    function api(accion, arg) {
      if (accion === "refresca") return refresca().then(estado);
      if (accion === "invita") return invita(arg, "Visitante");
      if (accion === "acepta") return aceptaInv(invitacion());
      if (accion === "ahoraNo") return rechazaInv(invitacion());
      if (accion === "sale") return sale(arg || "salir");
      if (accion === "activa") { pideActivar(); return estado(); }
      if (accion === "declara") { if (avisoP) { avisoP.decl = arg !== false; repintaLamina(); } return estado(); }
      if (accion === "aceptaAviso") { aceptaAviso(); return estado(); }
      if (accion === "ahoraNoAviso") { rechazaAviso(); return estado(); }
      if (accion === "apaga") return apaga();
      if (accion === "retira") return retira();
      if (accion === "silencia") { silencia(arg && arg.clave, !!(arg && arg.si)); return estado(); }
      if (accion === "bloquea") return bloquea(arg, "Visitante");
      if (accion === "avisar") { abreAvisar(arg, "Visitante"); return estado(); }
      if (accion === "acciones") return acciones(arg && arg.identidad, arg || {}).map(function (x) { return x.id; });
      if (accion === "mundo") { mundo(); return { halos: g3 ? g3.halos.count : 0, iconos: g3 ? g3.icos.count : 0, montado: !!g3 }; }
      return estado();
    }
    window.__corro = api;
    if (hayApi) refresca();
    return { tarde: tarde, mundo: mundo, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?corro=0 lo apaga. Consume la voz (Voz.entraCorro, silencia,
  // estado, sale), la presencia (Presencia: accionesPersona, distancia, cabeza, puntos, estado, repintaGente) y la red (el tema «corro» de la sala «visita»); sin
  // ellas no se monta. Sin servidor, no pide nada ni crea nada.
  Componentes.registra({
    id: "corro-voz", version: 1,
    consume: ["Aparato", "Red", "Presencia", "Voz", "Ajustes", "PanelVR", "VRX", "Laminas", "LaminasPuro", "Entidades", "Hud"],
    expone: [],
    eventos: { escucha: ["voz:habla", "voz:estado", "depura:lineas"], emite: ["corro:estado"] },
    bandera: { defecto: true, url: "corro" },
    // DOM en pantalla; halos e iconos instanciados (2 llamadas, 2 triángulos cada instancia: como mucho 4 halos y 8 iconos; dos lienzos de 128 × 128) solo con algo
    // que enseñar; en VR, como mucho una lámina a la vez (el aviso, 1000 × 1300 sin mipmaps ≈ 5,2 MB; la invitación ≈ 1 MB): 1 llamada, 2 triángulos
    presupuesto: { llamadas: 3, triangulos: 26, texturasMB: 6 },
    fases: { mundo: 0, tarde: 0.25 },
    monta: function (n) { return CorroMotor(n, n.api("red-salas"), n.api("presencia-compartida"), n.api("voz-guiada")); },
    actualiza: { mundo: function (dt, t, api) { api.mundo(dt); }, tarde: function (dt, t, api) { api.tarde(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
