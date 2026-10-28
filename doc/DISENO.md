# Gemelo digital — de Cerro Velasco a la finca Hituelo completa

Diseño de la refactorización (27-oct-2026). Solo lectura sobre el artefacto vivo: no se ha publicado ni tocado nada.
Todo número de esta página sale de medir `gemelo_cerro_velasco.html` v20 (Chrome + SwiftShader, así que **las cifras
de CPU/memoria/geometría valen; los fps no**) o de los datos de OlivarTrack en producción. Lo que es suposición lleva la marca **[SUPUESTO]**.

---

## 0. Las cinco decisiones clave

1. **El mundo deja de ser «una ventana» y pasa a ser un `MUNDO` de teselas de 256 m** (49 con 60 m de margen = 3,2 km²).
   Las funciones que ya usa todo el código (`suelo(x,y)`, `copaAlta`, `orto`, `ndviRel`, `cubierta`, `D.ext`) **conservan nombre y
   firma** y cambian de interior: así los 11 bloques (tiempo, vida, perros, huellas, balizas, sonido, estación…) casi no se tocan.
2. **El coste por fotograma deja de depender de la superficie y pasa a depender de la distancia a la cámara**: presupuesto fijo
   igual al de hoy (≈1,7 M triángulos, ≈1 M puntos, ≈250 llamadas de dibujo, ≈350 MB de memoria). Se consigue con LOD de
   terreno, de olivos y de nube, no con «cargar menos finca».
3. **Todo lo que hoy se recalcula sobre toda la ventana pasa al sombreador o al radio de la cámara** (color del suelo por NDVI,
   exageración vertical, normales, pintado de la nube). Hoy cambiar de modo cuesta 1,35 s de JS bloqueante; ×10 serían 13 s.
4. **Dos calidades con el mismo motor.** *Base (hoy, sin LiDAR 3.ª):* MDT 5 m + MDS normalizado 2,5 m + ortofoto + NDVI + el
   detector de olivos de producción → cabe **en un solo HTML (~7 MB)**, sin streaming. *Alta (con LiDAR 3.ª cobertura):* teselas
   con nube 0,5 m y forma real de cada copa, servidas como ficheros de apoyo. El registro de árboles lleva `perfil` y `pts`
   opcionales: si faltan, la copa se genera por procedimiento.
5. **Lo primero es una prueba de plataforma de una hora** (¿puede la página hacer `fetch`/`<img>` de sus ficheros de apoyo?).
   Si sale mal, la calidad Base sigue valiendo y la Alta se reparte en trozos que caben en la página.

---

## 1. Qué es Hituelo (medido en producción, `fincas` en Firestore)

| | Cerro Velasco (hoy) | Hituelo (objetivo) | Factor |
|---|---|---|---|
| Fincas de OlivarTrack | 1 | **4**: Marin Hituelo ((id interno), 14 parcelas), Oleicultores Hituelo (10), Cano Hituelo (1), Araceli Hituelo (2) | |
| Parcelas | 5 | **27** (no 28; 3 son «pasto» sin olivos) | 5,4× |
| Superficie de parcelas (geometría) | 7,1 ha | **95,0 ha** | 13,4× |
| Olivos declarados (`numOlivos`) | 583 (marcados) | **5.961** | 10,2× |
| Caja envolvente (UTM 30N) | 826 × 428 m = 0,35 km² | **1.701 × 2.447 m = 4,16 km²** (x 404.925–406.626; y 4.177.646–4.180.093) | 11,8× |
| Superficie que de verdad hay que modelar (teselas de 256 m con 60 m de margen) | 0,35 km² | **49 teselas = 3,21 km²** | 9,1× |
| Hojas LiDAR de 1 km (parcelas + 60 m) | 2 (410, 411 × 4177) | **9**, 2 de ellas con el 92 % de las hectáreas (ver §9) | |

Densidad: 48–94 olivos/ha (mediana ≈ 60). Las 27 parcelas ocupan solo el 23 % de la caja: el 77 % restante es campo sin árboles que se
modela barato (terreno + ortofoto).

---

## 2. Inventario medido del gemelo actual

### 2.1 El JSON `D` embebido (9,32 MB de los 9,58 MB de HTML)

| Bloque | Bytes (base64) | Qué es | Escala con | Si se repitiera tal cual para 3,21 km² |
|---|---:|---|---|---:|
| `puntos` | 5.607.237 | 700.902 pts LiDAR, 3×int16 (6 B/pt) ≈ **2 pts/m²** | superficie | **≈ 51 MB** |
| `dtm` | 942.780 | MDT 826×428 a **1 m**, int16 cm | superficie | 8,6 MB |
| `chm` | 942.780 | altura de vegetación 1 m, int16 | superficie | 8,6 MB |
| `orto` | 933.715 | JPEG 2360×1222 (0,35 m/px) | superficie | 8,5 MB |
| `ndvi` | 400.564 | 83×43 px (10 m) × 42 fechas, int16 | superficie | 3,6 MB (4,7 sobre la caja) |
| `suelo` | 353.564 | color SoilGrids/orto a 2 m, RGB | superficie | 3,2 MB |
| `copas` | 71.676 | **1.131** copas: x,y,h, **8 radios**, parcela (63 B/copa) | nº de árboles | ≈ 0,7 MB |
| `paisaje` | 14.165 | 3 edificios, tendido (postes+derivaciones), arroyo, 89 árboles no olivo | local | pequeño |
| `suelo_ndvi` | 10.598 | desmezcla NDVI = a + b·f | superficie | 0,1 MB |
| `marcados`, `parcelas`, `ot`, `avance` | 12.656 + 5.471 + 1.947 + 4.371 | marcas, lindes, datos de OlivarTrack | nº de parcelas | pequeño |
| **Total `D`** | **9.321.225** | | | **≈ 85–90 MB** |

