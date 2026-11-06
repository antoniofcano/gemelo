// El contrato de un mundo (MUNDOS §2, §4 y §6; ADR-0033; MU2-1). Un World es lo que el gestor (nucleo/mundos.ts, MundoBase) sabe llevar, más
// lo que hace falta para dibujarlo y unirlo a la red: su sala, su marco, su presupuesto por perfil y su Ambiente. Aquí solo hay tipos: cada mundo
// (mundos/exterior, molino, bodega, vacio) es un paquete aparte que los implementa y no importa a otro (dependency-cruiser).
// three no trae tipos en el repo (no hay @types/three): lo que se usa de three va como tipos mínimos estructurales, como en nucleo/presupuesto.ts.
import type { ContextoBase, IdMundo, MundoBase, Pose2, Puerta } from "../nucleo/mundos.ts";
import type { Ambiente } from "../nucleo/ambiente.ts";
import type { creaRender } from "../nucleo/render.ts";

export type { ContextoBase, IdMundo, Pose2, Puerta };

/** La clave de sala que la api traduce al nombre de LiveKit (MUNDOS §7.1; «exterior» conserva «hituelo-libre»). «vacio» no tiene sala. */
export type ClaveSala = "exterior" | "molino" | "bodega" | null;
/** El exterior, relativo a centro_utm; los interiores, origen en su puerta interior, y = cota sobre el suelo interior y exag = 1. */
export type Marco = "finca" | "local";
/** El perfil de calidad activo: pantalla, o VR nivel 0-3 (02g_vr_presupuesto / nucleo/presupuesto.ts). */
export type Perfil = { clase: "pantalla" } | { clase: "vr"; nivel: 0 | 1 | 2 | 3 };
/** Regla 6: lo que puede dibujar un mundo en un perfil. Cifras de diseño [SUPUESTO] hasta que el banco (MU2-8) y el Quest (MU2-9) las midan. */
export interface Presupuesto { triangulos: number; llamadas: number; puntos: number; texturasMb: number }

/** Lo mínimo de un objeto de three que se usa aquí (Object3D, Group, Light), sin importar three. */
export interface Objeto3D { visible: boolean; add(...o: Objeto3D[]): unknown; remove(...o: Objeto3D[]): unknown }

/** MUNDOS §4 (MU2-7): el Ambiente vive en nucleo/ambiente.ts, porque lo aplica el gestor y nucleo no importa de mundos; aquí se reexporta. */
export type { Ambiente } from "../nucleo/ambiente.ts";

/** MUNDOS §6: lo que un mundo ve de Render (nucleo/render.ts, creaRender): tipo, build, info(), memoria() y compila(); ni el renderizador ni enlaza(). */
export type RenderDeMundo = Pick<ReturnType<typeof creaRender>, "tipo" | "build" | "info" | "memoria" | "compila">;

/** MUNDOS §6: lo que el núcleo presta a un mundo. Lo que aún no existe en TypeScript (Bus, Entidades, Láminas, materiales estándar, Ajustes, Aparato,
 *  la sala) entra con la tarea que lo migra (MU2-5 el Bus y los componentes, la fase 3 la sala; el Ambiente, MU2-7, no va en el Contexto: lo da el mundo): no se tipa con «unknown» de relleno. */
export interface Contexto extends ContextoBase {
  /** la del mundo; el núcleo la cuelga de la única scene en entra() y la descuelga en sale() */
  readonly raiz: Objeto3D;
  readonly render: RenderDeMundo;
  readonly perfil: () => Perfil;
  /** solo esto de 29_vr, no VRX entero */
  readonly xr: { activa(): boolean; rig: Objeto3D };
}

/** MUNDOS §2: un mundo. */
export interface World extends MundoBase<Contexto> {
  readonly sala: ClaveSala;
  readonly marco: Marco;
  readonly presupuesto: (perfil: Perfil) => Presupuesto;
  ambiente(): Ambiente;
}

/** Para el talón perezoso de WorldManager.registra: `() => import("@gemelo/mundo-bodega").then(m => m.crea())`. */
export type DefMundo = () => Promise<World>;

