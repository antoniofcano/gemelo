# ADR-0007 — Suelo abierto heredado de la ortofoto

- **Estado:** Aceptado
- **Fecha:** 2026-10-28

## Contexto
El color de suelo que viaja con la tesela está a 2 m y suavizado: pierde rodadas, caminos y tono. La ortofoto a 0,5 m/px los conserva, pero también tiene copas y sombras que no deben pintarse en el suelo.

## Decisión
El sombreador del terreno compara la ortofoto nítida con dos referencias (ella misma a ~2 m y el color ancho del suelo abierto, sin copas). `abierto` se activa solo donde el suelo está despejado y se aplican `rodada`, `tono` y `camino`; lo mucho más oscuro se trata como copa o sombra y se deja igual. El exportador infiere el suelo quitando las copas (máscara `ch2 > 0,4` dilatada, relleno por vecino más próximo, nivelado de luminancia).

## Alternativas consideradas
- **Mantener solo el color a 2 m** — suelo plano y borroso de cerca.
- **Ortofoto a 0,25 m en teselas con caminos** — +~2 MB; aparcada (M5) porque las rodadas a 0,5 m salen suaves.

## Consecuencias
- **Positivas:** suelo cercano creíble sin más datos.
- **Negativas / coste:** más trabajo de sombreador; riesgo de pintar sombras como suelo.

## Enmienda 2026-10-28
Antonio decide quedarse con el suelo nuevo, más realista, que **sustituye** al anterior. Se integra en `src/` (`04_terreno.js` con relieve por bump, camino y rodada reforzados; `21_suelo.js` con hierba de cartulinas cruzadas y atlas de briznas/flores/espigas), conservando el radio de hierba del perfil VR.

## Comprobación
Comparación visual a ojo. **No hay medida objetiva ni prueba en dispositivo.**
