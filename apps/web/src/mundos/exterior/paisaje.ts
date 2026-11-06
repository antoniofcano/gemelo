// El paisaje que sale del LiDAR en el exterior (MU5-n, A3-3; antes apps/web/motor/18_paisaje.js, que queda como talón): los edificios (clase 6), el tendido y sus postes, el arroyo
// y los árboles que no son olivos. Componente «paisaje» de los mundos ["exterior"], con un libera() que suelta de verdad. Mismo comportamiento que antes, sin cambio visible.
// Lo que el LiDAR clasifica de verdad son los edificios. El tendido, los postes, el cauce y las copas se deducen de la geometría (alturas, alineación, relieve) y se rotulan así.
// Los árboles y sus masas de copa son ILUSTRATIVOS (la forma); el tamaño y el sitio, medidos.
//
// Lo que cambia respecto a 18_paisaje.js (hallazgo L2-05 de la auditoría de noviembre de 2026; el resto es el código de antes, movido):
//   · libera(): quita el grupo de la escena y suelta de verdad las geometrías (muros, tejados, postes, hilos, cauces), los InstancedMesh de los árboles, los materiales
//     (también uno por tejado) y la malla de sombras que este módulo le añade al grupo de 06_arboles; olvida su fuente del presupuesto de VR y quita el oyente de la casilla.
//     monta() lo vuelve a poner todo si el exterior reentra (los materiales fijos persisten entre un monta() y el siguiente; los de cada tejado y el del cauce se rehacen).
// Del legado recibe por argumento lo que necesita (THREE, el índice D, el suelo, las copas, la fábrica de materiales, el reloj del mundo…); no lee globales.
// Lo que otros módulos reescriben (instSombra lo pone 07_follaje; tMundo, 15_tiempo) entra como funciones que lo leen en cada uso; lo que este módulo reescribe y otros leen
// (aguaNivel) lo comunica por ponAgua.
// (matTronco, el tronco de los árboles que no son olivos, ya no comparte nombre con el del nivel 0 de 06_arboles, que desde A3-2b / L5-01 es matTroncoL0: aquí es solo de este módulo.)
// Presupuesto (regla 6): una llamada por pieza (muro, tejado, poste, hilo, cauce) y 4 InstancedMesh de árboles (un tronco y tres masas de copa de 20 triángulos); las cifras,
// de pruebas/presupuesto.json (el paisaje de Hituelo).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en suelo-fondo.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;

export const ID_PAISAJE = "paisaje-lidar";
export const ID_ARBOLES_VR = "arbolesPaisaje";

/** lo que el índice trae del paisaje (contratos/indice.schema.json, «paisaje») */
export interface DatosPaisaje {
  edificios: { x: number; y: number; ang: number; largo: number; ancho: number; hAlero: number; hCumbrera: number; color: number[] }[];
  tendido: { linea: number[][]; postes: PoDatos[]; derivaciones?: { postes: PoDatos[]; linea: number[][] }[] };
  arroyo: { eje?: number[][]; ejes?: number[][][] };
  arboles: { x: number; y: number; h: number; r: number; tipo?: string }[];
}
export interface PoDatos { x: number; y: number; zBase: number; zAlto: number }
/** una copa del Mundo: de ellas, las de olivo reciben una mancha de sombra */
export interface CopaPaisaje { oliv: boolean; perfil: number[]; x: number; y: number; h: number }
/** el nivel del sol que calcula 15_tiempo (nivelEn rellena `salida`) */
export interface NivelSol { s: { alt: number; az: number }; d: number }

// ---------------------------------------------------------------- el material del cauce (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 17)
/** el nombre del material en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_ARROYO = "arroyo";
/** los uniformes del cauce: el reloj del mundo, el nivel del agua (0 seco), la luz del día y el color de la arena; los mueve actualizaPaisaje */
export interface UniformesArroyo { uT: { value: number }; uAgua: { value: number }; uLuz: { value: number }; uArena: { value: unknown } }
export const VS_ARROYO = "attribute float aV; attribute float aU; varying float vV; varying float vU; void main(){ vV = aV; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
export const FS_ARROYO = "uniform float uT; uniform float uAgua; uniform float uLuz; uniform vec3 uArena; varying float vV; varying float vU;\n" +
  "float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
  "void main(){ float borde = smoothstep(1.0, 0.62, abs(vV)); vec3 lecho = uArena * mix(0.72, 1.12, hh(floor(vec2(vU * 1.4, vV * 7.0))));\n" +
  "float anchoA = uAgua * 0.78; float agua = smoothstep(anchoA + 0.12, anchoA - 0.12, abs(vV)) * step(0.01, uAgua);\n" +
  "float flujo = sin(vU * 2.2 - uT * 3.4 + vV * 5.0) * 0.5 + 0.5; vec3 colA = sRGBTransferEOTF(vec4(mix(vec3(0.16, 0.36, 0.5), vec3(0.6, 0.8, 0.9), flujo * flujo * 0.55), 1.0)).rgb;\n" +
  "vec3 col = mix(lecho, colA, agua) * uLuz; gl_FragColor = vec4(col, borde * mix(0.72, 0.88, agua));\n#include <colorspace_fragment>\n}";
