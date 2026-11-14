// La presencia compartida (F2, contratos/presencia.md v1), componente «presencia-compartida» (C5, ADR-0023; MU5-n, A3-6a: antes apps/web/motor/38_presencia_compartida.js,
// que queda como talón). Movida tal cual: los mismos muñecos instanciados, la misma simulación, la misma sala «visita» de la red, el mismo panel Gente y chat.
// Componente de TODO mundo (mundos: "todos", COMPONENTES §3.2): la gente que ves no cambia al cruzar una puerta (la sala por mundo es de MU3, MUNDOS §7.1). Dibuja,
// así que vive en mundos/comun/ y no en red/ (MUNDOS §1): importa three por argumento y la pose y la sala de red/. Su libera() suelta de verdad las mallas, sus
// geometrías y materiales, la textura del atlas de nombres y su lienzo, el panel (DOM) y su observador, los relojes del reintento, las escuchas de los mandos y de
// la sala, el tipo «persona» de Entidades y sale de la sala; el gancho window.__presencia sigue contestando (activo: false), como antes de C5.
// Del legado recibe por argumento lo que necesita (DepsPresencia); lo que otros módulos reescriben o se carga después, por getters del talón (dp.<nombre>).
import { BufferPose, PoseCodec } from "../../red/pose.ts";
import { Aspecto, AutoPresencia, Chat, Reintento, SalaPose } from "../../red/sala.ts";
import { Muneco } from "./muneco.ts";
import { columnaInstancia } from "./instancia-tsl.ts";

/** Lo que el legado le da (el talón de 38_presencia_compartida.js). Los de solo lectura cambian en el legado: el talón los da con getters. */
export interface DepsPresencia {
  THREE: any;
  location: { search: string; href?: string };
  window: any;
  document: any;
  fetch(url: string, opc?: unknown): Promise<any>;
  consola: { warn(...a: unknown[]): void } | null;
  /** el import() de three/addons/utils/BufferGeometryUtils.js (escrito en el talón: Vite lo trocea como antes) */
  utilesGeometria(): Promise<any>;
  D: any; ConfigPuro: any; Aparato: any; Materiales: any; Entidades: any; Componentes: any;
  suelo(x: number, y: number): number;
  scene: any; camera: any; renderer: any; texColor(t: any): any; Estado: any; visor: any;
  quad: any; dron: any;
  sitioJunto(t: unknown, desde: unknown, dists: unknown, rTronco: unknown): any;
  readonly objetivo: any; readonly paseando: boolean; readonly pp: any; readonly enQuad: boolean; readonly enDron: boolean;
  readonly VRX: any; readonly Ajustes: any; readonly Movibles: any; readonly Llegada: any; readonly TR: any;
  /** el mundo activo del gestor (gm.actual; el gestor se crea después, va por función). Sin esto, o «exterior», la presencia es la de siempre; en cualquier otro (un interior, o null mientras se cambia) no publica pose ni dibuja a nadie: las poses van en coordenadas del exterior (T0, eje B) */
  mundoActual?(): string | null;
}
export const ID_PRESENCIA = "presencia-compartida";

/** MU5-n (A3-6a, segundo commit): el material de los nombres por la fábrica (MATERIALES §5). El clásico es el ShaderMaterial de siempre, movido sin tocar: un plano
 *  instanciado vuelto hacia la cámara en el sombreador y su celda del atlas por instancia (aCelda). Los uniformes (el atlas y la rejilla) llegan en opc.uniforms. */
export const MATERIAL_NOMBRES = "nombres-presencia";
export function defNombres() {
  return {
    clasico: function (opc: { uniforms: Record<string, { value: unknown }> }, c: { THREE: any }) {
      return new c.THREE.ShaderMaterial({
        uniforms: opc.uniforms, transparent: true, depthWrite: false, fog: false,
        vertexShader: "attribute float aCelda; uniform vec2 uRej; varying vec2 vUv;\n" +
          "void main(){ vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float e = length(instanceMatrix[0].xyz); c.xy += position.xy * e; gl_Position = projectionMatrix * c;\n" +
          " float col = mod(aCelda, uRej.x), fila = floor(aCelda / uRej.x); vUv = vec2((col + uv.x) / uRej.x, 1.0 - (fila + 1.0 - uv.y) / uRej.y); }",
        fragmentShader: "uniform sampler2D uMapa; varying vec2 vUv;\nvoid main(){ vec4 t = texture2D(uMapa, vUv); if (t.a < 0.04) discard; gl_FragColor = t;\n#include <colorspace_fragment>\n}"
      });
    },
    // MU5-n (A3-6a, tercer commit) y A4-0: la variante TSL, APAGADA (solo la daría la fábrica con el WebGPURenderer, MU6; hoy nadie la usa; MATERIALES §13.1).
    // Un MeshBasicNodeMaterial transparente, sin escribir profundidad y sin niebla, con la celda del atlas de cada instancia (aCelda) leída del MISMO atlas y la MISMA
    // rejilla (los { value } de opc.uniforms: la textura y el Vector2 son los objetos del componente) y el descarte por alfa (alphaTest 0,04, el «t.a < 0.04» del GLSL).
    // A4-0: de cara a la cámara, como el vertexShader del clásico (vertexNode: el centro de la instancia en la vista y la esquina por la escala de la instancia), con la
    // matriz de instancia de su copia (comun/instancia-tsl.ts, coste sin medir). En VR tendría que ser POR OJO (multiview), pero la VR no usará la TSL (el Quest se queda
    // en super-three, decisión 231): no se ha comprobado y no hace falta. Se compara en MU6.
    tsl: function (opc: { uniforms: Record<string, { value: any }> }, c: { THREE: any; TSL: any }) {
      const T = c.TSL, u = opc.uniforms, mapa = u["uMapa"]!.value, rej = T.uniform(u["uRej"]!.value);   // el mismo Vector2: si la rejilla cambia, la TSL la ve
      const celda = T.attribute("aCelda", "float"), col = T.mod(celda, rej.x), fila = T.floor(celda.div(rej.x));
      const vUv = T.vec2(col.add(T.uv().x).div(rej.x), T.float(1).sub(fila.add(1).sub(T.uv().y).div(rej.y)));
      const t = T.texture(mapa, vUv);
      const m = new c.THREE["MeshBasicNodeMaterial"]({ transparent: true, depthWrite: false, fog: false, alphaTest: 0.04 });
      m.colorNode = t.rgb; m.opacityNode = t.a;
      // c = modelViewMatrix · instanceMatrix · (0, 0, 0, 1); e = |instanceMatrix[0].xyz|; c.xy += position.xy · e; gl_Position = projectionMatrix · c
      const c0 = columnaInstancia(c.THREE, T, 0), c3 = columnaInstancia(c.THREE, T, 3), cv = T.modelViewMatrix.mul(T.vec4(c3.xyz, 1)), e = T.length(c0.xyz);
      m.vertexNode = T.cameraProjectionMatrix.mul(T.vec4(cv.xy.add(T.positionGeometry.xy.mul(e)), cv.z, cv.w));
      return m;
    }
  };
}

