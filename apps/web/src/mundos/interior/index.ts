// El mundo interior genérico (eje B; ADR-0033, MUNDOS §2-§5; contrato contratos/mundo-interior.md v1). UN módulo para cualquier glb + mundo.json que
// cumpla el contrato (regla 12: no uno por mundo): los patios y la fábrica de Hituelo son dos instancias de creaInterior con otro id. Es un trozo
// perezoso: el arranque (90_final) lo pide con import() al cruzar la puerta o con ?mundo=<id>, y hasta entonces no se descarga nada.
//
// precarga(ctx) (eje B, la puerta del cortijo): lo de carga() que no toca la GPU (el manifiesto, el glb y su parse), adelantado mientras el exterior sigue
// activo; carga() lo aprovecha si el perfil no ha cambiado (si entre medias se entró en la VR, se suelta y se repite) y solo sube las texturas, a oscuras.
// carga(ctx): pide <base><id>/<perfil>/mundo.json (perfil «quest» en VR o en unas gafas, «pantalla» si no: InteriorPuro.perfil), lo comprueba
// (InteriorPuro.valida), pide el glb y lo lee con el GLTFLoader de three (import() en el talón). El GLTFLoader ya respeta lo que el contrato pide:
// KHR_materials_unlit → MeshBasicMaterial (la luz va horneada en el color base), COLOR_0 → vertexColors (la luz de las hojas) y alphaMode MASK →
// alphaTest (las hojas, 0,5). Lo único que se toca: los materiales sin luz no pasan por el tone mapping del renderizador (toneMapped = false), porque
// su color YA es la imagen revelada al hornear; si no, el ACES del exterior la volvería a revelar. Las texturas se suben a la GPU de una en una en la
// Cola (un trabajo con dueño = id: el gestor lo cancela si el mundo se libera), para no congelar el fotograma con 200 MB de golpe.
// entra(desde, llegada): cuelga el glb de la escena, pone a quien mira en la llegada de la puerta que lleva al mundo de donde viene (o en la principal)
// y avisa de qué es (regla 5: nombre · medido/ilustrativo/mixto · luz horneada, ilustrativa). Cada fotograma, el vigía de las puertas: acercarse al
// umbral cambia de mundo (cruza → gm.cambia); si el destino no está registrado (vivienda, bodega), la puerta queda inerte y lo dice, sin romper.
// suelo/dentro/obstaculo: las zonas del manifiesto (suelo plano por zona; fuera es pared). alSalir: «libera» (un interior no se guarda congelado:
// sus texturas son 80-200 MB de GPU). libera(): dispose de geometrías, materiales y texturas (y cierra los ImageBitmap), idempotente.
// La visita del museo (v1.1, paradas[]: visita.ts): si el manifiesto trae paradas y el cableado da lo de la UI (deps.visita), entra() la monta (la oferta)
// y sale() la suelta; actualiza() le pasa cada fotograma. Unas paradas que el motor no entiende (VisitaPuro.valida) dejan el interior sin visita, no sin
// interior.
// La luz aparte (v1.2, luz.modo «mapa»; ADR-0034): GLTFLoader no carga la oclusión de un material unlit (MeshBasicMaterial), así que lee() la pone a mano:
// por cada material unlit cuya definición (parser.associations → parser.json) trae occlusionTexture, pide la textura (parser.getDependency), la clona
// (una por índice) con channel = texCoord (1) y sRGB, y la pone de lightMap con lightMapIntensity = π × escala (MeshBasicMaterial divide el mapa de luz
// entre π: meshbasic.glsl, «lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI»). Los materiales con luz (las máquinas con luz «propia») los deja
// GLTFLoader como vienen (aoMap en el canal 1); su luz es un entorno hecho con la sonda (luz.sonda, armónicos esféricos: deps.entorno, PMREM), que da
// a la vez la luz difusa y los brillos (un LightProbe más el entorno sumaría dos veces la difusa: lights_fragment_end suma iblIrradiance), y salen del
// tone mapping como los unlit (su luz ya viene «revelada» como la horneada). Sin luz, o con modo «base», todo como en v1.
// Las máquinas (v1.2, maquinas[]): maquinas.ts (lo puro en maquinas-puro.ts); actualiza(dt) las mueve.
// three no trae tipos en el repo: lo que se usa va como tipos mínimos estructurales (como mundos/vacio.ts y nucleo/ambiente.ts).
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";
import type { Ambiente, LuzAmbiente } from "../../nucleo/ambiente.ts";
import type { ContextoBase, IdMundo, MundoBase, Pose2, Puerta } from "../../nucleo/mundos.ts";
import { InteriorPuro } from "./puro.ts";
import type { PerfilInterior, PuertaPose, Zonas } from "./puro.ts";
import { creaVisita } from "./visita.ts";
import type { DepsVisitaUI, Visita } from "./visita.ts";
import { VisitaPuro } from "./visita-puro.ts";
import { creaMaquinas } from "./maquinas.ts";
import type { Maquinas } from "./maquinas.ts";
import { MaquinasPuro } from "./maquinas-puro.ts";

