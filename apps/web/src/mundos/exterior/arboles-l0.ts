// Los olivos del modo Gemelo, nivel 0 (MU5-n, A3-2b; antes apps/web/motor/06_arboles.js, que queda como talón): la copa con la forma real medida (8 radios) y el tronco
// debajo, por celdas de 64 m (las construye 07b con arbolesG a rebanadas por la Cola), y los olivos como entidades (ADR-0023 C7, id estable olivo:<finca>:<copas_id>).
// Aquí viven los dos grupos de la escena (gArboles, que es también gFollaje, y gSombras), los dos materiales del nivel 0 (copa-l0 y tronco-l0, con el color por vértice
// escrito en sRGB) y el registro de la entidad «olivo». libera() quita los grupos de la escena, retira la entidad y suelta los materiales; las geometrías de cada celda
// las libera quien las cuelga (07b) y la de las sombras, 07_follaje.
// L5-01 (auditoría de noviembre de 2026): el material del tronco del nivel 0 se llamaba matTronco, igual que el del paisaje (18_paisaje.js), y en el ámbito único del
// motor ganaba el del paisaje: todo tronco y rama del nivel 0 salía de un único marrón y no con el color por vértice con que se construyó. Ahora es matTroncoL0, propio.
// Medido / deducido / ilustrativo (regla 5): la copa es medida (LiDAR 2024); el tronco y las ramas son ilustrativos (2-3 pies habituales, no medidos).
// Del legado recibe por argumento lo que necesita (THREE, la escena, el mundo, las entidades y los datos); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo; el motor son números y arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsArbolesL0 {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  camera: T3;
  Estaticos: { congela(o: unknown): void };
  Materiales: Materiales;
  /** 02e: el registro de entidades; registra devuelve la función que quita el tipo (null si no valió) */
  Entidades: { registra(d: T3): (() => void) | null };
  Estado: { exag: number };
  /** el índice de la finca (finca_id, centro_utm) */
  D: T3;
  fmt(n: number, dec?: number): string;
  FACTOR_R8: number; ESC_R8: number;
  suelo(x: number, y: number): number;
  aviva(c3: number[], x: number, y: number): void;
  colorEn(x: number, y: number, h: number, c3: number[]): void;
  hash(n: number): number;
  copas: T3[]; marc: T3[];
  /** 07ab: se pide al ficharse un olivo (después de montar el módulo: por función) */
  Generados: { rotulo(i: number): T3; escalera(): boolean };
  /** 13_parcelas: las parcelas de la finca (se carga después de 06: por función) */
  parcelas(): T3[];
  /** 03_escena: el color por vértice en sRGB pasa a lineal (el parche de los dos materiales del nivel 0) */
  colorVertSRGB: (sh: unknown) => void;
}

export const ID_ARBOLES_L0 = "arboles-l0";

// ---------------------------------------------------------------- los materiales (MU5-n: por la fábrica, con sus nombres de la tabla de MATERIALES §1, fila 10)
/** los nombres de los materiales en la fábrica: son también la clave de su variante TSL */
export const MATERIAL_COPA_L0 = "copa-l0", MATERIAL_TRONCO_L0 = "tronco-l0";
/** Lambert con el color por vértice (escrito en sRGB: el parche lo pasa a lineal al leerlo, `colorVertSRGB` de 03_escena). La copa se ve por las dos caras. */
function defLambertVertice(parche: (sh: unknown) => void, dosCaras: boolean): DefMaterial<void> {
  return {
    clasico: function (_o, c) {
      const Lambert = c.THREE["MeshLambertMaterial"] as new (opc: unknown) => MaterialMin;
      const m = new Lambert(dosCaras ? { vertexColors: true, side: c.THREE["DoubleSide"] } : { vertexColors: true });
      m.onBeforeCompile = parche;   // la MISMA función: three usa su texto como clave del programa (sin clave propia, como con parchea)
      return m;
    }
  };
}

