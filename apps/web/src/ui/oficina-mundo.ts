// El mundo en modo oficina (OF10; doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114; MU5-n, A3-7b2: antes apps/web/motor/39_oficina_mundo.js, que queda como talón): lo que
// la oficina hace en el mundo y lo que ven los demás. A3-8b lo parte en dos componentes por su frontera (COMPONENTES §6, «A3-8b»):
//  · este, «oficina-mundo», de TODO mundo (mundos: "todos"): los anuncios, las invitaciones a otra sala y el panel de la oficina. Una invitación o un anuncio tienen que llegar
//    aunque estés en un interior. Vive en ui/ porque solo dibuja DOM y láminas (nada con three); la red y la presencia le llegan por n.api;
//  · «oficina-balizas» (apps/web/src/mundos/exterior/oficina-balizas.ts), del exterior: las balizas oficiales, columnas en su escena sobre su suelo, una capa de su minimapa y un
//    tipo de sus Entidades. Consume «OficinaMundo» (lo que expone este: pedir a la api con su propia cancelación, avisar en el panel y lo puro), así que ?oficina=0 apaga los dos.
// Mismo comportamiento y misma api que antes de partirlo: window.__oficinaMundo da el estado de los dos (las balizas, si el exterior las tiene) y acepta «refresca», «acepta» y
// «libera»; el panel sigue ofreciendo «Poner aquí» (la baliza la arma y la refresca el componente del exterior), solo mientras el exterior es el mundo activo.
// ---------- el mundo en modo oficina (OF10; doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo y lo que ven los demás.
// Es un COMPONENTE (ADR-0023, bandera ?oficina=0 la apaga): se registra y nadie lo nombra. Consume la red (la sala «visita» de 37_red.js) y la presencia
// (38_presencia_compartida.js: quién eres en la sala, en qué sala estás, cambiar de sala, el chat). Cómo se VE la oficina (chaleco, insignia, «◆ Oficina»)
// no es de aquí: lo dibuja la presencia con Aspecto (26_presencia.js), porque es parte del muñeco. Aquí:
//  · ANUNCIOS (tema «anuncio»): un aviso de texto arriba, unos segundos, que no recibe toques ni tapa los controles (sale bajo la barra y se cierra solo);
//    en VR, una lámina delante (Laminas, anclada al mundo, nunca pegada a la cara) que se cierra sola o con el gatillo; y queda en el chat como «Oficina».
//  · INVITACIÓN A OTRA SALA (tema «sala»): «La oficina os invita a la Sala de la visita» con «Ir» y «Quedarme». Nadie cambia de sala sin pulsar: cambiar
//    de sala no te mueve de sitio, cambia con quién estás (y la presencia pide su token de la otra sala). En VR, la misma pregunta en una lámina.
//  · BALIZAS OFICIALES (tema «balizas»): el aviso de la api se valida aquí, con los otros dos temas, y se le pasa al componente de las balizas (oficina-balizas.ts), que las pide.
//  · EL PANEL DE LA OFICINA (solo si tu rol en la sala es oficina o admin, en pantalla; decisión 116: la oficina, en ordenador): una ventana «Oficina» con
//    la sala en la que estás, anunciar, invitar a la otra sala y poner una baliza donde estás (esto último, solo en el exterior). Todo va por la api, que comprueba el
//    rol y lo apunta en la auditoría (src/presencia/oficina_mundo.ts): aquí solo se decide qué ofrecer.
// SEGURIDAD: LiveKit no deja restringir un tema por rol. Los tres temas los manda SOLO la api (RoomService.sendData) y llegan SIN participante: lo que
// llegue por ellos con participante (un navegador que los publique) se descarta. Lo que llega es dato: se valida y se pinta como texto, nunca como HTML.
// Sin servidor (sin D.base /teselas/… ni ?api=) no pide nada; sin ?presencia=red no hay sala, ni anuncios, ni panel.
// Código movido tal cual (se tipan parámetros y variables; lo del legado entra por dp y lo que otros reescriben (VRX) por getter).
// Su libera() suelta las escuchas de la sala, el panel, la invitación y el anuncio; A3-7b2 añadió que CANCELA las peticiones a la api en vuelo (AbortController: anunciar e
// invitar; las de las balizas, con la suya, oficina-balizas.ts) y, hallazgo propio, que el aviso del HUD tras mover o quitar una baliza sin el panel abierto (lo que pasa en VR)
// se pide a Hud.aviso: antes llamaba a Hud.avisaOficina, que no existe. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/oficina_mundo.test.js (el .ts,
// leído como JavaScript: sin tipos ni «dp.»).
import type { Manifiesto } from "../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = any;

