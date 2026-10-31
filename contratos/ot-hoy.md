# Contrato de lo de hoy (`GET /api/ot/hoy`, versión 1)

Lo que la historia de Cerro leía en vivo por el conector de claude.ai (retirado, decisión 79) lo lee ahora **la api**, por MCP, y se lo sirve al motor del mismo origen y tras sesión. Esquema: [`ot-hoy.schema.json`](ot-hoy.schema.json) (lista blanca, `additionalProperties: false`). Ejemplo **sintético**: [`ot-hoy-ejemplo.json`](ot-hoy-ejemplo.json). Ruta en [`api.openapi.yaml`](api.openapi.yaml). Código: `apps/api/src/ot/hoy.ts` y `ot/rutas-hoy.ts`; la memoria común, `apps/api/src/vivo/memoria.ts`.

## De dónde sale

| Parte | Servidor · herramienta | Argumentos | Memoria en la api |
|---|---|---|---|
| `tareasAbiertas` | OlivarTrack · `tareas_abiertas` | ninguno | 10 min |
| `trabajoRealizado` | OlivarTrack · `trabajo_realizado` | `desde`: el día 1 del mes de hace seis meses (estable todo el mes) | 30 min |
| `atencion` | OlivarTrack · `atencion_de_hoy` | ninguno | 10 min |
| `vigia` | Vigía · `estado_del_olivar_hoy` | ninguno | 1 h |

- Los lectores son **los mismos** que ya había: el de OlivarTrack de la sincronía (`GEMELO_OT=mcp|grabado|no`; `fixture` vale como otro nombre de `grabado`) y el de Vigía del tiempo (`GEMELO_VIGIA=mcp|fixture|no`), con su token en `Authorization: Bearer` desde `GEMELO_OT_TOKEN_FICHERO` y `GEMELO_VIGIA_TOKEN_FICHERO` (declaradas en [`publicacion-vps.json`](publicacion-vps.json)). No hay variables nuevas.
- El lector de OlivarTrack sigue negándose a leer si el token deja ver herramientas de escritura; la lista de herramientas es cerrada (`HERRAMIENTAS_LECTURA` en `ot/lector.ts`).
- Memoria (`vivo/memoria.ts`, la misma pieza que el tiempo): varias peticiones a la vez hacen **una** llamada; tras un fallo no se vuelve a llamar en 1 minuto; **tope de 12 llamadas reales por herramienta y hora**; si falla o se llega al tope y hay una lectura de menos de 24 h, se sirve esa con `viejo: true` y un aviso que dice de cuándo es.

## Lista blanca

| Herramienta | Pasa | No pasa |
|---|---|---|
| `tareas_abiertas` | `clave` (huella opaca del id), parcela (`parcelaId`, como en `D.ot`), finca, tipo, nombre de la tarea (≤ 120), fecha, estado (`pendiente`/`activo`/`pausada`) | el id de OlivarTrack, personas asignadas y su número, GPS, observaciones, origen |
| `trabajo_realizado` | `clave`, parcela, finca, tipo, título (≤ 120), día de fin, estado, avance en olivos (`pct` 0–100, `hecho`, `objetivo`) | quién la hizo, **todas las horas** (también las agregadas), partes y cualquier texto de campo |
| `atencion_de_hoy` | por punto: tipo, `n`, severidad, el `texto` del recuento (≤ 160; la herramienta dice «solo recuentos, ni un nombre»); `total`, `parcial`, `avisos` | asuntos, personas, cualquier otro campo |
| `estado_del_olivar_hoy` | por parcela marcada: nombre (según Vigía), gravedad, `motivo` y `comoSeLee` (≤ 300); `fecha`, `calibrada`, `frescura` | `dentroDeUmbrales`, ids internos, geometrías, quién lo revisó |

