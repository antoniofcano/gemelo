// La prueba del módulo suelto de los estáticos (AG-1.15), que antes corría pruebas/guardianes/estaticos.test.js sobre apps/web/motor/02j_estaticos.js.
// MU5-n (A3-8a): el código vive en ./estaticos.ts y su prueba, aquí, con el three de verdad (MUNDOS §9.2: se mueve, no se duplica). El guardián conserva
// lo que cruza con el legado: la equivalencia con el código de verdad del paisaje, las barreras y las balizas, el inventario y el micro-banco.
import { assert, describe, it } from "vitest";
// @ts-expect-error three no trae tipos en el repo (MUNDOS §9.1): aquí se usa de verdad, sin GPU, solo para geometrías y objetos
import * as THREE from "three";
import { Estaticos } from "./estaticos.ts";

describe("Estaticos", () => {
  it("congela: congela el subárbol, deja la matriz del mundo al día y es idempotente; excepto deja en automático lo que se mueve", () => {
    const E = Estaticos, raiz = new THREE.Group(), hijo = new THREE.Group(), nieto = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), movil = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    raiz.add(hijo); hijo.add(nieto); hijo.add(movil);
    raiz.position.set(1, 2, 3); hijo.position.set(10, 0, 0); hijo.rotation.y = 0.5; nieto.position.set(0, 5, 0); nieto.scale.set(2, 3, 4);
    const ref = raiz.clone(); ref.updateMatrixWorld(true);
    assert.strictEqual(E.congela(raiz as any, [movil as any]), raiz as any);
    assert.ok(!raiz.matrixAutoUpdate && !hijo.matrixAutoUpdate && !nieto.matrixAutoUpdate && movil.matrixAutoUpdate);
    assert.strictEqual(JSON.stringify(E.congelados(raiz as any)), JSON.stringify({ congelados: 3, automaticos: 1 }));
    const rn = ref.children[0]!.children[0]!;
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(nieto.matrixWorld.elements[k]! - rn.matrixWorld.elements[k]!) < 1e-12);
    // el móvil sigue su movimiento aunque su padre esté congelado
    movil.position.set(7, 0, 0); raiz.updateMatrixWorld(); assert.ok(Math.abs(movil.matrixWorld.elements[12]! - (1 + 10 + 7 * Math.cos(0.5))) < 1e-9);
    // recolocar + congela otra vez: lo congelado sigue lo que se le cambió (y solo entonces)
    nieto.position.set(0, 9, 0); raiz.updateMatrixWorld(); assert.strictEqual(nieto.matrixWorld.elements[13], 7, "sin congela, el cambio no se ve (por eso cada sitio llama a congela al colocar)");
    E.congela(raiz as any, [movil as any]); assert.strictEqual(nieto.matrixWorld.elements[13], 11);
    E.congela(null);   // tolerante
  });
});
