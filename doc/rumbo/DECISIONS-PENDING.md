# Decisiones pendientes

Decisiones que **no puede tomar un agente**: las cierra Antonio. Las técnicas se deciden y se cuentan (CLAUDE.md §6). Al cerrar una, se convierte en ADR (skill `adr`) y se quita de aquí. 🟡 abierta · ✅ cerrada.

## De un vistazo

| Abierta | Bloquea | Quién la cierra |
|---|---|---|
| Licencia | publicar el motor con condiciones claras | Antonio |
| Cifras reales y datos de la explotación en repo público | mantener `doc/historico/DISENO-2026-10.md` tal cual; el guardián de privacidad | Antonio |
| Qué se publica y cuándo | tag/release, borrar artefacto de prueba | Antonio |
| Grabar las visitas guiadas | diseño de la fase 3 | Antonio |
| Encaje de la arquitectura multiusuario con el motor (ADR-0009) | cualquier código de la fase 2 | Antonio, tras el estudio del agente |
| Número de versión inicial (0.2.0 asignado por este sistema) | primera release | Antonio |

## Detalle

| # | Decisión | Opciones | Bloquea | Estado |
|---|---|---|---|---|
| 1 | **Licencia** del motor | MIT / Apache-2.0 / otra / seguir con «todos los derechos reservados» | `LICENSE` (no se crea hasta decidirla) | 🟡 |
| 2 | **Cifras reales de fincas e ids internos en `DISENO-2026-10.md`** (repo público) | dejar / anonimizar / sacar del repo | guardián de privacidad lo marca; ya retirado el enlace del artefacto privado de ESTADO | 🟡 |
| 3 | **Suelo nuevo vs. anterior** (ADR-0007) | sustituir | M1, M2 | ✅ 2026-10-28: se queda el nuevo (ADR-0007 Aceptado) |
| 4 | **Qué se publica** | nada / solo Cerro / Cerro+Hituelo | skill `publicar-artefacto` | 🟡 |
| 5 | **Ramas** | `main` | flujo | ✅ 2026-10-28: se trabaja en `main` por ahora |
| 6 | **Versión inicial** | 0.2.0 (asignada) / 2.0.0 (por «v2») / otra | primera release | 🟡 |
| 7 | **Borrar el artefacto desechable** de la prueba de plataforma | borrar / conservar | limpieza | 🟡 |
| 8 | **Portabilidad** de los exportadores a otros SO | hacerla / dejar solo Windows | D4 | 🟡 |
| 9 | **Historia de Hituelo** | ocultar / mostrar | `sin_historia` | ✅ 2026-10-28: se muestra (`hituelo_conv.py` emite `sin_historia = false`) |
| 10 | **Grabar las visitas guiadas** para quien no pudo asistir | sí / no / solo clips revisados | fase 3 de la arquitectura multiusuario | 🟡 sin decidir |
| 11 | **Arquitectura multiusuario** (ADR-0009) | aceptar / ajustar tras el estudio | fase 2 en adelante | 🟡 propuesta; Postgres propio, OVH, `gemelo.canoydamas.es` y hazas ajenas visibles ya decididos |
