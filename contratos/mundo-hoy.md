# Contrato del mundo de hoy (`GET /api/mundo/hoy`, versión 1)

EV-3a «El mundo de hoy» (idea D de [EV-3](../doc/rumbo/EV-3-QUE-LA-GENTE-VUELVA.md)): una respuesta pequeña con lo que hace falta para que el mundo arranque **en el día real** y diga qué pasa hoy en el campo. Esquema: [`mundo-hoy.schema.json`](mundo-hoy.schema.json) (lista blanca, `additionalProperties: false`). Ejemplo **sintético**: [`mundo-hoy-ejemplo.json`](mundo-hoy-ejemplo.json). Ruta en [`api.openapi.yaml`](api.openapi.yaml). Código: `apps/api/src/mundo/` (`hoy.ts`, `rutas.ts`, `registro.ts`); motor: `apps/web/motor/53_mundo_hoy.js`.

## De dónde sale (no lee nada nuevo de fuera: regla 12)

| Parte | Sale de | Procedencia | Memoria |
|---|---|---|---|
| `ahora` | el reloj del servidor, en `Europe/Madrid`; `estacionDelAnio`, del calendario (equinoccios y solsticios fijos) | reloj · deducido | — |
| `tiempo.actual` | `ServicioTiempo` (Vigía `tiempo_en_la_explotacion`, [`tiempo.md`](tiempo.md)) | medido | la del tiempo (10 min) |
| `tiempo.previsionCorta` | idem (`prevision_72_horas`), resumida por días de Madrid: hoy, mañana y pasado (máxima, mínima, lluvia sumada, probabilidad máxima) | modelado | la del tiempo (1 h) |
| `fenologia` | lo que guardó la sincronía en `eventos_haza` (tipo `fenologia`, de `novedades`: [`olivartrack-sync.md`](olivartrack-sync.md)): la última anotación de cada parcela en 60 días, y el estado de la última sincronía | medido | `GEMELO_OT_CADA_MIN` (mín. 5 min) |
| `trabajoSemana` | `ServicioHoy` (`tareas_abiertas` y `trabajo_realizado`, [`ot-hoy.md`](ot-hoy.md)): las tareas **en curso** y las **terminadas en los últimos 7 días**, contadas por tipo, por parcela y por finca | medido | la de lo de hoy (10 y 30 min) |
| `miradas` | `ServicioHoy` (Vigía `estado_del_olivar_hoy`): solo el nombre de la parcela (según Vigía) y la gravedad | deducido | la de lo de hoy (1 h) |
| `avisos` | los redacta **el gemelo** a partir de lo anterior, con frases fijas | deducido (sobre medido o modelado: `basadoEn`) | — |

Con `GEMELO_OT=no` no se llama a OlivarTrack ni se lee la fenología de la base; con `GEMELO_VIGIA=no`, ni el tiempo ni las miradas. **No hay variables nuevas para la ruta**: usa los mismos lectores, tokens y memorias que `/api/tiempo` y `/api/ot/hoy`.

## Reglas

1. **Siempre 200** (tras sesión; 401 sin ella). Apagada o sin respuesta, la parte va en `null` y su fuente dice `disponible: false` con `motivo: "apagada"` o `"sin_respuesta"`. Nunca 503 ni 404: el motor no debe ver errores en la consola (tanda 9). `cache-control: private, max-age=60`.
2. **Nada por persona.** El trabajo va **contado por tipo** (`recoleccion: 2`), por parcela y por finca. No pasan títulos de tarea, ni quién, ni horas, ni partes. De Vigía no pasan el motivo ni «cómo se lee» (los sirve `/api/ot/hoy` a la historia, con su contexto).
3. **Truncado o parcial no es completo.** Si `tareas_abiertas` o `trabajo_realizado` vienen truncados, `trabajoSemana.completo` es `false` y los recuentos de esa parte van a **`null`** (también `porFinca` y `sinParcela`): no se sacan totales. El aviso de recogida no cuenta parcelas y lo dice. Si la última sincronía de `novedades` no fue `ok`, `fenologia.completo` es `false` y hay nota.
4. **Los textos son datos.** Pasan recortados y sin caracteres de control: el nombre de la finca (80), el nombre de parcela según Vigía (80) y las notas de las lecturas (400). El motor los pinta con `textContent`. **La frase de un aviso nunca lleva texto de fuera**: solo cifras y palabras del gemelo; las parcelas van aparte, en `parcelas`.
5. **Vigía no autoriza tratamientos.** No pasan ventanas de tratamiento, `dentroDeUmbrales`, `impedimento` ni delta T. Lo que marca Vigía se dice con la frase fija `NO_AUTORIZA` («Sirve para decidir dónde mirar: no es un diagnóstico ni una recomendación de tratamiento, y ninguna capa está calibrada con observación de campo»), que es la única mención a tratamientos que puede llevar un aviso, y es para negarla. Ningún aviso dice «tratar», «aplicar», «fumigar»… (lo vigila `mundo_hoy.test.ts`).
6. **De cuándo es.** Cada parte lleva `leidoEn` (cuándo la leyó la api) y `consultadoEn` (lo que dice la fuente); `viejo` si es lo último que llegó tras un fallo o el tope; `notas` repite los avisos de antigüedad y de maqueta de las lecturas.

## Avisos del campo

