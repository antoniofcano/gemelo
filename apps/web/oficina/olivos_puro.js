// Olivos (OF7): las cuentas de la sección, sin DOM ni red, para probarlas con node. Los parámetros de la escalera con sus límites (los de
// contratos/config.schema.json y de ConfigPuro.LIMITES del motor: pruebas/guardianes/oficina_olivos.test.js comprueba que son los mismos,
// porque el motor es una IIFE concatenada y la oficina no puede importarla), la validación IGUAL que la de la api (apps/api/src/config/valida.ts),
// el paso entre los valores de la pantalla y el bloque «escalera» / «componentes» del contrato, y la vista previa SIMULADA (ilustrativa: no mide nada).

/** Los tres escalones de gafas (perfiles VR 0 a 3): su máximo es el de hoy (VR_PERFILES[].tri de 29_vr.js); desde la oficina solo bajan. */
export const GAFAS_MAX = [380000, 270000, 190000, 130000];
export const GAFAS_MIN = 50000;

/**
 * Cada parámetro: clave de pantalla, ruta en el contrato, límites [mín, máx], paso del deslizador, valor de hoy (`def`; null = «sin valor propio»),
 * si es entero en el contrato (`entero`), unidad, cuánto se multiplica para mostrarlo (`ver`), grupo y ayuda.
 */
export const PARAMS = [
  { k: "u0", ruta: "escalera.umbralesPx.e0", n: "Umbral E0", u: "px", def: 700, min: 300, max: 2000, paso: 10, g: "umbrales", ayuda: "un olivo que ocupa más alto que esto va en E0" },
  { k: "u1", ruta: "escalera.umbralesPx.e1", n: "Umbral E1", u: "px", def: 250, min: 100, max: 1000, paso: 10, g: "umbrales", ayuda: "entre E1 y E0" },
  { k: "u2", ruta: "escalera.umbralesPx.e2", n: "Umbral E2", u: "px", def: 90, min: 30, max: 400, paso: 5, g: "umbrales", ayuda: "por debajo, el olivo lejano (E2-VR en gafas)" },
  { k: "banda", ruta: "escalera.bandaM", n: "Banda de fundido", u: "± m", def: 1.5, min: 0, max: 3, paso: 0.1, g: "umbrales", ayuda: "el paso entre escalones es continuo en esta anchura" },
  { k: "hist", ruta: "escalera.histeresis", n: "Histéresis", u: "%", def: 0.08, min: 0.03, max: 0.2, paso: 0.01, ver: 100, g: "umbrales", ayuda: "margen para salir de la banda (al menos 0,4 m, fijo)" },
  { k: "maxP", entero: true, ruta: "escalera.maxPropios", n: "Máx. olivos propios (E0/E1)", u: "", def: 6, min: 1, max: 8, paso: 1, g: "presupuesto", ayuda: "los que calcula el aparato (escritorio y móvil)" },
  { k: "maxPG", entero: true, ruta: "escalera.maxPropiosGafas", n: "Máx. propios en gafas", u: "", def: null, min: 1, max: 4, paso: 1, g: "presupuesto", ayuda: "sin valor propio, las gafas usan el de escritorio" },
  { k: "maxV", entero: true, ruta: "escalera.maxVariantes", n: "Máx. variantes (E2)", u: "", def: 48, min: 0, max: 64, paso: 1, g: "presupuesto", ayuda: "olivos E2 horneados a la vez" },
  { k: "triEsc", entero: true, ruta: "escalera.triangulos.escritorio", n: "Presupuesto escritorio", u: "tri", def: 550000, min: 300000, max: 700000, paso: 10000, g: "presupuesto", ayuda: "triángulos para la escalera" },
  { k: "triMovil", entero: true, ruta: "escalera.triangulos.movil", n: "Presupuesto móvil", u: "tri", def: 270000, min: 120000, max: 300000, paso: 10000, g: "presupuesto", ayuda: "sin medir en un móvil real" },
  ...GAFAS_MAX.map((m, i) => ({ k: "triG" + i, entero: true, ruta: "escalera.triangulos.gafas." + i, n: "Presupuesto gafas, perfil " + i, u: "tri", def: m, min: GAFAS_MIN, max: m, paso: 10000, g: "gafas",
    ayuda: i === 0 ? "solo puede BAJAR: el máximo es el de hoy; subirlo exige medirlo en el casco (O9d) y un cambio de código" : "solo puede bajar; el máximo es el de hoy" })),
  { k: "frE0", ruta: "escalera.fraccionE0Gafas", n: "Parte de E0 en gafas", u: "", def: 0.4, min: 0, max: 0.5, paso: 0.05, g: "gafas", ayuda: "fracción del presupuesto de las gafas que puede llevarse el E0" },
  { k: "factor", ruta: "escalera.factorCopa", n: "Factor de copa", u: "× r8", def: 1, min: 0.5, max: 1.5, paso: 0.05, g: "forma", ayuda: "copa = 2 × r8 × factor, solo en los olivos del constructor (decisiones 48 y 81)" },
];
export const GRUPOS = [["umbrales", "Cuándo cambia de escalón (alto del olivo en pantalla)"], ["presupuesto", "Cuántos y cuánto cuesta"], ["gafas", "Gafas (solo a la baja)"], ["forma", "Forma"]];
export const PARAM = Object.fromEntries(PARAMS.map(p => [p.k, p]));

