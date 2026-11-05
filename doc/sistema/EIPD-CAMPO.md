# EIPD — ampliación al corresponsal de campo (F4): vídeo, voz y posición

> **BORRADOR sin valor legal. No sustituye al criterio de la asesoría** ni de quien lleve lo legal en la explotación. Lo escribe un agente a partir de lo que dice el repo; no es asesoramiento jurídico. Lo que no está en el repo ni se ha podido comprobar va marcado **[SUPUESTO]** o **[NO VERIFICADO]**. Las referencias a normativa están **citadas de memoria o de fuentes secundarias, sin contrastar con el texto vigente**: quien valide las comprueba (RGPD, LOPDGDD —en particular sus arts. 22 y 89—, Estatuto de los Trabajadores y guías de la AEPD).

- **Estado:** borrador (2026-11-02), tarea F4-1. Sigue la estructura de [EIPD-VOZ](EIPD-VOZ.md) y la amplía; el documento final debe ser **una sola EIPD** con la de la voz y la de OlivarTrack (decisiones 41, 102 y 165).
- **Base técnica:** [ADR-0030](../adr/0030-corresponsal-de-campo-pwa-en-primer-plano.md) (Propuesto) y el estudio [CORRESPONSAL](CORRESPONSAL.md).
- **Hoy no existe nada de esto:** ningún rol puede publicar cámara (`contratos/livekit-roles.json` v8: los corros, solo micrófono), no hay página de campo ni tabla de clips.

## 1. El tratamiento nuevo

1. **Vídeo en directo** de la cámara trasera de un móvil de la explotación, durante una **visita guiada** programada, por la sala `guiada-<evento>` de LiveKit autoalojado en el VPS. **No se graba** (decisión 10; sin Egress).
2. **Voz** del corresponsal, pulsando para hablar (como las familias en EIPD-VOZ); sin sonido ambiente continuo.
3. **Posición y rumbo** del corresponsal (GPS y brújula del móvil), solo mientras emite, convertidos a coordenadas del mundo; **no se guardan**.
4. **Clips diferidos** de ≤ 60 s grabados en el móvil cuando no hay cobertura, que se suben después y **revisa la oficina antes de que nadie los vea**; si se aprueban, se publican como evento de la haza.

## 2. Finalidad

Enseñar la finca en directo a las familias inscritas en una visita guiada (qué se hace en su haza, cómo está el olivar) y dejar constancia divulgativa de lo hecho en una haza (clips aprobados). **Finalidades excluidas, por escrito:** controlar, medir o evaluar el trabajo de nadie; usar imágenes, voz o posiciones en procedimientos disciplinarios; seguir recorridos; reconocer caras o voces. Si algún día se quisiera cualquiera de ellas, sería otro tratamiento con su EIPD **[SUPUESTO: la exclusión expresa refuerza la ponderación; lo valora la asesoría]**.

## 3. Interesados

| Quién | Cómo le afecta | Nota |
|---|---|---|
| **El corresponsal** (persona trabajadora de la explotación) | su voz, su posición mientras emite; su imagen si sale en plano; su cuenta y su aparato | participa por su puesto; no se identifica por nombre ante las familias (alias «Corresponsal») |
| **Personas trabajadoras que aparecen en plano** (cuadrilla, tractorista) | imagen, quizá voz de fondo | **lo más delicado**: no han elegido salir; relación laboral desequilibrada |
| **Terceros en la finca** (proveedores, visitas, vecinos, menores acompañantes) | imagen, matrículas | ocasional |
| **Familias inscritas** | ven el vídeo; no emiten | ya en EIPD-VOZ |

## 4. Base jurídica — elección pendiente (decisión nueva y 165)

| Para | Opción | A favor | En contra |
|---|---|---|---|
| Personas trabajadoras en plano | **Interés legítimo** (RGPD art. 6.1.f) **[SUPUESTO]** con ponderación escrita | encaja con una actividad divulgativa de la empresa; no depende de pedir permiso a cada persona en cada toma | exige ponderar y ofrecer **oposición** real; en el trabajo, la imagen continuada pesa; hay que demostrar que se minimiza (encuadre, pausa, sin grabación) |
| | **Consentimiento** (6.1.a) **[SUPUESTO]** | claro para quien quiere salir | en una relación laboral es difícil que sea libre (desequilibrio) **[SUPUESTO: criterio habitual de las autoridades]**; si alguien no consiente, la toma no se hace igualmente: equivale a la pausa |
| El corresponsal | **Relación laboral** (6.1.b) o interés legítimo **[SUPUESTO]** | es parte de su trabajo si así se define | debe estar en su puesto o pactado; si no, voluntario y con alternativa |
| Familias que ven | ya cubierto en EIPD-VOZ (consentimiento al hablar; ver no es tratar su dato) | — | — |