Conclusión: **cuatro bloques (nube, dtm, chm, orto) son el 97 %** y todos escalan con la superficie. Con el límite de 16 MB de la página,
ni siquiera el 9,1× entra. Hay que reducir (nube solo donde hay árboles, y a trozos) o repartir en ficheros.

### 2.2 La escena en marcha (Chrome, ventana 900×600, `renderer.info`)

| Modo | Llamadas | Triángulos | Puntos | Vértices totales | Instancias | Heap JS |
|---|---:|---:|---:|---:|---:|---:|
| Nube LiDAR (por defecto) | 223 | 765.520 | 678.868 | 3,21 M | 3.873 | 96 MB |
| Gemelo | 229 | **1.677.322** | **973.458** | 4,72 M | 4.858 | **207 MB** |
| Gemelo + Paseo | 334 | 1.706.900 | 973.458 | 4,72 M | 8.195 | 149–255 MB |

Desglose en modo Gemelo (objetos visibles de más de 2.000 vértices):

| Objeto | Vértices | Triángulos / puntos | Nota |
|---|---:|---:|---|
| Malla de terreno (1 m) | 353.528 | **704.550 tri** | una sola malla; las 6 de abajo comparten sus vértices y solo cambian el índice (selección de parcela) |
| Copas (malla de 8 radios) | 215.400 | 387.720 tri | 1.131 árboles ≈ 343 tri/árbol |
| Troncos y ramas (tubos) | 317.034 | 521.928 tri | ≈ 461 tri/árbol |
| Hojas grandes (sprites) | 256.495 | 256.495 pts, 3,1 | |
| Hojas pequeñas (sprites) | 428.384 | 428.384 pts, 1,7 | |
| Corteza | 116.739 | 116.739 pts | |
| Frutos/flores/olivas | 171.220 | 171.220 pts, shader | |
| Nube LiDAR (oculta en este modo) | 700.902 | 700.902 pts | sigue en memoria aunque no se dibuje |
| Instancias (copas, marcas, sombras…) | | 1.077 + 542 + 583 + … | |

Por árbol (1.131 copas): **≈ 800 triángulos + ≈ 710 puntos de follaje** en modo Gemelo.

### 2.3 Tiempos de CPU (JS bloqueante, esta máquina; en un iPhone serán mayores)

| Operación | Tiempo | Por qué |
|---|---:|---|
| Primer fotograma desde la navegación | 1,05 s | (el DOMContentLoaded tarda 8,4 s con SwiftShader + 9 MB; no es comparable) |
| Pulsar «Gemelo» | **1.350 ms** | `aplica()` → `alturaTerreno` (normales de 353k vértices) + `construyeArboles` + `construyeFollaje` + `recoloreaSuelo` + … sobre **toda** la ventana |
| Pulsar «Ortofoto» / «Nube» | 300–320 ms | misma cadena sin árboles |
| Cambiar la fecha NDVI | 4 ms (el recoloreo del suelo se pospone) | `recoloreaSuelo()` = 353k vértices × `cubierta()` cuando se aplica |
| Heap tras recorrer los modos | 255 MB | |

Proyección ×10 de lo que hoy se rehace por completo: **13 s** al cambiar de modo, **~2,3 GB** de heap. Ninguna de las dos cosas es viable en un iPhone.

---

## 3. Qué escala con qué (subsistema por subsistema)

Clases: **S** = crece con la superficie de la ventana (hay que cambiarlo); **A** = crece con el nº de árboles (LOD); **R** = ya depende de un radio alrededor de la cámara o del jugador (se queda); **1** = coste constante.

