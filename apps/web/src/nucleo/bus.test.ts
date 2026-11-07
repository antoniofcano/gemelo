// El Bus, el Reparto y la Pausa (ADR-0023; COMPONENTES §3), que antes vivían en apps/web/motor/02c_componentes.js. MU5-n (A3-8a): el código vive en ./bus.ts
// y estas pruebas, aquí: la del Bus suelto se movió de pruebas/guardianes/componentes.test.js (MUNDOS §9.2). La equivalencia del Bus con el de antes de AG-1.4c
// (fotograma a fotograma, con semillas) y que emite no reserva siguen en pruebas/guardianes/bucle_equivalencia.test.js; la Pausa con el talón entero, en componentes.test.js.
import { assert, describe, it } from "vitest";
import { creaBus, creaPausa, creaReparto } from "./bus.ts";

describe("Bus", () => {
  it("on devuelve quita, emite cuenta oyentes, hay; un oyente que falla no corta a los demás (y se dice en la consola)", () => {
    const vistos: string[] = [], errores: unknown[][] = [], Bus = creaBus({ consola: { error: (...a: unknown[]) => errores.push(a) } });
    const q1 = Bus.on("a:b", d => vistos.push("1" + d)), q2 = Bus.on("a:b", () => { throw new Error("x"); }); Bus.on("a:b", d => vistos.push("3" + d));
    assert.ok(Bus.hay("a:b")); assert.strictEqual(Bus.emite("a:b", "!"), 3); assert.deepEqual(vistos, ["1!", "3!"]);
    assert.strictEqual(errores.length, 1); assert.strictEqual(errores[0]![0], "[Bus] a:b");
    q1(); q2(); q1(); assert.strictEqual(Bus.emite("a:b", "?"), 1); assert.strictEqual(Bus.emite("nadie:escucha"), 0); assert.ok(!Bus.hay("nadie:escucha"));
  });
  it("un oyente que no es función no se apunta (y su quita no hace nada); sin consola, un fallo no lanza", () => {
    const Bus = creaBus();
    const q = Bus.on("x", null as unknown as () => void); q(); assert.ok(!Bus.hay("x"));
    Bus.on("x", () => { throw new Error("y"); }); assert.doesNotThrow(() => Bus.emite("x"));
  });
  it("quien se da de alta durante una emisión no la recibe; quien se da de baja, sí (la lista de antes)", () => {
    const Bus = creaBus(), log: string[] = [];
    let q2: () => void = () => {};
    Bus.on("e", () => { log.push("a"); q2(); Bus.on("e", () => log.push("c")); });
    q2 = Bus.on("e", () => log.push("b"));
    assert.strictEqual(Bus.emite("e"), 2, "los que hay al terminar");
    assert.deepEqual(log, ["a", "b"]);
  });
});

describe("Reparto", () => {
  it("reg da de alta una vez cada bloque (con tope MAX); ini pone a cero y da la marca; pasa suma los ms desde la marca", () => {
    let t = 100; const R = creaReparto({ ahora: () => t });
    assert.strictEqual(R.reg("a"), 0); assert.strictEqual(R.reg("b"), 1); assert.strictEqual(R.reg("a"), 0); assert.strictEqual(R.n, 2);
    let q = R.ini(5); assert.strictEqual(R.t, 5); assert.strictEqual(q, 100);
    t = 103; q = R.pasa(0, q); t = 110; q = R.pasa(1, q); t = 111; R.pasa(0, q);
    assert.deepEqual([R.ms[0], R.ms[1]], [4, 7]);
    R.ini(6); assert.deepEqual([R.ms[0], R.ms[1]], [0, 0]);
    for (let i = 0; i < 80; i++) R.reg("b" + i);
    assert.strictEqual(R.n, R.MAX); assert.strictEqual(R.reg("otro"), R.MAX - 1, "lleno: el último");
    assert.strictEqual(R.on, false, "apagado hasta que el medidor lo enciende");
  });
});

describe("Pausa", () => {
  it("pon y quita por quién; «mundo:pausa» al entrar (el primero) y al salir (el último)", () => {
    const Bus = creaBus(), P = creaPausa(Bus), visto: boolean[] = [];
    Bus.on("mundo:pausa", d => visto.push(d.activa));
    assert.ok(!P.activa()); assert.ok(P.pon("x")); assert.ok(!P.pon("x"), "dos veces el mismo, una"); P.pon("y");
    assert.deepEqual(P.quien(), ["x", "y"]); P.quita("x"); assert.ok(P.activa()); assert.ok(!P.quita("x")); P.quita("y");
    assert.ok(!P.activa()); assert.deepEqual(visto, [true, false]);
    assert.ok(P.pon()); assert.deepEqual(P.quien(), ["?"], "sin quién, «?»");
  });
});
