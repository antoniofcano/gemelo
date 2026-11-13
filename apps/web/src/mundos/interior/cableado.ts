// El cableado de los interiores con el arranque (eje B; 90_final): registra cada interior en el gestor de mundos como talón perezoso (el import() del
// mundo interior y el del GLTFLoader los escribe el arranque y llegan por función: hasta cruzar la puerta no se descarga nada) y entra por ?mundo=<id>.
// Vive aquí y no en arranque.ts porque el arranque solo cablea (su trinquete de líneas, pruebas/guardianes/arranque.test.js). Va en el paquete principal
// (Mundos.cableaInteriores, por mundos/index.ts): es poco y no importa el mundo interior (solo su tipo).
// Lo que hace con el legado, a propósito:
//   · la pose: la de quien anda (pp de 12_paseo); en VR, además, el rig se recoloca en la llegada (vrAparece de 29_vr), porque allí pp sale de la cabeza;
//   · al entrar: el paseo en primera persona (dentro hay techo: la cámara de seguimiento atravesaría las paredes) y, si no se estaba paseando, se entra
//     en el paseo SIN la caída desde el cielo (TR.act = false); al salir, la vista en primera o tercera persona vuelve a ser la de antes;
//   · las puertas: gm.cambia(a, null, puerta); si falla (no por estar ocupado), un aviso en el HUD. Al exterior, con la llegada delante de esa puerta si el
//     interior está anclado (eje B, la puerta del cortijo: porton.ts);
//   · la dirección: cada cambio que sale bien deja ?mundo=<id> con history.replaceState (recargar te deja en ese mundo; volver al exterior lo quita);
//   · la puerta del cortijo (porton.ts): el componente «porton-cortijo» del exterior, y al entrar y salir de un interior, el quad aparcado y el dron;
//   · la visita del museo (visita.ts, v1.1): lo de la UI que necesita (THREE, el documento, el panel de VR y cómo abrirlo en la pestaña «Mundo»).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { IdMundo, Pose2, Puerta, ResultadoCambio } from "../../nucleo/mundos.ts";
import type { T } from "../comun/tipos.ts";
import type { creaInterior, DepsInterior } from "./index.ts";
import { creaPortones, manifiestoPortones } from "./porton.ts";
import type { DepsPortones, VidaPortones } from "./porton.ts";

export interface DepsCableaInteriores {
  /** el gestor de mundos (90_final) */
  gm: { registra(def: () => Promise<T>, id: IdMundo): void; cambia(a: IdMundo, llegada?: Pose2 | null, puerta?: Puerta | null): Promise<ResultadoCambio>; fichaDe(id: IdMundo): string } & Omit<DepsPortones["gm"], "fichaDe">;
  /** los interiores de esta finca (Hituelo: patios y fábrica) */
  ids: readonly IdMundo[];
  /** el índice (#datos): su base es la de las teselas */
  D: { base?: unknown };
  THREE: T; scene: T; renderer: T; Aparato: { clase(): string }; VRX: { on: boolean; pestana?: string; sucio?: boolean };
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
  /** eje B, la puerta del cortijo (porton.ts): sin Componentes no hay puerta en el exterior (las pruebas del cableado no la montan) */
  Componentes?: { registra(m: Manifiesto): boolean } | null;
  Vida?: VidaPortones | null;
  Llegada?: DepsPortones["Llegada"]; Minimapa?: DepsPortones["Minimapa"];
  /** el panel de VR: las filas (la puerta del cortijo y la visita), la tapa, repintar y abrirlo (la visita) */
  PanelVR?: (NonNullable<DepsPortones["PanelVR"]> & { tapa?(fn: () => boolean): () => void; repinta?(): void; abierto?(): boolean; conmutaPanel?(): void }) | null;
  Materiales?: T; suelo?(x: number, y: number): number; Estado?: { exag: number };
}

/** ?mundo=<id> (y nada más): el id, o null. «exterior» no cuenta (es donde se arranca). */
export function mundoDeUrl(busqueda: string): string | null {
  const m = /[?&]mundo=([a-z][a-z0-9-]{0,31})(&|$)/.exec(busqueda || "");
  return m && m[1] !== "exterior" ? m[1]! : null;
}

