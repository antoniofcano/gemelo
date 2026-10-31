# Plan

Mapa de iniciativas con su estado y el ADR que las sostiene. **No** es el estado del día ([ESTADO](../ESTADO.md)) ni la crónica ([CHANGELOG](../../CHANGELOG.md)). Se toca solo cuando una iniciativa cambia de estado. Leyenda: ✅ hecho · 🟨 en marcha · ⏸️ aparcado · ⬜ sin empezar · 🚫 decidido no hacerlo.

## Línea maestra: de Cerro Velasco a las fincas de Hituelo

| Tramo | Qué | Estado |
|---|---|---|
| 1 | `Mundo` con una «tesela cero» y luego teselas de 256 m | ✅ ADR-0001 |
| 2 | LOD de terreno, olivos y nube; cola con presupuesto | ✅ ADR-0002 |
| 3 | Hituelo (46 teselas, 27 parcelas), calidad Alta | ✅ ADR-0003 |
| 4 | VR con perfil propio | 🟨 hecho con mock; falta casco real · ADR-0005 |
| 5 | Medir en dispositivo real (iPhone, Quest) | ⬜ |
| 6 | Publicar con ficheros de apoyo (prueba 0 completa) | 🟨 «a medias» · ADR-0008 |

## Motor y gráficos

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| M1 | Suelo abierto con detalle de ortofoto | ✅ | ADR-0007 (Aceptado): el suelo nuevo sustituye al anterior |
| M2 | Suelo realista en la rama de producción | ✅ | integrado el 2026-10-28; desde T8 el suelo se sombrea sobre el tileset (`04d_sombreado_tiles.js`); falta medir presupuesto con datos reales |
| M3 | Fundido entre niveles de olivos (dither/histéresis) | 🟡 | resuelto en la escalera por O9c (banda de ± 1,5 m e histéresis, decisión 82); el sistema viejo L0/L1/L2 sin bandera sigue con salto y desaparece cuando la escalera pase a ser la de por defecto (tras O8d) |
| M4 | LRU fina de ortofotos decodificadas | ✅ | ✅ 2026-10-30 (`02_mundo.js`): tope por aparato con LRU; ahorro sin medir en una finca grande ni en aparatos |
| M5 | Rodadas del suelo a 0,25 m/px solo en teselas con caminos | ⏸️ | +~2 MB; esperar a ver si hace falta |
| M6 | Huecos entre teselas sin datos | ✅ | ✅ 2026-10-30 (`04e_suelo_fondo.js`): suelo de fondo, 1 llamada; sin mirar en lomas reales |
## Datos y contenido

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| D1 | Frutales sin marcar en Hituelo | ⏸️ | el LiDAR no los distingue |
| D2 | Historia de Marín Hituelo | ⏸️ | sin trabajos ni fenología en OlivarTrack |
| D3 | Hojas 404-4181 y 406-4181 (borde norte) | ⬜ | 3 teselas con cobertura incompleta |
| D4 | Portabilidad de los exportadores | ✅ | `os.path.join` en `tuberia/`; guardián multiplataforma; sin ejecutar con datos reales fuera de Windows |
| D5 | Producir `datos_cerro_embebido.json` con un script del repo | ⬜ | hoy es un intermedio sin origen versionado |

## Proceso y calidad

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| P1 | Sistema de trabajo: guardianes, contratos, ADR, skills | 🟨 | este andamiaje |
| P2 | Primera auditoría completa (skill `auditoria`) | ✅ código y pruebas de Node; dos navegadores, en P4 | tras estabilizar los guardianes |
| P3 | Licencia | ✅ chat en el motor, expulsión en la api; integración sin ejecutar | decisión de Antonio |
| P4 | Estabilizar la prueba VR con el mock | 🟨 | `mock_xr.js` y `prueba_vr.js` recuperados e incluidos; la prueba completa se cae con SwiftShader tras ~25 pasos (opcional con `GEMELO_VR=1`) |
| P6 | Sustituir código casero por librerías (regla 12): ✅ validador de esquemas → `ajv`; pendiente: servidor estático de las pruebas → librería y revisar el resto | 🟨 | |
| P5 | Arquitectura multiusuario «Cuarenta hazas» | 🟨 | estudiada; plan por fases aprobado (abajo); ADR-0009 (Propuesto) |

## Multiusuario: fases (plan aprobado el 2026-10-28; decisiones de Antonio en DECISIONS-PENDING)

| Fase | Qué | Estado | Listo cuando |
|---|---|---|---|
| F0 | Monorepo + build Vite (three 0.128.0), CI de la puerta | ✅ en local (commit f32fae8); CI sin ejecutar hasta el primer push | la web dibuja lo mismo que la artefacto |
| F1a | Una persona en el VPS (solo Hituelo): api, Postgres+PostGIS, hazas propias, enlace mágico por SMTP de OVH, portada pública y resto tras sesión, ficha de haza (sin titular, sin kilos), CSP, copias | 🟡 hecho y probado en local de punta a punta (api, PostGIS, enlace mágico con buzón local, portada y entrada, lindes en el mundo, roles de producción, `--red-local` con aparatos reales); falta el VPS: G1 y V2 (decisión 21), SMTP de OVH y token de OlivarTrack | hogar de prueba entra y ve las hazas; restauración ensayada |
| F1b | Hueco del constructor de olivos-tipo: `Catalogo`, id y tipo por árbol, contrato `olivos-tipo` | ✅ en local · ADR-0012 | con `tipo=-1` se ve igual (medido); glb de fixture dentro de presupuesto |
| F1c | three moderno (0.186.1, módulos ES), aceptando el aspecto nuevo | ✅ en local · ADR-0016 · aspecto aprobado (decisiones 23-25) | puerta verde; capturas nuevas aprobadas por Antonio |
| F1d | Escena en 3D Tiles 1.1 + 3DTilesRendererJS (decisión 11): tubería glb + `tileset.json`, terreno, olivos, construcciones; supera ADR-0001/0002 | 🟡 casi: ADR-0015 **Aceptado** (decisión 77), criterios 1-4 cumplidos en local (T6b); escena 3D Tiles por defecto (T8 fase 1); T8 hecha (escena 3D Tiles única, salida artefacto retirada, decisión 79); falta T7 (criterios 5-6 en el Quest) | Hituelo en escritorio y Quest con el presupuesto medido de nuevo; Quest p95 ≤ 13,9 ms |
| F2 | Presencia compartida (LiveKit); token propio de OlivarTrack; se retira la salida artefacto | 🟡 hecho en local y probado por Antonio entre dos aparatos por la WiFi: LiveKit, pose, chat, expulsión, quad/dron, «Ir con», balizas, minimapa con personas, panel Gente en VR, avatares VRM (P7a-P7d); falta P7e (avatares en aparatos) y la salida al VPS; la salida artefacto se retira en T8 (decisión 79) | escritorio y Quest se ven y escriben; pose p95 < 250 ms |
| F3 | Voz y visita guiada; no se graba el directo | ⬜ partida en F3a-F3i (2026-10-31); empieza por F3a y F3b | 10 personas limpias; el guía modera |
| F4 | Corresponsal de campo como PWA | ⬜ | visita con corresponsal; error de posición medido |
| F5 | Aula, puzles, dron, museo; constructor de olivos real | ⬜ | según sus ADR |
| UX | Propuesta de acceso, configuración e interacción + maqueta (`prototipos/ux/`) | ✅ aprobada como base (decisiones 43–47); marca aplazada | se construye en F1a (portada, entrada, código corto de las Quest) y F2 |
| Olivos generados | Constructor «olivo-2» como módulo (`apps/web/olivo/`, ADR-0017 Propuesto): un árbol por olivo con semilla guardada y medidas del LiDAR (`copas_param`) | 🟡 en main: constructor, caché, hornero mixto (ADR-0018 Aceptado), escalera con impostores tras `?olivos=escalera` (ADR-0019 Aceptado, fase A); probado por Antonio en el móvil; falta O8d y O9 (escalones por masa visual, decisión 80), O2 y la cinta de campo (O4) | olivos generados en Hituelo real dentro del presupuesto de cada aparato; `factorR8 = 1` tras la cinta de campo (decisión 48) |

