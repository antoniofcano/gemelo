# Arquitectura del motor

Mapa vivo. Si el código cambia de forma, esto cambia en el mismo commit. Decisiones y porqués: [ADR](../adr/README.md). Interfaces de datos: [CONTRATOS](CONTRATOS.md). Cifras: [MEDIDAS](MEDIDAS.md).

## 1. Cómo se monta

Hay **una sola salida**, la web de Vite (`apps/web/motor/`, [ADR-0010](../adr/0010-monorepo-y-build-con-vite.md)); la salida artefacto se retiró ([ADR-0021](../adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)).

`apps/web/herramientas/genera_motor.mjs` escribe `entrada/motor.generado.js` = `import * as THREE from "three"` + la concatenación de `motor/*.js` en orden (`readdirSync().sort()`: **él fija el orden de montaje**), aplica los textos por finca a la plantilla (título, entradilla, pie, `sin_historia`) y escribe un `index.html` con la plantilla y el `#datos`; `vite build` lo empaqueta en `apps/web/dist/` con three 0.186.1 (versión exacta de `apps/web/package.json`, [ADR-0016](../adr/0016-actualizacion-de-three.md)). `01_datos.js` abre una IIFE con `"use strict"` y `99_cierre.js` la cierra: todo el motor comparte ámbito, sin módulos ES. El orden de los prefijos fijos (`02_` < `02b_` < `03_`) es el orden de montaje y, por tanto, de dependencias.

La página pide `t/<clave>.json|jpg` (`D.teselas` es el índice; `D.base` da el prefijo, por defecto relativo) y, para la escena, el `tileset` del índice. Ya no hay modo embebido.

## 2. Módulos (`apps/web/motor/`)