/** Los interruptores de componentes que el motor conoce hoy (id de su manifiesto → nombre y qué hace). Un id de la configuración que no esté aquí se conserva tal cual. */
export const COMPONENTES = [
  { id: "sonido-ambiente", n: "Sonido ambiente", ayuda: "pájaros, viento, agua y los efectos (Web Audio)" },
  { id: "fichas-tiempo", n: "Lámina del tiempo", ayuda: "la previsión de 72 horas sobre el mundo (tecla P)" },
  { id: "juegos", n: "Juegos", ayuda: "la ventana de juegos (tecla J)" },
  { id: "cae-la-cosecha", n: "Cae la cosecha", ayuda: "el juego de recoger aceitunas" },
];

export const APARATOS = { esc: "escritorio", movil: "móvil", gafas: "gafas" };

// ------------------------------------------------------------------ valores y contrato
export const defectos = () => Object.fromEntries(PARAMS.map(p => [p.k, p.def]));
const esObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const num = v => typeof v === "number" && isFinite(v);
const nivel = (v, p) => Math.min(p.max, Math.max(p.min, p.entero ? Math.round(v) : v));
/** Redondea a los decimales del paso (0,1 + 0,2 no da 0,30000000000000004 en la configuración). */
export const redondea = (v, p) => { const d = String(p.paso).includes(".") ? String(p.paso).split(".")[1].length : 0; return Number(v.toFixed(Math.max(d, 2))); };

function lee(o, ruta) { let v = o; for (const c of ruta.split(".")) v = v !== null && typeof v === "object" ? v[c] : undefined; return v; }

/** Lo que dice un cuerpo de configuración: los valores de la escalera (lo que falta vale lo de hoy) y el estado de cada componente (true, false o undefined = «el del manifiesto»). */
export function desdeCuerpo(cuerpo) {
  const vals = defectos(), comp = {};
  for (const p of PARAMS) {
    const v = lee(cuerpo || {}, p.ruta);
    if (num(v)) vals[p.k] = redondea(nivel(v, p), p);
  }
  const c = cuerpo && cuerpo.componentes;
  if (esObj(c)) for (const [id, x] of Object.entries(c)) if (esObj(x) && typeof x.activo === "boolean") comp[id] = x.activo;
  return { vals, comp };
}

/**
 * El cuerpo del contrato para unos valores. Solo lleva lo que se aparta de hoy (lo que falta vale lo del código): los tres umbrales o ninguno,
 * los cuatro perfiles de gafas o ninguno. `base` es el cuerpo del que se parte: sus «épocas» (OF9) y los parámetros de los componentes se conservan.
 */
