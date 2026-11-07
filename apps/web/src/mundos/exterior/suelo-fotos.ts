// EV-1s: el suelo de cerca con texturas de fotos de la finca (?suelo=fotos; APAGADO por defecto y, en VR, apagado salvo ?sueloVR=1). MU5-n (A3-1b): antes
// apps/web/motor/04f_suelo_fotos.js, que queda como talón; el trozo puro (SueloFotosPuro) y la fábrica (creaSueloFotos) viven aquí, y 04d sigue pidiéndoles
// lo mismo de siempre (SueloFotosPuro.parcheGlsl, SueloFotos.U, .campo, .rueNeutro, .actualiza, .libera). Componente «suelo-fotos» de los mundos ["exterior"].
// Siete clases de textura repetible (tuberia/suelo/construye.mjs; apps/web/public/suelo/, con su LICENCIA.md) en UNA textura en array (DataArrayTexture:
// un solo muestreador más en el sombreado del relieve): calle con picado, hojarasca seca, tierra con grava, compost, ruedo, camino y piedra. Donde
// hay varias fotos de una clase, 2-3 variantes (13 niveles en total): la repetición estocástica escoge variante por celda, sin lecturas de más.
// Naturaleza (regla 5): el COLOR sigue saliendo de la ortofoto (medido); la textura solo lo MODULA alrededor de 1 (byte/127,5) y es ILUSTRATIVA;
// la CLASE de cada punto es DEDUCIDA con reglas simples, porque no hay un mapa medido de dónde hay calle, hojarasca o compost:
//   - ruedo: dentro del radio de la copa (radio medio de los 8 medidos × 1,15 + 0,5 m [SUPUESTO]), por un campo de distancias por tesela (uRue);
//   - hojarasca densa: un anillo en el borde de esa copa y manchas dentro del ruedo;
//   - camino: el «camino» que ya deduce 04d de la ortofoto (suelo desnudo claro y alargado);
//   - tierra con grava: el suelo desnudo de la ortofoto que no es camino;
//   - compost: suelo abierto más OSCURO que su entorno en la ortofoto (no se sabe dónde se aporta: es la regla más débil, dicha);
//   - calle: el resto; piedras sueltas: calcomanías por celdas de 0,9 m, más en la tierra, el ruedo y el camino.
// Repetición estocástica (técnica 3 de Quilez, «texture variation», con el índice sacado de un ruido procedimental en vez de otra textura) y
// mezcla que conserva la varianza; cada lectura toma la variante de su celda; fundido por distancia de 12 a 40 m (más allá, ni una lectura: lo de siempre). Presupuesto: SueloFotosPuro.presupuesto().
// Sin la bandera este módulo no carga nada, no crea texturas y 04d no cambia ni una letra de su sombreador.
// Del legado recibe por argumento lo que necesita (THREE, Aparato, Mundo, copas, ColaExt, renderer, la URL, el ajuste guardado, imágenes y lienzos, el KTX2Loader); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { MaterialesPuro } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

// ---------------------------------------------------------------- lo puro (sin THREE ni DOM)
/** lo que lee de una copa el campo del ruedo: posición, si es olivo y el radio en 8 direcciones */
export interface CopaRuedo { x: number; y: number; oliv?: boolean | number; perfil: ArrayLike<number> }
export interface DecisionSuelo { activo: boolean; px: number; vr: boolean }
/** un elemento por lámina del array, en su orden: color y relieve de cada variante de cada clase */
export interface FicheroSuelo { clase: string; variante: number; capa: number; color: string; relieve: string }
export interface PresupuestoSuelo {
  niveles: number; texturaBytes: number; texturaMB: number; cpuMB: number; ruedoBytesPorTesela: number; muestreadores: number; llamadas: number; triangulos: number;
  muestreos: { lejos: number; tipico: number; maximo: number };
}
type Formato = "ktx2" | "png";

const CLASES = ["calle", "hojarasca", "tierra_grava", "compost", "ruedo", "camino", "piedra"] as const;   // el orden ES el de los niveles del array (y el de tuberia/suelo/recetas.json)
const METROS = [1.4, 1.3, 0.9, 0.85, 0.6, 0.5, 0.35];   // lado en el suelo de cada textura [SUPUESTO: las fotos no llevan referencia de escala]
const VARIANTES = [2, 3, 1, 1, 1, 2, 3];   // fotos por clase (la principal y sus variantes de tuberia/suelo/recetas.json): niveles seguidos en el array
const BASE: number[] = []; let CAPAS = 0; for (let c0 = 0; c0 < CLASES.length; c0++) { BASE.push(CAPAS); CAPAS += VARIANTES[c0] as number; }
// 768 px en escritorio y 384 en móvil y gafas (no 1024 y 512): con las variantes, 13 niveles en casi la memoria de los 7 de antes (presupuesto())
const PX = [768, 384];
const FUNDIDO = [12, 40], RUE_M = 6, RUE_GN = 128;   // fundido (m); el campo del ruedo guarda la distancia al borde de la copa en ±6 m, a 2 m por celda