| `tipo` | Cuándo | Frase (fija) | `de` · `basadoEn` | `parcelas` |
|---|---|---|---|---|
| `recogida` | hay tareas **activas** de recogida (tipo que empieza por `recoleccion` o `recolección`, `recogida`, `vareo` o `cosecha` **[SUPUESTO: ningún tipo de recogida se ha visto aún en una respuesta real]**) | «Hoy hay recogida en curso en N parcelas.» | olivartrack · medido | ids de OlivarTrack |
| `helada` | mañana (día de Madrid) la mínima prevista es ≤ 0 °C | «Previsión de helada para mañana: mínima de X °C. Es una previsión (modelado) y puede cambiar.» | vigia · modelado | — |
| `lluvia` | mañana la lluvia prevista suma ≥ 1 mm o la probabilidad llega al 60 % | «Previsión de lluvia para mañana: unos X mm (probabilidad de hasta el P %). Es una previsión (modelado) y puede cambiar.» | vigia · modelado | — |
| `fenologia` | hay fenología anotada en los últimos 7 días | «Esta semana se ha anotado la fenología de N parcelas: etapa (BBCH a–b).» | olivartrack · medido | ids |
| `mirada` | Vigía marca parcelas hoy | «Vigía marca N parcelas para mirar hoy. » + `NO_AUTORIZA` | vigia · medido | nombres según Vigía |

`clave` = tipo y día (`lluvia-2026-11-06`): la misma cada vez que se repite el aviso. Los umbrales (1 mm, 60 %, 0 °C, 7 días) son **[PROPUESTA]** del gemelo, no de Vigía.

## Avisos por correo (fuente automática, APAGADA por defecto)

`apps/api/src/avisos/campo.ts` (`FuenteAvisosCampo`): con `GEMELO_AVISOS_CAMPO=si`, cada hora mira este mismo servicio (no llama a nadie más) y, si toca, deja **un** aviso en `avisos` (tipo `labor`, sin autor, caduca a los 3 días) para los hogares a los que va; el correo lo manda el repartidor de siempre ([`avisos-correo.md`](avisos-correo.md): solo a los hogares con `avisos_correo`, reintentos, baja con un clic). No manda nada por sí misma.

- **Frecuencia máxima**: un aviso automático cada `GEMELO_AVISOS_CAMPO_MIN_HORAS` (por defecto **168 h, uno por semana**; de 24 a 2160) para todos; y solo de 9:00 a 21:00 de Madrid. Lo que no sale espera al resumen semanal (EV-3b).
- **Qué tipos**: `GEMELO_AVISOS_CAMPO_TIPOS`, en orden de prioridad (por defecto `recogida,helada,lluvia,fenologia`; `mirada` solo si se pone: lo que marca Vigía es para quien lleva el olivar).
- **A quién**: los de OlivarTrack con parcelas, a los hogares con una haza en esas parcelas (`haza_parcela`); los del tiempo, a todos los hogares activos con haza. Sin destinatarios no se crea el aviso.
- **Qué dice**: el título fijo del tipo («Hoy se recoge en el olivar», «Mañana puede helar en el olivar»…), la frase del aviso y de dónde y de cuándo es el dato. Nunca un texto de fuera ni un nombre de persona. Auditoría `avisos.campo` con el tipo y el número de hogares.
- En la campana del mundo no se ven (`GET /api/avisos` solo lista los de eventos); en el mundo se ven por esta ruta.

## En el motor

`53_mundo_hoy.js` (componente `mundo-hoy`, bandera `?mundohoy=0`): con servidor (`D.base` `/teselas/…` o `?api=`) pide `/api/mundo/hoy` del mismo origen al montar y cada 10 minutos; sin servidor no pide nada. Pinta en «Tiempo y estación → Ahora» la ficha «Hoy en el campo»: el día y la hora de Madrid, los avisos del campo con su pastilla (`deducido`) y de cuándo son, el tiempo de mañana (`modelado`), la fenología registrada y el trabajo de la semana (`medido`), y qué fuente falta. Todo por `textContent`. El reloj del mundo ya arranca en la hora real (`15_tiempo.js`, salvo `?hora=`), y la estación del olivo en el **día de hoy** (`23_estacion.js`, salvo `?fecha=AAAA-MM-DD` o mover la fecha del campo).

## Lo que NO se sabe

- Las formas de OlivarTrack y Vigía (las de [`ot-hoy.md`](ot-hoy.md) y [`tiempo.md`](tiempo.md)) se **comprobaron en solo lectura el 2026-11-05**, por el conector y no desde la api: el cliente MCP de la api, con el token del gemelo, sigue sin llamar a los servicios reales.
- Los nombres de tipo de recogida (`RECOGIDA` en `mundo/hoy.ts`, con y sin tilde) son un **[SUPUESTO]**: los tipos vistos el 2026-11-05 son riego, preparación_de_suelos, tratamiento, varetas y otros.
- Hituelo: igual que en `ot-hoy.md`, lo que no trae parcela se cuenta en `sinParcela`.

## «Hoy en el olivar» en el tablón de La Linde (EV-3c)

Sin pedir nada más: tras cada lectura buena, `53_mundo_hoy.js` emite el evento `mundo:hoy` (`contratos/eventos.json`) con `{ linea }`, y `44b_carteles.js` la pinta en el tablón de la entrada, con su procedencia («OlivarTrack · leído hace 2 h»). La línea es el trabajo de la semana **agregado por tipo** (`trabajoSemana.porParcela`, sumando en curso y terminadas; nunca por persona ni por parcela) o, si no hay, el titular fijo del primer aviso del campo (recogida, helada, lluvia, fenología; `mirada` no sale: es para quien lleva el olivar). `linea` es `null`, y el tablón no la pinta, si `completo` es `false`, si el trabajo viene truncado y no hay aviso, o si la fuente está apagada o sin sesión. En el lienzo de 512 × 320 solo caben dos pares dato + procedencia: hazas y olivos, hoy, época; la época cede ante un dato de hoy.
