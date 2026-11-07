// escuchaTema (A3-8a): el atributo data-theme y prefers-color-scheme, con dobles; quitar deja de escuchar las dos cosas.
import { assert, describe, it } from "vitest";
import { escuchaTema } from "./tema.ts";

describe("escuchaTema", () => {
  it("observa data-theme de <html> y la preferencia del sistema; la función que devuelve suelta las dos", () => {
    const raiz = {}, log: string[] = [], oyentes: (() => void)[] = [];
    class Obs { constructor(_fn: () => void) {} observe(n: unknown, o: { attributeFilter: string[] }) { log.push("observa " + (n === raiz) + " " + o.attributeFilter.join()); } disconnect() { log.push("suelta"); } }
    const mq = { addEventListener: (_t: string, f: () => void) => { oyentes.push(f); }, removeEventListener: (_t: string, f: () => void) => { oyentes.splice(oyentes.indexOf(f), 1); } };
    const pedidas: string[] = [], fn = () => {};
    const quita = escuchaTema({ documento: { documentElement: raiz }, ventana: { matchMedia: (q: string) => { pedidas.push(q); return mq; } }, Observador: Obs }, fn);
    assert.deepEqual(log, ["observa true data-theme"]); assert.deepEqual(pedidas, ["(prefers-color-scheme: dark)"]); assert.deepEqual(oyentes, [fn]);
    quita(); assert.deepEqual(log, ["observa true data-theme", "suelta"]); assert.deepEqual(oyentes, []);
  });
  it("sin matchMedia, solo el atributo", () => {
    let soltado = false;
    class Obs { constructor(_fn: () => void) {} observe() {} disconnect() { soltado = true; } }
    const quita = escuchaTema({ documento: { documentElement: {} }, ventana: {}, Observador: Obs }, () => {});
    quita(); assert.ok(soltado);
  });
});
