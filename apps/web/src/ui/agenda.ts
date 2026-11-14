// La agenda dentro del mundo (OF11d; decisiones 145-148, doc/sistema/OFICINA.md §7; MU5-n, A3-7b2: antes apps/web/motor/43_agenda.js, que queda como talón): los próximos
// eventos de la finca, con sus plazas, tu estado (apuntados / en espera) y, solo para la titular con su enlace, apuntarse o borrarse con el número de personas (1 a 10). La api
// ya existe (OF11/OF11b): GET /api/agenda, POST y DELETE /api/agenda/:id/inscripcion (contratos/api.openapi.yaml); aquí no se decide nada, solo se enseña y se pide. Una sesión
// de gafas vinculadas llega con `puede_inscribirse: false` y la api rechaza (403 solo_titular) cualquier intento: el cliente además no ofrece el botón.
// Es un COMPONENTE (ADR-0023), de TODOS los mundos (mundos: "todos"): la agenda es de la familia y de la finca, no del mundo que se vea; su icono del HUD, su ventana y su fila
// del panel de VR no cambian al cruzar una puerta. ?agenda=0 o la configuración del servidor lo apagan. Sin servidor (sin D.base /teselas/… ni ?api=) no se monta nada.
// Lo que llega de la api es dato: se valida con lista blanca y se pinta SIEMPRE como texto (textContent y fillText), nunca como HTML.
// En VR (decisión 146): una fila «Agenda» en la pestaña Info del panel con los próximos (fecha, título, plazas) y la frase «Apúntate desde el móvil o el ordenador»: en VR no se
// apunta nadie, ni siquiera la titular (el panel no tiene teclado ni selector cómodo, y el enlace de gafas no es el de la titular).
// Código movido tal cual (se tipan parámetros y variables; lo del legado entra por dp). Su libera() suelta lo que el núcleo ya soltaba con n.limpia (el icono, la ventana, las
// filas del panel de VR, la escucha de guiada:entrada, el observador de la ventana, el reloj de 20 s y window.__agenda) y, nuevo (A3-7b2), CANCELA las peticiones en vuelo
// (AbortController: la agenda, los avisos, apuntarse, borrarse y marcar como leído) y el plazo de 30 s de «Entrar en la visita», que dejaba su temporizador vivo; y lo que
// conteste tarde ya no emite ni repinta. Los trozos [puro:…] y el cuerpo de AgendaMotor los evalúa en Node pruebas/guardianes/agenda_mundo.test.js (el .ts, leído como JavaScript).
import type { Manifiesto } from "../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_AGENDA = "agenda";

