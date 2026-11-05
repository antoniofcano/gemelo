# ADR-0032 — Voz por cercanía en la visita libre (F3k)

- **Estado:** Aceptado (2026-11-05, Antonio): **213** «construir ya», en paralelo a la asesoría; **210** V1 (apagada por defecto, se activa por cuenta en Configuración); **211** aviso propio (ámbito `cercania`). **Provisionales** con la opción recomendada hasta que las cierre: **205** K4 (corro con aceptación, hasta 5 hogares), **206** las distancias de b), **207** P1 (pulsar, cierre por silencio de 60 s), **208** M1 (declaración de mayor de edad en el aviso), **209** Mo1 y **212** h) (plazos como la 164). Hasta cerrar la EIPD, solo cuentas de prueba (decisión 41) y un **interruptor general** de la oficina, **apagado** por defecto. F3k-1 (api y contrato `livekit-roles` v8) hecho en código el 2026-11-05. (Propuesto el mismo día, tarea F3k-0.)
- **Fecha:** 2026-11-05

## Contexto
Antonio quiere para la novena subida **F3k: hablar con quien pasea a tu lado en la visita libre, sin evento guiado** ([PLAN](../rumbo/PLAN.md), filas F3k-0 y F3k). Hoy no se puede, y no por casualidad:
- **El [ADR-0026](0026-voz-y-moderacion.md) eligió A1, «solo en las visitas guiadas»** (decisión 157), y descartó por ahora A2 (charla libre por cercanía: nadie modera en directo, no hay rastro de una queja, tratamiento continuo en la EIPD, más carga) y A3 (solo hogares aceptados: invitaciones, aceptación y retirada, otra pantalla). La decisión 180 (2026-11-02) lo repitió: «no por ahora; se reabre con gente real usando el chat de texto y la EIPD validada». **Este ADR enmienda la opción a) del ADR-0026**; el resto (permiso en el servidor, sin grabar, audio espacial, eco) se mantiene y se reusa.
- **Lo que ya hay** (leído en el repo): audio espacial por avatar en `45_voz.js` (F3d: un `<audio>` silenciado por pista, ganancia por distancia con `refDistance` 2 m y rolloff 1, `PannerNode` HRTF, como mucho `MAX_VOCES` = 4 a la vez, caída a «plano» con el micro abierto y sin auriculares); pulsar para hablar o mantener, tecla T y gatillo izquierdo en VR en `47_habla.js` (F3e); permisos por sala y por papel con `UpdateParticipant` en la api ([livekit-roles.json](../../contratos/livekit-roles.json) v7, F3c, verificado en F3g); consentimiento por hogar y versión del texto ([voz-consentimiento](../../contratos/voz-consentimiento.md), F3j); bloquear «solo para ti» en Gente (`38_presencia_compartida.js`: deja de dibujar y de mostrar el chat de esa identidad, solo en ese aparato); expulsar de todas las salas por la api (OF14).
- **La sala libre no tiene audio:** en `hituelo-libre` todos los roles llevan `canPublish: false` y `canPublishSources: []`; nadie puede publicar un micro aunque modifique su cliente.
- **Lo que acota:** no se graba nada (decisión 10); el chat no se guarda (40); solo cuentas adultas y hasta la EIPD solo cuentas de prueba (41, 45); la base de la voz de las familias es el consentimiento (163); la auditoría de voz se guarda la campaña y un año más (164); la EIPD no está cerrada (165: faltan responsable, canal de derechos, contrato con OVH, TURN, la EIPD de OlivarTrack). La oficina ya ve en qué haza está cada persona (188).
- **Máquinas:** el i5 de este equipo no mide carga de LiveKit; los núcleos del VPS siguen **[NO VERIFICADO]** ([ADR-0011](0011-alojamiento-en-el-vps-de-ovh.md)); F3h (medir 10 personas con audio) aún no se ha hecho. Nada de voz se ha probado en Quest ni en iPhone.

