# Lente 9 — Seguridad y privacidad del repo público

Revisor de la lente 9, solo lectura. Commit `4ab0ae6` (clon superficial `--depth 1`). Ningún secreto ni dato privado se copia aquí: se da `fichero:línea` y el tipo de dato.

## Resumen (5 líneas)
1. No hay claves, tokens, correos reales, rutas locales, IPs públicas ni ids o enlaces de artefactos en lo versionado. `secretos.test.js` e `higiene.test.js` pasan (11/11) y un barrido aparte lo confirma.
2. Sí hay datos de la explotación que la regla 4 no permite: ids de parcela de OlivarTrack con número de polígono y parcela, nombres internos de parcela y coordenadas UTM exactas de elementos de Cerro (L9-01, L9-02).
3. La historia de Hituelo mete títulos de tareas y nombres de parcela de OlivarTrack en `innerHTML` sin escapar, y la CSP solo informa (L9-03, L9-04, L9-05). Las lecturas MCP sí se tratan como datos: lista cerrada de herramientas, lista blanca de campos, nada las ejecuta.
4. Autenticación sólida: `__Host-`, httpOnly, Origin en todo POST, hash SHA-256, WebAuthn con verificación de usuario y contador. El fallo está en LiveKit: un token ya firmado sigue valiendo hasta 15 min después de expulsar a alguien o sacarlo de un corro (L9-06).
5. `D.ot`, en el código versionado, no lleva datos por persona, pero el contrato no lo impide. El guardián de secretos no reconoce los nombres en español (`secreto`, `clave`), ni JWT, ni claves de LiveKit o Anthropic, ni coordenadas (L9-08, L9-09).

## 1. Qué revisé
- **Reglas y guardianes:** `.claude/skills/auditoria/{SKILL,lentes}.md`, `CLAUDE.md` (regla 4 y §5), `.gitignore`, ADR-0004, `pruebas/guardianes/{secretos,higiene,_util,historia_vivo}.test.js`. Ejecuté `secretos` e `higiene` con `node --test`.
- **Barridos sobre `git ls-files` (994 ficheros):**
  - claves y tokens: patrones del guardián, más JWT (`eyJ…`), `sk-`, `Bearer` y cadenas de alta entropía;
  - IPv4 públicas, dominios, `claude.ai`, correos, rutas `/home`, `/Users`, `/root`, `/mnt`;
  - coordenadas UTM y latitud/longitud, referencias de Catastro y SIGPAC;
  - cifras (ha, olivos, kg, €), nombres propios, DNI, teléfonos, IBAN;
  - metadatos EXIF, GPS y XMP de las imágenes versionadas: no llevan ninguno.
- **`D.ot` y fixture:** `contratos/indice.schema.json`, `tuberia/hituelo_conv.py`, `tuberia/finca_8_teselas.py`, `pruebas/genera_fixture.py`, `apps/api/pruebas/{grabaciones,vigia}/*.json`.
- **infra/:** `Caddyfile`, `bloque-borde.txt`, `compose.yml`, `livekit.yaml`, `entorno.ejemplo` y los equivalentes de `infra/dev/`.
- **api (`apps/api/src`):**
  - sesión, CSRF y logs: `app.ts`, `seguridad/{origen,cripto}.ts`, `registro.ts`;
  - autenticación: `auth/{servicio,almacen,roles}.ts`, `oficina/llaves.ts` (WebAuthn);
  - presencia y voz: `presencia/{livekit,rutas,voz_rutas,corro,corro_rutas,oficina_mundo}.ts`, `yo/rutas.ts` (alias);
  - lecturas en vivo: `vivo/lista-blanca.ts`, `ot/{lector,lector-mcp,hoy}.ts`, `vigia/lector-mcp.ts`;
  - correo: `avisos/correo.ts` (firma de baja).