| Subsistema (dónde está en `chk.js`) | Clase | Estado actual | Acción |
|---|---|---|---|
| Nube LiDAR (`P`, `pBase`, `pintaNube`, l.110–131) | **S** | 700k pts; `pintaNube` recorre **todos** y muestrea la ortofoto por punto (700k bilineales) cada vez que cambia algo | Una nube por tesela, con puntos barajados (el prefijo = submuestra uniforme → LOD gratis con `setDrawRange`). Colorear al cargar la tesela y no en cada cambio |
| Malla de terreno (l.91–106) | **S** | rejilla 1 m única, 353k vért., índices `Uint32` de 8,4 MB; `alturaTerreno` recalcula normales de todo | Terreno por teselas con 3 niveles (1 / 2 / 8 m) + faldones; normales de la tesela con 1 px de solape; exageración en sombreador (ver §5.4) |
| `suelo(x,y)` (l.16, 30 usos) | **S** | bilineal sobre un `Float32Array` gigante | Misma firma, interior por tesela con caída a un MDT global grueso (5 m) mientras llega la tesela fina |
| `copaAlta` / CHM (l.23) | **S** | `Float32Array` global | Va en la tesela (canal B del PNG de relieve) |
| Ortofoto (`orto`, `ortCanvas`, `ort`, l.34–60) | **S** | 2360×1222 decodificada a RGBA en CPU (11,5 MB) para muestrearla punto a punto; la usa también el minimapa y el modo «Ortofoto» | Pirámide: mosaico global de baja resolución en la página (minimapa, vista lejana, color de copas lejanas) + teselas de 512² (0,5 m/px) para la zona cercana |
| Color del suelo (`colorSuelo`, `recoloreaSuelo`, l.1859) | **S** | 353k vértices, CPU, por fecha NDVI | **Al sombreador de fragmentos**: textura de suelo base de la tesela + NDVI de 2 fechas (global, 171×246 px) interpolado en la GPU. Coste por fecha: subir una textura de 42 KB |
| Campo de suelo `Gcampo` (l.1839–1853: NDVI−b·f a 2 m) | **S** | recalculado a cada fecha sobre toda la ventana | Se calcula en el sombreador con las mismas fórmulas (a, b, f por fecha), o por tesela y bajo demanda |
| NDVI (`NDV`, 83×43×42) | **S** (suave) | 10 m, muestreo bilineal en CPU | Una sola rejilla de 171×246 px × 42 fechas, u8 → 1,75 MB; es el único dato que no necesita teselas |
| Olivos: copas y troncos (`construyeArboles`, l.140) | **A** | todos los árboles, 1.131 × 800 tri | **LOD por distancia** (§5.5) |
| Follaje, hojas, corteza, frutos (`construyeFollaje`, l.247) | **A** | 710 pts/árbol, se reconstruye todo si cambia `calidad` | L0 solo cerca (≤ ~450 árboles); L1/L2 instanciados |
| Sombras de copas (`iSombra`, instanciada, 1.131) | **A** | una instancia por árbol | Una instancia por árbol L0–L1; ninguna en L2+ |
| Marcas, copas detectadas, avances (`mMarc`, `mCopas`, `mAvAnillo`…, instanciadas) | **A** | por marca/copa | Ya son instancias: pasan a anillo de LOD con el resto |
| Paisaje (`paisaje_bloque.js`: edificios, tendido, arroyo, 89 árboles no olivo) | **S** (datos) / **R** | construido una vez | Se reparte por tesela; se recoloca cuando llega el MDT fino (ya existe `colocaPaisaje()`) |
| Lindes (`creaBarrera`, 1 cinta de shader por parcela) | **S** (perímetro) | 5 parcelas | 27 cintas: ≈ 25 km de perímetro; barato, con desvanecido por distancia |
| Balizas (`balizas_bloque.js`) | **1** por parcela | 5 | 27 balizas; las lejanas, sin rayo (solo el rombo) |
| Hierba, matas, piedras (`repartePlantas`, l.1912) | **R** | radio 55–70 m, 16.000 matas máx | **Ya es el patrón correcto.** Solo cambiar la comprobación de `D.ext` por «¿hay tesela fina aquí?» |
| Huellas (`NH = 900`), polvo (`NPV = 200`) | **R/1** | anillo fijo | Sin cambios |
| Vida: pájaros, conejos; perros (`vida_bloque.js`, `perros_bloque.js`) | **R** | alrededor del jugador, acotados por `D.ext` (l.1471, 2260) | Cambiar las cotas a «mundo cargado»; sin cambios de fondo |
| Sombras de nubes (`GLSL_SOMBRA`, `uSombra`), helada (`uHielo`), viento (`uViento`), niebla, cielo, sol/luna/estrellas | **1** | uniformes globales + función de la posición del mundo | **Sin cambios** (son independientes de la superficie). Ojo con el rango de coordenadas (§5.9) |
| Estación y pantalla del tiempo, sonido, fichas | **1** | fijos | Reubicar la estación; sin otros cambios |
| Minimapa (`mini`, l.1489–1510) | **S** (imagen) | recorta `ortCanvas` | Mosaico global de baja resolución; selector de fincas (§5.8) |
| Cámara orbital (`far 5000`, niebla 900/2600) | **S** (rangos) | calibrada a ~1 km | Rangos ×3, `near` dinámico (§5.9) |
| `aplica()` (l.315) | **S** | reconstruye todo | Se divide en «escena global» y «trabajos por tesela» con presupuesto (§5.2) |

Resumen de lo que **no** hay que tocar: a ojo, más de la mitad del código (estimación, no contada: tiempo, sonido, vida, perros, huellas, polvo, estación, pantalla, historia).

---

## 4. Plataforma de artefactos: qué puede cargar la página

Leído de las instrucciones de la herramienta `Artifact` y de los `.d.ts` del contrato 0.2.90 (`assets.d.ts`, `claude.d.ts`, `files.d.ts`).

