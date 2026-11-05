// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 01a_aparato (Aparato), 02c_componentes (ConfigPuro, Teclas, Componentes), 02d_laminas (Laminas),
//   03_escena (visor, modo), 08_marcadores (aplica, pendiente), 09_camara (suelta), 12_paseo (persona, teclas, primera), 14_historia (marca, aviso),
//   15_tiempo (hace), 16_vida (quita), 29_vr (VRX, panel, PanelVR), 33_ajustes (Ajustes), 46b_primera_vez (PrimeraVezPuro)
// Nota: Componente «habla-guiada» (F3e, ADR-0026; decisiones 157-162): la interacción de la voz en la visita guiada, solo dentro de una sala guiada y con papel. «Hablar» con botón (≥ 44 px; 56 en el navegador de Quest), tecla T y, en VR, el gatillo izquierdo (VRX.voz, que 29_vr.js lee cada fotograma), en dos modos según el ajuste «Hablar» de Configuración: pulsar para abrir y cerrar (por defecto) o mantener pulsado (familias; el guía siempre pulsa y abre su micro con el primer gesto, una vez). Sin la palabra, «Levantar la mano» / «Bajar la mano» por la api de F3c y «Estás 2.º en la cola» (la cola, de la api «Guiada» de 46). El micro siempre con icono y texto en una región aria-live; «Silenciarme» siempre a mano; el aviso de que con el micro abierto el sonido no es espacial y la casilla «Llevo auriculares» (Voz.auriculares). En VR, una lámina de 3 s al abrir o cerrar, una fila del panel («Ir a») y un pulso del mando. F3k-2: lo mismo dentro de un corro (papel «miembro»), con el micro que se cierra solo tras 60 s sin que se te oiga. Emite «habla:micro» y «habla:mano»; escucha «voz:estado», «guiada:palabra» y «depura:lineas». ?habla=0 lo apaga. Publica window.__habla (pruebas). Todo con textContent. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/habla.test.js.
// ===============================================================================
  // ---------- hablar en la visita guiada (F3e; ADR-0026, decisiones 157-162; COMPONENTES §F3e).
  // Componente «habla-guiada» (ADR-0023; ?habla=0 lo apaga): la interacción de la voz. Por qué un módulo nuevo y no dentro de 46_guiada.js: 46 es la
  // moderación (el guía, la palabra, el cierre), esto es lo que hace cada persona con SU micrófono, y su lógica (modos, estados, textos) se prueba aparte.
  // No habla con LiveKit ni toca permisos: abre y cierra el micro con Voz.abre/cierra (45_voz.js, que exige permiso y gesto) y levanta o baja la mano por la
  // api de F3c (POST/DELETE /api/presencia/guiadas/:evento/mano). Quién eres, el evento y la cola los lee de «visita-guiada» (46_guiada.js, api «Guiada»).
  //  · SOLO dentro de una sala guiada y con papel (guía, oficina o familia); montado y fuera de ella, no crea nada.
  //  · «Hablar» (decisión 158): con permiso (el guía siempre; la familia, mientras tiene la palabra), un botón en pantalla (táctil ≥ 44 px, 56 en el navegador
  //    de Quest), la tecla T y, en VR, el gatillo IZQUIERDO. Dos modos, un ajuste en Configuración («Hablar»): «pulsar» (abre y cierra, por defecto) y «mantener»
  //    (abre mientras se aprieta; para las familias; el guía siempre pulsa). Sin la palabra, en su lugar «Levantar la mano» / «Bajar la mano» y «Estás 2.º en la
  //    cola». Nada abre el micro sin un gesto (lo comprueba Voz.abre); el guía lo abre solo con el primer gesto de la sala (una vez; si se silencia, no se reabre).
  //  · EL MICRO SE VE: una línea con icono y TEXTO («Micrófono abierto: te oyen», «cerrado», «sin permiso», «el navegador no deja») en una región aria-live; nunca
  //    solo color. «Silenciarme» siempre a mano (el mismo botón en pulsar; uno aparte en mantener; la tecla T; el gatillo). En VR, una lámina de 3 s al abrir o
  //    cerrar, una fila del panel («Ir a») y un pulso corto del mando (si lo tiene).
  //  · EL AVISO DEL ECO (decisión 160): con el micro abierto y sin «Llevo auriculares», «Con el micrófono abierto el sonido no es espacial; con auriculares sí».
  //    La casilla llama a Voz.auriculares(): no se guarda (quien se quita los auriculares tiene que poder decirlo al momento).
  //  · 29_vr.js le da el gatillo izquierdo (VRX.voz: toma() y mando()): mientras sea el micro, no pulsa nada con el rayo; la mano derecha sigue con el panel.
  // Todo con textContent; lo que llega de la sala es dato (46 ya lo valida). Sin grabación. Presupuesto: DOM; en VR, 1 llamada y 2 triángulos solo durante los 3 s de la lámina.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/habla.test.js)
  var HablaPuro = (function () {
    var MODOS = ["pulsar", "mantener"], DEFECTO = "pulsar", SALA = /^guiada-([1-9][0-9]{0,9})$/, MANO_MS = 3000, AVISO_S = 3, MENSAJE_S = 6;
    // ---- el aviso de voz (F3j; decisión 163; EIPD-VOZ §3): lo que se enseña a una familia la primera vez que va a pedir la palabra o abrir el micro. AVISO_VERSION es
    // la versión de ESTE texto: la api guarda la que aceptó cada hogar y, si no es la vigente (apps/api/src/presencia/consentimiento_voz.ts, VOZ_AVISO_VERSION; un
    // guardián comprueba que son la misma), se vuelve a pedir. Si cambias una palabra del texto, sube las dos. [BORRADOR] pendiente de la asesoría.
    var AVISO_VERSION = 1;
    var AVISO = {
      version: AVISO_VERSION, borrador: true,
      titulo: "Antes de hablar: tu voz en esta visita",
      puntos: [
        "Tu voz se oye en directo para las personas que estén en la sala de esta visita guiada.",
        "No se graba ni se transcribe: no se guarda nada de lo que dices.",
        "Solo hablas cuando el guía te da la palabra, y puedes dejar de hablar cuando quieras cerrando el micrófono.",
        "La cuenta es de una persona adulta. Si hay menores cerca, recuerda que se les puede oír.",
        "Puedes retirar este permiso cuando quieras en Configuración, apartado Hablar, sin que pase nada."
      ],
      enlace: { texto: "Más información sobre privacidad", href: "/#privacidad" },
      enlaceVR: "Más información: en la portada, apartado «Tu privacidad».",
      nota: "Texto provisional, pendiente de revisión por la asesoría.",
      aceptar: "Aceptar", ahoraNo: "Ahora no"
    };
    var URL_CONSENTIMIENTO = "/api/presencia/voz/consentimiento";
    // lo que dice la api (GET/PUT) → "si" | "no": solo vale la versión vigente de ESTE texto, aceptada
    function consentimiento(j) { return j && typeof j === "object" && j.version === AVISO_VERSION && j.aceptada === true ? "si" : "no"; }
    // ¿hace falta el aviso antes de esta acción? accion: "levantar" (pedir la palabra) | "micro" (abrir el micro); cons: "si" | "no" | "?" (aún no se sabe).
    // Solo las familias: el guía y la oficina hablan por su cargo (la base de su voz es de la asesoría, EIPD-VOZ §3). → "nada" | "comprobar" | "aviso"
    function requiere(papel, accion, cons) {
      if (papel !== "familia" || (accion !== "levantar" && accion !== "micro")) return "nada";
      // al abrir el micro, «aún no se sabe» no frena: para tener la palabra la api ya comprobó el consentimiento (Palabra.da); el aviso solo sale si se SABE que no
      return cons === "si" ? "nada" : cons === "no" ? "aviso" : accion === "micro" ? "nada" : "comprobar";
    }
    // por qué falló aceptar (estado HTTP + cuerpo) → texto para la persona
    function errorAceptar(status, j) {
      if (status === 409 && j && j.error === "version_distinta") return "El aviso ha cambiado: recarga la página para leerlo de nuevo.";
      return j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "No se pudo guardar tu respuesta. Inténtalo otra vez.";
    }
    // parte un texto en líneas de como mucho `ancho` px; medir(texto) → px (en la lámina de VR, el canvas)
    function lineas(texto, ancho, medir) {
      var palabras = String(texto).split(/\s+/).filter(Boolean), out = [], actual = "";
      palabras.forEach(function (p) {
        var prueba = actual ? actual + " " + p : p;
        if (actual && medir(prueba) > ancho) { out.push(actual); actual = p; } else actual = prueba;
      });
      if (actual) out.push(actual);
      return out;
    }
    var AVISO_ESPACIAL = "Con el micrófono abierto el sonido no es espacial; con auriculares sí.";
    // F3k-2 (decisión 207, P1 provisional): en un corro no hay turno que cierre el micro: lo cierra el silencio. SILENCIO_S segundos sin que se te oiga hablar
    // (ActiveSpeakers de LiveKit, «voz:habla» con yo) y se cierra solo. o = { corro, micro, habla (¿se te oye ahora?), t (s callado hasta ahora), dt } → { t, cierra }
    var SILENCIO_S = 60;
    function silencio(o) {
      if (!o || !o.corro || o.micro !== "abierto" || o.habla) return { t: 0, cierra: false };
      var t = (typeof o.t === "number" && isFinite(o.t) ? o.t : 0) + (typeof o.dt === "number" && o.dt > 0 ? o.dt : 0);
      return t >= SILENCIO_S ? { t: 0, cierra: true } : { t: t, cierra: false };
    }
    // ¿se enseña la caja del micro? En una guiada, con papel (guía, oficina o familia); en un corro (F3k-2), con el papel «miembro» de su token
    function enSala(e) { return !!e && ((!!e.guiada && ["guia", "oficina", "familia"].indexOf(e.papel) >= 0) || (!!e.corro && e.papel === "miembro")); }
    function modo(v) { return MODOS.indexOf(v) >= 0 ? v : DEFECTO; }
    function evento(sala) { var m = typeof sala === "string" ? SALA.exec(sala) : null; return m ? Number(m[1]) : null; }
    function modera(papel) { return papel === "guia" || papel === "oficina"; }
    function ordinal(n) { return n + ".º"; }
    // el puesto (1 = la siguiente) de esta identidad en la cola de manos que da 46 (en orden de llegada), o null
    function puestoDe(manos, yo) { var i = Array.isArray(manos) && typeof yo === "string" && yo ? manos.indexOf(yo) : -1; return i >= 0 ? i + 1 : null; }
    function textoCola(puesto) { return typeof puesto === "number" && puesto >= 1 ? "Estás " + ordinal(Math.floor(puesto)) + " en la cola." : "Tienes la mano levantada."; }
    // el micro, con icono y TEXTO: e = { papel, puede, micro (cerrado|abriendo|abierto), motivo } → { clave, icono, texto }
    function textoMicro(e) {
      // en un corro, el indicador que promete su aviso (contratos/voz-consentimiento.md, «cercania» v1): «● Tu micro está abierto»
      if (e.micro === "abierto" && e.corro) return { clave: "abierto", icono: "●", texto: "Tu micro está abierto: te oye el corro." };
      if (e.micro === "abierto") return { clave: "abierto", icono: "🎙", texto: "Micrófono abierto: te oyen." };
      if (e.micro === "abriendo") return { clave: "abriendo", icono: "⏳", texto: "Abriendo el micrófono…" };
      if (e.motivo === "micro_denegado") return { clave: "denegado", icono: "🚫", texto: "El navegador no deja usar el micrófono: permítelo en los ajustes del sitio." };
      if (e.motivo === "sin_micro") return { clave: "sin_micro", icono: "🚫", texto: "No se encuentra ningún micrófono." };
      if (e.motivo === "error_micro") return { clave: "error", icono: "🚫", texto: "No se pudo abrir el micrófono." };
      if (!e.puede) return { clave: "sin_permiso", icono: "🚫", texto: e.papel === "familia" ? "Micrófono cerrado: no tienes la palabra." : "Micrófono sin permiso." };
      return { clave: "cerrado", icono: "🔇", texto: "Micrófono cerrado: no te oyen." };
    }
    // lo que se enseña: e = { guiada, papel, puede, micro, motivo, auriculares, mano (¿la tienes levantada?), puesto (n | null), ocupado (¿una petición en vuelo?) }, m = modo
    function vista(e, m) {
      m = modo(m);
      if (!enSala(e)) return { visible: false, micro: null, primaria: { accion: "ninguna", texto: "", aria: "", off: true }, silenciar: false, cola: "", auric: false, aviso: "" };
      var abierto = e.micro !== "cerrado", mant = m === "mantener" && !modera(e.papel), t = textoMicro(e), p;
      if (e.puede || abierto) {
        p = abierto
          ? { accion: "micro", texto: mant ? "Hablando · suelta para callar" : "Silenciarme", aria: mant ? "Hablando: suelta para silenciar tu micrófono" : "Silenciar mi micrófono" }
          : { accion: "micro", texto: mant ? "Mantén pulsado para hablar" : "Hablar", aria: mant ? "Mantén pulsado para hablar" : "Hablar: abrir mi micrófono" };
        p.off = e.micro === "abriendo" && !mant;
      } else if (e.papel === "familia") {
        p = e.mano ? { accion: "bajar", texto: "Bajar la mano", aria: "Bajar la mano", off: !!e.ocupado } : { accion: "levantar", texto: "Levantar la mano", aria: "Levantar la mano para pedir la palabra", off: !!e.ocupado };
      } else p = { accion: "ninguna", texto: "Sin permiso de micrófono", aria: "Sin permiso de micrófono", off: true };
      return { visible: true, micro: t, primaria: p, silenciar: abierto && p.accion === "micro" && mant,
        cola: e.papel === "familia" && !e.puede && e.mano ? textoCola(e.puesto) : "", auric: !!e.puede || abierto, aviso: abierto && !e.auriculares ? AVISO_ESPACIAL : "" };
    }
    // un gesto sobre el botón, la tecla o el gatillo: o = { modo, papel, tipo ("baja" | "suelta"), micro, sosten (¿lo abrió este mismo gesto, aún apretado?) }
    // → { accion: "abre" | "cierra" | "nada", sosten }. «baja» alterna (abre si está cerrado; si no, cierra); en mantener, «suelta» cierra lo que abrió «baja»
    function entrada(o) {
      var mant = modo(o.modo) === "mantener" && !modera(o.papel);
      if (o.tipo === "baja") return o.micro === "cerrado" ? { accion: "abre", sosten: mant } : { accion: "cierra", sosten: false };
      if (o.tipo === "suelta" && mant && o.sosten) return { accion: o.micro === "cerrado" ? "nada" : "cierra", sosten: false };
      return { accion: "nada", sosten: !!o.sosten && o.tipo !== "suelta" };
    }
    // ¿se puede usar esto como micro ahora (la tecla y el gatillo lo respetan)?
    function activo(v) { return !!(v && v.visible && v.primaria.accion === "micro"); }
    // el texto único de la región aria-live: el micro y, si hay, la cola
    function textoEstado(v) { return v && v.visible ? v.micro.texto + (v.cola ? " " + v.cola : "") : ""; }
    return { AVISO_VERSION: AVISO_VERSION, AVISO: AVISO, URL_CONSENTIMIENTO: URL_CONSENTIMIENTO, consentimiento: consentimiento, requiere: requiere, errorAceptar: errorAceptar, lineas: lineas,
      MODOS: MODOS, DEFECTO: DEFECTO, MANO_MS: MANO_MS, AVISO_S: AVISO_S, MENSAJE_S: MENSAJE_S, AVISO_ESPACIAL: AVISO_ESPACIAL, SILENCIO_S: SILENCIO_S, silencio: silencio, enSala: enSala, modo: modo, evento: evento, modera: modera, ordinal: ordinal, puestoDe: puestoDe,
      textoCola: textoCola, textoMicro: textoMicro, vista: vista, entrada: entrada, activo: activo, textoEstado: textoEstado };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa en Node pruebas/guardianes/habla.test.js con un DOM, una voz y una guiada de mentira)
  function HablaMotor(n, Vz, Gd) {
    var H = HablaPuro, PV = PrimeraVezPuro, modoAj = H.DEFECTO, v = null, ult = "", mensaje = "", tMsg = 0, puntero = false, sosten = "", pulsa = null, pidiendo = false, manoSup = null, ultMicro = "cerrado", autoEv = null, vivo = true, tLam = 0;
    var cons = "?", consCarga = null, consIniciada = false, avisoVoz = null, avisoErr = "", avisoOcupado = false, avisoDom = null, avisoFoco = null;   // F3j: el consentimiento de voz ("si" | "no" | "?"), el aviso en pantalla
    var caja = null, estadoEl = null, icoEl = null, txtEl = null, boton = null, silencio = null, casilla = null, avisoEl = null, quitaFila = null, abriendoP = null;
    var est = { aperturas: 0, cierres: 0, manos: 0, errores: 0, teclas: 0, gatillos: 0, autos: 0, avisos: 0, aceptados: 0, retirados: 0, silencios: 0 }, LAM = "habla-micro", LAM_AVISO = "habla-consent";
    var tarj = null, tarjDom = null, estTarj = 0, LAM_TARJ = "habla-tarjeta", tarjFoco = null;   // F3l: la tarjeta de la primera vez ({ promesa, res, vr, forzada }) y cuántas se han enseñado
    var tSilencio = 0;   // F3k-2: segundos con el micro abierto en un corro sin que se te oiga
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    function vr() { return !!(VRX && VRX.on); }
    function px() { return Aparato.clase() === "quest" ? 56 : 44; }

    // ---- lo que se sabe: de la voz (permiso, micro, papel, sala) y de la guiada (quién eres y la cola)
    function lee() {
      var s = Vz ? Vz.estado() : null, g = Gd ? Gd.estado() : null;
      if (!s) return { guiada: false, corro: false, papel: "", puede: false, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false, evento: null };
      var puesto = g && g.evento === H.evento(s.sala) ? H.puestoDe(g.manos, g.yo) : null, dicho = manoSup && Date.now() < manoSup.hasta ? manoSup : null;
      // la api acaba de contestar y el atributo «mano» aún no ha llegado por la sala: durante 3 s vale lo que dijo la api
      if (dicho) puesto = dicho.v ? (puesto !== null ? puesto : dicho.puesto || null) : null;
      return { guiada: !!s.guiada, corro: !!s.corro, papel: s.papel, puede: !!s.puede, micro: s.micro, motivo: s.motivo || "", auriculares: !!s.auriculares, mano: dicho ? dicho.v : puesto !== null,
        puesto: puesto, ocupado: pidiendo, evento: H.evento(s.sala) };
    }
    function vista() { var e = lee(); return { e: e, v: H.vista(e, modoAj) }; }

    // ---- el micro: abrir y cerrar (Voz exige el permiso y el gesto; aquí solo se pide)
    function abre(fuente) {
      if (!Vz) return Promise.resolve(false);
      var w = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // si ya lo abrió él, no hay que abrirlo solo
      est.aperturas++; n.emite("habla:micro", { accion: "abre", fuente: fuente, modo: modoAj });
      abriendoP = Vz.abre(); var p = abriendoP; p.then(function () { if (abriendoP === p) abriendoP = null; }, function () { if (abriendoP === p) abriendoP = null; });
      return p;
    }
    function cierra(fuente) {
      if (!Vz) return Promise.resolve(true);
      est.cierres++; n.emite("habla:micro", { accion: "cierra", fuente: fuente, modo: modoAj });
      var w = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // quien se silencia no se reabre solo
      // soltado (o pulsado de nuevo) mientras se abría: se cierra en cuanto abra, para que la apertura que viene detrás no lo deje abierto
      if (abriendoP) return abriendoP.then(function () { return Vz.cierra(); }, function () { return Vz.cierra(); });
      return Vz.cierra();
    }
    // un gesto (botón, tecla, gatillo, panel): pasa por la lógica pura, que decide si abre, cierra o nada
    function gesto(tipo, fuente, modo) {   // modo: forzarlo (el botón del HUD, EV2-A4, siempre alterna: «pulsar»)
      var w = vista(); if (!H.activo(w.v)) return false;
      var r = H.entrada({ modo: modo || modoAj, papel: w.e.papel, tipo: tipo, micro: w.e.micro, sosten: sosten === fuente });
      // F3j (decisión 163): una familia sin consentimiento vigente no abre el micro: se le enseña el aviso (la api tampoco le habría dado la palabra). Aceptar es
      // su propio gesto; para abrir el micro, otro (así el navegador ve un gesto claro)
      // F3l: tras el aviso (si hacía falta) y antes de abrir el micro por primera vez, la tarjeta «la primera vez que hablas»; después, otro gesto abre el micro
      if (r.accion === "abre" && H.requiere(w.e.papel, "micro", cons) !== "nada") { sosten = ""; asegura("micro").then(function (q) { if (q === "no") return; return (tarjetaFalta(w.e) ? muestraTarjeta(false) : Promise.resolve()).then(function () { msg("Pulsa Hablar para abrir el micrófono."); }); }); }
      else if (r.accion === "abre" && tarjetaFalta(w.e)) { sosten = ""; muestraTarjeta(false).then(function () { msg("Pulsa Hablar para abrir el micrófono."); }); }
      else if (r.accion === "abre") { sosten = r.sosten ? fuente : ""; abre(fuente); }
      else if (r.accion === "cierra") { sosten = ""; cierra(fuente); }
      else if (tipo === "suelta" && sosten === fuente) sosten = "";
      pinta(); return r.accion !== "nada";
    }
    function alterna(fuente) { return gesto("baja", fuente); }

    // ---- la mano (api de F3c); el estado de verdad llega por el atributo «mano» que pone la api
    function pideMano(levantar) {
      // F3j: la primera vez (o con otra versión del aviso), antes de pedir la palabra se enseña el aviso de voz; bajar la mano no lo pide
      if (!levantar) return peticionMano(false);
      var w = vista(); if (w.e.evento === null || pidiendo) return Promise.resolve(false);
      return asegura("levantar").then(function (q) { return q === "no" ? false : peticionMano(true); });
    }
    function peticionMano(levantar) {
      var w = vista(), ev = w.e.evento; if (ev === null || pidiendo) return Promise.resolve(false);
      pidiendo = true; pinta();
      // el POST lleva cuerpo «{}» con su content-type: la api valida el cuerpo como objeto vacío y un POST sin cuerpo da 400 (hallado en F3g contra la api real)
      var o = { method: levantar ? "POST" : "DELETE", credentials: "same-origin", headers: { accept: "application/json" } };
      if (levantar) { o.headers["content-type"] = "application/json"; o.body = "{}"; }
      return fetch("/api/presencia/guiadas/" + ev + "/mano", o).then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) { var er = new Error(j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "La api respondió " + r.status + "."); throw er; }
          return j;
        });
      }).then(function (j) {
        est.manos++; manoSup = { v: levantar, hasta: Date.now() + H.MANO_MS };
        var puesto = j && typeof j.puesto === "number" ? j.puesto : null;
        if (levantar && puesto !== null) manoSup.puesto = puesto;
        n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: true, puesto: puesto });
        pidiendo = false; msg(levantar ? "Mano levantada." : "Mano bajada."); return true;
      }, function (er) {
        est.errores++; pidiendo = false; n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: false, puesto: null }); msg(er && er.message ? er.message : "No se pudo."); return false;
      });
    }


    // ---- F3j (decisión 163; EIPD-VOZ §3): el consentimiento de voz. La api manda (no da la palabra sin él); aquí se enseña el aviso antes de pedirla y se puede retirar.
    function llama(metodo, cuerpo) {
      var o = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
      if (cuerpo) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
      return fetch(H.URL_CONSENTIMIENTO, o).then(function (r) { return r.status === 204 ? { status: 204, j: null } : r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, j: j }; }); });
    }
    function cargaConsent() {
      if (consCarga) return consCarga;
      consCarga = llama("GET").then(function (r) { consCarga = null; if (r.status === 200) cons = H.consentimiento(r.j); return cons; }, function () { consCarga = null; return cons; });
      return consCarga;
    }
    // "nada" (no hacía falta, o ya estaba aceptado) | "aceptado" (acaba de aceptar) | "no" (ahora no, o no se pudo comprobar)
    function asegura(accion) {
      var papel = vista().e.papel, q = H.requiere(papel, accion, cons);
      if (q === "nada") return Promise.resolve("nada");
      var antes = q === "comprobar" ? cargaConsent().then(function () { return H.requiere(papel, accion, cons); }) : Promise.resolve(q);
      return antes.then(function (q2) {
        if (q2 === "nada") return "nada";
        if (q2 === "comprobar") { msg("No se pudo comprobar tu permiso de voz. Inténtalo otra vez."); return "no"; }
        return muestraAviso();
      });
    }
    function emiteCons(accion, ok) { n.emite("habla:consentimiento", { accion: accion, ok: ok, version: H.AVISO_VERSION }); }
    function muestraAviso() {
      if (avisoVoz) return avisoVoz.promesa;
      var res; var promesa = new Promise(function (r) { res = r; });
      avisoVoz = { promesa: promesa, res: res, vr: vr() }; avisoErr = ""; avisoOcupado = false; est.avisos++;
      if (avisoVoz.vr) avisoLamina(); else avisoPantalla();
      return promesa;
    }
    function cierraAviso(resultado) {
      var a = avisoVoz; if (!a) return; avisoVoz = null; avisoOcupado = false;
      if (avisoDom && avisoDom.parentNode) avisoDom.parentNode.removeChild(avisoDom); avisoDom = null;
      if (typeof Laminas !== "undefined" && Laminas && Laminas.hay && Laminas.hay(LAM_AVISO)) Laminas.cierra(LAM_AVISO, "cerrada");
      try { if (avisoFoco && avisoFoco.focus) avisoFoco.focus(); } catch (e) {} avisoFoco = null;
      a.res(resultado); pinta();
    }
    function aceptaAviso() {
      if (!avisoVoz || avisoOcupado) return;
      avisoOcupado = true; avisoErr = ""; repintaAviso();
      llama("PUT", { version: H.AVISO_VERSION }).then(function (r) {
        if (r.status === 200 && H.consentimiento(r.j) === "si") { cons = "si"; est.aceptados++; emiteCons("acepta", true); registraAjuste(); cierraAviso("aceptado"); return; }
        avisoErr = H.errorAceptar(r.status, r.j); avisoOcupado = false; emiteCons("acepta", false); repintaAviso();
      }, function () { avisoErr = H.errorAceptar(0, null); avisoOcupado = false; emiteCons("acepta", false); repintaAviso(); });
    }
    function rechazaAviso() {
      if (!avisoVoz || avisoOcupado) return;
      emiteCons("rechaza", true); cierraAviso("no"); msg("De acuerdo: no hablarás hasta que aceptes el aviso de voz.");
    }
    // retirarlo (Configuración o el panel de VR): la api borra la fila y, si hablaba o esperaba, le quita la palabra y baja su mano al momento
    function retiraConsent() {
      if (cons !== "si") return Promise.resolve(false);
      return llama("DELETE").then(function (r) {
        if (r.status !== 204 && r.status !== 200) throw new Error("estado " + r.status);
        cons = "no"; manoSup = null; est.retirados++; emiteCons("retira", true);
        if (Vz && Vz.estado().micro !== "cerrado") cierra("consentimiento");
        msg("Has retirado tu permiso de voz."); refrescaAjustes(); return true;
      }, function () { emiteCons("retira", false); msg("No se pudo retirar tu permiso. Inténtalo otra vez."); return false; });
    }
    function refrescaAjustes() { try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.pinta) Ajustes.pinta(); } catch (e) {} if (typeof PanelVR !== "undefined" && PanelVR.repinta) PanelVR.repinta(); }

    // ---- F3l: la tarjeta «la primera vez que hablas» (PrimeraVezPuro, 46b). Se enseña la primera vez que una familia o un miembro de un corro va a abrir el micro,
    // DESPUÉS del aviso de consentimiento (que es legal y se acepta; esto es comodidad y no pide nada). Que ya se vio se guarda en el aparato (Ajustes, «habla.tarjeta»,
    // localStorage): no es un dato personal ni del hogar, y otro aparato la vuelve a enseñar una vez. Volver a verla: Configuración → Hablar y la fila del panel de VR.
    function tarjetaVista() {
      // sin Ajustes con lectura (un Ajustes de mentira), cuenta como vista: nunca se bloquea el micro por esto
      try { return typeof Ajustes === "undefined" || !Ajustes || typeof Ajustes.lee !== "function" || Ajustes.lee(PV.CLAVE) === true; } catch (e) { return true; }
    }
    function tarjetaFalta(e) { return PV.debeVerse(tarjetaVista(), e.papel); }
    function marcaTarjeta() { try { if (typeof Ajustes !== "undefined" && Ajustes && typeof Ajustes.pon === "function") Ajustes.pon(PV.CLAVE, true); } catch (e) {} }
    function datosTarjeta() {
      var e = lee(), amb = PV.ambitoDe(e) || "guiada";
      return PV.tarjeta({ ambito: amb, forma: modoAj, corte: amb === "corro" ? PV.ALCANCE_CORRO : 0, vr: vr() });
    }
    // forzada: abierta a propósito (Configuración o el panel de VR); no es la primera vez
    function muestraTarjeta(forzada) {
      if (tarj) return tarj.promesa;
      var res, promesa = new Promise(function (r) { res = r; });
      tarj = { promesa: promesa, res: res, vr: vr(), forzada: !!forzada }; estTarj++;
      if (tarj.vr) tarjetaLamina(); else tarjetaPantalla();
      return promesa;
    }
    function cierraTarjeta(vista) {
      var t = tarj; if (!t) return; tarj = null;
      if (tarjDom && tarjDom.parentNode) tarjDom.parentNode.removeChild(tarjDom); tarjDom = null;
      if (typeof Laminas !== "undefined" && Laminas && Laminas.hay && Laminas.hay(LAM_TARJ)) Laminas.cierra(LAM_TARJ, "cerrada");
      try { if (tarjFoco && tarjFoco.focus) tarjFoco.focus(); } catch (e) {} tarjFoco = null;
      if (vista) marcaTarjeta();
      t.res(vista ? "vista" : "no");
    }
    function tarjetaPantalla() {
      var h = px(), T = datosTarjeta();
      try { tarjFoco = document.activeElement || null; } catch (e) { tarjFoco = null; }
      var cuerpo = el("div", { id: "hablaTarjetaCaja", style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(440px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;text-align:left" });
      var tit = el("h2", { id: "hablaTarjetaT", style: "margin:0 0 8px;font:700 18px/1.3 system-ui,sans-serif" }, [T.titulo]);
      var lineasEl = el("div", { id: "hablaTarjetaLineas" }, T.lineas.map(function (l) { return el("p", { id: "hablaTarjeta-" + l.k, style: "margin:6px 0" }, [el("strong", {}, [l.t + ". "]), l.txt]); }));
      var pie = el("p", { id: "hablaTarjetaPie", style: "margin:8px 0 10px;font-size:13px;opacity:0.8" }, [T.pie]);
      var ok = el("button", { id: "hablaTarjetaOk", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [T.boton]);
      var fila = el("div", { style: "display:flex;justify-content:flex-end" }, [ok]);
      [tit, lineasEl, pie, fila].forEach(function (x) { cuerpo.appendChild(x); });
      tarjDom = el("div", { id: "hablaTarjeta", role: "dialog", "aria-modal": "true", "aria-labelledby": "hablaTarjetaT", tabindex: "-1",
        style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [cuerpo]);
      ok.addEventListener("click", function () { cierraTarjeta(true); });
      tarjDom.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); cierraTarjeta(true); } else if (e.key === "Tab") { if (e.preventDefault) e.preventDefault(); ok.focus(); } });
      (visor || document.body).appendChild(tarjDom);
      try { ok.focus(); } catch (e) {}
    }
    function tarjetaLamina() {
      if (typeof Laminas === "undefined" || !Laminas || !Laminas.abre) { var t0 = tarj; tarj = null; t0.res("no"); return; }
      var T = datosTarjeta();
      Laminas.abre({ id: LAM_TARJ, ancho: 1.4, alto: 1.1, w: 1100, h: 860, firma: function () { return T.titulo; },
        pinta: function (cx, w, hh) {
          cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, hh); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, hh - 4);
          cx.textBaseline = "top"; cx.fillStyle = "#ffffff"; var y = 28, medir = function (t) { return cx.measureText(t).width; };
          cx.font = "700 40px system-ui, sans-serif"; cx.fillText(T.titulo, 32, y, w - 64); y += 58;
          T.lineas.forEach(function (l) {
            cx.fillStyle = "#7fe9ff"; cx.font = "600 28px system-ui, sans-serif"; cx.fillText(l.t, 32, y, w - 64); y += 36;
            cx.fillStyle = "#ffffff"; cx.font = "28px system-ui, sans-serif"; H.lineas(l.txt, w - 64, medir).forEach(function (ln) { cx.fillText(ln, 32, y); y += 34; }); y += 14;
          });
          cx.fillStyle = "rgba(255,255,255,0.75)"; cx.font = "25px system-ui, sans-serif"; H.lineas(T.pie, w - 64, medir).forEach(function (ln) { cx.fillText(ln, 32, y); y += 30; });
          var by = hh - 140, bh = 100;
          cx.fillStyle = "rgba(64,240,255,0.3)"; cx.fillRect(32, by, w - 64, bh);
          cx.fillStyle = "#ffffff"; cx.font = "600 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center"; cx.fillText(T.boton, w / 2, by + bh / 2); cx.textAlign = "left";
        },
        alTocar: function (u, v) { if (v >= 0.84) cierraTarjeta(true); return true; },
        alCierra: function (motivo) { if (tarj && motivo !== "cerrada") { var t = tarj; tarj = null; t.res("no"); pinta(); } } });
    }

    // ---- el aviso en pantalla (un diálogo modal con foco y Esc) y en VR (una lámina con dos zonas que se tocan con el rayo o el gatillo)
    function avisoPantalla() {
      var h = px(), A = H.AVISO;
      try { avisoFoco = document.activeElement || null; } catch (e) { avisoFoco = null; }
      var cuerpo = el("div", { id: "hablaConsentCaja", style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(460px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;text-align:left" });
      var tit = el("h2", { id: "hablaConsentT", style: "margin:0 0 8px;font:700 18px/1.3 system-ui,sans-serif" }, [A.titulo]);
      var puntos = el("ul", { style: "margin:0 0 10px;padding-left:20px" }, A.puntos.map(function (t) { return el("li", { style: "margin:4px 0" }, [t]); }));
      var enlace = el("a", { id: "hablaConsentEnlace", href: A.enlace.href, target: "_blank", rel: "noopener noreferrer", style: "color:#7fe9ff;display:inline-block;min-height:" + h + "px;line-height:" + h + "px" }, [A.enlace.texto]);
      var nota = el("p", { style: "margin:4px 0 10px;font-size:12px;opacity:0.75" }, [A.nota]);
      var err = el("p", { id: "hablaConsentError", role: "alert", hidden: true, style: "margin:0 0 8px;color:#ffb4b4;font-weight:600" });
      var ok = el("button", { id: "hablaConsentAcepta", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [A.aceptar]);
      var no = el("button", { id: "hablaConsentNo", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px;background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.5)" }, [A.ahoraNo]);
      var fila = el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, ok]);
      [tit, puntos, enlace, nota, err, fila].forEach(function (x) { cuerpo.appendChild(x); });
      avisoDom = el("div", { id: "hablaConsent", role: "dialog", "aria-modal": "true", "aria-labelledby": "hablaConsentT", tabindex: "-1",
        style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [cuerpo]);
      avisoDom._err = err; avisoDom._ok = ok; avisoDom._no = no;
      ok.addEventListener("click", aceptaAviso); no.addEventListener("click", rechazaAviso);
      avisoDom.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); rechazaAviso(); return; }
        if (e.key !== "Tab") return;
        var orden = [enlace, no, ok], i = orden.indexOf(document.activeElement), d = e.shiftKey ? -1 : 1;
        if (i < 0 || (d === 1 && i === orden.length - 1) || (d === -1 && i === 0)) { if (e.preventDefault) e.preventDefault(); orden[i < 0 || d === 1 ? 0 : orden.length - 1].focus(); }
      });
      (visor || document.body).appendChild(avisoDom);
      try { no.focus(); } catch (e) {}   // el foco empieza en «Ahora no»: aceptar es siempre una decisión expresa
    }
    function repintaAviso() {
      if (avisoDom) { avisoDom._err.textContent = avisoErr; avisoDom._err.hidden = !avisoErr; avisoDom._ok.disabled = avisoOcupado; avisoDom._no.disabled = avisoOcupado; avisoDom._ok.textContent = avisoOcupado ? "Guardando…" : H.AVISO.aceptar; }
      if (typeof Laminas !== "undefined" && Laminas && Laminas.hay && Laminas.hay(LAM_AVISO) && Laminas.repinta) Laminas.repinta(LAM_AVISO);
    }
    function avisoLamina() {
      if (typeof Laminas === "undefined" || !Laminas || !Laminas.abre) { rechazaAviso(); return; }
      var A = H.AVISO;
      Laminas.abre({ id: LAM_AVISO, ancho: 1.4, alto: 1.1, w: 1100, h: 860,
        firma: function () { return JSON.stringify([avisoErr, avisoOcupado]); },
        pinta: function (cx, w, hh) {
          cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, hh); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, hh - 4);
          cx.textBaseline = "top"; cx.fillStyle = "#ffffff"; var y = 28, medir = function (t) { return cx.measureText(t).width; };
          cx.font = "700 40px system-ui, sans-serif"; H.lineas(A.titulo, w - 64, medir).forEach(function (l) { cx.fillText(l, 32, y); y += 50; });
          y += 6; cx.font = "29px system-ui, sans-serif";
          A.puntos.concat([A.enlaceVR]).forEach(function (t) { H.lineas("• " + t, w - 64, medir).forEach(function (l) { cx.fillText(l, 32, y); y += 36; }); y += 5; });
          cx.fillStyle = "rgba(255,255,255,0.7)"; cx.font = "25px system-ui, sans-serif"; cx.fillText(A.nota, 32, y + 4);
          if (avisoErr) { cx.fillStyle = "#ffb4b4"; cx.font = "600 28px system-ui, sans-serif"; H.lineas(avisoErr, w - 64, medir).forEach(function (l, i) { cx.fillText(l, 32, hh - 250 + i * 34); }); }
          var by = hh - 140, bh = 100;
          cx.fillStyle = "rgba(255,255,255,0.12)"; cx.fillRect(32, by, w / 2 - 48, bh); cx.fillStyle = avisoOcupado ? "rgba(64,240,255,0.1)" : "rgba(64,240,255,0.3)"; cx.fillRect(w / 2 + 16, by, w / 2 - 48, bh);
          cx.fillStyle = "#ffffff"; cx.font = "600 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center";
          cx.fillText(A.ahoraNo, w / 4 + 4, by + bh / 2); cx.fillText(avisoOcupado ? "Guardando…" : A.aceptar, (3 * w) / 4 - 4, by + bh / 2); cx.textAlign = "left";
        },
        // la franja de abajo: izquierda «Ahora no», derecha «Aceptar»; el resto de la lámina no hace nada pero tampoco deja pasar el toque
        alTocar: function (u, v) { if (v >= 0.84) { if (u < 0.5) rechazaAviso(); else aceptaAviso(); } return true; },
        alCierra: function (motivo) { if (avisoVoz && motivo !== "cerrada") { var a = avisoVoz; avisoVoz = null; avisoOcupado = false; emiteCons("rechaza", true); a.res("no"); pinta(); } } });
    }

    // ---- la pantalla: una caja arriba, bajo la tira de la palabra de 46 (no tapa los mandos táctiles de abajo)
    var CSS_BTN = "font:600 15px/1.2 system-ui,sans-serif;color:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.7);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;margin:2px 4px";
    function monta() {
      if (caja) return;
      var h = px();
      caja = el("div", { id: "hablaCaja", role: "group", "aria-label": "Micrófono de la visita guiada", hidden: true,
        style: "position:absolute;left:50%;top:50px;transform:translateX(-50%);z-index:31;width:max-content;max-width:min(440px,calc(100% - 24px));padding:8px 10px;border-radius:16px;background:rgba(16,20,24,0.92);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box;text-align:center" });
      icoEl = el("span", { "aria-hidden": "true", style: "margin-right:6px" }); txtEl = el("span");
      estadoEl = el("div", { id: "hablaEstado", role: "status", "aria-live": "polite", "aria-atomic": "true", style: "font-weight:600;margin:0 0 4px" }, [icoEl, txtEl]);
      boton = el("button", { id: "hablaBoton", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Hablar"]);
      silencio = el("button", { id: "hablaSilencio", type: "button", hidden: true, "aria-label": "Silenciar mi micrófono", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px;background:rgba(229,72,77,0.18);border-color:rgba(229,72,77,0.8)" }, ["Silenciarme"]);
      casilla = el("input", { id: "hablaAuric", type: "checkbox", style: "width:" + Math.round(h * 0.5) + "px;height:" + Math.round(h * 0.5) + "px;margin:0 8px 0 0;vertical-align:middle" });
      var etiqueta = el("label", { id: "hablaAuricEt", style: "display:inline-flex;align-items:center;min-height:" + h + "px;cursor:pointer;margin:0 4px", hidden: true }, [casilla, "Llevo auriculares"]);
      avisoEl = el("p", { id: "hablaAviso", style: "margin:4px 0 0;font-size:13px;opacity:0.9", hidden: true });
      var fila = el("div", { style: "display:flex;flex-wrap:wrap;justify-content:center;align-items:center" }, [boton, silencio, etiqueta]);
      caja.appendChild(estadoEl); caja.appendChild(fila); caja.appendChild(avisoEl);
      caja._et = etiqueta;
      (visor || document.body).appendChild(caja);
      // el botón: pulsar = clic; mantener = apretar y soltar (el puntero), o la barra y Intro mantenidas
      boton.addEventListener("pointerdown", function (e) { if (modoAj === "mantener" && esMicro()) { puntero = true; if (e.preventDefault) e.preventDefault(); gesto("baja", "boton"); } else if (esMano()) { /* el clic */ } });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (nm) { boton.addEventListener(nm, function () { if (puntero) { puntero = false; gesto("suelta", "boton"); } }); });
      boton.addEventListener("contextmenu", function (e) { if (e.preventDefault) e.preventDefault(); });
      boton.addEventListener("keydown", function (e) { if ((e.code === "Space" || e.code === "Enter") && modoAj === "mantener" && esMicro()) { if (e.preventDefault) e.preventDefault(); if (!e.repeat) gesto("baja", "boton"); } });
      boton.addEventListener("keyup", function (e) { if ((e.code === "Space" || e.code === "Enter") && sosten === "boton") { if (e.preventDefault) e.preventDefault(); gesto("suelta", "boton"); } });
      boton.addEventListener("click", function () {
        var w = vista(), a = w.v.primaria.accion;
        if (a === "levantar") pideMano(true); else if (a === "bajar") pideMano(false);
        else if (a === "micro" && !(modoAj === "mantener" && !H.modera(w.e.papel))) alterna("boton");   // en mantener lo hacen apretar y soltar
      });
      silencio.addEventListener("click", function () { if (vista().e.micro !== "cerrado") { sosten = ""; cierra("boton"); pinta(); } });
      casilla.addEventListener("change", function () { if (Vz) Vz.auriculares(!!casilla.checked); pinta(); });
    }
    function esMicro() { return H.activo(vista().v); }
    function esMano() { var a = vista().v.primaria.accion; return a === "levantar" || a === "bajar"; }
    function msg(t) { mensaje = t || ""; tMsg = H.MENSAJE_S; ult = ""; pinta(); }
    function pinta() {
      var w = vista(); v = w;
      if (!w.v.visible) { if (caja) caja.hidden = true; ult = ""; mensaje = ""; return; }
      monta();
      var t = H.textoEstado(w.v) + (mensaje ? " " + mensaje : ""), k = JSON.stringify([t, w.v.primaria, w.v.silenciar, w.v.auric, w.v.aviso, w.e.auriculares, vr()]);
      if (k === ult) return; ult = k;
      caja.hidden = vr(); caja.setAttribute("aria-label", w.e.corro ? "Micrófono del corro" : "Micrófono de la visita guiada");
      icoEl.textContent = w.v.micro.icono; txtEl.textContent = t;
      boton.textContent = w.v.primaria.texto; boton.disabled = !!w.v.primaria.off; boton.setAttribute("aria-label", w.v.primaria.aria);
      boton.title = w.v.primaria.accion === "micro" ? w.v.primaria.texto + " (tecla T)" : w.v.primaria.texto;
      boton.setAttribute("aria-keyshortcuts", w.v.primaria.accion === "micro" ? "T" : "");
      silencio.hidden = !w.v.silenciar; caja._et.hidden = !w.v.auric; casilla.checked = !!w.e.auriculares;
      avisoEl.textContent = w.v.aviso; avisoEl.hidden = !w.v.aviso;
      if (typeof PanelVR !== "undefined" && PanelVR.repinta) PanelVR.repinta();
      registraAjuste();
    }

    // ---- las teclas: T (Teclas la reserva y la suelta con el foco en un campo); en mantener, el soltar se oye aparte
    var quitaT = (typeof Teclas !== "undefined" && Teclas.registra) ? Teclas.registra("KeyT", function () {
      if (vr() || !esMicro()) return false;
      est.teclas++; gesto("baja", "tecla");
    }, "habla") : null;
    if (quitaT) n.limpia(quitaT);
    function alSoltarT(e) { if (e && e.code === "KeyT" && sosten === "tecla") gesto("suelta", "tecla"); }
    window.addEventListener("keyup", alSoltarT); n.limpia(function () { window.removeEventListener("keyup", alSoltarT); });

    // ---- el guía abre su micro con el primer gesto de la sala (una vez por visita; si lo silencia, no se reabre solo)
    function dentroDeCaja(x) { for (var i = 0; x && i < 12; i++, x = x.parentNode) if (x === caja) return true; return false; }
    function autoGuia(e) {
      var w = vista(); if (!w.v.visible || w.e.papel !== "guia" || !w.e.puede || w.e.micro !== "cerrado" || w.e.evento === autoEv || w.e.motivo) return;
      if (e && dentroDeCaja(e.target)) return;   // si pulsa el botón del micro, que mande el botón
      autoEv = w.e.evento; est.autos++; abre("auto");
    }
    ["pointerdown", "keydown"].forEach(function (nm) { window.addEventListener(nm, autoGuia, { passive: true }); n.limpia(function () { window.removeEventListener(nm, autoGuia); }); });

    // ---- VR: el gatillo izquierdo (29_vr.js llama a VRX.voz.mando cada fotograma con el estado del gatillo y una función de pulso del mando)
    var gatilloAntes = false;
    var gancho = {
      toma: function () { return vr() && esMicro(); },
      mando: function (abajo, pulso) {
        pulsa = pulso || pulsa;
        if (abajo === gatilloAntes) return; gatilloAntes = abajo;
        if (!esMicro()) return;
        est.gatillos++; gesto(abajo ? "baja" : "suelta", "gatillo");
      }
    };
    if (typeof VRX !== "undefined" && VRX) VRX.voz = gancho;
    function pulso(f, ms) { try { if (pulsa) pulsa(f, ms); } catch (e) {} }

    // ---- VR: la lámina de 3 s al abrir o cerrar y la fila del panel
    function laminaVR(texto, abierto) {
      if (!vr() || typeof Laminas === "undefined") return;
      tLam = H.AVISO_S;
      var o = { id: LAM, ancho: 0.8, alto: 0.2, w: 640, h: 160, firma: function () { return texto; },
        pinta: function (cx, w, h) { cx.fillStyle = "rgba(16,20,24,0.95)"; cx.fillRect(0, 0, w, h); cx.fillStyle = abierto ? "#ffd58a" : "#ffffff"; cx.font = "600 38px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.fillText(texto, 28, h / 2); } };
      if (Laminas.hay(LAM)) Laminas.cierra(LAM, "reabierta");
      Laminas.abre(o);
    }
    if (typeof PanelVR !== "undefined" && PanelVR.filas) {
      quitaFila = PanelVR.filas("ira", { id: "habla", orden: 6, alto: 300, visible: function () { return !!(v && v.v.visible); },
        firma: function () { var w = vista(); return JSON.stringify([H.textoEstado(w.v), w.v.primaria.texto, w.e.auriculares, w.v.aviso, cons]); },
        pinta: function (cx, y, W) {
          var w = vista(); cx.fillStyle = "#ffffff"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Micrófono", 40, y + 6);
          cx.font = "28px system-ui, sans-serif"; cx.fillText(w.v.micro ? w.v.micro.icono + " " + w.v.micro.texto : "", 40, y + 50, W - 80);
          cx.fillStyle = "rgba(255,255,255,0.75)"; cx.font = "24px system-ui, sans-serif";
          cx.fillText(w.v.cola || w.v.aviso || "Gatillo izquierdo: " + (modoAj === "mantener" && !H.modera(w.e.papel) ? "mantener para hablar" : "abrir y cerrar"), 40, y + 88, W - 80);
        },
        botones: function (b, y) {
          var w = vista(), a = w.v.primaria.accion;
          b("hMic", 40, y + 140, 520, 64, w.v.primaria.texto.replace("Mantén pulsado para hablar", "Hablar").replace("Hablando · suelta para callar", "Silenciarme"), function () {
            var x = vista().v.primaria.accion; if (x === "levantar") pideMano(true); else if (x === "bajar") pideMano(false); else if (x === "micro") alterna("panel");
          }, w.e.micro !== "cerrado");
          if (w.v.auric) b("hAur", 580, y + 140, 404, 64, "Auriculares: " + (w.e.auriculares ? "sí" : "no"), function () { if (Vz) Vz.auriculares(!vista().e.auriculares); pinta(); }, w.e.auriculares);
          if (!H.modera(w.e.papel)) b("hVer", 580, y + 220, 404, 64, PV.FILA_VOLVER, function () { muestraTarjeta(true); }, false);   // F3l: volver a leer la tarjeta de la primera vez
          if (cons === "si") b("hRet", 40, y + 220, 520, 64, "Retirar mi permiso de voz", function () { retiraConsent(); }, false);   // F3j: el permiso de voz, siempre a mano
        },
        debug: function () { return { habla: estado() }; } });
      n.limpia(quitaFila);
    }

    // ---- el ajuste «Hablar» en Configuración (Ajustes.registra): su pestaña aparece al estar por primera vez en una visita guiada (no hay que ensuciar la
    // Configuración de quien nunca entra en una); lo guardado se aplica al registrarse
    var quitaAj = null;
    function registraAjuste() {
      if (quitaAj || typeof Ajustes === "undefined" || !Ajustes.registra) return;
      quitaAj = function () {};   // marca «registrado» antes: aplica llama a pinta, que volvería aquí
      var q = Ajustes.registra("habla", { modo: { tipo: "opc", def: H.DEFECTO, ops: H.MODOS.slice() }, tarjeta: { tipo: "bool", def: false } },   // «tarjeta»: ¿ya se vio la de la primera vez? (F3l; en el aparato)
        { id: "habla", t: "Hablar", campos: [{ k: "modo", t: "Micrófono en la visita guiada", ops: [["pulsar", "Pulsar para abrir y pulsar para cerrar"], ["mantener", "Mantener pulsado para hablar"]],
          nota: "Solo para las familias cuando tienen la palabra; el guía siempre abre y cierra. Se usa con el botón «Hablar», la tecla T y, en VR, el gatillo izquierdo." },
          // F3j (decisión 163): retirar el consentimiento de voz, siempre a mano. Lo guarda la api, no este navegador
          { boton: "Retirar mi permiso de voz", id: "ajVozRetira", alClic: function () { retiraConsent(); },
            activo: function () { return cons === "si"; }, texto: function () { return cons === "si" ? "Retirar mi permiso de voz" : "Permiso de voz: no dado"; },
            nota: "Si lo retiras, se te vuelve a pedir la próxima vez que quieras hablar en una visita guiada. Si en ese momento tienes la palabra, se te quita." },
          // F3l: volver a leer la tarjeta de la primera vez (no para el guía ni la oficina: no pasan por ella)
          { boton: PV.FILA_VOLVER, id: "ajVozTarjeta", alClic: function () { if (!H.modera(lee().papel)) muestraTarjeta(true); }, activo: function () { return !H.modera(lee().papel); },
            texto: function () { return PV.FILA_VOLVER; }, nota: "Con quién se oye tu voz, cómo cortar el micro y que no se graba." }] },
        function (k, val) { if (k === "habla.modo") { modoAj = H.modo(val); if (modoAj !== "mantener" && sosten) { sosten = ""; } ult = ""; if (vivo) pinta(); } });
      if (q) { quitaAj = q; n.limpia(q); }
    }
    n.on("voz:estado", function () { if (vivo) alVoz(); });
    n.on("habla:alterna", function () { if (vivo) gesto("baja", "boton", "pulsar"); });   // el botón «Hablar» del HUD (31b_hud_personal.js): abre o cierra, como el botón de la caja en modo «pulsar»
    n.on("guiada:palabra", function () { if (vivo) pinta(); });
    n.on("depura:lineas", function (d) { if (v && v.v.visible && d && d.lineas) d.lineas.push("habla · micro " + v.e.micro + " · modo " + modoAj + (v.e.mano ? " · mano" + (v.e.puesto ? " " + v.e.puesto : "") : "")); });
    function alVoz() {
      var w = vista(), m = w.e.micro === "abierto" ? "abierto" : "cerrado";
      if (m !== ultMicro) {
        ultMicro = m;
        if (vr() && w.v.visible) { pulso(m === "abierto" ? 0.4 : 0.2, m === "abierto" ? 30 : 15); laminaVR(m === "abierto" ? "Micrófono abierto" : "Micrófono cerrado", m === "abierto"); }
        if (m === "cerrado" && sosten) sosten = "";
      }
      pinta();
    }

    // ---- fase «tarde» (cada 0,25 s): la cola cambia sin que nadie avise, la lámina de VR se cierra, el guía en VR abre solo, un «mantener» huérfano se suelta
    function tarde(dt) {
      if (!consIniciada && ConfigPuro.prefijoApi(location.search, D && D.base)) { consIniciada = true; cargaConsent().then(function () { if (vivo && cons === "si") { registraAjuste(); refrescaAjustes(); } }); }
      if (avisoVoz && avisoVoz.vr !== vr()) { var a = avisoVoz; cierraAviso("no"); a.res("no"); }   // se cambió de pantalla a VR (o al revés) con el aviso abierto: se cierra y se vuelve a pedir
      if (tarj && tarj.vr !== vr()) { var tt = tarj; cierraTarjeta(false); tt.res("no"); }   // F3l: se cambió de pantalla a VR (o al revés): se cierra (sin darla por vista)
      if (tMsg > 0) { tMsg -= dt; if (tMsg <= 0) { mensaje = ""; ult = ""; } }
      pinta();
      if (tLam > 0) { tLam -= dt; if (tLam <= 0 && typeof Laminas !== "undefined" && Laminas.hay(LAM)) Laminas.cierra(LAM, "cerrada"); }
      if (sosten === "gatillo" && !vr()) { gatilloAntes = false; gesto("suelta", "gatillo"); }
      if (vr()) autoGuia(null);
      // F3k-2: en un corro, el micro abierto se cierra solo tras un minuto sin que se te oiga (no hay turno que lo cierre)
      var e = v ? v.e : null, hablaYo = !!(Vz && Vz.hablan && Vz.hablan().some(function (h) { return h && h.yo; }));
      var sl = H.silencio({ corro: !!(e && e.corro), micro: e ? e.micro : "cerrado", habla: hablaYo, t: tSilencio, dt: dt }); tSilencio = sl.t;
      if (sl.cierra) { est.silencios++; sosten = ""; cierra("silencio"); msg("Micrófono cerrado tras un minuto sin hablar."); }
    }
    function estado() {
      var w = vista();
      return { visible: w.v.visible, modo: modoAj, micro: w.e.micro, papel: w.e.papel, puede: w.e.puede, accion: w.v.primaria.accion, texto: w.v.primaria.texto, estado: H.textoEstado(w.v), cola: w.v.cola,
        puesto: w.e.puesto, mano: w.e.mano, aviso: w.v.aviso, sosten: sosten, silenciar: w.v.silenciar, auriculares: w.e.auriculares, boton: px(), aperturas: est.aperturas, cierres: est.cierres,
        manos: est.manos, errores: est.errores, teclas: est.teclas, gatillos: est.gatillos, autos: est.autos, teclaT: !!quitaT,
        consentimiento: cons, aviso: !!avisoVoz, avisos: est.avisos, aceptados: est.aceptados, retirados: est.retirados, corro: !!w.e.corro, silencios: est.silencios, tarjeta: !!tarj, tarjetas: estTarj, tarjetaVista: tarjetaVista() };
    }
    function libera() {
      vivo = false; sosten = "";
      if (avisoVoz) cierraAviso("no");
      if (tarj) cierraTarjeta(false);
      if (Laminas && Laminas.hay && Laminas.hay(LAM)) Laminas.cierra(LAM, "cerrada");
      if (typeof VRX !== "undefined" && VRX && VRX.voz === gancho) VRX.voz = null;
      if (caja && caja.parentNode) caja.parentNode.removeChild(caja); caja = estadoEl = icoEl = txtEl = boton = silencio = casilla = avisoEl = null;
      if (window.__habla === api) window.__habla = undefined;
    }
    // gancho de pruebas: el estado; «hablar» (alterna), «mano» (true | false), «tecla», «gatillo» (true | false), «modo» (pulsar | mantener), «acepta» y «ahoraNo» (el aviso de voz), «retira» (el permiso)
    function api(a, arg) {
      if (a === "hablar") return alterna("boton"); if (a === "mano") return pideMano(arg !== false);
      if (a === "gatillo") { gancho.mando(!!arg, null); return estado(); }
      if (a === "modo") { modoAj = H.modo(arg); ult = ""; pinta(); return estado(); }
      if (a === "entendido") { cierraTarjeta(true); return estado(); } if (a === "verTarjeta") { muestraTarjeta(true); return estado(); }
      if (a === "acepta") { aceptaAviso(); return estado(); } if (a === "ahoraNo") { rechazaAviso(); return estado(); } if (a === "retira") return retiraConsent();
      return estado();
    }
    window.__habla = api;
    return { tarde: tarde, libera: libera, estado: estado };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?habla=0 lo apaga. Consume la voz (Voz.abre/cierra/estado/auriculares)
  // y la guiada (su api «Guiada»: quién eres y la cola); sin ellas no se monta. Montado y fuera de una sala guiada, no crea nada.
  Componentes.registra({
    id: "habla-guiada", version: 1,
    consume: ["Aparato", "Voz", "Guiada", "Ajustes", "Teclas", "PanelVR", "VRX", "Laminas", "PrimeraVezPuro"],
    expone: [],
    eventos: { escucha: ["voz:estado", "guiada:palabra", "depura:lineas", "habla:alterna"], emite: ["habla:micro", "habla:mano", "habla:consentimiento"] },
    bandera: { defecto: true, url: "habla" },
    // DOM en pantalla (0 llamadas); en VR, la lámina de 3 s al abrir o cerrar el micro (640 × 160 sin mipmaps: ≈ 0,4 MB) o, antes, la del aviso de voz (F3j: 1100 × 860 sin mipmaps: ≈ 3,8 MB); nunca las dos a la vez, solo mientras se ven: 1 llamada, 2 triángulos
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 4 },
    fases: { tarde: 0.25 },
    monta: function (n) { return HablaMotor(n, n.api("voz-guiada"), n.api("visita-guiada")); },
    actualiza: { tarde: function (dt, t, api) { api.tarde(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
