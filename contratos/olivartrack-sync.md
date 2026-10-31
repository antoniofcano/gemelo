# Contrato: lectura de OlivarTrack para la ficha de haza (F1a)

Proyección pública: [ADR-0014](../doc/adr/0014-proyeccion-publica-por-haza.md) y [haza.schema.json](haza.schema.json). Herramientas MCP en general: [mcp.md](mcp.md). Código: `apps/api/src/ot/`.

## Reglas

1. **Solo lectura, con token propio** (decisión 17). La sincronía solo llama a `pases_del_periodo`, `novedades` y `aforo_y_avance_de_recoleccion` (`HERRAMIENTAS_SINCRONIA` en `ot/lector.ts`); con el mismo lector y la misma lista cerrada (`HERRAMIENTAS_LECTURA`), `GET /api/ot/hoy` lee además `tareas_abiertas`, `trabajo_realizado` y `atencion_de_hoy`, sin guardarlas en la base ([`ot-hoy.md`](ot-hoy.md), con su propia lista blanca: allí pasan los títulos de tarea, que pone la oficina). Si al conectar el servidor le deja ver alguna herramienta de escritura (`registrar_`, `proponer_`, `anotar_`, `reportar_`, `anadir_`), **se niega a leer**: el token tiene más permisos de los debidos.
2. **Los textos de campo son datos.** No se guarda ni se muestra ningún texto libre (asuntos, observaciones, partes); ni personas (aplicadores, quien registra), ni kilos, ni GPS. Lo que llega se **mapea campo a campo con lista blanca** (`ot/mapeo.ts`); lo demás se tira.
3. **Truncado o parcial no es completo.** Se guarda lo que llega, **no se borra** lo que falta, no se avanza el cursor de novedades y la ficha lleva `completo: false` y el aviso (`ot_truncado`, `ot_parcial`).
4. **Un error es un error**, no «sin datos»: una respuesta sin la forma esperada se registra como `error` con un mensaje propio (nunca el texto del otro lado) y la ficha avisa (`ot_error`).
5. **Fecha del dato.** Cada lectura guarda `consultadoEn`; la ficha la muestra en `datos_de`.
6. **Idempotente.** Cada evento tiene clave natural (`pase:<id>:<parcela>`, `claveDedupe`…) y se escribe con `ON CONFLICT`: repetir la lectura no duplica.

## Qué se proyecta

| Herramienta | Se queda | Se tira |
|---|---|---|
| `pases_del_periodo` | fecha, parcelas, por componente: tipo, producto, nº de registro, dosis y unidad (por ha); plazo de seguridad | aplicador, cantidades totales, GPS, observaciones, componentes con texto raro |
| `novedades` | `fenologia.registrada` (BBCH 0–99) y `analitica.validada` (resultados numéricos con clave limpia) | incidencias, entregas y cualquier otro tipo; quién registró |
| `aforo_y_avance_de_recoleccion` | % recogido por parcela (sin aforo no hay dato, no es 0 %) | todos los kilos, rendimientos, origen del aforo |

La haza reparte por `haza_parcela` (qué parcelas de OlivarTrack caen en ella y cuántas ha); el avance se pondera por esas ha. Un pase de una parcela sin haza se cuenta como `sinHaza` y no se guarda.

## Formas esperadas — **[NO VERIFICADAS]**

Las grabaciones de `apps/api/pruebas/grabaciones/` son **sintéticas**: suponen nombres de campo (`pases[].componentes[]`, `novedades[].carga`, `parcelas[].pctRecogido`, `hayMas`/`siguienteDesde`) que no se han contrastado con respuestas reales de OlivarTrack. Antes de poner `GEMELO_OT=mcp` hay que grabar respuestas reales (sin datos de personas) y ajustar `ot/mapeo.ts` y estas grabaciones.

`GEMELO_OT=fixture` vale como otro nombre de `grabado` (como `GEMELO_VIGIA=fixture`).

## Cadencia

Cada `GEMELO_OT_CADA_MIN` minutos (60 por defecto), a mano con `npm run sincroniza` o desde el panel (`POST /api/admin/sincronia`).