export { InteriorPuro };
export type { PerfilInterior };

/** Lo mínimo de un objeto de three que se usa aquí. */
export interface Nodo3D {
  isMesh?: boolean;
  geometry?: { index?: { count: number } | null; attributes?: { position?: { count: number } }; dispose(): void };
  material?: Material3D | Material3D[];
  traverse(fn: (o: Nodo3D) => void): void;
  parent?: unknown;
}
export interface Material3D { isMeshBasicMaterial?: boolean; toneMapped?: boolean; dispose(): void; [k: string]: unknown }
export interface Textura3D { isTexture: true; dispose(): void; image?: { close?(): void } | null }
/** Lo que se usa del GLTFParser (la luz aparte): el json, qué material de three es qué material del glTF, y pedir una textura por su índice */
export interface ParserGltf {
  json: { materials?: Array<{ occlusionTexture?: { index: number; texCoord?: number } }> };
  associations: Map<unknown, { materials?: number }>;
  getDependency(tipo: "texture", i: number): Promise<(Textura3D & { clone(): Textura3D }) | null>;
}
/** El GLTFLoader de three: parseAsync(ArrayBuffer, ruta) */
export interface CargadorGltf { parseAsync(datos: ArrayBuffer, ruta: string): Promise<{ scene: Nodo3D; animations?: unknown[]; parser?: ParserGltf }> }
/** el entorno de las piezas con luz propia, hecho con la sonda (PMREM): su textura y cómo soltarlo */
export interface EntornoInterior { textura: Textura3D; dispose(): void }
/** fetch, reducido */
export type Descarga = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;
/** cómo crea el arranque una luz (THREE.AmbientLight), como la fábrica del vacío */
export type FabricaLuzInterior = (tipo: "ambiental", color: number, intensidad: number) => LuzAmbiente & { dispose?(): void };