## Decisión
**Propuesta (la cierra Antonio):** en la visita libre se habla **en corros**: te acercas a alguien, le **invitas a hablar** y, **si acepta**, los dos (hasta 5 hogares) os oís con el audio espacial de las guiadas mientras estéis cerca; nadie fuera del corro os oye. El micro se abre **pulsando**, como en las guiadas, y se cierra solo tras un rato en silencio. La voz por cercanía va **apagada por defecto** (se activa en Ajustes → Voz), con **consentimiento propio** y la **declaración de ser adulto**. Sin guía, cada uno se protege (silenciar, bloquear, salir del corro), **avisa a la oficina** con un motivo, y la oficina suspende la voz de un hogar o la apaga para todos. **Nada se graba.**

**Técnica (la decide el agente y la cuenta):** cada corro es una **sala de LiveKit solo de audio**, `corro-<id>`, cuyo token firma la api solo a quien ha aceptado; la pose y el chat siguen en `hituelo-libre`, que **sigue sin audio**. Quién oye a quién lo impone el servidor, no el cliente.

## Lo que decide Antonio: alternativas y recomendación

### a) Con quién se oye (decisión 205)
- **K0 · Nadie: se mantiene la 157 y la 180.** Coste cero, riesgo cero; F3k no se hace.
- **K1 · Cualquiera a menos de N m.** Lo más «mundo» y lo que hacen las salas sociales: te acercas y hablas. En contra: **voz no pedida de desconocidos** (el riesgo que ARQUITECTURA §Privacidad ya señala), un menor junto al micro de un adulto llega a cualquiera que pase, y técnicamente **la cercanía la impondría el cliente**: todos tendrían `canPublish` en la sala libre y un cliente modificado podría suscribirse a todas las voces de la sala o mentir con su pose para «acercarse». Lo atenúa que cada uno restrinja quién se suscribe a su pista (`setTrackSubscriptionPermissions` de `livekit-client` 2.22.4, que el servidor sí hace cumplir), pero esa lista la calcula el que habla con poses que dicen los demás. Es la opción que más pesa en la EIPD.
- **K2 · Solo entre hogares que se han aceptado (lista de amigos).** Reduce mucho el riesgo, pero guarda un **grafo social persistente** (quién es amigo de quién): un tratamiento más, con su plazo, su «Mis datos» y su retirada, y la pantalla de invitaciones. Mucho para 40 hogares, y no deja hablar con quien acabas de conocer en el olivar.
- **K3 · Solo dentro de una haza.** Se oye a quien está en la misma haza (la del titular, decisión 188: la oficina ya sabe en qué haza está cada uno). Fácil de explicar («en mi haza se habla»), pero las lindes no tienen que ver con con quién paseas: dos personas a 3 m a ambos lados de una linde no se oyen, y en una haza se oye a cualquiera que entre (es K1 con un límite raro).
- **K4 · Corro con aceptación en el momento (recomendada).** Invitas desde el avatar (tocarlo o apuntarlo con el rayo: `38_presencia_compartida.js` ya sabe qué avatar se toca) o desde Gente; quien recibe la invitación ve tu alias y «Aceptar» / «Ahora no» (el foco en «Ahora no», como el aviso de F3j); **sin aceptar no se oye nada**. Hasta **5 hogares** por corro [PROPUESTA]: cabe en las 4 voces a la vez de `MAX_VOCES`. Cualquiera del corro puede invitar a otro; todos ven quién entra. El corro **no se guarda** (vive en memoria de la api, como el turno de palabra) y se deshace cuando quedan menos de dos o con «Salir». Es un consentimiento por conversación: no hay voz no pedida, no hay grafo social guardado, y el servidor decide quién oye. Coste: el flujo de invitar y aceptar (api, motor, VR) y una conexión de audio más por cliente (abajo, «Lo técnico»).

