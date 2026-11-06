// El cielo del exterior: las nubes que derivan con el viento (una malla, una llamada), el disco del sol y las estrellas. MU5-n (A3-4): antes en
// apps/web/motor/15_tiempo.js; el código es el de siempre, movido, con un libera() que suelta de verdad sus geometrías, sus materiales y sus texturas
// (L2-05). Lo mueve cada fotograma el paso del tiempo (tiempo-paso.ts); lo dibujado es ilustrativo (se pinta a partir de los datos del tiempo).

import type { DefMaterial, MaterialesDe } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsCielo {
  THREE: A;
  scene: { add(o: A): void; remove(o: A): void };
  camera: A;
  /** 04d: el ruido hash(n) → [0, 1) */
  hash: (n: number) => number;
  /** 03_escena: marca una textura de color pintada a mano como sRGB (texColor) */
  texColor: (t: A) => A;
  /** un lienzo nuevo (document.createElement("canvas")) */
  lienzo: () => A;
  /** EV-1s: ?suelo=fotos (SueloFotos.activo): la paleta del ocaso sacada de las fotos de cielo de la finca */
  ocasoFotos: boolean;
  /** la fábrica de materiales (define) y la vista con el dueño del tiempo (crea y estandar): libera() del tiempo los suelta con materiales.libera() */
  Materiales: { define(nombre: string, def: DefMaterial<A>): void };
  materiales: Pick<MaterialesDe, "crea" | "estandar">;
}

// ---------------------------------------------------------------- el material de las nubes por la fábrica (MU5-n: MATERIALES §1, fila 3)
/** el nombre del material de las nubes en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_NUBES = "nubes";
/** lo que pide: sus uniformes (map y diffuse; con la paleta del ocaso, también uNubLuz, uNubSom y uOcaso) y si va con la paleta del ocaso (?suelo=fotos) */
export interface OpcNubes { uniforms: A; ocaso: boolean }
/** el clásico de siempre, movido: las manchas de cara a la cámara en una sola malla, con el sombreado de SpriteMaterial (textura × color × opacidad, tono y salida) */
export const DEF_NUBES: DefMaterial<OpcNubes> = {
  clasico: function (o, c) {
    var OCASO_FOTOS = o.ocaso, un = o.uniforms;
    var m = new (c.THREE as A).ShaderMaterial({
      uniforms: un, transparent: true, depthWrite: false, fog: false,
      vertexShader: "attribute vec2 esquina; attribute vec2 tam; attribute float alfa; varying vec2 vUv; varying float vA;\n" +
        "void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += esquina * tam; gl_Position = projectionMatrix * mv; vUv = uv; vA = alfa; }",
      fragmentShader: OCASO_FOTOS
        ? "uniform sampler2D map; uniform vec3 diffuse; uniform vec3 uNubLuz; uniform vec3 uNubSom; uniform float uOcaso; varying vec2 vUv; varying float vA;\n" +
          "void main() { vec3 d = mix(diffuse, mix(uNubLuz, uNubSom, smoothstep(0.3, 0.7, vUv.y)), uOcaso); vec4 c = vec4(d, vA) * texture2D(map, vUv); gl_FragColor = c;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
        : "uniform sampler2D map; uniform vec3 diffuse; varying vec2 vUv; varying float vA;\n" +
          "void main() { vec4 c = vec4(diffuse, vA) * texture2D(map, vUv); gl_FragColor = c;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
    });
    return m;
  }
};

// EV-1s (?suelo=fotos, la misma bandera que el suelo de fotos): la paleta del atardecer sacada de 4 fotos de cielo de la finca (2026-11-04) por
// tuberia/suelo/construye.mjs (tuberia/suelo/paleta_cielo.json; lo comprueba pruebas/guardianes/suelo_fotos.test.js). Solo calibra COLORES: el
// cielo sigue siendo simulado por la hora y el tiempo (ilustrativo), sin foto de fondo. El fondo es un color liso: va el del horizonte con un
// poco del cenit; las nubes, a la puesta, de la cara iluminada (abajo, el sol rasante) a la de sombra (arriba). Sin la bandera, nada cambia.
export var PALETA_OCASO = { horizonte: 0xb18a70, cenit: 0x616f83, nubeLuz: 0xdab192, nubeSombra: 0x77757a };

