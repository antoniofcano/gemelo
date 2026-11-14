# Re-verificación de las lentes 6 (interacción) y 10 (documentación)

Contra el árbol actual (main, 2026-11-14). Solo lectura. Rutas: `apps/web/src/...` (el legado `apps/web/motor/` ya no existe). Ejecutado: `node --test` de `documentacion.test.js` y `filas_puerta.test.js` (12 de 12 en verde). No se corrió Chrome, Docker, la puerta ni vitest.

Convención: ACEPTADO = `ACEPTADOS.md` lo propone y no se ha arreglado; su firma está «(pendiente)».

## Lente 6 · Interacción

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L6-01 | Medio | ABIERTO | `plantilla.css:349` solo escala `body`; `.hud` sigue a 14 px fijo (`:54`), `#menu` a 14 px (`:197`). PLAN A3-7a lo manda «al banco». |
| L6-02 | Medio | ABIERTO | `plantilla.css:346` sigue pintando todo el HUD con `background:#000 !important` y borde blanco, sin distinguir `aria-pressed`/`aria-expanded`. |
| L6-03 | Medio | ABIERTO | `Ajustes.movimientoReducido()` (`ui/ajustes.ts:101`) no tiene ningún consumidor; el tiempo lee solo la media query (`arranque.ts:585`). La media query (`plantilla.css:319`) sigue pisando «Normal». |
| L6-04 | Medio | ABIERTO | `mundos/comun/camara.ts` solo usa `pointer*`/`wheel` (líneas 41, 48); no hay `keydown` para girar, acercar o elegir. La tabla «Teclado» de la Ayuda no lo menciona. |
| L6-05 | Medio | ABIERTO | `comun/corro.ts:372` (`left:12px;top:56px;z-index:31`) y `comun/habla.ts:318` (`top:50px;z-index:31`) siguen sin sitio reservado; `Hud.zonasProhibidas` (`ui/hud.ts:74`) solo lista pad, barra, estado y botón de pasear. |
| L6-06 | Medio | ABIERTO | `comun/corro.ts:367-396`: la lista se vacía y rehace por completo cuando cambia `JSON.stringify(w)` (incluye quién habla), sin recuperar el foco (a diferencia de `ui/guiada.ts:323`). |
| L6-07 | Medio | DECISIÓN DE ANTONIO | Sin cerrar: ninguna fila de DECISIONS-PENDING trata el desbloqueo por el cliente (la 209 solo menciona «bloquear»). `corro.ts:326-328` sigue haciendo POST directo, sin confirmación; no hay `DELETE` de bloqueos en el cliente. |
| L6-08 | Medio | ABIERTO | `exterior/personalizacion.ts:299-300` y `:399-406`: «Denunciar» en VR envía al primer gatillo y solo emite `personalizacion:resultado`, que nadie escucha (grep en `apps/web/src`: solo el emisor). |
| L6-09 | Medio | ABIERTO | `plantilla.html:244` sigue diciendo «la cruceta va abajo a la izquierda…»; la tabla de atajos no trae `T`. |
| L6-10 | Medio | ABIERTO | `exterior/historia.ts:363` sigue saliendo con el foco en `BUTTON`; `ui/ventanas.ts:101` sigue enfocando `hSig`. |
| L6-11 | Bajo | ABIERTO | `comun/paseo.ts:107-115`: solo ignora INPUT/SELECT/TEXTAREA, no mira ctrl/meta/alt ni botones; Espacio y flechas siguen con `preventDefault`. (El HUD, `ui/hud.ts:203`, sí lo hace.) |
| L6-12 | Bajo | PARCIAL | `personalizacion.ts:312-316` ya lleva `aria-labelledby` al h2 (prueba `personalizacion.test.ts:55`). Faltan trampa de foco y devolver el foco al cerrar (`cierraPanel`, `:308`); el CHANGELOG lo declara «mitad». |
| L6-13 | Bajo | RESUELTO | `ui/guiada.ts:312-326` devuelve el foco al botón por su nombre accesible; lo vigila `ui/guiada.test.ts:70` («L6-13…»). |
| L6-14 | Bajo | ACEPTADO | `plantilla.css:352` sigue con `color:#fff` sobre `--olivo`. En ACEPTADOS (L6-14..18, 20..22, «una sola pasada de accesibilidad, tanda 7»); sin firma. |
| L6-15 | Bajo | ACEPTADO | `.ayuda` 11,5 px (`:113`) y `.hud-atrib` 11 px (`:108`) con `--hud-suave`, sin cambios. Propuesto; sin firma. |
| L6-16 | Bajo | ACEPTADO | `exterior/personalizacion.ts:457` sigue con `Math.max(0.25, …)`. Propuesto; sin firma (PLAN A3-7b2 lo manda «al banco»). |
| L6-17 | Bajo | ACEPTADO | `.h-punto` 14×14 (`plantilla.css:252`), botones del corro `min-height:32px`; sin cambios. Propuesto; sin firma. |
| L6-18 | Bajo | ACEPTADO | `plantilla.css:140` y `:305` siguen con `top: calc(var(--sa-t) + 112px)` sobre la fila «lo tuyo». Propuesto; sin firma. |
| L6-19 | Bajo | ABIERTO | `ui/ajustes.ts:179,195`: `ajReinicia` restablece al primer toque, sin confirmar (no está en ACEPTADOS). |
| L6-20 | Bajo | ACEPTADO | `ui/hud.ts:43` mantiene el comentario WCAG 2.1.4 sin ajuste para apagar o reasignar teclas. Propuesto; sin firma. |
| L6-21 | Bajo | ACEPTADO | `plantilla.html:29,74`: `aria-label` sin el texto visible («Cielo despejado», «© IGN-CNIG…»). Propuesto; sin firma. |
| L6-22 | Bajo | ACEPTADO | `comun/paseo.ts:98` pone `lienzo.tabIndex = 0`; `salePaseo` (`:101-104`) no lo quita. Propuesto; sin firma. |
| L6-23 | Bajo | ABIERTO | `CHANGELOG.md:180-181` siguen duplicadas, sin nota de comodidad de Quest/iPhone; ningún guardián vigila la regla 11. |

