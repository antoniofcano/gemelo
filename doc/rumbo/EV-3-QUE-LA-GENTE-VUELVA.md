# EV-3 · Estudio de viabilidad: que la gente vuelva

> **Estudio, no implementa nada** (2026-11-05). Documento vivo de rumbo: se actualiza cuando una de sus ideas pasa a ser tarea. Lo que dice del repo se comprobó leyendo `apps/web/motor/`, `apps/api/` y `doc/`; lo que dice de la web lleva su fuente al final o va marcado **[NO VERIFICADO]**. Nada de esto está probado en iPhone ni en Quest.

## 1. El problema

El gemelo tiene un olivar real, 40 hogares («hazas») y una campaña anual, pero hoy cada visita empieza de cero: la presencia solo existe mientras estás conectado (la pose viaja por LiveKit y no se guarda: [presencia.md](../../contratos/presencia.md)), el mundo no recuerda que estuviste y nada te avisa de que ha pasado algo. Un mundo persistente retiene por cuatro razones típicas: **huella** (lo que hice sigue ahí), **vida ajena** (otros pasaron), **novedad con fecha** (algo cambió fuera de mí) y **ritual** (una vez por temporada). Aquí la cuarta es la mejor baza: el olivar *ya* tiene calendario real (floración, tratamientos, vendimia, primer aceite) y es verdad, no un reclamo.

Reglas del producto que acotan todo lo de abajo: solo cuentas adultas (decisión 45, sin perfiles de menor); alias opcional sin titular (decisión 13); sin grabar el directo (decisión 10); plazos de datos de familia «la campaña y un año más» (decisión 100); EIPD única con F3 (decisión 41), en borrador ([EIPD-VOZ](../sistema/EIPD-VOZ.md), [EIPD-CAMPO](../sistema/EIPD-CAMPO.md)); el motor no hace `fetch` a otros hosts; cada pieza distingue medido, deducido e ilustrativo.

**Qué hay que reusar (regla 12).** Lo que ya existe y sostiene casi todas las ideas:

| Pieza | Dónde | Sirve para |
|---|---|---|
| Avisos por hogar con campana y correo (`avisos`, `avisos_hogar`, repartidor con reintento, baja con un clic, `.ics`) | `apps/api/src/avisos/`, `apps/api/src/yo/avisos.ts`, migraciones 0004, 0016, 0020; `49_avisos_correo.js` | Todo aviso fuera del mundo (B) |
| Diario de la haza (`diario_haza`: labor, nota, foto, hito) | migración 0004, [VIDA](../sistema/VIDA.md); solo tablas, sin pantalla | «Qué pasó en tu haza» (B, D) |
| Personalización de olivos (nombre, foto o pintura, denuncia, retirada, sin EXIF) y decoraciones | `42_personalizacion.js`, `50_decoraciones.js`, `apps/api/src/vida/` | La nota duradera (A) |
| Presencia en tiempo real (pose 10 Hz, avatares VRM y muñecos) | `26_presencia.js`, `38_presencia_compartida.js`, `26b_avatares.js`, `37_red.js` | Los ecos serían «presencia grabada» (A) |
| Huellas de suelo efímeras (pisadas y polvo) | `22_huellas.js`, `22b_huellas_polvo.js` | Solo el aspecto; hoy no se comparten ni se guardan |
| Agenda, eventos, plazas y visitas guiadas | `43_agenda.js`, `apps/api/src/agenda/`, `46_guiada.js` | El «por qué volver» con fecha (B, D) |
| Estación y fecha simulada, tiempo de Vigía, historia con OlivarTrack | `23_estacion.js`, `15_tiempo.js`, `apps/api/src/vigia/`, `14_historia.js`, `apps/api/src/vivo/` | El mundo cambia con el año real (D) |
| Voz con nivel por hablante (`voz:habla {identidad, nivel}`) y VRM con `expressionManager` (`blink`, `aa`) | `45_voz.js`, `26b_avatares.js` (línea del parpadeo), [AVATARES-FAMILIA](../sistema/AVATARES-FAMILIA.md) | Boca por energía del micro (E) |
| Vinculación de gafas con código corto, mini-tutorial de primera llegada, `Llegada` | ADR-0028, [UX](../sistema/UX.md) §4.4 y §5.8, `12b_llegada.js` | Primera vez con gafas (C) |
| PWA con manifiesto e iconos; **sin service worker** (AG-1.7 pendiente) | `apps/web/public/manifest.webmanifest`, `apps/web/plantilla.html` | Base del web push (B) y de la caché |
| Récord de la familia en la api, «Cae la cosecha» | `41_cae_la_cosecha.js`, `apps/api/src/juegos/` | Ritual ligero (D) |
| Retención por campaña | `apps/api/src/vida/retencion.ts` | Plazo de todo lo nuevo (A, B) |