| Fichero | Expone | Notas |
|---|---|---|
| `01_datos.js` | `D`, `$`, `fmt`, `b64`, `i16` | abre la IIFE; la escena es siempre la 3D Tiles ([TILES3D](TILES3D.md#la-escena-sin-vuelta-atrás-t8-fase-2)); `ESC3D` y `ESTAD` ya no existen |
| `02_mundo.js` | `Mundo` (`suelo`, `copaAlta`, `orto`, `colorSuelo`, `alCargar`, `arranca`, `actualiza`, `liberaOrtoLejos`…) | teselas, carga, `desp`/`colorEn` |
| `02b_cola.js` | `Cola` (`add`, `corre(ms)`, `vacia`) | trabajos como generadores |
| `03_escena.js` | `renderer`, `scene`, `camera`, luces (`LUZ_SOL`, `LUZ_CIELO`), `SRGB`, `texColor`, `colorVertSRGB` | `far = max(5000, 4·EXT)`, `near` inicial 0,5; salida sRGB y convenio de color: lo escrito a mano va en sRGB y se pasa a lineal al entrar en la luz (ADR-0016) |
| `04b_escena3d.js` | `Escena3D` | la escena 3D Tiles (ADR-0015) con 3DTilesRendererJS: relieve y ortofoto del tileset; sin tileset o si falla, panel «Esta finca no tiene escena» (`estado === "sin"`), sin vuelta a otra escena |
| `04c_olivos_tiles.js` | `OlivosTiles` | los olivos instanciados del tileset (media y larga distancia), resueltos por huella; aparta los que dibuja el motor de cerca |
| `04d_sombreado_tiles.js` | `SombreadoTiles` | el relieve del tileset con su sombreado (NDVI, escarcha, nubes, suelo abierto) y lo compartido que dejó `Terreno`: `hash`, `matSuelo`, `matOrto` y `UN` en el primer nivel; `SombreadoTiles` expone texturas, texturasReales, ruidoG, detalleG, pideDetalle, prepara, U1, parche y OP |
| `05_nube.js` | `actualizaNubeTeselas` | un `Points` por tesela |
| `06_arboles.js`, `07_follaje.js` | copa, tronco, hojas | piezas del nivel 0 |
| `07a_catalogo.js` | `Catalogo` (`tipos`, `geometria`, `instala`, `retira`…) | formas de L1/L2 por olivo-tipo; tipo −1 = las de siempre (ADR-0012) |
| `07ab_generados.js` | `Generados` (`activo`, `actualiza`, `rotulo`, `estado`, `escalera`, `lejanos`), `Escalera` (`tope`, `planifica`: trozo puro) | con `?olivos=gen` (ADR-0017): olivos generados cercanos (E0/E1 propios, variantes E2/E2-VR) por presupuesto, dibujados en un lote de ~6-7 mallas; apaga el L0 de siempre en su radio. Con `?olivos=escalera` (ADR-0019, fase A): el reparto de toda la escalera por el presupuesto del aparato, con histéresis |
| `07ac_lejanos.js` | `Lejanos` (`inicia`, `paso`, `reparte`, `hayCapa`, `triangulos`, `resumen`) | solo con `?olivos=escalera`: los olivos que no están en 3D hasta 1.600 m, en una malla instanciada (1 llamada); impostores de O8b si el constructor trae `creaImpostores`, si no, sustituto de dos planos cruzados con la silueta de cada variante E2 horneada en el navegador |
| `07b_arboles.js` | `Arboles` (`inicia`, `tileCargada`, `actualiza`, `presupuesto`, `perfil`, `resumen`) | LOD 0/1/2, celdas de 64 m; pide L1/L2 al `Catalogo`. Con `?olivos=escalera` no dibuja ni L0 ni L1/L2 ni los olivos del tileset: reparte entre `Generados` y `Lejanos` |
| `08_marcadores.js` | `gLinde`, `gCopas`, `gMarc`, `gDesf` | instanciados |
| `09_camara.js` | `orb`, `objetivo`, `camara()`; deslizador `#corr` (`kcor`) | órbita |
| `10_ndvi.js` | `NDV` | u8 → Int16, escala relativa |
| `11_sol.js` | `sol2()` | hora y fecha (Jaén) |
| `12_paseo.js` | `paseando`, `actualizaPaseo` | primera persona |
| `12b_llegada.js` | `LlegadaPuro`, `Llegada` | el anillo de llegada y el salto con fundido (de pie, fuera de troncos, andando): en VR desde el vuelo o el mirador (palanca derecha ↑ y soltar) y en pantalla con el Dron (clic o toque corto, «Aterrizar aquí», Intro o L); `aparece`/`ve` para aparecer en un punto desde otros módulos |
| `13_parcelas.js` | selector fincas→parcelas | suelo por parcela (USDA) |
| `13b_hazas.js` | `HazasPuro`, `Hazas` | F1: la linde de cada haza de `/api/hazas` pegada al suelo (una `LineSegments` en `gLinde`: 1 llamada, la propia en ámbar y las ajenas en blanco roto) y, al tocarla o con H, su ficha de `/api/hazas/{id}` (solo la lista blanca, con procedencia y fecha). Solo con la página servida por el servidor (`D.base` = `/teselas/…`) o `?api=`; sin eso, o sin sesión o con error, no crea nada ([haza.schema.json](../../contratos/haza.schema.json), ADR-0014) |
| `14_historia.js` | `ESCENAS` (Cerro/Hituelo) | cruza OlivarTrack (`D.ot`, MCP) |
| `15_tiempo.js` | `actualizaTiempo` | estación, previsión, demos (Vigía) |
| `16_vida.js`, `25_perros.js` | fauna | pájaros, conejos, quad, perros |
| `17_minimapa.js` | minimapa | mosaico + rastro |
| `18_paisaje.js` | edificios, tendido, arroyo, árboles no olivo | `D.paisaje` (deducido) |
| `19_balizas.js` | una baliza por parcela + ficha | |
| `20_sonido.js` | audio sintetizado | |
| `21_suelo.js`, `22_huellas.js` | cubierta por NDVI, hierba, huellas | radio alrededor del foco |
| `23_estacion.js` | olivo estacional (BBCH) | |
| `24_pantalla.js` | pantalla completa, transición de cámara | |
| `26_presencia.js` | `PoseCodec`, `BufferPose`, `Presencia`, `window.__presencia` | F2 sin red: códec de pose (24/56 B), interpolación y avatares de bloque instanciados (5 llamadas); solo con `?presencia=sim` (visitantes simulados), sin la bandera no crea nada ([presencia](../../contratos/presencia.md)) |
| `26b_avatares.js` | `AvataresPuro` (y el gancho `avatarVRM` de 26) | P7c: avatares VRM (`@pixiv/three-vrm` 3.5.5 con `import()`) para los N más cercanos por aparato, con histéresis y fundido; el resto, el muñeco; tu paseante en tercera persona es tu avatar (decisión 76). Sin presencia no crea nada ([presencia](../../contratos/presencia.md), [avatares](../../contratos/avatares.md)) |
| `27_debug.js` | `window.__g` | gancho de pruebas |
| `28_depura.js` | contador `?debug` | |
| `29_vr.js` | `VRX`, `vrActualiza`, `VR_PERFILES`, `window.__vrDebug` | todo el WebXR |
| `90_final.js` | bucle `cuadro()` | orden de actualizaciones |
| `99_cierre.js` | — | cierra la IIFE |

(La cabecera de cada módulo declara qué expone y qué consume; el guardián de contratos lo comprueba.)

## 3. Flujo de arranque

1. `01_datos` parsea `D`. `02_mundo` indexa las teselas de `D.teselas` y prepara el mosaico y el relieve grueso de 8 m.
2. `90_final`: `Mundo.alCargar(fn)` avisa a `Arboles` cuando llega una tesela. `Mundo.arranca(fn)` pide las primeras teselas; al terminar monta el árbol de olivos, el mosaico, la nube, vacía la `Cola` (hasta 10 s), recolorea el suelo, marca `listo = true` y aplica el modo.
3. `window.__g.listo()` devuelve `true`: es la señal que esperan las pruebas.

## 4. Bucle por fotograma (`cuadro(t)` en `90_final.js`)

`dt` acotado a 0,1 s → cámara (VR, paseo u órbita) → tiempo, olivo estacional, vida, minimapa, paisaje, balizas, sonido, suelo, terreno, nube → `Arboles.actualiza` (reclasifica niveles) → `actualizaCarga` cada 0,2 s (`Mundo.actualiza` pide teselas; cada 3 s suelta ortofotos lejanas) → huellas, perros → presencia (`Presencia.actualiza`; nada sin `?presencia=sim`) → `Cola.corre(Arboles.presupuesto())` → `render` → contador `?debug` → `vrFin` en VR. En VR el bucle lo lleva la sesión XR en vez de `requestAnimationFrame`.

## 5. Colas y presupuestos

- **`Cola`**: trabajos pesados (malla de terreno de una tesela, nube, celda de olivos, texturas de ruido) como generadores. `Cola.corre(ms)` hace avanzar el más urgente (menor `prio` = más cerca) hasta agotar el presupuesto, que da `Arboles.presupuesto()` y es dinámico: 6 ms en órbita y 3,5 en paseo; sube a 12 / 8 ms si faltan olivos de nivel 0 en lo que se ve y el aparato va holgado; baja a 4,5 / 3 ms si el fotograma va justo (EMA > 34 ms).
- **Presupuesto de dibujo** (diseño): ≤1,7 M triángulos, ≤1,4 M puntos, ≈250 llamadas, ≈350 MB. Topes comprobados en `pruebas/presupuesto.json`.
- **Olivos**: `MAX0=450` (L0), `MAX1=3000` (L1), `MAX2=16000` (L2); `TOPE_TRI=550000`. Las formas de L1/L2 las da `Catalogo` (`07a_catalogo.js`); con un catálogo glb instalado, cada tipo con olivos a la vista suma sus piezas en llamadas (≤ 2 en L1, ≤ 1 en L2; [olivos-tipo](../../contratos/olivos-tipo.md)). Distancias de cambio de nivel `U1=460`, `U2=1600` m. Triángulos: L0≈800, L1≈170, L2≈30.
- **Teselas**: se piden a ≤1.800 m de la cámara, de tres en tres.

## 6. Memoria

- Por tesela, relieve (258²) y copa (256²) siempre en memoria: 49 teselas ≈ 20 MB. Nube de las lejanas se libera a >1,2× 2.300 m.
- Ortofotos decodificadas: 2,4 MB (768 px) o 1 MB (512 px) por tesela; se sueltan a 900 m (sin LRU fino: pendiente M4).
- Todo recurso de GPU lleva `dispose()`. La prueba de fugas vigila `renderer.info.memory` al ir y volver.

## 7. Datos hacia el motor

Exportador (`tuberia/finca_8_teselas.py`, `tuberia/hituelo_conv.py`) → `indice.json` + `t/<kx>_<ky>.json|jpg` → `tuberia/tiles3d/genera.mjs` (tileset) → `genera_motor.mjs` + Vite → página. Formato exacto: [CONTRATOS](CONTRATOS.md).

## 8. VR

`29_vr.js`: botón «Entrar en VR» solo si `navigator.xr` soporta `immersive-vr`. Rig `Group` para desplazar al usuario. `VR_PERFILES` (4 niveles) baja si el JS pasa de 13 ms o el fotograma de 15,2 ms, y sube tras 25 s con JS <7 ms. Probado solo con un mock de WebXR (`pruebas/mock_xr.js`; [VR.md](VR.md), [ADR-0005](../adr/0005-webxr-perfil-propio.md)).

## 9. Hacia componentes

Propuesta, aún sin construir ([ADR-0023](../adr/0023-componentes-del-mundo.md), **Propuesto**): separar un núcleo estable (datos, mundo, cola, escena, cámara, entradas, ajustes) de **componentes registrados** con `Componentes.registra(...)` (qué consumen y exponen, eventos, bandera, presupuesto de dibujo, fases del bucle y `libera()`), con puntos de extensión en el HUD, las ventanas, las teclas, la Configuración, el panel VR y el minimapa, y un bus de eventos. El bucle de §4 pasaría a recorrer fases sin nombrar componentes. Diagnóstico medido del acoplamiento de hoy, diseño del contrato y piezas que faltan para el Agro-Verse (entidades con id estable, usables, red, láminas, juegos): [COMPONENTES.md](COMPONENTES.md).
