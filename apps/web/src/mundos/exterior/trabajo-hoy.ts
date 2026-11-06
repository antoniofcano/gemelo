// El trabajo de hoy (F4b, W1; MU5-n, A3-5: antes apps/web/motor/54_trabajo_hoy.js, que queda como talón): un tractor de juguete en la haza que OlivarTrack dice que tiene una tarea en
// curso. DEDUCIDO (regla 5): lo único que se sabe es «en esta parcela hay una tarea abierta»; no se sabe quién, cuántas personas, a qué hora, ni dónde dentro de la haza. NADA POR
// PERSONA: no se pinta gente, ni números de trabajadores, ni nombres; un tractor por haza con tarea, siempre el mismo sitio (el centro de la haza) y el mismo aspecto. El tractor es
// ILUSTRATIVO (una silueta de cajas, a escala doble para verse), y su sitio es el de la haza, no una posición medida.
// De dónde sale el dato: del evento «mundo:hoy» que emite 53_mundo_hoy.js tras leer /api/mundo/hoy (trabajoSemana.porParcela: solo las parcelas con tareas EN CURSO y solo si la
// lectura viene completa). Este módulo no pide nada (ni un fetch: el motor solo habla con su origen) y, sin ese evento o con la lectura incompleta, no dibuja nada y no da errores.
// Si el id de la parcela no está en el índice de la finca, no se pinta (no se inventa el sitio).
// APAGADO POR DEFECTO (?trabajo=1 lo enciende): OlivarTrack está apagado en el servidor a la espera de un token propio de solo lectura.
// Presupuesto (regla 6, cifras de DISEÑO, no medidas): una InstancedMesh (1 llamada), hasta 16 tractores de 72 triángulos = 1.152 triángulos, sin texturas, sin sombras.
// Componente de los mundos ["exterior"] con un libera() que suelta de verdad: la malla, la geometría y el material (por la fábrica, con dueño «trabajo-hoy»), la entidad «trabajo» de
// Entidades y la escucha de «mundo:hoy». La ficha (al acercarse o por Usables) lleva el rótulo «deducido».
// Del legado recibe por argumento lo que necesita (THREE, la escena, las entidades, el suelo y los datos); no lee globales.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsTrabajoHoy {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  /** 02e: el registro de entidades; registra devuelve la función que quita el tipo (null si no valió) */
  Entidades: { registra(d: T3): (() => void) | null };
  /** la fábrica de materiales (MU5-n): el del tractor sale de ella, con dueño «trabajo-hoy» */
  Materiales: Materiales;
  suelo(x: number, y: number): number;
  /** Estado.exag (un campo que cambia: se lee en cada colocación) */
  Estado: { exag: number };
  /** el índice de la finca (parcelas) */
  D: T3;
}