- **Motor:** `37_red`, `38_presencia_compartida`, `39_oficina_mundo`, `43_agenda`, `45_voz`, `46_guiada` (tema de cierre), `47b_corro`, `49_avisos_correo`; además todos los `innerHTML` del motor (`14_historia`, `15_tiempo`, `19_balizas`, `13_parcelas`, `23_estacion`, `10b_capa_ndvi`) y `apps/web/herramientas/genera_motor.mjs`.
- **Contratos y documentación:** `contratos/{mcp,ot-hoy,presencia,livekit-roles}`, `doc/sistema/{LLAVES-DE-ACCESO,EIPD-*}.md`, `doc/operacion/{RUNBOOK-VPS,DATOS}.md` (por partes).

## 2. Hallazgos

[MEDIO] L9-01 · tuberia/datos/cerro/finca_1_ventana_orto.py:7-8 (también apps/web/motor/14_historia.js:233 y :263) — **Defecto:** en el código versionado están los identificadores de parcela de OlivarTrack de Cerro Velasco. Dos de ellos llevan el número de polígono y de parcela SIGPAC/Catastro, y van acompañados de los nombres internos de las parcelas. Uno de esos nombres internos está además escrito a mano en dos textos de la historia del motor. — **Escenario:** el repo es público. Con el polígono y la parcela, la provincia (Jaén aparece en el repo) y la latitud y longitud de `15_tiempo.js:134`, cualquiera localiza las parcelas en el visor SIGPAC y las asocia a Cano & Damas. Eso es un dato de la explotación (regla 4). Además, `DATOS.md:133` promete que el contorno se guarda «sin las referencias». No es un secreto, y los recintos SIGPAC son públicos: lo que el repo añade es el vínculo entre el titular y la parcela. Si eso es privado o aceptable lo decide Antonio; si lo considera privado, sube a CRÍTICO. — **Cómo se comprobó:** `git grep` de `polígono-[0-9]+-parcela-[0-9]+` sobre lo versionado. Los demás ids con esa forma que hay en la api (`loma-(polígono-9-parcela-8)`, `huerta/pozo`) llevan la marca «sintético» (`contratos/ot-hoy.md:31`). — **Por qué no lo vio ningún guardián:** `secretos.test.js` solo busca formatos de claves, extensiones de datos e ids de artefactos; no tiene patrón para referencias SIGPAC o catastrales ni para nombres de parcela.

[BAJO] L9-02 · tuberia/datos/cerro/paisaje_5_arroyo.py:18, paisaje_6_extrae.py:82, :99, :155; apps/web/motor/15_tiempo.js:134; pruebas/guardianes/dev.test.js:413 — **Defecto:** coordenadas exactas de la explotación en el código:
  - UTM 30N del recorte del arroyo de Cerro;
  - postes de una derivación del tendido y un frutal junto a la nave («correcciones de Antonio»);
  - latitud y longitud de la finca;
  - un centro UTM de Hituelo que encaja con sus hojas LiDAR, aunque la prueba dice que las copas son inventadas.

  — **Escenario:** sitúan las fincas, la nave y su acometida al metro. Su sensibilidad es baja, porque la ubicación de una explotación suele ser pública, pero contradicen «ni datos de la explotación» y otras pruebas usan centros ficticios (430000/4180000). — **Cómo se comprobó:** barrido de pares `4[0-2]xxxx, 41xxxxx` y lectura de las líneas. — **Por qué no lo vio ningún guardián:** no hay patrón de coordenadas; `DATOS.md` documenta las hojas LiDAR a propósito.

