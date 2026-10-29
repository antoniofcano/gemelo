// Impostor de olivo, formato versión 1 (contratos/olivo-impostor.md, ADR-0019 §2): la disposición hemi-octaédrica de las vistas, la base de la
// cámara de cada vista y la celda de cada vista en los atlas. Módulo ES puro, sin DOM ni THREE: lo usan la página de horneado (Chrome), el
// hornero (Node) y el motor (O8c), para que los tres no puedan discrepar. Lo vigila pruebas/guardianes/impostor.test.js.
//
//   IMPOSTOR (constantes del formato) · direccionDeVista(i, j, n) → [x, y, z] · octaDeDireccion(d) → [a, b] · vistaContinua(d, n) → [gi, gj]
//   baseDeVista(d) → {r, u} · celdaUV(variante, i, j, o) → [u0, v0, u1, v1] · celdaPixeles(variante, i, j, lado, o) → {x, y, w} (fila 0 arriba)
//   claveImpostor(o) → texto canónico de lo que decide un atlas (la parte que no son píxeles) · validaFilaImpostor(f) → [] o lo que falla

/** Constantes del formato 1 (cambiarlas es cambiar el contrato: subir `FORMATO`) */
export const IMPOSTOR = Object.freeze({
  FORMATO: 1,
  REJILLA: 8,        // 8 × 8 vistas por variante
  VISTA: 128,        // píxeles por vista en el atlas de color
  VISTA_NORMAL: 64,  // píxeles por vista en el atlas de normales (media resolución)
  POR_LADO: 2,       // 2 × 2 variantes por atlas
  LADO: 2048,        // atlas de color: POR_LADO · REJILLA · VISTA
  LADO_NORMAL: 1024, // atlas de normales: POR_LADO · REJILLA · VISTA_NORMAL
  SUPER: 4,          // submuestras por eje al hornear (4 × 4 = 16 por píxel de color): la cobertura del alfa tiene 17 niveles
  MARGEN: 1.02,      // semilado de la cámara ortográfica = radio de la esfera × MARGEN (el árbol no toca el borde de su celda)
  NIVEL: "E2",       // de qué receta sale (la misma variante E2 que se ve a media distancia)
  OCLUSION_MIN: 0.45 // oclusión de copa (alfa de las normales): 1 fuera de la copa, hasta OCLUSION_MIN en su centro (ver el contrato §3)
});

/**
 * Dirección (unitaria, marco del árbol: +Y arriba, norte = −Z) DESDE el centro del árbol HACIA la cámara de la vista (i, j), 0 ≤ i, j < n.
 * Las vistas están en los VÉRTICES de una rejilla n × n sobre el cuadrado hemi-octaédrico [−1, 1]²: el borde del cuadrado es el horizonte
 * (la fila del horizonte existe: el paseo mira casi horizontal) y las esquinas son +X, +Z, −X, −Z.
 */
export function direccionDeVista(i, j, n = IMPOSTOR.REJILLA) {
  const a = -1 + 2 * i / (n - 1), b = -1 + 2 * j / (n - 1);
  const x = (a + b) / 2, z = (a - b) / 2, y = 1 - Math.abs(x) - Math.abs(z);
  const l = Math.hypot(x, y, z);
  return [x / l, Math.max(0, y) / l, z / l];
}

/** Coordenadas hemi-octaédricas [a, b] ∈ [−1, 1]² de una dirección; por debajo del horizonte se aplasta al horizonte (y = 0) */
export function octaDeDireccion(d) {
  const x = d[0], y = Math.max(0, d[1]), z = d[2], s = Math.abs(x) + y + Math.abs(z) || 1;
  const px = x / s, pz = z / s;
  return [px + pz, px - pz];
}

/** Posición continua [gi, gj] ∈ [0, n − 1]² en la rejilla de vistas (las vistas vecinas son floor/ceil de cada una) */
export function vistaContinua(d, n = IMPOSTOR.REJILLA) {
  const [a, b] = octaDeDireccion(d), k = (n - 1) / 2;
  const c = v => Math.min(n - 1, Math.max(0, (v + 1) * k));
  return [c(a), c(b)];
}

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cruz = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

/**
 * Base de la imagen de una vista: r (eje x de la imagen, hacia la derecha) y u (eje y, hacia arriba). La cámara está en centro + d·D, mira a
 * −d, y un punto P del árbol cae en la imagen en (x, y) = ((P − centro)·r, (P − centro)·u), con x, y ∈ [−semilado, semilado].
 * r = normaliza(Y × d) y u = d × r; en el cenit exacto (Y × d = 0), r = +X. Es lo que da Matrix4.lookAt de three con `up = u`.
 */
