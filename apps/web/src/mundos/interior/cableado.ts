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
//   · la visita del museo (visita.ts, v1.1): lo de la UI que necesita (THREE, el documento, el panel de VR y cómo abrirlo en la pestaña «Mundo»);
//   · la lectura de las fichas en voz alta (voz.ts): speechSynthesis y SpeechSynthesisUtterance de la ventana, si los hay;
//   · la luz aparte (v1.2): el entorno de las piezas con luz propia, hecho con la sonda (entornoDeSonda: SphericalHarmonics3 de three en un
//     equirectangular pequeño y PMREMGenerator), y si el sistema pide reducir el movimiento (las máquinas entran paradas);
//   · el glb comprimido (v1.3, ADR-0035): los import() del decodificador de meshopt y del KTX2Loader (escritos en el arranque, como el del GLTFLoader:
//     Vite los trocea y solo se descargan si un glb los usa), el renderer y la carpeta del transcodificador Basis (la del suelo de fotos);
//   · la visita guiada compartida (seguimiento.ts, decisiones 233-238): el componente «visita-compartida» de todos los mundos (el aviso a la familia, «Ir»
//     con el fundido de Llegada y el cambio de mundo de aquí, y la lámina en VR), y lo que el interior necesita de la guiada (deps.guiada).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { IdMundo, Pose2, Puerta, ResultadoCambio } from "../../nucleo/mundos.ts";
import { movimientoReducido } from "../../nucleo/movimiento.ts";
import type { T } from "../comun/tipos.ts";
import type { creaInterior, DecodificadoresInterior, DepsInterior } from "./index.ts";
import { creaPortones, manifiestoPortones } from "./porton.ts";
import type { DepsPortones, VidaPortones } from "./porton.ts";
import { creaSeguimiento, manifiestoSeguimiento } from "./seguimiento.ts";
import type { DepsSeguimiento, InteriorGuiado } from "./seguimiento.ts";

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
  /** v1.3: import("three/addons/libs/meshopt_decoder.module.js") e import("three/addons/loaders/KTX2Loader.js"); sin ellos, un glb comprimido no entra */
  cargaMeshopt?: DecodificadoresInterior["meshopt"];
  cargaKtx2?: DecodificadoresInterior["ktx2"];
  ventana: { fetch: DepsInterior["descarga"] } & Record<string, unknown>;
  consola?: { error(...a: unknown[]): void; warn(...a: unknown[]): void } | null;
  /** eje B, la puerta del cortijo (porton.ts): sin Componentes no hay puerta en el exterior (las pruebas del cableado no la montan) */
  Componentes?: { registra(m: Manifiesto): boolean } | null;
  Vida?: VidaPortones | null;
  Llegada?: (NonNullable<DepsPortones["Llegada"]> & { funde?(fn: () => void): boolean; aparece?(x: number, y: number, ang?: number): void }) | null; Minimapa?: DepsPortones["Minimapa"];
  /** las láminas (ui/laminas.ts): el aviso de la visita guiada en VR */
  Laminas?: DepsSeguimiento["Laminas"];
  /** el panel de VR: las filas (la puerta del cortijo y la visita), la tapa, repintar y abrirlo (la visita) */
  PanelVR?: (NonNullable<DepsPortones["PanelVR"]> & { tapa?(fn: () => boolean): () => void; repinta?(): void; abierto?(): boolean; conmutaPanel?(): void }) | null;
  Materiales?: T; suelo?(x: number, y: number): number; Estado?: { exag: number };
  /** L6-03: Configuración (33_ajustes): «Movimiento» de la aplicación, que ya respeta «Como el sistema»; sin ella, la preferencia del sistema */
  Ajustes?(): { movimientoReducido?(): boolean } | null | undefined;
}

/** L6-03: ¿se reduce el movimiento? La regla única vive en nucleo/movimiento.ts (el ajuste de la aplicación; sin Configuración, el sistema); aquí se reexporta */
export { movimientoReducido };

/** v1.3: la carpeta del transcodificador Basis junto a la página (la copia vite.config.js, RUTA_BASIS; la misma que usa el suelo de fotos) */
export const RUTA_BASIS = "basis/";

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

/** lado del equirectangular de la sonda: PMREM toma un cubo de lado ancho/4 (64 px: lodMax 6) [SUPUESTO: de sobra para 9 armónicos] */
const ANCHO_SONDA = 256;

/** El entorno de lo que tiene luz propia (contrato §1d): la radiancia de la sonda (9 × RGB, SphericalHarmonics3.getAt) en un equirectangular de
 *  256 × 128, pasado por PMREMGenerator (lo que three usa para los brillos y la luz difusa de un envMap). Se hace una vez al cargar el interior. */
export function entornoDeSonda(THREE: T, renderer: T, sonda: number[]): { textura: T; dispose(): void } | null {
  if (!THREE || !renderer || !THREE.PMREMGenerator || !THREE.SphericalHarmonics3 || !THREE.DataUtils || sonda.length !== 27) return null;
  // en medio flotante (HalfFloat): el flotante entero no siempre se filtra en las gafas (OES_texture_float_linear)
  const sh = new THREE.SphericalHarmonics3().fromArray(sonda), W = ANCHO_SONDA, H = W / 2, px = new Uint16Array(W * H * 4), h = (v: number): number => THREE.DataUtils.toHalfFloat(Math.max(0, v));
  const n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let j = 0; j < H; j++) {
    const th = ((j + 0.5) / H - 0.5) * Math.PI, ct = Math.cos(th), st = Math.sin(th);
    for (let i = 0; i < W; i++) {
      const ph = ((i + 0.5) / W - 0.5) * 2 * Math.PI, k = (j * W + i) * 4;   // la inversa de equirectUv de three: u = atan(z, x)/2π + ½, v = asin(y)/π + ½
      sh.getAt(n.set(ct * Math.cos(ph), st, ct * Math.sin(ph)), c);
      px[k] = h(c.x); px[k + 1] = h(c.y); px[k + 2] = h(c.z); px[k + 3] = h(1);
    }
  }
  const eq = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  eq.mapping = THREE.EquirectangularReflectionMapping; eq.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromEquirectangular(eq);
  pm.dispose(); eq.dispose();
  return { textura: rt.texture, dispose: () => rt.dispose() };
}

