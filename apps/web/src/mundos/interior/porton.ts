// La puerta del cortijo (eje B): entrar andando desde el exterior en un interior anclado, sin URL. Componente «porton-cortijo» de los mundos ["exterior"],
// que registra el cableado de los interiores (cableado.ts) y va en el paquete principal (no importa el mundo interior: solo su lógica pura).
//   · Dónde: el anclaje del manifiesto del interior (contrato mundo-interior v1.1, opcional): al montarse pide el mundo.json de cada interior de la finca
//     (el del perfil de este aparato, que es pequeño; el glb no) y pone una puerta en el exterior por cada puerta del interior que lleva a «exterior».
//     Solo lo pide con D.base /teselas/… (el servidor, donde viven los interiores; decisión 227) o con ?porton=1; sin anclaje, sin manifiesto o sin sesión
//     (el Caddy los sirve solo tras sesión) no hay puerta y no pasa nada más.
//   · La marca: un marco violeta (como los portones del modelo) del ancho y el alto de la puerta, a la altura del terreno, y el rótulo «Entrada al
//     cortijo». ILUSTRATIVA (regla 5): la posición sale del anclaje, que se dedujo de un pin en un mapa; el cortijo del exterior sigue siendo la huella
//     del LiDAR. 2 llamadas y unos 10 triángulos por puerta, con un material para todos los marcos y otro para todos los rótulos.
//   · Cruzar: el vigía de las puertas del interior (InteriorPuro.creaVigia) en el marco del exterior, con RADIO_EXT y HISTERESIS_EXT (puro.ts dice por qué
//     son mayores que dentro). Con el dron fuera no se cruza (quien lo pilota se queda quieto). Se entra por la llegada de ESA puerta del interior.
//   · Precarga: a menos de PRECARGA m del umbral, gm.precarga(id) (la red y el parse del glb; nada de GPU); a más de SUELTA m, o fuera del paseo,
//     gm.suelta(id): no se queda nada en memoria de más.
//   · «Ir al cortijo»: en el minimapa (el icono de la puerta: un toque enseña el nombre, otro te lleva) y en la pestaña «Ir a» del panel de VR. Te deja con
//     fundido (Llegada.ve) a FRENTE m de la puerta principal, mirándola: el último paso, andando.
//   · El quad: si se entra en él, se queda aparcado delante de la puerta (Vida.aparca) y al salir por esa misma puerta se vuelve a montar; dentro, ni quad ni
//     dron (Vida.bloquea, con un aviso). Lo usa el cableado al entrar y salir de un interior (alEntraInterior / alSaleInterior).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { IdMundo, Pose2, Puerta, ResultadoCambio } from "../../nucleo/mundos.ts";
import type { T } from "../comun/tipos.ts";
import { InteriorPuro } from "./puro.ts";
import type { Acceso, PuertaPose } from "./puro.ts";

export const ID_PORTONES = "porton-cortijo";
/** el violeta de los portones del modelo de los patios [SUPUESTO: a ojo] y el texto del rótulo */
const COLOR = 0x7a4fb0, ROTULO = "Entrada al cortijo";
/** al salir, se vuelve a montar en el quad si quedó aparcado a menos de esto (m) de donde se aparece: se aparca justo donde aparece quien sale por esa
 *  puerta (su «fuera»), así que solo vale la misma puerta; por la otra (el portón lateral de los patios queda a unos 20 m) se queda aparcado y se ve */
const CERCA_QUAD = 5;

export interface VidaPortones {
  E: { enQuad: boolean; enDron: boolean };
  ponQuad(on: boolean): void;
  bloquea(aviso: ((que: "quad" | "dron") => void) | null): void;
  aparca(p: Pose2 | null): void;
  aparcado(): Pose2 | null;
}

