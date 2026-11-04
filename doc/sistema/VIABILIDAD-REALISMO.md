# Viabilidad: realismo del suelo y biodiversidad (EV-1)

Estudio de viabilidad de dos propuestas de Antonio (análisis del 2026-11-03). **No se implementa nada.** Se ha contrastado con el código de `main` del 2026-11-03 (módulos del motor `21_suelo`, `04d_sombreado_tiles`, `04e_suelo_fondo`, `16b_fauna`, `18_paisaje`, `20_sonido`, `22_huellas`, `29_vr`, el constructor `apps/web/olivo/` y la tubería `tuberia/`) y con fuentes web citadas con su URL. Lo que no se ha podido comprobar va marcado **[NO VERIFICADO]**. Las cifras de memoria son **cálculos** (ancho × alto × bytes por píxel), no medidas: se medirán con la [skill `medir`](../../.claude/skills/medir/SKILL.md) (regla 7).

## Resumen

| Propuesta | Viabilidad | Coste (agente · campo) | Riesgo principal | Cuándo | Bloqueos |
|---|---|---|---|---|---|
| **A0** Suelo mínimo: una clase («calle»), una foto repetible, solo escritorio | **alta** | 2 sesiones (sonnet) + 1 de medida en el banco · una salida de 2-3 h | que no se note a la altura de los ojos (la ortofoto ya pinta casi todo) o que «se vea la repetición» | ya (no espera a AG-1.1: una textura sin comprimir de 1024² cabe en escritorio) | ninguna; capturas lado a lado para aprobar (decisión 23) |
| **A1** Suelo completo: tres clases (ruedo, calle, camino), relieve derivado, todo KTX2 | **media** | 4-5 sesiones (1 opus de diseño del sombreador, 3-4 sonnet) · 1-2 salidas (primavera verde y verano seco) | coste de fragmento del terreno en la GPU de la Quest (es lo que más píxeles ocupa) | tras AG-1.1 (KTX2 en el motor) y con A0 aprobado | AG-1.1; CSP con `'wasm-unsafe-eval'` para el transcodificador Basis (ver §A.4) |
| **A2** Hierba con recortes de fotos (atlas a la silueta) | **media** | 2 sesiones (sonnet) · fotos en la misma salida de A1 | `alphaTest` en la Quest (sin `alphaToCoverage` hay dientes y sobredibujado) | tras AG-2.1 (`alphaToCoverage`) y AG-2.2 (cartulina recortada) | AG-2.1, AG-2.2 |
| **A3** Piedras como calcomanías y unión suelo-olivo (anillo de hojarasca, sombra bajo la copa) | **alta** | 2 sesiones (sonnet) · fotos en A1 | ninguna seria: el anillo ya existe dibujado en `04d` (`lit`) | junto a A1 | A1 (la textura del anillo) |
| **B0** Fauna «probable por zona y mes» con GBIF precalculado | **alta** | 2 sesiones (sonnet: script de `tuberia/` y contrato; motor) | licencias CC BY-NC mezcladas en la descarga; especies sensibles | ya (independiente del rendimiento si no añade llamadas) | decidir qué se publica (pregunta 3) |
| **B1** Cantos reales (xeno-canto) en el sonido | **media** | 2 sesiones (sonnet) | licencias por grabación (muchas CC BY-NC-SA / BY-NC-ND) y memoria de audio en la Quest | tras B0 y tras Q0c (presupuesto VR calibrado) | clave de xeno-canto (cuenta de Antonio, nunca en el repo); licencia de cada clip |
| **B2** Medición propia con grabador y BirdNET | **media-baja** | 2-3 sesiones (opus para EIPD y contrato; sonnet para la tubería) · 1 día de instalación + visitas | **privacidad** (graba voces: EIPD) y **licencia no comercial** de los modelos BirdNET para una explotación comercial | tras decisión de Antonio y su EIPD | pregunta 4; uso comercial de BirdNET |
| **B3** Cajas nido y trampas de OlivarTrack como «medido en la finca» | **alta** (lo que ya hay) | 1 sesión (sonnet) | publicar datos de la explotación (regla 4) | cuando haya trampeos en OlivarTrack | qué se publica (pregunta 3) |

**Recomendación:** hacer **A0** y **B0** como versiones mínimas (unas 4 sesiones y una salida de campo en total), aprobarlas con capturas y solo entonces abrir A1-A3 y B1. B2 queda para después de la EIPD.

---

## Propuesta A — Realismo del suelo

### A.1 Qué hay hoy (medido en el código)