export function cableaInteriores(d: DepsCableaInteriores) {
  let primeraFuera: boolean | null = null, ultimo: IdMundo | null = null, destino: IdMundo | null = null, llegadaFuera: Pose2 | null = null;
  const creados = new Map<IdMundo, { estado(): unknown; visita?(): { accion(a: string): void; estado(): unknown } | null; maquinas?(): { pon(on: boolean): void; estado(): unknown } | null;
    presupuesto?(p: { clase: "pantalla" } | { clase: "vr"; nivel: number }): { triangulos: number; llamadas: number } } & Partial<InteriorGuiado>>();
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
  // la visita guiada compartida: lo que la familia ve y hace cuando el guía mueve al grupo (de todos los mundos), y lo que el interior le pregunta
  const L = d.Llegada, documentoS = (d.ventana as Record<string, unknown>).document as T | undefined;
  const seguimiento = creaSeguimiento({
    actual: () => (d.gm.actual === undefined ? null : d.gm.actual),
    interior: id => { const w = d.gm.actual === id ? creados.get(id as IdMundo) : undefined; return w && w.titulos && w.puesto && w.vaA && w.alGuiada ? (w as InteriorGuiado) : null; },
    cambia: a => cambia(a), pose: { pon: p => pose.pon(p) }, vr: () => !!d.VRX.on, documento: documentoS || null, aviso,
    Llegada: L && L.funde && L.aparece ? { funde: fn => L.funde!(fn), aparece: (x, y, ang) => L.aparece!(x, y, ang) } : null,
    Laminas: d.Laminas || null,
  });
  if (d.Componentes) d.Componentes.registra(manifiestoSeguimiento(seguimiento));
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
      visita: documento ? { THREE: d.THREE, documento, PanelVR: d.PanelVR || null, abrePanel, voz: { synth: (d.ventana.speechSynthesis as T) || null, Utterance: (d.ventana.SpeechSynthesisUtterance as T) || null } } : null,
      entorno: sonda => entornoDeSonda(d.THREE, d.renderer, sonda),
      decodificadores: d.cargaMeshopt && d.cargaKtx2 ? { meshopt: d.cargaMeshopt, ktx2: d.cargaKtx2, renderer: d.renderer, ruta: RUTA_BASIS } : null,
      ahora: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
      guiada: d.Componentes ? seguimiento : null,
      reducido: () => movimientoReducido(d.Ajustes ? d.Ajustes() : null, d.ventana),   // L6-03: el ajuste de la aplicación, no solo el sistema
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
  // las máquinas (v1.2), para ?debug y las pruebas: su estado y, con «marcha» o «para», lo mismo que el interruptor
  d.ventana.__maquinas = (a?: string) => {
    const w = ultimo ? creados.get(ultimo) : undefined, m = w && w.maquinas ? w.maquinas() : null;
    if (m && (a === "marcha" || a === "para")) m.pon(a === "marcha");
    return m ? m.estado() : null;
  };
  // para las pruebas y la consola (mientras el exterior no tenga su puerta al cortijo [SUPUESTO: no está situado en el índice]): __cambiaMundo("patios")
  d.ventana.__cambiaMundo = (a: IdMundo) => cambia(a);
  // la puerta del cortijo, para ?debug y las pruebas: su estado (accesos, cruces, precargas) y «Ir al cortijo»
  d.ventana.__porton = () => (portones ? portones.estado() : null);
  // la visita guiada compartida, para ?debug y las pruebas: su estado; «ir», «quedo», «seguir»/«noSeguir» como los botones
  d.ventana.__seguimiento = (a?: string) => {
    if (a === "ir") seguimiento.ir(); else if (a === "quedo") seguimiento.quedo(); else if (a === "seguir" || a === "noSeguir") seguimiento.seguir(a === "seguir");
    return seguimiento.estadoSeguimiento();
  };
  d.ventana.__irAlCortijo = () => (portones ? portones.irAlCortijo() : false);
  return {
    deps,
    portones,
    /** ADR-0036 (T8): lo que el interior activo deja libre de su presupuesto (su tope del perfil, quest en VR o en el Quest, menos los triángulos y llamadas que dibuja),
     *  para el cupo de VRM de los avatares; null fuera de un interior (o antes de cargarlo) */
    libre(): { triangulos: number; llamadas: number } | null {
      const id = d.gm.actual, w = id ? creados.get(id) : undefined;
      if (!w || !w.presupuesto) return null;
      const e = w.estado() as { triangulos?: unknown; llamadas?: unknown } | null, vr = !!d.VRX.on || d.Aparato.clase() === "quest";
      const p = w.presupuesto(vr ? { clase: "vr", nivel: 0 } : { clase: "pantalla" });
      const tri = e && typeof e.triangulos === "number" ? e.triangulos : 0, ll = e && typeof e.llamadas === "number" ? e.llamadas : 0;
      return { triangulos: Math.max(0, p.triangulos - tri), llamadas: Math.max(0, p.llamadas - ll) };
    },
    seguimiento,
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