### b) Distancia y atenuación (decisión 206) [PROPUESTA: cifras de diseño, sin probar con personas]
Dentro de un corro se reusa la curva de `VozPuro.ganancia` (ley inversa, a tope a menos de **2 m**, a la mitad a **4 m**, una quinta parte a **10 m**) y se añade:
- **Se deja de oír a un miembro a más de 20 m** (fundido de 15 a 20 m, en 1 s, sin chasquido), aunque siga en el corro: hablar a gritos de un extremo a otro de la finca no es «pasear al lado».
- **Para invitar hay que estar a menos de 8 m** (lo que ocupa una conversación de pie entre olivos, con margen para el marco de plantación); evita invitar a quien está lejos y no te ve.
- **El corro se deshace solo** para quien pasa **más de 60 s a más de 40 m** de todos los demás (histéresis, como la pose: cercano a 55 m, deja de serlo a 65 m, [presencia.md](../../contratos/presencia.md)), y para quien cambia de sala, pasa a vista aérea más de 60 s o se desconecta.
- **Sin suelo mínimo** (en las guiadas la voz del guía no baja de 0,25; aquí nadie tiene prioridad).
- **Alternativa:** un radio único de 12 m sin corro (K1), con suscripción a las 4 voces más cercanas y histéresis 12/16 m.

### c) Pulsar para hablar o abierto (decisión 207)
- **P1 · Como en las guiadas: pulsar para abrir y cerrar (defecto) o mantener (ajuste), y además el micro se cierra solo tras 60 s sin voz [PROPUESTA] (recomendada).** Es la UX aprobada (decisión 158) y la misma interacción (botón, T, gatillo izquierdo, háptica); aquí no hay turno que lo cierre, así que lo cierra el silencio (el nivel de `ActiveSpeakers` que ya escucha `45_voz.js`) y salir del corro. El indicador «● Tu micro está abierto» no cambia.
- **P2 · Mantener para hablar siempre.** Lo más seguro contra un micro olvidado, pero cansa y es menos accesible (decisión 158).
- **P3 · Micro abierto con detección de voz.** Es la **B3 del ADR-0026, descartada** para las familias porque **capta lo de alrededor** (la tele, otra persona de la casa, un menor), es lo menos predecible para quien escucha y quien habla no sabe cuándo «está en el aire». En un corro sin guía y con desconocidos esas razones pesan **más**, no menos: no se recomienda.

### d) Menores (decisión 208)
La decisión 45 dice que solo hay cuentas adultas, pero un menor puede estar junto al micro de un adulto o hablar con su cuenta.
- **M1 · Sin cuentas de menores y, al activar la voz por cercanía, la declaración «Soy mayor de edad y no dejaré hablar a menores con mi cuenta» dentro del aviso de consentimiento (recomendada).** Con P1 (micro solo al pulsar y cierre por silencio), el aviso y la recomendación de auriculares. Es una declaración, no una comprobación: el riesgo baja pero **no desaparece** y la EIPD lo dice.
- **M2 · Como M1 sin declaración** (lo de las guiadas: decisión 159). Menos fricción; en las guiadas hay un guía que oye lo que pasa y aquí no.
- **M3 · No abrir F3k hasta que la asesoría diga qué hace falta con menores** (verificación de edad, perfiles de menor). Es K0 de hecho.

### e) Moderación sin guía (decisión 209). Nada se graba (decisión 10)
- **Mo1 · Herramientas para uno, avisar a la oficina, suspensión desde la oficina y límites automáticos (recomendada):**
  - **Para uno, al momento:** «Silenciar» a un miembro (deja de oírle en tu aparato), «Salir del corro» (un toque, también en VR) y **«Bloquear»**, que hoy es local y pasa a guardarse en el servidor para la voz: quien bloqueas no puede invitarte ni entrar en un corro en el que estás, y si ya estáis juntos, sales tú. No se le dice que le has bloqueado (solo ve «no disponible»). Guardarlo en el servidor es un dato nuevo (quién bloquea a quién): se justifica porque un bloqueo solo en el aparato se salta invitando desde otra sesión.
  - **Avisar a la oficina:** «Avisar» en el avatar o en Gente, con motivo de lista (insultos, acoso, contenido sexual, parece un menor, otro) y, si quieres, un texto de como mucho 280 caracteres. **Sin audio**: llega a la bandeja de la oficina quién avisa, de qué hogar, cuándo, en qué corro y el motivo. Quien avisa sale del corro al momento.
  - **La oficina:** expulsar (ya existe, OF14: de todas las salas y 15 min sin token), **suspender la voz por cercanía de un hogar** (7 días, 30 días o hasta nuevo aviso [PROPUESTA]; puede seguir paseando y escribiendo) y un **interruptor general** que la apaga para todos. Todo por la api, auditado (`corro.*`), sin `roomAdmin` en ningún token.
  - **Límites automáticos [PROPUESTA]:** como mucho 5 invitaciones cada 10 min por hogar; tras dos «Ahora no» seguidos de la misma persona, no puedes volver a invitarla en 24 h; con **avisos de 3 hogares distintos en 7 días**, la voz por cercanía de ese hogar se suspende sola hasta que la oficina lo revise (riesgo: que tres se pongan de acuerdo; por eso no es definitiva y la revisa una persona).
