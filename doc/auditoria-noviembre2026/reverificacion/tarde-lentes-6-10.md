# Re-verificación 2 de las lentes 6 y 10 (tarde del 2026-11-14)

Solo lectura (Read, Grep, git log). No se ejecutó nada: ni vitest, ni guardianes, ni Chrome. «Vigila» = la prueba existe y la leí; no la corrí. Rutas relativas al repo.

## Lente 6 · Interacción

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L6-01 | Medio | RESUELTO | `plantilla.css:28` escala la raíz con `--escala-texto`. Todo `font-size` de la hoja está en rem (grep de `font-size: …px` en `plantilla.css`, `plantilla.html` y `apps/web/src/**/*.ts`: 0 resultados fuera de `cx.font` de lienzos, que no son CSS). Vigila `pruebas/guardianes/ux_plantilla.test.js:126` (CSS y estilos en línea del cliente) y, en Chrome, `ajustes_ui.test.js:98` (duplica el tamaño). La prueba de Chrome no se ha ejecutado. |
| L6-02 | Medio | RESUELTO | `plantilla.css:356`: regla de alto contraste para `aria-pressed/expanded/selected/checked/current` con fondo blanco, texto negro y borde de foco. Vigila `ux_plantilla.test.js:139` (comprueba los cinco estados) y `ajustes_ui.test.js:99-103` (Chrome, no ejecutado). |
| L6-03 | Medio | PARCIAL | Cableado: transición al paseo (`arranque.ts:754` -> `transicion.ts:20,41`), tiempo (nubes, lluvia y viento: `arranque.ts:922` -> `Tiempo.paso.calma`), máquinas de los interiores (`interior/cableado.ts:65,193`). `plantilla.css:327` ya no pisa «Normal» y `:352` apaga las animaciones CSS con «Reducido». Vigilan `transicion.test.ts:25`, `cableado.test.ts`, `ajustes.test.ts:30` y `ux_plantilla.test.js:146`. **Falta:** los minijuegos leen solo la media query (`mundos/exterior/juegos.ts:218`), así que «Reducido» no les llega. El estado inicial de `Tiempo` (`arranque.ts:585`) y el botón de reproducir del tiempo (`tiempo-fichas.ts:206`) también salen solo del sistema (se corrigen en cuanto `alMovimiento` llama a `Tiempo.paso.calma`, pero `tPlay` ya queda oculto o visible según el sistema). La fauna y las aves ambientales no consultan el ajuste (sin verificar si se mueven por tiempo). El CHANGELOG (`:354`) dice «llega al mundo» sin esa salvedad. |
| L6-04 | Medio | RESUELTO | `mundos/comun/camara.ts:14-33` (`TecladoAereo`) y `:91-103` (escucha `keydown`). Sin choques: solo actúa si `!paseando` (el paseo y `TeclasPaseo`, `paseo.ts:128`, solo si `paseando`), ni con Ctrl/Alt/Cmd, campo, panel o `defaultPrevented`; con el recorrido de la historia cede las flechas. Las teclas HUD (`ui/hud.ts:45-56`: Esc, F1, 1-6, F, Inicio, 0, Intro) y las de `nucleo/teclas.ts:19-23` (L, H, M, F, C, V) no coinciden con las de la cámara. Q/E/WASD figuran «reservadas» para `12_paseo` en `teclas.ts:20-21`, pero la cámara no usa `Teclas.registra` (escucha propia) y solo corre fuera del paseo: sin conflicto real; PageUp, PageDown, `+` y `−` sí están reservadas para `09_camara` (`:23`). La Ayuda las documenta (`plantilla.html:233-238`). Vigilan `camara.test.ts:43,52` y `ux_plantilla.test.js:195`. |
| L6-05 | Medio | RESUELTO | `plantilla.html:38` (`#hudVoz`, bajo «lo tuyo» en `#hudEstado`); `corro.ts:421,466`, `habla.ts:317-319` y `ui/guiada.ts:154` lo usan; solo sin ese sitio vuelven al flotante antiguo (`top:56px`, `top:50px`). Vigila `ux_plantilla.test.js:203`. |
| L6-06 | Medio | RESUELTO | `corro.ts:422-458`: las filas se crean una vez y `ordena()` solo rehace la lista cuando entra o sale alguien, devolviendo el foco. Vigila `corro.test.ts:129`, pero con salvedad: comprueba `expect(botones()).toEqual(antes)` (igualdad estructural, no `toBe` por nodo), así que no distingue con certeza un nodo rehecho de uno reutilizado; conviene endurecerlo. |
| L6-07 | Medio | RESUELTO (decisión 239, ✅ 2026-11-14 en DECISIONS-PENDING `:265`) | `corro.ts:328-392`: confirmación (foco en «Cancelar»; lámina de VR con dos zonas), «Personas bloqueadas» en Configuración -> Voz (`:192`, `abreBloqueos`) con `GET` y `desbloquea` por `DELETE …/bloqueos/:prefijo`. La api tiene las tres rutas: `apps/api/src/presencia/corro_rutas.ts:250` (GET), `:256` (POST), `:271` (DELETE, 204) y `contratos/api.openapi.yaml:2028,2052`. Vigila `pruebas/guardianes/corro.test.js:512` (lista, desbloquear -> `DELETE` a la ruta correcta, la ficha también confirma, VR en lámina). En VR la lista no se abre (remite a la pantalla). |
| L6-08 | Medio | RESUELTO | `exterior/personalizacion.ts:291-310,428`: la primera pulsación arma «Confirmar denuncia» (8 s), la segunda envía y el resultado sale en la ficha de VR. Vigila `pruebas/guardianes/personalizacion.test.js:446`. |
| L6-09 | Medio | RESUELTO | `plantilla.html:233-238`: palanca, toque para ir andando, atajos con la T. Vigila `ux_plantilla.test.js:195`. |
| L6-10 | Medio | RESUELTO | `exterior/historia.ts:128-134,373`: `flecha()` vale con el foco en un botón y excluye campos, deslizadores, pestañas y menús. Vigila `historia.test.ts:63`. |
| L6-11 | Bajo | RESUELTO | `comun/paseo.ts:37-52`: nada con Ctrl/Meta/Alt, nada en campos, Espacio sobre botón/enlace es su clic, Espacio y flechas dentro de ventanas son suyos. Vigila `paseo.test.ts:35`. |
| L6-12 | Bajo | RESUELTO | `personalizacion.ts:320-341`: `aria-labelledby`, trampa de foco con Tab y Mayús+Tab, y el foco vuelve a quien abrió. Vigila `personalizacion.test.ts:55,67`. |
| L6-13 | Bajo | RESUELTO (ya estaba) | `ui/guiada.ts:312-326`; `ui/guiada.test.ts:70`. |
| L6-14 | Bajo | RESUELTO | `plantilla.css:17,51,52,193`: `--sobre-olivo: #14180f` sobre `--olivo`. Vigila `ux_plantilla.test.js:151`. Contraste calculado a ojo, no medido. No estaba firmado: se arregló. |
| L6-15 | Bajo | RESUELTO | `.ayuda` (`:119`) y `.hud-atrib` (`:114`) con `--hud-txt` sobre `--hud`. Vigila `ux_plantilla.test.js:151`. |
| L6-16 | Bajo | RESUELTO | `personalizacion.ts:235,483` (`opacidadRotulo`, mínimo 0,7). Vigila `personalizacion.test.ts:81`. |
| L6-17 | Bajo | RESUELTO | `.h-punto` mide 44 px y dibuja 14 (`plantilla.css:259-260`); sin `min-height:32px` en el corro. Vigila `ux_plantilla.test.js:157` (cualquier ancho o alto de un control por debajo de 44 px, con la excepción documentada de `.hud-atrib`, 24 px y oculto en táctil). |
| L6-18 | Bajo | RESUELTO | `plantilla.css:146-147,313`: ficha y baliza a `+162 px` bajo «lo tuyo» en táctil. Vigila `ux_plantilla.test.js:175` y `ajustes_ui.test.js:111-115` (Chrome, no ejecutado). `:140` (palanca, 120 px) y `:308` (minimapa, 116 px) quedan con otra altura sin comprobar. |
| L6-19 | Bajo | RESUELTO | `ui/ajustes.ts:216-217`: «Restablecer» pide una segunda pulsación en 8 s. Vigila `ajustes.test.ts:41`. |
| L6-20 | Bajo | RESUELTO | Ajuste «Atajos de una sola tecla» (`ajustes.ts:34,121,196`) leído por HUD (`hud.ts:51,210`), Teclas (`teclas.ts:14,30`; cableado en `arranque.ts:106`), paseo (`paseo.ts:47,89`) y cámara (`camara.ts:22,64`). Vigilan `teclas.test.ts:34`, `hud.test.ts:30`, `paseo.test.ts:35`, `ajustes.test.ts:41`. |
| L6-21 | Bajo | RESUELTO | Guardián `ux_plantilla.test.js:181`: `aria-label` contiene el texto visible y los botones solo de icono tienen nombre. |
| L6-22 | Bajo | RESUELTO | `camara.ts:88`: el lienzo es siempre una parada de tabulación y tiene función (teclado aéreo). Vigila `camara.test.ts:43`. |
| L6-23 | Bajo | PARCIAL | Duplicadas fuera (`awk | uniq -d` de líneas largas: 0). Notas de Quest e iPhone añadidas (`CHANGELOG.md:158,174,182,197`). **Falta:** `CHANGELOG.md:206` (OF10, anuncios en lámina de VR e invitaciones «Ir/Quedarme») sigue con «Probado en Node; Chrome y Docker pendientes», sin nombrar Quest ni iPhone. Sigue sin haber guardián de la regla 11. |

