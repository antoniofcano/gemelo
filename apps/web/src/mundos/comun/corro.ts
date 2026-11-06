// La voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032, decisiones 205-212, provisionales), componente «corro-voz» (ADR-0023; MU5-n, A3-6b:
// antes apps/web/motor/47b_corro.js, que queda como talón). Movido tal cual: la misma casilla apagada por defecto, el mismo aviso «cercania» ANTES de activarla,
// las mismas invitaciones con aceptación, la misma distancia (8 m para invitar; 40 m durante 60 s para salir), los mismos silenciar, bloquear, avisar a la oficina
// y salir con las rutas de la api. La lógica pura (CorroPuro) vive en red/voz/corro.ts; la voz, en red/voz/voz.ts (Voz.entraCorro). Componente de TODO mundo
// (mundos: "todos", COMPONENTES §3.2). Dibuja (la caja, los diálogos, las láminas de VR, los halos y los iconos con three), así que vive en mundos/comun/ (MUNDOS §1).
// Su libera() cierra el aviso (como «Ahora no»), el aviso a la oficina, el diálogo, la lámina, la invitación y la caja; quita las filas del panel de VR, las acciones
// de la ficha de una persona, el tipo «corro» de Entidades, la escucha del tema «corro» de la sala libre y la pestaña «Voz»; suelta los halos y los iconos (mallas,
// geometría, materiales y los dos lienzos) y saca la voz del corro. Desde A3-6b, lo que contesta la api después ya no abre una lámina ni avisa (dice mira vivo) y,
// si la voz estaba entrando en el corro al liberarlo, sale en cuanto entra.
//
// la voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032, decisiones 205-212; contratos/presencia.md «Los corros»,
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
import { CorroPuro } from "../../red/voz/corro.ts";

/** Lo que el legado le da (el talón de apps/web/motor/47b_corro.js). Los de solo lectura llegan por getters del talón. */
export interface DepsCorro {
  THREE: any; scene: any; camera: any;
  location: { search: string };
  window: any;
  document: any;
  fetch(url: string, opc?: unknown): Promise<any>;
  D: any; ConfigPuro: any; LaminasPuro: any; visor: any;
  readonly VRX: any; readonly Aparato: any; readonly PanelVR: any; readonly Ajustes: any; readonly Hud: any; readonly Laminas: any; readonly Entidades: any; readonly TextDecoder: any;
}
export const ID_CORRO = "corro-voz";

