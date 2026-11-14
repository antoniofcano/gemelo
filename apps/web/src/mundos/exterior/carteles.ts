// Carteles de haza en la linde y tablón en la entrada (EV2-A6; ADR-0014, decisiones 12, 188 y 202; doc/sistema/COMPONENTES.md; MU5-n, A3-3: antes apps/web/motor/44b_carteles.js,
// que queda como talón). Componente «carteles-haza» (ADR-0023) de los mundos ["exterior"].
// Sobre la linde de las hazas que tienes cerca cuelga un cartel con el NOMBRE de la haza (y el alias del hogar si lo deja ver) y solo lo que decidió Antonio (2026-11-05, club privado
// «La Linde»): superficie y olivos contados con LiDAR (detectado: detector más regla, no medido), la fenología del momento y, SOLO en recolección (octubre a enero, [SUPUESTO]), el % recogido (los dos de OlivarTrack,
// con la procedencia que trae la ficha). Lo demás de la ficha (tratamientos, NDVI, olivos declarados, kilos, personas) no se pinta aunque la api lo mande: lo que no está en
// CartelesPuro.contenido no sale. El tablón de la entrada: «Club La Linde», el nombre de la finca, hazas y olivos contados de toda la finca (detectado) y la época del olivar hoy
// (23_estacion.js: deducido si el calendario se ajusta con lo observado, ilustrativo si es el típico). La línea «Hoy en el olivar» (EV-3c) es el trabajo de la semana agregado por tipo, o el aviso principal del campo, que da /api/mundo/hoy por el evento «mundo:hoy»
// (53_mundo_hoy.js; esta pieza no pide nada), con su procedencia y «leído hace N h»; sin datos, no se pinta. En el lienzo solo caben dos pares dato + procedencia: prioridad hazas y olivos, hoy, época (la época, ilustrativa o deducida, cede ante un dato de hoy).
//   · Como mucho MAX = 3 carteles a la vista (más el tablón): los de las hazas más cercanas (distancia a su linde), con histéresis (la que ya está se queda hasta que otra
//     le gana por más del 20 %) y dentro de RADIO = 30 m (36 m los que ya estaban; más lejos, ni con 5,5 de escala llegaría a 1,5° por línea). Los carteles son un pool de 3 mallas y 3 lienzos de 512 × 320 creados UNA vez; al cambiar de haza se repinta el lienzo
//     (solo si cambia su firma), nada se crea ni se libera. Al apagar el componente o quedarse sin hazas, se libera todo (geometría, materiales, texturas).
//   · Mundo, no cabeza: cada cartel está en el punto de la linde más cercano a quien lo eligió, a ~1 m del suelo, y se vuelve hacia quien mira (solo el giro vertical). Crece
//     con la distancia (escala = 0,14 × m, entre 1 y 5,5) para que cada línea no baje de 1,5° (topes de EV2-A0 en 02d_laminas.js; cifras propias, sin verificar en un casco).
//   · Sin api de hazas (sin servidor, 401 o sin hazas en este mundo) no se crea nada y no se ve nada. ?carteles=0 (o el bloque «componentes» de la configuración del
//     servidor) lo apaga; la casilla «Linde» del menú los esconde con las lindes.
//   · Honestidad (regla 5): el cartel dice MEDIDO y su fuente; la linde es un límite de gestión dibujado por la oficina, no un deslinde, y el cartel lo dice en el pie.
// Presupuesto (regla 6): 4 llamadas (3 carteles + el tablón), 8 triángulos, 4 texturas de 512 × 320 sin mipmaps (2,5 MB: 0,63 MB cada una). Material básico (multiview: sin GLSL propio,
// por eso no tiene commit de materiales ni de TSL en MU5-n: sale como estándar en las dos rutas).
// Sin reloj propio: la fase «tarde» cada 0,5 s escoge y repinta; la fase «mundo» solo gira los carteles hacia quien mira.
// Su libera() ya soltaba todo (geometría, materiales y texturas, y los lienzos a 1 × 1); se conserva y se prueba.
// Del legado recibe por argumento lo que necesita (THREE, el documento, la escena, la cámara, Hazas, las lindes…); no lee globales.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";

// three no trae tipos en el repo (como en suelo-fondo.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;

export const ID_CARTELES = "carteles-haza";
type Punto = number[];
type Anillo = Punto[];

