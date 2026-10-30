# Alta desde cero y la puerta

## 1. Requisitos
- Node ≥ 24 (`.nvmrc`), Python ≥ 3.10 (probado con 3.14), Chrome (ruta por defecto `C:/Program Files/Google/Chrome/Application/chrome.exe`; otra con la variable `CHROME`).
- `npm i` (solo `playwright-core`) y `cd apps/web && npm i` (Vite y three 0.186.1). Para el constructor de olivos, `cd apps/web/olivo && npm i` (three 0.128.0 fijado como `three-gen`, three 0.186.1 para la prueba de compatibilidad y Vite). Para **regenerar datos reales** además `pip install -r requirements.txt` y las fuentes descargadas ([DATOS.md](DATOS.md)); para la puerta no hace falta.

## 2. Primer vistazo
1. Lee [CLAUDE.md](../../CLAUDE.md) (reglas de oro) y [ESTADO.md](../ESTADO.md).
2. `npm run fixture` genera (si falta) el fixture sintético; `npm run puerta` debe salir en verde.
3. Mira una página montada: levanta el entorno local con el fixture (`npm run dev:arriba`, [DESARROLLO-LOCAL](DESARROLLO-LOCAL.md)) o construye la web contra `pruebas/salida/fixture/cerro/indice.json` (`GEMELO_DATOS=… npm run build` en `apps/web`) y ábrela con `?debug`. La escena necesita el tileset del fixture; no se abre con `file://`. TODO-C: la orden exacta de las páginas de prueba (`pruebas/guardianes/_pagina.js`).

## 3. La puerta
<a id="la-puerta"></a>

**Esta es la única lista de la puerta.** CLAUDE.md, CONTRIBUTING y las skills remiten aquí; no la copian. Comando: `npm run puerta` (equivale a `node --test "pruebas/guardianes/*.test.js"`).

