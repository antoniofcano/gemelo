// La lógica pura de las entidades y los usables (ADR-0023 C7; A1-11 / MU1-7). Estas pruebas vivían en pruebas/guardianes/entidades.test.js evaluando el
// trozo [puro] de apps/web/motor/02e_entidades.js; ahora prueban el módulo de verdad. El registro y la selección (con DOM, Bus y THREE de mentira)
// se quedan en el guardián: siguen en el legado.
import { describe, expect, it } from "vitest";
import { EntidadesPuro as P } from "./entidades.ts";

describe("EntidadesPuro", () => {
  it("ids «tipo:resto», tipo y resto", () => {
    expect(P.id("olivo", "cerro", 2147483650)).toBe("olivo:cerro:2147483650");
    expect(P.tipoDe("olivo:cerro:7")).toBe("olivo"); expect(P.resto("olivo:cerro:7")).toBe("cerro:7");
    expect(P.tipoDe("sin-dos-puntos")).toBe(""); expect(P.tipoDe(null)).toBe(""); expect(P.tipoDe(":x")).toBe("");
  });

  it("validación de un tipo", () => {
    const ok = { tipo: "olivo", dueno: "06_arboles", prioridad: 10, ficha() {}, pantalla() {} };
    expect(P.valida(ok)).toEqual([]);
    expect(P.valida(null)).toHaveLength(1);
    expect(P.valida({ tipo: "Mal", dueno: "", prioridad: "x" }).length).toBeGreaterThanOrEqual(4);   // tipo, dueño, prioridad y ficha
    expect(P.valida({ ...ok, rayo: 3 }).some(e => /^rayo/.test(e))).toBe(true);
    expect(P.valida({ ...ok, cerca() {} }).some(e => /radioCerca/.test(e))).toBe(true);   // con cerca, su radio
    expect(P.valida({ tipo: "x", dueno: "m", prioridad: 0, ficha() {} }).some(e => /nadie podría/.test(e))).toBe(true);   // sin forma de llegar a ella
  });

  it("al tocar gana el tipo de más prioridad y dentro de él el más de lleno; lo de fondo solo si no hay otro", () => {
    const c = [{ id: "olivo:a", prioridad: 10, s: 0.1 }, { id: "baliza:b", prioridad: 20, s: 0.9 }, { id: "haza:h", prioridad: 0, fondo: true, s: 0 }];
    expect(P.gana(c, "toque")?.id).toBe("baliza:b");   // la baliza antes que el olivo aunque esté más al borde (como antes de C7)
    expect(P.gana([c[0] as (typeof c)[number], { id: "olivo:z", prioridad: 10, s: 0.05 }], "toque")?.id).toBe("olivo:z");   // dentro del tipo, el más de lleno
    expect(P.gana([c[2] as (typeof c)[number]], "toque")?.id).toBe("haza:h");   // la haza si no hay nada delante
    expect(P.gana([c[2] as (typeof c)[number], c[0] as (typeof c)[number]], "toque")?.id).toBe("olivo:a");   // un olivo tapa la haza
    expect(P.gana([], "toque")).toBeNull(); expect(P.gana([{ id: "" }], "toque")).toBeNull();
  });

  it("con el rayo gana lo primero por el rayo; a menos de 0,5 m, la prioridad", () => {
    const o = { id: "olivo:a", prioridad: 10, t: 12, s: 0.2 }, b = { id: "baliza:b", prioridad: 20, t: 40, s: 0.1 };
    expect(P.gana([o, b], "rayo")?.id).toBe("olivo:a");   // el olivo delante de la columna
    expect(P.gana([o, { ...b, t: 8 }], "rayo")?.id).toBe("baliza:b");   // la columna delante del olivo
    expect(P.gana([o, { ...b, t: 12.3 }], "rayo")?.id).toBe("baliza:b");   // a la vez: la prioridad
  });

  it("desempata por distancia al centro, por distancia por el rayo y, al final, por el id", () => {
    expect(P.gana([{ id: "b", prioridad: 1, s: 0.5 }, { id: "a", prioridad: 1, s: 0.5 }], "toque")?.id).toBe("a");
    expect(P.gana([{ id: "a", prioridad: 1, s: 0.5, t: 3 }, { id: "b", prioridad: 1, s: 0.5, t: 2 }], "toque")?.id).toBe("b");
  });

  it("cercanía dentro del radio de cada tipo y las dos líneas de una ficha pequeña", () => {
    expect(P.cercano([{ id: "baliza:a", d: 20, radio: 17 }, { id: "baliza:b", d: 9, radio: 17 }, { id: "baliza:c", d: 12, radio: 17 }])).toEqual({ id: "baliza:b", d: 9, radio: 17 });
    expect(P.cercano([{ id: "baliza:a", d: 17, radio: 17 }])).toBeNull();   // en el borde, fuera (d < radio, como antes)
    const f = { filas: [1, 2, 3, 4, 5].map(i => ({ k: "k" + i, v: "v" + i })) };
    expect(P.lineas(f)).toEqual(["k1: v1 · k2: v2 · k3: v3", "k4: v4 · k5: v5"]);
    expect(P.lineas({ lineas: ["a"] })).toEqual(["a"]);
  });
});