**Videovigilancia laboral (LOPDGDD art. 89):** regula las cámaras para **funciones de control** de los trabajadores y exige información previa, clara y expresa a ellos y a sus representantes (comentarios de [Legiscope](https://www.legiscope.com/blog/videovigilancia-rgpd-espana.html) y [Cuatrecasas](https://www.cuatrecasas.com/es/spain/articulo/espana-cuando-pueden-las-camaras-de-videovigilancia-utilizarse-para-despedir), fuentes secundarias consultadas el 2026-11-02; el texto legal **[NO VERIFICADO]**). Este tratamiento **no es de control**, pero la cámara la lleva la empresa en el lugar de trabajo: la propuesta del agente es **cumplir de todos modos el estándar de información previa del art. 89** (a la cuadrilla y a sus representantes, si los hay) y declarar por escrito que las imágenes no sirven para control (§2). **[Antonio / asesoría: ¿qué base, y hay representación de los trabajadores a la que informar?]**

## 5. Categorías de datos

| Dato | ¿Se guarda? | Nota |
|---|---|---|
| Imagen en directo | **No** | viaja por el VPS (SFU) y se muestra a la sala; cifrado del transporte en el despliegue **[NO VERIFICADO]** |
| Voz del corresponsal | **No** | pulsar para hablar; sin sonido ambiente |
| Voz de fondo de terceros | **No** | se minimiza: micro cerrado por defecto, supresión de ruido |
| Posición y rumbo del corresponsal | **No** | solo mientras emite; coordenadas locales; nunca a OlivarTrack; sin recorridos |
| Clips | **Sí, con plazos** (§7) | en el volumen de medios del VPS; sin coordenadas, solo haza, evento e instante |
| Quién emitió, cuándo, cortes y revisiones | **Sí**, en `auditoria` | quién (cuenta), cuándo, qué acción; nunca imagen ni audio |
| Datos de conexión (IP, WebRTC) | logs de LiveKit **[NO VERIFICADO]** | como en EIPD-VOZ §4 |
| Batería y calidad de red del móvil | No (viajan en la pose) | del aparato de la empresa, no de la persona |

**Biometría:** no se extraen plantillas ni se reconoce a nadie; por eso **no** se trata como categoría especial (art. 9) **[SUPUESTO]**. Un desenfoque automático de caras **detecta** caras (no identifica); aun así, si se añadiera, lo revisa la asesoría.

## 6. Destinatarios y quién accede

- **Directo:** solo los participantes de la sala `guiada-<evento>`: las **familias inscritas** a esa visita (no en espera), el guía y la oficina. **Nunca** en la visita libre ni a todas las familias. **[Antonio: P3 del ADR-0030.]**
- **Clips pendientes:** solo la oficina (rol `oficina` o `admin`) en la Bandeja. **Aprobados:** las familias, como cualquier evento de haza (ven hazas ajenas en detalle, decisión de ADR-0009) **[Antonio: ¿solo la familia de la haza o todas?]**.
- **Sin terceros:** sin nube, sin Egress, sin servicio de desenfoque externo. Alojamiento: VPS de OVH en Europa (decisión 165, región concreta **[NO VERIFICADO]**).

## 7. Conservación

| Qué | Plazo propuesto | Cómo se borra |
|---|---|---|
| Directo | nada | no se escribe en ningún sitio |
| Clip en el móvil | hasta que la api confirma la subida (SHA-256) | borrado del IndexedDB del aparato |
| Clip **pendiente** de revisión | **30 días** | purga de la api (la de cada 6 h que ya existe) |
| Clip **rechazado** | **en el acto** | la oficina rechaza → se borra el fichero |
| Clip **aprobado** | **la campaña y un año más** (como las decisiones 100 y 164) | purga; antes, a petición de quien salga en él |
| Auditoría de emisión (`guiada.emision_*`, `guiada.video_cortado`, `clip.*`) | la campaña y un año más | como la auditoría de voz |

Retención en LiveKit y logs del servidor: **[NO VERIFICADO]**, como en EIPD-VOZ §7.

## 8. Riesgos y medidas

| # | Riesgo | Valoración (juicio del agente, sin medir) | Medidas |
|---|---|---|---|
| C1 | **Trabajadores filmados sin quererlo** | alta sin medidas; media con ellas | aviso previo por escrito y verbal; chaleco; encuadre a copa y suelo; **Pausar** de un toque; derecho a decir «no me grabes» sin dar razones ni consecuencias; sin grabación del directo; clips revisados |
| C2 | **Uso para control laboral** («se ve que esa cuadrilla paraba») | media | finalidad excluida por escrito (§2); sin grabación; la oficina no ve el directo con otra herramienta; clips sin personas identificables |
| C3 | **Seguimiento del corresponsal** (dónde estaba y cuándo) | media | posición solo emitiendo, no se guarda, sin recorridos, nunca a OlivarTrack; en la visita libre no existe (coherente con la decisión 173: nunca personas) |
| C4 | **Captura de pantalla por una familia** | media; no se puede impedir en web | normas de la comunidad («no grabes ni compartas el directo»); expulsión; se dice en el aviso de la visita **[SUPUESTO: no hay medida técnica]** |
| C5 | **Voz de fondo** (conversaciones de la cuadrilla) | media | micro cerrado por defecto, pulsar para hablar, vídeo sin audio ambiente |
| C6 | **Menores o terceros** en la finca | baja-media | misma regla: se pausa; clips con personas identificables se rechazan o recortan |
| C7 | **Clip perdido o robado** (móvil extraviado) | baja-media | móvil de la explotación con bloqueo; IndexedDB de la PWA solo accesible a su origen; clips pocos y cortos; borrado tras subir; la oficina puede revocar la llave y el aparato |
| C8 | **Fallo técnico** que deja la cámara emitiendo sin saberlo | baja | indicador fijo «● EN DIRECTO» en el móvil; la oficina puede cortar el vídeo desde el servidor (`UpdateParticipant`, comprobado en F3g para el micro) |

**Desenfoque de caras como mitigación.** Técnicamente se podría detectar caras en el móvil (p. ej. el detector de caras de MediaPipe en web, con WASM) y pintar encima antes de publicar la pista (procesador de pista de LiveKit). **No se propone como medida principal:** (1) los detectores fallan con caras de perfil, lejanas, bajo sombrero o a contraluz, que es lo normal en el campo, y un fallo de un fotograma ya expone; (2) el coste en CPU, batería y calor de un detector a 24 fps en un móvil de gama media sin medir, y probablemente alto **[NO VERIFICADO]**; (3) da una falsa sensación de seguridad que relaja el encuadre. Para **clips**, la revisión humana de la oficina es más fiable. Queda como mejora opcional que se puede medir en F4-3 si la asesoría la pide. **[NO VERIFICADO: viabilidad y coste en el aparato.]**

## 9. Información a las personas filmadas (propuesta)

1. **Antes de la campaña:** una hoja informativa a la plantilla de campo (y a su representación, si la hay): qué es la emisión de campo, cuándo, quién la ve, que no se graba, que los clips se revisan, que no sirve para control, cómo oponerse y a quién dirigirse. **[Antonio: canal y responsable, decisión 165.]**
2. **Antes de cada visita:** aviso a la cuadrilla de esa haza el día anterior (desde la agenda, sin datos de las personas en el gemelo) — el corresponsal lo confirma con la casilla obligatoria de UX §4.10.
3. **Al llegar:** aviso verbal del corresponsal.
4. **Durante:** **chaleco o brazalete rotulado «Cámara en directo»** y la pantalla del móvil con el indicador; cartel temporal en la entrada de la haza si se emite más de un rato **[SUPUESTO: el cartel del art. 22 LOPDGDD es para videovigilancia; aquí sería voluntario]**.

## 10. Derechos

Información, acceso, rectificación, supresión, limitación y oposición **[SUPUESTO: arts. 15-22 RGPD, de memoria]**.
- **Oposición en el momento:** «no me grabes» → Pausar o reencuadrar, sin más. Es la medida que hace defendible el interés legítimo.
- **Clips:** quien salga en uno puede pedir que se borre o se recorte; propuesta: **se borra sin discutir**.
- **Directo:** no hay nada guardado sobre lo que ejercer acceso; sí sobre la auditoría (quién emitió y cuándo).
- **Canal y plazo:** pendientes de la decisión 165.

## 11. Lo que queda abierto (para Antonio y la asesoría)

1. **Base jurídica** para las personas trabajadoras en plano y para el corresponsal (§4); si hay representación de los trabajadores a la que informar.
2. **Quién ve el directo** (§6): solo inscritos de la visita (recomendado) o todas las familias; y los clips aprobados, solo la haza o todas.
3. **Plazos** (§7): 30 días pendiente, al momento rechazado, campaña y un año aprobado.
4. **Aviso** (§9): hoja anual, aviso previo y verbal, chaleco; ¿cartel?
5. **Desenfoque** (§8): ¿lo pide la asesoría como medida o basta con encuadre, pausa y revisión?
6. Lo heredado de la **decisión 165** (responsable, canal de derechos, región del VPS y contrato con OVH, EIPD de OlivarTrack).
7. Validación legal de todo lo marcado [SUPUESTO] / [NO VERIFICADO]. **Hasta entonces: ninguna emisión con personas trabajadoras reales**; las pruebas, con cámara simulada o encuadrando solo olivos sin nadie.

## Cuándo se rehace

Si se graba el directo; se abre el vídeo fuera de las guiadas; se añade desenfoque, reconocimiento o cualquier análisis de imagen; se usa el GPS en segundo plano (plan B nativo del ADR-0030); se publican clips fuera del gemelo; o cambia el alojamiento.
