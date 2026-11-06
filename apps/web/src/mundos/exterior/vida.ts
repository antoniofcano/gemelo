// La vida del olivar: el quad con estela de luz (Tron) y el dron para el paseo (MU5-n, A3-5; antes apps/web/motor/16_vida.js, que queda como talón). Los pájaros y los conejos son el
// componente «fauna-olivar» (fauna.ts) y los perros, «perros-paseo» (perros.ts); aquí queda el grupo gFauna que los cuelga, el quad (que mira hacia −z, con las ruedas que giran con la
// velocidad y los acentos de neón), el dron (que también mira hacia −z, con las hélices y los ledes), el anillo bajo el dron, las dos estelas (un muro de luz que se apaga con el tiempo),
// y los mandos del paseo: la velocidad y el giro (el quad los cambia), el dron (su mando, su cámara y las tres vistas) y los botones «Subir al quad» / «Sacar el dron».
// El dron se mueve con el suelo y el borde del mundo ACTIVO (sueloMundo y obstaculo, MU2-4); el dibujo (el anillo, la fauna, los perros, las huellas) usa el suelo de 02_mundo (altSuelo).
// El estado que otros módulos leen (tVida, enQuad, vq, enDron) vive aquí, en el objeto E, y el legado lo espeja en sus var con la función espeja en cuanto cambia.
// Es un componente del exterior solo de ciclo de vida (como el follaje): lo registra 90_final.js, el legado lo usa desde el primer fotograma y su libera() suelta de verdad el grupo de
// la fauna, el quad, el dron, el anillo y las estelas con sus geometrías, materiales y texturas (L2-05, la auditoría de noviembre de 2026: 16_vida creaba todo y no soltaba nada), y
// quita las escuchas de sus botones (L2-11). La sombra bajo el quad (geoSombra y matSombra) es de 07_follaje y no se suelta aquí.
// Medido / deducido / ilustrativo (regla 5): el quad y el dron son ILUSTRATIVOS (el muñequito no es una persona medida); el viento que empuja al dron es el del tiempo (cur), medido o previsto
// según su fuente, pero «más de lo real, para que se note».
// Del legado recibe por argumento lo que necesita (THREE, la escena, el paseo, el mundo activo y el tiempo); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";
import type { T3 } from "./vida-tipos.ts";

/** El estado del paseo que otros módulos leen (tVida, enQuad, vq, enDron): vive en creaVida y el legado lo espeja en sus var */
export interface EstadoVida { tVida: number; enQuad: boolean; vq: number; enDron: boolean }

export interface DepsVida {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  camera: T3;
  Estado: { exag: number };
  Materiales: Materiales;
  /** el Bus del legado: emite «paseo:entra» y «paseo:sale» (la fauna y los perros los atienden) */
  Bus: { emite(ev: string, datos?: unknown): number };
  /** el DOM del paseo por id: los botones, los mandos del dron y los textos */
  $(id: string): T3;
  /** 02_mundo: el suelo de dibujo (altSuelo), la copa más alta de un punto (el dron la sobrevuela) */
  suelo(x: number, y: number): number;
  copaAlta(x: number, y: number): number;
  /** el mundo ACTIVO (gm.suelo y gm.obstaculo de 90_final): el dron se mueve con ellos (MU2-4) */
  sueloMundo(x: number, y: number): number;
  obstaculo(x: number, y: number, radio: number): { x: number; y: number } | null;
  /** 07_follaje: la sombra bajo el quad (compartida; no se suelta aquí) */
  geoSombra: T3;
  matSombra: T3;
  /** 15_tiempo: el resplandor (una textura nueva por llamada), el nivel del sol, el tiempo, el HUD y los formatos del texto del dron */
  texBrillo(): T3;
  nivelEn(ms: number, tmp: T3): { d: number };
  cur: { ms: number; dir: number; viento: number };
  ins: T3;
  num1(n: number, dec?: number): string;
  rumbo(grados: number): string;
  /** 12_paseo: si pasea, las teclas (el objeto se reemplaza al salir), el muñequito, su cámara y el estado «primera persona» */
  paseando(): boolean;
  teclas(): T3;
  persona(): T3;
  primera(): boolean;
  ponPrimera(v: boolean): void;
  pp: { x: number; y: number; ang: number; paso: number };
  camPos: T3;
  /** 12b_llegada: el anillo de llegada y «Aterrizar aquí» con el dron */
  Llegada: { conDron(on: boolean): void; porFotograma(): void };
  /** 22_huellas (se carga después: por función): la pendiente, la inclinación del quad */
  pendFactor(): number;
  quadInc(): { pit: number; rol: number };
  inclinaQuad(dt: number): void;
  /** el legado espeja el estado (tVida, enQuad, vq, enDron) en sus var cada vez que cambia */
  espeja(e: EstadoVida): void;
}