| Mecanismo | Límite | ¿Vale para teselas? |
|---|---|---|
| Página HTML (con todo embebido) | **≤ 16 MB** (incluidos los `data:`) | Hoy 9,6 MB. La calidad Base (~7 MB) cabe |
| `files` (ficheros de apoyo publicados junto a la página, ruta relativa) | texto ≤ 16 MB, binario ≤ **15 MB** por fichero; **64 MB y 255 ficheros por publicación**; **511 ficheros / 256 MB por versión**; «solo tipos web estándar»; se pueden ir añadiendo en publicaciones sucesivas | **Sí en principio.** Faltan dos comprobaciones (abajo) |
| Capacidad `assets` (`/_blob/<id>`) | 20 MiB por activo; admite imagen, vídeo, PDF, fuente, CSS/JS y **CSV/Markdown/JSON/texto**; el `.d.ts` dice que una página puede «leer su `url` y analizar el texto»; **no admite binario arbitrario**; solo editores pueden subir (el lector recibe `null` si no es editor) y exige declarar `db` | Posible para JSON/base64, pero **ata la subida a una sesión de editor**: peor que `files` |
| `fetch` a otros hosts | **bloqueado** por la CSP (solo scripts de cdnjs/jsdelivr/unpkg/tailwind/jquery, hojas de Google Fonts) | No: el IGN, Sentinel o SoilGrids **no** se pueden pedir desde la página. Todo se prepara fuera y se publica |
| `connect-src` de la propia página (¿`fetch` a un fichero de apoyo del mismo origen?) | **no documentado** | **[SUPUESTO] Sin comprobar.** La instrucción habla de bloquear «fetch/XHR/WebSocket» a hosts ajenos y de que un artefacto multi-fichero referencia sus ficheros con rutas relativas; los activos de `assets` se describen como legibles desde el mismo origen. Lo razonable es que `fetch` del mismo origen funcione, pero **hay que probarlo** |
| `<img src="ruta-relativa">` | `img-src 'self'` ya se usa en el panel; en artefactos las imágenes se citan por ruta relativa | **[SUPUESTO]** Más seguro que `fetch`; las teselas de imagen podrían cargarse así sin `fetch` |
| Binario crudo (`.bin`, `application/octet-stream`) | «solo tipos web estándar» | **[SUPUESTO]** probablemente no admitido: empaquetar en PNG RGB (alfa = 255 siempre, sin ICC) o en JSON con base64 (+33 %) |

### Prueba 0 (una hora, antes de escribir nada del diseño)

Publicar un artefacto desechable con `files = {t/a.json, t/b.png, t/c.bin, t/d.webp}` y una página que haga `fetch` de cada uno y cree una
`<img>` de cada imagen, mostrando el resultado (estado, tipo, bytes, tiempo) y los errores de consola. Resuelve: (1) ¿`fetch` mismo origen?
(2) ¿`.bin` aceptado? (3) ¿decodificación de PNG sin alterar valores con `createImageBitmap(..., {colorSpaceConversion:'none', premultiplyAlpha:'none'})`?
(4) latencia por fichero (decide el tamaño de tesela). El resultado fija el formato de §5.1 (PNG o JSON-base64 o binario).

---

## 5. El diseño

### 5.1 Mundo y teselas

* **Origen y coordenadas:** se mantiene el esquema actual (x este, y norte, relativos a un `centro_utm`), pero el centro pasa a ser el de Hituelo
  (≈ 405.776, 4.178.870). Rango máximo ±1,3 km: en `float32` la resolución es de ≈ 0,1 mm, sin problema (§5.9 para el sombreador).
* **Cuadrícula:** teselas de **256 m** alineadas a múltiplos de 256 en UTM (la tesela se llama `X_Y` con `X = floor(E/256)`, `Y = floor(N/256)`):
  así las teselas de Cerro Velasco y de Hituelo no se solapan y comparten el esquema si luego se añaden fincas. Solo se generan las que tocan una
  parcela + 60 m (49 en Hituelo); el resto del mundo es «solo grueso».
* **Capas por tesela (cada una opcional):**

| Capa | Contenido | Formato propuesto | Tamaño aprox. por tesela | Calidad |
|---|---|---|---:|---|
| `rel` | relieve 1 m (257×257 con solape de 1 px) : altura u16 (R,G; paso 2 cm) + CHM en 0,1 m (B) | PNG RGB | 60–90 KB | Alta; en Base se remuestrea el MDT 5 m + nDSM 2,5 m |
| `ort` | ortofoto 512² (0,5 m/px), WebP/JPEG q ≈ 75 | WebP | 70–120 KB | ambas (WMS del PNOA) |
| `sue` | color de suelo 128² (2 m) | PNG | 10 KB | ambas |
| `pts` | nube LiDAR: 3×uint16 (relativos a la tesela, paso 5 cm → 0–3,3 km) + clase (u8); **orden barajado** | PNG RGB o JSON-base64 | 0,5–0,9 MB | solo Alta |
| `arb` | árboles de la tesela (ver §5.5) | dentro del índice global | – | ambas |

* **Globales (en la propia página):** `mosaico` 1 m/px de toda la caja (1.700×2.450, JPEG ≈ 1,5 MB), `mdt5` (340×490 int16 = 333 KB),
  `ndsm25` (780×1.060 u8, 0,8 MB), NDVI 171×246×42 u8 (1,75 MB), **registro de árboles** (§5.5), lindes, parcelas, `paisaje`.
* **Cobertura:** 49 teselas × ≈ 1,1 MB (Alta) ≈ 54 MB en ≈ 245 ficheros → entra en una versión (256 MB / 511 ficheros), pero **hay que partir
  la publicación en 2** (64 MB por publicación) y respetar los 255 ficheros por llamada. Con 5 capas por tesela serían 245 ficheros: justo; mejor **agrupar `rel+sue` en
  un solo PNG** y `ort` aparte (3 ficheros por tesela con `pts` = 147 ficheros).

### 5.2 Gestor de teselas (el corazón del refactor)

```
Mundo = {
  ext, tesela(x,y), suelo(x,y), copaAlta(x,y), orto(x,y,out), ndviRel(x,y), cubierta(x,y), colorSuelo(x,y,out),
  alCargar(fn), alDescargar(fn), pideAnillo(cx, cy, radio)
}
```

