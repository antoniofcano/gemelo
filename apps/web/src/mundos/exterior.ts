// El exterior como primer mundo registrado (MUNDOS §2-§3; MU2-3). Hoy el exterior ES el motor legado (apps/web/motor/): sus módulos no se han movido. Esta
// fábrica es su envoltorio con la forma de MundoBase, para que el gestor (nucleo/mundos.ts) lo registre y lo actualice como a cualquier otro mundo.
// Del legado recibe por argumento lo que necesita (la lista de pasos del fotograma que son del exterior, con su reparto, el suelo, la caja D.ext y las copas);
// no lee globales.
// Lo que queda FUERA del exterior, porque es de todo mundo, sigue siendo paso del Bucle (90_final.js): la cámara/paseo/VR, el render, la fase «trasRender» de
// los componentes y el medidor (depura/vrFin).
//
// MU2-3 es solo el envoltorio: sin cambio visible. MU2-4 le da los delegados de la locomoción de verdad (suelo de 02_mundo, la caja D.ext y los troncos de copas),
// que es lo que hacían a mano 12_paseo, 12b_llegada, 12c_ir_a, 16_vida y 29_vr (MUNDOS §2). Lo que falta, que es de otras tareas, está marcado:
//   · MU2-6: congela() y libera() de verdad (cortar la carga de teselas y Escena3D.actualiza, cancelar lo suyo de la Cola, soltar teselas y recursos de GPU).
//     Hoy no hacen nada, y los pasos del fotograma corren siempre que el exterior es el mundo activo (que, con un solo mundo, es siempre).
//   · MU2-6: sacar de la lista del exterior los pasos que son de todo mundo y hoy van dentro solo para conservar el orden del fotograma (ver 90_final.js:
//     las fases «mundo» y «tarde» de Componentes, las láminas y la Cola van entre pasos del exterior, y un solo gestor.actualiza() no puede intercalarlos).
//   · MU2-7: ambiente() y el resto del World (sala, marco, presupuesto); aquí es un MundoBase.
import type { MundoBase, Pose2 } from "../nucleo/mundos.ts";
import type { PasoBucle } from "../nucleo/bucle.ts";
import { LlegadaPuro } from "../nucleo/locomocion.ts";
import type { Copa, Ext } from "../nucleo/locomocion.ts";

export interface DepsExterior {
  /** los pasos del fotograma que corren mientras el exterior es el mundo activo, en el orden de siempre (con su bloque del reparto, «caro»…) */
  pasos: readonly PasoBucle[];
  /** los recorre con las reglas del bucle (Bucle.recorre): los «caro» no corren oculto y cada bloque suma al reparto */
  recorre(pasos: readonly PasoBucle[], dt: number, t: number): void;
  /** cota del suelo en metros, sin exagerar (02_mundo: suelo). Quien la exagera (Estado.exag) es quien la usa, como siempre */
  suelo?(x: number, y: number): number;
  /** D.ext = [x0, yNorte, x1, ySur]: la caja de la finca. Sin ella, dentro() es siempre verdadero y obstaculo() no recorta al borde */
  ext?: Ext;
  /** el censo de árboles (02_mundo: copas); solo los olivos (oliv) son troncos que no se atraviesan. Sin él, ningún tronco */
  copas?: readonly Copa[];
}

/** el margen al borde de la caja (3 m): el de siempre del paseo, la llegada, «ir a», el dron y la VR (LlegadaPuro.MARGEN) */
const MARGEN = LlegadaPuro.MARGEN;

/** ¿(x, y) del mundo (y = norte) en la caja ext, a 3 m o más del borde? Es LlegadaPuro.dentro (que va en coordenadas de la escena, z = −norte). */
function dentroDeCaja(ext: Ext | undefined, x: number, y: number): boolean { return !ext || LlegadaPuro.dentro(x, -y, ext); }

/** Lo que hacían a mano 12_paseo, 12b_llegada, 29_vr y el dron de 16_vida, ahora en un sitio (MU2-4): primero se empuja (x, y) fuera del círculo de radio `radio`
 *  de cada tronco de olivo, en el orden del censo (como el bucle de 12_paseo; con dos troncos cerca, el segundo puede devolverte al primero, igual que antes); luego
 *  se recorta a la caja con su margen. Exactamente en el punto de un tronco se sale hacia el este (como LlegadaPuro.fueraDeTroncos; el bucle de 12_paseo y el de
 *  29_vr te dejaban en el centro: ver MUNDOS §2, «Cómo quedó (MU2-4)»). Con radio 0 solo recorta a la caja (el dron, o la VR volando alto).
 *  Escribe en `fuera` y devuelve si hubo que corregir. Lineal sobre el censo, como antes (no hay índice espacial: ver MUNDOS). */
function corrigeExterior(ext: Ext | undefined, copas: readonly Copa[] | undefined, x: number, y: number, radio: number, fuera: { x: number; y: number }): boolean {
  let nx = x, ny = y, toca = false;
  if (copas && radio > 0) {
    const r2 = radio * radio;
    for (let i = 0; i < copas.length; i++) {
      const c = copas[i] as Copa; if (!c.oliv) continue;
      let dx = nx - c.x, dy = ny - c.y, d2 = dx * dx + dy * dy;
      if (d2 < r2) { if (d2 === 0) { dx = 1; dy = 0; d2 = 1; } const d = Math.sqrt(d2); nx = c.x + dx / d * radio; ny = c.y + dy / d * radio; toca = true; }
    }
  }
  if (ext) {
    const cx = Math.max((ext[0] as number) + MARGEN, Math.min((ext[2] as number) - MARGEN, nx)), cy = Math.max((ext[3] as number) + MARGEN, Math.min((ext[1] as number) - MARGEN, ny));
    if (cx !== nx || cy !== ny) { nx = cx; ny = cy; toca = true; }
  }
  fuera.x = nx; fuera.y = ny;
  return toca;
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
  // obstaculo() devuelve SIEMPRE este mismo objeto (o null): el paseo y la VR lo llaman en cada fotograma y no se reserva nada por fotograma (regla 6).
  // Quien lo recibe copia x e y en el acto. ang no se usa (0): el obstáculo corrige el sitio, no hacia dónde se mira.
  const corregido: Pose2 = { x: 0, y: 0, ang: 0 };
  const ext = deps.ext, copas = deps.copas;
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
    // ¿se puede estar en (x, y)? La caja D.ext con 3 m de margen (la de LlegadaPuro.rayoSuelo, IrAPuro.planifica y el teletransporte a pie de 29_vr)
    dentro(x: number, y: number): boolean { return dentroDeCaja(ext, x, y); },
    // el punto fuera de los troncos (a `radio` m) y dentro de la caja, o null si (x, y) ya estaba bien. El borde de la finca es un obstáculo más:
    // así el que anda obtiene en una sola llamada lo que hacían el bucle sobre copas y el recorte a D.ext (en un interior serán columnas y paredes)
    obstaculo(x: number, y: number, radio: number): Pose2 | null { return corrigeExterior(ext, copas, x, y, radio, corregido) ? corregido : null; },
  };
}
