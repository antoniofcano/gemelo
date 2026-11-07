// La visita guiada en el mundo (F3f, absorbe OF12; ADR-0026, decisiones 155 y 157-162; contratos/livekit-roles.json v7, api.openapi.yaml; MU5-n, A3-7b2: antes
// apps/web/motor/46_guiada.js, que queda como talón). Componente «visita-guiada» de TODOS los mundos (mundos: "todos"): estar en una sala «guiada-<evento>», la tira de la palabra,
// el panel del guía y la fila de VR no cambian al cruzar una puerta. Vive en ui/ y no en mundos/comun/ porque dibuja solo DOM y láminas (la frontera de ui/: MUNDOS §1) y lo que
// necesita de la red, la presencia y la voz le llega por argumento (n.api("red-salas"), "presencia-compartida" y "voz-guiada" al montar; SalaPose, por el talón), así que no
// importa de red/ ni de mundos/.
// ---------- la visita guiada en el mundo (F3f; absorbe OF12; ADR-0026, decisiones 155 y 157-162; contratos/livekit-roles.json v7, api.openapi.yaml).
// Componente «visita-guiada» (ADR-0023; ?guia=0 lo apaga): se registra y nadie lo nombra. Consume la red (la sala en la que estás, si es «guiada-<evento>»),
// la presencia (que viaja a la guiada y vuelve a la general) y la voz (tu papel y tu micrófono). No habla con LiveKit ni toca permisos: lo que modera lo
// modera la api (F3c), que lo comprueba todo y lo apunta en la auditoría; aquí solo se decide qué enseñar y qué ofrecer.
//  · PARA TODOS en una sala guiada: quién tiene la palabra y su cuenta atrás, leída del atributo `palabra_hasta` que pone la api (LiveKit lo reparte a toda la
//    sala; nadie más puede tocarlo). En pantalla, una tira arriba que no recibe toques; «quedan 30 s» y «quedan 10 s» se anuncian por una región aria-live.
//  · EL CIERRE (decisión 155): la api manda el tema «cierre» (sin participante; con uno, se descarta) con el instante del borrado. Cada uno ve «La visita
//    guiada termina en N s» (en VR, una lámina) y al llegar a cero vuelve SOLO a la visita libre (Presencia.cambiaSala("general"); sin presencia, Voz.sale()).
//    Si la sala se borra antes, la presencia vuelve igual (38_presencia_compartida.js).
//  · EL PANEL DEL GUÍA (papel «guia» u «oficina» en la sala; en pantalla): ventana «Visita guiada» con su icono en la barra: preparar (cuántas familias
//    apuntadas hay y cuántas están ya dentro, y quién está), la cola de manos en orden de llegada, dar la palabra (2 min), +1 min, cortar,
//    silenciar a todos menos al guía, sacar a una familia (pide pulsar dos veces) y cerrar la sala avisando antes (dos veces; 10-60 s).
//  · EN VR (gafas), una fila de PanelVR (pestaña «Ir a») con lo esencial: quién habla y cuánto le queda, dar la palabra a la 1.ª mano, +1 min, cortar y
//    silenciar a todos. Sacar y cerrar, en pantalla (piden confirmar y leer).
// Lo que llega de la sala (alias, metadatos, atributos, mensajes) es DATO de otras personas: se valida y se pinta con textContent, nunca como HTML.
// Sin servidor no hay sala guiada: montado no crea nada hasta estar en una.
// Código movido tal cual (se tipan parámetros y variables; lo del legado entra por dp). Su libera() ya cerraba las salas enganchadas, el panel, la lámina del cierre, la tira
// y window.__guiada; A3-7b2 añade que CANCELA las peticiones a la api en vuelo (AbortController: sondeo, dar la palabra, +1 min, cortar, silenciar, sacar, cerrar) y, L6-13, que
// al rehacerse las listas del panel (cada vez que cambia la firma, también al armar «¿Sacar? Otra vez») el foco vuelve al botón que lo tenía (por su nombre accesible).
// Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/guiada.test.js (el .ts, leído como JavaScript: sin tipos ni «dp.»).
import type { Manifiesto } from "../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_GUIADA = "visita-guiada";

