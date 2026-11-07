// Las huellas y el polvo (componente «huellas-polvo», ADR-0023, C10; MU5-n, A3-5: antes apps/web/motor/22b_huellas_polvo.js, que queda como talón): las pisadas y rodadas que se
// desvanecen (un anillo de 900 decals instanciados que siguen el terreno) y las bocanadas de polvo del suelo seco (200 puntos). Quien levanta polvo (el aterrizaje del muñequito, los
// perros) lo pide por el Bus con «polvo:emite»; apagado (?huellas=0) no se dibuja nada y esos eventos no los atiende nadie.
// Componente de los mundos ["exterior"] con un libera() que suelta de verdad: las dos mallas (quitadas de la escena), sus geometrías y sus dos materiales (por la fábrica, con dueño «huellas-polvo»).
// Medido / deducido / ilustrativo (regla 5): las huellas y el polvo son ILUSTRATIVOS (lo único que se sabe es dónde está quien pasea y si el suelo está seco).
// Del legado recibe por argumento lo que necesita (THREE, la escena, el estado del paseo y del quad, el tiempo y el suelo); no lee globales.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";
import type { LecturaVida, T3 } from "./vida-tipos.ts";
import { centroPunto, espejoSprites, uvPunto } from "./puntos-tsl.ts";

export interface DepsHuellasPolvo extends LecturaVida {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  Estaticos: { congela(o: unknown): void };
  Materiales: Materiales;
  suelo(x: number, y: number): number;
  /** Estado.exag (un campo que cambia: se lee en cada llamada) */
  Estado: { exag: number };
  /** 12_paseo: el muñequito, si pasea y las teclas (el objeto se reemplaza al salir del paseo: por función) */
  pp: { x: number; y: number; ang: number; paso: number };
  paseando(): boolean;
  teclas(): { run?: boolean };
  /** 15_tiempo: el tiempo y el nivel del sol */
  cur: { ms: number; viento: number; dir: number };
  nivelEn(ms: number, tmp: T3): { d: number };
  /** 16_vida: el dron (x, y, h) y la altura del suelo de dibujo */
  dr: { x: number; y: number; h: number };
  altSuelo(x: number, y: number): number;
  /** 22_huellas: ¿levanta polvo el suelo de (x, y)? */
  sueloSeco(x: number, y: number): boolean;
}

export const ID_HUELLAS_POLVO = "huellas-polvo";