## 2. Las ideas

Escala de coste: **ligera** (un agente, un módulo, sin servicio nuevo), **media** (módulo + api + migración + pruebas), **pesada** (arquitectura nueva o muchas pruebas en aparato). Cada ficha dice qué es *medido, deducido o ilustrativo* (regla 5).

### A. Presencia asíncrona: huellas, notas y ecos

**Qué es.** Tres escalones, de menos a más sensibles:

- **A1 · Nota en un olivo o en un sitio.** Una frase corta o un gesto de una lista cerrada que queda junto a un olivo y es visible para otras familias. Es, en lo esencial, lo que ya hace `personalizaciones.nombre` con otro campo y otra caducidad.
- **A2 · Huella de visita.** Un rastro difuso y anónimo («por aquí se ha paseado esta semana»): un mapa de calor de celdas de 8-16 m que se desvanece en días, sin identidad ni orden temporal fino. No son las pisadas de `22_huellas` (efímeras, solo propias): es un agregado.
- **A3 · Eco.** Un fantasma tenue de otra visita pasada que camina una ruta: una trayectoria muestreada (p. ej. un punto cada 2 s) reproducida con el muñeco de `38_presencia_compartida`.

**Por qué haría volver.** El mundo deja de estar vacío cuando entras solo; saber que alguien pasó o dejó un mensaje es la forma más barata de vida social con 40 hogares que no coinciden en el tiempo (la hora común es la visita guiada). La nota, además, se contesta: da una razón para volver mañana.

**Reusa.** Almacén y moderación: `apps/api/src/vida/rutas.ts`, `denuncias`, `bandeja`, retirada en un clic, `medios` sin EXIF. Pantalla: `42_personalizacion.js` y `Laminas`/`Entidades` (`02d_laminas.js`, `02e_entidades.js`) para anclar la nota al olivo por `copas_id`. El eco: `PoseCodec` y `BufferPose` de `26_presencia.js` y el instanciado de `38`. El borrado: `retencion.ts`.

**Coste.** A1 **ligera-media · sonnet** (tabla `notas`, ruta, lámina). A2 **media · sonnet** (agregado en el servidor, capa en el suelo; calcula la api, no el cliente). A3 **media-pesada · opus** (una trayectoria guardada es un dato personal de ubicación; más un presupuesto de dibujo nuevo junto al de `?xrgente`).

**Privacidad.** Es la parte con más riesgo del documento.
- A1: texto libre de un adulto visible a toda la comunidad es contenido de usuario; el riesgo ya está asumido para nombres de olivos (decisión 93: sin revisión previa, con denuncia y retirada en un clic). **Gestos y frases de una lista cerrada** (como `decoraciones`) lo eliminan casi del todo; con texto libre, aviso previo «no escribas nombres de personas ni de menores».
- A2: bajo si es un agregado con un mínimo de k visitantes distintos por celda (k ≥ 3, **[SUPUESTO: cifra propia sin contrastar]**) y sin identidad; con 40 hogares k ≥ 3 puede dejar casi todo en blanco: hay que medir con visitas reales antes de prometerlo.
- A3: una trayectoria con alias es un dato de comportamiento de una persona identificable (RGPD art. 4 **[SUPUESTO: de memoria]**) y permite reconstruir rutinas; entra de lleno en la EIPD. Mitigaciones: solo con **consentimiento explícito y revocable por visita** («dejar mi paseo como eco»), muñeco anónimo (sin alias ni VRM propio), recortada (sin los primeros ni los últimos 30 s), caducidad corta (7-14 días, propuesta), borrado al borrar la cuenta. **Menores:** no hay cuentas de menor (45), pero un menor puede ir con el adulto; el eco muestra solo una posición, nunca voz ni cara; va a la lista de la asesoría.
- Ninguna de las tres debe incluir a trabajadores: los corresponsales se excluyen de los ecos y del mapa de calor.

