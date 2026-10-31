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
- Fuera de F3: voz en la visita libre o por cercanía (decisión 157, recomendada «no»), vídeo del corresponsal (F4, tratamiento aparte que la EIPD debe incluir antes de abrirlo), clips (decisión 10).

Hoy **no existe**: todos los roles tienen `canPublish: false` en `contratos/livekit-roles.json` (v5) y no se acepta ninguna pista de micrófono (ADR-0026, comprobado contra LiveKit 1.13.11). Este borrador describe lo que se va a construir en F3c-F3i.

## 2. Finalidad

Que una visita guiada de hasta ~10 personas (hasta 40 hogares en la plataforma) pueda **oír al guía y a quien tenga la palabra**, para enseñar la finca y atender preguntas. Ninguna otra: no se usa la voz para perfilar, identificar, evaluar ni analizar a nadie, ni se transcribe.

## 3. Base jurídica — elección pendiente de Antonio

| Opción | A favor | En contra |
|---|---|---|
| **Consentimiento** (RGPD art. 6.1.a) **[SUPUESTO: art. citado de memoria]** | Encaja con el gesto explícito de abrir el micrófono; retirable al cerrarlo; es lo que ya dibuja la UX (aviso antes de hablar, indicador «● Tu micro está abierto»). Más fácil de explicar a las familias. | Debe ser libre, específico e informado y poder retirarse sin perjuicio; para la oficina y el guía (personal) no sirve como base, que sería la relación laboral o el interés legítimo **[SUPUESTO]**. Con menores exigiría consentimiento parental (ver §5). |
| **Interés legítimo** (art. 6.1.f) **[SUPUESTO]** | No depende de cada gesto; cubre a guía y oficina. | Exige ponderación escrita y derecho de oposición; la voz de una persona en una sala con desconocidos pesa en la balanza; difícil de defender para familias que solo oyen. |
| **Ejecución de un servicio** (art. 6.1.b) **[SUPUESTO]** | Si la visita es un servicio que las familias contratan o piden. | **[SUPUESTO]** Depende de qué relación hay con las familias (cuotas, adopción de haza): no está en el repo. |

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
- **Plazo: sin decidir.** La auditoría no tiene hoy plazo fijado (el ADR-0026 lo deja «a fijar en F3b»). **Propuesta: la campaña y un año más**, como los avisos e inscripciones (decisión 100), y después borrar o anonimizar. **[Antonio: ¿plazo de la auditoría de voz?]**
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

## Cuándo se rehace

Si se graba o transcribe algo; hay voz fuera de las guiadas (157); entran menores (45, 159); se añade un tercero (TURN, nube, transcripción); se amplía el vídeo del corresponsal (F4); cambia el alojamiento.