* **Estados de una tesela:** `ausente → pedida → decodificada → montada (L0|L1|L2) → descargada`. Cada paso pesado (decodificar PNG,
  construir geometría, colorear la nube, generar follaje) es una **tarea con coste estimado en ms**; un planificador reparte
  **≤ 4 ms por fotograma** (≤ 1 ms en paseo) y prioriza por distancia a la cámara y al sentido de marcha.
* **Presupuesto de residentes (iPhone):** L0 ≤ 9 teselas, L1 ≤ 16, L2 ≤ 49 (siempre, son baratas). Con LRU: la que sale de L0 conserva su
  decodificado un rato (son 1–2 MB) pero libera geometría.
* **Anillos:** radio de L0 = 128 m en paseo (4 teselas), ≈ 300 m en órbita baja; el prefetch trae el anillo siguiente en la dirección de marcha.
  Con el dron/quad (10–20 m/s) el anillo L0 se desvanece y se queda en L1: no se carga a la velocidad del quad lo que no se podría ver bien.
* **Sin fugas:** cada recurso `dispose()` explícito (geometrías, texturas, `ImageBitmap.close()`); el recuento de `renderer.info.memory`
  se vigila en la prueba (§7).
* **Compatibilidad con el montaje actual:** el `aplica()` de hoy se parte en `aplicaEscena()` (modo, capas, luz: instantáneo) y en
  `Mundo.refresca()` que encola tareas. El botón «Gemelo» deja de bloquear 1,35 s: el modo cambia ya y las teselas se van «encendiendo».

### 5.3 Terreno

* **3 niveles por tesela** con la misma rejilla de topología compartida (un solo `BufferAttribute` de índices por nivel para todas las teselas):

| Nivel | Paso | Vértices/tesela | Triángulos/tesela | Se usa a |
|---|---:|---:|---:|---|
| L0 | 1 m | 66.049 | 131.072 | < 130 m |
| L1 | 2 m | 16.641 | 32.768 | 130–400 m |
| L2 | 8 m | 1.089 | 2.048 | > 400 m (y todo el mundo «solo grueso») |

* **Presupuesto por fotograma** con la cámara en el centro de la finca: 4 teselas L0 (524k) + 12 L1 (393k) + 33 L2 (68k) ≈ **0,99 M triángulos**, frente a los 704k de hoy en una ventana 9× más pequeña.
  En paseo (cámara a nivel del suelo y con niebla), L0 puede bajar a 2 m para teselas de visión lateral: solo si la prueba lo pide.
* **Costuras:** faldones verticales de 1,5 m en el borde de cada tesela (más simple y barato que unir vértices entre niveles; se ve solo desde arriba y con
  `exag` > 1, y se tapan con el mismo color).
* **Normales:** precalculadas con el solape de 1 px (sin costura de luz); L1/L2 las llevan submuestreadas.
* **Sin recalcular nada al cambiar `exag`** ver §5.4.
* **Color:** sombreador de fragmentos propio (inyectado con `onBeforeCompile` sobre `MeshLambertMaterial`, como ya se hace con las matas), que combina
  `texSuelo` (de la tesela) + NDVI de dos fechas (textura global) + ruido `vn2` y las fórmulas de `cubierta()` portadas a GLSL (la función es de ≈ 6 operaciones).
  Se acaban los 353k vértices recoloreados en CPU por fecha.

### 5.4 Exageración vertical, normales y modos

* `exag` pasa a **uniforme** `uExag` del terreno (`transformed.y *= uExag`); las normales se corrigen en el sombreador
  (`n.y /= uExag` y renormalizar). Árboles instanciados: su base se coloca con `suelo(x,y)*exag` solo cuando se (re)montan; al cambiar `exag` se **re-colocan por
  anillos y a ritmo de presupuesto** (hoy lo hace todo de golpe y se ve como un tirón; con teselas solo se rehacen las L0/L1 residentes).
* Los modos «Nube», «Gemelo», «Ortofoto» pasan a ser **conmutadores de visibilidad por capa** y `material` del terreno (el de Ortofoto es el mismo sombreador con
  `uModoOrto = 1`). Ninguno reconstruye geometría salvo la primera vez que una tesela entra en L0.

### 5.5 Olivos: LOD instanciado

Registro global de árboles (en la página, ≈ 14 B/árbol → ≈ 0,2 MB para ~12.000 copas; en Cerro hay 1.131 copas detectadas para 583 olivos marcados, así que cuento ~2× el nº de olivos):

`{ x:int32 cm, y:int32 cm, h:u8 (0,1 m), r8:[u8×8] (0,1 m), tesela, parcela:u8, olivo:bit, frutal:bit }`.

| Nivel | Distancia | Representación | Coste por árbol | Presupuesto |
|---|---|---|---:|---|
| **L0** | < 60 m (paseo) / < 120 m (órbita), **máx. 450 árboles** | exactamente lo de hoy: malla de copa de 8 radios, tubos de tronco, hojas-sprite (de los puntos LiDAR, o generadas si no hay) y corteza | 800 tri + 710 pts | ≈ 360k tri + 320k pts |
| **L1** | hasta ≈ 350 m, **máx. 3.000** | `InstancedMesh` con 3 prototipos de ≈ 120 tri (copa abombada + tronco); color e inclinación por instancia desde el registro | 120 tri | ≈ 360k tri |
| **L2** | hasta ≈ 900 m, **máx. 12.000** | `InstancedMesh` de un icosaedro de 12 tri aplastado + sombra pintada en el suelo; color por instancia = media del NDVI/ortofoto en la copa | 12 tri | ≈ 144k tri |
| **L3** | más lejos | nada: el árbol ya está en la ortofoto del suelo | 0 | 0 |