**Medido / deducido / ilustrativo.** La posición del eco es la que reportó el aparato (precisión limitada por el suelo y el aparato); el mapa de calor es **deducido**; el muñeco es **ilustrativo** y se rotula «paseo de otra visita, anónimo». La nota es un testimonio, no un dato de la finca.

**No probado.** Todo. Hay que medir cuántos hogares coinciden en un mismo mes (si son pocos, A2 y A3 nacen vacíos) y el coste de dibujo de 5-10 ecos a la vez (Q0c-c midió la gente en VR por nivel en el banco; en el Quest, sin probar).

**Librerías.** Ninguna hace falta. Para trayectorias, PostGIS ya está en el servidor y simplifica líneas (`ST_SimplifyPreserveTopology`).

**Viabilidad:** A1 **alta**; A2 **media** (depende de la masa de visitas); A3 **media-baja** por privacidad, no por técnica.

---

### B. Avisos del campo: web push o correo

**Qué es.** «Hoy empieza la floración en tu haza», «han tratado la parcela de al lado», «mañana hay visita guiada, quedan 3 plazas», «ya hay primer aceite de tu lote». Origen: OlivarTrack por la api (V11, `apps/api/src/vivo/`, `contratos/ot-hoy.md`), Vigía (`apps/api/src/vigia/`) y la agenda de la oficina.

**Por qué haría volver.** Es el único mecanismo que trae a quien no está pensando en el gemelo, y el de más retorno por coste. «Ocurre ahora en el olivar» es lo más valioso que tiene el producto.

**Reusa.** Casi todo: `avisos`/`avisos_hogar` con el repartidor de `apps/api/src/avisos/correo.ts` (reintentos 1-3-9-27 min, desiste, baja con `List-Unsubscribe`, auditoría solo con recuentos) y el interruptor de `49_avisos_correo.js`. Un **canal más** (push) cuelga del mismo repartidor: el aviso ya existe, solo cambia la salida. La campana del mundo ya lee `avisos_hogar`.

**Alternativas, ordenadas.**
1. **Correo (hecho el canal).** Funciona en cualquier aparato. Falta la **fuente automática** (hoy solo avisa lo que manda la oficina o la agenda) y la **cuenta de correo de OVH** para mandar de verdad (en espera de Antonio; solo Mailpit en local).
2. **Resumen semanal por correo** («qué pasó esta semana en tu haza y en la finca»): agrupa avisos, evita fatiga y es un ritual. Mismo repartidor, otra plantilla.
3. **Web push.** Necesita service worker (no hay), claves VAPID, suscripción por aparato en la api y una librería de envío. Verificado en el registro de npm: `web-push` 3.6.7, licencia **MPL-2.0**, repositorio `web-push-libs/web-push` (última publicación hacia enero de 2024: estable, poco activa; la MPL-2.0 obliga a compartir cambios de *sus* ficheros, no del resto). En iPhone solo funciona con la web **instalada en la pantalla de inicio**, pidiendo el permiso con un gesto del usuario, desde iOS 16.4 ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados)); en Android con Chrome, con la web abierta o instalada **[el detalle por versión, NO VERIFICADO]**. **Quest:** no se ha encontrado documentación, se considera **no disponible hasta probarlo [NO VERIFICADO]**; además no es donde se espera un aviso (las gafas se ponen a propósito).

