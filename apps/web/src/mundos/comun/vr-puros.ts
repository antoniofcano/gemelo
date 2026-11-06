// Lo puro de la VR (MU5-n, A3-6c; antes los trozos [puro] de apps/web/motor/29_vr.js): sin THREE ni DOM. Movido tal cual; lo prueban en Node los guardianes de siempre
// (vr_confort, topes_vr, vr_capas, vr_gente, vr_sessiongranted), que ahora lo toman de Mundos en vez de evaluar el trozo del fichero, y en Vitest vr.test.ts.
import type { T } from "./tipos.ts";

// [puro:fichas:inicio] (sin THREE ni DOM: lo evalúan en Node pruebas/guardianes/topes_vr.test.js, vr_capas.test.js y vr_confort.test.js)
// Q9: el confort anti-mareo, en funciones puras (probadas en Node: pruebas/guardianes/vr_confort.test.js). Fuentes en doc/sistema/VR.md («Confort anti-mareo»).
// VEL: m/s a pie y volando (a velocidad humana: andar 1,4 y trotar 3,0; antes 1,7 y 4,3). vineta(v, intens, giro): cuánto se cierra la viñeta (0-1) según la
// VELOCIDAD REAL (más rápido, más cerrada; «fuerte» la cierra más) y la abertura del centro; durante un giro o un salto se mantiene un mínimo. rampa: sube la
// velocidad en ~0,15 s (sin aceleración brusca) y frena de golpe (soltar la palanca para en seco, que es lo cómodo).
export var VrConfortPuro = (function () {
  var VEL = { anda: 1.4, corre: 3.0, vuela: 8, vuelaRapido: 20 }, PUNTOS = [[0, 0], [1.4, 0.3], [3, 0.5], [8, 0.68], [20, 0.82]] as [number, number][], INTENS: Record<string, number> = { suave: 1, fuerte: 1.4 }, MIN_SALTO = 0.4, SUBE_S = 0.15;
  function vineta(v: number, intens: string, salto?: boolean) {
    var m = INTENS[intens] || 1, x = Math.max(0, Math.abs(v) || 0), k = PUNTOS[PUNTOS.length - 1]![1];
    for (var i = 1; i < PUNTOS.length; i++) if (x <= PUNTOS[i]![0]) { var a = PUNTOS[i - 1]!, b = PUNTOS[i]!; k = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); break; }
    if (salto) k = Math.max(k, MIN_SALTO);
    k = Math.min(0.95, k * m);
    return { k: k, abre: 0.40 - 0.18 * k };   // k: opacidad en el borde; abre: radio (0-1) donde empieza a oscurecer: se cierra al subir k
  }
  function rampa(f: number, obj: number, dt: number) { return obj <= f ? obj : Math.min(obj, f + dt / SUBE_S); }   // f y obj en [0, 1]
  function sigue(k: number, obj: number, dt: number) { return k + (obj - k) * Math.min(1, dt * (obj > k ? 10 : 4)); }   // la viñeta cierra rápido (0,1 s) y abre despacio (0,25 s)
  return { VEL: VEL, vineta: vineta, rampa: rampa, sigue: sigue, SUBE_S: SUBE_S };
})();

// EV2-A0: las medidas de las tres láminas que siguen a la cabeza (las de siempre, sin ?ui=capas), en UN sitio: de aquí las crea creaLamina, las coloca
// vrSigue y las comprueba en Node pruebas/guardianes/topes_vr.test.js contra los topes de 02d_laminas.js. W × H px del lienzo, pw × ph m, dist y bajo (m, delante
// y por debajo de los ojos: la distancia de verdad es la hipotenusa) y el interlineado (px) de cada clase de texto. botonesB(acciones, W, H): dónde caen
// los botones de la ficha de la baliza (las acciones a la izquierda, en 470 px, y «Cerrar» a la derecha); HUECO_B = 16 px (12,9 mm a 0,8 mm/px; antes 12 px
// = 9,7 mm, por debajo de los 12 mm del tope).
export interface MedidaLamina { W: number; H: number; pw: number; ph: number; dist: number; bajo: number; lineas?: Record<string, number> }
export var VrFichaPuro = (function () {
  var MEDIDAS = {
    panel: { W: 1024, H: 1088, pw: 1.0, ph: 1.0625, dist: 1.05, bajo: -0.2 } as MedidaLamina,
    ficha: { W: 768, H: 256, pw: 0.62, ph: 0.206, dist: 0.95, bajo: -0.38, lineas: { cuerpo: 32 } } as MedidaLamina,
    fichaB: { W: 768, H: 480, pw: 0.62, ph: 0.3875, dist: 0.95, bajo: -0.42, lineas: { destacado: 32, cuerpo: 30, pie: 22 } } as MedidaLamina
  }, HUECO_B = 16;
  function botonesB(acciones: T[], W: number, H: number) {
    var ac = acciones || [], n = Math.max(1, ac.length), wa = (470 - (n - 1) * HUECO_B) / n, B: T[] = [];
    ac.forEach(function (a: T, k: number) { B.push({ id: a.id, x: 26 + k * (wa + HUECO_B), y: H - 92, w: wa, h: 72, txt: a.txt, prim: k === 0 }); });
    B.push({ id: "bce", x: 516, y: H - 92, w: 226, h: 72, txt: "Cerrar", cerrar: true });
    return B;
  }
  function distancia(m: MedidaLamina) { return Math.hypot(m.dist, m.bajo); }
  function mmPorPx(m: MedidaLamina) { return m.pw * 1000 / m.W; }
  // EV2-A2 (?ui=capas): el panel nace delante y se queda en el mundo. queda({ ini, salto, d, quieto }) → "nace" (ponerlo delante otra vez) | "queda" |
  // "espera" (hubo un salto en este fotograma: la cabeza del mundo aún es la de antes, así que nace en el siguiente).
  // Nace al abrirlo (Y), tras un salto (teletransporte, parcela, llegar junto a alguien, mirador) y si te has alejado más de ALCANCE m (el rayo
  // apunta bien entre 0,8 y 3 m: guía de Meta) y ya estás quieto; mientras andas, no se mueve. gira(px, pz, hx, hz, a): el panel girado a radianes en
  // torno a la cabeza, como gira el rig en un giro por saltos (así el giro no lo deja atrás).
  var ALCANCE = 2.5;
  function queda(o: { ini: boolean; salto: boolean; d: number; quieto: boolean }) { return o.salto ? "espera" : !o.ini || (o.d > ALCANCE && o.quieto) ? "nace" : "queda"; }
  function gira(px: number, pz: number, hx: number, hz: number, a: number) { var x = px - hx, z = pz - hz, c = Math.cos(a), s = Math.sin(a); return { x: hx + x * c + z * s, z: hz - x * s + z * c }; }
  return { MEDIDAS: MEDIDAS, HUECO_B: HUECO_B, ALCANCE: ALCANCE, botonesB: botonesB, distancia: distancia, mmPorPx: mmPorPx, queda: queda, gira: gira };
})();