export const ID_VIDA = "vida";

// ---------------------------------------------------------------- el material (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 17)
/** el nombre del material en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_ESTELA = "estela";
/** Lo que se le pasa a crea(): los uniformes, que son de cada estela (los mueve actualizaVida) */
export interface OpcEstela { uniforms: Record<string, { value: unknown }> }
/** La estela: un muro de luz que se apaga con la edad de cada tramo (uNow − aB) / uVida. El clásico es el ShaderMaterial de siempre, movido, que recibe sus uniformes. */
export function defEstela(): DefMaterial<OpcEstela> {
  return {
    clasico: function (opc, c) {
      return new (c.THREE["ShaderMaterial"] as new (o: unknown) => MaterialMin)({
        uniforms: opc.uniforms, transparent: true, depthWrite: false, side: c.THREE["DoubleSide"], blending: c.THREE["AdditiveBlending"],
        vertexShader: "attribute float aV; attribute float aB; varying float vV; varying float vB; void main(){ vV = aV; vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uNow; uniform float uVida; uniform vec3 uColor; uniform float uAlpha; varying float vV; varying float vB; " +
          "void main(){ float edad = clamp((uNow - vB) / uVida, 0.0, 1.0); float v = (1.0 - edad); v *= v; " +
          "float caida = pow(1.0 - vV, 1.3); float pie = smoothstep(0.14, 0.0, vV); float filo = smoothstep(0.88, 1.0, vV) * 0.7; " +
          "float a = (0.14 + 0.6 * caida + pie * 0.9 + filo) * v * uAlpha; " +
          "gl_FragColor = vec4(uColor * (1.0 + 0.9 * pie * (1.0 - edad)), clamp(a, 0.0, 1.0));\n#include <colorspace_fragment>\n}"
      });
    },
    // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). Un MeshBasicNodeMaterial con las mismas propiedades del clásico
    // (transparente, sin escribir profundidad, a dos caras y aditivo; temaEstela le cambia `blending` igual que al clásico) cuyo colorNode es el de la estela: la edad de cada tramo
    // (uNow − aB) / uVida con los MISMOS uniformes que mueve actualizaVida (uNow, uVida, uAlpha, y el MISMO Color uColor, que temaEstela cambia en su sitio), la caída, el pie y el filo.
    // El smoothstep(0.14, 0.0, vV) de GLSL (primer borde mayor que el segundo) se escribe 1 − smoothstep(0.0, 0.14, vV): lo mismo, y WGSL exige borde menor < borde mayor.
    // FALTA: nada conocido del dibujo; NO VERIFICADO que el grafo compile ni que se vea igual (capturas por material: MU6).
    tsl: function (opc, c) {
      const T = c.TSL as T3, M = c.THREE["MeshBasicNodeMaterial"] as new (o: unknown) => MaterialMin;
      const u = opc.uniforms as T3;
      const uNow = T.uniform(u["uNow"].value).onObjectUpdate(function () { return u["uNow"].value; }), uVida = T.uniform(u["uVida"].value).onObjectUpdate(function () { return u["uVida"].value; });
      const uAlpha = T.uniform(u["uAlpha"].value).onObjectUpdate(function () { return u["uAlpha"].value; }), uColor = T.uniform(u["uColor"].value);   // el mismo Color
      const vV = T.attribute("aV", "float"), vB = T.attribute("aB", "float");
      const edad = T.clamp(uNow.sub(vB).div(uVida), 0, 1), v = T.float(1).sub(edad), v2 = v.mul(v);
      const caida = T.pow(T.float(1).sub(vV), 1.3), pie = T.float(1).sub(T.smoothstep(0.0, 0.14, vV)), filo = T.smoothstep(0.88, 1.0, vV).mul(0.7);
      const a = T.float(0.14).add(caida.mul(0.6)).add(pie.mul(0.9)).add(filo).mul(v2).mul(uAlpha);
      const m = new M({ transparent: true, depthWrite: false, side: c.THREE["DoubleSide"], blending: c.THREE["AdditiveBlending"] }) as MaterialMin & { colorNode: unknown };
      m.colorNode = T.vec4(uColor.mul(T.float(1).add(pie.mul(0.9).mul(T.float(1).sub(edad)))), T.clamp(a, 0, 1));
      return m;
    }
  };
}

