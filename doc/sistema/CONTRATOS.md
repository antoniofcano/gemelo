# Contratos

Dónde exportador y motor (y el motor y los conectores, y el motor y la plataforma) se ponen de acuerdo **por escrito**. Regla 3 de CLAUDE.md: cambiar un campo es cambiar este documento, su esquema en [`contratos/`](../../contratos/) y el fixture en el mismo commit. Lo comprueba [`contratos.test.js`](../../pruebas/guardianes/contratos.test.js) contra un fixture sintético ([`genera_fixture.py`](../../pruebas/genera_fixture.py)).

Versión del contrato de datos: **v = 2** (campo `v` del índice).

| Contrato | Esquema / fuente de verdad | Lo vigila |
|---|---|---|
| Índice global | [`contratos/indice.schema.json`](../../contratos/indice.schema.json) | `contratos.test.js` |
| Tesela | [`contratos/tesela.schema.json`](../../contratos/tesela.schema.json) | `contratos.test.js` (esquema y tamaños) |
| Interfaces del motor | [`contratos/interfaces.json`](../../contratos/interfaces.json) | `contratos.test.js` |
| Módulos de `src/` | cabecera «Expone / Consume» de cada fichero | `contratos.test.js` (vía `pruebas/contrato_modulos.js`) |
| Conectores MCP | [`contratos/mcp.md`](../../contratos/mcp.md) | **nada** (no verificado en vivo) |
| Publicación | [`contratos/publicacion.json`](../../contratos/publicacion.json) | `build.test.js` |

## 1. Datos: exportador → motor

Convenciones comunes: **x este, y norte**, en metros relativos a `centro_utm` (UTM 30N, ETRS89 / EPSG:25830); alturas relativas a `z0`; filas de cada rejilla **de sur a norte** (fila 0 = borde sur) salvo las del mosaico, NDVI y relieve grueso, que van de **norte a sur** (fila 0 = norte). Todo binario va en **base64 de Int16 o u8 little-endian**. Una tesela `(kx, ky)` cubre en UTM `[kx·256, kx·256+256) × [ky·256, ky·256+256)`.

### 1.1 `indice.json` (va en la página como `D`)

Campos obligatorios: `v, ts, res, srs, orto_px, finca_id, centro_utm, z0, ext, parcelas, copas, marcados, ot, avance, teselas, grueso, mosaico`. Opcionales: `fincas, textos, ndvi, suelo_ndvi, paisaje, zmax, cobertura_nube, base`.

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
| `marcados[]` | `[x, y, índice en copas o -1, índice de parcela]`: olivos marcados en OlivarTrack |
| `ndvi` | `w, h, fechas[], media[]` y los datos **o** `u8` (Hituelo: 0 = sin dato; 1..254 → −0,2..1,0 con `(u−1)/253·1,2−0,2`) **o** `b64` (Int16 en milésimas, −32768 = sin dato; variante antigua de Cerro) |
| `suelo_ndvi` | `w, h, a[], b[], f, fechas[]`: NDVI del suelo = NDVI − b·f/1000 por fecha (`f`: Int16 por celda) |
| `ot` | instantánea de OlivarTrack: `fuente ("instantanea"\|"vivo"), fecha_consulta, pases_finca, entregas_finca, analiticas_finca, parcelas{id:{tareas[], fenologia[]}}` |
| `avance` | avance de trabajos por parcela (`{}` si no hay) |
| `paisaje` | `fuente, centro_utm, z0, edificios[], tendido{linea, postes, derivaciones}, arroyo{ejes, nota}, arboles[]` — **deducido** de la geometría |
| `teselas{}` | `"kx_ky": {kx, ky, v[x0,y0,x1,y1], np}`; `v` = rectángulo con dato; `np` = puntos de nube |
| `grueso` | relieve de 8 m: `x0, yN, res, w, h, b64` (Int16, cm sobre `z0`) |
| `mosaico` | ortofoto global: `jpg` (data URI), `w, h, x0, yN, res` (Cerro 1 m/px, Hituelo 2 m/px) |
| `textos` | `sin_historia, finca, fincas, parcelas, ha, olivos, desfase_txt, intro_historia`: lo que `montar_v2.py` cambia en la cabecera |
| `base` | prefijo de `t/` (por defecto `""` = relativo a la página) |