// CartelesPuro: sin THREE ni DOM (lo prueba en Node pruebas/guardianes/carteles.test.js)
export const CartelesPuro = (function () {
  const MAX = 3, RADIO = 30, HIST = 0.2, W = 512, H = 320, ANCHO_M = 2.4, ALTO_M = ANCHO_M * H / W, LEJOS_TABLON = 36, PAD = 14, COEF = 0.14, ESC_MAX = 5.5, LLAMADAS = MAX + 1;
  // px del lienzo: letra e interlineado de cada clase; todos los interlineados ≥ 44 px (a 4,7 mm/px y escala 1: 0,21 m)
  const LETRA: Record<string, number> = { titulo: 44, alias: 32, dato: 34, fuente: 30 }, LINEA: Record<string, number> = { titulo: 52, alias: 44, dato: 46, fuente: 44 };
  function num(v: unknown): v is number { return typeof v === "number" && isFinite(v) && v >= 0; }
  function txt(s: unknown, max: number): string { return typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
  function n1(v: number, dd?: number): string { return Number(v).toLocaleString("es-ES", { minimumFractionDigits: dd || 0, maximumFractionDigits: dd || 0 }); }
  // el punto de una linde (anillos [[x, y]…]…, locales) más cercano a (x, y): { d, x, y }
  function masCerca(anillos: Anillo[], x: number, y: number): { d: number; x: number; y: number } {
    const mej = { d: Infinity, x: 0, y: 0 };
    for (let r = 0; r < anillos.length; r++) {
      const an = anillos[r]!;
      for (let i = 0; i + 1 < an.length; i++) {
        const ax = an[i]![0]!, ay = an[i]![1]!, bx = an[i + 1]![0]!, by = an[i + 1]![1]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, px = ax + dx * t, py = ay + dy * t, dd = Math.hypot(x - px, y - py);
        if (dd < mej.d) { mej.d = dd; mej.x = px; mej.y = py; }
      }
    }
    return mej;
  }
  function caja(anillos: Anillo[]): number[] {
    const c = [Infinity, Infinity, -Infinity, -Infinity] as number[];
    anillos.forEach(function (an) { an.forEach(function (q) { if (q[0]! < c[0]!) c[0] = q[0]!; if (q[1]! < c[1]!) c[1] = q[1]!; if (q[0]! > c[2]!) c[2] = q[0]!; if (q[1]! > c[3]!) c[3] = q[1]!; }); });
    return c;
  }
  function lejosDeCaja(c: number[], x: number, y: number, r: number): boolean { return x < c[0]! - r || x > c[2]! + r || y < c[1]! - r || y > c[3]! + r; }
  // quién se ve: cand = [{ id, d }] (d = m a su linde), actuales = [id | null] × MAX (lo que hay puesto en cada cartel). Devuelve la lista nueva de MAX ids o null: el que
  // ya estaba conserva su cartel (no salta de uno a otro) y cuenta con un 20 % de ventaja; el radio de los que ya estaban también se ensancha un 20 %.
  function escoge(cand: { id: Cualquiera; d: number }[], actuales: Cualquiera[]): Cualquiera[] {
    const ya: Record<string, boolean> = {};
    actuales.forEach(function (id) { if (id !== null && id !== undefined) ya[id] = true; });
    const v = cand.filter(function (c) { return num(c.d) && c.d <= RADIO * (ya[c.id] ? 1 + HIST : 1); })
      .map(function (c) { return { id: c.id, e: ya[c.id] ? c.d / (1 + HIST) : c.d }; });
    v.sort(function (a, b) { return a.e - b.e || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    const top = v.slice(0, MAX), quedan: Record<string, boolean> = {}, out: Cualquiera[] = [];
    top.forEach(function (c) { quedan[c.id] = true; });
    for (let i = 0; i < MAX; i++) { const a = actuales[i]; if (a !== null && a !== undefined && quedan[a]) { out.push(a); delete quedan[a]; } else out.push(null); }
    const nuevos = top.filter(function (c) { return quedan[c.id]; });
    for (let i = 0; i < MAX && nuevos.length; i++) if (out[i] === null) out[i] = nuevos.shift()!.id;
    return out;
  }
  // m de lado del cartel según la distancia (m): cada línea (≥ 44 px a 4,69 mm/px) ocupa ≥ 1,5° mientras escala ≥ 0,127 × dist; con 0,14 queda margen
  function escala(dist: number): number { return Math.max(1, Math.min(ESC_MAX, COEF * dist)); }
  // ---- fechas y fenología (decisión de Antonio, 2026-11-05: la cartelería de «La Linde» lleva la fenología del momento y, solo en recolección, el % recogido)
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function dia(s: unknown): string { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof s === "string" ? s : ""); return m ? Number(m[3]) + "-" + MESES[Number(m[2]) - 1] + "-" + m[1] : ""; }
  function ultimo(hs: unknown): Cualquiera { let u: Cualquiera = null; (Array.isArray(hs) ? hs : []).forEach(function (e) { if (e && num(e.bbch) && e.bbch <= 99 && (!u || String(e.fecha || "") > String(u.fecha || ""))) u = e; }); return u; }
  // BBCH del olivo → palabra de campo (escala BBCH: 51-59 botón floral, 60-69 floración, 70-79 fruto, 80-89 maduración); es lo que la ficha dice, solo traducido
  function fenologia(b: number): string { return b < 10 ? "Reposo" : b < 50 ? "Brotación" : b < 60 ? "Botón floral" : b < 70 ? "En flor" : b < 80 ? "Cuajado" : b < 85 ? "Envero" : "Maduración"; }
  // [SUPUESTO] la campaña de recolección va de octubre a enero (calendario típico del olivar de Jaén); el cartel enseña el % recogido solo entonces. hoy = «AAAA-MM-DD»
  function recoleccion(hoy: unknown): boolean { const m = /^\d{4}-(\d{2})-/.exec(typeof hoy === "string" ? hoy : ""); const n = m ? Number(m[1]) : 0; return n >= 10 || n === 1; }
  // ---- el contenido: SOLO la lista blanca (campo a campo). h = { nombre, es_mia }; f = la ficha pública de la api (o null); ctx = { hoy } (para saber si hay recolección).
  // → { titulo, alias, es_mia, datos: [{ txt, de }] } (de = su procedencia, siempre). Hay lugar para dos pares dato + procedencia en el lienzo: lo medido va junto en una línea
  // y lo de OlivarTrack (fenología y, solo en recolección, % recogido) en otra, con la procedencia que trae la ficha (datos_de). NO llevan fecha de tratamiento, NDVI ni olivos declarados.
  function contenido(h: Cualquiera, f: Cualquiera, ctx?: Cualquiera): Cualquiera {
    const o: Cualquiera = { titulo: txt(h && h.nombre, 60) || "Haza", alias: "", es_mia: !!(h && h.es_mia), datos: [] };
    if (!f || typeof f !== "object") return o;
    if (!o.es_mia && typeof f.alias === "string" && txt(f.alias, 20)) o.alias = "Hogar visible como «" + txt(f.alias, 20) + "»";
    const area = num(f.superficie_ha) ? n1(f.superficie_ha, 2) + " ha" : "", ol = f.olivos && f.olivos.lidar, oli = ol && num(ol.n) && ol.naturaleza === "detectado" ? n1(ol.n) + " olivos" : "";
    const fu = oli ? txt(ol.fuente, 40) || "LiDAR" : "";
    if (area && oli) o.datos.push({ txt: area + " · " + oli, de: "detectado (LiDAR + regla) · linde y " + fu });
    else if (area) o.datos.push({ txt: "Superficie: " + area, de: "medida sobre la linde de la oficina" });
    else if (oli) o.datos.push({ txt: "Olivos contados: " + n1(ol.n), de: "detectado (LiDAR + regla) · " + fu });
    const fe = ultimo(f.fenologia), av = ctx && recoleccion(ctx.hoy) ? f.avance : null, porc = av && num(av.pct) && av.pct <= 100 ? av.pct : null, partes: string[] = [];   // fuera de recolección ni se mira el avance
    if (fe) partes.push(fenologia(fe.bbch));
    if (porc !== null) partes.push(n1(porc) + " % recogido");
    // L3-05: la fenología es una ANOTACIÓN con su fecha (no la hora de la lectura); sin fecha, «fecha desconocida», nunca la de hoy. El % recogido sí es de la lectura (datos_de)
    if (partes.length) {
      const anotada = fe ? "anotada " + (dia(fe.fecha) || "fecha desconocida") : "", leida = porc !== null || !fe ? "leído " + (dia(f.datos_de) || "fecha desconocida") : "";
      o.datos.push({ txt: partes.join(" · "), de: "OlivarTrack · " + [anotada, leida].filter(Boolean).join(" · ") });
    }
    return o;
  }
  function firma(c: Cualquiera): string { return JSON.stringify([c.titulo, c.alias, c.es_mia, c.datos.map(function (dd: Cualquiera) { return dd.txt + "|" + dd.de; })]); }
  // el nombre de la finca (el título de las gafas si lo hay; si no, el id con mayúscula)
  function nombreFinca(tituloVr: unknown, fincaId: unknown): string {
    const t = txt(tituloVr, 40); if (t) return t;
    const s = txt(String(fincaId || "").replace(/[_-]+/g, " "), 40); return s ? s.charAt(0).toUpperCase() + s.slice(1) : "La finca";
  }
  // la época del olivar: estación del año (por el mes) y fase del ciclo (por el BBCH que da 23_estacion.js: calendario típico de Jaén, ajustado con lo observado si hay)
  function epoca(hoy: unknown, bbch: unknown, origen: unknown): { txt: string; de: string } | null {
    const m = /^\d{4}-(\d{2})-/.exec(typeof hoy === "string" ? hoy : ""); if (!m || !num(bbch)) return null;
    const n = Number(m[1]), est = n === 12 || n <= 2 ? "Invierno" : n <= 5 ? "Primavera" : n <= 8 ? "Verano" : "Otoño", b = Math.round(bbch);
    const fase = b < 10 ? "reposo del olivo" : b < 50 ? "crecen los brotes" : b < 60 ? "se forman las flores" : b < 70 ? "en plena floración" : b < 80 ? "cuaja y crece el fruto" : b < 83 ? "empieza el envero" : b < 85 ? "envero" : "maduración del fruto";
    const aj = /ajustado/.test(String(origen || ""));
    return { txt: est + ": " + fase, de: aj ? "deducido · calendario ajustado" : "ilustrativo · calendario típico" };
  }
  // el tablón de la entrada. ctx = { hazas, olivos, hoy, bbch, origen }: nº de hazas con linde y olivos contados con LiDAR de toda la finca (detectados; sin dato fiable no se pone) y la época de hoy.
  // «Hoy en el olivar» (EV-3c): ctx.campo = { txt, de, cuando } (la línea que emite 53_mundo_hoy.js: trabajo de la semana agregado, o el aviso principal) y ctx.ahora (ms). Con datos
  // válidos pasa por delante de la época (solo caben dos pares); sin ellos, hoy queda vacío y no se pinta.
  function haceHoy(iso: unknown, ahora: unknown): string {
    const t = typeof iso === "string" ? Date.parse(iso) : NaN; if (!isFinite(t) || !num(ahora)) return "";
    const m = Math.max(1, Math.round((ahora - t) / 60000));
    return m < 90 ? "hace " + m + " min" : m < 36 * 60 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " días";
  }
  function lineaHoy(c: Cualquiera, ahora: unknown): { txt: string; de: string } | null {
    if (!c || typeof c !== "object") return null;
    const t = txt(c.txt, 40), de = txt(c.de, 20); if (!t || !de) return null;
    const h = haceHoy(c.cuando, ahora);
    return { txt: t, de: de + " · " + (h ? "leído " + h : "sin fecha") };
  }
  function tablon(nombre: string, ctx?: Cualquiera): Cualquiera {
    const t: Cualquiera = { titulo: "Club La Linde", alias: nombre, es_mia: false, tablon: true, datos: [], hoy: [] };   // hoy: entradas { txt, de } de «Hoy en el olivar»; vacío = no se muestra
    ctx = ctx || {};
    const nh = ctx.hazas > 0 ? Math.floor(ctx.hazas) : 0, no = ctx.olivos > 0 ? Math.floor(ctx.olivos) : 0;
    if (nh && no) t.datos.push({ txt: n1(nh) + (nh === 1 ? " haza" : " hazas") + " · " + n1(no) + " olivos", de: "detectado (LiDAR + regla) · LiDAR 2024 y lindes" });
    else if (no) t.datos.push({ txt: n1(no) + " olivos contados", de: "detectado (LiDAR + regla) · LiDAR 2024" });
    else if (nh) t.datos.push({ txt: n1(nh) + (nh === 1 ? " haza" : " hazas"), de: "lindes de la oficina" });
    const lh = lineaHoy(ctx.campo, ctx.ahora); if (lh) { t.hoy.push(lh); t.datos.push(lh); }
    const ep = epoca(ctx.hoy, ctx.bbch, ctx.origen); if (ep) t.datos.push(ep);
    t.datos = t.datos.slice(0, 2);   // el lienzo de 512 × 320 da para título, finca y dos pares; esto fija la prioridad
    return t;
  }
  // corta un texto en líneas de ancho px (medir(texto, px, negrita) → px), a lo sumo max (la última con «…»)
  function envuelve(texto: unknown, ancho: number, medir: (t: string, px: number, neg: boolean) => number, px: number, negrita: boolean, max: number): string[] {
    const pal = String(texto == null ? "" : texto).split(/\s+/).filter(Boolean); let out: string[] = [], l = "";
    for (let i = 0; i < pal.length; i++) {
      const t = l ? l + " " + pal[i] : pal[i]!;
      if (l && medir(t, px, negrita) > ancho) { out.push(l); l = pal[i]!; } else l = t;
    }
    if (l) out.push(l);
    if (out.length > max) { out = out.slice(0, max); let u = out[max - 1]!; while (u.length > 1 && medir(u + "…", px, negrita) > ancho) u = u.slice(0, -1); out[max - 1] = u + "…"; }
    return out;
  }
  // la maqueta del lienzo: { w, h, bloques: [{ clase, texto, x, y, px, negrita }], interlineados: { clase: px } }. Los datos entran por pares (valor + procedencia): si no cabe
  // el par entero, no entra ni uno. El pie «linde de gestión, no deslinde» va solo en carteles de haza y solo si cabe.
  function maqueta(c: Cualquiera, medir: (t: string, px: number, neg: boolean) => number): Cualquiera {
    const ancho = W - 2 * PAD - 8, bl: Cualquiera[] = [], lin: Record<string, number> = {}; let y = PAD;
    function ponLinea(clase: string, texto: string, negrita: boolean): void { bl.push({ clase: clase, texto: texto, x: PAD + 8, y: y, px: LETRA[clase], negrita: !!negrita }); y += LINEA[clase]!; lin[clase] = LINEA[clase]!; }
    const tit = envuelve(c.titulo, ancho, medir, LETRA["titulo"]!, true, c.datos.length ? 2 : 3);
    tit.forEach(function (l) { ponLinea("titulo", l, true); });
    if (c.alias) { const al = envuelve(c.alias, ancho, medir, LETRA["alias"]!, false, 1); if (y + LINEA["alias"]! + PAD <= H) ponLinea("alias", al[0]!, false); }
    c.datos.forEach(function (dd: Cualquiera) {
      const v = envuelve(dd.txt, ancho, medir, LETRA["dato"]!, true, 1), f = envuelve(dd.de, ancho, medir, LETRA["fuente"]!, false, 1);
      if (y + LINEA["dato"]! + LINEA["fuente"]! + PAD <= H) { ponLinea("dato", v[0]!, true); ponLinea("fuente", f[0]!, false); }
    });
    if (!c.tablon && y + LINEA["fuente"]! + PAD <= H) ponLinea("fuente", envuelve("linde de gestión, no deslinde", ancho, medir, LETRA["fuente"]!, false, 1)[0]!, false);
    return { w: W, h: H, bloques: bl, interlineados: lin, usado: y + PAD };
  }
  // la colocación: el punto de la linde (px, py locales), la altura del suelo g (escena) y la escala s → { x, y, z } del centro del cartel en la escena (z = −norte);
  // el borde de abajo queda 0,9 m sobre el suelo
  function coloca(px: number, py: number, g: number, s: number): { x: number; y: number; z: number } { return { x: px, y: g + 0.9 + ALTO_M * s / 2, z: -py }; }
  // el tablón en la entrada [SUPUESTO: la entrada es donde empieza el paseo, el centro de la primera parcela (12_paseo.js: entraPaseo); sin parcelas, el centro de la finca]:
  // 5 m al este y 4 m al norte del centro, delante de quien aparece. → [x este, y norte] locales
  function entrada(pcs: Cualquiera, ext: number[] | null | undefined): number[] {
    const p = pcs && pcs[0] && pcs[0].centro;
    if (p && num(Math.abs(p[0])) && num(Math.abs(p[1]))) return [p[0] + 5, p[1] - 6 + 4 + 0];
    return ext ? [(ext[0]! + ext[2]!) / 2, (ext[1]! + ext[3]!) / 2] : [0, 0];
  }
  // el giro (rad) de un cartel en (px, pz) para que su cara (+z) mire a la cabeza en (cx, cz)
  function mirando(cx: number, cz: number, px: number, pz: number): number { return Math.atan2(cx - px, cz - pz); }
  return { MAX: MAX, RADIO: RADIO, HIST: HIST, W: W, H: H, ANCHO_M: ANCHO_M, ALTO_M: ALTO_M, LEJOS_TABLON: LEJOS_TABLON, LLAMADAS: LLAMADAS, LETRA: LETRA, LINEA: LINEA,
    masCerca: masCerca, caja: caja, lejosDeCaja: lejosDeCaja, escoge: escoge, escala: escala, contenido: contenido, firma: firma, nombreFinca: nombreFinca, tablon: tablon, lineaHoy: lineaHoy, epoca: epoca, fenologia: fenologia, recoleccion: recoleccion,
    envuelve: envuelve, maqueta: maqueta, coloca: coloca, entrada: entrada, mirando: mirando };
})();

export interface DepsCarteles {
  THREE: T3;
  /** el documento (para el lienzo de cada cartel) y la ventana (para publicar window.__carteles) */
  documento: { createElement(tag: string): Cualquiera };
  ventana: Record<string, unknown>;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  camera: { updateMatrixWorld(): void; matrixWorld: unknown };
  /** 29_vr: VRX.on y VRX.cab (la cabeza en VR) */
  VRX: { on: boolean; cab: unknown };
  /** 03_escena: texColor pone el espacio de color de una textura de color */
  texColor<TX>(t: TX): TX;
  /** 08_marcadores: el grupo de la linde (la casilla «Linde» esconde los carteles con las lindes) */
  gLinde: { visible: boolean };
  suelo(x: number, y: number): number;
  Estado: { exag: number };
  /** 13b_hazas: la geometría de la linde de cada haza vista y los datos públicos de una */
  Hazas: { lindes(): { id: Cualquiera; anillos: Anillo[] }[]; datos(id: Cualquiera): Cualquiera };
  /** 01_datos: el título de las gafas, el id de la finca, las parcelas y la extensión */
  D: { titulo_vr?: string; finca_id?: string; parcelas?: Cualquiera; ext?: number[] };
  /** 02_mundo: los olivos dentro de las parcelas (de ellos se cuentan los del tablón) */
  cIn: unknown[];
  /** 23_estacion: la estación elegida, el BBCH de un día y el día de hoy en Madrid */
  EST: { origen: string };
  bbchEn(hoy: string): number;
  hoyMadrid(): string;
}

/** Los carteles de haza y el tablón: el componente y su motor. */
export function creaCarteles(d: DepsCarteles) {
  function CartelesMotor(n: ContextoComponente) {
    const P = CartelesPuro, THREE = d.THREE, scene = d.scene, camera = d.camera, Estado = d.Estado, D = d.D;
    let vivo = true, grupo: T3 = null, geo: T3 = null, slots: T3[] = [], tab: T3 = null, lins: Cualquiera[] = [], campo: Cualquiera = null; const vC = new THREE.Vector3();
    const st = { carteles: 0, tablon: false, pintadas: 0, llamadas: 0, hazas: 0 };
    function cabeza(): T3 { if (d.VRX.on) return vC.copy(d.VRX.cab); camera.updateMatrixWorld(); return vC.setFromMatrixPosition(camera.matrixWorld); }
    function crea(nombre: string): T3 {   // una malla con su lienzo: se crea UNA vez
      const cv = d.documento.createElement("canvas"); cv.width = P.W; cv.height = P.H;
      const tex = d.texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
      const m = new THREE.Mesh(geo, mat); m.name = nombre; m.renderOrder = 9; m.visible = false; m.raycast = function () { /* la haza se escoge por el suelo (13b_hazas.js), no por el cartel */ };
      grupo.add(m);
      return { mesh: m, mat: mat, tex: tex, cv: cv, cx: cv.getContext("2d"), id: null, firma: "", p: null, g: 0, s: 1 };
    }
    function monta(): void {
      if (grupo) return;
      grupo = new THREE.Group(); grupo.name = "carteles de haza"; geo = new THREE.PlaneGeometry(P.ANCHO_M, P.ALTO_M);
      for (let i = 0; i < P.MAX; i++) slots.push(crea("cartel " + (i + 1)));
      tab = crea("tablón de la entrada"); scene.add(grupo);
      st.llamadas = P.MAX + 1;
    }
    /** lo que suelta el componente al apagarse o al quedarse sin hazas: el grupo de la escena, la geometría, los cuatro materiales y las cuatro texturas (y los lienzos, a 1 × 1) */
    function liberaTodo(): void {
      if (!grupo) return;
      scene.remove(grupo);
      slots.concat(tab ? [tab] : []).forEach(function (s) { s.mesh.visible = false; s.mat.dispose(); s.tex.dispose(); s.cv.width = s.cv.height = 1; });
      if (geo) geo.dispose();
      grupo = null; geo = null; slots = []; tab = null; st.carteles = 0; st.tablon = false; st.llamadas = 0;
    }
    function medir(cx: Cualquiera) { return function (t: string, px: number, neg: boolean): number { cx.font = (neg ? "bold " : "") + px + "px system-ui, sans-serif"; return cx.measureText(t).width; }; }
    function pinta(s: Cualquiera, c: Cualquiera): void {
      const cx = s.cx, m = P.maqueta(c, medir(cx)), ambar = c.es_mia;
      cx.clearRect(0, 0, P.W, P.H);
      cx.fillStyle = "#14201a"; cx.fillRect(0, 0, P.W, P.H);
      cx.fillStyle = ambar ? "#ffb020" : "#dfe6e0"; cx.fillRect(0, 0, 8, P.H);   // el borde: ámbar la tuya, blanco roto las demás (como las lindes)
      cx.textBaseline = "top"; cx.textAlign = "left";
      const col: Record<string, string> = { titulo: "#f4f1e6", alias: "#b9c8bd", dato: "#e9eef2", fuente: "#9db0a3" };
      m.bloques.forEach(function (b: Cualquiera) { cx.font = (b.negrita ? "bold " : "") + b.px + "px system-ui, sans-serif"; cx.fillStyle = col[b.clase]; cx.fillText(b.texto, b.x, b.y); });
      s.tex.needsUpdate = true; st.pintadas++;
    }
    function repinta(s: Cualquiera, c: Cualquiera): void { const f = P.firma(c); if (f === s.firma) return; s.firma = f; pinta(s, c); }
    function suelo3(x: number, y: number): number { return d.suelo(x, y) * Estado.exag; }
    // el tablón: se coloca una vez en la entrada y se repinta solo si cambia su firma (la época cambia con los días, no por fotograma)
    function pintaTablon(): void {
      const hoy = d.hoyMadrid();
      repinta(tab, P.tablon(P.nombreFinca(D.titulo_vr, D.finca_id), { hazas: lins.length, olivos: d.cIn.length, hoy: hoy, bbch: d.bbchEn(hoy), origen: d.EST.origen, campo: campo, ahora: Date.now() }));
    }
    function ponTablon(): void {
      const q = P.entrada(D.parcelas, D.ext);
      tab.p = q; tab.g = suelo3(q[0]!, q[1]!);
      pintaTablon(); st.tablon = true;
    }
    function rehaz(): void {   // las lindes se copian UNA vez al cambiar las hazas (no cada 0,5 s)
      lins = d.Hazas.lindes().map(function (l) { return { id: l.id, anillos: l.anillos, caja: P.caja(l.anillos) }; });
      st.hazas = lins.length;
      if (lins.length) { monta(); ponTablon(); } else { liberaTodo(); }
    }
    function tarde(): void {
      if (!grupo) return;
      const h = cabeza(), x = h.x, y = -h.z, cand: Cualquiera[] = [], ctx = { hoy: d.hoyMadrid() };
      grupo.visible = d.gLinde.visible;
      lins.forEach(function (l) {
        if (P.lejosDeCaja(l.caja, x, y, P.RADIO * (1 + P.HIST))) return;
        const q = P.masCerca(l.anillos, x, y); if (q.d <= P.RADIO * (1 + P.HIST)) cand.push({ id: l.id, d: q.d, q: q });
      });
      const nuevo = P.escoge(cand, slots.map(function (s) { return s.id; }));
      let cuenta = 0;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i], id = nuevo[i];
        if (id !== s.id) { s.id = id; s.firma = ""; s.p = null; }
        if (id === null || id === undefined) { s.mesh.visible = false; continue; }
        const dd = d.Hazas.datos(id); if (!dd) { s.id = null; s.mesh.visible = false; continue; }
        if (!s.p) { for (let k = 0; k < cand.length; k++) if (cand[k].id === id) s.p = [cand[k].q.x, cand[k].q.y]; if (!s.p) { s.mesh.visible = false; continue; } }
        s.g = suelo3(s.p[0], s.p[1]);
        repinta(s, P.contenido(dd, dd.ficha, ctx)); s.mesh.visible = true; cuenta++;
      }
      st.carteles = cuenta;
      if (tab && tab.p) { pintaTablon(); tab.g = suelo3(tab.p[0], tab.p[1]); tab.mesh.visible = Math.hypot(tab.p[0] - x, tab.p[1] - y) <= P.LEJOS_TABLON; }
    }
    function mundo(): void {
      if (!grupo || !grupo.visible) return;
      const h = cabeza();
      for (let i = 0; i <= slots.length; i++) {
        const s = i < slots.length ? slots[i] : tab;
        if (!s || !s.mesh.visible || !s.p) continue;
        const dd = Math.hypot(s.p[0] - h.x, -s.p[1] - h.z), e = P.escala(dd), c = P.coloca(s.p[0], s.p[1], s.g, e);
        s.mesh.position.set(c.x, c.y, c.z); s.mesh.scale.setScalar(e); s.mesh.rotation.y = P.mirando(h.x, h.z, c.x, c.z);
      }
    }
    n.on("hazas:cambia", function () { if (vivo) rehaz(); });
    n.on("mundo:hoy", function (dd?: Cualquiera) { campo = dd && dd.linea && typeof dd.linea === "object" ? dd.linea : null; });   // lo repinta la fase «tarde» (solo si cambia la firma)
    if (d.Hazas.lindes().length) rehaz();
    d.ventana["__carteles"] = function () { return { carteles: st.carteles, tablon: st.tablon, pintadas: st.pintadas, llamadas: st.llamadas, hazas: st.hazas, ids: slots.map(function (s) { return s.id; }) }; };
    n.limpia(function () { try { delete d.ventana["__carteles"]; } catch (e) { d.ventana["__carteles"] = undefined; } });
    function libera(): void { vivo = false; liberaTodo(); }
    return { tarde: tarde, mundo: mundo, libera: libera, estado: function () { return st; } };
  }
  return { CartelesMotor };
}