Aceptados de la lente 6: ninguno quedó firmado el 2026-11-14 (el párrafo de firma de `ACEPTADOS.md` solo firma L9-05, L5-03, L5-05, L5-06, L5-08(b), L5-09, L5-10, L5-11, L7-08, L7-11, L8-10 y L8-11, y dice que el resto «se arregla»). Los que estaban «ACEPTADO» por la mañana (L6-14..18, 20..22) están ahora arreglados, no firmados.

## Lente 10 · Documentación

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L10-02 | Medio | RESUELTO | `doc/ESTADO.md` dice desplegado desde el 2026-11-02, Vigía encendido el 2026-11-05 (con `[SUPUESTO]`), solo falta el token de OlivarTrack (decisión 17). Ya no hay «Sin desplegar» ni «Espera a Antonio: tokens de Vigía». |
| L10-03 | Medio | RESUELTO | `DESPLIEGUE-V2.md:5` («Ejecutado…»), `PUBLICACION.md:3`, `README.md:46`, `doc/README.md:63`, PLAN F1a, V2 y V8 en ✅ (`:52,331,341`) y decisión 126 ✅. |
| L10-04 | Medio | RESUELTO | `ESTADO.md:5` ya cita el p95 de 15,8-17,5 ms de la octava subida, que coincide con `MEDIDAS.md:696,701`; el ancla `#quest-3-con-la-octava-subida-2026-11-05-foto-no-se-mantiene` existe (`MEDIDAS.md:686`). |
| L10-05 | Medio | RESUELTO | Sin «three 0.128.0» de Fase 0, sin «800 pruebas / 8 ADR / 11 skills» ni «jsDelivr» en `ESTADO.md`. La cifra de pruebas la cuenta la puerta. |
| L10-06 | Medio | RESUELTO | `PLAN.md:41` P2 en 🟨 con su texto, `:42` P3 («todos los derechos reservados»), `:45` P5 con «ADR-0009 (Aceptado)». |
| L10-07 | Medio | RESUELTO | Los 93 pasos de `arranque.ts` aparecen en `ARCHITECTURE.md` (lo comprobé con un bucle, 0 sin nombrar) y `documentacion.test.js:112` lo cruza. |
| L10-08 | Medio | RESUELTO | `README.md:66-68` y `VR.md` coinciden en mandos (palanca derecha, giro, A, B, Y, grip). |
| L10-10 | Medio | RESUELTO | Los cinco estudios están en `doc/historico/`; sin enlaces rotos fuera de `historico/` (solo menciones sueltas por nombre en informes de la auditoría y `MEDIDAS.md:608`). |
| L10-11 | Medio | RESUELTO | `CLAUDE.md` §2 incluye `apps/api/`, `infra/`, `oficina/`, `portada/` y `olivo/`; todos existen. |
| L10-12 | Bajo | RESUELTO | `CLAUDE.md:3` y `README.md:3` citan three 0.186.1, super-three 0.185.0 y three 0.128.0. |
| L10-13 | Bajo | RESUELTO | `README.md:10,67-68`: Quest medido por Antonio (octava subida), sin repetir tras el refactor, iPhone no medido. |
| L10-14 | Bajo | RESUELTO | Una sola cifra de puerta (11-12 min) en `ONBOARDING.md:15,94`; `README.md:55` remite a ONBOARDING. |
| L10-15 | Bajo | RESUELTO | `CLAUDE.md:71` y `ONBOARDING.md:5` dicen `npm ci` y las `devDependencies`. Detalle cosmético: `README.md:43,55` siguen con `npm i`. |
| L10-16 | Bajo | RESUELTO | `CONTRATOS.md` cita `ot-hoy`, `eventos`, `juegos-clasificacion` y `olivos-haza-ejemplo`. |
| L10-17 | Bajo | RESUELTO | ADR-0008, 0017 y 0022 en «Aceptado»; ADR-0035 en «Propuesto» con su motivo. El índice y los ficheros de los 38 ADR coinciden, salvo la puntuación del estado de 0010 y 0035. |
| L10-18 | Bajo | RESUELTO | `ESTADO.md` dice que la 165 es la única abierta de la 163-169; `DECISIONS-PENDING` la marca 🟡 y marca las demás ✅. |
| L10-19 | Bajo | RESUELTO | `ARQUITECTURA-MULTIUSUARIO.md:3` («aceptada… desplegado desde el 2026-11-02») y `doc/README.md:50`. |
| L10-20 | Bajo | RESUELTO | `.claude/agents/arquitecto-multiusuario.md`: las premisas de r128, ES5 y «sin servidor» están marcadas «(Ya resuelto…)». |
| L10-22 | Bajo | RESUELTO | `documentacion.test.js:38` ahora vigila `apps`, `tuberia` e `infra`; ya no quedan `35_mando.js` ni `gbif.py` en `doc/sistema`. |
| L10-23 | Bajo | RESUELTO | `MEDIDAS.md:3` se presenta como «libro de registro» con sus secciones «foto, no se mantiene»; sigue con 790 líneas (aceptable, es registro). |
| L10-24 | Bajo | PARCIAL | `CHANGELOG.md:7` explica qué es «No publicado» (sin versión etiquetada), pero el bloque sigue ocupando ~440 líneas y la última versión es 0.2.0. Solo lo cierra una release. |

