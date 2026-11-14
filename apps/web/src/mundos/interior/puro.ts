// Lo puro del mundo interior genérico (eje B; ADR-0033, MUNDOS §2 y §5; contrato contratos/mundo-interior.md v1): sin three, sin DOM y sin red.
// Un solo módulo para cualquier interior que cumpla el contrato (patios, fábrica y los que vengan): aquí, qué carpeta se pide según el aparato,
// qué se comprueba del manifiesto antes de cargar el glb, cómo se pasa del marco del glb al de quien anda, las zonas por las que se anda y las
// puertas que se cruzan. Lo prueba interior/puro.test.ts en Vitest.
//
// Marcos. El glb va en metros, +Y arriba (glTF); el contrato da las zonas en planta como [x, z] y las puertas como [x, y, z]. Quien anda (pp de
// 12_paseo, Pose2) va en (x, y) con y = −z de three (paseo.ts: persona.position.set(pp.x, suelo, −pp.y)), y su ang avanza por (sin ang, cos ang).
// El rumbo del contrato son grados desde +Z hacia +X: la dirección (sin r, cos r) en (x, z), que en el marco de quien anda es (sin r, −cos r);
// por eso ang = π − r. El glb se cuelga tal cual (sin girarlo): el «norte» de un interior no es el de la finca (marco «local»).
import type { Anclaje, MundoInterior, Puerta as PuertaInterior, Zona } from "../../datos/contratos/mundo-interior.ts";
import type { Pose2 } from "../../nucleo/mundos.ts";

/** Las dos carpetas que deja el exportador del eje B (salida/<mundo>/<perfil>/): «quest», la ligera (cabe en el perfil objetivo del contrato), y
 *  «pantalla», la completa (cabe en el perfil «pantalla», no en el objetivo: el validador dice NO PASA y es lo esperado). */
export type PerfilInterior = "pantalla" | "quest";

/** ¿Qué carpeta? La ligera en una sesión de VR o en unas gafas (Aparato.clase() «quest», la única detección del aparato: nucleo/aparato.ts); la
 *  completa en escritorio y en móvil. El móvil pide la completa a propósito (lo pidió Antonio): si no cabe en su memoria, se verá al medirlo. */
function perfil(o: { vr: boolean; clase: string }): PerfilInterior {
  return o.vr || o.clase === "quest" ? "quest" : "pantalla";
}

/** La carpeta del interior: `<base><mundo>/<perfil>/`. base es D.base del índice («/teselas/<finca>/» en el servidor, decisión 227; vacía = junto
 *  a la página, como las teselas t/). Nunca otro host (CLAUDE.md §5): una base con esquema o con «//» se rechaza. */
function ruta(base: string | null | undefined, mundo: string, p: PerfilInterior): string {
  const b = typeof base === "string" ? base : "";
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(b)) throw new Error("la base de los interiores tiene que ser del mismo origen: «" + b + "»");
  if (!ID.test(mundo)) throw new Error("id de mundo no válido: «" + mundo + "»");
  return (b && !b.endsWith("/") ? b + "/" : b) + mundo + "/" + p + "/";
}

const ID = /^[a-z][a-z0-9-]{0,31}$/, ID_PIEZA = /^[a-z0-9][a-z0-9_-]{0,31}$/, GLB = /^[a-z0-9][a-z0-9_.-]*\.glb$/;
const num = (v: unknown): v is number => typeof v === "number" && isFinite(v);
const par = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(num);

/** punto en polígono (par-impar), en planta. Copia de la regla del validador (tuberia/interiores/valida.js, que es de Node) y de la de las hazas
 *  (mundos/exterior/hazas.ts, que un interior no puede importar: «un-mundo-no-importa-a-otro»): seis líneas, sin librería que lo justifique. */
function enPoligono(x: number, y: number, anillo: ReadonlyArray<readonly [number, number]>): boolean {
  let s = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[i]!, b = anillo[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) s = !s;
  }
  return s;
}

