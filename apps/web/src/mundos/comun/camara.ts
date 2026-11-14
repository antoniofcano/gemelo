// La cámara orbital y los gestos de la vista aérea (MU5-n, A3-6c; antes apps/web/motor/09_camara.js, que queda como talón): girar, acercar y desplazar con el ratón o los dedos, el toque corto
// que elige lo que hay debajo (Usables, C7) o, paseando, echa a andar hasta allí (IrA, 12c), los botones de modo (Nube, Gemelo, Ortofoto), las capas y los deslizadores de exageración y
// corrección. La sensibilidad y el eje invertido salen de Configuración → Controles (33_ajustes; sin ella, 1× y sin invertir).
// Componente «camara» de TODOS los mundos (la vista y sus gestos son de todo mundo). Su libera() quita las escuchas del lienzo, de los botones de modo, de las capas y de los deslizadores.
// Código movido tal cual (solo se tipan los parámetros); lo que el legado reescribe o declara después (paseando, kcor, IrA, parcelaSel, elegirParcela, Ajustes) entra por función.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_CAMARA = "camara-orbital";

// [puro:inicio] L6-04: el teclado de la vista aérea (sin THREE ni DOM). Flechas o WASD desplazan; Mayús + ↑/↓ (o W/S) inclinan; + y − (o Re Pág y Av Pág) acercan
// y alejan; Q y E giran. No hace nada paseando (las teclas son del paseo), con Ctrl, Alt o Cmd, con el foco en un campo, dentro de una ventana, la ficha, un menú o
// unas pestañas (allí las flechas son suyas: desplazar, cambiar de pestaña), si otro ya usó la tecla (defaultPrevented) ni, con el recorrido de la historia, las
// flechas (son «escena anterior y siguiente»). Devuelve la acción o null.
export var TecladoAereo = (function () {
  var PASO = 40, GIRO = 0.08, INCL = 0.05, ZOOM = 0.1;   // el paso en «píxeles de arrastre» (pan), radianes y fracción de la distancia
  var MOV: Record<string, [number, number]> = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [1, 0], KeyA: [1, 0], ArrowRight: [-1, 0], KeyD: [-1, 0] };
  var ACERCA: Record<string, number> = { PageUp: -1, NumpadAdd: -1, Equal: -1, PageDown: 1, NumpadSubtract: 1, Minus: 1 };
  function accion(t: T, est: T) {
    if (!t || est.paseando || t.ctrl || t.meta || t.alt || est.campo || est.panel || est.prevenido) return null;
    if (/^Arrow/.test(t.code) && est.recorrido) return null;
    if (est.sinAtajos && (/^(Key[A-Z]|Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(t.code) || t.key === "+" || t.key === "-")) return null;   // L6-20: quedan las flechas y Re Pág / Av Pág
    var m = MOV[t.code];
    if (m) { if (t.shift && m[1]) return { incl: m[1] * INCL }; return { pan: [m[0] * PASO, m[1] * PASO] }; }
    if (t.key === "+" || t.key === "-") return { zoom: t.key === "+" ? -ZOOM : ZOOM };
    if (ACERCA[t.code]) return { zoom: ACERCA[t.code]! * ZOOM };
    if (t.code === "KeyQ") return { giro: GIRO };
    if (t.code === "KeyE") return { giro: -GIRO };
    return null;
  }
  return { accion: accion, PASO: PASO, GIRO: GIRO, INCL: INCL, ZOOM: ZOOM };
})();
// [puro:fin]

export interface DepsCamara {
  THREE: T; camera: T; lienzo: T; Estado: T; $(id: string): T; fmt(n: number, dec?: number): string; DIST_MAX: number; DIST_INI: number; Usables: T;
  /** 08_marcadores (antes) */ aplica(): void; capas(): void; aplicaLuego(): void;
  /** lo que cambia o se declara después: 12_paseo, 02_mundo (kcor, que se escribe), 12c, 13_parcelas, 33_ajustes */
  paseando(): boolean; ponKcor(v: number): void; IrA(): T; parcelaSel(): number; elegirParcela(i: number): void; Ajustes(): T;
  /** L6-04: la ventana donde se escucha el teclado de la vista aérea (sin ella, no hay teclado) y si el recorrido de la historia está en marcha (sus flechas) */
  ventana?: T; recorrido?(): boolean;
}