export function creaArbolesL0(d: DepsArbolesL0) {
  const THREE = d.THREE, scene = d.scene, camera = d.camera, Estaticos = d.Estaticos, Materiales = d.Materiales, Entidades = d.Entidades, Estado = d.Estado, D = d.D, fmt = d.fmt;
  const FACTOR_R8 = d.FACTOR_R8, ESC_R8 = d.ESC_R8, suelo = d.suelo, aviva = d.aviva, colorEn = d.colorEn, hash = d.hash, copas = d.copas, marc = d.marc, colorVertSRGB = d.colorVertSRGB;
  // ---------- los olivos del modo Gemelo: copa con la forma real medida (8 radios) y tronco debajo (nivel 0, por celdas de 64 m; ver Arboles)
  const gArboles = new THREE.Group(), gFollaje = gArboles, gSombras = new THREE.Group(); gArboles.name = "arboles"; gSombras.name = "sombras-olivos"; Estaticos.congela(gArboles); Estaticos.congela(gSombras); scene.add(gArboles); scene.add(gSombras);   // AG-1.15: los grupos no se mueven; lo que cuelga se congela al crearlo (07b celdas, 07 sombras)   // gFollaje es el mismo grupo: las celdas de nivel 0 llevan copa, tronco, hojas y frutos
  Materiales.define(MATERIAL_COPA_L0, defLambertVertice(colorVertSRGB, true)); Materiales.define(MATERIAL_TRONCO_L0, defLambertVertice(colorVertSRGB, false));   // el color por vértice está escrito en sRGB (03_escena)
  const materiales = Materiales.de(ID_ARBOLES_L0);   // lo que cree este componente se libera con su libera()
  const matCopa = materiales.crea(MATERIAL_COPA_L0) as MaterialMin & T3, matTroncoL0 = materiales.crea(MATERIAL_TRONCO_L0) as MaterialMin & T3;
  var KSEG = 20, RING = 9;
  function radioEn(perfil: any, ang: any) { // ang en rad (0 = este, antihorario); interpolación circular
    var f = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 8, i0 = Math.floor(f) % 8, i1 = (i0 + 1) % 8, t = f - Math.floor(f);
    return perfil[i0] * (1 - t) + perfil[i1] * t;
  }
  function* arbolesG(arr: any) {   // copas y troncos de una lista de olivos, en dos mallas (a rebanadas: cada 5 olivos cede el turno a la cola)
    var cp: any[] = [], cc: any[] = [], ci: any[] = [], tp: any[] = [], tc: any[] = [], ti: any[] = [], vo = 0, vt = 0, c3 = [0, 0, 0];
    for (var ai = 0; ai < arr.length; ai++) {
      var t = arr[ai], n = t.i;
      var gz = suelo(t.x, t.y), ht = Math.min(1.5, Math.max(0.9, t.h * 0.3)), cb = ht + 0.1, top = Math.max(t.h, cb + 1.4);
      var lean = (hash(n + 11) - 0.5) * 0.25, az = hash(n + 5) * 6.28;
      // tronco y ramas gruesas hacia la copa (olivo en vaso): tubos cónicos con vaivén
      var topeC = gz + cb + (top - cb) * 0.30, rmed = t.perfil.reduce(function (p: any, q: any) { return p + q; }, 0) / 8 * ESC_R8;
      function tubo(pts: any, r0: any, r1: any, sem: any) {
        var NS = pts.length - 1, RS = 6;
        for (var i = 0; i <= NS; i++) {
          var f = i / NS, rr = r0 + (r1 - r0) * f;
          for (var a3 = 0; a3 < RS; a3++) {
            var an = a3 / RS * 6.283 + sem, wob = 1 + 0.14 * Math.sin(an * 3 + sem * 5 + i);
            tp.push(pts[i][0] + Math.cos(an) * rr * wob, pts[i][1] * Estado.exag, -(pts[i][2] + Math.sin(an) * rr * wob));
            var m = 0.30 + 0.12 * hash(sem * 31 + i * 7 + a3);
            tc.push(0.50 * m * 1.7, 0.43 * m * 1.7, 0.36 * m * 1.7);
          }
        }
        for (var i2 = 0; i2 < NS; i2++) for (var a4 = 0; a4 < RS; a4++) {
          var A = vt + i2 * RS + a4, B = vt + i2 * RS + (a4 + 1) % RS, C = A + RS, Dd = B + RS; ti.push(A, B, C, B, Dd, C);
        }
        vt += (NS + 1) * RS;
      }
      // olivo en vaso (fotos de referencia): base ensanchada, 2-3 troncos que se abren casi desde el suelo y ramas gruesas
      var bx = t.x + Math.cos(az) * lean * 0.5, by = t.y + Math.sin(az) * lean * 0.5, nt = 2 + (hash(n + 4) > 0.45 ? 1 : 0), rtr = 0.20 + 0.05 * Math.min(1, t.h / 5);
      tubo([[bx, gz - 0.05, by], [bx, gz + 0.18, by], [bx, gz + 0.45, by]], rtr * 2.1, rtr * 1.35, n + 50);   // base acampanada
      for (var st = 0; st < nt; st++) {
        var sa = az + st / nt * 6.283 + (hash(n * 11 + st) - 0.5) * 0.7, out = rmed * (0.16 + 0.07 * hash(n * 5 + st)), ex0 = bx + Math.cos(sa) * out, ey0 = by + Math.sin(sa) * out;
        var tronco2 = [];
        for (var q4 = 0; q4 <= 5; q4++) {
          var f4 = q4 / 5, c4 = f4 * f4;
          tronco2.push([bx + (ex0 - bx) * c4 + 0.07 * Math.sin(q4 * 2.2 + st + n), gz + 0.4 + (ht + 0.55 - 0.4) * f4, by + (ey0 - by) * c4 + 0.07 * Math.cos(q4 * 2.2 + st * 2 + n)]);
        }
        tubo(tronco2, rtr * 1.15, rtr * 0.8, n * 7 + st + 60);
        for (var rm2 = 0; rm2 < 2; rm2++) {                                    // dos ramas gruesas por tronco
          var ra = sa + (rm2 ? 0.55 : -0.55) + (hash(n * 5 + rm2 + st) - 0.5) * 0.5, alc = rmed * (0.34 + 0.18 * hash(n * 3 + rm2 * 7 + st)), ex = ex0 + Math.cos(ra) * alc, ey = ey0 + Math.sin(ra) * alc;
          var ez = gz + cb + (top - cb) * (0.18 + 0.28 * hash(n * 9 + rm2 + st * 3)), y0 = gz + ht + 0.55, rama = [];
          for (var q3 = 0; q3 <= 5; q3++) {
            var f3 = q3 / 5, curv = Math.sin(f3 * 1.45), ar = f3 * (0.35 + 0.65 * f3);
            rama.push([ex0 + (ex - ex0) * ar + 0.06 * Math.sin(q3 * 3 + rm2 + st), y0 + (ez - y0) * curv, ey0 + (ey - ey0) * ar + 0.06 * Math.cos(q3 * 3 + n + st)]);
          }
          tubo(rama, rtr * 0.78, rtr * 0.28, n * 13 + st * 3 + rm2 + 90);
        }
      }
      // copa: casquete + cuerpo con radio por dirección
      var base = vo;
      for (var rg = 0; rg <= RING; rg++) {
        var ph = rg / RING * 2.75, sn = Math.sin(ph), tt = (1 + Math.cos(ph)) / 2;
        for (var sg = 0; sg < KSEG; sg++) {
          var th = sg / KSEG * 6.283, rr = radioEn(t.perfil, th);
          var bump = 1 + 0.16 * Math.sin(th * 3 + n) * Math.sin(ph * 2 + n * 0.7) + 0.08 * (hash(n * 13 + sg + rg * 31) - 0.5);
          var rho = rr * Math.pow(sn, 0.72) * bump * FACTOR_R8;   // el radio dibujado de la copa (01_datos.js)
          var wx = t.x + Math.cos(th) * rho, wy = t.y + Math.sin(th) * rho;
          var hy = cb + (top - cb) * Math.pow(tt, 0.85) * 0.80 + 0.18 * Math.sin(th * 5 + rg + n) * sn;
          cp.push(wx, (gz + hy) * Estado.exag, -wy);
          colorEn(wx, wy, hy, c3); aviva(c3, wx, wy);
          var up = 0.78 + 0.28 * Math.cos(ph) , gr = 0.9 + 0.2 * hash(n * 3 + sg * 5 + rg);
          var sombra = rg > RING * 0.62 ? 0.38 : 0.62;
          var vf = (0.8 + 0.4 * hash(n * 3 + sg + rg * 5)) * sombra * up; cc.push(0.15 * vf * 1.6, 0.20 * vf * 1.6, 0.11 * vf * 1.6);
        }
      }
      for (var rg2 = 0; rg2 < RING; rg2++) for (var sg2 = 0; sg2 < KSEG; sg2++) {
        var a0 = base + rg2 * KSEG + sg2, b0 = base + rg2 * KSEG + (sg2 + 1) % KSEG, c0 = a0 + KSEG, d0 = b0 + KSEG;
        ci.push(a0, c0, b0, b0, c0, d0);
      }
      vo += (RING + 1) * KSEG;
      if (ai % 5 === 4) yield;
    }
    var g1 = new THREE.BufferGeometry(); g1.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); g1.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3)); g1.setIndex(ci); g1.computeVertexNormals();
    var g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3)); g2.setAttribute("color", new THREE.Float32BufferAttribute(tc, 3)); g2.setIndex(ti); g2.computeVertexNormals();
    return [new THREE.Mesh(g1, matCopa), new THREE.Mesh(g2, matTroncoL0)];
  }

  // ---------- los olivos como entidades (ADR-0023 C7, 02e_entidades.js): id estable olivo:<finca>:<copas_id> (ADR-0012; sin copas_id, olivo:<finca>:i<índice>,
  // que no es estable entre exportaciones). Solo los olivos (c.oliv), como antes. El toque elige el olivo cuyo punto a 0,7 de su altura cae a menos de 26 px
  // del dedo; el rayo de VR, el más cercano a su eje (radio de al menos 1,3 m), a 0,4-150 m. La ficha es la de siempre, ahora como datos (la pinta Usables).
  const quitaEntidad = (function () {
    var porId: any = null, v = new THREE.Vector3(), w = new THREE.Vector3(), FINCA = String(D.finca_id || "finca");
    function idDe(c: any) { return "olivo:" + FINCA + ":" + (c.id >= 0 ? c.id : "i" + c.i); }
    function copaDe(id: any) { if (!porId) { porId = {}; copas.forEach(function (c: any) { if (c.oliv) porId[idDe(c)] = c; }); } return porId[id] || null; }
    function rm(c: any) { return c.perfil.reduce(function (a: any, b: any) { return a + b; }, 0) / 8; }
    function enPantalla(cx: any, cy: any, r: any) {
      var best = null, bd = 26;
      copas.forEach(function (c: any) {
        if (!c.oliv) return;
        v.set(c.x, (suelo(c.x, c.y) + c.h * 0.7) * Estado.exag, -c.y).project(camera); if (v.z > 1) return;
        var sx = (v.x * 0.5 + 0.5) * r.width + r.left, sy = (-v.y * 0.5 + 0.5) * r.height + r.top, d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = c; }
      });
      return best ? { id: idDe(best), s: bd / 26 } : null;
    }
    function enRayo(rr: any) {
      var best = null, bs = 1e9, bt = 1e9, bp = 1, ro = rr.ray.origin, rd = rr.ray.direction;
      copas.forEach(function (c: any) {
        if (!c.oliv) return; var cy = (suelo(c.x, c.y) + c.h * 0.6) * Estado.exag; w.set(c.x - ro.x, cy - ro.y, -c.y - ro.z); var t = w.dot(rd); if (t < 0.4 || t > 150) return;
        var perp = w.addScaledVector(rd, -t).length(), rad = Math.max(1.3, 0.55 * rm(c)), s = perp / rad; if (s < 1 && t * 0.02 + s < bs) { bs = t * 0.02 + s; best = c; bt = t; bp = s; }
      });
      return best ? { id: idDe(best), t: bt, s: bp } : null;
    }
    function rotuloGenerado(i: any, filas: any) {   // decisión 34: si el olivo se dibuja generado (?olivos=gen), se dice que su forma es ilustrativa y si su id es provisional
      var r = d.Generados.rotulo(i); if (!r) return;
      filas.push({ k: "Forma", v: "ilustrativa con medidas del LiDAR" + (r.lejano ? " (lejano)" : r.variante ? " (variante)" : r.niv && d.Generados.escalera() ? " (propio)" : "") });
    }
    function filaId(c: any) {   // OF8c: el id real, para pegarlo en la pestaña «Olivo real» de la oficina (texto de la ficha: se selecciona y se copia); provisional desde 2^31 (tuberia/ids_copas.py)
      return c.id >= 0 ? { k: "Id", v: c.id + (c.id >= 2147483648 ? " (provisional, aún no viene del censo)" : " (del censo)") + " · en la oficina, «posición " + (c.i + 1) + "»" }
        : { k: "Id", v: "sin id estable · en la oficina, «posición " + (c.i + 1) + "»" };
    }
    function fichaOlivo(id: any) {
      var b = copaDe(id); if (!b) return null;
      var m = marc.filter(function (q: any) { return q.par === b.i; })[0], f = [];
      f.push({ k: "Parcela", v: b.dentro ? d.parcelas()[b.parc].nombre : "fuera de las parcelas" }, { k: "Altura", v: fmt(b.h, 1) + " m" }, { k: "Radio de copa", v: fmt(rm(b), 1) + " m" },
        { k: "Guardado en OlivarTrack", v: b.dentro ? (m ? "sí" : "no") : "fuera de esta parcela" });
      if (m) f.push({ k: "Desfase", v: fmt(Math.hypot(m.x - b.x, m.y - b.y), 1) + " m" });
      f.push({ k: "Pies del olivo", v: "2–3, lo habitual (no medido)" }); rotuloGenerado(b.i, f); f.push(filaId(b));
      f.push({ k: "UTM 30 (ETRS89)", v: fmt(D.centro_utm[0] + b.x) + ", " + fmt(D.centro_utm[1] + b.y) });
      return { titulo: "Olivo " + (b.i + 1), filas: f };
    }
    return Entidades.registra({ tipo: "olivo", dueno: "06_arboles", prioridad: 10, pantalla: enPantalla, rayo: enRayo, ficha: fichaOlivo,
      existe: function (id: any) { return !!copaDe(id); },
      pos: function (id: any) { var c = copaDe(id); return c ? { x: c.x, y: suelo(c.x, c.y) * Estado.exag, z: -c.y } : null; },
      radio: function (id: any) { var c = copaDe(id); return c ? Math.max(1, rm(c) * 1.1) : 1; } });
  })();
  let suelto = false;
  /** quita los grupos de la escena, retira la entidad «olivo» y suelta los dos materiales del nivel 0; llamarlo dos veces no libera dos veces */
  function libera(): void {
    if (suelto) return; suelto = true;
    scene.remove(gArboles); scene.remove(gSombras);
    if (quitaEntidad) quitaEntidad();
    materiales.libera();   // copa-l0 y tronco-l0
  }
  /** el componente (ADR-0023): el ciclo de vida de los grupos de olivos, sus dos materiales y la entidad «olivo». Solo ciclo de vida: lo que dibuja lo cuentan las celdas
   *  de 07b; no se apaga desde la URL (sin los olivos no hay modo Gemelo). Lo registra 90_final.js (el objeto lo usa el legado desde el primer fotograma). */
  const componente: Manifiesto = {
    id: ID_ARBOLES_L0, version: 1,
    consume: ["Estaticos", "Materiales", "Entidades", "Estado", "D", "copas", "marc"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // sus mallas son las celdas de nivel 0 de 07b: su coste entra en el de 07b (TRI0 por olivo, tope MAX0)
    mundos: ["exterior"],
    monta: function () { return api; },
    libera: function () { libera(); }
  };
  const api = { gArboles, gFollaje, gSombras, matCopa, matTroncoL0, materiales, radioEn, arbolesG, libera, componente };
  return api;
}
export type ArbolesL0 = ReturnType<typeof creaArbolesL0>;

