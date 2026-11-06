// Las ventanas (doc/sistema/UX-FINCA-JUEGO.md §4.4, decisión 87; MU5-n, A3-7a: antes apps/web/motor/32_ventanas.js, que queda como talón): una grande a la vez, no
// modales; lateral bajo la barra en escritorio, hoja inferior en móvil vertical, lateral alto en móvil horizontal. Al abrir, el foco va al título; al cerrar, vuelve
// a quien la abrió. Componente «ventanas» de TODOS los mundos (son de la página): su libera() cierra la abierta, saca las ventanas registradas por otros, devuelve
// el recorrido a su ventana, quita todas sus escuchas (pestañas, ×, teclado, «Terminar», la ventana) y desconecta el observador del recorrido. Código movido tal
// cual (solo se tipan parámetros y variables, y «x.addEventListener(» pasa a «escucha(x, »); lo que el legado reescribe o declara después entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_VENTANAS = "ventanas";

/** Lo que el talón de 32 le da: $ (01_datos), el lienzo y el visor (03_escena); por getter, paseando (12_paseo, cambia) y Movibles (34, se monta después) */
export interface DepsVentanas { $(id: string): T; lienzo: T; visor: T; readonly paseando: boolean; readonly Movibles: T; ventana: T; documento: T }

  // ---------- las ventanas (doc/sistema/UX-FINCA-JUEGO.md §4.4, decisión 87): una grande a la vez, no modales (el mundo sigue vivo y se puede andar con el
  // teclado). Lateral bajo la barra en escritorio; hoja inferior (≤ 72 % del alto) en móvil vertical, que esconde la cruceta; lateral alto en móvil horizontal,
  // que esconde solo las acciones. Al abrir, el foco va al título; al cerrar, vuelve a quien la abrió.
  // Los nodos de antes se movieron dentro de las ventanas en la plantilla (13_parcelas.js, 15_tiempo.js, 14_historia.js y 10_ndvi.js no cambian).
  // Historia: al empezar el recorrido, la ventana se cierra y la escena sigue en una tarjeta arriba (#tarjetaRecorrido), como un registro de misiones.
  // Gente: la presencia compartida (38_presencia_compartida.js) pinta la lista dentro de #ventanaGente (aquí pasa a su cuerpo); si no la pinta, al abrirla se mete el panel (#presenciaGente) y al cerrarla vuelve.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_ventanas.test.js)
export var VentanasPuro: T = (function () {
    var IDS: T = { mapa: "ventanaMapa", capas: "ventanaCapas", tiempo: "ventanaTiempo", historia: "ventanaHistoria", gente: "ventanaGente", ayuda: "ventanaAyuda" };
    // la forma de la ventana según el tamaño del visor (los mismos cortes que la barra: ≤ 560 px de ancho o ≤ 460 de alto)
    function forma(ancho?: T, alto?: T) { return ancho <= 560 ? "hoja" : alto <= 460 ? "alto" : "lateral"; }
    // la pestaña siguiente con el patrón ARIA (flechas, Inicio, Fin); −1 si la tecla no es de pestañas
    function pestanaSig(tecla?: T, i?: T, n?: T) {
      return tecla === "ArrowRight" || tecla === "ArrowDown" ? (i + 1) % n : tecla === "ArrowLeft" || tecla === "ArrowUp" ? (i + n - 1) % n : tecla === "Home" ? 0 : tecla === "End" ? n - 1 : -1;
    }
    return { IDS: IDS, forma: forma, pestanaSig: pestanaSig };
  })();
  // [puro:fin]
