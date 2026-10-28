# ADR-0003 — Calidad Base y Alta con el mismo motor

- **Estado:** Aceptado
- **Fecha:** 2026-10-28 (decidido en el diseño del 27-oct)

## Contexto
Mientras no había LiDAR de 3.ª cobertura para Hituelo, solo se disponía de servicios abiertos (MDT 5 m, nDSM 2,5 m). Un gemelo útil debía poder montarse con ellos y mejorarse después sin cambiar de motor.

## Decisión
Dos calidades. **Base**: MDT 5 m + nDSM 2,5 m + ortofoto + NDVI + detector de olivos; copa generada; sin nube; un solo HTML de ≈7 MB; rotulada «Gemelo aproximado». **Alta**: LiDAR 3.ª cobertura, copa medida (8 radios), nube y teselas como ficheros de apoyo. El motor es el mismo: una tesela sin `pts` ni `r8` genera por procedimiento lo que la otra lee.

## Alternativas consideradas
- **Solo Alta** — bloquea hasta tener las hojas LiDAR.
- **Dos motores** — duplica mantenimiento.

## Consecuencias
- **Positivas:** se puede entregar valor sin los datos pesados; Hituelo y Cerro usan Alta.
- **Negativas / coste:** la rama «sin `pts`/`r8`» hay que mantenerla viva y probada; en Base el relieve a 1 m es un remuestreo suave, no relieve real.

## Comprobación
Hituelo en Alta (los datos ya eran LiDAR). **La rama Base no se ha vuelto a ejercitar desde el paso 7**; el fixture debe cubrir una tesela sin `pts` (ver CONTRATOS).
