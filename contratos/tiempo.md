# Contrato del tiempo (`GET /api/tiempo`, versión 1)

El tiempo de la explotación que el motor pinta (sol, nubes, lluvia, viento, chip del HUD y ventana Tiempo) sale de **Vigía**, leído por la api por MCP. Esquema: [`tiempo.schema.json`](tiempo.schema.json) (lista blanca, `additionalProperties: false`). Ejemplo sintético: [`tiempo-ejemplo.json`](tiempo-ejemplo.json). Ruta en [`api.openapi.yaml`](api.openapi.yaml).

## De dónde sale

| Parte | Herramienta de Vigía | Naturaleza | Caché en la api |
|---|---|---|---|
| `actual` | `tiempo_en_la_explotacion` (sin argumentos) | **medido** en una estación que **no está en la finca** (`estacion.distanciaKm`) | 10 min |
| `prevision` | `prevision_72_horas` (sin argumentos) | **modelado**, una por finca, rejilla de ~5 km, hora a hora | 1 h |

- Varias peticiones a la vez hacen **una** llamada a Vigía. Tras un fallo no se vuelve a llamar en 1 minuto.
- Si Vigía falla y hay una lectura anterior de menos de 24 h, se sirve esa con un aviso `de: "gemelo"` que dice de cuándo es.
- `consultadoEn`: cuándo leyó la api la parte más antigua de las dos. `frescura` (de cada parte): lo que dice Vigía (`generadoEn`, `horasDeAntiguedad`, `datosDeMaqueta`).

## Reglas (de Vigía y del gemelo)

1. **Vigía no autoriza tratamientos.** `dentroDeUmbrales`, `impedimento` y `queSignificaDentroDeUmbrales` **no pasan** al cliente: el gemelo no enseña «se puede tratar» ni nada que lo parezca.
2. **No se inventan números.** Lo que Vigía no devuelve, o devuelve fuera de rango, va a `null`; el motor dibuja con lo que hay (una línea cortada, «—»).
3. **Los textos son datos.** `estacion.advertencia`, `direccion.advertencia` y los `avisos` con `de: "vigia"` son textos de Vigía: se recortan (sin caracteres de control, ≤ 400), el motor los **escapa** y nunca los sigue.
4. **Siempre de cuándo es.** La ventana Tiempo dice «estación a X km, hace N min» y la frescura de la previsión; los avisos de antigüedad o de maqueta se repiten.
5. El anemómetro de la estación está en duda para Vigía: el **viento del mundo sale de la previsión**; la lluvia medida es un **acumulado** (no dice si llueve ahora), así que la lluvia que se ve también sale de la previsión de la hora. La temperatura y la humedad de «ahora» son las medidas.
6. Medido / modelado / ilustrativo: la estación es *medido*; la previsión, *modelado*; las nubes, la lluvia y el viento dibujados en el mundo, *ilustrativos*.

## Respuestas

- `200`: el contrato. `cache-control: private, max-age=60`. Tras sesión (401 sin ella), como el resto del mundo.
- `503 tiempo_apagado`: la api no lee el tiempo (`GEMELO_VIGIA=no`).
- `503 vigia_no_responde`: Vigía no responde y no hay lectura reciente.

En los dos 503, y sin servidor (salida artefacto sin conector, pruebas antiguas), el motor usa el **tiempo simulado** de siempre y lo dice («tiempo simulado» en la ventana y en el chip).

## Configuración (api)

`GEMELO_VIGIA=mcp|fixture|no` (por defecto `no`), `GEMELO_VIGIA_MCP_URL` (https en producción), token en `GEMELO_VIGIA_TOKEN_FICHERO` (en producción solo fichero; fuera, también `GEMELO_VIGIA_TOKEN`), que va en la cabecera `Authorization: Bearer`. `fixture` lee las respuestas **sintéticas** de `apps/api/pruebas/vigia/` (`GEMELO_VIGIA_FIXTURE`) y corre sus fechas a «ahora»; prohibido en producción. En local (infra/dev) el modo por defecto es `fixture`.

## El histórico (`GET /api/tiempo/historico?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`, versión 1)

Para la estación del olivo (`23_estacion.js`: el clima de la semana de la fecha que se elige). Esquema: [`tiempo-historico.schema.json`](tiempo-historico.schema.json) (lista blanca). Ejemplo sintético: [`tiempo-historico-ejemplo.json`](tiempo-historico-ejemplo.json). Misma configuración, mismos modos (`GEMELO_VIGIA=mcp|fixture|no`) y misma sesión que `/api/tiempo`.

- Herramienta de Vigía: `historico_meteo` con `{ desde, hasta }`. Respuesta: `fuentes[]` (una por estación o fuente: `id`, `temperaturaMaxima`, `temperaturaMinima`, `lluviaTotalMm`, `dias`, `diasSinDato`; **medido**), `frescura`, `avisos` (los de antigüedad o de maqueta, como en `/api/tiempo`).
- Rango: días reales, `hasta` no antes que `desde`, como mucho 31 días; si no, `400 rango_no_valido`. Caché en la api: 1 h por rango; un fallo no se repite hasta pasado un minuto; si Vigía falla y hay una lectura anterior de menos de 24 h, se sirve con aviso. `503 tiempo_apagado` / `503 vigia_no_responde` como en `/api/tiempo`. `cache-control: private, max-age=300`.
- El motor elige la fuente de la **estación del tiempo de ahora** (`estacion.id`) o, si no, la que se llama «Imarto» (lo que hacía antes); si no hay ninguna, no elige otra al azar: dice que la estación no tiene datos esa semana. Sin api o con error, el clima del mundo sigue siendo el de hoy y la ventana lo dice.
- **[NO VERIFICADO contra el Vigía real]**: los nombres de campo salen de lo que leía el motor por el conector de claude.ai (`porFuente[]`, `temperaturaMaxima`, `temperaturaMinima`, `lluviaTotalMm`, `dias`, `diasSinDato`).

## En el motor

`15_tiempo.js` lee `/api/tiempo` del mismo origen (solo si la página la sirve el servidor, o con `?api=`), refresca cada 10 min y expone `TiempoVivo.lee()` → `{ origen: "vigia"|"fixture"|"simulado", actual: { temperatura, humedadRelativa, viento, racha, direccion, lluvia, cielo, estacion: { id, distanciaKm }, naturaleza: "medido" } | null, horas: [ { instante, temperatura, humedadRelativa, viento, racha, direccion, nubosidad, lluvia, probabilidadLluvia, naturaleza: "modelado" } ], frescura: { generadoEn, horasDeAntiguedad }, avisos: [texto] }` y `TiempoVivo.alCambiar(fn)`. `cielo` (`despejado|nubes|cubierto|lluvia|niebla`) es **deducido** de la nubosidad y la lluvia de la hora de la previsión y de la humedad medida; `lluvia` del actual es el acumulado medido.

## Lo que NO se sabe

- La forma se leyó por el conector de claude.ai el 2026-10-30 (ya retirado, decisión 79); **no se ha probado contra el MCP de Vigía desde la api** (hace falta la URL y un token del gemelo).
- Si Vigía mete avisos de antigüedad dentro de `frescura` y con qué nombre: la api recoge `aviso`, `advertencia` o `avisoDeAntiguedad` si vienen. **[SUPUESTO]**
- El periodo del acumulado `lluviaAcumulada` (¿desde medianoche?). **[SUPUESTO: no se usa para dibujar lluvia]**
