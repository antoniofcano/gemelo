# Contrato `olivo-horneado` — receta horneada, formato versión 1

Cómo viaja entre el **hornero** (servidor) y el motor una receta de olivo generado ([`olivo-generado.md`](olivo-generado.md) §2) ya calculada: un objeto binario cuantizado, direccionado por su huella, y los manifiestos que dicen cuál es cuál. Decisión, alternativas y ciclo de vida: [ADR-0018](../doc/adr/0018-hornero-de-olivos.md) (decisiones 63-65). Esquemas: [`hornero-manifiesto.schema.json`](hornero-manifiesto.schema.json), [`epocas-calendario.schema.json`](epocas-calendario.schema.json). Código de referencia: `apps/web/olivo/horneado.js` (codifica y decodifica; sin DOM, para el hornero y el motor), `horneado_node.js` (brotli, solo Node) y `epocas.js`. Lo vigila `pruebas/guardianes/horneado.test.js`.

**Qué es y qué no.** Es la misma receta, con los flotantes cuantizados (pérdida acotada, §6) y los enteros y metadatos idénticos. **No** es un glb ni un `.bin` de 3D Tiles. La forma del árbol sigue siendo **ilustrativa** (regla 5 de CLAUDE.md); lo horneado no la mejora ni la empeora más allá de la cuantización.

**Versiones que lo gobiernan**, todas en la cabecera de cada objeto y en el manifiesto: **formato** (`FORMATO = 1`, este documento), `GEN_VERSION` (el generador, `apps/web/olivo/version.js`) y `CACHE_VERSION` (`cache.js`). Si el cliente no entiende el formato, o `GEN_VERSION`/`CACHE_VERSION` del manifiesto no son las suyas, **ignora lo horneado y calcula** (plan B del ADR). Cambiar el formato = subir `FORMATO`, este documento, el código, `manifiesto-ejemplo.json` y la prueba en el mismo commit (regla 3).

## 1. El objeto: bytes de una receta

Un objeto = una receta en un nivel (`E0`, `E1`, `E2`, `E2VR`) y una época. **Orden de bytes: little-endian** (el código se niega a cargar en un aparato big-endian). Todo array de datos va alineado a 4 bytes.

| Byte | Tamaño | Tipo | Campo |
|---|---|---|---|
| 0 | 4 | ASCII | magia `OLVH` |
| 4 | 2 | u16 | versión de formato (`1`). Otra → se rechaza |
| 6 | 2 | u16 | reservado, `0` |
| 8 | 4 | u32 | `nj`: longitud de la cabecera JSON (múltiplo de 4) |
| 12 | 4 | u32 | `nd`: longitud de la sección de datos |
| 16 | `nj` | UTF-8 | cabecera JSON (§1.1), rellenada al final con espacios hasta múltiplo de 4 |
| 16 + `nj` | `nd` | bytes | datos: los arrays cuantizados, cada uno en su `offset` (relativo al inicio de los datos) |

El total es exactamente `16 + nj + nd`; si no, se rechaza. Lo que está **por debajo** de la huella son estos bytes enteros (prefijo, JSON y datos).

### 1.1 Cabecera JSON

```
{ formato, gen_version, cache_version, nivel, epoca, clave,
  receta: { …todos los campos de la receta salvo `piezas` y `padre`: v, entrada, escala, corte, cuenta, medidas… },
  padre: <array> | null,
  piezas: [ { campos: { …campos no-array de la pieza… }, arrays: [ <array>, … ] }, … ] }
```

- `clave` = `claveReceta(entrada, nivel)` ([`olivo-generado.md`](olivo-generado.md) §5): **la misma que usa la caché de O5**. `nivel` y `epoca` están además sueltos para leerlos sin parsear la clave. Quien decodifica comprueba que la `clave` es la que pidió; si no, descarta.
- `receta` y `campos` son JSON tal cual (números con la precisión de un `double`; `colores: null`, `nodo: null`, `prof: null` se conservan como `null`). Es el orden de claves del generador: la cabecera es determinista.
- Cada `<array>` es `{nombre, tipo, longitud, offset, cuant, …parámetros}`: `tipo` es el del dato **guardado**, `longitud` en elementos (no en bytes), `offset` en bytes dentro de los datos (múltiplo de 4). Los parámetros dependen de `cuant`.