/** la textura del disco del sol (y del brillo de 16_vida, que pide la suya: es de quien la pide) */
export function texBrilloDe(THREE: A, lienzo: () => A, texColor: (t: A) => A): () => A {
  return function texBrillo(): A {
    var cv = lienzo(); cv.width = cv.height = 128; var x = cv.getContext("2d"), g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,235,1)"); g.addColorStop(0.12, "rgba(255,244,200,0.95)"); g.addColorStop(0.3, "rgba(255,220,150,0.35)"); g.addColorStop(1, "rgba(255,200,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return texColor(new THREE.CanvasTexture(cv));
  };
}

// AG-1.4c: las manchas son un banco de NSP entradas reutilizadas (antes, un objeto nuevo por mancha y fotograma), el orden es el mismo (sort estable, mismo comparador)
/** pintaNubes de siempre sobre unas nubes (NUBES), su malla y la cámara: las manchas con opacidad, de la más lejana a la más cercana, en los buffers de la malla */
export function pintaNubesDe(THREE: A, NUBES: A[], NSP: number, nubesMalla: A, camera: A): () => void {
  var nubesOrden: A[] = [], vTmp = new THREE.Vector3(), nubesBanco: A[] = [];
  (function () { for (var i = 0; i < NSP; i++) nubesBanco.push({ s: null, gr: null, x: 0, y: 0, z: 0, d: 0 }); })();
  function cmpNubes(a: A, b: A): number { return b.d - a.d; }
  return function pintaNubes(): void {   // las manchas con opacidad, de la más lejana a la más cercana a la cámara, en los buffers de la malla
    var G = nubesMalla.geometry, P = G.attributes.position.array, T = G.attributes.tam.array, A2 = G.attributes.alfa.array, n = 0, i, j, v, k, gr, sp, q;
    nubesOrden.length = 0;
    for (i = 0; i < NUBES.length; i++) {
      gr = NUBES[i]; if (!(gr.o > 0)) continue; sp = gr.sp;
      for (j = 0; j < sp.length; j++) { vTmp.copy(gr.position).add(sp[j].p); q = nubesBanco[nubesOrden.length]; q.s = sp[j]; q.gr = gr; q.x = vTmp.x; q.y = vTmp.y; q.z = vTmp.z; q.d = vTmp.distanceToSquared(camera.position); nubesOrden.push(q); }
    }
    nubesOrden.sort(cmpNubes);   // reserva-ok: el sort interno de V8 (sin cierre ni objetos nuevos por nuestra parte); es estable, como antes
    for (i = 0; i < nubesOrden.length; i++) {
      q = nubesOrden[i];
      for (v = 0; v < 4; v++) { k = n * 4 + v; P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = q.z; T[k * 2] = q.s.sx; T[k * 2 + 1] = q.s.sy; A2[k] = q.gr.o; }
      n++;
    }
    G.attributes.position.needsUpdate = G.attributes.tam.needsUpdate = G.attributes.alfa.needsUpdate = true;
    G.setDrawRange(0, n * 6); nubesMalla.visible = n > 0;
  };
}

