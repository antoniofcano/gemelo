// La página ES el visor (decisión 83; MU5-n, A3-7a: antes la primera mitad de apps/web/motor/24_pantalla.js, que queda como talón): el menú (☰ o Esc), un <dialog>
// nativo y modal con pestañas ARIA, y la pantalla completa de verdad (⛶ o F: Fullscreen API y, en Chrome y Edge de escritorio, Keyboard Lock para Esc). Componente
// «menu-pantalla» de TODOS los mundos (son de la página): su libera() cierra el menú si está abierto, suelta el bloqueo de Esc y quita sus escuchas (pestañas, el
// diálogo, «Volver», «Vista aérea», ☰, la atribución, ⛶ y los cambios de pantalla completa del documento). Código movido tal cual (solo se tipan parámetros y
// variables, y «x.addEventListener(» pasa a «escucha(x, »); lo que el legado reescribe o declara después (paseando, Hud, tamano) entra por getter.
// La transición del mapa al paseo (TR), que vivía en el mismo módulo, es de la locomoción: está en apps/web/src/mundos/comun/transicion.ts.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_MENU_PANTALLA = "menu-pantalla";

/** Lo que el talón de 24 le da: $ (01_datos); por getter, paseando (12_paseo), Hud (31) y tamano (90_final), que cambian o se declaran después */
export interface DepsPantalla { $(id: string): T; readonly paseando: boolean; readonly Hud: T; readonly tamano: () => void; ventana: T; documento: T }