/** Lo que el talón de 43 le da: D (01), el Bus y ConfigPuro (02c), Hud (31) y Ventanas (32); PanelVR (29_vr, que el código comprobaba con typeof), por getter */
export interface DepsAgenda { D: T; Bus: T; ConfigPuro: T; Hud: T; Ventanas: T; readonly PanelVR: T }

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/agenda_mundo.test.js)
export var AgendaPuro: T = (function () {
  var MAX_EVENTOS = 50, MAX_PERSONAS = 10, TEXTO_VR = "Apúntate desde el móvil o el ordenador", TEXTO_NO_ENTRA = "No se ha podido entrar en la visita. Prueba otra vez en un rato.";
  var DIAS: T = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var TIPOS: T = { guiada: "Visita guiada", libre: "Visita libre", recoleccion: "Cosecha abierta", cata: "Cata", taller: "Taller", directo: "Directo", evento: "Evento" };
  function dos(n?: T) { return ("0" + n).slice(-2); }
  function corta(s?: T, max?: T) { var c: T = Array.from(String(s)); return c.length > max ? c.slice(0, max - 1).join("").trim() + "…" : String(s); }
  function rutaAgenda(prefijo?: T) { return prefijo ? prefijo + "agenda" : null; }
  function rutaInscripcion(prefijo?: T, id?: T) { return prefijo && Number.isInteger(id) && id >= 1 ? prefijo + "agenda/" + id + "/inscripcion" : null; }
  // número de personas del selector: entero de 1 a 10, o null
  function personas(v?: T) { var n: T = /^\d{1,2}$/.test(String(v)) ? Number(v) : NaN; return Number.isInteger(n) && n >= 1 && n <= MAX_PERSONAS ? n : null; }
  // OF11e: la ventana de entrada que da la api ({ desde, hasta } en ISO) o null; lo que no cuadra, null
  function entradaDe(x?: T) {
    if (!x || typeof x !== "object" || typeof x.desde !== "string" || typeof x.hasta !== "string") return null;
    var d: T = Date.parse(x.desde), h: T = Date.parse(x.hasta); return isFinite(d) && isFinite(h) && h > d ? { desde: d, hasta: h } : null;
  }
  // la respuesta de GET /api/agenda con lista blanca → { puede, eventos: [{ id, titulo, tipo, lugar, haza, descripcion, presencial, empieza (ms), plazas, libres,
  // abierta, mia: { estado, personas } | null }] } o null si no es lo esperado. Lo que no cuadra, fuera; lo de más (guía, creador…) no pasa.
  function valida(j?: T) {
    if (!j || typeof j !== "object" || typeof j.puede_inscribirse !== "boolean" || !Array.isArray(j.eventos)) return null;
    var ev: T = [], vistos: T = {};
    for (var i = 0; i < j.eventos.length && ev.length < MAX_EVENTOS; i++) {
      var e: T = j.eventos[i]; if (!e || typeof e !== "object") continue;
      var t: T = typeof e.empieza_en === "string" ? Date.parse(e.empieza_en) : NaN;
      if (!Number.isInteger(e.id) || e.id < 1 || vistos[e.id] || typeof e.titulo !== "string" || !e.titulo.trim() || !isFinite(t)) continue;
      var plazas: T = e.plazas === null || e.plazas === undefined ? null : (Number.isInteger(e.plazas) && e.plazas >= 1 ? e.plazas : undefined);
      var libres: T = e.plazas_libres === null || e.plazas_libres === undefined ? null : (Number.isInteger(e.plazas_libres) && e.plazas_libres >= 0 ? e.plazas_libres : undefined);
      if (plazas === undefined || libres === undefined) continue;
      var mia: T = null;
      if (e.mia) { if ((e.mia.estado !== "apuntado" && e.mia.estado !== "en_espera") || personas(e.mia.personas) === null) continue; mia = { estado: e.mia.estado, personas: e.mia.personas }; }
      var tf: T = typeof e.termina_en === "string" ? Date.parse(e.termina_en) : NaN;
      vistos[e.id] = true;
      ev.push({ id: e.id, titulo: corta(e.titulo.trim(), 120), tipo: Object.prototype.hasOwnProperty.call(TIPOS, e.tipo) ? e.tipo : "evento",
        lugar: typeof e.lugar === "string" && e.lugar.trim() ? corta(e.lugar.trim(), 120) : null, haza: typeof e.haza === "string" ? corta(e.haza, 20) : null,
        descripcion: typeof e.descripcion === "string" && e.descripcion.trim() ? corta(e.descripcion.trim(), 600) : null, presencial: e.presencial === true,
        empieza: t, termina: isFinite(tf) ? tf : null, entrada: entradaDe(e.entrada), plazas: plazas, libres: libres, abierta: e.inscripcion_abierta === true, mia: mia });
    }
    ev.sort(function (a?: T, b?: T) { return a.empieza - b.empieza || a.id - b.id; });
    return { puede: j.puede_inscribirse, eventos: ev };
  }
  // los que aún no han empezado (la lista puede haber envejecido desde que se pidió)
  function proximos(eventos?: T, ahora?: T) { return eventos.filter(function (e?: T) { return e.empieza > ahora; }); }
  // OF11e: entrar en la visita. Solo guiadas y directos. La ventana es la que da la api (`entrada`: la de ESTA sesión, igual que el token: familia apuntada 15 min
  // antes, guía y oficina 60, todos hasta 30 min después del fin); una api sin ese campo no deja ver el botón salvo a la familia apuntada, con la del contrato
  // (ABRE_FAMILIAS_MIN 15, CIERRA_MIN 30, sin fin 3 h). Nunca se adivina para quien no esté apuntado.
  var ABRE_FAMILIAS_MS: T = 15 * 60000, CIERRA_MS: T = 30 * 60000, SIN_FIN_MS: T = 3 * 3600000;
  function ventanaEntrada(e?: T) {
    if (!e || (e.tipo !== "guiada" && e.tipo !== "directo")) return null;
    if (e.entrada) return e.entrada;
    if (e.mia && e.mia.estado === "apuntado") return { desde: e.empieza - ABRE_FAMILIAS_MS, hasta: (e.termina !== null && e.termina !== undefined ? e.termina : e.empieza + SIN_FIN_MS) + CIERRA_MS };
    return null;
  }
  function puedeEntrar(e?: T, ahora?: T) { var w: T = ventanaEntrada(e); return !!w && ahora >= w.desde && ahora <= w.hasta; }
  // lo que se enseña: lo que no ha empezado y lo que está en curso con la sala aún abierta (la api lo sigue dando hasta que cierra)
  function visibles(eventos?: T, ahora?: T) { return eventos.filter(function (e?: T) { var w: T = ventanaEntrada(e); return e.empieza > ahora || (!!w && ahora <= w.hasta); }); }
  // «sáb 02/11, 18:30» en la hora del aparato
  function cuando(ms?: T) { var d: T = new Date(ms); return DIAS[d.getDay()] + " " + dos(d.getDate()) + "/" + dos(d.getMonth() + 1) + ", " + dos(d.getHours()) + ":" + dos(d.getMinutes()); }
  function textoTipo(e?: T) { return TIPOS[e.tipo] + (e.presencial ? " · presencial" : " · en el mundo"); }
  function textoPlazas(e?: T) {
    if (e.plazas === null) return "Sin aforo";
    if (e.libres === 0) return "Completo: se apunta a la lista de espera";
    return e.libres === 1 ? "Queda 1 plaza" : "Quedan " + e.libres + " plazas";
  }
  function textoMia(m?: T) {
    if (!m) return "";
    var p: T = m.personas + (m.personas === 1 ? " persona" : " personas");
    return m.estado === "apuntado" ? "Estáis apuntados (" + p + ")" : "En lista de espera (" + p + ")";
  }
  // qué se ofrece en una tarjeta (solo la titular con su enlace)
  function ofrece(e?: T, puede?: T) { return { apuntar: !!puede && e.abierta && !e.mia, borrar: !!puede && !!e.mia }; }
  // el texto de un fallo al apuntar o borrar: el de la api si lo trae (ya es una frase para la persona), si no uno por código
  function textoError(status?: T, cuerpo?: T) {
    var m: T = cuerpo && typeof cuerpo === "object" && typeof cuerpo.mensaje === "string" && cuerpo.mensaje.trim() ? corta(cuerpo.mensaje.trim(), 240) : null;
    if (m) return m;
    if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar con tu enlace.";
    if (status === 403) return "Solo la titular, con su enlace, puede apuntar a la familia.";
    if (status === 404) return "Ese evento ya no está.";
    if (status === 409) return "La inscripción de este evento está cerrada o ya estabais apuntados.";
    if (status === 429) return "Demasiados intentos seguidos. Espera un poco.";
    return "No se ha podido hacer. Prueba otra vez en un rato.";
  }
  // lo que se pinta en la lámina del panel VR: como mucho `max` próximos, con su fecha, título y plazas; nada de botones
  // OF11e: si hay una visita a la que se puede entrar ya, `entrar` (id y título) y una fila menos (el botón va debajo)
  function filasVR(datos?: T, ahora?: T, max?: T) {
    if (!datos) return null;
    var vis: T = visibles(datos.eventos, ahora), en: T = vis.filter(function (e?: T) { return puedeEntrar(e, ahora); })[0] || null;
    var l: T = vis.slice(0, en ? Math.min(max, 2) : max).map(function (e?: T) {
      return { t: cuando(e.empieza) + " · " + e.titulo, s: textoPlazas(e) + (e.mia ? " · " + textoMia(e.mia) : "") };
    });
    return { filas: l, vacia: !l.length, nota: TEXTO_VR, entrar: en ? { id: en.id, titulo: en.titulo } : null };
  }
  // OF11g: los avisos de eventos de ESTE hogar (GET /api/avisos) con lista blanca → { avisos: [{ id, evento_id, evento, titulo, texto, fecha (ms), leido }], sin_leer } o null
  var MAX_AVISOS = 50;
  function rutaAvisos(prefijo?: T) { return prefijo ? prefijo + "avisos" : null; }
  function rutaLeido(prefijo?: T, id?: T) { return prefijo && Number.isInteger(id) && id >= 1 ? prefijo + "avisos/" + id + "/leido" : null; }
  function validaAvisos(j?: T) {
    if (!j || typeof j !== "object" || !Array.isArray(j.avisos)) return null;
    var av: T = [], vistos: T = {};
    for (var i = 0; i < j.avisos.length && av.length < MAX_AVISOS; i++) {
      var a: T = j.avisos[i]; if (!a || typeof a !== "object") continue;
      var t: T = typeof a.fecha === "string" ? Date.parse(a.fecha) : NaN;
      if (!Number.isInteger(a.id) || a.id < 1 || vistos[a.id] || !Number.isInteger(a.evento_id) || a.evento_id < 1 || typeof a.titulo !== "string" || !a.titulo.trim() || !isFinite(t) || typeof a.leido !== "boolean") continue;
      vistos[a.id] = true;
      av.push({ id: a.id, evento_id: a.evento_id, evento: typeof a.evento === "string" ? corta(a.evento.trim(), 120) : "", titulo: corta(a.titulo.trim(), 120),
        texto: typeof a.texto === "string" ? corta(a.texto.trim(), 600) : "", fecha: t, leido: a.leido });
    }
    av.sort(function (x?: T, y?: T) { return y.fecha - x.fecha || y.id - x.id; });
    return { avisos: av, sin_leer: av.filter(function (x?: T) { return !x.leido; }).length };
  }
  function avisosDe(avisos?: T, eventoId?: T) { return avisos ? avisos.filter(function (a?: T) { return a.evento_id === eventoId; }) : []; }
  // los que no cuelgan de ningún evento visible (p. ej. «se cancela…»: el evento cancelado ya no sale en la agenda): los más nuevos, como mucho `max`
  function avisosSueltos(avisos?: T, eventos?: T, max?: T) {
    var ids: T = {}; eventos.forEach(function (e?: T) { ids[e.id] = true; });
    return (avisos || []).filter(function (a?: T) { return !ids[a.evento_id]; }).slice(0, max);
  }
  function textoSinLeer(n?: T) { return n === 1 ? "1 aviso sin leer" : n + " avisos sin leer"; }
  // la fila del panel VR: solo si hay algo sin leer; el último es el más nuevo de los no leídos
  function filaAvisosVR(av?: T) {
    if (!av || !av.sin_leer) return null;
    var u: T = av.avisos.filter(function (a?: T) { return !a.leido; })[0];
    return { n: av.sin_leer, cuenta: textoSinLeer(av.sin_leer), ultimo: u ? u.titulo : "", evento: u ? u.evento : "", nota: "Léelos en la ventana Agenda" };
  }
  return { MAX_PERSONAS: MAX_PERSONAS, rutaAvisos: rutaAvisos, rutaLeido: rutaLeido, validaAvisos: validaAvisos, avisosDe: avisosDe, avisosSueltos: avisosSueltos, textoSinLeer: textoSinLeer, filaAvisosVR: filaAvisosVR, TEXTO_VR: TEXTO_VR, rutaAgenda: rutaAgenda, rutaInscripcion: rutaInscripcion, personas: personas, valida: valida, proximos: proximos, cuando: cuando,
    ventanaEntrada: ventanaEntrada, puedeEntrar: puedeEntrar, visibles: visibles, TEXTO_NO_ENTRA: TEXTO_NO_ENTRA, textoTipo: textoTipo, textoPlazas: textoPlazas, textoMia: textoMia, ofrece: ofrece, textoError: textoError, filasVR: filasVR };
})();
// [puro:fin]

