// AG-2.2: las cartulinas de los olivos generados (07ab_generados.js) con ?cartulina=silueta, en Node (contexto vm con three 0.186.1 y el constructor real).
// En Node no hay lienzo 2D (las texturas de hoja salen null), así que se ponen a los materiales unas texturas sintéticas con sus «mipmaps» (lo que
// lee el motor: texture.mipmaps como ImageData) y se comprueba que la cola propia calcula las siluetas antes del primer lote, con los triángulos y el
// área de cada cartulina, que las uv siguen dentro de las celdas y que con ?cartulina=rect (defecto) no se calcula nada.
// Escribe una línea JSON {mal: [...], piezas} (la lee pruebas/guardianes/cartulinas.test.js).
import { createRequire } from "node:module";
import path from "node:path";
import { RAIZ, THREE, contexto, espera } from "./_contexto_generados.mjs";

const req = createRequire(import.meta.url), { fabrica } = req(path.join(RAIZ, "pruebas", "guardianes", "_materiales.js"));
const mal = [], exige = (c, m) => { if (!c) mal.push(m); };
const D = { copas: [[0, 0, 5, [1, 1, 1, 1, 1, 1, 1, 1]]], copas_param: [null], copas_id: [7], centro_utm: [0, 0] };

// una textura de w × h con un disco opaco (radio 0,35 del lado menor) en cada celda de cols × filas: lo que se espera es un hexágono por celda
function textura(w, h, cols, filas) {
  const d = new Uint8ClampedArray(w * h * 4), cw = w / cols, ch = h / filas, r = 0.35 * Math.min(cw, ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (Math.floor(x / cw) + 0.5) * cw, cy = (Math.floor(y / ch) + 0.5) * ch;
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r) d[(y * w + x) * 4 + 3] = 255;
  }
  return { mipmaps: [{ data: d, width: w, height: h }] };
}

async function arranca(q) {
  const c = contexto(q, null, { D, Materiales: fabrica(THREE, { busqueda: q }).Materiales });
  for (let k = 0; k < 40 && c.__G.estado() === "cargando"; k++) await espera();
  return c;
}

// ---- con silueta
{
  const c = await arranca("?olivos=gen&cartulina=silueta");
  exige(c.__G.estado() === "activo", "no arrancó: " + c.__G.estado());
  exige(c.__G._prueba.silPend() === true, "con silueta, las siluetas no quedan pendientes al arrancar");
  const m = c.__G._prueba.mats();
  m.ramita0.map = textura(256, 512, 1, 1); m.ramita1.map = textura(256, 512, 1, 1); m.relleno.map = textura(512, 512, 1, 1); m.tarjeta.map = textura(1024, 512, 4, 2);
  for (let k = 0; k < 50 && c.__G._prueba.silPend(); k++) c.__G.paso(0.016, 50);
  exige(!c.__G._prueba.silPend(), "las siluetas no acaban");
  const S = c.__G._prueba.siluetas() || {}, P = c.Materiales.cartulina.piezas;
  const esperados = { ramita0: [2, 4], ramita1: [2, 4], relleno: [2, 4], tarjeta: [6, 12], tarjetaO: [6, 12] };
  for (const [k, [rect, sil]] of Object.entries(esperados)) {
    exige(S[k] && S[k].triangulos === sil, k + ": triángulos " + (S[k] && S[k].triangulos) + " (esperados " + sil + ")");
    exige(S[k] && S[k].extra === sil - rect, k + ": extra " + (S[k] && S[k].extra));
    const p = P["gen-" + k]; exige(p && p.area < 0.75 && p.area > 0.15 && p.triangulosRect === rect, k + ": lo apuntado " + JSON.stringify(p));
    if (S[k]) { const uv = S[k].atrib.uv; for (let i = 0; i < uv.length; i++) if (uv[i] < 0 || uv[i] > 1) { mal.push(k + ": uv fuera de [0, 1]"); break; } }
  }
  // las tarjetas: cada plano dentro de su celda del atlas (columna 0-2, fila 0 o 1)
  for (const [k, f] of [["tarjeta", 0], ["tarjetaO", 1]]) {
    const uv = S[k] ? S[k].atrib.uv : [];
    for (let i = 0; i < uv.length; i += 2) { const v = uv[i + 1]; if (f === 0 ? v < 0.5 - 1e-6 : v > 0.5 + 1e-6) { mal.push(k + ": uv fuera de su fila del atlas"); break; } }
  }
}
// ---- con rect (defecto): nada
{
  const c = await arranca("?olivos=gen");
  exige(c.__G.estado() === "activo", "rect: no arrancó");
  exige(c.__G._prueba.silPend() === false && c.__G._prueba.siluetas() === null, "con rect (defecto) se calculan siluetas");
  exige(Object.keys(c.Materiales.cartulina.piezas).length === 0, "con rect se apuntan cartulinas");
}
console.log(JSON.stringify({ mal }));
