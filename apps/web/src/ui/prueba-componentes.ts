// Un registro de componentes de verdad para las pruebas de Vitest de ui/ y de los mundos (A3-7b2, MU5-n). Solo lo importan los *.test.ts: no es parte del motor ni del paquete.
// Las pruebas de los componentes que cuelgan cosas del contexto (n.on, n.limpia: la agenda, la oficina, la personalización…) montan su manifiesto en el creaComponentes del núcleo,
// con un Bus como el de 02c, y lo liberan con liberaMundo: así se prueba el ciclo entero (libera(api) y luego lo que soltó n.limpia, en orden inverso), no un doble del contexto.
import { creaComponentes } from "../nucleo/componentes.ts";
import type { BusComponentes, Manifiesto } from "../nucleo/componentes.ts";

export interface BusPrueba extends BusComponentes {
  /** cuántos oyentes siguen vivos (en total o de un evento) */
  oyentes(ev?: string): number;
  /** ¿alguien escucha ese evento? (el Bus.hay de 02c) */
  hay(ev: string): boolean;
}
export function busPrueba(): BusPrueba {
  const oy: Record<string, Array<(d?: unknown) => void>> = {};
  return {
    on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { const l = (oy[ev] || []).slice(); for (const f of l) { try { f(d); } catch { /* como el Bus de 02c */ } } return l.length; },
    oyentes(ev) { return ev ? (oy[ev] || []).length : Object.values(oy).reduce((s, l) => s + l.length, 0); },
    hay(ev) { return (oy[ev] || []).length > 0; },
  };
}

/** monta un manifiesto en el registro del núcleo (arrancado) y deja liberarlo como lo haría el último mundo vivo */
export function montaComponente(def: Manifiesto, bus: BusPrueba = busPrueba()) {
  const errores: string[] = [];
  const C = creaComponentes({ bus, ahora: () => 0, consola: { error: (...a: unknown[]) => { errores.push(a.map(String).join(" ")); }, warn: () => { /* sin avisos */ } } });
  C.registra(def); C.arranca();
  return {
    C, bus, errores,
    activo: () => C.activo(def.id), api: () => C.api(def.id),
    /** el último mundo vivo se libera: libera(api) y después lo que soltó n.limpia */
    libera: () => C.liberaMundo("exterior"),
  };
}