export const ID_OFICINA_MUNDO = "oficina-mundo";

/** Lo que el talón de 39 le da: D (01), Componentes (02c), Laminas (02d), el visor (03), HazasPuro, la presencia (Chat), Hud y Ventanas; VRX (29_vr), que otros reescriben, por
 *  getter. El talón le da a los dos componentes de la oficina el mismo objeto (DepsOficina): las balizas toman de él lo suyo (oficina-balizas.ts, DepsOficinaBalizas) */
export interface DepsOficinaMundo {
  D: T; Componentes: T; Laminas: T; visor: T; HazasPuro: T; Chat: T; Hud: T; Ventanas: T; readonly VRX: T;
}

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/oficina_mundo.test.js)
export var OficinaMundoPuro: T = (function () {
  var TEMAS: T = ["anuncio", "sala", "balizas"], SALAS: T = { general: "Visita libre", visita: "Sala de la visita" }, RE_FINCA: T = /^[a-z0-9_-]{1,32}$/;
  var MAX_BYTES = 2048, ANUNCIO_MAX = 280, TITULO_MAX = 60, TEXTO_MAX = 280, BALIZAS_MAX = 20, HORAS: T = [1, 2, 4, 8, 24, 72, 168];
  var dec: T = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
  function corta(s?: T, max?: T) { var c: T = Array.from(s); return c.length > max ? c.slice(0, max).join("").trim() : s; }
  // un mensaje de la sala por uno de los temas de la oficina → { tema, texto } | { tema, a } | { tema, finca }, o null si no vale.
  // de = el participante que lo manda (37_red.js); la api los manda SIN participante: con uno, se descarta (no es de la api).
  function lee(tema?: T, bytes?: T, de?: T, limpia?: T) {
    if (de || TEMAS.indexOf(tema) < 0 || !bytes || typeof bytes.byteLength !== "number" || !bytes.byteLength || bytes.byteLength > MAX_BYTES || !dec) return null;
    var m: T; try { m = JSON.parse(dec.decode(bytes)); } catch (e: T) { return null; }
    if (!m || typeof m !== "object" || Array.isArray(m) || m.v !== 1) return null;
    if (tema === "anuncio") { var t: T = typeof m.texto === "string" ? limpia(m.texto) : null; return t ? { tema: tema, texto: corta(t, ANUNCIO_MAX) } : null; }
    if (tema === "sala") return typeof m.a === "string" && Object.prototype.hasOwnProperty.call(SALAS, m.a) ? { tema: tema, a: m.a } : null;
    return typeof m.finca === "string" && RE_FINCA.test(m.finca) ? { tema: tema, finca: m.finca } : null;
  }
  // la respuesta de GET /api/balizas-oficiales → [{ id, x (este, m locales), y (norte), titulo, texto, hasta (ms) }] (como mucho 20; lo que no cuadra, fuera)
  function leeBalizas(r?: T, centro?: T, finca?: T, limpia?: T) {
    if (!r || typeof r !== "object" || r.finca !== finca || r.srs !== "EPSG:25830" || !Array.isArray(r.balizas) || !centro) return [];
    var l: T = [], vistos: T = {};
    for (var i = 0; i < r.balizas.length && l.length < BALIZAS_MAX; i++) {
      var b: T = r.balizas[i]; if (!b || typeof b !== "object") continue;
      var id: T = b.id, x: T = b.x, y: T = b.y, t: T = typeof b.titulo === "string" ? limpia(b.titulo) : null, h: T = typeof b.hasta === "string" ? Date.parse(b.hasta) : NaN;
      if (typeof id !== "number" || id % 1 !== 0 || id < 1 || vistos[id] || !isFinite(x) || !isFinite(y) || !t || !isFinite(h)) continue;
      var tx: T = typeof b.texto === "string" ? limpia(b.texto) : null;
      vistos[id] = true;
      l.push({ id: id, x: x - centro[0], y: y - centro[1], titulo: corta(t, TITULO_MAX), texto: tx ? corta(tx, TEXTO_MAX) : null, hasta: h });
    }
    return l;
  }
  function aUtm(x?: T, y?: T, centro?: T) { return { x: Math.round((x + centro[0]) * 100) / 100, y: Math.round((y + centro[1]) * 100) / 100 }; }
  // «hasta las 18:30» (hoy) o «hasta el 02/11, 18:30», en la hora del aparato
  function hasta(ms?: T, ahora?: T) {
    var d: T = new Date(ms), a: T = new Date(ahora), hm: T = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    return d.toDateString() === a.toDateString() ? "hasta las " + hm : "hasta el " + ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + ", " + hm;
  }
  // cuánto se ve un anuncio: 6 s y 60 ms por carácter, como mucho 15 s (se lee sin prisa y no se queda)
  function dura(texto?: T) { return Math.min(15, 6 + Array.from(String(texto || "")).length * 0.06); }
  function otraSala(s?: T) { return s === "visita" ? "general" : "visita"; }
  // lo que el panel manda a la api (la api lo vuelve a comprobar todo): null si no vale
  function cuerpoAnuncio(texto?: T, sala?: T, limpia?: T) { var t: T = limpia(texto); return t && (sala === "todas" || SALAS[sala]) ? { texto: corta(t, ANUNCIO_MAX), sala: sala } : null; }
  function cuerpoBaliza(finca?: T, pos?: T, centro?: T, titulo?: T, texto?: T, horas?: T, limpia?: T) {
    var t: T = limpia(titulo), tx: T = texto ? limpia(texto) : null;
    if (!RE_FINCA.test(finca || "") || !t || !pos || !isFinite(pos.x) || !isFinite(pos.y) || HORAS.indexOf(horas) < 0) return null;
    var u: T = aUtm(pos.x, pos.y, centro), c: T = { finca: finca, x: u.x, y: u.y, titulo: corta(t, TITULO_MAX), horas: horas };
    if (tx) c.texto = corta(tx, TEXTO_MAX);
    return c;
  }
  return { TEMAS: TEMAS, SALAS: SALAS, HORAS: HORAS, ANUNCIO_MAX: ANUNCIO_MAX, TITULO_MAX: TITULO_MAX, TEXTO_MAX: TEXTO_MAX, BALIZAS_MAX: BALIZAS_MAX,
    lee: lee, leeBalizas: leeBalizas, aUtm: aUtm, hasta: hasta, dura: dura, otraSala: otraSala, cuerpoAnuncio: cuerpoAnuncio, cuerpoBaliza: cuerpoBaliza };
})();
// [puro:fin]