## Lente 10 · Documentación

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L10-01 | Medio | RESUELTO | `ONBOARDING.md` tiene ahora 42+ filas y la fila 31 es el guardián nuevo `pruebas/guardianes/filas_puerta.test.js` (cada `*.test.js` con su fila y viceversa); pasa en verde (191 guardianes). |
| L10-02 | Medio | ABIERTO | `ESTADO.md`: «Publicado» dice desplegado y Vigía encendido, pero «F1a en local… **Sin desplegar**», «Tiempo de Vigía… falta la URL y el token (V8)», «No probado: Vigía y OlivarTrack sin tokens» y «Espera a Antonio: Tokens de Vigía (V8)» siguen. |
| L10-03 | Medio | ABIERTO | `DESPLIEGUE-V2.md:5` («Nada de esto se ha ejecutado»), `doc/README.md:63,65`, `README.md:46`, `PUBLICACION.md:3` («más adelante, el VPS»), `PLAN.md:52,331,341` (F1a 🟡, V8 y V2 sin hacer) y decisión 126 («falta que Antonio ponga el valor») siguen en el tiempo previo al despliegue. |
| L10-04 | Medio | ABIERTO | `ESTADO.md:5` sigue con «p95 18,1 ms… peor fotograma 42-55 ms»; en `MEDIDAS.md` «42-55» no aparece y 18,1 es la séptima subida (`:631`, `:701` da 15,8-17,5). |
| L10-05 | Medio | ABIERTO | `ESTADO.md` conserva «three 0.128.0 … salida artefacto» (Fase 0), «aún no emiten `copas_id`» (F1b), «la artefacto sigue con la clásica», «Hituelo por regenerar con `copas_id`», «la artefacto carga three de jsDelivr» y «800 pruebas… 8 ADR y 11 skills» (hay 36 ADR y 10 skills). |
| L10-06 | Medio | ABIERTO | `PLAN.md:41` (P2 «✅»), `:42` (P3 Licencia con texto de otra fila) y `:45` (ADR-0009 «Propuesto», es Aceptado) sin tocar. |
| L10-07 | Medio | PARCIAL | `ARCHITECTURE.md` se reescribió por pasos del arranque (65 filas); aun así 11 de los 92 pasos de `arranque.ts` no se nombran (`01a_aparato`, `02g_vr_presupuesto`, `02i_materiales`, `02j_estaticos`, `02k_fusiona`, `02l_tope_tiles`, `12c_ir_a`, `34b_palanca`, `44b_carteles`, `48_vista_familia`, `53_mundo_hoy`). Ningún guardián lo cruza. |
| L10-08 | Medio | ABIERTO | `README.md:67` sigue diciendo «gatillo derecho teletransporte». |
| L10-09 | Medio | RESUELTO | La contradicción se registró: `ARQUITECTURA-MULTIUSUARIO.md:132` lleva la enmienda de ADR-0033; existen ADR-0033/0034/0035/0036 y las decisiones 223 (molino: glb horneado, *splats* después), 226, 233, 227 en DECISIONS-PENDING; el párrafo de `:130` está corregido. Sin guardián propio. |
| L10-10 | Medio | ABIERTO | `doc/sistema/` sigue conteniendo VIABILIDAD-REALISMO, VIABILIDAD-INTERACCION, IWSDK, ESCALA-NO-UNIFORME y MULTIVIEW; ninguno está en `historico/`. |
| L10-11 | Medio | ABIERTO | `CLAUDE.md` §2 (mapa del repo) sigue sin `apps/api/`, `infra/`, `apps/web/oficina|portada|olivo`. |
| L10-12 | Bajo | ACEPTADO | Sin cambios: CLAUDE.md y README solo dicen «three 0.186.1»; no mencionan `super-three` 0.185.0 del Quest ni `three` 0.128.0 del constructor. Propuesto (L10-12..24); sin firma. |
| L10-13 | Bajo | ACEPTADO | `README.md:10` y `:67-68` siguen diciendo que Quest no está medido. Propuesto; sin firma. |
| L10-14 | Bajo | ACEPTADO | Siguen tres duraciones: `README.md:55` (2-3 min), `ONBOARDING.md:15` (11-12 min) y `:94` (4 min 30 s, 151 comprobaciones). Propuesto; sin firma. |
| L10-15 | Bajo | ACEPTADO | `ONBOARDING.md:5` y `CLAUDE.md` §3 siguen con «`npm i` (solo `playwright-core`)». Propuesto; sin firma. |
| L10-16 | Bajo | ACEPTADO | `CONTRATOS.md` sigue sin `ot-hoy.*`, `eventos.schema.json`, `juegos-clasificacion.schema.json` (y ahora tampoco `olivos-haza-ejemplo.json`). Propuesto; sin firma. |
| L10-17 | Bajo | ACEPTADO | ADR-0017 y ADR-0022 siguen «Propuesto»; ADR-0008 conserva su estado compuesto. Propuesto; sin firma. |
| L10-18 | Bajo | ACEPTADO | `ESTADO.md` («Espera a Antonio») sigue citando «decisiones 163-169»; en DECISIONS-PENDING solo la 165 está abierta. Propuesto; sin firma. |
| L10-19 | Bajo | ACEPTADO | `ARQUITECTURA-MULTIUSUARIO.md:3` («sin implementar más allá de la fase 0») y `doc/README.md:55` («pendiente de estudio») sin tocar. Propuesto; sin firma. |
| L10-20 | Bajo | ACEPTADO | `.claude/agents/arquitecto-multiusuario.md:8,23,24` sigue con «propuesta», «three r128 y un solo `<script>` ES5» y «No hay servidor ni despliegue»; `CLAUDE.md:98` sigue mandando ejecutarlo antes de la fase 2. Propuesto; sin firma. |
| L10-21 | Bajo | RESUELTO | `doc/README.md:68-76` indexa la carpeta de la auditoría y `documentacion.test.js` pasa en verde (12 de 12). |
| L10-22 | Bajo | ACEPTADO | `documentacion.test.js:38` mantiene la regex `(src|pruebas|doc|contratos|datos|.claude)`: no vigila `apps/`, `tuberia/`, `infra/`. `UX-FINCA-JUEGO.md:372` (`35_mando.js`) y `VIABILIDAD-REALISMO.md:138` (`gbif.py`) siguen. Propuesto; sin firma. |
| L10-23 | Bajo | ACEPTADO | `MEDIDAS.md` sigue como «Referencia viva» con 790 líneas y 18 secciones «foto, no se mantiene». Propuesto; sin firma. |
| L10-24 | Bajo | ACEPTADO | `CHANGELOG.md`: «[No publicado]» ocupa las líneas 5-394 (~390) y la última versión sigue siendo 0.2.0. Propuesto; sin firma. |

