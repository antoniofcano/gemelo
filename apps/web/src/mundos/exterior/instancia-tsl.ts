// La matriz de cada instancia en TSL (A4-0, para las variantes apagadas de MU6: MATERIALES §8 y §9). Los parches clásicos leen instanceMatrix (la semilla de la
// copa del catálogo, el marco de cada olivo en los impostores); en TSL, three monta su propio nodo de la matriz de instancia y no deja leerlo. Aquí se lee de una
// COPIA del mismo array como atributos por instancia (una columna = un vec4), que sigue a la de verdad por su versión (como hace three con la suya, en
// instance()). COSTE [SIN MEDIR]: 64 B por instancia en la tarjeta, que se vuelve a subir cuando cambia instanceMatrix.version; hay que medirlo en el banco (MU6).
// No importa three: las clases (InstancedInterleavedBuffer) y los nodos entran por argumento, como en la fábrica.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nodo = any;

// la copia de cada instanceMatrix: una por array, para todos los materiales y columnas que la lean
const copias = new WeakMap<object, Nodo>();

/** La columna j (0-3) de instanceMatrix del objeto que se dibuja, como vec4 (la 3 es la traslación). Sin instancias, la de la identidad. */
export function columnaInstancia(W: Record<string, unknown>, T: Record<string, Nodo>, j: number): Nodo {
  return T.Fn(function (_e: Nodo, b: Nodo) {
    const o = b && b.object, im = o && o.isInstancedMesh ? o.instanceMatrix : null;
    if (!im) return T.vec4(j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0, j === 3 ? 1 : 0);
    let ib = copias.get(im.array);
    if (!ib) { ib = new (W["InstancedInterleavedBuffer"] as new (a: unknown, s: number, m: number) => Nodo)(im.array, 16, 1); copias.set(im.array, ib); }
    const copia = ib;
    T.OnObjectUpdate(function (fr: { object?: { instanceMatrix?: { version: number } } }) { const m = fr && fr.object && fr.object.instanceMatrix; if (m && copia.version !== m.version) copia.version = m.version; });
    return T.instancedBufferAttribute(copia, "vec4", 16, 4 * j);
  })();
}