/**
 * Lo que el motor comprueba del manifiesto antes de pedir el glb: lo que necesita para no romperse (forma, ids, zonas, puertas, la principal en el
 * origen, las llegadas sobre una zona). La validación entera (el esquema con ajv, el glb con gltf-validator y el presupuesto) es del validador del eje B
 * (tuberia/interiores/valida.js) al entregar; aquí no cabe ajv: compila con `new Function` y la CSP del Caddy no deja `unsafe-eval`. Las dos se
 * contrastan en interior/puro.test.ts (el ejemplo del contrato pasa en los dos y los casos rotos del manifiesto los rechazan los dos).
 * Devuelve la lista de errores (vacía = vale).
 */
function valida(m: unknown, idEsperado: string): string[] {
  const e: string[] = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["mundo.json no es un objeto"];
  const o = m as Record<string, unknown>;
  if (o.v !== 1) e.push("v: el motor lee la versión 1 del contrato, no «" + String(o.v) + "»");
  if (typeof o.id !== "string" || !ID.test(o.id) || o.id === "exterior") e.push("id no válido: «" + String(o.id) + "»");
  else if (o.id !== idEsperado) e.push("el manifiesto es de «" + o.id + "» y se pidió «" + idEsperado + "»");
  if (typeof o.nombre !== "string" || !o.nombre || o.nombre.length > 60) e.push("nombre: texto de 1 a 60 caracteres");
  if (o.fuente !== "medido" && o.fuente !== "ilustrativo" && o.fuente !== "mixto") e.push("fuente: medido, ilustrativo o mixto");
  if (typeof o.glb !== "string" || !GLB.test(o.glb)) e.push("glb: un nombre de fichero .glb junto al manifiesto");
  if (o.unidades !== "m") e.push("unidades: «m»");
  if (o.arriba !== "+Y") e.push("arriba: «+Y»");
  const zonas = Array.isArray(o.zonas) ? o.zonas as unknown[] : null, puertas = Array.isArray(o.puertas) ? o.puertas as unknown[] : null;
  if (!zonas || zonas.length < 1 || zonas.length > 64) e.push("zonas: de 1 a 64");
  if (!puertas || puertas.length < 1 || puertas.length > 8) e.push("puertas: de 1 a 8");
  const zv: Zona[] = [];
  (zonas || []).forEach((z, i) => {
    const q = z as Partial<Zona> | null;
    if (!q || typeof q.id !== "string" || !ID_PIEZA.test(q.id)) { e.push("zonas[" + i + "].id no válido"); return; }
    if (!Array.isArray(q.anillo) || q.anillo.length < 3 || q.anillo.length > 256 || !q.anillo.every(p => par(p, 2))) { e.push("la zona «" + q.id + "»: anillo de 3 a 256 puntos [x, z]"); return; }
    if (!num(q.y) || q.y < -20 || q.y > 50) { e.push("la zona «" + q.id + "»: cota y entre −20 y 50"); return; }
    if (area(q.anillo) < 0.5) e.push("la zona «" + q.id + "» tiene menos de 0,5 m²");
    zv.push(q as Zona);
  });
  const pisa = (p: readonly number[]): boolean => zv.some(z => enPoligono(p[0]!, p[2]!, z.anillo) && Math.abs(z.y - p[1]!) <= 0.1);
  (puertas || []).forEach((pu, i) => {
    const q = pu as Partial<PuertaInterior> | null;
    if (!q || typeof q.id !== "string" || !ID_PIEZA.test(q.id)) { e.push("puertas[" + i + "].id no válido"); return; }
    if (typeof q.a !== "string" || !ID.test(q.a)) e.push("la puerta «" + q.id + "»: a no es un id de mundo");
    else if (q.a === o.id) e.push("la puerta «" + q.id + "» lleva a su propio mundo");
    if (!par(q.pos, 3)) { e.push("la puerta «" + q.id + "»: pos [x, y, z]"); return; }
    if (!num(q.rumbo) || q.rumbo < 0 || q.rumbo >= 360) e.push("la puerta «" + q.id + "»: rumbo en [0, 360)");
    if (!num(q.ancho) || q.ancho <= 0.5 || q.ancho > 10) e.push("la puerta «" + q.id + "»: ancho en (0,5, 10]");
    if (!num(q.alto) || q.alto < 1.8 || q.alto > 10) e.push("la puerta «" + q.id + "»: alto en [1,8, 10]");
    const ll = q.llegada;
    if (!ll || !par(ll.pos, 3) || !num(ll.rumbo) || ll.rumbo < 0 || ll.rumbo >= 360) { e.push("la puerta «" + q.id + "»: llegada {pos [x, y, z], rumbo}"); return; }
    if (i === 0 && (Math.hypot(q.pos[0]!, q.pos[2]!) > 0.05 || Math.abs(q.pos[1]!) > 0.05)) e.push("la puerta principal («" + q.id + "», la primera) va en el origen (0, 0, 0)");
    if (zv.length && !pisa(ll.pos)) e.push("la llegada de la puerta «" + q.id + "» no cae dentro de ninguna zona a su cota");
  });
  // v1.1: el anclaje en el exterior es opcional; si viene, tiene que servir (si no, la puerta del exterior caería en cualquier sitio)
  if (o.anclaje !== undefined) {
    const an = o.anclaje as Partial<Anclaje> | null;
    if (!an || typeof an !== "object" || !par(an.pos, 2) || !num(an.giro) || an.giro < 0 || an.giro >= 360) e.push("anclaje: {pos: [x, y], giro en [0, 360)}");
  }
  for (const [lista, que] of [[zonas, "zona"], [puertas, "puerta"]] as const) {
    const ids = (lista || []).map(x => (x && typeof x === "object" ? (x as { id?: unknown }).id : undefined));
    const rep = ids.filter((x, i) => x !== undefined && ids.indexOf(x) !== i);
    if (rep.length) e.push("id de " + que + " repetido: " + [...new Set(rep)].join(", "));
  }
  return e;
}