[MEDIO] L9-03 · apps/web/motor/14_historia.js:115-118 (`tabla()` sin escapar), :364, :377 → :455 (`innerHTML`) — **Defecto:** la historia de Hituelo (`ESCENAS_H`, desde :319) concatena en HTML sin escapar `t.titulo` (títulos de tareas de OlivarTrack) y `parcelas[k].nombre` / `f.nombre`, que salen del índice. `tabla()` no escapa ninguna celda. La línea :455 lo vuelca con `innerHTML`. En la historia de Cerro, en cambio, el título de la lectura en vivo sí se escapa (:215). — **Escenario:** alguien con escritura en OlivarTrack pone HTML en el título de una tarea o en el nombre de una parcela de Hituelo. Al regenerar Hituelo, `hituelo_conv.py:67` lo copia tal cual a `D.ot`. Cada hogar que abre esa escena ejecuta ese HTML en el mismo origen que la api. La cookie es httpOnly, pero ese script puede llamar a la api como el hogar, porque el Origin coincide. La CSP no lo para, porque solo informa (L9-05). La condición es realista solo si alguien no fiable escribe títulos; hoy los pone la oficina. Contradice `CLAUDE.md` §5 y `contratos/mcp.md:25` («el motor los escapa»). — **Cómo se comprobó:** lectura de :115-118, :364, :377 y :455, y del origen del dato (`hituelo_conv.py:67`). Para Hituelo no hay lectura en vivo (:471), así que entra solo la instantánea. — **Por qué no lo vio ningún guardián:** `historia_vivo.test.js:94-100` solo comprueba que existan tres llamadas `esc(…)` concretas, no que todo dato llegue escapado a `innerHTML`.

[BAJO] L9-04 · apps/web/herramientas/genera_motor.mjs:53 — **Defecto:** el `indice.json` se incrusta en `<script type="application/json" id="datos">` tal cual. Ni `json.dump` (Python) ni el generador escapan `</script` ni `<!--`. — **Escenario:** un texto del índice que contenga `</script>` (título o nombre, el mismo origen que L9-03) cierra el bloque y lo que sigue se interpreta como HTML de la página. Comprobado: `json.dumps({'t':'</script><b>'})` lo deja intacto. — **Cómo se comprobó:** lectura del generador y prueba de `json.dumps`. — **Por qué no lo vio ningún guardián:** `build.test.js` y `web.test.js` usan el fixture, que no tiene textos hostiles.

[BAJO] L9-05 · infra/Caddyfile:31 (e infra/dev/Caddyfile:33) — **Defecto:** la CSP es `Content-Security-Policy-Report-Only`. Está decidido y documentado (`DESPLIEGUE-V2.md:325`, `RUNBOOK-VPS.md:208`): se pasará a obligatoria tras 14 días sin informes. Pero hoy no da defensa en profundidad frente a L9-03 y L9-04. Por lo demás es estricta (`script-src 'self' 'wasm-unsafe-eval'`, `frame-ancestors 'none'`, `object-src 'none'`), y el Caddy añade HSTS, nosniff, `X-Frame-Options DENY`, COOP, CORP y una Permissions-Policy cerrada. — **Escenario:** el de L9-03. — **Cómo se comprobó:** lectura. — **Por qué no lo vio ningún guardián:** es un estado aceptado, no una regresión.

[MEDIO] L9-06 · apps/api/src/presencia/livekit.ts:25 y :151-159, :285-293; corro.ts:7 y :243; corro_rutas.ts:266-267; voz_rutas.ts:285-300 — **Defecto:** al expulsar, sacar de un corro o expulsar de una guiada, la api deja de **dar tokens nuevos** y saca las conexiones con `RemoveParticipant`. Pero el JWT de LiveKit ya firmado sigue valiendo hasta su `exp`: `TTL_S` = 15 min, y se puede reutilizar para reconectar. LiveKit no tiene revocación por token. `corro.ts:7` lo da por aceptable («el token dura TTL_S»). — **Escenario:**
  - Un hogar al que sacan de un corro (por aviso, suspensión, expulsión o bloqueo) guarda el token que pidió hace un momento, con un cliente modificado, y vuelve a entrar en `corro-<id>` durante hasta 15 min. Oye a los que siguen dentro, que creen que ya no está. Esto contradice «quien no tiene token no entra» (livekit.ts:53-56) y la mitigación R16 de `EIPD-VOZ.md:160`.
  - Lo mismo para un expulsado de la sala general (pose y chat) o de una guiada.
  - Tras `borraSala`, si `auto_create` sigue con su valor por omisión ([SUPUESTO]: `infra/livekit.yaml` no lo fija), ese mismo token vuelve a crear la sala.

  — **Cómo se comprobó:** lectura del firmado, de `Expulsados` y de `saleDentro`. No probado contra LiveKit real. — **Por qué no lo vio ningún guardián:** las pruebas usan un moderador y una sala de mentira (`corros.test.ts`, «sin ejecutar»). Ninguna reutiliza un token después de expulsar.

