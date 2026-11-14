// El paso del tiempo en cada fotograma (actualizaTiempo): el estado del mundo avanza hacia el objetivo con suavidad y mueve el sol, el hemisferio, el fondo,
// la niebla, el tinte de los materiales del ciclo del día, la sombra de las nubes y la helada, las nubes, el viento, la lluvia, la chapita del visor y el pulso
// de la barrera. MU5-n (A3-4): antes en apps/web/motor/15_tiempo.js; el código es el de siempre, movido (lo compara fotograma a fotograma con su copia de antes
// de AG-1.4c pruebas/guardianes/bucle_equivalencia.test.js). Solo corre como paso del exterior (90_final.js): con el exterior congelado no toca la escena
// (MUNDOS §4, «Cómo quedó (MU2-7)»; lo vigila pruebas/guardianes/ambiente_mundo.test.js). Lo que escribe en la scene por fotograma es el fondo; la niebla, en su sitio.

import { anclaLluvia } from "./tiempo-lluvia.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsPasoTiempo {
  THREE: A;
  /** 03_escena */
  scene: A; camera: A; sol: A; hemi: A; SRGB: A; LUZ_SOL: number; LUZ_CIELO: number;
  /** 01_datos: la niebla de partida */
  FOG0: number; FOG1: number;
  /** el color del cielo del tema (--sky), en lineal; cambia con el tema: se lee en cada fotograma */
  cieloBase: () => A;
  /** los materiales que tiñe el ciclo del día (sus «maestros»: 07_follaje, 04d) y la nube (05: nube.material, que se lee en cada fotograma) */
  matHojaG: A; matHojaP: A; matCorteza: A; matOrto: A; matSuelo: A; nube: { material: A };
  /** tiempo-parche.ts */
  uSombra: A; uViento: A;
  /** tiempo-cielo.ts: las nubes, su malla, cómo se pintan, el sol, las estrellas y la paleta del ocaso */
  NUBES: A[]; nubesMalla: A; pintaNubes: () => void; sprSol: A; estrellas: A; OCASO_FOTOS: boolean; PALETA_OCASO: A; uOcasoN: A;
  /** tiempo-lluvia.ts */
  lluvia: A; uLluvia: A;
  /** tiempo-barrera.ts */
  uBarrera: A;
  /** 09_camara: el blanco de la cámara orbital (la caja de la lluvia va con él en la vista aérea; paseando, con la cámara: L8-01) */
  objetivo: A;
  /** 12_paseo (después en el montaje): ¿se pasea (a pie, en quad o en dron)? Sin ella, la vista aérea */
  paseando?: () => boolean;
  /** el nivel del sol (tiempo-puro.ts: creaNivelSol) */
  nivelEn: (ms: number, salida: A) => A;
  /** el estado actual y el objetivo (tiempo.ts) */
  cur: A; meta: A;
  /** la chapita del visor: hora, temperatura, cielo y viento (y de dónde sale lo que se ve) */
  $: (id: string) => A;
  TiempoPuro: A; TM: A; fmtHora: A; num1: (v: A, d?: A) => string; rumbo: (g: number) => string;
  /** L8-05: ¿el mundo enseña otra fecha (la estación del olivo de 23_estacion.js, EST.activa)? Entonces la chapita dice «estimado». Sin ella, nunca */
  estimado?: () => boolean;
  /** L6-03: «Movimiento: Reducido» al crearse: nada se mueve con el tiempo (el reloj del mundo, sí); después lo cambia calma(v) */
  calma: boolean;
}