export function creaCamara(d: DepsCamara) {
  var THREE = d.THREE, camera = d.camera, lienzo = d.lienzo, Estado = d.Estado, $ = d.$, fmt = d.fmt, DIST_MAX = d.DIST_MAX, DIST_INI = d.DIST_INI, Usables = d.Usables;
  var aplica = d.aplica, capas = d.capas, aplicaLuego = d.aplicaLuego, paseando = d.paseando, ponKcor = d.ponKcor, parcelaSel = d.parcelaSel, elegirParcela = d.elegirParcela;
  var IrA = { toca: function (cx: T, cy: T, mov: T, ms: T, tipo: T) { return d.IrA().toca(cx, cy, mov, ms, tipo); } };   // 12c se monta después
  var escuchas: (() => void)[] = [];   // A3-6c: las escuchas de la vista, para quitarlas en libera()
  function escucha(o: T, tipo: string, fn: T, opc?: T) { if (!o) return; o.addEventListener(tipo, fn, opc); escuchas.push(function () { o.removeEventListener(tipo, fn, opc); }); }
  // cámara orbital
  var objetivo = new THREE.Vector3(0, 12, 0), orb = { az: -0.55, el: 0.62, dist: DIST_INI }, orbIni = JSON.parse(JSON.stringify(orb));
  function camara() { var ce = Math.cos(orb.el), se = Math.sin(orb.el); camera.position.set(objetivo.x + orb.dist * ce * Math.sin(orb.az), objetivo.y + orb.dist * se, objetivo.z + orb.dist * ce * Math.cos(orb.az)); camera.lookAt(objetivo); }
  // Configuración → Controles (33_ajustes.js): sensibilidad al mirar y eje vertical invertido; sin 33_ajustes.js, 1× y sin invertir
  function sinAtajos() { var A = d.Ajustes(); try { return !!(A && A.atajos && !A.atajos()); } catch (e) { return false; } }   // L6-20
  function sensMirar() {
    var k = 1, y = 1;
    var Ajustes = d.Ajustes(); try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { k = Number(Ajustes.lee("controles.sens")) || 1; y = Ajustes.lee("controles.invertir") ? -1 : 1; } } catch (e) { /* sin Configuración: 1× y sin invertir */ }
    return { k: k, y: y };
  }
  var punteros: T = {}, movido = 0;
  var toquePaseo: T = null;   // en el paseo no se gira la vista con el dedo, pero un toque corto elige lo que haya debajo (olivo, baliza…)
  escucha(lienzo, "pointerdown", function (e: T) {
    if (paseando()) { toquePaseo = { x: e.clientX, y: e.clientY, t: performance.now(), mov: 0 }; return; }
    lienzo.setPointerCapture(e.pointerId); punteros[e.pointerId] = { x: e.clientX, y: e.clientY }; movido = 0; });
  escucha(lienzo, "pointermove", function (e: T) {
    if (paseando()) { if (toquePaseo) toquePaseo.mov = Math.max(toquePaseo.mov, Math.hypot(e.clientX - toquePaseo.x, e.clientY - toquePaseo.y)); return; }
    var p = punteros[e.pointerId]; if (!p) return;
    var ids: T = Object.keys(punteros), dx = e.clientX - p.x, dy = e.clientY - p.y; movido += Math.abs(dx) + Math.abs(dy);
    if (ids.length === 1) { if (e.shiftKey || e.buttons === 2) pan(dx, dy); else { var se = sensMirar(); orb.az -= dx * 0.006 * se.k; orb.el = Math.max(0.08, Math.min(1.5, orb.el + dy * 0.006 * se.k * se.y)); } }
    else if (ids.length === 2) { var o = punteros[ids.filter(function (i: T) { return i != e.pointerId; })[0]]; var antes = Math.hypot(p.x - o.x, p.y - o.y), ahora = Math.hypot(e.clientX - o.x, e.clientY - o.y); orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (antes / Math.max(ahora, 1)))); pan(dx / 2, dy / 2); }
    p.x = e.clientX; p.y = e.clientY;
  });
  function suelta(e: T) {
    if (paseando()) { var q = toquePaseo; toquePaseo = null; if (q && e.type === "pointerup" && Math.hypot(e.clientX - q.x, e.clientY - q.y) < 10 && performance.now() - q.t < 600) { var mov = Math.max(q.mov, Math.hypot(e.clientX - q.x, e.clientY - q.y)), ms = performance.now() - q.t; if (!elige(e.clientX, e.clientY)) IrA.toca(e.clientX, e.clientY, mov, ms, e.pointerType); } return; }   // sin nada elegido debajo, el toque corto va andando (12c_ir_a.js)
    var tocar = Object.keys(punteros).length === 1 && movido < 6; delete punteros[e.pointerId]; if (tocar && e.type === "pointerup") elige(e.clientX, e.clientY); }
  escucha(lienzo, "pointerup", suelta); escucha(lienzo, "pointercancel", suelta); escucha(lienzo, "contextmenu", function (e: T) { e.preventDefault(); });
  escucha(lienzo, "wheel", function (e: T) { e.preventDefault(); if (paseando()) return; orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  // L6-04 y L6-22: el teclado de la vista aérea (TecladoAereo) y el lienzo como parada de tabulación con función (antes solo la tenía al pasear)
  lienzo.tabIndex = 0;
  var PANEL = ".ventana, .ficha, dialog, [role=dialog], [role=alertdialog], [role=menu], [role=tablist], .tarjeta-rec";
  escucha(d.ventana, "keydown", function (e: T) {
    var el = e.target, tag = el && el.tagName;
    var a = TecladoAereo.accion({ code: e.code, key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey },
      { paseando: paseando(), campo: tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !!(el && el.isContentEditable), panel: !!(el && el.closest && el.closest(PANEL)),
        prevenido: !!e.defaultPrevented, recorrido: !!(d.recorrido && d.recorrido()), sinAtajos: sinAtajos() });
    if (!a) return;
    e.preventDefault();
    if (a.pan) pan(a.pan[0], a.pan[1]);
    else if (a.incl) orb.el = Math.max(0.08, Math.min(1.5, orb.el + a.incl));
    else if (a.zoom) orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (1 + a.zoom)));
    else if (a.giro) orb.az += a.giro;
  });
  function pan(dx: T, dy: T) { var f = orb.dist * 0.0016, rx = Math.cos(orb.az), rz = -Math.sin(orb.az); objetivo.x -= dx * f * rx; objetivo.z -= dx * f * rz; objetivo.x += dy * f * Math.sin(orb.az); objetivo.z += dy * f * Math.cos(orb.az); }

  // un toque corto o un clic: elige lo que haya debajo (C7: Usables, 02e_entidades.js; cada tipo de cosa del mundo dice si está bajo el dedo y gana por
  // tipo y por cercanía); sobre nada, suelta lo elegido y cierra la ficha
  function elige(cx: T, cy: T) { return Usables.toque(cx, cy); }

  function pon(m: T) { Estado.modo = m; ["Nube", "Gem", "Orto"].forEach(function (n: T) { $("m" + n).setAttribute("aria-pressed", String((n === "Nube" && m === "nube") || (n === "Gem" && m === "gem") || (n === "Orto" && m === "orto"))); }); aplica(); }
  escucha($("mNube"), "click", function () { pon("nube"); }); escucha($("mGem"), "click", function () { pon("gem"); }); escucha($("mOrto"), "click", function () { pon("orto"); });
  ["cLinde", "cCopas", "cMarc", "cDesf"].forEach(function (id: T) { escucha($(id), "change", capas); });
  escucha($("exag"), "input", function (e: T) { Estado.exag = Number(e.target.value); $("exagV").textContent = fmt(Estado.exag, Estado.exag % 1 ? 2 : 0) + "×"; aplicaLuego(); });
  escucha($("corr"), "input", function (e: T) { var kcor = Number(e.target.value); ponKcor(kcor); $("corrV").textContent = fmt(kcor, kcor % 1 ? 2 : 0) + "×"; aplicaLuego(); });   // kcor es de 02_mundo: se escribe por función
  escucha($("reiniciar"), "click", function () { elegirParcela(parcelaSel()); });

  function libera() { escuchas.splice(0).forEach(function (f) { f(); }); }
  return { objetivo: objetivo, orb: orb, camara: camara, sensMirar: sensMirar, pon: pon, libera: libera, TecladoAereo: TecladoAereo };
}
export type Camara = ReturnType<typeof creaCamara>;

/** El componente «camara-orbital» (solo ciclo de vida; de todos los mundos): lo registra el talón de 09 con Componentes.registra */
export function manifiestoCamara(api: { libera(): void }): Manifiesto {
  return {
    id: ID_CAMARA, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