/** El manifiesto del componente «carteles-haza» (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?carteles=0 lo apaga; ?carteles=1 lo enciende. */
export function manifiestoCarteles(d: DepsCarteles): Manifiesto {
  const carteles = creaCarteles(d);
  return {
    id: ID_CARTELES, version: 1,
    consume: ["Hazas", "VRX", "gLinde", "cIn", "EST", "bbchEn", "hoyMadrid"],
    expone: [],
    eventos: { escucha: ["hazas:cambia", "mundo:hoy"], emite: [] },
    bandera: { defecto: true, url: "carteles" },
    // 3 carteles + el tablón: 4 mallas de un plano (4 llamadas, 8 triángulos; en VR sin multiview, una por ojo) y 4 texturas de 512 × 320 sin mipmaps (2,5 MB: 0,63 MB cada una)
    presupuesto: { llamadas: 4, triangulos: 8, texturasMB: 2.5 },
    fases: { mundo: 0, tarde: 0.5 },
    mundos: ["exterior"],
    monta: function (n) { return carteles.CartelesMotor(n); },
    actualiza: { mundo: function (_dt, _t, api) { (api as ReturnType<typeof carteles.CartelesMotor>).mundo(); }, tarde: function (_dt, _t, api) { (api as ReturnType<typeof carteles.CartelesMotor>).tarde(); } },
    libera: function (api) { if (api) (api as ReturnType<typeof carteles.CartelesMotor>).libera(); }
  };
}