**Recomendación.** Primero **la fuente automática y el resumen** por correo; push después, solo si la apertura del correo lo justifica, y con **un solo service worker** que sirva también a la caché de teselas (AG-1.7). Para generarlo, `workbox-build` 7.4.1, **MIT** (registro de npm) o uno mínimo a mano.

**Coste.** Fuente automática + resumen: **media · sonnet**. Web push completo: **media-pesada · sonnet** (suscripciones, VAPID, caducidad, borrado, pruebas con Chrome; iPhone, 👤).

**Privacidad.** El aviso es información de la finca para el hogar al que va: riesgo bajo. Tres cuidados: (1) un aviso **nunca nombra a personas** de la cuadrilla (regla de OlivarTrack: nada por persona); (2) el contenido de un push pasa por los servidores del fabricante del navegador: **cuerpo corto y genérico** («Hay novedades en tu haza»), sin datos de la explotación en el texto; (3) la suscripción push (endpoint) identifica un aparato: se guarda por hogar, se borra con la cuenta y se purga si el servicio responde 404 o 410. Un aviso de servicio que el hogar activa en un interruptor propio (ya existe) no es comunicación comercial, pero lo confirma la asesoría **[SUPUESTO: LSSI, no verificado]**.

**Medido / deducido / ilustrativo.** Un tratamiento registrado en OlivarTrack es **medido** como registro, con su fecha; la predisposición a plaga de Vigía es **deducida y sin calibrar** (regla de Vigía): el aviso **nunca dice «trata»**, dice «mira». No se presenta una predicción como un hecho.

**No probado.** Correo real de OVH y su entrega (spam), web push en cualquier aparato, MCP real de OlivarTrack y Vigía (hoy datos de prueba).

**Viabilidad:** correo con fuente automática, **alta**; web push, **media** (iPhone exige instalar la PWA; Quest, sin dato).

---

### C. Primera vez con gafas

**Qué es.** El momento en que una familia se pone las Quest por primera vez. Hoy hay código corto para vincular desde el móvil (UX §4.4, ADR-0028), mini-tutorial de primera llegada (§5.8) y aviso del micro. La idea es **hacer de ese primer minuto un ritual**: llegada guiada a la haza propia con su linde, el olivo con el nombre que le puso la familia, el cielo de ese día y una sola cosa que hacer (nombrar o saludar), con una salida cómoda a los 3-5 minutos.

**Por qué haría volver.** Si la primera experiencia en VR marea, no se entiende o está vacía, no hay segunda. Es la palanca de retención más barata de programar y la más cara de *probar*: solo se valida en un Quest real y con gente de la familia, mayores incluidos.

**Reusa.** `12b_llegada.js`, `13b_hazas.js` (tu haza), `44_lindes.js`, `29_vr.js` y los perfiles VR, panel VR (EV2-A2), `46_guiada.js`, y los pendientes de confort (AG-2.4: fundido, viñeta, topes de vuelo). El avatar por piezas (AV2-AV4) para un «espejo» del primer segundo.

**Coste.** **media · opus** por diseño de interacción y confort; el código es poco. Necesita una sesión 👤 en Quest con 2-3 personas y la nota de comodidad (regla 11).

**Privacidad.** Bajo si no se guarda nada nuevo. Que el aviso del micro (decisión 163, F3j) siga **antes** de cualquier voz y que el tutorial no empuje a un menor a usar la cuenta de un adulto (decisión 45).

**Medido / deducido / ilustrativo.** Todo lo que aparece ya está rotulado (haza real, copas medidas del LiDAR, troncos ilustrativos).

**No probado.** Todo en Quest: mareo, tamaño de texto, tiempo hasta la primera acción.

**Viabilidad:** **alta** como diseño, **no probada** como experiencia. Condición previa: AG-2.4 y Q0c.

---

### D. Estado del mundo compartido y calendario

