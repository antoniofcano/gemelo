// Los ganchos de las pruebas (A3-7a, MU5-n; antes 27_debug.js): window.__g con los miembros del contrato (los fija contratos.test.js); sinDibujo(true) deja el render
// sin hacer nada y sinDibujo(false) lo devuelve; lo que cambia (paseando, listo) se lee en cada llamada, no al montar.
import { describe, expect, it } from "vitest";
import { creaGanchos } from "./ganchos.ts";

describe("ganchos de las pruebas", () => {
  it("window.__g: sinDibujo quita y devuelve el render; paseando y listo se leen en cada llamada", () => {
    const ventana: Record<string, unknown> = {}, estado = { paseando: false, listo: false }, render = () => "dibuja", renderer: { render: () => unknown } = { render };
    const nada = {};
    creaGanchos({ Arboles: nada, Catalogo: nada, Escena3D: nada, OlivosTiles: nada, Cola: { pendientes: () => 1 }, SueloFotos: nada, Generados: { pendientes: () => 2 }, Lejanos: { pendientes: () => 3 },
      Mundo: nada, InfoDibujo: { lee: () => ({ llamadas: 7 }) }, Render: { memoria: () => ({ geometrias: 1, texturas: 2, bytesEstimados: 3 }) }, Estado: { modo: "gemelo", exag: 1 }, copas: [], suelo: () => 0, orb: nada, objetivo: nada, camera: nada, renderer, scene: nada,
      pon() { /* doble */ }, aplica() { /* doble */ }, entraPaseo() { estado.paseando = true; }, salePaseo() { estado.paseando = false; }, pp: { x: 0, y: 0, ang: 0 },
      get paseando() { return estado.paseando; }, teclas: {}, get listo() { return estado.listo; }, ventana });
    const g = ventana.__g as Record<string, (...a: unknown[]) => unknown>;
    expect(g.pendientes!()).toBe(6); expect(g.infoDibujo!()).toEqual({ llamadas: 7 }); expect(g.memoria!()).toEqual({ geometrias: 1, texturas: 2, bytesEstimados: 3 });
    expect(g.sinDibujo!(true)).toBe(true); expect(renderer.render()).toBe(undefined); expect(g.sinDibujo!(false)).toBe(false); expect(renderer.render).toBe(render);
    expect(g.listo!()).toBe(false); estado.listo = true; expect(g.listo!()).toBe(true);
    g.paseoEn!(5, 6, 0); expect(estado.paseando).toBe(true); expect(g.paseoEstado!()).toEqual({ paseando: true, x: 5, y: 6, ang: 0 });
  });
});
