# EIPD — ampliación a la voz en directo (F3b)

> **BORRADOR sin valor legal hasta que lo valide Antonio o quien lleve lo legal (asesoría).** Lo escribe un agente a partir de lo que dice el repo; no es asesoramiento jurídico. Lo que no está en el repo ni se ha podido comprobar va marcado **[SUPUESTO]** o **[NO VERIFICADO]**. Las referencias a normativa están **citadas de memoria y sin contrastar con el texto vigente**: quien valide las comprueba (RGPD, LOPDGDD y guías de la AEPD).

- **Estado:** borrador (2026-10-31), tarea F3b. Es la parte de voz de la «una sola EIPD con F3» (decisiones 41 y 102).
- **Base técnica:** [ADR-0026](../adr/0026-voz-y-moderacion.md) (Propuesto: varias de sus opciones siguen abiertas, decisiones 157-162).
- **Qué amplía, y qué no existe en el repo.** La «EIPD ya hecha para OlivarTrack» que menciona [ARQUITECTURA-MULTIUSUARIO](ARQUITECTURA-MULTIUSUARIO.md#privacidad-roles-y-moderación) **no está en este repo**: no se ha podido leer ni ampliar, y este borrador no la repite. Sí hay una base propia: la tabla «Datos personales (para la EIPD)» de [VIDA](VIDA.md#datos-personales-para-la-eipd) (fotos, nombres, denuncias, plazos 99 y 100) y las decisiones 41, 45, 93, 102. El documento final debe unir esas piezas y la de OlivarTrack en una sola EIPD **[Antonio: ¿dónde está la de OlivarTrack?]**.

## 1. El tratamiento nuevo

**Voz en directo en las visitas guiadas**, por la sala de LiveKit autoalojado en el VPS del proyecto:
- Solo en salas `guiada-<evento>` (una por visita, decisión 39), abiertas a los hogares inscritos en el evento (decisión 154).
- Habla el guía y la oficina (decisión 114); una familia habla solo cuando se le da la palabra (decisión 115), por turnos de tiempo limitado y con el micrófono abierto por un gesto suyo (propuesta del ADR-0026; decisiones 158, 160, 161 abiertas).
- **No se graba** (decisión 10): no se despliega Egress, la api no tiene ruta de grabación y no hay transcripción ni subtítulos automáticos (ADR-0026).
- Fuera de F3: voz en la visita libre o por cercanía (decisión 157, recomendada «no»; su ampliación en borrador, F3k, en el [§13](#13-voz-por-cercanía-f3k-borrador)), vídeo del corresponsal (F4, tratamiento aparte que la EIPD debe incluir antes de abrirlo), clips (decisión 10).

Hoy **no existe**: todos los roles tienen `canPublish: false` en `contratos/livekit-roles.json` (v5) y no se acepta ninguna pista de micrófono (ADR-0026, comprobado contra LiveKit 1.13.11). Este borrador describe lo que se va a construir en F3c-F3i.

## 2. Finalidad

Que una visita guiada de hasta ~10 personas (hasta 40 hogares en la plataforma) pueda **oír al guía y a quien tenga la palabra**, para enseñar la finca y atender preguntas. Ninguna otra: no se usa la voz para perfilar, identificar, evaluar ni analizar a nadie, ni se transcribe.

## 3. Base jurídica — elección pendiente de Antonio

| Opción | A favor | En contra |
|---|---|---|
| **Consentimiento** (RGPD art. 6.1.a) **[SUPUESTO: art. citado de memoria]** | Encaja con el gesto explícito de abrir el micrófono; retirable al cerrarlo; es lo que ya dibuja la UX (aviso antes de hablar, indicador «● Tu micro está abierto»). Más fácil de explicar a las familias. | Debe ser libre, específico e informado y poder retirarse sin perjuicio; para la oficina y el guía (personal) no sirve como base, que sería la relación laboral o el interés legítimo **[SUPUESTO]**. Con menores exigiría consentimiento parental (ver §5). |
| **Interés legítimo** (art. 6.1.f) **[SUPUESTO]** | No depende de cada gesto; cubre a guía y oficina. | Exige ponderación escrita y derecho de oposición; la voz de una persona en una sala con desconocidos pesa en la balanza; difícil de defender para familias que solo oyen. |
| **Ejecución de un servicio** (art. 6.1.b) **[SUPUESTO]** | Si la visita es un servicio que las familias contratan o piden. | **[SUPUESTO]** Depende de qué relación hay con las familias (cuotas, adopción de haza): no está en el repo. |

**Hecho en el código (F3j, 2026-10-31; [contrato](../../contratos/voz-consentimiento.md)):** la primera vez que una familia va a pedir la palabra, un aviso con «Aceptar» y «Ahora no» (qué se trata; tu voz en directo para la sala; no se graba; puedes dejar de hablar cuando quieras; enlace a la privacidad). Se guarda por hogar y **versión del texto** (tabla `voz_consentimientos`; si cambia el texto, se vuelve a pedir) y se puede retirar en Configuración o en el panel de VR. **El servidor no da la palabra a quien no ha aceptado** (`409 sin_consentimiento`, sin tocar LiveKit). **El texto del aviso es un BORRADOR pendiente de la asesoría** (así se dice en el propio aviso). Esto implementa la propuesta de abajo para las familias; no cierra la decisión 163 (guía y oficina siguen sin aviso, base por decidir).

**Propuesta del agente (no decisión):** consentimiento para las **familias** (se renueva en cada gesto de abrir el micro, con aviso previo) y, para el **guía y la oficina**, que lo valide la asesoría (relación laboral o mercantil con la empresa, interés legítimo). **[Antonio: ¿consentimiento, interés legítimo o mezcla? ¿Qué relación jurídica tienen las familias con la empresa?]**

## 4. Categorías de datos

| Dato | Naturaleza | ¿Se guarda? |
|---|---|---|
| **Voz** de quien habla (el sonido en directo) | Dato personal: una persona puede ser identificada por su voz o por lo que dice. | **No.** Viaja por la sala y solo se reproduce a los oyentes. **[NO VERIFICADO]** el cifrado exacto del transporte en el despliegue del VPS: lo confirma F3g/F3h. |
| **Contenido de lo dicho** | Puede incluir datos personales o delicados que alguien diga (salud, familia, nombres). | No se graba ni se transcribe. |
| **Quién tuvo la palabra y cuándo** | Metadato de moderación. | **Sí**, en la auditoría (§7). |
| Pose/avatar y alias en la sala | Ya tratados en F1/F2 (tabla de VIDA y presencia). | Fuera de esta ampliación. |
| IP y datos de conexión de WebRTC | Dato personal (**[SUPUESTO]** la IP lo es) que ve LiveKit al negociar la conexión. | **[NO VERIFICADO]** qué registra LiveKit en sus logs por defecto y cuánto: comprobarlo en F3g y fijar la retención de logs del VPS. |

**Voz y datos biométricos.** La voz es un dato personal. Es **dato biométrico en sentido estricto** (categoría especial, RGPD art. 9) **[SUPUESTO: citado de memoria]** solo si se trata con medios técnicos específicos para **identificar de forma unívoca** a una persona (plantilla de voz, reconocimiento de locutor). Este tratamiento **no hace eso**: no extrae plantillas, no identifica por la voz y no guarda audio. Aun así, **no grabar es lo que más reduce el riesgo** y debe mantenerse: si más adelante se grabara, transcribiera o aplicara cualquier análisis de voz, esta conclusión se revisaría. **[NO VERIFICADO]** la calificación jurídica final es de la asesoría.

## 5. Interesados

- **Familias titulares adultas** (hogares): oyen y, con turno, hablan.
- **Guía y personal de la oficina**: hablan en cada visita; son **personas trabajadoras** o colaboradoras de la empresa, con deber de información propio **[SUPUESTO: ajuste con el convenio y la política interna]**.
- **Otras personas que se oyen sin quererlo**: quien esté en la casa de una familia con el micro abierto (otros adultos, menores), por el sonido ambiente.
- **Menores.** Decisión 45: **solo cuentas adultas, no hay perfiles de menor**; decisión 159 (abierta, recomendada «no hablan»): tampoco voz de menores. Aun así un menor puede **estar cerca de un micro abierto** o hablar con la cuenta de un adulto: se mitiga con el aviso, el turno corto y el cierre automático, pero **no se elimina**. Si se reabren (opciones de la 159: perfiles que escuchan sin hablar, o voz con la palabra), harían falta consentimiento parental y comprobar la edad mínima aplicable en España **[SUPUESTO: art. 8 RGPD y 14 años en LOPDGDD art. 7, de memoria; verificar]**. **[Antonio: ¿se cierra la 159 como «no hablan» para esta EIPD?]**

## 6. Destinatarios y dónde se procesa

- **Destinatarios:** solo los demás participantes de la sala en ese momento (inscritos al evento, guía y oficina). **No hay terceros**: sin servicio de voz en la nube, sin transcripción externa, sin Egress.
- **Dónde:** LiveKit autoalojado en el VPS de OVH del proyecto ([ADR-0011](../adr/0011-alojamiento-en-el-vps-de-ovh.md), [ADR-0009](../adr/0009-plataforma-multiusuario-cuarenta-hazas.md)). **[NO VERIFICADO] que el VPS esté en un centro de datos de la UE:** ADR-0011 no lo dice y su descripción del VPS viene de la documentación de proyectos hermanos, no de inspeccionar la máquina; ARQUITECTURA-MULTIUSUARIO pide «proveedor con centro de datos en la UE por el RGPD». **[Antonio: región del VPS y contrato de encargado de tratamiento con OVH, si procede.]**
- **Transferencias fuera de la UE:** ninguna prevista. El motor solo habla con su mismo origen (regla del repo). **[NO VERIFICADO]** que LiveKit no use un TURN de terceros: si se añadiera uno externo, habría que revisarlo.

## 7. Conservación

- **El audio no se conserva**: no se escribe a disco ni a la base en ningún punto (ADR-0026, «Sin grabación»).
- **Metadatos de moderación** en la tabla `auditoria` (migración 0001 de la api: `hogar_id`, `accion`, `detalle` sin datos personales, `cuando`): acciones previstas `presencia.palabra_dada`, `palabra_quitada`, silenciar, expulsar, cerrar sala. Contienen **quién (hogar) y cuándo**, no qué se dijo. Al borrar el hogar la fila queda **anónima** (`ON DELETE SET NULL`).
- **Plazo (decisión 164, implementado en F3j; pendiente de que Antonio la cierre): la campaña y un año más**, como los avisos e inscripciones (decisión 100). Una fila de la auditoría de voz (`guiada.*` y los consentimientos retirados) se **borra** el 1 de octubre del segundo año tras la campaña (octubre a septiembre **[SUPUESTO]**) en que se escribió, con una tarea de la api cada 6 h ([contrato](../../contratos/voz-consentimiento.md)). **[Antonio: ¿confirmas la 164 y que la campaña va de octubre a septiembre?]**
- **Consentimiento guardado:** una fila por hogar (versión del aviso y fecha; nada de la voz) mientras el hogar exista y no lo retire; se borra con el hogar. Aceptar y retirar quedan en la auditoría (`voz.consentimiento_dado` y `voz.consentimiento_retirado`, con la versión).
- El **chat** de la sala no se guarda (decisión 40) y no cambia.
- Logs del servidor y de LiveKit: **[NO VERIFICADO]** contenido y rotación; deben fijarse y no contener audio.

## 8. Riesgos

Gravedad y probabilidad son juicio del agente, sin medir.

| # | Riesgo | Valoración |
|---|---|---|
| R1 | **Escucha por terceros en la sala**: alguien inscrito escucha lo que dicen otros, o una persona de la casa de una familia oye o es oída. | Media. La sala es cerrada a inscritos, pero entre inscritos no hay secreto. |
| R2 | **Moderación insuficiente**: insultos, acoso o contenido inadecuado en directo, sin grabación para probarlo. | Media. Sin grabación no hay prueba para una queja (consecuencia aceptada de la decisión 10). |
| R3 | **Menores**: cerca de un micro abierto o hablando por la cuenta de un adulto. | Media-alta si hay menores en la visita; las cuentas de menor no existen (decisión 45). |
| R4 | **Voz de personas trabajadoras** (guía, oficina, y gente del campo que se oiga de fondo en F4): presión para participar, exposición continuada. | Media. Requiere información y base propias. |
| R5 | **Micrófono abierto sin saberlo** (olvido, fallo de la interfaz, cliente modificado). | Media. El permiso lo da el servidor; el cierre es automático; hay indicador fijo. |
| R6 | **Uso indebido o re-identificación** si algún día se graba o transcribe. | Baja hoy (no existe); alta si se añadiera: por eso es un cambio que reabre la EIPD. |
| R7 | **Datos delicados dichos en voz alta** (salud, situación familiar). | Baja-media; no se guardan. |
| R8 | **Accesibilidad**: sin subtítulos, quien no oye queda fuera (ADR-0026). No es de privacidad, pero afecta al trato igual. | Media. |

## 9. Medidas (técnicas y organizativas)

**Decididas o previstas en el ADR-0026:**
- **El permiso lo da el servidor**: el token de la sala guiada solo da micrófono a guía y oficina; las familias lo reciben en vivo (`UpdateParticipant`) y se les quita al acabar el turno o antes; quitarlo despublica sus pistas. **[NO VERIFICADO en LiveKit 1.13.11]**: lo comprueba F3g.
- **Moderación en servidor y con auditoría**: silenciar, expulsar y cerrar sala por la api con la clave de servidor; ningún token de cliente lleva `roomAdmin`; **sin desmute remoto** (nadie abre el micro de otro).
- **Sala por evento con inscritos**: la api comprueba la inscripción contra la base al firmar el token.
- **Aviso de voz con consentimiento antes de pedir la palabra (F3j)**, por hogar y versión del texto, que se puede retirar cuando se quiera (Configuración o panel de VR), y **comprobado por el servidor** (sin él no se da la palabra);
- **Aviso antes de hablar** e **indicador fijo «● Tu micro está abierto»**; el micrófono se pide tras un gesto, explicándolo (decisión 43, UX); recomendación de auriculares.
- **Sin grabar, sin Egress, sin transcripción, sin terceros.**
- **Solo cuentas adultas** y solo cuentas de prueba hasta cerrar esta EIPD (decisiones 41, 45).
- **Aviso previo a las personas trabajadoras** de que se oirá su voz en visitas programadas (ARQUITECTURA-MULTIUSUARIO, «Privacidad, roles y moderación»).

**Pendientes que la EIPD final debe añadir:** texto de privacidad y normas (UX §4.5) con el apartado «Voz»; normas de la comunidad (qué se puede decir); procedimiento de queja sin grabación (qué hace la oficina: expulsar, anotar, avisar); registro de actividades de tratamiento; contrato con OVH; revisión de la retención de logs; medida de cuánto tarda en cortarse un micro abierto.

## 10. Derechos y cómo se ejercen

Información, acceso, rectificación, supresión, limitación, oposición y, si la base es el consentimiento, **retirada en cualquier momento** (cerrar el micrófono o salir de la sala; sin consecuencias). **[SUPUESTO: lista de derechos de los arts. 15-22 del RGPD, de memoria.]**
- **Como no hay audio guardado, acceso, rectificación y supresión de la voz no tienen objeto**; sí lo tienen para los **metadatos de la auditoría** (quién tuvo la palabra): la persona lo pide a la oficina y se responde desde `auditoria`; al borrar el hogar quedan anónimos.
- **Canal:** **[Antonio: correo o formulario para derechos, y responsable o delegado; no están en el repo.]** No se ponen aquí datos de contacto.
- **Plazo de respuesta y reclamación ante la AEPD:** **[SUPUESTO]** un mes (art. 12 RGPD) y reclamación ante la AEPD; verificar y redactar en la política.
- **Brecha:** procedimiento y plazo de notificación a la AEPD (72 h, **[SUPUESTO]**): sin escrito en el repo; añadirlo al RUNBOOK.

## 11. ¿Hace falta la EIPD? (nota)

La decisión 41 ya fija una EIPD con F3 y ARQUITECTURA-MULTIUSUARIO la prevé. Que sea **obligatoria** (RGPD art. 35 y la lista de la AEPD) **[SUPUESTO: no verificado]** lo valora la asesoría; el repo la hace de todos modos por la mezcla de voz, personas trabajadoras y posibles menores. Consulta previa a la AEPD solo si queda un riesgo alto sin mitigar **[SUPUESTO]**.

## 12. Lo que queda abierto para Antonio

1. **Base jurídica** (§3): ¿consentimiento, interés legítimo o mezcla? ¿Y para el guía y la oficina?
2. **Decisión 159** (menores y voz): ¿«no hablan», como recomienda el ADR-0026? ¿Y si hay un menor en la casa de una familia?
3. **Decisión 157** (dónde hay voz): solo guiadas; si cambia, esta EIPD se rehace (tratamiento continuo).
4. **Plazo de la auditoría de voz** (§7): ¿la campaña y un año más?
5. **Región del VPS y contrato con OVH** (§6); si LiveKit usa algún TURN externo.
6. **Quién es el responsable y el canal de derechos** (§10), y si hay delegado de protección de datos **[SUPUESTO: no se sabe si es obligatorio]**.
7. **La EIPD de OlivarTrack**: ¿dónde está, para unirlas?
8. **Procedimiento de queja sin grabación** (R2): qué hace la oficina.
9. **Personas trabajadoras**: información previa, y si el uso de su voz entra en el convenio o en la política interna.
10. **Validación legal** de todo lo marcado [SUPUESTO] / [NO VERIFICADO]. Hasta entonces: **solo cuentas de prueba** (decisión 41).

## 13. Voz por cercanía (F3k), borrador

> **BORRADOR para la asesoría (2026-11-05, tarea F3k-0).** Como el resto de este documento, **no es asesoramiento jurídico**: lo escribe un agente con lo que dice el repo; las referencias a normativa son de memoria y sin contrastar; lo que no está en el repo va **[SUPUESTO]**. **Actualización 2026-11-05 (F3k-1):** Antonio decidió construirlo ya, en paralelo a esta revisión (decisión 213), con la voz por cercanía **apagada por defecto** (210) y un aviso propio (211). Existe el código de la api (corros en salas `corro-<id>` solo de audio, `livekit-roles` v8), pero **apagado**: el interruptor general de la oficina nace apagado, el ajuste de cada cuenta también, y hasta cerrar esta EIPD solo con cuentas de prueba (41). El motor (F3k-2/3) aún no. `hituelo-libre` sigue con `canPublish: false` para todos: **ningún micrófono se abre en la sala libre**. Base técnica: [ADR-0032](../adr/0032-voz-por-cercania-en-la-visita-libre.md) (Aceptado el 2026-11-05: 210, 211 y 213 cerradas; 205-209 y 212 provisionales).

**Por qué va en este fichero y no en uno nuevo.** Es el **mismo tratamiento** (voz en directo de las familias, por el mismo LiveKit del VPS, con la misma base de consentimiento, sin grabar y con las mismas medidas técnicas), en un **contexto nuevo** (sin guía y con quien te encuentras); la decisión 41 pide una sola EIPD con F3, y la lista «Cuándo se rehace» de abajo ya nombra «voz fuera de las guiadas». El vídeo del corresponsal sí tiene fichero propio ([EIPD-CAMPO](EIPD-CAMPO.md)) porque trata otros datos de otras personas. Si la asesoría prefiere documentos separados por contexto, esta sección se mueve tal cual.

### 13.1 Qué se trata

Con la opción recomendada del ADR-0032 (**corro con aceptación**, K4):
- **Voz en directo** de los miembros de un **corro** (de 2 a 5 hogares que han aceptado hablar entre sí en la visita libre), solo para ellos y mientras estén cerca (se deja de oír a más de 20 m [PROPUESTA]). Sale cuando quien habla pulsa, y se cierra al soltar o volver a pulsar, tras 60 s en silencio o al salir del corro.
- **Lo que se trata y lo que se guarda** (nada con audio ni con el texto de lo dicho):

| Dato | Para qué | ¿Se guarda? |
|---|---|---|
| Voz y lo que se dice | que el corro se oiga | **No.** Ni grabación, ni transcripción, ni Egress |
| Corro en curso (quién está, desde cuándo) | dar y quitar los tokens de su sala | **No**: en memoria de la api; se pierde al deshacerse o al reiniciar |
| Auditoría `corro.*` (invitó, entró, salió, deshecho, suspendido) | atender un aviso: quién estaba con quién y cuándo | Sí: **quién (hogar), con quién y cuándo**; plazo propuesto, la campaña y un año más (decisión 212) |
| **Consentimiento de ámbito «cercanía»** con la declaración de adulto | base del tratamiento (como la 163) | Sí, por hogar y versión del texto (como F3j) |
| **Ajuste «Voz por cercanía»** (activada o apagada) | no recibir invitaciones ni pistas si está apagada | Sí, por cuenta |
| **Bloqueos de voz** (quién bloquea a quién) | que quien bloqueas no te invite ni entre en tu corro | Sí, mientras existan los dos hogares y no se quite; el bloqueado no lo ve |
| **Avisos a la oficina** (quién avisa, de qué hogar, cuándo, en qué corro, motivo y texto ≤ 280) | moderación sin guía | Sí; plazo propuesto, la campaña y un año más |
| Suspensiones de la voz por cercanía (de qué hogar, hasta cuándo, quién) | moderación | Sí, en la auditoría |
| IP y datos de la segunda conexión de LiveKit | WebRTC | Como en el §4: **[NO VERIFICADO]** qué registra LiveKit |

### 13.2 Riesgos nuevos frente a las guiadas

Gravedad y probabilidad, juicio del agente sin medir; la numeración sigue la tabla del §8.

| # | Riesgo | Por qué es nuevo | Valoración (con K4) |
|---|---|---|---|
| R9 | **Desconocidos**: voz con personas con las que no se ha quedado ni hay evento | en la guiada todos se inscribieron a lo mismo | Media con K4 (hay que aceptar); **alta con K1** (voz no pedida) |
| R10 | **Sin moderación en directo**: nadie corta un insulto mientras pasa, y sin grabación no hay prueba | en la guiada modera el guía | Media-alta. Queda el «salir» de cada uno y el aviso a posteriori |
| R11 | **Menores cerca**: un menor junto al micro de un adulto, o hablando con su cuenta, ahora con desconocidos y sin guía | en la guiada el guía oye y corta | Media-alta (decisión 45: no hay cuentas de menor, pero eso no evita al menor de la casa) |
| R12 | **Acoso**: invitar una y otra vez, seguir a alguien por el olivar, decir algo ofensivo y salir, volver con otra sesión | en la guiada es un rato y con turno | Media. Lo acotan aceptar, bloquear en el servidor, los límites y la suspensión |
| R13 | **Audio de terceros en casa**: lo que suena alrededor de quien habla (otra persona, la tele, una llamada) | en la guiada el micro se abre un turno de 2 min; aquí no hay turno | Media. Lo acotan pulsar para hablar y el cierre por silencio |
| R14 | **Tratamiento continuo**: cualquier día y a cualquier hora, sin acotar a una visita | la guiada es un rato con fecha | Media: es lo que obliga a ampliar la EIPD |
| R15 | **Datos de moderación**: un aviso o una suspensión sin prueba pueden ser injustos; la lista de bloqueos dice con quién no quiere hablar alguien | no existían | Media-baja; pide garantías (13.3) |
| R16 | **Escucha a escondidas o falsa sensación de privacidad**: alguien cree que nadie le oye, o alguien oye sin aparecer | en la guiada la sala es de inscritos | **Baja con K4** (solo oye quien tiene token del corro y sale en su lista); **alta con K1** (un cliente modificado oiría toda la sala) |

### 13.3 Medidas, por opción

| Punto (decisión) | Opción recomendada y su medida | Si se eligiera otra |
|---|---|---|
| Con quién (205) | **K4, corro con aceptación**: sin aceptar no se oye nada; el servidor firma el token de la sala del corro solo a sus miembros; lista visible de quién está; hasta 5 hogares; del corro no se guarda nada | K1: voz no pedida y la cercanía la impone el cliente (R9 y R16 altas); K2: un grafo de amigos guardado (dato nuevo persistente); K3: se oye a cualquiera que entre en la haza |
| Distancia (206) | invitar a menos de 8 m; dejar de oír a más de 20 m; el corro se deshace a más de 40 m durante 60 s [PROPUESTA] | radio único de 12 m (K1) |
| Micro (207) | **pulsar** (o mantener); se cierra tras 60 s de silencio, al salir del corro y al perder el permiso; indicador fijo «● Tu micro está abierto»; recomendar auriculares | P3 (abierto con detección de voz): capta la casa; descartada (B3 del ADR-0026) |
| Menores (208) | sin cuentas de menor (45) y **declaración de adulto** en el aviso; pulsar para hablar; el motivo «parece un menor» al avisar | sin declaración (M2) o no abrir F3k (M3) |
| Moderación (209) | silenciar, salir y **bloquear en el servidor**; **avisar** a la oficina, sin audio; la oficina **suspende** o expulsa y tiene un **interruptor general**; límites de invitaciones y suspensión automática con avisos de 3 hogares distintos en 7 días, **revisada por una persona** | Mo2: además, solo con la oficina conectada (piloto); Mo3: solo para uno, sin consecuencias |
| Quien no habla (210) | **apagada por defecto** (se activa con un gesto en Ajustes o en la tarjeta de la primera vez); icono de corro para quien está fuera («no les oyes y ellos no te oyen»); se apaga del todo en Ajustes, también en VR | activada por defecto (V2): el tratamiento empieza sin un gesto |
| Consentimiento (211) | **aviso propio** de la cercanía, por versión y ámbito; retirable cuando se quiera (retirarlo te saca al momento de cualquier corro) | el mismo de las guiadas: menos específico |
| Plazos (212) | auditoría y avisos, la campaña y un año más (como la 164); bloqueos, mientras existan los dos hogares; corros, nada | avisos, 6 meses tras resolverlos |
| Siempre | **sin grabar** (decisión 10), sin transcribir, sin terceros; solo cuentas de prueba hasta validar (41) | — |

**Garantías para quien recibe un aviso [PROPUESTA]:** la suspensión automática es provisional y la revisa una persona de la oficina; el hogar suspendido ve que lo está, hasta cuándo y cómo pedir que se revise; **no se le dice quién avisó**; la oficina toma el texto de un aviso como queja, no como prueba de lo dicho.

### 13.4 Base jurídica

Como la decisión 163: **consentimiento** de las familias (RGPD art. 6.1.a **[SUPUESTO: citado de memoria]**), con un **aviso propio** de la cercanía (decisión 211): libre (sin aceptar, la visita libre y el chat siguen igual), específico (solo corros), informado (con quién, sin moderación en directo, sin grabación, cómo avisar y salir) y **retirable** en Ajustes o en VR. Dos matices para la asesoría: aceptar cada invitación es un **consentimiento por corro** que refuerza el general pero no lo sustituye; y los datos de moderación (bloqueos, avisos, suspensiones) **[SUPUESTO]** encajarían mejor en el **interés legítimo** de mantener la comunidad segura que en el consentimiento (no tendría sentido que quien acosa «retire su consentimiento» para borrar el aviso contra él). El guía y la oficina no tienen papel propio en los corros: la oficina modera por la api.

### 13.5 Para la asesoría (lista corta)

1. **¿Basta el consentimiento, con aviso propio y aceptación por corro,** para un tratamiento continuo entre desconocidos? ¿Y qué base y ponderación llevan bloqueos, avisos y suspensiones (¿interés legítimo?)?
2. **Menores:** ¿basta la declaración de adulto en el aviso, con pulsar para hablar, o hace falta otra medida (verificación de edad, horarios, perfiles de menor)? ¿Qué edad aplica en España **[SUPUESTO: 14 años, LOPDGDD art. 7, de memoria]**?
3. **Moderar sin prueba:** ¿se puede suspender por avisos sin grabación? ¿Qué garantías mínimas (aviso al suspendido, revisión, recurso)? ¿Se puede no decir quién avisó ante un derecho de acceso?
4. **Plazos** de avisos, bloqueos y auditoría de corros (la propuesta de la 212).
5. **Terceros en casa:** qué hay que decir en el aviso y en la política sobre las personas que se oyen de fondo.
6. **Responsabilidad por lo que dicen otros** en una voz entre usuarios: normas de la comunidad y si hay obligaciones de prestador de un servicio de intermediación **[SUPUESTO: no se sabe si aplica el Reglamento de Servicios Digitales]**.
7. **¿Consulta previa a la AEPD** si R10 y R11 quedan en riesgo medio-alto tras las medidas (§11)?

### 13.6 Lo que queda abierto para Antonio

Las decisiones **205-213** de [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md) (con quién, distancia, micro, menores, moderación, apagado por defecto, consentimiento, plazos y orden) y, como en todo el documento, la **165** (responsable, canal de derechos, contrato con OVH, TURN, la EIPD de OlivarTrack), que también cierra esta sección.

## Cuándo se rehace

Si se graba o transcribe algo; hay voz fuera de las guiadas (157); entran menores (45, 159); se añade un tercero (TURN, nube, transcripción); se amplía el vídeo del corresponsal (F4); cambia el alojamiento.