* Total de árboles ≈ **0,86 M triángulos + 0,32 M puntos**, **menos que hoy** (0,91 M tri + 0,97 M pts) para 10× más olivos.
* Se reclasifica a 4 Hz con una **ordenación por distancia** de los ≈ 12.000 registros (≈ 1 ms), con histéresis del 10 % para que no parpadee en el límite.
* Las instancias L1/L2 viven en **dos `InstancedMesh` globales** (con `count` variable), no en uno por tesela: 3 llamadas de dibujo en total.
* L0 sigue construyéndose en CPU (`construyeArboles`/`construyeFollaje` actuales), pero **por árbol y a demanda** y con una cola con presupuesto; los árboles que
  salen de L0 se liberan en grupo. `calidad` (baja/media/alta) escala el nº de puntos de hoja por árbol, como ahora, pero solo se reconstruyen los L0 residentes.
* Árboles no olivo (los 89 de `paisaje`, el frutal marcado): mismo mecanismo con otro prototipo.

### 5.6 Nube LiDAR

* Cada tesela con `pts` crea un `THREE.Points` propio (≈ 130k pts si es de olivar). El orden barajado permite **`setDrawRange(0, f·n)`** con f = 1, ¼, 1/16 según la distancia → LOD sin
  almacenamiento extra.
* Tamaño de punto (`size: 0,6, sizeAttenuation`): con un tercio de los puntos hay que subirlo (`size *= 1/√f`) para que el suelo no se vea como una lluvia.
* Presupuesto: ≈ 680k puntos (= hoy), repartidos según distancia.
* Se pinta (color por ortofoto, corrección de desplazamiento `desp(h)`) **una vez al cargar la tesela**, no en cada `aplica()`. El tinte NDVI de la copa (`tinte`) se mueve a un
  atributo `aTinte` que el sombreador mezcla con un uniforme (`uTinte`) en vez de recolorear 700k puntos al arrastrar la fecha.
* Solo se almacena nube en teselas con olivar (y su margen de 60 m): ≈ 1,7 km² × 2 pts/m² ≈ 3,4 M pts ≈ 20 MB. **Calidad Base: no hay nube**; el modo «Nube» muestra los píxeles del nDSM de 2,5 m como puntos (≈ 190k) con la etiqueta «sin LiDAR 3.ª cobertura».

### 5.7 Datos continuos que NO se trocean

* NDVI (171×246×42) y `suelo_ndvi` (a, b, f): una textura de 171×246 por fecha (R8 normalizado, las dos fechas vecinas + `uFrac`), igual que el cálculo actual; la `cubierta()` en CPU
  (que usan matas/piedras/pisadas/polvo) queda como está, leyendo la misma rejilla global.
* Lindes y parcelas: se mantienen como datos de página. Las 27 cintas de linde ocupan ≈ 25 km de perímetro: se desvanecen por distancia (alfa por `vDist`) y se recortan por tesela residente.

### 5.8 Interfaz: de lejos, selector y minimapa

* **Vista de mapa (órbita alta):** muestra las cuatro fincas con el mosaico global + L2 de terreno + árboles L2 + lindes; no cuesta más que hoy (≈ 0,3 M tri). Al acercar, las teselas suben de nivel solas.
* **Selector de fincas:** pasa de «5 parcelas» a **2 niveles**: (1) fincas (4 chips, con color propio y nº de olivos/ha), (2) parcelas de la finca elegida (hasta 14; lista con buscador).
  La selección sigue siendo un índice de triángulos sobre el terreno L0/L1 de las teselas que tocan la parcela → para L2 se dibuja un polígono de la linde coloreado.
  «Ir a» vuela a esa parcela con la cámara y empieza a pedir sus teselas antes de llegar.
* **Minimapa:** hoy recorta `ortCanvas`; pasa a `mosaico` global (1 m/px) a 240×338 px y marca de fincas/parcelas; la vista «cerca» (150 m) se pinta con la `ort` de la tesela residente. Lleva el cuadrado de L0/L1.
* **Balizas, fichas e historia:** `historia_bloque.js` cuenta once escenas escritas para Cerro Velasco; para Hituelo hay que reescribir el guion (contenido, no código) o hacerlo
  parametrizado por finca.

### 5.9 Cámara, niebla y precisión

* `far 5000 → 9000`, y `near` **dinámico** (`near = clamp(0,02 × altura_cámara, 0,5, 8)`) para conservar la precisión del buffer de profundidad en 24 bit. Evitar `logarithmicDepthBuffer`
  (en iOS desactiva el depth test temprano y cuesta caro) **[SUPUESTO sobre el coste en Safari]**.
* Niebla `Fog(900, 2600)` → `Fog(1800, 6000)` con el mismo comportamiento ligado a la humedad (el código ya modifica `near/far` según el tiempo).
* En el sombreador, calcular lo dependiente del mundo (`ot_sombra(wp.xz)`, el desplazamiento de las nubes) con la posición **relativa a la cámara + un desfase en doble paso** si se nota «nadar» a > 1 km del origen. Con ±1,3 km no debería, pero es una de las cosas que mide la prueba (§7).

### 5.10 Las dos calidades

