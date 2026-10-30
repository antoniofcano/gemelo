# Contrato `olivo-generado` (generador `olivo-2`)

Cómo se genera un olivo **por procedimiento y con semilla** a partir de lo medido de cada árbol, y qué viaja entre el generador, el trabajador y quien lo dibuja. Decisión y lo que queda abierto: [ADR-0017](../doc/adr/0017-constructor-de-olivos-generados.md); recetas horneadas en el servidor (variantes) y cálculo en el aparato (propios): [ADR-0018](../doc/adr/0018-hornero-de-olivos.md); formato binario de la receta horneada y manifiestos: [`olivo-horneado.md`](olivo-horneado.md). Esquema: [`olivo-generado.schema.json`](olivo-generado.schema.json). Código: `apps/web/olivo/` (módulo ES sin DOM). Lo vigila `pruebas/guardianes/olivo.test.js`.

Es la otra vía frente al catálogo de modelos fijos ([`olivos-tipo.md`](olivos-tipo.md), ADR-0012): en vez de 6-8 glb, **un árbol distinto por olivo**, siempre el mismo para la misma entrada. La forma es **ilustrativa** (regla 5 de CLAUDE.md); la altura, el diámetro de copa y hacia dónde carga salen de lo **medido**.

## 1. Entrada

`{tipo, parametros?, epoca, semilla}`

| Campo | Contenido |
|---|---|
| `tipo` | uno de los 7 de `TIPOS` (`planton`, `adulto1`, `adulto2`, `adulto3`, `centenario`, `centenario2`, `centenario3`); id estable en `ID_TIPO` (0-6). Da los parámetros por defecto |
| `parametros` | *(opcional)* los que se sobrescriben (`altura`, `copa`, `asim`, `rumbo`, `densidad`, `falda`, `relieve`, `pies`…; rangos en `RANGOS`). Desde el registro: `parametrosDeCopa(copa, copas_param[i], tipo)` (§3) |
| `epoca` | `reposo`, `boton`, `flor`, `cuajado`, `verde`, `envero`, `madura`. Desde un BBCH: `bbchAEpoca(bbch)` (0-50 reposo, 51-59 botón, 60-69 flor, 70-74 cuajado, 75-80 verde, 81-88 envero, 89-99 madura) |
| `semilla` | entero 0 … 2^32 − 1: la **guardada** del árbol (§1.2). Desde el registro: `semillaDeCopa(copa, copas_id[i], centro_utm, copas_semilla[i])` → `{semilla, provisional, guardada}`; sin semilla guardada, se deriva del `copas_id` (del censo de OlivarTrack, 0 … 2^31 − 1, o provisional del exportador, 2^31 … 2^32 − 1: `tuberia/ids_copas.py`) o, sin id, del mismo id provisional por posición |

### 1.1 Nombres de los tipos
Cada tipo tiene un **nombre de catálogo** estable, sin versión dentro (`NOMBRE_TIPO`, `apps/web/olivo/catalogo.js`); la versión del generador es `GEN_VERSION`, aparte:

| Clave | Nombre | | Clave | Nombre |
|---|---|---|---|---|
| `planton` | `olivos:planton` | | `centenario` | `olivos:centenario-1p` |
| `adulto1` | `olivos:adulto-1p` | | `centenario2` | `olivos:centenario-2p` |
| `adulto2` | `olivos:adulto-2p` | | `centenario3` | `olivos:centenario-3p` |
| `adulto3` | `olivos:adulto-3p` | | | |

Los **números** de tipo son locales a cada fichero: `ID_TIPO` (0-6) en el módulo; en un tileset, `_TIPO` es un número local con su tabla número → nombre en `extras.gemelo` (`tablaLocal()` la da). El tipo 0 del catálogo sintético de pruebas (`modelos/olivos/fixture/`, ADR-0012) no es ninguno de estos y se queda solo en el fixture.

