# Estado del gemelo

Único sitio de «dónde estamos y qué falta». Se toca solo cuando el estado cambia (no en cada commit). Lo hecho se cuenta en el [CHANGELOG](../CHANGELOG.md); el rumbo, en [PLAN](rumbo/PLAN.md).

**Versión: v0.2.0** · **Al día a: 2026-10-30** · **Prototipo**: funciona en Chrome con renderizado por software y sin errores de consola; el rendimiento en iPhone y Quest **no está medido**.

## Publicado

- **Nada publicado de forma estable desde este repo.** Existe un artefacto desechable de la prueba de plataforma (privado; su enlace no se guarda en el repo público). Hay que borrarlo cuando proceda (**pide confirmación**).
- Un gemelo anterior (v20) vive como artefacto de claude.ai y no se ha tocado.

## Hecho

- Motor por teselas de 256 m con niveles de detalle: terreno (1/2/8 m), olivos (L0/L1/L2 con silueta de olivo) y nube LiDAR ([ADR-0001](adr/0001-teselas-256m-utm30.md), [ADR-0002](adr/0002-niveles-de-detalle.md)).
- Color del suelo y NDVI en el sombreador; suelo abierto con detalle de la ortofoto ([ADR-0007](adr/0007-suelo-abierto-de-la-ortofoto.md)).
- Cola de trabajos a rebanadas con presupuesto por fotograma.
- Historia parametrizada por finca: 11 escenas para Cerro y 10 para Hituelo (`14_historia.js`); desde 2026-10-28 la historia de Hituelo **se muestra** (`tuberia/hituelo_conv.py` emite `sin_historia = false`; hay que regenerar `indice.json` para que llegue a una página ya exportada). Sin lectura en vivo en Hituelo.
- Suelo nuevo, más realista, integrado en `apps/web/motor/` (ADR-0007 Aceptado): relieve por bump, caminos y rodadas, hierba de cartulinas con atlas de briznas, flores y espigas.
- Modo VR ([VR.md](sistema/VR.md)), con su mock de WebXR y la prueba completa ya en el repo; probado solo con el mock ([ADR-0005](adr/0005-webxr-perfil-propio.md)).
- **Fase 0 del plan multiusuario** (2026-10-28): monorepo (`apps/web/motor/`, `tuberia/`), build con Vite y three 0.128.0, y la web empaquetada dibuja lo mismo que la salida artefacto (guardián `web.test.js`). CI escrito (`.github/workflows/puerta.yml`), **sin ejecutar** porque no se ha hecho `push`.
- **F1b** (2026-10-29): hueco del constructor de olivos-tipo (`Catalogo`, ids y tipos por árbol, contrato `olivos-tipo`); con tipo −1 los recuentos de dibujo no cambian (medido). Probado solo con el catálogo sintético en SwiftShader; los exportadores aún no emiten `copas_id`/`copas_tipo`.
- **Entorno local con Docker** (2026-10-29): web + teselas por Caddy, PostGIS, LiveKit (`--dev`) y buzón; e2e real en verde (el mundo carga con 0 errores servido desde `/teselas`). Desde el 2026-10-29, **la api está enchufada**: el recorrido de entrada (enlace mágico, sesión y hazas con lista blanca) funciona y está probado en local de punta a punta por https (e2e `GEMELO_DOCKER=1`, 8/8). Falta la pantalla de entrada de la UX y que el mundo pinte las lindes; no probado en Firefox, Safari, iPhone ni Quest. Desde el 2026-10-29 usa los roles de producción (`gemelo_dueno`/`gemelo_api`, decisión 55; e2e 10/10) y tiene un interruptor `--red-local` para probar en aparatos por la WiFi (probado solo desde el propio equipo; no probado en ningún aparato real).
- **F2, parte sin servidor** (2026-10-29): códec de pose (24/56 B, ≤ 5 mm y ≤ 0,25°), interpolación y avatares instanciados con `?presencia=sim` (+5 llamadas con 10 o 40 visitantes, SwiftShader). Desde P1-P3: tokens, expulsión y cliente con `?presencia=red` hechos; P4 hecha en local: dos Chrome en la sala (transporte p95 7 ms, mismo equipo), mismo hogar en dos sesiones, expulsión y permisos verificados contra LiveKit 1.13.11; con 40 clientes se satura el i5; **probada por Antonio entre dos aparatos reales por la WiFi el 2026-10-29: se ven, se escriben y la posición llega a tiempo** (el avatar remoto flotaba y no andaba: P5); nada probado en iPhone ni Quest.
- **F1a en local** (2026-10-29): `apps/api` + `infra/` de producción + `tuberia/hazas`; 51 pruebas de la api (21 contra PostGIS en contenedor), `infra/probar-caddy.sh` y ensayo de copia/restauración con datos sintéticos en verde. **Sin desplegar**; no probados el VPS, el borde real, el SMTP de OVH, el MCP real de OlivarTrack (formas de respuesta supuestas) ni `age`/`rclone` reales ([RUNBOOK-VPS](operacion/RUNBOOK-VPS.md)). Despliegue preparado (V1): [RUNBOOK-VPS](operacion/RUNBOOK-VPS.md) con lista previa y vuelta atrás, y `infra/comprobar-despliegue.sh`; pendiente de las respuestas de Antonio y de A5/A6.
- **Interfaz de juego** (2026-10-30, U1-U8, decisiones 83-90): visor a pantalla completa, HUD y barra de iconos, ventanas una a la vez, Configuración, chat y minimapa movibles, pantalla completa y teclas de juego, panel VR en pestañas, mandos y manos reales en VR (I6). Solo Chrome sin pantalla y WebXR simulado: **no probado en iPhone, Android ni Quest**.
- **Tiempo de Vigía** (2026-10-30): `/api/tiempo` (actual medido y previsión de 72 h) en el HUD, la ventana, el mundo y una lámina en VR; **falta la URL y el token de Vigía** (V8): hoy, datos de prueba.
- **La vida de las hazas en la api** (2026-10-30, V3, decisiones 91-103): ids de olivo congelados, nombre/foto/pintura en los árboles, denuncias, bandeja, diario, avisos, lotes y eventos; sin pantallas todavía; fotos solo con cuentas de prueba hasta la EIPD (F3).
- **Olivos por masa visual** (2026-10-30, O9a-O9c, decisiones 80-82): misma copa para todos, escalón por píxeles con banda de fundido, hojas que no se deshacen de lejos; tope de ortofotos (M4) y suelo de fondo (M6).
- **Propuestas aceptadas** (2026-10-30): `/oficina` (OF0-OF13, decisiones 104-116) y arquitectura de componentes (ADR-0023, C1-C12, decisiones 117-124; C1-C3 en curso).
- **T8 fase 2** (2026-10-30, decisión 79, ADR-0021): la escena 3D Tiles es la única (fuera `04_terreno.js` y `?escena=`); se retira la salida artefacto: el gemelo solo se sirve desde el servidor (local y VPS); lo publicado antes en claude.ai queda como última foto.
- **T8 fase 1** (2026-10-30, ADR-0015 Aceptado, decisión 77): la escena 3D Tiles es la de por defecto cuando el índice trae `tileset`; la de siempre con `?escena=clasica` durante una versión; la salida artefacto sigue con la clásica. Medida del banco con el fixture pendiente; Quest y escritorio con GPU, no probados.
- **Avatares VRM en el motor** (2026-10-30, P7c, ADR-0020): `26b_avatares.js`, los más cercanos con su VRM (6 escritorio, 3 móvil/Quest) y el resto muñeco; paseante = avatar en tercera persona. Medido solo en Chrome headless con VRM sintéticos; P7e (aparatos) pendiente.
- **F1d, criterios 2-4 del ADR-0015 cumplidos en local** (2026-10-30, T6b; SwiftShader; Quest y escritorio reales sin probar).
- **F1d** (2026-10-29): tubería 3D Tiles con identidad por instancia (contrato tileset v1; desde el generador 0.3.0, contrato v2: raíz sin contenido sobre el nivel de 512 m y `_TIPO` con los nombres del catálogo, probado con el fixture; Hituelo por regenerar con `copas_id`, visor sin probar con la raíz vacía) y **Hituelo real generado y validado** (0 errores, 0 avisos; 269 glb, 40,9 MB; criterio 1 de ADR-0015 hecho). Sin medir aún en dibujo (motor, paso 3); Quest no probado. Antes: **F1d** (prototipo, 2026-10-29): tubería 3D Tiles 1.1 hecha y medida solo con el fixture (validador de CesiumGS sin errores; visor: lejos 2 llamadas/4,4 k tri, cerca 10/19,9 k, SwiftShader). Falta Hituelo real, integrarla en el motor (tras F1c) y Quest. ADR-0015 Propuesto.
- **Hituelo v3** (2026-10-29): salida de referencia con `copas_id` (5.882, todos provisionales), `copas_param` y `copas_semilla`; el tileset casa por `copas_id` (`comprueba.mjs`, 0 errores). Con `?olivos=gen` salen 2 olivos generados en ~7 min por rebanadas en SwiftShader: no probado en aparatos ni con trabajador.
- **Olivos generados** (2026-10-29, ADR-0017 Propuesto): constructor «olivo-2» en `apps/web/olivo/` y enganchado en el motor detrás de `?olivos=gen` (lote de 6-7 llamadas; fixture de Hituelo de cerca 47 llamadas / 546 k tri). Hituelo tiene `copas_param` medido desde las LAZ (5.874/5.882; copa ≈ 1,13 × 2·r8) en un índice aparte, aún sin cargar en el motor. `factorR8 = 1` casi dobla los triángulos del motor (medido con la escala fija; causa sin localizar). No probado en aparatos ni con Hituelo real.
- **Ids estables por árbol** (2026-10-29): los exportadores emiten `copas_id`/`copas_tipo`; hoy **todos los ids son provisionales** (por posición) porque las marcas de OlivarTrack no traen el id del olivo. Falta ese campo en la exportación de OlivarTrack (CONTRATOS §1.1).
- **F1c** (2026-10-29): three 0.186.1 (ADR-0016): motor en color y luz modernos; la artefacto carga three de jsDelivr con importmap. Aspecto nuevo aprobado por Antonio; en VR el relieve fino del suelo se apaga si el fotograma va justo. No probado en iPhone, Quest ni en un artefacto publicado.
- Repositorio público con las fuentes unificadas y este sistema de trabajo: puerta con ~140 comprobaciones (`npm run puerta`; 138 en la última vuelta en main, unos 11 min con la máquina cargada), fixture sintético, contratos, 8 ADR y 11 skills.