| | **Base (hoy)** | **Alta (cuando haya LiDAR 3.ª)** |
|---|---|---|
| Terreno | MDT 5 m (WCS `Elevacion25830_5`, ya probado en trozos de 500 m; la petición grande se cuelga) remuestreado bicúbico a 1 m (suave; honesto: no es relieve real a 1 m) | MDT 0,5 m (CNIG, hojas MTN50) → relieve a 1 m |
| Árboles | detector de producción sobre nDSM 2,5 m (`mdsn_v025`, F1 88 medido): posición, altura y radio; copa **generada** | las 8 radios y el follaje **de cada copa medida** (como Cerro Velasco) |
| Nube | no hay | sí, por teselas |
| Paisaje (edificios, tendido, arroyo) | edificios solo si hay origen alternativo (OSM/Catastro) **[SUPUESTO]**; el tendido y el arroyo no se pueden deducir con 2,5 m | extraíbles del LiDAR (como `paisaje_*.py`) |
| Tamaño | **~7 MB, un solo HTML, sin streaming** | página ~4 MB + ≈ 54 MB de teselas (2 publicaciones) |
| Rotulado | «Gemelo aproximado: copas generadas a partir de alturas de 2,5 m» | «Forma medida del vuelo LiDAR 2024» |

El motor es el mismo: lo único que cambia es que una tesela sin `pts`/`r8` genera por procedimiento lo que la otra lee.

---

## 6. Cómo se refactoriza el código

El gemelo se construye pegando bloques (`finca_5_montar.py` + `finca_7_tiempo.py`) en un único `<script>` de ≈ 230 KB. Se conserva la mecánica, pero el núcleo se parte en módulos con contrato:

| Módulo nuevo | Sustituye a | Interfaz |
|---|---|---|
| `mundo_bloque.js` | `suelo()`, `copaAlta()`, `orto()`, `ndviRel()`, `colorSuelo()`, `D.ext` | las mismas funciones + `Mundo.*` (§5.2) |
| `teselas_bloque.js` | carga/decodificado/colas | `Teselas.pide(x,y,nivel)`, `Teselas.tarea(ms)` |
| `terreno_bloque.js` | l.91–106 + `alturaTerreno` | `Terreno.monta(tesela, nivel)`, sombreador con NDVI |
| `arboles_bloque.js` | `construyeArboles`, `construyeFollaje`, `iSombra`, marcas | `Arboles.reclasifica(camara)`, L0/L1/L2 |
| `nube_bloque.js` | l.110–131 | `Nube.monta(tesela)`, `setDrawRange` |
| `camara_bloque.js` (o dentro del existente) | rangos, near dinámico | |
| `finca_8_teselas.py` | `paisaje_6_extrae.py`, `suelo_*.py` (por finca) | genera `t/*.png|webp` y el registro de árboles desde un `--finca` |

Reglas del refactor:

1. **Primero se introduce `Mundo` con la ventana actual como una única tesela** («tesela cero»), sin cambiar nada visible. Todo el código sigue pasando por `suelo()` y compañía.
2. Cada paso siguiente deja el gemelo funcionando y comparable (capturas antes/después de Cerro Velasco con la misma cámara).
3. Los 30 usos de `suelo(` y los 18 de `copaAlta/colorEn/cubierta/ndviRel/orto` no se reescriben: solo cambia su interior.
4. Las funciones que hoy leen constantes globales de la ventana (`x0`, `yN`, `ANCHO`, `ALTO`, `W`, `H`, `RES` y `D.ext`, en ≈ 25 sitios) pasan a leer del mundo.

---

## 7. Plan por pasos (cada uno deja el gemelo funcionando)

| # | Paso | Qué se prueba (y cómo) | Riesgo |
|---|---|---|---|
| 0 | **Prueba de plataforma** (§4): artefacto desechable con `fetch`/`<img>` de ficheros de apoyo | Funciona / no; formato de teselas | Decide el plan B de §8 |
| 1 | **«Tesela cero»**: `Mundo` envuelve la ventana actual; mover `suelo/orto/copaAlta/ndviRel/cubierta` detrás de `Mundo` sin cambiar nada | Capturas idénticas de los 3 modos; `chk.js` pasa `node --check`; mismas cifras de `renderer.info` | Bajo |
| 2 | **Trocear Cerro Velasco en teselas de 256 m** con un script (`finca_8_teselas.py`) y cargarlas desde la página; terreno L0 por tesela, nube por tesela, `suelo()` por tesela | Cerro Velasco = 4×2 teselas: misma imagen que antes; tiempos de carga; ninguna costura; memoria estable al volar de un lado a otro | Costuras y normales |
| 3 | **Color de suelo y NDVI al sombreador**; `exag` como uniforme | Arrastrar la fecha NDVI y la exageración **sin tirones**; comparar contra el recoloreo CPU en 20 puntos; `aplica()` ya no recorre vértices | Medio (porta `cubierta()` a GLSL) |
| 4 | **LOD de terreno** (L1/L2) y vista de mapa | Cámara alta sobre Cerro Velasco: menos triángulos que hoy con la misma imagen; transición sin saltos | Costuras entre niveles |
| 5 | **LOD de olivos** (L0/L1/L2 instanciados) y de la nube (`setDrawRange`) | Con Cerro Velasco **replicado 10× en el espacio** (mismo dato desplazado) comprobar presupuesto: ≈ 250 llamadas, ≤ 1,7 M tri, ≤ 1 M pts, heap ≤ 350 MB | **El mayor**: que L1/L2 se vea bien; calibrar distancias |
| 6 | **Planificador con presupuesto** y cola de tareas; botón «Gemelo» sin bloqueo | Medir bloqueo máximo por fotograma (objetivo ≤ 8 ms en un iPhone) | Medio |
| 7 | **Calidad Base de Hituelo**: MDT 5 m + nDSM 2,5 m + detector + ortofoto WMS + NDVI; generar el registro de árboles; todo en un HTML | Hituelo completo con copas generadas; tamaño ≈ 7 MB; selector de 4 fincas / 27 parcelas | Calidad visual de las copas generadas |
| 8 | **Selector de fincas, minimapa global, balizas, historia de Hituelo** | UX; el recorrido guiado | Contenido |
| 9 | **Calidad Alta**: cuando lleguen las hojas LiDAR/MDT: teselas con `pts`/`r8` de cada copa, `paisaje` extraído | Mismo gemelo, copas medidas, publicación en 2 tandas | Descarga y procesado |

