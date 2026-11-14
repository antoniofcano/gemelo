# Auditoría noviembre 2026: re-verificación de la tarde del 2026-11-14

🗄️ Foto del 2026-11-14 por la tarde, sobre `main` tras las tandas de arreglos de ese día. No se mantiene. Es la continuación de [la de la mañana](REVERIFICACION-2026-11-14.md). Lo vigente es [ACEPTADOS](ACEPTADOS.md) y [doc/rumbo/PLAN.md](../rumbo/PLAN.md).

## Qué pasó entre la mañana y la tarde

- **Encargo:** por la mañana quedaban 40 medios abiertos o a medias y 38 aceptados sin firma. Antonio encargó resolverlos («si no conseguimos un 10, que se acerque»).
- **Tandas de arreglos:** siete, cada arreglo con su prueba. Fueron documentación, datos y rótulos, contratos y seguridad, mundo y cámara, interacción y accesibilidad (con la decisión 239), VR con modelado y rendimiento, y la ronda del banco MU0-5.
- **Re-verificación independiente:** tres revisores distintos de los que arreglaron, de solo lectura, comprobaron contra el código cada hallazgo que por la mañana no estaba resuelto.
- **Remates:** una tanda más cerró lo que esos revisores dejaron a medias.

Los anexos de los revisores son:

- [lentes 1, 2, 5 y 7](reverificacion/tarde-lentes-1-2-5-7.md)
- [lentes 3, 4, 8 y 9](reverificacion/tarde-lentes-3-4-8-9.md)
- [lentes 6 y 10](reverificacion/tarde-lentes-6-10.md)

## Resultado

| | Mañana | Tarde |
|---|---|---|
| Críticos y altos abiertos | 0 | 0 |
| Medios abiertos o a medias | 40 | 0 |
| Bajos abiertos | 22 más 38 «aceptados» sin firma | 3 |
| Aceptados por escrito y firmados (por encargo de Antonio) | 0 | 14, de ellos 3 medios |
| Resueltos, ya no aplican o decididos | 44 | 139 |

**Los 3 bajos que siguen abiertos:**

- **L1-12** (horneado de los lejanos fuera de la Cola): no se pudo medir en Chrome sin pantalla, porque la capa no llegó a hornearse en 8 minutos. Pide un aparato real.
- **L1-09** (reclasificación de olivos con la cámara quieta): medido por debajo del tope supuesto (máximo 3,7 ms, y 0 subidas con la cámara quieta), pero con el fixture pequeño. Queda a falta de medirlo con Hituelo real.
- **L10-24** (el bloque «No publicado» del CHANGELOG): ya explica qué quiere decir, pero solo se cierra sacando una versión.

**Aceptados y firmados (14).** El motivo de cada uno está en [ACEPTADOS](ACEPTADOS.md):

- L9-05;
- L5-03, L5-05, L5-06, L5-08 (b), L5-09, L5-10 y L5-11;
- L7-08 y L7-11;
- L8-07, L8-10 y L8-11;
- L3-02 y L3-23.

De ellos, L5-03, L3-02 y L8-07 son medios.

## Lo que esta foto no puede afirmar

- **Los remates y la ronda del banco** se fusionaron después de pasar los revisores. Tienen sus pruebas en verde, pero no una segunda mirada independiente. Son L9-06 (la parte de reinicios), L9-08 (gitleaks en CI), L3-22, L6-03 (el resto), L1-06, L1-07 y L2-06.
- **L9-06** queda resuelto con matiz. Un expulsado que vuelve con un token anterior sale en 20 s como mucho, no al instante: cerrarlo del todo pide un webhook de LiveKit (MU3-2). No está probado contra LiveKit real.
- **El paso de gitleaks de la CI** no se ha ejecutado nunca: se estrena en el primer push.
- **La puerta pesada** (Docker, PostGIS, LiveKit) no se ha pasado sobre el árbol final. Las pruebas de integración nuevas de la api están escritas y sin ejecutar.
- **Nada de lo de hoy se ha visto en iPhone ni en Quest.** Los cambios de interacción y de VR están probados con dobles y, en parte, en Chrome sin pantalla.
- **Lo que la auditoría original no revisó sigue sin revisar:** la mayor parte de `apps/api`, el constructor de olivos y `prototipos/`.

## Veredicto

No hay ningún crítico, alto ni medio abierto, y los bajos están arreglados o aceptados por escrito salvo tres. Por la definición de la skill aún no es un «10 de software». Faltan:

1. pasar la puerta pesada sobre este árbol;
2. sacar la versión que cierre L10-24;
3. medir L1-09 y L1-12 en un aparato o aceptarlos;
4. revisar lo que la auditoría original dejó fuera.

El «10 de producto» lo da el uso real en iPhone, Quest y el campo.