/** lo que pide el material: los uniformes (los MISMOS objetos que mueve actualizaPaisaje) y el estado de dibujo; los sombreadores van fijos */
export interface OpcArroyo {
  uniforms: UniformesArroyo; transparent: boolean; depthWrite: boolean; side: number; polygonOffset: boolean; polygonOffsetFactor: number; polygonOffsetUnits: number;
}
/** el ShaderMaterial de siempre: transparente, de dos caras, sin escribir profundidad y con el desplazamiento de polígono que lo pega al relieve */
export const DEF_ARROYO: DefMaterial<OpcArroyo> = {
  clasico: function (o, c) {
    const Sombreador = c.THREE["ShaderMaterial"] as new (opc: unknown) => MaterialMin;
    return new Sombreador({ ...o, vertexShader: VS_ARROYO, fragmentShader: FS_ARROYO });
  },
  // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). El mismo cálculo que el fragmento (el borde del
  // cauce, el lecho de arena con ruido por celda, el agua que ensancha con uAgua y fluye con uT, la luz del día) escrito en nodos, con los MISMOS uniformes que mueve
  // actualizaPaisaje (se releen en cada objeto, como el ejemplo de la fábrica), el estado de dibujo del clásico y sin niebla. El sombreador de vértices no hace falta: los
  // atributos aV y aU entran por attribute(). NO se ha comparado con el clásico dibujado (las capturas son de MU6): es la misma cuenta, no una equivalencia comprobada
  tsl: function (o, c) {
    const Basico = c.THREE["MeshBasicNodeMaterial"] as new (opc: unknown) => MaterialMin & { colorNode: unknown };
    const { attribute, uniform, float, vec2, vec3, vec4, smoothstep, mix, floor, fract, sin, dot, abs, step, sRGBTransferEOTF } = c.TSL as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const u = o.uniforms;
    const uT = uniform(0).onObjectUpdate(function () { return u.uT.value; }), uAgua = uniform(0).onObjectUpdate(function () { return u.uAgua.value; });
    const uLuz = uniform(1).onObjectUpdate(function () { return u.uLuz.value; }), uArena = uniform(u.uArena.value).onObjectUpdate(function () { return u.uArena.value; });
    const vV = attribute("aV", "float"), vU = attribute("aU", "float");
    const hh = function (p: unknown) { return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)); };
    const borde = smoothstep(1.0, 0.62, abs(vV)), lecho = uArena.mul(mix(0.72, 1.12, hh(floor(vec2(vU.mul(1.4), vV.mul(7.0))))));
    const anchoA = uAgua.mul(0.78), agua = smoothstep(anchoA.add(0.12), anchoA.sub(0.12), abs(vV)).mul(step(0.01, uAgua));
    const flujo = sin(vU.mul(2.2).sub(uT.mul(3.4)).add(vV.mul(5.0))).mul(0.5).add(0.5);
    const colA = sRGBTransferEOTF(vec4(mix(vec3(0.16, 0.36, 0.5), vec3(0.6, 0.8, 0.9), flujo.mul(flujo).mul(0.55)), float(1.0))).rgb;
    const m = new Basico({ transparent: o.transparent, depthWrite: o.depthWrite, side: o.side, polygonOffset: o.polygonOffset, polygonOffsetFactor: o.polygonOffsetFactor, polygonOffsetUnits: o.polygonOffsetUnits, fog: false, toneMapped: false });
    m.colorNode = vec4(mix(lecho, colA, agua).mul(uLuz), borde.mul(mix(0.72, 0.88, agua)));
    return m;
  }
};