export interface DepsPortones {
  ids: readonly IdMundo[];
  /** D.base (la de las teselas) */
  base: string;
  /** ¿se buscan los anclajes? (D.base /teselas/… o ?porton=1) */
  sondea: boolean;
  vr(): boolean; clase(): string;
  descarga(url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  gm: {
    readonly actual?: IdMundo | null; readonly estado?: string; fichaDe(id: IdMundo): string;
    precarga?(id: IdMundo): boolean; suelta?(id: IdMundo): boolean; precargado?(id: IdMundo): boolean; retorno?(id: IdMundo): Pose2 | null;
  };
  /** el cambio de mundo del cableado (que además pone ?mundo= en la dirección) */
  cambia(a: IdMundo, llegada: Pose2 | null, puerta: Puerta | null): Promise<ResultadoCambio>;
  pose: { lee(): Pose2 };
  paseando(): boolean;
  aviso(s: string, ms?: number): void;
  Vida?: VidaPortones | null;
  Llegada?: { ve(x: number, y: number, ang?: number): boolean } | null;
  Minimapa?: { capa(fn: (c: T, X: (x: number) => number, Y: (y: number) => number) => void, orden?: number, toca?: (x: number, y: number) => boolean): () => void } | null;
  PanelVR?: { filas(p: string, f: T): () => void } | null;
  THREE?: T; scene?: T; Materiales?: T; documento?: T;
  suelo?(x: number, y: number): number;
  Estado?: { exag: number };
  ahora(): number;
  consola?: { warn(...a: unknown[]): void } | null;
}

export function creaPortones(d: DepsPortones) {
  const P = InteriorPuro;
  let accesos: Acceso[] = [], umbrales: PuertaPose[] = [], vigia: ReturnType<typeof P.creaVigia> | null = null, armado = false, vivo = true;
  let grupo: T = null, materiales: T = null, exagHecha = NaN, selHasta = 0, icono: { x: number; y: number } | null = null, quitar: Array<() => void> = [];
  let ultimo: Acceso | null = null, quadAparcado = false;
  const est = { sondeados: 0, accesos: 0, cruces: 0, precargas: 0, sueltas: 0, error: null as string | null };

  // ---- los anclajes: el mundo.json de cada interior (el del perfil de este aparato)
  async function sondea(): Promise<void> {
    const perfil = P.perfil({ vr: d.vr(), clase: d.clase() }), lista: Acceso[] = [];
    for (const id of d.ids) {
      try {
        const r = await d.descarga(P.ruta(d.base, id, perfil) + "mundo.json"); est.sondeados++;
        if (!r.ok) continue;
        const m = await r.json();
        if (P.valida(m, id).length) continue;
        lista.push(...P.accesos(m as Parameters<typeof P.accesos>[0]));
      } catch (e) { est.error = String(e); }
    }
    if (!vivo || !lista.length) return;
    accesos = lista; umbrales = lista.map(a => a.umbral); vigia = P.creaVigia(umbrales, P.RADIO_EXT, P.HISTERESIS_EXT); armado = false; est.accesos = lista.length;
    marcas();
  }

  // ---- la marca de cada puerta: un marco del ancho y el alto de la puerta (que baja medio metro bajo el suelo: el terreno no es plano) y el rótulo
  function marcas(): void {
    if (!d.THREE || !d.scene || !d.Materiales) return;
    const THREE = d.THREE;
    materiales = d.Materiales.de(ID_PORTONES);
    const mMarco = materiales.estandar("MeshBasicMaterial", { color: COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const lienzo = d.documento ? d.documento.createElement("canvas") : null;
    let mRotulo: T = null;
    if (lienzo) {
      lienzo.width = 512; lienzo.height = 128;
      const c = lienzo.getContext("2d");
      if (c) {
        c.fillStyle = "rgba(16,20,24,0.78)"; c.fillRect(0, 0, 512, 128);
        c.fillStyle = "#ffffff"; c.font = "600 52px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ROTULO, 256, 52);
        c.font = "400 26px system-ui, sans-serif"; c.fillStyle = "rgba(255,255,255,0.8)"; c.fillText("marca ilustrativa", 256, 102);
        const tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
        mRotulo = materiales.estandar("SpriteMaterial", { map: tex, transparent: true, depthWrite: false });
      }
    }
    grupo = new THREE.Group(); grupo.name = ID_PORTONES;
    for (const a of accesos) {
      const w = a.umbral.medio, W = w + 0.18, h = a.alto, H = a.alto + 0.18, s = new THREE.Shape();
      s.moveTo(-W, -0.5); s.lineTo(-w, -0.5); s.lineTo(-w, h); s.lineTo(w, h); s.lineTo(w, -0.5); s.lineTo(W, -0.5); s.lineTo(W, H); s.lineTo(-W, H); s.closePath();
      const g = new THREE.Group(), marco = new THREE.Mesh(new THREE.ShapeGeometry(s), mMarco);
      g.add(marco); g.rotation.y = Math.atan2(a.umbral.uy, a.umbral.ux); g.userData.acceso = a;
      if (mRotulo) { const r = new THREE.Sprite(mRotulo); r.scale.set(3.2, 0.8, 1); r.position.set(0, H + 0.7, 0); g.add(r); }
      grupo.add(g);
    }
    d.scene.add(grupo);
    alturas();
  }
  // a la altura del terreno (y de la exageración del relieve, que se puede cambiar)
  function alturas(): void {
    if (!grupo) return;
    const ex = d.Estado ? d.Estado.exag : 1; if (ex === exagHecha) return; exagHecha = ex;
    for (const g of grupo.children) { const a = g.userData.acceso as Acceso; g.position.set(a.umbral.x, (d.suelo ? d.suelo(a.umbral.x, a.umbral.y) : 0) * ex, -a.umbral.y); }
  }

  const enExterior = (): boolean => (d.gm.actual === undefined || d.gm.actual === "exterior") && (d.gm.estado === undefined || d.gm.estado === "en");

  // ---- cada fotograma (fase «mundo», solo con el exterior activo): ¿se cruza alguna?
  function cada(): void {
    if (!vigia || !accesos.length) return;
    if (!enExterior() || !(d.paseando() || d.vr())) { armado = false; return; }
    const p = d.pose.lee();
    if (!armado) { vigia.arma(p.x, p.y); armado = true; return; }   // al volver al exterior o al empezar a pasear: no se cruza la que se tiene encima
    if (d.Vida && d.Vida.E.enDron) return;
    const u = vigia.paso(p.x, p.y);
    if (u) cruza(accesos[umbrales.indexOf(u)]!);
  }
  function cruza(a: Acceso): void {
    est.cruces++; ultimo = a;
    const puerta: Puerta = { id: "exterior→" + a.mundo + ":" + a.puerta, de: "exterior", a: a.mundo as IdMundo, pos: { x: a.umbral.x, y: a.umbral.y }, radio: P.RADIO_EXT, histeresis: P.HISTERESIS_EXT, llegada: a.llegada };
    d.cambia(a.mundo as IdMundo, null, puerta).then(r => { if (!r.ok && r.motivo !== "ocupado") d.aviso("No se ha podido entrar en el cortijo", 4000); });
  }

  // ---- cada 0,5 s (fase «tarde»): precargar al acercarse y soltar al alejarse; la altura de las marcas si cambia el relieve
  function tarde(): void {
    alturas();
    if (!accesos.length || !d.gm.precarga || !d.gm.suelta || !d.gm.precargado) return;
    if (d.gm.estado !== undefined && d.gm.estado !== "en") return;
    const anda = enExterior() && (d.paseando() || d.vr()), p = d.pose.lee();
    for (const id of d.ids) {
      let dm = Infinity;
      for (const a of accesos) if (a.mundo === id) dm = Math.min(dm, P.aUmbral(a.umbral, p.x, p.y));
      if (dm === Infinity) continue;
      if (anda && dm < P.PRECARGA) { if (d.gm.fichaDe(id) === "sin_cargar" && !d.gm.precargado(id) && d.gm.precarga(id)) est.precargas++; }
      else if ((!anda || dm > P.SUELTA) && d.gm.precargado(id) && d.gm.suelta(id)) est.sueltas++;
    }
  }

  // ---- «Ir al cortijo»: a FRENTE m de la puerta principal, mirándola, con fundido
  function irAlCortijo(): boolean {
    const a = accesos[0];
    if (!a || !d.Llegada) return false;
    if (!enExterior()) { d.aviso("«Ir al cortijo» se usa desde fuera", 3000); return false; }
    selHasta = 0;
    return d.Llegada.ve(a.frente.x, a.frente.y, a.frente.ang);
  }

  // ---- el minimapa: el icono de la puerta principal; un toque, su nombre; otro en 4 s, «Ir al cortijo»
  function pintaMapa(c: T, X: (x: number) => number, Y: (y: number) => number): void {
    const a = accesos[0]; if (!a) { icono = null; return; }
    const x = X(a.umbral.x), y = Y(a.umbral.y); icono = { x, y };
    c.fillStyle = "#" + COLOR.toString(16).padStart(6, "0"); c.strokeStyle = "#ffffff"; c.lineWidth = 1.4;
    c.beginPath(); c.rect(x - 6, y - 6, 12, 12); c.fill(); c.stroke();
    c.fillStyle = "#ffffff"; c.fillRect(x - 2.2, y - 3, 4.4, 7);   // la puerta
    if (d.ahora() < selHasta) {
      const t = ROTULO + " · toca otra vez para ir";
      c.font = "600 10px system-ui, sans-serif"; c.textBaseline = "middle"; c.textAlign = "left";
      const w = c.measureText(t).width + 8, ex = Math.max(2, x + 9), ey = y;
      c.fillStyle = "rgba(122,79,176,0.92)"; c.fillRect(ex, ey - 7, w, 14); c.fillStyle = "#ffffff"; c.fillText(t, ex + 4, ey + 0.5);
    }
  }
  function tocaMapa(x: number, y: number): boolean {
    if (!icono || (x - icono.x) * (x - icono.x) + (y - icono.y) * (y - icono.y) > 14 * 14) return false;
    if (d.ahora() < selHasta) irAlCortijo(); else selHasta = d.ahora() + 4000;
    return true;
  }

  // ---- al entrar en un interior y al salir (el cableado, a oscuras): el quad se aparca; dentro, ni quad ni dron
  function alEntraInterior(): void {
    const V = d.Vida; if (!V) return;
    if (V.E.enQuad) {
      const sitio = ultimo ? ultimo.fuera : d.gm.retorno ? d.gm.retorno("exterior") : null;
      if (sitio) { V.aparca(sitio); quadAparcado = true; }
    }
    V.bloquea(que => d.aviso(que === "dron" ? "Dentro del cortijo no se vuela el dron" : "El quad se queda fuera, en la puerta", 3000));
  }
  /** destino: el mundo al que se va; llegada: dónde se aparece en él (si es el exterior) */
  function alSaleInterior(destino: IdMundo | null, llegada: Pose2 | null): void {
    const V = d.Vida; if (!V || destino !== "exterior") return;
    V.bloquea(null);
    const q = V.aparcado();
    if (quadAparcado && q && llegada && Math.hypot(q.x - llegada.x, q.y - llegada.y) <= CERCA_QUAD) { V.aparca(null); V.ponQuad(true); }
    quadAparcado = false; ultimo = null;
  }
  /** dónde se aparece fuera al salir de `mundo` por su puerta `puerta` (que lleva al exterior), o null si no está anclado */
  function salida(mundo: string, puerta: string): Pose2 | null {
    const a = accesos.find(x => x.mundo === mundo && x.puerta === puerta);
    return a ? { x: a.fuera.x, y: a.fuera.y, ang: a.fuera.ang } : null;
  }

  function monta(n: { on(ev: string, fn: (datos?: T) => void): () => void }): void {
    vivo = true;
    quitar.push(n.on("mundo:entra", (x?: T) => { if (x && x.id === "exterior") armado = false; }));
    if (d.Minimapa) quitar.push(d.Minimapa.capa(pintaMapa, 6, tocaMapa));
    if (d.PanelVR) quitar.push(d.PanelVR.filas("ira", { id: "cortijo", orden: 15, alto: 88, visible: () => accesos.length > 0,
      firma: () => accesos.length, pinta: (_cx: T, y: number, _W: T, h: T) => { h.fila("Cortijo", y); },
      botones: (b: T, y: number) => { b("cortijo", 420, y, 470, 64, "Ir al cortijo", irAlCortijo, false); } }));
    if (d.sondea) sondea().catch(e => { est.error = String(e); if (d.consola) d.consola.warn("[porton-cortijo]", e); });
  }
  function libera(): void {
    vivo = false;
    for (const q of quitar.splice(0)) { try { q(); } catch (e) { /* ya suelto */ } }
    if (grupo) {
      if (grupo.parent) grupo.parent.remove(grupo);
      grupo.traverse((o: T) => { if (o.geometry) o.geometry.dispose(); if (o.isSprite && o.material && o.material.map) o.material.map.dispose(); });
      grupo = null;
    }
    if (materiales) { materiales.libera(); materiales = null; }
    if (d.gm.suelta) for (const id of d.ids) if (d.gm.precargado && d.gm.precargado(id)) d.gm.suelta(id);
    accesos = []; umbrales = []; vigia = null; icono = null;
  }

  return {
    monta, libera, cada, tarde, irAlCortijo, alEntraInterior, alSaleInterior, salida, tocaMapa, pintaMapa,
    /** para ?debug y las pruebas */
    estado: () => ({ ...est, armadas: vigia ? vigia.armadas() : [], marcas: grupo ? grupo.children.length : 0, accesos: accesos.map(a => ({ mundo: a.mundo, puerta: a.puerta, x: a.umbral.x, y: a.umbral.y, fuera: a.fuera, frente: a.frente })) }),
    accesos: (): readonly Acceso[] => accesos,
  };
}
export type Portones = ReturnType<typeof creaPortones>;

/** El manifiesto del componente «porton-cortijo» (de los mundos ["exterior"]): ?porton=0 lo apaga. */
export function manifiestoPortones(p: Portones): Manifiesto {
  return {
    id: ID_PORTONES, version: 1,
    consume: [], expone: [],
    eventos: { escucha: ["mundo:entra"], emite: [] },
    bandera: { defecto: true, url: "porton" },
    presupuesto: { llamadas: 4, triangulos: 32 },   // dos puertas al exterior (los patios): marco y rótulo cada una
    fases: { mundo: 0, tarde: 0.5 },
    actualiza: { mundo: () => { p.cada(); }, tarde: () => { p.tarde(); } },
    mundos: ["exterior"],
    monta: n => { p.monta(n); return p; },
    libera: () => { p.libera(); },
  };
}