export function baseDeVista(d) {
  let r = cruz([0, 1, 0], d);
  r = Math.hypot(r[0], r[1], r[2]) < 1e-6 ? [1, 0, 0] : norm(r);
  return { r, u: cruz(d, r) };
}

/** Celda de la vista (i, j) de la variante k en coordenadas de textura (u, v ∈ [0, 1], v hacia ARRIBA, el convenio de WebGL/three con flipY) */
export function celdaUV(k, i, j, o = {}) {
  const n = o.rejilla || IMPOSTOR.REJILLA, p = o.porLado || IMPOSTOR.POR_LADO, paso = 1 / (p * n);
  const u0 = ((k % p) * n + i) * paso, v0 = (Math.floor(k / p) * n + j) * paso;
  return [u0, v0, u0 + paso, v0 + paso];
}

/** La misma celda en píxeles del FICHERO de imagen (fila 0 = la de arriba), para un atlas de `lado` píxeles */
export function celdaPixeles(k, i, j, lado, o = {}) {
  const [u0, , u1, v1] = celdaUV(k, i, j, o);
  return { x: Math.round(u0 * lado), y: Math.round((1 - v1) * lado), w: Math.round((u1 - u0) * lado) };
}

/**
 * Lo que decide un atlas además de sus píxeles (contrato §4): de esto sale la `clave` de la fila del manifiesto, con la que el hornero sabe si
 * ya lo tiene sin abrir Chrome. o: { epoca, fuentes: [huella de la receta E2 de cada variante, en el orden del atlas], three, chrome, pagina }.
 */
export function claveImpostor(o) {
  return JSON.stringify({ formato: IMPOSTOR.FORMATO, rejilla: IMPOSTOR.REJILLA, vista: IMPOSTOR.VISTA, vista_normal: IMPOSTOR.VISTA_NORMAL, super: IMPOSTOR.SUPER,
    margen: IMPOSTOR.MARGEN, nivel: IMPOSTOR.NIVEL, oclusion_min: IMPOSTOR.OCLUSION_MIN, epoca: o.epoca, fuentes: o.fuentes, three: o.three, chrome: o.chrome || null, pagina: o.pagina || null });
}

const HEX32 = /^[0-9a-f]{32}$/;
/** Lo que el esquema no dice de una fila de `impostores[]` (y lo que dice, por si se usa sin ajv). Devuelve [] o la lista de fallos */
export function validaFilaImpostor(f) {
  const e = [];
  if (!f || typeof f !== "object") return ["fila ilegible"];
  if (f.formato !== IMPOSTOR.FORMATO) e.push("formato " + f.formato);
  if (f.rejilla !== IMPOSTOR.REJILLA || f.vista !== IMPOSTOR.VISTA || f.vista_normal !== IMPOSTOR.VISTA_NORMAL) e.push("rejilla o vista distintas de las del formato");
  for (const k of ["color", "normales"]) {
    const a = f[k];
    if (!a || !HEX32.test(a.huella) || !(a.bytes > 0)) { e.push(k + " sin huella o bytes"); continue; }
    if (a.lado !== (k === "color" ? IMPOSTOR.LADO : IMPOSTOR.LADO_NORMAL)) e.push(k + ": lado " + a.lado);
  }
  if (!Array.isArray(f.variantes) || !f.variantes.length || f.variantes.length > IMPOSTOR.POR_LADO * IMPOSTOR.POR_LADO) e.push("variantes: de 1 a " + IMPOSTOR.POR_LADO * IMPOSTOR.POR_LADO);
  else f.variantes.forEach((v, k) => {
    if (v.celda !== k) e.push("variante " + k + ": celda " + v.celda);
    if (!HEX32.test(v.fuente || "")) e.push("variante " + k + ": fuente sin huella");
    const c = v.caja;
    if (!Array.isArray(c) || c.length !== 2 || c.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => typeof x !== "number"))) e.push("variante " + k + ": caja");
    else if (c[0].some((x, i) => x > c[1][i])) e.push("variante " + k + ": caja al revés");
    if (!Array.isArray(v.centro) || v.centro.length !== 3 || !(v.semilado > 0)) e.push("variante " + k + ": centro o semilado");
  });
  return e;
}