### 1.2 La semilla se guarda
La semilla se asigna **una vez** y viaja en el registro del árbol, en la columna paralela opcional `copas_semilla` del índice (uint32). La escriben los exportadores (`finca_8_teselas.py`, `hituelo_conv.py`) con `tuberia/semillas_copas.py`; el índice anterior es el de `--anterior`, el de `GEMELO_INDICE_ANTERIOR` o el `indice.json` que ya hubiera en la carpeta de salida ([DATOS](../doc/operacion/DATOS.md#semilla-de-cada-olivo-copas_semilla-adr-0017)). Regla: (1) si la exportación anterior tenía una copa con el mismo id **del censo** (< 2^31), su semilla (los provisionales no cuentan aquí: salen de la posición y, con dos copas en la misma celda de 1 m, el de una puede pasar a la otra); (2) si no, la de la copa anterior más cercana a ≤ 1,5 m que nadie reclame (emparejamiento uno a uno por distancia: así, **cuando llega el censo, cada id provisional pasa su semilla al olivo del censo** que ocupa su sitio); (3) si no, una nueva, igual a su `copas_id`. El generador usa la guardada si existe; si no, la deriva. **Solo un cambio de `GEN_VERSION` cambia la forma de un olivo**: ni un id nuevo, ni una reexportación, ni otro orden en `copas`.

## 2. La receta (lo que da el generador)

Un objeto de arrays tipados, sin THREE, que pasa por `postMessage` como transferibles y que `montaOlivo(THREE, receta, materiales)` convierte en un `THREE.Group` (metros, +Y arriba, pivote en la base del tronco, norte = −Z):

- `v` (`"olivo-2"`), `entrada`, `escala` `[fxz, fy, fxz]` (el ajuste final a la altura y la copa pedidas), `corte` (color del corte de poda), `cuenta` (nodos, brotes, ramitas, relleno, frutos, cortes), `medidas` `{altura_m, copa_m, pies}`, `padre` (`Int32Array`: el árbol de ramas, −1 en las raíces).
- `piezas[]`, en orden de dibujo. Cada una: `clase` (`malla`, `instancias`; `puntos` solo en E2), `mat` (nombre de material, ver `MATERIALES`), `geo` (`propia` o una compartida: `ramita`, `relleno`, `oliva`, `tocon`, `corte`, `octa`), `sombra` `[proyecta, recibe]`, `prof` (material de sombra con recorte), `pos`/`rot`/`esc`; con geometría propia `atrib` (`position`, `normal`, `uv`, y en los pies `aHueco`, `aMuerta` para el sombreador de marcas) e `indice` (`Uint32Array`); con instancias `n`, `matrices` (16 × n), `colores` (3 × n), `nodo` (`Int32Array`: la rama que sostiene cada instancia, para cortar una rama con todo lo que lleva).
- Metadatos de niveles (fuera de la huella olivo-2): `rol` (`ramas`, `ramitas`, `relleno`, `olivas`), `rejilla` `[segs, rad]` de cada tubo y, en la madera fina (una sola pieza), `brote` (`Uint8Array`, 1 por prisma de brote de superficie).

**Huella olivo-2** (`huella(receta)`, SHA-256): los bytes canónicos de la receta — el JSON de la cabecera y de cada pieza (clase, mat, geo, sombra, prof, pos, rot, esc, n) y cada array tipado precedido de `nombre:Tipo:longitud\n`, en este orden: `padre`; por pieza `position`, `normal`, `uv`, `aHueco`, `aMuerta`, `indice`, `matrices`, `colores`, `nodo`. **Huella de niveles** (`huellaNiveles`): `[[rol, rejilla]…]` y cada `brote`. **Huella estructural** (`huellaEstructura`): todo lo entero (cuentas, índices, nodo, padre) y los flotantes de cabecera redondeados a 10⁻⁶, sin los arrays de flotantes.

**Determinismo — medido:** misma entrada → mismos bytes **en el mismo motor de JavaScript**. Entre motores cambia el último bit de algún flotante (Chrome 131 frente a Node 24: 12 de 23 760 valores de las matrices de las olivas, diferencia máxima 1,5·10⁻¹⁹), porque `Math.sin`/`Math.cos` no son exactos por norma; la huella estructural y todos los recuentos coinciden. Por eso el guardián compara con Node la huella exacta y con el navegador la estructural y la diferencia de flotantes. **No probado:** Safari (JavaScriptCore) ni Firefox (SpiderMonkey).

### Niveles de detalle
`aNivel(receta, k)` (de la maqueta «Olivos en el gemelo», sobre arrays): `E0` completo; `E1` sin los prismas de brote y olivas como octaedros; `E2` además los tubos a un cuarto de resolución (uno de cada dos anillos y de cada dos lados) y olivas como puntos; `E2VR` además el aclareo: la mitad de las ramitas, las de mayor puntuación (`radio horizontal / radio de copa + 0,75 · max(0, y/H − 0,35)` más un desempate fijo por índice), ×1,38, y el relleno ×1,25. Centenario 3 pies, envero, semilla 7: **102 978 / 48 378 / 19 366 / 14 618** triángulos, 36 llamadas de dibujo en todos.

## 3. `copas_param` (columna paralela opcional del índice)

Junto a `copas[]`, `copas_id[]` y `copas_tipo[]` ([CONTRATOS §1.1](../doc/sistema/CONTRATOS.md#11-indicejson-va-en-la-página-como-d)): una fila por copa o `null`. Todo **medido** del LiDAR por `tuberia/parametros_copas.py`:

| Posición | Campo | Qué es |
|---|---|---|
| 0 | `altura_m` | percentil 95 de la altura de los puntos de copa |
| 1 | `copa_m` | diámetro del contorno: 2 × media de los 8 radios (p95 por octante desde el centro de copa) |
| 2 | `desplaz_m` | del tronco al centro de copa, en planta |
| 3 | `rumbo_gr` | hacia dónde carga: 0 = norte (+y del índice, −Z del motor), 90 = este |
| 4 | `densidad` | fracción de celdas de 0,5 m del contorno con puntos de copa |
| 5 | `base_m` | percentil 5 de la altura de los puntos de copa (la falda) |
| 6 | `rugosidad` | desviación típica de la superficie de arriba / altura |
| 7 | `tronco` | 0 = LiDAR (retornos de 0,3-1,2 m bajo la copa), 1 = marca de OlivarTrack corregida de su desfase, 2 = ni lo uno ni lo otro: centro de copa y **asimetría 0** (decisión de Antonio nº 31). Manda el LiDAR |

`parametrosDeCopa` lo convierte (fórmulas del bloque 4 de la maqueta): `altura`, `copa`, `densidad` y `rumbo` (redondeado a 5°) tal cual — **medidos** —; `asim = min(0,6, desplaz / (copa/2) · 1,8)`, `falda = 1 − base/altura`, `relieve = min(1, 1,8 · rugosidad)` — **deducidos** —; devuelve además `origen` por campo. Sin fila, solo `altura = h` y `copa = 2 × media(r8) × factorR8` — r8 es el **radio** medido; `factorR8` es el factor de configuración del motor: 0,5 por defecto en el constructor (como el nivel de siempre, `FACTOR_R8`, decisión 48); el motor pide sus olivos generados con `FACTOR_R8_GEN` = 1, la copa a su radio medido, y estira a esa misma copa y altura las variantes y los impostores (decisión 81, ADR-0022 §1); `?factorR8=` fija los dos.

**Calibración (sintética):** olivos generados con parámetros conocidos, convertidos en una nube de puntos de LiDAR simulado y medidos con el mismo cálculo (`pruebas/olivo/calibracion.mjs`): el p95 y el radio medio quedan por debajo del máximo y de la caja que usa el generador (factor medido k ≈ 1,16 en altura y ≈ 1,20 en copa). No se aplica por defecto (decisión pendiente, ADR-0017).

## 4. Versiones

`GEN_VERSION` (`apps/web/olivo/version.js`) nombra el generador. Las huellas de referencia viven en `pruebas/olivo/huellas-<GEN_VERSION>.json` (las de `olivo-2` las da el oráculo, `pruebas/olivo/oraculo.mjs`, con la referencia que no se versiona). Si cambia **un byte** de alguna receta o el código del núcleo (`nucleo.js`, `tipos.js`, `azar.js`), se sube `GEN_VERSION` y se escriben sus huellas; si el árbol no cambia (un comentario), se vuelve a sellar con `node pruebas/olivo/compara.mjs --todos --sella`.

## 5. Caché de recetas (O5)
`creaCache({memMB, discoMB})` (`apps/web/olivo/cache.js`) guarda recetas ya calculadas para no rehacerlas al girar, volver o recargar. La usa el motor con `?olivos=gen` (`07ab_generados.js`; `?olivosCache=0` la apaga).

- **Clave** (`claveReceta(entrada, nivel)`): `olivo|<GEN_VERSION>|c<CACHE_VERSION>|<nivel>|<tipo>|<epoca>|<semilla uint32>|<parametros>`, con los parámetros en JSON con las claves ordenadas y los números a 6 decimales. Los parámetros llevan ya la altura y la copa (y con ella `factorR8`); las variantes compartidas no llevan parámetros. Ejemplo: `olivo|olivo-2|c1|E0|centenario3|envero|7|{"altura":4.5,"copa":3.2,"rumbo":45}`. **`CACHE_VERSION`** (en `cache.js`) se sube si cambia lo que da una receta sin cambiar `GEN_VERSION` (p. ej. `niveles.js`, fuera de la huella olivo-2) o el formato guardado.
- **Memoria:** LRU con tope en MB (bytes de los arrays tipados): 60 MB en móvil, gafas (`VRP.on`) o con `navigator.deviceMemory` ≤ 4; 150 MB si no. Las recetas que el motor deja de usar siguen ahí hasta que el tope las saca.
- **Disco:** IndexedDB con `idb-keyval` 6.3.0 (base `gemelo-olivos`, almacén `recetas`), LRU con tope de 300 MB llevado en un índice (`__indice`: clave → [bytes, último uso]). Antes de calcular se busca en memoria y luego en disco; lo calculado se escribe después, diferido (`requestIdleCallback`) y de uno en uno. Si IndexedDB no está o falla (modo privado, marco del artefacto, cuota), se queda solo en memoria y lo dice `?debug` («caché: memoria N · disco no · aviso»); nunca bloquea ni impide generar.
- Lo comprueba `pruebas/olivo/cache.mjs` (Node, con `fake-indexeddb` para el disco) desde `pruebas/guardianes/olivo.test.js`. **No probado:** en un navegador real (cuota, tiempos de la copia estructurada de una receta de varios MB, el marco de claude.ai), en iPhone ni en Quest.