### Contradicciones nuevas o vivas (de los cambios de hoy)

1. `CHANGELOG.md:30` (entrada A3-7a, en «No publicado»): «Quedan para la ronda del banco L6-01, L6-03 y L6-04» está desfasada; hoy están arregladas (`:351-361`). Menor, pero falsa.
2. `doc/README.md` (bloque de la auditoría) sigue diciendo de `ACEPTADOS.md` «pendiente de firma», mientras ese fichero ya trae el párrafo firmado el 2026-11-14 por encargo de Antonio.
3. `CHANGELOG.md:354` afirma que «Movimiento: Reducido» llega al mundo; los minijuegos (`juegos.ts:218`) no lo reciben.
4. `README.md:43,55` usan `npm i` y `CLAUDE.md`/`ONBOARDING.md` usan `npm ci` (no contradictorio, pero dos formas para lo mismo).

## Recuento

| Lente | RESUELTO | PARCIAL | ABIERTO | ACEPTADO Y FIRMADO |
|---|---|---|---|---|
| 6 (23 ids; L6-13 ya estaba resuelto) | 21 | 2 (L6-03, L6-23) | 0 | 0 |
| 10 (20 ids revisados, sin L10-01, 09 ni 21) | 19 | 1 (L10-24) | 0 | 0 |