**Qué es.** Que el mundo muestre **lo mismo para todos en el mismo momento** y cambie con el año real: la estación y la fenología según el calendario (la fecha simulada ya existe en `23_estacion.js`), el tiempo de Vigía (`15_tiempo.js`), la actividad de hoy según OlivarTrack (`14_historia.js`) y un **avance de la campaña** (kilos nunca; el «avance de la recolección %» sí está en la proyección pública, decisión 13). Y tres rituales con fecha: floración, vendimia y primer aceite.

**Por qué haría volver.** «Hoy nieva» o «están recogiendo» es una razón para entrar sin que nadie avise, y la campaña da un calendario anual que ningún juego tiene: pasar de «una visita» a «una temporada».

**Reusa.** `23_estacion.js`, `15_tiempo.js`, `14_historia.js`, `43_agenda.js`, `41_cae_la_cosecha.js` (puede pintar el avance de la campaña), `contratos/ot-hoy.md`, `contratos/tiempo.md`. «Estado compartido» no necesita servidor de estado (ARQUITECTURA-MULTIUSUARIO: Colyseus solo cuando haya reglas que arbitrar): basta un `GET` pequeño de la api con «el estado del mundo hoy» que el cliente ya sabe pintar.

**Coste.** **media · sonnet**: un `mundo_hoy` en la api (fecha, tiempo, fase fenológica, evento destacado); el cliente arranca «a hoy» (el deslizador sigue ahí, con «volver a hoy»). Cada ritual, **ligera**.

**Privacidad.** Bajo: todo es agregado de la finca. Los datos de OlivarTrack y Vigía son **datos, nunca instrucciones**, y se rotulan con su fecha. Nada por persona.

**Medido / deducido / ilustrativo.** Tiempo de Vigía y tratamientos registrados: **medido** (con su frescura). Fase fenológica por calendario: **deducida**. El aspecto de la floración o la nieve: **ilustrativo**, y se dice.

**No probado.** Tokens reales de OlivarTrack y Vigía (en espera de Antonio); Hituelo no tiene lectura en vivo.

**Viabilidad:** **alta**; junto con B, el mejor retorno por coste.

---

### E. Avatar con boca por la energía del micro

**Qué es.** Que el avatar de quien habla abra la boca en proporción a su voz, sin transcribir ni analizar nada. Hoy el avatar solo parpadea (`26b_avatares.js`, `expressionManager.setValue("blink", …)`); el VRM ya trae la expresión `aa` ([AVATARES-FAMILIA](../sistema/AVATARES-FAMILIA.md): «`blink` y `aa` reconstruidos; no se ha visto animado»).

**Por qué haría volver.** En una guiada se sabe quién habla sin mirar el panel: el detalle de presencia más barato. No trae a nadie por sí solo; reduce la sensación de hablar con un muñeco.

**Reusa.** `45_voz.js` ya emite `voz:habla { identidad, nivel, habla, yo }` (ActiveSpeakers de LiveKit, sin análisis propio) y `26b_avatares.js` sabe a quién pertenece cada VRM. Basta suscribirse y llevar `nivel` a `aa` con suavizado (ataque rápido, caída lenta) y `0` si no habla.

**Alternativas descartadas.** Un `AnalyserNode` de Web Audio propio por pista (más CPU y un segundo camino de audio); visemas reales (`ih`, `ou`…) por fonemas (pesado y sin ganancia con avatares de poca resolución).

**Coste.** **ligera · sonnet**: una función pura `AvataresPuro.boca(nivel, previo, dt)` con prueba en Node (como `parpadeo`) y un `setValue` por VRM hablante y fotograma (máx. 6 en escritorio, 3 en móvil y Quest; el muñeco lejano no tiene boca). Medir reservas por fotograma (AG-1.4) y dibujo.

**Privacidad.** El nivel ya viaja por LiveKit y no se guarda; **no añade tratamiento**. Que no pase a la auditoría ni a la telemetría de fluidez. Ayuda a la accesibilidad.

**Medido / deducido / ilustrativo.** **Ilustrativo**: la boca sigue el volumen, no las palabras.