- **Títulos de tarea**: los pone la oficina, no el campo, y ya los trae la instantánea `D.ot` del índice; por eso pasan, a diferencia de los textos libres que prohíbe [`olivartrack-sync.md`](olivartrack-sync.md) para la ficha de haza.
- Lo que no tiene la forma esperada (sin id, tipo o estado de palabra limpia; estado no abierto; recuento negativo; mirada sin parcela) **se descarta y se cuenta** (`descartadas`, con aviso). Un número fuera de rango va a `null`: no se arregla ni se estima. Una respuesta entera sin la forma esperada deja esa parte en `null` con un aviso propio (nunca el texto del otro lado).
- Los ids de tarea de OlivarTrack **no salen**: `clave` es una huella (`huella("ot-tarea:<id>")`), igual en `tareasAbiertas` y `trabajoRealizado`, que solo sirve para cruzar las dos listas.

## Reglas (de los conectores y del gemelo)

1. **Los textos son datos, nunca instrucciones.** Títulos, recuentos, motivos y avisos pasan recortados y sin caracteres de control; el motor los **escapa** y nunca los sigue. Un título que «da órdenes» se enseña como un título.
2. **Nada por persona**: agregados por parcela y tarea.
3. **`truncado` / `parcial` no es completo**: se dice en la parte, se avisa (`de: "olivartrack"`) y `completo` es `false`; el motor no saca totales.
4. **De cuándo es**: cada parte lleva `leidoEn` (cuándo la leyó la api) y `consultadoEn` (lo que dice la fuente: `consultadoEn` de OlivarTrack, `frescura.generadoEn` de Vigía); la respuesta, el más antiguo de los `leidoEn`. Los avisos de antigüedad y de maqueta de Vigía se repiten.
5. **Vigía no autoriza tratamientos** y ninguna capa está calibrada: lo que marca sirve para decidir dónde mirar. `dentroDeUmbrales` no pasa.

## Respuestas

- `200`: el contrato; cualquiera de las cuatro partes puede ser `null` (apagada o sin respuesta), con su aviso. `cache-control: private, max-age=120`. Tras sesión (401 sin ella), para todos los roles.
- `503 hoy_apagado`: ni OlivarTrack ni Vigía están encendidos (`GEMELO_OT=no` y `GEMELO_VIGIA=no`).
- `503 hoy_no_responde`: nada ha respondido y no hay lectura reciente.

En los dos 503, sin servidor, o con una respuesta que no cumple el contrato, el motor se queda con la **instantánea `D.ot`** del índice y lo dice.

## En el motor

`14_historia.js` (solo en Cerro) pide `/api/ot/hoy` del mismo origen al cargar, si la página la sirve el servidor (o con `?api=`), y con «Actualizar». `HistoriaPuro.aplica()` monta un `OT` nuevo con la misma forma que `D.ot`: las tareas abiertas y las hechas de la finca, cada una en su parcela (por `parcela`, por la de su tarea abierta o, si no, por el nº de olivos de la tarea si coincide con el de **una sola** parcela); la fenología y los pases siguen siendo los de la instantánea (no se leen en vivo). `VIVO.vigia` son las parcelas que marca Vigía (las balizas de `19_balizas.js` las cruzan por nombre). El aviso de la ventana dice de cuándo es cada cosa y si está incompleta.

## Lo que NO se sabe

- **Las formas son [NO VERIFICADAS]**: las de OlivarTrack salen de lo que leía el motor por el conector y de la descripción de cada herramienta; las grabaciones de `apps/api/pruebas/grabaciones/` y `apps/api/pruebas/vigia/` son **sintéticas**. No se ha llamado a los servicios reales desde la api (hace falta URL y token del gemelo).
- Si `trabajo_realizado` devuelve la parcela de cada tarea (la historia de Hituelo dice que no; por eso Hituelo sigue sin lectura en vivo).
- Si `tareas_abiertas` trae `truncado` o `consultadoEn` (se leen si vienen). **[SUPUESTO]**