export interface DepsPaisaje {
  THREE: T3;
  /** el índice: de él se toma D.paisaje (si falta, un paisaje vacío) */
  D: { paisaje?: DatosPaisaje };
  /** 01_datos: $ (el elemento por id) y ESC_R8 (la escala de los radios de las copas) */
  $(id: string): { checked: boolean; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void } | null;
  ESC_R8: number;
  suelo(x: number, y: number): number;
  /** 02_mundo: las copas */
  copas: CopaPaisaje[];
  hash(i: number): number;
  /** el color medido en la ortofoto está en sRGB: THREE.SRGBColorSpace */
  SRGB: string;
  Estado: { exag: number };
  Estaticos: { congela(o: unknown, ...resto: unknown[]): void };
  Materiales: Materiales;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  /** 06_arboles: el grupo donde van las manchas de sombra; 07_follaje: su material y su geometría */
  gSombras: { add(o: unknown): void; remove(o: unknown): void };
  matSombra: { opacity: number };
  geoSombra: unknown;
  /** 07_follaje escribe su malla de sombras de olivos en la variable `instSombra` del legado: aquí se lee en cada uso */
  instSombra(): { count: number; visible: boolean; setMatrixAt(i: number, m: unknown): void; instanceMatrix: { needsUpdate: boolean } } | null | undefined;
  /** 15_tiempo: el reloj del mundo (tMundo es una primitiva que reescribe), el estado del tiempo (cur) y el nivel del sol */
  tMundo(): number;
  cur: { ms: number; nub: number; lluvia: number };
  nivelEn(ms: number, salida: NivelSol): NivelSol;
  /** 23_estacion: la estación elegida */
  EST: { activa: boolean; clima: { lluvia: number } | null };
  /** 02g: el presupuesto de VR; null si no está */
  VrPresupuesto?: { instancias(id: string, mallas: unknown[]): void; renueva(id: string): void; olvida(id: string): void } | null;
  /** el nivel del agua del arroyo sube y baja cada fotograma y lo leen 20_sonido y 22_huellas (la variable aguaNivel del legado) */
  ponAgua?: ((v: number) => void) | null;
}

