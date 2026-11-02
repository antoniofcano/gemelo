// Visor 3D del olivo real (OF8b, doc/sistema/OFICINA.md §9.1): las cuentas del visor, sin DOM ni three (se prueban en Node).
// Reparte los escalones en la cuadrícula del visor, cuadra la cámara a la caja del olivo, gira y acerca con los botones, pasa el
// rectángulo de una celda a la vista de WebGL y escribe los rótulos. El dibujo lo hace apps/web/olivo/visor.js (three 0.128 del constructor).
import { miles } from "./olivo_real_puro.js";

/** Ancho mínimo de una celda (px CSS) y hueco entre celdas: con menos sitio, los escalones pasan a dos columnas o a una */
export const CELDA_MIN = 220;
export const HUECO = 8;
/** El campo de visión vertical de la cámara (grados), el de la herramienta del constructor y la referencia «Olivos tipo» */
export const FOV = 38;
/** Desde dónde se mira al principio (la dirección de la cámara de la herramienta: 9, 4,5, 10) */
export const DIRECCION = [9, 4.5, 10];
/** El tope del pixelRatio: más no se ve y multiplica el coste de cada celda */
export const MAX_PIXEL_RATIO = 2;
/** Cuánto gira (radianes) y acerca (factor) cada pulsación de los botones del visor */
export const PASO_GIRO = Math.PI / 12;
export const PASO_ZOOM = 0.8;

export const TEXTOS = {
  honesto: "Forma ilustrativa con medidas del LiDAR: la altura y la copa son medidas (LiDAR 2024); la asimetría y la falda, deducidas; tronco, ramas, hojas y aceitunas, ilustrativos.",
  escena: "Suelo, luz y fondo de la herramienta del constructor (los de la referencia «Olivos tipo»), no los de la finca.",
  uso: "Arrastra para girar (un dedo en pantalla táctil), rueda o dos dedos para acercar; los cuatro escalones giran a la vez. Esc cierra el visor.",
  sinWebgl: "Este aparato o navegador no puede dibujar en 3D (no hay WebGL). Las cifras de los escalones siguen abajo.",
  cargando: "Cargando el visor 3D (three y el constructor, solo esta vez)…",
};

/** Las columnas de la cuadrícula: todos en una fila si caben; si no, de dos en dos; si tampoco, uno debajo de otro */
export function columnas(n, ancho) {
  if (!(n > 0)) return 1;
  const caben = Math.floor((Math.max(0, ancho) + HUECO) / (CELDA_MIN + HUECO));
  return caben >= n ? n : caben >= 2 && n > 1 ? 2 : 1;
}

/** El pixelRatio del renderer: el del aparato, con tope (y 1 si no se sabe) */
export const pixelRatio = dpr => Math.min(MAX_PIXEL_RATIO, dpr > 0 ? dpr : 1);

/**
 * El rectángulo de una celda (su getBoundingClientRect) en la vista de WebGL del lienzo (el suyo): origen abajo a la izquierda, en px CSS
 * (three multiplica por el pixelRatio), recortado al lienzo. { x, y, w, h, visible }.
 */
export function rectGL(celda, lienzo) {
  const x0 = Math.max(celda.left, lienzo.left), x1 = Math.min(celda.left + celda.width, lienzo.left + lienzo.width);
  const y0 = Math.max(celda.top, lienzo.top), y1 = Math.min(celda.top + celda.height, lienzo.top + lienzo.height);
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  return { x: x0 - lienzo.left, y: lienzo.top + lienzo.height - y1, w, h, visible: w >= 1 && h >= 1 };
}

/**
 * La cámara que cuadra el olivo en una celda: mira a 0,45 de su altura (como la herramienta) desde la DIRECCION, a la distancia en que la esfera
 * que envuelve la copa y el tronco cabe en el campo de visión más estrecho (vertical u horizontal) con un margen. También los límites del zoom.
 * @param medidas { alto, copa } en metros (de la receta: medidas.altura_m y medidas.copa_m)
 * @param aspecto ancho / alto de la celda
 */
export function encuadre(medidas, aspecto, fov) {
  const alto = Math.max(0.5, Number(medidas && medidas.alto) || 0), copa = Math.max(0.5, Number(medidas && medidas.copa) || 0);
  const a = aspecto > 0 ? aspecto : 1, fv = ((fov || FOV) * Math.PI) / 180, fh = 2 * Math.atan(Math.tan(fv / 2) * a);
  const objetivo = [0, alto * 0.45, 0], radio = Math.hypot(copa / 2, alto * 0.55);
  const d = (radio / Math.sin(Math.min(fv, fh) / 2)) * 1.05;
  const n = Math.hypot(...DIRECCION), dir = DIRECCION.map(v => v / n);
  return {
    objetivo, radio, distancia: d,
    posicion: dir.map((v, i) => objetivo[i] + v * d),
    minDistancia: Math.max(0.6, radio * 0.35), maxDistancia: d * 3,
    cerca: 0.05, lejos: d * 4 + 50,
  };
}

/** Gira la cámara alrededor del eje vertical que pasa por el objetivo (radianes; positivo = giro antihorario visto desde arriba, Ry) */
export function gira(posicion, objetivo, angulo) {
  const dx = posicion[0] - objetivo[0], dz = posicion[2] - objetivo[2], c = Math.cos(angulo), s = Math.sin(angulo);
  return [objetivo[0] + dx * c + dz * s, posicion[1], objetivo[2] - dx * s + dz * c];
}

/** Acerca (factor < 1) o aleja (> 1) la cámara hacia el objetivo, sin salirse de [min, max] */
export function acerca(posicion, objetivo, factor, min, max) {
  const v = posicion.map((p, i) => p - objetivo[i]), d = Math.hypot(...v) || 1;
  const nd = Math.min(max || Infinity, Math.max(min || 0, d * factor));
  return v.map((x, i) => objetivo[i] + (x / d) * nd);
}

/** Los rótulos de cada celda, a partir de las filas de la tabla (filasEscalones): nombre, nota corta y cifras («123.456 triángulos · 12 llamadas») */
export function rotulos(filas) {
  return filas.map(f => ({ k: f.k, titulo: f.nombre, nota: f.nota, cifras: miles(f.triangulos) + " triángulos · " + f.mallas + (f.mallas === 1 ? " llamada" : " llamadas"),
    etiqueta: f.nombre + ": " + miles(f.triangulos) + " triángulos y " + f.mallas + " llamadas de dibujo" }));
}

/** Qué escalones van al visor: los que haya calculado el constructor, en el orden de la tabla */
export const escalonesDelVisor = (filas, recetas) => filas.filter(f => recetas && recetas[f.k]).map(f => f.k);