// [motor:inicio] (lo montan corro.test.ts y, en Node, pruebas/guardianes/corro.test.js con un DOM, una api, una presencia, una voz y una red de mentira)
export function creaCorro(dp: DepsCorro, n?: any, R?: any, P?: any, Vz?: any) {
  // del legado, por argumento (A3-6b): lo que no cambia, aquí; VRX, Aparato, PanelVR, Ajustes, Hud, Laminas, Entidades y TextDecoder se leen de dp en cada uso
  // (getters del talón: 29_vr lo reescribe A3-6c; el código de siempre ya comprobaba con typeof si existían)
  const THREE = dp.THREE, scene = dp.scene, camera = dp.camera, location = dp.location, window = dp.window, document = dp.document, fetch = dp.fetch;
  const D = dp.D, ConfigPuro = dp.ConfigPuro, LaminasPuro = dp.LaminasPuro, visor = dp.visor;
  var C: any = CorroPuro, vivo: any = true, hayApi: any = !!(ConfigPuro.prefijoApi(location.search, D && D.base));
  var E: any = C.vacio(), sinApi: any = false, pidiendo: any = false, pideYa: any = true, tSondeo: any = 0, tPublicos: any = C.PUBLICOS_S, publicos: any = [], iconos: any = [];
  var hablan: any = Object.create(null), callados: any = Object.create(null), lejos: any = { lejos: false, t: 0 }, aereaT: any = 0, saliendo: any = false, entrando: any = false, tVoz: any = 0, cercaClave: any = "";
  var quitaAj: any = null, sinc: any = false, quitaFilas: any = [], quitaAcc: any = null, quitaTipo: any = null, quitaTema: any = null, caja: any = null, invEl: any = null, dlg: any = null, dlgFoco: any = null, LAM: any = "corro-lamina", lam: any = null, tLamMsg: any = 0;
  var ignoradas: any = Object.create(null);   // invitaciones a las que ya se dijo «Ahora no» (hasta que la api deje de listarlas)
  var est: any = { estados: 0, invitaciones: 0, aceptadas: 0, rechazadas: 0, salidas: 0, bloqueos: 0, avisos: 0, activaciones: 0, apagados: 0, entradasVoz: 0, errores: 0 };
  var g3: any = null;   // lo de la GPU (halos e iconos), solo al hacer falta
  function el(tag?: any, props?: any, hijos?: any) { var e: any = document.createElement(tag); if (props) Object.keys(props).forEach(function (k?: any) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h?: any) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
  function vr() { return !!(typeof dp.VRX !== "undefined" && dp.VRX && dp.VRX.on); }
  function px() { return dp.Aparato.clase() === "quest" ? 56 : 44; }
  var CSS_BTN: any = "font:600 15px/1.2 system-ui,sans-serif;color:#fff;border-radius:999px;padding:8px 16px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.7);margin:2px 4px";
  var CSS_BTN2: any = CSS_BTN + ";background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.5)";

  // ---- la api (mismo origen; todo con la sesión). { status, j }; status 0 si no hubo respuesta
  function llama(metodo?: any, url?: any, cuerpo?: any) {
    var o: any = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
    if (cuerpo !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
    return fetch(url, o).then(function (r?: any) { return r.status === 204 ? { status: 204, j: null } : r.json().catch(function () { return null; }).then(function (j?: any) { return { status: r.status, j: j }; }); },
      function () { return { status: 0, j: null }; });
  }
  function dice(t?: any) {   // lo que pasa: en pantalla, en la región aria-live del HUD (Hud.aviso); en VR, una lámina corta
    if (!t || !vivo) return;   // A3-6b: !vivo, lo que contesta la api tras liberar no abre una lámina en VR que ya nadie cierra
    if (vr()) { lamMensaje(t); return; }
    try { if (typeof dp.Hud !== "undefined" && dp.Hud && dp.Hud.aviso) dp.Hud.aviso(t, 5000); } catch (e: any) {}
  }
  function pres() { return P && P.estado ? P.estado() : null; }
  function enLibre() { var e: any = pres(); return !!(e && e.activo && e.variante === "red" && e.conectado && e.sala === "general"); }
  function yoPrefijo() { var e: any = pres(); return e ? C.prefijoDe(e.identidad) : ""; }
  function identidadesDe(prefijo?: any) { return (P && P.puntos ? P.puntos() : []).map(function (q?: any) { return q.id; }).filter(function (id?: any) { return C.prefijoDe(id) === prefijo; }); }

  // ---- el estado (GET …/corros/estado)
  function refresca() {
    if (!hayApi || sinApi || pidiendo || !vivo) return Promise.resolve(E);
    pidiendo = true; pideYa = false; tSondeo = 0;
    return llama("GET", C.URL.estado).then(function (r?: any) {
      pidiendo = false; if (!vivo) return E;
      if (r.status === 503 || r.status === 404) { sinApi = true; ponEstado(C.vacio()); return E; }   // sin LiveKit en el servidor (o sin la ruta): nada, y no se vuelve a preguntar
      if (r.status === 200) { est.estados++; ponEstado(C.leeEstado(r.j)); }
      return E;   // 401 (sin sesión) u otro: igual que antes, y se vuelve a preguntar más tarde
    });
  }
  function ponEstado(nuevo?: any) {
    var antes: any = E; E = nuevo;
    C.cambios(antes, E).forEach(dice);
    Object.keys(ignoradas).forEach(function (id?: any) { if (!E.recibidas.some(function (i?: any) { return i.id === id; })) delete ignoradas[id]; });
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
    var v: any = Vz.estado();
    if (E.corro && E.puedo && !v.guiada && v.sala !== E.corro.sala && !v.entrando && !entrando && tVoz <= 0) {
      if (v.corro) { Vz.sale(); }   // de otro corro (no debería): primero fuera
      entrando = true; est.entradasVoz++;
      Vz.entraCorro().then(function (ok?: any) { entrando = false; if (ok && !vivo) { Vz.sale(); return; }   // A3-6b: liberado mientras la voz entraba: que no se quede en el corro
        if (!ok && vivo) { tVoz = 5; pideYa = true; } repintaTodo(); });
    } else if (!E.corro && v.corro) Vz.sale();
  }

  // ---- salir (con su motivo, contratos/api.openapi.yaml: salir, lejos, cambio_de_sala, vista_aerea)
  function sale(motivo?: any) {
    if (saliendo || !E.corro) return Promise.resolve(false);
    saliendo = true; est.salidas++;
    if (Vz && Vz.estado().corro) Vz.sale();
    return llama("POST", C.URL.salir, { motivo: C.MOTIVOS_SALIDA.indexOf(motivo) >= 0 ? motivo : "salir" }).then(function (r?: any) {
      saliendo = false; lejos = { lejos: false, t: 0 }; aereaT = 0;
      if (r.status === 204) { E = Object.assign({}, E, { corro: null }); dice(C.textoSalida(motivo)); }
      else dice(C.textoError(r.j, "No se pudo salir del corro: inténtalo otra vez."));
      return refresca().then(function () { return r.status === 204; });
    });
  }
  function salidasSolas(dt?: any) {
    if (!E.corro || saliendo) return;
    var p: any = pres(), v: any = Vz ? Vz.estado() : null;
    if ((p && p.conectado && p.sala !== "general") || (v && v.guiada)) { sale("cambio_de_sala"); return; }
    if (!p || !p.conectado) return;   // reconectando: no se cuenta nada
    var a: any = C.aerea({ aerea: !!p.enVistaAerea, t: aereaT, dt: dt }); aereaT = a.t;
    if (a.sale) { sale("vista_aerea"); return; }
    var ds: any = [];
    E.corro.miembros.forEach(function (m?: any) { if (!m.yo) identidadesDe(m.prefijo).forEach(function (id?: any) { ds.push(P.distancia(id)); }); });
    lejos = C.lejania({ distancias: ds, lejos: lejos.lejos, t: lejos.t, dt: dt });
    if (lejos.sale) sale("lejos");
  }

  // ---- activar y apagar (Configuración → Voz, el panel de VR): el aviso antes, siempre; quien manda es la api (sin consentimiento vigente, 409)
  function pideActivar() {
    if (!E.disponible) return Promise.resolve(false);
    return muestraAviso();
  }
  function activa() {   // tras «Activar» en el aviso (con la declaración marcada)
    return llama("PUT", C.URL.consentimiento, { version: C.AVISO_VERSION, adulto: true }).then(function (r?: any) {
      if (r.status !== 200 || C.consentimiento(r.j) !== "si") throw { j: r.j, d: r.status === 409 && r.j && r.j.error === "version_distinta" ? "El aviso ha cambiado: recarga la página para leerlo de nuevo." : "No se pudo guardar tu respuesta. Inténtalo otra vez." };
      return llama("PUT", C.URL.ajuste, { activa: true });
    }).then(function (r?: any) {
      if (r.status !== 200 || !r.j || r.j.activa !== true) throw { j: r.j, d: "No se pudo activar la voz por cercanía. Inténtalo otra vez." };
      est.activaciones++; E.activa = true; E.consentimiento = "si"; ponCasilla(true); dice("Voz por cercanía activada: invita a hablar a quien esté cerca, o espera a que te inviten.");
      return refresca().then(function () { return true; });
    });
  }
  function apaga() {
    return llama("PUT", C.URL.ajuste, { activa: false }).then(function (r?: any) {
      if (r.status !== 200) { ponCasilla(E.activa); dice(C.textoError(r.j, "No se pudo apagar la voz por cercanía. Inténtalo otra vez.")); return false; }
      est.apagados++; E.activa = false; if (Vz && Vz.estado().corro) Vz.sale(); ponCasilla(false); dice("Voz por cercanía apagada.");
      return refresca().then(function () { return true; });
    });
  }
  function alterna() { if (E.activa) return apaga(); return pideActivar(); }
  function retira() {
    return llama("DELETE", C.URL.consentimiento).then(function (r?: any) {
      if (r.status !== 204 && r.status !== 200) { dice("No se pudo retirar tu permiso. Inténtalo otra vez."); return false; }
      E.consentimiento = "no"; E.activa = false; if (Vz && Vz.estado().corro) Vz.sale(); ponCasilla(false);
      dice("Has retirado tu permiso de voz por cercanía."); return refresca().then(function () { return true; });
    });
  }

  // ---- Configuración → Voz (Ajustes.registra): la casilla refleja la cuenta (la api); marcarla enseña el aviso y no se marca hasta aceptar
  function registraAjustes() {
    if (quitaAj || typeof dp.Ajustes === "undefined" || !dp.Ajustes || !dp.Ajustes.registra) return;
    sinc = true;
    quitaAj = dp.Ajustes.registra("voz", { cercania: { tipo: "bool", def: false } },
      { id: "voz", t: "Voz", nota: "Voz por cercanía en la visita libre: apagada por defecto. Se guarda en tu cuenta (vale en todos tus aparatos). Nada se graba.",
        campos: [{ k: "cercania", t: "Voz por cercanía: hablar con quien pasea cerca, si os invitáis",
          nota: "Al marcarla verás antes qué va a pasar y qué no; solo se activa si lo aceptas. Invitas desde su avatar o desde Gente, a menos de 8 m; nadie te oye sin aceptar tu invitación." },
        { boton: "Retirar mi permiso de voz por cercanía", id: "ajCercaniaRetira", alClic: function () { retira(); },
          activo: function () { return E.consentimiento === "si"; }, texto: function () { return E.consentimiento === "si" ? "Retirar mi permiso de voz por cercanía" : "Permiso de voz por cercanía: no dado"; },
          nota: "Retirarlo apaga la voz por cercanía y te saca al momento de cualquier corro. Se te vuelve a pedir si la activas otra vez." }] },
      alAjuste) || null;
    sinc = false;
  }
  function quitaAjustes() { if (quitaAj) { var q: any = quitaAj; quitaAj = null; try { q(); } catch (e: any) {} } }
  function ponCasilla(v?: any) {
    if (!quitaAj || !dp.Ajustes.pon) return;
    sinc = true; try { if (dp.Ajustes.lee("voz.cercania") !== !!v) dp.Ajustes.pon("voz.cercania", !!v); } catch (e: any) {} sinc = false;
    try { if (dp.Ajustes.pinta) dp.Ajustes.pinta(); } catch (e: any) {}
  }
  function alAjuste(k?: any, v?: any) {
    if (sinc || k !== "voz.cercania" || !vivo) return;
    if (v === E.activa) return;
    if (v) { ponCasilla(false); pideActivar(); } else apaga();
  }

  // ---- diálogos en pantalla (modal con foco y Esc; el foco empieza en el botón «no»): el aviso y el aviso a la oficina
  function abreDialogo(id?: any, titulo?: any, cuerpo?: any, bNo?: any, bSi?: any, alNo?: any, alSi?: any) {
    cierraDialogo();
    try { dlgFoco = document.activeElement || null; } catch (e: any) { dlgFoco = null; }
    var h: any = px(), tit: any = el("h2", { id: id + "T", style: "margin:0 0 8px;font:700 18px/1.3 system-ui,sans-serif" }, [titulo]);
    var err: any = el("p", { id: id + "Error", role: "alert", hidden: true, style: "margin:0 0 8px;color:#ffb4b4;font-weight:600" });
    var no: any = el("button", { id: id + "No", type: "button", style: CSS_BTN2 + ";min-height:" + h + "px;min-width:" + h + "px" }, [bNo]);
    var si: any = el("button", { id: id + "Si", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, [bSi]);
    var caja2: any = el("div", { style: "background:#101418;color:#fff;border:1px solid rgba(64,240,255,0.6);border-radius:16px;padding:16px 18px;max-width:min(520px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;text-align:left" },
      [tit].concat(cuerpo, [err, el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, si])]));
    var raiz: any = el("div", { id: id, role: "dialog", "aria-modal": "true", "aria-labelledby": id + "T", tabindex: "-1", style: "position:absolute;left:0;top:0;right:0;bottom:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)" }, [caja2]);
    dlg = { raiz: raiz, err: err, si: si, no: no, ocupado: false };
    no.addEventListener("click", function () { if (!dlg || dlg.ocupado) return; alNo(); });
    si.addEventListener("click", function () { if (!dlg || dlg.ocupado || si.disabled) return; alSi(); });
    raiz.addEventListener("keydown", function (e?: any) {
      e.stopPropagation && e.stopPropagation();   // al escribir o moverse por el diálogo, las teclas no mueven al paseante
      if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); if (dlg && !dlg.ocupado) alNo(); return; }
      if (e.key !== "Tab") return;
      var orden: any = Array.prototype.slice.call(raiz.querySelectorAll ? raiz.querySelectorAll("input,textarea,a,button") : []).filter(function (x?: any) { return !x.disabled; });
      if (!orden.length) return;
      var i: any = orden.indexOf(document.activeElement), d: any = e.shiftKey ? -1 : 1;
      if (i < 0 || (d === 1 && i === orden.length - 1) || (d === -1 && i === 0)) { if (e.preventDefault) e.preventDefault(); orden[i < 0 || d === 1 ? 0 : orden.length - 1].focus(); }
    });
    (visor || document.body).appendChild(raiz);
    try { no.focus(); } catch (e: any) {}   // aceptar es siempre una decisión expresa
    return dlg;
  }
  function errorDialogo(t?: any) { if (dlg) { dlg.err.textContent = t || ""; dlg.err.hidden = !t; } }
  function ocupaDialogo(si?: any, texto?: any) { if (!dlg) return; dlg.ocupado = si; dlg.no.disabled = si; dlg.si.disabled = si || dlg.si._bloqueado; if (texto) dlg.si.textContent = texto; }
  function cierraDialogo() {
    if (!dlg) return; var d: any = dlg; dlg = null;
    if (d.raiz.parentNode) d.raiz.parentNode.removeChild(d.raiz);
    try { if (dlgFoco && dlgFoco.focus) dlgFoco.focus(); } catch (e: any) {} dlgFoco = null;
  }

  // el aviso «cercania» (pantalla: diálogo; VR: lámina). Promesa de true si quedó activada
  var avisoP: any = null;
  function muestraAviso() {
    if (avisoP) return avisoP.promesa;
    var res: any; avisoP = { promesa: new Promise(function (r?: any) { res = r; }), res: function (x?: any) { var a: any = avisoP; avisoP = null; cierraLamina("aviso"); cierraDialogo(); repintaTodo(); res(x); return a; }, decl: false, error: "", ocupado: false, vr: vr() };
    if (avisoP.vr) lamAviso(); else dialogoAviso();
    return avisoP.promesa;
  }
  function aceptaAviso() {
    if (!avisoP || avisoP.ocupado || !avisoP.decl) return;
    avisoP.ocupado = true; avisoP.error = ""; ocupaDialogo(true, "Guardando…"); errorDialogo(""); repintaLamina();
    activa().then(function () { if (avisoP) avisoP.res(true); }, function (e?: any) {
      est.errores++; if (!avisoP) return; avisoP.ocupado = false; avisoP.error = C.textoError(e && e.j, e && e.d || "No se pudo activar."); ocupaDialogo(false, C.AVISO.activar); errorDialogo(avisoP.error); repintaLamina();
    });
  }
  function rechazaAviso() { if (!avisoP || avisoP.ocupado) return; ponCasilla(E.activa); avisoP.res(false); dice("De acuerdo: la voz por cercanía sigue apagada."); }
  function dialogoAviso() {
    var A: any = C.AVISO, h: any = px();
    var ul: any = function (l?: any) { return el("ul", { style: "margin:0 0 8px;padding-left:20px" }, l.map(function (t?: any) { return el("li", { style: "margin:4px 0" }, [t]); })); };
    var casilla: any = el("input", { id: "corroAvisoDecl", type: "checkbox", style: "width:" + Math.round(h * 0.5) + "px;height:" + Math.round(h * 0.5) + "px;margin:0 10px 0 0;flex:none" });
    var decl: any = el("label", { style: "display:flex;align-items:center;min-height:" + h + "px;margin:6px 0;font-weight:600;cursor:pointer" }, [casilla, A.declaracion]);
    var cuerpo: any = [el("h3", { style: "margin:8px 0 2px;font-size:15px" }, [A.tPasa]), ul(A.pasa), el("h3", { style: "margin:8px 0 2px;font-size:15px" }, [A.tNoPasa]), ul(A.noPasa), decl,
      el("a", { id: "corroAvisoEnlace", href: A.enlace.href, target: "_blank", rel: "noopener noreferrer", style: "color:#7fe9ff;display:inline-block;min-height:" + h + "px;line-height:" + h + "px" }, [A.enlace.texto]),
      el("p", { style: "margin:4px 0 10px;font-size:12px;opacity:0.75" }, [A.nota])];
    var d: any = abreDialogo("corroAviso", A.titulo, cuerpo, A.ahoraNo, A.activar, rechazaAviso, aceptaAviso);
    d.si._bloqueado = true; d.si.disabled = true;   // «Activar», deshabilitado hasta marcar la declaración
    casilla.addEventListener("change", function () { if (!avisoP) return; avisoP.decl = !!casilla.checked; d.si._bloqueado = !avisoP.decl; d.si.disabled = !avisoP.decl || avisoP.ocupado; });
  }

  // avisar a la oficina (motivo de lista y, si quieres, un texto ≤ 280; sin audio). Quien avisa sale de su corro (lo hace la api)
  var avisarP: any = null;
  function abreAvisar(identidad?: any, alias?: any) {
    if (avisarP) return;
    avisarP = { identidad: identidad, alias: alias, motivo: "", texto: "", ocupado: false, error: "" };
    if (vr()) { lamAvisar(); return; }
    var h: any = px(), grupo: any = el("fieldset", { style: "border:0;margin:0 0 8px;padding:0" }, [el("legend", { style: "font-weight:600;margin:0 0 4px" }, ["Motivo"])]);
    C.MOTIVOS.forEach(function (m?: any) {
      var r: any = el("input", { type: "radio", name: "corroMotivo", value: m[0], style: "width:" + Math.round(h * 0.45) + "px;height:" + Math.round(h * 0.45) + "px;margin:0 10px 0 0" });
      r.addEventListener("change", function () { if (!avisarP) return; avisarP.motivo = m[0]; if (dlg) { dlg.si._bloqueado = false; dlg.si.disabled = avisarP.ocupado; } });
      grupo.appendChild(el("label", { style: "display:flex;align-items:center;min-height:" + h + "px;cursor:pointer" }, [r, m[1]]));
    });
    var cuenta: any = el("span", { style: "font-size:12px;opacity:0.75" }, ["0/" + C.TEXTO_MAX]);
    var area: any = el("textarea", { id: "corroAvisoTexto", maxLength: C.TEXTO_MAX, rows: 3, "aria-label": "Qué ha pasado (opcional, como mucho " + C.TEXTO_MAX + " caracteres)", style: "width:100%;box-sizing:border-box;font:inherit;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);color:inherit;padding:6px" });
    area.addEventListener("input", function () { if (!avisarP) return; avisarP.texto = String(area.value || "").slice(0, C.TEXTO_MAX); cuenta.textContent = avisarP.texto.length + "/" + C.TEXTO_MAX; });
    var cuerpo: any = [grupo, el("label", { style: "display:block;margin:0 0 2px" }, ["Qué ha pasado (opcional)"]), area, cuenta,
      el("p", { style: "margin:6px 0 10px;font-size:13px;opacity:0.85" }, ["No se envía audio: llega a la oficina quién avisa, cuándo, en qué corro y el motivo. Al avisar sales del corro."])];
    var d: any = abreDialogo("corroAvisar", "Avisar a la oficina sobre " + alias, cuerpo, "Cancelar", "Enviar aviso", cierraAvisar, enviaAvisar);
    d.si._bloqueado = true; d.si.disabled = true;   // hasta elegir un motivo
  }
  function cierraAvisar() { avisarP = null; cierraLamina("avisar"); cierraDialogo(); }
  function enviaAvisar() {
    var a: any = avisarP; if (!a || a.ocupado || !a.motivo) return;
    a.ocupado = true; ocupaDialogo(true, "Enviando…"); repintaLamina();
    var cuerpo: any = { identidad: a.identidad, motivo: a.motivo }, t: any = a.texto.trim(); if (t) cuerpo.texto = t;
    llama("POST", C.URL.avisos, cuerpo).then(function (r?: any) {
      if (r.status === 201) { est.avisos++; cierraAvisar(); if (Vz && Vz.estado().corro) Vz.sale(); dice(C.textoSalida("aviso")); pideYa = true; return; }
      est.errores++; if (avisarP !== a) return; a.ocupado = false; a.error = C.textoError(r.j, "No se pudo enviar el aviso. Inténtalo otra vez."); ocupaDialogo(false, "Enviar aviso"); errorDialogo(a.error); repintaLamina();
    });
  }

  // ---- invitar, aceptar, «Ahora no», bloquear, silenciar
  function invita(identidad?: any, alias?: any) {
    var m: any = C.puedeInvitar(E, identidad, P && P.distancia ? P.distancia(identidad) : null, yoPrefijo());
    if (m) { dice(C.textoNoInvita(m, alias)); return Promise.resolve(false); }
    return llama("POST", C.URL.invitaciones, { identidad: identidad }).then(function (r?: any) {
      if (r.status === 201) { est.invitaciones++; dice("Has invitado a " + alias + ". Solo hablaréis si acepta."); pideYa = true; return true; }
      dice(C.textoError(r.j, "No se pudo invitar.")); return false;
    });
  }
  function invitacion() { var ahora: any = Date.now(); return E.recibidas.filter(function (i?: any) { return i.caduca > ahora && !ignoradas[i.id]; })[0] || null; }
  function aceptaInv(i?: any) {
    if (!i) return Promise.resolve(false);
    ignoradas[i.id] = true; pintaInvitacion();
    return llama("POST", C.URL.invitaciones + "/" + i.id + "/aceptar", {}).then(function (r?: any) {
      if (r.status === 200) { est.aceptadas++; pideYa = true; return refresca().then(function () { return true; }); }
      dice(C.textoError(r.j, "No se pudo aceptar la invitación.")); pideYa = true; return false;
    });
  }
  function rechazaInv(i?: any) {
    if (!i) return Promise.resolve(false);
    ignoradas[i.id] = true; pintaInvitacion(); est.rechazadas++;
    return llama("POST", C.URL.invitaciones + "/" + i.id + "/rechazar", {}).then(function (r?: any) { pideYa = true; return r.status === 204; });
  }
  function retiraInv(id?: any) { return llama("DELETE", C.URL.invitaciones + "/" + id).then(function () { pideYa = true; refresca(); }); }
  function bloquea(identidad?: any, alias?: any) {
    return llama("POST", C.URL.bloqueos, { identidad: identidad }).then(function (r?: any) {
      if (r.status === 201) { est.bloqueos++; dice("Has bloqueado la voz de " + alias + ": no podrá invitarte ni entrar en tu corro. No se le dice."); pideYa = true; return true; }
      dice(C.textoError(r.j, "No se pudo bloquear.")); return false;
    });
  }
  function silencia(clave?: any, si?: any) { if (si) callados[clave] = true; else delete callados[clave]; if (Vz && Vz.silencia) Vz.silencia(clave, !!si); repintaTodo(); if (P && P.repintaGente) P.repintaGente(); }
  function callado(identidad?: any) { return !!(callados[identidad] || callados[C.prefijoDe(identidad)]); }

  // ---- las acciones sobre una persona (su ficha al tocarla o apuntarla, y su fila de Gente): Presencia.accionesPersona
  function acciones(identidad?: any, o?: any) {
    if (!E.disponible || !E.activa) return [];
    var l: any = [], alias: any = o && o.alias ? o.alias : "Visitante", mio: any = C.miembroDe(E, identidad), corto: any = o && o.modo === "vr";
    if (!C.puedeInvitar(E, identidad, o ? o.distancia : null, yoPrefijo())) l.push({ id: "invitar", txt: corto ? "Invitar a hablar" : "Invitar a hablar a " + alias, fn: function () { invita(identidad, alias); } });
    if (mio) { var cal: any = callado(identidad); l.push({ id: "silenciar", txt: cal ? "Volver a oír" : "Silenciar", fn: function () { silencia(C.prefijoDe(identidad), !cal); } }); }
    l.push({ id: "bloquear", txt: "Bloquear su voz", fn: function () { bloquea(identidad, alias); } });
    l.push({ id: "avisar", txt: "Avisar a la oficina", fn: function () { abreAvisar(identidad, alias); } });
    return l;
  }

  // ---- la pantalla: la invitación recibida (no modal: el mundo sigue) y la caja del corro (lista, quién habla, enviadas, Salir)
  function pintaInvitacion() {
    var i: any = invitacion();
    if (!i || vr() || !E.disponible) { if (invEl) { if (invEl.parentNode) invEl.parentNode.removeChild(invEl); invEl = null; } if (i && vr() && E.disponible && !lam) lamInvitacion(i); else if (!i && lam && lam.tipo === "invitacion") cierraLamina("invitacion"); return; }
    if (invEl && invEl._id === i.id) return;
    if (invEl && invEl.parentNode) invEl.parentNode.removeChild(invEl);
    var h: any = px(), no: any = el("button", { id: "corroInvNo", type: "button", style: CSS_BTN2 + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Ahora no"]);
    var si: any = el("button", { id: "corroInvSi", type: "button", style: CSS_BTN + ";min-height:" + h + "px;min-width:" + h + "px" }, ["Aceptar"]);
    invEl = el("div", { id: "corroInvitacion", role: "alertdialog", "aria-modal": "false", "aria-labelledby": "corroInvT", "aria-describedby": "corroInvD",
      style: "position:absolute;left:50%;top:120px;transform:translateX(-50%);z-index:61;width:max-content;max-width:min(420px,calc(100% - 24px));padding:12px 14px;border-radius:16px;background:rgba(16,20,24,0.95);border:1px solid rgba(64,240,255,0.6);color:#fff;font:15px/1.4 system-ui,sans-serif;box-sizing:border-box" },
      [el("p", { id: "corroInvT", style: "margin:0 0 4px;font-weight:700" }, [i.quien.alias + " te invita a hablar en corro."]),
        el("p", { id: "corroInvD", style: "margin:0 0 8px;font-size:13px;opacity:0.9" }, ["Solo os oiréis si aceptas. Puedes salir cuando quieras. Nada se graba."]),
        el("div", { style: "display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end" }, [no, si])]);
    invEl._id = i.id;
    no.addEventListener("click", function () { rechazaInv(i); });
    si.addEventListener("click", function () { aceptaInv(i); });
    invEl.addEventListener("keydown", function (e?: any) { if (e.key === "Escape") { if (e.preventDefault) e.preventDefault(); rechazaInv(i); } });
    (visor || document.body).appendChild(invEl);
    try { no.focus(); } catch (e: any) {}   // el foco en «Ahora no» (como el aviso de F3j): aceptar es una decisión expresa
  }
  var claveCaja: any = "";
  function pintaCaja() {
    var w: any = C.vista(E, hablanPorPrefijo(), callados);
    if (!w.visible || vr()) { if (caja) caja.hidden = true; claveCaja = ""; return; }
    var k: any = JSON.stringify(w); if (caja && !caja.hidden && k === claveCaja) return; claveCaja = k;
    if (!caja) {
      caja = el("section", { id: "corroCaja", "aria-label": "Tu corro con voz", style: "position:absolute;left:12px;top:56px;z-index:31;width:min(300px,calc(100% - 24px));max-height:46%;overflow:auto;padding:8px 10px;border-radius:12px;background:rgba(16,20,24,0.9);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box" });
      caja._t = el("h3", { style: "margin:0 0 4px;font-size:14px" }); caja._l = el("ul", { style: "list-style:none;margin:0;padding:0" });
      caja._h = el("p", { id: "corroHablan", role: "status", "aria-live": "polite", "aria-atomic": "true", style: "margin:4px 0;font-weight:600;color:#ffd58a" });
      caja._e = el("ul", { style: "list-style:none;margin:4px 0 0;padding:0" });
      caja._s = el("button", { id: "corroSalir", type: "button", style: CSS_BTN + ";min-height:" + px() + "px;background:rgba(229,72,77,0.18);border-color:rgba(229,72,77,0.8)" }, ["Salir del corro"]);
      caja._s.addEventListener("click", function () { sale("salir"); });
      caja._n = el("p", { style: "margin:4px 0 0;font-size:11px;opacity:0.75" }, ["Solo os oís quienes estáis en esta lista. Nada se graba."]);
      [caja._t, caja._l, caja._h, caja._e, caja._s, caja._n].forEach(function (x?: any) { caja.appendChild(x); });
      (visor || document.body).appendChild(caja);
    }
    caja.hidden = false; caja._t.textContent = w.titulo; caja._h.textContent = w.hablan; caja._s.hidden = !E.corro; caja._n.hidden = !E.corro;
    while (caja._l.firstChild) caja._l.removeChild(caja._l.firstChild);
    w.filas.forEach(function (f?: any) {
      var hijos: any = [el("span", {}, [(f.habla ? "🔊 " : "") + f.alias + (f.habla ? " · habla" : "") + (f.callado ? " · silenciado por ti" : "")])];
      if (!f.yo) {
        var b: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px", "aria-pressed": f.callado ? "true" : "false", title: "Solo en este aparato; nadie se entera" }, [f.callado ? "Volver a oír" : "Silenciar"]);
        b.addEventListener("click", function () { silencia(f.prefijo, !f.callado); });
        hijos.push(b);
        var ids: any = identidadesDe(f.prefijo);   // bloquear y avisar piden su identidad en la sala libre: la de su avatar, si se le ve
        if (ids.length) {
          var bb: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Bloquear"]);
          bb.addEventListener("click", function () { bloquea(ids[0], f.alias); });
          var ba: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Avisar"]);
          ba.addEventListener("click", function () { abreAvisar(ids[0], f.alias); });
          hijos.push(bb, ba);
        }
      }
      caja._l.appendChild(el("li", { style: "margin:3px 0" }, hijos));
    });
    while (caja._e.firstChild) caja._e.removeChild(caja._e.firstChild);
    w.enviadas.forEach(function (i?: any) {
      var r: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, ["Retirar"]);
      r.addEventListener("click", function () { retiraInv(i.id); });
      caja._e.appendChild(el("li", { style: "margin:3px 0;opacity:0.85" }, [el("span", {}, ["Esperando a " + i.alias + "…"]), r]));
    });
  }
  function hablanPorPrefijo() { var o: any = {}; Object.keys(hablan).forEach(function (id?: any) { var p: any = C.prefijoDe(id); if (p) o[p] = true; }); return o; }
  function repintaTodo() { if (!vivo) return; pintaInvitacion(); pintaCaja(); if (typeof dp.PanelVR !== "undefined" && dp.PanelVR && dp.PanelVR.repinta) dp.PanelVR.repinta(); }

  // ---- VR: una lámina a la vez (el aviso, la invitación, el aviso a la oficina o un mensaje de 3 s), tocada con el rayo o el gatillo
  function cierraLamina(tipo?: any) { if (lam && (!tipo || lam.tipo === tipo)) { var l: any = lam; lam = null; if (typeof dp.Laminas !== "undefined" && dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM)) dp.Laminas.cierra(LAM, "cerrada"); if (l.alCierra) l.alCierra(); } }
  function repintaLamina() { if (lam && typeof dp.Laminas !== "undefined" && dp.Laminas && dp.Laminas.hay && dp.Laminas.hay(LAM) && dp.Laminas.repinta) dp.Laminas.repinta(LAM); }
  function abreLamina(tipo?: any, o?: any, alCierra?: any) {
    if (typeof dp.Laminas === "undefined" || !dp.Laminas || !dp.Laminas.abre) return false;
    if (lam) cierraLamina();
    lam = { tipo: tipo, zonas: [], alCierra: alCierra || null };
    var l: any = lam;
    dp.Laminas.abre({ id: LAM, ancho: o.ancho, alto: o.alto, w: o.w, h: o.h, firma: o.firma,
      pinta: function (cx?: any, w?: any, hh?: any) { l.zonas = []; o.pinta(cx, w, hh, function (z?: any) { l.zonas.push(z); }); },
      alTocar: function (u?: any, v?: any, t?: any) { var x: any = t ? t.x : u * o.w, y: any = t ? t.y : v * o.h; for (var i: any = 0; i < l.zonas.length; i++) { var z: any = l.zonas[i]; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { z.fn(); return true; } } return true; },
      alCierra: function (motivo?: any) { if (lam === l && motivo !== "cerrada") { lam = null; if (l.alCierra) l.alCierra(); } } });
    return true;
  }
  function fondo(cx?: any, w?: any, h?: any) { cx.fillStyle = "rgba(16,20,24,0.97)"; cx.fillRect(0, 0, w, h); cx.strokeStyle = "rgba(64,240,255,0.7)"; cx.lineWidth = 4; cx.strokeRect(2, 2, w - 4, h - 4); cx.textBaseline = "top"; cx.textAlign = "left"; }
  function texto(cx?: any, t?: any, x?: any, y?: any, ancho?: any, font?: any, color?: any, salto?: any) { cx.font = font; cx.fillStyle = color || "#ffffff"; var ls: any = LaminasPuro.lineas(t, ancho, function (s?: any) { return cx.measureText(s).width; }); ls.forEach(function (l?: any, i?: any) { cx.fillText(l, x, y + i * salto); }); return y + ls.length * salto; }
  function boton(cx?: any, zona?: any, z?: any, txt?: any, on?: any, off?: any) {
    cx.fillStyle = off ? "rgba(255,255,255,0.06)" : on ? "rgba(64,240,255,0.3)" : "rgba(255,255,255,0.12)"; cx.fillRect(z.x, z.y, z.w, z.h);
    cx.fillStyle = off ? "rgba(255,255,255,0.4)" : "#ffffff"; cx.font = "600 36px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "center"; cx.fillText(txt, z.x + z.w / 2, z.y + z.h / 2); cx.textAlign = "left"; cx.textBaseline = "top";
    if (!off) zona(z);
  }
  function lamAviso() {
    var A: any = C.AVISO;
    abreLamina("aviso", { ancho: 1.4, alto: 1.82, w: 1000, h: 1300, firma: function () { return JSON.stringify(avisoP ? [avisoP.decl, avisoP.error, avisoP.ocupado] : 0); },
      pinta: function (cx?: any, w?: any, h?: any, zona?: any) {
        fondo(cx, w, h); var y: any = 24, an: any = w - 64;
        y = texto(cx, A.titulo, 32, y, an, "700 36px system-ui, sans-serif", "#ffffff", 44) + 6;
        y = texto(cx, A.tPasa, 32, y, an, "700 28px system-ui, sans-serif", "#7fe9ff", 34);
        A.pasa.forEach(function (t?: any) { y = texto(cx, "• " + t, 32, y, an, "24px system-ui, sans-serif", "#ffffff", 30) + 4; });
        y = texto(cx, A.tNoPasa, 32, y + 4, an, "700 28px system-ui, sans-serif", "#7fe9ff", 34);
        A.noPasa.forEach(function (t?: any) { y = texto(cx, "• " + t, 32, y, an, "24px system-ui, sans-serif", "#ffffff", 30) + 4; });
        var d: any = { x: 32, y: y + 8, w: w - 64, h: 80, fn: function () { if (avisoP && !avisoP.ocupado) { avisoP.decl = !avisoP.decl; repintaLamina(); } } };
        cx.fillStyle = "rgba(255,255,255,0.08)"; cx.fillRect(d.x, d.y, d.w, d.h); cx.strokeStyle = "#ffffff"; cx.lineWidth = 3; cx.strokeRect(d.x + 16, d.y + 20, 40, 40);
        if (avisoP && avisoP.decl) { cx.fillStyle = "#40f0ff"; cx.fillRect(d.x + 24, d.y + 28, 24, 24); }
        texto(cx, A.declaracion, d.x + 72, d.y + 12, d.w - 88, "600 26px system-ui, sans-serif", "#ffffff", 30); zona(d);
        y = d.y + d.h + 8; y = texto(cx, A.masInfo + " " + A.nota, 32, y, an, "22px system-ui, sans-serif", "rgba(255,255,255,0.7)", 28);
        if (avisoP && avisoP.error) texto(cx, avisoP.error, 32, y + 4, an, "600 24px system-ui, sans-serif", "#ffb4b4", 30);
        var by: any = h - 120;
        boton(cx, zona, { x: 32, y: by, w: w / 2 - 48, h: 96, fn: rechazaAviso }, A.ahoraNo, false, !!(avisoP && avisoP.ocupado));
        boton(cx, zona, { x: w / 2 + 16, y: by, w: w / 2 - 48, h: 96, fn: aceptaAviso }, avisoP && avisoP.ocupado ? "Guardando…" : A.activar, true, !(avisoP && avisoP.decl) || !!(avisoP && avisoP.ocupado));
      } }, function () { if (avisoP) { ponCasilla(E.activa); avisoP.res(false); } });   // se cerró sola (lejos, al salir de VR): cuenta como «Ahora no»
  }
  function lamInvitacion(i?: any) {
    abreLamina("invitacion", { ancho: 0.9, alto: 0.42, w: 720, h: 336, firma: function () { return i.id; },
      pinta: function (cx?: any, w?: any, h?: any, zona?: any) {
        fondo(cx, w, h); var y: any = texto(cx, i.quien.alias + " te invita a hablar en corro.", 28, 22, w - 56, "700 34px system-ui, sans-serif", "#ffffff", 40);
        texto(cx, "Solo os oiréis si aceptas. Nada se graba.", 28, y + 4, w - 56, "26px system-ui, sans-serif", "rgba(255,255,255,0.85)", 32);
        boton(cx, zona, { x: 28, y: h - 116, w: w / 2 - 40, h: 92, fn: function () { cierraLamina("invitacion"); rechazaInv(i); } }, "Ahora no", false, false);
        boton(cx, zona, { x: w / 2 + 12, y: h - 116, w: w / 2 - 40, h: 92, fn: function () { cierraLamina("invitacion"); aceptaInv(i); } }, "Aceptar", true, false);
      } });
  }
  function lamAvisar() {
    abreLamina("avisar", { ancho: 1.0, alto: 0.96, w: 800, h: 768, firma: function () { return JSON.stringify(avisarP ? [avisarP.motivo, avisarP.ocupado, avisarP.error] : 0); },
      pinta: function (cx?: any, w?: any, h?: any, zona?: any) {
        fondo(cx, w, h); var a: any = avisarP; if (!a) return;
        var y: any = texto(cx, "Avisar a la oficina sobre " + a.alias, 28, 20, w - 56, "700 32px system-ui, sans-serif", "#ffffff", 38) + 4;
        C.MOTIVOS.forEach(function (m?: any) {
          var z: any = { x: 28, y: y, w: w - 56, h: 72, fn: function () { if (avisarP && !avisarP.ocupado) { avisarP.motivo = m[0]; repintaLamina(); } } };
          cx.fillStyle = a.motivo === m[0] ? "rgba(64,240,255,0.3)" : "rgba(255,255,255,0.08)"; cx.fillRect(z.x, z.y, z.w, z.h);
          texto(cx, (a.motivo === m[0] ? "● " : "○ ") + m[1], z.x + 20, z.y + 18, z.w - 40, "600 30px system-ui, sans-serif", "#ffffff", 34); zona(z); y += 80;
        });
        y = texto(cx, "Sin audio. En las gafas no se escribe texto; al avisar sales del corro.", 28, y + 4, w - 56, "22px system-ui, sans-serif", "rgba(255,255,255,0.75)", 28);
        if (a.error) texto(cx, a.error, 28, y + 2, w - 56, "600 22px system-ui, sans-serif", "#ffb4b4", 28);
        boton(cx, zona, { x: 28, y: h - 108, w: w / 2 - 40, h: 88, fn: cierraAvisar }, "Cancelar", false, a.ocupado);
        boton(cx, zona, { x: w / 2 + 12, y: h - 108, w: w / 2 - 40, h: 88, fn: enviaAvisar }, a.ocupado ? "Enviando…" : "Enviar aviso", true, !a.motivo || a.ocupado);
      } }, function () { avisarP = null; });
  }
  function lamMensaje(t?: any) {
    if (lam && lam.tipo !== "mensaje") return;   // no tapa un aviso ni una invitación
    tLamMsg = 3;
    abreLamina("mensaje", { ancho: 0.9, alto: 0.24, w: 720, h: 192, firma: function () { return t; }, pinta: function (cx?: any, w?: any, h?: any) { fondo(cx, w, h); texto(cx, t, 24, 24, w - 48, "600 30px system-ui, sans-serif", "#ffffff", 36); } });
  }

  // ---- VR: dos filas del panel, en «Comodidad» (en «Ir a» ya no caben: la parcela, Gente y el micro)
  if (typeof dp.PanelVR !== "undefined" && dp.PanelVR && dp.PanelVR.filas) {
    quitaFilas.push(dp.PanelVR.filas("comodidad", { id: "cercania", orden: 60, alto: 88, visible: function () { return E.disponible; },
      firma: function () { return String(E.activa); }, pinta: function (cx?: any, y?: any, W?: any, h?: any) { h.fila("Voz por cercanía", y); },
      botones: function (b?: any, y?: any) { b("vcer", 420, y, 470, 64, "Voz por cercanía: " + (E.activa ? "activada" : "apagada"), function () { alterna(); }, E.activa); } }));
    quitaFilas.push(dp.PanelVR.filas("comodidad", { id: "corro", orden: 61, alto: 170, visible: function () { return E.disponible && !!E.corro; },
      firma: function () { return JSON.stringify(C.vista(E, hablanPorPrefijo(), callados)); },
      pinta: function (cx?: any, y?: any, W?: any) {
        var w: any = C.vista(E, hablanPorPrefijo(), callados); cx.fillStyle = "#ffffff"; cx.textBaseline = "top"; cx.font = "600 30px system-ui, sans-serif"; cx.fillText(w.titulo, 40, y + 4, W - 80);
        cx.font = "24px system-ui, sans-serif"; cx.fillText(w.filas.map(function (f?: any) { return (f.habla ? "🔊 " : "") + f.alias; }).join(" · "), 40, y + 42, W - 80);
        cx.fillStyle = "#ffd58a"; cx.fillText(w.hablan, 40, y + 72, W - 80);
      },
      botones: function (b?: any, y?: any) { b("vsal", 40, y + 100, 520, 64, "Salir del corro", function () { sale("salir"); }, false); },
      debug: function () { return { corro: estado() }; } }));
    quitaFilas = quitaFilas.filter(Boolean);
  }

  // ---- lo que se ve en el mundo: un halo sobre quien habla de tu corro y el icono de cada corro del que no eres (InstancedMesh con su lienzoDe; 2 llamadas)
  function lienzoDe(dibuja?: any) { var c: any = document.createElement("canvas"); c.width = 128; c.height = 128; var cx: any = c.getContext("2d"); if (cx) dibuja(cx); var t: any = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; }
  function monta3D() {
    if (g3 || typeof THREE === "undefined" || typeof scene === "undefined" || !scene) return g3;
    var geo: any = new THREE.PlaneGeometry(1, 1);
    var tH: any = lienzoDe(function (cx?: any) { cx.strokeStyle = "rgba(255,213,138,0.95)"; cx.lineWidth = 14; cx.beginPath(); cx.ellipse(64, 64, 52, 22, 0, 0, Math.PI * 2); cx.stroke(); });
    var tI: any = lienzoDe(function (cx?: any) {
      cx.fillStyle = "rgba(16,20,24,0.85)"; cx.beginPath(); cx.arc(64, 64, 60, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = "#40f0ff"; cx.lineWidth = 6; cx.stroke();
      cx.fillStyle = "#ffffff"; [[44, 52], [84, 52]].forEach(function (c?: any) { cx.beginPath(); cx.arc(c[0], c[1], 12, 0, Math.PI * 2); cx.fill(); cx.fillRect(c[0] - 14, c[1] + 16, 28, 26); });
      cx.strokeStyle = "#ffd58a"; cx.lineWidth = 5; cx.beginPath(); cx.arc(64, 48, 22, Math.PI * 1.2, Math.PI * 1.8); cx.stroke();
    });
    var mat: any = function (t?: any) { return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }); };
    var halos: any = new THREE.InstancedMesh(geo, mat(tH), C.HALOS_MAX), icos: any = new THREE.InstancedMesh(geo, mat(tI), C.ICONOS_MAX);
    [halos, icos].forEach(function (m?: any) { m.count = 0; m.visible = false; m.renderOrder = 5; scene.add(m); });
    g3 = { geo: geo, tex: [tH, tI], halos: halos, icos: icos, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() };
    return g3;
  }
  function libera3D() {
    if (!g3) return; var g: any = g3; g3 = null;
    [g.halos, g.icos].forEach(function (m?: any) { scene.remove(m); m.material.dispose(); if (m.dispose) m.dispose(); });
    g.geo.dispose(); g.tex.forEach(function (t?: any) { t.dispose(); });
  }
  function calculaIconos() {   // los corros de los que no eres, con alguien a la vista: su centro (escena)
    var mio: any = E.corro ? E.corro.id : "", out: any = [];
    if (!E.disponible || !enLibre()) { iconos = out; return; }
    var pts: any = P && P.puntos ? P.puntos() : [];
    publicos.forEach(function (c?: any) {
      if (c.id === mio || out.length >= C.ICONOS_MAX) return;
      var cabs: any = []; pts.forEach(function (q?: any) { if (c.prefijos.indexOf(C.prefijoDe(q.id)) >= 0) { var h: any = P.cabeza(q.id); if (h) cabs.push(h); } });
      var ce: any = C.centro(cabs); if (ce) out.push({ id: c.id, x: ce.x, y: ce.y, z: ce.z, n: c.prefijos.length });
    });
    iconos = out;
  }
  function mundo() {
    if (!vivo || !hayApi || sinApi) return;
    var hs: any = [];
    if (E.corro) Object.keys(hablan).forEach(function (id?: any) { if (hs.length < C.HALOS_MAX && C.miembroDe(E, id)) { var c: any = P && P.cabeza ? P.cabeza(id) : null; if (c) hs.push({ x: c.x, y: c.y + C.ALTO_HALO, z: c.z }); } });
    calculaIconos();
    if (!hs.length && !iconos.length) { if (g3) { g3.halos.visible = false; g3.icos.visible = false; g3.halos.count = 0; g3.icos.count = 0; } return; }
    var g: any = monta3D(); if (!g) return;
    camera.getWorldQuaternion(g.q);
    var ponInst: any = function (m?: any, l?: any, tam?: any) { m.count = l.length; m.visible = l.length > 0; l.forEach(function (o?: any, i?: any) { g.p.set(o.x, o.y, o.z); g.s.set(tam[0], tam[1], 1); g.m4.compose(g.p, g.q, g.s); m.setMatrixAt(i, g.m4); }); if (l.length) { m.instanceMatrix.needsUpdate = true; if (m.computeBoundingSphere) m.computeBoundingSphere(); } };   // su volumen, con las matrices ya escritas (AG-1.3)
    ponInst(g.halos, hs, [0.5, 0.5]); ponInst(g.icos, iconos, [0.55, 0.55]);
  }
  // tocar el icono (pantalla) o apuntarlo con el rayo (VR): una ficha que lo explica (Entidades, tipo «corro»)
  function iconoDe(id?: any) { var m: any = /^corro:(.+)$/.exec(String(id)); return m ? iconos.filter(function (i?: any) { return i.id === m[1]; })[0] || null : null; }
  var pv: any = null;
  function iconoEnPantalla(cx?: any, cy?: any, r?: any) {
    if (!iconos.length) return null; pv = pv || new THREE.Vector3();
    var mejor: any = null, md: any = 28;
    iconos.forEach(function (i?: any) { pv.set(i.x, i.y, i.z).project(camera); if (pv.z > 1) return; var sx: any = (pv.x * 0.5 + 0.5) * r.width + r.left, sy: any = (-pv.y * 0.5 + 0.5) * r.height + r.top, d: any = Math.hypot(cx - sx, cy - sy); if (d < md) { md = d; mejor = i; } });
    return mejor ? { id: "corro:" + mejor.id, s: md / 28 } : null;
  }
  function iconoEnRayo(rr?: any) {
    var o: any = rr.ray.origin, d: any = rr.ray.direction, mejor: any = null, ms: any = 1e9;
    iconos.forEach(function (i?: any) { var t: any = (i.x - o.x) * d.x + (i.y - o.y) * d.y + (i.z - o.z) * d.z; if (t < 0.4 || t > 300) return; var e: any = Math.hypot(o.x + d.x * t - i.x, o.y + d.y * t - i.y, o.z + d.z * t - i.z), s: any = e / Math.max(0.4, t * 0.01); if (s < 1 && s < ms) { ms = s; mejor = { id: "corro:" + i.id, t: t, s: s }; } });
    return mejor;
  }
  if (hayApi && typeof dp.Entidades !== "undefined" && dp.Entidades && dp.Entidades.registra) quitaTipo = dp.Entidades.registra({ tipo: "corro", dueno: "47b_corro", prioridad: 25, pantalla: iconoEnPantalla, rayo: iconoEnRayo,
    ficha: function (id?: any) { var i: any = iconoDe(id); return i ? { titulo: C.ICONO_TITULO, lineas: [C.ICONO_TEXTO], filas: [{ k: "Hogares", v: String(i.n) }] } : null; },
    existe: function (id?: any) { return !!iconoDe(id); }, pos: function (id?: any) { var i: any = iconoDe(id); return i ? { x: i.x, y: i.y, z: i.z } : null; }, radio: function () { return 0.5; }, sinAnillo: true });

  // ---- quién habla (de la voz: «voz:habla»; solo llegan las voces que oyes, y la tuya)
  n.on("voz:habla", function (d?: any) { if (!vivo || !d || d.yo || typeof d.identidad !== "string") return; if (d.habla) hablan[d.identidad] = true; else delete hablan[d.identidad]; pintaCaja(); if (typeof dp.PanelVR !== "undefined" && dp.PanelVR && dp.PanelVR.repinta) dp.PanelVR.repinta(); });
  n.on("voz:estado", function (d?: any) { if (!vivo) return; if (!d || !d.corro) hablan = Object.create(null); });
  n.on("depura:lineas", function (d?: any) { if (E.disponible && d && d.lineas) d.lineas.push("corro · " + (E.activa ? "activa" : "apagada") + (E.corro ? " · " + E.corro.miembros.length + " hogares" : "") + (E.recibidas.length ? " · " + E.recibidas.length + " invitaciones" : "") + " · iconos " + iconos.length); });
  // el tema «corro» de la sala libre: «mira tu estado» (solo de la api, sin participante)
  var SR: any = hayApi && R ? R.sala("visita") : null;
  if (SR && SR.escucha) quitaTema = SR.escucha("corro", function (datos?: any, de?: any) { var t: any = ""; try { t = typeof dp.TextDecoder !== "undefined" ? new dp.TextDecoder().decode(datos) : String(datos); } catch (e: any) { t = ""; } if (C.temaVale(t, de)) pideYa = true; });
  if (hayApi && P && P.accionesPersona) quitaAcc = P.accionesPersona(acciones);

  // ---- fase «tarde» (cada 0,25 s): sondeo, iconos, salidas solas, la invitación que caduca, el botón de Gente a menos de 8 m, la voz
  function tarde(dt?: any) {
    if (!vivo || !hayApi || sinApi) return;
    tSondeo += dt; tPublicos += dt; if (tVoz > 0) tVoz -= dt;
    var cada: any = E.corro || E.recibidas.length || E.enviadas.length ? C.SONDEO.corro : E.disponible && E.activa ? C.SONDEO.activa : C.SONDEO.apagada;
    if (pideYa || tSondeo >= cada) refresca();
    if (E.disponible && enLibre() && tPublicos >= C.PUBLICOS_S) { tPublicos = 0; llama("GET", C.URL.corros).then(function (r?: any) { if (vivo && r.status === 200) publicos = C.leePublicos(r.j); }); }
    salidasSolas(dt);
    if (E.recibidas.length && !invitacion() && (invEl || (lam && lam.tipo === "invitacion"))) pintaInvitacion();   // caducó o se contestó
    else if (invitacion() && !invEl && !lam) pintaInvitacion();
    if (E.puedo && P && P.puntos) {   // Gente solo enseña «Invitar» a menos de 8 m: se repinta cuando cambia quién está tan cerca
      var k: any = P.puntos().filter(function (q?: any) { var d: any = P.distancia(q.id); return typeof d === "number" && d <= C.DIST.invitar; }).map(function (q?: any) { return q.id; }).join("|");
      if (k !== cercaClave) { cercaClave = k; if (P.repintaGente) P.repintaGente(); }
    }
    sincronizaVoz();
    if (tLamMsg > 0) { tLamMsg -= dt; if (tLamMsg <= 0) cierraLamina("mensaje"); }
    if (avisoP && avisoP.vr !== vr()) { var a: any = avisoP; a.res(false); }   // se cambió de pantalla a VR (o al revés) con el aviso abierto: cuenta como «Ahora no»
    if (avisarP && dlg && vr()) cierraAvisar();
    pintaCaja();
  }
  function estado() {
    var w: any = C.vista(E, hablanPorPrefijo(), callados);
    return { activo: hayApi && !sinApi, disponible: E.disponible, activa: E.activa, consentimiento: E.consentimiento, puedo: E.puedo, suspendida: E.suspendida,
      corro: E.corro ? E.corro.sala : "", miembros: w.filas.map(function (f?: any) { return f.alias; }), hablan: w.hablan, recibidas: E.recibidas.length, enviadas: E.enviadas.length,
      invitacion: !!invitacion(), aviso: !!avisoP, avisar: !!avisarP, lamina: lam ? lam.tipo : "", iconos: iconos.length, publicos: publicos.length, vistos: P && P.puntos ? P.puntos().length : 0, lejos: lejos.lejos, tLejos: Math.round(lejos.t * 10) / 10,
      tAerea: Math.round(aereaT * 10) / 10, pestana: !!quitaAj, callados: Object.keys(callados), medidas: Object.assign({}, est) };
  }
  function libera() {
    vivo = false;
    if (avisoP) { var a: any = avisoP; a.res(false); }
    cierraAvisar(); cierraDialogo(); cierraLamina();
    if (invEl && invEl.parentNode) invEl.parentNode.removeChild(invEl); invEl = null;
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja); caja = null;
    quitaFilas.splice(0).forEach(function (q?: any) { try { q(); } catch (e: any) {} });
    [quitaAcc, quitaTipo, quitaTema].forEach(function (q?: any) { if (q) try { q(); } catch (e: any) {} }); quitaAcc = quitaTipo = quitaTema = null;
    quitaAjustes(); libera3D();
    if (Vz && Vz.estado && Vz.estado().corro) Vz.sale();   // la api lo saca sola tras 60 s sin conexión (su barrido)
    if (window.__corro === api) window.__corro = undefined;
  }
  // gancho de pruebas: el estado; «refresca», «invita» (identidad), «acepta» y «ahoraNo» (la invitación de arriba), «sale» (motivo), «activa» (enseña el aviso),
  // «declara» (marca la declaración del aviso), «aceptaAviso», «ahoraNoAviso», «apaga», «retira», «silencia» ({ clave, si }), «bloquea» y «avisar» (identidad), «mundo»
  function api(accion?: any, arg?: any) {
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
    if (accion === "acciones") return acciones(arg && arg.identidad, arg || {}).map(function (x?: any) { return x.id; });
    if (accion === "mundo") { mundo(); return { halos: g3 ? g3.halos.count : 0, iconos: g3 ? g3.icos.count : 0, montado: !!g3 }; }
    return estado();
  }
  window.__corro = api;
  if (hayApi) refresca();
  return { tarde: tarde, mundo: mundo, libera: libera, estado: estado };
}
// [motor:fin]