// ---------------------------------------------------------------- los materiales (MU5-n: por la fábrica, con sus nombres de la tabla de MATERIALES §1, filas 20 y 21)
/** los nombres de los materiales en la fábrica: son también la clave de su variante TSL */
export const MATERIAL_HUELLA = "huella";
export const MATERIAL_POLVO = "polvo";
/** Las huellas: un ShaderMaterial instanciado que las borra con la edad (aBorn, aVida y aTipo por instancia). El clásico es el de siempre, movido; recibe sus uniformes (`opc.uniforms`). */
export function defHuella(): DefMaterial<OpcSombreador> {
  return {
    clasico: function (opc, c) {
      return new (c.THREE["ShaderMaterial"] as new (o: unknown) => MaterialMin)({
        uniforms: opc.uniforms, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        vertexShader: "attribute float aBorn; attribute float aVida; attribute float aTipo; uniform float uNow; varying vec2 vUv; varying float vAge; varying float vTipo;\n" +
          "void main(){ vUv = uv; vTipo = aTipo; vAge = clamp((uNow - aBorn) / aVida, 0.0, 1.0); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 uColor; varying vec2 vUv; varying float vAge; varying float vTipo;\n" +
          "void main(){ vec2 p = vUv - 0.5; float a;\n" +
          "if (vTipo < 0.5) { float borde = smoothstep(0.5, 0.34, abs(p.x)); float tacos = 0.62 + 0.38 * step(0.5, fract(vUv.y * 5.0 + abs(p.x) * 2.5)); a = borde * tacos * 0.6; }\n" +
          "else { float planta = smoothstep(1.0, 0.7, length(vec2(p.x / 0.3, (p.y + 0.14) / 0.32))); float punta = smoothstep(1.0, 0.7, length(vec2(p.x / 0.36, (p.y - 0.30) / 0.16))); a = max(planta, punta * 0.9) * 0.55; }\n" +
          "a *= 1.0 - smoothstep(0.55, 1.0, vAge); gl_FragColor = vec4(uColor, a);\n#include <colorspace_fragment>\n}"
      });
    },
    // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). Un MeshBasicNodeMaterial (transparente, sin escribir
    // profundidad y con el mismo polygonOffset) cuyo colorNode es el de las huellas: la edad (uNow − aBorn) / aVida con los MISMOS uniformes que mueve actualizaHuellas, el dibujo
    // de la pisada o la rodada según aTipo (los atributos de instancia del clásico) y el borrado con la edad. El renderer pasa del color lineal al de pantalla (el clásico lo hacía con
    // colorspace_fragment). El smoothstep(a, b, x) del GLSL con a > b se escribe 1 − smoothstep(b, a, x): lo mismo, y WGSL exige a < b.
    // FALTA: nada conocido del dibujo; NO VERIFICADO que el grafo compile ni que se vea igual (capturas por material: MU6).
    tsl: function (opc, c) {
      const T = c.TSL as T3, M = c.THREE["MeshBasicNodeMaterial"] as new (o: unknown) => MaterialMin;
      const u = opc.uniforms as T3, uNow = T.uniform(u["uNow"].value).onObjectUpdate(function () { return u["uNow"].value; }), uColor = T.uniform(u["uColor"].value);   // el mismo Color, que se mueve en su sitio
      const edad = T.clamp(uNow.sub(T.attribute("aBorn", "float")).div(T.attribute("aVida", "float")), 0, 1), tipo = T.attribute("aTipo", "float"), p = T.uv().sub(0.5);
      const uno = (a: T3, b: T3, x: T3): T3 => T.float(1).sub(T.smoothstep(b, a, x));   // el smoothstep(a, b, x) de GLSL con a > b
      const borde = uno(0.5, 0.34, T.abs(p.x)), tacos = T.float(0.62).add(T.float(0.38).mul(T.step(0.5, T.fract(T.uv().y.mul(5).add(T.abs(p.x).mul(2.5)))))), rodada = borde.mul(tacos).mul(0.6);
      const planta = uno(1.0, 0.7, T.length(T.vec2(p.x.div(0.3), p.y.add(0.14).div(0.32)))), punta = uno(1.0, 0.7, T.length(T.vec2(p.x.div(0.36), p.y.sub(0.30).div(0.16)))), pisada = T.max(planta, punta.mul(0.9)).mul(0.55);
      const a = T.select(tipo.lessThan(0.5), rodada, pisada).mul(T.float(1).sub(T.smoothstep(0.55, 1.0, edad)));
      const m = new M({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }) as MaterialMin & { colorNode: unknown };
      m.colorNode = T.vec4(uColor, a);
      return m;
    }
  };
}
/** El polvo: un ShaderMaterial de puntos que suben, se abren y se apagan con la edad. */
export function defPolvo(): DefMaterial<OpcSombreador> {
  return {
    clasico: function (opc, c) {
      return new (c.THREE["ShaderMaterial"] as new (o: unknown) => MaterialMin)({
        uniforms: opc.uniforms, transparent: true, depthWrite: false,
        vertexShader: "attribute float aBorn; attribute float aVida; attribute float aTam; uniform float uNow; varying float vA;\n" +
          "void main(){ float e = clamp((uNow - aBorn) / aVida, 0.0, 1.0); vA = (1.0 - e) * (1.0 - e); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aTam * (1.0 + 2.4 * e) * (520.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "uniform vec3 uColor; uniform float uLuz; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uColor * uLuz, smoothstep(1.0, 0.1, d) * vA * 0.62);\n#include <colorspace_fragment>\n}"
      });
    },
    // MU5-n, tercer commit: la variante TSL, APAGADA. Un PointsNodeMaterial cuyo color es el del polvo por la luz del día (uLuz) y cuya opacidad es el disco suave (pointUV) por el
    // borrado con la edad ((1 − e)²) y 0,62. El tamaño sale de sizeNode (aTam · (1 + 2,4 e) · 520 / max(1, −z de vista)), como el gl_PointSize del clásico.
    // FALTA: en el WebGPURenderer un punto mide siempre 1 px (MATERIALES §5, «Los puntos»): el tamaño solo valdría con el backend WebGL del WebGPURenderer; con el nativo, el polvo pasa a
    // sprites instanciados, y eso se mide en el banco (MU6). NO VERIFICADO que el grafo compile ni que se vea igual.
    tsl: function (opc, c) {
      const T = c.TSL as T3, M = c.THREE["PointsNodeMaterial"] as new (o: unknown) => MaterialMin;
      const u = opc.uniforms as T3, uColor = T.uniform(u["uColor"].value), uLuz = T.uniform(u["uLuz"].value).onObjectUpdate(function () { return u["uLuz"].value; });
      const uNow = T.uniform(u["uNow"].value).onObjectUpdate(function () { return u["uNow"].value; });
      const e = T.clamp(uNow.sub(T.attribute("aBorn", "float")).div(T.attribute("aVida", "float")), 0, 1), vA = T.float(1).sub(e).mul(T.float(1).sub(e));
      const d = T.length(uvPunto(T).sub(0.5)).mul(2.0), disco = T.float(1).sub(T.smoothstep(0.1, 1.0, d));   // el smoothstep(1.0, 0.1, d) de GLSL
      // A4-0: sin la atenuación de three (el clásico es un ShaderMaterial: la suya va en la cuenta), con el centro del punto (también en el espejo de sprites) y el
      // tamaño en píxeles de la pantalla: gl_PointSize va en píxeles del dispositivo y three multiplica el sizeNode por screenDPR
      const m = new M({ transparent: true, depthWrite: false, sizeAttenuation: false }) as MaterialMin & { colorNode: unknown; opacityNode: unknown; sizeNode: unknown; positionNode: unknown };
      m.colorNode = uColor.mul(uLuz); m.opacityNode = disco.mul(vA).mul(0.62);
      m.positionNode = centroPunto(T);
      const mvz = T.positionView.z;   // la del centro del punto (positionNode), también en el espejo
      m.sizeNode = T.attribute("aTam", "float").mul(T.float(1).add(e.mul(2.4))).mul(T.float(520).div(T.max(1, mvz.negate()))).div(T.screenDPR);
      return m;
    }
  };
}
/** Lo que se le pasa a crea(): los uniformes, que son del componente (los mueve actualizaHuellas) */
export interface OpcSombreador { uniforms: Record<string, { value: unknown }> }

