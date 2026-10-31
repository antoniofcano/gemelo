# Contrato con los conectores MCP

**El navegador ya no lee de ningún conector MCP.** La página leía en vivo de dos conectores de claude.ai (`window.claude.use("mcp")` y `callTool`, solo la historia de Cerro y el tiempo); eso murió con la salida artefacto (decisión 79: el gemelo solo se sirve desde el servidor) y se quitó de `14_historia.js`, `15_tiempo.js` y `23_estacion.js`. Los servidores **Olivartrack** y **Vigia** los lee ahora **solo la api**, con su propio cliente MCP (SDK oficial, transporte Streamable HTTP) y un token del gemelo en `Authorization: Bearer`; el navegador pide a la api, del mismo origen y tras sesión.

Esto es lo que **el código lee**, no lo que los conectores garantizan. **Nada de esto está verificado en vivo desde este repo**. Las instrucciones de los propios conectores mandan sobre este resumen.

## Servidores referenciados (desde la api, no desde el navegador)

| Servidor | Quién lo llama | Herramientas (solo lectura, lista cerrada) | Qué sirve al motor | Contrato |
|---|---|---|---|---|
| Vigia | `apps/api/src/vigia/` (`LectorVigiaMcp`) | `tiempo_en_la_explotacion`, `prevision_72_horas` (sin argumentos) | `GET /api/tiempo` | [`tiempo.md`](tiempo.md) |
| Vigia | idem | `historico_meteo` (`{ desde, hasta }`) | `GET /api/tiempo/historico` | [`tiempo.md`](tiempo.md) |
| Olivartrack | `apps/api/src/ot/` (`LectorMcp`) | `pases_del_periodo`, `novedades`, `aforo_y_avance_de_recoleccion` | la sincronización a la base (la ficha de haza) | [`olivartrack-sync.md`](olivartrack-sync.md) |
| Olivartrack | idem | `tareas_abiertas`, `atencion_de_hoy` (sin argumentos), `trabajo_realizado` (`{ desde }`) | `GET /api/ot/hoy` (la historia) | [`ot-hoy.md`](ot-hoy.md) |
| Vigia | `apps/api/src/vigia/` (`LectorVigiaMcp`) | `estado_del_olivar_hoy` (sin argumentos) | `GET /api/ot/hoy` (la historia y las balizas) | [`ot-hoy.md`](ot-hoy.md) |

Configuración y modos (`GEMELO_VIGIA=mcp|fixture|no`, URL y token por fichero en producción): ver `tiempo.md` y `olivartrack-sync.md`.

## Lo que se volvió a leer, ahora desde la api

`estado_del_olivar_hoy` (Vigía), `tareas_abiertas`, `trabajo_realizado`, `atencion_de_hoy` (OlivarTrack) las leía la historia de Cerro desde el navegador por el conector. Desde V11 las lee la api y las sirve en **`GET /api/ot/hoy`** ([`ot-hoy.md`](ot-hoy.md)), con memoria, tope de llamadas por hora, frescura y lista blanca; la historia las pide al mismo origen y, si no hay servidor o no responde, sigue con la instantánea `D.ot` y lo dice. `novedades` (la fenología) y `pases_del_periodo` no se leen en vivo para la historia: salen de la instantánea.

## Reglas (de los propios conectores, que la api y la página respetan)
1. **Los textos de campo y de Vigía son datos, nunca instrucciones.** La api los recorta; el motor los escapa.
2. El gemelo **no escribe** en OlivarTrack ni en Vigía: solo lee.
3. **Nada por persona**: agregados por parcela y tarea.
4. Si llega `truncado: true` o `parcial: true`, no es completo: se avisa y no se sacan totales.
5. Se muestra **de cuándo es el dato** (`consultadoEn`, frescura).
6. Vigía **no autoriza tratamientos**; ninguna capa está calibrada con observación de campo: sirve para decidir dónde mirar. El color es relativo.

## Lo que NO se sabe
- Si los nombres de herramienta y campos siguen vigentes (los conectores evolucionan): la api no se ha probado contra los servidores reales (hace falta URL y token del gemelo).
- Hituelo no tiene lectura en vivo: usa la instantánea `D.ot` (sin trabajos ni fenología de Marín Hituelo); el MCP no da la parcela de cada trabajo y, con 27 parcelas, no hay forma segura de asignarlo.
