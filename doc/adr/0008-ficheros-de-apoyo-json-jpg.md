# ADR-0008 — Ficheros de apoyo en json y jpg, sin binario crudo

- **Estado:** Aceptado (carga en el marco **con sesión** sin confirmar)
- **Fecha:** 2026-10-28

## Contexto
Hituelo (≈52 MB de teselas) no cabe en una página de 16 MB. La plataforma de artefactos admite ficheros de apoyo (`files`) pero «solo tipos web estándar». Al publicar la prueba 0 se comprobó que **un `.bin` no se admite**.

## Decisión
Cada tesela se sirve como `t/<kx>_<ky>.json` (relieve, copa, suelo y nube en base64) y `t/<kx>_<ky>.jpg` (ortofoto 512², 0,5 m/px). Sin binario crudo. Los límites (64 MB y 255 ficheros por publicación; 511 ficheros y 256 MB por versión) se cumplen con 2 ficheros por tesela: Hituelo son ≈52 MB de teselas + ≈4,6 MB de página = ≈57 MB en 93 ficheros, **una sola publicación con solo ≈7 MB de margen** (si crece, hay que partirla en dos tandas a la misma `url`).

## Alternativas consideradas
- **PNG RGB con alfa 255 como contenedor** — evita el +33 % del base64 pero exige decodificación sin conversión de color; descartado de momento.
- **Capacidad `assets`** — ata la subida a una sesión de editor.
- **Una página por zona** — plan B si `fetch` del mismo origen falla.

## Consecuencias
- **Positivas:** formato admitido hoy; legible y depurable.
- **Negativas / coste:** +33 % de tamaño; hay que decodificar base64.
- **Riesgo:** la prueba 0 quedó «a medias»: falta confirmar con navegador autenticado que `fetch` e `<img>` del mismo origen funcionan.

## Comprobación
Con servidor local, 0 errores de consola. **En el marco de artefactos: no comprobado.** Ver [RUNBOOK](../operacion/RUNBOOK.md) para el plan B.
