// El sol según el deslizador #hora (el de reserva, oculto en #reserva de la plantilla): un residuo de antes del tiempo de Vigía. MU5-n (A3-4): antes
// apps/web/motor/11_sol.js, que queda como talón. Componente «sol-reserva» de los mundos ["exterior"], con un libera() que quita su escucha del deslizador.
// Mismo comportamiento que antes: al montarse pone el sol y las luces una vez y, si alguien mueve #hora, otra vez; el paso del tiempo (tiempo-paso.ts:
// actualizaTiempo) los pisa en cada fotograma con el sol de verdad (el de la fecha y la hora del mundo, con LAT y LON de tiempo-puro.ts).
// L8-03 (auditoría de noviembre de 2026): sus constantes son las del 25 de octubre en Jaén (declinación −12,1°, mediodía solar a las 13:16); no sirven para otra
// finca ni otra fecha, y cambiarlas no cambia nada de lo que se ve: el sol del mundo sale de tiempo-puro.ts. Se dejan como estaban (sin cambio visible).

import type { Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsSolReserva {
  /** document.getElementById (#hora y #horaV) */
  $: (id: string) => A;
  /** 03_escena: el sol y el hemisferio, y sus intensidades de partida */
  sol: A; hemi: A; LUZ_SOL: number; LUZ_CIELO: number;
}

export const ID_SOL_RESERVA = "sol-reserva";

export function creaSolReserva(d: DepsSolReserva) {
  var $ = d.$, sol = d.sol, hemi = d.hemi, LUZ_SOL = d.LUZ_SOL, LUZ_CIELO = d.LUZ_CIELO;
  // ---------- el sol según la hora (25-oct, Jaén, hora oficial peninsular)
  function sol2(): void {
    var hora = Number($("hora").value), fi = 37.7 * Math.PI / 180, de = -12.1 * Math.PI / 180, Hh = (hora - 13.27) * 15 * Math.PI / 180;
    var alt = Math.asin(Math.sin(fi) * Math.sin(de) + Math.cos(fi) * Math.cos(de) * Math.cos(Hh));
    var az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(fi) - Math.tan(de) * Math.cos(fi)) + Math.PI; // desde el norte, horario
    sol.position.set(Math.sin(az) * Math.cos(alt) * 300, Math.max(Math.sin(alt), 0.05) * 300, -Math.cos(az) * Math.cos(alt) * 300);
    var k = Math.max(0, Math.sin(alt)); sol.intensity = (0.25 + 0.75 * k) * LUZ_SOL; hemi.intensity = (0.45 + 0.5 * k) * LUZ_CIELO;
    var hh = Math.floor(hora), mm = hora % 1 ? "30" : "00"; $("horaV").textContent = hh + ":" + mm;
  }
  var el = $("hora"), suelto = false;
  if (el) el.addEventListener("input", sol2);
  sol2();
  /** quita la escucha del deslizador #hora (el sol y las luces son de 03_escena: no se tocan) */
  function libera(): number { if (suelto) return 0; suelto = true; if (el) el.removeEventListener("input", sol2); return el ? 1 : 0; }
  return { sol2: sol2, libera: libera };
}
export type SolReserva = ReturnType<typeof creaSolReserva>;

/** El manifiesto del componente «sol-reserva»: solo su ciclo de vida (no dibuja y no se apaga desde la URL). */
export function manifiestoSolReserva(s: SolReserva): Manifiesto {
  return {
    id: ID_SOL_RESERVA, version: 1,
    consume: ["sol", "hemi"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // no dibuja: mueve el sol y el hemisferio de 03_escena una vez al montarse
    mundos: ["exterior"],
    monta: function () { return s; },
    libera: function (api) { if (api) (api as SolReserva).libera(); }
  };
}