(La lista de la mañana de la lente 6 sin «RESUELTO» eran 22 ids, de los que 20 quedan RESUELTO y 2 PARCIAL; L6-13 se mantiene RESUELTO. En la lente 10 eran 20 ids, de los que 19 quedan RESUELTO y 1 PARCIAL.)

Por severidad:
- Lente 6, medios (L6-01..L6-10): 9 RESUELTO, 1 PARCIAL (L6-03). Bajos (L6-11..L6-23): 12 RESUELTO, 1 PARCIAL (L6-23).
- Lente 10, medios (L10-02..L10-11 sin 01 y 09): 9 RESUELTO. Bajos (L10-12..L10-24): 12 RESUELTO, 1 PARCIAL (L10-24).

## Lo que no pude comprobar

- Nada de lo que depende de Chrome se ejecutó: los estilos calculados, los contrastes y el efecto real de L6-01, L6-02, L6-03 y L6-18 los miran `ajustes_ui.test.js` (banco), no ejecutado. iPhone, Quest y lector de pantalla: sin comprobar.
- Las pruebas de Vitest y los guardianes citados los leí, no los ejecuté. La de L6-06 es débil (ver arriba).
- No verifiqué si la fauna ambiental se mueve con «Reducido» (solo que no consulta el ajuste).
