// El HUD (doc/sistema/UX-FINCA-JUEGO.md §4.3; MU5-n, A3-7a: antes apps/web/motor/31_hud.js, que queda como talón): el estado arriba a la izquierda (brújula, cómo te
// mueves, el tiempo), la barra de iconos arriba a la derecha, los avisos arriba en el centro, «Pasear» y la atribución abajo, el selector de modo, el teclado (1-6,
// F1, F, Inicio o 0, Intro y Esc) y los pulgares. Es HTML y CSS: no toca triángulos ni llamadas de dibujo. Componente «hud» de TODOS los mundos (es de la página):
// su libera() para los dos relojes del estado y de la brújula (L2-11: antes no los paraba nadie y seguían repintando el DOM durante la VR), quita todas sus escuchas
// (selector de modo, «⋯», barra, brújula, teclado, media query, pulgares), desconecta el observador de la barra, se borra de Configuración y saca los iconos que
// pusieron otros y los avisos a la vista. Código movido tal cual (solo se tipan parámetros y variables, y «x.addEventListener(» pasa a «escucha(x, »); lo que el
// legado reescribe o declara después (paseando, enQuad, enDron, Ventanas, Ajustes, Movibles, Menu) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_HUD = "hud-pantalla";   // no «hud»: otros módulos nombran #hud en sus cadenas (componentes.test.js mira que nadie nombre a un componente)

/** Lo que el talón de 31 le da: lo estable por valor; por getter lo que cambia (paseando, enQuad, enDron) o se declara después (Ventanas, Ajustes, Movibles, Menu) */
export interface DepsHud {
  $(id: string): T; Bus: T; THREE: T; lienzo: T; visor: T; camera: T; orb: T; pp: T; dr: T; VRX: T; ponQuad(si: boolean): void; ponDron(si: boolean): void;
  readonly paseando: boolean; readonly enQuad: boolean; readonly enDron: boolean; readonly Ventanas: T; readonly Ajustes: T; readonly Movibles: T; readonly Menu: T;
  ventana: T; documento: T;
}

  // ---------- el HUD (doc/sistema/UX-FINCA-JUEGO.md §4.3): estado arriba a la izquierda (brújula, cómo te mueves, el tiempo), barra de iconos arriba a la
  // derecha, avisos arriba en el centro, «Pasear» y la atribución abajo en el centro. Es HTML y CSS: no toca triángulos ni llamadas de dibujo.
  // El selector de modo llama a lo que ya existía (btnPaseo, ponQuad, ponDron); el botón de VR (29_vr.js lo crea junto a #btnPantalla) se muda junto al selector.
  // Expone Hud.aviso(texto, ms), Hud.zonasProhibidas() (para 34_movibles.js), Hud.modo() y Hud.alInicio() (volver a la vista aérea o al inicio de la órbita).
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_hud.test.js)
export var HudPuro: T = (function () {
    var MODOS: T = {
      aereo: { ico: "🛰", txt: "Vista aérea" }, pie: { ico: "🚶", txt: "A pie" }, quad: { ico: "🏍", txt: "Quad" }, dron: { ico: "🚁", txt: "Dron" }
    };
    // cómo te mueves ahora, de los indicadores del motor
    function modoDe(paseando?: T, enQuad?: T, enDron?: T) { return !paseando ? "aereo" : enDron ? "dron" : enQuad ? "quad" : "pie"; }
    // rumbo de la cámara en grados desde el norte (el norte del mundo es −z; el este, +x), de 0 a 360, a partir de su dirección horizontal
    function rumboCamara(dx?: T, dz?: T) { var a: T = Math.atan2(dx, -dz) * 180 / Math.PI; return (a % 360 + 360) % 360; }
    // los rectángulos que no se tapan, en coordenadas del visor (sin los vacíos ni los ocultos: ancho o alto 0)
    function zonas(elems?: T, base?: T) {
      return elems.filter(function (z?: T) { return z.r && z.r.width > 0 && z.r.height > 0; })
        .map(function (z?: T) { return { id: z.id, x: z.r.left - base.left, y: z.r.top - base.top, w: z.r.width, h: z.r.height }; });
    }
    // controles táctiles (decisión 85): el ajuste «controles.tactil» manda (si / no); en automático, la pantalla con dedo (pointer: coarse)
    function tactil(ajuste?: T, coarse?: T) { return ajuste === "si" ? true : ajuste === "no" ? false : !!coarse; }
    function zurda(mano?: T) { return mano === "zurda"; }
    // el mapa de teclas (decisión 84, §4.7): 1–6 ventanas, F1 ayuda, F pantalla completa, Inicio o 0 vista aérea, Intro pasear (en vista aérea), Esc como en
    // un juego. Las teclas de letra y número no hacen nada con el foco en un campo (WCAG 2.1.4); Intro sobre un botón es su clic; con Ctrl, Alt o Cmd, nada
    var VENT: T = { Digit1: "mapa", Digit2: "capas", Digit3: "tiempo", Digit4: "historia", Digit5: "gente", Digit6: "chat",
      Numpad1: "mapa", Numpad2: "capas", Numpad3: "tiempo", Numpad4: "historia", Numpad5: "gente", Numpad6: "chat" };
    function accionTecla(t?: T, est?: T) {
      if (t.ctrl || t.meta || t.alt) return null;
      if (t.code === "Escape") return "esc";
      if (est.campo) return null;
      if (t.code === "F1") return "v:ayuda";
      if (VENT[t.code]) return "v:" + VENT[t.code];
      if (t.code === "KeyF") return "pantalla";
      if (t.code === "Home" || t.code === "Digit0" || t.code === "Numpad0") return "aereo";
      if ((t.code === "Enter" || t.code === "NumpadEnter") && !est.paseando && !est.boton) return "pasear";
      return null;
    }
    // Esc cierra lo último abierto, en este orden; si no hay nada, abre el menú
    function ordenEsc(est?: T) { return est.desplegable ? "desplegable" : est.ficha ? "ficha" : est.baliza ? "baliza" : est.ventana ? "ventana" : est.recorrido ? "recorrido" : "menu"; }
    return { MODOS: MODOS, modoDe: modoDe, rumboCamara: rumboCamara, zonas: zonas, tactil: tactil, zurda: zurda, accionTecla: accionTecla, ordenEsc: ordenEsc };
  })();
  // [puro:fin]