function area(anillo: ReadonlyArray<readonly number[]>): number {
  let a = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) a += (anillo[j]![0]! + anillo[i]![0]!) * (anillo[j]![1]! - anillo[i]![1]!);
  return Math.abs(a) / 2;
}

/** grados del contrato (desde +Z hacia +X) → ang de quien anda, en (−π, π] */
function angDeRumbo(rumbo: number): number {
  let a = Math.PI - rumbo * Math.PI / 180;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Una llegada del contrato ({pos: [x, y, z], rumbo}) en el marco de quien anda. */
function poseDe(ll: { pos: readonly number[]; rumbo: number }): Pose2 {
  return { x: ll.pos[0]!, y: -ll.pos[2]!, ang: angDeRumbo(ll.rumbo) };
}

/**
 * Dónde aparece quien entra. Si viene de otro mundo por una puerta, por la puerta de ESTE interior que lleva a ese mundo (la del contrato: «llegada,
 * dónde aparece quien entra por ella»; de la fábrica a los patios, la de los patios que lleva a «fabrica»). Si no hay puerta hacia allí (o se entra
 * sin venir de ningún sitio: ?mundo=patios), por la principal, puertas[0].
 */
function llegada(m: Pick<MundoInterior, "puertas">, desde: string | null): Pose2 {
  const pu = (desde ? m.puertas.find(p => p.a === desde) : undefined) || m.puertas[0];
  return poseDe(pu.llegada);
}

/** Las zonas en el marco de quien anda: (x, y) = (x, −z) del glb. */
export interface ZonaPose { id: string; anillo: Array<[number, number]>; suelo: number; cx: number; cy: number }

/**
 * Las zonas por las que se anda (contrato v1: suelo plano por zona; fuera de ellas es pared). dentro(x, y): dentro de alguna. suelo(x, y): la cota de
 * la zona en la que se está; fuera de todas, la de la más cercana (quien anda nunca está fuera: obstaculo lo devuelve). obstaculo(x, y): null si está
 * dentro; si no, el punto más cercano del borde de alguna zona, 1 cm hacia su interior, y SIEMPRE el mismo objeto (regla 6: se llama en cada
 * fotograma del paseo y de la VR, y quien lo recibe copia x e y en el acto, como el del exterior y el del vacío). Sin radio: la pared es el borde de
 * la zona (las zonas de las salidas de hoy son rectángulos dibujados a mano [SUPUESTO], sin recortar muretes ni máquinas).
 */
function creaZonas(zonas: readonly Zona[]) {
  const Z: ZonaPose[] = zonas.map(z => {
    const anillo = z.anillo.map(p => [p[0], -p[1]] as [number, number]);
    let cx = 0, cy = 0; for (const p of anillo) { cx += p[0]; cy += p[1]; }
    return { id: z.id, anillo, suelo: z.y, cx: cx / anillo.length, cy: cy / anillo.length };
  });
  const corregido: Pose2 = { x: 0, y: 0, ang: 0 };
  function de(x: number, y: number): ZonaPose | null {
    for (const z of Z) if (enPoligono(x, y, z.anillo)) return z;
    return null;
  }
  // el punto más cercano del borde de alguna zona: [x, y, distancia², zona]
  function cercano(x: number, y: number): { x: number; y: number; d2: number; z: ZonaPose } {
    let mx = x, my = y, md = Infinity, mz = Z[0]!;
    for (const z of Z) {
      const a = z.anillo;
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const ax = a[j]![0], ay = a[j]![1], bx = a[i]![0], by = a[i]![1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const px = ax + t * dx, py = ay + t * dy, d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 < md) { md = d2; mx = px; my = py; mz = z; }
      }
    }
    return { x: mx, y: my, d2: md, z: mz };
  }
  return {
    zonas: Z,
    de,
    dentro(x: number, y: number): boolean { return de(x, y) !== null; },
    suelo(x: number, y: number): number { const z = de(x, y); return z ? z.suelo : Z.length ? cercano(x, y).z.suelo : 0; },
    obstaculo(x: number, y: number): Pose2 | null {
      if (!Z.length || de(x, y)) return null;
      const c = cercano(x, y), dx = c.z.cx - c.x, dy = c.z.cy - c.y, l = Math.hypot(dx, dy) || 1;
      corregido.x = c.x + dx / l * 0.01; corregido.y = c.y + dy / l * 0.01;
      return corregido;
    },
  };
}
export type Zonas = ReturnType<typeof creaZonas>;

