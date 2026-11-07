// El bus de eventos, el reparto del JS por bloque y el mundo en pausa (ADR-0023, doc/sistema/COMPONENTES.md §3). MU5-n (A3-8a): antes vivían en
// apps/web/motor/02c_componentes.js, que queda de talón (`var Bus = Nucleo.creaBus({ consola })`, `var Reparto = Nucleo.creaReparto({ ahora })`,
// `var Pausa = Nucleo.creaPausa(Bus)`). El registro de componentes (./componentes.ts) recibe el Bus y el Reparto por argumento.
// Nada de aquí lee globales al cargarse: el reloj y la consola entran por argumento.
// Catálogo de eventos: contratos/eventos.json (lo vigila pruebas/guardianes/componentes.test.js; lo que emite este fichero sale como «nucleo/bus»).

/** Consola mínima: donde se avisa de un oyente que falla. */
export interface ConsolaBus { error(...a: unknown[]): void }

// el bus de eventos: Bus.on(evento, fn) → quita; Bus.emite(evento, datos); Bus.hay(evento) (¿alguien escucha?). Nombres «dominio:accion», todos en contratos/eventos.json
export function creaBus(deps?: { consola?: ConsolaBus | null }) {
  var consola = deps && deps.consola ? deps.consola : null;
  // AG-1.4c: la lista de oyentes de un evento es INMUTABLE: dar de alta o de baja (raro) crea una lista nueva; emitir (a cada fotograma, a veces) recorre la lista que
  // había al empezar sin copiarla ni crear cierres. Es la misma semántica de antes (copia al emitir): quien se da de baja durante la emisión la recibe aún; quien se
  // da de alta durante ella, no hasta la siguiente; un oyente que falla no impide a los demás.
  var oy: Record<string, ((datos?: any) => void)[]> = {};
  function on(ev: string, fn: (datos?: any) => void) {
    if (typeof fn !== "function") return function () {};
    var n = (oy[ev] || []).slice(); n.push(fn); oy[ev] = n;
    return function () { var l = oy[ev], i = l ? l.indexOf(fn) : -1; if (i >= 0) { var m = l!.slice(); m.splice(i, 1); oy[ev] = m; } };
  }
  function avisaFallo(ev: string, e: unknown) { try { if (consola) consola.error("[Bus] " + ev, e); } catch (e2) {} }
  function emite(ev: string, datos?: unknown) {
    var l = oy[ev]; if (!l || !l.length) return 0;
    for (var i = 0, fn; i < l.length; i++) { fn = l[i]!; try { fn(datos); } catch (e) { avisaFallo(ev, e); } }   // fn suelta: sin «this» (como el forEach de antes)
    return oy[ev]!.length;   // los que hay al terminar (la lista es la de ahora, no la de antes de emitir)
  }
  function hay(ev: string) { return !!(oy[ev] && oy[ev]!.length); }
  return { on: on, emite: emite, hay: hay };
}
export type Bus = ReturnType<typeof creaBus>;

// Q0h: el reparto del JS por bloque dentro del fotograma. Sin medir (Reparto.on falso) el bucle no lee el reloj ni toca nada: cada medición es «if (rp) q = Reparto.pasa(bloque, q)» con rp leído una vez por fotograma.
// Midiendo (30_mide.js lo enciende), pasa() suma al bloque los ms desde la marca anterior en un Float64Array preasignado (sin reservas por fotograma). Los bloques se dan de alta una vez (reg) al montar o la primera vez que se miden.
export function creaReparto(deps: { ahora: () => number }) {
  var ahora = deps.ahora;
  var MAX = 64, ms = new Float64Array(MAX), nom: string[] = [], r = { on: false, t: -1, ms: ms, nom: nom, n: 0, MAX: MAX, reg: reg, ini: ini, pasa: pasa };
  function reg(nombre: string) { var i = nom.indexOf(nombre); if (i >= 0) return i; if (nom.length >= MAX) return MAX - 1; nom.push(nombre); r.n = nom.length; return nom.length - 1; }
  function ini(t: number) { for (var i = 0; i < MAX; i++) ms[i] = 0; r.t = t; return ahora(); }
  function pasa(i: number, q: number) { var a = ahora(); ms[i] = ms[i]! + (a - q); return a; }
  return r;
}
export type Reparto = ReturnType<typeof creaReparto>;

// el mundo en pausa (C9a): mientras alguien la pide (Pausa.pon(quien)), el bucle de 90_final.js no avanza el mundo ni lo pinta: solo corre la fase «pausa» de
// los componentes (un juego a pantalla completa) y el contador de ?debug. El reloj del mundo, la fauna, la carga de teselas y la Cola se quedan quietos donde
// estaban; al quitarla, todo sigue (el primer dt va recortado a 0,1 s como siempre). No se aplica en VR. Emite «mundo:pausa» al entrar y al salir.
export function creaPausa(bus: { emite(ev: string, datos?: unknown): number }) {
  var quien: Record<string, boolean> = {}, n = 0;
  function pon(id?: unknown) { var k = String(id || "?"); if (quien[k]) return false; quien[k] = true; n++; if (n === 1) bus.emite("mundo:pausa", { activa: true }); return true; }
  function quita(id?: unknown) { var k = String(id || "?"); if (!quien[k]) return false; delete quien[k]; n--; if (n === 0) bus.emite("mundo:pausa", { activa: false }); return true; }
  function activa() { return n > 0; }
  return { pon: pon, quita: quita, activa: activa, quien: function () { return Object.keys(quien); } };
}
export type Pausa = ReturnType<typeof creaPausa>;