/** Monta las huellas y el polvo y devuelve su api; `libera()` lo suelta todo (una sola vez). */
export function creaHuellasPolvo(d: DepsHuellasPolvo, n: ContextoComponente) {
  const THREE = d.THREE, scene = d.scene, Estaticos = d.Estaticos, suelo = d.suelo, Estado = d.Estado, pp = d.pp, paseando = d.paseando, teclas = d.teclas;
  d.Materiales.define(MATERIAL_HUELLA, defHuella()); d.Materiales.define(MATERIAL_POLVO, defPolvo());
  const materiales = d.Materiales.de(ID_HUELLAS_POLVO);   // lo que cree este componente se libera con su libera()
  const cur = d.cur, nivelEn = d.nivelEn, tVida = d.tVida, enQuad = d.enQuad, vq = d.vq, enDron = d.enDron, dr = d.dr, altSuelo = d.altSuelo, sueloSeco = d.sueloSeco;
  // --- huellas: pisadas y rodadas que se desvanecen (un anillo de decals instanciados que siguen el terreno)
  var NH = 900, hBorn = new Float32Array(NH).fill(-1e4), hVida = new Float32Array(NH).fill(1), hTipo = new Float32Array(NH), hSig = 0, hPasoAnt = 0, hUlt: any = null;
  var hFin = -1e4, pvFin = -1e4;   // cuándo se apaga la última huella y la última bocanada: sin nada vivo no se dibujan (sin ellas three paga igual la pasada, transparente del todo)
  var geoH = new THREE.PlaneGeometry(1, 1); geoH.rotateX(-Math.PI / 2);
  geoH.setAttribute("aBorn", new THREE.InstancedBufferAttribute(hBorn, 1)); geoH.setAttribute("aVida", new THREE.InstancedBufferAttribute(hVida, 1)); geoH.setAttribute("aTipo", new THREE.InstancedBufferAttribute(hTipo, 1));
  var uHuella = { uNow: { value: 0 }, uColor: { value: new THREE.Color(0x2c2218) } };
  var matHuella: any = materiales.crea(MATERIAL_HUELLA, { uniforms: uHuella });   // el clásico es el ShaderMaterial de siempre (defHuella, arriba)
  var iHuella: any = new THREE.InstancedMesh(geoH, matHuella, NH); iHuella.frustumCulled = false; iHuella.count = 0; iHuella.visible = false; iHuella.renderOrder = 2; Estaticos.congela(iHuella); scene.add(iHuella);   // AG-1.15: las huellas viven en sus matrices de instancia
  var tmpH = new THREE.Object3D();
  function emiteHuella(x: any, y: any, ang: any, w: any, l: any, tipo: any, vida: any) {
    var i = hSig++ % NH; tmpH.position.set(x, suelo(x, y) * Estado.exag + 0.07, -y); tmpH.rotation.set(0, -ang, 0); tmpH.scale.set(w, 1, l); tmpH.updateMatrix(); iHuella.setMatrixAt(i, tmpH.matrix);
    hBorn[i] = tVida(); hVida[i] = vida; hTipo[i] = tipo; iHuella.count = Math.min(hSig, NH); hFin = Math.max(hFin, tVida() + vida); iHuella.visible = true;
    iHuella.instanceMatrix.needsUpdate = true; ["aBorn", "aVida", "aTipo"].forEach(function (k: any) { geoH.attributes[k].needsUpdate = true; });
  }

  // --- polvo: bocanadas que suben, se abren y se apagan; solo con el suelo seco
  var NPV = 200, pvPos: any = new Float32Array(NPV * 3), pvVel: any = new Float32Array(NPV * 3), pvBorn: any = new Float32Array(NPV).fill(-1e4), pvVida: any = new Float32Array(NPV).fill(1), pvTam = new Float32Array(NPV), pvSig = 0;
  var geoPv = new THREE.BufferGeometry(); geoPv.setAttribute("position", new THREE.BufferAttribute(pvPos, 3)); geoPv.setAttribute("aBorn", new THREE.BufferAttribute(pvBorn, 1)); geoPv.setAttribute("aVida", new THREE.BufferAttribute(pvVida, 1)); geoPv.setAttribute("aTam", new THREE.BufferAttribute(pvTam, 1));
  var uPolvo = { uNow: { value: 0 }, uColor: { value: new THREE.Color(0xb89e74) }, uLuz: { value: 1 } };
  var matPolvo: any = materiales.crea(MATERIAL_POLVO, { uniforms: uPolvo });   // el clásico es el ShaderMaterial de siempre (defPolvo, arriba)
  var puntosPolvo: any = new THREE.Points(geoPv, matPolvo); puntosPolvo.frustumCulled = false; puntosPolvo.visible = false; puntosPolvo.renderOrder = 7; scene.add(puntosPolvo);
  if (matPolvo && matPolvo.isNodeMaterial) espejoSprites(THREE, puntosPolvo);   // A4-0: con la TSL (MU6), sprites instanciados (puntos-tsl.ts)
  function emitePolvo(x: any, y: any, h: any, vx: any, vy: any, vz: any, tam: any, vida: any) {
    var i = pvSig++ % NPV; pvPos[i * 3] = x; pvPos[i * 3 + 1] = h; pvPos[i * 3 + 2] = -y; pvVel[i * 3] = vx; pvVel[i * 3 + 1] = vy; pvVel[i * 3 + 2] = -vz; pvBorn[i] = tVida(); pvVida[i] = vida; pvTam[i] = tam;
    pvFin = Math.max(pvFin, tVida() + vida); puntosPolvo.visible = true;
  }
  var hAcPol = 0, lvHuellas = { s: { alt: 0, az: 0 }, d: 0 };   // lvHuellas: el nivel del sol de actualizaHuellas, el mismo objeto cada fotograma (AG-1.4c)
  function actualizaHuellas(dt: any) {
    uHuella.uNow.value = tVida(); uPolvo.uNow.value = tVida(); uPolvo.uLuz.value = 0.22 + 0.78 * nivelEn(cur.ms, lvHuellas).d;
    var fx = Math.sin(pp.ang), fy = Math.cos(pp.ang), rx = Math.cos(pp.ang), ry = -Math.sin(pp.ang);
    if (paseando() && !enDron() && !enQuad()) {   // pisadas: una por zancada, alternando pie
      var z = Math.floor(pp.paso / Math.PI);
      if (z !== hPasoAnt && Math.abs(pp.paso) > 0.1) { var lado = (z % 2 === 0 ? 1 : -1) * 0.13; emiteHuella(pp.x + rx * lado, pp.y + ry * lado, pp.ang, 0.13, 0.3, 1, 75); if (teclas().run && sueloSeco(pp.x, pp.y)) emitePolvo(pp.x - fx * 0.2, pp.y - fy * 0.2, suelo(pp.x, pp.y) * Estado.exag + 0.1, -fx * 0.4 + (Math.random() - 0.5) * 0.5, 0.5, -fy * 0.4 + (Math.random() - 0.5) * 0.5, 0.3, 0.9); }
      hPasoAnt = z;
    } else hPasoAnt = Math.floor(pp.paso / Math.PI);
    if (paseando() && enQuad() && Math.abs(vq()) > 0.3) {   // rodadas de las dos ruedas traseras y polvo si el suelo está seco
      var traseraX = pp.x - fx * 0.62, traseraY = pp.y - fy * 0.62;
      if (!hUlt || Math.hypot(traseraX - hUlt[0], traseraY - hUlt[1]) > 0.7) { hUlt = [traseraX, traseraY]; [-0.58, 0.58].forEach(function (s: any) { emiteHuella(traseraX + rx * s, traseraY + ry * s, pp.ang, 0.26, 0.95, 0, 170); }); }
      if (Math.abs(vq()) > 2.5 && sueloSeco(pp.x, pp.y)) { hAcPol += dt * 22 * Math.min(1, Math.abs(vq()) / 9); while (hAcPol >= 1) { hAcPol -= 1; var s = Math.random() < 0.5 ? -0.58 : 0.58; emitePolvo(traseraX + rx * s, traseraY + ry * s, suelo(traseraX, traseraY) * Estado.exag + 0.15, -fx * 1.3 + (Math.random() - 0.5) * 0.9, 0.7 + Math.random() * 0.6, -fy * 1.3 + (Math.random() - 0.5) * 0.9, 0.55 + Math.random() * 0.4, 1.3 + Math.random() * 0.8); } }
    } else hUlt = null;
    if (enDron()) {   // el viento de las hélices levanta polvo cuando vuela bajo
      var alt = dr.h - altSuelo(dr.x, dr.y);
      if (alt < 5.5 && sueloSeco(dr.x, dr.y)) { hAcPol += dt * 34 * (1 - alt / 5.5); while (hAcPol >= 1) { hAcPol -= 1; var a = Math.random() * 6.283, r0 = 0.4 + Math.random() * 1.5; emitePolvo(dr.x + Math.cos(a) * r0, dr.y + Math.sin(a) * r0, altSuelo(dr.x, dr.y) + 0.15, Math.cos(a) * 2.6, 0.3 + Math.random() * 0.4, Math.sin(a) * 2.6, 0.5 + Math.random() * 0.4, 1.0 + Math.random() * 0.6); } }
    }
    // el polvo avanza, se frena y sube un poco; el viento del mundo lo arrastra
    var rad = Math.PI / 180, wx = -Math.sin(cur.dir * rad) * cur.viento * 0.4, wz = Math.cos(cur.dir * rad) * cur.viento * 0.4, dra = Math.max(0, 1 - 1.6 * dt);
    for (var i = 0; i < NPV; i++) {
      if (tVida() - pvBorn[i] > pvVida[i]) continue;
      pvVel[i * 3] = pvVel[i * 3] * dra + wx * dt; pvVel[i * 3 + 1] = pvVel[i * 3 + 1] * dra + 0.15 * dt; pvVel[i * 3 + 2] = pvVel[i * 3 + 2] * dra + wz * dt;
      pvPos[i * 3] += pvVel[i * 3] * dt; pvPos[i * 3 + 1] += pvVel[i * 3 + 1] * dt; pvPos[i * 3 + 2] += pvVel[i * 3 + 2] * dt;
    }
    iHuella.visible = tVida() < hFin; puntosPolvo.visible = tVida() < pvFin;   // el sombreador las lleva a alfa 0 al cumplir su vida
    geoPv.attributes.position.needsUpdate = true; geoPv.attributes.aBorn.needsUpdate = true; geoPv.attributes.aVida.needsUpdate = true; geoPv.attributes.aTam.needsUpdate = true;
  }

  let disp = false;
  /** quita las dos mallas de la escena y suelta mallas, geometrías y materiales; llamarlo dos veces no libera dos veces */
  function libera(): void {
    if (disp) return; disp = true;
    scene.remove(iHuella); scene.remove(puntosPolvo); iHuella.dispose(); geoH.dispose(); geoPv.dispose();
    materiales.libera();   // matHuella y matPolvo, de la fábrica
  }
  n.on("polvo:emite", function (e: T3) { if (e) emitePolvo(e.x, e.y, e.h, e.vx || 0, e.vy || 0, e.vz || 0, e.tam || 0.3, e.vida || 0.9); });
  return { actualiza: actualizaHuellas, emitePolvo, emiteHuella, huellas: function () { return iHuella.count; }, libera };
}
export type HuellasPolvo = ReturnType<typeof creaHuellasPolvo>;

/** El manifiesto del componente «huellas-polvo» (el mismo de siempre, ahora de los mundos ["exterior"]): lo registra el talón de 22b con Componentes.registra. */
export function manifiestoHuellasPolvo(d: DepsHuellasPolvo): Manifiesto {
  return {
    id: ID_HUELLAS_POLVO, version: 1,
    consume: ["Materiales", "Estaticos", "scene", "suelo", "Estado", "pp", "paseando", "teclas", "cur", "nivelEn", "tVida", "enQuad", "vq", "enDron", "dr", "altSuelo", "sueloSeco"],
    expone: [],
    eventos: { escucha: ["polvo:emite"], emite: [] },
    bandera: { defecto: true, url: "huellas" },
    presupuesto: { llamadas: 2, triangulos: 1800 },   // medido en Node (huellas_perros.test.js) con el anillo lleno: 900 huellas de 2 triángulos en una malla instanciada y 200 puntos de polvo
    fases: { mundo: 0 },
    mundos: ["exterior"],
    monta: function (n) { return creaHuellasPolvo(d, n); },
    actualiza: { mundo: function (dt, _t, api) { (api as HuellasPolvo).actualiza(dt); } },
    libera: function (api) { if (api) (api as HuellasPolvo).libera(); }
  };
}