[BAJO] L9-07 · apps/api/src/yo/rutas.ts:15-16, :87; apps/web/motor/39_oficina_mundo.js:114 → 38_presencia_compartida.js:641 — **Defecto:** `RESERVADOS` solo rechaza la palabra exacta. Pasan «Ofícina», «La Oficina», «0ficina» u «Oficina 1» (probado con la expresión del código). En el chat, los anuncios de la oficina salen como «Oficina: …», con el mismo formato que una línea de cualquier visitante. — **Escenario:** un hogar con alias «Ofícina» escribe en el chat «Ofícina: la visita se cancela, entrad en …», que parece un anuncio oficial. La etiqueta 3D sí distingue a la oficina («◆», fondo verde y metadatos que pone el servidor); el chat no. — **Cómo se comprobó:** `node -e` con `PATRON_ALIAS` y `RESERVADOS`. — **Por qué no lo vio ningún guardián:** las pruebas de alias solo cubren las palabras exactas y los números de teléfono.

[BAJO] L9-08 · pruebas/guardianes/secretos.test.js:10-18, :21-22 — **Defecto:** el guardián tiene huecos:
  - «asignación de secreto» (:17) solo reconoce nombres en inglés (`api_key|secret|passwd|password|token`). El repo usa `secreto` y `clave` (`GEMELO_SESION_SECRETO`, `GEMELO_LIVEKIT_SECRETO`, `GEMELO_*_CLAVE`).
  - No reconoce JWT (`eyJ….…`), claves de Anthropic (`sk-ant-…`), el par clave/secreto de LiveKit (`LIVEKIT_KEYS: "API…: …"`) ni `Bearer <token>`.
  - `ARTEFACTO` no cubre `claude.ai/public/artifacts/…` ni enlaces `claude.ai/chat/…`.
  - No hay patrones de coordenadas ni de referencias SIGPAC o catastrales (L9-01, L9-02).
  - Solo mira el árbol de trabajo (`git ls-files -co`), nunca el historial.

  — **Escenario:** alguien pega `GEMELO_DEV_LIVEKIT_SECRETO=<40 caracteres>` en un `.md` o un `.yml` y la puerta pasa. — **Cómo se comprobó:** `node -e` con la expresión del guardián: falso para `GEMELO_SESION_SECRETO=…`, `clave: "…"`, `LIVEKIT_KEYS`, JWT, `sk-ant-…` y un enlace `public/artifacts`; verdadero solo para `token="…"`. — **Por qué no lo vio ningún guardián:** el guardián es el propio defecto.

[BAJO] L9-09 · contratos/indice.schema.json:33 — **Defecto:** el esquema de `ot` deja `tareas` y `fenologia` como `{"type":"array"}`, sin `items` ni `additionalProperties: false`. Hoy `D.ot` **no** lleva datos por persona: `hituelo_conv.py:67` copia una lista blanca (tipo, título, fecha, estado, avance, fuente, andados, objetivo) y el fixture va vacío (`genera_fixture.py:97`). Pero el contrato no lo impide. El intermedio de Cerro (`datos_cerro_embebido.json`) no tiene script en el repo (ADR-0004), así que no se puede comprobar qué lleva su `ot`. — **Escenario:** un exportador futuro añade `asignados` o los nombres de la cuadrilla y el contrato lo da por bueno. — **Cómo se comprobó:** lectura del esquema y de los tres productores. — **Por qué no lo vio ningún guardián:** `contratos.test.js` valida contra un esquema que lo admite todo dentro de `tareas`.