// ---------- presencia compartida (F2, contratos/presencia.md), componente «presencia-compartida» (C5, ADR-0023): los demás visitantes como muñecos instanciados,
// su pose por el códec del contrato, su interpolación y, en la sala de verdad, el apartado Gente y el chat. La lógica pura (códec, búfer, SalaPose, chat,
// aspecto, muñeco, Encuentro) vive en 26_presencia.js; la conexión, en el componente de la red (37_red.js): esta pieza no sabe nada de LiveKit.
// Dos variantes, cada una con su bandera:
//  · ?presencia=sim (y &n=1..64; por defecto 10): visitantes simulados que pasean, mandan su pose por el códec a la tasa que toca según la distancia
//    (10 Hz cerca, 2 Hz lejos) a través de una red de mentira (retardo 30-90 ms, 1 % de pérdida) y se dibujan con el búfer de interpolación.
//  · ?presencia=red: la sala de verdad, la sala «visita» de la red. Pide el token a la api (POST /api/presencia/token), publica su pose (no fiable, tema
//    «pose», 10 Hz a los cercanos y 2 Hz a todos) mientras pasea o va con gafas; en vista aérea no la publica y sale en Gente «en vista aérea»
//    (decisión 60). Panel Gente con bloquear (solo para ti) y chat por el canal fiable (tema «chat», no se guarda; decisión 40).
// F2b: sin ?presencia= y con api (D.base /teselas/… o ?api=), la variante «red» arranca sola si GET /api/presencia dice { red: true } (el servidor tiene LiveKit); ?presencia=0 la apaga.
// Sin ninguna de las dos ni api, montada no crea nada ni añade nada a la escena ni a la página (salvo los ganchos de pruebas): el motor dibuja lo mismo que sin ella.
// Los avatares VRM (26b_avatares.js) son otro componente que consume este: se enganchan con enganchaVRM y la presencia les pasa cada persona que dibuja.
export function creaPresencia(dp: DepsPresencia, n?: any, R?: any) {
  // del legado, por argumento (A3-6a): lo que no cambia, aquí; lo que otros módulos reescriben o se carga después (objetivo, paseando, pp, enQuad, enDron, VRX,
  // Ajustes, Movibles), se lee de dp en cada uso (getters del talón)
  const THREE = dp.THREE, location = dp.location, window = dp.window, document = dp.document, fetch = dp.fetch, console: any = dp.consola || { warn: function () {} };
  const D = dp.D, ConfigPuro = dp.ConfigPuro, Aparato = dp.Aparato, suelo = dp.suelo, scene = dp.scene, camera = dp.camera, renderer = dp.renderer, texColor = dp.texColor;
  const Estado = dp.Estado, quad = dp.quad, dron = dp.dron, Materiales = dp.Materiales, Entidades = dp.Entidades;
  const Componentes = dp.Componentes, visor = dp.visor, sitioJunto = dp.sitioJunto;
  var observa: any = null;   // A3-6a: el MutationObserver del chat en móvil vertical, para desconectarlo al liberar
  Materiales.define(MATERIAL_NOMBRES, defNombres());   // (aquí y no al cargar: el manifiesto se pide sin dependencias para medirlo)
  const materiales = Materiales.de(ID_PRESENCIA);     // MU5-n (A3-6a): lo que cree este componente se libera con su libera()
  var fueraOculto: any = false;   // T0: grupos ocultos porque quien mira está en un interior
  var vrmG: any = null;   // el gancho de los avatares VRM (26b_avatares.js), si están montados
  var variante: any = (/[?&]presencia=(sim|red)\b/.exec(location.search) || [])[1] || "", activo: any = !!variante, N: any = 0;
  // F2b: sin ?presencia= y con api, la presencia en red arranca sola si el servidor tiene LiveKit (GET /api/presencia -> { red: true }) y la casilla de Ajustes está marcada
  var PREFIJO_API: any = (function () { try { return ConfigPuro.prefijoApi(location.search, D && D.base); } catch (e: any) { return null; } })(), auto: any = false;
  // F2b: si la presencia que arrancó sola no consigue conectar (la api o LiveKit no responden), el mundo sigue igual y callado (solo la línea de ?debug); se reintenta con backoff (Reintento)
  var fallosAuto: any = 0, tReintento: any = 0, avisoAuto: any = "", reintentaAuto: any = null;
  function fallaAuto(motivo?: any) {
    avisoAuto = motivo; fallosAuto++;
    var ms: any = Reintento.espera(fallosAuto); if (ms < 0 || !reintentaAuto || typeof setTimeout !== "function") return;
    if (tReintento) clearTimeout(tReintento);
    tReintento = setTimeout(function () { tReintento = 0; reintentaAuto(); }, ms);
  }
  var CERCA_ENTRA: any = 55, CERCA_SALE: any = 65, TICK: any = 0.1, CADA_LEJOS: any = 5, RET_CERCA: any = 150, RET_LEJOS: any = 650, ALTO_OJOS: any = 1.6;   // contratos/presencia.md
  var MAXV: any = 49;   // red: plazas de avatar (la sala admite 50 personas, infra/dev/livekit.yaml: tú y 49 más)
  var grupo: any = null, mCuerpo: any = null, mCabeza: any = null, mSombrero: any = null, mManos: any = null, mNombres: any = null, texNombres: any = null, cxNom: any = null, geos: any = [], mats: any = [];
  var V: any = [], redSim: any = [], est: any = { n: 0, cerca: 0, quest: 0, enviados: 0, recibidos: 0, perdidos: 0, viejos: 0, bytes: 0, bps: 0, ms: 0, msMax: 0, retP95: 0, errP95: 0 };
  var muestrasRet: any = [], muestrasErr: any = [], tEst: any = 0, bytesVentana: any = 0, msVentana: any = 0;
  var semilla: any = 20261029;
  function azar() { semilla = (semilla + 0x6d2b79f5) | 0; var t: any = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  var ALIAS: any = ["Mirlo", "Abubilla", "Jilguero", "Carbonero", "Alcaraván", "Verdecillo", "Golondrina", "Perdiz", "Abejaruco", "Cogujada", "Encina", "Lentisco", "Retama", "Acebuche", "Coscoja", "Romero", "Tomillo", "Jara", "Algarrobo", "Almendro"];
  var CAMISAS: any = Aspecto.CAMISAS, PIELES: any = Aspecto.PIELES, SOMBREROS: any = [null, { c: 0xd9bf6a, w: 0.46, h: 0.07, d: 0.46, z: 0 }, { c: 0x2e5d34, w: 0.3, h: 0.09, d: 0.36, z: -0.04 }];
  var m4: any = null, m4b: any = null, q1: any = null, v1: any = null, v2: any = null, vS: any = null, ejeY: any = null, cNom: any = 4, fNom: any = 1, matSombreroLocal: any = [];
  var mallasInst: any = [];
  var girosT: any = [0, 0, 0, 0, 0];   // los giros de las cinco piezas del muñeco en este avatar (reutilizado por avatar y fotograma; AG-1.4)
  var NP: any = Muneco.PIEZAS.length, PANTALON: any = Aspecto.PANTALON, mBase: any = null, mPieza: any = null, ejeX: any = null, outMu: any = {};   // pantalón: el del paseante, si la persona no eligió otro
  // AV2 (decisión 131): los accesorios (sombrero y apoyo: asiento y respaldo de la silla, bastón, andador) son más instancias de la MISMA caja unidad del sombrero (0 llamadas nuevas) y las
  // ruedas de la silla, una malla instanciada más (1 llamada, y solo si alguien lleva silla). Cada persona toma las cajas y ruedas que necesita de una reserva; la malla dibuja hasta la última en uso
  var mRuedas: any = null, rCajas: any = null, rRuedas: any = null, vF: any = null, qI: any = null, vU: any = null, COLOR_APOYO: any = { silla: 0x4a4f55, baston: 0x5a3d22, andador: 0xa9b1b8 }, COLOR_RUEDA: any = 0x22262a;
  function reserva(malla?: any) {
    var oc: any = [], cap: any = malla.instanceMatrix.count;
    function fija() { var n: any = 0; for (var i: any = 0; i < cap; i++) if (oc[i]) n = i + 1; malla.count = n; malla.visible = n > 0; }
    fija();
    return {
      toma: function (n?: any) { var r: any = []; for (var i: any = 0; i < cap && r.length < n; i++) if (!oc[i]) { oc[i] = true; r.push(i); } fija(); return r; },
      suelta: function (r?: any) { for (var i: any = 0; i < r.length; i++) { oc[r[i]] = false; malla.setMatrixAt(r[i], m4.makeScale(0, 0, 0)); } malla.instanceMatrix.needsUpdate = true; fija(); }
    };
  }
  // AG-1.3b: el volumen envolvente de una malla instanciada, rehecha cada fotograma DESPUÉS de escribir sus matrices (three solo la calcula una vez, cuando vale null: con count 0
  // o con todo a escala 0 quedaría vacía o mal puesta para siempre). Las instancias a escala 0 (ocultas, sin pose) no cuentan: en three su centro sería el origen del mundo y lo abrirían hasta allí
  var esS: any = null, esM: any = null;
  function esferaInst(m?: any) {
    var g: any = m.geometry, b: any = m.boundingSphere, i: any, sc: any;
    if (!esS) { esS = new THREE.Sphere(); esM = new THREE.Matrix4(); }
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!b) b = m.boundingSphere = new THREE.Sphere();
    b.makeEmpty();
    for (i = 0; i < m.count; i++) {
      m.getMatrixAt(i, esM); sc = esM.getMaxScaleOnAxis(); if (!(sc > 0)) continue;
      esS.copy(g.boundingSphere).applyMatrix4(esM); if (b.isEmpty()) b.copy(esS); else b.union(esS);
    }
    if (b.isEmpty()) b.radius = 0;   // nada que dibujar: un volumen de un punto
  }
  // las cajas y ruedas de a según su sombrero y su apoyo; a.iSom = la caja del sombrero (o −1) y a.iApoyo = la primera del apoyo en a.cajas
  // OF10: la oficina pide una caja más, la última, para su insignia (a.iIns; −1 si no es oficina o si la reserva se quedó corta)
  function tomaAccesorios(a?: any) {
    var nc: any = Aspecto.cajas(a.sombrero, a.mov, a.oficial);
    a.cajas = rCajas.toma(nc); a.ruedas = a.mov === "silla" ? rRuedas.toma(2) : [];
    a.iSom = a.sombrero ? a.cajas[0] : -1; a.iApoyo = a.sombrero ? 1 : 0;
    a.iIns = a.oficial && a.cajas.length === nc ? a.cajas[nc - 1] : -1;
  }
  function sueltaAccesorios(a?: any) { if (a.cajas) rCajas.suelta(a.cajas); if (a.ruedas) rRuedas.suelta(a.ruedas); a.cajas = []; a.ruedas = []; a.iSom = -1; a.iIns = -1; }
  // P6: el quad y el dron de los demás, el mismo modelo del paseante local (16_vida.js) fundido en una sola malla con color por vértice e instanciado:
  // una llamada para todos los quads y otra para todos los drones, y solo si alguien los lleva (si no, la malla no se dibuja)
  var mQuad: any = null, mDron: any = null, nVehQ: any = 0, nVehD: any = 0, vEsc: any = null, tVeh: any = 0, DRON_DELANTE: any = 5, DRON_ALTO: any = 4, DRON_ESC: any = 1.8;

  // ---- los avatares (los mismos en las dos variantes): cuerpo, cabeza, sombrero, manos y nombre, instanciados (5 llamadas de dibujo tengas los que tengas)
  function montaGrafica(nCuerpos?: any, nSom?: any, nManos?: any) {
    mBase = new THREE.Matrix4(); mPieza = new THREE.Matrix4(); ejeX = new THREE.Vector3(1, 0, 0);
    m4 = new THREE.Matrix4(); m4b = new THREE.Matrix4(); q1 = new THREE.Quaternion(); v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); vS = new THREE.Vector3(1, 1, 1); ejeY = new THREE.Vector3(0, 1, 0);
    vF = new THREE.Vector3(1, 1, 1); qI = new THREE.Quaternion(); vU = new THREE.Vector3(1, 1, 1);
    grupo = new THREE.Group(); grupo.name = "presencia"; scene.add(grupo);
    // el muñeco del paseante (12_paseo.js): cuerpo, dos piernas y dos brazos son la MISMA caja unidad con el pivote arriba,
    // escalada y girada por instancia (Muneco.PIEZAS): 5 instancias por avatar en una sola llamada; color por instancia
    // (camisa en cuerpo y brazos, pantalón en las piernas). La cabeza, una bola baja (icosaedro: 20 triángulos)
    var gC: any = new THREE.BoxGeometry(1, 1, 1); gC.translate(0, -0.5, 0);
    var gCab: any = new THREE.IcosahedronGeometry(0.135, 0), gSom: any = new THREE.BoxGeometry(1, 1, 1), gMano: any = new THREE.BoxGeometry(0.08, 0.08, 0.13), gNom: any = new THREE.PlaneGeometry(1.6, 0.3);
    var matC: any = materiales.estandar("MeshLambertMaterial", { flatShading: true }), matL: any = materiales.estandar("MeshLambertMaterial", { flatShading: true });
    var gRueda: any = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10); gRueda.rotateZ(Math.PI / 2);   // la rueda de la silla, con el eje en x (10 lados: 40 triángulos)
    geos = [gC, gCab, gSom, gMano, gNom, gRueda]; mats = [matC, matL];
    mCuerpo = new THREE.InstancedMesh(gC, matC, nCuerpos * NP); mCabeza = new THREE.InstancedMesh(gCab, matL, nCuerpos); mSombrero = new THREE.InstancedMesh(gSom, matL, nSom); mManos = new THREE.InstancedMesh(gMano, matL, nManos);
    mRuedas = new THREE.InstancedMesh(gRueda, matL, nCuerpos * 2);
    rCajas = reserva(mSombrero); rRuedas = reserva(mRuedas);   // sin nadie con sombrero ni silla, no se dibujan (count 0, invisible)
    SOMBREROS.forEach(function (s?: any, i?: any) { matSombreroLocal[i] = s ? new THREE.Matrix4().compose(new THREE.Vector3(0, 0.14 + s.h / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, s.d)) : null; });
    // nombres: un atlas con todos los alias y un plano instanciado vuelto hacia la cámara en el sombreador (una llamada para todos)
    fNom = Math.ceil(nCuerpos / cNom);
    var cv: any = document.createElement("canvas"); cv.width = 256 * cNom; cv.height = 48 * fNom;
    cxNom = cv.getContext("2d"); cxNom.font = "600 28px system-ui, sans-serif"; cxNom.textAlign = "center"; cxNom.textBaseline = "middle"; cxNom.lineJoin = "round";
    texNombres = texColor(new THREE.CanvasTexture(cv)); texNombres.minFilter = THREE.LinearFilter; texNombres.generateMipmaps = false;
    var celda: any = new Float32Array(nCuerpos); for (var q: any = 0; q < nCuerpos; q++) celda[q] = q;
    gNom.setAttribute("aCelda", new THREE.InstancedBufferAttribute(celda, 1));
    var matN: any = materiales.crea(MATERIAL_NOMBRES, { uniforms: { uMapa: { value: texNombres }, uRej: { value: new THREE.Vector2(cNom, fNom) } } });   // el clásico es el de siempre (defNombres)
    mats.push(matN);
    mNombres = new THREE.InstancedMesh(gNom, matN, nCuerpos); mNombres.renderOrder = 5;
    mallasInst = [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mRuedas];   // las que se marcan cada fotograma, ya en su lista (AG-1.4)
    mallasInst.forEach(function (m?: any) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grupo.add(m); });   // se recortan: su volumen se rehace cada fotograma con esferaInst (AG-1.3b)
    vEsc = new THREE.Vector3(DRON_ESC, DRON_ESC, DRON_ESC);
    cargaVehiculos(nCuerpos);
  }
  // el quad y el dron de los demás: las piezas opacas del modelo local (16_vida.js: quad, dron) en una sola geometría (mergeGeometries de three,
  // pedido con import() solo con la bandera) con el color de cada pieza en sus vértices. Hasta que llega, los de quad o dron se ven sin vehículo
  function cargaVehiculos(n?: any) {
    dp.utilesGeometria().then(function (U?: any) {   // el import() de BufferGeometryUtils, escrito en el talón (Vite lo trocea como antes)
      if (!grupo) return;
      mQuad = instanciaVehiculo(funde(quad, U), n); mDron = instanciaVehiculo(funde(dron, U), n);
    }).catch(function (e?: any) { if (typeof console !== "undefined") console.warn("presencia: sin quad ni dron de los demás (" + (e && e.message ? e.message : e) + ")"); });
  }
  function funde(g?: any, U?: any) {
    var partes: any = [], m: any = new THREE.Matrix4();
    g.traverse(function (o?: any) {
      if (!o.isMesh || !o.geometry || !o.material || o.material.transparent || !o.material.color) return;   // la sombra, el brillo y los discos de las hélices, no
      m.identity(); for (var p: any = o; p && p !== g; p = p.parent) { p.updateMatrix(); m.premultiply(p.matrix); }
      var ge: any = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      Object.keys(ge.attributes).forEach(function (k?: any) { if (k !== "position" && k !== "normal") ge.deleteAttribute(k); });
      ge.applyMatrix4(m);
      var nv: any = ge.attributes.position.count, col: any = new Float32Array(nv * 3), c: any = o.material.color;
      for (var i: any = 0; i < nv; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      ge.setAttribute("color", new THREE.BufferAttribute(col, 3)); partes.push(ge);
    });
    var r: any = U.mergeGeometries(partes, false); partes.forEach(function (x?: any) { x.dispose(); });
    return r;
  }
  function instanciaVehiculo(geo?: any, n?: any) {
    if (!geo) return null;
    var mat: any = materiales.estandar("MeshLambertMaterial", { vertexColors: true, flatShading: true }), im: any = new THREE.InstancedMesh(geo, mat, n);
    geos.push(geo); mats.push(mat);
    for (var i: any = 0; i < n; i++) im.setMatrixAt(i, m4.makeScale(0, 0, 0));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.visible = false; grupo.add(im);
    return im;
  }
  function pintaNombre(k?: any, alias?: any, oficial?: any) {   // la celda k del atlas; vacía si no hay alias. OF10: la oficina, «◆ Oficina» sobre verde oliva (su insignia, también de lejos)
    var x: any = (k % cNom) * 256 + 128, y: any = Math.floor(k / cNom) * 48 + 24;
    cxNom.clearRect(x - 128, y - 24, 256, 48);
    if (alias && oficial) alias = "◆ " + alias;
    if (alias) {
      var w: any = Math.min(248, cxNom.measureText(alias).width + 24);
      cxNom.fillStyle = oficial ? "rgba(92,104,26,0.94)" : "rgba(16,20,24,0.72)"; cxNom.beginPath(); if (cxNom.roundRect) cxNom.roundRect(x - w / 2, y - 19, w, 38, 12); else cxNom.rect(x - w / 2, y - 19, w, 38); cxNom.fill();
      cxNom.fillStyle = "#ffffff"; cxNom.fillText(alias, x, y + 1, 236);
    }
    texNombres.needsUpdate = true;
  }
  function colorea(a?: any) {
    var c: any = new THREE.Color();
    // OF10: con chaleco, el tronco (la pieza 0) en su color; los brazos siguen con la camisa
    for (var j: any = 0; j < NP; j++) mCuerpo.setColorAt(a.k * NP + j, c.setHex(Muneco.PIEZAS[j][5] ? (a.pantalon == null ? PANTALON : a.pantalon) : j === 0 && a.chaleco ? a.chaleco : a.camisa));
    mCabeza.setColorAt(a.k, c.setHex(a.piel));
    if (a.iSom >= 0) mSombrero.setColorAt(a.iSom, c.setHex(SOMBREROS[a.sombrero].c));
    if (a.cajas) for (var ja: any = a.iApoyo; ja < a.cajas.length; ja++) mSombrero.setColorAt(a.cajas[ja], c.setHex(a.cajas[ja] === a.iIns ? Aspecto.INSIGNIA : COLOR_APOYO[a.mov]));
    if (a.ruedas) for (var jr: any = 0; jr < a.ruedas.length; jr++) mRuedas.setColorAt(a.ruedas[jr], c.setHex(COLOR_RUEDA));
    if (a.iMano >= 0) { mManos.setColorAt(a.iMano, c.setHex(a.piel)); mManos.setColorAt(a.iMano + 1, c.setHex(a.piel)); }
    [mCuerpo, mCabeza, mSombrero, mManos, mRuedas].forEach(function (m?: any) { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
  function oculta(a?: any) {   // nada de ese avatar se ve (escala 0) hasta que llegue su pose
    m4.makeScale(0, 0, 0);
    for (var j: any = 0; j < NP; j++) mCuerpo.setMatrixAt(a.k * NP + j, m4);
    mCabeza.setMatrixAt(a.k, m4); mNombres.setMatrixAt(a.k, m4);
    a.mu = null;   // al volver, empieza quieto donde aparezca (no se desliza desde donde se fue)
    if (a.cajas) for (var jc: any = 0; jc < a.cajas.length; jc++) mSombrero.setMatrixAt(a.cajas[jc], m4);   // sombrero y apoyo
    if (a.ruedas) for (var jw: any = 0; jw < a.ruedas.length; jw++) mRuedas.setMatrixAt(a.ruedas[jw], m4);
    if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
    if (mQuad) mQuad.setMatrixAt(a.k, m4); if (mDron) mDron.setMatrixAt(a.k, m4);
    if (vrmG) vrmG.oculta(a);
    a.visto = false;
  }

  // ---- simulación (?presencia=sim)
  function inicia() {
    var p: any = (/[?&]n=(\d+)/.exec(location.search) || [])[1]; N = Math.max(1, Math.min(64, p ? Number(p) : 10)); est.n = N;
    // P6, solo para probar: &vehiculo=quad|dron|mixto pone a los simulados en quad, con el dron o un tercio de cada (sin él, todos a pie, como siempre)
    var veh: any = (/[?&]vehiculo=(quad|dron|mixto)\b/.exec(location.search) || [])[1] || "";
    // AV2, solo para probar: cada simulado lleva un aspecto repartido por su propio azar (semilla aparte: no cambia dónde pasean); &aspecto=0 los deja como antes (camisa y piel de antes, a pie, altura y complexión medias)
    var conAspecto: any = !/[?&]aspecto=0\b/.test(location.search), semA: any = 20261031;
    function azarA() { semA = (semA + 0x6d2b79f5) | 0; var t: any = Math.imul(semA ^ (semA >>> 15), 1 | semA); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function eligeUno(l?: any) { return l[Math.floor(azarA() * l.length)]; }
    var nQuest: any = 0;
    for (var k: any = 0; k < N; k++) {
      var sombrero: any = Math.floor(azar() * 3), quest: any = azar() < 0.3, cercano: any = k < Math.ceil(N / 2);
      var aliasK: any = ALIAS[k % ALIAS.length] + (k >= ALIAS.length ? " " + (1 + Math.floor(k / ALIAS.length)) : "");
      var u: any = azarA(), av: any = !conAspecto ? {} : { tono: Math.floor(azarA() * 10), arriba: Math.floor(azarA() * 10), abajo: Math.floor(azarA() * 10), altura: eligeUno(Object.keys(Aspecto.ALTURAS)), complexion: eligeUno(Object.keys(Aspecto.COMPLEXIONES)),
        movilidad: u < 0.12 ? "silla" : u < 0.22 ? "baston" : u < 0.28 ? "andador" : "pie" };
      var home: any = cercano ? { x: dp.objetivo.x + (azar() - 0.5) * 80, y: -dp.objetivo.z + (azar() - 0.5) * 80 } : { x: D.ext[0] + 10 + azar() * (D.ext[2] - D.ext[0] - 20), y: D.ext[3] + 10 + azar() * (D.ext[1] - D.ext[3] - 20) };
      var rCam: any = azar(), rPiel: any = azar();   // las dos tiradas de siempre (camisa y piel): se gastan igual para no cambiar el resto de la simulación
      var oficialK: any = k === 0 && /[?&]oficial=1(&|$)/.test(location.search);   // OF10, solo para probar: &oficial=1 hace oficina al primero (chaleco, insignia y «◆ Oficina»)
      if (oficialK) aliasK = "Oficina";
      var vest: any = Aspecto.viste({ alias: aliasK, camisa: Math.floor(rCam * CAMISAS.length), piel: conAspecto ? 1 : Math.floor(rPiel * 5), aspecto: Aspecto.lee(av), oficial: oficialK });
      V.push({
        k: k, alias: aliasK, quest: quest, oficial: vest.oficial, chaleco: vest.chaleco, iIns: -1,
        camisa: vest.camisa, piel: vest.piel, pantalon: vest.pantalon, fa: vest.fa, fc: vest.fc, mov: vest.mov, propioPiel: vest.propioPiel, propioCamisa: vest.propioCamisa,
        pelo: vest.pelo, receta: vest.receta,
        sombrero: sombrero, iSom: -1, iMano: quest ? (nQuest++) * 2 : -1,
        // emisor simulado: dónde está de verdad, adónde va, su reloj (u32, algunos a punto de dar la vuelta) y su secuencia
        home: home, x: home.x + (azar() - 0.5) * 20, y: home.y + (azar() - 0.5) * 20, dest: { x: 0, y: 0, ok: false }, vel: 1.1 + azar() * 0.5, rum: 0, fase: azar() * 6.28,
        reloj: k % 4 === 0 ? 4294967296 - 3000 - k * 1000 - Math.round(performance.now()) : Math.floor(azar() * 1e9), seq: Math.floor(azar() * 65536), tTick: azar() * TICK, nTick: 0, cerca: false,
        buf: BufferPose.crea(), out: BufferPose.salida(), visto: false, vrm: null, modo: veh === "quad" ? 1 : veh === "dron" ? 2 : veh === "mixto" ? k % 3 : 0
      });
      var nuevo: any = V[V.length - 1]; if (nuevo.modo === 1) nuevo.vel = 5.5; else if (nuevo.modo === 2) nuevo.vel = 0;   // en quad, deprisa; con el dron, quieto
    }
    est.quest = nQuest;
    montaGrafica(N, N * Aspecto.CAJAS_MAX, Math.max(1, nQuest * 2));
    mManos.count = nQuest * 2;
    V.forEach(function (a?: any) { tomaAccesorios(a); colorea(a); pintaNombre(a.k, a.alias, a.oficial); });
    [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m?: any) { for (var i: any = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });   // nada se ve hasta que llega la pose inicial
  }

  // ---- el emisor simulado: anda hacia un destino cerca de su «casa» y manda su pose por la red de mentira
  var oyenteT: any = { x: 0, y: 0 };   // el mismo objeto cada vez (AG-1.4: nadie lo guarda; se lee al momento)
  function oyente() {   // dónde está quien observa (en metros este/norte): la cabeza en VR, el paseante, el punto de la órbita
    if (dp.VRX.on) { oyenteT.x = dp.VRX.cab.x; oyenteT.y = -dp.VRX.cab.z; }
    else if (dp.paseando) { oyenteT.x = dp.pp.x; oyenteT.y = dp.pp.y; }
    else { oyenteT.x = dp.objetivo.x; oyenteT.y = -dp.objetivo.z; }
    return oyenteT;
  }
  function poseVerdad(a?: any, tMs?: any, o?: any) {   // la pose del visitante simulado en este instante, en el sistema del contrato (cota sin exagerar)
    var s: any = suelo(a.x, a.y), cab: any = ALTO_OJOS + Math.sin(a.fase * 2) * 0.03, cab0: any = Math.sin(a.fase * 0.37) * 0.35, cab1: any = Math.sin(a.fase * 0.23) * 0.15;
    q1.setFromEuler(new THREE.Euler(cab1, a.rum + cab0, 0, "YXZ"));
    o.tipo = a.quest ? PoseCodec.QUEST : PoseCodec.ESCRITORIO; o.seq = a.seq; o.t = (a.reloj + tMs) >>> 0; o.modo = a.modo;
    o.cab = { p: [a.x, s + cab, -a.y], q: [q1.x, q1.y, q1.z, q1.w] };
    if (a.quest) {
      var cr: any = Math.cos(a.rum), sr: any = Math.sin(a.rum), bal: any = Math.sin(a.fase * 2) * 0.18;
      q1.setFromAxisAngle(ejeY, a.rum);
      var mano: any = function (lado?: any, b?: any) { var lx: any = lado * 0.24, lz: any = -0.25 + b; return { p: [a.x + lx * cr + lz * sr, s + 1.0, -a.y - lx * sr + lz * cr], q: [q1.x, q1.y, q1.z, q1.w] }; };
      o.izq = mano(-1, bal); o.der = mano(1, -bal);
    } else { o.izq = null; o.der = null; }
    return o;
  }
  function anda(a?: any, dt?: any) {
    if (!a.dest.ok || Math.hypot(a.dest.x - a.x, a.dest.y - a.y) < 1.5) {
      var e: any = D.ext; a.dest.x = Math.max(e[0] + 5, Math.min(e[2] - 5, a.home.x + (azar() - 0.5) * 120)); a.dest.y = Math.max(e[3] + 5, Math.min(e[1] - 5, a.home.y + (azar() - 0.5) * 120)); a.dest.ok = true;   // el mismo destino reescrito (AG-1.4); x antes que y, como el azar de siempre
    }
    var dx: any = a.dest.x - a.x, dy: any = a.dest.y - a.y, d: any = Math.hypot(dx, dy) || 1, obj: any = Math.atan2(-dx, dy), dif: any = Math.atan2(Math.sin(obj - a.rum), Math.cos(obj - a.rum));
    a.rum += Math.max(-dt * 2, Math.min(dt * 2, dif)); a.x += dx / d * a.vel * dt; a.y += dy / d * a.vel * dt; a.fase += dt * a.vel * 3.2;
  }
  function emite(a?: any, dt?: any, tMs?: any, ol?: any) {   // contrato: un «tic» cada 100 ms; a los cercanos se les manda en cada tic (10 Hz), a todos en uno de cada 5 (2 Hz)
    var d: any = Math.hypot(a.x - ol.x, a.y - ol.y); a.cerca = a.cerca ? d < CERCA_SALE : d < CERCA_ENTRA;
    a.tTick += dt; if (a.tTick < TICK) return; a.tTick -= TICK; if (a.tTick > TICK) a.tTick = 0; a.nTick++;
    if (!(a.cerca || a.nTick % CADA_LEJOS === 0)) return;
    a.seq = (a.seq + 1) & 0xffff;
    mandaSim(a, tMs);
  }
  function mandaSim(a?: any, tMs?: any) {   // lo que pasa en cada tic (10 Hz), no en cada fotograma: codifica la pose y la mete en la red de mentira
    var b: any = PoseCodec.codifica(poseVerdad(a, tMs, {})); est.enviados++; bytesVentana += b.byteLength; est.bytes += b.byteLength;
    if (azar() < 0.01) { est.perdidos++; return; }
    redSim.push({ en: tMs + 30 + azar() * 60, k: a.k, b: b });
  }
  var listosT: any = [];   // los mensajes de la red de mentira que ya tocan (reutilizado cada fotograma)
  function entrega(tMs?: any) {
    var i: any, j: any, m: any, resto: any = 0; listosT.length = 0;
    for (i = 0; i < redSim.length; i++) { m = redSim[i]; if (m.en <= tMs) listosT.push(m); else redSim[resto++] = m; }
    if (!listosT.length) return;
    redSim.length = resto;
    for (i = 1; i < listosT.length; i++) { m = listosT[i]; for (j = i - 1; j >= 0 && listosT[j].en > m.en; j--) listosT[j + 1] = listosT[j]; listosT[j + 1] = m; }   // por llegada, estable (inserción: son pocos)
    for (i = 0; i < listosT.length; i++) {
      m = listosT[i]; var p: any = PoseCodec.decodifica(m.b), a: any = V[m.k];
      if (!p) continue;
      // el instante de llegada se pasa en el reloj del RECEPTOR; el desfase con el del emisor lo estima el búfer
      if (BufferPose.recibe(a.buf, p, tMs)) est.recibidos++; else est.viejos++;
    }
  }

  // AV2: el apoyo de a (ilustrativo, no medido), en el espacio del cuerpo (mBase, ya con la altura): hacia −z es delante, y = 0 el origen del cuerpo (sentado en la silla, el suelo queda en y = 0,31).
  // Silla: asiento, respaldo y dos ruedas (solo con mu.vehiculo === 3); bastón: una caja fina junto a la mano derecha; andador: una barra delante y dos laterales (los dos, solo a pie).
  // En quad, con el dron o con VRM no se dibujan. La rueda no gira (una caja instanciada de 10 lados: no se vería).
  function caja(i?: any, x?: any, y?: any, z?: any, sx?: any, sy?: any, sz?: any) { mPieza.compose(v1.set(x, y, z), qI, v2.set(sx, sy, sz)); mSombrero.setMatrixAt(i, m4b.multiplyMatrices(mBase, mPieza)); }
  function apoyo(a?: any, mu?: any, fc?: any) {
    var n: any = a.iApoyo, ids: any = a.cajas, v: any = mu.vehiculo, vis: any = a.mov === "silla" ? v === 3 : v === 0, i: any;
    if (!vis) { m4b.makeScale(0, 0, 0); for (i = n; i < ids.length; i++) mSombrero.setMatrixAt(ids[i], m4b); for (i = 0; i < a.ruedas.length; i++) mRuedas.setMatrixAt(a.ruedas[i], m4b); return; }
    if (a.mov === "silla") {
      caja(ids[n], 0, 0.8, -0.12, 0.62, 0.06, 0.52); caja(ids[n + 1], 0, 1.1, 0.17, 0.6, 0.5, 0.04);
      for (i = 0; i < 2; i++) { mPieza.compose(v1.set((i ? 1 : -1) * (0.3 * fc + 0.14), 0.61, 0.1), qI, vU); mRuedas.setMatrixAt(a.ruedas[i], m4b.multiplyMatrices(mBase, mPieza)); }
    } else if (a.mov === "baston") caja(ids[n], 0.3 * fc + 0.04, 0.43, -0.05, 0.035, 0.86, 0.035);
    else if (a.mov === "andador") { caja(ids[n], 0, 0.85, -0.5, 0.64, 0.04, 0.04); caja(ids[n + 1], -0.31, 0.425, -0.3, 0.03, 0.85, 0.4); caja(ids[n + 2], 0.31, 0.425, -0.3, 0.03, 0.85, 0.4); }
  }
  // ---- el receptor (las dos variantes): interpola y coloca las instancias. ret = el retardo que toca (150 ms si llega a 10 Hz, 650 si a 2 Hz)
  function coloca(a?: any, tMs?: any, dt?: any, ret?: any) {
    var paso: any = dt * 500; a.ret = a.ret == null ? ret : a.ret + Math.max(-paso, Math.min(paso, ret - a.ret));   // el retardo cambia a 0,5 s por segundo: el avatar no salta al cambiar de tasa
    var o: any = a.out;
    if (!BufferPose.muestra(a.buf, tMs, a.ret, o)) return;
    a.visto = true;
    // los pies, en el suelo de ESTE mundo (suelo local × exageración), no en la cota de la pose; de la pose, la posición horizontal,
    // hacia dónde apunta y, solo con gafas, cuánto se agacha: altura de su cabeza sobre el suelo (la cota viaja sin exagerar). En
    // escritorio/móvil la cota no se usa: el muñeco va de pie (su suelo y el nuestro pueden diferir unos cm mientras llegan teselas)
    var c: any = o.cab.p, s: any = suelo(c[0], -c[2]), conManos: any = !!(o.hayIzq || o.hayDer);
    q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
    v2.set(0, 0, -1).applyQuaternion(q1); var yawCab: any = Math.atan2(-v2.x, -v2.z);
    // AV2: con la silla de ruedas, sentado (AV4: también con VRM, que se sienta igual: 26b_avatares.js); la altura escala todo el muñeco y la complexión, el ancho y el fondo de cada pieza
    var fa: any = a.fa || 1, fc: any = a.fc || 1, mu: any = Muneco.avanza(a.mu || (a.mu = Muneco.crea()), c[0], c[2], yawCab, dt, s, Estado.exag, o.tipo === PoseCodec.QUEST ? c[1] - s : NaN, conManos, outMu, o.modo, a.mov === "silla");
    var yv: any = mu.yPies + (mu.yCab - mu.yPies) * fa;
    var cx: any = c[0] + Math.sin(mu.yaw) * mu.atras, cz: any = c[2] + Math.cos(mu.yaw) * mu.atras;   // en quad, el cuerpo 0,2 m detrás del centro del quad (16_vida.js)
    mBase.compose(v1.set(cx, mu.yPies, cz), q1.setFromAxisAngle(ejeY, mu.yaw), vF.set(fa, fa, fa));
    girosT[1] = mu.piernaI; girosT[2] = mu.piernaD; girosT[3] = mu.brazoI; girosT[4] = mu.brazoD;   // girosT[0] = 0 (el tronco no gira)
    for (var j: any = 0; j < NP; j++) {
      var P: any = Muneco.PIEZAS[j], largo: any = P[5] ? Math.max(0.2, P[1] - mu.agacho) : P[1];   // agachado: baja el cuerpo y encogen las piernas
      mPieza.compose(v1.set(P[3] * fc, P[4] - mu.agacho, 0), q1.setFromAxisAngle(ejeX, girosT[j]), v2.set(P[0] * fc, largo, P[2] * fc));
      mCuerpo.setMatrixAt(a.k * NP + j, m4.multiplyMatrices(mBase, mPieza));
    }
    // la cabeza encima del muñeco, girada como la de verdad (apunta donde apunta)
    q1.set(o.cab.q[0], o.cab.q[1], o.cab.q[2], o.cab.q[3]);
    m4.compose(v1.set(cx, yv, cz), q1, vF); mCabeza.setMatrixAt(a.k, m4);
    if (a.iSom >= 0) { m4b.multiplyMatrices(m4, matSombreroLocal[a.sombrero]); mSombrero.setMatrixAt(a.iSom, m4b); }
    if (a.cajas && a.cajas.length > a.iApoyo) apoyo(a, mu, fc);
    if (a.iIns >= 0) caja(a.iIns, -0.11 * fc, 1.33 - mu.agacho, -0.125 * fc - 0.016, 0.12, 0.09, 0.03);   // OF10: la insignia, en el pecho (delante es −z), a la izquierda
    if (a.iMano >= 0) {
      for (var im: any = 0; im < 2; im++) {   // 0 = izquierda, 1 = derecha
        var hm: any = im === 0 ? o.izq : o.der, hay: any = im === 0 ? o.hayIzq : o.hayDer;
        if (!hay) { mManos.setMatrixAt(a.iMano + im, m4.makeScale(0, 0, 0)); continue; }
        var sh: any = suelo(hm.p[0], -hm.p[2]); q1.set(hm.q[0], hm.q[1], hm.q[2], hm.q[3]);
        mManos.setMatrixAt(a.iMano + im, m4.compose(v1.set(hm.p[0], sh * Estado.exag + (hm.p[1] - sh), hm.p[2]), q1, vS));
      }
    }
    // P7c: si lleva su VRM y ya se ve entero, el muñeco no se dibuja (escala 0); el nombre y el vehículo, sí
    if (vrmG && vrmG.coloca(a, mu, o, yawCab, cx, cz, dt)) {
      m4.makeScale(0, 0, 0);
      for (var jt: any = 0; jt < NP; jt++) mCuerpo.setMatrixAt(a.k * NP + jt, m4);
      // el sombrero del muñeco, no (el VRM lleva el suyo o ninguno); el apoyo (silla, bastón, andador) sí: AV4, el VRM se sienta en la silla del muñeco
      mCabeza.setMatrixAt(a.k, m4); if (a.iSom >= 0) mSombrero.setMatrixAt(a.iSom, m4); if (a.iIns >= 0) mSombrero.setMatrixAt(a.iIns, m4);   // con VRM, la insignia va en su etiqueta
      if (a.iMano >= 0) { mManos.setMatrixAt(a.iMano, m4); mManos.setMatrixAt(a.iMano + 1, m4); }
    }
    // el nombre, encima de la cabeza; crece con la distancia para leerse y se apaga lejos (UX §5.4: nombres sobre los avatares)
    var dc: any = camera.position.distanceTo(v1.set(c[0], yv, c[2])), e: any = Math.max(1, Math.min(4, dc / 20));
    if (dc > 160) m4.makeScale(0, 0, 0); else m4.compose(v1.set(c[0], yv + 0.35 + 0.15 * e, c[2]), q1.identity(), vS.set(e, e, e));
    vS.set(1, 1, 1); mNombres.setMatrixAt(a.k, m4);
    // el vehículo (P6): el quad debajo, con su rumbo; el dron no viaja en la pose (solo el modo): se dibuja ILUSTRATIVO, a 5 m delante de
    // donde mira quien lo vuela y a 4 m del suelo (el paseante local se vuelve a mirar su dron, así que su cabeza apunta más o menos hacia él)
    if (mQuad) { if (mu.vehiculo === 1) { nVehQ++; m4.compose(v1.set(c[0], mu.yVeh, c[2]), q1.setFromAxisAngle(ejeY, mu.yaw), vS); } else m4.makeScale(0, 0, 0); mQuad.setMatrixAt(a.k, m4); }
    if (mDron) {
      if (mu.vehiculo === 2) {
        nVehD++; var px: any = c[0] - Math.sin(yawCab) * DRON_DELANTE, pz: any = c[2] - Math.cos(yawCab) * DRON_DELANTE;
        m4.compose(v1.set(px, suelo(px, -pz) * Estado.exag + DRON_ALTO + Math.sin(tVeh * 2.2 + a.k) * 0.05, pz), q1.setFromAxisAngle(ejeY, yawCab), vEsc);
      } else m4.makeScale(0, 0, 0);
      mDron.setMatrixAt(a.k, m4);
    }
    // medida (solo en la simulación se sabe la verdad): retardo de presentación y error de posición frente a dónde está de verdad ahora
    if (variante === "sim" && a.cerca) { var dr: any = ((a.reloj + tMs - o.t) % 4294967296 + 4294967296) % 4294967296; muestrasRet.push(dr > 2147483648 ? dr - 4294967296 : dr); muestrasErr.push(Math.hypot(c[0] - a.x, -c[2] - a.y)); }
  }
  function p95(v?: any) { if (!v.length) return 0; var s: any = v.slice().sort(function (x?: any, y?: any) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }

  // ---- la sala de verdad (?presencia=red): la sala «visita» de la red (37_red.js, el único que habla con LiveKit), el token de la api, la pose propia y el
  // apartado Gente con el chat. sala = la sala de la red mientras estás dentro (o reconectando); null fuera
  var SR: any = null, sala: any = null, SP: any = null, porId: any = Object.create(null), huecos: any = [], bloqueados: any = Object.create(null), yo: any = null, manoDe: any = ["", ""], quitaRed: any = [], quitaMandos: any = [];
  // OF10: la sala del mundo en la que estás, por su clave (contratos/livekit-roles.json v4): «general» (la de siempre) o «visita» (a la que invita la oficina)
  var SALAS_MUNDO: any = { general: "Visita libre", visita: "Sala de la visita" }, claveSala: any = "general";
  // F3f: la sala de voz de una visita guiada (guiada-<evento>, F3c). La presencia VIAJA a ella (entraGuiada): misma sala de la red («visita»), token de
  // POST /api/presencia/guiadas/:evento/token, y la voz (45_voz.js) se engancha a esta misma conexión (Voz.usa("visita")), así cada voz sale de su avatar.
  // claveSala = "guiada" mientras dure; si la api no deja entrar (cerrada, fuera de hora, no apuntada) o la sala se cierra, de vuelta a la general con el aviso
  var eventoGuiada: any = null, NOMBRE_GUIADA: any = "Visita guiada", avisoGuiada: any = "";   // avisoGuiada (OF11e): la frase de la api del último intento fallido de entrar (la lee la agenda)
  function nombreSala(c?: any) { return c === "guiada" ? NOMBRE_GUIADA : SALAS_MUNDO[c]; }
  var ui: any = null, mensajes: any = [], tChat: any = 0, tGente: any = 0, claveGente: any = "", conectando: any = false, poseL: any = { tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null };
  var mDesc: any = null, vDesc: any = null, qDesc: any = null, sDesc: any = null, manoR0: any = { p: [0, 0, 0], q: [0, 0, 0, 1] }, manoR1: any = { p: [0, 0, 0], q: [0, 0, 0, 1] };   // las dos manos de la pose propia, reescritas cada fotograma (AG-1.4)
  // medida de las pruebas (P4): con window.__presenciaMide puesto ANTES de cargar, se apunta cada pose que llega
  // [identidad, reloj del emisor (bytes 4-7), llegada en performance.now()]; se lee y vacía con __presencia("llegadas")
  var medLlegadas: any = null;
  function iniciaRed() {
    if (window.__presenciaMide) medLlegadas = [];
    montaGrafica(MAXV, MAXV * Aspecto.CAJAS_MAX, MAXV * 2);   // las cajas de accesorios: las que pueda pedir cada uno (antes, MAXV: con sombrero y apoyo se quedaban cortas)
    for (var k: any = MAXV - 1; k >= 0; k--) huecos.push(k);
    [mCuerpo, mCabeza, mSombrero, mManos, mNombres].forEach(function (m?: any) { for (var i: any = 0; i < m.count; i++) m.setMatrixAt(i, m4.makeScale(0, 0, 0)); });
    mDesc = new THREE.Matrix4(); vDesc = new THREE.Vector3(); qDesc = new THREE.Quaternion(); sDesc = new THREE.Vector3();
    SP = SalaPose.crea(Math.floor(Math.random() * 65536));
    // qué mando es cada mano (lo dice el propio WebXR al conectarse el mando)
    [0, 1].forEach(function (i?: any) {
      var c: any = renderer.xr.getController(i), con: any = function (e?: any) { manoDe[i] = (e.data && e.data.handedness) || ""; }, des: any = function () { manoDe[i] = ""; };
      c.addEventListener("connected", con); c.addEventListener("disconnected", des);
      quitaMandos.push(function () { c.removeEventListener("connected", con); c.removeEventListener("disconnected", des); });
    });
    // la sala «visita» de la red: los temas del contrato (pose, no fiable; chat, fiable) y quién entra y sale. Sin la red (su fichero fuera del motor:
    // con ella apagada, este componente ni se monta) no hay sala: el panel lo dice y no se intenta entrar
    SR = R ? R.sala("visita") : null;
    if (SR) quitaRed.push(SR.escucha("pose", function (datos?: any, de?: any) { recibeDatos(datos, de, "pose"); }), SR.escucha("chat", function (datos?: any, de?: any) { recibeDatos(datos, de, "chat"); }),
      SR.al("entra", function (de?: any) { entraOtro(de); }), SR.al("sale", function (id?: any) { saleOtro(id); }), SR.al("estado", alEstado));
    montaPanel();
    // OF11e: la agenda (43) pide entrar en una visita guiada por el Bus (guiada:entrar); solo con la presencia de verdad hay quien escuche, y por eso la agenda
    // enseña o no su botón. La respuesta vuelve por guiada:entrada: ok, o la frase de la api (403/409) para enseñarla
    n.on("guiada:entrar", function (d?: any) {
      var ev: any = d && d.evento; if (!SR) return;
      entraGuiada(ev).then(function (ok?: any) { n.emite("guiada:entrada", { evento: ev, ok: !!ok, mensaje: ok ? "" : avisoGuiada }); });
    });
    if (SR) conecta(); else ponEstado("La visita compartida no está disponible en esta página.", false);
  }
  function dispositivo() { return Aparato.clase(); }
  var volverGeneral: any = "";   // OF10b: el aviso de que no te dejaron entrar en la sala de la visita; tras él se vuelve a la general
  // OF10b: entra en la sala de claveSala; si la api la niega por ser de un evento (403 visita_solo_inscritos), avisa con amabilidad y vuelve a la general
  async function conecta() {
    await conectaUna();
    if (volverGeneral) { var msgSala: any = volverGeneral; volverGeneral = ""; await conectaUna(); ponEstado(msgSala, false); pintaNota(); }
  }
  async function conectaUna() {
    if (conectando || sala || !SR) return;
    conectando = true; ponEstado("Entrando en la visita compartida…", false);
    try {
      // el token lo da la api con tu sesión (mismo origen); la identidad, el alias y el avatar los pone ella
      var cuerpo: any = { dispositivo: dispositivo() }; if (claveSala !== "general" && claveSala !== "guiada") cuerpo.sala = claveSala;   // OF10: sin sala, la general (como siempre)
      var ruta: any = claveSala === "guiada" ? "/api/presencia/guiadas/" + eventoGuiada + "/token" : "/api/presencia/token";   // F3f: la de la guiada (F3c)
      var r: any = await fetch(ruta, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
      if (!r.ok) {
        var e: any = null; try { e = await r.json(); } catch (x: any) { e = null; }
        // F3f: la guiada no te deja (cerrada, aún no abre, ya terminó, no apuntada, expulsado): su mensaje y de vuelta a la general
        if (claveSala === "guiada") {
          claveSala = "general"; eventoGuiada = null; volverGeneral = avisoGuiada = e && typeof e.mensaje === "string" && e.mensaje ? e.mensaje : "No se pudo entrar en la visita guiada.";
          return;
        }
        // OF10b: la sala de la visita ligada a un evento de la agenda es solo de las familias apuntadas (403 visita_solo_inscritos): mensaje amable y de vuelta a la general
        if (r.status === 403 && e && e.error === "visita_solo_inscritos" && claveSala !== "general") {
          claveSala = "general"; volverGeneral = typeof e.mensaje === "string" && e.mensaje ? e.mensaje : "Esta visita es para las familias apuntadas.";
          return;
        }
        if (auto) { fallaAuto("token " + r.status); ponEstado("", false); return; }   // F2b: arrancó sola: sin aviso visible, solo ?debug y el reintento
        ponEstado(r.status === 401 ? "Entra con tu enlace para ver a los demás." : (e && typeof e.mensaje === "string" ? e.mensaje : "No se pudo entrar en la visita compartida (" + r.status + ")."), true);
        return;
      }
      var t: any = await r.json();
      if (!activo) return;
      // la red resuelve la URL (wss://… o /rtc del mismo origen) contra la página y pide livekit-client la primera vez (import() solo con esta bandera)
      if (!(await SR.une({ url: t.url, token: t.token })) || !activo) { if (auto && activo) { fallaAuto("LiveKit no responde"); ponEstado("", false); } return; }
      var mi: any = SR.yo(); sala = SR; avisoAuto = ""; fallosAuto = 0;
      yo = { identidad: mi.identidad, info: SalaPose.leeInfo(mi.metadatos) };
      SR.participantes().forEach(function (de?: any) { entraOtro(de); });
      ponEstado("", false); pintaNota();
    } catch (err: any) {
      if (auto) { fallaAuto("sala: " + (err && err.message ? err.message : err)); ponEstado("", false); return; }   // F2b: callada; ?debug lo cuenta
      ponEstado("No se pudo conectar con la visita compartida.", true);
      if (typeof console !== "undefined") console.warn("presencia: " + (err && err.message ? err.message : err));
    } finally { conectando = false; }
  }
  // el estado de la sala (37_red.js): reconectando, de vuelta, o fuera (con su motivo)
  function alEstado(d?: any) {
    if (d.estado === "reconectando") ponEstado("Reconectando…", false);
    else if (d.estado === "dentro") { if (yo) ponEstado("", false); }
    else if (d.estado === "fuera") alSalir(d.motivo);
  }
  function alSalir(motivo?: any) {
    if (!sala && !yo) return;
    sala = null; yo = null;
    Object.keys(porId).forEach(saleOtro);
    if (!activo) return;
    // F3f: al salir de una guiada sin pedirlo (el guía te sacó, la sala se cerró o se cortó), de vuelta a la visita libre con su aviso
    if (claveSala === "guiada") {
      claveSala = "general"; eventoGuiada = null; claveGente = "";
      volverGeneral = motivo === "expulsado" ? "El guía te ha sacado de la visita guiada." : motivo === "duplicado" ? "Has abierto la visita guiada en otra pestaña: aquí se ha cerrado." : "La visita guiada ha terminado: estás en la visita libre.";
      conecta();
      return;
    }
    ponEstado(motivo === "expulsado" ? "La oficina te ha sacado de la visita compartida." : motivo === "duplicado" ? "Has abierto la visita compartida en otra pestaña: aquí se ha cerrado." : "Te has desconectado de la visita compartida.", true);
  }
  // OF10: pasar a otra sala del mundo (la invitación de la oficina, 39_oficina_mundo.js, o la propia oficina). Se deja de ver a los de la sala de antes y se pide
  // un token de la nueva; la red (37_red.js) deja la vieja al unirse a la nueva bajo la misma clave «visita». No te mueve de sitio en el mundo: cambia con quién estás.
  // Promesa: true si queda dentro de la nueva; false si no había sala, ya estabas en ella, estaba entrando o no se pudo
  function cambiaSala(clave?: any) {
    if (!SR || !Object.prototype.hasOwnProperty.call(SALAS_MUNDO, clave) || conectando) return Promise.resolve(false);
    if (clave === claveSala && sala) return Promise.resolve(false);
    claveSala = clave; eventoGuiada = null; Object.keys(porId).forEach(saleOtro); sala = null; yo = null; claveGente = "";   // así el «fuera» de la sala vieja no avisa de nada
    return conecta().then(function () { pintaNota(); return !!sala && claveSala === clave; });
  }
  // F3f: viajar a la sala guiada de un evento (la pide la voz, Voz.entra, o el enlace ?guiada=<evento>). Promesa de true si quedas dentro de guiada-<evento>;
  // si la api no te deja, vuelves a la general con su mensaje (y false). Solo con la presencia de verdad (?presencia=red)
  function entraGuiada(ev?: any): any {
    var id: any = typeof ev === "string" && /^[1-9][0-9]{0,9}$/.test(ev) ? Number(ev) : ev;
    if (variante !== "red" || !SR || !Number.isInteger(id) || id < 1 || id > 2147483647) return Promise.resolve(false);
    if (conectando) return esperaConexion().then(function (si?: any): any { return si ? entraGuiada(id) : false; });   // p. ej. ?guiada= al cargar, mientras entra en la general
    if (claveSala === "guiada" && eventoGuiada === id && sala) return Promise.resolve(true);
    avisoGuiada = ""; claveSala = "guiada"; eventoGuiada = id; Object.keys(porId).forEach(saleOtro); sala = null; yo = null; claveGente = "";
    return conecta().then(function () { pintaNota(); return !!sala && claveSala === "guiada" && eventoGuiada === id; });
  }
  function esperaConexion() {   // hasta que acabe de entrar (o salir) la sala en curso: como mucho 20 s, mirando cada 100 ms
    return new Promise(function (ok?: any) { var n: any = 0; (function vigila() { if (!conectando) return ok(true); if (++n > 200 || !activo) return ok(false); setTimeout(vigila, 100); })(); });
  }
  function pintaNota() { if (ui && ui.nota) ui.nota.textContent = claveSala === "guiada" ? NOMBRE_GUIADA + ": con voz del guía. Nada se graba; el chat no se guarda." : SALAS_MUNDO[claveSala] + ": sin voz. El chat no se guarda."; }
  // de = { identidad, metadatos } (37_red.js): los metadatos los pone la api en el token y se leen como DATOS (SalaPose.leeInfo)
  function entraOtro(de?: any) {
    var id: any = de && de.identidad; if (!id || porId[id]) return porId[id] || null;
    if (!huecos.length) { est.sinPlaza = (est.sinPlaza || 0) + 1; return null; }
    var h: any = huecos.pop(), mt: any = SalaPose.leeInfo(de.metadatos);
    var vest: any = Aspecto.viste(mt);   // AV2: piel (10 tonos), ropa de arriba y de abajo, altura, complexión y apoyo; sin ellos, el de antes
    var a: any = { k: h, id: id, info: mt, alias: mt.alias, vrm: mt.vrm, oficial: vest.oficial, chaleco: vest.chaleco, iIns: -1, camisa: vest.camisa, piel: vest.piel, pantalon: vest.pantalon, fa: vest.fa, fc: vest.fc, mov: vest.mov, propioPiel: vest.propioPiel, propioCamisa: vest.propioCamisa,
      pelo: vest.pelo, receta: vest.receta,
      sombrero: mt.sombrero, iSom: -1, iMano: h * 2, out: BufferPose.salida(), ret: null, visto: false, cerca: false };
    tomaAccesorios(a);
    a.o = SalaPose.entra(SP, id, mt); a.buf = a.o.buf;
    colorea(a); pintaNombre(h, mt.alias, mt.oficial); oculta(a);
    porId[id] = a; claveGente = ""; cambio = true; return a;
  }
  function saleOtro(id?: any) {
    var a: any = porId[id]; if (!a) return;
    if (vrmG) vrmG.sale(a);
    oculta(a); sueltaAccesorios(a); pintaNombre(a.k, ""); huecos.push(a.k); delete porId[id]; SalaPose.sale(SP, id); claveGente = "";
  }
  function recibeDatos(datos?: any, de?: any, tema?: any) {
    if (!de || !de.identidad || (yo && de.identidad === yo.identidad)) return;
    if (tema === "pose") {
      var a: any = porId[de.identidad] || entraOtro(de); if (!a) return;
      var llega: any = performance.now();
      if (SalaPose.recibe(SP, de.identidad, datos, llega)) est.recibidos++; else est.viejos++;
      if (medLlegadas && datos.byteLength >= 8) { medLlegadas.push([de.identidad, new DataView(datos.buffer, datos.byteOffset, datos.byteLength).getUint32(4, true), llega]); if (medLlegadas.length > 20000) medLlegadas.shift(); }
    } else if (tema === "chat") {
      var txt: any = Chat.decodifica(datos); if (txt === null || bloqueados[de.identidad]) return;
      var b: any = porId[de.identidad]; anadeMensaje(b ? b.alias : SalaPose.leeInfo(de.metadatos).alias, txt, false);
    }
  }
  // la pose propia en el sistema del contrato (cota SIN exagerar), o null si estás en vista aérea (órbita, vuelo o mirador de VR): entonces no se publica (decisión 60)
  function enExterior() { return !dp.mundoActual || dp.mundoActual() === "exterior"; }   // las poses del contrato son del exterior: dentro de un interior (otras coordenadas, otro suelo) ni se publican ni se dibujan
  function poseLocal(tMs?: any) {
    var o: any = poseL, s: any;
    if (!enExterior()) return null;   // en un interior: como en vista aérea (no se publica; los demás te ven «en vista aérea»), sin cambiar el contrato
    if (dp.VRX.on) {
      if (dp.VRX.vuelo || dp.VRX.mirador) return null;
      var h: any = dp.VRX.cab; s = suelo(h.x, -h.z);
      q1.setFromAxisAngle(ejeY, dp.VRX.rig.yaw).multiply(camera.quaternion);
      o.tipo = PoseCodec.QUEST; o.cab.p[0] = h.x; o.cab.p[1] = h.y - s * Estado.exag + s; o.cab.p[2] = h.z; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
      o.izq = manoLocal("left"); o.der = manoLocal("right"); o.modo = PoseCodec.PIE;
    } else if (dp.paseando) {
      s = suelo(dp.pp.x, dp.pp.y); q1.setFromAxisAngle(ejeY, -dp.pp.ang);
      o.tipo = PoseCodec.ESCRITORIO; o.cab.p[0] = dp.pp.x; o.cab.p[1] = s + ALTO_OJOS; o.cab.p[2] = -dp.pp.y; o.cab.q[0] = q1.x; o.cab.q[1] = q1.y; o.cab.q[2] = q1.z; o.cab.q[3] = q1.w;
      o.izq = null; o.der = null; o.modo = dp.enQuad ? PoseCodec.QUAD : dp.enDron ? PoseCodec.DRON : PoseCodec.PIE;
    } else return null;
    o.t = tMs >>> 0;
    return o;
  }
  function manoLocal(lado?: any) {   // la empuñadura del mando de ese lado, en el mundo (el rig ya va dentro de matrixWorld); null si no hay mando
    var i: any = manoDe[0] === lado ? 0 : manoDe[1] === lado ? 1 : -1; if (i < 0) return null;
    var g: any = renderer.xr.getControllerGrip(i); if (!g || !g.parent || !g.visible) return null;
    mDesc.copy(g.matrixWorld).decompose(vDesc, qDesc, sDesc);
    var s: any = suelo(vDesc.x, -vDesc.z), r: any = i === 0 ? manoR0 : manoR1;   // la misma mano cada vez (por mando): el contrato la lee al momento, no la guarda
    r.p[0] = vDesc.x; r.p[1] = vDesc.y - s * Estado.exag + s; r.p[2] = vDesc.z; r.q[0] = qDesc.x; r.q[1] = qDesc.y; r.q[2] = qDesc.z; r.q[3] = qDesc.w;
    return r;
  }
  function perdidaPose() { est.perdidos++; }
  function publicaPose(e?: any) {   // solo en el tic de la red (10 Hz), no en cada fotograma: la publicación guarda sus opciones, así que lleva las suyas
    var op: any = { fiable: false }; if (e.destinos) op.destinos = e.destinos;   // tema «pose», no fiable (contratos/presencia.md)
    sala.publica("pose", e.bytes, op).catch(perdidaPose);
    est.enviados++; est.bytes += e.bytes.byteLength; bytesVentana += e.bytes.byteLength;
  }
  function actualizaRed(dt?: any, tMs?: any) {
    var envios: any = SalaPose.tic(SP, tMs, sala ? poseLocal(tMs) : null);
    if (envios && sala) for (var ie: any = 0; ie < envios.length; ie++) publicaPose(envios[ie]);   // el tic (10 Hz) devuelve algo; el resto de fotogramas, null
    var nc: any = 0, np: any = 0, id: any, a: any;
    for (id in porId) {
      a = porId[id]; np++;
      if (!SalaPose.seVe(SP, id, tMs, bloqueados)) { if (a.visto) oculta(a); continue; }   // bloqueado o en vista aérea: no se dibuja
      a.buf = a.o.buf; coloca(a, tMs, dt, SalaPose.retardo(a.o));   // (el búfer se rehace si vuelve tras un rato sin pose)
      if (a.o.cerca) nc++;
    }
    est.cerca = nc; est.n = np;
    tGente += dt; if (tGente >= 0.5) { tGente = 0; pintaGente(tMs); }
  }

  // ---- apartado Gente y chat (solo con ?presencia=red). Todo el texto que llega se pone con textContent: nunca como HTML
  function el(tag?: any, props?: any, hijos?: any) { var e: any = document.createElement(tag); if (props) Object.keys(props).forEach(function (k?: any) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h?: any) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
  // el chat es una ventana flotante que se mueve (34_movibles.js): barra con agarre ⠿, «Llevar a…» ⋯ y minimizar –; minimizada es una burbuja, también movible,
  // con los mensajes sin leer. La lista de Gente va en #ventanaGente si la página la trae (UX §6); si no, dentro del chat, como hasta ahora
  function conMov(fn?: any) { if (typeof dp.Movibles !== "undefined" && dp.Movibles && dp.Movibles.hazMovible) fn(); else setTimeout(function () { if (typeof dp.Movibles !== "undefined" && dp.Movibles && dp.Movibles.hazMovible) fn(); }, 0); }   // el componente se monta con todo cargado (34_movibles.js ya está); si faltara, se espera un turno
  function montaPanel() {
    var boton: any = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:4px 10px;min-height:44px;cursor:pointer";
    var estiloMini: any = "font:inherit;color:inherit;background:none;border:0;min-width:44px;min-height:44px;cursor:pointer;padding:0;font-size:18px";
    var agarre: any = el("button", { type: "button", className: "agarre", style: estiloMini + ";cursor:grab;color:rgba(255,255,255,0.7)", "aria-label": "Mover el chat: flechas del teclado (Mayús, más deprisa; Inicio, a su sitio)", title: "Arrastra para mover el chat" }, ["⠿"]);
    var titulo: any = el("strong", { style: "flex:1;font-size:14px" }, ["Chat"]);
    var llevar: any = el("button", { type: "button", style: estiloMini, "aria-label": "Llevar el chat a…", title: "Llevar a…" }, ["⋯"]);
    var minimiza: any = el("button", { type: "button", style: estiloMini, "aria-label": "Minimizar el chat", title: "Minimizar" }, ["–"]);
    var asa: any = el("div", { className: "asa", style: "display:flex;align-items:center;gap:2px;padding-left:2px;border-bottom:1px solid rgba(255,255,255,0.2);cursor:grab" }, [agarre, titulo, llevar, minimiza]);
    var cuerpo: any = el("div", { style: "flex:1;min-height:0;overflow:auto;padding:0 8px" });
    var estado: any = el("p", { style: "margin:6px 0;color:#ffd58a", role: "status" });
    var reentra: any = el("button", { type: "button", style: boton, hidden: true }, ["Volver a entrar"]);
    var gTitulo: any = el("h3", { style: "margin:6px 0 0;font-size:13px" }, ["Gente"]);
    var listaG: any = el("ul", { style: "list-style:none;margin:4px 0;padding:0;max-height:22vh;overflow:auto" });
    var gSeccion: any = el("div", { id: "presenciaListaGente" }, [gTitulo, listaG]);
    var chat: any = el("ol", { style: "list-style:none;margin:6px 0;padding:0", "aria-live": "polite", "aria-label": "Chat de la visita" });
    var entrada: any = el("input", { type: "text", maxLength: Chat.MAX, name: "chat-visita", autocomplete: "off", placeholder: "Escribe a la visita", "aria-label": "Mensaje para la visita (no se guarda)", style: "flex:1;min-width:0;font:inherit;min-height:44px;padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);color:inherit" });
    var forma: any = el("form", { style: "display:flex;gap:6px;padding:6px 8px 0" }, [entrada, el("button", { type: "submit", style: boton }, ["Enviar"])]);
    var nota: any = el("p", { style: "margin:4px 0;padding:0 8px;opacity:0.7;font-size:11px" }, ["Visita libre: sin voz. El chat no se guarda."]);
    var ventanaG: any = document.getElementById("ventanaGente");
    cuerpo.appendChild(estado); cuerpo.appendChild(reentra); if (!ventanaG) cuerpo.appendChild(gSeccion); cuerpo.appendChild(chat);
    if (ventanaG) ventanaG.appendChild(gSeccion);
    var raiz: any = el("section", { id: "presenciaGente", "aria-label": "Chat y gente de la visita", style: "position:absolute;left:12px;bottom:12px;z-index:30;width:min(300px,calc(100% - 24px));height:min(320px,46%);display:flex;flex-direction:column;overflow:hidden;border-radius:12px;background:rgba(16,20,24,0.88);color:#fff;font:13px/1.35 system-ui,sans-serif;box-sizing:border-box" }, [asa, cuerpo, forma, nota]);
    var cont: any = el("span", { style: "position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 4px;box-sizing:border-box;border-radius:10px;background:#e5484d;color:#fff;font-size:12px;line-height:20px;text-align:center", hidden: true });
    var burbuja: any = el("button", { type: "button", id: "presenciaBurbuja", style: "position:absolute;left:12px;bottom:12px;z-index:30;width:56px;height:56px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,0.3);background:rgba(16,20,24,0.88);color:#fff;font-size:24px;cursor:grab;display:grid;place-items:center", hidden: true }, ["💬", cont]);
    reentra.addEventListener("click", function () { conecta(); });
    entrada.addEventListener("keydown", function (e?: any) { e.stopPropagation(); if (e.key === "Escape") { ponChat("minimo"); burbuja.focus(); } });   // al escribir, las pulsaciones no mueven al paseante; Esc minimiza
    minimiza.addEventListener("click", function () { ponChat("minimo"); burbuja.focus(); });
    forma.addEventListener("submit", function (e?: any) {
      e.preventDefault();
      var txt: any = Chat.limpia(entrada.value), ahora: any = performance.now();
      if (txt === null || !sala || ahora - tChat < 700) return;   // como mucho un mensaje cada 0,7 s
      tChat = ahora; entrada.value = "";
      sala.publica("chat", Chat.codifica(txt), { fiable: true }).then(function () { anadeMensaje("Tú", txt, true); }, function () { ponEstado("No se pudo mandar el mensaje.", false); });
    });
    (visor || document.body).appendChild(raiz); (visor || document.body).appendChild(burbuja);
    ui = { nota: nota, raiz: raiz, burbuja: burbuja, cont: cont, titulo: titulo, gTitulo: gTitulo, gSeccion: gSeccion, cuerpo: cuerpo, estado: estado, reentra: reentra, listaG: listaG, chat: chat, entrada: entrada, noLeidos: 0, ventana: "abierto", mov: null, movB: null };
    conMov(function () {
      if (!ui || ui.raiz !== raiz) return;
      var defecto: any = function (d?: any) { return d.tactil ? { x: d.mg.l + 10, y: d.H * 0.36 } : { x: d.mg.l + 12, y: d.H - d.mg.b - d.h - 12 }; };   // escritorio, abajo a la izquierda; táctil, a la izquierda por encima de la cruceta
      ui.mov = dp.Movibles.hazMovible(raiz, asa, "chat", null, { defecto: defecto });
      ui.movB = dp.Movibles.hazMovible(burbuja, burbuja, "burbuja", function () { ponChat("abierto"); }, { defecto: function (d?: any) { return { x: d.mg.l + 10, y: d.H * (d.tactil ? 0.42 : 0.7) }; } });
      ui.mov.menuLlevar(llevar);
      ponChat(ui.ventana, true);
      // en móvil vertical la ventana es una hoja del 72 % de la altura y el chat (46 %) no cabe en ningún hueco: se recoge a su burbuja mientras haya ventana
      // (si no, tapa sus botones; hallado por agenda_mundo_chrome en F3g). Al cerrar la ventana no se reabre solo: lo decide la persona.
      if (visor && typeof MutationObserver !== "undefined") (observa = new MutationObserver(function () { if (ui && ui.raiz === raiz && ui.ventana === "abierto" && visor.classList.contains("con-hoja")) ponChat("minimo", true); })).observe(visor, { attributes: true, attributeFilter: ["class"] });
    });
  }
  function ponChat(s?: any, sinFoco?: any) {
    if (!ui) return;
    ui.ventana = s;
    if (s === "abierto") { ui.burbuja.hidden = true; ui.raiz.hidden = false; ui.noLeidos = 0; if (ui.mov) ui.mov.coloca(); if (!sinFoco) ui.entrada.focus({ preventScroll: true }); }
    else { ui.raiz.hidden = true; ui.burbuja.hidden = false; if (ui.movB) ui.movB.coloca(); }
    pintaNoLeidos();
  }
  function pintaNoLeidos() {
    if (!ui) return;
    var n: any = ui.noLeidos; ui.cont.hidden = !n; ui.cont.textContent = n > 99 ? "99+" : n ? String(n) : "";
    ui.burbuja.setAttribute("aria-label", "Abrir el chat" + (n ? " (" + n + " sin leer)" : "") + ". Arrastra para mover");
  }
  function ponEstado(t?: any, conBoton?: any) { if (!ui) return; ui.estado.textContent = t; ui.estado.hidden = !t; ui.reentra.hidden = !conBoton; }
  function anadeMensaje(quien?: any, txt?: any, mio?: any) {   // solo en memoria, los últimos 40: el chat no se guarda (decisión 40)
    mensajes.push({ quien: quien, txt: txt }); if (mensajes.length > 40) mensajes.shift();
    if (!ui) return;
    ui.chat.appendChild(el("li", { style: "margin:2px 0" + (mio ? ";opacity:0.85" : "") }, [el("strong", {}, [quien + ": "]), txt]));
    while (ui.chat.children.length > 40) ui.chat.removeChild(ui.chat.firstChild);
    ui.cuerpo.scrollTop = ui.cuerpo.scrollHeight;
    if (!mio && ui.ventana === "minimo") { ui.noLeidos++; pintaNoLeidos(); }
  }
  function pintaGente(tMs?: any) {
    if (!ui) return;
    var enMundo: any = !!(sala && poseLocal(tMs)), g: any = SalaPose.gente(SP, tMs), clave: any = (yo ? "1" : "0") + (enMundo ? "m" : "a") + g.map(function (x?: any) { return x.id + x.estado + (bloqueados[x.id] ? "b" : ""); }).join("|");
    if (clave === claveGente) return; claveGente = clave;
    ui.gTitulo.textContent = "Gente (" + (g.length + (yo ? 1 : 0)) + ")";
    while (ui.listaG.firstChild) ui.listaG.removeChild(ui.listaG.firstChild);
    if (yo) ui.listaG.appendChild(el("li", { style: "margin:3px 0" }, [el("strong", {}, ["Tú · " + (yo.info.oficial ? "◆ " : "") + yo.info.alias]), " · " + (enMundo ? "en el olivar" : "en vista aérea (no te ven)")]));
    g.forEach(function (x?: any) {
      var m: any = x.info || SalaPose.leeInfo(""), bl: any = !!bloqueados[x.id];
      var b: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", "aria-pressed": bl ? "true" : "false", title: "Solo te afecta a ti; nadie se entera" }, [bl ? "Desbloquear" : "Bloquear"]);
      b.addEventListener("click", function () { if (bloqueados[x.id]) delete bloqueados[x.id]; else bloqueados[x.id] = true; claveGente = ""; pintaGente(performance.now()); });
      // OF10: la oficina, la primera (SalaPose.gente) y con su insignia ◆ (decisión 107: siempre se sabe si la oficina está)
      var hijos: any = [(m.oficial ? "◆ " : "") + m.alias + " · " + m.rol + " · " + m.dispositivo + " · " + x.estado, b];
      if (x.enMundo && !bl) {   // «Ir con»: solo a quien está en el olivar (con pose) y no has bloqueado
        var ic: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.55);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer", title: "Te deja a unos pasos, mirándola" }, ["Ir con " + m.alias]);
        ic.addEventListener("click", function () { irCon(x.id); });
        hijos.push(ic);
      }
      if (!bl) accionesDe(x.id, m.alias, "gente").forEach(function (ac?: any) {   // F3k-3: las de otros componentes (invitar a hablar…), con su texto
        var bt: any = el("button", { type: "button", style: "font:inherit;color:inherit;background:none;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:1px 6px;margin-left:6px;cursor:pointer;min-height:32px" }, [ac.txt]);
        bt.addEventListener("click", function () { ac.fn(); });
        hijos.push(bt);
      });
      ui.listaG.appendChild(el("li", { style: "margin:3px 0" + (bl ? ";opacity:0.55" : "") }, hijos));
    });
  }

  // ---- «Ir con alguien» (I1, UX §5): quién se ve (para el minimapa y el panel Gente) y a dónde ir para estar a su lado. Solo a quien se dibuja: de
  // esta sala, con pose (no «en vista aérea») y sin bloquear por ti. No manda nada por la red: usa la pose que ya llega. Este módulo solo calcula el
  // punto (Encuentro, en el trozo puro); el salto, con su fundido en pantalla y en VR (nunca un vuelo de cámara), es el de 12b_llegada.js (Llegada.funde y Llegada.aparece)
  var puntosL: any = [];
  function seVe(a?: any, tMs?: any) { return !!a && enExterior() && a.visto && (variante !== "red" || SalaPose.seVe(SP, a.id, tMs, bloqueados)); }
  function idDe(a?: any) { return variante === "red" ? a.id : "sim" + a.k; }
  function busca(id?: any) { if (variante === "red") return porId[id] || null; var m: any = /^sim(\d+)$/.exec(String(id)); return m ? V[Number(m[1])] || null : null; }
  function puntos() {   // [{id, alias, x este, y norte, modo}] de los que se dibujan ahora mismo
    puntosL.length = 0; if (!activo) return puntosL;
    var tMs: any = performance.now(), l: any = variante === "red" ? Object.keys(porId).map(function (k?: any) { return porId[k]; }) : V;
    for (var i: any = 0; i < l.length; i++) { var a: any = l[i]; if (!seVe(a, tMs)) continue; var c: any = a.out.cab.p; puntosL.push({ id: idDe(a), alias: a.alias, x: c[0], y: -c[2], modo: a.out.modo | 0 }); }
    return puntosL;
  }
  function destino(a?: any) { var c: any = a.out.cab.p; return sitioJunto({ x: c[0], y: -c[2] }, oyente(), null, dp.enQuad && !dp.VRX.on ? 1.05 : 0.55); }
  function irCon(id?: any) {
    if (!activo) return false;
    var a: any = busca(id); if (!seVe(a, performance.now())) return false;   // bloqueado, en vista aérea o ya no está: no se va
    // a oscuras (Llegada.funde, 12b_llegada.js: velo en pantalla, vrFundido con gafas) se recalcula el sitio (se ha podido mover) y se aparece allí
    return dp.Llegada.funde(function () {
      if (!seVe(a, performance.now())) return;   // se fue (o la bloqueaste) mientras se fundía: te quedas donde estabas
      var L: any = destino(a), orbita: any = !dp.paseando && !dp.VRX.on;
      dp.Llegada.aparece(L.x, L.y, L.ang);
      if (orbita) dp.TR.act = false;   // sin la bajada volando de entrar al paseo (24_pantalla.js): ir con alguien nunca es un vuelo de cámara
      est.idas = (est.idas || 0) + 1; est.ultimaIda = { x: Math.round(L.x * 100) / 100, y: Math.round(L.y * 100) / 100, d: Math.round(L.d * 100) / 100, libre: L.libre };
    });
  }

  // ---- C7 (02e_entidades.js): las personas que se ven, como entidades persona:<id> (el de la sala o, en la simulación, sim<k>). Solo con presencia y solo
  // las que se dibujan (de esta sala, con pose, sin bloquear). Tocarla (a menos de 24 px de su cuerpo, de los pies a la cabeza) o apuntarla con el rayo de un
  // mando la elige y abre su ficha: cómo va, a cuántos metros y «Ir con» (irCon: fundido y de pie a su lado). El alias es de otra persona: siempre como texto.
  var quitaPersona: any = null, pv1: any = new THREE.Vector3(), pv2: any = new THREE.Vector3(), MODOS_P: any = ["a pie", "en quad", "con el dron"];
  function personaDe(id?: any) { var m: any = /^persona:(.+)$/.exec(String(id)), a: any = m ? busca(m[1]) : null; return a && seVe(a, performance.now()) ? a : null; }
  function personasVistas() { var tMs: any = performance.now(); return personasTodas().filter(function (a?: any) { return seVe(a, tMs); }); }
  function personaEnPantalla(cx?: any, cy?: any, r?: any) {
    var mejor: any = null, md: any = 24;
    personasVistas().forEach(function (a?: any) {
      var c: any = a.out.cab.p; pv1.set(c[0], c[1] - 1.55, c[2]).project(camera); pv2.set(c[0], c[1] + 0.15, c[2]).project(camera); if (pv1.z > 1 && pv2.z > 1) return;
      var ax: any = (pv1.x * 0.5 + 0.5) * r.width + r.left, ay: any = (-pv1.y * 0.5 + 0.5) * r.height + r.top, bx: any = (pv2.x * 0.5 + 0.5) * r.width + r.left, by: any = (-pv2.y * 0.5 + 0.5) * r.height + r.top;
      var vx: any = bx - ax, vy: any = by - ay, L: any = vx * vx + vy * vy || 1, t: any = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / L)), d: any = Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
      if (d < md) { md = d; mejor = a; }
    });
    return mejor ? { id: "persona:" + idDe(mejor), s: md / 24 } : null;
  }
  function personaEnRayo(rr?: any) {   // un cilindro de los pies a la cabeza con un radio que crece con la distancia (al menos 0,5 m), a 0,4-300 m
    var o: any = rr.ray.origin, d: any = rr.ray.direction, bb: any = d.y, den: any = 1 - bb * bb, mejor: any = null, ms: any = 1e9; if (den < 1e-6) return null;
    personasVistas().forEach(function (a?: any) {
      var c: any = a.out.cab.p, y0: any = c[1] - 1.55; pv1.set(o.x - c[0], o.y - y0, o.z - c[2]);
      var dw: any = d.x * pv1.x + d.y * pv1.y + d.z * pv1.z, s: any = Math.max(0, Math.min(1.7, (pv1.y - bb * dw) / den)), t: any = (c[0] - o.x) * d.x + (y0 + s - o.y) * d.y + (c[2] - o.z) * d.z;
      if (t < 0.4 || t > 300) return;
      var dist: any = Math.hypot(o.x + d.x * t - c[0], o.y + d.y * t - y0 - s, o.z + d.z * t - c[2]), sc: any = dist / Math.max(0.5, t * 0.01);
      if (sc < 1 && sc + t * 0.0005 < ms) { ms = sc + t * 0.0005; mejor = { id: "persona:" + idDe(a), t: t, s: sc }; }
    });
    return mejor;
  }
  function fichaPersona(id?: any, modoF?: any) {
    var a: any = personaDe(id); if (!a) return null;
    var c: any = a.out.cab.p, o: any = oyente(), m: any = MODOS_P[a.out.modo | 0] || MODOS_P[0], al: any = String(a.alias || "Visitante"), dm: any = Math.round(Math.hypot(c[0] - o.x, -c[2] - o.y));
    return { titulo: al, filas: [{ k: "Va", v: m }, { k: "Está", v: "a " + dm + " m de ti" }], lineas: [m + " · a " + dm + " m de ti"],
      acciones: [{ id: "ir", txt: modoF === "vr" ? "Ir con" : "Ir con " + al, fn: function () { return irCon(idDe(a)); } }].concat(accionesDe(idDe(a), al, modoF)) };
  }
  // F3k-3: punto de extensión de las acciones sobre una persona (la ficha al tocarla o apuntarla, y su fila de Gente). Otro componente (47b_corro.js: invitar a
  // hablar, silenciar, bloquear la voz, avisar) registra fn(identidad, { alias, distancia (m, o null sin pose), modo ("pantalla" | "vr" | "gente") }) → [{ id, txt, fn }].
  // Lo que devuelve son acciones de quien lo registra: aquí solo se ponen como botones con su texto (textContent). accionesPersona(fn) devuelve la función que lo quita
  var proveedores: any = [];
  function accionesPersona(fn?: any) { if (typeof fn !== "function") return function () {}; proveedores.push(fn); claveGente = ""; return function () { var i: any = proveedores.indexOf(fn); if (i >= 0) proveedores.splice(i, 1); claveGente = ""; }; }
  function accionesDe(identidad?: any, alias?: any, modoF?: any) {
    var d: any = distancia(identidad), out: any = [];
    proveedores.forEach(function (fn?: any) { try { (fn(identidad, { alias: alias, distancia: d, modo: modoF || "pantalla" }) || []).forEach(function (x?: any) { if (x && typeof x.txt === "string" && typeof x.fn === "function") out.push({ id: String(x.id || "accion"), txt: x.txt, fn: x.fn }); }); } catch (e: any) {} });
    return out;
  }
  // a cuántos metros (en el plano) está esa persona de ti; null si no se la ve (de otra sala, sin pose, en vista aérea o bloqueada por ti)
  function distancia(identidad?: any) {
    var a: any = activo ? busca(identidad) : null; if (!seVe(a, performance.now())) return null;
    var c: any = a.out.cab.p, o: any = oyente(); return Math.hypot(c[0] - o.x, -c[2] - o.y);
  }
  function repintaGente() { claveGente = ""; if (ui) pintaGente(performance.now()); }
  function registraPersona() { quitaPersona = Entidades.registra({ tipo: "persona", dueno: "38_presencia_compartida", prioridad: 30, pantalla: personaEnPantalla, rayo: personaEnRayo, ficha: fichaPersona,
    existe: function (id?: any) { return !!personaDe(id); },
    lista: function () { return puntos().map(function (q?: any) { return { id: "persona:" + q.id, ref: q.id, alias: q.alias, x: q.x, y: q.y, modo: q.modo }; }); },
    pos: function (id?: any) { var a: any = personaDe(id), c: any = a && a.out.cab.p; return c ? { x: c[0], y: suelo(c[0], -c[2]) * Estado.exag, z: c[2] } : null; },
    radio: function () { return 0.7; } }); }
  if (variante) registraPersona();

  function actualiza(dt?: any) {
    if (!activo) return;
    var t0: any = performance.now(), tMs: any = Math.round(t0), nc: any = 0, i: any;
    if (!enExterior()) {   // T0: dentro de un interior no se dibuja a nadie (los grupos, también el de los VRM, ocultos); la red sigue su tic sin pose y el panel Gente se repinta
      if (fueraOculto !== true) { fueraOculto = true; if (grupo) grupo.visible = false; if (vrmG && vrmG.muestra) vrmG.muestra(false); }
      if (variante === "red") { SalaPose.tic(SP, t0, null); tGente += dt; if (tGente >= 0.5) { tGente = 0; pintaGente(t0); } }
      return;
    }
    if (fueraOculto) { fueraOculto = false; if (grupo) grupo.visible = true; if (vrmG && vrmG.muestra) vrmG.muestra(true); }
    nVehQ = 0; nVehD = 0; tVeh += dt;
    if (variante === "red") actualizaRed(dt, t0);
    else {
      var ol: any = oyente();
      for (i = 0; i < V.length; i++) { anda(V[i], dt); emite(V[i], dt, tMs, ol); }
      entrega(tMs);
      for (i = 0; i < V.length; i++) { coloca(V[i], tMs, dt, V[i].cerca ? RET_CERCA : RET_LEJOS); if (V[i].cerca) nc++; }   // [SUPUESTO] el receptor sabe si le llega a 10 o a 2 Hz por la distancia que él mismo ve
      est.cerca = nc;
    }
    if (vrmG) vrmG.actualiza(dt);
    for (i = 0; i < mallasInst.length; i++) { mallasInst[i].instanceMatrix.needsUpdate = true; esferaInst(mallasInst[i]); }   // AG-1.3b: el volumen, con las matrices ya escritas
    if (mQuad) { mQuad.visible = nVehQ > 0; mQuad.instanceMatrix.needsUpdate = true; if (nVehQ > 0) esferaInst(mQuad); }
    if (mDron) { mDron.visible = nVehD > 0; mDron.instanceMatrix.needsUpdate = true; if (nVehD > 0) esferaInst(mDron); }
    est.quad = nVehQ; est.dron = nVehD;
    var ms: any = performance.now() - t0; msVentana = Math.max(msVentana, ms); est.ms = est.ms ? est.ms * 0.95 + ms * 0.05 : ms;
    tEst += dt;
    if (tEst >= 1) cierraVentana();
  }
  function cierraVentana() {   // una vez por segundo (medida de la presencia: ?debug y las pruebas), no en cada fotograma
    est.bps = Math.round(bytesVentana / tEst); est.msMax = msVentana; est.retP95 = Math.round(p95(muestrasRet)); est.errP95 = Math.round(p95(muestrasErr) * 100) / 100;
    bytesVentana = 0; msVentana = 0; tEst = 0; if (muestrasRet.length > 4000) { muestrasRet = muestrasRet.slice(-2000); muestrasErr = muestrasErr.slice(-2000); }
  }
  function personasTodas() { return variante === "red" ? Object.keys(porId).map(function (k?: any) { return porId[k]; }) : V; }
  function estado() {
    var e: any = { activo: activo, variante: variante, n: est.n, quest: est.quest, cerca: est.cerca, enviados: est.enviados, recibidos: est.recibidos, perdidos: est.perdidos, viejos: est.viejos, bytes: est.bytes,
      bytesPorSegundo: est.bps, ms: Math.round(est.ms * 1000) / 1000, msMax: Math.round(est.msMax * 1000) / 1000, retardoP95ms: est.retP95, errorP95m: est.errP95, vistos: V.filter(function (a?: any) { return a.visto; }).length,
      enQuad: est.quad || 0, conDron: est.dron || 0, vehiculos: !!(mQuad && mDron), idas: est.idas || 0, ultimaIda: est.ultimaIda || null, vrm: vrmG ? vrmG.estado() : null,
      aspecto: mSombrero ? { cajas: mSombrero.count, ruedas: mRuedas.count, sillas: personasTodas().filter(function (a?: any) { return a.mov === "silla"; }).length, bastones: personasTodas().filter(function (a?: any) { return a.mov === "baston"; }).length, andadores: personasTodas().filter(function (a?: any) { return a.mov === "andador"; }).length } : null };
    if (variante === "red") { e.sala = claveSala; e.evento = claveSala === "guiada" ? eventoGuiada : null; e.oficina = !!(yo && yo.info.oficial); e.conectado = !!sala; e.identidad = yo ? yo.identidad : null; e.vistos = Object.keys(porId).filter(function (k?: any) { return porId[k].visto; }).length; e.sinPlaza = est.sinPlaza || 0; e.enVistaAerea = !(sala && poseLocal(Math.round(performance.now()))); }
    return e;
  }
  function libera() {   // libera todo lo de la GPU (y, en red, sale de la sala y retira el apartado) y deja la presencia como sin la bandera
    if (tReintento) { clearTimeout(tReintento); tReintento = 0; }
    if (quitaPersona) { quitaPersona(); quitaPersona = null; }   // C7: sin presencia no hay personas que elegir
    quitaRed.splice(0).forEach(function (q?: any) { q(); }); quitaMandos.splice(0).forEach(function (q?: any) { q(); });
    if (SR) { var s: any = SR; SR = null; sala = null; activo = false; s.sale(); }   // sale de la sala «visita» (o deja de entrar, si estaba entrando)
    if (observa) { observa.disconnect(); observa = null; }   // A3-6a: el observador del chat en móvil vertical seguía vivo tras liberar
    if (!grupo) return;
    activo = false;
    if (vrmG) vrmG.libera();
    if (ui) { ui.raiz.remove(); ui.burbuja.remove(); ui.gSeccion.remove(); ui = null; }
    scene.remove(grupo); [mCuerpo, mCabeza, mSombrero, mManos, mNombres, mRuedas, mQuad, mDron].forEach(function (m?: any) { if (m) m.dispose(); }); mQuad = null; mDron = null;
    geos.forEach(function (g?: any) { g.dispose(); }); mats.forEach(function (m?: any) { m.dispose(); }); materiales.libera(); if (texNombres) texNombres.dispose();
    try { if (cxNom && cxNom.canvas) cxNom.canvas.width = cxNom.canvas.height = 0; } catch (e: any) {}   // A3-6a: el lienzo del atlas de nombres (1024 × 624) se suelta
    texNombres = null; cxNom = null; geos = []; mats = [];
    grupo = null; mallasInst = []; V = []; redSim = []; porId = Object.create(null); mensajes = [];
  }
  function texto() { return activo ? "presencia (" + variante + ") " + est.n + " · cerca " + est.cerca + " · " + est.bps + " B/s · JS " + est.ms.toFixed(2) + " ms" + (variante === "sim" ? " · retardo p95 " + est.retP95 + " ms" : sala ? "" : " · sin conexión" + (avisoAuto ? " (" + avisoAuto + (tReintento ? ", reintento " + fallosAuto : "") + ")" : "")) : ""; }
  if (variante === "sim") { inicia(); if (/[?&]chat=1(&|$)/.test(location.search)) montaPanel(); }   // &chat=1 (solo pruebas): la ventana del chat también en la simulación, sin sala
  else if (variante === "red") iniciaRed();
  // F2b: el arranque solo. Pregunta UNA vez a la api; con { red: true } arranca como con ?presencia=red. Sin api (file://, fixture, banco), sin sesión, con error
  // de red o con otra respuesta, no hace nada y calla (la guarda es el prefijo: sin él no se hace ni el fetch). Nada de esto es medido: es una función de red.
  function arrancaAuto() {
    if (variante || auto || !PREFIJO_API || typeof fetch !== "function") return;
    auto = true;
    fetch(PREFIJO_API + "presencia", { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r?: any) { if (!r.ok && r.status >= 500) fallaAuto("api " + r.status); return r.ok ? r.json() : null; }).then(function (j?: any) {
      if (variante || quitaPersona || grupo || !AutoPresencia.decideRed(j) || AutoPresencia.decide(location.search, PREFIJO_API, verAjuste()) !== "pregunta") { auto = false; return; }   // ya hay presencia, no hay red o la apagaron mientras
      variante = "red"; activo = true; registraPersona(); iniciaRed(); avisoAuto = ""; fallosAuto = 0;
      n.emite("presencia:activada", { variante: "red" });   // los avatares VRM miran la presencia al montarse (y se montaron vacíos): al oírlo se remontan
    }).catch(function () { auto = false; fallaAuto("sin respuesta de la api"); });
  }
  reintentaAuto = function () {
    if (quitaPersona && activo && !sala && auto) { conecta(); return; }   // arrancó sola pero la sala no conectó: solo la conexión
    if (!variante && !grupo) arrancaAuto();   // la pregunta a la api no llegó
  };
  function verAjuste() { try { return typeof dp.Ajustes !== "undefined" && dp.Ajustes.lee ? dp.Ajustes.lee("presencia.ver") : true; } catch (e: any) { return true; } }
  // la casilla «Ver a los demás y chatear» (marcada por defecto; Ajustes la recuerda por visitante en localStorage, con try/catch). Solo cuando hay api y la URL no manda
  // (?presencia=…): desmarcarla apaga ya la presencia que arrancó sola; volver a marcarla la arranca de nuevo al recargar la página
  if (!variante && PREFIJO_API && !/[?&]presencia=/.test(location.search) && typeof dp.Ajustes !== "undefined" && dp.Ajustes.registra) {
    dp.Ajustes.registra("presencia", { ver: { tipo: "bool", def: true } },
      { id: "presencia", t: "Gente", nota: "Ver a los demás visitantes y chatear con ellos cuando el servidor lo ofrece. Si la vuelves a marcar, se activa al recargar la página.",
        campos: [{ k: "ver", t: "Ver a los demás y chatear" }] },
      function (k?: any, v?: any) { if (k === "presencia.ver" && v === false && auto && activo) Componentes.libera("presencia-compartida"); });   // la pestaña se queda (no se suelta con el componente) para poder volver a marcarla
  }
  if (!variante && AutoPresencia.decide(location.search, PREFIJO_API, verAjuste()) === "pregunta") arrancaAuto();
  function llegadas() { return { origen: performance.timeOrigin, l: medLlegadas ? medLlegadas.splice(0) : null }; }
  // para los avatares VRM (26b_avatares.js): las personas (todas, o solo las que se dibujan), tu id de avatar (de tus metadatos), recolorear el muñeco
  // lejano con los colores de su avatar y si ha entrado alguien desde la última vez que se preguntó; enganchaVRM(g) pone (o quita, con null) su gancho:
  // g.coloca(a, …) devuelve true si su VRM tapa ya al muñeco; g.oculta(a), g.sale(a), g.actualiza(dt), g.estado() y g.libera()
  var cambio: any = false;
  function vrmPersonas(todas?: any) { var tMs: any = performance.now(), l: any = variante === "red" ? Object.keys(porId).map(function (k?: any) { return porId[k]; }) : V; return todas ? l : l.filter(function (a?: any) { return seVe(a, tMs); }); }
  function miVrm() { return yo && yo.info ? yo.info.vrm : null; }
  // AV4: lo tuyo para tu paseante con VRM (de tus metadatos: receta, vrm, sombrero y tus colores, los mismos que te ven los demás); null sin sala
  function miAvatar() {
    if (!yo || !yo.info) return null;
    var v: any = Aspecto.viste(yo.info);
    return { vrm: yo.info.vrm, receta: v.receta, sombrero: yo.info.sombrero, piel: v.piel, camisa: v.camisa, pantalon: v.pantalon, pelo: v.pelo, fa: v.fa, chaleco: v.chaleco };
  }
  // lo que ELIGIÓ la persona (tono o ropa de arriba) manda sobre los colores del catálogo (decisión 131); los colores del catálogo solo valen a quien no eligió
  function recolorea(a?: any, camisa?: any, piel?: any) { if (!mCuerpo) return; if (camisa != null && !a.propioCamisa) a.camisa = camisa; if (piel != null && !a.propioPiel) a.piel = piel; colorea(a); }
  function cambiaron() { var c: any = cambio; cambio = false; return c; }
  function enganchaVRM(g?: any) { vrmG = g || null; }
  // ?debug (28_depura.js): su línea, solo con la presencia activa
  n.on("depura:lineas", function (d?: any) { var t: any = texto(); if (t && d && d.lineas) d.lineas.push(t); });
  // el icono del chat de la barra (31_hud.js): minimizado (burbuja) → se abre; abierto → se minimiza y el foco va a la burbuja. Sin ventana del chat, nada
  n.on("chat:alterna", function () { if (!ui) return; if (ui.raiz.hidden) ponChat("abierto"); else { ponChat("minimo"); ui.burbuja.focus(); } });
  // OF10 (39_oficina_mundo.js): en qué sala estás y cambiar de sala, quién eres en la sala (tus metadatos leídos como datos: { alias, rol, oficial }; null fuera) y
  // dejar un mensaje en el chat (el anuncio de la oficina: el texto ya viene limpio, y se pinta como texto)
  function miInfo() { return yo && yo.info ? { alias: yo.info.alias, rol: yo.info.rol, oficial: !!yo.info.oficial } : null; }
  function mensaje(quien?: any, txt?: any) { var t: any = Chat.limpia(txt), q: any = Chat.limpia(quien); if (t && q) anadeMensaje(q, t, false); return !!(t && q); }
  // F3d (45_voz.js): dónde está la cabeza de esa identidad en la escena (x, z de la pose interpolada; y, el suelo de ESTE mundo × exageración + los ojos),
  // para situar su voz; null si no está en tu sala de presencia, no tiene pose, está en vista aérea o la bloqueaste. En la simulación, el id es «sim<k>»
  function cabeza(identidad?: any) {
    var a: any = activo ? busca(identidad) : null;
    if (!seVe(a, performance.now())) return null;
    var c: any = a.out.cab.p; return { x: c[0], y: suelo(c[0], -c[2]) * Estado.exag + ALTO_OJOS, z: c[2] };
  }
  var api: any = { activo: function () { return activo; }, actualiza: actualiza, estado: estado, libera: libera, texto: texto, llegadas: llegadas, puntos: puntos, irCon: irCon,
    vrmPersonas: vrmPersonas, miVrm: miVrm, miAvatar: miAvatar, recolorea: recolorea, cambiaron: cambiaron, enganchaVRM: enganchaVRM,
    sala: function () { return claveSala; }, cambiaSala: cambiaSala, entraGuiada: entraGuiada, avisoGuiada: function () { return avisoGuiada; }, evento: function () { return claveSala === "guiada" ? eventoGuiada : null; }, nombreSala: nombreSala,
    yo: miInfo, mensaje: mensaje, cabeza: cabeza, accionesPersona: accionesPersona, distancia: distancia, repintaGente: repintaGente };
  window.__presenciaChat = function (txt?: any) { anadeMensaje("Prueba", String(txt || "Hola"), false); };   // pruebas del chat movible (la ventana solo existe con ?presencia=red o &chat=1)
  // gancho de pruebas: estado; con "libera", apagar el componente (soltar todo; los avatares VRM se sueltan antes); con "llegadas", las poses apuntadas (P4);
  // con "puntos", quién sale en el minimapa; con "ir" e id, ir con esa persona (I1). Tras liberar sigue contestando (activo: false), como antes de C5
  window.__presencia = function (accion?: any, arg?: any) {
    if (accion === "libera") { if (!Componentes.libera("presencia-compartida")) libera(); }
    if (accion === "llegadas") return llegadas();
    if (accion === "puntos") return puntos().map(function (p?: any) { return { id: p.id, alias: p.alias, x: p.x, y: p.y, modo: p.modo }; });
    if (accion === "ir") return irCon(arg);
    return estado();
  };
  return api;
}

/** El manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?presencia=0 lo apaga; la variante la sigue diciendo
 *  ?presencia=sim|red (la lee el componente al montarse; sin ella, montado no crea nada ni dibuja nada: el motor pinta lo mismo que sin él).
 *  Consume la red (red-salas, expone «Red»): sin ella (?red=0, apagada en el servidor o fuera del motor) la presencia no se monta, tampoco la simulada. */
export function manifiestoPresencia(dp: DepsPresencia) {
  return {
    id: ID_PRESENCIA, version: 1,
    // A3-6a: solo lo que llega del legado por el talón; la pose, la sala, el chat y el muñeco se importan de red/ y de ./muneco.ts
    consume: ["Materiales", "Aparato", "Red", "Ajustes", "sitioJunto", "Llegada", "Movibles", "VRX", "TR", "Paseo", "pp", "Vida", "quad", "dron", "objetivo", "texColor"],
    expone: ["Presencia"],
    eventos: { escucha: ["chat:alterna", "depura:lineas", "guiada:entrar"], emite: ["guiada:entrada", "presencia:activada"] },
    bandera: { defecto: true, url: "presencia" },
    // muñecos instanciados (cuerpo, cabeza, sombrero y apoyo, manos, nombres, ruedas de la silla) + quad y dron de los demás: 8 llamadas tengas los que tengas;
    // ≈ 234 triángulos por persona como mucho (98 medidos sin accesorios, MEDIDAS) × 49 plazas + los vehículos [estimado, sin medir con vehículos]; el atlas de nombres (1024 × 624)
    presupuesto: { llamadas: 8, triangulos: 40000, texturasMB: 3 },
    fases: { mundo: 0 },
    mundos: "todos" as const,   // A3-6a: de todo mundo (COMPONENTES §3.2)
    monta: function (n: any) { return creaPresencia(dp, n, n.api("red-salas")); },
    actualiza: { mundo: function (dt: number, _t: number, api: any) { api.actualiza(dt); } },
    libera: function (api: any) { if (api) api.libera(); }
  };
}
export type Presencia = ReturnType<typeof creaPresencia>;