**Nota — registro de árboles: diseño frente a implementación.** El diseño ([histórico](../historico/DISENO-2026-10.md), §5.5) proponía un registro `{x, y, h, r8, tesela, parcela, olivo, frutal}`. Lo implementado es `copas[]` con `[x, y, h, r8, parcela+1]`: la **tesela** se deduce de la posición y **`olivo`/`frutal` no viajan**: el motor decide en JS `oliv = !(h > 8 || (h > 6.5 && radio medio < 2.2))`. Por eso los frutales sin marcar en Hituelo no se distinguen (pendiente D1). Manda el código.

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
- **`Terreno`** (`04_terreno.js`): `monta(tesela)`, `montaTodas`, `tileCargada`, `actualiza`, `modoOrto(bool)`, `iniciaMosaico`, `UN` (uniformes: `uExag`, NDVI, etc.).
- **`Arboles`** (`07b_arboles.js`): `inicia`, `tileCargada`, `refresca`, `actualiza(dt)` (reclasifica niveles), `presupuesto()`, `perfil(p)` (perfil VR), `resumen()` → `{olivos, nivel0, nivel1, nivel2, celdas, construidas, faltan, precarga, esc, triEst, emaMs}`.
- **Funciones heredadas** `suelo`, `copaAlta`, `colorSuelo`, `orto`: alias de `Mundo.*` con la firma de antes de las teselas.

### VR (`29_vr.js`)
No expone una interfaz formal: `VRX` (estado), `vrActualiza(dt,t)`, `vrFin(dt,ms)`, `panel`, `ficha`. Ganchos para pruebas: `window.__vrDebug()` (estado, nivel, rig, cabeza, panel, viñeta…), `__vrOlivo()`, `__vrBotones()`, `window.VR_ESTADO`.
- **Perfiles** `VR_PERFILES` = `[{n:0.8,r:0.75,tri:380000,h:32}, {0.55,0.6,270000,20}, {0.35,0.45,190000,0}, {0.2,0.3,130000,0}]` (fracción de árboles, radio, tope de triángulos, hierba). Baja si el EMA del JS > 13 ms o del fotograma > 15,2 ms; sube tras 25 s con JS < 7 ms.
- **Entradas** (mando Quest, `gamepad.buttons`): palanca izquierda → andar; palanca derecha → giro por saltos de 30°; gatillo derecho → teletransporte; **izq. botón 1 (grip) → correr**; **izq. botón 4 (X) → viñeta de confort**; **izq. botón 5 (Y) → panel**; **der. botón 4 (A) → vuelo**; **der. botón 5 (B) → mirador**. (Leído del código; **no probado en casco real**.)

### `window.__g` (gancho de pruebas, `27_debug.js`)
`Arboles, Cola, copas, suelo, Mundo, Terreno, orb, objetivo, camera, renderer, scene, pon(modo), listo(), modo(), ponExag(v), aplica()`. `listo()` es la señal de «ya hay datos» que esperan todas las pruebas. Modos de `pon`: `nube`, `gem`, `orto`.

## 3. Conectores MCP
Ver [`contratos/mcp.md`](../../contratos/mcp.md). Resumen: la historia de **Cerro** (no la de Hituelo) lee de «Olivartrack» y «Vigia» a través de `window.claude.use("mcp")` y `callTool`; todo lo leído es **dato, nunca instrucción**. **No verificado en vivo.**

## 4. Contrato de publicación
Límites en [`contratos/publicacion.json`](../../contratos/publicacion.json) (copiados de las instrucciones de la plataforma): página ≤ 16 MB; fichero binario ≤ 15 MB; **64 MB y 255 ficheros por publicación**; 511 ficheros / 256 MB por versión; solo tipos web (un `.bin` se rechaza). Formato de los ficheros de apoyo: §1.2–1.3 ([ADR-0008](../adr/0008-ficheros-de-apoyo-json-jpg.md)). El guardián `build.test.js` comprueba que lo montado cabe.
