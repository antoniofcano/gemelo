// El exterior como primer mundo registrado (MUNDOS §2-§3; MU2-3). Hoy el exterior ES el motor legado (apps/web/motor/): sus módulos no se han movido. Esta
// fábrica es su envoltorio con la forma de MundoBase, para que el gestor (nucleo/mundos.ts) lo registre y lo actualice como a cualquier otro mundo.
// Del legado recibe por argumento lo que necesita (la lista de pasos del fotograma que son del exterior, con su reparto, y el suelo); no lee globales.
// Lo que queda FUERA del exterior, porque es de todo mundo, sigue siendo paso del Bucle (90_final.js): la cámara/paseo/VR, el render, la fase «trasRender» de
// los componentes y el medidor (depura/vrFin).
//
// MU2-3 es solo el envoltorio: sin cambio visible. Lo que falta, que es de otras tareas, está marcado:
//   · MU2-4: suelo/dentro/obstaculo de verdad (los de 02_mundo, la caja D.ext y las copas). Hoy suelo es el que se le da y dentro/obstaculo no restringen.
//   · MU2-6: congela() y libera() de verdad (cortar la carga de teselas y Escena3D.actualiza, cancelar lo suyo de la Cola, soltar teselas y recursos de GPU).
//     Hoy no hacen nada, y los pasos del fotograma corren siempre que el exterior es el mundo activo (que, con un solo mundo, es siempre).
//   · MU2-6: sacar de la lista del exterior los pasos que son de todo mundo y hoy van dentro solo para conservar el orden del fotograma (ver 90_final.js:
//     las fases «mundo» y «tarde» de Componentes, las láminas y la Cola van entre pasos del exterior, y un solo gestor.actualiza() no puede intercalarlos).
//   · MU2-7: ambiente() y el resto del World (sala, marco, presupuesto); aquí es un MundoBase.
import type { MundoBase, Pose2 } from "../nucleo/mundos.ts";
import type { PasoBucle } from "../nucleo/bucle.ts";

export interface DepsExterior {
  /** los pasos del fotograma que corren mientras el exterior es el mundo activo, en el orden de siempre (con su bloque del reparto, «caro»…) */
  pasos: readonly PasoBucle[];
  /** los recorre con las reglas del bucle (Bucle.recorre): los «caro» no corren oculto y cada bloque suma al reparto */
  recorre(pasos: readonly PasoBucle[], dt: number, t: number): void;
  /** cota del suelo en metros, sin exagerar (02_mundo: suelo). MU2-4 la lleva al mundo; hasta entonces, la del legado */
  suelo?(x: number, y: number): number;
}

/** Lo que la carga de teselas necesita del legado: 02_mundo (Mundo), la cámara, el punto que mira (09_camara: objetivo) y si se pasea (12_paseo: paseando es una
 *  primitiva que el legado reasigna, por eso entra como función). */
export interface DepsCargaTeselas {
  mundo: { actualiza(x: number, y: number, z: number): void; liberaOrtoLejos(x: number, y: number, z: number): void };
  camara: { position: { x: number; y: number; z: number } };
  objetivo: { x: number; y: number; z: number };
  paseando(): boolean;
}

/** El paso «carga de teselas» del exterior (antes `actualizaCarga` de 90_final.js, igual): cada 0,2 s pide las teselas alrededor de la cámara y, si no se pasea, alrededor
 *  del objetivo; cada 3 s suelta la ortofoto lejana. MU2-6: congelar el exterior corta este paso (con la cámara en un marco local se pedirían teselas alrededor del origen). */
export function creaCargaTeselas(deps: DepsCargaTeselas): (dt: number) => void {
  let tCarga = 0, tOrto = 0;
  const p = deps.camara.position, o = deps.objetivo, m = deps.mundo;
  return function (dt: number): void {
    tCarga += dt; if (tCarga < 0.2) return; tCarga = 0;
    m.actualiza(p.x, p.y, p.z); if (!deps.paseando()) m.actualiza(o.x, o.y, o.z);
    tOrto += 0.2; if (tOrto > 3) { tOrto = 0; m.liberaOrtoLejos(p.x, p.y, p.z); }
  };
}

/** El mundo exterior: id «exterior». entra y sale no hacen nada (la escena ya está montada: el exterior no se cuelga ni se descuelga hasta MU2-6), y sale()
 *  devuelve la pose cero (el sitio de quien mira lo lleva todavía 12_paseo). */
export function creaExterior(deps: DepsExterior): MundoBase {
  const pasos = deps.pasos, recorre = deps.recorre;
  const SIN_POSE: Pose2 = { x: 0, y: 0, ang: 0 };   // sale(): MU2-6 devolverá aquí la pose de verdad (pp.x, pp.y, pp.ang de 12_paseo)
  return {
    id: "exterior",
    // los datos del exterior ya están cargados cuando se monta el motor (D, teselas y 3D Tiles se piden al arrancar); no hay nada que esperar
    carga(): Promise<void> { return Promise.resolve(); },
    entra(): void { /* MU2-6: colgar la raíz y aplicar el Ambiente; hoy la escena ya está montada */ },
    actualiza(dt: number, t: number): void { recorre(pasos, dt, t); },
    sale(): Pose2 { return SIN_POSE; },
    congela(): void { /* MU2-6: cortar la carga de teselas y Escena3D.actualiza y cancelar lo suyo de la Cola */ },
    libera(): void { /* MU2-6: dispose de lo que hoy no se suelta (15_tiempo, 16_vida, 18_paisaje, 19_balizas, 21_suelo) y soltar teselas */ },
    suelo(x: number, y: number): number { return deps.suelo ? deps.suelo(x, y) : 0; },
    dentro(): boolean { return true; },   // MU2-4: la caja D.ext
    obstaculo(): Pose2 | null { return null; },   // MU2-4: los troncos (copas)
  };
}