**No probado.** Que `aa` se vea bien animada en un VRM real y en el Quest; el vello de la barba no sigue la boca (anotado en AVATARES-FAMILIA).

**Librerías.** `@pixiv/three-vrm` 3.5.5 ya está en `apps/web/package.json`; su licencia **[NO VERIFICADO aquí: comprobar con el guardián de licencias del repo]**. Nada que añadir.

**Viabilidad:** **alta**.

---

### F. Postal del mundo

**Qué es.** Un botón «Mandar una postal»: una captura del mundo en el sitio y la hora de la persona (con la estación real, el nombre de su olivo o su haza si quiere) que se descarga o se comparte, con créditos (IGN CC BY 4.0, Copernicus). Es la única idea que **trae gente nueva**.

**Por qué haría volver.** Con 40 hogares la «viralidad» es boca a boca familiar: hijos y nietos sin cuenta. La postal es el puente hacia el próximo hogar y le da a quien visita algo que llevarse.

**Reusa.** El lienzo del renderizador (`03_escena.js`: `renderer`, `lienzo`), el botón en `31_hud.js`, los créditos del mundo (`33_ajustes.js`), las capas visibles (`32b_capas.js`). La Web Share API con archivos (`navigator.share`) evita librería y cae a descarga.

**Coste.** **ligera-media · sonnet**: pedir un fotograma y leerlo en el mismo tick (sin `preserveDrawingBuffer` permanente), marco y rótulo en un lienzo 2D, sin EXIF. La captura de WebGL en iPhone y Quest tiene lagunas **[NO VERIFICADO: medir]**; en VR no se captura (se ofrece en pantalla).

**Privacidad.** El contenido **sale** del gemelo. La postal **no incluye avatares ajenos, alias ni el HUD de presencia** (se ocultan durante la captura) ni la haza ajena, y no lleva geolocalización en el nombre ni en los metadatos; marca visible sin datos de la explotación (kilos, tratamientos). El nombre de un olivo solo si la familia lo eligió.

**Medido / deducido / ilustrativo.** Mezcla las tres capas; leyenda: «imagen ilustrativa: copas medidas del LiDAR 2024, troncos y ramas ilustrativos».

**No probado.** Captura en móvil y Quest, tamaño del archivo, coste con la nube de puntos.

**Librerías.** Ninguna (API nativa).

**Viabilidad:** **alta**.

---

### G. El Mayoral (personaje)

**Qué es.** Una figura recurrente del olivar (el mayoral, el que sabe lo que toca cada semana) que da la bienvenida, comenta la campaña y reparte los avisos del mundo con voz propia **escrita, no hablada**. La fila de PLAN pide un ADR propio; este estudio **no lo escribe**.

**Por qué haría volver.** Los mundos que retienen tienen una cara: un sitio al que volver («¿qué dice hoy el Mayoral?») y un tono único para B y D. Riesgo: si habla de más, pierde credibilidad.

**Reusa.** El avatar VRM (`26b_avatares.js`), `Laminas` para el bocadillo, `46_guiada.js` (guion), `14_historia.js` (textos con datos de la finca).

**Preguntas para su ADR.** (1) ¿Persona real de la finca (retrato, voz) o personaje inventado? Un retrato o voz reales son datos personales y piden consentimiento por escrito: **lo prudente es inventado**. (2) ¿Lo que dice lo escribe una persona o lo genera un modelo? Un modelo sobre datos de la finca trae inyección de instrucciones e invención de cifras (CLAUDE.md: no se inventa); recomendado **textos fijos con plantillas y datos de la api**, nunca texto generado en caliente. (3) Transparencia: que nadie lo tome por una persona de la oficina al otro lado.

**Coste.** Estudio y ADR **ligera · opus**; implementación **media · sonnet**. **Depende de B y D** para tener algo que decir.

**Medido / deducido / ilustrativo.** **Ilustrativo**; cuando recita datos, estos llevan su rótulo y su fecha.

