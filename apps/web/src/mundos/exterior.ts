// El exterior como primer mundo registrado (MUNDOS §2-§3; MU2-3). Hoy el exterior ES el motor legado (apps/web/motor/): sus módulos no se han movido. Esta
// fábrica es su envoltorio con la forma de MundoBase, para que el gestor (nucleo/mundos.ts) lo registre y lo actualice como a cualquier otro mundo.
// Del legado recibe por argumento lo que necesita (la lista de pasos del fotograma que son del exterior, con su reparto, el suelo, la caja D.ext, las copas,
// su Cola con dueño, sus raíces en la escena, su HUD y la pose de 12_paseo); no lee globales.
// Lo que queda FUERA del exterior, porque es de todo mundo, son pasos del Bucle (90_final.js): la cámara/paseo/VR, las fases «mundo» y «tarde» de los
// componentes, las láminas, Cola.corre, el render, la fase «trasRender» y el medidor (depura/vrFin). MU2-6 sacó de aquí los cuatro del medio.
//
// MU2-3 es el envoltorio; MU2-4, los delegados de la locomoción (suelo de 02_mundo, la caja D.ext y los troncos de copas). MU2-6, congelar y volver:
//   · congela(): sus raíces en la escena, ocultas (visible = false; no se libera nada); su HUD, escondido; sus trabajos de la Cola, aparcados (fuera de la
//     Cola sin cancelarlos, con su generador a medias); y ni actualiza() ni antesDelRender() hacen nada, así que ni se piden teselas ni corre Escena3D.actualiza.
//   · entra(): lo deshace todo (cada raíz y cada elemento del HUD vuelven a como estaban; los trabajos, a la Cola, y la carga sigue donde iba) y, si hay
//     llegada, pone ahí la pose del paseo.
//   · sale(): la pose de 12_paseo (pp.x, pp.y, pp.ang), copiada.
//   · libera(): TODO de MU5 (decisión 218: en MU2 el exterior no se libera). No hace nada y no lanza, porque el gestor puede llamarlo.
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
  /** MU2-6: lo último del exterior en el fotograma, tras los pasos de todo mundo y justo antes del render (Escena3D.actualiza) */
  antesDelRender?: readonly PasoBucle[];
  /** MU2-6: su Cola con dueño «exterior» (02b_cola: ColaExt), que se aparca al congelar y se repone al entrar */
  cola?: { aparca(): number; repone(): number };
  /** MU2-6: sus raíces en la escena en el momento de congelar (90_final: los hijos de la scene menos lo de todo mundo) */
  raices?(): readonly Visible[];
  /** MU2-6: los elementos de su HUD (brújula y tiempo, mapa, fichas…), que se esconden con style.visibility al congelar */
  hud?(): readonly ConEstilo[];
  /** MU2-6: la pose de quien mira (12_paseo: pp), que sale() devuelve y entra() pone si trae llegada */
  pose?: { lee(): Pose2; pon(p: Pose2): void };
}
/** lo mínimo de un objeto de three que se oculta (Object3D.visible) */
export interface Visible { visible: boolean }
/** lo mínimo de un elemento del DOM que se esconde */
export interface ConEstilo { style: { visibility: string } }

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

/** El mundo exterior: id «exterior». */
export function creaExterior(deps: DepsExterior): MundoBase {
  const pasos = deps.pasos, recorre = deps.recorre, finales = deps.antesDelRender || [];
  // obstaculo() devuelve SIEMPRE este mismo objeto (o null): el paseo y la VR lo llaman en cada fotograma y no se reserva nada por fotograma (regla 6).
  // Quien lo recibe copia x e y en el acto. ang no se usa (0): el obstáculo corrige el sitio, no hacia dónde se mira.
  const corregido: Pose2 = { x: 0, y: 0, ang: 0 };
  const ext = deps.ext, copas = deps.copas;
  // MU2-6: congelado, y lo que se ocultó al congelar con cómo estaba (para dejarlo igual al entrar, y no encender lo que ya estaba apagado)
  let congelado = false, raices: Array<[Visible, boolean]> = [], hud: Array<[ConEstilo, string]> = [];
  return {
    id: "exterior",
    alSalir: "congela",   // decisión 218: en MU2 el exterior se congela al salir, no se libera (eso es MU5)
    // los datos del exterior ya están cargados cuando se monta el motor (D, teselas y 3D Tiles se piden al arrancar); no hay nada que esperar
    carga(): Promise<void> { return Promise.resolve(); },
    entra(_desde: unknown, llegada: Pose2 | null): void {
      if (congelado) {
        congelado = false;
        for (const [r, v] of raices) r.visible = v;
        for (const [e, v] of hud) e.style.visibility = v;
        raices = []; hud = [];
        if (deps.cola) deps.cola.repone();   // la carga sigue donde iba: los mismos generadores, a medias
      }
      if (llegada && deps.pose) deps.pose.pon(llegada);
    },
    actualiza(dt: number, t: number): void { if (!congelado) recorre(pasos, dt, t); },
    antesDelRender(dt: number, t: number): void { if (!congelado && finales.length) recorre(finales, dt, t); },
    sale(): Pose2 { const p = deps.pose ? deps.pose.lee() : null; return p ? { x: p.x, y: p.y, ang: p.ang } : { x: 0, y: 0, ang: 0 }; },
    congela(): void {
      if (congelado) return;
      congelado = true;
      raices = []; hud = [];
      if (deps.raices) for (const r of deps.raices()) { raices.push([r, r.visible]); r.visible = false; }
      if (deps.hud) for (const e of deps.hud()) { hud.push([e, e.style.visibility]); e.style.visibility = "hidden"; }
      if (deps.cola) deps.cola.aparca();
    },
    libera(): void { /* TODO MU5 (decisión 218): dispose de lo que hoy no se suelta (15_tiempo, 16_vida, 18_paisaje, 19_balizas, 21_suelo), soltar teselas y los aparcados de su Cola. Ahora no hace nada y no lanza: el gestor puede llamarlo */ },
    suelo(x: number, y: number): number { return deps.suelo ? deps.suelo(x, y) : 0; },
    // ¿se puede estar en (x, y)? La caja D.ext con 3 m de margen (la de LlegadaPuro.rayoSuelo, IrAPuro.planifica y el teletransporte a pie de 29_vr)
    dentro(x: number, y: number): boolean { return dentroDeCaja(ext, x, y); },
    // el punto fuera de los troncos (a `radio` m) y dentro de la caja, o null si (x, y) ya estaba bien. El borde de la finca es un obstáculo más:
    // así el que anda obtiene en una sola llamada lo que hacían el bucle sobre copas y el recorte a D.ext (en un interior serán columnas y paredes)
    obstaculo(x: number, y: number, radio: number): Pose2 | null { return corrigeExterior(ext, copas, x, y, radio, corregido) ? corregido : null; },
  };
}