/** la dirección con ?mundo=<id> (o sin él para el exterior), conservando lo demás; null si no se puede leer */
export function urlConMundo(href: string, id: IdMundo): string | null {
  let u: URL;
  try { u = new URL(href); } catch (e) { return null; }
  // a mano y no con searchParams, que reescribiría «?debug» como «?debug=» (y hay banderas que se leen con una expresión regular)
  const q = u.search.replace(/^\?/, "").split("&").filter(x => x && !/^mundo(=|$)/.test(x));
  if (id !== "exterior") q.push("mundo=" + id);
  return u.pathname + (q.length ? "?" + q.join("&") : "") + u.hash;
}

export function cableaInteriores(d: DepsCableaInteriores) {
  let primeraFuera: boolean | null = null, ultimo: IdMundo | null = null, destino: IdMundo | null = null, llegadaFuera: Pose2 | null = null;
  const creados = new Map<IdMundo, { estado(): unknown; visita?(): { accion(a: string): void; estado(): unknown } | null }>();
  const aviso = (s: string, ms?: number): void => { const h = d.Hud(); if (h) h.aviso(s, ms); };
  // todo cambio de mundo pasa por aquí: recuerda adónde se va (para el quad y la VR al salir) y, si sale bien, lo apunta en la dirección
  function cambia(a: IdMundo, llegada?: Pose2 | null, puerta?: Puerta | null): Promise<ResultadoCambio> {
    const libre = d.gm.estado === undefined || d.gm.estado === "en";   // con un cambio en curso, el gestor dirá «ocupado»: no se pisa el destino del que va
    if (libre) { destino = a; llegadaFuera = a === "exterior" && llegada ? llegada : null; }
    const p = llegada === undefined && puerta === undefined ? d.gm.cambia(a) : d.gm.cambia(a, llegada, puerta);
    return p.then(r => {
      if (libre) { destino = null; llegadaFuera = null; }
      const w = d.ventana as { history?: { state: unknown; replaceState(s: unknown, t: string, u: string): void }; location?: { href: string } };
      if (r.ok && r.mundo && w.history && w.location) { const u = urlConMundo(w.location.href, r.mundo); if (u) try { w.history.replaceState(w.history.state, "", u); } catch (e) { /* sin historia */ } }
      return r;
    });
  }
  const base = typeof d.D.base === "string" ? d.D.base : "";
  const busqueda = (): string => { const l = d.ventana.location as { search?: string } | undefined; return l && typeof l.search === "string" ? l.search : ""; };
  const portones = d.Componentes ? creaPortones({
    ids: d.ids, base, sondea: /^\/teselas\//.test(base) || /[?&]porton=1(&|$)/.test(busqueda()), vr: () => !!d.VRX.on, clase: () => d.Aparato.clase(),
    descarga: u => d.ventana.fetch(u, { signal: new AbortController().signal }), gm: d.gm, cambia: (a, l, p) => cambia(a, l, p), pose: d.pose,
    paseando: () => !!d.Paseo.E.paseando, aviso, Vida: d.Vida || null, Llegada: d.Llegada || null, Minimapa: d.Minimapa || null, PanelVR: d.PanelVR || null,
    THREE: d.THREE, scene: d.scene, Materiales: d.Materiales, documento: (d.ventana as Record<string, unknown>).document,
    ...(d.suelo ? { suelo: d.suelo } : {}), ...(d.Estado ? { Estado: d.Estado } : {}),
    ahora: () => Date.now(), consola: d.consola || null,
  }) : null;
  if (d.Componentes && portones) d.Componentes.registra(manifiestoPortones(portones));
  const pose = { lee: d.pose.lee, pon(p: Pose2): void { d.pose.pon(p); if (d.VRX.on) d.vrAparece(p.x, p.y, p.ang); } };
  const documento = (d.ventana as Record<string, unknown>).document as T | undefined;
  // la visita en VR: el panel abierto en la pestaña «Mundo», donde van sus filas
  const abrePanel = (): void => {
    const P = d.PanelVR; if (!P) return;
    if (P.abierto && !P.abierto() && P.conmutaPanel) P.conmutaPanel();
    d.VRX.pestana = "mundo"; d.VRX.sucio = true;
  };
  function deps(id: IdMundo): DepsInterior {
    return {
      id, base: typeof d.D.base === "string" ? d.D.base : "", vr: () => !!d.VRX.on, clase: () => d.Aparato.clase(),
      descarga: (u, i) => d.ventana.fetch(u, i), cargaGltf: d.cargaGltf, escena: d.scene, pose,
      subeTextura: t => { if (d.renderer && typeof d.renderer.initTexture === "function") d.renderer.initTexture(t); },
      luz: (_t, c, k) => new d.THREE.AmbientLight(c, k),
      existe: a => d.gm.fichaDe(a as IdMundo) !== "sin_registrar",
      cruza: (a, puerta) => {
        // al exterior por una puerta anclada: delante de ella, mirando hacia fuera (si no, donde se dejó el exterior, como antes)
        const fuera = a === "exterior" && portones ? portones.salida(id, puerta.id.slice(puerta.id.lastIndexOf(":") + 1)) : null;
        cambia(a, fuera, puerta).then(r => { if (!r.ok && r.motivo !== "ocupado") aviso("No se ha podido entrar en «" + a + "»", 4000); });
      },
      aviso,
      alEntrar: () => {
        ultimo = id;
        if (primeraFuera === null) primeraFuera = !!d.Paseo.E.primera;
        if (!d.VRX.on && !d.Paseo.E.paseando) { d.Paseo.entraPaseo(); d.TR.act = false; }
        d.Paseo.E.primera = true;
        if (portones) portones.alEntraInterior();
      },
      alSalir: () => {
        if (primeraFuera !== null) d.Paseo.E.primera = primeraFuera; primeraFuera = null;
        // en VR, el rig delante de la puerta del exterior ya a oscuras (el exterior solo pone pp)
        if (destino === "exterior" && llegadaFuera && d.VRX.on) d.vrAparece(llegadaFuera.x, llegadaFuera.y, llegadaFuera.ang);
        if (portones) portones.alSaleInterior(destino, llegadaFuera);
      },
      consola: d.consola || null,
      visita: documento ? { THREE: d.THREE, documento, PanelVR: d.PanelVR || null, abrePanel } : null,
    };
  }
  for (const id of d.ids) d.gm.registra(() => d.modulo().then(m => { const w = m.creaInterior(deps(id)); creados.set(id, w); ultimo = id; return w; }), id);
  // ?debug y las pruebas: el estado del último interior creado o en el que se entró (null si aún no hay ninguno)
  d.ventana.__interior = () => { const w = ultimo ? creados.get(ultimo) : undefined; return w ? w.estado() : null; };
  // la visita del museo, para ?debug y las pruebas: su estado y, con un argumento, lo mismo que un botón («empieza», «siguiente», «sal»…)
  d.ventana.__visita = (a?: string) => {
    const w = ultimo ? creados.get(ultimo) : undefined, v = w && w.visita ? w.visita() : null;
    if (v && typeof a === "string") v.accion(a);
    return v ? v.estado() : null;
  };
  // para las pruebas y la consola (mientras el exterior no tenga su puerta al cortijo [SUPUESTO: no está situado en el índice]): __cambiaMundo("patios")
  d.ventana.__cambiaMundo = (a: IdMundo) => cambia(a);
  // la puerta del cortijo, para ?debug y las pruebas: su estado (accesos, cruces, precargas) y «Ir al cortijo»
  d.ventana.__porton = () => (portones ? portones.estado() : null);
  d.ventana.__irAlCortijo = () => (portones ? portones.irAlCortijo() : false);
  return {
    deps,
    portones,
    /** con el exterior ya cargado, a ?mundo=<id> (vacio, patios, fabrica…); si no se puede, lo dice */
    entraPorUrl(busqueda: string): void {
      const a = mundoDeUrl(busqueda) as IdMundo | null;
      if (!a) return;
      cambia(a).then(r => {
        if (r.ok) return;
        if (d.consola) d.consola.error("?mundo=" + a + ": no se ha podido entrar", r);
        aviso("No se ha podido entrar en «" + a + "»", 4000);
      });
    },
  };
}
export type Interiores = ReturnType<typeof cableaInteriores>;