/** Monta el quad, el dron, las estelas y los mandos del paseo y devuelve su api; `libera()` lo suelta todo (una sola vez). */
export function creaVida(d: DepsVida) {
  const THREE = d.THREE, scene = d.scene, camera = d.camera, Estado = d.Estado, Materiales = d.Materiales, bus = d.Bus, $ = d.$, suelo = d.suelo, copaAlta = d.copaAlta;
  const sueloMundo = d.sueloMundo, obstaculo = d.obstaculo, geoSombra = d.geoSombra, matSombra = d.matSombra, texBrillo = d.texBrillo, nivelEn = d.nivelEn, cur = d.cur, ins = d.ins;
  const num1 = d.num1, rumbo = d.rumbo, paseando = d.paseando, teclas = d.teclas, persona = d.persona, primera = d.primera, ponPrimera = d.ponPrimera, pp = d.pp, camPos = d.camPos;
  const Llegada = d.Llegada, pendFactor = d.pendFactor, quadInc = d.quadInc, inclinaQuad = d.inclinaQuad;
  // ---------- la vida del olivar: el quad con estela de luz (Tron) y el dron para el paseo (los pájaros y los conejos son el componente «fauna-olivar», fauna.ts)
  Materiales.define(MATERIAL_ESTELA, defEstela());
  const materiales = Materiales.de(ID_VIDA);   // lo que cree este componente se libera con su libera()
  const E: EstadoVida = { tVida: 0, enQuad: false, vq: 0, enDron: false };
  const gFauna = new THREE.Group(); gFauna.name = "fauna"; scene.add(gFauna);
  function altSuelo(x: any, y: any) { return suelo(x, y) * Estado.exag; }   // el de la vida ambiental (fauna, perros, huellas) y el dibujo del dron: sigue con el suelo de 02_mundo
  function altMueve(x: any, y: any) { return sueloMundo(x, y) * Estado.exag; }   // el de moverse (el dron y su cámara): el suelo del mundo activo (MU2-4)
  var lvVida = { s: { alt: 0, az: 0 }, d: 0 };   // el nivel del sol del quad y del dron, el mismo objeto cada fotograma (AG-1.4b)
  function quita(a: any, o: any) { var i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }

  function mira(g: any, hx: any, hz: any) { g.rotation.y = Math.atan2(-hx, -hz); }

  // --- el quad: mira hacia -z; las ruedas giran con la velocidad; los acentos de neón combinan con la linde
  var quad = (function () {
    var g = new THREE.Group(), mt = function (c: any) { return materiales.estandar("MeshLambertMaterial", { color: c }); }, neon = materiales.estandar("MeshBasicMaterial", { color: 0x40f0ff }), ruedas: any[] = [];
    function caja(w: any, h: any, d: any, m: any, x: any, y: any, z: any) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); return me; }
    caja(0.62, 0.22, 1.55, mt(0x2a2e34), 0, 0.46, 0); caja(0.5, 0.3, 0.5, mt(0xd9561c), 0, 0.78, -0.22); caja(0.38, 0.14, 0.62, mt(0x15171a), 0, 0.74, 0.28);
    caja(0.78, 0.07, 0.4, mt(0xd9561c), 0, 0.55, -0.82); caja(0.78, 0.07, 0.36, mt(0x2a2e34), 0, 0.55, 0.82);
    caja(0.05, 0.4, 0.05, mt(0x15171a), 0, 0.82, -0.52); caja(0.92, 0.05, 0.05, mt(0x15171a), 0, 1.02, -0.5);
    caja(0.04, 0.04, 1.5, neon, -0.32, 0.44, 0); caja(0.04, 0.04, 1.5, neon, 0.32, 0.44, 0);
    var faro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), materiales.estandar("MeshBasicMaterial", { color: 0xfff6d0 })); faro.position.set(0, 0.7, -0.95); g.add(faro);
    [[-0.58, -0.62], [0.58, -0.62], [-0.58, 0.62], [0.58, 0.62]].forEach(function (p: any) {
      var w = new THREE.Group(); w.position.set(p[0], 0.3, p[1]);
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 14), mt(0x1a1b1d)); r.rotation.z = Math.PI / 2; w.add(r);
      var tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 8), mt(0xb9bcc2)); tapa.rotation.z = Math.PI / 2; w.add(tapa); g.add(w); ruedas.push(w);
    });
    var sb = new THREE.Mesh(geoSombra, matSombra); sb.scale.set(1.9, 1, 2.5); sb.position.y = 0.03; g.add(sb);
    var glow = new THREE.Sprite(materiales.estandar("SpriteMaterial", { map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.scale.set(3.4, 3.4, 1); glow.position.set(0, 0.7, -1.1); g.add(glow);
    g.userData = { ruedas: ruedas, glow: glow }; g.visible = false; scene.add(g); return g;
  })();

  // --- las estelas: un muro de luz que se apaga con el tiempo (como en Tron); una para el quad (naranja) y otra para el dron (cian)
  var ESTELAS: any[] = [];
  function creaEstela(colOsc: any, colCla: any, alto: any, vida: any, NE: any) {
    var e: any = { n: 0, ult: null, ultB: [0, 0], alto: alto, NE: NE }, pos = new Float32Array(NE * 6), av = new Float32Array(NE * 2), ab = new Float32Array(NE * 2), idx = [];
    for (var i = 0; i < NE; i++) { av[i * 2] = 0; av[i * 2 + 1] = 1; if (i < NE - 1) { var a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); } }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aV", new THREE.BufferAttribute(av, 1)); g.setAttribute("aB", new THREE.BufferAttribute(ab, 1)); g.setIndex(idx); g.setDrawRange(0, 0);
    e.u = { uNow: { value: 0 }, uVida: { value: vida }, uColor: { value: new THREE.Color(colOsc) }, uAlpha: { value: 1 } };
    e.mat = materiales.crea(MATERIAL_ESTELA, { uniforms: e.u });   // el clásico es el ShaderMaterial de siempre (defEstela, arriba)
    e.malla = new THREE.Mesh(g, e.mat); e.malla.frustumCulled = false; e.malla.renderOrder = 6; e.malla.visible = false; scene.add(e.malla);   // vacía no se dibuja (three moderno cuenta la llamada aunque no haya vértices)
    e.tema = function (oscuro: any) { e.mat.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending; e.u.uColor.value.set(oscuro ? colOsc : colCla); e.u.uAlpha.value = oscuro ? 1 : 1.3; e.mat.needsUpdate = true; };
    e.reinicia = function () { e.ult = null; };
    e.emite = function (x: any, y: any, y0: any, sep: any) {
      if (e.ult && Math.hypot(x - e.ult[0], y - e.ult[1]) < (sep || 0.55)) return;
      if (!e.ult) e.ult = e.ultB; e.ult[0] = x; e.ult[1] = y;   // el mismo par cada vez (AG-1.4: sin reservas por fotograma)
      if (e.n === NE) { pos.copyWithin(0, 6); ab.copyWithin(0, 2); e.n -= 1; }
      var i = e.n++;
      pos[i * 6] = x; pos[i * 6 + 1] = y0; pos[i * 6 + 2] = -y; pos[i * 6 + 3] = x; pos[i * 6 + 4] = y0 + e.alto; pos[i * 6 + 5] = -y;
      ab[i * 2] = ab[i * 2 + 1] = E.tVida;
      g.attributes.position.needsUpdate = true; g.attributes.aB.needsUpdate = true; g.setDrawRange(0, Math.max(0, (e.n - 1) * 6)); e.malla.visible = e.n > 1;
    };
    ESTELAS.push(e); return e;
  }
  var estelaQuad = creaEstela(0xff9a2e, 0xd25a00, 1.3, 6.5, 240), estelaDron = creaEstela(0x40f0ff, 0x007f99, 0.5, 5, 260);
  function temaEstela(oscuro: any) { if (!ESTELAS) return; ESTELAS.forEach(function (e: any) { e.tema(oscuro); }); if (anilloDron) { anilloDron.material.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending; anilloDron.material.color.set(oscuro ? 0x40f0ff : 0x007f99); anilloDron.material.needsUpdate = true; } }

  // --- el paseo: el quad cambia la velocidad, el giro, la colisión y la cámara
  function velPaseo(av: any, dt: any) {
    if (!E.enQuad) { E.vq = 0; d.espeja(E); return av * (teclas().run ? 4.3 : 1.7) * (av < 0 ? 0.55 : 1) * pendFactor(); }
    var meta = av * (teclas().run ? 12 : 7.5) * (av < 0 ? 0.4 : 1) * pendFactor(), k = (Math.abs(meta) < Math.abs(E.vq) || meta * E.vq < 0) ? 4.5 : 2.2;
    E.vq += (meta - E.vq) * Math.min(1, dt * k); if (Math.abs(E.vq) < 0.02 && !av) E.vq = 0; d.espeja(E); return E.vq;
  }
  function giroPaseo(vel: any) { if (!E.enQuad) return 1.9; return 2.2 * (0.3 + 0.7 * Math.min(1, Math.abs(vel) / 3)) * (1 - 0.35 * Math.min(1, Math.abs(vel) / 12)); }
  function ponQuad(v: any) {
    if (v && E.enDron) ponDron(false);
    E.enQuad = !!v && paseando(); E.vq = 0; d.espeja(E); estelaQuad.reinicia(); quad.visible = E.enQuad;
    $("btnQuad").setAttribute("aria-pressed", String(E.enQuad)); $("btnQuad").textContent = E.enQuad ? "Bajar del quad" : "Subir al quad"; $("padQuad").setAttribute("aria-pressed", String(E.enQuad));
    if (!E.enQuad) { var u = persona().userData; u.pi.rotation.x = u.pd.rotation.x = u.bi.rotation.x = u.bd.rotation.x = 0; }
  }
  function vidaPaseo(dt: any, gy: any, vel: any) {
    if (E.enDron) { var ud = persona().userData; ud.pi.rotation.x = ud.pd.rotation.x = 0; ud.bi.rotation.x = ud.bd.rotation.x = 1.0; }
    if (!E.enQuad) { quad.visible = false; return; }
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang), u = persona().userData, mov = Math.min(1, Math.abs(vel) / 6);
    quad.visible = true; quad.position.set(pp.x, gy + 0.02 + Math.sin(E.tVida * 31) * 0.012 * mov, -pp.y); inclinaQuad(dt);
    var rueds = quad.userData.ruedas; for (var ir = 0; ir < rueds.length; ir++) rueds[ir].rotation.x -= vel * dt / 0.3;
    persona().position.set(pp.x - fx * 0.2, gy - 0.02, -pp.y - fz * 0.2); persona().rotation.set(quadInc().pit * 0.9, -pp.ang, quadInc().rol * 0.9, "YXZ");
    u.pi.rotation.x = u.pd.rotation.x = 1.15; u.bi.rotation.x = u.bd.rotation.x = 1.05;
    var noche = 1 - nivelEn(cur.ms, lvVida).d; quad.userData.glow.material.opacity = 0.2 + 0.7 * noche;
    if (Math.abs(vel) > 0.8) estelaQuad.emite(pp.x - fx * 1.0, pp.y - Math.cos(pp.ang) * 1.0, gy + 0.06);
  }

  // --- el dron: lo vuela el muñequito desde donde está (el dron mira hacia -z, como todo lo demás)
  var vistaD = 0, dr: any = { x: 0, y: 0, h: 0, yaw: 0, vf: 0, vh: 0, giro: 0, pit: 0, rol: 0 };
  var dron = (function () {
    var g = new THREE.Group(), mt = function (c: any) { return materiales.estandar("MeshLambertMaterial", { color: c }); }, led = function (c: any) { return materiales.estandar("MeshBasicMaterial", { color: c }); }, props: any[] = [], leds: any[] = [];
    function caja(w: any, h: any, d: any, m: any, x: any, y: any, z: any, ry?: any) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); if (ry) me.rotation.y = ry; g.add(me); return me; }
    caja(0.3, 0.1, 0.42, mt(0xe9ebee), 0, 0, 0); caja(0.24, 0.06, 0.3, mt(0x2b2f36), 0, 0.07, 0.02); caja(0.26, 0.16, 0.3, mt(0xf4f6f8), 0, -0.14, 0.04);
    var cam = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mt(0x15171a)); cam.position.set(0, -0.08, -0.2); g.add(cam);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p: any, k: any) {
      var mx = p[0] * 0.4, mz = p[1] * 0.4, largo = Math.hypot(mx, mz);
      caja(0.045, 0.035, largo, mt(0x2b2f36), mx / 2, 0.03, mz / 2, Math.atan2(mx, mz));
      var motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), mt(0x15171a)); motor.position.set(mx, 0.05, mz); g.add(motor);
      var h = new THREE.Group(); h.position.set(mx, 0.1, mz);
      var disco = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), materiales.estandar("MeshBasicMaterial", { color: 0xd8dde3, transparent: true, forceSinglePass: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })); disco.rotation.x = -Math.PI / 2; h.add(disco);
      var pala = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.008, 0.03), mt(0x20232a)); h.add(pala); g.add(h); props.push({ g: h, s: k % 2 ? 1 : -1 });
      var l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), led(p[1] < 0 ? 0xff3b30 : 0x34e07a)); l.position.set(mx, 0.0, mz + p[1] * 0.04); g.add(l); leds.push(l);
    });
    var glow = new THREE.Sprite(materiales.estandar("SpriteMaterial", { map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0x9ff4ff })); glow.scale.set(5, 5, 1); glow.position.set(0, -0.25, 0); g.add(glow);
    g.scale.setScalar(1.8); g.userData = { props: props, leds: leds, glow: glow }; g.visible = false; scene.add(g); return g;
  })();
  var anilloDron = (function () {
    var g = new THREE.RingGeometry(0.86, 1, 56); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, materiales.estandar("MeshBasicMaterial", { color: 0x40f0ff, transparent: true, forceSinglePass: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    m.visible = false; m.renderOrder = 4; scene.add(m); return m;
  })();
  function angDifRad(a: any, b: any) { var d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
  function textoAyudaPaseo() {
    return E.enDron ? "Dron: W/S avanzar · A/D girar · Espacio/C subir y bajar · Mayús rápido · V cámara · clic en el suelo: marcar llegada · Intro o L: aterrizar · E guardar · Esc: salir"
      : "Flechas o WASD: andar y girar · Mayús: correr · clic en el suelo: ir andando · V: primera persona · Q: quad · E: dron · M: minimapa · Esc: salir";
  }
  function ponDron(v: any) {
    var quiero = !!v && paseando();
    if (quiero && E.enQuad) ponQuad(false);
    E.enDron = quiero; d.espeja(E); vistaD = 0; ponPrimera(false); dron.visible = E.enDron; anilloDron.visible = E.enDron; estelaDron.reinicia();
    if (E.enDron) {
      var gy0 = altMueve(pp.x, pp.y); dr.x = pp.x + Math.sin(pp.ang) * 1.2; dr.y = pp.y + Math.cos(pp.ang) * 1.2; dr.yaw = pp.ang; dr.h = gy0 + 3; dr.vf = dr.vh = dr.giro = 0;
    } else { var u = persona().userData; u.pi.rotation.x = u.pd.rotation.x = u.bi.rotation.x = u.bd.rotation.x = 0; }
    $("btnDron").setAttribute("aria-pressed", String(E.enDron)); $("btnDron").textContent = E.enDron ? "Guardar el dron" : "Sacar el dron"; $("padDron").setAttribute("aria-pressed", String(E.enDron));
    $("padSube").hidden = !E.enDron; $("padBaja").hidden = !E.enDron; $("tDron").hidden = !E.enDron; $("ayudaPaseo").textContent = textoAyudaPaseo();
    Llegada.conDron(E.enDron);   // el anillo de llegada y «Aterrizar aquí» (12b_llegada.js)
  }
  function cicloVista() {
    if (E.enDron) { vistaD = (vistaD + 1) % 3; ponPrimera(vistaD === 1); } else ponPrimera(!primera());
  }
  // el mando: se llama desde el paseo con lo que se pulsa (y el muñequito deja de andar)
  function dronMando(av: any, gi: any, dt: any) {
    var vmax = teclas().run ? 15 : 8.5, sube = (teclas().sube ? 1 : 0) - (teclas().baja ? 1 : 0), k = Math.min(1, dt * 2.4);
    dr.vf += (av * vmax * (av < 0 ? 0.6 : 1) - dr.vf) * k; dr.giro += (gi * 1.7 - dr.giro) * Math.min(1, dt * 5); dr.yaw += dr.giro * dt; dr.vh += (sube * 5.5 - dr.vh) * Math.min(1, dt * 3);
    // el viento del tiempo lo empuja (más de lo real para que se note); mismo marco que el mundo: x este, y norte
    var rad = Math.PI / 180, wx = -Math.sin(cur.dir * rad) * cur.viento * 0.35, wy = -Math.cos(cur.dir * rad) * cur.viento * 0.35;
    var fx = Math.sin(dr.yaw), fy = Math.cos(dr.yaw);
    dr.x += (fx * dr.vf + wx) * dt; dr.y += (fy * dr.vf + wy) * dt;
    var o = obstaculo(dr.x, dr.y, 0); if (o) { dr.x = o.x; dr.y = o.y; }   // radio 0: vuela sobre los troncos, solo lo frena el borde del mundo activo (MU2-4; antes, D.ext)
    var suel = altMueve(dr.x, dr.y), copa = copaAlta(dr.x, dr.y) * Estado.exag, minH = suel + copa + 1.0;   // sobrevuela las copas, no las atraviesa
    dr.h = Math.max(minH, Math.min(suel + 90, dr.h + dr.vh * dt));
    dr.pit += (dr.vf * 0.022 - dr.pit) * Math.min(1, dt * 5); dr.rol += (-dr.giro * 0.2 - dr.rol) * Math.min(1, dt * 5);
    // el muñequito se vuelve a mirar el dron
    pp.ang += angDifRad(Math.atan2(dr.x - pp.x, dr.y - pp.y), pp.ang) * Math.min(1, dt * 3);
  }
  // la cámara en modo dron: true si la lleva ella
  var camV = new THREE.Vector3(), camDp = new THREE.Vector3(), camF = new THREE.Vector3(), camMira = new THREE.Vector3();   // temporales del módulo: la cámara del dron no reserva por fotograma
  function camaraDron(dt: any, gy: any) {
    if (!E.enDron) return false;
    camDp.set(dr.x, dr.h, -dr.y);
    if (vistaD === 2) { camF.set(Math.sin(dr.yaw), -0.2 - dr.pit * 2, -Math.cos(dr.yaw)); camera.position.set(dr.x, dr.h - 0.1, -dr.y); camera.lookAt(camMira.copy(camera.position).add(camF.multiplyScalar(10))); return true; }
    if (vistaD === 1) { camera.position.set(pp.x, gy + 1.62, -pp.y); camera.lookAt(camDp); return true; }
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang), ox = pp.x - fx * 4.6, oz = -pp.y - fz * 4.6, oy = Math.max(gy + 2.4, altMueve(ox, -oz) + 1.3);
    camV.set(ox, oy, oz); camPos.x += (camV.x - camPos.x) * Math.min(1, dt * 4); camPos.y += (camV.y - camPos.y) * Math.min(1, dt * 4); camPos.z += (camV.z - camPos.z) * Math.min(1, dt * 4);
    camera.position.copy(camPos); camera.lookAt(camDp.x * 0.7 + pp.x * 0.3, camDp.y * 0.8 + (gy + 1.4) * 0.2, camDp.z * 0.7 - pp.y * 0.3); return true;
  }
  function vidaDron(dt: any) {
    if (!E.enDron) return;
    var u = dron.userData, suel = altSuelo(dr.x, dr.y);
    dron.position.set(dr.x, dr.h + Math.sin(E.tVida * 2.2) * 0.04, -dr.y); dron.rotation.set(dr.pit, -dr.yaw, dr.rol, "YXZ");
    for (var ih = 0; ih < u.props.length; ih++) u.props[ih].g.rotation.y += u.props[ih].s * dt * 70;
    var parp = Math.floor(E.tVida * 2.2) % 2 === 0; for (var il = 0; il < u.leds.length; il++) u.leds[il].visible = il < 2 ? parp : true;
    u.glow.material.opacity = 0.15 + 0.5 * (1 - nivelEn(cur.ms, lvVida).d);
    Llegada.porFotograma();
    var alt = dr.h - suel; anilloDron.visible = true; anilloDron.position.set(dr.x, suel + 0.15, -dr.y); anilloDron.scale.setScalar(1.6 + alt * 0.28);
    anilloDron.material.opacity = Math.max(0.15, 0.7 - alt * 0.008) * (0.8 + 0.2 * Math.sin(E.tVida * 4));
    if (Math.abs(dr.vf) > 0.6 || Math.abs(dr.vh) > 0.6) estelaDron.emite(dr.x - Math.sin(dr.yaw) * 0.5, dr.y - Math.cos(dr.yaw) * 0.5, dr.h - 0.3, 0.5);
    ins.d = (ins.d || 0) + dt;
    if (ins.d > 0.25) { ins.d = 0; $("tDron").textContent = textoDron(alt); }   // el texto del HUD del dron, a 4 Hz (no por fotograma)
  }
  function textoDron(alt: any) {
    var vient = cur.viento;
    return "Dron · " + num1(alt, 0) + " m de altura · " + num1(Math.abs(dr.vf), 1) + " m/s · viento " + (vient < 0.3 ? "en calma" : rumbo(cur.dir) + " " + num1(vient, 1) + " m/s") + (vient > 9 ? " · demasiado para volar" : "");
  }

  function vidaEntra() {
    $("btnQuad").hidden = false; $("padQuad").hidden = false; $("btnDron").hidden = false; $("padDron").hidden = false; ponQuad(false); ponDron(false); $("ayudaPaseo").textContent = textoAyudaPaseo();
    bus.emite("paseo:entra");   // la fauna (16b_fauna.js) coloca sus aves posadas y sus conejos
  }
  function vidaSale() {
    ponQuad(false); ponDron(false); $("btnQuad").hidden = true; $("padQuad").hidden = true; $("btnDron").hidden = true; $("padDron").hidden = true;
    bus.emite("paseo:sale");
  }
  function actualizaVida(dt: any) {
    E.tVida += dt; d.espeja(E); for (var ie = 0; ie < ESTELAS.length; ie++) ESTELAS[ie].u.uNow.value = E.tVida; vidaDron(dt);
    gFauna.visible = $("cFauna").checked;
  }

  // --- los botones del paseo y los mandos de subir y bajar del dron; sus escuchas se quitan en libera() (L2-11)
  const oyentes: (() => void)[] = [];
  function oye(el: T3, ev: string, fn: (e: T3) => void): void { el.addEventListener(ev, fn); oyentes.push(function () { el.removeEventListener(ev, fn); }); }
  oye($("btnQuad"), "click", function () { ponQuad(!E.enQuad); }); oye($("padQuad"), "click", function () { ponQuad(!E.enQuad); });
  oye($("btnDron"), "click", function () { ponDron(!E.enDron); }); oye($("padDron"), "click", function () { ponDron(!E.enDron); });
  [["padSube", "sube"], ["padBaja", "baja"]].forEach(function (p: any) {
    var b = $(p[0]);
    oye(b, "pointerdown", function (e: any) { e.preventDefault(); teclas()[p[1]] = true; b.setPointerCapture(e.pointerId); });
    oye(b, "pointerup", function () { teclas()[p[1]] = false; }); oye(b, "pointercancel", function () { teclas()[p[1]] = false; });
  });

  let suelto = false;
  /** quita del escenario el grupo de la fauna, el quad, el dron, el anillo y las estelas y suelta sus geometrías, materiales (por la fábrica, con dueño «vida») y texturas (el resplandor de cada uno); quita las escuchas de los
   *  botones y los esconde. La sombra compartida (geoSombra, matSombra) y lo que cuelga de gFauna (la fauna y los perros, que se sueltan solos) no se tocan. Llamarlo dos veces no libera dos veces. */
  function libera(): void {
    if (suelto) return; suelto = true;
    while (oyentes.length) (oyentes.pop() as () => void)();
    ["btnQuad", "padQuad", "btnDron", "padDron"].forEach(function (id: any) { $(id).hidden = true; });
    [quad, dron].forEach(function (g: any) {
      scene.remove(g);
      g.traverse(function (o: any) {
        if (o.geometry && o.geometry !== geoSombra && !o.isSprite) o.geometry.dispose();
        var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach(function (m: any) { if (m !== matSombra && m.map) m.map.dispose(); });   // los resplandores; los materiales, abajo
      });
    });
    scene.remove(anilloDron); anilloDron.geometry.dispose();
    ESTELAS.forEach(function (e: any) { scene.remove(e.malla); e.malla.geometry.dispose(); });
    ESTELAS.length = 0;
    materiales.libera();   // los de Lambert, Basic y Sprite del quad y del dron, el anillo y las dos estelas, de la fábrica (la sombra compartida de 07_follaje no es suya)
    scene.remove(gFauna);
  }

  /** el componente (ADR-0023): el ciclo de vida de la vida del olivar (el grupo de la fauna, el quad, el dron, el anillo y las estelas). Solo ciclo de vida: los dibuja el bucle del paseo cuando
   *  se suben al quad o sacan el dron (el quad, unas 20 llamadas; el dron, unas 26 con su anillo; las dos estelas, 1 cada una; contadas a mano, sin medir). Lo registra 90_final.js. */
  const componente: Manifiesto = {
    id: ID_VIDA, version: 1,
    consume: ["Materiales", "Estado", "Bus", "scene"],
    expone: [],
    eventos: { escucha: [], emite: ["paseo:entra", "paseo:sale"] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },
    mundos: ["exterior"],
    monta: function () { return { libera }; },
    libera: function () { libera(); }
  };
  return { E, gFauna, quad, dron, dr, anilloDron, altSuelo, quita, mira, temaEstela, velPaseo, giroPaseo, ponQuad, vidaPaseo, ponDron, cicloVista, dronMando, camaraDron, vidaEntra, vidaSale, actualizaVida, libera, componente };
}
export type Vida = ReturnType<typeof creaVida>;