// ajuste: el guardado de Configuración → Vista («vista.suelo», true/false) o undefined; la URL manda (?suelo=fotos enciende, ?suelo=0 apaga)
function decide(busqueda: string | null | undefined, clase: string, ajuste: unknown): DecisionSuelo {
  const q = busqueda || "", mp = /[?&]sueloPx=(384|768)(?![^&#])/.exec(q);
  const url = /[?&]suelo=fotos(?![^&#])/.test(q) ? true : /[?&]suelo=(0|no)(?![^&#])/.test(q) ? false : undefined;
  return { activo: url !== undefined ? url : ajuste === true, px: mp ? Number(mp[1]) : clase === "escritorio" ? PX[0] as number : PX[1] as number, vr: /[?&]sueloVR=1(?![^&#])/.test(q) };
}
// un elemento por lámina del array, en su orden: las variantes de cada clase, seguidas (la 0, la principal, <clase>_<px>; las demás, <clase>_v<k>_<px>)
function ficheros(px: number): FicheroSuelo[] {
  const o: FicheroSuelo[] = [];
  for (let i = 0; i < CLASES.length; i++) for (let k = 0; k < (VARIANTES[i] as number); k++) {
    const n = "suelo/" + CLASES[i] + (k ? "_v" + k : "") + "_" + px; o.push({ clase: CLASES[i] as string, variante: k, capa: (BASE[i] as number) + k, color: n + ".webp", relieve: n + "_relieve.webp" });
  }
  return o;
}
// memoria en la tarjeta gráfica: RGBA8 × niveles, con mipmaps (×4/3); la copia pasajera de la CPU (sin mipmaps); y el campo del ruedo: 1 byte por celda y tesela
function presupuesto(px: number): PresupuestoSuelo {
  const bytesTex = px * px * 4 * CAPAS * 4 / 3;
  return { niveles: CAPAS, texturaBytes: bytesTex, texturaMB: Math.round(bytesTex / 1048576 * 10) / 10, cpuMB: Math.round(px * px * 4 * CAPAS / 1048576 * 10) / 10,
    ruedoBytesPorTesela: RUE_GN * RUE_GN, muestreadores: 2, llamadas: 0, triangulos: 0,
    // lecturas de textura por píxel del suelo: 1 del campo del ruedo + 2 por clase (repetición estocástica) × las 2 clases que más pesan + 1 si cae en una piedra
    // (las variantes no añaden ninguna: cada lectura va a la lámina de la variante de su celda)
    muestreos: { lejos: 0, tipico: 3, maximo: 6 } };
}
// el campo del ruedo de una tesela (pura): GN×GN bytes, fila 0 al sur; valor = (distancia al borde de la copa + 6 m) / 12 m · 255 (255 = lejos)
function campoRuedo(cps: readonly CopaRuedo[], ox: number, oy: number, TS: number, GN: number): Uint8Array {
  const out = new Uint8Array(GN * GN).fill(255), sc = TS / GN;
  for (let k = 0; k < cps.length; k++) {
    const c = cps[k] as CopaRuedo; if (!c.oliv) continue;
    let rm = 0; for (let q = 0; q < 8; q++) rm += c.perfil[q] as number; rm /= 8;
    const R = rm * 1.15 + 0.5, A = R + RUE_M; if (c.x < ox - A || c.x > ox + TS + A || c.y < oy - A || c.y > oy + TS + A) continue;
    const i0 = Math.max(0, Math.floor((c.x - ox - A) / sc)), i1 = Math.min(GN - 1, Math.floor((c.x - ox + A) / sc)), j0 = Math.max(0, Math.floor((c.y - oy - A) / sc)), j1 = Math.min(GN - 1, Math.floor((c.y - oy + A) / sc));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = ox + (i + 0.5) * sc - c.x, dy = oy + (j + 0.5) * sc - c.y, d = Math.sqrt(dx * dx + dy * dy) - R;
      const v = Math.max(0, Math.min(255, Math.round((d + RUE_M) / (2 * RUE_M) * 255))); if (v < (out[j * GN + i] as number)) out[j * GN + i] = v;
    }
  }
  return out;
}
// EV-1k: el formato de las texturas. Por defecto KTX2 (UASTC en una textura en array con mipmaps: tuberia/suelo/ktx2.mjs), que la tarjeta guarda
// a 1 byte por texel en vez de 4; si no carga (no está, el transcodificador falla, el aparato no puede), las WebP de siempre.
// ?suelofmt=png (o webp) fuerza las WebP para comparar; ?suelofmt=ktx2, el de por defecto. El transcodificador de three (basis_transcoder.js y
// .wasm) lo copia el build de Vite en <página>/basis/ (vite.config.js): del mismo origen, nunca de un CDN.
const BASIS = "basis/";
function ktx2(px: number): string { return "suelo/suelo_" + px + ".ktx2"; }
function formato(busqueda: string | null | undefined): Formato { const m = /[?&]suelofmt=(ktx2|png|webp)(?![^&#])/.exec(busqueda || ""); return m && m[1] !== "ktx2" ? "png" : "ktx2"; }
function orden(pedido: string): Formato[] { return pedido === "ktx2" ? ["ktx2", "png"] : ["png"]; }
// prueba los formatos en orden: el primero que da textura gana; si uno falla, se avisa (avisa(formato, error)) y se pasa al siguiente. Sin THREE:
// intentos[formato]() devuelve una promesa de la textura (así lo prueba Node con intentos de mentira)
function cargaEnOrden<F extends string, T>(formatos: readonly F[], intentos: Record<F, () => T | Promise<T>>, avisa?: (f: F, e: unknown) => void): Promise<{ formato: F; tex: T }> {
  let i = 0;
  function sigue(): Promise<{ formato: F; tex: T }> {
    if (i >= formatos.length) return Promise.reject(new Error("ningún formato cargó (" + formatos.join(", ") + ")"));
    const f = formatos[i++] as F;
    return new Promise<T>(function (ok) { ok(intentos[f]()); }).then(function (t) { return { formato: f, tex: t }; }, function (e) { if (avisa) avisa(f, e); return sigue(); });
  }
  return sigue();
}
interface Ktx2Textura { image?: { width: number; height: number; depth: number }; mipmaps?: { data?: { byteLength: number } }[] }
// ¿es el KTX2 que espera el sombreado? una lámina por clase y variante, del tamaño pedido y con su cadena de mipmaps entera (si no, se vuelve a las WebP)
function ktx2Vale(t: Ktx2Textura | null | undefined, px: number): boolean {
  const im = t && t.image, n = 1 + Math.floor(Math.log2(px));
  return !!(im && im.width === px && im.height === px && im.depth === CAPAS && t.mipmaps && t.mipmaps.length === n);
}
// bytes en la tarjeta de lo que se sube de verdad (los niveles de mipmap de una textura comprimida, con todas sus láminas)
function bytesNiveles(mipmaps: readonly { data?: { byteLength: number } }[] | null | undefined): number { let s = 0; for (let i = 0; i < (mipmaps || []).length; i++) { const m = (mipmaps as readonly { data?: { byteLength: number } }[])[i]; s += m && m.data ? m.data.byteLength : 0; } return s; }
function f1(v: number): string { const s = String(v); return s.indexOf(".") < 0 ? s + ".0" : s; }
// el GLSL que se añade al sombreado del relieve de 04d (solo con la bandera). cab: cabecera; pre: antes de la gravilla; color: antes de pasar a lineal
function glsl(TS: number): { cab: string; pre: string; color: string } {
  const cab = "uniform highp sampler2DArray uFot; uniform float uFotK; uniform sampler2D uRue;\n" +
    "const float FOT_M[" + CLASES.length + "] = float[" + CLASES.length + "](" + METROS.map(f1).join(", ") + ");\n" +
    "const float FOT_B[" + CLASES.length + "] = float[" + CLASES.length + "](" + BASE.map(f1).join(", ") + ");\n" +   // lámina inicial de cada clase
    "const float FOT_N[" + CLASES.length + "] = float[" + CLASES.length + "](" + VARIANTES.map(f1).join(", ") + ");\n" +   // y cuántas variantes tiene
    "float fotNiv(int c, float i){ return FOT_B[c] + mod(i, FOT_N[c]); }\n" +   // la lámina de la variante de la celda i (entera, ≥ 0): se turnan, ninguna sobra
    // repetición estocástica: dos lecturas con desplazamientos que cambian a saltos según un ruido; el salto cae donde la mezcla ya pasó del todo
    // a la otra lectura, así que no se ve; las derivadas se dan a mano (textureGrad) para que el desplazamiento no rompa los mipmaps. Cada celda
    // del ruido (i) escoge también la variante (otra foto de la clase; la de i y la de i + 1, siempre distintas), que salta donde salta el desplazamiento
    "vec4 fotVar(float capa, vec2 p, vec2 gx, vec2 gy){ float k = dn(p * 0.37 + capa * 3.7) * 6.0, i = floor(k), f = fract(k); int c = int(capa + 0.5);\n" +
    "  vec2 oa = fract(sin(vec2(3.1, 7.7) * (i + capa)) * 43.7), ob = fract(sin(vec2(3.1, 7.7) * (i + 1.0 + capa)) * 43.7);\n" +
    "  float na = fotNiv(c, i), nb = fotNiv(c, i + 1.0);\n" +
    "  vec4 a = textureGrad(uFot, vec3(p + oa, na), gx, gy), b = textureGrad(uFot, vec3(p + ob, nb), gx, gy); float t = smoothstep(0.2, 0.8, f);\n" +
    "  return 0.5 + (mix(a, b, t) - 0.5) / sqrt(t * t + (1.0 - t) * (1.0 - t)); }\n" +
    "vec4 fotCapa(float capa, vec2 pw, vec2 dx, vec2 dy){ float m = FOT_M[int(capa + 0.5)]; return fotVar(capa, pw / m, dx / m, dy / m); }\n";
  const pre = "float fotA = uFotK * (1.0 - smoothstep(" + f1(FUNDIDO[0] as number) + ", " + f1(FUNDIDO[1] as number) + ", dc)); vec2 fdx = dFdx(vWP.xz) * vec2(1.0, -1.0), fdy = dFdy(vWP.xz) * vec2(1.0, -1.0);\n";
  const color =
    "if (fotA > 0.003) { vec2 pw = vec2(vWP.x, -vWP.z);\n" +
    "  float dR = texture2D(uRue, lc / " + f1(TS) + ").r * " + f1(2 * RUE_M) + " - " + f1(RUE_M) + ", fnA = dn(pw * 0.55 + 1.7), fnB = dn(pw * 1.9 + 5.3);\n" +
    // los pesos de clase (DEDUCIDOS; ver la cabecera del módulo)
    "  float wRue = 1.0 - smoothstep(-0.8, 0.4, dR + 1.6 * (fnA - 0.5));\n" +
    "  float wHoj = clamp(1.0 - smoothstep(0.4, 1.6, abs(dR + 0.5 + 1.2 * (fnB - 0.5))) + wRue * 0.7 * smoothstep(0.55, 0.8, fnB), 0.0, 1.0) * (0.35 + 0.65 * (1.0 - camino));\n" +
    "  float fuera = 1.0 - max(wRue, wHoj), wCam = camino * fuera, wCom = abierto * (1.0 - smoothstep(0.86, 0.98, tono)) * (1.0 - camino) * fuera, wTie = desnudo * (1.0 - camino) * fuera;\n" +
    "  float w[6]; w[0] = max(0.0, fuera - wCam - wCom - wTie) + 0.03; w[1] = wHoj; w[2] = wTie; w[3] = wCom; w[4] = wRue * (1.0 - wHoj); w[5] = wCam;\n" +
    // solo las dos clases que más pesan (tope de lecturas), mezcladas conservando la varianza
    "  float b1 = -1.0, b2 = -1.0, c1 = 0.0, c2 = 0.0; for (int q = 0; q < 6; q++) { float v = w[q]; if (v > b1) { b2 = b1; c2 = c1; b1 = v; c1 = float(q); } else if (v > b2) { b2 = v; c2 = float(q); } }\n" +
    "  vec4 tx = fotCapa(c1, pw, fdx, fdy); float t2 = b2 / max(b1 + b2, 1e-4);\n" +
    "  if (t2 > 0.03) { tx = 0.5 + (mix(tx, fotCapa(c2, pw, fdx, fdy), t2) - 0.5) / sqrt(t2 * t2 + (1.0 - t2) * (1.0 - t2)); }\n" +
    "  suelo *= mix(vec3(1.0), tx.rgb * 2.0, fotA); hSuelo += fotA * 0.012 * (tx.a - 0.5);\n" +
    // piedras sueltas (calcomanías de caliza, ilustrativas): una por celda de 0,9 m con cierta probabilidad, elipse girada con el borde roto
    "  vec2 ce = floor(pw / 0.9), fr = pw - ce * 0.9; float pr = 0.03 + 0.12 * (wTie + wCam + w[4]);\n" +
    "  if (dh(ce + 17.3) < pr) { vec2 c0 = (vec2(dh(ce + 3.1), dh(ce + 8.9)) * 0.5 + 0.25) * 0.9; float rr = 0.06 + 0.18 * dh(ce + 5.5), an = dh(ce + 1.1) * 6.2832; vec2 dd = fr - c0; dd = vec2(cos(an) * dd.x - sin(an) * dd.y, sin(an) * dd.x + cos(an) * dd.y); dd.y *= 1.6;\n" +
    "    float esP = 1.0 - smoothstep(0.8, 1.0, length(dd) / rr + 0.35 * (dn(pw * 9.0) - 0.5));\n" +
    "    if (esP > 0.0) { vec4 tp = textureGrad(uFot, vec3(pw / FOT_M[6] + ce * 0.37, fotNiv(6, floor(dh(ce + 2.9) * 6.0))), fdx / FOT_M[6], fdy / FOT_M[6]); suelo = mix(suelo, mix(suelo, vec3(0.70, 0.66, 0.60), 0.55) * tp.rgb * 2.0, esP * fotA); hSuelo += fotA * esP * (0.02 + 0.015 * (tp.a - 0.5)); } }\n" +
    "}\n";
  return { cab, pre, color };
}
// pone el GLSL a las cadenas de 04d; si un ancla falta (alguien cambió 04d), falla en vez de quedarse a medias
const ANCLAS: Record<"pre" | "grano" | "color", string> = { pre: "float grano =", grano: "(1.0 - m) * 0.3, 0.0, 1.0) * cercaM;", color: "diffuseColor.rgb *= sRGBTransferEOTF(" };
function parcheGlsl(cab: string, color: string, TS: number): { cab: string; color: string } {
  const g = glsl(TS);
  (Object.keys(ANCLAS) as (keyof typeof ANCLAS)[]).forEach(function (k) { if (color.split(ANCLAS[k]).length !== 2) throw new Error("04f_suelo_fotos: el ancla «" + ANCLAS[k] + "» no está una vez en el sombreado de 04d"); });
  return { cab: cab + g.cab, color: color.replace(ANCLAS.pre, g.pre + ANCLAS.pre).replace(ANCLAS.grano, "(1.0 - m) * 0.3, 0.0, 1.0) * cercaM * (1.0 - fotA);").replace(ANCLAS.color, g.color + ANCLAS.color) };
}
// ---- A4-0: el MISMO suelo de fotos en nodos (TSL), para la variante del terreno (MATERIALES §1.5); APAGADO: solo con el WebGPURenderer (MU6). Las mismas
// cuentas que glsl() (una sola fuente de las constantes: CLASES, METROS, BASE, VARIANTES, FUNDIDO, RUE_M) y los MISMOS { value } (uFot, uFotK y el uRue de la
// tesela). Lo que cambia por fuerza en nodos: el bucle de las dos clases que más pesan va desenrollado con select; FOT_M[c] y fotNiv(c, i), con select por clase;
// el campo del ruedo (uRue) se lee FUERA del «if (fotA > 0,003)», para que sus derivadas implícitas estén definidas (three apaga en WGSL el aviso de
// uniformidad de las derivadas, no el problema): una lectura más por píxel donde las fotos no llegan. Las demás son textureGrad (derivadas a mano), como el GLSL.
// e: lo que pone el terreno (dn y dh, su ruido; lc, vWP, dc y las máscaras del detalle). Devuelve fotA (el grano lo usa) y aplica(suelo) → vec4(suelo, Δh).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsl(T: any, e: T3): { fotA: T3; aplica(suelo: T3): T3 } {
  const lee = function (x: { value: T3 }, d: T3) { return function () { return (x && x.value) || d; }; };
  const uFotK = T.uniform(e.uFotK.value).onObjectUpdate(function () { return e.uFotK.value; });
  const elige = function (c: T3, lista: readonly number[]): T3 { let r = T.float(lista[0] as number); for (let k = 1; k < lista.length; k++) r = T.select(c.greaterThan(k - 0.5), T.float(lista[k] as number), r); return r; };
  const fotNiv = function (c: T3, i: T3): T3 { return elige(c, BASE).add(T.mod(i, elige(c, VARIANTES))); };
  // la lámina de la variante, el sitio y las derivadas: textureGrad sobre el array (con el valor de uFot releído en el nodo que se muestrea: sample/depth/grad clonan)
  const lamina = function (uv: T3, capa: T3, gx: T3, gy: T3): T3 { const n = T.texture(e.huecoArr(), uv).depth(capa.add(0.5)).grad(gx, gy); return MaterialesPuro.releeTextura(n, lee(e.uFot, e.neutroArr)); };
  const fotVar = function (capa: T3, p: T3, gx: T3, gy: T3): T3 {
    const k = e.dn(p.mul(0.37).add(capa.mul(3.7))).mul(6), i = T.floor(k), f = T.fract(k);
    const oa = T.fract(T.sin(T.vec2(3.1, 7.7).mul(i.add(capa))).mul(43.7)), ob = T.fract(T.sin(T.vec2(3.1, 7.7).mul(i.add(1).add(capa))).mul(43.7));
    const a = lamina(p.add(oa), fotNiv(capa, i), gx, gy), b = lamina(p.add(ob), fotNiv(capa, i.add(1)), gx, gy), t = T.smoothstep(0.2, 0.8, f);
    return T.mix(a, b, t).sub(0.5).div(T.sqrt(t.mul(t).add(T.float(1).sub(t).mul(T.float(1).sub(t))))).add(0.5);
  };
  const fotCapa = function (capa: T3, pw: T3, dx: T3, dy: T3): T3 { const m = elige(capa, METROS); return fotVar(capa, pw.div(m), dx.div(m), dy.div(m)); };
  const fotA = uFotK.mul(T.float(1).sub(T.smoothstep(FUNDIDO[0] as number, FUNDIDO[1] as number, e.dc)));
  const fdx = T.dFdx(T.vec2(e.vWP.x, e.vWP.z)).mul(T.vec2(1, -1)), fdy = T.dFdy(T.vec2(e.vWP.x, e.vWP.z)).mul(T.vec2(1, -1));
  const aplica = function (suelo0: T3): T3 {
    return T.Fn(function () {
      // todo lo de fuera, a variables ANTES del if: un nodo que se construye por primera vez dentro de un bloque se queda dentro de él
      const suelo = T.vec3(suelo0).toVar(), dh = T.float(0).toVar(), fa = T.float(fotA).toVar(), gx = T.vec2(fdx).toVar(), gy = T.vec2(fdy).toVar();
      const rue = MaterialesPuro.releeTextura(T.texture(e.hueco("uRue"), e.lc.div(e.TS)), lee(e.uRue, e.neutro));   // con su hueco, no con su valor (terreno.ts, lee())
      const dR = rue.r.mul(2 * RUE_M).sub(RUE_M).toVar(), ab = T.float(e.abierto).toVar(), to = T.float(e.tono).toVar(), de = T.float(e.desnudo).toVar(), ca = T.float(e.camino).toVar();
      const pw = T.vec2(e.vWP.x, e.vWP.z.negate()).toVar();
      T.If(fa.greaterThan(0.003), function () {
        const fnA = e.dn(pw.mul(0.55).add(1.7)), fnB = e.dn(pw.mul(1.9).add(5.3));
        const wRue = T.float(1).sub(T.smoothstep(-0.8, 0.4, dR.add(fnA.sub(0.5).mul(1.6))));
        const wHoj = T.clamp(T.float(1).sub(T.smoothstep(0.4, 1.6, T.abs(dR.add(0.5).add(fnB.sub(0.5).mul(1.2))))).add(wRue.mul(0.7).mul(T.smoothstep(0.55, 0.8, fnB))), 0, 1).mul(T.float(1).sub(ca).mul(0.65).add(0.35));
        const fuera = T.float(1).sub(T.max(wRue, wHoj)), wCam = ca.mul(fuera), wCom = ab.mul(T.float(1).sub(T.smoothstep(0.86, 0.98, to))).mul(T.float(1).sub(ca)).mul(fuera), wTie = de.mul(T.float(1).sub(ca)).mul(fuera);
        const w = [T.max(0, fuera.sub(wCam).sub(wCom).sub(wTie)).add(0.03), wHoj, wTie, wCom, wRue.mul(T.float(1).sub(wHoj)), wCam];
        // las dos clases que más pesan (el bucle del GLSL, desenrollado: el mismo orden y los mismos empates)
        let b1: T3 = T.float(-1), b2: T3 = T.float(-1), c1: T3 = T.float(0), c2: T3 = T.float(0);
        for (let q = 0; q < w.length; q++) {
          const v = w[q], g1 = v.greaterThan(b1), g2 = v.greaterThan(b2);
          const nb2 = T.select(g1, b1, T.select(g2, v, b2)), nc2 = T.select(g1, c1, T.select(g2, T.float(q), c2));
          b1 = T.select(g1, v, b1); c1 = T.select(g1, T.float(q), c1); b2 = nb2; c2 = nc2;
        }
        const cl1 = T.float(c1).toVar(), cl2 = T.float(c2).toVar(), t2 = T.float(b2).div(T.max(T.float(b1).add(b2), 1e-4)).toVar();
        const tx = T.vec4(fotCapa(cl1, pw, gx, gy)).toVar();
        T.If(t2.greaterThan(0.03), function () { tx.assign(T.mix(tx, fotCapa(cl2, pw, gx, gy), t2).sub(0.5).div(T.sqrt(t2.mul(t2).add(T.float(1).sub(t2).mul(T.float(1).sub(t2))))).add(0.5)); });
        suelo.assign(suelo.mul(T.mix(T.vec3(1), tx.rgb.mul(2), fa))); dh.addAssign(fa.mul(0.012).mul(tx.a.sub(0.5)));
        // piedras sueltas (calcomanías de caliza, ilustrativas)
        const ce = T.floor(pw.div(0.9)).toVar(), fr = pw.sub(ce.mul(0.9)), pr = T.float(0.03).add(T.float(0.12).mul(wTie.add(wCam).add(w[4])));
        T.If(e.dh(ce.add(17.3)).lessThan(pr), function () {
          const c0 = T.vec2(e.dh(ce.add(3.1)), e.dh(ce.add(8.9))).mul(0.5).add(0.25).mul(0.9), rr = T.float(0.06).add(T.float(0.18).mul(e.dh(ce.add(5.5)))), an = e.dh(ce.add(1.1)).mul(6.2832);
          const d0 = fr.sub(c0), dd = T.vec2(T.cos(an).mul(d0.x).sub(T.sin(an).mul(d0.y)), T.sin(an).mul(d0.x).add(T.cos(an).mul(d0.y)).mul(1.6));
          const esP = T.float(1).sub(T.smoothstep(0.8, 1.0, T.length(dd).div(rr).add(e.dn(pw.mul(9)).sub(0.5).mul(0.35)))).toVar();
          T.If(esP.greaterThan(0), function () {
            const mP = METROS[6] as number, tp = lamina(pw.div(mP).add(ce.mul(0.37)), fotNiv(T.float(6), T.floor(e.dh(ce.add(2.9)).mul(6))), gx.div(mP), gy.div(mP));
            suelo.assign(T.mix(suelo, T.mix(suelo, T.vec3(0.7, 0.66, 0.6), 0.55).mul(tp.rgb).mul(2), esP.mul(fa)));
            dh.addAssign(fa.mul(esP).mul(T.float(0.02).add(T.float(0.015).mul(tp.a.sub(0.5)))));
          });
        });
      });
      return T.vec4(suelo, dh);
    })();
  };
  return { fotA, aplica };
}

export const SueloFotosPuro = { CLASES, METROS, VARIANTES, BASE, CAPAS, PX, FUNDIDO, RUE_GN, RUE_M, decide, ficheros, presupuesto, campoRuedo, glsl, parcheGlsl, tsl,
  BASIS, ktx2, formato, orden, cargaEnOrden, ktx2Vale, bytesNiveles };

// ---------------------------------------------------------------- lo que toca THREE y el DOM
/** una imagen ya decodificada (HTMLImageElement) */
export interface ImagenFoto { width?: number; height?: number }
/** el lienzo 2D de mentira o de verdad con el que se juntan las láminas */
export interface LienzoFoto { width: number; height: number; getContext(t: string, o?: unknown): { clearRect(x: number, y: number, w: number, h: number): void; drawImage(im: unknown, x: number, y: number, w: number, h: number): void; getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray | Uint8Array } } | null }
export interface DepsSueloFotos {
  THREE: T3;
  Aparato: { clase(): string; vr(): boolean };
  Mundo: { TS: number };
  /** el censo de árboles (02_mundo: copas): de él sale el campo del ruedo de cada tesela */
  copas: readonly CopaRuedo[];
  /** la Cola del exterior (02b_cola: ColaExt) */
  ColaExt: { pon(clave: string, prio: number, trabajo: Generator<unknown, unknown, unknown>, fin?: (v: unknown) => void): boolean; cancela(clave: string): void };
  /** el renderer (el KTX2Loader decide con él a qué formato de la tarjeta se transcodifica) */
  renderer: unknown;
  /** location.search ("" si no hay) */
  busqueda: string;
  /** el guardado de Configuración → Vista («vista.suelo», true/false) o undefined; lo lee una vez, al crearse */
  ajuste?: (() => unknown) | undefined;
  /** import("three/addons/loaders/KTX2Loader.js") (lo escribe el legado: Vite lo trocea con el motor, como antes); el módulo con su KTX2Loader */
  cargaKtx2?: (() => Promise<{ KTX2Loader: new () => T3 }>) | undefined;
  /** una imagen decodificada desde su URL (por defecto, un Image del navegador) */
  imagen?: ((src: string) => Promise<ImagenFoto>) | undefined;
  /** un lienzo cuadrado (por defecto, document.createElement("canvas")) */
  lienzo?: ((px: number) => LienzoFoto) | undefined;
  consola?: { warn(...a: unknown[]): void } | undefined;
}

export function creaSueloFotos(d: DepsSueloFotos) {
  const THREE = d.THREE, P = SueloFotosPuro, consola = d.consola || null;
  const cfg = P.decide(d.busqueda, d.Aparato.clase(), d.ajuste ? d.ajuste() : undefined), U: { uFot: { value: T3 }; uFotK: { value: number } } = { uFot: { value: null }, uFotK: { value: 0 } };
  let tex: T3 = null, hecho = false, neutro: T3 = null, campos: T3[] = [];
  function rueNeutro(): T3 {   // sin tesela del Mundo (o antes de calcular su campo): lejos de toda copa
    if (!neutro) { neutro = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); neutro.needsUpdate = true; }
    return neutro;
  }
  function campo(t: { ox: number; oy: number }): T3 {   // el campo del ruedo de una tesela del Mundo (una vez; 1 byte por celda de 2 m)
    const GN = P.RUE_GN, dat = P.campoRuedo(d.copas, t.ox, t.oy, d.Mundo.TS, GN), tx = new THREE.DataTexture(dat, GN, GN, THREE.RedFormat, THREE.UnsignedByteType);
    tx.magFilter = tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true; campos.push(tx); return tx;
  }
  // las 13 parejas color + relieve (una por lámina): se piden todas (mismo origen) y, cuando han llegado, se decodifican a píxeles y se juntan en una
  // textura en array en la cola, media lámina por rebanada y con la prioridad más baja (después de las teselas)
  const img = d.imagen || function (src: string): Promise<ImagenFoto> {
    return new Promise(function (ok, mal) { const im = new Image(); im.decoding = "async"; im.onload = function () { ok(im); }; im.onerror = function () { mal(new Error("no se pudo leer " + src)); }; im.src = src; });
  };
  const lienzo = d.lienzo || function (px: number): LienzoFoto { const cv = document.createElement("canvas"); cv.width = cv.height = px; return cv as unknown as LienzoFoto; };
  function* juntaG(L: readonly FicheroSuelo[], ims: readonly ImagenFoto[]): Generator<void, T3, void> {
    const px = cfg.px, datos = new Uint8Array(px * px * 4 * L.length), cv = lienzo(px);
    const cx = cv.getContext("2d", { willReadFrequently: true }) as NonNullable<ReturnType<LienzoFoto["getContext"]>>;
    for (let k = 0; k < L.length; k++) {
      cx.clearRect(0, 0, px, px); cx.drawImage(ims[2 * k], 0, 0, px, px); const a = cx.getImageData(0, 0, px, px).data; yield;
      cx.clearRect(0, 0, px, px); cx.drawImage(ims[2 * k + 1], 0, 0, px, px); const b = cx.getImageData(0, 0, px, px).data, o = k * px * px * 4;
      for (let i = 0, n = px * px; i < n; i++) { datos[o + i * 4] = a[i * 4] as number; datos[o + i * 4 + 1] = a[i * 4 + 1] as number; datos[o + i * 4 + 2] = a[i * 4 + 2] as number; datos[o + i * 4 + 3] = b[i * 4] as number; }
      yield;
    }
    const t = new THREE.DataArrayTexture(datos, px, px, L.length);   // valores tal cual (factores, no colores): sin espacio de color
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    t.onUpdate = function () { t.image.data = null; };   // ya en la tarjeta gráfica: fuera la copia de la CPU (29,3 MB a 768, 7,3 MB a 384: presupuesto().cpuMB)
    return t;
  }
  let pedido = false, vez = 0, cargado: string | null = null, bytesTex = 0, gpuFmt: unknown = null, loader: T3 = null;
  const pide = P.formato(d.busqueda);
  // prioridad 60 (como algo a 60 m): con 1e9 nunca le llegaba el turno, porque la Cola siempre corre la menor y al moverse siempre hay teselas, olivos o detalle pendientes
  function enCola<V>(gen: Generator<unknown, V, unknown>): Promise<V> { return new Promise<V>(function (ok, mal) { if (!d.ColaExt.pon("SF", 60, gen, ok as (v: unknown) => void)) mal(new Error("ya había un trabajo SF en la Cola")); }); }
  function cargaWebp(): Promise<T3> {
    const L = P.ficheros(cfg.px), srcs: string[] = []; L.forEach(function (f) { srcs.push(f.color, f.relieve); });
    return Promise.all(srcs.map(img)).then(function (ims) { return enCola(juntaG(L, ims)); });
  }
  function sueltaLoader(): void { if (loader) { loader.dispose(); loader = null; } }   // fuera los workers del transcodificador y su URL blob:
  // EV-1k: el KTX2 de array con el KTX2Loader de three (import() solo con la bandera y este formato). detectSupport decide a qué formato de la tarjeta
  // se transcodifica (ASTC 4x4, BC7, ETC2 RGBA… o RGBA8 si no hay ninguno); el loader se libera en cuanto da la textura o falla
  function cargaKtx2(): Promise<T3> {
    if (!d.cargaKtx2) return Promise.reject(new Error("sin KTX2Loader"));
    return d.cargaKtx2().then(function (m) {
      loader = new m.KTX2Loader().setTranscoderPath(P.BASIS).setWorkerLimit(1).detectSupport(d.renderer);
      return loader.loadAsync(P.ktx2(cfg.px));
    }).then(function (t: T3) {
      sueltaLoader();
      if (!P.ktx2Vale(t, cfg.px)) { t.dispose(); throw new Error(P.ktx2(cfg.px) + " no trae " + P.CAPAS + " láminas de " + cfg.px + " px con todos sus mipmaps"); }
      return enCola((function* (): Generator<void, T3, void> {   // poco trabajo en el hilo principal (lo pesado lo hizo el worker), pero por la Cola, como todo lo que monta texturas
        yield;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace;   // factores, no colores (como la de las WebP)
        bytesTex = P.bytesNiveles(t.mipmaps); gpuFmt = t.format;
        t.onUpdate = function () { t.mipmaps = []; };   // ya en la tarjeta gráfica: fuera la copia de la CPU (lo que ocupaba: bytesTex)
        return t;
      })());
    }, function (e: unknown) { sueltaLoader(); throw e; });
  }
  function carga(): void {
    if (!cfg.activo || pedido) return; pedido = true;
    const mia = ++vez;   // si libera() llega antes que la textura, la que llegue tarde se tira
    P.cargaEnOrden(P.orden(pide), { ktx2: cargaKtx2, png: cargaWebp }, function (f, e) { if (consola) consola.warn("suelo=fotos (" + f + "): " + ((e as Error | undefined)?.message || e) + (f === "ktx2" ? "; vuelvo a las WebP" : "")); })
      .then(function (r) {
        if (mia !== vez) { r.tex.dispose(); return; }
        if (r.formato === "png") { bytesTex = P.presupuesto(cfg.px).texturaBytes; gpuFmt = THREE.RGBAFormat; }
        cargado = r.formato; tex = r.tex; U.uFot.value = r.tex; hecho = true;
      }, function (e: Error) { if (mia === vez && consola) consola.warn("suelo=fotos: " + e.message + "; el suelo sigue como siempre"); });
  }
  // cada 0,2 s (desde 04d): encendido si ya cargó y, en VR, solo con ?sueloVR=1 (hasta medir en el Quest)
  function actualiza(): void { if (!cfg.activo) return; carga(); U.uFotK.value = hecho && (cfg.vr || !d.Aparato.vr()) ? 1 : 0; }
  /** suelta TODO lo que creó: el trabajo SF de la Cola (y la carga en vuelo, que al llegar se tira), el KTX2Loader con sus workers, la textura en array, los campos del ruedo y el neutro */
  function libera(): void {
    vez++; sueltaLoader(); d.ColaExt.cancela("SF");
    if (tex) { tex.dispose(); tex = null; U.uFot.value = null; } hecho = false; pedido = false; U.uFotK.value = 0; cargado = null; bytesTex = 0; gpuFmt = null;
    campos.forEach(function (t) { t.dispose(); }); campos = []; if (neutro) { neutro.dispose(); neutro = null; }
  }
  // texturaMB: lo declarado para RGBA8 (presupuesto); gpuMB: lo que se subió de verdad con el formato que se cargó (null hasta que carga)
  function resumen() {
    const b = P.presupuesto(cfg.px);
    return { activo: cfg.activo, px: cfg.px, vr: cfg.vr, hecho, encendido: U.uFotK.value > 0, texturaMB: b.texturaMB, campos: campos.length,
      formato: pide, cargado, gpuFormato: gpuFmt, gpuBytes: bytesTex, gpuMB: hecho ? Math.round(bytesTex / 1048576 * 10) / 10 : null };
  }
  return { activo: cfg.activo, U, rueNeutro, campo, actualiza, libera, resumen };
}
export type SueloFotos = ReturnType<typeof creaSueloFotos>;

/** El manifiesto del componente «suelo-fotos» (A3-1b): es el ciclo de vida del suelo de fotos; el objeto que 04d usa es el mismo que monta (lo crea el legado al cargarse y
 *  se le da aquí, para que 04d lo tenga desde el primer fotograma y no dependa de cuándo se monte el componente). Apagado (sin ?suelo=fotos ni el ajuste), no carga ni crea nada. */
export function manifiestoSueloFotos(suelo: SueloFotos): Manifiesto {
  return {
    id: "suelo-fotos", version: 1,
    consume: ["Aparato", "Mundo", "copas", "ColaExt", "renderer"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: SueloFotosPuro.presupuesto(SueloFotosPuro.PX[0] as number).texturaMB },   // sin la bandera, nada; con ella, lo de presupuesto(): 0 llamadas, 0 triángulos y la textura en array (RGBA8 declarado; el KTX2 pesa 1/4)
    mundos: ["exterior"],
    monta: function () { return suelo; },
    libera: function (api) { if (api) (api as SueloFotos).libera(); }
  };
}