## 3. Respuestas a las preguntas
- **Claves, tokens y secretos:** ninguno. `infra/entorno.ejemplo` y los compose leen los secretos de ficheros de Docker. La clave pública de señuelo de `oficina/llaves.ts` es pública a propósito. `APIsintetica1` de las pruebas es un nombre de prueba.
- **Rutas locales:** ninguna (`C:\Users`, `/home/<x>/`, `/Users/`, `/root/`, `/mnt/`).
- **Correos:** solo `noreply@anthropic.com`, `@example.*` y `@canoydamas.invalid`. Una mención a «gmail» en `LLAVES-DE-ACCESO.md:29` es texto, no una dirección.
- **IPs:** solo de documentación (RFC 5737). **Dominios:** `gemelo.canoydamas.es` y `vigia.canoydamas.es` son públicos por diseño; `ssl0.ovh.net` está marcado [SUPUESTO]. Sin nombres de host del VPS ni su IP.
- **Ids internos y artefactos:** sin ids ni enlaces de artefactos (`ESTADO.md:10` cita «v20» sin id). Ids internos de OlivarTrack: los de L9-01, además de los sintéticos.
- **Cifras de la explotación:** las agregadas de `README.md:7` y `DISENO-2026-10.md` (ha, parcelas, ~olivos) están permitidas por la decisión 2. En lo versionado no hay kilos, euros ni producción. Las cifras del «albarán» de `14_historia.js:264` están rotuladas como inventadas.
- **Personas:** «Antonio» aparece como quien decide. Los demás nombres son sintéticos («PERSONA SINTETICA», topónimos de hazas inventados). Nada por trabajador. El texto de inyección de `prototipos/oficina/index.html:920` es un dato de maqueta a propósito, para probar «datos, no instrucciones»; no pide nada al agente.
- **¿`D.ot` lleva datos por persona?** No en el código versionado. Lo de Cerro no se puede verificar (L9-09).
- **Tokens y llaves:**
  - enlace de un solo uso, atómico, que caduca, guardado como SHA-256 (`auth/servicio.ts:46-78`);
  - sesión con caducidad absoluta y por inactividad, revocable, regenerada al entrar, cookie `__Host-gemelo` httpOnly, Secure y Lax (`app.ts:70-78`, `almacen.ts`);
  - WebAuthn con @simplewebauthn, `requireUserVerification`, origen y RP ID fijos, reto atado a una cookie y de un solo uso, contador que no baja y `userHandle` que debe coincidir (`oficina/llaves.ts:151`, :175, :308-385);
  - token de LiveKit HS256 firmado por el SDK, `ttl` de 15 min, sin `roomAdmin`, `canUpdateOwnMetadata: false`, metadatos e identidad HMAC puestos por la api, sala y permisos por papel;
  - la baja de avisos se firma con HMAC y se compara con `timingSafeEqual`. Hueco: L9-06.
- **CSP y CORS:** CSP estricta pero solo informativa (L9-05). No hay CORS: la api no manda `Access-Control-*` y todo método que cambia algo exige un `Origin` admitido (`seguridad/origen.ts`). Solo están exentos `csp-informe` y `avisos/baja`, que va firmada. `text/plain` está desactivado. Los registros redactan cookie, Authorization, `t`, `access_token` y correo, y recortan la IP a /24.
- **Qué puede hacer un usuario de una sala contra otro:**
  - publicar pose y chat de datos sin límite de ritmo en la red (no hay límite de mensajes; solo cabe que lo bloquees o que la oficina lo expulse);
  - escribir en el chat, que se pinta con `textContent` (38:641) y no inyecta;
  - suplantar visualmente a la oficina en el chat (L9-07);
  - volver a entrar con un token vigente tras ser expulsado (L9-06).

  No puede cambiar su nombre ni su rol en la sala, no puede abrir el micrófono de otro, no puede mandar los temas «anuncio», «sala», «balizas» ni «cierre» (el cliente descarta los que traen participante: `39_oficina_mundo.js:35`, `46_guiada.js:63`) y no publica audio fuera de corros y guiadas. `GET /api/presencia/corros` enseña a todos qué prefijos opacos van juntos; está documentado (`presencia.md:153`).