/** Una puerta del interior en el marco de quien anda: el umbral es un segmento de `ancho` centrado en (x, y), perpendicular a su salida. */
export interface PuertaPose { id: string; a: string; x: number; y: number; ux: number; uy: number; medio: number; ang: number }

/** Radio de cercanía al umbral (m) y lo que hay que alejarse además para rearmarla (MUNDOS §5) [SUPUESTO: sin probar andando; las llegadas de las
 *  salidas de hoy quedan a 1,55-1,78 m del umbral, más que RADIO + HISTERESIS, así que no se dispara la puerta por la que se acaba de entrar]. */
const RADIO = 0.6, HISTERESIS = 0.8;

function puertasPose(puertas: readonly PuertaInterior[]): PuertaPose[] {
  return puertas.map(p => {
    const r = p.rumbo * Math.PI / 180;
    // salida en el marco de quien anda: (sin r, −cos r); el umbral va perpendicular: (cos r, sin r)
    return { id: p.id, a: p.a, x: p.pos[0], y: -p.pos[2], ux: Math.cos(r), uy: Math.sin(r), medio: p.ancho / 2, ang: angDeRumbo(p.rumbo) };
  });
}

/** distancia de (x, y) al umbral de la puerta (un segmento) */
function aUmbral(p: PuertaPose, x: number, y: number): number {
  const dx = x - p.x, dy = y - p.y, t = Math.max(-p.medio, Math.min(p.medio, dx * p.ux + dy * p.uy));
  return Math.hypot(dx - t * p.ux, dy - t * p.uy);
}

/**
 * El vigía de las puertas (MUNDOS §5: «basta con acercarse», sin gatillo, en pantalla y en VR). arma(x, y): al entrar, arma solo las puertas de las que
 * se está lejos (≥ RADIO + HISTERESIS), para no salir por la que se acaba de entrar. paso(x, y): la puerta armada a menos de RADIO del umbral (y la
 * desarma), o null; una puerta desarmada se rearma al alejarse RADIO + HISTERESIS. Sin reservas por fotograma.
 */
