// AG-1.15: objetos estáticos sin recomponer la matriz. MU5-n (A3-8a): antes vivía en apps/web/motor/02j_estaticos.js; el módulo del motor queda de talón
// (`var Estaticos = Nucleo.Estaticos;`). No importa three: trabaja sobre cualquier objeto con la forma de un Object3D (matrixAutoUpdate, updateMatrix, children…).
// three llama a updateMatrix() de cada objeto en cada render() mientras matrixAutoUpdate sea true (el valor por defecto): recompone posición × giro × escala
// aunque el objeto siga donde estaba. Lo que se coloca una vez (paisaje, barreras, marcas, balizas, mallas por teselas, matas y piedras...) lo congela
// este módulo: matrixAutoUpdate = false, la matriz local recompuesta UNA vez y la del mundo al día. Si el objeto se recoloca (otra exageración, otra tesela,
// otra finca) quien lo coloca vuelve a llamar a Estaticos.congela(obj) justo después: es idempotente. Quien tenga un objeto congelado y le cambie position/
// rotation/scale SIN llamar a congela no verá el cambio (por eso solo se congela lo que tiene un único sitio donde se coloca).
//   Estaticos.congela(obj, excepto?)   obj y todos sus descendientes: matrixAutoUpdate = false, updateMatrix(); después obj.updateMatrixWorld(true).
//                                      excepto: objetos sueltos (y su subárbol) que se quedan en automático porque se mueven cada fotograma
//   Estaticos.congelados(raiz)         cuántos del subárbol quedan quietos y cuántos en automático (para las pruebas)
// Presupuesto (regla 6): no reserva nada; ahorra el compose de una matriz por objeto y fotograma (pruebas/guardianes/estaticos.test.js mide cuánto, en relativo).

/** Lo que se usa de un Object3D de three. */
export interface Objeto3DMin {
  matrixAutoUpdate: boolean;
  children: Objeto3DMin[];
  updateMatrix(): void;
  updateMatrixWorld(forzar?: boolean): void;
  traverse(fn: (o: Objeto3DMin) => void): void;
}

export var Estaticos = (function () {
  function congela<T extends Objeto3DMin | null | undefined>(obj: T, excepto?: Objeto3DMin[] | null): T {
    if (!obj) return obj;
    var ex = excepto && excepto.length ? excepto : null;
    (function rec(o: Objeto3DMin) {
      if (ex && ex.indexOf(o) >= 0) return;
      o.matrixAutoUpdate = false; o.updateMatrix();
      for (var i = 0; i < o.children.length; i++) rec(o.children[i]!);
    })(obj);
    obj.updateMatrixWorld(true);
    return obj;
  }
  function congelados(raiz: Objeto3DMin) {
    var c = 0, a = 0;
    raiz.traverse(function (o) { if (o.matrixAutoUpdate) a++; else c++; });
    return { congelados: c, automaticos: a };
  }
  return { congela: congela, congelados: congelados };
})();