- **Lecturas MCP: ¿datos o instrucciones?** Datos.
  - La api solo llama a una lista cerrada de herramientas (`ot/lector.ts:6-26`) y, si el token deja ver herramientas de escritura, se niega a conectar (`lector-mcp.ts:27-32`; los prefijos de `lector.ts:15` cubren hoy todas las de escritura de OlivarTrack).
  - Copia los campos uno a uno por lista blanca, con textos recortados y sin caracteres de control (`vivo/lista-blanca.ts`, `ot/hoy.ts`).
  - Ningún componente del gemelo pasa esos textos a un modelo ni los interpreta, así que una inyección no puede «actuar». El único riesgo es cómo se pintan: el tiempo, las balizas y la historia de Cerro escapan; la historia de Hituelo no (L9-03).
- **¿El guardián de secretos cubre lo que debería?** Cubre los formatos clásicos, los ficheros de datos, las imágenes y los artefactos. Le faltan los nombres en español, JWT, LiveKit, Anthropic, coordenadas y referencias de parcela, y el historial (L9-08).

## 4. No verificado
- **Historial de git:** el clon es `--depth 1`. No sé si algún commit anterior llevó secretos, rutas, ids de artefactos, cifras o la versión sin anonimizar de `DISENO-2026-10.md` (decisión 2, «hecho bb52d50»). Hace falta un clon completo y `git log -p` o gitleaks sobre todo el historial. Si algo apareciera, sería CRÍTICO, porque el repo es público.
- **Servidor en vivo:** las cabeceras reales que devuelve el borde, que `/api/interno/*` no se alcance desde fuera, el `nmap` de `DESPLIEGUE-V2.md:282`, los permisos de `/run/secrets` y que el despliegue use de verdad `infra/Caddyfile`.
- **LiveKit en vivo (1.13.11):**
  - si un JWT reutilizado reconecta tras `RemoveParticipant` (L9-06);
  - el valor real de `auto_create`;
  - que `UpdateParticipant` despublique las pistas;
  - si hay algún límite de ritmo de datos por participante.
- **MCP en vivo:** las respuestas reales de OlivarTrack y Vigía con el token propio del gemelo (decisión 17, hoy apagado).
- **Contenido real de `ot_hituelo.json` y del intermedio de Cerro:** si traen HTML en títulos o nombres, o campos por persona.

## 5. No revisado
- `apps/web/oficina/*.js` en detalle (solo comprobé que no usan `innerHTML`), `apps/web/portada/*.js`, `apps/web/olivo/`.
- Las rutas de `admin/*`, `vida/*` (subida de fotos: tipo MIME, EXIF de las fotos que suben los hogares, retención), `hazas/*`, `agenda/*`, `juegos/*`, `medidas/*` y `config/*`, más allá de sus guardas de sesión.
- Las migraciones SQL (roles `gemelo_dueno`/`gemelo_api` y permisos por tabla), `infra/respaldo.sh` y `ensayar-restauracion.sh` (cifrado y destino de las copias), `.github/workflows/puerta.yml` (solo la miré por encima).
- Las dependencias npm y pip (CVE): no ejecuté `npm audit`.
- La EIPD como documento legal (solo crucé R16 con el código) y `ARQUITECTURA-MULTIUSUARIO.md`.
- El código de `prototipos/` (es HTML de maqueta; lo barrí entero con grep, pero no lo leí).