### 1.2 Arrays y cuantización

La cuantización es la de la medida O6 ([MEDIDAS](../doc/sistema/MEDIDAS.md#horneado-de-recetas-de-olivos-generados-por-tesela-o6-2026-10-29-foto-no-se-mantiene)). Las fórmulas son parte del contrato: el decodificador las repite tal cual y calcula en `double`, guardando en `Float32Array`.

| `nombre` | Guardado | `cuant` y parámetros | Descuantizado (lo que devuelve) |
|---|---|---|---|
| `padre` (de la receta) | `Uint16` si `max + 1 ≤ 65535`, si no `Int32` | `entero`, `sesgo` (1 con `Uint16`: el −1 de las raíces pasa a 0; 0 con `Int32`) | `Int32Array`, `q − sesgo`. **Exacto** |
| `atrib.position`, `posiciones` (puntos de E2) | `Int16` ×3 | `caja16`, `caja: [[mn x,y,z], [mx x,y,z]]` de la pieza. `q = round((x − mn)/s · 65535) − 32768`, `s = (mx − mn) \|\| 1` por eje | `(q + 32768)/65535 · s + mn` |
| `atrib.normal` | `Int8` ×3 | `normal8`: `q = round(n · 127)` | `q / 127` (**sin renormalizar**: la longitud puede ser ≠ 1 en un 0,5 %; el sombreador normaliza) |
| `atrib.uv` | `Uint16` | `rango16`, `rango: [mn, mx]`. `q = round((x − mn)/s · 65535)` | `q/65535 · s + mn` |
| `atrib.aHueco`, `atrib.aMuerta`, `colores` | `Uint8` | `rango8`, `rango: [mn, mx]` del propio array. `q = round((x − mn)/s · 255)` | `q/255 · s + mn` |
| `indice` | `Uint16` si la pieza tiene ≤ 65 535 vértices, si no `Uint32` | `indice` | **`Uint32Array`**, idéntico |
| `matrices.traslacion` | `Int16` ×3 por instancia | `caja16` sobre la traslación (elementos 12-14 de la matriz) de todas las instancias de la pieza | como `position` |
| `matrices.lineal` | `Int16` ×9 por instancia | `lineal16`, `escala`: `sl = max\|elemento lineal\| \|\| 1` de la pieza. `q = round(x / sl · 32767)` | `q/32767 · sl` |
| `nodo` | `Uint16` si cabe (`≥ 0` y `≤ 65535`), si no `Int32` | `entero`, `sesgo` 0 | `Int32Array`, **exacto** |
| `brote` | `Uint8` | `crudo` | `Uint8Array`, **exacto** |

- **Matrices: 12 valores por instancia** (3 de traslación + la parte lineal 3×3 por columnas, elementos `0,1,2,4,5,6,8,9,10`) y **sin la última fila**, que debe ser `(0, 0, 0, 1)` (elementos `3, 7, 11 = 0` y `15 = 1`): si no lo es, el codificador **falla** (no la cuantiza). El decodificador la reconstruye. Salen siempre como `Float32Array` de 16 por instancia.
- **Lo que el formato no sabe cuantizar, falla.** Un array tipado de la receta o de una pieza que no esté en la tabla, o un atributo que no sea de `position, normal, uv, aHueco, aMuerta`, hace fallar al codificador: se amplía el formato (y su versión), no se guarda a escondidas.
- **Piezas:** `campos` lleva `clase` (`malla`, `instancias`, `puntos`), `mat`, `geo`, `sombra`, `prof`, `pos`, `rot`, `esc`, `rol`, `rejilla`, `n`… tal cual. Los `Int32Array`/`Uint32Array` de la receta calculada se reconstruyen con esos mismos tipos, para que la receta horneada y la calculada se puedan intercambiar en la caché sin que el montaje note nada.
- **Épocas que solo cambian las olivas: sin pieza aparte** (ADR-0018 §2). Cada objeto lleva la receta entera de su época.

## 2. Huella, nombre en disco y compresión

- **Huella** = SHA-256 de los **bytes del §1 sin comprimir**, truncado a los **128 bits** primeros, en **hexadecimal minúscula (32 caracteres)**. `huellaBytes(bytes)` (Web Crypto). La dirección no cambia al recomprimir con 9 u 11, y el cliente la comprueba sobre lo que le da `fetch` (el navegador ya descomprimió).
- **Objeto en disco:** `<huella>.br`, los bytes del §1 comprimidos con **brotli** (calidad **9** de diario; **11** solo en horneados de release, y si compensa: ahorra un 7-9 % en E2/E2-VR a cambio de ~30 veces más CPU — cifras de O6, ADR-0018). Se sirve con `Content-Encoding: br` y `Cache-Control: immutable` (O7d). Misma huella ⇒ mismos bytes: los objetos no se reescriben.
- **El nombre no contiene la finca, el tipo ni la semilla:** eso lo dice el manifiesto. Dos fincas que hornean la misma receta comparten objeto si comparten carpeta.
- **Verificación en el cliente:** descargar → comprobar `huellaBytes(bytes) === huella` del manifiesto → `leeCabecera` (formato, versiones, `clave`) → `decodifica`. Cualquier fallo → se calcula (plan B).

## 3. Manifiesto por finca

`/teselas/<finca>/olivos/manifiesto.json`, JSON que cumple [`hornero-manifiesto.schema.json`](hornero-manifiesto.schema.json) (JSON Schema 2020-12, ajv estricto). **Se escribe el último**, cuando todos sus objetos existen. Ejemplo versionado y comprobado: `pruebas/olivo/horneado/manifiesto-ejemplo.json` (recetas **sintéticas**, no olivos).

| Campo | Contenido |
|---|---|
| `v` | `1`: versión del contrato del manifiesto |
| `finca` | el `finca_id` del índice |
| `formato` | `1`: versión de formato de los objetos |
| `gen_version`, `cache_version` | con las que se horneó. Si no son las del motor, el motor ignora el manifiesto entero |
| `horneado_en` | ISO 8601 en UTC |
| `brotli` | calidad de los `.br` (9 o 11) |
| `actual` | la época que valía al hornear (decisión 64) |
| `epocas[]` | las épocas horneadas (la actual y la siguiente): `{epoca, desde, hasta}` con la ventana `MM-DD` del [calendario](#4-calendario-de-épocas) |
| `variantes[]` | una fila por receta: `{tipo, semilla, nivel, epoca, huella, bytes, bytes_br}`. `tipo` = clave de `TIPOS` (`centenario3`), `semilla` = uint32, `nivel` = `E2`/`E2VR` hoy, `bytes` = tamaño **sin comprimir** (el que se hashea), `bytes_br` = tamaño del `.br` en disco |
| `propios` | `{activos}`: **apagado por defecto**. Con `activos: true` además `combinaciones[]` y `manifiesto_tesela` (§5) |

- **Cómo busca el motor:** para la variante `(tipo, semilla, nivel, epoca)` que necesita, busca su fila; las variantes no llevan parámetros, así que la clave de caché es `claveReceta({tipo, epoca, semilla}, nivel)`. **Las semillas y los tipos de las variantes salen del manifiesto**, no de `SEM_VAR` (ADR-0018 §1).
- **Qué época usar:** la de `epocaDeFecha(tabla, hoy)` si está en `epocas[]`; si no, `actual`. Si ninguna está, calcula.
- **Lo que el esquema no dice** (lo comprueban el hornero y el guardián): cada `huella` tiene su objeto, `actual` está en `epocas[]`, no hay dos filas con la misma `(tipo, semilla, nivel, epoca)`, `bytes` coincide con el objeto, las ventanas son las del calendario.

## 4. Calendario de épocas

[`epocas-calendario.json`](epocas-calendario.json) (+ [esquema](epocas-calendario.schema.json)): la tabla de **fechas por época** de la decisión 64 — calendario fijo en el repo, que ajusta Antonio. `comun` vale para toda finca que no tenga entrada en `fincas{}`; la de una finca **reemplaza** a la común entera. Cada época es una ventana `MM-DD`-`MM-DD` (ambas incluidas, sin año; `desde` posterior a `hasta` = cruza el fin de año). Las siete ventanas deben cubrir los 366 días de un año bisiesto con **una sola** época cada día (`validaTabla` y el guardián); por eso no se pone ningún límite en febrero.

**Valores de partida: [SUPUESTO], no salen de ninguna fuente del repo ni de una medida.** Son un calendario razonable para el olivar de Jaén escrito a mano para poder arrancar (reposo 16-ene a 31-mar; botón hasta 9-may; flor hasta 9-jun; cuajado hasta 9-jul; verde hasta 9-sep; envero hasta 31-oct; madura 1-nov a 15-ene). **De partida, a ajustar por Antonio.** El fichero lo dice en su campo `estado`. Más adelante la época podrá salir de la fenología de OlivarTrack (`bbchAEpoca`, [`olivo-generado.md`](olivo-generado.md) §1); el calendario seguirá de respaldo.

El ciclo es `reposo → boton → flor → cuajado → verde → envero → madura → reposo` (`ORDEN_EPOCAS`, `siguienteEpoca`): la época **siguiente** que hornea el hornero es la que sigue a la actual en este ciclo.

## 5. Manifiesto por tesela (solo con `propios.activos`)

Binario, `propios.manifiesto_tesela` (p. ej. `t/{kx}_{ky}.olivos`, relativo a `olivos/`), con la tesela y tras sesión como el resto de `/teselas/`. **Little-endian**.

| Byte | Tamaño | Tipo | Campo |
|---|---|---|---|
| 0 | 4 | ASCII | magia `OLVT` |
| 4 | 2 | u16 | versión de formato (`1`) |
| 6 | 2 | u16 | `nh`: huellas por olivo = `combinaciones.length` del manifiesto de la finca (4 con E0 y E1 en dos épocas) |
| 8 | 4 | u32 | `n`: olivos |
| 12 | 4 | u32 | reservado, `0` |
| 16 + i·(4 + 16·`nh`) | 4 | u32 | `copas_id` del olivo i (en orden **ascendente**, único: se puede buscar por bisección) |
| … + 4 + 16·j | 16 | bytes | huella (128 bits crudos) de `combinaciones[j]`; **16 ceros = esa combinación no está horneada** |

**68 B por olivo** con `nh = 4` (4 + 4 × 16); total `16 + n · 68`. `codificaManifiestoTesela` / `decodificaManifiestoTesela`. Los propios horneados son **opcionales y apagados** (ADR-0018 §1): hoy ningún hornero los produce; el formato queda fijado para no rehacerlo si se activan.

## 6. Pérdidas máximas admitidas

Las de la medida O6 (Hituelo, `olivo-2`, media de 120 olivos al azar de 5.882; MEDIDAS) son el **tope**; `TOPES` en `horneado.js` y el guardián las exigen:

| Magnitud | Tope | Cómo se mide (`perdida()`) |
|---|---|---|
| posición de un vértice (`atrib.position`) | **≤ 0,11 mm** | distancia 3D entre original y decodificado |
| traslación de una instancia, posición de un punto | **≤ 0,11 mm** | ídem |
| normal | **≤ 0,39°** | ángulo entre la original y la decodificada |
| color | **≤ 0,0011** | diferencia absoluta máxima |
| parte lineal de las matrices | **≤ 0,06 mm** | norma de Frobenius del error de los 9 valores × el radio de la geometría compartida de la instancia |
| `uv`, `aHueco`, `aMuerta` | por construcción: ≤ rango/131 070, ≤ rango/510 | media paso de cuantización (no se midieron en O6) |

Lo demás —índices, `nodo`, `padre`, `brote`, `cuenta`, `escala`, `corte`, `medidas`, el número de piezas y la longitud de cada array— sale **idéntico**: `igualEstructura()` lo comprueba y el guardián exige los mismos triángulos y llamadas de dibujo con recetas reales. La receta horneada **no** pasa la huella `olivo-2` (no es bit a bit la calculada): se comprueba con la huella del objeto (ADR-0018).

**Medido en esta tarea** (una sola corrida, en la máquina de desarrollo con Node; *centenario3*, parámetros por defecto, `envero`, semillas 11 y 23; **no es la media de la finca** y los topes de O6 salen de otra muestra): las 8 recetas cumplen todos los topes. Peor caso: posición 0,0864 mm, traslación 0,0901 mm, normal 0,386°, color 0,00108, parte lineal 0,0518 mm. Tamaños de la semilla 11 (crudo → horneado sin comprimir → brotli 9): E0 2,48 → 1,06 → 0,72 MB; E1 1,30 → 0,55 → 0,34 MB; **E2 1,06 → 0,45 → 0,31 MB; E2-VR 0,89 → 0,39 → 0,25 MB** (la semilla 23: E2 0,29 y E2-VR 0,23 MB). Son algo mayores que la media por olivo de O6 (E2 242 KB, E2-VR 199 KB con brotli 9): este es un centenario de 3 pies con la copa de partida, no un olivo medio, y las variantes reales llevarán su altura y copa. Codificar + brotli 9 de un nivel: 49-154 ms; decodificar: 4-16 ms (Node, sin navegador).

## 7. Qué hay que saber al implementar

- **El hornero (O7c):** `horneaObjeto(receta, {nivel, clave, gen_version, cache_version}, calidad)` da `{huella, bytes, bytes_br, crudo, br}`; guardar `br` como `<huella>.br` y escribir el manifiesto el último. `GEN_VERSION` sale de `version.js` y `CACHE_VERSION` de `cache.js`; la `clave`, de `claveReceta`.
- **El motor (O7e):** importar de `apps/web/olivo/index.js` (`decodifica`, `leeCabecera`, `huellaBytes`, `verificaHuella`, `epocaDeFecha`...), nunca `horneado_node.js`. La receta decodificada se guarda en la caché con la **misma clave**; se monta con `montaOlivo` como cualquier otra.
  - Hecho en `apps/web/motor/07ab_generados.js`: con `?olivos=gen` y `D.base` `/teselas/<finca>/` pide `<D.base>olivos/manifiesto.json` (mismo origen, `credentials: "same-origin"`, `cache: "no-cache"`) **antes** de crear los materiales. Si `v`, `formato`, `gen_version` o `cache_version` no son las del motor, alguna fila está mal formada (la huella va en la URL: 32 hexadecimales exactos) o la petición falla, lo ignora entero sin escribir en consola. La época: `?epoca=` si se pasa; si no, `epocaDeFecha` con las ventanas de `epocas[]` y, si hoy no cae en ninguna, `actual`. Las variantes: los `(tipo, semilla)` de las filas de esa época, en su orden; si no hay ninguna, `SEM_VAR`.
  - Por variante: caché de O5 → descarga `<huella>.br` → `bytes` del manifiesto → `huellaBytes` → `leeCabecera` (formato, versiones, nivel y `clave` = la de la caché) → `decodifica` → caché. Cualquier fallo → se calcula y se cuenta. `?debug`: «horneadas N · calculadas M · fallos K» en la línea de generados (y `window.__olivosGen().horneado`). Web Crypto solo existe en contexto seguro: por `http://<ip de la red local>` la huella falla y todo se calcula.
  - Banderas: `?olivosHorneado=0` lee el manifiesto (mismas variantes y época) pero no descarga nada (para comparar a ojo); `?olivosDir=<ruta relativa acabada en «/»>` usa esa carpeta en vez de `<D.base>olivos/` (pruebas, banco); `?olivosPropios=N` (0-6) limita los propios (con 0, todo lo cercano son variantes).
  - Lo vigila `pruebas/olivo/generados_motor.mjs` §6 (desde `olivo.test.js`): con manifiesto, 0 variantes calculadas y el mismo lote que calculándolas; huella alterada o 404 → cálculo; sin manifiesto o con el sintético del fixture, como siempre.
- **Servir (O7d):** el objeto es `application/octet-stream` + `Content-Encoding: br`; el cliente ve los bytes ya descomprimidos.
- **No probado:** decodificar en un navegador, móvil o gafas (tiempos y memoria), Safari y Firefox, una tesela real horneada, el aspecto de la receta cuantizada frente a la calculada (O7e lo compara a ojo), el peso real de la cabecera JSON en una receta real.