export function creaPantalla(dp: DepsPantalla) {
  var window: T = dp.ventana, document: T = dp.documento, navigator: T = window.navigator, sol = creaSoltador(), escucha = sol.escucha;
  // ---------- la página ES el visor (decisión 83): el menú (☰ o Esc) y la pantalla completa de verdad
  // El menú es un <dialog> nativo y modal: atrapa el foco y Esc lo cierra solo. Pestañas con el patrón ARIA (flechas, Inicio, Fin).
  // Configuración la rellena 33_ajustes.js (#menuAjustes); Créditos y «Acerca de la finca» vienen escritos en la plantilla.
  var Menu: T = (function () {
    var dlg: T = dp.$("menu"), pestanas: T = dlg ? Array.prototype.slice.call(dlg.querySelectorAll('#menuPestanas [role="tab"]')) : [], vuelta: T = null;
    var NOMBRE: T = { ajustes: "menuPestAjustes", creditos: "menuPestCreditos", finca: "menuPestFinca" };
    function eligePest(t?: T, foco?: T) {
      pestanas.forEach(function (p?: T) { var si: T = p === t; p.setAttribute("aria-selected", String(si)); p.tabIndex = si ? 0 : -1; var pnl: T = dp.$(p.getAttribute("aria-controls")); if (pnl) pnl.hidden = !si; });
      if (foco) t.focus();
    }
    function abre(cual?: T) {
      if (!dlg) return;
      if (!dlg.open) { vuelta = document.activeElement; try { dlg.showModal(); } catch (e: T) { dlg.setAttribute("open", ""); } }
      var t: T = dp.$(NOMBRE[cual] || "") || pestanas.filter(function (p?: T) { return p.getAttribute("aria-selected") === "true"; })[0] || pestanas[0];
      if (t) eligePest(t, true);
    }
    function cierra() { if (dlg && dlg.open) dlg.close(); }
    if (dlg) {
      pestanas.forEach(function (p?: T, i?: T) {
        escucha(p, "click", function () { eligePest(p, false); });
        escucha(p, "keydown", function (e?: T) {
          var k: T = e.key, n: T = pestanas.length, j: T = k === "ArrowDown" || k === "ArrowRight" ? (i + 1) % n : k === "ArrowUp" || k === "ArrowLeft" ? (i + n - 1) % n : k === "Home" ? 0 : k === "End" ? n - 1 : -1;
          if (j < 0) return; e.preventDefault(); e.stopPropagation(); eligePest(pestanas[j], true);
        });
      });
      escucha(dlg, "keydown", function (e?: T) { if (e.key !== "Escape") e.stopPropagation(); });   // dentro del menú, pulsar no mueve al paseante
      escucha(dlg, "close", function () { if (vuelta && vuelta.focus && document.contains(vuelta)) vuelta.focus({ preventScroll: true }); vuelta = null; });
      escucha(dlg, "click", function (e?: T) { if (e.target === dlg) cierra(); });   // un toque fuera de la caja (en el fondo) cierra
      var bv: T = dp.$("menuVolver"); if (bv) escucha(bv, "click", cierra);
      var ba: T = dp.$("menuAereo"); if (ba) escucha(ba, "click", function () { cierra(); if (dp.paseando) dp.$("btnPaseo").click(); });
      var bm: T = dp.$("bMenu"); if (bm) escucha(bm, "click", function () { abre(); });
      var at: T = dp.$("hudAtrib"); if (at) escucha(at, "click", function () { abre("creditos"); });
    }
    return { abre: abre, cierra: cierra, abierto: function () { return !!(dlg && dlg.open); } };
  })();

  // ---------- pantalla completa de verdad (⛶ o F): la página ya ocupa la ventana; esto quita además las barras del navegador (Fullscreen API, con gesto
  // del usuario). En Chrome y Edge de escritorio se pide Keyboard Lock para Esc: así Esc abre el menú y para salir hay que mantenerlo pulsado; en el resto, el
  // primer Esc saca de la pantalla completa (lo hace el navegador y la página no lo recibe). La orientación no se bloquea.
  // iPhone: Safari no tiene pantalla completa para una página; ⛶ explica «Compartir → Añadir a pantalla de inicio» (manifiesto en apps/web/public/). No probado.
  var Pantalla: T = (function () {
    var raiz: T = document.documentElement, b: T = dp.$("btnPantalla");
    function hay() { return !!(raiz.requestFullscreen || raiz.webkitRequestFullscreen); }
    function dentro() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function comoApp() { try { return (window.matchMedia && window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (e: T) { return false; } }
    function avisa(t?: T, ms?: T) { if (typeof dp.Hud !== "undefined" && dp.Hud) dp.Hud.aviso(t, ms); }
    function pinta() {
      var si: T = dentro(); if (!b) return;
      b.setAttribute("aria-pressed", String(si)); b.textContent = si ? "🗗" : "⛶";
      b.setAttribute("aria-label", si ? "Salir de la pantalla completa (F)" : "Pantalla completa (F)"); b.title = si ? "Salir de la pantalla completa · F" : "Pantalla completa · F";
    }
    function bloqueaEsc(si?: T) {
      var k: T = navigator.keyboard; if (!k) return false;
      try { if (si && k.lock) { var pr: T = k.lock(["Escape"]); if (pr && pr.catch) pr.catch(function () {}); return true; } if (!si && k.unlock) k.unlock(); } catch (e: T) {}
      return false;
    }
    function ponPantalla(si?: T) {
      if (si === undefined) si = !dentro();
      if (!hay()) {
        avisa(comoApp() ? "Ya estás a pantalla completa (modo aplicación)." : "En el iPhone, Safari no deja poner una página a pantalla completa: toca Compartir → «Añadir a pantalla de inicio» y ábrela desde allí.", 9000);
        return;
      }
      try {
        if (si && !dentro()) {
          var pr: T = raiz.requestFullscreen ? raiz.requestFullscreen({ navigationUI: "hide" }) : raiz.webkitRequestFullscreen();
          if (pr && pr.then) pr.then(function () { avisa(bloqueaEsc(true) ? "Pantalla completa: mantén pulsado Esc para salir." : "Pantalla completa: Esc o F para salir.", 3500); }, function () { avisa("El navegador no ha dejado poner la pantalla completa.", 4000); });
        } else if (!si && dentro()) { bloqueaEsc(false); var pe: T = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen(); if (pe && pe.catch) pe.catch(function () {}); }
      } catch (e: T) {}
    }
    if (b) escucha(b, "click", function () { ponPantalla(); });
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev?: T) { escucha(document, ev, function () { if (!dentro()) bloqueaEsc(false); pinta(); setTimeout(dp.tamano, 60); }); });
    pinta();
    return { pon: ponPantalla, dentro: dentro, hay: hay, comoApp: comoApp };
  })();
  // A3-7a: libera() cierra el menú (si está abierto), suelta el bloqueo de Esc y quita todas las escuchas
  function libera() { try { Menu.cierra(); } catch (e) { /* sin diálogo */ } try { var k: T = navigator.keyboard; if (k && k.unlock) k.unlock(); } catch (e) { /* sin Keyboard Lock */ } sol.suelta(); }
  return { Menu: Menu, Pantalla: Pantalla, libera: libera };
}
export type MenuPantalla = ReturnType<typeof creaPantalla>;

/** El componente «menu-pantalla» (solo ciclo de vida; de todos los mundos): lo registra el talón de 24 con Componentes.registra */
export function manifiestoPantalla(api: { libera(): void }): Manifiesto {
  return {
    id: ID_MENU_PANTALLA, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