**Un solo mundo (decisión 22):** el mundo multiusuario es Hituelo (un origen de coordenadas, una sala de LiveKit por visita); Cerro Velasco queda como finca de pruebas y maquetas.

**Despliegue (decisión 21):** no se despliega en el VPS hasta que haya algo funcional y probado en local: `npm run dev:arriba` con la api enchufada, el mundo cargando servido desde `/teselas`, y el recorrido completo de entrada (correo → enlace mágico en el buzón de pruebas → sesión → ficha de haza) probado de punta a punta.

Tareas sueltas decididas: ✅ anonimizar `doc/historico/DISENO-2026-10.md` (decisión 2) · ✅ exportadores multiplataforma (decisión 8, D4).

## Tablero de tareas (desde el 2026-10-29)

Las fases, partidas en tareas con sus dependencias. **Orden de lanzamiento:** primero las ligeras que desbloquean a otras, en paralelo; lo que pasa por Chrome o Docker (🔶), al final y por el [banco de pruebas](../operacion/TESTING.md#banco-de-pruebas-un-solo-chrome-o-docker-a-la-vez-política-desde-el-2026-10-29); 👤 = lo hace Antonio. Estado: ✅ hecho · 🟡 en curso · ⬜ por hacer.

**Enrutador de modelo** (en «Tipo»): **opus** para motor, sombreadores, seguridad o una decisión con alternativas (ADR); **sonnet** para tareas acotadas y bien especificadas (contratos, tuberías, servicios, pruebas, medidas, documentación); **haiku** para búsquedas, recuentos y comprobaciones mecánicas. Un agente que sigue una tarea por mensaje conserva su modelo.

| Id | Tarea | Depende de | Tipo | Estado |
|---|---|---|---|---|
| D1 | Hituelo v3: `copas_id`, `copas_tipo`, `copas_semilla`, `copas_param` (fuera del repo) | — | ligera | ✅ (salida de referencia de Hituelo) |
| A1 | Código corto para vincular las gafas: api, contrato y pruebas unitarias | — | ligera | ✅ (e2e con Docker en verde) |
| A2 | Portada y pantalla de entrada (UX) en `apps/web` | — | ligera | ✅ (e2e con Docker en verde) |
| A3 | Entorno local sirve Hituelo v3 con los olivos generados (cliente web con `gemelo-olivo`) | D1 | ligera | ✅ e2e 13/13 con Hituelo v3; tileset por Caddy y aparatos reales, sin probar |
| A4 | Lindes de las hazas en el motor (el «3c») | — | ligera; 🔶 al medir | 🟡 2026-10-31: código y Node (`44_lindes.js`); falta por el banco `lindes_chrome.test.js` (medida y capturas) y `dev.test.js` (Docker) |
| A5 | e2e de entrada completa: portada → enlace → mundo con lindes; gafas → código → sesión | A1, A2, A4 | 🔶 Docker | ✅ fixture (Hituelo v3 sin pasar por la e2e) |
| A6 | **Prueba en aparatos** (navegador, móvil, Quest; decisión 57) | A1, A2, A3 | 👤 | 👤 lista para Antonio; y con `--red-local` y `?presencia=red`, ordenador + móvil + Quest a la vez (DESARROLLO-LOCAL, «Prueba en aparatos con Hituelo v3») |
| T1 | F1d 3b: terreno 3D Tiles en el motor (`04b_escena3d.js`, `?escena=tiles`), código | — | ligera | ✅ en main (sin medir: T3) |
| T2 | Tileset de Hituelo regenerado con el generador 0.3.0 desde D1 | D1 | pesada de CPU, sin Chrome (72 s) | ✅ 248 glb, 0 errores |
| T3 | F1d 3b: medir con el fixture y con Hituelo; raíz vacía visible de lejos | T1, T2 | 🔶 | ✅ cerrada con T6b: raíz vacía y relieve con el fixture y con Hituelo (0 de 5.638 rayos sin relieve) |
| T4 | F1d 4: olivos del tileset con máscara (de cerca, los del motor y los generados) | T1 | ligera; 🔶 al medir | ✅ en navegador: 189 de 350 apartadas de cerca, ninguno doble |
| T5 | F1d 5: sombreado (nubes, escarcha, NDVI, suelo) sobre el tileset | T1 | ligera; capturas 🔶 → 👤 | ✅ aprobado por Antonio (decisión 67) |
| T6 | F1d 6-7: presupuesto y VR con el simulador | T3, T4, T5 | 🔶 | ✅ cerrada con T6b: criterios 1-4 del ADR-0015 en local (lejos Hituelo 98 llamadas); VR simulada con tiles |
| T7a | Medidor para T7: `&mide=60` registra 60 s de fotogramas y enseña mediana, p95 y peor (y el nivel del perfil) en el panel de VR y en `?debug`; se guarda para leerlo luego | — | ligera · **sonnet** | ✅ `30_mide.js` + protocolo en VR.md; falta usarlo en el Quest (T7) |
| T6b | F1d: criterios 2, 3 y 4 del ADR-0015 en local | T6 | ligera · **opus** | ✅ nubes en una llamada (lejos Hituelo 98 llamadas), vuelo sin huecos (0 de 5.638 rayos), relieve dentro del error declarado |
| T7 | F1d 8: Quest real (p95 ≤ 13,9 ms) | T6 | 👤 | ⬜ |
| T8 | F1d 9: la escena nueva por defecto; se retira la vieja | T6 (T7 o «no probado», decisión 35) | ligera | ✅ 2026-10-30: fase 1 (3D Tiles por defecto) y fase 2 (escena única, salida artefacto retirada, decisión 79) |
| P1 | F2: la api firma tokens de LiveKit (`POST /api/presencia/token`, `livekit-server-sdk`, roles del contrato) | — | ligera | ✅ |
| P2 | F2: el motor publica y recibe la pose con `livekit-client` (sustituye a la red simulada) | P1 | ligera | ✅ `?presencia=red`; probado con dos Chrome en P4 |
| P3 | F2: chat por el canal de datos y moderación mínima (expulsar con auditoría, decisión 42) | P1 | ligera | ✅ chat y expulsión; probados contra LiveKit real en P4 |
| P4 | F2: dos Chrome en la misma sala (p95 < 250 ms) y 40 clientes ligeros | P2, P3 | 🔶 Docker + Chrome | ✅ en local (transporte p95 7 ms; 40 clientes saturan el i5: medir LiveKit con carga desde otra máquina) ; **probado por Antonio entre dos aparatos reales por la WiFi (2026-10-29): se ven, se escriben y la posición llega a tiempo**; el avatar remoto flotaba y no andaba (P5) |
| P5 | F2: avatares remotos que andan (piernas y brazos según la velocidad) y con los pies en el suelo de este mundo | P4 | ligera · **opus**; 👤 a ojo | ✅ código, Node y Chrome headless (+5 llamadas con 10 o 40); falta verlo en aparatos |
| P6 | F2: los demás ven si vas en quad o dron (modo en la pose, quad/dron bajo el avatar remoto, icono en el minimapa) | P5 | ligera · **opus** (con I1) | ✅ pose v1 con el modo; quad y dron remotos |
| P7a | Avatares VRM: ADR (catálogo cerrado, presupuesto, nivel de detalle VRM cerca / muñeco lejos, animación por huesos sin ficheros, avatar en los metadatos de LiveKit, VR, licencias) | P5 | ligera · **opus** | ✅ [ADR-0020](../adr/0020-avatares-vrm.md) (**Aceptado**: decisiones 73-76) |
| P7b | Avatares VRM: tubería del catálogo (optimizar con gltf-transform, topes de triángulos y peso, servir por Caddy tras sesión) | P7a | ligera · **sonnet** | ✅ tubería, esquema, 4 CC0 provisionales (fuera del repo), Caddy; sin ver en navegador |
| P7c | Avatares VRM: motor (`@pixiv/three-vrm`, animación por huesos con la fórmula de P5, quad/dron, nivel de detalle con el muñeco, fundido) | P7a | ligera; 🔶 al medir · **opus** | ✅ 2026-10-30: `26b_avatares.js`, reparto por aparato con histéresis, geometría y texturas compartidas, paseante = avatar; Chrome headless con 6 VRM sintéticos: +30 llamadas, ≈ +29 k triángulos. Falta P7e (aparatos y topes) |
| P7d | Avatares VRM: elegir avatar en la portada con vista previa | P7b | ligera · **sonnet** | ✅ portada y api; falta la e2e con Docker y aparatos |
| P7e | Avatares VRM: medir con 10 y 40 personas en el banco; móvil y Quest | P7c, P7d | 🔶 · **sonnet**; 👤 | ⬜ |
| I1 | Presencia en el minimapa (quién está conectado y dónde) e **ir con alguien** (desde Gente o tocando su punto del minimapa; en VR con fundido) | P5 | ligera · **opus**; 👤 a ojo | ✅ Node; falta verlo en aparatos (en VR aún no hay botón) |
| I4 | Balizas como puntos de encuentro: en el minimapa y en la ficha de la baliza, «aquí están: … ¿Ir a esta baliza?» y llegada junto a ella | I1, I3 | ligera · **opus** (con I1) | ✅ Node; falta verlo en aparatos |
| I5 | VR: «Ir con» (panel Gente) e «Ir a esta baliza» (su ficha) pulsables con el rayo | I1, I3, I4 | ligera · **opus**; 👤 Quest | ✅ WebXR simulado; falta el Quest |
| I2 | La brújula oculta o muestra el minimapa | — | ligera | ✅ |
| I3 | Teletransporte desde el aire: en VR desde el vuelo y en ordenador y móvil con el **dron** (toque corto en el suelo pone el anillo, «Aterrizar aquí» te deja de pie allí); una sola pieza para los tres aparatos | — | ligera · **opus**; 👤 Quest | ✅ con WebXR simulado y Chrome sin pantalla; falta Quest, iPhone y Android |
| O1 | Olivos generados: transición suave al acercarse (forma y luz; materiales con nubes y escarcha del motor) | — | ligera; 🔶 al medir | ✅ medido: 2 generados de cerca, 40 llamadas / 545 k (aspecto, 👤) |
| O2 | Olivos generados: desglose del coste de `factorR8 = 1` por objeto | — | 🔶 | ⬜ |
| O3 | `semillas_copas.py` dentro de los exportadores | — | ligera | ✅ |
| O5 | Olivos generados: caché de recetas (memoria con límite y LRU; IndexedDB con clave semilla+tipo+época+`GEN_VERSION`, `idb-keyval`); horneado en servidor, más adelante y tras medir tamaños | o1d (montaje y recorte arreglados) | ligera | 🟡 2026-10-30: caché hecha y endurecida (plazo, purga por versión, expulsar libera, propiedades; Node en verde); falta medirla en Chrome por el banco (`olivo_cache_chrome.test.js`); horneado en servidor, aparte |
| O6 | Medir el horneado por tesela (tamaños por nivel, cuantizado y brotli, manifiesto, descarga de una visita, tiempo) | — | ligera (Node) | ✅ (MEDIDAS: 6,5–7,1 GB por época; un paseo podría bajar 78–555 MB si cada olivo cercano tuviera receta propia) |
| O7a | ADR-0018 «hornero»: formato de la receta horneada (cuantización, compresión, ¿E0 también?), manifiesto por tesela, direccionado por huella, ciclo de vida (época actual + siguiente, vuelo nuevo, censo, `GEN_VERSION`), plan B en la salida artefacto | O6 | ligera · **opus** | ✅ ADR-0018 **Aceptado** (decisión 65): variantes E2/E2-VR horneadas, propios en el aparato; manifiesto por finca |
| O7b | Contrato y esquema del manifiesto por tesela y de la receta horneada, con su fixture y guardián | O7a | ligera · **sonnet** | ✅ contrato + 2 esquemas + horneado.js; calendario de partida (Antonio lo ajusta) |
| O7c | Hornero en Node (CLI): hornea una finca o una tesela a ficheros por huella + manifiesto; incremental (solo lo que cambia); época actual y siguiente | O7b | ligera (pesada de CPU, sin Chrome) · **sonnet** | ✅ 16 objetos, 4,44 MB, 9,3 s desde cero y 0,9 s sin cambios |
| O7d | Servir las recetas: Caddy en `/teselas/<finca>/olivos/<huella>` con caché inmutable y el manifiesto con la tesela, tras sesión; dev y producción | O7b | ligera · **sonnet** | ✅ e2e con Docker; producción probada con Caddy suelto, no en el VPS |
| O7e | Motor: carga el manifiesto con la tesela y **descarga** las recetas en vez de calcularlas (con la caché de O5); si falta una, la calcula (plan B) | O7b | ligera · **opus** | ✅ en el banco: 6 de 6 en 53 s horneadas frente a 1 de 6 en 183 s calculadas; mismo aspecto |
| O7f | Servicio «hornero» en Docker (`infra/dev`, luego producción): se dispara por cambio de época (calendario), índice nuevo o `GEN_VERSION`; registro y salud | O7c | ligera · **sonnet** | ✅ servicio en dev (e2e del hornero en verde); producción en el perfil `hornero`, sin desplegar |
| O7g | e2e: el servicio hornea el fixture, Caddy lo sirve y el motor lo dibuja con 0 variantes calculadas en el aparato (los propios, calculados; ADR-0018) | O7d, O7e, O7f | 🔶 Docker + Chrome · **sonnet** | ✅ 4 horneadas, 0 calculadas, 0 fallos (fixture) |
| O7h | Hituelo real horneado (2 épocas): tamaños, tiempo, descarga de un paseo; prueba en el móvil | O7g | 🔶 · **sonnet**; 👤 móvil | 🟡 primera vez en un aparato real (Antonio, 2026-10-29): «generados activo · plan 3 · dibujados 3 · recetas 4»; faltan cifras de horneadas/calculadas, tiempos y aspecto |
| O8a | ADR-0019 «escalera de olivos»: E0/E1/E2 del constructor para todos + impostores lejanos; distancias y presupuesto por aparato; fundido entre niveles; qué se retira (nivel 0 del mockup, pelotillas); medido/ilustrativo; plan B en la salida artefacto | decisión 66 | ligera · **opus** | ✅ ADR-0019 **Aceptado** (decisión 72): escalones por presupuesto, impostor hemi-octaédrico 8×8 × 128 px (≈ 26,7 MiB), horneado con Chrome sin pantalla, fases A/B/C |
| O8b | Impostores: cómo se hornean (vistas del árbol generado → atlas), formato y contrato; el hornero los hornea con las variantes | O8a | ligera; 🔶 si hornea con Chrome · **opus** | ✅ contrato olivo-impostor v1, horneado en Chrome, color calibrado; falta servir .webp en Caddy (O8c) y construir Dockerfile.impostores |
| O8c | Motor: la escalera en 07b/07ab (variantes E2 e impostores instanciados en lugar de L1/L2), fundido entre niveles, presupuesto por aparato; sin `?olivos=gen` hoy igual, hasta que la escalera pase a ser la de por defecto | O8a (O8b para los impostores) | ligera; 🔶 al medir · **opus** | 🟡 en curso (2026-10-31) · 🟡 fase A en main (Node: 0 huecos, tabla del ADR; banco con el fixture); falta silueta (IoU), impostores reales, Hituelo y el aparato (O8d) |
| O8d | Medir en el banco y en aparatos (👤): saltos entre niveles, llamadas y triángulos, fps en el móvil | O8b, O8c | 🔶 · **sonnet**; 👤 | ⬜ |
| O9a | Escalones por masa visual, 1: medir cobertura de copa, silueta (IoU) y color medio de E0/E1/E2/impostor desde 8 vistas del fixture; diagnóstico de la receta de niveles del constructor | O8c | ligera; 🔶 banco al final · **opus** | ✅ 2026-10-30: el salto era la copa de los lejanos a × 0,5 (cobertura −45 %, IoU 0,47); ADR-0022 Propuesto |
| O9b | Escalones por masa visual, 2: E1/E2 derivados de E0 agrupando hojas en tarjetas con atlas horneado por época (objetivo E1 ≤ 30 k, E2 ≤ 10 k, cobertura ≥ 90 % de E0) | O9a, ADR | pesada · **opus** | ✅ 2026-10-30: tarjetas de racimo con atlas por época; E1 23 k / E2 10,7 k (centenario3), 19,6 k / 7,6 k (medido); a 512 px cobertura −0,1..+1,4 % e IoU 0,915-0,946; a 128 px los tipo quedan < 0,9 ([MEDIDAS](../sistema/MEDIDAS.md)); decisiones 149-150; impostores por re-hornear (`CACHE_VERSION` 2) |
| O9c | Escalones por masa visual, 3: nivel por tamaño en pantalla con fronteras desplazadas por el presupuesto y fundido por banda de metros (07ab) | O9b | media · **opus** | ✅ 2026-10-30 con O9b-0 (copa igual, decisión 81) y mipmaps de hoja: lejano −45 % → +6,5 % de cobertura, IoU 0,47 → 0,69; E2→E1 a la misma distancia delante y detrás |
| O9d | Escalones por masa visual, 4: prueba en aparatos (paseo real, móvil, Quest) | O9c | 👤 Antonio | ⬜ |
| O4 | Medir 10 olivos en campo con cinta (decisiones 48-49) | — | 👤 | ⬜ |
| V3 | Base de la «vida» antes del VPS (migración 0004): ids de olivo congelados (decisión 92), personalización de árboles con registro de quién sube (91, 93, 96), denuncias y bandeja de la oficina (94), diario de la haza, avisos, trazabilidad del aceite, eventos (97); API y pruebas | — | media · **opus** | ✅ 2026-10-30 en api, contratos y doc (`doc/sistema/VIDA.md`); probado con PostGIS en contenedor; falta V7 (infra de medios) y las pantallas |
| V7 | Infra de medios: volumen y `GEMELO_MEDIOS` para la api en `infra/compose.yml` e `infra/dev`, Caddy interno y de borde con `/api/medios` hasta ~9 MB, copia de seguridad del volumen, `GEMELO_MEDIOS*` en `infra/entorno.ejemplo`; probar sharp en la imagen alpine | V3 | ligera · **sonnet**; 🔶 Docker | ✅ 2026-10-30, probada con Docker en local; el VPS real, no |
| V8 | Vigía real: URL del MCP y token propio de solo lectura (decisión de Antonio); `GEMELO_VIGIA=mcp` en local y en el VPS; comprobar las dos herramientas contra el contrato `tiempo` v1 | — | ligera · **sonnet**; 👤 token | 👤 URL lista en `infra/dev/.env`; falta el valor de `VIGIA_MCP_TOKEN` (decisión 126) |
| V9 | Limpieza: el conector de claude.ai (`window.claude`) que aún usan 14_historia, 15_tiempo y 23_estacion como respaldo quedó muerto con la decisión 79; el histórico semanal de Vigía, por la api | — | ligera · **sonnet** | ✅ 2026-10-30; falta una ruta de la api para la lectura en vivo de OlivarTrack y de `estado_del_olivar_hoy` en la historia |
| V10 | Infra de la configuración: `GEMELO_CONFIG_SALIDA` (api) y `GEMELO_HORNERO_CONFIG` (hornero) sobre un volumen compartido en `infra/compose.yml` e `infra/dev` (junto a V7) | C6 | ligera · **sonnet**; 🔶 Docker | ✅ 2026-10-30, probada con Docker en local; el VPS real, no |
| V11 | Lectura en vivo desde el servidor: rutas de la api que leen OlivarTrack y Vigía por MCP (solo lectura, con caché, frescura «de cuándo es» y lista blanca de campos; textos de campo como datos), para la historia y el tiempo; probadas con los fixtures; los tokens se ponen al desplegar | V9 | ligera · **sonnet** | 🟡 en curso (2026-10-31) |
| V4 | Panel de la oficina: dibujar hazas sobre ortofoto y copas (95), bandeja de sugerencias y denuncias con retirada en un clic, pasar una sugerencia a OlivarTrack como propuesta | V3 | media · **opus**; 👤 la oficina | → sustituida por OF0-OF13 (`doc/sistema/OFICINA.md` §11); primero OF0-OF5 (acceso, familias, hazas, bandeja, sistema mínimo) |
| V5 | En el mundo: nombrar un árbol y colgarle una foto o una pintura (solo el titular), verlo los demás, denunciar | V3 | media · **sonnet**; 🔶 | → pasa a P7f (tras C7, usables) |
| V6 | Icono PNG de la aplicación generado desde el SVG y excepción en el guardián (98) | — | ligera · **sonnet** | ✅ 2026-10-30: 4 PNG desde el SVG con sharp; falta probar la instalación en aparatos |
| I6 | VR: modelo real del mando y manos articuladas (`XRControllerModelFactory`, `XRHandModelFactory`) con los perfiles de `@webxr-input-profiles/assets` servidos desde nuestro origen (hoy se ven dos cubos); módulo `36_mandos.js` | — | media · **opus**; 🔶 VR simulada; 👤 Quest | ✅ 2026-10-30: `36_mandos.js`, perfiles de Meta y genéricos en `xr/perfiles/`; probado con WebXR simulado; falta verlo en el Quest |
| V1 | VPS: preparar el despliegue (RUNBOOK-VPS al día, SMTP de OVH, token de OlivarTrack, comprobaciones previas) | — | ligera (documentos y guiones) | ✅ (8 preguntas a Antonio en DECISIONS-PENDING) |
| V2 | VPS: desplegar F1a | A5, A6, V1 (decisión 21) | 👤 confirma cada paso | ⬜ |
| G1 | Arreglar la facturación de GitHub para que corra el CI | — | 👤 | ⬜ |
| OF0 | ADR de la oficina: roles, acceso y configuración versionada (decisiones 104-116) | — | ligera · **opus** | ✅ 2026-10-30 (ADR-0024) |
| OF1 | Acceso: rol `oficina`, sesión corta, aparatos confiables, Caddy con `/oficina/` por rol | OF0, V3 | media · **opus**; 🔶 Docker | ✅ 2026-10-30: migración 0005, integración y probar-caddy en verde |
| OF2 | Esqueleto de `/oficina/` y **Familias** (alta, enlace, sesiones, haza, baja a 30 días, exportar, borrar) | OF1 | media · **sonnet**; 🔶 | ✅ 2026-10-30; sin probar con lector de pantalla ni en Safari o Firefox |
| OF3 | **Hazas**: dibujar sobre ortofoto y copas (OpenLayers + proj4), partir/juntar en PostGIS, recuento, versiones | OF2, V3 | pesada · **opus**; 🔶 | ✅ 2026-10-30; 👤 la oficina dibuja las hazas reales; sin parcelas de OlivarTrack con geometría |
| OF3b | Contorno de la finca desde sus parcelas catastrales/SIGPAC (decisión 140): tubería que lo obtiene (fuente pública, con licencia y atribución), dato de la finca en la base, y el editor de hazas no deja salir de él (sustituye a la caja + 150 m) | OF3 | media · **opus** | ✅ 2026-10-30 (Node); integración con PostGIS y recorrido de Chrome, en la puerta; SIGPAC, 1 m y solo admin (decisiones 142-143); 👤 las referencias de las parcelas de cada finca |
| OF3c | Contorno desde las parcelas que ya tiene el gemelo (las de OlivarTrack, con polígono y límite SIGPAC; `GEMELO_PARCELAS`): la tubería de OF3b las junta sin descargar nada (decisión 143) | OF3b | ligera · **sonnet** | ✅ 2026-10-30 (sintético); falta correrlo con las parcelas reales y comparar con SIGPAC |
| OF3d | Oficina: el aviso de solape `sePisan` (hazas_puro.js) no detecta lindes coincidentes ni una haza dentro de otra con lados comunes, y no es simétrico con lindes casi iguales (contraejemplos de PB7); arreglar y quitar el `todo` de la propiedad. El servidor (`ST_Intersection`) ya lo rechaza | PB7 | ligera · **sonnet** | ✅ 2026-10-30 |
| OF4 | **Bandeja**: retirar en un clic, responder, avisar, pasar a OlivarTrack (token solo para proponer, decisión 110) | OF2, V3 | media · **sonnet**; 🔶 Docker | ✅ 2026-10-30; envío directo a OlivarTrack cuando exista el token de solo proponer (👤) |
| OF5 | **Sistema** mínimo: salud, OlivarTrack, correo de prueba, auditoría, roles | OF2 | ligera · **sonnet** | ✅ 2026-10-30; falta montar el estado del hornero en la api en `infra/compose.yml` y las copias (`ultimo.json`) |
| OF6 | **Configuración versionada** y `GET /api/config`; el motor la lee con caída a las constantes; interruptores de componentes (decisión 118) | OF2, C1 | media · **opus** | ✅ 2026-10-30 api y motor; falta la pantalla (OF7) |
| OF7 | Panel de la escalera: deslizadores con límites, vista previa, publicar en prueba y para todos, historial | OF6 | media · **sonnet**; 🔶 | ✅ 2026-10-30; sin probar en tableta ni con lector de pantalla |
| OF8 | Constructor en la oficina (olivo real por id, escalones lado a lado) | OF2, V3 | ligera · **sonnet** | ✅ 2026-10-30: pestaña «Olivo real» con las cifras de E0, E1, E2 y E2-VR (sin 3D); prueba de Chrome en la puerta; 👤 decisión 144 |
| OF8b | Visor 3D de los escalones de un olivo real en la oficina, lado a lado (Caddy, CSP y three aparte) (decisión 144) | OF8, VPS | media · **opus**; 🔶 | ⬜ después del VPS |
| OF9 | Épocas desde la oficina y re-hornear (decisión 112) | OF6 | media · **sonnet** | ✅ 2026-10-30; el e2e del hornero en Docker atendiendo la petición, 🔶 sin probar |
| OF10 | Mundo en modo oficina: insignia y chaleco, anunciar, balizas oficiales, salas | OF1 | media · **opus**; 🔶 | ✅ 2026-10-30 en Node (`oficina_mundo.test.js`, unidad de la api); pendientes por el banco `oficina_mundo_chrome`, la integración `oficina_mundo.test.ts` y `presencia_dev`; sin «cerrar sala»; decisiones 153-156 cerradas |
| OF10b | Sala de la visita ligada a un evento de la agenda: solo entran sus inscritos y la oficina (el token de LiveKit lo comprueba en la api); sin evento, quien invite la oficina (decisión 154) | OF10, OF11 | ligera · **sonnet** | ✅ 2026-10-31 (Node); integración en la pesada; la ligadura en memoria (se pierde al reiniciar la api) y quien ya estaba dentro no se expulsa |
| OF11 | Agenda: eventos con aforo, inscripciones, lista de espera, avisos | OF2, V3 | media · **sonnet**; 🔶 Docker | ✅ 2026-10-30 (Node); integración con PostGIS y Chrome en la puerta; pendientes: correo de avisos (sin emisor), .ics y la parte del hogar en el mundo; decisiones 145-148 cerradas |
| OF11b | Agenda: un cambio de fecha o lugar de un evento con apuntados avisa solo a los apuntados y a la espera, sin contar para el tope de 3 por semana (decisión 148) | OF11 | ligera · **sonnet** | ✅ 2026-10-30 (Node); integración con PostGIS en la puerta |
| OF11c | Correo de los avisos (agenda y oficina) y `.ics` de cada evento: emisor con librería estándar y versión fijada, probado contra Mailpit en local; el proveedor real queda como configuración (SMTP de OVH, decisión 15; falta la cuenta y verificarla) | OF11 | ligera · **sonnet** | ✅ 2026-10-31 (Node); integración con PostGIS y Mailpit en la pesada; buzón real sin probar |
| OF11d | Agenda dentro del mundo: ventana «Agenda» (apuntarse la titular, 1-10 personas) y fila en el panel VR (decisión 146) | OF11 | ligera · **sonnet** | ✅ 2026-10-31 (Node); Chrome en la pesada; Quest e iPhone sin probar |
| OF12 | Directos: preparación, sala guiada, dar la palabra, silenciar y cerrar la sala con aviso y vuelta a la general (decisión 155) | OF10, F3, EIPD | — | ➡️ integrada en **F3f** (2026-10-31) |
| F3a | F3 · ADR de voz y moderación: voz solo en guiadas o también charla por cercanía, pulsar para hablar o abierto, menores, quién da la palabra; sin grabar el directo (decisión 10) | F2, C5 | ligera · **opus**; 👤 decide | ✅ 2026-10-31: [ADR-0026](../adr/0026-voz-y-moderacion.md) (Propuesto); 👤 decisiones 157-162 |
| F3b | F3 · Borrador de la EIPD ampliada a voz (qué se trata, base, plazos, menores, sin grabación); la valida Antonio o quien lleve lo legal | F3a | ligera · **sonnet**; 👤 valida | ⬜ |
| F3c | F3 · Permisos en la api: el token de LiveKit solo deja publicar micrófono al guía y a quien tenga la palabra; silenciar y expulsar desde el servidor (RoomService), con auditoría; sala `guiada-<evento>` (decisión 39) y la palabra con `RoomService.UpdateParticipant` (ADR-0026) | F3a | ligera · **opus** | ⬜ |
| F3d | F3 · Componente «Voz» sobre la Red (C5): recibir pistas, audio espacial por avatar (Web Audio, atenuación por distancia), quién habla | F3a, C5 | ligera · **opus**; 🔶 al medir | ⬜ |
| F3e | F3 · Interacción: pulsar para hablar (pantalla, táctil, gatillo en VR), levantar la mano, silenciarse; nota de comodidad | F3c, F3d | ligera · **sonnet** | ⬜ |
| F3f | F3 · Panel del guía (absorbe OF12): preparar la visita, dar y quitar la palabra, silenciar a todos, expulsar, cerrar la sala con aviso y vuelta a la general (decisión 155) | F3c, F3d, OF10b | ligera · **opus** | ⬜ |
| F3g | F3 · e2e con tres Chrome y micrófono simulado por el banco: permisos, moderación y que nadie hable sin permiso | F3e, F3f | pesada · **sonnet**; 🔶 | ⬜ |
| F3h | F3 · Medida con 10 personas con audio (CPU de LiveKit, ancho de banda), en CI o en el VPS (el i5 no da) | F3g, G1 o V2 | pesada · **sonnet**; 🔶 | ⬜ |
| F3i | F3 · Visita real de 10 personas con Quest y móviles | F3h, F3b | 👤 | ⬜ |
| OF13 | Llave de acceso (WebAuthn) obligatoria para la oficina antes de abrir (decisión 105) | OF1 | media · **sonnet**; 🔶 | ✅ 2026-10-30 en código (api, migración 0013, pantalla y Sistema; unidad y guardianes en verde); falta integración con Docker, el recorrido con el autenticador virtual y registrar llaves reales (Windows Hello, teléfono, llave física); decisiones 151-152 cerradas |
| C1 | Componentes: núcleo (`Componentes`, `Bus` con catálogo, bucle por fases, encendido URL > configuración > defecto) y guardián | — | media · **opus** | ✅ 2026-10-30 |
| C2 | Componentes: puntos de extensión (HUD, ventanas, teclas, ajustes, panel VR por filas, minimapa, capas) | C1 | media · **opus** | ✅ 2026-10-30 |
| C3 | Componentes: piloto 1, las fichas del tiempo como componente | C2 | ligera · **opus** | ✅ 2026-10-30 |
| C4 | Componentes: piloto 2, el sonido | C2 | ligera · **sonnet** | ✅ 2026-10-30 |
| C5 | Componentes: piloto 3, `Red` sobre LiveKit; presencia y avatares como componentes | C1 | media · **opus** | ✅ 2026-10-30 en Node (`red.test.js`); pendiente Chrome por el banco (presencia, presencia_dev, vr_gente, avatares_motor, movibles_chrome, personalizacion_e2e, recuentos de carga); deja preparadas las salas por clave para OF10 y OF12 |
| C6 | Componentes: plugins de la api y `/api/config` (se junta con OF6) | C1 | ligera · **sonnet** | ✅ 2026-10-30 (sin plugins de la api por carpeta) |
| C7 | Entidades con id estable y usables (una sola forma de tocar: dedo, ratón, rayo VR, cercanía) — antes de juegos y fotos (decisión 119) | C2 | media · **opus** | ✅ 2026-10-30; desbloquea P7f (nombrar árboles y colgar fotos) |
| C8 | Láminas en el mundo como servicio del núcleo | C3 | ligera · **sonnet** | ✅ 2026-10-30 (desbloquea C9b) |
| C9 | Anfitrión de juegos y primer casual (decisión 125): piezas del olivar que caen y se rompen al juntar 3+ iconos iguales; récord validado en la api | C2, C6, C8 | media · **opus**; 👤 qué juego | ✅ 2026-10-30 con C9a (pantalla) y C9b (VR) |
| C9a | **«Cae la cosecha»** en pantalla: anfitrión de juegos (pausa el mundo, juego a pantalla completa, récord) y el juego: piezas del olivar que caen y se rompen al juntar 3+ iguales; teclado, ratón y táctil; récord de la familia en la api (decisiones 125, 136) | C2, C6 | media · **opus**; 🔶 banco al final | ✅ 2026-10-30; medido por el banco (0 renders con el juego abierto); sin probar en aparatos |
| C9b | «Cae la cosecha» en VR, como lámina en el mundo con los mandos | C8, C9a | media · **sonnet** | ✅ 2026-10-30; no probado en Quest |
| C9c | Clasificación de «Cae la cosecha» por alias entre familias (decisión 137): ruta de la api, pantalla de fin de partida y ventana Juegos | C9a | ligera · **sonnet** | ✅ 2026-10-30 (Node y PostGIS); prueba de Chrome en la puerta; sin VR |
| PB1 | Pruebas de navegador más baratas: medir cuánto tarda hoy cada una (ranking) y, en las que no son de presupuesto, ventana a la mitad con la misma forma (450×325) y solo el escenario que necesitan; antes y después medidos. Las de presupuesto no cambian | — | media · **sonnet** · 🔶 | ✅ 2026-10-30: −472 s medidos en 4 pruebas (movibles_chrome 754 → 316 s); las de presupuesto, sin tocar |
| PB2 | Pruebas de navegador, 2: una sola página y un Chrome por fichero (movibles_chrome abre cuatro cargas; quedan ~5 min); DPR 1 en las táctiles con asserts de CSS; mirar si los recuentos de presencia, olivos y avatares_motor dependen de la ventana; pasar a función pura la lógica de presencia | PB1 | media · **sonnet** · 🔶 | ✅ 2026-10-31: −575 s medidos en 7 pruebas (878 → 303 s); compartir página no ayudaba (la carga cuesta 3,5 s: el coste es por fotograma); lo puro de presencia, a PB8 |
| PB3 | Caché de páginas: reintento al renombrar (EPERM en Windows, carrera con el antivirus; `_pagina.js` montaPagina), que hace fallar escena3d a veces | — | ligera · **haiku** | ✅ 2026-10-30 |
| PB4 | Pruebas afectadas: un selector (`npm run puerta:afectadas`) que, de los ficheros cambiados frente a `main`, saca las pruebas que los tocan (cabeceras Expone/Consume, contratos y un mapa prueba → rutas en cada guardián); los agentes lo usan; la puerta completa sigue antes de subir | PB2 | media · **sonnet** | ✅ 2026-10-31 (prudente: un cambio en el motor elige muchas pruebas, porque las de navegador construyen el motor entero) |
| PB5 | Regresión visual: capturas de referencia aprobadas por Antonio (olivos E0/E1/E2, avatares, UI clave) con Playwright `toHaveScreenshot` y tolerancia; actualizar la referencia es un paso explícito del commit | PB2 | media · **sonnet** · 🔶 | ⬜ al final de la cola (decisión de Antonio) |
| PB6 | Pruebas inestables: registro de fallos intermitentes (fichero en `pruebas/salida/`, por prueba y motivo), un reintento único y marcado para las conocidas y un informe al final de la puerta | — | ligera · **sonnet** | ✅ 2026-10-30 (probado con un ejecutor falso; el primer reintento real lo dirá la puerta) |
| PB7 | Propiedades con `fast-check` (versión fijada) en contratos, validaciones de la api, aforo de la agenda, épocas y geometría de hazas/contorno | — | ligera · **sonnet** | ✅ 2026-10-30 (`propiedades.test.ts`, 2,5 s); hallazgo `sePisan` → OF3d |
| PB8 | Bajar a Node lo que el navegador prueba y es lógica: presencia (reparto, instancias, límites), escalera de olivos y lo que salga de la medida de PB1 | PB2 | media · **sonnet** | 🟡 2026-10-31: presencia, parche de render y solape de movibles hechos en Node; Chrome en la pesada; queda la escalera de olivos |
| PB9 | Telemetría de fluidez en aparatos: el medidor `&mide=60` guarda su resultado (con permiso) en la api y la oficina lo enseña por aparato y fecha | — | media · **sonnet** | ✅ 2026-10-31 (Node); integración con PostGIS en la pesada; Quest sin probar; 👤 objetivos de p95 en móvil y escritorio [SUPUESTO: sin escribir] |
| C10 | Migración del resto de módulos a componentes, al tocarlos | C1-C3 | goteo · **sonnet** | ⬜ |
| C11 | Medida por componente («con y sin» por el banco) | C1 | ligera · **sonnet**; 🔶 | ⬜ |
| C12 | (Condicional) servidor de estado de juego | decisión de Antonio | —  | ⏸️ no por ahora (decisión 120) |
| AV1 | Biblioteca de avatares familiar e inclusiva: fuentes abiertas, criterios, propuesta y maqueta del selector | P7 | ligera · **opus** | ✅ 2026-10-30: propuesta y maqueta; 9 decisiones (A1-A9) para Antonio |
| P7f | Hituelo: personalización en el mundo (nombrar árbol, colgar foto o pintura) — antes V5 | V3, C7 | media · **sonnet** | ✅ 2026-10-30, probado contra la api real en Chrome; sin probar en iPhone, Quest ni con fotos reales de móvil (HEIC, EXIF) |
| AV2 | Muñeco teñido (decisión 131): 10 tonos de piel, ropa, altura, complexión y silla en el muñeco lejano; altura de la vista de pie/sentado en Configuración (133) | AV1 | ligera · **sonnet**; 🔶 banco | ✅ 2026-10-30; falta la silla con VRM (AV3), la fila de la altura en el panel VR y probar en aparatos |
| AV3 | Creador por piezas, 1: cuerpos MPFB por edad y complexión generados por un agente con Blender (130), sin peques ofrecidos (132); prueba de arte a ojo | AV1 | pesada · **opus** | ✅ 2026-10-30; 👤 revisión a ojo (decisión 130); costura del cuello visible en el primer plano |
| AV4 | Creador por piezas, 2: ADR y contrato `avatares` v2 (135), repertorio en la tubería y color en el motor (128), pantalla de elección | AV3 | pesada · **opus** | ✅ 2026-10-30 en código (ADR-0025); falta la revisión a ojo de las piezas (decisión 130), publicar el catálogo v2 y probar en el Quest |
| AV5 | Avatares, repaso tras la revisión de Antonio (opción B, 2026-10-30): afro sin picos en el borde bajo, pelo largo que caiga también por delante, sombrero de paja asentado sobre el pelo, y pieza nueva **perilla**; capturas para su visto bueno y, con él, publicar el catálogo v2. Corto/rapado y barba con la boca se quedan como están | AV4 | pesada (Blender) · **opus** | ⬜ detrás de A4 (decisión de Antonio) |
## Ideas de mejora (sin fecha; se convierten en tarea cuando Antonio lo diga)

**Minijuegos y puzles para el aula y las visitas (F5)** — anotado el 2026-10-30.
- **Sin motor de juegos** (Unity, Godot, PlayCanvas, Babylon: otro mundo y otro motor de dibujo; Needle, A-Frame o React Three Fiber imponen su forma de trabajar). Un **módulo propio de minijuegos** sobre lo que ya hay: el mundo (Hituelo, olivos, balizas, hazas), la interacción (tocar, rayo en VR, anillo de llegada, fichas), LiveKit (una sala por partida), la sesión y el alias, y la api con Postgres para la **clasificación validada en el servidor**. Esqueleto común: espera → cuenta atrás → juego → resultado.
- **Física solo si un juego la pide** (lanzar, apilar, el vareo): entonces se elige una librería mantenida (estado de Rapier, `cannon-es` y de ECS como `bitecs`/`miniplex` por comprobar). **Colyseus** solo si hubiera competiciones en tiempo real que necesiten estado autoritativo.
- **Decisiones de Antonio antes de construir:** menores (decisión 45: hoy sin perfiles de menores; un aula de colegio la reabre con asesoría), qué se publica en la clasificación (solo el alias) y si hay premios.
- **Juegos elegidos por Antonio** (2026-10-30), cinco, con datos reales del gemelo (lo medido se dice medido):

  | # | Juego | Qué es | Usa | Física |
  |---|---|---|---|---|
  | 1 | **Carrera loca de balizas** | Carrera por la finca pasando por las balizas, contrarreloj o todos a la vez, eligiendo vehículo: **quad, moto, tractor, pickup, buggy y un carro de troncos** (diseño propio, no el de ningún dibujo animado); cada uno con su manejo (el tractor lento y que no vuelca, la moto ágil, el buggy salta) | balizas, minimapa, presencia (quad/dron ya viajan en la pose), LiveKit | **arcade**: conducción y saltos sencillos (vehículo por rayos contra el relieve), sin simulación realista; se decide si basta con lo propio o hace falta una librería |
  | 2 | **Sigue las pistas** | Investigación tipo búsqueda del tesoro: una cadena de pistas con datos de la finca («el olivo más alto de la parcela que se trató el martes», «al norte de la baliza con alerta», «la copa más ancha junto al camino») hasta dar con el olivo o el lugar | copas medidas, hazas, balizas, OlivarTrack/Vigía (datos, no instrucciones), constructor | no |
  | 3 | **El quiz del olivar** | Preguntas que unen lo que antes eran cuatro juegos: **¿qué época es?** (el olivo en sus siete épocas), **¿cuántos olivos hay?** (frente al recuento del LiDAR, medido, y el declarado), **el ojo del agrónomo** (zonas de menos vigor con el NDVI relativo, sin calibrar) y **preguntas de campo** (variedad, plagas, fenología) | constructor (épocas), copas, NDVI, balizas, OlivarTrack/Vigía | no |
  | 4 | **La recolección** | Varear y recoger las aceitunas en la lona contrarreloj | constructor (olivas), lona | **sí** (caer, rodar, la lona) |
  | 5 | **La poda** | Elegir qué ramas cortar a un olivo generado y comparar con los criterios de poda en vaso (luz, ventilación, carga) | constructor (`padre`/`nodo` de las ramas) | no |

  Orden propuesto: 3 (quiz) y 2 (pistas) primero (sin física y con lo que ya hay), luego 1 (necesita la conducción arcade y los modelos de vehículos), después 5 y 4.

**Juegos casuales «para volver»** — anotado el 2026-10-30 a propuesta de Antonio: partidas cortas que relajan y no hacen pensar, para que un miembro de la familia entre de vez en cuando «a echar una» y, ya que está, mire su haza (sus árboles, el diario, los avisos).
- **Géneros, no copias:** se toma el género (piezas que caen y se encajan, juntar tres iguales, romper bloques, fusionar piezas iguales), que es libre, y se hace un diseño **propio** con el tema del olivar; **ningún juego concreto se reproduce** (ni su nombre, ni sus piezas, ni sus pantallas, ni sus reglas exactas).
- **Ideas de partida** (por diseñar): *Encaja la cosecha* (cajas y capachos de aceituna que caen y se encajan en el remolque; filas completas se van a la almazara), *Tres olivas* (juntar tres o más aceitunas, hojas o flores de la misma época; los comodines salen de lo que pasó esta semana en tu haza), *Rompe el terrón* (una pelota y una pala que despejan la tierra de una parcela vista desde arriba, con la forma real de tu haza), *Fusiona tu olivo* (juntar dos plantones iguales da un olivo mayor, hasta el centenario).
- **Todo del mundo agro y del olivar** (Antonio, 2026-10-30): las piezas, fondos y sonidos salen de lo que ya hay en el gemelo y del campo (aceitunas por época, hojas, flores, ramas de poda, capachos, cajas, lona, vareador, remolque, tractor, almazara, garrafas de aceite, terrones, piedras) y **los protagonistas son los avatares de la familia** (el VRM o el muñeco con sus colores, decisión 76): el que juega aparece en el juego, y en los juegos por turnos o en la clasificación del hogar se ve a cada miembro con su avatar.
- **Enganche ligero y honesto:** partidas de 1-3 minutos, sin compras ni anuncios, sin castigos por no entrar; una «partida del día» que usa algo real de tu haza (la época del olivo, el tiempo de Vigía, el último trabajo de OlivarTrack) y un récord familiar visible solo dentro del hogar (o por alias, decisión de Antonio).
- **Dónde se juega:** en la pantalla (2D, `<canvas>` sobre el mundo en pausa) en escritorio y móvil; en VR, como una lámina en el mundo (como la de la previsión). Sin motor de juegos: el mismo criterio que los minijuegos de arriba.
- **Lo que hay que decidir antes:** si cuentan récords entre familias, si hay límite de partidas para menores (decisión 45) y qué datos de la haza se pueden usar en el juego sin enseñar nada de otra familia (decisión 13).

## Decidido no hacerlo (por ahora)

- 🚫 `logarithmicDepthBuffer`: se usa `near` dinámico y `far` mayor (coste en iOS sin medir **[SUPUESTO]**).
- 🚫 Binario crudo en los ficheros de apoyo: la plataforma no lo admite (ADR-0008).