**No probado.** Aceptación de familias y mayores: enseñarlo en papel antes de construirlo.

**Viabilidad:** **alta técnica; media de producto**.

---

### H. Otras ideas típicas de mundos persistentes, filtradas por este producto

| Idea | Encaje | Veredicto |
|---|---|---|
| Racha diaria, logros, insignias | Una familia no tiene que «no perder la racha» de un olivar: presiona, y con mayores es antipático | **No**. Sí un sello discreto por temporada, sin ranking |
| Clasificación de juegos | Ya hay récord de la familia (`apps/api/src/juegos/`) | Ya existe |
| Cuaderno de campo de fauna y flora | Enlaza con EV-1g/1i («aves probables este mes») | **Sí, tras EV-1g**; probable no es visto, y se rotula |
| «Tu olivo a lo largo del año» | La familia nombró un olivo; el diario cuenta qué le pasó cada estación (`diario_haza`, `23_estacion.js`) | **Sí**: la mejor razón personal para volver, y casi ya está |
| Carta del olivar una vez por estación | Variante afectiva del resumen de B | **Sí**, junto al resumen |
| Eventos temporales (fiesta de la vendimia con la oficina) | `43_agenda.js` y la sala guiada ya existen | **Sí**: solo darles calendario |
| Mercado, moneda, economía | Nada que encaje y complica lo legal | **No** |
| Chat global persistente | Decisión 40: el chat no se guarda; sin personal para moderar | **No** |
| Mensajes directos entre familias | Datos personales entre particulares, sin base ni moderación | **No** |

## 3. Cruce de privacidad (para la asesoría)

| Idea | Dato nuevo | Persiste | Identifica | Menores | EIPD |
|---|---|---|---|---|---|
| A1 nota | gesto o texto + olivo | campaña + 1 año | alias del hogar, oculto a otras familias como hoy | texto libre podría nombrarlos | ampliar la fila de VIDA (fotos y nombres) |
| A2 huella agregada | recuento por celda | días | no, con k mínimo | no | poco |
| A3 eco | **trayectoria** | 7-14 días (propuesta) | sí, aunque se muestre anónima (se guarda con hogar) | puede ir un menor con el adulto | **sí, capítulo propio** |
| B push | endpoint de suscripción | mientras exista | el aparato | no | ampliar la fila de avisos |
| B resumen | ninguno | — | — | — | no |
| C primera vez | ninguno | — | — | menores cerca de unas Quest | revisar el aviso |
| D estado | ninguno | — | — | — | no |
| E boca | ninguno (el nivel no se guarda) | no | no | no | no |
| F postal | imagen en el aparato; nada en el servidor | no | puede, si sale un avatar ajeno | puede | no, si se oculta la presencia |
| G Mayoral | texto del personaje | — | si fuese persona real, sí | — | solo con retrato o voz reales |

Reglas comunes: sin cuentas de menor (45); todo lo nuevo con plazo en `retencion.ts`; nada por persona cuando el origen es la cuadrilla; borrado al borrar el hogar (`GET /api/yo/datos` y la cascada ya existen y habría que incluir lo nuevo). Las cifras («k ≥ 3», «7-14 días», «≤ 1 aviso por semana») son **propuestas propias sin contrastar**.

## 4. Propuesta para la tanda 10

Criterio: primero lo que **más retiene por menos coste y menos riesgo** (B, D), luego lo que lo mejora (E, F), después lo que pide decisión o aparato (A1, C). Se plantea **después de la novena («la gente», F3h/F3i)**, que dará los primeros datos de coincidencia real.