// [puro:fichas:fin]

// [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/vr_gente.test.js)
// I5: la sección Gente del panel (las más cercanas arriba, con «Ir con»). Lo prueba en Node pruebas/guardianes/vr_gente.test.js.
export interface PuntoGente { id: string; alias?: string; x: number; y: number; modo?: number }
export interface FilaGente { id: string; alias: string; modo: string; d: number; dist: string }
export interface Gente { activo: boolean; n: number; filas: FilaGente[]; resto: number }
export var VrGentePuro = (function () {
  var MODOS = ["a pie", "en quad", "con el dron"];
  // la distancia como se lee en el panel: por metros hasta 20 m, de 5 en 5 hasta 100, de 10 en 10 hasta 1 km y luego en km con un decimal
  // (así el panel no se repinta cada vez que alguien da un paso lejos)
  function distTxt(m: number) {
    if (!(m >= 0)) return "–";
    if (m < 20) return Math.round(m) + " m";
    if (m < 100) return Math.round(m / 5) * 5 + " m";
    if (m < 995) return Math.round(m / 10) * 10 + " m";
    return (Math.round(m / 100) / 10).toFixed(1).replace(".", ",") + " km";
  }
  // puntos: [{id, alias, x este, y norte, modo 0|1|2}] o null (sin presencia); desde = {x, y}; max filas. Devuelve
  // { activo, n (cuántos se ven), filas: [{id, alias, modo (texto), d (m), dist (texto)}] (las max más cercanas), resto (las que no caben) }
  function filas(puntos: PuntoGente[] | null, desde: { x: number; y: number }, max: number): Gente {
    if (!puntos) return { activo: false, n: 0, filas: [], resto: 0 };
    var l = puntos.map(function (p) { var d = Math.hypot(p.x - desde.x, p.y - desde.y); return { id: p.id, alias: String(p.alias || "Visitante"), modo: MODOS[(p.modo as number) | 0] || MODOS[0]!, d: d, dist: distTxt(d) }; });
    l.sort(function (a, b) { return a.d - b.d || (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0); });
    return { activo: true, n: l.length, filas: l.slice(0, max), resto: Math.max(0, l.length - max) };
  }
  // lo que se ve de la sección: si cambia, se repinta el panel (y solo entonces: subir la textura del panel cuesta)
  function firma(g: Gente) { return (g.activo ? "1" : "0") + g.n + ":" + g.filas.map(function (f) { return f.id + "|" + f.alias + "|" + f.modo + "|" + f.dist; }).join(";"); }
  return { distTxt: distTxt, filas: filas, firma: firma, MODOS: MODOS };
})();

// [puro:fin]

// ----- 8) Q2c: entrar en VR sin pulsar, SOLO con ?mide o ?debug (medidas automáticas desde adb, doc/sistema/IWSDK.md §2.2-B). Lo prueba en Node pruebas/guardianes/vr_sessiongranted.test.js.
// [puro:inicio] (sin THREE ni DOM)
export var VrConcedidaPuro = (function () {
  function pideMedir(busqueda: string) { return /[?&](mide|debug)\b/.test(String(busqueda || "")); }   // ?mide, ?mide=60, ?debug (o varios)
  // e = { busqueda, xr (¿hay navigator.xr?), on (¿sesión abierta?), entrando, soporta (¿ofrece immersive-vr?) } → ¿hay que pedir la sesión ya?
  function decide(e: { busqueda: string; xr: boolean; on: boolean; entrando: boolean; soporta: boolean } | null) { return !!(e && e.xr && e.soporta && pideMedir(e.busqueda) && !e.on && !e.entrando); }
  return { pideMedir: pideMedir, decide: decide };
})();
// [puro:fin]
