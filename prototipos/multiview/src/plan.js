// Lo puro de la página de humo (sin THREE ni DOM; lo prueba pruebas/guardianes/humo_multiview.test.js en Node):
//   lee(busqueda)  los parámetros de la URL, con sus valores por defecto y sus límites
//   reparto(n, tri) cuántos objetos de cada clase y con cuántos triángulos, para que la escena dé n llamadas y ~tri triángulos POR OJO
// La escena imita la del gemelo en VR (doc/sistema/MEDIDAS.md: 83-150 llamadas por ojo; materiales Lambert y Standard, InstancedMesh para los
// olivos, sombreadores propios): un suelo grande (1 llamada, ~25 % de los triángulos), unos pocos InstancedMesh (5 % de las llamadas, ~25 %),
// mallas con sombreador propio (10 %) y el resto Lambert (70 %) y Standard (30 %). Es ILUSTRATIVA: sin datos de la finca (el repo es público).

export const MODOS = ["clasico", "super", "nuevo"];
export const TRI_ICO = 80;   // IcosahedronGeometry(r, 1), sin índice: 20 caras × 4

function entero(v, por, min, max) { const x = Math.round(Number(v)); return v == null || v === "" || !isFinite(x) ? por : Math.max(min, Math.min(max, x)); }
function real(v, por, min, max) { const x = Number(v); return v == null || v === "" || !isFinite(x) ? por : Math.max(min, Math.min(max, x)); }
function bit(v, por) { return v == null || v === "" ? por : !(v === "0" || v === "no" || v === "false"); }

export function lee(busqueda, modoBuild) {
  const q = new URLSearchParams(typeof busqueda === "string" ? busqueda : "");
  const modo = MODOS.includes(modoBuild) ? modoBuild : MODOS.includes(q.get("modo")) ? q.get("modo") : "clasico";
  return {
    modo,
    n: entero(q.get("n"), 200, 10, 2000),               // llamadas de dibujo por ojo (los casos: 100, 200, 400)
    tri: entero(q.get("tri"), 200000, 1000, 2000000),   // triángulos por ojo (el gemelo en VR: ~150-300 k)
    msaa: bit(q.get("msaa"), true),                    // antialias del contexto (y samples de la capa XR)
    mv: modo === "clasico" ? false : bit(q.get("mv"), true),   // multiview: en clasico no existe; en super y nuevo, &mv=0 lo apaga
    directo: modo === "nuevo" ? bit(q.get("directo"), true) : false,   // nuevo: DirectRenderPipeline (sin la pasada de salida intermedia)
    escala: real(q.get("escala"), 0.9, 0.5, 1.5),       // setFramebufferScaleFactor (el gemelo: 0,9, Q0b)
    fov: real(q.get("fov"), 1, 0, 1),                   // setFoveation (el gemelo: 1)
    seg: entero(q.get("seg"), 60, 5, 600),              // duración de la medida, en s
    calent: entero(q.get("calent"), 3, 0, 60),          // calentamiento, en s
  };
}

/** Triángulos de SphereGeometry(r, w, h) de three: 2·w·(h−1) (los casquetes llevan un triángulo por segmento) */
export function triEsfera(w, h) { return 2 * w * (h - 1); }

export function reparto(n, tri) {
  n = Math.max(10, n | 0); tri = Math.max(1000, tri | 0);
  const segSuelo = Math.max(8, Math.round(Math.sqrt(tri * 0.25 / 2)));
  const triSuelo = 2 * segSuelo * segSuelo;
  const inst = Math.max(1, Math.round(n * 0.05));
  const porInst = Math.max(1, Math.round(tri * 0.25 / (inst * TRI_ICO)));
  const triInst = inst * porInst * TRI_ICO;
  const sombreador = Math.max(1, Math.round(n * 0.10));
  const resto = n - 1 - inst - sombreador;
  const lambert = Math.round(resto * 0.7), standard = resto - lambert;
  const mallas = sombreador + resto;
  // cada esfera con w segmentos y h = w/2: w(w−2) triángulos; w par y ≥ 6
  const objetivo = Math.max(24, (tri - triSuelo - triInst) / mallas);
  let w = Math.max(6, 2 * Math.round((1 + Math.sqrt(1 + objetivo)) / 2));
  const h = w / 2, triMalla = triEsfera(w, h);
  return {
    n, tri,
    suelo: { seg: segSuelo, tri: triSuelo },
    instanciados: { mallas: inst, porMalla: porInst, tri: triInst },
    esfera: { w, h, tri: triMalla },
    sombreador, lambert, standard,
    llamadas: 1 + inst + sombreador + lambert + standard,
    triangulos: triSuelo + triInst + mallas * triMalla,
  };
}