- **Mo2 · Mo1 y, además, voz por cercanía solo cuando hay alguien de la oficina conectado** (o en franjas anunciadas). Más seguro para empezar, pero ata la voz a la disponibilidad de la oficina; sirve de piloto si la asesoría lo pide.
- **Mo3 · Solo herramientas para uno** (silenciar, bloquear, salir). Menos trabajo, pero la oficina no se entera de nada y un acosador no tiene consecuencias.

### f) Qué ve quien no habla, y cómo se apaga (decisión 210)
- **V1 · Apagada por defecto; se activa en Ajustes → Voz; nadie oye sin que se vea (recomendada).**
  - **Ajustes → Voz → «Voz por cercanía»: apagada / activada** (por cuenta, en el servidor, para que valga en todos tus aparatos). Apagada: no recibes invitaciones (quien te invita ve «no disponible»), no recibes ninguna pista y no ves los iconos de corro si además apagas «Ver quién habla cerca». La primera vez que entras a la visita libre tras la novedad, una tarjeta lo explica con «Activar» / «Ahora no» (protección de datos desde el diseño: nada se abre solo).
  - **Quien está en un corro** ve la lista de quién está dentro (alias, como en Gente) y un halo en el avatar de quien habla; quién habla también sale como texto en Gente y en una región `aria-live` (como F3e).
  - **Quien no está en el corro** ve sobre el grupo un icono de **corro con voz** y, al tocarlo, «Hablan entre ellos: no les oyes y ellos no te oyen». Así nadie cree que le escuchan sin saberlo, y nadie escucha a escondidas: **en un corro solo está quien aparece en su lista**.
  - En VR, una fila del panel («Voz por cercanía: activada / apagada», «Salir del corro») y la invitación como lámina con rayo o gatillo.
- **V2 · Activada por defecto, con la tarjeta de la primera vez.** Más corros desde el primer día; peor para la EIPD (el tratamiento empieza sin un gesto) y más invitaciones no pedidas.

### g) Consentimiento (decisión 211)
- **Aviso propio para la cercanía (recomendada):** un texto distinto del de las guiadas (con quién se habla, que no hay moderación en directo, que no se graba, la declaración de adulto de M1, cómo avisar y salir), guardado con su versión en la misma tabla con un **ámbito** (`guiada` o `cercania`). Base, consentimiento (como la 163).
- **El mismo aviso de las guiadas.** Menos trabajo, pero el consentimiento debe ser específico y las condiciones no son las mismas (sin guía, con desconocidos).

### h) Plazos (decisión 212)
- **Recomendada:** la auditoría de corros (`corro.invitacion`, `corro.entra`, `corro.sale`, suspensiones) y los **avisos** de la bandeja, **la campaña y un año más**, como la 164 (reusa `corteAuditoriaVoz`); los **bloqueos**, mientras existan los dos hogares y no se quiten; los **corros**, nada (en memoria). Alternativa: avisos 6 meses tras resolverlos.

### i) Orden (decisión 213)
- **Recomendada:** (1) la asesoría ve la §13 de la EIPD; (2) se construye F3k con **cuentas de prueba** (decisión 41) y la puerta; (3) se mide en Quest y en el VPS (con F3h); (4) se abre a familias reales solo con la EIPD validada y la 165 cerrada. Alternativa: construir ya en paralelo a la asesoría (riesgo de rehacer si pide otra cosa).

## Lo técnico que decide el agente

