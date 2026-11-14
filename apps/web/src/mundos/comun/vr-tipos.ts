// Los tipos de la VR (A3-6c): lo que toma del legado (DepsVr) y el contexto que comparten sus piezas (CtxVr). Aparte de vr.ts para que las piezas lo importen sin ciclo.
import type { T } from "./tipos.ts";

/** Lo que la VR toma del legado. Lo que otros reescriben o se declara después (33_ajustes, 90_final, 24_pantalla, el paseo…) entra por función. */
export interface DepsVr {
  THREE: T; renderer: T; scene: T; camera: T; Estado: T; sol: T; texColor(t: T): T;
  D: T; $(id: string): T; fmt(n: number, dec?: number): string; VRP: T; Aparato: T;
  suelo(x: number, y: number): number; copas(): T[];
  Cola: T; ComponentesPuro: T; Bus: T; Config: T; LaminasPuro: T; Laminas: T; EntidadesPuro: T; Entidades: T; Usables: T;
  XrPerillas: T; VrControlPuro: T; VrPresupuesto: T; InfoDibujo: T; Materiales: T; UN: T; Arboles: T;
  /** nucleo/render.ts (creaRender, enlazado en 03_escena): Render.compila precompila con la cámara y el destino XR (L7-04) */
  Render: { compila(obj: T): Promise<{ via: string; ok: boolean | null; destinoXr: boolean }> };
  Escena3D: T; pon(m: string): void; NDV(): T; ndviIdx(): number; parcelas(): T[]; fincas(): T[]; meta: T; pasoHoraMundo(d: number): void; horaMundoTexto(): string;
  /** 12_paseo: lo que cambia (paseando, primera, persona, teclas) por función; pp es un objeto que vive toda la sesión */
  paseando(): boolean; primera(): boolean; ponPrimera(v: boolean): void; persona(): T; teclas(): T; pp: T;
  entraPaseo(): void; salePaseo(): void; actualizaPaseo(dt: number): void;
  /** 12b_llegada, 22_huellas y 24_pantalla se montan antes que 29_vr: por valor; Configuración (33_ajustes) va después: por función */
  Llegada: T; pendFactor(): number; TR: T; Ajustes(): T;
  /** 90_final: el gestor de mundos, el fotograma, el tamaño y volver al bucle de la ventana al salir */
  gm(): T; cuadro(t: number): void; tamano(): void; pideFotograma(): void;
  /** el entorno: location.search, navigator, document y window (o los de la prueba) */
  busqueda: string; navegador: T; documento: T; ventana: T;
}

/** El contexto que comparten las piezas de la VR (las piezas se cuelgan en el orden de creación: rig, tele, panel, sesion) */
export interface CtxVr {
  d: DepsVr; VRX: T;
  /** lo del núcleo que usa la VR, con el nombre que tenía en el legado (Nucleo.creaFundido, Nucleo.FundidoPuro, Nucleo.BuclePuro, Nucleo.aplicaCamara) */
  Nucleo: T;
  /** los materiales de la VR, con dueño «vr» (Materiales.de): se sueltan con su libera() */
  materiales: T;
  /** las piezas (vr-rig, vr-teletransporte, vr-panel, vr-sesion): sin su tipo aquí para no hacer un ciclo de importaciones (dependency-cruiser) */
  rig: T; tele: T; panel: T; sesion: T;
  vrVineta: T; vrGatillo(o: T): void;
  creaFundido: T; FundidoPuro: T; BuclePuro: T; aplicaCamara: T;
}
