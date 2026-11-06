// La pendiente del paseo (MU5-n, A3-5; antes apps/web/motor/22_huellas.js, que queda como talón): el suelo se deja medir y el quad y el paso se adaptan al terreno. La pendiente del terreno
// a lo largo del rumbo y de lado (positiva = sube, con la exageración vertical), el factor de velocidad (cuesta arriba cuesta más), la inclinación del quad (cabeceo y alabeo suavizados) y
// «sueloSeco» (¿levanta polvo?: sin lluvia, con el arroyo bajo, hr < 92 y poca cubierta de hierba). Las huellas y el polvo, que antes vivían aquí, son el componente «huellas-polvo»
// (huellas-polvo.ts).
// No tiene recursos que soltar (ni GPU, ni DOM, ni relojes, ni escuchas): no es un componente ni lleva libera(); `quadInc` es el único estado y lo reinicia quien lo quiera a mano.
// Medido / deducido / ilustrativo (regla 5): la pendiente sale del relieve (medido); la inclinación del quad y el polvo son ilustrativos.
// Del legado recibe por argumento lo que necesita (el suelo, el paseo, el quad, el tiempo, el arroyo y la cubierta); no lee globales.
import type { T3 } from "./vida-tipos.ts";

export interface DepsHuellas {
  suelo(x: number, y: number): number;
  /** Estado.exag (un campo que cambia: se lee en cada llamada) */
  Estado: { exag: number };
  /** 12_paseo: el muñequito (x, y, ang, paso) */
  pp: { x: number; y: number; ang: number; paso: number };
  /** 16_vida: el quad (solo se le pone la rotación; vive toda la sesión) */
  quad(): { rotation: { set(x: number, y: number, z: number, orden?: string): void } };
  /** 15_tiempo: lluvia y humedad */
  cur: { lluvia: number; hr: number };
  /** 18_paisaje: el nivel del agua del arroyo (un valor que cambia: por función) */
  aguaNivel(): number;
  /** 21_suelo: [hierba, …] en (x, y) (se carga después: por función) */
  cubierta(x: number, y: number): number[];
}

export function creaHuellas(d: DepsHuellas) {
  const suelo = d.suelo, Estado = d.Estado, pp = d.pp, cur = d.cur;
  function pendienteRumbo(x: number, y: number, ang: number): number[] {   // pendiente del terreno a lo largo del rumbo y de lado (positiva = sube), con la exageración vertical
    const ds = 0.9, fx = Math.sin(ang), fy = Math.cos(ang), rx = Math.cos(ang), ry = -Math.sin(ang);
    return [(suelo(x + fx * ds, y + fy * ds) - suelo(x - fx * ds, y - fy * ds)) / (2 * ds) * Estado.exag, (suelo(x + rx * ds, y + ry * ds) - suelo(x - rx * ds, y - ry * ds)) / (2 * ds) * Estado.exag];
  }
  function pendFactor(): number { const s = (pendienteRumbo(pp.x, pp.y, pp.ang) as T3)[0]; return Math.max(0.35, Math.min(1.25, 1 - 1.25 * s)); }   // cuesta arriba cuesta más
  const quadInc = { pit: 0, rol: 0 };
  function inclinaQuad(dt: number): void {
    const pe: T3 = pendienteRumbo(pp.x, pp.y, pp.ang), k = Math.min(1, dt * 6);
    quadInc.pit += (Math.atan(pe[0]) - quadInc.pit) * k; quadInc.rol += (Math.atan(pe[1]) - quadInc.rol) * k; d.quad().rotation.set(quadInc.pit, -pp.ang, quadInc.rol, "YXZ");
  }
  function sueloSeco(x: number, y: number): boolean { return cur.lluvia < 0.3 && d.aguaNivel() < 0.15 && cur.hr < 92 && (d.cubierta(x, y) as T3)[0] < 0.8; }
  return { pendienteRumbo, pendFactor, quadInc, inclinaQuad, sueloSeco };
}
export type Huellas = ReturnType<typeof creaHuellas>;