export function creaPaisaje(d: DepsPaisaje) {
  const THREE = d.THREE, Estado = d.Estado, Estaticos = d.Estaticos, SRGB = d.SRGB, suelo = d.suelo, hash = d.hash, copas = d.copas;
  const PA: DatosPaisaje = d.D.paisaje || { edificios: [], tendido: { linea: [], postes: [] }, arroyo: { eje: [] }, arboles: [] };
  d.Materiales.define(MATERIAL_ARROYO, DEF_ARROYO);
  const materiales = d.Materiales.de(ID_PAISAJE);   // lo que cree este componente se libera con su libera()
  // los materiales que no cambian persisten entre un monta() y el siguiente; los de cada tejado y el del arroyo se rehacen
  const matMuro: T3 = materiales.estandar("MeshLambertMaterial", { color: 0xe6dfcf }), matPoste: T3 = materiales.estandar("MeshLambertMaterial", { color: 0x6b5a46 });
  const matCable: T3 = materiales.estandar("LineBasicMaterial", { color: 0x2a2d31 });
  const matTronco: T3 = materiales.estandar("MeshLambertMaterial", { color: 0x5a4636 }), matCopaArb: T3 = materiales.estandar("MeshLambertMaterial", { color: 0xffffff });
  const fijos: T3[] = [matMuro, matPoste, matCable, matTronco, matCopaArb];

  // --- el arroyo: un cauce seco que sigue el fondo del terreno y que solo corre con agua cuando llueve
  const uArroyo: UniformesArroyo = { uT: { value: 0 }, uAgua: { value: 0 }, uLuz: { value: 1 }, uArena: { value: new THREE.Color(0xa8977a) } };
  const EJES: Cualquiera[] = PA.arroyo.ejes || (PA.arroyo.eje && PA.arroyo.eje.length ? [PA.arroyo.eje] : []);   // uno o varios cauces (Hituelo tiene siete)
  const arb = PA.arboles, nA = arb.length;
  const olivasS = copas.filter(function (c) { return c.oliv; });

  // lo que se crea al montar (y se suelta al liberar)
  let gPaisaje: T3 = null, matArroyo: T3 = null, montado = false, colocado = false;   // colocado: ya se colocó alguna vez (si se vuelve a montar, se coloca de nuevo)
  let edifs: T3[] = [], postes: T3[] = [], cablesDer: Cualquiera[] = [], arroyos: Cualquiera[] = [];
  let geoCable: T3 = null, iTronco: T3 = null, iBlob: T3[] = [], geoBlob: T3 = null, instSombraPA: T3 = null;
  let ultSol = { alt: -9, az: -9 }, aguaNivel = 0, tSombra = 0, cambiaCasilla: (() => void) | null = null;
  const lvAgua: NivelSol = { s: { alt: 0, az: 0 }, d: 0 };   // lvAgua: el nivel del sol de actualizaPaisaje, el mismo objeto cada fotograma (AG-1.4c)
  const tmpA = new THREE.Object3D(), colA = new THREE.Color(), tmpS = new THREE.Object3D();
  const vr = d.VrPresupuesto || null;

  // --- edificios: paredes, tejado a dos aguas (si el LiDAR da cumbrera) con el color de la ortofoto y un zócalo que se hunde en la ladera
  function creaTejado(L: number, A: number, hA: number, hC: number, mat: T3): T3 {
    const v = new Float32Array([-L / 2, hA, -A / 2, L / 2, hA, -A / 2, L / 2, hA, A / 2, -L / 2, hA, A / 2, -L / 2, hC, 0, L / 2, hC, 0]);
    const ix = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(v, 3)); g.setIndex(ix); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; return m;
  }
  function poste(p: PoDatos): T3 {
    const alto = Math.max(6, p.zAlto - p.zBase), m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, alto, 8), matPoste);
    const tapa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), matPoste); tapa.position.y = alto / 2 - 0.35; m.add(tapa);
    m.userData = { p: p, alto: alto }; gPaisaje.add(m); postes.push(m); return m;
  }
  /** crea todo lo del paisaje y lo pone en la escena; idempotente. El componente lo llama al montarse. */
  function monta(): void {
    if (montado) return;
    montado = true;
    gPaisaje = new THREE.Group(); gPaisaje.name = "paisaje"; d.scene.add(gPaisaje);
    fijos.forEach(function (m) { materiales.adopta(m); });   // si se soltaron al liberar (materiales.libera() los olvida), vuelven a ser de este dueño
    edifs = []; postes = []; cablesDer = []; arroyos = []; iBlob = [];
    PA.edificios.forEach(function (e) {
      const g = new THREE.Group(), L = e.largo, A = e.ancho, hA = Math.max(2.6, e.hAlero), hC = Math.max(hA + 0.4, e.hCumbrera), prof = 2.2;
      const muro = new THREE.Mesh(new THREE.BoxGeometry(L, hA + prof, A), matMuro); muro.position.y = (hA - prof) / 2; g.add(muro);
      const tj = materiales.estandar("MeshLambertMaterial", { color: new THREE.Color().setRGB(e.color[0]! / 255 * 0.9, e.color[1]! / 255 * 0.85, e.color[2]! / 255 * 0.8, SRGB) });   // el color medido en la ortofoto está en sRGB; un material por tejado
      g.add(creaTejado(L + 0.5, A + 0.5, hA, hC, tj));
      g.userData = { e: e }; gPaisaje.add(g); edifs.push(g);
    });

    // --- el tendido: postes de madera y un hilo que sigue lo medido por el LiDAR
    PA.tendido.postes.forEach(poste);
    // la derivación hacia la nave: postes propios y un hilo por cada ramal, medidos del LiDAR (el último tramo hasta el tejado es estimado)
    (PA.tendido.derivaciones || []).forEach(function (dv) {
      dv.postes.forEach(poste);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(dv.linea.length * 3), 3));
      const l = new THREE.Line(g, matCable); gPaisaje.add(l); cablesDer.push({ g: g, linea: dv.linea });
    });
    geoCable = new THREE.BufferGeometry(); geoCable.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, PA.tendido.linea.length) * 3), 3));
    const cable = new THREE.Line(geoCable, matCable); gPaisaje.add(cable);   // los hilos, los árboles y los cauces se recortan: colocaPaisaje les calcula la esfera

    // --- los árboles que no son olivos: tronco y 2-3 masas de copa, con el tamaño medido
    iTronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 5), matTronco, Math.max(1, nA));
    // AG-1.12: masa de copa de 20 triángulos (antes 80; icosaedro de detalle 0). Normales de esfera (suaves, sin facetado) y escala 1/0,851 para que
    // sus puntas lleguen a 1 sobre los ejes, como el de detalle 1 (misma caja); forma ILUSTRATIVA
    geoBlob = new THREE.IcosahedronGeometry(1, 0);
    (function () { const p = geoBlob.attributes.position, n = geoBlob.attributes.normal, v = new THREE.Vector3(); for (let q = 0; q < p.count; q++) { v.fromBufferAttribute(p, q).normalize(); n.setXYZ(q, v.x, v.y, v.z); } n.needsUpdate = true; geoBlob.scale(1.1756, 1.1756, 1.1756); })();
    iBlob = [0, 1, 2].map(function () { return new THREE.InstancedMesh(geoBlob, matCopaArb, Math.max(1, nA)); });
    [iTronco].concat(iBlob).forEach(function (m) { gPaisaje.add(m); });   // r151: three calcula la esfera de una InstancedMesh una vez; colocaPaisaje la rehace al recolocarlas
    arb.forEach(function (a, i) {
      const t = hash(i * 7.3), c = a.tipo === "frutal" ? colA.setHSL(0.22 + 0.02 * t, 0.5, 0.36 + 0.06 * hash(i * 3.1)) : a.tipo === "arbusto" ? colA.setHSL(0.24 + 0.05 * t, 0.42, 0.34 + 0.1 * hash(i * 3.1)) : colA.setHSL(0.27 + 0.05 * t, 0.38, 0.2 + 0.09 * hash(i * 3.1));
      iBlob.forEach(function (m, k) { m.setColorAt(i, c.clone().offsetHSL(0, 0, (k - 1) * 0.03)); });
    });
    iBlob.forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    // Q0c-a: en VR, el escalón decide hasta qué distancia se dibujan (02g_vr_presupuesto; tronco y masas comparten índice). Las pruebas que cargan el módulo suelto no lo traen
    if (vr) vr.instancias(ID_ARBOLES_VR, [iTronco].concat(iBlob));

    // --- el arroyo (el material: la fábrica, «arroyo»; el ShaderMaterial de siempre)
    matArroyo = materiales.crea(MATERIAL_ARROYO, {
      uniforms: uArroyo, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    } as OpcArroyo);
    EJES.forEach(function (E) {
      if (E.length < 3) return;
      const pos = new Float32Array(E.length * 2 * 3), aV = new Float32Array(E.length * 2), aU = new Float32Array(E.length * 2), idx: number[] = [];
      let acc = 0;
      for (let i = 0; i < E.length; i++) {
        if (i) acc += Math.hypot(E[i][0] - E[i - 1][0], E[i][1] - E[i - 1][1]); aV[i * 2] = -1; aV[i * 2 + 1] = 1; aU[i * 2] = aU[i * 2 + 1] = acc;
        if (i < E.length - 1) { const a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aV", new THREE.BufferAttribute(aV, 1)); geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1)); geo.setIndex(idx);
      const malla = new THREE.Mesh(geo, matArroyo); malla.renderOrder = 3; gPaisaje.add(malla); arroyos.push({ geo: geo, E: E });
    });
    if (colocado) colocaPaisaje();   // un monta() posterior a liberar: vuelve a su sitio sin esperar a que cambie la exageración
    // la casilla «Paisaje» del menú lo enciende y apaga a la vista
    const c = d.$("cPaisaje");
    if (c) { cambiaCasilla = function () { gPaisaje.visible = c.checked; }; c.addEventListener("change", cambiaCasilla); }
  }

  // --- se coloca todo sobre el terreno (y se vuelve a colocar al cambiar la exageración vertical)
  function colocaPaisaje(): void {
    if (!montado) return;
    colocado = true;
    edifs.forEach(function (g) { const e = g.userData.e; g.position.set(e.x, suelo(e.x, e.y) * Estado.exag, -e.y); g.rotation.y = e.ang; });
    postes.forEach(function (m) { const p = m.userData.p, gz = suelo(p.x, p.y) * Estado.exag; m.position.set(p.x, gz + m.userData.alto / 2, -p.y); });
    const L = PA.tendido.linea, pa = geoCable.attributes.position; L.forEach(function (q, i) { pa.setXYZ(i, q[0], q[2]! * Estado.exag, -q[1]!); }); pa.needsUpdate = true;
    cablesDer.forEach(function (c) { const pp = c.g.attributes.position; c.linea.forEach(function (q: number[], i: number) { pp.setXYZ(i, q[0], q[2]! * Estado.exag, -q[1]!); }); pp.needsUpdate = true; });
    arb.forEach(function (a, i) {
      const gz = suelo(a.x, a.y) * Estado.exag, h = a.h, r = a.r;
      tmpA.rotation.set(0, 0, 0); tmpA.scale.set(1, 1, 1);
      if (a.tipo === "arbusto") {
        tmpA.position.set(a.x, -100, -a.y); tmpA.scale.set(0.01, 0.01, 0.01); tmpA.updateMatrix(); iTronco.setMatrixAt(i, tmpA.matrix);
        [[0, 0.5, 1.0, 0.7], [0.4, 0.38, 0.7, 0.6], [-0.4, 0.62, 0.65, 0.55]].forEach(function (b, k) { tmpA.position.set(a.x + b![0]! * r * 0.5, gz + h * b![1]!, -a.y + b![0]! * r * 0.3); tmpA.scale.set(r * b![2]!, h * b![3]! * 0.5 + 0.3, r * b![2]!); tmpA.updateMatrix(); iBlob[k]!.setMatrixAt(i, tmpA.matrix); });
      } else {
        const hT = h * 0.42; tmpA.position.set(a.x, gz + hT / 2, -a.y); tmpA.scale.set(Math.min(0.9, 0.5 + h * 0.03), hT, Math.min(0.9, 0.5 + h * 0.03)); tmpA.updateMatrix(); iTronco.setMatrixAt(i, tmpA.matrix);
        [[0, 0.62, 1.0, 0.34], [0.3, 0.78, 0.74, 0.26], [-0.28, 0.5, 0.78, 0.26]].forEach(function (b, k) {
          tmpA.position.set(a.x + b![0]! * r * 0.6, gz + h * b![1]!, -a.y - b![0]! * r * 0.4); tmpA.scale.set(r * b![2]!, h * b![3]!, r * b![2]!); tmpA.updateMatrix(); iBlob[k]!.setMatrixAt(i, tmpA.matrix);
        });
      }
    });
    iTronco.instanceMatrix.needsUpdate = true; iBlob.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
    arroyos.forEach(function (ar) {
      const E = ar.E, p2 = ar.geo.attributes.position;
      for (let i = 0; i < E.length; i++) {
        const a = E[Math.max(0, i - 1)], b = E[Math.min(E.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, w = E[i][3] / 2 + 0.8;
        [[-1, 0], [1, 1]].forEach(function (s) { const px = E[i][0] + nx * w * s[0]!, py = E[i][1] + ny * w * s[0]!; p2.setXYZ(i * 2 + s[1]!, px, (suelo(px, py) + 0.1) * Estado.exag, -py); });
      }
      p2.needsUpdate = true;
    });
    // las esferas, DESPUÉS de escribir vértices e instancias con la exageración puesta (three solo las calcula si valen null): se recortan sin perder nada.
    // Una geometría con vértices no finitos (un cauce sin anchura, como el del fixture) no se recorta, como antes: three avisaría con un error por cada cálculo
    function esferaSegura(g: T3): void {
      const a = g.attributes.position.array; let ok = true;
      for (let q = 0; q < a.length; q++) if (!isFinite(a[q])) { ok = false; break; }
      if (ok) g.computeBoundingSphere(); else g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    }
    esferaSegura(geoCable); cablesDer.forEach(function (c) { esferaSegura(c.g); });
    iTronco.computeBoundingSphere(); iBlob.forEach(function (m) { m.computeBoundingSphere(); }); arroyos.forEach(function (ar) { esferaSegura(ar.geo); });
    Estaticos.congela(gPaisaje);   // AG-1.15: edificios, postes, hilos, cauces y árboles ya están en su sitio: sin recomponer la matriz en cada render()
    if (vr) vr.renueva(ID_ARBOLES_VR);   // Q0c-a: la copia nueva (y, en VR, el recorte otra vez)
    sombrasSol(true);
  }

  // --- las sombras de los árboles y los edificios siguen al sol: más largas y más suaves cuanto más bajo está
  function sombrasSol(forzar?: boolean): void {
    const lv = d.nivelEn(d.cur.ms, { s: { alt: 0, az: 0 }, d: 0 }), alt = lv.s.alt, az = lv.s.az, nub = d.cur.nub / 100;
    d.matSombra.opacity = Math.max(0, Math.min(1, (Math.sin(alt) - 0.03) * 4)) * (1 - 0.75 * nub);
    const ver = d.matSombra.opacity > 0.02, instSombra = d.instSombra(); if (instSombra) instSombra.visible = ver; if (instSombraPA) instSombraPA.visible = ver;
    if (!forzar && Math.abs(alt - ultSol.alt) < 0.012 && Math.abs(az - ultSol.az) < 0.012) return;
    ultSol.alt = alt; ultSol.az = az;
    const ta = Math.tan(Math.max(alt, 0.09)), dx = -Math.sin(az), dz = Math.cos(az), th = Math.atan2(dx, dz);
    function pon(inst: T3, i: number, x: number, y: number, r: number, h: number): void {
      const largo = Math.min(26, r * 2 + Math.max(0, h - 1.2) / ta), desp = Math.max(0, h - 1.2) / ta / 2;
      tmpS.position.set(x + dx * desp, (suelo(x, y) + 0.06) * Estado.exag, -y + dz * desp); tmpS.rotation.set(0, th, 0); tmpS.scale.set(r * 2.3, 1, largo); tmpS.updateMatrix(); inst.setMatrixAt(i, tmpS.matrix);
    }
    if (instSombra) { olivasS.forEach(function (t, i) { if (i >= instSombra.count) return; const rm = t.perfil.reduce(function (a, b) { return a + b; }, 0) / 8 * d.ESC_R8; pon(instSombra, i, t.x, t.y, rm, t.h); }); instSombra.instanceMatrix.needsUpdate = true; }
    if (!instSombraPA) { instSombraPA = new THREE.InstancedMesh(d.geoSombra, d.matSombra, nA + edifs.length + 1); d.gSombras.add(instSombraPA); Estaticos.congela(instSombraPA); }
    let n = 0; arb.forEach(function (a) { pon(instSombraPA, n++, a.x, a.y, a.r, a.h); }); edifs.forEach(function (g) { const e = g.userData.e; pon(instSombraPA, n++, e.x, e.y, Math.max(e.largo, e.ancho) * 0.55, e.hCumbrera); });
    instSombraPA.count = n; instSombraPA.instanceMatrix.needsUpdate = true; instSombraPA.computeBoundingSphere();   // la esfera tras recolocarlas: se recortan
  }

  // --- el agua del arroyo sube con la lluvia y baja despacio
  function actualizaPaisaje(dt: number): void {
    if (!montado) return;
    const llueve = d.cur.lluvia > 0.3 || (d.EST.activa && d.EST.clima && d.EST.clima.lluvia >= 12);   // o una semana lluviosa en la estación elegida
    aguaNivel += llueve ? (1 - aguaNivel) * Math.min(1, dt * 0.18) : -aguaNivel * Math.min(1, dt * 0.03);
    uArroyo.uAgua.value = aguaNivel < 0.02 ? 0 : aguaNivel; uArroyo.uT.value = d.tMundo(); uArroyo.uLuz.value = 0.22 + 0.78 * d.nivelEn(d.cur.ms, lvAgua).d;
    if (d.ponAgua) d.ponAgua(aguaNivel);
    const c = d.$("cPaisaje"); if (c) gPaisaje.visible = c.checked;
    tSombra += dt; if (tSombra > 0.4) { tSombra = 0; sombrasSol(false); }
  }

  // los puntos de los cauces en una lista plana y la distancia al más cercano (los usan el suelo, 21, y el sonido del agua; vivían en 20_sonido)
  const ejeArroyo: number[][] = []; EJES.forEach(function (E) { E.forEach(function (e: number[]) { ejeArroyo.push([e[0]!, e[1]!]); }); });
  // La distancia al cauce más cercano, por una rejilla de 64 m (AG-1.4c): mismo resultado que recorrer el eje entero con Math.hypot, sin recorrerlo entero.
  // OJO, heredado y conservado: el bucle original avanzaba `i += 2` sobre la lista de pares [x, y], de modo que solo cuentan los puntos de índice par (la mitad del eje).
  // Si es un defecto o una decimación a propósito no consta en el repo: no se corrige aquí (cambiaría las cifras); queda anotado en el informe de AG-1.4c.
  const ejeCel = 64, ejePX = new Float64Array(Math.ceil(ejeArroyo.length / 2)), ejePY = new Float64Array(ejePX.length);
  let ejeNX = 1, ejeNY = 1, ejeX0 = 0, ejeY0 = 0, ejeIni: Int32Array | null = null, ejePts: Int32Array | null = null;
  function celdaArroyo(x: number, y: number): number { let cx = Math.floor((x - ejeX0) / ejeCel), cy = Math.floor((y - ejeY0) / ejeCel); if (cx < 0) cx = 0; else if (cx >= ejeNX) cx = ejeNX - 1; if (cy < 0) cy = 0; else if (cy >= ejeNY) cy = ejeNY - 1; return cy * ejeNX + cx; }
  (function () {
    const n = ejePX.length; let x1 = -1e18, y1 = -1e18; if (!n) return;
    ejeX0 = 1e18; ejeY0 = 1e18;
    for (let i = 0; i < n; i++) { ejePX[i] = ejeArroyo[i * 2]![0]!; ejePY[i] = ejeArroyo[i * 2]![1]!; if (ejePX[i]! < ejeX0) ejeX0 = ejePX[i]!; if (ejePY[i]! < ejeY0) ejeY0 = ejePY[i]!; if (ejePX[i]! > x1) x1 = ejePX[i]!; if (ejePY[i]! > y1) y1 = ejePY[i]!; }
    ejeNX = Math.floor((x1 - ejeX0) / ejeCel) + 1; ejeNY = Math.floor((y1 - ejeY0) / ejeCel) + 1;
    ejeIni = new Int32Array(ejeNX * ejeNY + 1); ejePts = new Int32Array(n);
    for (let i = 0; i < n; i++) ejeIni[celdaArroyo(ejePX[i]!, ejePY[i]!) + 1]!++;
    for (let c = 0; c < ejeNX * ejeNY; c++) ejeIni[c + 1]! += ejeIni[c]!;
    const pos = ejeIni.slice(0, ejeNX * ejeNY);
    for (let i = 0; i < n; i++) ejePts[pos[celdaArroyo(ejePX[i]!, ejePY[i]!)]!++] = i;
  })();
  function celdaArroyoDist(c: number, x: number, y: number, m: number): number { for (let k = ejeIni![c]!, f = ejeIni![c + 1]!; k < f; k++) { const p = ejePts![k]!, dd = Math.hypot(ejePX[p]! - x, ejePY[p]! - y); if (dd < m) m = dd; } return m; }
  function distArroyo(x: number, y: number): number {
    let m = 1e9; if (!ejePX.length) return m;
    let cx = Math.floor((x - ejeX0) / ejeCel), cy = Math.floor((y - ejeY0) / ejeCel); if (cx < 0) cx = 0; else if (cx >= ejeNX) cx = ejeNX - 1; if (cy < 0) cy = 0; else if (cy >= ejeNY) cy = ejeNY - 1;
    const rMax = Math.max(ejeNX, ejeNY);
    for (let r = 0; r <= rMax; r++) {
      if (r > 1 && m < (r - 1) * ejeCel - 1e-6) break;   // lo no visitado (anillos ≥ r) está a ≥ (r-1)·64 m, también si el punto cae fuera de la rejilla
      const ya = cy - r, yb = cy + r, xa = cx - r, xb = cx + r;
      for (let yy = ya < 0 ? 0 : ya; yy <= yb && yy < ejeNY; yy++) {
        if (yy === ya || yy === yb) { for (let xx = xa < 0 ? 0 : xa; xx <= xb && xx < ejeNX; xx++) m = celdaArroyoDist(yy * ejeNX + xx, x, y, m); }
        else { if (xa >= 0) m = celdaArroyoDist(yy * ejeNX + xa, x, y, m); if (xb < ejeNX && xb !== xa) m = celdaArroyoDist(yy * ejeNX + xb, x, y, m); }
      }
    }
    return m;
  }

  /** lo que suelta el componente al apagarse (L2-05): el grupo de la escena, todas las geometrías y los InstancedMesh, los materiales (el del arroyo y los de los tejados con
   *  ellos), la malla de sombras que añadió al grupo de 06_arboles, la fuente del presupuesto de VR y el oyente de la casilla */
  function libera(): void {
    if (!montado) return;
    if (cambiaCasilla) { const c = d.$("cPaisaje"); if (c) c.removeEventListener("change", cambiaCasilla); cambiaCasilla = null; }
    if (vr) vr.olvida(ID_ARBOLES_VR);
    d.scene.remove(gPaisaje);
    gPaisaje.traverse(function (o: T3) { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); });
    if (instSombraPA) { d.gSombras.remove(instSombraPA); instSombraPA.dispose(); instSombraPA = null; }
    materiales.libera();   // el del arroyo, uno por tejado y los fijos (que vuelven a adoptarse al montar)
    gPaisaje = null; matArroyo = null; edifs = []; postes = []; cablesDer = []; arroyos = []; iTronco = null; iBlob = []; geoCable = null; geoBlob = null;
    ultSol = { alt: -9, az: -9 }; tSombra = 0; montado = false;
  }

  monta();
  return {
    monta, libera, colocaPaisaje, sombrasSol, actualizaPaisaje, distArroyo, ejeArroyo, matTronco, materiales,
    /** el legado declara las variables instSombra (la pone 07_follaje) y aguaNivel (la mueve actualizaPaisaje, por ponAgua) con estos valores iniciales */
    instSombra: null as unknown, aguaNivel: 0,
    agua: function (): number { return aguaNivel; },
    grupo: function (): T3 { return gPaisaje; },
    sombrasPA: function (): T3 { return instSombraPA; },
    resumen: function (): { edificios: number; postes: number; arboles: number; cauces: number; montado: boolean } { return { edificios: edifs.length, postes: postes.length, arboles: nA, cauces: arroyos.length, montado }; },
  };
}
export type Paisaje = ReturnType<typeof creaPaisaje>;

/** El manifiesto del componente «paisaje»: el ciclo de vida del paisaje. El objeto que el motor usa es el mismo que monta (lo crea el legado al cargarse: 08_marcadores,
 *  20_sonido y 21_suelo lo nombran). Se monta de nuevo (monta()) si el exterior se libera y vuelve a entrar. */
export function manifiestoPaisaje(paisaje: Paisaje): Manifiesto {
  return {
    id: ID_PAISAJE, version: 1,
    consume: ["Materiales", "Estaticos", "gSombras", "matSombra", "geoSombra", "cur", "nivelEn", "EST"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // solo ciclo de vida: lo que dibuja (muros, tejados, postes, hilos, cauces y 4 InstancedMesh de árboles) lo cuenta pruebas/presupuesto.json; la casilla «Paisaje» lo apaga a la vista
    mundos: ["exterior"],
    monta: function () { paisaje.monta(); return paisaje; },
    libera: function (api) { if (api) (api as Paisaje).libera(); }
  };
}
