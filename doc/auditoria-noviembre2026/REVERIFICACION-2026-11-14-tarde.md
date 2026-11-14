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

## Lo que vino después, el mismo día

- **Segunda mirada a los remates y a la ronda del banco** ([anexo](reverificacion/tarde-remates-banco.md)), por un revisor distinto. Dio todo por bien cerrado salvo un medio y seis bajos, y se arreglaron:
  - **H-1 (medio):** los topes de los olivos generados y de la escalera pasaban de 2× lo medido. Ahora llevan su medida de la puerta pesada y la misma regla, o su cálculo con motivo.
  - **H-3:** la marca de expulsión se escribe antes de llamar a LiveKit.
  - **H-4:** el tope de memoria de GPU ya no se salta en silencio.
  - **H-5:** «hace N» no afirma nada de un dato fechado más de 5 min en el futuro.
  - **H-7:** la fila del goteo de VR del PLAN está cerrada.
  - **Quedan dichos, sin arreglar:** H-2 (el umbral del goteo de VR no vería un goteo de menos de 0,4 recursos por sesión) y H-6 (gitleaks en la CI aún no se ha ejecutado).
- **Auditoría de la api** ([anexo](reverificacion/ampliacion-api.md)). Era lo principal que la auditoría de noviembre dejó sin revisar. Resultado: **0 críticos, 0 altos, 4 medios y 8 bajos, los 12 arreglados** con su prueba (A-01 a A-12):
  - lo de la cuenta, solo con sesión de titular;
  - guardas de oficina frente a admin;
  - no asignar hazas a cuentas de baja;
  - defensa en profundidad.
  - Tampoco ella lo vio todo: su apartado «No revisado» lista lo que falta (las lecturas de OlivarTrack y Vigía en detalle, la lógica de corros y voz, las migraciones una a una y `npm audit`).
- **Puerta pesada:** la tanda de Chrome pasó en verde sobre el árbol de antes de los arreglos de la api (1.560 pruebas). La rápida pasó sobre el árbol final (1.502). La tanda de Docker se apunta en [ESTADO](../ESTADO.md) cuando termine.

## Lo que esta foto no puede afirmar

- **Los arreglos de la api (A-01 a A-12) y los de la segunda mirada** tienen sus pruebas en verde, pero no una revisión independiente posterior.
- **L9-06** queda resuelto con matiz. Un expulsado que vuelve con un token anterior sale en 20 s como mucho, no al instante: cerrarlo del todo pide un webhook de LiveKit (MU3-2). No está probado contra LiveKit real.
- **El paso de gitleaks de la CI** no se ha ejecutado en GitHub (la cuenta tiene las Actions bloqueadas por facturación). La misma versión, con su suma comprobada y la configuración del repo, pasó en local el 2026-11-15 por todo el historial (1.491 commits): sin fugas.
- **La puerta pesada** pasó en verde el 2026-11-15, tras arreglar cinco rojos (tres eran fallos reales de la api: la palabra que no vencía, el centinela que se adelantaba a la ruta de expulsar, y un fallo del cliente al salir de un corro). Subido a GitHub y al VPS (subida 24).
- **Nada de lo de hoy se ha visto en iPhone ni en Quest.** Los cambios de interacción y de VR están probados con dobles y, en parte, en Chrome sin pantalla.
- **Sigue sin revisar:** el constructor de olivos (`apps/web/olivo/`), `prototipos/` y lo que la auditoría de la api lista como no revisado.

## Veredicto

No hay ningún crítico, alto ni medio abierto, y los bajos están arreglados o aceptados por escrito salvo tres. Por la definición de la skill aún no es un «10 de software». Faltan:

1. sacar la versión que cierre L10-24;
2. medir L1-09 y L1-12 en un aparato o aceptarlos;
3. revisar lo que queda fuera (constructor de olivos y el resto de la api).

El «10 de producto» lo da el uso real en iPhone, Quest y el campo.