// [motor:inicio] (lo evalúa en Node pruebas/guardianes/oficina_mundo.test.js con DOM, la red y la presencia de mentira)
export function OficinaMundoMotor(dp: DepsOficinaMundo, n: T, R: T, P: T) {
  var OP: T = OficinaMundoPuro, API: T = dp.HazasPuro.prefijoApi(location.search, dp.D.base);
  var LAM_A = "oficina-anuncio", LAM_S = "oficina-sala";
  var S: T = R ? R.sala("visita") : null, st: T = { anuncios: 0, descartados: 0, invitaciones: 0 };
  var ctl: T = new AbortController();   // A3-7b2: libera() cancela lo que esté en vuelo
  var banner: T = null, tBanner = 0, anuncioVR: T = null, invitacion: T = null, dialogo: T = null, panelOf: T = null, vivo = true;
  function limpia(t?: T) { return dp.Chat.limpia(t); }
  function el(tag?: T, props?: T, hijos?: T) { var e: T = document.createElement(tag); if (props) Object.keys(props).forEach(function (k?: T) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h?: T) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
  function yo() { return P && P.yo ? P.yo() : null; }
  function soyOficina() { var y: T = yo(); return !!(y && y.oficial); }
  // A3-8b: las balizas oficiales son de otro componente, del exterior (oficina-balizas.ts); si no está montado (?oficina=0 lo apaga con este, o no hay exterior), no hay balizas
  function balizasApi() { var b: T = n.api("oficina-balizas"); return b && b.estado ? b : null; }
  // pedir a la api con una cancelación: la de este componente y, para las balizas, la suya (A3-8b: cada uno cancela lo suyo al liberarse)
  function pideCon(senal?: T) {
    return function (metodo?: T, ruta?: T, cuerpo?: T) {
      if (!API) return Promise.reject(new Error("sin servidor"));
      var o: T = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" }, signal: senal };
      if (cuerpo) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
      return fetch(API + ruta, o).then(function (r?: T) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (j?: T) { if (!r.ok) { var e: T = new Error(j && typeof j.mensaje === "string" ? j.mensaje : "La api respondió " + r.status + "."); e.status = r.status; throw e; } return j; });
      });
    };
  }
  var pide: T = pideCon(ctl.signal);

  // ---- lo que llega por la sala (solo de la api: sin participante)
  var quitaTemas: T = [];
  if (S) OP.TEMAS.forEach(function (t?: T) { quitaTemas.push(S.escucha(t, function (bytes?: T, de?: T) { recibe(t, bytes, de); })); });
  function recibe(tema?: T, bytes?: T, de?: T) {
    var m: T = OP.lee(tema, bytes, de, limpia); if (!m) { st.descartados++; return; }
    if (m.tema === "anuncio") muestraAnuncio(m.texto);
    else if (m.tema === "sala") invita(m.a);
    else { var b: T = balizasApi(); if (b) b.alAviso(m.finca); }   // A3-8b: las repide el componente de las balizas (si es de su finca)
  }

  // ---- el anuncio: arriba en pantalla (sin toques: no tapa nada que se pulse), en VR una lámina delante; y en el chat, como «Oficina»
  function muestraAnuncio(texto?: T) {
    st.anuncios++; tBanner = OP.dura(texto);
    if (P && P.mensaje) P.mensaje("Oficina", texto);
    n.emite("oficina:anuncio", { texto: texto });
    if (dp.VRX.on) { anuncioVR = texto; dp.Laminas.abre({ id: LAM_A, ancho: 1.1, alto: 0.36, w: 880, h: 288, pinta: pintaAnuncioVR, firma: function () { return anuncioVR; }, alTocar: function () { dp.Laminas.cierra(LAM_A); return true; } }); return; }
    if (!banner) {
      banner = el("div", { id: "oficinaAnuncio", role: "status", "aria-live": "polite", style: "position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:32;max-width:min(560px,calc(100% - 32px));padding:10px 14px;border-radius:12px;background:rgba(72,84,20,0.95);color:#fff;font:15px/1.4 system-ui,sans-serif;box-sizing:border-box;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.35)" });
      (dp.visor || document.body).appendChild(banner);
    }
    banner.textContent = "◆ Oficina: " + texto; banner.hidden = false;
  }
  function pintaAnuncioVR(cx?: T, w?: T, h?: T) {
    cx.fillStyle = "rgba(72,84,20,0.96)"; cx.fillRect(0, 0, w, h);
    cx.fillStyle = "#f4ecc2"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("◆ Oficina", 28, 22);
    cx.fillStyle = "#ffffff"; cx.font = "30px system-ui, sans-serif";
    lineas(cx, anuncioVR || "", w - 56).slice(0, 5).forEach(function (l?: T, i?: T) { cx.fillText(l, 28, 78 + i * 38); });
  }
  function lineas(cx?: T, t?: T, ancho?: T) {   // el texto partido en líneas que caben (por palabras)
    var out: T = [], linea = ""; String(t).split(" ").forEach(function (p?: T) { var x: T = linea ? linea + " " + p : p; if (cx.measureText(x).width > ancho && linea) { out.push(linea); linea = p; } else linea = x; });
    if (linea) out.push(linea); return out;
  }

  // ---- la invitación a otra sala: se pregunta; nadie cambia de sala sin pulsar
  function invita(a?: T) {
    if (!P || !P.sala || a === P.sala()) return;
    st.invitaciones++; invitacion = a; n.emite("oficina:sala", { a: a });
    var txt: T = "La oficina os invita a la " + OP.SALAS[a] + ". Cambiar de sala no te mueve de sitio: cambia con quién estás.";
    if (dp.VRX.on) {
      dp.Laminas.abre({ id: LAM_S, ancho: 1.1, alto: 0.5, w: 880, h: 400, firma: function () { return invitacion || ""; },
        pinta: function (cx?: T, w?: T, h?: T) {
          cx.fillStyle = "rgba(16,20,24,0.94)"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#fff"; cx.font = "30px system-ui, sans-serif"; cx.textBaseline = "top";
          lineas(cx, txt, w - 56).slice(0, 4).forEach(function (l?: T, i?: T) { cx.fillText(l, 28, 24 + i * 38); });
          cx.fillStyle = "rgba(64,240,255,0.3)"; cx.fillRect(28, h - 120, w / 2 - 42, 92); cx.fillStyle = "rgba(255,255,255,0.14)"; cx.fillRect(w / 2 + 14, h - 120, w / 2 - 42, 92);
          cx.fillStyle = "#fff"; cx.font = "600 34px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText("Ir", w / 4, h - 92); cx.fillText("Quedarme", w * 3 / 4, h - 92); cx.textAlign = "left";
        },
        alTocar: function (u?: T, v?: T) { if (v < 0.68) return false; if (u < 0.5) aceptaSala(); else rechazaSala(); return true; } });
      return;
    }
    if (!dialogo) {
      var bs = "font:inherit;color:inherit;border-radius:8px;padding:6px 14px;min-height:44px;min-width:44px;cursor:pointer;margin-right:8px;";
      var p: T = el("p", { id: "oficinaSalaTxt", style: "margin:0 0 8px" }), ir: T = el("button", { type: "button", style: bs + "background:rgba(64,240,255,0.22);border:1px solid rgba(64,240,255,0.7)" }, ["Ir"]);
      var no: T = el("button", { type: "button", style: bs + "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.35)" }, ["Quedarme"]);
      var raiz: T = el("div", { id: "oficinaInvitacion", role: "dialog", "aria-label": "Invitación de la oficina", "aria-describedby": "oficinaSalaTxt", style: "position:absolute;left:50%;top:120px;transform:translateX(-50%);z-index:33;max-width:min(380px,calc(100% - 32px));padding:12px;border-radius:12px;background:rgba(16,20,24,0.94);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box" }, [p, ir, no]);
      ir.addEventListener("click", aceptaSala); no.addEventListener("click", rechazaSala);
      raiz.addEventListener("keydown", function (e?: T) { e.stopPropagation(); if (e.key === "Escape") { rechazaSala(); e.preventDefault(); } });   // las teclas no mueven al paseante
      (dp.visor || document.body).appendChild(raiz);
      dialogo = { raiz: raiz, txt: p, ir: ir, foco: null };
    }
    dialogo.txt.textContent = txt; dialogo.foco = document.activeElement; dialogo.raiz.hidden = false;
    try { dialogo.ir.focus({ preventScroll: true }); } catch (e: T) {}
  }
  function cierraInvitacion() {
    invitacion = null; if (dp.Laminas.hay(LAM_S)) dp.Laminas.cierra(LAM_S);
    if (dialogo && !dialogo.raiz.hidden) { dialogo.raiz.hidden = true; try { if (dialogo.foco && dialogo.foco.focus) dialogo.foco.focus({ preventScroll: true }); } catch (e: T) {} }
  }
  function aceptaSala() { var a: T = invitacion; cierraInvitacion(); if (a && P && P.cambiaSala) return P.cambiaSala(a).then(function (ok?: T) { pintaPanel(); return ok; }); return Promise.resolve(false); }
  function rechazaSala() { cierraInvitacion(); }

  // ---- el aviso tras mover o quitar una baliza (lo pide el componente de las balizas): en el panel si está abierto; si no (en VR), en el HUD
  function avisaOficina(t?: T) { if (panelOf) panelOf.estado.textContent = t; else if (typeof dp.Hud !== "undefined" && dp.Hud.aviso) dp.Hud.aviso(t); }   // A3-7b2: antes llamaba a Hud.avisaOficina, que no existe: sin el panel abierto (en VR) saltaba un TypeError tras mover o quitar la baliza
  // el panel: una ventana «Oficina» con su icono en la barra, solo mientras tu rol en la sala es de oficina (y en pantalla: en VR no hay teclado)
  function montaPanel() {
    if (panelOf) return;
    var cu: T = null, quitaV: T = dp.Ventanas.registra("oficina", { titulo: "Oficina en el mundo", construye: function (c?: T) { cu = c; } });
    if (!quitaV || !cu) return;
    var css = "font:inherit;color:inherit;border-radius:8px;padding:6px 12px;min-height:44px;cursor:pointer;background:rgba(163,178,54,0.2);border:1px solid rgba(163,178,54,0.75)";
    var campo = "font:inherit;width:100%;box-sizing:border-box;min-height:44px;padding:6px 8px;border-radius:8px;margin:4px 0";
    var salaTxt: T = el("p", { style: "margin:0 0 6px" }), irOtra: T = el("button", { type: "button", style: css }), invitar: T = el("button", { type: "button", style: css + ";margin-left:8px" });
    var aTxt: T = el("textarea", { name: "of-anuncio-texto", maxLength: OP.ANUNCIO_MAX, rows: 3, style: campo, "aria-label": "Texto del anuncio (hasta " + OP.ANUNCIO_MAX + " caracteres)" }), aCuenta: T = el("span", { style: "opacity:0.7;font-size:12px" }, ["0 / " + OP.ANUNCIO_MAX]);
    var aSala: T = el("select", { name: "of-anuncio-sala", style: campo, "aria-label": "A quién se anuncia" }, [el("option", { value: "todas" }, ["A las dos salas"]), el("option", { value: "general" }, ["A la Visita libre"]), el("option", { value: "visita" }, ["A la Sala de la visita"])]);
    var aBtn: T = el("button", { type: "button", style: css }, ["Anunciar"]);
    var bTit: T = el("input", { type: "text", name: "of-baliza-titulo", maxLength: OP.TITULO_MAX, style: campo, "aria-label": "Título de la baliza (hasta " + OP.TITULO_MAX + ")", placeholder: "Aquí se recoge hoy" });
    var bTxt: T = el("textarea", { name: "of-baliza-texto", maxLength: OP.TEXTO_MAX, rows: 2, style: campo, "aria-label": "Texto de la baliza (opcional)" });
    var bHoras: T = el("select", { name: "of-baliza-horas", style: campo, "aria-label": "Cuánto dura la baliza" }, OP.HORAS.map(function (h?: T) { return el("option", { value: String(h) }, [h < 24 ? h + " h" : h / 24 + (h === 24 ? " día" : " días")]); }));
    bHoras.value = "8";
    var bBtn: T = el("button", { type: "button", style: css }, ["Poner aquí"]), estado: T = el("p", { role: "status", "aria-live": "polite", style: "margin:8px 0 0;min-height:1.4em" });
    var h3 = function (t?: T) { return el("h3", { style: "margin:12px 0 4px;font-size:14px" }, [t]); };
    // A3-8b: la parte de la baliza, en un bloque que se esconde mientras el exterior no es el mundo activo (una baliza se pone donde estás en la finca)
    var hBal: T = h3("Baliza oficial donde estás"), bloqueBal: T = el("div", {}, [hBal, bTit, bTxt, bHoras, bBtn]);
    [h3("Sala"), salaTxt, irOtra, invitar, h3("Anunciar"), aTxt, aCuenta, aSala, aBtn, bloqueBal, estado,
      el("p", { style: "margin:8px 0 0;opacity:0.7;font-size:12px" }, ["Te ven con chaleco e insignia. Todo lo que haces aquí queda en la auditoría."])].forEach(function (x?: T) { cu.appendChild(x); });
    aTxt.addEventListener("input", function () { aCuenta.textContent = Array.from(aTxt.value).length + " / " + OP.ANUNCIO_MAX; });
    irOtra.addEventListener("click", function () { var a: T = OP.otraSala(P.sala()); estado.textContent = "Cambiando de sala…"; P.cambiaSala(a).then(function (ok?: T) { estado.textContent = ok ? "Estás en la " + OP.SALAS[a] + "." : "No se pudo cambiar de sala."; pintaPanel(); }); });
    invitar.addEventListener("click", function () {
      var de: T = P.sala(), a: T = OP.otraSala(de);
      pide("POST", "admin/presencia/llevar", { de: de, a: a }).then(function (j?: T) { estado.textContent = j && j.enviado ? "Invitación enviada a la " + OP.SALAS[de] + "." : "En la " + OP.SALAS[de] + " no hay nadie."; }, function (e?: T) { estado.textContent = e.message; });
    });
    aBtn.addEventListener("click", function () {
      var c: T = OP.cuerpoAnuncio(aTxt.value, aSala.value, limpia); if (!c) { estado.textContent = "Escribe el anuncio."; aTxt.focus(); return; }
      aBtn.disabled = true;
      pide("POST", "admin/presencia/anuncio", c).then(function (j?: T) { estado.textContent = j && j.salas && j.salas.length ? "Anuncio enviado." : "Anuncio enviado, pero no había nadie en la sala."; aTxt.value = ""; aCuenta.textContent = "0 / " + OP.ANUNCIO_MAX; },
        function (e?: T) { estado.textContent = e.message; }).then(function () { aBtn.disabled = false; });
    });
    bBtn.addEventListener("click", function () {
      var b: T = balizasApi(); if (!b || !b.disponible()) { estado.textContent = "Las balizas oficiales se ponen en la finca."; return; }   // A3-8b: el bloque se esconde fuera del exterior
      var c: T = b.cuerpo(bTit.value, bTxt.value, Number(bHoras.value)); if (!c) { estado.textContent = "La baliza necesita un título."; bTit.focus(); return; }
      bBtn.disabled = true;
      pide("POST", "admin/balizas", c).then(function () { estado.textContent = "Baliza puesta."; bTit.value = ""; bTxt.value = ""; return b.refresca(); }, function (e?: T) { estado.textContent = e.message; }).then(function () { bBtn.disabled = false; });
    });
    var quitaI: T = dp.Hud.icono({ id: "oficina", ico: "◆", txt: "Oficina", prio: 2, ventana: "oficina" });
    panelOf = { salaTxt: salaTxt, irOtra: irOtra, invitar: invitar, estado: estado, bloqueBal: bloqueBal, quitaTemas: function () { quitaI(); quitaV(); } };
    pintaPanel();
  }
  function pintaPanel() {
    if (!panelOf || !P) return;
    var s: T = P.sala(), o: T = OP.otraSala(s), guiada: T = !OP.SALAS[s];   // F3f: en la sala de una visita guiada se modera desde el panel del guía (46_guiada.js)
    panelOf.salaTxt.textContent = "Estás en la " + (guiada ? (P.nombreSala ? P.nombreSala(s) : "visita guiada") : OP.SALAS[s]) + ".";
    panelOf.irOtra.textContent = "Ir a la " + OP.SALAS[o]; panelOf.invitar.textContent = "Invitar a todos a la " + OP.SALAS[o]; panelOf.invitar.hidden = guiada;
    pintaBloqueBaliza();
  }
  function pintaBloqueBaliza() { var b: T = balizasApi(), si: T = !!(b && b.disponible()); if (panelOf && panelOf.bloqueBal.hidden === si) panelOf.bloqueBal.hidden = !si; }   // A3-8b
  function quitaPanel() { if (panelOf) { panelOf.quitaTemas(); panelOf = null; } }

  // ---- fase «tarde» (cada 0,5 s): el anuncio se va solo y el panel aparece o se va con tu rol (y su bloque de la baliza, con el mundo). Las balizas se repiden en su componente
  function tarde(dt?: T) {
    if (tBanner > 0) { tBanner -= dt; if (tBanner <= 0) { if (banner) banner.hidden = true; if (dp.Laminas.hay(LAM_A)) dp.Laminas.cierra(LAM_A); anuncioVR = null; } }
    var debe: T = soyOficina() && !dp.VRX.on && !!API;
    if (debe && !panelOf) montaPanel(); else if (!debe && panelOf && !dp.VRX.on) quitaPanel();
    pintaBloqueBaliza();
  }
  function libera() {
    vivo = false; ctl.abort();
    quitaTemas.splice(0).forEach(function (q?: T) { q(); });
    quitaPanel(); cierraInvitacion();
    if (dp.Laminas.hay(LAM_A)) dp.Laminas.cierra(LAM_A);
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null;
    if (dialogo && dialogo.raiz.parentNode) dialogo.raiz.parentNode.removeChild(dialogo.raiz); dialogo = null;
  }
  // el estado de los dos componentes de la oficina (el de las balizas, si está montado: si no, sin balizas), como antes de partirlo
  function estado() {
    var b: T = balizasApi(), eb: T = b ? b.estado() : { balizas: [], pedidas: 0, error: null, mallas: null };
    return { balizas: eb.balizas, anuncios: st.anuncios, descartados: st.descartados, invitaciones: st.invitaciones,
      pedidas: eb.pedidas, error: eb.error, panel: !!panelOf, invitacion: invitacion, banner: !!(banner && !banner.hidden), mallas: eb.mallas };
  }
  function refrescaBalizas() { var b: T = balizasApi(); return b ? b.refresca() : Promise.resolve(false); }
  // gancho de pruebas: estado; «refresca» (pide las balizas), «acepta» (la invitación), «libera» (apaga el componente, y con él el de las balizas, y lo suelta todo)
  (window as T).__oficinaMundo = function (accion?: T) {
    if (accion === "refresca") return refrescaBalizas(); if (accion === "acepta") return aceptaSala();
    if (accion === "libera") { dp.Componentes.libera("oficina-mundo"); return null; }
    return estado();
  };
  n.limpia(function () { try { delete (window as T).__oficinaMundo; } catch (e: T) { (window as T).__oficinaMundo = undefined; } });
  // lo que consume el componente de las balizas («OficinaMundo»): lo puro, pedir a la api con su cancelación y avisar
  return { tarde: tarde, libera: libera, estado: estado, refresca: refrescaBalizas, Puro: OP, pideCon: pideCon, avisa: avisaOficina, limpia: limpia, soyOficina: soyOficina,
    hayApi: function () { return !!API; }, vivo: function () { return vivo; } };
}
// [motor:fin]

