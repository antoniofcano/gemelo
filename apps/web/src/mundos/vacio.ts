// El mundo vacío (MUNDOS §2-§3; MU2-6): el interior de prueba mínimo, para ver y medir el exterior congelado sin ningún modelo delante (MU2-8 lo mide
// con ?mundo=vacio). No dibuja nada (sin Escena3D, sin raíz): suelo plano a 0, se puede estar en un cuadrado de 20 m centrado en su origen
// (marco «local») y no hay obstáculos más que el borde de ese cuadrado. No tiene sala ni componentes, ni entrada para el usuario salvo ?mundo=vacio.
// Va por @gemelo/mundos (mundos/index.ts) y no como trozo perezoso, como irán el molino y la bodega: son veinte líneas sin assets y así 90_final lo
// registra sin tocar la configuración de Vite.
// MU2-7: su Ambiente es el de un interior: sin cielo (cielo «ninguno»), fondo gris neutro, sin niebla, una luz ambiental y una direccional suyas
// (no las del exterior: el gestor descuelga el hemisferio y el sol al entrar aquí y los vuelve a colgar al volver), near/far de interior y exag 1.
// Las luces las crea el legado con THREE (src/ no importa three) mediante la fábrica `luz`, con los valores de aquí, una sola vez.
import type { MundoBase, Pose2 } from "../nucleo/mundos.ts";
import type { Ambiente, LuzAmbiente } from "../nucleo/ambiente.ts";

/** medio lado del cuadrado en el que se puede estar (m): 20 m de lado */
export const MEDIO_LADO = 10;

/** MU2-7: el fondo, gris neutro (sRGB) [SUPUESTO: a ojo, sin probar en un aparato] */
export const FONDO_VACIO = 0x8a8a8a;
/** MU2-7: near/far de interior (m), en pantalla y en VR: el cuadrado mide 20 m y la diagonal desde una esquina, 28 m [SUPUESTO, MUNDOS §4: 0,05 y 80] */
export const CAMARA_VACIO = { near: 0.05, far: 80 } as const;
/** MU2-7: sus dos luces (intensidad física, con el π de three r155 como LUZ_SOL y LUZ_CIELO de 03_escena) [SUPUESTO: a ojo] */
export const LUCES_VACIO = {
  ambiental: { color: 0xffffff, intensidad: 0.8 * Math.PI },
  direccional: { color: 0xffffff, intensidad: 1.2 * Math.PI, pos: [4, 10, 6] as const },
} as const;

/** Lo que el vacío pide al legado para crear una luz: THREE.AmbientLight o THREE.DirectionalLight (en `pos`) con ese color sRGB e intensidad. */
export type FabricaLuz = (tipo: "ambiental" | "direccional", color: number, intensidad: number, pos?: readonly [number, number, number]) => LuzAmbiente & { dispose?(): void };

export interface DepsVacio {
  /** la pose de quien mira (12_paseo: pp): entra() la pone en la llegada (o en el centro) y sale() la devuelve */
  pose?: { lee(): Pose2; pon(p: Pose2): void };
  /** MU2-7: cómo crear sus luces (90_final: con THREE). Sin ella, su Ambiente no trae luces (las pruebas) */
  luz?: FabricaLuz;
}

/** El mundo «vacio». */
export function creaVacio(deps: DepsVacio = {}): MundoBase {
  // obstaculo() devuelve siempre este mismo objeto (o null), como el del exterior: quien lo recibe copia x e y en el acto (regla 6)
  const corregido: Pose2 = { x: 0, y: 0, ang: 0 };
  const recorta = (v: number): number => Math.max(-MEDIO_LADO, Math.min(MEDIO_LADO, v));
  // MU2-7: sus luces, creadas la primera vez que se pide el Ambiente y las mismas después (el aplicador no cuelga dos veces la misma); libera() las suelta
  let luces: Array<LuzAmbiente & { dispose?(): void }> | null = null;
  function susLuces(): readonly LuzAmbiente[] {
    if (!luces) {
      const L = LUCES_VACIO, f = deps.luz;
      luces = f ? [f("ambiental", L.ambiental.color, L.ambiental.intensidad), f("direccional", L.direccional.color, L.direccional.intensidad, L.direccional.pos)] : [];
    }
    return luces;
  }
  return {
    id: "vacio",
    alSalir: "congela",
    carga(): Promise<void> { return Promise.resolve(); },
    entra(_desde: unknown, llegada: Pose2 | null): void { if (deps.pose) deps.pose.pon(llegada ? { x: recorta(llegada.x), y: recorta(llegada.y), ang: llegada.ang } : { x: 0, y: 0, ang: 0 }); },
    actualiza(): void { /* nada que actualizar: no hay nada colgado */ },
    sale(): Pose2 { const p = deps.pose ? deps.pose.lee() : null; return p ? { x: p.x, y: p.y, ang: p.ang } : { x: 0, y: 0, ang: 0 }; },
    congela(): void { /* nada que congelar */ },
    // sus luces (el gestor libera tras haber entrado el otro mundo: ya no están colgadas); se puede llamar dos veces
    libera(): void { if (luces) for (const l of luces) if (l.dispose) l.dispose(); luces = null; },
    suelo(): number { return 0; },
    dentro(x: number, y: number): boolean { return Math.abs(x) <= MEDIO_LADO && Math.abs(y) <= MEDIO_LADO; },
    obstaculo(x: number, y: number): Pose2 | null {
      const cx = recorta(x), cy = recorta(y);
      if (cx === x && cy === y) return null;
      corregido.x = cx; corregido.y = cy;
      return corregido;
    },
    // MU2-7: un interior: sin cielo ni niebla, fondo gris, sus dos luces, near/far de interior (el mismo en VR) y exag 1
    ambiente(): Ambiente {
      return { cielo: "ninguno", fondo: FONDO_VACIO, niebla: null, luces: susLuces(), camara: { near: CAMARA_VACIO.near, far: CAMARA_VACIO.far }, exag: 1 };
    },
  };
}
