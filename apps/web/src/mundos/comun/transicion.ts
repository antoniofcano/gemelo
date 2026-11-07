// Del mapa al paseo (MU5-n, A3-7a: antes la segunda mitad de apps/web/motor/24_pantalla.js, que queda como talón): la cámara baja volando desde donde estaba hasta
// detrás del muñequito, que cae desde el cielo y rebota al aterrizar (polvo, un golpe sordo y los perros que llegan, por el Bus); al salir, la cámara vuelve sin salto
// a la órbita. Es de la locomoción, de TODOS los mundos, como el paseo: por eso vive en mundos/comun/ y no en ui/ con el menú y la pantalla completa. No es un
// componente: no crea nada que soltar (cuatro vectores y cuatro cuaterniones de three). Código movido tal cual (solo se tipan parámetros y variables); lo que el
// legado reescribe (persona) entra por getter.
import type { T } from "./tipos.ts";

/** Lo que el talón de 24 le da: THREE, la cámara (03_escena), pp (12_paseo), altSuelo (16_vida), sueloSeco (22_huellas), el Bus; persona (12_paseo), por getter */
export interface DepsTransicion { THREE: T; camera: T; pp: T; altSuelo(x: number, y: number): number; sueloSeco(x: number, y: number): boolean; Bus: T; readonly persona: T }

export function creaTransicion(dp: DepsTransicion) {
  // --- del mapa al paseo: la cámara baja volando desde donde estaba hasta detrás del muñequito, que cae desde el cielo y rebota al aterrizar
  var TR: T = { act: false, t: 0, dur: 2.3, desde: new dp.THREE.Vector3(), qDesde: new dp.THREE.Quaternion(), caida: 34, tCae: 1.35, aterrizo: false, sal: false, ts: 0, durS: 1.1, pS: new dp.THREE.Vector3(), qS: new dp.THREE.Quaternion() };
  var qObj: T = new dp.THREE.Quaternion(), mLook: T = new dp.THREE.Matrix4(), vArr: T = new dp.THREE.Vector3(0, 1, 0);
  function suave(s?: T) { s = Math.max(0, Math.min(1, s)); return s * s * (3 - 2 * s); }
  function iniciaTransicion() {   // se llama al entrar en el paseo, con la cámara todavía en la órbita
    TR.act = true; TR.t = 0; TR.aterrizo = false; TR.sal = false; TR.desde.copy(dp.camera.position); TR.qDesde.copy(dp.camera.quaternion);
    TR.dur = Math.max(1.6, Math.min(2.8, dp.camera.position.distanceTo(new dp.THREE.Vector3(dp.pp.x, dp.altSuelo(dp.pp.x, dp.pp.y), -dp.pp.y)) / 260 + 1.5));
  }
  function transEntrada(dt?: T) {   // después de que el paseo haya puesto su cámara y su muñequito
    if (!TR.act) return;
    TR.t += dt; var s: T = suave(TR.t / TR.dur);
    dp.camera.position.lerpVectors(TR.desde, dp.camera.position.clone(), s); qObj.copy(dp.camera.quaternion); dp.camera.quaternion.copy(TR.qDesde).slerp(qObj, s);
    var T: T = TR.tCae, y: T;
    if (TR.t < T) { var u: T = TR.t / T; y = TR.caida * (1 - u * u); }
    else { var tt: T = TR.t - T; y = 0.42 * Math.abs(Math.sin(tt * 9)) * Math.exp(-tt * 4.5); if (!TR.aterrizo) { TR.aterrizo = true; aterriza(); } }
    dp.persona.position.y += y; dp.persona.rotation.x = TR.t < T ? Math.sin(TR.t * 3) * 0.12 : 0;   // un poco de braceo en la caída
    if (TR.t > TR.dur + 0.6) { TR.act = false; dp.persona.rotation.x = 0; }
  }
  function aterriza() {   // polvo y un golpe sordo; y los perros salen corriendo hacia ti
    dp.Bus.emite("perros:llegan");
    var fx: T = Math.sin(dp.pp.ang), fy: T = Math.cos(dp.pp.ang);
    if (dp.sueloSeco(dp.pp.x, dp.pp.y)) for (var i: T = 0; i < 16; i++) { var a: T = i / 16 * 6.283 + Math.random() * 0.4; dp.Bus.emite("polvo:emite", { x: dp.pp.x + Math.cos(a) * 0.3, y: dp.pp.y + Math.sin(a) * 0.3, h: dp.altSuelo(dp.pp.x, dp.pp.y) + 0.1, vx: Math.cos(a) * (1.4 + Math.random()), vy: 0.5 + Math.random() * 0.5, vz: Math.sin(a) * (1.4 + Math.random()), tam: 0.45 + Math.random() * 0.3, vida: 0.9 + Math.random() * 0.5 }); }
    dp.Bus.emite("sonido:golpe", {});
  }
  function iniciaSalida() {   // al salir del paseo la cámara vuelve sin salto a la órbita
    TR.sal = true; TR.ts = 0; TR.act = false; TR.pS.copy(dp.camera.position); TR.qS.copy(dp.camera.quaternion);
  }
  function transSalida(dt?: T) {   // después de que la órbita haya puesto su cámara
    if (!TR.sal) return;
    TR.ts += dt; var s: T = suave(TR.ts / TR.durS);
    dp.camera.position.lerpVectors(TR.pS, dp.camera.position.clone(), s); qObj.copy(dp.camera.quaternion); dp.camera.quaternion.copy(TR.qS).slerp(qObj, s);
    if (TR.ts > TR.durS) TR.sal = false;
  }
  return { TR: TR, iniciaTransicion: iniciaTransicion, transEntrada: transEntrada, iniciaSalida: iniciaSalida, transSalida: transSalida };
}
export type Transicion = ReturnType<typeof creaTransicion>;