export function aCuerpo(vals, comp, base) {
  const out = { v: 1 }, esc = {}, b = base || {};
  const dif = k => vals[k] !== PARAM[k].def && vals[k] !== null && vals[k] !== undefined;
  if (["u0", "u1", "u2"].some(dif)) esc.umbralesPx = { e0: vals.u0, e1: vals.u1, e2: vals.u2 };
  if (dif("banda")) esc.bandaM = vals.banda;
  if (dif("hist")) esc.histeresis = vals.hist;
  if (dif("maxP")) esc.maxPropios = vals.maxP;
  if (dif("maxPG")) esc.maxPropiosGafas = vals.maxPG;
  if (dif("maxV")) esc.maxVariantes = vals.maxV;
  const tri = {};
  if (dif("triEsc")) tri.escritorio = vals.triEsc;
  if (dif("triMovil")) tri.movil = vals.triMovil;
  if (GAFAS_MAX.some((_, i) => dif("triG" + i))) tri.gafas = GAFAS_MAX.map((_, i) => vals["triG" + i]);
  if (Object.keys(tri).length) esc.triangulos = tri;
  if (dif("frE0")) esc.fraccionE0Gafas = vals.frE0;
  if (dif("factor")) esc.factorCopa = vals.factor;
  const cm = {}, bc = esObj(b.componentes) ? b.componentes : {};
  for (const [id, activo] of Object.entries(comp || {})) {
    if (typeof activo !== "boolean") continue;
    cm[id] = { activo }; if (esObj(bc[id]) && esObj(bc[id].parametros)) cm[id].parametros = bc[id].parametros;
  }
  for (const [id, x] of Object.entries(bc)) if (!(id in (comp || {})) && esObj(x) && esObj(x.parametros) && x.activo !== undefined) cm[id] = x;   // un id que la pantalla no toca
  if (Object.keys(cm).length) out.componentes = cm;
  if (Object.keys(esc).length) out.escalera = esc;
  if (esObj(b.epocas)) out.epocas = b.epocas;
  return out;
}

export const mismosValores = (a, b) => PARAMS.every(p => a[p.k] === b[p.k]);
export function mismosComp(a, b) {
  const ks = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...ks].every(k => (a || {})[k] === (b || {})[k]);
}
/** Las claves de los parámetros que se apartan de `ref`. */
export const cambios = (vals, ref) => PARAMS.filter(p => vals[p.k] !== ref[p.k]).map(p => p.k);
export function cambiosComp(comp, ref) {
  const ks = new Set([...Object.keys(comp || {}), ...Object.keys(ref || {})]);
  return [...ks].filter(k => (comp || {})[k] !== (ref || {})[k]).sort();
}

// ------------------------------------------------------------------ formato
const miles = t => t.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function numero(v, dec) { const [e, d] = Math.abs(v).toFixed(dec || 0).split("."); return (v < 0 ? "-" : "") + miles(e) + (d ? "," + d : ""); }
export function formatea(k, v) {
  const p = PARAM[k];
  if (v === null || v === undefined) return "como escritorio";
  if (p.u === "tri") return numero(v / 1000) + " k";
  if (p.ver) return numero(v * p.ver) + " " + p.u;
  const dec = p.paso < 1 ? (p.paso < 0.1 ? 2 : 1) : 0;
  return numero(v, dec) + (p.u ? " " + p.u : "");
}
/** «Qué cambió» de una versión respecto a lo de hoy, en una línea. */
export function resumen(vals, comp) {
  const d = defectos(), t = PARAMS.filter(p => vals[p.k] !== d[p.k] && vals[p.k] !== null).map(p => p.n.toLowerCase() + " " + formatea(p.k, vals[p.k]));
  for (const id of Object.keys(comp || {}).sort()) t.push((COMPONENTES.find(c => c.id === id) || { n: id }).n.toLowerCase() + (comp[id] ? " encendido" : " apagado"));
  return t.join(" · ") || "todo por defecto";
}

// ------------------------------------------------------------------ validación (la misma que la de la api: valida.ts)
/** [{ nivel: "mal", texto }]: los límites, los máximos de gafas, e1 ≤ e0 / 1,5 y e2 ≤ e1 / 1,5. Vacía si la api lo aceptaría. */
export function valida(vals) {
  const m = [];
  for (const p of PARAMS) {
    const v = vals[p.k];
    if (v === null && p.def === null) continue;
    if (!num(v)) { m.push({ nivel: "mal", texto: p.n + ": no es un número" }); continue; }
    if (v < p.min || v > p.max) m.push({ nivel: "mal", texto: p.n + ": fuera de límites (" + formatea(p.k, p.min) + " a " + formatea(p.k, p.max) + ")" + (p.g === "gafas" && p.max < 700000 && v > p.max ? ": en gafas solo puede bajar" : "") });
    else if (p.entero && !Number.isInteger(v)) m.push({ nivel: "mal", texto: p.n + ": tiene que ser un número entero" });
  }
  if (vals.u1 > vals.u0 / 1.5) m.push({ nivel: "mal", texto: "E1 debe ser ≤ E0 ÷ 1,5 (" + numero(vals.u0 / 1.5) + " px)" });
  if (vals.u2 > vals.u1 / 1.5) m.push({ nivel: "mal", texto: "E2 debe ser ≤ E1 ÷ 1,5 (" + numero(vals.u1 / 1.5) + " px)" });
  return m;
}

