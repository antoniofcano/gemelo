// Las teclas de los componentes (ADR-0023; COMPONENTES §3), que antes vivían en apps/web/motor/02c_componentes.js. MU5-n (A3-8a): el código vive en ./teclas.ts.
// Lo de siempre (reservadas, un dueño, nada en un campo, con Ctrl/Alt/Cmd ni al repetir) lo prueba también pruebas/guardianes/componentes.test.js con el talón
// entero; aquí, la fábrica sola con una ventana de mentira: una sola escucha, y quitar suelta la tecla.
import { assert, describe, it } from "vitest";
import { creaTeclas } from "./teclas.ts";
import type { TeclaEvento } from "./teclas.ts";

function ventana() {
  const oyentes: ((e: TeclaEvento) => void)[] = [];
  return { oyentes, addEventListener: (tipo: string, fn: (e: any) => void) => { if (tipo === "keydown") oyentes.push(fn); } };
}
const tecla = (code: string, extra?: Partial<TeclaEvento>) => {
  const e = Object.assign({ code, target: { tagName: "CANVAS" }, prevenida: false, preventDefault() { e.prevenida = true; } }, extra || {});
  return e;
};

describe("creaTeclas", () => {
  it("una sola escucha en la ventana, solo al registrar la primera; quitar suelta la tecla", () => {
    const v = ventana(), T = creaTeclas({ ventana: v }), usadas: string[] = [];
    assert.strictEqual(v.oyentes.length, 0, "nada al crearse");
    const q = T.registra("KeyJ", e => { usadas.push(e.code); }, "juegos"); T.registra("KeyK", () => false, "otro");
    assert.strictEqual(v.oyentes.length, 1);
    const e = tecla("KeyJ"); v.oyentes[0]!(e); assert.deepEqual(usadas, ["KeyJ"]); assert.ok(e.prevenida);
    const k = tecla("KeyK"); v.oyentes[0]!(k); assert.ok(!k.prevenida, "si la función devuelve false, no se anula lo del navegador");
    assert.strictEqual(T.dueno("KeyJ"), "juegos"); q!(); assert.strictEqual(T.dueno("KeyJ"), null);
  });
  it("reservadas y repetidas: null; nada en un campo, con modificadores ni al repetir", () => {
    const v = ventana(), T = creaTeclas({ ventana: v }), usadas: string[] = [];
    assert.strictEqual(T.registra("KeyW", () => {}), null); assert.strictEqual(T.dueno("KeyW"), "12_paseo"); assert.strictEqual(T.dueno("Digit3"), "31_hud");
    T.registra("KeyJ", e => { usadas.push(e.code); }); assert.strictEqual(T.registra("KeyJ", () => {}), null, "dos dueños, nunca");
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { target: { tagName: "INPUT" } }, { target: { isContentEditable: true } }]) v.oyentes[0]!(tecla("KeyJ", extra));
    assert.deepEqual(usadas, []);
  });
  it("una función que falla se dice en la consola y no anula lo del navegador por error", () => {
    const v = ventana(), errores: unknown[][] = [], T = creaTeclas({ ventana: v, consola: { error: (...a: unknown[]) => errores.push(a) } });
    T.registra("KeyJ", () => { throw new Error("x"); });
    const e = tecla("KeyJ"); v.oyentes[0]!(e);
    assert.strictEqual(errores[0]![0], "[Teclas] KeyJ"); assert.ok(e.prevenida, "como antes: usada !== false");
  });
});
