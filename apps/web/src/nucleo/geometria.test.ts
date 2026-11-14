// La fusión de geometrías (AG-1.13b), que antes vivía en apps/web/motor/02k_fusiona.js y solo se probaba de rebote (la fauna y los perros). MU5-n (A3-8a):
// el código vive en ./geometria.ts; aquí, con el three de verdad, lo que promete: posiciones, normales e índices seguidos, el color de cada pieza en sus
// vértices, el uv si se pide, y las geometrías de entrada liberadas.
import { assert, describe, it } from "vitest";
// @ts-expect-error three no trae tipos en el repo (MUNDOS §9.1): aquí se usa de verdad, sin GPU, solo para geometrías y objetos
import * as THREE from "three";
import { creaFusionaGeometrias } from "./geometria.ts";

describe("creaFusionaGeometrias", () => {
  it("dos cajas en una: atributos seguidos, índices desplazados, color por pieza, uv opcional y las de entrada liberadas", () => {
    const fusiona = creaFusionaGeometrias(THREE);
    const a = new THREE.BoxGeometry(1, 1, 1), b = new THREE.BoxGeometry(2, 2, 2).translate(5, 0, 0), liberadas: string[] = [];
    a.addEventListener("dispose", () => liberadas.push("a")); b.addEventListener("dispose", () => liberadas.push("b"));
    const na = a.attributes.position!.count, ia = a.index!.count, ib = b.index!.count, ultimoB = b.index!.array[ib - 1]!;
    const g = fusiona([[a, new THREE.Color(1, 0, 0)], [b, new THREE.Color(0, 0.5, 1)]]);
    assert.strictEqual(g.attributes.position.count, na * 2);
    assert.strictEqual(g.index.count, ia + ib);
    assert.ok(g.index.array instanceof Uint16Array, "índices de 16 bits");
    assert.strictEqual(g.index.array[ia + ib - 1], ultimoB + na, "los índices de la segunda pieza van desplazados");
    assert.deepEqual(Array.from(g.attributes.color.array.slice(0, 3)), [1, 0, 0]);
    assert.deepEqual(Array.from(g.attributes.color.array.slice(na * 3, na * 3 + 3)), [0, 0.5, 1]);
    assert.strictEqual(g.attributes.position.array[na * 3], b.attributes.position!.array[0], "la segunda pieza, tras la primera");
    assert.strictEqual(g.attributes.uv, undefined, "sin conUv, sin uv");
    assert.deepEqual(liberadas, ["a", "b"]);
    const c = fusiona([[new THREE.BoxGeometry(), new THREE.Color(1, 1, 1)]], true);
    assert.strictEqual(c.attributes.uv.count, c.attributes.position.count, "con conUv, el uv de cada vértice");
  });
  it("L8-14: con más de 65.535 vértices los índices pasan a 32 bits y no se envuelven; hasta ese límite, 16 bits", () => {
    const fusiona = creaFusionaGeometrias(THREE), esfera = () => new THREE.SphereGeometry(1, 150, 150);   // 151 × 151 = 22.801 vértices
    const justo = fusiona([[esfera(), new THREE.Color(1, 1, 1)], [esfera(), new THREE.Color(1, 1, 1)]]);   // 45.602: cabe en 16 bits
    assert.ok(justo.index.array instanceof Uint16Array);
    const g = fusiona([[esfera(), new THREE.Color(1, 1, 1)], [esfera(), new THREE.Color(1, 1, 1)], [esfera(), new THREE.Color(1, 1, 1)]]);   // 68.403: no cabe
    assert.ok(g.attributes.position.count > 65535);
    assert.ok(g.index.array instanceof Uint32Array, "índices de 32 bits");
    const max = g.index.array.reduce((m: number, v: number) => Math.max(m, v), 0);
    assert.strictEqual(max, g.attributes.position.count - 1, "el último índice apunta al último vértice (sin envolver)");
  });
});
