// Hablar en la visita guiada y en un corro (F3e, F3j, F3l, F3k-2; ADR-0026 y ADR-0032), componente «habla-guiada» (ADR-0023; MU5-n, A3-6b: antes
// apps/web/motor/47_habla.js, que queda como talón). Movido tal cual: el mismo micro (botón, tecla T y gatillo izquierdo), los mismos modos, la misma mano y cola,
// el mismo aviso de voz antes de pedir la palabra (EIPD-VOZ §3: la api no la da sin él) y la misma tarjeta de la primera vez. La lógica pura (HablaPuro) vive en
// red/voz/habla.ts. Componente de TODO mundo (mundos: "todos", COMPONENTES §3.2). Dibuja (la caja en pantalla, el diálogo, las láminas y la fila del panel de VR),
// así que vive en mundos/comun/ y no en red/ (MUNDOS §1). Su libera() cierra el aviso y la tarjeta (sin darlos por aceptados ni vistos), la lámina del micro,
// suelta el gatillo de VR (VRX.voz) y quita la caja y el gancho window.__habla; la tecla T, la fila del panel, la pestaña «Hablar», las escuchas de la ventana y
// del Bus se sueltan con el contexto del componente (n.limpia, n.on). Desde A3-6b, lo que contesta la api después de liberarlo ya no vuelve a pintar la caja ni
// a registrar la pestaña (pinta y registraAjuste miran vivo).
//
// hablar en la visita guiada (F3e; ADR-0026, decisiones 157-162; COMPONENTES §F3e).
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
import { HablaPuro } from "../../red/voz/habla.ts";

/** Lo que el legado le da (el talón de apps/web/motor/47_habla.js). Los de solo lectura llegan por getters del talón. */
export interface DepsHabla {
  location: { search: string };
  window: any;
  document: any;
  fetch(url: string, opc?: unknown): Promise<any>;
  D: any; ConfigPuro: any; visor: any;
  readonly VRX: any; readonly Aparato: any; readonly PanelVR: any; readonly Ajustes: any; readonly PrimeraVezPuro: any; readonly Laminas: any; readonly Teclas: any;
}
export const ID_HABLA = "habla-guiada";