- **El suelo lo pinta un único sombreador** sobre el terreno del tileset (`04d_sombreado_tiles.js`, `parche()`): color de la tesela (`uSue`, 2 m), el «color ancho» del suelo abierto (`uGnd`, 128×128 por tesela calculado a rebanadas en la `Cola`), la ortofoto del glb (`uOrt`, 0,5 m/px) con su **cociente de detalle** (rodadas, caminos: `abierto`, `rodada`, `tono`, `camino`), surcos sintéticos orientados por el gradiente de la ortofoto, cuatro octavas de ruido de luminancia, gravilla procedimental (`grano`), la **hojarasca bajo la copa** (`lit`, donde la ortofoto es copa o sombra) y un relieve fino (`hSuelo`, `pBump`) que se apaga con `uBumpK` (la VR lo pone a 0 en los perfiles 1-3). **Cero texturas fotográficas de detalle.**
- **La máscara de clases ya existe** dentro del sombreador: `abierto` (suelo sin copa ni sombra), `camino` y `desnudo` (por claridad relativa), `lit` (bajo la copa) y la cubierta de hierba por NDVI (`cov`, `vig`, de `uG`, que calcula `21_suelo.js` restando la fracción de copa del LiDAR). Las tres clases propuestas salen de ahí sin datos nuevos: **ruedo** ≈ `lit` (y la distancia a la copa), **camino** ≈ `camino`, **calle** = el resto abierto.
- **Hierba** (`21_suelo.js`): `InstancedMesh` de hasta 16.000 matas (3 cartulinas cruzadas, 18 triángulos por mata), con un atlas **dibujado por programa** de 4 losetas de 256 px (1024×256, `CanvasTexture`), `alphaTest: 0.42`, color por instancia, viento en el vértice y fundido por trama de 34 a 58 m. **Piedras**: hasta 2.600 icosaedros deformados (80 triángulos) con color por instancia y ruido en el fragmento, más una sombra de contacto instanciada. En VR la hierba sigue `VRP.hierba` (32 m en el perfil 0, 20 m en el 1, **0 en los perfiles 2 y 3**).
- **Fotos propias que ya hay:** las tres del constructor del olivo (`apps/web/olivo/texturas/`, corteza, musgo y madera muerta, 20-120 KB, con `LICENCIA.txt`, decisión 30, ADR-0017). Ojo: **en el mundo el olivo generado usa la corteza dibujada** (`07ab_generados.js`, línea 204: «sin fotos de campo aquí»); las fotos se ven en el visor y la herramienta del constructor. Es el mismo caso que el suelo: hay un camino probado para versionar fotos propias con licencia (decisión 30, guardián de secretos que las admite por nombre y con tope de tamaño), pero no un camino para llevarlas comprimidas al motor.
- **Tubería de imagen:** `sharp` 0.35.5 (en `apps/web` y `tuberia/tiles3d`) y `@gltf-transform/*` 4.5.1 en `tuberia/tiles3d`. **No hay KTX2 en ninguna parte** (AG-1.1, dentro de Q0d, sin empezar).
- **Rendimiento en la Quest** (OPTIMIZACION, 2026-11-02): con el perfil más bajo (3), p95 de 20,7 ms frente a 13,9 ms. **El aparato no tiene margen**: en VR nada nuevo puede costar hasta que Q0c calibre los perfiles.

### A.2 Diseño propuesto (cómo encaja)

1. **Detalle de cerca dentro del mismo sombreador** (`04d`), no una malla nueva: **0 llamadas y 0 triángulos añadidos**. Coordenadas del mundo (`vWP.xz`) a 1 repetición cada 1,5-2 m; la foto se **multiplica por su propia media** (detalle en torno a 1) y se aplica sobre el color que ya sale de la ortofoto, así **la ortofoto sigue dando el color a gran escala** y cada repetición queda teñida por ella. Fundido con la distancia con el `cerca` que ya existe (12-60 m) y apagado en el `uDet` de lejos.
2. **Repetición sin costura:** dos muestras de la misma textura con giro y desplazamiento distintos por celda de ruido (técnica de «stochastic/hex tiling») o, más barato, dos escalas mezcladas con el `dn()` que ya hay; la primera cuesta 2-3 muestras, la segunda 2.
3. **Tres clases** con un `mix()` por las máscaras existentes (`lit`, `camino`, abierto): 3 texturas de color (o un `DataArrayTexture`/atlas de 3 capas), más **relieve derivado** en el canal alfa para alimentar el `hSuelo` ya existente (así no hay mapa de normales: el `pBump` actual lo convierte).
4. **Hierba con recortes:** el mismo `InstancedMesh` y el mismo atributo `aTile`; se cambia el atlas dibujado por uno de **fotos de perfil recortadas** (2048×512, 8 losetas) y, tras AG-2.2, la cartulina por un polígono a la silueta.
5. **Piedras como calcomanías:** en el suelo, una capa de «manchas de piedra» en el sombreador (de una foto cenital de canto rodado), y se dejan como geometría solo las grandes cercanas (bajar `NSTONE` de 2.600 a unas pocas centenas): **ahorra** triángulos (2.600 × 80 = 208 k de techo hoy).
6. **Unión suelo-olivo:** el anillo `lit` pasa a la foto de hojarasca (clase ruedo) y gana una oclusión ambiental radial bajo la copa (función de la distancia al centro de la copa de `copas`, o de la máscara de sombra de la ortofoto, ya calculada en `detalleG`).