**1. Una sala de audio por corro (`corro-<id>`).** La api crea el corro en memoria al aceptarse la primera invitación y firma a cada miembro un token de esa sala con `canPublish: true`, `canPublishSources: ["microphone"]`, `canPublishData: false`, `roomJoin` y `canSubscribe`; nadie más tiene token, así que **nadie de fuera puede suscribirse aunque modifique su cliente**. Al salir o ser expulsado: `RemoveParticipant`; al deshacerse: `DeleteRoom`, como el cierre de las guiadas (F3f). El nombre lleva un id opaco del corro (no del hogar). `hituelo-libre` **no cambia**: la pose y el chat siguen allí y sin audio. Es el patrón de `guiada-<evento>` (permiso en el servidor, sala con nombre que la api comprueba), así que `livekit-roles` pasa a v8 con la sala `corro`, su papel `miembro` y la moderación `corro.*` (regla 3: contrato, esquema y `presencia.md` en el mismo commit, en F3k-1).
- **Por qué no la misma sala con permisos por pista** (`setTrackSubscriptionPermissions`): evita la segunda conexión, pero en LiveKit **lo predeterminado es que cualquiera de la sala pueda suscribirse** (`allParticipantsAllowed`), así que la privacidad dependería de que cada cliente lo restrinja **antes** de publicar y lo mantenga al día; un fallo o una carrera expone la voz a la sala. Queda como **caída** si la segunda conexión pesa demasiado en Quest (se mide en F3k-6).

**2. Cliente.** `45_voz.js` ya sabe entrar en una sala de voz bajo su propia clave de la red (`Voz.entra(evento)` con el token de F3c) y oír sus pistas con el audio espacial; se generaliza `VozPuro.esGuiada` a «sala de voz» (`guiada-…` o `corro-…`) y la curva de distancia por ámbito (b). `47_habla.js` reusa botón, T, gatillo y háptica, más el cierre por silencio. Lo nuevo es la interacción: invitar, aceptar, la lista del corro, el icono para quien no está, silenciar, bloquear, avisar y el ajuste (con nota de comodidad, regla 11).

**3. Carga (estimada, sin medir).** Con la cuenta del ADR-0026 §4 (~40 kbps por voz activa con Opus `speech` y DTX, cabeceras **[SUPUESTO]**):
- **Por persona:** como mucho 4 voces → **~160 kbps** de bajada si hablan todas a la vez (lo normal, 1-2: 40-80 kbps); subida, ~40 kbps solo mientras habla.
- **VPS:** el peor caso, 40 personas en 8 corros de 5 hablando todos a la vez: 40 × 4 = 160 pistas reenviadas, ~**6,4 Mbps** de salida; lo esperable (1-2 voces por corro) ~**1-2 Mbps**. CPU de LiveKit, del orden de **centésimas de núcleo** extrapolando su benchmark de audio **[SUPUESTO: otra máquina y otra tasa]**; lo caro sigue siendo la pose (1,8-2,4 núcleos con 40 en el peor caso, medido en el i5, [MEDIDAS](../sistema/MEDIDAS.md)). Frente a K1 sin límite (hasta 40 × 39 = 1.560 pistas posibles), el corro acota la carga **por diseño**.
- **Quest y móvil:** una **segunda conexión de LiveKit** (otra negociación, sus PeerConnection y su señalización) además de la de presencia, decodificar hasta 4 Opus y un panner HRTF por voz: **[NO VERIFICADO]**; es lo primero que se mide (F3k-6), con la caída a la misma sala (1) y a `panningModel: "equalpower"`.

**4. Sin grabación.** Ni Egress, ni `MediaRecorder`, ni transcripción; los avisos no llevan audio. Igual que el ADR-0026 §5.

## Alternativas técnicas consideradas
- **Misma sala `hituelo-libre` con `canPublish` y suscripción por cercanía en el cliente** (lo que pediría K1) — la sala entera podría oír a todos con un cliente modificado; descartado mientras la opción sea el corro.
- **Permisos por pista en la sala libre** — ver arriba: queda de caída, no de base.
- **Mezclar el audio del corro en el servidor** — pierde el audio espacial y añade una pieza (ADR-0026, alternativas).
- **Bloqueos solo en el aparato** (como hoy) — se saltan con otra sesión; para la voz hacen falta en el servidor.
- **Guardar los corros** (quién habló con quién) — no hace falta para moderar (la auditoría de entradas y salidas basta para atender un aviso) y sería el grafo social que K4 quiere evitar; solo la auditoría, con su plazo.

