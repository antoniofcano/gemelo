# Contrato `olivos-tipo` (v = 1)

Qué tiene que entregar el **constructor de olivos-tipo** (herramienta aparte, aún sin definir) para que el gemelo pueda dibujar sus modelos, y qué parámetros de cada árbol viajan en el registro. Decisión y lo que queda abierto: [ADR-0014](../doc/adr/0014-catalogo-de-olivos-tipo-e-id-estable.md). Esquema: [`olivos-tipo.schema.json`](olivos-tipo.schema.json) (JSON Schema 2020-12). Ejemplo que lo cumple: `modelos/olivos/fixture/` (sintético, lo genera `modelos/olivos/fixture/genera.js`). Lo vigila `pruebas/guardianes/olivos.test.js`.

La idea en una frase: **los parámetros de cada árbol viajan en el registro; las formas, en un catálogo.** Así el olivo no queda atado al formato de las teselas: hoy son teselas de 256 m en JSON; en la fase F1d serán 3D Tiles 1.1, donde el registro pasa a ser una tabla de propiedades por instancia y el catálogo sigue siendo el mismo.

## 1. El catálogo (`catalogo.json` + glb)

| Campo | Contenido |
|---|---|
| `v` | 1 |
| `id`, `nombre` | nombre del catálogo (`^[a-z0-9][a-z0-9_-]*$`) y texto legible |
| `fuente` | siempre `"ilustrativo"` (regla 5 de CLAUDE.md): un olivo-tipo es una forma típica, no un árbol medido |
| `unidades`, `arriba` | `"m"` y `"+Y"` (convención de glTF) |
| `licencia` | `{spdx, autor, atribucion}`; un tipo puede llevar la suya |
| `generador` | *(opcional)* herramienta y versión |
| `tipos[]` | 1 a 16 (objetivo: 6-8). Cada uno: `id` (entero 0..255, **estable**: no se reutiliza para otra forma), `nombre`, `descripcion?`, `fuente: "ilustrativo"`, `altura_m`, `radio_m` (tamaño nominal del modelo), `niveles` |
| `niveles.L0?`, `.L1`, `.L2` | `{glb, triangulos, piezas[]}`: ruta relativa del glb, triángulos de todas sus piezas y nombres de las piezas en orden (`copa`, `tronco`) |

### Reglas de cada glb (glTF 2.0 binario)
- **Metros, +Y arriba, pivote en la base del tronco** (el punto `(0, 0, 0)` es donde el tronco toca el suelo); el modelo centrado en el pivote en planta. Del tamaño que declaran `altura_m` y `radio_m`.
- **Una pieza = un nodo con una malla de una sola primitiva de triángulos con índices y un material.** Nodos sin transformación (la escala y el pivote van en la geometría) y sin hijos. El nombre del nodo dice la pieza: `copa` o `tronco`.
- **Sin luces, sin cámaras, sin animaciones, esqueletos ni morph; sin texturas ni extensiones en v1** (la compresión Draco/meshopt exigiría un decodificador; las texturas con alpha-test están por decidir, ADR-0014).
- `NORMAL` y `COLOR_0` opcionales (si faltan, el motor calcula las normales y pone el color blanco; el color final lo da la ortofoto en cada olivo).
- Pasa el validador oficial de Khronos (`gltf-validator`) **sin errores ni avisos**.

### Presupuesto por modelo (todas sus piezas)
| Nivel | Objetivo | Tope (objetivo × 1,2) | Piezas máx. | Hoy por procedimiento (tipo −1) |
|---|---|---|---|---|
| L0 | ≈ 800 tri | 960 | 3 | no sale del catálogo: copa **medida** de cada árbol (`06_arboles.js`) |
| L1 | ≈ 170 tri | 204 | 2 | 150 / 160 (4 variantes, copa + tronco) |
| L2 | ≈ 30 tri | 36 | 1 | 35 (2 variantes, solo copa) |

La fuente de verdad es `presupuesto_tri` del esquema; el motor (`Catalogo.PRES_TRI` en `07a_catalogo.js`) dice lo mismo y lo comprueba el guardián. Un tipo que se pasa no se registra (queda en `Catalogo.avisos()`) y sus olivos se dibujan como tipo −1. **Cada tipo cargado cuesta sus piezas en llamadas de dibujo** cuando tiene olivos a la vista: hasta 2 en L1 y 1 en L2 (ADR-0014).

## 2. Parámetros por árbol (en el registro, no en el modelo)

Van en el índice de la finca ([CONTRATOS §1.1](../doc/sistema/CONTRATOS.md#11-indicejson-va-en-la-página-como-d)) como **columnas paralelas opcionales** de `copas[]`, que no cambia:

| Campo | Contenido |
|---|---|
| `copas[i]` | `[x, y, h, r8[8], parcela+1]` — **medido** (LiDAR): posición, altura y los 8 radios de la copa |
| `copas_id[i]` | *(opcional)* entero ≥ 0, **id estable** del árbol, único en la finca (identidad global = `finca_id` + id); sobrevive a una reexportación aunque cambie su índice en `copas` |
| `copas_tipo[i]` | *(opcional)* `id` del olivo-tipo del catálogo; **−1 = sin asignar**. Un tipo que el catálogo cargado no conoce se dibuja como −1 |

Lo demás no viaja: el motor estira el modelo a cada árbol con lo medido. Escala vertical = `h / altura del modelo`; en planta, los semiejes del modelo pasan a los ejes de la copa medida (el par de radios opuestos más largo y su perpendicular, como hoy en L1) y el modelo se gira según ese eje largo; color por árbol desde la ortofoto. Así un olivo-tipo nunca contradice la copa medida en tamaño ni en orientación.

## 3. Cómo lo carga el motor (preparado, sin activar en F1b)

`Catalogo.instala(desc, cargador, base)` (`07a_catalogo.js`): `desc` es el `catalogo.json`; `cargador(url, THREE)` es una función **inyectada** por quien llama que devuelve `Promise<[{nombre, geometria}]>` (una entrada por pieza); el motor no añade dependencias. En la prueba se inyecta el `GLTFLoader` de three r128; en F1d lo dará la tubería de 3D Tiles. El motor pone **sus propios materiales** (copa o tronco, por el nombre de la pieza), con la misma luz, sombra de nubes y helada que el resto. Nada del motor llama hoy a `instala`: con el catálogo vacío todo olivo es tipo −1 y se ve como siempre.
