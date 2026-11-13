// El cableado de los interiores con el arranque (eje B; 90_final): registra cada interior en el gestor de mundos como talón perezoso (el import() del
// mundo interior y el del GLTFLoader los escribe el arranque y llegan por función: hasta cruzar la puerta no se descarga nada) y entra por ?mundo=<id>.
// Vive aquí y no en arranque.ts porque el arranque solo cablea (su trinquete de líneas, pruebas/guardianes/arranque.test.js). Va en el paquete principal
// (Mundos.cableaInteriores, por mundos/index.ts): es poco y no importa el mundo interior (solo su tipo).
// Lo que hace con el legado, a propósito:
//   · la pose: la de quien anda (pp de 12_paseo); en VR, además, el rig se recoloca en la llegada (vrAparece de 29_vr), porque allí pp sale de la cabeza;
//   · al entrar: el paseo en primera persona (dentro hay techo: la cámara de seguimiento atravesaría las paredes) y, si no se estaba paseando, se entra
//     en el paseo SIN la caída desde el cielo (TR.act = false); al salir, la vista en primera o tercera persona vuelve a ser la de antes;
//   · las puertas: gm.cambia(a, null, puerta); si falla (no por estar ocupado), un aviso en el HUD.
import type { IdMundo, Pose2, Puerta, ResultadoCambio } from "../../nucleo/mundos.ts";
import type { T } from "../comun/tipos.ts";
import type { creaInterior, DepsInterior } from "./index.ts";

export interface DepsCableaInteriores {
  /** el gestor de mundos (90_final) */
  gm: { registra(def: () => Promise<T>, id: IdMundo): void; cambia(a: IdMundo, llegada?: Pose2 | null, puerta?: Puerta | null): Promise<ResultadoCambio>; fichaDe(id: IdMundo): string };
  /** los interiores de esta finca (Hituelo: patios y fábrica) */
  ids: readonly IdMundo[];
  /** el índice (#datos): su base es la de las teselas */
  D: { base?: unknown };
  THREE: T; scene: T; renderer: T; Aparato: { clase(): string }; VRX: { on: boolean };
  vrAparece(x: number, y: number, ang: number): void;
  pose: { lee(): Pose2; pon(p: Pose2): void };
  Paseo: { E: { paseando: boolean; primera: boolean }; entraPaseo(): void };
  TR: { act: boolean };
  Hud(): { aviso(s: string, ms?: number): void } | null | undefined;
  /** import("./mundos/interior/index.ts") y import("three/addons/loaders/GLTFLoader.js"), escritos en el arranque */
  modulo(): Promise<{ creaInterior: typeof creaInterior }>;
  cargaGltf: DepsInterior["cargaGltf"];
  ventana: { fetch: DepsInterior["descarga"] } & Record<string, unknown>;
  consola?: { error(...a: unknown[]): void; warn(...a: unknown[]): void } | null;
}

/** ?mundo=<id> (y nada más): el id, o null. «exterior» no cuenta (es donde se arranca). */
export function mundoDeUrl(busqueda: string): string | null {
  const m = /[?&]mundo=([a-z][a-z0-9-]{0,31})(&|$)/.exec(busqueda || "");
  return m && m[1] !== "exterior" ? m[1]! : null;
}

export function cableaInteriores(d: DepsCableaInteriores) {
  let primeraFuera: boolean | null = null, ultimo: IdMundo | null = null;
  const creados = new Map<IdMundo, { estado(): unknown }>();
  const aviso = (s: string, ms?: number): void => { const h = d.Hud(); if (h) h.aviso(s, ms); };
  const pose = { lee: d.pose.lee, pon(p: Pose2): void { d.pose.pon(p); if (d.VRX.on) d.vrAparece(p.x, p.y, p.ang); } };
  function deps(id: IdMundo): DepsInterior {
    return {
      id, base: typeof d.D.base === "string" ? d.D.base : "", vr: () => !!d.VRX.on, clase: () => d.Aparato.clase(),
      descarga: (u, i) => d.ventana.fetch(u, i), cargaGltf: d.cargaGltf, escena: d.scene, pose,
      subeTextura: t => { if (d.renderer && typeof d.renderer.initTexture === "function") d.renderer.initTexture(t); },
      luz: (_t, c, k) => new d.THREE.AmbientLight(c, k),
      existe: a => d.gm.fichaDe(a as IdMundo) !== "sin_registrar",
      cruza: (a, puerta) => { d.gm.cambia(a, null, puerta).then(r => { if (!r.ok && r.motivo !== "ocupado") aviso("No se ha podido entrar en «" + a + "»", 4000); }); },
      aviso,
      alEntrar: () => {
        ultimo = id;
        if (primeraFuera === null) primeraFuera = !!d.Paseo.E.primera;
        if (!d.VRX.on && !d.Paseo.E.paseando) { d.Paseo.entraPaseo(); d.TR.act = false; }
        d.Paseo.E.primera = true;
      },
      alSalir: () => { if (primeraFuera !== null) d.Paseo.E.primera = primeraFuera; primeraFuera = null; },
      consola: d.consola || null,
    };
  }
  for (const id of d.ids) d.gm.registra(() => d.modulo().then(m => { const w = m.creaInterior(deps(id)); creados.set(id, w); ultimo = id; return w; }), id);
  // ?debug y las pruebas: el estado del último interior creado o en el que se entró (null si aún no hay ninguno)
  d.ventana.__interior = () => { const w = ultimo ? creados.get(ultimo) : undefined; return w ? w.estado() : null; };
  // para las pruebas y la consola (mientras el exterior no tenga su puerta al cortijo [SUPUESTO: no está situado en el índice]): __cambiaMundo("patios")
  d.ventana.__cambiaMundo = (a: IdMundo) => d.gm.cambia(a);
  return {
    deps,
    /** con el exterior ya cargado, a ?mundo=<id> (vacio, patios, fabrica…); si no se puede, lo dice */
    entraPorUrl(busqueda: string): void {
      const a = mundoDeUrl(busqueda) as IdMundo | null;
      if (!a) return;
      d.gm.cambia(a).then(r => {
        if (r.ok) return;
        if (d.consola) d.consola.error("?mundo=" + a + ": no se ha podido entrar", r);
        aviso("No se ha podido entrar en «" + a + "»", 4000);
      });
    },
  };
}
export type Interiores = ReturnType<typeof cableaInteriores>;