/** Lo que el talón de 46 le da: SalaPose (26_presencia), Laminas (02d), visor (03), Ventanas (32) y Hud (31); VRX y PanelVR (29_vr, que el código comprobaba con typeof), por getter */
export interface DepsGuiada { SalaPose: T; Laminas: T; visor: T; Ventanas: T; Hud: T; readonly VRX: T; readonly PanelVR: T }

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/guiada.test.js)
export var GuiadaPuro: T = (function () {
  var SALA: T = /^guiada-([1-9][0-9]{0,9})$/, PAPELES: T = ["guia", "oficina", "familia"], AVISOS: T = [30, 10], CIERRE_MAX_BYTES = 256, CONFIRMA_MS = 4000;
  var SEGUNDOS_CIERRE: T = [10, 15, 30, 60], DEFECTO_CIERRE = 15;
  var dec: T = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
  // el evento de una sala «guiada-<evento>» (número), o null
  function evento(nombre?: T) { var m: T = typeof nombre === "string" ? SALA.exec(nombre) : null; return m ? Number(m[1]) : null; }
  // un instante ISO (el de un atributo de la api) en ms, o null
  function instante(t?: T) { var x: T = typeof t === "string" && t ? Date.parse(t) : NaN; return isFinite(x) ? x : null; }
  // el papel de los metadatos que pone la api (guia, oficina, familia), o ""
  function papelDe(metadatos?: T) { try { var m: T = JSON.parse(metadatos); return m && typeof m === "object" && PAPELES.indexOf(m.papel) >= 0 ? m.papel : ""; } catch (e: T) { return ""; } }
  function modera(papel?: T) { return papel === "guia" || papel === "oficina"; }
  // «1:42» (redondeando hacia arriba: lo que queda); nunca negativo
  function mmss(s?: T) { s = Math.max(0, Math.ceil(typeof s === "number" && isFinite(s) ? s : 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  // la gente de la sala como datos: ps = [{ identidad, metadatos }] (Red.sala.participantes, y tú), atr(identidad) → atributos, alias(metadatos) → texto
  // → [{ identidad, alias, papel, mano (ms | null), hasta (ms | null) }]
  function gente(ps?: T, atr?: T, alias?: T) {
    var l: T = [], vistos: T = {};
    (ps || []).forEach(function (p?: T) {
      if (!p || typeof p.identidad !== "string" || !p.identidad || vistos[p.identidad]) return;
      vistos[p.identidad] = true;
      var a: T = atr(p.identidad) || {};
      l.push({ identidad: p.identidad, alias: alias(p.metadatos) || "Visitante", papel: papelDe(p.metadatos), mano: instante(a.mano), hasta: instante(a.palabra_hasta) });
    });
    return l;
  }
  // quién tiene la palabra ahora (solo familias: el guía y la oficina hablan siempre) y cuánto le queda; si hubiera varias (no debería), la que más dure
  function palabra(g?: T, ahora?: T) {
    var m: T = null;
    (g || []).forEach(function (x?: T) { if (x.papel === "familia" && x.hasta !== null && x.hasta > ahora && (!m || x.hasta > m.hasta)) m = x; });
    return m ? { identidad: m.identidad, alias: m.alias, segundos: Math.ceil((m.hasta - ahora) / 1000) } : null;
  }
  // la cola de manos: familias con la mano levantada que no tienen la palabra, en orden de llegada (y por identidad a igualdad)
  function cola(g?: T, ahora?: T) {
    return (g || []).filter(function (x?: T) { return x.papel === "familia" && x.mano !== null && !(x.hasta !== null && x.hasta > ahora); })
      .sort(function (a?: T, b?: T) { return a.mano - b.mano || (a.identidad < b.identidad ? -1 : 1); });
  }
  function familias(g?: T) { return (g || []).filter(function (x?: T) { return x.papel === "familia"; }).sort(function (a?: T, b?: T) { return a.alias.localeCompare(b.alias, "es") || (a.identidad < b.identidad ? -1 : 1); }); }
  // ¿cruza la cuenta atrás un umbral que se dice en voz alta (30 s, 10 s)? antes y ahora en s; el umbral o null (si cruza dos de golpe, el más cercano a ahora)
  function umbral(antes?: T, ahora?: T) { for (var i: T = AVISOS.length - 1; i >= 0; i--) if (antes > AVISOS[i] && ahora <= AVISOS[i] && ahora > 0) return AVISOS[i]; return null; }
  // lo que avisa del cierre, por el tema «cierre»: solo de la api (SIN participante), en JSON v1 { en, a: "general" } → { en (ms), a }, o null
  function leeCierre(bytes?: T, de?: T) {
    if (de || !bytes || typeof bytes.byteLength !== "number" || !bytes.byteLength || bytes.byteLength > CIERRE_MAX_BYTES || !dec) return null;
    var m: T; try { m = JSON.parse(dec.decode(bytes)); } catch (e: T) { return null; }
    if (!m || typeof m !== "object" || Array.isArray(m) || m.v !== 1 || m.a !== "general") return null;
    var en: T = instante(m.en); return en === null ? null : { en: en, a: m.a };
  }
  // la tira: lo que ve todo el mundo («Tienes la palabra · 1:42» o «Tiene la palabra Mirlo · 1:42»); "" si nadie la tiene
  function textoPalabra(p?: T, yoId?: T) { return !p ? "" : (p.identidad === yoId ? "Tienes la palabra" : "Tiene la palabra " + p.alias) + " · " + mmss(p.segundos); }
  function textoCierre(s?: T) { return "La visita guiada termina en " + Math.max(0, Math.ceil(s)) + " s. Volvéis a la visita libre."; }
  function textoInscritos(i?: T) {
    if (!i || typeof i.apuntados !== "number" || typeof i.conectados !== "number") return "";
    return i.apuntados === 0 ? "No hay familias apuntadas." : i.conectados + " de " + i.apuntados + (i.apuntados === 1 ? " familia apuntada está" : " familias apuntadas están") + " en la sala.";
  }
  // pulsar dos veces para lo que no tiene vuelta (sacar, cerrar): st = { id, hasta } | null → { hecho, st }
  function confirma(st?: T, id?: T, ahora?: T) { return st && st.id === id && ahora <= st.hasta ? { hecho: true, st: null } : { hecho: false, st: { id: id, hasta: ahora + CONFIRMA_MS } }; }
  function segundosCierre(v?: T) { var n: T = Number(v); return SEGUNDOS_CIERRE.indexOf(n) >= 0 ? n : DEFECTO_CIERRE; }
  // los errores de la api (su «mensaje» ya viene en español); sin él, uno genérico
  function textoError(j?: T, status?: T) { return j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "La api respondió " + status + "."; }
  return { AVISOS: AVISOS, SEGUNDOS_CIERRE: SEGUNDOS_CIERRE, DEFECTO_CIERRE: DEFECTO_CIERRE, CONFIRMA_MS: CONFIRMA_MS, evento: evento, instante: instante, papelDe: papelDe,
    modera: modera, mmss: mmss, gente: gente, palabra: palabra, cola: cola, familias: familias, umbral: umbral, leeCierre: leeCierre, textoPalabra: textoPalabra,
    textoCierre: textoCierre, textoInscritos: textoInscritos, confirma: confirma, segundosCierre: segundosCierre, textoError: textoError };
})();
// [puro:fin]

// [motor:inicio] (lo evalúa en Node pruebas/guardianes/guiada.test.js con un DOM, la red, la presencia, la voz y la api de mentira)
export function GuiadaMotor(dp: DepsGuiada, n: T, R: T, P: T, Vz: T) {
  var G: T = GuiadaPuro, LAM = "guiada-cierre", SONDEO_S = 5;
  var s: T = null, quitaSala: T = [], ev: T = null, yoId = "", papel = "", g: T = [], pal: T = null, antesS: T = null, ultimoPal = "", cierre: T = null, vista: T = null, tSondeo = 0, pidiendo = false;
  var tira: T = null, avisos: T = null, vg: T = null, confirmaSt: T = null, quitaFila: T = null, vivo = true, ctl: T = new AbortController(), est: T = { cierres: 0, descartados: 0, acciones: 0, vueltas: 0, error: null };
  function el(tag?: T, props?: T, hijos?: T) { var e: T = document.createElement(tag); if (props) Object.keys(props).forEach(function (k?: T) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h?: T) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
  function alias(m?: T) { var i: T = dp.SalaPose.leeInfo(m); return i && i.alias ? i.alias : ""; }
  function vr() { return !!(dp.VRX && dp.VRX.on); }

  // ---- la sala guiada en la que estás (la de la presencia, clave «visita», o la propia de la voz, «guiada»); null si ninguna
  function buscaSala() {
    if (!R) return null;
    var ks: T = R.salas ? R.salas() : [];
    for (var i = 0; i < ks.length; i++) { var x: T = R.sala(ks[i]); if (x && (x.estado() === "dentro" || x.estado() === "reconectando") && G.evento(x.nombre()) !== null) return x; }
    return null;
  }
  function engancha(x?: T) {
    desengancha();
    s = x; ev = G.evento(x.nombre()); var y: T = x.yo(); yoId = y ? y.identidad : ""; papel = y ? G.papelDe(y.metadatos) : "";
    var re = function () { leeGente(); };
    quitaSala.push(x.al("atributos", re), x.al("entra", re), x.al("sale", re), x.escucha("cierre", function (b?: T, de?: T) { alCierre(b, de); }));
    leeGente(); tSondeo = SONDEO_S;   // la ventana pide la vista a la api enseguida
  }
  function desengancha() {
    quitaSala.splice(0).forEach(function (q?: T) { try { q(); } catch (e: T) {} });
    s = null; ev = null; yoId = ""; papel = ""; g = []; pal = null; antesS = null; vista = null; confirmaSt = null;
    if (!cierre) { quitaPanel(); pintaTira(); }
  }
  function leeGente() {
    if (!s) { g = []; return; }
    var ps: T = s.participantes().slice(), y: T = s.yo(); if (y) ps.unshift(y);
    g = G.gente(ps, function (id?: T) { return id === yoId ? s.atributos() : s.atributos(id); }, alias);
  }

  // ---- la palabra para todos: la tira y los avisos (30 s y 10 s; al darla y al acabar)
  function di(t?: T) { if (!avisos) return; avisos.textContent = ""; avisos.textContent = t; }
  function sigue(ahora?: T) {
    pal = G.palabra(g, ahora);
    var k: T = pal ? pal.identidad : "";
    if (k !== ultimoPal) {
      if (pal) di(pal.identidad === yoId ? "Tienes la palabra: 2 minutos." : "Tiene la palabra " + pal.alias + ".");
      else if (ultimoPal) di("Se acabó el turno de palabra.");
      ultimoPal = k; antesS = pal ? pal.segundos : null;
      n.emite("guiada:palabra", { identidad: k, segundos: pal ? pal.segundos : 0, yo: !!(pal && pal.identidad === yoId) });
    } else if (pal) {
      var u: T = G.umbral(antesS, pal.segundos); if (u) di((pal.identidad === yoId ? "Te quedan " : "Le quedan ") + u + " segundos.");
      antesS = pal.segundos;
    }
  }
  function montaTira() {
    if (tira) return;
    tira = el("div", { id: "guiadaPalabra", style: "position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:31;max-width:min(420px,calc(100% - 32px));padding:6px 12px;border-radius:999px;background:rgba(16,20,24,0.9);color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-sizing:border-box;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", hidden: true, "aria-hidden": "true" });
    avisos = el("div", { id: "guiadaAvisos", role: "status", "aria-live": "polite", style: "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap" });
    (dp.visor || document.body).appendChild(tira); (dp.visor || document.body).appendChild(avisos);
  }
  function pintaTira() {
    if (!tira) return;
    var t: T = cierre ? G.textoCierre((cierre.en - Date.now()) / 1000) : G.textoPalabra(pal, yoId);
    tira.textContent = t; tira.hidden = !t || vr();
  }

  // ---- el cierre (decisión 155)
  function alCierre(bytes?: T, de?: T) {
    var c: T = G.leeCierre(bytes, de); if (!c || !s) { est.descartados++; return; }
    cierre = { en: c.en, a: c.a, ev: ev }; est.cierres++;
    var sg: T = Math.max(0, Math.ceil((c.en - Date.now()) / 1000));
    di(G.textoCierre(sg));
    n.emite("guiada:cierre", { en: new Date(c.en).toISOString(), segundos: sg });
    if (vr()) dp.Laminas.abre({ id: LAM, ancho: 1.1, alto: 0.36, w: 880, h: 288, firma: function () { return cierre ? String(Math.ceil((cierre.en - Date.now()) / 1000)) : ""; },
      pinta: function (cx?: T, w?: T, h?: T) {
        cx.fillStyle = "rgba(16,20,24,0.95)"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#ffd58a"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Fin de la visita guiada", 28, 24);
        cx.fillStyle = "#ffffff"; cx.font = "30px system-ui, sans-serif"; var sgs: T = cierre ? Math.max(0, Math.ceil((cierre.en - Date.now()) / 1000)) : 0;
        cx.fillText("Termina en " + sgs + " s.", 28, 96); cx.fillText("Volvéis a la visita libre.", 28, 140);
      } });
    pintaTira(); pintaPanel();
  }
  function vuelve() {
    cierre = null; est.vueltas++;
    if (dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM);
    // con la presencia, ella vuelve (si la sala ya se borró, ya volvió sola); sin ella, la voz sale de su conexión propia
    var r: T = P && P.sala ? (P.sala() === "guiada" ? P.cambiaSala("general") : Promise.resolve(false)) : Vz ? Vz.sale() : Promise.resolve(false);
    desengancha(); pintaTira();
    return r;
  }

  // ---- la api (F3c y F3f): todo lo que modera va por ella; la respuesta, si falla, a la línea de estado de la ventana
  function pide(metodo?: T, ruta?: T, cuerpo?: T) {
    if (ev === null) return Promise.reject(new Error("No estás en una visita guiada."));
    var o: T = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal };   // A3-7b2: libera() la cancela
    if (cuerpo) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
    return fetch("/api/presencia/guiadas/" + ev + "/" + ruta, o).then(function (r?: T) {
      if (r.status === 204) return null;
      return r.json().catch(function () { return null; }).then(function (j?: T) { if (!r.ok) { var e: T = new Error(G.textoError(j, r.status)); e.status = r.status; throw e; } return j; });
    });
  }
  function sondea() {
    if (pidiendo || ev === null || !G.modera(papel)) return Promise.resolve(false);
    pidiendo = true; tSondeo = 0;
    return pide("GET", "palabra").then(function (j?: T) { vista = j && typeof j === "object" ? j : null; est.error = null; pintaPanel(); return true; },
      function (e?: T) { est.error = e.message; pintaPanel(); return false; }).then(function (x?: T) { pidiendo = false; return x; });
  }
  function accion(texto?: T, metodo?: T, ruta?: T, cuerpo?: T) {
    est.acciones++; ponEstado("…");
    return pide(metodo, ruta, cuerpo).then(function (j?: T) { ponEstado(texto); sondea(); return j || true; }, function (e?: T) { ponEstado(e.message); return false; });
  }
  function dar(id?: T) { var x: T = g.filter(function (q?: T) { return q.identidad === id; })[0]; return accion("Palabra dada" + (x ? " a " + x.alias : "") + ": 2 minutos.", "POST", "palabra", { identidad: id }); }
  function darPrimera() { var c: T = G.cola(g, Date.now()); return c.length ? dar(c[0].identidad) : (ponEstado("No hay manos levantadas."), Promise.resolve(false)); }
  function alarga() { return accion("+1 minuto.", "POST", "palabra/alargar", {}); }
  function corta() { return accion("Palabra quitada.", "DELETE", "palabra"); }
  function silencia() { return accion("Silenciados todos menos el guía.", "POST", "silenciar", {}).then(function (j?: T) { if (j && typeof j.pistas === "number") ponEstado("Silenciados: " + j.pistas + (j.pistas === 1 ? " micrófono" : " micrófonos") + "."); return j; }); }
  function saca(id?: T) {
    var c: T = G.confirma(confirmaSt, "saca:" + id, Date.now()); confirmaSt = c.st;
    var x: T = g.filter(function (q?: T) { return q.identidad === id; })[0], nom: T = x ? x.alias : "esa familia";
    if (!c.hecho) { ponEstado("¿Sacar a " + nom + " de la visita? Pulsa otra vez para confirmarlo."); pintaPanel(); return Promise.resolve(false); }
    pintaPanel();
    return accion(nom + " ha salido de la visita (15 min sin poder volver).", "POST", "expulsar", { identidad: id });
  }
  function cierraSala(seg?: T) {
    var c: T = G.confirma(confirmaSt, "cierra", Date.now()); confirmaSt = c.st;
    if (!c.hecho) { ponEstado("¿Cerrar la sala? Todos vuelven a la visita libre. Pulsa otra vez para confirmarlo."); pintaPanel(); return Promise.resolve(false); }
    pintaPanel();
    return accion("Cerrando la sala: avisados todos.", "POST", "cerrar", { segundos: G.segundosCierre(seg) });
  }

  // ---- la ventana del guía (pantalla): ventana «Visita guiada» con su icono, solo con papel de guía u oficina
  var css = "font:inherit;color:inherit;border-radius:8px;padding:6px 12px;min-height:44px;min-width:44px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.6);margin:2px 6px 2px 0";
  var cssPeligro: T = css.replace("rgba(64,240,255,0.16)", "rgba(229,72,77,0.18)").replace("rgba(64,240,255,0.6)", "rgba(229,72,77,0.7)");
  function montaPanel() {
    if (vg) return;
    var cu: T = null, quitaV: T = dp.Ventanas.registra("guia", { titulo: "Visita guiada", construye: function (c?: T) { cu = c; } });
    if (!quitaV || !cu) return;
    var h3 = function (t?: T) { return el("h3", { style: "margin:12px 0 4px;font-size:14px" }, [t]); };
    var prep: T = el("p", { style: "margin:0 0 4px" }), lst: T = el("ul", { style: "list-style:none;margin:4px 0;padding:0;max-height:24vh;overflow:auto", "aria-label": "Familias en la sala" });
    var turno: T = el("p", { style: "margin:0 0 4px" }), mas: T = el("button", { type: "button", style: css }, ["+1 min"]), cor: T = el("button", { type: "button", style: css }, ["Cortar"]);
    var manos: T = el("ol", { style: "margin:4px 0;padding-left:22px", "aria-label": "Manos levantadas, en orden" }), sinManos: T = el("p", { style: "margin:0;opacity:0.7" }, ["Nadie ha levantado la mano."]);
    var sil: T = el("button", { type: "button", style: css }, ["Silenciar a todos"]);
    var seg: T = el("select", { name: "segundos-cierre-sala", style: "font:inherit;min-height:44px;border-radius:8px;margin:2px 6px 2px 0", "aria-label": "Segundos hasta cerrar la sala" }, G.SEGUNDOS_CIERRE.map(function (x?: T) { return el("option", { value: String(x) }, [x + " s antes de cerrar"]); }));
    seg.value = String(G.DEFECTO_CIERRE);
    var cie: T = el("button", { type: "button", style: cssPeligro }, ["Cerrar la sala"]);
    var estado: T = el("p", { role: "status", "aria-live": "polite", style: "margin:8px 0 0;min-height:1.4em" });
    mas.addEventListener("click", function () { alarga(); }); cor.addEventListener("click", function () { corta(); });
    sil.addEventListener("click", function () { silencia(); }); cie.addEventListener("click", function () { cierraSala(seg.value); });
    [h3("Preparar"), prep, lst, h3("La palabra"), turno, mas, cor, h3("Manos levantadas"), manos, sinManos, h3("Moderar"), sil, el("br"), seg, cie, estado,
      el("p", { style: "margin:8px 0 0;opacity:0.7;font-size:12px" }, ["La palabra dura 2 minutos y se acaba sola. Nada se graba. Lo que haces aquí queda en la auditoría."])].forEach(function (x?: T) { cu.appendChild(x); });
    var quitaI: T = dp.Hud.icono({ id: "guia", ico: "🎙", txt: "Visita guiada", prio: 2, ventana: "guia" });
    vg = { prep: prep, lst: lst, turno: turno, mas: mas, cor: cor, manos: manos, sinManos: sinManos, cie: cie, estado: estado, firma: "", retira: function () { quitaI(); quitaV(); } };
    pintaPanel();
  }
  function quitaPanel() { if (vg) { vg.retira(); vg = null; } }
  function ponEstado(t?: T) { if (vg) vg.estado.textContent = t; }
  function boton(txt?: T, fn?: T, peligro?: T, etiqueta?: T) { var b: T = el("button", { type: "button", style: peligro ? cssPeligro : css }, [txt]); if (etiqueta) b.setAttribute("aria-label", etiqueta); b.addEventListener("click", fn); return b; }
  function pintaPanel() {
    if (!vg) return;
    var ahora: T = Date.now(), fam: T = G.familias(g), c: T = G.cola(g, ahora);
    vg.turno.textContent = pal ? (pal.alias + " tiene la palabra · le quedan " + G.mmss(pal.segundos)) : "Nadie tiene la palabra.";
    vg.mas.disabled = vg.cor.disabled = !pal;
    vg.cie.textContent = confirmaSt && confirmaSt.id === "cierra" ? "Pulsa otra vez para cerrar" : cierre ? "Cerrándose…" : "Cerrar la sala";
    vg.cie.disabled = !!cierre;
    // las listas solo se rehacen si cambia lo que dicen (el texto de la cuenta atrás va aparte)
    var firma: T = JSON.stringify([fam.map(function (x?: T) { return [x.identidad, x.alias]; }), c.map(function (x?: T) { return x.identidad; }), pal && pal.identidad, confirmaSt, vista && vista.inscritos]);
    if (firma === vg.firma) return;
    vg.firma = firma;
    var txtIns: T = vista && vista.inscritos ? G.textoInscritos(vista.inscritos) : "";
    vg.prep.textContent = (txtIns ? txtIns + " " : "") + (fam.length ? "Dentro ahora:" : "Aún no ha entrado ninguna familia.");
    var enfocado: T = document.activeElement, clave: T = enfocado && enfocado.getAttribute && (vg.lst.contains(enfocado) || vg.manos.contains(enfocado)) ? enfocado.getAttribute("aria-label") : null;   // L6-13
  while (vg.lst.firstChild) vg.lst.removeChild(vg.lst.firstChild);
    fam.forEach(function (x?: T) {
      var armado: T = confirmaSt && confirmaSt.id === "saca:" + x.identidad, hijos: T = [x.alias];
      if (!pal || pal.identidad !== x.identidad) hijos.push(" ", boton("Dar la palabra", function () { dar(x.identidad); }, false, "Dar la palabra a " + x.alias));
      hijos.push(" ", boton(armado ? "¿Sacar? Otra vez" : "Sacar", function () { saca(x.identidad); }, true, "Sacar a " + x.alias + " de la visita"));
      vg.lst.appendChild(el("li", { style: "margin:3px 0" }, hijos));
    });
    while (vg.manos.firstChild) vg.manos.removeChild(vg.manos.firstChild);
    c.forEach(function (x?: T) { vg.manos.appendChild(el("li", { style: "margin:3px 0" }, [x.alias + " ", boton("Dar la palabra", function () { dar(x.identidad); }, false, "Dar la palabra a " + x.alias)])); });
    vg.sinManos.hidden = c.length > 0;
  if (clave) {   // L6-13: rehacer la lista (al armar «¿Sacar? Otra vez», o al entrar o salir una familia) destruía el botón con el foco: vuelve al mismo, por su nombre
    var botones: T = Array.prototype.slice.call(vg.lst.querySelectorAll("button")).concat(Array.prototype.slice.call(vg.manos.querySelectorAll("button")));
    var vuelta: T = botones.filter(function (b?: T) { return b.getAttribute("aria-label") === clave; })[0];
    if (vuelta && vuelta.focus) vuelta.focus();
  }
  }

  // ---- en VR: una fila de PanelVR (pestaña «Ir a») con lo esencial; sacar y cerrar, en pantalla
  if (typeof dp.PanelVR !== "undefined" && dp.PanelVR && dp.PanelVR.filas) {
    quitaFila = dp.PanelVR.filas("ira", { id: "guia", orden: 5, alto: 250, visible: function () { return !!s && G.modera(papel); },
      firma: function () { return (pal ? pal.identidad + G.mmss(pal.segundos) : "-") + "|" + G.cola(g, Date.now()).length; },
      pinta: function (cx?: T, y?: T, W?: T) {
        cx.fillStyle = "#ffffff"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Visita guiada", 40, y + 6);
        var c: T = G.cola(g, Date.now());
        cx.font = "30px system-ui, sans-serif"; cx.fillText(pal ? pal.alias + " · " + G.mmss(pal.segundos) : "Nadie tiene la palabra", 40, y + 52, W - 80);
        cx.fillStyle = "rgba(255,255,255,0.75)"; cx.fillText(c.length ? "Manos: " + c.length + " · la 1.ª, " + c[0].alias : "Sin manos levantadas", 40, y + 92, W - 80);
      },
      botones: function (b?: T, y?: T) {
        b("gDa", 40, y + 140, 300, 64, "Dar a la 1.ª mano", function () { darPrimera(); });
        b("gMas", 360, y + 140, 190, 64, "+1 min", function () { alarga(); });
        b("gCorta", 570, y + 140, 190, 64, "Cortar", function () { corta(); });
        b("gSil", 780, y + 140, 204, 64, "Silenciar", function () { silencia(); });
      },
      debug: function () { return { guiada: estado() }; } });
    n.limpia(quitaFila);
  }

  // ---- fase «tarde» (cada 0,25 s): seguir a la sala, la cuenta atrás, el cierre y la ventana
  function tarde(dt?: T) {
    var x: T = buscaSala();
    if (x !== s || (x && G.evento(x.nombre()) !== ev)) { if (x) engancha(x); else if (s) desengancha(); }   // otra sala, o la misma conexión en otra guiada
    var ahora: T = Date.now();
    if (s) {
      var y: T = s.yo(); papel = y ? G.papelDe(y.metadatos) : papel;
      leeGente(); sigue(ahora); montaTira();
      var debe: T = G.modera(papel) && !vr();
      if (debe && !vg) montaPanel(); else if (!debe && vg) quitaPanel();
      tSondeo += dt; if (vg && tSondeo >= SONDEO_S) sondea();
    }
    if (cierre) { if (ahora >= cierre.en) vuelve(); else if (dp.Laminas.hay(LAM)) dp.Laminas.repinta(LAM); }
    if (confirmaSt && ahora > confirmaSt.hasta) { confirmaSt = null; }
    pintaTira(); pintaPanel();
  }
  n.on("voz:estado", function () { if (vivo) tarde(0); });
  n.on("depura:lineas", function (d?: T) { if (s && d && d.lineas) d.lineas.push("guiada " + ev + " · " + (papel || "?") + " · " + (pal ? "palabra " + G.mmss(pal.segundos) : "sin palabra") + " · manos " + G.cola(g, Date.now()).length + (cierre ? " · cerrándose" : "")); });
  function estado() {
    return { evento: ev, yo: yoId, papel: papel, palabra: pal ? { identidad: pal.identidad, alias: pal.alias, segundos: pal.segundos } : null, manos: G.cola(g, Date.now()).map(function (x?: T) { return x.identidad; }),
      familias: G.familias(g).map(function (x?: T) { return x.identidad; }), ventana: !!vg, tira: tira && !tira.hidden ? tira.textContent : "", cierre: cierre ? new Date(cierre.en).toISOString() : null,
      inscritos: vista && vista.inscritos ? vista.inscritos : null, cierres: est.cierres, descartados: est.descartados, acciones: est.acciones, vueltas: est.vueltas, error: est.error };
  }
  function libera() {
    vivo = false; ctl.abort(); cierre = null; desengancha(); quitaPanel();
    if (dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM);
    [tira, avisos].forEach(function (x?: T) { if (x && x.parentNode) x.parentNode.removeChild(x); }); tira = avisos = null;
    if ((window as T).__guiada === gancho) (window as T).__guiada = undefined;
  }
  // gancho de pruebas: el estado; «sondea», «dar» (identidad), «mano1», «alarga», «corta», «silencia», «saca» (identidad), «cierra» (segundos), «vuelve»
  function gancho(a?: T, arg?: T) {
    if (a === "sondea") return sondea(); if (a === "dar") return dar(arg); if (a === "mano1") return darPrimera(); if (a === "alarga") return alarga(); if (a === "corta") return corta();
    if (a === "silencia") return silencia(); if (a === "saca") return saca(arg); if (a === "cierra") return cierraSala(arg); if (a === "vuelve") return vuelve();
    return estado();
  }
  (window as T).__guiada = gancho;
  return { tarde: tarde, libera: libera, estado: estado };
}
// [motor:fin]

export function creaGuiada(dp: DepsGuiada, n: T) { return GuiadaMotor(dp, n, n.api("red-salas"), n.api("presencia-compartida"), n.api("voz-guiada")); }
export type Guiada = ReturnType<typeof creaGuiada>;

// el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?guia=0 lo apaga. Montado no crea nada hasta estar en una
// sala «guiada-<evento>». Consume la red, la presencia y la voz: sin la red no se monta (sin red no hay sala guiada); sin presencia ni voz, vuelve con Voz.sale().
export function manifiestoGuiada(dp: DepsGuiada): Manifiesto {
  return {
    id: ID_GUIADA, version: 1,
    consume: ["Red", "Presencia", "Voz", "SalaPose", "Ventanas", "Hud", "Laminas", "PanelVR", "VRX"],
    expone: ["Guiada"],   // F3e: 47_habla.js lee de aquí quién eres (yo), el evento y la cola de manos (estado())
    eventos: { escucha: ["voz:estado", "depura:lineas"], emite: ["guiada:palabra", "guiada:cierre"] },
    bandera: { defecto: true, url: "guia" },
    // la lámina del cierre en VR (1 llamada, 2 triángulos, una textura de 880 × 288 sin mipmaps: ≈ 1 MB, solo mientras se ve); la fila de PanelVR pinta sobre lo
    // suyo (0 llamadas nuevas); en pantalla, DOM
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 1 },
    fases: { tarde: 0.25 },
    mundos: "todos",
    monta: function (n) { return creaGuiada(dp, n as T); },
    actualiza: { tarde: function (dt, _t, api: T) { api.tarde(dt); } },
    libera: function (api: T) { if (api) api.libera(); }
  };
}
