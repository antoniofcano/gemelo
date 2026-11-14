// El color de la ortofoto para lo que se dibuja encima (la nube, el follaje, los olivos del nivel 0) y el registro de árboles del índice. MU5-n (A3-8a): antes
// vivía en apps/web/motor/02_mundo.js como extracción parcial (con dos primitivas, kcor y tinte, que reescribían 09_camara y 10_ndvi); ahora es estado de
// aquí (TinteOrto.E.kcor, TinteOrto.E.tinte) y 02_mundo.js queda de talón. Mismos números, misma fórmula.
//   · La ortofoto enseña la copa corrida hacia el este según su altura (ajuste empírico medido en otra finca y aplicado sin recalibrar: ~1,2 m a 1 m de altura,
//     ~2,5 m a 4 m). Para pintar un punto del LiDAR se mira el píxel donde la ortofoto lo dibuja (colorEn). kcor escala ese desfase (lo mueve 09_camara).
//   · El verde de la ortofoto lleva la sombra de la copa: se aclara un poco hacia el gris plateado del olivo (aviva); con el tinte puesto (la casilla «Tinte NDVI»,
//     10_ndvi), el tono de la copa sigue al NDVI de su zona y la luz y la sombra del follaje se conservan.
// Medido / deducido / ilustrativo (regla 5): la copa y la ortofoto son medidas; el desfase y el aclarado, un ajuste ilustrativo del color.
// Nada de aquí lee globales: la ortofoto (Mundo.orto) y el NDVI (de 10_ndvi, que va después en el montaje: por función) entran por argumento.

export interface DepsTinteOrto {
  /** el color de la ortofoto en un punto (Mundo.orto de 02_mundo) */
  orto(x: number, y: number, out: number[]): void;
  /** 10_ndvi: el NDVI relativo de un punto (0-1) y la rampa de color; van después en el montaje: se piden al usarlos */
  ndviRel(x: number, y: number): number;
  rampa(t: number): ArrayLike<number>;
}

export function creaTinteOrto(d: DepsTinteOrto) {
  /** kcor: el factor del desfase de la copa (1; lo cambia 09_camara); tinte: ¿la copa sigue al NDVI? (la casilla «Tinte NDVI» de 10_ndvi) */
  var E = { kcor: 1, tinte: false };
  function desp(h: number) { return E.kcor * (1.2 * Math.min(h, 1) + 0.42 * Math.max(h - 1, 0)); }
  var PLATA = [0.58, 0.62, 0.52];
  function aviva(c3: number[], x?: number, y?: number): void {
    for (var i = 0; i < 3; i++) c3[i] = Math.min(1, 0.8 * c3[i]! * 1.35 + 0.2 * PLATA[i]!);
    if (E.tinte && x !== undefined) {   // el tono de la copa sigue al NDVI de su zona; la luz y la sombra del follaje se conservan
      var lum = (c3[0]! + c3[1]! + c3[2]!) / 3, t = d.ndviRel(x, y as number), mezcla = 0.78, f = 0.45 + 0.9 * lum;
      if (isFinite(t)) {   // L3-19: sin NDVI en ese punto (NaN) la copa se queda con su color de la ortofoto, no con un vigor inventado
        var r = d.rampa(t);
        for (var k = 0; k < 3; k++) c3[k] = Math.min(1, c3[k]! * (1 - mezcla) + r[k]! * f * mezcla);
      }
    }
  }
  function colorEn(x: number, y: number, h: number, out: number[]): void { d.orto(x + desp(h), y + E.kcor * 0.2 * Math.min(h / 2, 1), out); }
  return { E: E, desp: desp, aviva: aviva, colorEn: colorEn };
}
export type TinteOrto = ReturnType<typeof creaTinteOrto>;

/** Una fila de D.copas: [x, y, h, r8 (8 radios), parcela+1] (CONTRATOS §1.1). */
export type FilaCopa = [number, number, number, number[], number];
export interface Copa { i: number; id: number; tipo: number; x: number; y: number; h: number; perfil: number[]; dentro: boolean; parc: number; oliv: boolean }
export interface Marca { i: number; x: number; y: number; par: unknown; parc: unknown }

// el registro de árboles: copas[i] = [x, y, h, r8, parcela+1] y, en columnas paralelas opcionales (CONTRATOS §1.1), copas_id[i] (id estable) y copas_tipo[i]
// (olivo-tipo del catálogo, ADR-0012); sin ellas, −1: sin id y sin tipo (se dibuja como siempre)
export function creaCopas(D: { copas: FilaCopa[]; copas_id?: number[] | null; copas_tipo?: number[] | null; marcados: [number, number, unknown, unknown][] }) {
  var copas: Copa[] = D.copas.map(function (c, i) { var rm = c[3].reduce(function (a, b) { return a + b; }, 0) / 8; return { i: i, id: D.copas_id ? D.copas_id[i]! : -1, tipo: D.copas_tipo ? D.copas_tipo[i]! : -1, x: c[0], y: c[1], h: c[2], perfil: c[3], dentro: c[4] > 0, parc: c[4] - 1, oliv: !(c[2] > 8 || (c[2] > 6.5 && rm < 2.2)) }; });
  var cIn = copas.filter(function (c) { return c.dentro && c.oliv; });
  var marc: Marca[] = D.marcados.map(function (m, i) { return { i: i, x: m[0], y: m[1], par: m[2], parc: m[3] }; });
  var med = function (a: number[]) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
  return { copas: copas, cIn: cIn, marc: marc, med: med };
}