/** El manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?corro=0 lo apaga. Consume la voz (Voz.entraCorro, silencia,
 *  estado, sale), la presencia (Presencia: accionesPersona, distancia, cabeza, puntos, estado, repintaGente) y la red (el tema «corro» de la sala «visita»); sin
 *  ellas no se monta. Sin servidor, no pide nada ni crea nada. */
export function manifiestoCorro(dp: DepsCorro) {
  return {
    id: ID_CORRO, version: 1,
    consume: ["Aparato", "Red", "Presencia", "Voz", "Ajustes", "PanelVR", "VRX", "Laminas", "LaminasPuro", "Entidades", "Hud"],
    expone: [] as string[],
    eventos: { escucha: ["voz:habla", "voz:estado", "depura:lineas"], emite: ["corro:estado"] },
    bandera: { defecto: true, url: "corro" },
    // DOM en pantalla; halos e iconos instanciados (2 llamadas, 2 triángulos cada instancia: como mucho 4 halos y 8 iconos; dos lienzos de 128 × 128) solo con algo
    // que enseñar; en VR, como mucho una lámina a la vez (el aviso, 1000 × 1300 sin mipmaps ≈ 5,2 MB; la invitación ≈ 1 MB): 1 llamada, 2 triángulos
    presupuesto: { llamadas: 3, triangulos: 26, texturasMB: 6 },
    fases: { mundo: 0, tarde: 0.25 },
    mundos: "todos" as const,   // A3-6b: de todo mundo (COMPONENTES §3.2)
    monta: function (n: any) { return creaCorro(dp, n, n.api("red-salas"), n.api("presencia-compartida"), n.api("voz-guiada")); },
    actualiza: { mundo: function (dt: number, _t: number, api: any) { api.mundo(dt); }, tarde: function (dt: number, _t: number, api: any) { api.tarde(dt); } },
    libera: function (api: any) { if (api) api.libera(); }
  };
}
export type Corro = ReturnType<typeof creaCorro>;