function creaVigia(puertas: readonly PuertaPose[], radio = RADIO, histeresis = HISTERESIS) {
  const armada = puertas.map(() => false);
  return {
    arma(x: number, y: number): void { puertas.forEach((p, i) => { armada[i] = aUmbral(p, x, y) >= radio + histeresis; }); },
    paso(x: number, y: number): PuertaPose | null {
      let cruza: PuertaPose | null = null;
      for (let i = 0; i < puertas.length; i++) {
        const p = puertas[i]!, d = aUmbral(p, x, y);
        if (armada[i]) { if (d < radio && !cruza) { armada[i] = false; cruza = p; } }
        else if (d >= radio + histeresis) armada[i] = true;
      }
      return cruza;
    },
    armadas(): boolean[] { return armada.slice(); },
  };
}

/** MUNDOS §2 y contrato §3: lo que puede dibujar un interior en cada perfil (los topes del contrato, $defs.presupuesto; [SUPUESTO] sin medir en el Quest). */
const PRESUPUESTO = {
  pantalla: { triangulos: 1000000, llamadas: 400, puntos: 0, texturasMb: 256 },
  quest: { triangulos: 300000, llamadas: 150, puntos: 0, texturasMb: 96 },
} as const;

/** El texto que se enseña al entrar (regla 5): el nombre, de qué es (medido / ilustrativo / mixto) y que la luz va horneada y es ilustrativa
 *  (contrato §2: «la luz va horneada»; las salidas de hoy lo dicen en sus notas). */
function rotulo(m: Pick<MundoInterior, "nombre" | "fuente">): string {
  const f = m.fuente === "medido" ? "medido" : m.fuente === "mixto" ? "mixto: medido y modelado" : "ilustrativo";
  return m.nombre + " · " + f + " · luz horneada, ilustrativa";
}

// ---- v1.1: el interior en el exterior (la puerta del cortijo). El anclaje dice dónde cae el origen del glb en el marco local de la finca y el rumbo de
// brújula de su eje +Z (giro). Del marco de quien anda dentro (x, y = −z) al del exterior (x este, y norte) hay un giro de φ = π − giro (en sentido
// antihorario) y una traslación: los dos marcos tienen la misma mano (paseo.ts los dibuja igual), así que no hay espejo. ang (rumbo desde el norte, en
// sentido horario) pasa como ang − φ. Lo prueba interior/puro.test.ts (ida y vuelta, y las puertas de un ejemplo).

/** radio de disparo de una puerta del exterior y lo que hay que alejarse además para rearmarla (m). Más que dentro (0,6 / 0,8): fuera se llega en quad, a
 *  12 m/s como mucho (vida.ts: velPaseo); una franja de 2·RADIO_EXT = 2 m no se salta ni a 6 fotogramas por segundo, y el pin del portón tiene unos metros
 *  de error [SUPUESTO: sin probar andando en un aparato] */
const RADIO_EXT = 1, HISTERESIS_EXT = 1;
/** a cuántos metros del umbral aparece quien sale (mirando hacia fuera): más que RADIO_EXT + HISTERESIS_EXT, así que la puerta ya está armada a su espalda */
const FUERA = 3;
/** «Ir al cortijo»: a cuántos metros delante de la puerta principal (mirándola), dentro del radio de precarga */
const FRENTE = 8;
/** precarga al acercarse (m al umbral) y suelta al alejarse más de esto (la histéresis evita cargar y soltar al pasear por el borde) */
const PRECARGA = 50, SUELTA = 80;

