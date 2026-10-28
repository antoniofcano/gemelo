# ADR-0005 — WebXR con perfil de rendimiento propio

- **Estado:** Aceptado (**sin probar en casco real**)
- **Fecha:** 2026-10-28

## Contexto
El gemelo debe verse en Meta Quest, donde el presupuesto es mucho menor y el fotograma debe sostenerse (≈15 ms). three r128 no puede desplazar el espacio de referencia de la sesión.

## Decisión
`29_vr.js` implementa WebXR con un `Group` («rig») que se mueve, y cuatro perfiles (`VR_PERFILES`: fracción de árboles `n`, radio `r`, tope de triángulos, hierba). El nivel baja si el JS pasa de 13 ms o el fotograma de 15,2 ms, y sube tras 25 s con JS <7 ms. Mandos: palanca izquierda andar, derecha giro por saltos de 30°, gatillo teletransporte, A vuelo, B mirador, Y panel, grip correr.

## Alternativas consideradas
- **Mismo presupuesto que en pantalla** — no cabe en un casco móvil.
- **Actualizar three** — rompe el motor (r128 fijo por el montaje y por cdnjs).

## Consecuencias
- **Positivas:** degradación adaptativa sin intervención.
- **Negativas / coste:** el control adaptativo puede oscilar; el panel y los mandos no tienen validación de comodidad.
- **Pendiente:** fps, mareo y comodidad del panel; el mock no sustituye al casco.

## Comprobación
`vr_mock.js` con sesión simulada (`window.__vrDebug`). **fps, mareo y comodidad: no probados.**