export const ID_TRABAJO_HOY = "trabajo-hoy";

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/trabajo_hoy.test.js)
export const TrabajoHoyPuro = (function () {
  var MAX = 16, ESCALA = 2, RADIO_CERCA = 30;
  var ID = /^[\p{L}\p{N}:_.#()/-]{1,120}$/u;
  // el tractor: cajas [centro x, y, z, mitades x, y, z, color]; +z hacia delante. 6 cajas × 12 triángulos = 72
  var CAJAS = [
    [0, 0.85, 0, 0.8, 0.35, 1.5, "#2f7d32"],      // capó y cuerpo
    [0, 1.65, -0.55, 0.75, 0.55, 0.7, "#f2f2ee"],  // cabina
    [-0.95, 0.65, -0.75, 0.2, 0.65, 0.65, "#222222"], [0.95, 0.65, -0.75, 0.2, 0.65, 0.65, "#222222"],   // ruedas de atrás
    [-0.9, 0.4, 1.0, 0.15, 0.4, 0.4, "#222222"], [0.9, 0.4, 1.0, 0.15, 0.4, 0.4, "#222222"]              // ruedas de delante
  ];
  var TRI_TRACTOR = CAJAS.length * 12;
  function color(hex: any) { var k = parseInt(hex.slice(1), 16); return [(k >> 16 & 255) / 255, (k >> 8 & 255) / 255, (k & 255) / 255]; }
  // la geometría sin índice: posiciones, normales (planas) y colores (sRGB; quien dibuja decide) en Float32Array
  function geometria() {
    var CARAS: any = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], pos: number[] = [], nor: number[] = [], col: number[] = [];
    CAJAS.forEach(function (c: any) {
      var cc: any = color(c[6]);
      CARAS.forEach(function (nn: any) {
        var u: any = nn[0] ? [0, 1, 0] : [1, 0, 0], v: any = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];   // v = n × u
        var h: any = [c[3], c[4], c[5]];
        function p(a: any, b: any) { return [c[0] + nn[0] * h[0] + a * u[0] * h[0] + b * v[0] * h[0], c[1] + nn[1] * h[1] + a * u[1] * h[1] + b * v[1] * h[1], c[2] + nn[2] * h[2] + a * u[2] * h[2] + b * v[2] * h[2]]; }
        // dos triángulos por cara; antihorarios vistos desde fuera (u × v = n)
        [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (qq: any) { var pp: any = p(qq[0], qq[1]); pos.push(pp[0], pp[1], pp[2]); nor.push(nn[0], nn[1], nn[2]); col.push(cc[0], cc[1], cc[2]); });
      });
    });
    return { posicion: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col), triangulos: pos.length / 9 };
  }
  // un giro fijo por haza (de su id): el mismo siempre, sin azar
  function giro(id: any) { var h = 2166136261; for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return (h % 360) * Math.PI / 180; }
  // del payload de «mundo:hoy»: { trabajo: { parcelas: [ids], cuando } } → { ids, cuando } o null. Solo ids con la forma de OlivarTrack; sin repetidos
  function lee(d: any) {
    var t = d && typeof d === "object" ? d.trabajo : null;
    if (!t || typeof t !== "object" || !Array.isArray(t.parcelas)) return null;
    var visto: any = {}, ids: any[] = [];
    t.parcelas.forEach(function (x: any) { if (typeof x === "string" && ID.test(x) && !visto[x]) { visto[x] = 1; ids.push(x); } });
    return ids.length ? { ids: ids.slice(0, MAX), cuando: typeof t.cuando === "string" ? t.cuando : null } : null;
  }
  // los sitios: solo las parcelas que el índice de la finca conoce y con centro [este, norte] válido (si no, no se pinta: no se inventa el sitio)
  function sitios(ids: any, parcelas: any) {
    var out: any[] = [];
    (ids || []).forEach(function (id: any) {
      var p = (parcelas || []).filter(function (x: any) { return x && x.id === id; })[0];
      if (!p || !Array.isArray(p.centro) || !isFinite(p.centro[0]) || !isFinite(p.centro[1])) return;
      out.push({ id: id, nombre: typeof p.nombre === "string" && p.nombre.trim() ? p.nombre.trim().slice(0, 80) : id, x: p.centro[0], y: p.centro[1], giro: giro(id) });
    });
    return out;
  }
  function coste(k: any) { return { llamadas: k > 0 ? 1 : 0, triangulos: k * TRI_TRACTOR }; }
  function dia(iso: any) { return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : null; }
  // la ficha (texto llano, nunca HTML): el rótulo «deducido» va primero; dice lo que NO se sabe
  function ficha(s: any, cuando: any) {
    var d = dia(cuando);
    return { titulo: "Trabajo hoy · " + s.nombre, destacado: "Deducido: hoy hay una tarea en curso en esta haza",
      lineas: ["OlivarTrack tiene una tarea abierta en esta parcela. No dice quién, cuántas personas ni dónde están.", "El tractor es ilustrativo y está en el centro de la haza: no es una posición medida."],
      pie: "OlivarTrack" + (d ? ", leído el " + d : "") + " · deducido" };
  }
  return { MAX: MAX, ESCALA: ESCALA, RADIO_CERCA: RADIO_CERCA, TRI_TRACTOR: TRI_TRACTOR, geometria: geometria, giro: giro, lee: lee, sitios: sitios, coste: coste, ficha: ficha };
})();
// [puro:fin]