export interface DepsInterior {
  readonly id: IdMundo;
  /** D.base del índice: «/teselas/<finca>/» en el servidor; vacía, junto a la página */
  readonly base: string;
  /** ¿sesión de VR ahora? (VRX.on) y la clase del aparato (Aparato.clase(): «escritorio», «movil», «quest») */
  vr(): boolean;
  clase(): string;
  descarga: Descarga;
  /** import("three/addons/loaders/GLTFLoader.js"), escrito en el arranque para que Vite lo trocee */
  cargaGltf(): Promise<{ GLTFLoader: new () => CargadorGltf }>;
  /** la única scene: entra() cuelga el glb y sale() lo descuelga */
  escena: { add(o: Nodo3D): unknown; remove(o: Nodo3D): unknown };
  /** la pose de quien mira (12_paseo: pp); en VR, el arranque además recoloca el rig (vrAparece) */
  pose?: { lee(): Pose2; pon(p: Pose2): void };
  /** sube una textura a la GPU (renderer.initTexture); sin ella, se sube al primer fotograma que la dibuje */
  subeTextura?(t: Textura3D): void;
  /** su luz ambiental (para los materiales que no son «sin luz», p. ej. un vidrio); sin ella, sin luces */
  luz?: FabricaLuzInterior;
  /** ¿hay un mundo registrado con ese id? (gm.fichaDe(a) !== "sin_registrar") */
  existe(a: string): boolean;
  /** cruzar una puerta: el arranque llama a gm.cambia(a, null, puerta) */
  cruza(a: IdMundo, puerta: Puerta): void;
  /** un aviso en el HUD (Hud.aviso) */
  aviso?(texto: string, ms?: number): void;
  /** al entrar y al salir: el arranque pone el paseo en primera persona (y lo deja como estaba al salir) */
  alEntrar?(): void;
  alSalir?(): void;
  consola?: { warn(...a: unknown[]): void } | null;
  /** la visita del museo (v1.1): lo de la UI (THREE, documento, panel de VR); sin ello, no hay visita aunque el manifiesto traiga paradas.
   *  Las máquinas (v1.2) usan lo mismo (documento y panel de VR) para su interruptor */
  visita?: DepsVisitaUI | null;
  /** v1.2: el entorno de lo que tiene luz propia, desde los 27 números de la sonda (9 × RGB); sin él, esas piezas con la luz ambiental de v1 */
  entorno?(sonda: number[]): EntornoInterior | null;
  /** ¿pide el sistema reducir el movimiento? (prefers-reduced-motion: las máquinas entran paradas) */
  reducido?(): boolean;
}

/** MUNDOS §4: el fondo de un interior (lo que se ve por un hueco o sobre el patio abierto) [SUPUESTO: a ojo, un cielo claro y neutro] */
export const FONDO_INTERIOR = 0xc9d3dc;
/** near/far de interior: el contrato acota el modelo a 200 m de lado */
export const CAMARA_INTERIOR = { near: 0.05, far: 250 } as const;
/** la luz ambiental, solo para materiales que no son «sin luz» (las salidas de hoy: el vidrio) [SUPUESTO: a ojo] */
export const LUZ_INTERIOR = { color: 0xffffff, intensidad: Math.PI } as const;

/** Lo que el mundo cuenta de sí (?debug, las pruebas y window.__interior). */
export interface EstadoInterior {
  id: string; perfil: PerfilInterior | null; ruta: string | null; nombre: string | null; fuente: string | null;
  triangulos: number; llamadas: number; materiales: number; texturas: number; sinLuz: number; conColor: number; recorte: number;
  colgado: boolean; liberado: boolean;
  /** eje B: hay un glb ya bajado y leído por precarga() que carga() aún no ha usado */
  precargado: boolean;
  /** v1.1: la visita del museo (null sin paradas o fuera del interior) */
  visita: ReturnType<Visita["estado"]> | null;
  /** v1.2: la luz («base» o «mapa»), cuántos materiales llevan mapa de luz, cuántos luz propia, y si hay entorno */
  luz: { modo: "base" | "mapa"; mapas: number; propia: number; entorno: boolean };
  /** v1.2: las máquinas (null sin ellas) */
  maquinas: ReturnType<Maquinas["estado"]> | null;
}

function texturasDe(m: Material3D, en: Set<Textura3D>): void {
  for (const k of Object.keys(m)) { const v = m[k] as Textura3D | null; if (v && typeof v === "object" && v.isTexture) en.add(v); }
}
const num = (v: unknown): v is number => typeof v === "number" && isFinite(v);
function materialesDe(o: Nodo3D): Material3D[] { return !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material]; }

