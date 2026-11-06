// El mundo vacío (MUNDOS §2-§3; MU2-6): el interior de prueba mínimo, para ver y medir el exterior congelado sin ningún modelo delante (MU2-8 lo mide
// con ?mundo=vacio). No dibuja nada (sin Escena3D, sin raíz, sin luces): suelo plano a 0, se puede estar en un cuadrado de 20 m centrado en su origen
// (marco «local») y no hay obstáculos más que el borde de ese cuadrado. No tiene sala ni componentes, ni entrada para el usuario salvo ?mundo=vacio.
// Va por @gemelo/mundos (mundos/index.ts) y no como trozo perezoso, como irán el molino y la bodega: son veinte líneas sin assets y así 90_final lo
// registra sin tocar la configuración de Vite.
import type { MundoBase, Pose2 } from "../nucleo/mundos.ts";

/** medio lado del cuadrado en el que se puede estar (m): 20 m de lado */
export const MEDIO_LADO = 10;

export interface DepsVacio {
  /** la pose de quien mira (12_paseo: pp): entra() la pone en la llegada (o en el centro) y sale() la devuelve */
  pose?: { lee(): Pose2; pon(p: Pose2): void };
}

/** El mundo «vacio». */
export function creaVacio(deps: DepsVacio = {}): MundoBase {
  // obstaculo() devuelve siempre este mismo objeto (o null), como el del exterior: quien lo recibe copia x e y en el acto (regla 6)
  const corregido: Pose2 = { x: 0, y: 0, ang: 0 };
  const recorta = (v: number): number => Math.max(-MEDIO_LADO, Math.min(MEDIO_LADO, v));
  return {
    id: "vacio",
    alSalir: "congela",
    carga(): Promise<void> { return Promise.resolve(); },
    entra(_desde: unknown, llegada: Pose2 | null): void { if (deps.pose) deps.pose.pon(llegada ? { x: recorta(llegada.x), y: recorta(llegada.y), ang: llegada.ang } : { x: 0, y: 0, ang: 0 }); },
    actualiza(): void { /* nada que actualizar: no hay nada colgado */ },
    sale(): Pose2 { const p = deps.pose ? deps.pose.lee() : null; return p ? { x: p.x, y: p.y, ang: p.ang } : { x: 0, y: 0, ang: 0 }; },
    congela(): void { /* nada que congelar */ },
    libera(): void { /* nada que liberar; se puede llamar dos veces */ },
    suelo(): number { return 0; },
    dentro(x: number, y: number): boolean { return Math.abs(x) <= MEDIO_LADO && Math.abs(y) <= MEDIO_LADO; },
    obstaculo(x: number, y: number): Pose2 | null {
      const cx = recorta(x), cy = recorta(y);
      if (cx === x && cy === y) return null;
      corregido.x = cx; corregido.y = cy;
      return corregido;
    },
  };
}
