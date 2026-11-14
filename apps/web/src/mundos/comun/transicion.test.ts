// La transición del mapa al paseo (A3-7a, MU5-n; antes la segunda mitad de 24_pantalla.js), con el three de verdad y sin GPU: al entrar, la cámara va de donde estaba
// a la del paseo en TR.dur (entre 1,6 y 2,8 s) y el muñeco cae y aterriza una vez (golpe, polvo si el suelo está seco y los perros, por el Bus); al salir, vuelve a la
// órbita en TR.durS. No crea nada que soltar. HONESTIDAD: no se dibuja; la sensación de la caída, solo a ojo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);   // sin tipos de three en este proyecto (como vr.test.ts)
import { describe, expect, it } from "vitest";
import { creaTransicion } from "./transicion.ts";

function monta(seco: boolean, reducido = false) {
  const camera = new THREE.PerspectiveCamera(), persona = new THREE.Group(), emitidos: string[] = [];
  camera.position.set(0, 300, 0);
  const T = creaTransicion({ THREE, camera, pp: { x: 0, y: 0, ang: 0 }, altSuelo: () => 0, sueloSeco: () => seco, Bus: { emite: (ev: string) => { emitidos.push(ev); return 0; } }, persona, reducido: () => reducido });
  return { T, camera, persona, emitidos };
}

describe("transición del mapa al paseo", () => {
  it("al entrar, la duración va de 1,6 a 2,8 s y el aterrizaje avisa una vez (golpe, polvo con suelo seco y los perros)", () => {
    const { T, camera, emitidos } = monta(true);
    T.iniciaTransicion(); expect(T.TR.act).toBe(true); expect(T.TR.dur).toBeGreaterThanOrEqual(1.6); expect(T.TR.dur).toBeLessThanOrEqual(2.8);
    for (let i = 0; i < 400 && T.TR.act; i++) { camera.position.set(0, 2, 5); T.transEntrada(1 / 60); }
    expect(T.TR.act).toBe(false); expect(T.TR.aterrizo).toBe(true);
    expect(emitidos.filter(e => e === "sonido:golpe").length).toBe(1); expect(emitidos.filter(e => e === "perros:llegan").length).toBe(1);
    expect(emitidos.filter(e => e === "polvo:emite").length).toBe(16);
  });
  it("L6-03: con «Movimiento: Reducido», un corte: sin vuelo de la cámara ni caída del muñeco, aterriza en el primer fotograma (avisa igual) y la salida también es un corte", () => {
    const { T, camera, persona, emitidos } = monta(true, true);
    T.iniciaTransicion(); expect(T.TR.dur).toBeLessThan(0.01);
    persona.position.y = 0; camera.position.set(0, 2, 5); T.transEntrada(1 / 60);
    expect(T.TR.act).toBe(false); expect(T.TR.aterrizo).toBe(true); expect(persona.position.y).toBe(0); expect(camera.position.y).toBeCloseTo(2);
    expect(emitidos.filter(e => e === "perros:llegan").length).toBe(1);
    T.iniciaSalida(); T.transSalida(1 / 60); expect(T.TR.sal).toBe(false);
  });
  it("con el suelo mojado no hay polvo; al salir, vuelve a la órbita en TR.durS", () => {
    const { T, emitidos } = monta(false);
    T.iniciaTransicion(); for (let i = 0; i < 400 && T.TR.act; i++) T.transEntrada(1 / 60);
    expect(emitidos.includes("polvo:emite")).toBe(false);
    T.iniciaSalida(); expect(T.TR.sal).toBe(true); for (let i = 0; i < 200 && T.TR.sal; i++) T.transSalida(1 / 60); expect(T.TR.sal).toBe(false);
  });
});