| # | Tarea (nombre provisional) | Depende de | Peso y modelo | Notas |
|---|---|---|---|---|
| 1 | **El mundo de hoy**: `mundo_hoy` en la api; el cliente arranca en estación, tiempo y actividad del día real, con «volver a hoy»; fuente automática de avisos (fenología, tratamiento registrado, evento de mañana) en `avisos` | tokens de OlivarTrack y Vigía (👤) o grabaciones | media · sonnet | Ideas D y fuente de B; rotulado medido/deducido |
| 2 | **Resumen semanal y «tu olivo en el año»**: correo con el repartidor actual y notas del diario de la haza en la campana | 1 | media · sonnet | Ideas B (resumen) y H; cuenta de OVH para mandar de verdad |
| 3 | **Boca por voz**: `AvataresPuro.boca` y enlace a `voz:habla`; Node y Chrome simulado | — | ligera · sonnet | Idea E; en paralelo con todo |
| 4 | **Postal**: captura sin presencia ni HUD, marco y créditos, `navigator.share` con caída a descarga; medir en móvil | — | ligera-media · sonnet; 👤 móvil | Idea F |
| 5 | **Notas con gestos** (A1, lista cerrada) junto al olivo, con plazo y denuncia como P7f | EIPD de F3 en marcha | media · sonnet | A2 y A3 solo si la novena y la tarea 1 muestran coincidencia suficiente y la asesoría lo ve |
| 6 | **Primera vez con gafas**: guion, ritual y nota de comodidad; sesión en Quest | AG-2.4, Q0c, EV2-A2 | media · **opus**; 👤 Quest | Idea C |

Quedan **fuera**, con motivo: web push (esperar a la apertura del correo y a AG-1.7), el Mayoral (esperar a las tareas 1-2 y a su ADR), el eco A3 (privacidad) y A2 (datos de visita).

## 5. Decisiones que serían de Antonio (propuestas, sin número oficial)

1. **Avisos automáticos desde OlivarTrack y Vigía a las familias:** qué eventos salen (floración, tratamientos, visita, primer aceite), frecuencia máxima (propuesta: ≤ 1 por semana y el resto en el resumen) y regla de redacción (nunca «trata», solo «mira»).
2. **Cuenta de correo de OVH y remitente** para avisos y resumen (ya en «Espera a Antonio»): sin ella, B solo se prueba en Mailpit.
3. **Web push, ¿sí o no?** Propuesta: no hasta medir el correo; si sí, ¿con la PWA instalada como condición en iPhone?
4. **Notas entre familias (A1):** ¿lista cerrada de gestos o texto libre moderado? Propuesta: lista cerrada al empezar.
5. **Ecos de paseo (A3):** propuesta, no hasta ver la EIPD y la coincidencia real; si sí, solo con consentimiento por visita y plazo corto.
6. **Plazo de lo nuevo:** ¿«campaña y un año» (decisión 100) o más corto para notas, ecos y suscripciones push?
7. **El Mayoral:** ¿personaje inventado con textos fijos o persona real de la finca (retrato y voz, con su consentimiento)? Propuesta: inventado y ADR antes de código.
8. **Postal:** ¿lleva el nombre del olivo de la familia y el de la finca? ¿Quién aprueba el texto de créditos y la marca?
9. **Sello de temporada** discreto, sin racha ni ranking: ¿sí o no?
10. **Primera vez con gafas:** qué familias lo prueban (mayores incluidos), cuándo y con qué guion.

## 6. Qué no está probado

Nada de lo propuesto se ha implementado ni medido. No probado: web push en cualquier aparato (iPhone exige la PWA instalada; **Quest, sin dato [NO VERIFICADO]**); captura de postal en móvil y Quest; coste de dibujo de ecos en el Quest; entrega del correo real; datos reales de OlivarTrack y Vigía; cuántos hogares coinciden de verdad en un mes (decide si A2 y A3 tienen sentido); aceptación de familias y mayores.

## 7. Fuentes

- WebKit, *Web Push for Web Apps on iOS and iPadOS* (iOS y iPadOS 16.4, web en la pantalla de inicio, permiso con gesto del usuario): <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
- Registro de npm, consultado el 2026-11-05: `web-push` 3.6.7 (MPL-2.0, repositorio `web-push-libs/web-push`); `workbox-build` 7.4.1 (MIT). No se miró la actividad reciente de los repositorios.
- Quest Browser y web push: sin fuente encontrada **[NO VERIFICADO]**.
