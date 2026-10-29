# Contratos

Dónde exportador y motor (y el motor y los conectores, y el motor y la plataforma) se ponen de acuerdo **por escrito**. Regla 3 de CLAUDE.md: cambiar un campo es cambiar este documento, su esquema en [`contratos/`](../../contratos/) y el fixture en el mismo commit. Lo comprueba [`contratos.test.js`](../../pruebas/guardianes/contratos.test.js) contra un fixture sintético ([`genera_fixture.py`](../../pruebas/genera_fixture.py)).

Versión del contrato de datos: **v = 2** (campo `v` del índice).

| Contrato | Esquema / fuente de verdad | Lo vigila |
|---|---|---|
| Índice global | [`contratos/indice.schema.json`](../../contratos/indice.schema.json) | `contratos.test.js` (ajv; coherencia interna y tamaños de las rejillas) |
| Tesela | [`contratos/tesela.schema.json`](../../contratos/tesela.schema.json) | `contratos.test.js` (ajv y tamaños) |
| Interfaces del motor | [`contratos/interfaces.json`](../../contratos/interfaces.json) | `contratos.test.js` |
| Catálogo de olivos-tipo (entrada del constructor) | [`contratos/olivos-tipo.schema.json`](../../contratos/olivos-tipo.schema.json) + [`olivos-tipo.md`](../../contratos/olivos-tipo.md) | `olivos.test.js` (ajv, gltf-validator, triángulos por nivel) |
| Olivo generado (constructor «olivo-2»: entrada, nombres de tipo, semilla guardada, receta, huellas, `copas_param`) | [`contratos/olivo-generado.md`](../../contratos/olivo-generado.md) + [`olivo-generado.schema.json`](../../contratos/olivo-generado.schema.json) | `olivo.test.js` (huellas del oráculo, niveles, Chrome), `contratos.test.js` |
| Módulos de `apps/web/motor/` | cabecera «Expone / Consume» de cada fichero | `contratos.test.js` (vía `pruebas/contrato_modulos.js`) |
| Conectores MCP | [`contratos/mcp.md`](../../contratos/mcp.md) | **nada** (no verificado en vivo) |
| Publicación | [`contratos/publicacion.json`](../../contratos/publicacion.json) | `build.test.js` |
| Api HTTP (F1a) | [`contratos/api.openapi.yaml`](../../contratos/api.openapi.yaml) | `apps/api/pruebas/unidad/app.test.ts` (cada ruta en el contrato y al revés) |
| Ficha pública de haza | [`contratos/haza.schema.json`](../../contratos/haza.schema.json) (lista blanca, ADR-0014) | pruebas de `apps/api` (ajv); en el motor, `hazas.test.js` (la ficha solo enseña la lista blanca) |
| Lindes de las hazas en el motor (`GET /api/hazas`, esquema `Hazas`) | [`contratos/api.openapi.yaml`](../../contratos/api.openapi.yaml) | `hazas.test.js` (ajv contra el esquema del contrato y el validador del motor, de acuerdo; UTM → local; sin api no se crea nada) |
| Enlace mágico, código corto de las gafas, primer acceso y sesión | [`contratos/sesion.md`](../../contratos/sesion.md) (ADR-0013; decisiones 46 y 61) | integración de `apps/api` (`GEMELO_DOCKER=1`) |
| Lectura de OlivarTrack | [`contratos/olivartrack-sync.md`](../../contratos/olivartrack-sync.md) (formas **no verificadas**) | `apps/api/pruebas/unidad/ot.test.ts` con grabaciones sintéticas |
| Publicación en el VPS | [`contratos/publicacion-vps.json`](../../contratos/publicacion-vps.json) | `api.test.js` |
| Presencia compartida (F2): pose binaria, tasas, interpolación | [`contratos/presencia.md`](../../contratos/presencia.md) (tabla de bytes, versión 1) | `presencia.test.js` (ida y vuelta, tamaños, errores máximos; en Chrome, llamadas con 10 y 40 simulados) |
| Permisos por rol en LiveKit (F2: solo datos) | [`contratos/livekit-roles.json`](../../contratos/livekit-roles.json) | `presencia.test.js` |
| Tileset 3D Tiles, contrato tileset v2 (lo propio: `extras.gemelo`, raíz sin contenido, `_INDICE_COPA` + huella, `_TIPO` + tabla de tipos con los nombres del catálogo `olivos`; F1d) | [`contratos/tileset.schema.json`](../../contratos/tileset.schema.json) + [TILES3D](TILES3D.md#identidad-y-tipo-por-instancia-contrato-tileset-v2) | `tiles3d.test.js` (ajv y cada instancia) |

Los esquemas son **JSON Schema 2020-12 estándar**, sin palabras propias (salvo la anotación declarada `presupuesto_tri` del catálogo de olivos-tipo), y los valida **ajv** (`ajv/dist/2020`, versión fijada en `package.json`) en modo estricto y con todos los errores. Un array posicional se escribe `prefixItems` + `items: false` + `minItems` (longitud exacta); el patrón de las claves de un objeto, `propertyNames: { pattern }`; las definiciones reutilizables, `$defs` con `$ref: "#/$defs/…"`. Lo que un esquema no puede decir (tamaños de las rejillas decodificadas, referencias entre campos, columnas paralelas de igual longitud) lo comprueba el guardián en código.

## 1. Datos: exportador → motor

Convenciones comunes: **x este, y norte**, en metros relativos a `centro_utm` (UTM 30N, ETRS89 / EPSG:25830); alturas relativas a `z0`; filas de cada rejilla **de sur a norte** (fila 0 = borde sur) salvo las del mosaico, NDVI y relieve grueso, que van de **norte a sur** (fila 0 = norte). Todo binario va en **base64 de Int16 o u8 little-endian**. Una tesela `(kx, ky)` cubre en UTM `[kx·256, kx·256+256) × [ky·256, ky·256+256)`.

### 1.1 `indice.json` (va en la página como `D`)

Campos obligatorios: `v, ts, res, srs, orto_px, finca_id, centro_utm, z0, ext, parcelas, copas, marcados, ot, avance, teselas, grueso, mosaico`. Opcionales: `fincas, textos, ndvi, suelo_ndvi, paisaje, zmax, cobertura_nube, base, copas_id, copas_tipo`.

| Campo | Contenido |
|---|---|
| `v` | 2 |
| `ts`, `res`, `srs` | 256 (lado de tesela, m), 1 (paso de relieve y copa, m), 2 (paso del color de suelo, m) |
| `orto_px` | píxeles por lado de la ortofoto de una tesela: **768 en Cerro, 512 en Hituelo** (0,5 m/px) |
| `finca_id` | `cerro`, `hituelo`… ; el motor cambia el guion de la historia según sea `hituelo` |
| `centro_utm` | `[E, N]` enteros: origen de las coordenadas relativas |
| `z0` | cota de referencia (m): `dtm` y `grueso` van en cm sobre ella |
| `ext` | `[xmin, ymax, xmax, ymin]` relativo al centro: la caja de teselas/ventana |
| `parcelas[]` | `id, nombre, ha, linde[[x,y]…], centro[x,y], desfase, suelo (perfiles SoilGrids o null), finca (índice en fincas), decl (olivos declarados), pasto` |
| `fincas[]` | `nombre, parcelas[índices], ha, olivos` (Hituelo; Cerro no lo lleva) |
| `copas[]` | **registro de árboles**: `[x, y, h, r8[8], parcela+1]`; `parcela+1 = 0` = fuera de toda parcela. Ver nota abajo |
| `copas_id[]` | *(opcional)* columna paralela a `copas`: **id estable** del árbol (entero ≥ 0, único en la finca); misma longitud que `copas` ([ADR-0012](../adr/0012-catalogo-de-olivos-tipo-e-id-estable.md)) |
| `copas_tipo[]` | *(opcional)* columna paralela a `copas`: **olivo-tipo** del catálogo ([olivos-tipo.md](../../contratos/olivos-tipo.md)); −1 = sin asignar; un tipo desconocido se dibuja como −1 |
| `marcados[]` | `[x, y, índice en copas o -1, índice de parcela]`: olivos marcados en OlivarTrack |
| `ndvi` | `w, h, fechas[], media[]` y los datos **o** `u8` (Hituelo: 0 = sin dato; 1..254 → −0,2..1,0 con `(u−1)/253·1,2−0,2`) **o** `b64` (Int16 en milésimas, −32768 = sin dato; variante antigua de Cerro) |
| `suelo_ndvi` | `w, h, a[], b[], f, fechas[]`: NDVI del suelo = NDVI − b·f/1000 por fecha (`f`: Int16 por celda) |
| `ot` | instantánea de OlivarTrack: `fuente ("instantanea"\|"vivo"), fecha_consulta, pases_finca, entregas_finca, analiticas_finca, parcelas{id:{tareas[], fenologia[]}}` |
| `avance` | avance de trabajos por parcela (`{}` si no hay) |
| `paisaje` | `fuente, centro_utm, z0, edificios[], tendido{linea, postes, derivaciones}, arroyo{ejes, nota}, arboles[]` — **deducido** de la geometría |
| `teselas{}` | `"kx_ky": {kx, ky, v[x0,y0,x1,y1], np}`; `v` = rectángulo con dato; `np` = puntos de nube |
| `grueso` | relieve de 8 m: `x0, yN, res, w, h, b64` (Int16, cm sobre `z0`) |
| `mosaico` | ortofoto global: `jpg` (data URI), `w, h, x0, yN, res` (Cerro 1 m/px, Hituelo 2 m/px) |
| `textos` | `sin_historia, finca, fincas, parcelas, ha, olivos, desfase_txt, intro_historia`: lo que `tuberia/salida_artefacto/montar_v2.py` cambia en la cabecera |
| `base` | prefijo de `t/` (por defecto `""` = relativo a la página) |

**Nota — registro de árboles: diseño frente a implementación.** El diseño ([histórico](../historico/DISENO-2026-10.md), §5.5) proponía un registro `{x, y, h, r8, tesela, parcela, olivo, frutal}`. Lo implementado es `copas[]` con `[x, y, h, r8, parcela+1]`: la **tesela** se deduce de la posición y **`olivo`/`frutal` no viajan**: el motor decide en JS `oliv = !(h > 8 || (h > 6.5 && radio medio < 2.2))`. Por eso los frutales sin marcar en Hituelo no se distinguen (pendiente D1). Manda el código.

**Nota — `id` y `tipo` como columnas paralelas, no como columnas 6 y 7 de cada copa** ([ADR-0012](../adr/0012-catalogo-de-olivos-tipo-e-id-estable.md)). `copas[i]` sigue siendo exactamente `[x, y, h, r8, parcela+1]`: un índice sin las columnas nuevas es válido y se ve igual, y los consumidores actuales (motor, exportadores, `marcados[]` que apunta por índice) no cambian. Las columnas paralelas son además la forma de una tabla de propiedades por instancia de 3D Tiles 1.1 (`EXT_structural_metadata` / `EXT_instance_features`), adonde va la escena en F1d. Sin columnas, el motor usa −1 para los dos. El fixture las lleva en Hituelo (ids y algún tipo 0) y no en Cerro.

**Nota — de dónde sale `copas_id`** (`tuberia/ids_copas.py`; lo usan `finca_8_teselas.py` para Cerro y `--replica`, y `hituelo_conv.py`). **La identidad la da el censo de OlivarTrack; la geometría, el LiDAR** (decisión de Antonio, 2026-10-29). El id es también la **semilla del generador de olivos**. Dos rangos que no se pisan dentro de `[0, 2³²)` (cabe en un Uint32; en el tileset 3D Tiles no viaja en el glb —glTF no admite `UNSIGNED_INT` en atributos— sino que se resuelve en CPU con la huella de cada tesela: [TILES3D](TILES3D.md#identidad-y-tipo-por-instancia-contrato-tileset-v2)), así que **no hace falta una columna `copas_id_fuente`: `id ≥ 2³¹` ⇔ provisional**:

| Rango | Fuente | Cuándo |
|---|---|---|
| `[0, 2³¹)` | **censo** de OlivarTrack: el id del olivo marcado | la copa está emparejada con una marca que trae id |
| `[2³¹, 2³²)` | **provisional**, por posición: `2³¹ + (E_m mod 32768) · 65536 + (N_m mod 65536)`, con `E_m`, `N_m` = metro UTM entero que contiene la copa (coordenada redondeada al cm y `floor`) | no hay marca, o la marca no trae id |

- **Emparejamiento marca ↔ copa:** las marcas se pusieron sobre la ortofoto, desplazada ~1,1–1,5 m del LiDAR (ADR-0006). Se estima el desfase (mediana de los vectores marca → copa más cercana a ≤ 4 m), se corrige y se empareja **uno a uno** por distancia creciente hasta 4 m (voraz y determinista, en Python puro; Cerro, en su intermedio, usa el óptimo húngaro de `scipy`). `marcados[i][2]` es el índice de esa misma copa (antes, en Hituelo, la copa más cercana a ≤ 4 m sin corregir el desfase y sin exclusividad).
- **Provisional:** sale de la posición UTM **absoluta**, no del índice en `copas` ni de `centro_utm` (que en Hituelo se deduce de la caja del NDVI): mismos datos ⇒ mismos ids, en cualquier orden. Único mientras la finca quepa en 32,7 km (E) × 65,5 km (N); si no, el exportador se para. **Colisiones** (dos copas en la misma celda de 1 m): se ordenan por posición exacta, altura y radios; la primera se queda su celda y las demás, cuando ya están puestas todas las primeras, toman la celda libre más cercana en anillos crecientes (orden fijo): una colisión nunca mueve el id de otro árbol. En la réplica la copia (0, 0) conserva los ids del censo y las demás son provisionales.
- **Un id del censo repetido o que no sea entero en `[0, 2³¹)`** no se usa: esa copa queda provisional y el exportador avisa.
- **Lo que falta hoy (no hay ningún id del censo):** las marcas que llegan a los exportadores no traen id. Hituelo: `ot_hituelo.json` → `fincas{}.parcelas{}.olivos` = `[[E, N], …]` (UTM). Cerro: `finca_cerro_velasco.json` → `parcelas[].olivos` = `[{lng, lat}, …]`, que `finca_1_ventana_orto.py` pasa a UTM y `finca_3_datos.py` empareja en `marcados`. **Campo propuesto:** cada olivo como `[E, N, id]` o `{x, y, id}` (Hituelo; `hituelo_conv.py` ya acepta las tres formas) y `{lng, lat, id}` en Cerro, que el intermedio llevaría como `marcados_id[]` paralelo a `marcados` (`construye()` ya lo lee; no viaja al índice). `id` = id **numérico y estable** del olivo en OlivarTrack, entero en `[0, 2³¹)`. **[SUPUESTO]** no se sabe si OlivarTrack tiene ese id por olivo ni de qué tipo es: las herramientas del conector que se ven no exponen el censo por olivo (`parcelas` solo lista parcelas). Si fuera una cadena, la correspondencia a entero la debe fijar OlivarTrack (no se puede deducir aquí sin romper la estabilidad).
- **Límite:** el provisional es estable ante reexportaciones de los **mismos** datos; si un vuelo nuevo mueve una copa de celda, cambia. El del censo, mientras OlivarTrack no cambie el id y la marca siga cayendo en la misma copa.

`copas_tipo` sale de un único punto, `asigna_tipos()`: hoy −1 para todas. Lo prueba `pruebas/guardianes/exportadores.test.js` con datos sintéticos.

### 1.2 `t/<kx>_<ky>.json`

| Campo | Contenido decodificado | Tamaño |
|---|---|---|
| `dtm` | Int16 LE, cm sobre `z0`; 258 × 258 (celdas −1..256: **una celda de margen**) | 133.128 B |
| `chm` | u8, altura de vegetación en **decímetros**; 256 × 256 | 65.536 B |
| `suelo` | u8 RGB a 2 m; 130 × 130 × 3 (celdas −1..128, con margen) | 50.700 B |
| `pts` | *(opcional)* nube: Int16 ×3 por punto: x, y en **cm sobre la esquina SO de la tesela** (0..25.600), z en cm sobre `z0`. **Orden barajado con semilla fija**: el prefijo es una submuestra uniforme (`setDrawRange` = LOD) | 6 B × `np` |
| `np` | número de puntos de `pts` (0 si no hay) | |
| `orto` | *(solo en `embebido.json`)* ortofoto como data URI | |

Sin `pts` la tesela es de **calidad Base**: copas generadas por procedimiento y sin nube ([ADR-0003](../adr/0003-calidad-base-alta.md)). El fixture incluye una tesela así.

### 1.3 `t/<kx>_<ky>.jpg`
Ortofoto PNOA de la tesela, JPEG RGB cuadrado de `orto_px` píxeles, **fila 0 = norte**. Corregir el desplazamiento de copas es cosa del motor, no del exportador ([ADR-0006](../adr/0006-ortofoto-correccion-de-copas.md)).

### 1.4 Modos de montaje
- **Embebido**: `embebido.json` = índice + `t{clave: tesela con orto}`; una sola página (≤ 16 MB).
- **Ficheros**: `indice.json` en la página y `t/` publicado al lado.

## 2. Interfaces del motor

Detalle de miembros en [`contratos/interfaces.json`](../../contratos/interfaces.json); el guardián comprueba que cada módulo devuelve exactamente esos.

- **`Mundo`** (`02_mundo.js`): todo lo demás pregunta aquí. `suelo(x,y)` (m sobre `z0`; si la tesela no ha llegado, contesta con el relieve grueso de 8 m, **nunca con un hueco**), `copaAlta(x,y)`, `colorSuelo(x,y,out)`, `orto(x,y,out)`, `ortoGrueso`, `tesela`, `lista`, `arranca(fin)`, `actualiza(x,y,z)` (pide teselas por cercanía), `alCargar(fn)`. Estados de tesela: `0` ausente → `1` pedida → `2` decodificada → `3` fallo (se reintenta a los 15 s). Pide hasta 3 a la vez a ≤ 1.800 m.
- **`Cola`** (`02b_cola.js`): `add(trabajo)` con generadores (`yield` = punto de pausa), `corre(ms)` hace avanzar el más urgente hasta agotar el presupuesto, `vacia(ms)`, `cancela`, `hay`, `pendientes`, `est`. Presupuesto por fotograma: `Arboles.presupuesto()` (6 / 3,5 ms; 12 / 8 si faltan olivos L0; 4,5 / 3 si va justo).
- **`Terreno`** (`04_terreno.js`): `monta(tesela)`, `montaTodas`, `tileCargada`, `actualiza`, `modoOrto(bool)`, `iniciaMosaico`, `UN` (uniformes: `uExag`, NDVI, etc.); para la escena 3D Tiles, `parche(sh, uni, op)` (el parche del sombreador, uno para las dos escenas; sin `op`, el del Terreno), `prepara(tesela)` (sus texturas sin mallas), `pideDetalle(tesela)` y `U1` (distancia del detalle, m).
- **`Escena3D`** (`04b_escena3d.js`, F1d paso 3b, solo con `?escena=tiles`; sin la bandera no crea nada): `actualiza()` (cada fotograma, antes de dibujar; cámara y Scheduler de XR en una sesión), `perfil(p)` (`p.e` = `errorTarget` del perfil VR; `null` = el de escritorio, `?tilesError=` o 16 px), `resumen()` → `{estado: apagado|cargando|activo|sin, motivo, errores, visibles, errorTarget, stats}`, `listo()`, `alturaEn(x, y)` (relieve dibujado sin los olivos, solo pruebas), `grupo()`, `libera()`, `engancha(g)` (los ganchos de `OlivosTiles`: `alRaiz(tileset)`, `alModelo(scene, tile)` → `true` si se queda con los olivos del glb, si no se retiran; `alSoltar(scene)`, `alApagar(motivo)`, `fotograma()`). Con ella activa (`ESC3D.activa`, `01_datos.js`) `Terreno` no construye nada; si falla, vuelve `Terreno`. Tileset: `?tileset=<ruta relativa>` o `<D.base>tileset/tileset.json`, nunca otro host.
- **`OlivosTiles`** (`04c_olivos_tiles.js`, F1d paso 4, solo con `?escena=tiles`; sin la bandera no se engancha): los olivos de media y larga distancia los dibuja el tileset; los de cerca, el motor. `dibuja()` (`true` cuando el registro casa con `huella_registro`; entonces 07b no dibuja sus niveles 1 y 2), `cerca(g[])` (de 07b: los índices de `copas[]` que el motor dibuja de cerca; en el tileset se apartan al final de cada malla y `count` baja), `triangulos()` (los de olivo que el tileset manda a dibujar; cuentan en `TOPE_TRI`), `resumen()` → `{estado: apagado|esperando|comprobando|activo|sin, motivo, porHuella, teselas, hechas, instancias, dibujadas, apartadas, cerca, triangulos, catalogo}`, `tipo(g)` → `{n, nombre}` (`_TIPO` y su nombre de `extras.gemelo.tipos`), `tipos()` → `{catalogo, nombres}`, `instanciasDe(g)` (pruebas). Resolución y huellas: [TILES3D](TILES3D.md#identidad-y-tipo-por-instancia-contrato-tileset-v2).
- **`SombreadoTiles`** (`04d_sombreado_tiles.js`, solo lo llama `Escena3D`): `modelo(escena, tile)` (en `load-model`: el material del terreno del glb pasa a un Lambert con `Terreno.parche` y los uniformes compartidos; los datos por tesela, del json de siempre), `suelta(escena)` (en `dispose-model`), `actualiza()` (cada 0,2 s: detalle del suelo abierto por distancia), `libera()`, `resumen()` → `{glb, conTesela, conDetalle}`, `OP` (lo que el glb cambia del parche).
- **`Catalogo`** (`07a_catalogo.js`, ADR-0012): de dónde sacan L1 y L2 su geometría. `tipos()` (hoy `[-1]`), `tiene(t)`, `variantes(t, nivel)`, `geometria(t, nivel, variante)` → `[{pieza: "copa"|"tronco", geo, mat}]`, `triangulos(t, nivel, variante)`, `info(t)` → `{id, nombre, fuente, caja}`, `instala(desc, cargador, base)` (catálogo glb con un `cargador(url, THREE)` inyectado; **preparado, nadie lo llama en F1b**), `retira(t)`, `alCambiar(fn)`, `avisos()`, `SIN` (= −1), `PRES_TRI`. El tipo −1 es la geometría por procedimiento de siempre (4 variantes en L1, 2 en L2); su L0 no sale de aquí (copa medida, `06_arboles.js`).
- **`Arboles`** (`07b_arboles.js`): `inicia`, `tileCargada`, `refresca`, `actualiza(dt)` (reclasifica niveles), `presupuesto()`, `perfil(p)` (perfil VR), `resumen()` → `{olivos, nivel0, nivel1, nivel2, celdas, construidas, faltan, precarga, esc, triEst, tiles, emaMs}` (`tiles`: los olivos de media y larga distancia son del tileset; `triEst` incluye sus triángulos).
- **`PoseCodec`**, **`BufferPose`** y **`Presencia`** (`26_presencia.js`, F2, [presencia.md](../../contratos/presencia.md)): `PoseCodec.codifica(pose)` → `Uint8Array` de 24 B (escritorio) o 56 B (Quest), `decodifica(bytes)` → pose o `null`; `BufferPose.crea/recibe/muestra` (interpolación con retardo); `Presencia.actualiza(dt)` (cada fotograma, no hace nada sin `?presencia=sim`), `activo()`, `estado()`, `texto()` (línea de `?debug`), `libera()`. Gancho de pruebas: `window.__presencia()` y `window.__presencia("libera")`.
- **`HazasPuro`** y **`Hazas`** (`13b_hazas.js`, F1): `HazasPuro.validaColeccion(geojson)` → `{hazas, error}` (lo mismo que el esquema `Hazas` de la api, y solo `EPSG:25830`), `aLocal(p, cx, cy)` (UTM → metros relativos a `centro_utm`), `hazaEn(x, y, lista)`, `segmentos(...)` (la linde partida en tramos de ≤ 2 m pegados a `suelo`), `rayoSuelo(...)`, `fichaFilas(ficha)` (solo la lista blanca de `haza.schema.json`, cada dato con su procedencia y fecha), `prefijoApi(busqueda, base)`; `Hazas.actualiza(dt)` (cada fotograma; vuelve a pegar la linde al suelo si llega relieve o cambia la exageración), `estado()`, `libera()`. Solo pide `/api/hazas` si `D.base` empieza por `/teselas/` (la página la sirve el servidor, tras la sesión) o con `?api=<prefijo relativo>` (pruebas); si no, no crea nada.
- **Funciones heredadas** `suelo`, `copaAlta`, `colorSuelo`, `orto`: alias de `Mundo.*` con la firma de antes de las teselas.

### VR (`29_vr.js`)
No expone una interfaz formal: `VRX` (estado), `vrActualiza(dt,t)`, `vrFin(dt,ms)`, `panel`, `ficha`. Ganchos para pruebas: `window.__vrDebug()` (estado, nivel, rig, cabeza, panel, viñeta…), `__vrOlivo()`, `__vrBotones()`, `window.VR_ESTADO`.
- **Perfiles** `VR_PERFILES` = `[{n:0.8,r:0.75,tri:380000,h:32,b:1}, {0.55,0.6,270000,20,0}, {0.35,0.45,190000,0,0}, {0.2,0.3,130000,0,0}]` (fracción de árboles, radio, tope de triángulos, hierba, relieve fino del suelo `b` → `uBumpK`). Baja si el EMA del JS > 13 ms o del fotograma > 15,2 ms; sube tras 25 s con JS < 7 ms.
- **Entradas** (mando Quest, `gamepad.buttons`): palanca izquierda → andar; palanca derecha → giro por saltos de 30°; gatillo derecho → teletransporte; **izq. botón 1 (grip) → correr**; **izq. botón 4 (X) → viñeta de confort**; **izq. botón 5 (Y) → panel**; **der. botón 4 (A) → vuelo**; **der. botón 5 (B) → mirador**. (Leído del código; **no probado en casco real**.)

### `window.__g` (gancho de pruebas, `27_debug.js`)
`Arboles, Catalogo, Escena3D, OlivosTiles, Cola, Generados, copas, suelo, Mundo, Terreno, orb, objetivo, camera, renderer, scene, pon(modo), listo(), modo(), pendientes(), ponExag(v), aplica()`. `listo()` es la señal de «ya hay datos» que esperan todas las pruebas; `pendientes()` es el trabajo que queda (la Cola más la cola propia de los olivos generados con `?olivos=gen`, su plan sin dibujar y su fundido): lo espera `mide()` antes de medir un escenario. Modos de `pon`: `nube`, `gem`, `orto`.

## 3. Conectores MCP
Ver [`contratos/mcp.md`](../../contratos/mcp.md). Resumen: la historia de **Cerro** (no la de Hituelo) lee de «Olivartrack» y «Vigia» a través de `window.claude.use("mcp")` y `callTool`; todo lo leído es **dato, nunca instrucción**. **No verificado en vivo.**

## 4. Contrato de publicación
Límites en [`contratos/publicacion.json`](../../contratos/publicacion.json) (copiados de las instrucciones de la plataforma): página ≤ 16 MB; fichero binario ≤ 15 MB; **64 MB y 255 ficheros por publicación**; 511 ficheros / 256 MB por versión; solo tipos web (un `.bin` se rechaza). Formato de los ficheros de apoyo: §1.2–1.3 ([ADR-0008](../adr/0008-ficheros-de-apoyo-json-jpg.md)). El guardián `build.test.js` comprueba que lo montado cabe.