export function creaInterior(deps: DepsInterior): MundoBase & {
  readonly sala: null; readonly marco: "local"; presupuesto(p: { clase: "pantalla" } | { clase: "vr"; nivel: number }): { triangulos: number; llamadas: number; puntos: number; texturasMb: number };
  ambiente(): Ambiente; estado(): EstadoInterior; visita(): Visita | null; maquinas(): Maquinas | null;
} {
  const P = InteriorPuro, id = deps.id;
  let man: MundoInterior | null = null, raiz: Nodo3D | null = null, zonas: Zonas | null = null, puertas: PuertaPose[] = [], vigia: ReturnType<typeof P.creaVigia> | null = null;
  let luces: Array<LuzAmbiente & { dispose?(): void }> | null = null, colgado = false, liberado = false;
  const inertes = new Set<string>();   // las puertas a un mundo que no existe ya avisadas en esta visita (hasta alejarse: el vigía las rearma)
  const est: EstadoInterior = { id, perfil: null, ruta: null, nombre: null, fuente: null, triangulos: 0, llamadas: 0, materiales: 0, texturas: 0, sinLuz: 0, conColor: 0, recorte: 0, colgado: false, liberado: false, precargado: false, visita: null, luz: { modo: "base", mapas: 0, propia: 0, entorno: false }, maquinas: null };
  let visita: Visita | null = null, maquinas: Maquinas | null = null, entorno: EntornoInterior | null = null;
  const conEntorno = new Set<Material3D>();

  // lo que no toca la GPU: el manifiesto (comprobado), el glb y su parse. La usan precarga() y carga()
  interface Leido { perfil: PerfilInterior; ruta: string; mi: MundoInterior; escena: Nodo3D }
  let pendiente: Promise<Leido> | null = null, leido: Leido | null = null;
  async function lee(ctx: ContextoBase): Promise<Leido> {
    const perfil = P.perfil({ vr: deps.vr(), clase: deps.clase() }), ruta = P.ruta(deps.base, id, perfil);
    est.perfil = perfil; est.ruta = ruta;
    const rm = await deps.descarga(ruta + "mundo.json", { signal: ctx.senal });
    if (!rm.ok) throw new Error("«" + id + "»: " + ruta + "mundo.json dio " + rm.status);
    const m = await rm.json(), errores = P.valida(m, id);
    if (errores.length) throw new Error("«" + id + "»: el manifiesto no cumple el contrato mundo-interior v1: " + errores.join("; "));
    const mi = m as MundoInterior;
    const rg = await deps.descarga(ruta + mi.glb, { signal: ctx.senal });
    if (!rg.ok) throw new Error("«" + id + "»: " + ruta + mi.glb + " dio " + rg.status);
    const [datos, lib] = await Promise.all([rg.arrayBuffer(), deps.cargaGltf()]);
    if (ctx.senal.aborted) throw new Error("«" + id + "»: carga cancelada");
    const gltf = await new lib.GLTFLoader().parseAsync(datos, ruta);
    if (ctx.senal.aborted || liberado) { suelta(gltf.scene); throw new Error("«" + id + "»: carga cancelada"); }
    if (mi.luz && mi.luz.modo === "mapa" && gltf.parser) await mapasDeLuz(gltf.parser, gltf.scene, num(mi.luz.escala) ? mi.luz.escala : 1);
    if (ctx.senal.aborted || liberado) { suelta(gltf.scene); throw new Error("«" + id + "»: carga cancelada"); }
    return { perfil, ruta, mi, escena: gltf.scene };
  }

  // la luz aparte: el occlusionTexture de cada material unlit, de lightMap (ver la cabecera). Un clon por índice de textura (lo comparten los materiales
  // del mismo atlas); el clon comparte la imagen con el original, que nadie usa ni sube a la GPU.
  async function mapasDeLuz(parser: ParserGltf, escena: Nodo3D, escala: number): Promise<void> {
    const defs = parser.json.materials || [], clones = new Map<number, Promise<Textura3D | null>>(), pendientes: Array<Promise<void>> = [];
    const vistos = new Set<Material3D>();
    escena.traverse(o => {
      for (const mt of materialesDe(o)) {
        if (vistos.has(mt) || !mt.isMeshBasicMaterial) continue;
        vistos.add(mt);
        const a = parser.associations.get(mt), def = a && typeof a.materials === "number" ? defs[a.materials] : undefined, oc = def && def.occlusionTexture;
        if (!oc || typeof oc.index !== "number") continue;
        let c = clones.get(oc.index);
        if (!c) {
          c = parser.getDependency("texture", oc.index).then(t => {
            if (!t) return null;
            const k = t.clone() as Textura3D & Record<string, unknown>;
            k.channel = typeof oc.texCoord === "number" ? oc.texCoord : 1; k.colorSpace = "srgb";   // THREE.SRGBColorSpace
            return k;
          });
          clones.set(oc.index, c);
        }
        pendientes.push(c.then(t => { if (t) { mt.lightMap = t; mt.lightMapIntensity = Math.PI * escala; mt.needsUpdate = true; } }));
      }
    });
    await Promise.all(pendientes);
  }

  async function precarga(ctx: ContextoBase): Promise<void> {
    liberado = false; est.liberado = false;
    const p = lee(ctx); pendiente = p;
    try { const l = await p; if (pendiente === p) { leido = l; est.precargado = true; } else suelta(l.escena); }
    finally { if (pendiente === p) pendiente = null; }
  }

  async function carga(ctx: ContextoBase): Promise<void> {
    liberado = false; est.liberado = false;
    // lo precargado, si lo hay y es del perfil de ahora (entre medias se pudo entrar en la VR); si la precarga falló, se repite aquí
    let l: Leido | null = leido;
    if (!l && pendiente) l = await pendiente.then(() => leido, () => null);
    leido = null; est.precargado = false;
    if (l && l.perfil !== P.perfil({ vr: deps.vr(), clase: deps.clase() })) { suelta(l.escena); l = null; }
    if (!l) l = await lee(ctx);
    else { est.perfil = l.perfil; est.ruta = l.ruta; }
    const mi = l.mi, gltf = { scene: l.escena };
    // las máquinas: unas que el motor no entiende dejan el interior sin máquinas, no sin interior. Antes de
    // contar las texturas: la correa cambia su mapa por un clon, y es el clon el que se sube y se suelta
    if (mi.maquinas && mi.maquinas.length) {
      const err = MaquinasPuro.valida(mi.maquinas);
      if (err.length) { if (deps.consola) deps.consola.warn("[interior " + id + "] sin máquinas: " + err.join("; ")); }
      else maquinas = creaMaquinas({ maquinas: mi.maquinas, raiz: gltf.scene, consola: deps.consola || null });
    }
    // los materiales: los «sin luz» (KHR_materials_unlit) fuera del tone mapping; se cuentan las mallas, los triángulos y las texturas
    const mats = new Set<Material3D>(), texs = new Set<Textura3D>();
    let tri = 0, llam = 0;
    gltf.scene.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry, n = g.index ? g.index.count : g.attributes && g.attributes.position ? g.attributes.position.count : 0;
      tri += Math.floor(n / 3);
      for (const mt of materialesDe(o)) { llam++; mats.add(mt); }
    });
    est.sinLuz = 0; est.conColor = 0; est.recorte = 0;
    const mapa = !!(mi.luz && mi.luz.modo === "mapa");
    est.luz = { modo: mapa ? "mapa" : "base", mapas: 0, propia: 0, entorno: false };
    conEntorno.clear();
    for (const mt of mats) {
      if (mt.isMeshBasicMaterial) { mt.toneMapped = false; est.sinLuz++; if (mt.lightMap) est.luz.mapas++; }
      else if (mapa && mt.aoMap) { mt.toneMapped = false; est.luz.propia++; conEntorno.add(mt); }   // luz propia (§1e): fuera del tone mapping, con el entorno
      if (mt.vertexColors) est.conColor++;
      if (typeof mt.alphaTest === "number" && mt.alphaTest > 0) est.recorte++;
      texturasDe(mt, texs);
    }
    est.triangulos = tri; est.llamadas = llam; est.materiales = mats.size; est.texturas = texs.size; est.nombre = mi.nombre; est.fuente = mi.fuente;
    raiz = gltf.scene; man = mi;
    zonas = P.creaZonas(mi.zonas); puertas = P.puertasPose(mi.puertas); vigia = P.creaVigia(puertas);
    // las texturas, a la GPU de una en una por la Cola: cada yield deja respirar al fotograma (a oscuras, tras el fundido)
    const sube = deps.subeTextura;
    if (sube && texs.size) await new Promise<void>((ok, mal) => {
      const lista = Array.from(texs);
      function* trabajo(): Generator<unknown, unknown, unknown> { for (const t of lista) { sube!(t); yield; } return lista.length; }
      const corta = (): void => mal(new Error("«" + id + "»: carga cancelada"));
      if (ctx.senal.aborted) { corta(); return; }
      ctx.senal.addEventListener("abort", corta, { once: true });
      ctx.cola.pon("texturas", 0, trabajo(), () => { ctx.senal.removeEventListener("abort", corta); ok(); });
    });
    // la luz de lo que tiene luz propia: el entorno hecho con la sonda de la sala (después de subir las texturas: no cuenta entre ellas)
    const sonda = mi.luz && mi.luz.sonda;
    if (conEntorno.size && sonda && deps.entorno) {
      entorno = deps.entorno(sonda.flat());
      if (entorno) { for (const mt of conEntorno) { mt.envMap = entorno.textura; mt.envMapIntensity = 1; mt.needsUpdate = true; } est.luz.entorno = true; }
    }
  }

  function aviso(t: string, ms?: number): void { if (deps.aviso) deps.aviso(t, ms); }

  function entra(desde: Puerta | null, llegada: Pose2 | null): void {
    if (!raiz || !man || !zonas) throw new Error("«" + id + "»: entra() sin carga()");
    deps.escena.add(raiz); colgado = true; est.colgado = true;
    if (deps.alEntrar) deps.alEntrar();
    // por una puerta, la llegada de la nuestra que lleva al mundo de donde se viene; si no (?mundo=, o una vuelta atrás), donde se dejó o la principal
    // (eje B: la puerta del exterior trae la llegada de la puerta por la que se entra, que el exterior conoce por el anclaje)
    let p: Pose2 = desde ? desde.llegada || P.llegada(man, desde.de) : llegada || P.llegada(man, null);
    // donde se dejó, si fue en el umbral de una puerta (se salió por ella, o falló el cambio al cruzarla): a su llegada, dentro y mirando hacia dentro,
    // para no aparecer en el vano mirando afuera con la puerta desarmada
    const enPuerta = puertas.findIndex(pu => P.aUmbral(pu, p.x, p.y) < P.RADIO + P.HISTERESIS);
    if (!desde && enPuerta >= 0) p = P.poseDe(man.puertas[enPuerta]!.llegada);
    if (!zonas.dentro(p.x, p.y)) { const c = zonas.obstaculo(p.x, p.y); if (c) p = { x: c.x, y: c.y, ang: p.ang }; }
    if (deps.pose) deps.pose.pon(p);
    inertes.clear();
    if (vigia) vigia.arma(p.x, p.y);
    aviso(P.rotulo(man), 4000);
    if (deps.visita && deps.pose && man.paradas) {
      const err = VisitaPuro.valida(man);
      if (err.length) { if (deps.consola) deps.consola.warn("[interior " + id + "] sin visita: " + err.join("; ")); }
      else { visita = creaVisita({ ...deps.visita, man, escena: deps.escena, pose: deps.pose, vr: deps.vr, existe: deps.existe }); visita.monta(); }
    }
    // las máquinas: en marcha (salvo reducir movimiento) y su interruptor, con lo de la UI de la visita (documento y panel de VR)
    if (maquinas) {
      const v = deps.visita, r = deps.reducido;
      maquinas.monta({ documento: v ? v.documento : null, PanelVR: v && v.PanelVR ? v.PanelVR : null, ...(r ? { reducido: r } : {}) });
    }
  }
  function sueltaVisita(): void { if (visita) { visita.libera(); visita = null; } }

  function actualiza(dt: number): void {
    if (maquinas) maquinas.cada(dt);
    if (visita) visita.cada();
    if (!vigia || !deps.pose) return;
    const p = deps.pose.lee(), pu = vigia.paso(p.x, p.y);
    if (!pu) return;
    if (pu.a !== "exterior" && !deps.existe(pu.a)) {   // a un mundo que no existe (vivienda) o que no está registrado (bodega): inerte, y lo dice una vez por acercamiento
      if (!inertes.has(pu.id)) { inertes.add(pu.id); aviso("Esta puerta lleva a «" + pu.a + "», que aún no está en el gemelo", 3000); }
      return;
    }
    inertes.delete(pu.id);
    const puerta: Puerta = { id: id + "→" + pu.a + ":" + pu.id, de: id, a: pu.a as IdMundo, pos: { x: pu.x, y: pu.y }, radio: P.RADIO, histeresis: P.HISTERESIS };
    deps.cruza(pu.a as IdMundo, puerta);
  }

  function sale(): Pose2 {
    sueltaVisita();
    if (maquinas) maquinas.desmonta();
    if (raiz && colgado) deps.escena.remove(raiz);
    colgado = false; est.colgado = false;
    if (deps.alSalir) deps.alSalir();
    const p = deps.pose ? deps.pose.lee() : null;
    return p ? { x: p.x, y: p.y, ang: p.ang } : { x: 0, y: 0, ang: 0 };
  }

  // dispose de todo lo que cuelga de una raíz: geometrías, materiales y sus texturas (y los ImageBitmap del GLTFLoader, que dispose no cierra)
  function suelta(r: Nodo3D): void {
    const texs = new Set<Textura3D>(), mats = new Set<Material3D>();
    r.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const mt of materialesDe(o)) mats.add(mt);
    });
    for (const mt of mats) { texturasDe(mt, texs); mt.dispose(); }
    for (const t of texs) { t.dispose(); const im = t.image; if (im && typeof im.close === "function") im.close(); }
  }

  function libera(): void {
    sueltaVisita();
    if (maquinas) { maquinas.desmonta(); maquinas = null; }
    // el entorno es de un render target: fuera de los materiales (que suelta() no lo toque) y se suelta entero
    for (const mt of conEntorno) mt.envMap = null;
    conEntorno.clear();
    if (entorno) { entorno.dispose(); entorno = null; }
    est.luz.entorno = false;
    if (raiz) { if (colgado) deps.escena.remove(raiz); suelta(raiz); }
    if (leido) suelta(leido.escena);   // una precarga que nadie usó (quien andaba se alejó); la que está en vuelo la corta la señal (y lee() suelta lo leído)
    leido = null; pendiente = null; est.precargado = false;
    raiz = null; man = null; zonas = null; puertas = []; vigia = null; colgado = false; est.colgado = false;
    if (luces) for (const l of luces) if (l.dispose) l.dispose();
    luces = null; liberado = true; est.liberado = true;
  }

  return {
    id,
    alSalir: "libera",
    sala: null,
    marco: "local",
    precarga,
    carga,
    entra,
    actualiza,
    sale,
    congela(): void { /* nada: sale() ya lo descolgó y el vigía no corre fuera del mundo activo */ },
    libera,
    suelo(x: number, y: number): number { return zonas ? zonas.suelo(x, y) : 0; },
    dentro(x: number, y: number): boolean { return zonas ? zonas.dentro(x, y) : false; },
    obstaculo(x: number, y: number): Pose2 | null { return zonas ? zonas.obstaculo(x, y) : null; },
    presupuesto(p) { return { ...(p.clase === "vr" ? P.PRESUPUESTO.quest : P.PRESUPUESTO.pantalla) }; },
    ambiente(): Ambiente {
      // con el entorno de la sonda, lo que tiene luz ya la tiene: la ambiental de v1 la sumaría encima
      if (!luces) luces = deps.luz && !liberado && !entorno ? [deps.luz("ambiental", LUZ_INTERIOR.color, LUZ_INTERIOR.intensidad)] : [];
      return { cielo: "ninguno", fondo: FONDO_INTERIOR, niebla: null, luces, camara: { near: CAMARA_INTERIOR.near, far: CAMARA_INTERIOR.far }, exag: 1 };
    },
    estado(): EstadoInterior { return { ...est, luz: { ...est.luz }, visita: visita ? visita.estado() : null, maquinas: maquinas ? maquinas.estado() : null }; },
    /** v1.1: la visita (para las pruebas: __interiorVisita) */
    visita: (): Visita | null => visita,
    /** v1.2: las máquinas (para las pruebas y ?debug: __maquinas) */
    maquinas: (): Maquinas | null => maquinas,
  };
}
export type Interior = ReturnType<typeof creaInterior>;