export function creaCielo(d: DepsCielo) {
  var THREE = d.THREE, scene = d.scene, camera = d.camera, hash = d.hash, texColor = d.texColor, lienzo = d.lienzo, materiales = d.materiales;
  d.Materiales.define(MATERIAL_NUBES, DEF_NUBES);
  // --- el cielo: nubes que derivan con el viento, disco del sol y estrellas
  function texNube(): A {
    var cv = lienzo(); cv.width = cv.height = 128; var x = cv.getContext("2d");
    [[64, 70, 46], [38, 74, 32], [90, 76, 34], [58, 52, 30], [78, 56, 28]].forEach(function (c: A) {
      var g = x.createRadialGradient(c[0], c[1], 2, c[0], c[1], c[2]); g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
    return texColor(new THREE.CanvasTexture(cv));
  }
  var texBrillo = texBrilloDe(THREE, lienzo, texColor);
  // Las nubes (46 grupos de 5 manchas, 230 en total) van en UNA malla y UNA llamada de dibujo (T6b, criterio 2 del ADR-0015): antes eran 230
  // sprites, uno por llamada, y con el cielo cubierto se llevaban casi todo el presupuesto de llamadas. Cada mancha es un cuadrado de cara a la
  // cámara (como un Sprite de three: centro, tamaño, sin giro) y su sombreado es el de SpriteMaterial (textura × color × opacidad, tono y
  // espacio de color de salida); las de opacidad 0 no se mandan. Como los sprites, se ordenan de lejos a cerca cada fotograma (son transparentes).
  var gCielo = new THREE.Group(); gCielo.name = "cielo"; scene.add(gCielo);
  var NUBES: A[] = [], texN = texNube(), NSP = 46 * 5;
  (function () {
    for (var i = 0; i < 46; i++) {
      var r1 = hash(i * 3.1), r2 = hash(i * 5.7), r3 = hash(i * 9.3), tam = 150 + 190 * r3, gr: A = { position: new THREE.Vector3((r1 - 0.5) * 2400, 230 + 130 * r2, (r2 - 0.5) * 2000), umbral: (i + 0.5) / 46, o: 0, sp: [] };
      for (var j = 0; j < 5; j++) {
        var s = tam * (0.55 + 0.6 * hash(i * 11 + j));
        gr.sp.push({ sx: s, sy: s * 0.5, p: new THREE.Vector3((hash(i * 7 + j) - 0.5) * tam * 0.9, (hash(i * 13 + j) - 0.5) * 12, (hash(i * 17 + j) - 0.5) * tam * 0.35) });
      }
      NUBES.push(gr);
    }
  })();
  var OCASO_FOTOS = !!d.ocasoFotos;
  var uOcasoN = { uNubLuz: { value: new THREE.Color(PALETA_OCASO.nubeLuz) }, uNubSom: { value: new THREE.Color(PALETA_OCASO.nubeSombra) }, uOcaso: { value: 0 } };
  var nubesMalla = (function () {
    var g = new THREE.BufferGeometry(), E = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], UV = [0, 0, 1, 0, 1, 1, 0, 1];
    var esq = new Float32Array(NSP * 8), uv = new Float32Array(NSP * 8), idx = new Uint16Array(NSP * 6);
    for (var k = 0; k < NSP; k++) { esq.set(E, k * 8); uv.set(UV, k * 8); idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6); }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NSP * 12), 3).setUsage(THREE.DynamicDrawUsage));   // el centro de la mancha, en sus 4 vértices
    g.setAttribute("esquina", new THREE.BufferAttribute(esq, 2)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("tam", new THREE.BufferAttribute(new Float32Array(NSP * 8), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alfa", new THREE.BufferAttribute(new Float32Array(NSP * 4), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    var un: A = { map: { value: texN }, diffuse: { value: new THREE.Color(1, 1, 1) } }; if (OCASO_FOTOS) Object.assign(un, uOcasoN);
    var m = materiales.crea(MATERIAL_NUBES, { uniforms: un, ocaso: OCASO_FOTOS });   // MU5-n: por la fábrica, con el dueño del tiempo
    var me = new THREE.Mesh(g, m); me.name = "nubes"; me.frustumCulled = false; me.renderOrder = -1; gCielo.add(me);
    return me;
  })();
  var pintaNubes = pintaNubesDe(THREE, NUBES, NSP, nubesMalla, camera);
  var sprSol = new THREE.Sprite(materiales.estandar("SpriteMaterial", { map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sprSol.scale.set(520, 520, 1); sprSol.renderOrder = -1; scene.add(sprSol);
  var estrellas = (function () {
    var n = 420, p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var u = hash(i * 2.3) * 2 - 1, a = hash(i * 4.9) * 6.283, r = Math.sqrt(1 - u * u); p[i * 3] = r * Math.cos(a) * 4000; p[i * 3 + 1] = Math.abs(u) * 4000 * 0.95 + 120; p[i * 3 + 2] = r * Math.sin(a) * 4000; }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    var m = new THREE.Points(g, materiales.estandar("PointsMaterial", { size: 7, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false })); m.frustumCulled = false; m.renderOrder = -2; scene.add(m); return m;
  })();

  var suelto = false;
  /** quita el cielo de la escena y suelta lo suyo: las geometrías de las nubes y las estrellas y sus dos texturas (la de las nubes y la del sol). Sus tres
   *  materiales son del dueño del tiempo en la fábrica: los suelta materiales.libera() (tiempo.ts) */
  function libera(): number {
    if (suelto) return 0;
    suelto = true;
    scene.remove(gCielo); scene.remove(sprSol); scene.remove(estrellas);
    var n = 0;
    [nubesMalla.geometry, estrellas.geometry, texN, sprSol.material.map].forEach(function (x: A) { if (x && typeof x.dispose === "function") { x.dispose(); n++; } });
    return n;
  }
  return { gCielo: gCielo, NUBES: NUBES, NSP: NSP, nubesMalla: nubesMalla, pintaNubes: pintaNubes, sprSol: sprSol, estrellas: estrellas, uOcasoN: uOcasoN, OCASO_FOTOS: OCASO_FOTOS, texBrillo: texBrillo, libera: libera };
}
export type Cielo = ReturnType<typeof creaCielo>;
