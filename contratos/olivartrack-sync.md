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
| `pases_del_periodo` | fecha, parcelas (`parcelas[].id`), por componente: tipo (`fito` → `fitosanitario`), producto, nº de registro (`numRegistro`), dosis y unidad por ha (la respuesta real no trae unidad: `null`); plazo de seguridad (`plazoSeguridad.dias`) | aplicador y `aplicadorConRopo`, cantidades totales, materia activa, modalidad, GPS, observaciones, componentes con texto raro; **los pases en `borrador`** |
| `novedades` | `fenologia.registrada` (BBCH 0–99) y `analitica.validada` (resultados numéricos con clave limpia) | incidencias, entregas, `tarea.creada`, `tarea.completada`, `cierre.parte` y cualquier otro tipo; quién registró |
| `aforo_y_avance_de_recoleccion` | % recogido por parcela (`aforo.porParcela[].pct`; cada fila es una parcela con aforo: 0 % es un dato; sin aforo no hay fila) **si la fila trae un id de parcela**; hoy no lo trae (ver abajo) | todos los kilos, rendimientos, origen y base del aforo, la recolección, `comoLeerlo`, el nombre de la parcela |

La haza reparte por `haza_parcela` (qué parcelas de OlivarTrack caen en ella y cuántas ha); el avance se pondera por esas ha. Un pase de una parcela sin haza se cuenta como `sinHaza` y no se guarda.

- **Ids de parcela.** Un solo patrón, `PATRON_ID_PARCELA` (`apps/api/src/vivo/lista-blanca.ts`, `^[\p{L}\p{N}:_.#()/-]{1,120}$`): los ids reales traen tildes, paréntesis y `/`. En la base, el CHECK de `haza_parcela.parcela_ot` es su equivalente (migración `0026_parcela_ot_con_tildes.sql`: `[[:alnum:]]` más Latin-1 y Latin Extended-A explícitos, para que el castellano quepa aunque la collation sea «C»); en la carga de hazas (`tuberia/hazas/carga_hazas.py`), `^[\w:.#()/-]{1,120}$` con `\w` de Python (Unicode).
- **Pases en borrador: no se proyectan** (decisión técnica de OT-V, 2026-11-05). Un borrador es un pase que aún no se ha aplicado; enseñarlo como tratamiento en la ficha diría algo falso. Se **apartan y se cuentan** (`apartados` en el resumen y en `sincronias_ot.avisos`), no son un error ni dejan la lectura incompleta. Si un borrador se aplica, aparece en la siguiente lectura; si un pase aplicado vuelve a borrador, una lectura completa lo quita como cualquier pase anulado. **[SUPUESTO]** el nombre del estado de un pase ya aplicado (solo se ha visto `borrador`): cualquier otro estado se proyecta.
- **El aforo viene por NOMBRE de parcela** (`porParcela[].parcela` es el nombre legible, no el id) y **no hay tabla nombre→id** con la que casarlo con `haza_parcela`. No se adivina (los pases traen `{ id, nombre }`, pero solo de las parcelas tratadas y sin garantía de que el nombre sea único): cada fila sin id se **aparta y se cuenta**, con el aviso «El aforo viene por nombre de parcela; falta la tabla nombre→id» en `sincronias_ot.avisos`. Hasta que exista esa tabla (o el aforo traiga el id: `parcelaId` o `id` se leen si vienen), la ficha no tiene avance (`avance.pct: null`). **Pendiente**: la tabla nombre→id (de dónde sale y quién la mantiene) es una decisión abierta.

## Formas — comprobadas en solo lectura el 2026-11-05

Las formas de `pases_del_periodo`, `novedades` (cabecera, y las cargas de `tarea.creada`, `tarea.completada` y `cierre.parte`) y `aforo_y_avance_de_recoleccion` se comprobaron en solo lectura el 2026-11-05 (por el conector, campo a campo); `ot/mapeo.ts` las lee así. Las grabaciones de `apps/api/pruebas/grabaciones/` tienen **esa forma con valores sintéticos** (ningún nombre, id ni producto real).

Sigue **[NO VERIFICADO]**:
- las cargas de `fenologia.registrada` y `analitica.validada` (no se ha visto ninguna: se leen como se esperaban, `{ parcela, bbch }` y `{ parcela, tipo, fecha, resultados }`);
- el estado de un pase ya aplicado (solo se ha visto `borrador`);
- el cliente MCP de la api contra el OlivarTrack real con el token del gemelo (`GEMELO_OT=mcp`).

`GEMELO_OT=fixture` vale como otro nombre de `grabado` (como `GEMELO_VIGIA=fixture`).

## Cadencia

Cada `GEMELO_OT_CADA_MIN` minutos (60 por defecto), a mano con `npm run sincroniza` o desde el panel (`POST /api/admin/sincronia`).