## Consecuencias
- **Positivas:** la voz de la visita libre solo llega a quien la ha aceptado y el servidor lo impone; reusa casi todo lo de F3 (audio espacial, pulsar para hablar, permisos por sala, consentimiento, expulsión, bandeja de la oficina); la carga queda acotada por el tamaño del corro.
- **Negativas / coste:** nadie modera en directo y, sin grabación, un aviso no tiene prueba (la oficina decide con la auditoría de quién estaba y los avisos de varios hogares); invitar y aceptar es más lento que «acercarse y hablar»; una segunda conexión por cliente en Quest sin medir; datos nuevos (bloqueos de voz, avisos, consentimiento de otro ámbito, auditoría de corros) con su sitio en «Mis datos» y su plazo; más trabajo de la oficina (bandeja, suspensiones).
- **Privacidad:** abre un tratamiento **continuo** (no acotado a una visita): la EIPD se amplía en su §13 y la valida la asesoría antes de abrirlo a familias reales.
- **Implicaciones futuras:** al aceptarse, cambian `livekit-roles` (v8), `presencia.md`, `voz-consentimiento` (ámbito), la api (corros, bloqueos, avisos, suspensión, interruptor) y la UX (la tarjeta de la visita libre dice hoy «Sin voz»; ARQUITECTURA §Privacidad dice «en visita libre, chat de texto»), y el ADR-0026 recibe su enmienda. Si un día se quiere K1, este diseño no lo impide (el corro sería «todos los que están cerca»), pero pide otra decisión y otra revisión de la EIPD.

## Cómo se partiría (si se acepta; tareas para el PLAN, [ESTIMACIÓN])
- **F3k-1** — contrato `livekit-roles` v8 y api: corros en memoria (invitar, aceptar, rechazar, salir, deshacer), tokens de `corro-<id>`, límites, consentimiento por ámbito (migración), bloqueos de voz, avisos a la bandeja, suspensión e interruptor, auditoría `corro.*` y purga · media · opus.
- **F3k-2** — motor: la voz y el habla en la sala del corro, curva por ámbito, cierre por silencio · ligera · sonnet.
- **F3k-3** — interacción: invitar desde el avatar y Gente, aceptar (pantalla, táctil, VR), lista e icono de corro, silenciar, bloquear, avisar, Ajustes; nota de comodidad · media · sonnet.
- **F3k-4** — oficina: bandeja de avisos de persona, suspender, interruptor · ligera · sonnet.
- **F3k-5** — e2e con tres Chrome y micrófono simulado por el banco: sin aceptar no se oye; quien sale deja de oír; bloqueado no entra; suspendido no recibe token · pesada · sonnet.
- **F3k-6** — medida en Quest real (dos conexiones, 4 voces HRTF) y en el VPS, junto a F3h · pesada; 👤 Antonio con el casco.

## Comprobación
- **Este ADR es solo documento:** no cambia código ni contratos; lo vigilan los guardianes `documentacion` (índice y estado), `higiene` y `secretos`.
- **Comprobado al escribirlo:** lo que hay en `45_voz.js` (curva, `MAX_VOCES`, salas de voz), `47_habla.js`, `38_presencia_compartida.js` (bloquear local, tocar un avatar), `livekit-roles.json` v7 y `voz-consentimiento.md`; que `livekit-client` 2.22.4 instalado expone `setTrackSubscriptionPermissions(allParticipantsAllowed, participantTrackPermissions)` como api pública.
- **No comprobado:** cualquier cifra de distancia (b) con personas; la carga de dos conexiones y 4 voces HRTF en Quest y móvil; la CPU de LiveKit con corros (F3h); que `DeleteRoom` y `RemoveParticipant` se comporten igual en salas `corro-` que en las guiadas (lo da por hecho por ser las mismas llamadas); la valoración jurídica (asesoría). Nada probado en iPhone ni en Quest.