export function creaOficinaMundo(dp: DepsOficinaMundo, n: T) { return OficinaMundoMotor(dp, n, n.api("red-salas"), n.api("presencia-compartida")); }
export type OficinaMundo = ReturnType<typeof creaOficinaMundo>;

// el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?oficina=0 lo apaga (y, con él, las balizas oficiales, que lo consumen).
// Consume la red y la presencia: sin ellas (?red=0, ?presencia=0 o fuera del motor) no se monta.
export function manifiestoOficinaMundo(dp: DepsOficinaMundo): Manifiesto {
  return {
    id: ID_OFICINA_MUNDO, version: 1,
    consume: ["Red", "Presencia", "Chat", "HazasPuro", "Laminas", "Ventanas", "Hud", "VRX"],
    expone: ["OficinaMundo"],
    eventos: { escucha: [], emite: ["oficina:anuncio", "oficina:sala"] },
    bandera: { defecto: true, url: "oficina" },
    // la lámina del anuncio o de la invitación en VR (1 llamada, 2 triángulos, una textura de 880 × 400 sin mipmaps: 1,4 MB, solo mientras se ve); las balizas, en oficina-balizas
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 2 },
    fases: { tarde: 0.5 },
    mundos: "todos",   // A3-8b: una invitación o un anuncio tienen que llegar aunque estés en un interior
    monta: function (n) { return creaOficinaMundo(dp, n as T); },
    actualiza: { tarde: function (dt, _t, api: T) { api.tarde(dt); } },
    libera: function (api: T) { if (api) api.libera(); }
  };
}