export function creaHud(dp: DepsHud) {
  var window: T = dp.ventana, document: T = dp.documento, sol = creaSoltador(), escucha = sol.escucha;

  var Hud: T = (function () {
    var cont: T = dp.$("hudAvisos"), modoAct: T = "";
    function aviso(texto?: T, ms?: T) {
      if (!cont) return null;
      var d: T = document.createElement("div"); d.className = "cristal hud-aviso"; d.textContent = texto; cont.appendChild(d);
      while (cont.children.length > 3) cont.removeChild(cont.firstChild);   // como mucho tres a la vez
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 4000);
      return d;
    }
    function zonasProhibidas() {
      var base: T = dp.visor.getBoundingClientRect();
      return HudPuro.zonas(["padMov", "padAcc", "hudBarra", "hudEstado", "bPasear"].map(function (id?: T) { var e: T = dp.$(id); return { id: id, r: e && e.getClientRects().length ? e.getBoundingClientRect() : null }; }), base);
    }

    // --- el selector de modo (Vista aérea / A pie / Quad / Dron)
    var bModo: T = dp.$("hudModo"), menuModo: T = dp.$("hudModoMenu");
    function abreModo(si?: T) { if (!menuModo) return; menuModo.hidden = !si; bModo.setAttribute("aria-expanded", String(si)); if (si) { var a: T = menuModo.querySelector('[aria-checked="true"]') || menuModo.querySelector("button"); if (a) a.focus(); } }
    function ponModo(m?: T) {
      if (m === "aereo") { if (dp.paseando) dp.$("btnPaseo").click(); return; }
      if (!dp.paseando) dp.$("btnPaseo").click();   // entrar a pie primero (al entrar, el paseo guarda el vehículo)
      if (m === "pie") { if (dp.enQuad) dp.ponQuad(false); if (dp.enDron) dp.ponDron(false); }
      else if (m === "quad") { if (!dp.enQuad) dp.ponQuad(true); }
      else if (m === "dron") { if (!dp.enDron) dp.ponDron(true); }
    }
    if (bModo && menuModo) {
      escucha(bModo, "click", function () { abreModo(menuModo.hidden); });
      Array.prototype.forEach.call(menuModo.querySelectorAll("[data-modo]"), function (b?: T, i?: T, todos?: T) {
        escucha(b, "click", function () { abreModo(false); bModo.focus(); ponModo(b.getAttribute("data-modo")); });
        escucha(b, "keydown", function (e?: T) {   // patrón de menú: flechas arriba/abajo, Inicio, Fin; Esc lo cierra (31_hud: teclado)
          var n: T = todos.length, j: T = e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowUp" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
          if (j >= 0) { e.preventDefault(); e.stopPropagation(); todos[j].focus(); }
        });
      });
    }
    // --- «⋯»: en pantallas estrechas, los iconos que no caben
    var bMas: T = dp.$("bMas"), hMas: T = dp.$("hudMas");
    function abreMas(si?: T) { if (!hMas) return; hMas.hidden = !si; bMas.setAttribute("aria-expanded", String(si)); }
    if (bMas && hMas) escucha(bMas, "click", function () { abreMas(hMas.hidden); });
    // un toque fuera cierra los desplegables
    escucha(document, "pointerdown", function (e?: T) {
      if (menuModo && !menuModo.hidden && !menuModo.contains(e.target) && e.target !== bModo && !bModo.contains(e.target)) abreModo(false);
      if (hMas && !hMas.hidden && !hMas.contains(e.target) && e.target !== bMas) abreMas(false);
    }, true);
    function cierraDesplegable() {   // para Esc: devuelve true si había uno abierto
      if (menuModo && !menuModo.hidden) { abreModo(false); bModo.focus(); return true; }
      if (hMas && !hMas.hidden) { abreMas(false); bMas.focus(); return true; }
      return false;
    }

    // --- la barra: cada icono abre (o cierra) su ventana; el chat es flotante (34_movibles.js) y es de la presencia compartida (38_presencia_compartida.js)
    function alterna(id?: T, desde?: T) {
      abreMas(false);
      if (id === "chat") { dp.Bus.emite("chat:alterna", {}); return; }   // el chat flotante: minimizado (burbuja) → se abre; abierto → se minimiza (lo hace la presencia; sin ella, nada)
      if (typeof dp.Ventanas !== "undefined" && dp.Ventanas) { if (dp.Ventanas.abierta() === id) dp.Ventanas.cierra(); else dp.Ventanas.abre(id, desde); }
    }
    Array.prototype.forEach.call(document.querySelectorAll("#hud [data-abre]"), function (b?: T) {
      escucha(b, "click", function () { alterna(b.getAttribute("data-abre"), b.closest("#hudMas") ? bMas : b); if (b.hasAttribute("data-pestana") && typeof dp.Ventanas !== "undefined" && dp.Ventanas) dp.Ventanas.pestana(b.getAttribute("data-pestana")); });
    });
    var bPant: T = hMas && hMas.querySelector('[data-accion="pantalla"]'); if (bPant) escucha(bPant, "click", function () { abreMas(false); dp.$("btnPantalla").click(); });
    var chip: T = dp.$("tIns"); if (chip) escucha(chip, "click", function () { alterna("tiempo", chip); });

    // --- la brújula gira con la cámara; tocarla = mirar al norte
    var bru: T = dp.$("norte"), aguja: T = dp.$("hudAguja"), vDir: T = new dp.THREE.Vector3(), rumboAnt: T = -1;
    if (bru) escucha(bru, "click", function () {
      if (dp.VRX.on) return;
      if (dp.paseando) { if (dp.enDron) dp.dr.yaw = 0; else dp.pp.ang = 0; } else dp.orb.az = 0;   // en la órbita, con az = 0 la cámara apunta hacia −z (el norte)
    });

    // --- el botón de VR (si hay WebXR, 29_vr.js lo crea junto a #btnPantalla): se muda junto al selector de modo, siempre a la vista
    function mudaVR() {
      var b: T = dp.$("btnVR"), fila: T = bModo && bModo.parentNode; if (!b || !fila || b.parentNode === fila) return;
      fila.insertBefore(b, menuModo); b.className = "boton hud-vr"; b.textContent = "🥽 VR"; b.setAttribute("aria-label", "Entrar en VR (gafas de realidad virtual)");
    }
    var barra: T = dp.$("hudBarra"); if (barra && window.MutationObserver) sol.observa(new MutationObserver(mudaVR)).observe(barra, { childList: true });

    // --- el estado del HUD, cuatro veces por segundo (barato: solo atributos cuando cambian)
    function ponAt(el?: T, at?: T, v?: T) { if (el && el.getAttribute(at) !== v) el.setAttribute(at, v); }
    function refresca() {
      var m: T = HudPuro.modoDe(dp.paseando, dp.enQuad, dp.enDron);
      if (m !== modoAct) {
        modoAct = m; var M: T = HudPuro.MODOS[m];
        if (dp.$("hudModoIco")) dp.$("hudModoIco").textContent = M.ico; if (dp.$("hudModoTxt")) dp.$("hudModoTxt").textContent = M.txt;
        if (bModo) bModo.setAttribute("aria-label", "Cómo te mueves: " + M.txt + ". Cambiar");
        if (menuModo) Array.prototype.forEach.call(menuModo.querySelectorAll("[data-modo]"), function (b?: T) { b.setAttribute("aria-checked", String(b.getAttribute("data-modo") === m)); });
        ["aereo", "pie", "quad", "dron"].forEach(function (k?: T) { dp.visor.classList.toggle("modo-" + k, k === m); });
      }
      // gente y chat: solo en el mundo en red (la presencia compartida, 38_presencia_compartida.js, crea #presenciaGente)
      var red: T = !!dp.$("presenciaGente") || !!dp.$("ventanaGenteCuerpo") && dp.$("ventanaGenteCuerpo").children.length > 0;
      Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="gente"], #hud [data-abre="chat"]'), function (b?: T) { if (b.hidden === red) b.hidden = !red; });
      // la historia: sin recorrido para esta finca (genera_motor.mjs la oculta), sin icono
      var hi: T = dp.$("historia"), sinHist: T = hi && getComputedStyle(hi).display === "none";
      Array.prototype.forEach.call(document.querySelectorAll('#hud [data-abre="historia"]'), function (b?: T) { if (b.hidden !== !!sinHist) b.hidden = !!sinHist; });
      // la leyenda NDVI, abajo, solo con la capa o con las copas coloreadas
      var nh: T = dp.$("ndviHud"), conNdvi: T = (dp.$("cNdvi") && dp.$("cNdvi").checked) || (dp.$("cTinte") && dp.$("cTinte").checked); if (nh && nh.hidden === !!conNdvi) nh.hidden = !conNdvi;
    }
    function refrescaBrujula() {
      if (!aguja || dp.VRX.on) return;
      dp.camera.getWorldDirection(vDir); if (Math.abs(vDir.x) + Math.abs(vDir.z) < 1e-4) return;
      var r: T = Math.round(HudPuro.rumboCamara(vDir.x, vDir.z)); if (r === rumboAnt) return; rumboAnt = r;
      aguja.style.transform = "rotate(" + (-r) + "deg)";
      ponAt(bru, "aria-label", "Brújula: miras al " + ["norte", "nordeste", "este", "sudeste", "sur", "suroeste", "oeste", "noroeste"][Math.round(r / 45) % 8] + ". Toca para mirar al norte");
    }
    // --- pulgares (U5): la cruceta y las acciones solo en pantallas táctiles (o con el ajuste), cruceta a la izquierda y acciones a la derecha;
    // «mano zurda» (Configuración, 33_ajustes.js: controles.tactil y controles.mano) las cambia de lado. Si 33_ajustes.js no está, automático y diestra.
    var mmCoarse: T = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
    function ajuste(k?: T, def?: T) { try { if (typeof dp.Ajustes !== "undefined" && dp.Ajustes && dp.Ajustes.lee) { var v: T = dp.Ajustes.lee(k); if (v !== undefined && v !== null && v !== "") return v; } } catch (e: T) {} return def; }
    function aplicaPulgares() {   // los mismos atributos que pone 33_ajustes.js en <html> (data-tactil si/no, data-mano), por si no está
      var raiz: T = document.documentElement, hayAj: T = typeof dp.Ajustes !== "undefined" && dp.Ajustes && dp.Ajustes.tactil;
      var t: T = hayAj ? !!dp.Ajustes.tactil() : HudPuro.tactil(ajuste("controles.tactil", "auto"), mmCoarse && mmCoarse.matches), z: T = HudPuro.zurda(ajuste("controles.mano", "diestra"));
      var vt: T = t ? "si" : "no", vm: T = z ? "zurda" : "diestra";
      if (raiz.getAttribute("data-tactil") === vt && raiz.getAttribute("data-mano") === vm) return;
      raiz.setAttribute("data-tactil", vt); raiz.setAttribute("data-mano", vm);
      if (typeof dp.Movibles !== "undefined" && dp.Movibles && dp.Movibles.revisa) setTimeout(function () { dp.Movibles.revisa(); }, 0);   // apareció o se movió la cruceta
    }
    if (mmCoarse) { if (mmCoarse.addEventListener) escucha(mmCoarse, "change", aplicaPulgares); else if (mmCoarse.addListener) mmCoarse.addListener(aplicaPulgares); }
    sol.espera(setTimeout(function () {   // tras montar todos los módulos: 33_ajustes.js va después de este
      try { if (typeof dp.Ajustes !== "undefined" && dp.Ajustes && dp.Ajustes.alCambiar) sol.quita(dp.Ajustes.alCambiar(function (k?: T) { if (!k || k === "controles.tactil" || k === "controles.mano") aplicaPulgares(); })); } catch (e: T) {}
      aplicaPulgares();
    }, 0));
    aplicaPulgares();

    // --- el teclado (U7)
    function visible(el?: T) { return !!(el && !el.hidden && el.getClientRects().length); }
    function esc() {
      var V: T = typeof dp.Ventanas !== "undefined" && dp.Ventanas ? dp.Ventanas : null, bal: T = dp.$("baliza");
      var q: T = HudPuro.ordenEsc({ desplegable: (menuModo && !menuModo.hidden) || (hMas && !hMas.hidden), ficha: visible(dp.$("ficha")), baliza: visible(bal) && !!bal.querySelector(".cerrar-baliza"),
        ventana: !!(V && V.abierta()), recorrido: !!(V && V.recorrido()) });
      if (q === "desplegable") cierraDesplegable();
      else if (q === "ficha") { dp.$("ficha").hidden = true; if (dp.paseando) dp.lienzo.focus({ preventScroll: true }); }
      else if (q === "baliza") bal.querySelector(".cerrar-baliza").click();
      else if (q === "ventana") V.cierra();
      else if (q === "recorrido") dp.$("hFin").click();
      else if (typeof dp.Menu !== "undefined" && dp.Menu) dp.Menu.abre();
    }
    function alInicio() { if (dp.paseando) dp.$("btnPaseo").click(); else dp.$("reiniciar").click(); }   // Inicio o 0, y «Volver» de lo tuyo (31b_hud_personal.js)
    escucha(window, "keydown", function (e?: T) {
      if (dp.VRX.on || (typeof dp.Menu !== "undefined" && dp.Menu && dp.Menu.abierto())) return;   // el menú es un <dialog>: Esc lo cierra él solo
      var el: T = e.target, t: T = el && el.tagName;
      var a: T = HudPuro.accionTecla({ code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
        { campo: t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || !!(el && el.isContentEditable), paseando: dp.paseando, boton: t === "BUTTON" || t === "A" || t === "SUMMARY" });
      if (!a || (e.repeat && a !== "esc")) return;
      e.preventDefault();
      if (a === "esc") esc();
      else if (a.indexOf("v:") === 0) alterna(a.slice(2), null);
      else if (a === "pantalla") dp.$("btnPantalla").click();
      else if (a === "aereo") alInicio();
      else if (a === "pasear") dp.$("btnPaseo").click();
    });

    // --- punto de extensión (ADR-0023, C2): un componente pone su icono en la barra, antes de «⋯», y su copia en «⋯» (en pantallas estrechas se ve allí si
    // es de prioridad 2). def = { id, ico, txt, tecla?, prio? (1 | 2), ventana? (id de Ventanas: abre y cierra esa ventana) o alPulsar?(boton) }. Devuelve quita.
    function icono(def?: T) {
      var bar: T = dp.$("hudBarra"); if (!bar || !def || !def.id || !def.ico || !def.txt || dp.$("hudIco-" + def.id)) return function () {};
      var et: T = def.txt + (def.tecla ? " (" + def.tecla + ")" : ""), b: T = document.createElement("button"), m: T = document.createElement("button"), bi: T = document.createElement("b");
      b.type = "button"; b.id = "hudIco-" + def.id; b.className = "boton icono"; b.setAttribute("data-prio", String(def.prio === 1 ? 1 : 2)); b.setAttribute("aria-label", et); b.title = def.txt + (def.tecla ? " · " + def.tecla : ""); b.textContent = def.ico;
      m.type = "button"; m.className = "boton"; bi.setAttribute("aria-hidden", "true"); bi.textContent = def.ico; m.appendChild(bi); m.appendChild(document.createTextNode(def.txt));
      if (def.ventana) [b, m].forEach(function (x?: T) { x.setAttribute("data-abre", def.ventana); x.setAttribute("aria-expanded", "false"); });
      function pulsa(desde?: T) { if (def.ventana) alterna(def.ventana, desde); else { abreMas(false); if (def.alPulsar) def.alPulsar(desde); } }
      escucha(b, "click", function () { pulsa(b); }); escucha(m, "click", function () { pulsa(bMas); });
      bar.insertBefore(sol.nodo(b), bMas && bMas.parentNode === bar ? bMas : null); if (hMas) hMas.appendChild(sol.nodo(m));   // A3-7a: libera() los saca
      return function () { [b, m].forEach(function (x?: T) { if (x.parentNode) x.parentNode.removeChild(x); }); };
    }

    sol.intervalo(setInterval(refresca, 250)); sol.intervalo(setInterval(refrescaBrujula, 100)); refresca(); mudaVR();   // L2-11: libera() los para
    // A3-7a: libera() para los relojes, quita las escuchas, el observador y la suscripción a Configuración, saca los iconos registrados y los avisos a la vista
    function libera() { sol.suelta(); if (cont) while (cont.firstChild) cont.removeChild(cont.firstChild); }
    return { aviso: aviso, zonasProhibidas: zonasProhibidas, modo: function () { return modoAct; }, cierraDesplegable: cierraDesplegable, alterna: alterna, ponModo: ponModo, icono: icono, alInicio: alInicio, libera: libera };
  })();
  return Hud;
}
export type Hud = ReturnType<typeof creaHud>;

/** El componente «hud» (solo ciclo de vida; de todos los mundos): lo registra el talón de 31 con Componentes.registra */
export function manifiestoHud(api: { libera(): void }): Manifiesto {
  return {
    id: ID_HUD, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: ["chat:alterna"] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