// [motor:inicio] (lo montan habla.test.ts y, en Node, pruebas/guardianes/habla.test.js con un DOM, una voz y una guiada de mentira)
export function creaHabla(dp: DepsHabla, n?: any, Vz?: any, Gd?: any) {
  // del legado, por argumento (A3-6b): lo que no cambia, aquí; VRX, Aparato, PanelVR, Ajustes, PrimeraVezPuro, Laminas y Teclas se leen de dp en cada uso (getters
  // del talón: 29_vr lo reescribe A3-6c; 33_ajustes y 46b se cargan antes, pero el código de siempre ya comprobaba con typeof si existían)
  const location = dp.location, window = dp.window, document = dp.document, fetch = dp.fetch, D = dp.D, ConfigPuro = dp.ConfigPuro, visor = dp.visor;
  var H: any = HablaPuro, PV: any = dp.PrimeraVezPuro, modoAj: any = H.DEFECTO, v: any = null, ult: any = "", mensaje: any = "", tMsg: any = 0, puntero: any = false, sosten: any = "", pulsa: any = null, pidiendo: any = false, manoSup: any = null, ultMicro: any = "cerrado", autoEv: any = null, vivo: any = true, tLam: any = 0;
  var cons: any = "?", consCarga: any = null, consIniciada: any = false, avisoVoz: any = null, avisoErr: any = "", avisoOcupado: any = false, avisoDom: any = null, avisoFoco: any = null;   // F3j: el consentimiento de voz ("si" | "no" | "?"), el aviso en pantalla
  var caja: any = null, estadoEl: any = null, icoEl: any = null, txtEl: any = null, boton: any = null, silencio: any = null, casilla: any = null, avisoEl: any = null, quitaFila: any = null, abriendoP: any = null;
  var est: any = { aperturas: 0, cierres: 0, manos: 0, errores: 0, teclas: 0, gatillos: 0, autos: 0, avisos: 0, aceptados: 0, retirados: 0, silencios: 0 }, LAM: any = "habla-micro", LAM_AVISO: any = "habla-consent";
  var tarj: any = null, tarjDom: any = null, estTarj: any = 0, LAM_TARJ: any = "habla-tarjeta", tarjFoco: any = null;   // F3l: la tarjeta de la primera vez ({ promesa, res, vr, forzada }) y cuántas se han enseñado
  var tSilencio: any = 0;   // F3k-2: segundos con el micro abierto en un corro sin que se te oiga
  function el(tag?: any, props?: any, hijos?: any) { var e: any = document.createElement(tag); if (props) Object.keys(props).forEach(function (k?: any) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h?: any) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
  function vr() { return !!(dp.VRX && dp.VRX.on); }
  function px() { return dp.Aparato.clase() === "quest" ? 56 : 44; }

  // ---- lo que se sabe: de la voz (permiso, micro, papel, sala) y de la guiada (quién eres y la cola)
  function lee() {
    var s: any = Vz ? Vz.estado() : null, g: any = Gd ? Gd.estado() : null;
    if (!s) return { guiada: false, corro: false, papel: "", puede: false, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false, evento: null };
    var puesto: any = g && g.evento === H.evento(s.sala) ? H.puestoDe(g.manos, g.yo) : null, dicho: any = manoSup && Date.now() < manoSup.hasta ? manoSup : null;
    // la api acaba de contestar y el atributo «mano» aún no ha llegado por la sala: durante 3 s vale lo que dijo la api
    if (dicho) puesto = dicho.v ? (puesto !== null ? puesto : dicho.puesto || null) : null;
    return { guiada: !!s.guiada, corro: !!s.corro, papel: s.papel, puede: !!s.puede, micro: s.micro, motivo: s.motivo || "", auriculares: !!s.auriculares, mano: dicho ? dicho.v : puesto !== null,
      puesto: puesto, ocupado: pidiendo, evento: H.evento(s.sala) };
  }
  function vista() { var e: any = lee(); return { e: e, v: H.vista(e, modoAj) }; }

  // ---- el micro: abrir y cerrar (Voz exige el permiso y el gesto; aquí solo se pide)
  function abre(fuente?: any) {
    if (!Vz) return Promise.resolve(false);
    var w: any = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // si ya lo abrió él, no hay que abrirlo solo
    est.aperturas++; n.emite("habla:micro", { accion: "abre", fuente: fuente, modo: modoAj });
    abriendoP = Vz.abre(); var p: any = abriendoP; p.then(function () { if (abriendoP === p) abriendoP = null; }, function () { if (abriendoP === p) abriendoP = null; });
    return p;
  }
  function cierra(fuente?: any) {
    if (!Vz) return Promise.resolve(true);
    est.cierres++; n.emite("habla:micro", { accion: "cierra", fuente: fuente, modo: modoAj });
    var w: any = vista(); if (w.e.papel === "guia") autoEv = w.e.evento;   // quien se silencia no se reabre solo
    // soltado (o pulsado de nuevo) mientras se abría: se cierra en cuanto abra, para que la apertura que viene detrás no lo deje abierto
    if (abriendoP) return abriendoP.then(function () { return Vz.cierra(); }, function () { return Vz.cierra(); });
    return Vz.cierra();
  }
  // un gesto (botón, tecla, gatillo, panel): pasa por la lógica pura, que decide si abre, cierra o nada
  function gesto(tipo?: any, fuente?: any, modo?: any) {   // modo: forzarlo (el botón del HUD, EV2-A4, siempre alterna: «pulsar»)
    var w: any = vista(); if (!H.activo(w.v)) return false;
    var r: any = H.entrada({ modo: modo || modoAj, papel: w.e.papel, tipo: tipo, micro: w.e.micro, sosten: sosten === fuente });
    // F3j (decisión 163): una familia sin consentimiento vigente no abre el micro: se le enseña el aviso (la api tampoco le habría dado la palabra). Aceptar es
    // su propio gesto; para abrir el micro, otro (así el navegador ve un gesto claro)
    // F3l: tras el aviso (si hacía falta) y antes de abrir el micro por primera vez, la tarjeta «la primera vez que hablas»; después, otro gesto abre el micro
    if (r.accion === "abre" && H.requiere(w.e.papel, "micro", cons) !== "nada") { sosten = ""; asegura("micro").then(function (q?: any) { if (q === "no") return; return (tarjetaFalta(w.e) ? muestraTarjeta(false) : Promise.resolve()).then(function () { msg("Pulsa Hablar para abrir el micrófono."); }); }); }
    else if (r.accion === "abre" && tarjetaFalta(w.e)) { sosten = ""; muestraTarjeta(false).then(function () { msg("Pulsa Hablar para abrir el micrófono."); }); }
    else if (r.accion === "abre") { sosten = r.sosten ? fuente : ""; abre(fuente); }
    else if (r.accion === "cierra") { sosten = ""; cierra(fuente); }
    else if (tipo === "suelta" && sosten === fuente) sosten = "";
    pinta(); return r.accion !== "nada";
  }
  function alterna(fuente?: any) { return gesto("baja", fuente); }

  // ---- la mano (api de F3c); el estado de verdad llega por el atributo «mano» que pone la api
  function pideMano(levantar?: any) {
    // F3j: la primera vez (o con otra versión del aviso), antes de pedir la palabra se enseña el aviso de voz; bajar la mano no lo pide
    if (!levantar) return peticionMano(false);
    var w: any = vista(); if (w.e.evento === null || pidiendo) return Promise.resolve(false);
    return asegura("levantar").then(function (q?: any) { return q === "no" ? false : peticionMano(true); });
  }
  function peticionMano(levantar?: any) {
    var w: any = vista(), ev: any = w.e.evento; if (ev === null || pidiendo) return Promise.resolve(false);
    pidiendo = true; pinta();
    // el POST lleva cuerpo «{}» con su content-type: la api valida el cuerpo como objeto vacío y un POST sin cuerpo da 400 (hallado en F3g contra la api real)
    var o: any = { method: levantar ? "POST" : "DELETE", credentials: "same-origin", headers: { accept: "application/json" } };
    if (levantar) { o.headers["content-type"] = "application/json"; o.body = "{}"; }
    return fetch("/api/presencia/guiadas/" + ev + "/mano", o).then(function (r?: any) {
      if (r.status === 204) return null;
      return r.json().catch(function () { return null; }).then(function (j?: any) {
        if (!r.ok) { var er: any = new Error(j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "La api respondió " + r.status + "."); throw er; }
        return j;
      });
    }).then(function (j?: any) {
      est.manos++; manoSup = { v: levantar, hasta: Date.now() + H.MANO_MS };
      var puesto: any = j && typeof j.puesto === "number" ? j.puesto : null;
      if (levantar && puesto !== null) manoSup.puesto = puesto;
      n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: true, puesto: puesto });
      pidiendo = false; msg(levantar ? "Mano levantada." : "Mano bajada."); return true;
    }, function (er?: any) {
      est.errores++; pidiendo = false; n.emite("habla:mano", { accion: levantar ? "levanta" : "baja", ok: false, puesto: null }); msg(er && er.message ? er.message : "No se pudo."); return false;
    });
  }


  // ---- F3j (decisión 163; EIPD-VOZ §3): el consentimiento de voz. La api manda (no da la palabra sin él); aquí se enseña el aviso antes de pedirla y se puede retirar.
  function llama(metodo?: any, cuerpo?: any) {
    var o: any = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
    if (cuerpo) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
    return fetch(H.URL_CONSENTIMIENTO, o).then(function (r?: any) { return r.status === 204 ? { status: 204, j: null } : r.json().catch(function () { return null; }).then(function (j?: any) { return { status: r.status, j: j }; }); });
  }
  function cargaConsent() {
    if (consCarga) return consCarga;
    consCarga = llama("GET").then(function (r?: any) { consCarga = null; if (r.status === 200) cons = H.consentimiento(r.j); return cons; }, function () { consCarga = null; return cons; });
    return consCarga;
  }
  // "nada" (no hacía falta, o ya estaba aceptado) | "aceptado" (acaba de aceptar) | "no" (ahora no, o no se pudo comprobar)
  function asegura(accion?: any) {
    var papel: any = vista().e.papel, q: any = H.requiere(papel, accion, cons);
    if (q === "nada") return Promise.resolve("nada");
    var antes: any = q === "comprobar" ? cargaConsent().then(function () { return H.requiere(papel, accion, cons); }) : Promise.resolve(q);
    return antes.then(function (q2?: any) {
      if (q2 === "nada") return "nada";
      if (q2 === "comprobar") { msg("No se pudo comprobar tu permiso de voz. Inténtalo otra vez."); return "no"; }
      return muestraAviso();
    });
  }
  function emiteCons(accion?: any, ok?: any) { n.emite("habla:consentimiento", { accion: accion, ok: ok, version: H.AVISO_VERSION }); }
  function muestraAviso() {
    if (avisoVoz) return avisoVoz.promesa;
    var res: any; var promesa: any = new Promise(function (r?: any) { res = r; });
    avisoVoz = { promesa: promesa, res: res, vr: vr() }; avisoErr = ""; avisoOcupado = false; est.avisos++;
    if (avisoVoz.vr) avisoLamina(); else avisoPantalla();
    return promesa;
  }
  function cierraAviso(resultado?: any) {
    var a: any = avisoVoz; if (!a) return; avisoVoz = null; avisoOcupado = false;
    if (avisoDom && avisoDom.parentNode) avisoDom.parentNode.removeChild(avisoDom); avisoDom = null;
    if (typeof dp.Laminas !== "undefined" && dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM_AVISO)) dp.Laminas.cierra(LAM_AVISO, "cerrada");
    try { if (avisoFoco && avisoFoco.focus) avisoFoco.focus(); } catch (e: any) {} avisoFoco = null;
    a.res(resultado); pinta();
  }
  function aceptaAviso() {
    if (!avisoVoz || avisoOcupado) return;
    avisoOcupado = true; avisoErr = ""; repintaAviso();
    llama("PUT", { version: H.AVISO_VERSION }).then(function (r?: any) {
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
    return llama("DELETE").then(function (r?: any) {
      if (r.status !== 204 && r.status !== 200) throw new Error("estado " + r.status);
      cons = "no"; manoSup = null; est.retirados++; emiteCons("retira", true);
      if (Vz && Vz.estado().micro !== "cerrado") cierra("consentimiento");
      msg("Has retirado tu permiso de voz."); refrescaAjustes(); return true;
    }, function () { emiteCons("retira", false); msg("No se pudo retirar tu permiso. Inténtalo otra vez."); return false; });
  }
  function refrescaAjustes() { try { if (typeof dp.Ajustes !== "undefined" && dp.Ajustes && dp.Ajustes.pinta) dp.Ajustes.pinta(); } catch (e: any) {} if (typeof dp.PanelVR !== "undefined" && dp.PanelVR.repinta) dp.PanelVR.repinta(); }

  // ---- F3l: la tarjeta «la primera vez que hablas» (PrimeraVezPuro, 46b). Se enseña la primera vez que una familia o un miembro de un corro va a abrir el micro,
  // DESPUÉS del aviso de consentimiento (que es legal y se acepta; esto es comodidad y no pide nada). Que ya se vio se guarda en el aparato (Ajustes, «habla.tarjeta»,
  // localStorage): no es un dato personal ni del hogar, y otro aparato la vuelve a enseñar una vez. Volver a verla: Configuración → Hablar y la fila del panel de VR.
  function tarjetaVista() {
    // sin Ajustes con lectura (un Ajustes de mentira), cuenta como vista: nunca se bloquea el micro por esto
    try { return typeof dp.Ajustes === "undefined" || !dp.Ajustes || typeof dp.Ajustes.lee !== "function" || dp.Ajustes.lee(PV.CLAVE) === true; } catch (e: any) { return true; }
  }
  function tarjetaFalta(e?: any) { return PV.debeVerse(tarjetaVista(), e.papel); }
  function marcaTarjeta() { try { if (typeof dp.Ajustes !== "undefined" && dp.Ajustes && typeof dp.Ajustes.pon === "function") dp.Ajustes.pon(PV.CLAVE, true); } catch (e: any) {} }
  function datosTarjeta() {
    var e: any = lee(), amb: any = PV.ambitoDe(e) || "guiada";
    return PV.tarjeta({ ambito: amb, forma: modoAj, corte: amb === "corro" ? PV.ALCANCE_CORRO : 0, vr: vr() });
  }
  // forzada: abierta a propósito (Configuración o el panel de VR); no es la primera vez
  function muestraTarjeta(forzada?: any) {
    if (tarj) return tarj.promesa;
    var res: any, promesa: any = new Promise(function (r?: any) { res = r; });
    tarj = { promesa: promesa, res: res, vr: vr(), forzada: !!forzada }; estTarj++;
    if (tarj.vr) tarjetaLamina(); else tarjetaPantalla();
    return promesa;
  }
  function cierraTarjeta(vista?: any) {
    var t: any = tarj; if (!t) return; tarj = null;
    if (tarjDom && tarjDom.parentNode) tarjDom.parentNode.removeChild(tarjDom); tarjDom = null;
    if (typeof dp.Laminas !== "undefined" && dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM_TARJ)) dp.Laminas.cierra(LAM_TARJ, "cerrada");
    try { if (tarjFoco && tarjFoco.focus) tarjFoco.focus(); } catch (e: any) {} tarjFoco = null;
    if (vista) marcaTarjeta();
    t.res(vista ? "vista" : "no");
  }
  function tarjetaPantalla() {
    var h: any = px(), T: any = datosTarjeta();
    try { tarjFoco = document.activeElement || null; } catch (e: any) { tarjFoco = null; }
    var cuerpo: any = el("div", { id: "hablaTarjetaCaja", style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(440px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:.9375rem/1.45 system-ui,sans-serif;text-align:left" });
    var tit: any = el("h2", { id: "hablaTarjetaT", style: "margin:0 0 8px;font:700 1.125rem/1.3 system-ui,sans-serif" }, [T.titulo]);
    var lineasEl: any = el("div", { id: "hablaTarjetaLineas" }, T.lineas.map(function (l?: any) { return el("p", { id: "hablaTarjeta-" + l.k, style: "margin:6px 0" }, [el("strong", {}, [l.t + ". "]), l.txt]); }));
    var pie: any = el("p", { id: "hablaTarjetaPie", style: "margin:8px 0 10px;font-size:.8125rem;opacity:0.8" }, [T.pie]);
    var ok: any = el("button", { id: "hablaTarjetaOk", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [T.boton]);
    var fila: any = el("div", { style: "display:flex;justify-content:flex-end" }, [ok]);
    [tit, lineasEl, pie, fila].forEach(function (x?: any) { cuerpo.appendChild(x); });
    tarjDom = el("div", { id: "hablaTarjeta", role: "dialog", "aria-modal": "true", "aria-labelledby": "hablaTarjetaT", tabindex: "-1",
      style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [cuerpo]);
    ok.addEventListener("click", function () { cierraTarjeta(true); });
    tarjDom.addEventListener("keydown", function (e?: any) { if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); cierraTarjeta(true); } else if (e.key === "Tab") { if (e.preventDefault) e.preventDefault(); ok.focus(); } });
    (visor || document.body).appendChild(tarjDom);
    try { ok.focus(); } catch (e: any) {}
  }
  function tarjetaLamina() {
    if (typeof dp.Laminas === "undefined" || !dp.Laminas || !dp.Laminas.abre) { var t0: any = tarj; tarj = null; t0.res("no"); return; }
    var T: any = datosTarjeta();
    dp.Laminas.abre({ id: LAM_TARJ, ancho: 1.4, alto: 1.1, w: 1100, h: 860, firma: function () { return T.titulo; },
      pinta: function (cx?: any, w?: any, hh?: any) {
        cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, hh); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, hh - 4);
        cx.textBaseline = "top"; cx.fillStyle = "#ffffff"; var y: any = 28, medir: any = function (t?: any) { return cx.measureText(t).width; };
        cx.font = "700 40px system-ui, sans-serif"; cx.fillText(T.titulo, 32, y, w - 64); y += 58;
        T.lineas.forEach(function (l?: any) {
          cx.fillStyle = "#7fe9ff"; cx.font = "600 28px system-ui, sans-serif"; cx.fillText(l.t, 32, y, w - 64); y += 36;
          cx.fillStyle = "#ffffff"; cx.font = "28px system-ui, sans-serif"; H.lineas(l.txt, w - 64, medir).forEach(function (ln?: any) { cx.fillText(ln, 32, y); y += 34; }); y += 14;
        });
        cx.fillStyle = "rgba(255,255,255,0.75)"; cx.font = "25px system-ui, sans-serif"; H.lineas(T.pie, w - 64, medir).forEach(function (ln?: any) { cx.fillText(ln, 32, y); y += 30; });
        var by: any = hh - 140, bh: any = 100;
        cx.fillStyle = "rgba(64,240,255,0.3)"; cx.fillRect(32, by, w - 64, bh);
        cx.fillStyle = "#ffffff"; cx.font = "600 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center"; cx.fillText(T.boton, w / 2, by + bh / 2); cx.textAlign = "left";
      },
      alTocar: function (u?: any, v?: any) { if (v >= 0.84) cierraTarjeta(true); return true; },
      alCierra: function (motivo?: any) { if (tarj && motivo !== "cerrada") { var t: any = tarj; tarj = null; t.res("no"); pinta(); } } });
  }

  // ---- el aviso en pantalla (un diálogo modal con foco y Esc) y en VR (una lámina con dos zonas que se tocan con el rayo o el gatillo)
  function avisoPantalla() {
    var h: any = px(), A: any = H.AVISO;
    try { avisoFoco = document.activeElement || null; } catch (e: any) { avisoFoco = null; }
    var cuerpo: any = el("div", { id: "hablaConsentCaja", style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(460px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:.9375rem/1.45 system-ui,sans-serif;text-align:left" });
    var tit: any = el("h2", { id: "hablaConsentT", style: "margin:0 0 8px;font:700 1.125rem/1.3 system-ui,sans-serif" }, [A.titulo]);
    var puntos: any = el("ul", { style: "margin:0 0 10px;padding-left:20px" }, A.puntos.map(function (t?: any) { return el("li", { style: "margin:4px 0" }, [t]); }));
    var enlace: any = el("a", { id: "hablaConsentEnlace", href: A.enlace.href, target: "_blank", rel: "noopener noreferrer", style: "color:#7fe9ff;display:inline-block;min-height:" + h + "px;line-height:" + h + "px" }, [A.enlace.texto]);
    var nota: any = el("p", { style: "margin:4px 0 10px;font-size:.75rem;opacity:0.75" }, [A.nota]);
    var err: any = el("p", { id: "hablaConsentError", role: "alert", hidden: true, style: "margin:0 0 8px;color:#ffb4b4;font-weight:600" });
    var ok: any = el("button", { id: "hablaConsentAcepta", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [A.aceptar]);
    var no: any = el("button", { id: "hablaConsentNo", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px;background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.5)" }, [A.ahoraNo]);
    var fila: any = el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, ok]);
    [tit, puntos, enlace, nota, err, fila].forEach(function (x?: any) { cuerpo.appendChild(x); });
    avisoDom = el("div", { id: "hablaConsent", role: "dialog", "aria-modal": "true", "aria-labelledby": "hablaConsentT", tabindex: "-1",
      style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [cuerpo]);
    avisoDom._err = err; avisoDom._ok = ok; avisoDom._no = no;
    ok.addEventListener("click", aceptaAviso); no.addEventListener("click", rechazaAviso);
    avisoDom.addEventListener("keydown", function (e?: any) {
      if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); rechazaAviso(); return; }
      if (e.key !== "Tab") return;
      var orden: any = [enlace, no, ok], i: any = orden.indexOf(document.activeElement), d: any = e.shiftKey ? -1 : 1;
      if (i < 0 || (d === 1 && i === orden.length - 1) || (d === -1 && i === 0)) { if (e.preventDefault) e.preventDefault(); orden[i < 0 || d === 1 ? 0 : orden.length - 1].focus(); }
    });
    (visor || document.body).appendChild(avisoDom);
    try { no.focus(); } catch (e: any) {}   // el foco empieza en «Ahora no»: aceptar es siempre una decisión expresa
  }
  function repintaAviso() {
    if (avisoDom) { avisoDom._err.textContent = avisoErr; avisoDom._err.hidden = !avisoErr; avisoDom._ok.disabled = avisoOcupado; avisoDom._no.disabled = avisoOcupado; avisoDom._ok.textContent = avisoOcupado ? "Guardando…" : H.AVISO.aceptar; }
    if (typeof dp.Laminas !== "undefined" && dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM_AVISO) && dp.Laminas.repinta) dp.Laminas.repinta(LAM_AVISO);
  }
  function avisoLamina() {
    if (typeof dp.Laminas === "undefined" || !dp.Laminas || !dp.Laminas.abre) { rechazaAviso(); return; }
    var A: any = H.AVISO;
    dp.Laminas.abre({ id: LAM_AVISO, ancho: 1.4, alto: 1.1, w: 1100, h: 860,
      firma: function () { return JSON.stringify([avisoErr, avisoOcupado]); },
      pinta: function (cx?: any, w?: any, hh?: any) {
        cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, hh); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, hh - 4);
        cx.textBaseline = "top"; cx.fillStyle = "#ffffff"; var y: any = 28, medir: any = function (t?: any) { return cx.measureText(t).width; };
        cx.font = "700 40px system-ui, sans-serif"; H.lineas(A.titulo, w - 64, medir).forEach(function (l?: any) { cx.fillText(l, 32, y); y += 50; });
        y += 6; cx.font = "29px system-ui, sans-serif";
        A.puntos.concat([A.enlaceVR]).forEach(function (t?: any) { H.lineas("• " + t, w - 64, medir).forEach(function (l?: any) { cx.fillText(l, 32, y); y += 36; }); y += 5; });
        cx.fillStyle = "rgba(255,255,255,0.7)"; cx.font = "25px system-ui, sans-serif"; cx.fillText(A.nota, 32, y + 4);
        if (avisoErr) { cx.fillStyle = "#ffb4b4"; cx.font = "600 28px system-ui, sans-serif"; H.lineas(avisoErr, w - 64, medir).forEach(function (l?: any, i?: any) { cx.fillText(l, 32, hh - 250 + i * 34); }); }
        var by: any = hh - 140, bh: any = 100;
        cx.fillStyle = "rgba(255,255,255,0.12)"; cx.fillRect(32, by, w / 2 - 48, bh); cx.fillStyle = avisoOcupado ? "rgba(64,240,255,0.1)" : "rgba(64,240,255,0.3)"; cx.fillRect(w / 2 + 16, by, w / 2 - 48, bh);
        cx.fillStyle = "#ffffff"; cx.font = "600 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center";
        cx.fillText(A.ahoraNo, w / 4 + 4, by + bh / 2); cx.fillText(avisoOcupado ? "Guardando…" : A.aceptar, (3 * w) / 4 - 4, by + bh / 2); cx.textAlign = "left";
      },
      // la franja de abajo: izquierda «Ahora no», derecha «Aceptar»; el resto de la lámina no hace nada pero tampoco deja pasar el toque
      alTocar: function (u?: any, v?: any) { if (v >= 0.84) { if (u < 0.5) rechazaAviso(); else aceptaAviso(); } return true; },
      alCierra: function (motivo?: any) { if (avisoVoz && motivo !== "cerrada") { var a: any = avisoVoz; avisoVoz = null; avisoOcupado = false; emiteCons("rechaza", true); a.res("no"); pinta(); } } });
  }

  // ---- la pantalla: una caja arriba, bajo la tira de la palabra de 46 (no tapa los mandos táctiles de abajo)
  var CSS_BTN: any = "font:600 .9375rem/1.2 system-ui,sans-serif;color:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.7);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;margin:2px 4px";
  function monta() {
    if (caja) return;
    var h: any = px();
    var sitio: any = null; try { sitio = document.getElementById ? document.getElementById("hudVoz") : null; } catch (e: any) { sitio = null; }   // L6-05: su sitio reservado en el HUD (bajo «lo tuyo»); sin él, flota como antes
    caja = el("div", { id: "hablaCaja", role: "group", "aria-label": "Micrófono de la visita guiada", hidden: true,
      style: (sitio ? "position:relative;width:100%;" : "position:absolute;left:50%;top:50px;transform:translateX(-50%);z-index:31;width:max-content;max-width:min(440px,calc(100% - 24px));") + "padding:8px 10px;border-radius:16px;background:rgba(16,20,24,0.92);color:#fff;font:.875rem/1.4 system-ui,sans-serif;box-sizing:border-box;text-align:center" });
    icoEl = el("span", { "aria-hidden": "true", style: "margin-right:6px" }); txtEl = el("span");
    estadoEl = el("div", { id: "hablaEstado", role: "status", "aria-live": "polite", "aria-atomic": "true", style: "font-weight:600;margin:0 0 4px" }, [icoEl, txtEl]);
    boton = el("button", { id: "hablaBoton", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Hablar"]);
    silencio = el("button", { id: "hablaSilencio", type: "button", hidden: true, "aria-label": "Silenciar mi micrófono", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px;background:rgba(229,72,77,0.18);border-color:rgba(229,72,77,0.8)" }, ["Silenciarme"]);
    casilla = el("input", { id: "hablaAuric", type: "checkbox", style: "width:" + Math.round(h * 0.5) + "px;height:" + Math.round(h * 0.5) + "px;margin:0 8px 0 0;vertical-align:middle" });
    var etiqueta: any = el("label", { id: "hablaAuricEt", style: "display:inline-flex;align-items:center;min-height:" + h + "px;cursor:pointer;margin:0 4px", hidden: true }, [casilla, "Llevo auriculares"]);
    avisoEl = el("p", { id: "hablaAviso", style: "margin:4px 0 0;font-size:.8125rem;opacity:0.9", hidden: true });
    var fila: any = el("div", { style: "display:flex;flex-wrap:wrap;justify-content:center;align-items:center" }, [boton, silencio, etiqueta]);
    caja.appendChild(estadoEl); caja.appendChild(fila); caja.appendChild(avisoEl);
    caja._et = etiqueta;
    (sitio || visor || document.body).appendChild(caja);
    // el botón: pulsar = clic; mantener = apretar y soltar (el puntero), o la barra y Intro mantenidas
    boton.addEventListener("pointerdown", function (e?: any) { if (modoAj === "mantener" && esMicro()) { puntero = true; if (e.preventDefault) e.preventDefault(); gesto("baja", "boton"); } else if (esMano()) { /* el clic */ } });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (nm?: any) { boton.addEventListener(nm, function () { if (puntero) { puntero = false; gesto("suelta", "boton"); } }); });
    boton.addEventListener("contextmenu", function (e?: any) { if (e.preventDefault) e.preventDefault(); });
    boton.addEventListener("keydown", function (e?: any) { if ((e.code === "Space" || e.code === "Enter") && modoAj === "mantener" && esMicro()) { if (e.preventDefault) e.preventDefault(); if (!e.repeat) gesto("baja", "boton"); } });
    boton.addEventListener("keyup", function (e?: any) { if ((e.code === "Space" || e.code === "Enter") && sosten === "boton") { if (e.preventDefault) e.preventDefault(); gesto("suelta", "boton"); } });
    boton.addEventListener("click", function () {
      var w: any = vista(), a: any = w.v.primaria.accion;
      if (a === "levantar") pideMano(true); else if (a === "bajar") pideMano(false);
      else if (a === "micro" && !(modoAj === "mantener" && !H.modera(w.e.papel))) alterna("boton");   // en mantener lo hacen apretar y soltar
    });
    silencio.addEventListener("click", function () { if (vista().e.micro !== "cerrado") { sosten = ""; cierra("boton"); pinta(); } });
    casilla.addEventListener("change", function () { if (Vz) Vz.auriculares(!!casilla.checked); pinta(); });
  }
  function esMicro() { return H.activo(vista().v); }
  function esMano() { var a: any = vista().v.primaria.accion; return a === "levantar" || a === "bajar"; }
  function msg(t?: any) { mensaje = t || ""; tMsg = H.MENSAJE_S; ult = ""; pinta(); }
  function pinta() {
    if (!vivo) return;   // A3-6b: lo que contesta la api tras liberar (la mano, el consentimiento, el aviso) ya no vuelve a montar la caja
    var w: any = vista(); v = w;
    if (!w.v.visible) { if (caja) caja.hidden = true; ult = ""; mensaje = ""; return; }
    monta();
    var t: any = H.textoEstado(w.v) + (mensaje ? " " + mensaje : ""), k: any = JSON.stringify([t, w.v.primaria, w.v.silenciar, w.v.auric, w.v.aviso, w.e.auriculares, vr()]);
    if (k === ult) return; ult = k;
    caja.hidden = vr(); caja.setAttribute("aria-label", w.e.corro ? "Micrófono del corro" : "Micrófono de la visita guiada");
    icoEl.textContent = w.v.micro.icono; txtEl.textContent = t;
    boton.textContent = w.v.primaria.texto; boton.disabled = !!w.v.primaria.off; boton.setAttribute("aria-label", w.v.primaria.aria);
    boton.title = w.v.primaria.accion === "micro" ? w.v.primaria.texto + " (tecla T)" : w.v.primaria.texto;
    boton.setAttribute("aria-keyshortcuts", w.v.primaria.accion === "micro" ? "T" : "");
    silencio.hidden = !w.v.silenciar; caja._et.hidden = !w.v.auric; casilla.checked = !!w.e.auriculares;
    avisoEl.textContent = w.v.aviso; avisoEl.hidden = !w.v.aviso;
    if (typeof dp.PanelVR !== "undefined" && dp.PanelVR.repinta) dp.PanelVR.repinta();
    registraAjuste();
  }

  // ---- las teclas: T (Teclas la reserva y la suelta con el foco en un campo); en mantener, el soltar se oye aparte
  var quitaT: any = (typeof dp.Teclas !== "undefined" && dp.Teclas.registra) ? dp.Teclas.registra("KeyT", function () {
    if (vr() || !esMicro()) return false;
    est.teclas++; gesto("baja", "tecla");
  }, "habla") : null;
  if (quitaT) n.limpia(quitaT);
  function alSoltarT(e?: any) { if (e && e.code === "KeyT" && sosten === "tecla") gesto("suelta", "tecla"); }
  window.addEventListener("keyup", alSoltarT); n.limpia(function () { window.removeEventListener("keyup", alSoltarT); });

  // ---- el guía abre su micro con el primer gesto de la sala (una vez por visita; si lo silencia, no se reabre solo)
  function dentroDeCaja(x?: any) { for (var i: any = 0; x && i < 12; i++, x = x.parentNode) if (x === caja) return true; return false; }
  function autoGuia(e?: any) {
    var w: any = vista(); if (!w.v.visible || w.e.papel !== "guia" || !w.e.puede || w.e.micro !== "cerrado" || w.e.evento === autoEv || w.e.motivo) return;
    if (e && dentroDeCaja(e.target)) return;   // si pulsa el botón del micro, que mande el botón
    autoEv = w.e.evento; est.autos++; abre("auto");
  }
  ["pointerdown", "keydown"].forEach(function (nm?: any) { window.addEventListener(nm, autoGuia, { passive: true }); n.limpia(function () { window.removeEventListener(nm, autoGuia); }); });

  // ---- VR: el gatillo izquierdo (29_vr.js llama a VRX.voz.mando cada fotograma con el estado del gatillo y una función de pulso del mando)
  var gatilloAntes: any = false;
  var gancho: any = {
    toma: function () { return vr() && esMicro(); },
    mando: function (abajo?: any, pulso?: any) {
      pulsa = pulso || pulsa;
      if (abajo === gatilloAntes) return; gatilloAntes = abajo;
      if (!esMicro()) return;
      est.gatillos++; gesto(abajo ? "baja" : "suelta", "gatillo");
    }
  };
  if (typeof dp.VRX !== "undefined" && dp.VRX) dp.VRX.voz = gancho;
  function pulso(f?: any, ms?: any) { try { if (pulsa) pulsa(f, ms); } catch (e: any) {} }

  // ---- VR: la lámina de 3 s al abrir o cerrar y la fila del panel
  function laminaVR(texto?: any, abierto?: any) {
    if (!vr() || typeof dp.Laminas === "undefined") return;
    tLam = H.AVISO_S;
    var o: any = { id: LAM, ancho: 0.8, alto: 0.2, w: 640, h: 160, firma: function () { return texto; },
      pinta: function (cx?: any, w?: any, h?: any) { cx.fillStyle = "rgba(16,20,24,0.95)"; cx.fillRect(0, 0, w, h); cx.fillStyle = abierto ? "#ffd58a" : "#ffffff"; cx.font = "600 38px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.fillText(texto, 28, h / 2); } };
    if (dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM, "reabierta");
    dp.Laminas.abre(o);
  }
  if (typeof dp.PanelVR !== "undefined" && dp.PanelVR.filas) {
    quitaFila = dp.PanelVR.filas("ira", { id: "habla", orden: 6, alto: 300, visible: function () { return !!(v && v.v.visible); },
      firma: function () { var w: any = vista(); return JSON.stringify([H.textoEstado(w.v), w.v.primaria.texto, w.e.auriculares, w.v.aviso, cons]); },
      pinta: function (cx?: any, y?: any, W?: any) {
        var w: any = vista(); cx.fillStyle = "#ffffff"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Micrófono", 40, y + 6);
        cx.font = "28px system-ui, sans-serif"; cx.fillText(w.v.micro ? w.v.micro.icono + " " + w.v.micro.texto : "", 40, y + 50, W - 80);
        cx.fillStyle = "rgba(255,255,255,0.75)"; cx.font = "24px system-ui, sans-serif";
        cx.fillText(w.v.cola || w.v.aviso || "Gatillo izquierdo: " + (modoAj === "mantener" && !H.modera(w.e.papel) ? "mantener para hablar" : "abrir y cerrar"), 40, y + 88, W - 80);
      },
      botones: function (b?: any, y?: any) {
        var w: any = vista(), a: any = w.v.primaria.accion;
        b("hMic", 40, y + 140, 520, 64, w.v.primaria.texto.replace("Mantén pulsado para hablar", "Hablar").replace("Hablando · suelta para callar", "Silenciarme"), function () {
          var x: any = vista().v.primaria.accion; if (x === "levantar") pideMano(true); else if (x === "bajar") pideMano(false); else if (x === "micro") alterna("panel");
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
  var quitaAj: any = null;
  function registraAjuste() {
    if (!vivo || quitaAj || typeof dp.Ajustes === "undefined" || !dp.Ajustes.registra) return;   // A3-6b: !vivo, ni la pestaña tras liberar (aceptar el aviso en vuelo la registraba)
    quitaAj = function () {};   // marca «registrado» antes: aplica llama a pinta, que volvería aquí
    var q: any = dp.Ajustes.registra("habla", { modo: { tipo: "opc", def: H.DEFECTO, ops: H.MODOS.slice() }, tarjeta: { tipo: "bool", def: false } },   // «tarjeta»: ¿ya se vio la de la primera vez? (F3l; en el aparato)
      { id: "habla", t: "Hablar", campos: [{ k: "modo", t: "Micrófono en la visita guiada", ops: [["pulsar", "Pulsar para abrir y pulsar para cerrar"], ["mantener", "Mantener pulsado para hablar"]],
        nota: "Solo para las familias cuando tienen la palabra; el guía siempre abre y cierra. Se usa con el botón «Hablar», la tecla T y, en VR, el gatillo izquierdo." },
        // F3j (decisión 163): retirar el consentimiento de voz, siempre a mano. Lo guarda la api, no este navegador
        { boton: "Retirar mi permiso de voz", id: "ajVozRetira", alClic: function () { retiraConsent(); },
          activo: function () { return cons === "si"; }, texto: function () { return cons === "si" ? "Retirar mi permiso de voz" : "Permiso de voz: no dado"; },
          nota: "Si lo retiras, se te vuelve a pedir la próxima vez que quieras hablar en una visita guiada. Si en ese momento tienes la palabra, se te quita." },
        // F3l: volver a leer la tarjeta de la primera vez (no para el guía ni la oficina: no pasan por ella)
        { boton: PV.FILA_VOLVER, id: "ajVozTarjeta", alClic: function () { if (!H.modera(lee().papel)) muestraTarjeta(true); }, activo: function () { return !H.modera(lee().papel); },
          texto: function () { return PV.FILA_VOLVER; }, nota: "Con quién se oye tu voz, cómo cortar el micro y que no se graba." }] },
      function (k?: any, val?: any) { if (k === "habla.modo") { modoAj = H.modo(val); if (modoAj !== "mantener" && sosten) { sosten = ""; } ult = ""; if (vivo) pinta(); } });
    if (q) { quitaAj = q; n.limpia(q); }
  }
  n.on("voz:estado", function () { if (vivo) alVoz(); });
  n.on("habla:alterna", function () { if (vivo) gesto("baja", "boton", "pulsar"); });   // el botón «Hablar» del HUD (31b_hud_personal.js): abre o cierra, como el botón de la caja en modo «pulsar»
  n.on("guiada:palabra", function () { if (vivo) pinta(); });
  n.on("depura:lineas", function (d?: any) { if (v && v.v.visible && d && d.lineas) d.lineas.push("habla · micro " + v.e.micro + " · modo " + modoAj + (v.e.mano ? " · mano" + (v.e.puesto ? " " + v.e.puesto : "") : "")); });
  function alVoz() {
    var w: any = vista(), m: any = w.e.micro === "abierto" ? "abierto" : "cerrado";
    if (m !== ultMicro) {
      ultMicro = m;
      if (vr() && w.v.visible) { pulso(m === "abierto" ? 0.4 : 0.2, m === "abierto" ? 30 : 15); laminaVR(m === "abierto" ? "Micrófono abierto" : "Micrófono cerrado", m === "abierto"); }
      if (m === "cerrado" && sosten) sosten = "";
    }
    pinta();
  }

  // ---- fase «tarde» (cada 0,25 s): la cola cambia sin que nadie avise, la lámina de VR se cierra, el guía en VR abre solo, un «mantener» huérfano se suelta
  function tarde(dt?: any) {
    if (!consIniciada && ConfigPuro.prefijoApi(location.search, D && D.base)) { consIniciada = true; cargaConsent().then(function () { if (vivo && cons === "si") { registraAjuste(); refrescaAjustes(); } }); }
    if (avisoVoz && avisoVoz.vr !== vr()) { var a: any = avisoVoz; cierraAviso("no"); a.res("no"); }   // se cambió de pantalla a VR (o al revés) con el aviso abierto: se cierra y se vuelve a pedir
    if (tarj && tarj.vr !== vr()) { var tt: any = tarj; cierraTarjeta(false); tt.res("no"); }   // F3l: se cambió de pantalla a VR (o al revés): se cierra (sin darla por vista)
    if (tMsg > 0) { tMsg -= dt; if (tMsg <= 0) { mensaje = ""; ult = ""; } }
    pinta();
    if (tLam > 0) { tLam -= dt; if (tLam <= 0 && typeof dp.Laminas !== "undefined" && dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM, "cerrada"); }
    if (sosten === "gatillo" && !vr()) { gatilloAntes = false; gesto("suelta", "gatillo"); }
    if (vr()) autoGuia(null);
    // F3k-2: en un corro, el micro abierto se cierra solo tras un minuto sin que se te oiga (no hay turno que lo cierre)
    var e: any = v ? v.e : null, hablaYo: any = !!(Vz && Vz.hablan && Vz.hablan().some(function (h?: any) { return h && h.yo; }));
    var sl: any = H.silencio({ corro: !!(e && e.corro), micro: e ? e.micro : "cerrado", habla: hablaYo, t: tSilencio, dt: dt }); tSilencio = sl.t;
    if (sl.cierra) { est.silencios++; sosten = ""; cierra("silencio"); msg("Micrófono cerrado tras un minuto sin hablar."); }
  }
  function estado() {
    var w: any = vista();
    return { visible: w.v.visible, modo: modoAj, micro: w.e.micro, papel: w.e.papel, puede: w.e.puede, accion: w.v.primaria.accion, texto: w.v.primaria.texto, estado: H.textoEstado(w.v), cola: w.v.cola,
      puesto: w.e.puesto, mano: w.e.mano, sosten: sosten, silenciar: w.v.silenciar, auriculares: w.e.auriculares, boton: px(), aperturas: est.aperturas, cierres: est.cierres,
      manos: est.manos, errores: est.errores, teclas: est.teclas, gatillos: est.gatillos, autos: est.autos, teclaT: !!quitaT,
      // A3-6b: «aviso» salía dos veces (el texto del eco y, detrás, si el aviso de voz está abierto); valía la segunda, que es la que queda (TypeScript no deja repetirla)
      consentimiento: cons, aviso: !!avisoVoz, avisos: est.avisos, aceptados: est.aceptados, retirados: est.retirados, corro: !!w.e.corro, silencios: est.silencios, tarjeta: !!tarj, tarjetas: estTarj, tarjetaVista: tarjetaVista() };
  }
  function libera() {
    vivo = false; sosten = "";
    if (avisoVoz) cierraAviso("no");
    if (tarj) cierraTarjeta(false);
    if (dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM, "cerrada");
    if (typeof dp.VRX !== "undefined" && dp.VRX && dp.VRX.voz === gancho) dp.VRX.voz = null;
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja); caja = estadoEl = icoEl = txtEl = boton = silencio = casilla = avisoEl = null;
    if (window.__habla === api) window.__habla = undefined;
  }
  // gancho de pruebas: el estado; «hablar» (alterna), «mano» (true | false), «tecla», «gatillo» (true | false), «modo» (pulsar | mantener), «acepta» y «ahoraNo» (el aviso de voz), «retira» (el permiso)
  function api(a?: any, arg?: any) {
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

/** El manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?habla=0 lo apaga. Consume la voz (Voz.abre/cierra/estado/auriculares)
 *  y la guiada (su api «Guiada»: quién eres y la cola); sin ellas no se monta. Montado y fuera de una sala guiada, no crea nada. */
export function manifiestoHabla(dp: DepsHabla) {
  return {
    id: ID_HABLA, version: 1,
    consume: ["Aparato", "Voz", "Guiada", "Ajustes", "Teclas", "PanelVR", "VRX", "Laminas", "PrimeraVezPuro"],
    expone: [] as string[],
    eventos: { escucha: ["voz:estado", "guiada:palabra", "depura:lineas", "habla:alterna"], emite: ["habla:micro", "habla:mano", "habla:consentimiento"] },
    bandera: { defecto: true, url: "habla" },
    // DOM en pantalla (0 llamadas); en VR, la lámina de 3 s al abrir o cerrar el micro (640 × 160 sin mipmaps: ≈ 0,4 MB) o, antes, la del aviso de voz (F3j: 1100 × 860 sin mipmaps: ≈ 3,8 MB); nunca las dos a la vez, solo mientras se ven: 1 llamada, 2 triángulos
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 4 },
    fases: { tarde: 0.25 },
    mundos: "todos" as const,   // A3-6b: de todo mundo (COMPONENTES §3.2)
    monta: function (n: any) { return creaHabla(dp, n, n.api("voz-guiada"), n.api("visita-guiada")); },
    actualiza: { tarde: function (dt: number, _t: number, api: any) { api.tarde(dt); } },
    libera: function (api: any) { if (api) api.libera(); }
  };
}
export type Habla = ReturnType<typeof creaHabla>;
