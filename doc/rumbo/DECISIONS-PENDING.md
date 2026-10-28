# Decisiones pendientes

Decisiones que **no puede tomar un agente**: las cierra Antonio. Las técnicas se deciden y se cuentan (CLAUDE.md §6). Al cerrar una, se convierte en ADR (skill `adr`) y se quita de aquí. 🟡 abierta · ✅ cerrada.

## De un vistazo

| Abierta | Bloquea | Quién la cierra |
|---|---|---|
| Licencia | publicar el motor con condiciones claras | Antonio |
| Cifras reales y datos de la explotación en repo público | mantener `doc/historico/DISENO-2026-10.md` tal cual; el guardián de privacidad | Antonio |
| Qué se publica y cuándo | tag/release, borrar artefacto de prueba | Antonio |
| Grabar las visitas guiadas | diseño de la fase 3 | Antonio |
| Arquitectura multiusuario: decisiones de la fase 1a (nº 12–16) | F1a (servidor) | Antonio |
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
| 9 | **Historia de Hituelo** | ocultar / mostrar | `sin_historia` | ✅ 2026-10-28: se muestra (`tuberia/hituelo_conv.py` emite `sin_historia = false`) |
| 10 | **Grabar las visitas guiadas** para quien no pudo asistir | sí / no / solo clips revisados | fase 3 de la arquitectura multiusuario | 🟡 sin decidir |
| 11 | **Arquitectura multiusuario** (ADR-0009) | aceptar / ajustar tras el estudio | fase 2 en adelante | 🟡 propuesta; Postgres propio, OVH, `gemelo.canoydamas.es` y hazas ajenas visibles ya decididos |
| 12 | **Qué es una haza** y quién la asigna a cada hogar (40 hazas frente a 32 parcelas en el gemelo y 37 en OlivarTrack) | parcela / trozo / grupo de parcelas | modelo de datos, F1a | 🟡 (recomendado: tabla `hazas` propia con relación n:m a parcelas) |
| 13 | **Campos visibles de una haza ajena** y si se muestra el hogar titular | lista blanca propuesta en el estudio | `haza.schema.json`, F1a | 🟡 (recomendado: sin titular, alias opcional; sin kilos) |
| 14 | **Recuento de olivos que manda** y qué fincas entran | 7.277 / 6.156 / LiDAR | cifras del mundo, F1a | 🟡 (recomendado: detectado por LiDAR, con el declarado al lado; empezar por Hituelo) |
| 15 | **Proveedor de correo** del enlace mágico | transaccional UE / SMTP de OVH | auth, F1a | 🟡 |
| 16 | **¿Mundo tras sesión o abierto?** | todo tras sesión / parte abierta | Caddy y CSP, F1a | 🟡 (recomendado: todo tras sesión salvo la portada) |
| 17 | **Token de lectura propio** del gemelo en OlivarTrack | sí / compartir el actual | sincronía, F2 | 🟡 (recomendado: sí; cambio pequeño en OlivarTrack) |
| 18 | **Aceptar un cambio visual** al subir three (color y luz) | sí, con capturas / no | F1c | 🟡 |
| 19 | **Corresponsal: PWA o app nativa** | PWA / nativa | F4 | 🟡 |
| 20 | **¿Se mantiene la salida a artefacto** de claude.ai? | hasta F2 / siempre / no | `tuberia/salida_artefacto/` | 🟡 (recomendado: hasta F2) |