/** El anclaje como transformación: origen (ax, ay) y φ (rad, antihorario). */
export interface Transformacion { ax: number; ay: number; phi: number; c: number; s: number }
function transformacion(an: Anclaje): Transformacion {
  const phi = Math.PI - an.giro * Math.PI / 180;
  return { ax: an.pos[0], ay: an.pos[1], phi, c: Math.cos(phi), s: Math.sin(phi) };
}
function normaliza(a: number): number { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
/** de quien anda dentro (marco del interior) al exterior */
function aExterior(t: Transformacion, p: Pose2): Pose2 {
  return { x: t.ax + t.c * p.x - t.s * p.y, y: t.ay + t.s * p.x + t.c * p.y, ang: normaliza(p.ang - t.phi) };
}
/** del exterior al marco de quien anda dentro (la inversa de aExterior) */
function deExterior(t: Transformacion, p: Pose2): Pose2 {
  const dx = p.x - t.ax, dy = p.y - t.ay;
  return { x: t.c * dx + t.s * dy, y: -t.s * dx + t.c * dy, ang: normaliza(p.ang + t.phi) };
}

/** Una puerta del interior vista desde el exterior: su umbral (PuertaPose en el marco del exterior, para el vigía de siempre), dónde aparece quien sale por
 *  ella (fuera, mirando hacia fuera) y dónde quien entra (llegada, en el marco del interior). */
export interface Acceso { mundo: string; puerta: string; umbral: PuertaPose; fuera: Pose2; frente: Pose2; llegada: Pose2; ancho: number; alto: number }

/** Las puertas al exterior de un interior anclado (ninguna si no trae anclaje). La primera, si la hay, es la principal (el contrato la pone primera). */
function accesos(m: Pick<MundoInterior, "id" | "puertas" | "anclaje">): Acceso[] {
  if (!m.anclaje) return [];
  const t = transformacion(m.anclaje), poses = puertasPose(m.puertas);
  const out: Acceso[] = [];
  m.puertas.forEach((pu, i) => {
    if (pu.a !== "exterior") return;
    const p = poses[i]!, c = aExterior(t, { x: p.x, y: p.y, ang: p.ang });
    const ux = t.c * p.ux - t.s * p.uy, uy = t.s * p.ux + t.c * p.uy, sx = Math.sin(c.ang), sy = Math.cos(c.ang);
    out.push({
      mundo: m.id, puerta: pu.id, ancho: pu.ancho, alto: pu.alto,
      umbral: { id: pu.id, a: m.id, x: c.x, y: c.y, ux, uy, medio: p.medio, ang: c.ang },
      fuera: { x: c.x + sx * FUERA, y: c.y + sy * FUERA, ang: c.ang },
      frente: { x: c.x + sx * FRENTE, y: c.y + sy * FRENTE, ang: normaliza(c.ang + Math.PI) },
      llegada: poseDe(pu.llegada),
    });
  });
  return out;
}

// ---- v1.3 (ADR-0035): el glb comprimido. Antes de leerlo, qué decodificadores pide: las extensiones que declara su trozo JSON (la cabecera del glb:
// «glTF», versión, largo; el primer trozo, «JSON»). Solo esas dos piden algo que el motor carga aparte (y solo entonces se descarga): meshopt, el
// decodificador de three (libs/meshopt_decoder.module.js, WebAssembly dentro del módulo), y KHR_texture_basisu, el KTX2Loader con el transcodificador
// Basis del mismo origen (<página>/basis/, el del suelo de fotos). Las demás de compresión (Draco, WebP…) no las admite el contrato.

/** Las extensiones de un glb (usadas y requeridas), o null si no es un glb binario con su trozo JSON. */
function extensionesGlb(datos: ArrayBuffer): { usadas: string[]; requeridas: string[] } | null {
  if (datos.byteLength < 20) return null;
  const dv = new DataView(datos);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(16, true) !== 0x4e4f534a) return null;   // «glTF» y el trozo «JSON»
  const largo = dv.getUint32(12, true);
  if (20 + largo > datos.byteLength) return null;
  try {
    const j = JSON.parse(new TextDecoder().decode(new Uint8Array(datos, 20, largo))) as { extensionsUsed?: unknown; extensionsRequired?: unknown };
    const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { usadas: lista(j.extensionsUsed), requeridas: lista(j.extensionsRequired) };
  } catch (e) { return null; }
}
/** ¿Qué decodificadores pide un glb? (por sus extensiones usadas) */
function decodificadores(usadas: readonly string[]): { meshopt: boolean; ktx2: boolean } {
  return { meshopt: usadas.includes("EXT_meshopt_compression"), ktx2: usadas.includes("KHR_texture_basisu") };
}

export const InteriorPuro = {
  RADIO, HISTERESIS, PRESUPUESTO, perfil, ruta, valida, enPoligono, angDeRumbo, poseDe, llegada, creaZonas, puertasPose, aUmbral, creaVigia, rotulo, extensionesGlb, decodificadores,
  RADIO_EXT, HISTERESIS_EXT, FUERA, FRENTE, PRECARGA, SUELTA, transformacion, aExterior, deExterior, accesos,
};
