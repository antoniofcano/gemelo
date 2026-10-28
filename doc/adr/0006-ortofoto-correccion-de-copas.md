# ADR-0006 — Ortofoto con corrección del desplazamiento de copas

- **Estado:** Aceptado
- **Fecha:** 2026-10-28

## Contexto
La ortofoto PNOA 2022 muestra las copas ~1,1–1,4 m al este de su posición real (efecto de la altura). El LiDAR está bien georreferenciado y las marcas de OlivarTrack se hicieron sobre la ortofoto.

## Decisión
El motor muestrea la ortofoto en `x + desp(h)`, `y + kcor·0,2·min(h/2,1)` con `desp(h) = kcor·(1,2·min(h,1) + 0,42·max(h−1,0))` (`colorEn`, `02_mundo.js`). `kcor` es ajustable con un deslizador (`#corr`). Es **un ajuste medido en Cerro Velasco, no una ortorrectificación**; la nota de la página lo dice.

## Alternativas consideradas
- **Ortorrectificar con el MDS** — requiere el modelo de cámara del vuelo; no disponible.
- **No corregir** — el color de cada copa saldría de su sombra o del suelo vecino.

## Consecuencias
- **Positivas:** copas y nube coloreadas con su propio color.
- **Negativas / coste:** el desfase puede variar entre fincas (fecha del vuelo, ángulo solar); se rotula como ajuste.
- **Implicaciones futuras:** si se mide en Hituelo, `kcor` por finca (`desfase_txt` en los textos).

## Comprobación
Medido en Cerro; **no revalidado en Hituelo**.