// ------------------------------------------------------------------ vista previa simulada (ilustrativa: no mide nada)
// Una rejilla de olivos de 7 m alrededor de quien pasea, cada uno en el escalón que le tocaría por su alto en pantalla, y el factor `s` con el que el
// aparato acerca todas las fronteras a la vez hasta que cabe en el presupuesto. Las cifras de triángulos por escalón son las del fixture (ADR-0022).
export const TRI = { E0: 67356, E1: 31842, E2: 11678, E2VR: 9242, L: 2 };
export const APAR = {
  esc: { n: "escritorio", kPx: 1080 / (2 * Math.tan(21 * Math.PI / 180)) },
  movil: { n: "móvil", kPx: 800 / (2 * Math.tan(21 * Math.PI / 180)) },
  gafas: { n: "gafas", kPx: 1832 / (2 * Math.tan(48 * Math.PI / 180)) },
};
export const semilla = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const CAMPO = (() => {
  const r = semilla(3), out = [];
  for (let y = -84; y <= 84; y += 7) for (let x = -84; x <= 84; x += 7) { if (r() < 0.04) continue; out.push({ x: x + 3.5 + (r() - 0.5) * 0.8, y: y + (r() - 0.5) * 0.8, h: 3.2 + r() * 1.6, r8: 1.8 + r() * 0.7 }); }
  return out;
})();

/** `perfil`: el perfil de gafas (0 a 3) cuyo presupuesto se simula. Devuelve { s, n: [E0, E1, E2, lejanos], tri, tope, lv, kPx, maxP }. */
export function simula(V, aparato, perfil) {
  const A = APAR[aparato], vr = aparato === "gafas", tope = vr ? V["triG" + (perfil || 0)] : aparato === "movil" ? V.triMovil : V.triEsc;
  const U = [V.u0, V.u1, V.u2], maxP = vr ? (V.maxPG === null || V.maxPG === undefined ? Math.min(V.maxP, 4) : V.maxPG) : V.maxP;
  let s = 1, res;
  for (let it = 0; it < 400; it++) {
    const n = [0, 0, 0, 0]; let tri = 0, e0tri = 0;
    res = CAMPO.map(t => {
      const d = Math.max(0.5, Math.hypot(t.x, t.y)), px = t.h * A.kPx / (d * s);
      let l = px >= U[0] ? 0 : px >= U[1] ? 1 : px >= U[2] ? 2 : 3;
      if (l === 0 && vr && e0tri + TRI.E0 > V.frE0 * tope) l = 1;
      if (l === 0) e0tri += TRI.E0;
      n[l]++; tri += l === 0 ? TRI.E0 : l === 1 ? TRI.E1 : l === 2 ? (vr ? TRI.E2VR : TRI.E2) : TRI.L;
      return l;
    });
    if ((n[0] + n[1] <= maxP && n[2] <= V.maxV && tri <= tope) || s >= 64) return { s, n, tri, tope, lv: res, kPx: A.kPx, maxP };
    s *= 1.02;
  }
  return { s, n: [0, 0, 0, 0], tri: 0, tope, lv: res, kPx: A.kPx, maxP };
}

/** Los avisos de la vista previa (además de los de validación). */
export function avisosPrevia(R, aparato) {
  const m = [], nom = APAR[aparato].n;
  if (R.s > 1.01) m.push({ nivel: "av", texto: "El presupuesto no da con estos umbrales: el aparato acerca todas las fronteras a la vez (s = " + numero(R.s, 2) + "). Es lo normal de cerca; con s > 4 algo está muy por encima de lo que cabe." });
  if (R.s > 4) m.push({ nivel: "mal", texto: "s = " + numero(R.s, 2) + ": los umbrales piden mucho más de lo que cabe en " + nom });
  if (R.n[0] + R.n[1] > R.maxP) m.push({ nivel: "av", texto: "Más propios de los que caben (" + R.maxP + ")" });
  return m;
}

// ------------------------------------------------------------------ historial
export const ESTADOS = { borrador: ["p-suave", "borrador"], en_prueba: ["p-info", "en prueba"], publicada: ["p-ok", "publicada"], retirada: ["p-suave", "retirada"] };
/** Qué se puede hacer con una versión del historial. «Volver» no vale para un borrador (la api lo rechaza) ni para la publicada. */
export const acciones = estado => ({ volver: estado === "en_prueba" || estado === "retirada", alBorrador: true, retirar: estado === "borrador" || estado === "en_prueba" });