export function creaVentanas(dp: DepsVentanas) {
  var window: T = dp.ventana, document: T = dp.documento, sol = creaSoltador(), escucha = sol.escucha;

  var Ventanas: T = (function () {
    var actual: T = null, vuelta: T = null, gente: T = { nodo: null, padre: null, sig: null }, extra: T = {};
    function el(id?: T) { return dp.$(VentanasPuro.IDS[id] || extra[id] || ""); }
    function marcaIconos(id?: T, si?: T) { Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="' + id + '"][aria-expanded]'), function (b?: T) { b.setAttribute("aria-expanded", String(si)); }); }
    function revisaFlotantes() { if (typeof dp.Movibles !== "undefined" && dp.Movibles && dp.Movibles.revisa) setTimeout(function () { dp.Movibles.revisa(); }, 0); }
    function formaVisor() {
      var f: T = VentanasPuro.forma(dp.visor.clientWidth, dp.visor.clientHeight);
      ["hoja", "alto", "lateral"].forEach(function (k?: T) { dp.visor.classList.toggle("forma-" + k, k === f); });
      dp.visor.classList.toggle("con-ventana", !!actual); dp.visor.classList.toggle("con-hoja", !!actual && f === "hoja"); dp.visor.classList.toggle("con-lateral", !!actual && f === "alto");
    }
    function meteGente() {   // la presencia (38_presencia_compartida.js) pinta la lista en #ventanaGente: se pasa a su cuerpo; si no hay lista, entra el panel de la presencia mientras está abierta
      var vg: T = dp.$("ventanaGente"), cu: T = dp.$("ventanaGenteCuerpo"), pg: T = dp.$("presenciaGente");
      if (vg && cu) Array.prototype.slice.call(vg.children).forEach(function (h?: T) { if (h !== cu && h.tagName !== "HEADER") cu.appendChild(h); });
      if (!cu || !pg || cu.contains(pg) || cu.children.length) return;
      gente.nodo = pg; gente.padre = pg.parentNode; gente.sig = pg.nextSibling; cu.appendChild(pg);
    }
    function sacaGente() {
      var g: T = gente; if (!g.nodo || !g.padre) return;
      if (document.contains(g.padre)) g.padre.insertBefore(g.nodo, g.sig && g.sig.parentNode === g.padre ? g.sig : null);
      gente.nodo = gente.padre = gente.sig = null;
    }
    function abre(id?: T, desde?: T) {
      var v: T = el(id); if (!v) return false;
      if (actual === id) { var t0: T = v.querySelector("h2"); if (t0) t0.focus({ preventScroll: true }); return true; }
      if (actual) cierra(true);
      vuelta = desde || (document.activeElement !== document.body ? document.activeElement : null);
      actual = id; if (id === "gente") meteGente();
      v.hidden = false; marcaIconos(id, true); formaVisor();
      var t: T = v.querySelector("h2"); if (t) t.focus({ preventScroll: true });
      revisaFlotantes(); return true;
    }
    function cierra(sinFoco?: T) {
      if (!actual) return false;
      var v: T = el(actual); if (v) v.hidden = true; marcaIconos(actual, false);
      if (actual === "gente") sacaGente();
      actual = null; formaVisor();
      var b: T = vuelta; vuelta = null;
      if (!sinFoco && b && b.focus && document.contains(b) && b.getClientRects().length) b.focus({ preventScroll: true });
      else if (!sinFoco && dp.paseando) dp.lienzo.focus({ preventScroll: true });
      revisaFlotantes(); return true;
    }
    // pestañas dentro de una ventana (Tiempo: Ahora / Próximas 72 h / El olivo)
    function eligePestana(t?: T, foco?: T) {
      var lista: T = t.closest('[role="tablist"]'); if (!lista) return;
      Array.prototype.forEach.call(lista.querySelectorAll('[role="tab"]'), function (p?: T) { var si: T = p === t; p.setAttribute("aria-selected", String(si)); p.tabIndex = si ? 0 : -1; var pnl: T = dp.$(p.getAttribute("aria-controls")); if (pnl) pnl.hidden = !si; });
      if (foco) t.focus();
    }
    function pestana(nombre?: T) { var t: T = document.querySelector('.ventana [role="tab"][data-pestana="' + nombre + '"]'); if (t) eligePestana(t, false); }
    Array.prototype.forEach.call(document.querySelectorAll('.ventana [role="tablist"]'), function (lista?: T) {
      var tabs: T = Array.prototype.slice.call(lista.querySelectorAll('[role="tab"]'));
      tabs.forEach(function (t?: T, i?: T) {
        escucha(t, "click", function () { eligePestana(t, false); });
        escucha(t, "keydown", function (e?: T) { var j: T = VentanasPuro.pestanaSig(e.key, i, tabs.length); if (j < 0) return; e.preventDefault(); e.stopPropagation(); eligePestana(tabs[j], true); });
      });
    });
    // la × de cada ventana; y en una ventana, escribir o usar sus controles no mueve al paseante (las flechas mueven un deslizador, no a la persona)
    Array.prototype.forEach.call(document.querySelectorAll(".ventana"), function (v?: T) {
      Array.prototype.forEach.call(v.querySelectorAll("[data-cierra]"), function (b?: T) { escucha(b, "click", function () { cierra(); }); });
      escucha(v, "keydown", function (e?: T) { var t: T = e.target && e.target.tagName; if ((t === "INPUT" || t === "SELECT" || t === "TEXTAREA") && e.key !== "Escape") e.stopPropagation(); });
    });

    // --- el recorrido de la historia en su tarjeta: 14_historia.js enseña y esconde #hCuerpo; aquí se muda de la ventana a la tarjeta y vuelve
    var hc: T = dp.$("hCuerpo"), tarjeta: T = dp.$("tarjetaRecorrido"), casaH: T = hc && hc.parentNode;
    function mudaRecorrido() {
      if (!hc || !tarjeta) return;
      if (!hc.hidden && hc.parentNode !== tarjeta) { if (actual === "historia") cierra(true); tarjeta.appendChild(hc); tarjeta.hidden = false; if (dp.$("hSig")) dp.$("hSig").focus({ preventScroll: true }); revisaFlotantes(); }
      else if (hc.hidden && hc.parentNode === tarjeta) { casaH.appendChild(hc); tarjeta.hidden = true; revisaFlotantes(); }
    }
    if (hc && window.MutationObserver) sol.observa(new MutationObserver(mudaRecorrido)).observe(hc, { attributes: true, attributeFilter: ["hidden"] });
    var rc: T = dp.$("recCerrar"); if (rc) escucha(rc, "click", function () { dp.$("hFin").click(); });

    // --- punto de extensión (ADR-0023, C2): un componente registra su ventana. Ventanas.registra(id, { titulo, construye(cuerpo) }) crea una ventana como las
    // de la plantilla (cabecera con su título enfocable y ×, cuerpo), la mete junto a las demás y la abre y cierra igual (una a la vez, foco, Esc). Devuelve
    // quita (la cierra si está abierta y la saca). Un id que ya existe (los seis de la plantilla u otro registrado) no se registra: devuelve null.
    function registra(id?: T, def?: T) {
      if (!def || !/^[a-z][a-z0-9-]*$/.test(id) || VentanasPuro.IDS[id] || extra[id]) return null;
      var hermana: T = dp.$(VentanasPuro.IDS.ayuda), casa: T = hermana ? hermana.parentNode : dp.visor, eid: T = "ventana-" + id;
      var v: T = document.createElement("section"), cab: T = document.createElement("header"), h: T = document.createElement("h2"), x: T = document.createElement("button"), cu: T = document.createElement("div");
      v.className = "ventana"; v.id = eid; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "false"); v.setAttribute("aria-labelledby", eid + "-t"); v.hidden = true;
      h.id = eid + "-t"; h.tabIndex = -1; h.textContent = def.titulo || id; x.type = "button"; x.className = "cerrar"; x.setAttribute("data-cierra", ""); x.setAttribute("aria-label", "Cerrar"); x.textContent = "×";
      cu.className = "cuerpo"; cab.appendChild(h); cab.appendChild(x); v.appendChild(cab); v.appendChild(cu);
      escucha(x, "click", function () { cierra(); });
      escucha(v, "keydown", function (e?: T) { var t: T = e.target && e.target.tagName; if ((t === "INPUT" || t === "SELECT" || t === "TEXTAREA") && e.key !== "Escape") e.stopPropagation(); });
      casa.appendChild(sol.nodo(v)); extra[id] = eid;   // A3-7a: libera() la saca
      try { if (def.construye) def.construye(cu); } catch (e: T) { try { console.error("[Ventanas] " + id, e); } catch (e2: T) {} }
      return function () { if (actual === id) cierra(true); delete extra[id]; if (v.parentNode) v.parentNode.removeChild(v); };
    }

    escucha(window, "resize", formaVisor); formaVisor();
    // A3-7a: libera() cierra la abierta (sin mover el foco), devuelve el recorrido a su ventana y suelta lo apuntado (escuchas, observador y las ventanas registradas)
    function libera() {
      if (actual) cierra(true);
      if (hc && tarjeta && hc.parentNode === tarjeta) { casaH.appendChild(hc); tarjeta.hidden = true; }
      sol.suelta(); extra = {};
    }
    return {
      abre: abre, cierra: function () { return cierra(false); }, abierta: function () { return actual; }, pestana: pestana,
      recorrido: function () { return !!(tarjeta && !tarjeta.hidden); }, registra: registra, libera: libera
    };
  })();
  return Ventanas;
}
export type Ventanas = ReturnType<typeof creaVentanas>;

/** El componente «ventanas» (solo ciclo de vida; de todos los mundos): lo registra el talón de 32 con Componentes.registra */
export function manifiestoVentanas(api: { libera(): void }): Manifiesto {
  return {
    id: ID_VENTANAS, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
