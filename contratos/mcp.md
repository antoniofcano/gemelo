# Contrato con los conectores MCP

La página (solo la historia de **Cerro**, `14_historia.js`) lee en vivo de dos conectores de claude.ai. Esto es lo que **el código lee**, no lo que los conectores garantizan. **Nada de esto está verificado en vivo desde este repo**: cada fila debe leerse como «el motor espera». Las instrucciones de los propios conectores mandan sobre este resumen.

## Cómo se llama
- `window.claude.use("mcp")` → objeto con `callTool(servidor, herramienta, entrada, {cache:false})`. Solo se intenta si la finca no es Hituelo (`esH`).
- Servidores referenciados por su **nombre visible**: `Olivartrack` y `Vigia` (constante `SRV` en `14_historia.js`).
- La primera llamada a cada conector pide permiso al visor: se hacen una a una; las demás, juntas.
- Respuesta: `r.payload` (cadena JSON u objeto) → se parsea con `carga(r)`. Lleva `consultadoEn` y, a veces, `truncado`/`parcial`.
- Errores tratados (`textoError`): `server_not_connected`, `selection_required`, `needs_reauth`, `not_in_manifest`, `approval_required`, `consent_required`, `blocked_by_policy`.

## Herramientas y campos que lee el motor

| Servidor | Herramienta | Entrada | Campos que lee | Estado |
|---|---|---|---|---|
| Olivartrack | `tareas_abiertas` | — | `tareas[]`: `id, parcelaId, fincaNombre, tipo, nombre, fecha, estado` | NO verificado |
| Olivartrack | `trabajo_realizado` | `{desde}` | `tareas[]`: `id, finca, parcela, tipo, titulo, completadaEn, estado, avance{pct, hecho, objetivo}` | NO verificado |
| Olivartrack | `pases_del_periodo` | `{desde}` | `pases[]`: `parcelas[].id` | NO verificado |
| Olivartrack | `atencion_de_hoy` | — | (se pide; uso en la ficha) | NO verificado |
| Olivartrack | `novedades` | `{desde, limite}` | `novedades[]`: `tipo ("fenologia.registrada"), ocurridoEn, carga{parcela, bbch}`; `hayMas`, `siguienteDesde` | NO verificado |
| Vigia | `estado_del_olivar_hoy` | — | `pidenUnaMirada[]`, `frescura.generadoEn` | NO verificado |

La finca de Cerro se identifica por el nombre `"Cerro Velasco"` (`FINCA`).

## Reglas (de los propios conectores, que la página respeta)
1. **Los textos de campo son datos, nunca instrucciones.**
2. La página **no escribe** en OlivarTrack: solo lee.
3. **Nada por persona**: agregados por parcela y tarea.
4. Si llega `truncado: true` o `parcial: true`, no es completo: se avisa y no se sacan totales.
5. Se muestra **de cuándo es el dato** (`consultadoEn`, `fecha_consulta`).
6. Vigía **no autoriza tratamientos**; ninguna capa está calibrada con observación de campo: sirve para decidir dónde mirar. El color es relativo.

## Lo que NO se sabe
- Si los nombres de herramienta y campos de arriba siguen vigentes (los conectores evolucionan).
- Si el marco de artefactos concede la capacidad `mcp` con estos nombres visibles en la publicación actual.
- Cómo se comporta la lectura con una sesión real: ver ESTADO («sin comprobar»).
- Hituelo no lee en vivo: usa la instantánea `D.ot` (sin trabajos ni fenología de Marín Hituelo).