export function AgendaMotor(dp: DepsAgenda, n: T) {
  var AP: T = AgendaPuro, prefijo: T = dp.ConfigPuro.prefijoApi(location.search, dp.D && dp.D.base);
  if (!prefijo || typeof fetch !== "function") return null;   // sin servidor no hay agenda: ni icono ni ventana
  var ctl: T = new AbortController(), vivo = true;   // A3-7b2: libera() cancela lo que esté en vuelo y corta lo que llegue tarde
  var datos: T = null, avisos: T = null, estado = "sin-pedir", cuerpo: T = null, nota = "", pidiendo: T = null, hechas = 0, enVuelo = false, entrando = false, dentro: T = null, elegidas: T = {}, pintado = "";   // elegidas: las personas escogidas por evento (sobreviven a un repintado); pintado: la firma de lo que depende del reloj

  function el(tag?: T, css?: T, txt?: T) { var x: T = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
  var BOTON = "min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;border:1px solid currentColor;background:rgba(255,255,255,0.12);color:inherit;font:600 .9375rem system-ui,sans-serif;cursor:pointer";
  function parse(r?: T) { return r.json().then(function (j?: T) { return j; }, function () { return null; }); }

  // pide la agenda (si ya hay una petición en vuelo, reusa esa); sin sesión, sin red o con una respuesta rara, estado «error»/«sin-sesion» y no se rompe nada
  function carga() {
    if (pidiendo) return pidiendo;
    if (!vivo) return Promise.resolve();   // A3-7b2: liberada, ya no se pide nada
    estado = datos ? estado : "cargando"; pinta();
    pidiendo = fetch(AP.rutaAgenda(prefijo), { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" }, signal: ctl.signal })
      .then(function (r?: T) { return r.status === 200 ? parse(r) : (estado = r.status === 401 ? "sin-sesion" : "error", null); })
      .then(function (j?: T) {
        if (!vivo) return;
        if (j === null) { if (estado === "cargando") estado = "error"; return; }
        var d: T = AP.valida(j); if (!d) { estado = "error"; return; }
        datos = d; estado = "ok"; hechas++; n.emite("agenda:cambia", { proximos: AP.proximos(d.eventos, Date.now()).length, puede_inscribirse: d.puede });
        return cargaAvisos();
      }).catch(function () { estado = datos ? "ok" : "error"; })
      .then(function () { pidiendo = null; if (!vivo) return; pinta(); if (typeof dp.PanelVR !== "undefined") dp.PanelVR.repinta(); });
    return pidiendo;
  }

  // OF11g: los avisos de los eventos de ESTA familia, después de la agenda; si falla o la respuesta es rara, no hay avisos y la agenda sigue entera
  function cargaAvisos() {
    var url: T = AP.rutaAvisos(prefijo); if (!url) return Promise.resolve();
    return fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" }, signal: ctl.signal })
      .then(function (r?: T) { return r.status === 200 ? parse(r) : null; })
      .then(function (j?: T) { avisos = j ? AP.validaAvisos(j) : null; }, function () {});
  }
  // marcar un aviso como leído (solo el de esta familia: la api lo comprueba); al volver 204 se apaga la marca y se repinta
  function leido(a?: T) {
    var url: T = AP.rutaLeido(prefijo, a.id); if (!url || a.leido || !avisos) return Promise.resolve(false);
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: "{}", signal: ctl.signal })
      .then(function (r?: T) {
        if (r.status !== 204) { nota = "No se ha podido marcar el aviso. Prueba otra vez en un rato."; return false; }
        a.leido = true; avisos.sin_leer = avisos.avisos.filter(function (x?: T) { return !x.leido; }).length; return true;
      }).catch(function () { nota = "No se ha podido marcar el aviso. Prueba otra vez en un rato."; return false; })
      .then(function (ok?: T) { if (!vivo) return ok; pinta(); if (typeof dp.PanelVR !== "undefined") dp.PanelVR.repinta(); return ok; });
  }
  // un aviso en la ficha: punto de «sin leer», título, texto y su fecha, todo como texto; «Marcar como leído» solo si no lo está
  function bloqueAviso(a?: T, conEvento?: T) {
    var d: T = el("div", "margin:6px 0 0;padding:6px 8px;border-radius:8px;background:rgba(255,233,168,0.10)");
    d.setAttribute("data-aviso", String(a.id));
    var c: T = el("p", "margin:0;font-size:.9375rem;font-weight:700");
    if (!a.leido) { var pt: T = el("span", "color:#ffe9a8", "● "); pt.setAttribute("data-sin-leer", ""); pt.setAttribute("aria-label", "sin leer"); c.appendChild(pt); }
    c.appendChild(el("span", null, a.titulo)); d.appendChild(c);
    d.appendChild(el("p", "margin:2px 0 0;font-size:.8125rem;opacity:.75", AP.cuando(a.fecha) + (conEvento && a.evento ? " · " + a.evento : "")));
    if (a.texto) d.appendChild(el("p", "margin:2px 0 0;font-size:.875rem;line-height:1.35;opacity:.9", a.texto));
    if (!a.leido) { var b: T = el("button", BOTON + ";margin-top:6px", "Marcar como leído"); b.type = "button"; b.setAttribute("data-leido", String(a.id)); b.addEventListener("click", function () { leido(a); }); d.appendChild(b); }
    return d;
  }

  // apuntarse (personas) o borrarse (null): una sola petición a la vez; al acabar, recarga la lista (la verdad es la del servidor)
  function manda(e?: T, personas?: T) {
    var url: T = AP.rutaInscripcion(prefijo, e.id); if (!url || enVuelo) return Promise.resolve(false);
    enVuelo = true; nota = personas === null ? "Borrando…" : "Apuntando…"; pinta();
    var op: T = personas === null ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ personas: personas }) };
    return fetch(url, { method: op.method, credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: op.body, signal: ctl.signal })
      .then(function (r?: T) {
        if (r.status === 201 || r.status === 204) return parse(r).then(function (j?: T) {
          nota = personas === null ? "Os habéis borrado de «" + e.titulo + "»." : (j && j.estado === "en_espera" ? "Quedáis en la lista de espera de «" + e.titulo + "»." : "¡Apuntados a «" + e.titulo + "»!"); return true;
        });
        return parse(r).then(function (j?: T) { nota = AP.textoError(r.status, j); return false; });
      }).catch(function () { nota = AP.textoError(0, null); return false; })
      .then(function (ok?: T) { enVuelo = false; return carga().then(function () { return ok; }); });
  }

  // OF11e: entrar en la visita guiada, por el Bus y sin nombrar a nadie (la agenda no depende de la presencia): la agenda emite guiada:entrar {evento}; la presencia de
  // verdad (?presencia=red, F3f) escucha, viaja a la sala guiada (la voz se engancha sola) y contesta con guiada:entrada {evento, ok, mensaje}, donde mensaje es la frase
  // de la api si no dejó entrar (403 guiada_solo_inscritos, 409 guiada_cerrada…). Sin nadie que escuche guiada:entrar no hay botón.
  function viaje() { return dp.Bus.hay("guiada:entrar"); }
  function enLaVisita(id?: T) { return dentro === id; }
  var esperando: T = null;   // { id, titulo, fin }: la visita a la que se pidió entrar y el cierre de su espera (30 s); libera() la resuelve con «no se pudo»
  function entra(e?: T) {
    if (!viaje() || entrando) return Promise.resolve(false);
    entrando = true; nota = "Entrando en la visita…"; pinta();
    return new Promise(function (fin?: T) {
      var t: T = setTimeout(function () { esperando = null; fin(null); }, 30000);
      esperando = { id: e.id, titulo: e.titulo, fin: function (r?: T) { clearTimeout(t); esperando = null; fin(r); } };
      n.emite("guiada:entrar", { evento: e.id });
    }).then(function (r?: T) {
      if (r === null) { nota = AP.TEXTO_NO_ENTRA; return false; }
      dentro = r.ok ? e.id : null;
      nota = r.ok ? "Estáis en la visita guiada «" + e.titulo + "»." : r.mensaje || AP.TEXTO_NO_ENTRA;
      return !!r.ok;
    }).then(function (ok?: T) { entrando = false; if (!vivo) return ok; pinta(); if (typeof dp.PanelVR !== "undefined") dp.PanelVR.repinta(); return ok; });
  }
  n.on("guiada:entrada", function (d?: T) { if (esperando && d && d.evento === esperando.id) esperando.fin({ ok: d.ok === true, mensaje: typeof d.mensaje === "string" ? corta(d.mensaje, 240) : "" }); });
  function corta(s?: T, max?: T) { var c: T = Array.from(String(s)); return c.length > max ? c.slice(0, max - 1).join("").trim() + "…" : String(s); }

  // --- la ventana «Agenda»
  function tarjeta(e?: T, puede?: T) {
    var t: T = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)"), o: T = AP.ofrece(e, puede);
    t.setAttribute("data-evento", String(e.id));
    t.appendChild(el("h3", "margin:0 0 2px;font-size:1.0625rem", e.titulo));
    t.appendChild(el("p", "margin:0;font-size:.9375rem;opacity:.9", AP.cuando(e.empieza) + " · " + AP.textoTipo(e)));
    if (e.lugar || e.haza) t.appendChild(el("p", "margin:2px 0 0;font-size:.875rem;opacity:.8", (e.lugar || "") + (e.lugar && e.haza ? " · " : "") + (e.haza ? "haza " + e.haza : "")));
    if (e.descripcion) t.appendChild(el("p", "margin:4px 0 0;font-size:.875rem;line-height:1.35;opacity:.85", e.descripcion));
    var pl: T = el("p", "margin:4px 0 0;font-size:.9375rem;font-weight:600", AP.textoPlazas(e) + (e.abierta ? "" : " · inscripción cerrada")); pl.setAttribute("data-plazas", ""); t.appendChild(pl);
    if (e.mia) { var m: T = el("p", "margin:2px 0 0;font-size:.9375rem;font-weight:700;color:#ffe9a8", AP.textoMia(e.mia)); m.setAttribute("data-mia", ""); t.appendChild(m); }
    var misAvisos: T = AP.avisosDe(avisos && avisos.avisos, e.id);
    if (misAvisos.length) {
      var cab: T = el("p", "margin:8px 0 0;font-size:.875rem;font-weight:700", "Avisos de la oficina"); cab.setAttribute("data-avisos", String(e.id)); t.appendChild(cab);
      misAvisos.forEach(function (a?: T) { t.appendChild(bloqueAviso(a, false)); });
    }
    if (o.apuntar) {
      var fila: T = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px");
      var etq: T = el("label", "font-size:.9375rem", "Personas"), sel: T = el("select", "min-height:44px;font:inherit;padding:0 8px;border-radius:8px"), b: T = el("button", BOTON, e.libres === 0 ? "Ponernos en la lista de espera" : "Apuntarnos");
      sel.id = "agenda-personas-" + e.id; etq.htmlFor = sel.id;
      for (var i = 1; i <= AP.MAX_PERSONAS; i++) { var op: T = el("option", null, String(i)); op.value = String(i); sel.appendChild(op); }
      sel.value = elegidas[e.id] || "2"; sel.addEventListener("change", function () { elegidas[e.id] = sel.value; }); b.type = "button"; b.setAttribute("data-apunta", String(e.id));
      b.addEventListener("click", function () { var p: T = AP.personas(sel.value); if (p === null) { nota = "Elige entre 1 y 10 personas."; pinta(); return; } manda(e, p); });
      fila.appendChild(etq); fila.appendChild(sel); fila.appendChild(b); t.appendChild(fila);
    }
    if (AP.puedeEntrar(e, Date.now())) {
      if (enLaVisita(e.id)) { var ya: T = el("p", "margin:8px 0 0;font-size:.9375rem;font-weight:700;color:#ffe9a8", "Estáis en la visita"); ya.setAttribute("data-en-visita", ""); t.appendChild(ya); }
      else if (viaje()) {
        var be: T = el("button", BOTON + ";margin-top:8px", "Entrar en la visita"); be.type = "button"; be.setAttribute("data-entra", String(e.id)); if (entrando) be.disabled = true;
        be.addEventListener("click", function () { entra(e); }); t.appendChild(be);
      }
    }
    if (o.borrar) {
      var bb: T = el("button", BOTON + ";margin-top:8px", "Borrarnos"); bb.type = "button"; bb.setAttribute("data-borra", String(e.id));
      bb.addEventListener("click", function () { manda(e, null); }); t.appendChild(bb);
    }
    return t;
  }
  // lo que cambia solo con el reloj: qué eventos se ven y a cuáles se puede entrar ya
  function firmaReloj() { var t: T = Date.now(); return datos ? AP.visibles(datos.eventos, t).map(function (e?: T) { return e.id + (AP.puedeEntrar(e, t) ? "+" : ""); }).join(",") : ""; }
  function pinta() {
    if (!cuerpo) return;
    cuerpo.textContent = ""; pintado = firmaReloj();
    if (estado === "sin-sesion") { cuerpo.appendChild(el("p", "margin:8px 0", "Entra con tu enlace para ver la agenda.")); return; }
    if (!datos) { cuerpo.appendChild(el("p", "margin:8px 0", estado === "error" ? "No se ha podido cargar la agenda. Vuelve a abrirla en un rato." : "Cargando la agenda…")); return; }
    var l: T = AP.visibles(datos.eventos, Date.now());
    if (!l.length) cuerpo.appendChild(el("p", "margin:8px 0", "No hay eventos próximos."));
    else l.forEach(function (e?: T) { cuerpo.appendChild(tarjeta(e, datos.puede)); });
    var sueltos: T = AP.avisosSueltos(avisos && avisos.avisos, l, 5);
    if (sueltos.length) {   // avisos de eventos que ya no están en la lista (p. ej. uno cancelado)
      var cs: T = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)"); cs.setAttribute("data-avisos-otros", "");
      cs.appendChild(el("h3", "margin:0 0 2px;font-size:1.0625rem", "Otros avisos")); sueltos.forEach(function (a?: T) { cs.appendChild(bloqueAviso(a, true)); }); cuerpo.appendChild(cs);
    }
    if (nota) { var a: T = el("p", "margin:10px 0 0;font-size:.9375rem;font-weight:600", nota); a.setAttribute("role", "status"); a.setAttribute("aria-live", "polite"); a.setAttribute("data-nota", ""); cuerpo.appendChild(a); }
    if (!datos.puede) cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:.875rem;opacity:.8", AP.TEXTO_VR + ": solo la titular, con su enlace, apunta a la familia."));
    else cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:.875rem;opacity:.75", "Podéis cambiar el número de personas borrándoos y volviendo a apuntaros. Si no cabéis, quedáis en la lista de espera."));
  }

  // --- la fila «Agenda» del panel VR (pestaña Info): los próximos y dónde apuntarse; nada que pulsar
  function vistaVR() { return datos ? AP.filasVR(datos, Date.now(), 3) : null; }
  if (typeof dp.PanelVR !== "undefined") {
    n.limpia(dp.PanelVR.filas("info", { id: "agenda", orden: 70, alto: 290, visible: function () { return !!datos; },
      botones: function (b?: T, y?: T) {   // OF11e: «Entrar en la visita» solo si hay una a la que se puede entrar ya y hay por dónde (presencia o voz)
        var v: T = vistaVR(); if (!v || !v.entrar || !viaje()) return;
        var e: T = datos.eventos.filter(function (x?: T) { return x.id === v.entrar.id; })[0];
        if (e) b("ag_entra", 40, y + 170, 360, 64, "Entrar en la visita", function () { entra(e); });
      },
      pinta: function (cx?: T, y?: T, W?: T, h?: T) {
        var v: T = vistaVR(); h.fila("Agenda", y); if (!v) return;
        cx.textAlign = "left"; cx.textBaseline = "alphabetic";
        function ajusta(txt?: T, ancho?: T) { var s: T = txt; while (cx.measureText(s).width > ancho && s.length > 6) s = s.slice(0, -2); return s === txt ? s : s.trim() + "…"; }
        var yy: T = y + 26;
        if (v.vacia) { cx.fillStyle = "#e8eee4"; cx.font = "600 24px system-ui, sans-serif"; cx.fillText("No hay eventos próximos", 420, yy); yy += 40; }
        v.filas.forEach(function (f?: T) {
          cx.fillStyle = "#ffffff"; cx.font = "700 24px system-ui, sans-serif"; cx.fillText(ajusta(f.t, 590), 420, yy);
          cx.fillStyle = "#cfdccb"; cx.font = "600 21px system-ui, sans-serif"; cx.fillText(ajusta(f.s, 590), 420, yy + 28); yy += 62;
        });
        if (v.entrar) { cx.fillStyle = "#ffffff"; cx.font = "600 21px system-ui, sans-serif"; cx.fillText(ajusta("Abierta: " + v.entrar.titulo, 560), 420, y + 210); }
        cx.fillStyle = "#ffe9a8"; cx.font = "700 24px system-ui, sans-serif"; cx.fillText(v.nota, 40, y + 270);
      },
      firma: function () { var v: T = vistaVR(); return v ? v.filas.map(function (f?: T) { return f.t + "|" + f.s; }).join("/") + "|" + v.vacia + "|" + (v.entrar ? v.entrar.id : "") + (entrando ? "!" : "") : ""; },
      debug: function () { return { agenda: vistaVR() }; } }));
    // OF11g: cuántos avisos sin leer hay y el último; sin nada sin leer, la fila no sale. Leerlos, en la ventana (el panel no tiene teclado ni lista cómoda)
    n.limpia(dp.PanelVR.filas("info", { id: "agenda_avisos", orden: 71, alto: 130, visible: function () { return !!AP.filaAvisosVR(avisos); },
      pinta: function (cx?: T, y?: T, W?: T, h?: T) {
        var v: T = AP.filaAvisosVR(avisos); h.fila("Avisos", y); if (!v) return;
        cx.textAlign = "left"; cx.textBaseline = "alphabetic";
        function ajusta(txt?: T, ancho?: T) { var s: T = txt; while (cx.measureText(s).width > ancho && s.length > 6) s = s.slice(0, -2); return s === txt ? s : s.trim() + "…"; }
        cx.fillStyle = "#ffe9a8"; cx.font = "700 26px system-ui, sans-serif"; cx.fillText("● " + v.cuenta, 420, y + 26);
        cx.fillStyle = "#ffffff"; cx.font = "700 24px system-ui, sans-serif"; cx.fillText(ajusta("Último: " + v.ultimo, 590), 420, y + 62);
        cx.fillStyle = "#cfdccb"; cx.font = "600 21px system-ui, sans-serif"; cx.fillText(ajusta((v.evento ? v.evento + " · " : "") + v.nota, 590), 420, y + 92);
      },
      firma: function () { var v: T = AP.filaAvisosVR(avisos); return v ? v.n + "|" + v.ultimo + "|" + v.evento : ""; },
      debug: function () { return { avisos: AP.filaAvisosVR(avisos) }; } }));
    n.on("vr:entra", function () { carga(); });   // al ponerse las gafas se refresca (no hay otro momento: el panel no tiene botón de recargar)
  }
  n.limpia(dp.Ventanas.registra("agenda", { titulo: "Agenda", construye: function (cu?: T) { cuerpo = cu; pinta(); } }));
  if (cuerpo && (window as T).MutationObserver && cuerpo.parentNode) {   // al abrir la ventana se pide la agenda
    var mo: T = new MutationObserver(function () { if (!cuerpo.parentNode.hidden) carga(); });
    mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); n.limpia(function () { mo.disconnect(); });
  }
  // OF11e: el botón aparece y desaparece con el reloj aunque nadie toque nada: cada 20 s se repinta lo que hay (sin pedir nada a la api), y SOLO si cambió: repintar a ciegas
  // cerraba el desplegable y quitaba el foco a quien estaba eligiendo las personas
  var reloj: T = typeof setInterval === "function" ? setInterval(function () { if (cuerpo && datos && cuerpo.parentNode && !cuerpo.parentNode.hidden && firmaReloj() !== pintado) pinta(); if (typeof dp.PanelVR !== "undefined") dp.PanelVR.repinta(); }, 20000) : null;
  if (reloj && reloj.unref) reloj.unref();
  n.limpia(function () { if (reloj) clearInterval(reloj); });
  n.limpia(dp.Hud.icono({ id: "agenda", ico: "📅", txt: "Agenda", prio: 2, ventana: "agenda" }));
  n.limpia(function () { cuerpo = null; });
  (window as T).__agenda = function () {
    return { estado: estado, datos: datos, prefijo: prefijo, hechas: hechas, nota: nota, vr: vistaVR(), avisos: avisos, vrAvisos: AP.filaAvisosVR(avisos), carga: carga, leido: function (id?: T) { var a: T = avisos && avisos.avisos.filter(function (x?: T) { return x.id === id; })[0]; return a ? leido(a) : Promise.resolve(false); }, entra: function (id?: T) { var e: T = datos && datos.eventos.filter(function (x?: T) { return x.id === id; })[0]; return e ? entra(e) : Promise.resolve(false); }, manda: function (id?: T, p?: T) { var e: T = datos && datos.eventos.filter(function (x?: T) { return x.id === id; })[0]; return e ? manda(e, p) : Promise.resolve(false); } };
  };
  n.limpia(function () { try { delete (window as T).__agenda; } catch (e: T) { (window as T).__agenda = undefined; } });
  // A3-7b2: lo que el núcleo no soltaba solo: las peticiones en vuelo y la espera de «Entrar en la visita» (su temporizador de 30 s). El resto (icono, ventana, filas de VR,
  // escucha, observador, reloj y __agenda) lo suelta n.limpia al liberar el componente.
  function libera() { vivo = false; ctl.abort(); if (esperando) esperando.fin(null); }
  return { carga: carga, manda: manda, entra: entra, leido: leido, datos: function () { return datos; }, avisos: function () { return avisos; }, libera: libera };
}

export type Agenda = ReturnType<typeof AgendaMotor>;

// el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?agenda=0 lo apaga; ?agenda=1 lo enciende.
export function manifiestoAgenda(dp: DepsAgenda): Manifiesto {
  return {
    id: ID_AGENDA, version: 1,
    consume: ["Hud", "Ventanas", "PanelVR"],
    expone: [],
    eventos: { escucha: ["vr:entra", "guiada:entrada"], emite: ["agenda:cambia", "guiada:entrar"] },
    bandera: { defecto: true, url: "agenda" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // DOM y una fila de texto en el panel VR (su lienzo ya existe): nada en la escena 3D
    fases: {},
    mundos: "todos",
    monta: function (n) { return AgendaMotor(dp, n as T); },
    libera: function (api: T) { if (api && api.libera) api.libera(); }   // sin servidor monta() devuelve null (el núcleo guarda {}): nada que soltar
  };
}