### A.3 Política por aparato

| Clase | Detalle fotográfico del suelo | Hierba con fotos | Notas |
|---|---|---|---|
| Escritorio | 3 clases, 1024² con relieve, hasta 60 m | sí, hasta 70 m | el sitio para aprobar con capturas |
| Móvil | 1-3 clases a 512², sin relieve | sí, radio de hoy (55 m paseando) | **no probado** en iPhone |
| Quest | **apagado** en todos los perfiles hasta Q0c; después, como mucho 1 clase a 512² sin relieve en el perfil 0 (como `uBumpK`) | atlas nuevo solo con `alphaToCoverage` (AG-2.1) | **no probado** en el casco; la medida manda |

Encaja con el módulo `Aparato` de AG-0.3 (una tabla de política por clase); hasta que exista, se cuelga del mismo interruptor que `uBumpK` en `29_vr.js` (`vrPerfil`).

### A.4 Coste de texturas, dibujo y CPU (cálculo, no medida)

| Pieza | Sin comprimir (RGBA8 + mips ×1,33) | Comprimida en la GPU (ASTC 4×4 ≈ 1 B/px + mips) [NO VERIFICADO en la Quest] | Disco (KTX2, orientativo) |
|---|---|---|---|
| A0: 1 textura 1024² | 5,6 MB | 1,4 MB | 0,2-0,7 MB |
| A1: 3 clases 1024² con relieve en alfa | 16,8 MB | 4,2 MB | 0,6-2 MB |
| A2: atlas de hierba 2048×512 | 5,6 MB (hoy 1024×256: 1,4 MB) | 1,4 MB | 0,3-1 MB |
| A3: hojarasca y piedras (en las 3 clases) | incluidas | incluidas | — |