// [motor:inicio] (lo evalúa también en Node pruebas/guardianes/trabajo_hoy.test.js con un three de verdad)
/** Monta los tractores y devuelve su api; `libera()` lo suelta todo (una sola vez). */
export function creaTrabajoHoy(d: DepsTrabajoHoy, n: ContextoComponente) {
  const THREE = d.THREE, scene = d.scene, Entidades = d.Entidades, suelo = d.suelo, Estado = d.Estado, D = d.D;
  const P = TrabajoHoyPuro;
  const materiales = d.Materiales.de(ID_TRABAJO_HOY);   // lo que cree este componente se libera con su libera()
  let vivo = true, puestos: T3[] = [], cuando: string | null = null, malla: T3 = null, geo: T3 = null, mat: T3 = null, exagHecha = -1, retira: (() => void) | null = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3(P.ESCALA, P.ESCALA, P.ESCALA);
  function idEnt(s: T3) { return "trabajo:" + s.id; }
  function de(id: string) { for (let i = 0; i < puestos.length; i++) if (idEnt(puestos[i]) === id) return puestos[i]; return null; }
  function posDe(s: T3) { return { x: s.x, y: suelo(s.x, s.y) * Estado.exag, z: -s.y }; }
  function crea() {
    const g = P.geometria();
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(g.posicion, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(g.normal, 3));
    const c = new THREE.Color(), lin = new Float32Array(g.color.length);
    for (let i = 0; i < g.color.length; i += 3) { c.setRGB(g.color[i], g.color[i + 1], g.color[i + 2], THREE.SRGBColorSpace); lin[i] = c.r; lin[i + 1] = c.g; lin[i + 2] = c.b; }   // sRGB a lineal (gestión de color de three)
    geo.setAttribute("color", new THREE.BufferAttribute(lin, 3));
    mat = materiales.estandar("MeshLambertMaterial", { vertexColors: true, flatShading: true });   // estándar: sin sombreador propio, no hay variante TSL que escribir
    malla = new THREE.InstancedMesh(geo, mat, P.MAX);
    malla.name = "trabajo de hoy (tractores, deducido)"; malla.count = 0; malla.visible = false; malla.castShadow = malla.receiveShadow = false;
    malla.raycast = function () {};   // se elige por la ficha de Entidades (cercanía), no por la malla
    scene.add(malla);
  }
  function escribe() {
    exagHecha = Estado.exag;
    if (!puestos.length) { if (malla) { malla.count = 0; malla.visible = false; } return; }
    if (!malla) crea();
    puestos.forEach(function (s: T3, i: number) {
      const p = posDe(s); pv.set(p.x, p.y, p.z); q.setFromAxisAngle(eje, s.giro);
      malla.setMatrixAt(i, m4.compose(pv, q, sv));
    });
    malla.count = puestos.length; malla.instanceMatrix.needsUpdate = true; malla.computeBoundingSphere(); malla.visible = true;   // el volumen envolvente, tras escribir las matrices (recorte por cámara, clase A)
  }
  const quitaOyente = n.on("mundo:hoy", function (datos: T3) {
    if (!vivo) return;
    const t = P.lee(datos); cuando = t ? t.cuando : null;
    puestos = t ? P.sitios(t.ids, D.parcelas) : [];   // sin datos, lectura incompleta o parcela desconocida: nada
    escribe();
  });
  retira = Entidades.registra({ tipo: "trabajo", dueno: "54_trabajo_hoy", prioridad: 10, sinAnillo: true,
    ficha: function (id: string) { const s = de(id); return s ? P.ficha(s, cuando) : null; },
    existe: function (id: string) { return !!de(id); },
    lista: function () { return puestos.map(function (s: T3) { return { id: idEnt(s) }; }); },
    pos: function (id: string) { const s = de(id); return s ? posDe(s) : null; },
    cerca: function (x: number, y: number) {
      let mejor: T3 = null, md = 1e9; puestos.forEach(function (s: T3) { const dd = Math.hypot(s.x - x, s.y - y); if (dd < md) { md = dd; mejor = s; } });
      return mejor ? { id: idEnt(mejor), d: md } : null;
    }, radioCerca: P.RADIO_CERCA });
  // si cambia la exageración vertical, los tractores se vuelven a posar en el suelo
  function tarde() { if (vivo && puestos.length && Estado.exag !== exagHecha) escribe(); }
  function estado() { const c = P.coste(puestos.length); return { tractores: puestos.length, llamadas: c.llamadas, triangulos: c.triangulos, ids: puestos.map(function (s: T3) { return s.id; }) }; }
  /** quita la malla de la escena y suelta malla, geometría y material, retira la entidad y la escucha; llamarlo dos veces no libera dos veces */
  function libera() {
    if (!vivo) return;
    vivo = false; puestos = [];
    quitaOyente();
    if (retira) { retira(); retira = null; }
    if (malla) { scene.remove(malla); if (malla.dispose) malla.dispose(); malla = null; }
    if (geo) { geo.dispose(); geo = null; } mat = null; materiales.libera();   // el material, que es de la fábrica
  }
  return { tarde, libera, estado };
}
export type TrabajoHoy = ReturnType<typeof creaTrabajoHoy>;
// [motor:fin]

/** El manifiesto del componente «trabajo-hoy» (el mismo de siempre, ahora de los mundos ["exterior"]): lo registra el talón de 54 con Componentes.registra. ?trabajo=1 lo enciende; por defecto, apagado. */
export function manifiestoTrabajoHoy(d: DepsTrabajoHoy): Manifiesto {
  return {
    id: ID_TRABAJO_HOY, version: 1,
    consume: ["Entidades", "scene", "suelo", "Estado", "D"],
    expone: [],
    eventos: { escucha: ["mundo:hoy"], emite: [] },
    bandera: { defecto: false, url: "trabajo" },
    // DISEÑO, no medido: 1 InstancedMesh y hasta 16 tractores de 72 triángulos (1.152); sin texturas ni sombras
    presupuesto: { llamadas: 1, triangulos: 1152 },
    fases: { tarde: 1 },
    mundos: ["exterior"],
    monta: function (n) { return creaTrabajoHoy(d, n); },
    actualiza: { tarde: function (_dt, _t, api) { (api as TrabajoHoy).tarde(); } },
    libera: function (api) { if (api) (api as TrabajoHoy).libera(); }
  };
}
