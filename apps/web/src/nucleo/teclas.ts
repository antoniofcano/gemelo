// Las teclas de los componentes (ADR-0023, doc/sistema/COMPONENTES.md §3). MU5-n (A3-8a): antes vivían en apps/web/motor/02c_componentes.js, que queda de
// talón (`var Teclas = Nucleo.creaTeclas({ ventana, consola })`). Una sola escucha en la ventana: Teclas.registra(codigo, fn, dueño) → quita. Como las del
// HUD: nada con el foco en un campo, con Ctrl/Alt/Cmd ni al repetir. fn(e) devuelve false si no la ha usado (entonces no se anula lo del navegador). Las
// teclas que ya usan los módulos de siempre están reservadas: registrar una de ellas, o una ya registrada, devuelve null y no hace nada (dos dueños para una
// tecla, nunca). Nada de aquí lee globales al cargarse: la ventana (donde se escucha «keydown») y la consola entran por argumento.

/** Lo que se usa de un KeyboardEvent. */
export interface TeclaEvento { code: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean; target?: any; preventDefault(): void }
export interface DepsTeclas { ventana?: { addEventListener(tipo: string, fn: (e: any) => void): void } | null; consola?: { error(...a: unknown[]): void } | null }

export function creaTeclas(deps?: DepsTeclas) {
  var ventana = deps && deps.ventana ? deps.ventana : null, consola = deps && deps.consola ? deps.consola : null;
  var RESERVADAS: Record<string, string> = {
    Escape: "31_hud", F1: "31_hud", KeyF: "31_hud", Home: "31_hud", Enter: "31_hud", NumpadEnter: "31_hud",
    ArrowUp: "12_paseo", ArrowDown: "12_paseo", ArrowLeft: "12_paseo", ArrowRight: "12_paseo", KeyW: "12_paseo", KeyA: "12_paseo", KeyS: "12_paseo", KeyD: "12_paseo",
    ShiftLeft: "12_paseo", ShiftRight: "12_paseo", Space: "12_paseo", KeyC: "12_paseo", KeyV: "12_paseo", KeyQ: "12_paseo", KeyE: "12_paseo",
    KeyL: "12b_llegada", KeyH: "13b_hazas", KeyM: "17_minimapa"
  };
  for (var i = 0; i <= 6; i++) { RESERVADAS["Digit" + i] = "31_hud"; RESERVADAS["Numpad" + i] = "31_hud"; }
  var mapa: Record<string, { fn: (e: TeclaEvento) => unknown; dueno: string }> = {}, escuchando = false;
  function campo(el: any) { var t = el && el.tagName; return t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || !!(el && el.isContentEditable); }
  function alPulsar(e: TeclaEvento) {
    var r = mapa[e.code]; if (!r || e.ctrlKey || e.metaKey || e.altKey || e.repeat || campo(e.target)) return;
    var usada; try { usada = r.fn(e); } catch (er) { try { if (consola) consola.error("[Teclas] " + e.code, er); } catch (e2) {} }
    if (usada !== false) e.preventDefault();
  }
  function registra(codigo: string, fn: (e: TeclaEvento) => unknown, dueno?: string) {
    if (typeof fn !== "function" || RESERVADAS[codigo] || mapa[codigo]) return null;
    mapa[codigo] = { fn: fn, dueno: dueno || "" };
    if (!escuchando && ventana) { ventana.addEventListener("keydown", alPulsar); escuchando = true; }
    var r = mapa[codigo];
    return function () { if (mapa[codigo] === r) delete mapa[codigo]; };
  }
  function dueno(codigo: string) { return RESERVADAS[codigo] || (mapa[codigo] && (mapa[codigo]!.dueno || "?")) || null; }
  return { registra: registra, dueno: dueno, RESERVADAS: RESERVADAS };
}
export type Teclas = ReturnType<typeof creaTeclas>;