## Datos

| Finca | Contenido |
|---|---|
| Cerro Velasco | 5 parcelas, 7,1 ha, ~1.080 olivos en 12 teselas |
| Hituelo | 4 fincas, 27 parcelas, 95 ha, ~5.900 olivos detectados frente a 5.961 declarados, 46 teselas |

Fuentes: LiDAR PNOA 3.ª cobertura (vuelo 2024), MDT 0,5 m, ortofoto PNOA 2022 (copas ~1,1–1,4 m al este), NDVI Sentinel-2 (48 fechas), SoilGrids. Detalle y licencias: [DATOS.md](operacion/DATOS.md).

## Sin comprobar en hardware real

- fps en iPhone y Quest; mareo y comodidad del panel VR.
- Lecturas en vivo por MCP (OlivarTrack, Vigía): [contratos/mcp.md](../contratos/mcp.md).
- Rodadas del suelo a 0,5 m/px (salen suaves). Alternativa: ortofoto a 0,25 m solo en teselas con caminos, +~2 MB.
- Generadores y `fetch` de ficheros en Safari iOS.

## Pendiente

- **Prueba en aparatos** (decisión 57): navegador, móvil y Quest, cada uno por su cuenta en Hituelo real con los olivos generados. Falta P7 del constructor, `copas_param` de Hituelo (desde las LAZ) y el código corto para entrar en las Quest (decisión 61).
- **Medir 10 olivos en campo con cinta** (plantilla de `tuberia/factores_campo.py`, rama del constructor): cierra el paso a `factorR8 = 1` (decisión 48) y los factores reales del LiDAR (49).
- Portada y pantalla de entrada de la UX en `apps/web` (decisión 56) y lindes de las hazas en el mundo.
- Fundido entre niveles de olivos.
- Frutales sin marcar en Hituelo (el LiDAR no los distingue).
- Historia de Marín Hituelo (sin trabajos ni fenología en OlivarTrack).
- Tres teselas del borde norte con cobertura incompleta si faltan las hojas 404-4181 y 406-4181.
- Estabilizar la prueba VR completa con el mock: con SwiftShader la página se cae («Target crashed») tras ~25 pasos; es opcional en la puerta (PLAN P4).
- **Arquitectura multiusuario «Cuarenta hazas»** ([ARQUITECTURA-MULTIUSUARIO](sistema/ARQUITECTURA-MULTIUSUARIO.md), [ADR-0009](adr/0009-plataforma-multiusuario-cuarenta-hazas.md), Aceptado): fases y estado en [PLAN](rumbo/PLAN.md). Nada se despliega en el VPS hasta que funcione y esté probado en local (decisión 21).
- Borrar el artefacto desechable de la prueba de plataforma (con confirmación).
- Más: [DECISIONS-PENDING](rumbo/DECISIONS-PENDING.md).

## Riesgos

- Presupuesto de dibujo en dispositivos móviles (Hituelo de cerca llega a 1,4 M triángulos en SwiftShader: [MEDIDAS](sistema/MEDIDAS.md)).
- Los intermedios de Cerro (`datos_cerro_embebido.json`) no se producen con ningún script del repo: regenerar Cerro desde cero no está garantizado.
