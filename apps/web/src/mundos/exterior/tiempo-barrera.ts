// La barrera de la linde de cada parcela: una película de luz translúcida que late, en vez de una línea blanca (MATERIALES §1, fila 5). MU5-n (A3-4): antes en
// apps/web/motor/15_tiempo.js; el código es el de siempre, movido, con un libera() que suelta de verdad sus geometrías y su material (L2-05). Sus mallas cuelgan
// de gLinde (08_marcadores), congeladas (AG-1.15); 08 las recoloca con colocaBarrera cuando cambia la exageración. El pulso (uT) lo mueve el paso del tiempo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsBarrera {
  THREE: A;
  /** 08_marcadores: el grupo de las lindes (la barrera cuelga de él) */
  gLinde: { add(o: A): void; remove(o: A): void };
  /** 02j: Estaticos.congela (las mallas solo cambian al recolocarlas) */
  Estaticos: { congela(o: A): void };
  /** 02_mundo: la cota del suelo (m) en (x, y) */
  suelo: (x: number, y: number) => number;
  /** Estado.exag, que cambia: se lee al colocar */
  Estado: { exag: number };
  /** el color del cielo del tema (--sky), en lineal: decide la mezcla de la barrera */
  cieloBase: () => A;
  /** 16_vida: temaEstela(oscuro), si está (va después en el montaje) */
  temaEstela?: (oscuro: boolean) => void;
}

export var BARRERA_ALTO = 5.5;

export function creaBarreras(d: DepsBarrera) {
  var THREE = d.THREE;
  // --- la barrera de la linde: una película de luz translúcida en vez de una línea blanca
  var uBarrera = { uT: { value: 0 }, uColor: { value: new THREE.Color(0x40f0ff) }, uAlpha: { value: 1 } };
  var BARRERAS: A[] = [], mallas: A[] = [];
  var matBarrera = new THREE.ShaderMaterial({
    uniforms: uBarrera, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: "attribute float aV; attribute float aD; varying float vV; varying float vD; void main(){ vV = aV; vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uT; uniform vec3 uColor; uniform float uAlpha; varying float vV; varying float vD;\n" +
      "void main(){ float caida = pow(1.0 - vV, 1.7); float pie = smoothstep(0.09, 0.0, vV); float filo = smoothstep(0.92, 1.0, vV) * 0.5;\n" +
      "float x = fract(vD / 5.0); float rej = smoothstep(0.04, 0.0, min(x, 1.0 - x)) * 0.3 * caida;\n" +
      "float p = fract(vD / 110.0 - uT * 0.05); float pulso = smoothstep(0.0, 0.025, p) * smoothstep(0.14, 0.025, p);\n" +
      "float a = uAlpha * (0.1 + 0.5 * caida) + pie * 0.95 + filo + rej + pulso * 0.55 * (0.4 + caida);\n" +
      "gl_FragColor = vec4(uColor * (1.0 + 0.7 * pie + 0.9 * pulso), clamp(a, 0.0, 1.0));\n#include <colorspace_fragment>\n}"
  });
  function temaBarrera(): void {
    if (!matBarrera || !uBarrera) return;
    var s = d.cieloBase().clone().convertLinearToSRGB(), oscuro =(0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b) < 0.4;
    // sobre fondo claro la luz aditiva se lava: se usa mezcla normal y un turquesa profundo
    matBarrera.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending;
    uBarrera.uColor.value.set(oscuro ? 0x40f0ff : 0x007f99); uBarrera.uAlpha.value = oscuro ? 1 : 1.25; matBarrera.needsUpdate = true;
    if (typeof d.temaEstela === "function") d.temaEstela(oscuro);
  }
  function creaBarrera(pr: A): A {  // la linde, remuestreada cada ≤ 4 m para que la película siga el terreno
    var pts: A[] = [], r = pr.linde.concat([pr.linde[0]]), dist = [0];
    for (var i = 0; i < r.length - 1; i++) {
      var a = r[i], b = r[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 4));
      for (var j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
    }
    pts.push(r[r.length - 1]);
    var acc = 0, N = pts.length, dd = new Float32Array(N * 2), v = new Float32Array(N * 2), idx: number[] = [];
    for (var q = 0; q < N; q++) { if (q) acc += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); dd[q * 2] = dd[q * 2 + 1] = acc; v[q * 2] = 0; v[q * 2 + 1] = 1; if (q < N - 1) { var a0 = q * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); } }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); g.setAttribute("aV", new THREE.BufferAttribute(v, 1)); g.setAttribute("aD", new THREE.BufferAttribute(dd, 1)); g.setIndex(idx);
    // AG-1.3: con recorte; la esfera la fija colocaBarrera tras escribir los vértices (el sombreador no los mueve)
    var m = new THREE.Mesh(g, matBarrera); m.renderOrder = 5; d.Estaticos.congela(m); d.gLinde.add(m); BARRERAS.push({ pts: pts, geo: g }); mallas.push(m);
    return g;
  }
  function colocaBarrera(k: number): void {
    var b = BARRERAS[k], p = b.geo.attributes.position, suelo = d.suelo, Estado = d.Estado;
    b.pts.forEach(function (q: A, i: number) { var y0 = suelo(q[0], q[1]) + 0.12; p.setXYZ(i * 2, q[0], y0 * Estado.exag, -q[1]); p.setXYZ(i * 2 + 1, q[0], (y0 + BARRERA_ALTO) * Estado.exag, -q[1]); });
    p.needsUpdate = true;
    b.geo.computeBoundingSphere();   // AG-1.3: DESPUÉS de escribir los vértices (three la calcula una sola vez y los de creaBarrera nacen a cero)
  }
  var suelto = false;
  /** quita cada barrera de gLinde y suelta su geometría, y el material que comparten */
  function libera(): number {
    if (suelto) return 0;
    suelto = true;
    var n = 0;
    mallas.forEach(function (m: A) { d.gLinde.remove(m); m.geometry.dispose(); n++; });
    matBarrera.dispose(); n++;
    mallas.length = 0; BARRERAS.length = 0;
    return n;
  }
  return { uBarrera: uBarrera, matBarrera: matBarrera, temaBarrera: temaBarrera, creaBarrera: creaBarrera, colocaBarrera: colocaBarrera, libera: libera, BARRERA_ALTO: BARRERA_ALTO };
}
export type Barreras = ReturnType<typeof creaBarreras>;