- **Dibujo:** 0 llamadas y 0 triángulos para el suelo; la hierba igual que hoy; las piedras, **menos** triángulos. El coste está en el **fragmento**: el terreno ocupa casi toda la pantalla, y cada clase con repetición estocástica son 2-3 lecturas de textura más por píxel cercano. En la Quest, donde lo probable es que mande la GPU (por confirmar en Q0a), es el riesgo número uno; por eso la política de A.3.
- **Formato:** Basis Universal en KTX2 se transcodifica al cargar al formato del aparato (BC en escritorio, ASTC o ETC2 en móvil), y en la GPU ocupa del orden de 4-8 veces menos que RGBA8; ETC1S para el color, UASTC para el relieve y lo que no admite artefactos ([fuente de un fabricante, sin pruebas que la respalden](https://app.cinevva.com/es/tools/ktx2-compressor); [NO VERIFICADO] en Quest Browser).
- **Lo que pide al motor KTX2 (AG-1.1):** `KTX2Loader` de `three/examples` con el transcodificador Basis (JS + **WebAssembly**) servido del mismo origen. **Hallazgo:** la CSP del Caddy (`infra/Caddyfile`, línea 31, hoy en `Report-Only`) tiene `script-src 'self'` **sin `'wasm-unsafe-eval'`**; cuando la CSP pase a obligatoria, compilar el WebAssembly del transcodificador quedará bloqueado [NO VERIFICADO el comportamiento exacto en Quest Browser; es lo que dice la especificación CSP3]. Igual afecta a meshopt (AG-1.2) si usa su decodificador WASM. Debe resolverse dentro de AG-1.1. **Actualización (EV-1f, 2026-11-05):** ya está en los dos Caddyfile (`script-src 'self' 'wasm-unsafe-eval'`, sigue en `Report-Only`), con su comprobación en `infra/probar-caddy.sh` y `pruebas/guardianes/csp_wasm.test.js`; sin desplegar.
- **Tubería** (`tuberia/suelo/`, script reproducible en Node con `sharp`, regla 12): corrección de color con la hoja de campo (carta gris o de color en el folio), recorte, repetición sin costura, relieve derivado (luminancia en paso alto: es **ilustrativo**, regla 5), atlas recortado a la silueta (alfa por umbral de color sobre fondo de cartulina) y compresión a KTX2 con `toktx` de KTX-Software (o la orden `etc1s`/`uastc` de `@gltf-transform/cli`, que lo usa por dentro) [NO VERIFICADO que la versión 4.5.1 de la CLI lo haga igual; se fija versión al instalar]. Para la repetición sin costura no se ha encontrado una librería npm mantenida; el código propio es pequeño (mezcla de la imagen con su copia desplazada medio periodo bajo una máscara de ruido) y el encargo lo justificará (regla 12).

### A.5 Qué pide a Antonio en el campo

Una **salida de 2-3 h** para A0+A1 (y una segunda en la otra estación si se quiere suelo verde y seco):
- **Hoja de campo:** un folio con una regla de 20 cm, una carta gris (o un trozo de cartulina gris neutra) y el nombre del sitio y la fecha (la fecha **no** va al repo con coordenadas: regla 4).
- **Suelo desde arriba**, móvil a ~1,2-1,5 m, vertical, **cielo cubierto o a la sombra** (sin sombras duras ni la del propio fotógrafo), la hoja en una esquina de la primera foto de cada serie: 5-8 fotos de **calle**, de **camino/rodada** y de **ruedo** (bajo la copa, con hojarasca); total 20-25.
- **Plantas de perfil:** 10-15 matas típicas (gramínea verde, seca, flor de temporada, espiga) con una **cartulina lisa detrás** para recortar.
- **Piedras:** 3-4 fotos cenitales de grupos de cantos.
- **Licencia:** las fotos serían de Cano & Damas como las de la corteza (decisión 30) o CC BY 4.0 si Antonio prefiere que se reutilicen (pregunta 2). **Sin personas, sin matrículas, sin el GPS** en el EXIF (la tubería lo quita, como la api con las fotos de las familias).

Alternativa sin campo (para A0 de prueba): texturas CC0 de bibliotecas abiertas (p. ej. ambientCG o Poly Haven, que se anuncian como CC0 [NO VERIFICADO aquí]); valen para decidir si la técnica merece la pena, no para el «es mi finca».

### A.6 Versión mínima (A0)

Una clase (**calle**: el suelo abierto sin camino ni copa), **una** foto repetible de 1024² (PNG o JPEG sin comprimir de momento, servida del mismo origen), dos escalas mezcladas, teñida por la ortofoto, fundida de 12 a 40 m, **solo escritorio** (en VR y móvil, apagado). Criterio para seguir: capturas lado a lado a pie bajo copa, a 30 m y en el mirador (los tres puntos de MEJORAS-TECNICAS), aprobadas por Antonio; y en el banco, 0 llamadas y 0 triángulos de más y texturas +5,6 MB (`renderer.info.memory`). Si a la altura de los ojos no se nota frente al ruido procedimental de hoy, se para aquí.

### A.7 Riesgos

| Riesgo | Mitigación |
|---|---|
| GPU de la Quest (fragmento del terreno) | apagado en VR hasta Q0c; luego 1 clase a 512² en el perfil 0 |
| Repetición visible a media distancia | repetición estocástica, fundido a 40-60 m, tinte por la ortofoto |
| Honestidad: parecer «medido» | la foto es **ilustrativa** (aspecto del tipo de suelo), la clase es **deducida** (de la ortofoto y el NDVI); se rotula así en la leyenda del suelo |
| Memoria si no llega KTX2 | A0 se queda en escritorio; A1 espera a AG-1.1 |
| CSP y WebAssembly | `'wasm-unsafe-eval'` en `script-src` dentro de AG-1.1, con su prueba en `infra/probar-caddy.sh` |
| Repo público | las fotos solo con licencia explícita (decisión 30) y sin metadatos; nada de coordenadas |

---

## Propuesta B — Biodiversidad

### B.1 Qué hay hoy

- **Fauna** (`16b_fauna.js`, componente `fauna-olivar`): 22 aves en dos bandadas y posadas (2 mallas instanciadas) y 6 conejos; **ilustrativa**, sin especie ni dato. Los perros (`25_perros`) persiguen conejos.
- **Sonido** (`20_sonido.js`): **todo sintetizado** (ruido filtrado para viento, trinos de 2-5 notas con barrido, grillos); **ningún fichero de audio** hoy. La CSP ya admite `media-src 'self' blob:`.
- **OlivarTrack** por MCP tiene `registrar_trampeo` (escritura, que el gemelo no usa: el gemelo solo lee, `contratos/mcp.md`); qué herramientas de lectura dan los conteos de trampa está **por verificar** en `contratos/mcp.md`.
- El motor **no hace `fetch` a otros hosts** (CLAUDE.md §5): todo dato de biodiversidad se precalcula en `tuberia/` y se publica como fichero de la finca.

### B.2 Fuentes: acceso, licencia y qué se precalcula

| Fuente | Acceso | Licencia y atribución | Formato y tamaño | Qué se precalcula | Uso en el mundo |
|---|---|---|---|---|---|
| **GBIF** | API REST abierta para buscar; la **descarga** autenticada (cuenta) da un **DOI por descarga** | Solo **CC0, CC BY o CC BY-NC** por conjunto de datos (política de 2014); con BY y BY-NC hay que **citar a los proveedores**; se cita con el bloque «Please cite as» y el DOI de la descarga ([GBIF, licencias](https://data-blog.gbif.org/post/gbif-occurrence-license-processing/); [NBN sobre la política](https://nbn.org.uk/news/gbif-new-approaches-to-data-licensing-and-endorsem/); [ejemplo de cita](https://www.gbif.org/ar/occurrence/download/0002305-171025204727650)). Una descarga mezclada puede quedar con la licencia **más restrictiva** [NO VERIFICADO: dicho en un foro, no en GBIF] | CSV/DwC-A; para un cuadro de ~10 km alrededor de la finca, de cientos a miles de registros [NO VERIFICADO] | por especie: **meses con registros** en el cuadro, nº de registros y años; solo especies de olivar y su entorno | **«probable por zona y mes»** (deducido): qué aves vuelan, cuándo |
| **iNaturalist** | API sin clave para leer; recomiendan **≤ 60 peticiones/min** ([foro](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709/3)); límite diario y de fotos [NO VERIFICADO: la página oficial devolvió 403] | Cada observación y cada foto con **su** licencia (CC0, BY, BY-NC… o todos los derechos reservados); las de **grado de investigación** con licencia abierta pasan a GBIF ([foro](https://forum.inaturalist.org/t/inaturalist-data-on-gbif-shows-only-cc-by-nc-excluding-cc0-and-cc-by/9952)) | JSON | **mejor por GBIF** (ya integra lo publicable, con DOI); fotos: no se usan (licencias por foto) | nada aparte de GBIF |
| **xeno-canto** | API v3 **con clave** de una cuenta verificada para descargar (desde octubre de 2025, según paquetes de terceros [NO VERIFICADO en la web oficial: protegida contra robots]); prohíben descargas masivas automáticas | **Cada grabación con su licencia CC** elegida por quien graba; **obligatorio** mostrar **autor, licencia y número de catálogo (XC…)** donde se use ([condiciones](https://xeno-canto.org/about/terms), resumen por buscador; la página dio 403). Muchas son **BY-NC-SA o BY-NC-ND** [NO VERIFICADO el reparto] | MP3, segundos a minutos | **10-30 clips cortos** (2-4 s) de las especies probables, recortados y normalizados en `tuberia/`, solo con licencia que permita el uso (BY o BY-SA; BY-NC si Antonio acepta que el gemelo es no comercial: pregunta 3) | **cantos reales** del ave probable del mes, con el crédito en la ficha del sonido |
| **Inventario Español de Especies Terrestres (MITECO)** | Atlas en **cuadrícula UTM 10×10 km** (5.571 cuadrículas; aves reproductoras 2003, invernantes 2007-2010) ([MITECO, aves](https://www.miteco.gob.es/es/biodiversidad/temas/inventarios-nacionales/inventario-especies-terrestres/ieet_aves.aspx)) | Licencia de reutilización **[NO VERIFICADO]** (no se encontró el aviso de la descarga) | capas por cuadrícula | presencia **por cuadrícula** de la finca (reproductora / invernante) | refuerzo de «probable por zona» con fuente oficial; datos de hace 15-20 años: se dice |
| **REDIAM** (Junta de Andalucía) | Catálogo de información ambiental con censos de fauna ([documentación de la Junta](https://www.juntadeandalucia.es/sites/default/files/2026-04/MT%2013.03.03%20Censos%20fauna.pdf)) | **por conjunto** [NO VERIFICADO: la búsqueda no dio la licencia] | WMS/WFS, shapefile | si hay censo cercano, presencia por zona | como el IEET |
| **Olivares Vivos (SEO/BirdLife)** | Sin descarga pública encontrada; 165 especies de aves registradas en olivares, guía de aves del olivar ([SEO/BirdLife vía prensa](https://www.ecoticias.com/naturaleza/211568_primera-guia-aves-olivar); [estudio CSIC 2025](https://www.ebd.csic.es/sites/default/files/documentos/2025-07/20250721_aves_olivos.pdf)) | **[NO VERIFICADO]**; datos bajo petición | — | **lista de especies típicas del olivar** (para filtrar GBIF) y, si la dan, su método de censo | criterio de qué especies modelar |
| **RAIF** (Red de Alerta e Información Fitosanitaria) | Plagas del olivar por estación de control (mosca, prays…), no fauna silvestre | **[NO VERIFICADO]** | — | nivel de plaga por zona y semana | capa «sanidad por zona», no fauna |
| **OlivarTrack: trampas de mosca** | MCP, leído por la api (`/api/ot/...`) | **dato privado** de la explotación (regla 4): no al repo; solo al servidor con sesión | — | conteos por parcela y semana | **«medido en la finca»** |

Tamaño publicado para B0+B1 (cálculo): tabla de 30-60 especies × 12 meses con licencias y créditos, **< 20 KB** de JSON; 20 clips de 3 s en Opus o MP3 a 48-64 kbit/s mono, **~0,5 MB** en disco.

### B.3 Qué cambia en el mundo

- **Fauna por especie y mes:** los 22 pájaros de hoy pasan a ser 2-4 **siluetas-tipo** (pájaro pequeño en bandada, córvido, rapaz planeando, abubilla/ave de suelo), elegidas por las especies probables del mes; mismas 2 mallas instanciadas por tipo (≤ +4 llamadas: en gafas cuentan doble). Nada de 30 modelos distintos.
- **Cantos reales:** se cargan solo los del mes y se **decodifican bajo demanda**. Cálculo: 1 s de PCM float32 a 48 kHz mono = 192 KB; 20 clips × 3 s ≈ **11,5 MB** decodificados en memoria (a 24 kHz, 5,8 MB). Presupuesto propuesto: **≤ 8 clips decodificados a la vez y ≤ 4 MB** en la Quest, el resto se suelta; en VR, si el perfil baja de 1, solo los sintetizados de hoy. Coste de CPU: un `AudioBufferSourceNode` por canto con su `PannerNode`; despreciable frente al fotograma [NO VERIFICADO en el casco].
- **Aviso de honestidad (regla 5)** en el mundo y en la ficha: tres niveles con su rótulo y su fuente.
  - **Medido en la finca** — un conteo de trampa de OlivarTrack, una caja nido revisada, un canto grabado en la finca *con identificación automática y su confianza* (la grabación es medida; la especie es **deducida** por el modelo: se dice así).
  - **Probable por zona y mes** — de GBIF/IEET en el cuadro de 10 km: «el abejaruco se ha registrado en esta zona en mayo (GBIF, n registros, años)». **Deducido.**
  - **Decorativo** — la animación, la silueta, la bandada y cuándo canta: **ilustrativo**.
  Un panel «¿qué estás oyendo?» con especie, nivel de honestidad y **crédito obligatorio** (autor, licencia, XC…).

### B.4 El grabador de cantos (B2)

- **Aparatos:** AudioMoth 1.2 (Open Acoustic Devices), de 60 a 135 USD en compras colectivas de 2021-2022 ([GroupGets](https://cdn.groupgets.com/campaigns/853-audiomoth-v1-2-0-round-12)); autonomía muy dependiente del ciclo: ~9 días grabando sin parar a 48 kHz con pilas de 3.000 mAh, y más de 400 días con ciclos cortos y batería grande ([estudio NSF](https://par.nsf.gov/servlets/purl/10478417); [REF 2021](https://results2021.ref.ac.uk/impact/602221dc-0923-4165-a03f-c41b71337495/pdf)). Graba a tarjeta: hay que ir a por ella y analizar fuera. **BirdNET-Pi**: Raspberry Pi + micrófono, analiza en vivo; necesita energía continua (placa solar y batería: coste y consumo **[NO VERIFICADO]**, del orden de 100-250 € el conjunto [NO VERIFICADO]) y, para publicar, red.
- **Licencias (bloqueo real):** el código de BirdNET-Analyzer es MIT, pero los **modelos son CC BY-NC-SA 4.0** y solo lo educativo y de investigación se considera no comercial; para lo comercial piden contactar ([BirdNET-Analyzer](https://github.com/birdnet-team/BirdNET-Analyzer)). Un fork de BirdNET-Pi dice que no se puede usar para un producto comercial ([fork](https://github.com/StellarStoic/BirdNET-Pi)). Cano & Damas es una explotación comercial y «Cuarenta hazas» tiene parte comercial: **hay que preguntar a Cornell** o tratarlo como uso no comercial justificado (pregunta 4).
- **Privacidad:** la voz es dato personal y grabarla es tratamiento; la AEPD ha sancionado audio no informado en videovigilancia (artículos 6 y 13 RGPD) ([resumen](https://elderecho.com/sistema-videovigilancia-grabacion-voz); [AEPD, expediente](https://www.aepd.es/documento/ai-00520-2024.pdf)). No se encontró criterio de la AEPD para bioacústica [NO VERIFICADO]. Medidas propuestas para la EIPD: lejos de caminos, casas y del ruedo donde se trabaja; **no guardar el audio**, solo la detección (especie, hora, confianza) o, como mucho, clips de ≤ 3 s de detecciones de ave con confianza alta; filtro que descarte franjas con voz (BirdNET tiene una clase «Human vocal» [NO VERIFICADO]); cartel informativo; plazo de borrado; horario (amanecer y atardecer). Encaja como ampliación de la EIPD como [EIPD-CAMPO](EIPD-CAMPO.md) y [EIPD-VOZ](EIPD-VOZ.md). **Decisión de Antonio.**
- **Dónde:** 1-2 aparatos en el borde de la finca hacia el arroyo o los árboles que no son olivo (`18_paisaje`), a 1,5-2 m en un poste, lejos de caminos. Las coordenadas exactas no van al repo.
- **Datos:** las detecciones son dato de la explotación → servidor, no repo (regla 4); al mundo, agregadas por semana y especie.

### B.5 Versión mínima (B0)

Script `tuberia/biodiversidad/gbif.py` (o `.mjs`) que, con la cuenta GBIF de Antonio (variable `GEMELO_GBIF_*`, nunca en el repo), pide una descarga del cuadro de ~10 km alrededor de la finca, filtra por la lista de aves del olivar, agrega **especie × mes** y escribe `biodiversidad.json` con **DOI de la descarga, licencia por conjunto y créditos**; el contrato (un esquema «biodiversidad» nuevo en la carpeta de contratos y su fixture sintético) entra en el mismo commit (regla 3). El motor solo lo lee y lo muestra en la ficha del mes («aves probables en mayo», nivel *probable*, fuente con DOI) **sin cambiar la fauna dibujada**: 0 llamadas, 0 triángulos. Criterio para seguir: que la lista tenga sentido para Antonio y la familia.

### B.6 Riesgos

| Riesgo | Mitigación |
|---|---|
| Licencias BY-NC / BY-NC-SA (GBIF, xeno-canto, BirdNET) en un proyecto con parte comercial | filtrar por licencia en la tubería; registrar la licencia de cada pieza; pregunta 3 y 4 |
| Atribución incompleta | crédito obligatorio generado por la tubería y mostrado por el motor; guardián que falle si falta autor, licencia o XC |
| Especies sensibles (rapaces, nidos) cerca de la finca | publicar por cuadrícula de 10 km y por mes, nunca puntos; GBIF ya oculta algunas [NO VERIFICADO] |
| Memoria de audio en la Quest | ≤ 8 clips decodificados, soltar por mes; en perfiles bajos, solo sintetizado |
| Honestidad (un canto real de un ave «probable» parece medido) | rótulo de nivel en cada sonido y ficha; la detección de BirdNET es *deducida* |
| Privacidad del grabador | EIPD antes de instalar; no guardar audio crudo |
| Llamadas en gafas (cuentan doble) | siluetas por tipo instanciadas, ≤ +4 llamadas |

---

## Tareas atómicas propuestas para el PLAN

(Pesos y modelos según CLAUDE.md §6; ninguna abre Chrome salvo la medida por el banco.)

| Id | Tarea | Depende de | Peso · modelo |
|---|---|---|---|
| EV-1a | **Suelo A0**: una foto de «calle» (CC0 de prueba o de campo) a 1024², detalle en `04d` en coordenadas del mundo, dos escalas, teñida por la ortofoto, fundido 12-40 m, solo escritorio (VR y móvil apagados con el interruptor de `uBumpK`); bandera `?sueloFoto=0`. Medida: 0 llamadas y 0 triángulos de más, texturas +5,6 MB. Capturas en los tres puntos de vista | — | ligera · sonnet; 🔶 banco; 👤 capturas |
| EV-1b | **Tubería de suelo** `tuberia/suelo/` con `sharp`: color por la carta gris de la hoja de campo, recorte, repetición sin costura, relieve derivado en alfa, sin EXIF; KTX2 con `toktx` (versión fijada); guardián de licencia como el de la corteza (decisión 30) | AG-1.1 (para el KTX2) | media · sonnet |
| EV-1c | **Suelo A1**: tres clases (ruedo = `lit`, camino = `camino`, calle) con repetición estocástica y relieve al `hSuelo`; política por aparato (Quest apagado hasta Q0c); leyenda «foto ilustrativa, clase deducida» | EV-1a aprobado, EV-1b, AG-1.1 | media · **opus**; 🔶 banco; 👤 capturas |
| EV-1d | **Hierba con recortes**: atlas 2048×512 de fotos de perfil en el `InstancedMesh` de `21_suelo` (mismo `aTile`), con la cartulina a la silueta | AG-2.1, AG-2.2, EV-1b | ligera · sonnet; 👤 capturas |
| EV-1e | **Piedras como calcomanías y unión suelo-olivo**: manchas de piedra en el sombreador, `NSTONE` de 2.600 a ≤ 300 grandes cercanas; hojarasca fotográfica y oclusión radial bajo la copa | EV-1c | ligera · sonnet; 🔶 banco |
| EV-1f | **CSP para WebAssembly**: `'wasm-unsafe-eval'` en `script-src` de los dos Caddyfile para el transcodificador Basis y meshopt, con su prueba en `infra/probar-caddy.sh` (no desplegar sin OK) | — (antes de AG-1.1 en servidor) | ligera · sonnet |
| EV-1g | **Biodiversidad B0**: `tuberia/biodiversidad/` con descarga GBIF del cuadro de 10 km (credenciales `GEMELO_GBIF_*`), especie × mes, DOI y licencias; contrato `biodiversidad` con esquema y fixture; ficha «aves probables este mes» con nivel *probable* y fuente | — | media · sonnet |
| EV-1h | **Cantos reales B1**: 10-30 clips de xeno-canto con licencia permitida (lista blanca de licencias), recortados en la tubería, créditos obligatorios; `20_sonido` los mezcla con los sintetizados, ≤ 8 decodificados y ≤ 4 MB en la Quest | EV-1g, Q0c, pregunta 3 | ligera · sonnet; 👤 Quest |
| EV-1i | **Fauna por tipo**: 2-4 siluetas instanciadas elegidas por las especies probables del mes en `16b_fauna`; rótulo de nivel en la ficha; ≤ +4 llamadas | EV-1g | ligera · sonnet; 🔶 banco |
| EV-1j | **Grabador B2 (estudio y EIPD)**: borrador de EIPD del grabador, consulta a Cornell sobre uso comercial de BirdNET, contrato de detecciones agregadas | pregunta 4 | media · **opus** |

## Preguntas para Antonio (con recomendación)

1. **¿Probamos primero sin salir al campo?** A0 con una textura CC0 de prueba para ver si la técnica merece la pena, y la salida de 2-3 h solo si convence. *Recomendación: sí*; ahorra una salida si el detalle no se nota a la altura de los ojos.
2. **Licencia de las fotos de suelo y plantas:** ¿como las de la corteza (© Cano & Damas, todos los derechos reservados, decisión 30) o CC BY 4.0? *Recomendación: como la corteza*, por coherencia; CC BY solo si queréis que otros las reutilicen.
3. **¿El gemelo cuenta como uso no comercial** a efectos de CC BY-NC (GBIF, xeno-canto)? *Recomendación: no darlo por hecho*; la tubería usa solo CC0, BY y BY-SA, y BY-NC se añade si lo decides tras consultarlo.
4. **¿Grabador de cantos en la finca?** Supone EIPD, cartel, licencia comercial de BirdNET por aclarar y una visita periódica. *Recomendación: aplazarlo*; primero B0 y B1, y si la familia lo valora, un AudioMoth con ciclo corto sin guardar audio crudo, tras la EIPD.

## Lo no verificado (resumen)

Formato y memoria reales de KTX2 en Quest Browser (ASTC); que la CSP sin `'wasm-unsafe-eval'` bloquee el transcodificador en Quest Browser; la orden KTX2 de `@gltf-transform/cli` 4.5.1; la licencia CC0 de ambientCG y Poly Haven; límites diarios y de fotos de iNaturalist; la clave de la API v3 de xeno-canto y su fecha; el reparto de licencias en xeno-canto; licencias de IEET (MITECO), REDIAM, RAIF y Olivares Vivos; precios y consumo de BirdNET-Pi con placa solar; la clase de voz humana de BirdNET; el ocultamiento de especies sensibles en GBIF; cualquier coste en el casco (nada probado en Quest ni iPhone).
