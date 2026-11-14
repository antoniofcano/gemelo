// La lluvia del exterior: rayitas que caen en una caja que sigue a la cámara; la animación va en la tarjeta gráfica (MATERIALES §1, fila 4). MU5-n (A3-4):
// antes en apps/web/motor/15_tiempo.js; el código es el de siempre, movido, con un libera() que suelta de verdad su geometría y su material (L2-05).
// La mueve cada fotograma el paso del tiempo (tiempo-paso.ts: uLluvia, visible y posición). Ilustrativa: se dibuja a partir de la lluvia de la previsión.

import type { DefMaterial, MaterialesDe } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsLluvia {
  THREE: A; scene: { add(o: A): void; remove(o: A): void }; hash: (n: number) => number;
  /** la fábrica de materiales (define) y la vista con el dueño del tiempo (crea): libera() del tiempo suelta el material con materiales.libera() */
  Materiales: { define(nombre: string, def: DefMaterial<A>): void };
  materiales: Pick<MaterialesDe, "crea">;
}

// ---------------------------------------------------------------- el material de la lluvia por la fábrica (MU5-n: MATERIALES §1, fila 4)
/** el nombre del material de la lluvia en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_LLUVIA = "lluvia";
/** lo que pide: sus uniformes (uT, uInt, uViento y uColor: los MISMOS objetos que mueve el paso del tiempo) */
export interface OpcLluvia { uniforms: A }
/** el clásico de siempre, movido: las rayas caen en una caja de 170 m de alto (mod), empujadas por el viento, más claras por la cola */
export const DEF_LLUVIA: DefMaterial<OpcLluvia> = {
  clasico: function (o, c) {
    var m = new (c.THREE as A).ShaderMaterial({
      uniforms: o.uniforms, transparent: true, depthWrite: false,
      vertexShader: "attribute float aEnd; uniform float uT; uniform vec2 uViento; varying float vA;\n" +
        "void main(){ float H = 170.0; float y = mod(position.y - uT * 26.0, H); vec3 p = position; p.y = y + aEnd * 3.4;\n" +
        "p.xz += uViento * (H - y) * 0.035 - uViento * aEnd * 0.5; vA = 1.0 - aEnd * 0.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
      fragmentShader: "uniform float uInt; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, 0.75 * uInt * vA);\n#include <colorspace_fragment>\n}"
    });
    return m;
  },
  // MU5-n, tercer commit: la variante TSL, APAGADA (MATERIALES §11). Las mismas cuentas en positionNode (la caída con mod, el empuje del viento, la cola de 3,4 m) y el
  // color con su alfa; los uniformes, los MISMOS objetos. Sin tono (el clásico solo lleva colorspace_fragment): toneMapped = false.
  tsl: function (o, c) {
    var W = c.THREE as A, T = c.TSL as A, un = o.uniforms;
    var m = new W["LineBasicNodeMaterial"]({ transparent: true, depthWrite: false });
    m.toneMapped = false;
    var num = function (x: { value: A }): A { return T.uniform(x.value).onObjectUpdate(function () { return x.value; }); };
    var uT = num(un.uT), uInt = num(un.uInt), uViento = num(un.uViento), uColor = num(un.uColor), aEnd = T.attribute("aEnd", "float");
    var H = T.float(170), p = T.positionGeometry, y = T.mod(p.y.sub(uT.mul(26)), H);
    var xz = T.vec2(p.x, p.z).add(uViento.mul(H.sub(y)).mul(0.035)).sub(uViento.mul(aEnd).mul(0.5));
    m.positionNode = T.vec3(xz.x, y.add(aEnd.mul(3.4)), xz.y);
    m.colorNode = T.vec4(uColor, T.float(0.75).mul(uInt).mul(T.float(1).sub(aEnd.mul(0.6))));
    return m;
  }
};

export function creaLluvia(d: DepsLluvia) {
  var THREE = d.THREE, scene = d.scene, hash = d.hash;
  d.Materiales.define(MATERIAL_LLUVIA, DEF_LLUVIA);
  // --- la lluvia: rayitas que caen en una caja que sigue a la cámara; la animación va en la tarjeta gráfica
  var uLluvia = { uT: { value: 0 }, uInt: { value: 0 }, uViento: { value: new THREE.Vector2(0, 0) }, uColor: { value: new THREE.Color(0xbcd2e6) } };
  var lluvia = (function () {
    var n = 7500, p = new Float32Array(n * 2 * 3), e = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) { var x = (hash(i * 1.7) - 0.5) * 900, y = hash(i * 3.3) * 170, z = (hash(i * 5.9) - 0.5) * 900; for (var k = 0; k < 2; k++) { p[(i * 2 + k) * 3] = x; p[(i * 2 + k) * 3 + 1] = y; p[(i * 2 + k) * 3 + 2] = z; e[i * 2 + k] = k; } }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aEnd", new THREE.BufferAttribute(e, 1));
    var m = d.materiales.crea(MATERIAL_LLUVIA, { uniforms: uLluvia });   // MU5-n: por la fábrica, con el dueño del tiempo
    var l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.visible = false; scene.add(l); return l;
  })();
  var suelto = false;
  /** quita la lluvia de la escena y suelta su geometría (el material es del dueño del tiempo en la fábrica: lo suelta materiales.libera(), en tiempo.ts) */
  function libera(): number {
    if (suelto) return 0;
    suelto = true; scene.remove(lluvia); lluvia.geometry.dispose(); return 1;
  }
  return { lluvia: lluvia, uLluvia: uLluvia, libera: libera };
}
export type Lluvia = ReturnType<typeof creaLluvia>;

/** L8-01: dónde cuelga la caja de la lluvia (resultado en `salida`): en la vista aérea, bajo el blanco de la órbita; paseando (o en quad o dron), bajo la cámara, que es
 *  quien mira (el blanco de la órbita no se mueve al andar). 20 m por debajo de los ojos o del blanco: la caja mide 170 m y llega por encima de las copas. */
export function anclaLluvia(paseando: boolean, camara: { x: number; y: number; z: number }, objetivo: { x: number; y: number; z: number }, salida: { x: number; y: number; z: number }) {
  const o = paseando ? camara : objetivo;
  salida.x = o.x; salida.y = (paseando ? camara.y : objetivo.y) - 20; salida.z = o.z;
  return salida;
}