Lo que se puede hacer **ya** sin esperar la descarga: pasos 0–6 enteros, con Cerro Velasco troceado y replicado para forzar el presupuesto; y el paso 7 (los datos de la calidad Base están todos en servicios abiertos).

### Cómo se mide cada paso

Banco de pruebas con Chrome headless (el mismo `medir*.js` de esta auditoría): número de llamadas, triángulos, puntos y `memory.geometries` por modo; milisegundos de JS por operación (§2.3); heap
tras un recorrido automático por todas las teselas y vuelta; comprobación de fugas (`renderer.info.memory` estable al ir y volver). **Los fps no se miden con SwiftShader** — el rendimiento real en iPhone
solo lo puede confirmar una persona con un teléfono, con una versión de la página que muestre un contador de ms por fotograma y de llamadas/triángulos en un rincón (opción `?debug`).

---

## 8. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| `fetch`/`<img>` de ficheros de apoyo no permitido por la CSP | no hay streaming | Plan B: calidad Base en un HTML (~7 MB) + calidad Alta **repartida en varias páginas** (una por zona) o en `assets` (JSON/base64) solo editable |
| Binario crudo no aceptado | formato | PNG RGB (alfa 255) o JSON-base64 (+33 %) |
| iOS: memoria/GPU (el límite real depende del modelo) | cierre de la pestaña | presupuesto de 350 MB y descarga agresiva; opción «ligera» (L0 más corto, `calidad` 0) **[SUPUESTO]** el umbral exacto de Safari no está medido |
| Costuras entre niveles de terreno | grietas visibles | faldones; mallas con solape; prueba visual en el paso 4 |
| L1/L2 de olivos no se parece a L0 | «salto» visual al acercarse | color y escala desde el mismo registro; transición por *dither* (descarte por píxel en el sombreador) y histéresis |
| Copas generadas (calidad Base) se vean falsas | mala impresión | rotular; usar los 8 radios estimados del nDSM; ruido determinista |
| El MDT 5 m es suave (pierde bancales y regueros) | relieve pobre | aceptado en Base; la Alta lo corrige; avisarlo en la nota |
| WCS grande se cuelga (`Elevacion25830_5` con la caja entera: sin respuesta en 60 s; 500×500 m: 0,2 s) | descarga | pedir en trozos de 500 m |
| Publicación en 2 tandas (64 MB) y 511 ficheros por versión | publicación | agrupar capas; `files` aditivo |
| El guion de la historia y las fichas están escritos para Cerro Velasco | texto incorrecto | parametrizar por finca antes de publicar |

---

## 9. Hojas del IGN que harán falta para la calidad Alta (por si hay que posponer)

Cobertura: PNOA-LiDAR 3.ª cobertura (vuelo 2024), hojas de 1×1 km, nombre `PNOA_2024_AND_<E>-<N>_H30_NPC01.laz`, y MDT 0,5 m de 3.ª cobertura (hojas MTN50 `MDT50CM-ETRS89-H30-<hoja>-COB3-V1.tif`; la hoja concreta de Hituelo hay que consultarla en el CNIG, no la he calculado).
Calculadas con la geometría de las 27 parcelas + 60 m:

| Hoja LiDAR | Hectáreas de parcela dentro | Prioridad |
|---|---:|---|
| `405-4179` | 66,1 | **1** |
| `406-4179` | 21,1 | **1** (con la anterior, el 92 % de la finca) |
| `405-4177` | 3,4 | 2 |
| `405-4178` | 2,1 | 2 |
| `404-4178` | 0,9 | 3 |
| `405-4180` | 0,8 | 3 |
| `404-4179` | 0,6 | 3 |
| `406-4178` | 0,1 | 3 |
| `406-4180` | 0 (solo el margen) | 3 |

Con las dos primeras (≈ 180 MB) ya sale casi todo Hituelo; el resto son retazos de una o dos parcelas pequeñas. Las nueve juntas son ≈ 0,8 GB.

---

## 10. Ficheros de esta auditoría

* Geometría y recuentos: `hituelo_parcelas.json`, `hituelo_parcelas_utm.json` (27 parcelas con lindes en UTM 30N, olivos, hectáreas).
* Mediciones: scripts en el directorio de trabajo de la sesión (`medir.js`, `medir2.js`, `medir3.js`, `medir4.js`, con `playwright-core` + Chrome + SwiftShader).
* Respuesta WCS comprobada: nDSM 2,5 m de toda la caja (`mdsn_v025`, 1,6 MB, HTTP 200); MDT 5 m en trozos de 500 m (HTTP 200, 20 KB); en una petición de toda la caja, sin respuesta en 60 s.
