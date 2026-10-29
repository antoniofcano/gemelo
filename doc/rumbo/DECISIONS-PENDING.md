# Decisiones pendientes

Decisiones que **no puede tomar un agente**: las cierra Antonio. Las técnicas se deciden y se cuentan (CLAUDE.md §6). Al cerrar una, se convierte en ADR (skill `adr`) o se anota en el ADR que la recoge. 🟡 abierta · ✅ cerrada.

## De un vistazo

| Abierta | Bloquea | Quién la cierra |
|---|---|---|
| Preguntas de la maqueta de UX (marca, conservación del chat, perfiles de menores, vincular las gafas con código, grip derecho para hablar) | revisión de `doc/sistema/UX.md` | Antonio, cuando revise la propuesta de UX |

## Cerradas el 2026-10-28 (Antonio, de una en una)

| # | Decisión | Respuesta | Dónde queda |
|---|---|---|---|
| 1 | Licencia | **Todos los derechos reservados** (repo público, sin licencia libre) | README; no se crea `LICENSE` |
| 2 | Cifras reales e id interno en `doc/historico/DISENO-2026-10.md` | **Anonimizar** (quitar el id interno y nombres que no hagan falta; dejar cifras agregadas) | ✅ hecho (bb52d50) |
| 3 | Suelo nuevo frente al anterior | **El nuevo** | ADR-0007 |
| 4 | Qué se publica antes del servidor | **Nada hasta F1a** | PUBLICACION |
| 5 | Ramas | **`main`** | CLAUDE.md §6 |
| 6 | Versión inicial | **0.2.0**; la 1.0.0 cuando F1a esté desplegada y usada | VERSION |
| 7 | Artefacto desechable de la prueba 0 | **Conservarlo** hasta retirar la salida artefacto (F2) | ESTADO |
| 8 | Exportadores multiplataforma | **Sí, ahora** | ✅ hecho (2302e88) |
| 9 | Historia de Hituelo | **Se muestra** | `tuberia/hituelo_conv.py` |
| 10 | Grabar visitas guiadas | **No se graba el directo**; como mucho clips cortos revisados por la oficina antes de publicar | ADR-0009, fase 3 |
| 11 | Arquitectura multiusuario (ADR-0009) | **Aceptada, con 3D Tiles 1.1 + 3DTilesRendererJS para la escena** (en contra de la recomendación del estudio, que proponía conservar las teselas propias) | ADR-0009, PLAN |
| 12 | Qué es una haza y quién la asigna | **Tabla propia** (zona dibujada que abarca una o varias parcelas de OlivarTrack, o un trozo); **la asigna la oficina** | ADR-0009, fase 1a |
| 13 | Qué se ve de una haza ajena | **Sin titular, con alias opcional** del hogar; datos **agronómicos sin kilos** (superficie, olivos con fuente, tratamientos, analíticas, fenología, avance %, NDVI relativo) | ADR-0009, fase 1a |
| 14 | Recuento de olivos y fincas | **LiDAR (medido) + declarado al lado**, cada uno con su fuente; **solo Hituelo** en F1a | ADR-0009, fase 1a |
| 15 | Correo del enlace mágico | **SMTP de OVH** (dominio canoydamas.es) | ADR-0009, fase 1a |
| 16 | Qué se ve sin sesión | **Solo la portada**; mundo, hazas y datos tras sesión | ADR-0009, fase 1a |
| 17 | Token de lectura de OlivarTrack | **Token propio** de solo lectura para el gemelo (cambio pequeño en OlivarTrack) | fase 2 |
| 18 | Cambio visual al subir three | **Aceptar el aspecto nuevo** (color y luz modernos, recalibrado a ojo) | fase 1c |
| 19 | Corresponsal de campo | **La misma web como PWA** (Wake Lock) | fase 4 |
| 20 | Salida artefacto | **Se mantiene hasta la fase 2** y luego se retira | ADR-0010 |
| 21 | **Cuándo desplegar en el VPS** | ahora / cuando haya algo funcional y probado en local | despliegue de F1a en OVH | ✅ 2026-10-29: **nada en el VPS hasta tener algo funcional y probado en local** (entorno `infra/dev` con la api enchufada, el mundo cargando y el recorrido de entrada completo) |