export function creaPasoTiempo(d: DepsPasoTiempo) {
  var THREE = d.THREE, scene = d.scene, camera = d.camera, sol = d.sol, hemi = d.hemi, SRGB = d.SRGB, LUZ_SOL = d.LUZ_SOL, LUZ_CIELO = d.LUZ_CIELO, FOG0 = d.FOG0, FOG1 = d.FOG1;
  var matHojaG = d.matHojaG, matHojaP = d.matHojaP, matCorteza = d.matCorteza, matOrto = d.matOrto, matSuelo = d.matSuelo, nube = d.nube;
  var uSombra = d.uSombra, uViento = d.uViento, NUBES = d.NUBES, nubesMalla = d.nubesMalla, pintaNubes = d.pintaNubes, sprSol = d.sprSol, estrellas = d.estrellas;
  var OCASO_FOTOS = d.OCASO_FOTOS, PALETA_OCASO = d.PALETA_OCASO, uOcasoN = d.uOcasoN, lluvia = d.lluvia, uLluvia = d.uLluvia, uBarrera = d.uBarrera, objetivo = d.objetivo;
  var nivelEn = d.nivelEn, cur = d.cur, meta = d.meta, $ = d.$, TiempoPuro = d.TiempoPuro, TM = d.TM, fmtHora = d.fmtHora, num1 = d.num1, rumbo = d.rumbo;
  var calma = !!d.calma;

  var tMundo = 0, lluviaVis = 0, ins = { t: 1, txt: "" }, vFlecha = new THREE.Vector3();
  var lvT = { s: { alt: 0, az: 0 }, d: 0 };   // el nivel del sol de actualizaTiempo, el mismo objeto cada fotograma (AG-1.4b)
  // AG-1.4c: los temporales de actualizaTiempo (antes, un Vector3 y ocho Color nuevos por fotograma). scene.background pasa a ser siempre cCielo (se reescribe entero cada fotograma).
  var vDirS = new THREE.Vector3(), cDia = new THREE.Color(), cNoche = new THREE.Color(0x070b18), cOcaso = OCASO_FOTOS ? new THREE.Color(PALETA_OCASO.horizonte).lerp(new THREE.Color(PALETA_OCASO.cenit), 0.25) : new THREE.Color(0xc77b4e), cGris = new THREE.Color(), cCielo = new THREE.Color();
  var cTinta = new THREE.Color(), cTintaGris = new THREE.Color(0x6e747b), cLuz = new THREE.Color(), CLAVES_TIEMPO = ["nub", "viento", "lluvia", "hr", "temp"];
  function lerpN(a: number, b: number, t: number): number { return a + (b - a) * t; }
  function angDif(a: number, b: number): number { var d2 = ((b - a + 540) % 360) - 180; return d2; }
  // la chapita del visor, a 4 Hz como mucho (no por fotograma; AG-1.4c la saca de actualizaTiempo, que queda sin reservas)
  function chapitaTiempo(vxS: number, vzS: number): void {
      // la flecha apunta a DE DÓNDE VIENE el viento (como lo da Vigía y como las fichas del tiempo), respecto a hacia dónde mira la cámara
    // (vale en la vista aérea, a pie, en quad y en dron: se mira la cámara, no la órbita)
    ins.t = 0; camera.getWorldDirection(vFlecha); var lf = Math.hypot(vFlecha.x, vFlecha.z) || 1, fw = [vFlecha.x / lf, vFlecha.z / lf] as number[], rg = [-(fw[1] as number), fw[0] as number];
    var ang = Math.atan2(-vxS * (rg[0] as number) - vzS * (rg[1] as number), -vxS * (fw[0] as number) - vzS * (fw[1] as number)) * 180 / Math.PI;
    $("tFlecha").style.transform = "rotate(" + ang.toFixed(0) + "deg)"; $("tFlecha").style.opacity = cur.viento < 0.3 ? 0.25 : 1;
    // temperatura, cielo (deducido) y viento del momento que ves; «simulado» si no hay datos de Vigía (los efectos de ejemplo ya lo dicen en la ventana);
    // L8-05: «estimado» con la estación de otra fecha (el sol de ese día y el clima reconstruido de su semana, o el de hoy: no es una medida de ese momento)
    var cie = TiempoPuro.cielo(meta.nub, meta.lluvia, meta.hr) || "cielo sin dato";
    var txt = fmtHora.format(new Date(cur.ms)) + " · " + num1(cur.temp, 0) + " °C · " + (cur.temp <= 0 ? "helada · " : "") + cie + " · " + (cur.viento < 0.3 ? "calma" : "viento del " + rumbo(cur.dir) + " " + num1(cur.viento, 1) + " m/s") +
      TiempoPuro.rotuloOrigen(TM.demo, TM.origen, !!(d.estimado && d.estimado()));
    if (txt !== ins.txt) {
      ins.txt = txt; $("tInsT").textContent = txt;
      $("tIns").setAttribute("aria-label", "El tiempo: " + txt + ". Abre la ventana del tiempo");
    }
  }
  function actualizaTiempo(dt: number, _tms?: number): void {
    var k = Math.min(1, dt * 3.2);
    if (Math.abs(meta.ms - cur.ms) > 2 * 86400000) cur.ms = meta.ms;   // un cambio de fecha (la estación) es un salto, no un viaje en el tiempo
    cur.ms += (meta.ms - cur.ms) * Math.min(1, dt * 4); if (Math.abs(meta.ms - cur.ms) < 2000) cur.ms = meta.ms;
    for (var ci = 0; ci < CLAVES_TIEMPO.length; ci++) { var cl = CLAVES_TIEMPO[ci] as string; cur[cl] += (meta[cl] - cur[cl]) * k; }
    cur.dir = (cur.dir + angDif(cur.dir, meta.dir) * k + 360) % 360;
    tMundo += calma ? 0 : dt;
    var lv = nivelEn(cur.ms, lvT), alt = lv.s.alt, d2 = lv.d, nub = cur.nub / 100, oc = 1 - 0.55 * nub - 0.2 * Math.min(1, cur.lluvia / 3);
    // sol: dirección y color
    var dirS = vDirS.set(Math.sin(lv.s.az) * Math.cos(alt), Math.sin(alt), -Math.cos(lv.s.az) * Math.cos(alt));
    sol.position.copy(dirS).multiplyScalar(300); if (alt < 0.02) sol.position.y = 6;
    var bajo = Math.max(0, Math.min(1, 1 - Math.sin(alt) / 0.35)), noc = 1 - d2;   // bajo: 1 = sol rasante · noc: 1 = noche cerrada
    sol.color.setRGB(1, 0.94 - 0.38 * bajo, 0.82 - 0.58 * bajo, SRGB);
    sol.intensity = (0.08 + 0.85 * d2 * (1 - 0.8 * nub)) * LUZ_SOL;
    hemi.intensity = (0.2 + 0.7 * d2 * (0.55 + 0.45 * oc)) * LUZ_CIELO;
    // cielo y niebla
    var c = cCielo.copy(cNoche).lerp(cDia.copy(d.cieloBase()), d2); if (bajo > 0 && d2 > 0.02) c.lerp(cOcaso, 0.8 * bajo * Math.min(1, d2 * 2.5) * (1 - 0.7 * nub)); c.lerp(cGris.setHex(0x8a8f94).multiplyScalar(0.25 + 0.75 * d2), 0.55 * nub);
    scene.background = c; if (scene.fog) {
      scene.fog.color.copy(c); var h = Math.max(0, Math.min(1, (cur.hr - 70) / 30));
      scene.fog.near = lerpN(FOG0, 15, h * h); scene.fog.far = lerpN(FOG1, 260, h) * (1 - 0.35 * Math.min(1, cur.lluvia / 4));
    }
    // luz de lo que no se ilumina (follaje en puntos, nube de puntos, ortofoto): el mismo ciclo de día y noche
    var f = 0.2 + 0.8 * d2 * (0.7 + 0.3 * oc), r = Math.min(1, f * (1 + 0.1 * bajo - 0.22 * noc)), gc = f * (1 - 0.1 * bajo - 0.1 * noc), bc = Math.min(1, f * (1 - 0.3 * bajo + 0.28 * noc));
    matHojaG.color.setRGB(r, gc, bc, SRGB); matHojaP.color.setRGB(r, gc, bc, SRGB); matCorteza.color.setRGB(r, gc, bc, SRGB); nube.material.color.setRGB(r, gc, bc, SRGB); matOrto.color.setRGB(r, gc, bc, SRGB);
    matSuelo.color.setRGB(1 - 0.18 * Math.min(1, cur.lluvia / 2), 1 - 0.14 * Math.min(1, cur.lluvia / 2), 1 - 0.1 * Math.min(1, cur.lluvia / 2), SRGB);
    // sombras de las nubes: avanzan con el viento y se ven desde arriba, que es desde donde se mira el gemelo
    var rad0 = Math.PI / 180, vxS = -Math.sin(cur.dir * rad0), vzS = Math.cos(cur.dir * rad0), velS = calma ? 0 : 3 + cur.viento * 5;
    uSombra.uCov.value = nub; uSombra.uSomb.value = 0.5 * d2 * (1 - 0.55 * nub);
    // la helada: el aire a 2 °C o menos, cielo despejado y calma dejan escarcha sobre el suelo y las copas (más de noche que de día)
    uSombra.uHielo.value = Math.max(0, Math.min(1, (2 - cur.temp) / 3)) * (1 - 0.8 * nub) * (cur.viento > 3.5 ? 0.35 : 1) * (1 - 0.6 * d2);
    uSombra.uDrift.value.x += vxS * velS * dt * 0.0042; uSombra.uDrift.value.y += vzS * velS * dt * 0.0042;
    // objetos del cielo siguen a la cámara
    sprSol.position.copy(camera.position).addScaledVector(dirS, 3500); sprSol.visible = alt > -0.05; sprSol.material.opacity = Math.max(0, Math.min(1, (Math.sin(alt) + 0.05) * 6)) * (1 - 0.85 * nub);
    sprSol.material.color.setRGB(1, 0.85 - 0.25 * bajo, 0.65 - 0.3 * bajo, SRGB);
    estrellas.position.copy(camera.position); estrellas.material.opacity = Math.max(0, Math.min(1, (-Math.sin(alt) - 0.02) * 8)) * (1 - nub);
    estrellas.visible = estrellas.material.opacity > 0;   // AG-1.3: de día no pasa por renderBufferDirect con opacidad 0
    // nubes: tantas como diga la nubosidad; derivan hacia donde sopla el viento (más deprisa de lo real, para que se vea)
    var rad = Math.PI / 180, vx = -Math.sin(cur.dir * rad), vz = Math.cos(cur.dir * rad), vel = calma ? 0 : 3 + cur.viento * 5;
    var tinta = cTinta.setRGB(1, 1, 1).lerp(cTintaGris, Math.min(1, cur.lluvia / 2.5) * 0.9 + 0.1 * nub);
    var luz = cLuz.setRGB(r * (0.55 + 0.6 * d2), gc * (0.55 + 0.6 * d2), bc * (0.55 + 0.6 * d2), SRGB);
    for (var gi = 0; gi < NUBES.length; gi++) {
      var g = NUBES[gi];
      g.position.x += vx * vel * dt; g.position.z += vz * vel * dt;
      if (g.position.x > 1300) g.position.x -= 2600; else if (g.position.x < -1300) g.position.x += 2600;
      if (g.position.z > 1100) g.position.z -= 2200; else if (g.position.z < -1100) g.position.z += 2200;
      g.o = nub > g.umbral ? Math.min(1, (nub - g.umbral) * 14) * (0.35 + 0.55 * nub) : 0;
    }
    nubesMalla.material.uniforms.diffuse.value.copy(tinta).multiply(luz); if (OCASO_FOTOS) uOcasoN.uOcaso.value = 0.85 * bajo * Math.min(1, d2 * 2.5) * (1 - 0.6 * Math.min(1, cur.lluvia / 2)); pintaNubes();
    // viento sobre el follaje
    var amp = calma ? 0 : Math.min(0.5, 0.03 + 0.1 * cur.viento);
    uViento.uT.value = tMundo; uViento.uAmp.value = amp; uViento.uDir.value.set(vx, vz);
    // lluvia
    lluviaVis += ((cur.lluvia > 0.05 ? 1 : 0) - lluviaVis) * k; var inten = Math.min(1, cur.lluvia / 3) * 0.8 + (cur.lluvia > 0.05 ? 0.15 : 0);
    lluvia.visible = lluviaVis > 0.02 && inten > 0.02; anclaLluvia(!!(d.paseando && d.paseando()), camera.position, objetivo, lluvia.position);   // L8-01: con quien mira (la cámara al pasear), no con el blanco de la órbita
    uLluvia.uT.value = tMundo; uLluvia.uInt.value = inten * lluviaVis; uLluvia.uViento.value.set(vx * Math.min(1, cur.viento / 6), vz * Math.min(1, cur.viento / 6)); uLluvia.uColor.value.setRGB(0.4 + 0.5 * d2, 0.5 + 0.45 * d2, 0.6 + 0.35 * d2, SRGB);
    // la chapita del visor: hora, temperatura, nubes y viento, con la flecha de dónde viene el viento respecto a cómo miras
    ins.t += dt; if (ins.t > 0.25) chapitaTiempo(vxS, vzS);
    // la barrera de la linde (Tron) late
    uBarrera.uT.value = tMundo;
  }
  return {
    actualizaTiempo: actualizaTiempo, ins: ins,
    /** el reloj de lo que se mueve (s): lo leen 18_paisaje (el agua) y quien siga el mismo tiempo */
    tMundo: function (): number { return tMundo; },
    lluviaVis: function (): number { return lluviaVis; },
    /** L6-03: «Movimiento: Reducido» en marcha (Tiempo.calma, desde 33_ajustes); también lo usan las pruebas de equivalencia */
    calma: function (v: boolean): void { calma = !!v; }
  };
}
export type PasoTiempo = ReturnType<typeof creaPasoTiempo>;