| # | Comprobación | Guardián |
|---|---|---|
| 1 | Sintaxis: `node --check` del script montado (todos los `apps/web/motor/*.js` concatenados) y de cada módulo envuelto; `py_compile` de los `.py`; orden de montaje (`01_` primero, `99_` último) | `sintaxis.test.js` |
| 2 | Sin marcas de conflicto, sin CRLF, sin rutas locales ni correos en lo versionado | `higiene.test.js` |
| 3 | `VERSION`, `package.json`, CHANGELOG, CLAUDE.md, README y ESTADO dicen la misma versión | `version.test.js` |
| 4 | Documentación: enlaces relativos, índices (ADR, doc/README), techos, `historico/` con «foto» | `documentacion.test.js` |
| 5 | Contratos: el fixture cumple los esquemas (ajv), las interfaces devuelven los miembros declarados y las cabeceras «Expone / Consume» de `apps/web/motor/` están al día | `contratos.test.js` |
| 6 | Build de las dos fincas desde el fixture (índice + `t/` + tileset) con Vite. TODO-C: confirmar qué comprueba tras retirar los límites de publicación | `build.test.js` |
| 7 | Carga en Chrome headless: 0 errores de consola y presupuesto de dibujo bajo `pruebas/presupuesto.json` | `carga.test.js` |
| 8 | Sin secretos, ni datos de la explotación, ni ficheros pesados versionados | `secretos.test.js` |
| 9 | VR: sin WebXR no hay botón ni errores; con el mock, la prueba completa (**opcional**, `GEMELO_VR=1`) | `vr.test.js` |
| 10 | Cliente web: la entrada de Vite es la concatenación exacta, three con versión exacta ≥ 0.167 y los trozos de sombreador que parchea el motor existen, y la página empaquetada carga sin errores (TODO-C: ya no hay artefacto con la que compararla) | `web.test.js` |
| 11 | Exportadores multiplataforma: ninguna ruta con separador `\` escrito a mano en `tuberia/**/*.py` (se arman con `os.path.join`) | `multiplataforma.test.js` |
| 12 | Catálogo de olivos-tipo: el catálogo sintético cumple su esquema (ajv), cada glb pasa `gltf-validator` y su presupuesto de triángulos por nivel, el generador es determinista; en Chrome, instalar y retirar el catálogo funciona sin cambiar lo de siempre | `olivos.test.js` |
| 13 | Entorno de desarrollo: compose válido, imágenes con versión fija + digest sin preliminares, puertos solo en 127.0.0.1, sin secretos; e2e opcional con Docker (`GEMELO_DOCKER=1`) | `dev.test.js` |
| 14 | Servidor F1a: imágenes de producción = contrato = dev (versión + digest), sin puertos publicados ni secretos escritos, Node del contrato, dependencias fijadas, cargador de hazas con el ejemplo sintético, tipos y unitarias de `apps/api` (se saltan con aviso sin `npm ci` en `apps/api`); integración contra PostGIS y `infra/probar-caddy.sh` opcionales (`GEMELO_DOCKER=1`); `infra/comprobar-despliegue.sh` solo lee y pasa contra un servidor falso (sin Docker) | `api.test.js` |
| 15 | Exportadores: `copas_id` (censo de OlivarTrack o provisional por posición) y `copas_tipo` (−1) con la longitud de `copas`, ids únicos y estables; si hay numpy, scipy y pillow (`requirements.txt`), Hituelo y Cerro exportados de verdad sobre 1 tesela sintética y su índice válido (si faltan, se salta con aviso) | `exportadores.test.js` |
| 16 | Presencia (F2, sin red): el códec de pose da 24 B (escritorio) y 56 B (Quest) con la tabla de bytes del contrato, la ida y vuelta queda en ≤ 5 mm y ≤ 0,25°, rechaza versiones, tipos y longitudes ajenos, el búfer de interpolación aguanta la vuelta de la secuencia y del reloj, y los permisos de LiveKit de F2 son solo datos; en Chrome, sin `?presencia` no se añade nada y con `?presencia=sim` 10 y 40 visitantes cuestan las mismas 5 llamadas y `libera()` suelta la GPU | `presencia.test.js` |
| 17 | Constructor de olivos generados (ADR-0017): las huellas del módulo `apps/web/olivo/` = las del oráculo (273 casos), «sube GEN_VERSION» si cambia el núcleo, mismo grupo montado con three 0.128.0 y 0.186.1, recuentos de los niveles E0-E2VR, semillas y parámetros del registro; en Chrome, trabajador = hilo principal, rebanadas ≤ 3 ms e IIFE con r128 (se salta con aviso sin `npm i` en `apps/web/olivo`) | `olivo.test.js` |
| 18 | Banco de pruebas: el turno de lo pesado (un Chrome o un Docker de pruebas a la vez en el equipo) es exclusivo entre procesos; los encargos de medida se validan; la puerta, `lanza()` y la e2e de Docker pasan por el turno | `banco.test.js` |
| 19 | Hazas en el motor (F1 «3c», `13b_hazas.js`, en Node sin navegador): el GeoJSON de `/api/hazas` cumple el esquema `Hazas` de `api.openapi.yaml` (ajv) y el validador del motor rechaza lo mismo que el contrato; UTM → local con `centro_utm`; la linde pegada al suelo en tramos de ≤ 2 m; la ficha solo enseña la lista blanca de `haza.schema.json` con procedencia (nada de titular, kilos, personas, GPS ni texto libre aunque llegue); sin api, con 401, error o datos fuera de contrato no se pide o no se crea nada y no se escribe en la consola; con datos, una sola `LineSegments` que `libera()` suelta | `hazas.test.js` |
| 20 | Tubería 3D Tiles: tileset válido (CesiumGS), identidad por instancia (`_INDICE_COPA` + huella) y `_TIPO` con nombres del catálogo, raíz sin contenido | `tiles3d.test.js` |
| 21 | Escena 3D Tiles en el motor (la única): tileset sin errores ni CSP, raíz vacía visible de lejos, relieve a ≤ 1,5 m del de la CPU; tileset de otro host rechazado; sin tileset, panel «Esta finca no tiene escena» y `Escena3D.resumen().estado === "sin"` (TODO-C: confirmar lo que queda del guardián) | `escena3d.test.js` |
| 22 | Sombreado del tileset: el parche GLSL de `04d_sombreado_tiles.js` y sus uniformes (TODO-C: ya no hay `Terreno` con el que compararlo) | `sombreado_tiles.test.js` |
| 23 | Receta de olivo horneada v1 y manifiestos del hornero (ADR-0018, O7b): esquemas del manifiesto y del calendario de épocas con ajv (el ejemplo los cumple y rechazan lo que deben; 366 días con una sola época), ida y vuelta cuantizar → decuantizar de una receta sintética en los cuatro niveles dentro de las pérdidas de O6 (≤ 0,11 mm, ≤ 0,39°), huella fijada, brotli 9/11, objetos estropeados rechazados, manifiesto de tesela de 68 B por olivo; con `npm i` en `apps/web/olivo`, además recetas reales de `olivo-2` con los mismos triángulos | `horneado.test.js` |
| 24 | La llegada (`12b_llegada.js`): rayo → suelo (llano, relieve, hacia arriba, fuera de la finca, tope), sin anillo por detrás de la mirada, tamaño del anillo, apartado de troncos y umbral toque/arrastre, en Node; en Chrome, el Dron en pantalla (arrastrar no marca, clic sí, Intro aterriza de pie en el anillo, sin anillo guarda el Dron); la VR desde el mirador, **opcional** (`GEMELO_VR=1`) | `llegada.test.js` |

En CI la misma puerta corre en GitHub Actions (`.github/workflows/puerta.yml`); no despliega nada.

**Duración medida (2026-10-29):** ≈ 4 min 30 s con `npm run puerta` (151 comprobaciones, de ellas 18 saltadas con aviso en una copia sin `npm i` en `apps/web` ni dependencias de `apps/api` y `tuberia/tiles3d`; la presencia suma unos 2 min de navegador; antes, 2026-10-28: ≈ 2 min 30 s, 90 comprobaciones, 1 opcional saltada; las de navegador en serie, `--test-concurrency=1`, porque en paralelo se estorban; 2 fincas montadas y cargadas en Chrome 131 con SwiftShader; Windows 10, Node 24, Python 3.14). Casi todo es el arranque de Chrome y la carga del fixture; sin Chrome, esas dos comprobaciones se saltan con aviso y la puerta baja a unos segundos (pero entonces la carga **no** está comprobada).

Si falla una comprobación, [TESTING.md](TESTING.md) dice qué significa cada rojo y cómo se arregla. Una prueba que no se puede ejecutar (p. ej. sin Chrome) **se salta con aviso explícito, no pasa en silencio**.

## 4. Flujo de trabajo
Rama → cambio pequeño con su comprobación → puerta → documentación afectada → commit en español con `Co-Authored-By`. Publicar, etiquetar y `push` los decide la persona.