## Recuento

| Lente | RESUELTO | PARCIAL | ABIERTO | ACEPTADO (sin firma) | DECISIÓN DE ANTONIO | Total |
|---|---|---|---|---|---|---|
| 6 | 1 | 1 | 12 | 8 | 1 | 23 |
| 10 | 3 | 1 | 8 | 12 | 0 | 24 |

Por severidad:
- Lente 6, medios (10): 9 ABIERTO (L6-01..06, 08, 09, 10) y 1 DECISIÓN DE ANTONIO (L6-07). Bajos (13): 3 ABIERTO (L6-11, L6-19, L6-23), 1 PARCIAL (L6-12), 1 RESUELTO (L6-13), 8 ACEPTADO.
- Lente 10, medios (11): 8 ABIERTO (L10-02, 03, 04, 05, 06, 08, 10, 11), 1 PARCIAL (L10-07), 2 RESUELTO (L10-01, L10-09). Bajos (13): 1 RESUELTO (L10-21), 12 ACEPTADO.

## No pude revisar

- iPhone, Quest y lectores de pantalla: nada de lo que depende de ellos (L6-17, L6-21, el foco real de L6-06, L6-10, L6-12) se puede confirmar sin ejecutar.
- No ejecuté Chrome ni vitest: los contrastes (L6-14, L6-15), las geometrías (L6-05, L6-18) y el efecto real de los ajustes (L6-01..03) se dan por no corregidos porque el código y el CSS siguen idénticos a lo que describía el hallazgo; no los volví a medir.
- Producción (L10-02, L10-03): comprobé la contradicción entre documentos, no el estado real del VPS ni de Vigía.
- ADR, skills y los cuerpos de `doc/sistema/` y `doc/operacion/` por dentro; solo leí las líneas citadas. En ONBOARDING noté de pasada filas con rutas del legado (por ejemplo `04b_escena3d.js`, `genera_motor`), fuera del alcance de estos hallazgos.
- Si Antonio firmó alguno de ACEPTADOS fuera del repo: el fichero dice «(pendiente)».
