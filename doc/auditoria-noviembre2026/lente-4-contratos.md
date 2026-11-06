# Lente 4 — Contratos exportador↔motor

Auditoría de noviembre de 2026, v0.2.0, commit `4ab0ae6`. Solo lectura: lo único que he escrito en el repo es este informe. Los experimentos se hicieron en el scratchpad de la sesión, nunca en `pruebas/salida/` ni en `salida/`. No hay datos reales: solo el fixture y las entradas sintéticas de `pruebas/exportadores_sinteticos.py`.

## 1. Qué revisé

- **Método y reglas:** `.claude/skills/auditoria/SKILL.md`, `lentes.md`, `ALCANCE.md`, la regla 3 de `CLAUDE.md` y `doc/sistema/CONTRATOS.md` (§1 datos, §2 interfaces).
- **Esquemas:** `contratos/indice.schema.json`, `tesela.schema.json` y `tileset.schema.json`, con lectura completa. Además miré quién valida cada uno de los ficheros de `contratos/`, buscando su nombre en las pruebas y en la tubería.
- **Exportadores:** `tuberia/finca_8_teselas.py` (`construye()` de Cerro y `replica()`), `tuberia/hituelo_conv.py`, `tuberia/tiles3d/genera.mjs` (lectura del contrato, relieve, ortofoto, lista de copas, huellas y `extras.gemelo`) y `tuberia/tiles3d/comprueba.mjs`.
- **Fixture y guardianes:** `pruebas/genera_fixture.py`, `exportadores_sinteticos.py`, `nube_sintetica.py`, `pruebas/contrato_modulos.js`, `guardianes/contratos.test.js` y `guardianes/exportadores.test.js`.
- **Lectura en el motor:**
  - `01_datos` y `02_mundo`, con lectura completa: rejillas, margen, filas y `v`.
  - `04b_escena3d` (raíz del tileset y comprobación de finca) y `04c_olivos_tiles` (contrato tileset v2 y huellas).
  - `05_nube` (la nube y `setDrawRange`), `07b_arboles` (`pts`), `10_ndvi`, `10b_capa_ndvi`, `13_parcelas`, `14_historia` (`D.ot`), `18_paisaje` y `21_suelo`.
  - Búsqueda de todo acceso `D.<campo>` en los 88 módulos.
- **Contratos de red:**
  - `contratos/presencia.md` contra `26_presencia.js` (PoseCodec, SalaPose), `37_red.js` y `38_presencia_compartida.js`.
  - `voz-consentimiento.md` contra `apps/api/src/presencia/{consentimiento_voz,voz,voz_rutas,corro_rutas}.ts` y `47_habla.js`/`47b_corro.js`.
  - `mundo-hoy.md` contra `apps/api/src/mundo/rutas.ts` y `53_mundo_hoy.js`.
  - `sesion.md`, solo por muestreo de constantes en `apps/api/src/auth/{rutas,vinculo}.ts` y `config.ts`.

**Ejecuté (sin tocar el repo):**
- `node pruebas/contrato_modulos.js --comprueba` → «cabeceras de contrato al día», rc 0.
- `python pruebas/exportadores_sinteticos.py exporta <scratchpad>` y `python pruebas/genera_fixture.py --salida <scratchpad> --sin-tileset`. Sobre lo que salió decodifiqué cada tesela: tamaños, orden de claves, rango de `pts` y pendiente por filas y columnas.
- Tres experimentos propios en el scratchpad: Cerro con una ventana no alineada a 256 m, Hituelo con otra caja de NDVI, y la derivación de cabeceras sin comentarios ni cadenas.

**Lo que está bien (comprobado):**
- Las dos fincas escriben `dtm` 258² Int16 (133.128 B), `chm` 256² u8 (65.536 B) y `suelo` 130²×3 u8 (50.700 B).
- `pts` va en 0..25.600 cm sobre la esquina SO, con `np` igual en el índice y en la tesela.
- Filas de sur a norte en las dos: con relieves sintéticos de pendiente conocida, la fila 256 es la del norte y la columna 256 la del este.
- La celda de margen del `dtm` sale de la tesela vecina en Cerro (`map_coordinates`/recorte de la ventana) y en Hituelo (rejilla global `Gz`).
- Semilla fija: `RandomState(12345)` en Cerro (`finca_8_teselas.py:61,99`) y `crc32` por tesela en `tuberia/datos/hituelo/02_tesela.py:112`.
- **La tesela Base (sin `pts`) funciona:**
  - en el motor: `02_mundo.js:100` (`t.pts = null`), `05_nube.js:66` (`!t.np || !t.pts`) y `07b_arboles.js:85`;
  - en `genera.mjs`, que solo lee `dtm` y el jpg;
  - el fixture la ejercita (`1001_16000`, sin la clave `pts`) y `contratos.test.js:261` lo exige.
  - Los dos exportadores reales nunca escriben una tesela Base: escriben siempre `pts`, como mucho vacío con `np = 0`. El esquema lo admite (patrón `*`), y el motor también, porque `05_nube` mira `np`.
- **Presencia:** el código cumple la tabla de bytes. Versión 1, 24/56 B, bits 0-1 tipo, 2-3 manos, 4-5 modo (3 se lee como a pie), *smallest-three* de 10 bits con `round((v+1/√2)/√2·1023)`, tema `pose` no fiable y `chat` fiable, tic de 100 ms, 2 Hz cada 5 tics, 55/65 m, 12 poses, 150/650 ms, extrapolación de 120 ms. La cota viaja sin exagerar (`38_presencia_compartida.js:534,549`).
- **Voz:** `VOZ_AVISO_VERSION = VOZ_CERCANIA_AVISO_VERSION = 1` (`consentimiento_voz.ts:21,23`), igual que `AVISO_VERSION` de `47_habla.js:31` y `47b_corro.js:40`. Responde `409 version_distinta` y `409 falta_declaracion` (`voz_rutas.ts:183,185`). `Palabra.da` y `Palabra.levanta` exigen el consentimiento (`voz.ts:150,178`) y la ruta lo inyecta siempre (`voz_rutas.ts:93`). `DELETE` borra la fila antes de tocar LiveKit (`voz_rutas.ts:195`).
- **Mundo de hoy:** siempre 200, con el esquema del contrato como serialización de lista blanca (`mundo/rutas.ts:24`) y `cache-control: private, max-age=60` (`:28`). El motor pinta con `textContent` (`53_mundo_hoy.js:129`).
- **Sesión (muestreo):** cookie `__Host-gemelo` `HttpOnly; Secure; SameSite=Lax` (`auth/rutas.ts:16-17`). El alfabeto de 31 símbolos, el HMAC-SHA256 y los 5 minutos del código corto están en `vinculo.ts:15,17,38`. El enlace caduca a los 15 minutos (`config.ts:295`).

## 2. Hallazgos

**[ALTO] L4-01 · `apps/web/motor/04b_escena3d.js:147` y `04c_olivos_tiles.js:82-96` — el motor no comprueba que el tileset sea del mismo `centro_utm`/`z0` que el índice.**
- **Defecto:** de `extras.gemelo` solo compara `finca_id` (04b) y `contrato_tileset` e `id_fuente` (04c). La huella del registro no lo puede detectar, porque los ids provisionales salen de la posición UTM **absoluta** (CONTRATOS §1.1): si `centro_utm` cambia, la huella sigue igual. El contrato dice lo contrario: `tileset.schema.json` exige `centro_utm` y `z0` «del que sale», y su comentario de `huella_registro` dice que el motor la compara «antes de resolver nada», para saber si «el json no es del que salió».
- **Escenario:** se reexporta Hituelo y el NDVI llega con otra caja. `hituelo_conv.py:26` deduce el centro de esa caja y el centro cambia, pero el tileset no se regenera. `infra/dev/herramientas/levanta.mjs:46-50` sirve el `tileset/` que ya estaba junto al índice. El motor coloca la escena con la `transform` de la raíz vieja (`colocaGrupo`, 04b:121-124), mientras `Mundo`, las lindes, las fichas y los olivos de cerca usan el centro nuevo. Toda la escena y los olivos del tileset quedan corridos Δcentro (en planta y, si cambia `z0`, en cota) respecto de la física y del motor, y 04c acepta los olivos porque la huella casa.
- **Cómo se comprobó:** en el scratchpad, `hituelo_conv.hituelo()` dos veces sobre las entradas sintéticas, cambiando solo `bbox25830`. El centro pasa de `[256128, 4096128]` a `[256138, 4096123]`, la copa 0 de `[-67.75, -47.5]` a `[-77.75, -42.5]`, y la huella SHA-256 de `copas_id` sale **igual**. El efecto en pantalla no lo he visto en un navegador: se deduce de leer 04b/04c.
- **Por qué no lo vio ningún guardián:** `tiles3d.test.js:186-200` comprueba el marco contra el `centro_utm` del mismo índice con el que se generó. `comprueba.mjs` tampoco compara `G.centro_utm`/`G.z0` con `I` (líneas 17-26). Ninguna prueba sirve un tileset de una exportación anterior.

**[MEDIO] L4-02 · `pruebas/contrato_modulos.js:45-54, 84, 100` — las cabeceras «Expone / Consume» se derivan del texto con comentarios y sin los nombres de menos de 3 letras, y `--comprueba` da verde con cabeceras que no describen el uso real.**
- **Defecto:** `lee()` solo quita la cabecera y `usa()` busca el nombre en todo el texto, comentarios y cadenas incluidos. El filtro `n.length < 3` descarta `x0`, `yN`, `UN`, `pp`, `TR`, `dr`, `OT`… La regla 2 de CLAUDE.md promete que cada módulo «declara en su cabecera qué expone y qué consume».
- **Escenario:**
  - `01_datos.js:4` dice consumir `05_nube (nube)` y `15_tiempo (nivel)`, y solo son palabras de sus comentarios (líneas 19 y 28).
  - `10_ndvi.js:3` no declara `x0`/`yN` de `01_datos`, y los usa en `:30`.
  - `04e_suelo_fondo.js:2-5` no declara `UN` de `04d`, lo usa en `:36` y su propio registro de componente sí lo lista (`:63`).
  - `22_huellas.js:11` usa `pp` de `12_paseo` sin declararlo.
  - Quien quiera reordenar o partir módulos para la refactorización de mundos múltiples fiándose de las cabeceras verá dependencias falsas y no verá dependencias reales.
- **Cómo se comprobó:** dos guiones en el scratchpad sobre `contratoModulos.deriva()`. Unos **496 consumos de 76 módulos** solo aparecen en comentarios o cadenas. Hay **74 usos** de nombres cortos expuestos que ninguna cabecera recoge; es una cota superior, porque algunos son sombras locales, como `var x0` en `04c:23`. Revisé a mano los cuatro casos de arriba.
- **Por qué no lo vio ningún guardián:** `contratos.test.js:283-298` compara la cabecera con la misma derivación y, si acaso, que lo consumido lo exponga otro módulo. Nadie contrasta la derivación con el uso real.

**[MEDIO] L4-03 · `pruebas/guardianes/contratos.test.js:54-55` frente a `doc/sistema/CONTRATOS.md:70` y `tuberia/finca_8_teselas.py:79-80,102` — contrato y guardián se contradicen sobre `teselas{}.v`, y el exportador de Cerro cumple el contrato pero no el guardián.**
- **Defecto:** CONTRATOS dice «`v` = rectángulo con dato», y así lo escribe Cerro: las celdas interiores con dato. El guardián y la lista de la skill `datos-finca` (línea 23) exigen `v[0] = kx·256 − cx` y `v[1] = ky·256 − cy`, con la tesela alineada.
- **Escenario:** una ventana de Cerro que no empieza en un múltiplo de 256 m da `v = [-150, -100, 66, 100]` en la tesela `1000_16000`, cuando `kx·256 − cx = -190` y `ky·256 − cy = -130`. El motor sí lo aguanta, porque calcula `ox`/`oy` desde `kx`/`ky` (`02_mundo.js:16`) y usa `v` solo para recortar y medir distancias. Lo que falla es que el contrato no es uno: un guardián sobre una exportación real de Cerro con la ventana desalineada fallaría, y nadie sabe cuál de las dos reglas manda.
- **Cómo se comprobó:** `construye()` en el scratchpad con una ventana sintética de 300 × 200 m que empieza en E +40 y N +30.
- **Por qué no lo vio ningún guardián:** la comprobación solo corre sobre el fixture, que está alineado (`genera_fixture.py:127`). `exportadores.test.js` no mira `v`.

**[MEDIO] L4-04 · `pruebas/guardianes/exportadores.test.js:95,116` — las teselas de los exportadores reales no se validan contra `tesela.schema.json` ni contra sus tamaños. El fixture del contrato de datos no sale de los exportadores.**
- **Defecto:** `contratos.test.js` valida lo que escribe `genera_fixture.py`, que es un generador aparte en Python puro. De `hituelo_conv.py` y `construye()`, `exportadores.test.js` solo valida el índice y comprueba que existan `t/<k>.json|jpg` (`existsSync`). No mira tamaños, orden sur→norte, margen, `np` ni barajado. Además se salta sin numpy, scipy o pillow (`:19`).
- **Escenario:** un cambio en `hituelo_conv.py:81-101`, por ejemplo quitar el margen del `dtm` o invertir filas, pasa la puerta y rompe la carga de Hituelo: costuras, relieve espejado, y `Mundo.suelo` leería fuera de la rejilla de 258.
- **Cómo se comprobó:** leí los dos guardianes. Decodifiqué a mano las teselas que escriben hoy los exportadores sintéticos, y están bien. El defecto es la falta de vigilancia, no el dato.
- **Por qué no lo vio ningún guardián:** es el propio hueco. La regla 3 habla de «el fixture», en singular, y se cumple con un fixture que no ejercita el exportador.

**[MEDIO] L4-05 · `apps/web/motor/18_paisaje.js:10,23-29,52` (y `indice.schema.json:50`, `CONTRATOS.md:69`) — el motor lee subcampos de `paisaje` que ningún contrato fija, en código de primer nivel.**
- **Defecto:** el esquema solo exige que `edificios` y `arboles` sean arrays y que `tendido` y `arroyo` tengan claves. CONTRATOS los nombra sin forma. El motor lee:
  - `e.largo, ancho, ang, zBase, hAlero, hCumbrera, color[0..2]`;
  - `p.zAlto, zBase` de los postes;
  - `tendido.derivaciones[].{postes, linea}`;
  - `arboles[].{h, r, tipo, zBase, enCauce}`;
  - la forma antigua `arroyo.eje` (`:80`).
- **Escenario:** si un exportador de Cerro, o el de Hituelo al cambiar `paisaje.json`, deja un edificio sin `color`, `e.color[0]` (`:26`) lanza un error al montar el módulo. Como todos los módulos van en una sola IIFE (`01_datos`…`99_cierre`), la página entera se queda sin motor. El fixture lleva todos los subcampos, así que no lo prueba.
- **Cómo se comprobó:** búsqueda de accesos en `18_paisaje.js` y en el esquema. No ejecutado en un navegador.
- **Por qué no lo vio ningún guardián:** el esquema no tiene `required` en los objetos de esas listas y el fixture siempre trae el caso completo.

**[MEDIO] L4-06 · `tuberia/hituelo_conv.py:97` — la celda de margen del `suelo` de Hituelo repite el borde propio (`np.pad(..., mode="edge")`), no la celda de la tesela vecina.**
- **Defecto:** `02_mundo.js:7-8` y CLAUDE §5 dicen que el margen es «la de la tesela vecina, para que la interpolación no tenga costura». Cerro sí remuestrea la vecina (`finca_8_teselas.py:82-87`).
- **Escenario:** en cada borde de tesela de Hituelo, la interpolación bilineal de `colorSuelo` (`02_mundo.js:38-41`) y la textura de suelo de `04d` mezclan el color de un lado con su propio borde. Sale una costura de color de ~2 m en la rejilla de 256 m: visible desde el dron sobre suelo claro, sin efecto en datos.
- **Cómo se comprobó:** lectura del código. La salida sintética es de una sola tesela y no permite ver la costura. No medido en Hituelo real.
- **Por qué no lo vio ningún guardián:** `contratos.test.js` solo mira tamaños, y sobre el fixture, que pinta el suelo con una fórmula continua (`genera_fixture.py:52-54`).

**[MEDIO] L4-07 · `doc/sistema/CONTRATOS.md:58` frente a `tuberia/hituelo_conv.py:27`, `apps/web/motor/10_ndvi.js:30` y `04d_sombreado_tiles.js:24` — `ext` no es lo que dice el contrato: es la georreferencia implícita del NDVI.**
- **Defecto:** el contrato dice «`ext` = la caja de teselas/ventana». En Hituelo, `ext` es la caja del NDVI (`bbox25830`), no la de las teselas: el mosaico y el relieve grueso usan la caja de teselas (`:108,115`). El objeto `ndvi` no lleva georreferencia propia (solo `w`, `h`), y el motor la deduce de `ext` (`10_ndvi.js:30`; `uGBox` en `04d:24`; `x0`/`ANCHO` en `01_datos.js:20`).
- **Escenario:** un exportador que haga caso al contrato y ponga en `ext` la caja de teselas, con una rejilla NDVI que no la cubra exactamente, desplaza o estira el NDVI sobre el terreno sin que nada avise. Afecta a la capa «Vigor», al tinte de copas y al NDVI del suelo de `21_suelo`. Hoy las dos fincas casan por construcción.
- **Cómo se comprobó:** lectura cruzada de exportador, contrato y motor.
- **Por qué no lo vio ningún guardián:** `contratos.test.js:53` solo exige que las teselas caigan dentro de `ext`, y en el fixture `ext` coincide a la vez con las teselas y con el NDVI.

**[MEDIO] L4-08 · `doc/sistema/CONTRATOS.md:15` — el contrato «Olivo generado» dice que lo vigilan `olivo.test.js` y `contratos.test.js`, y nadie compila `contratos/olivo-generado.schema.json`.**
- **Defecto:** no hay ninguna referencia al fichero en `pruebas/`, `apps/` ni `tuberia/`. La fila de `copas_param` está escrita dos veces: en ese esquema (`$defs.copas_param_fila`) y en `indice.schema.json:43`. Solo la segunda se valida (`contratos.test.js:180` y `exportadores.test.js:165`).
- **Escenario:** alguien cambia la fila en `olivo-generado.schema.json`, por ejemplo un campo 9 o el rango del rumbo. Ninguna prueba falla y las dos copias del contrato divergen.
- **Cómo se comprobó:** búsqueda de `olivo-generado.schema` en el repo (cero usos fuera de `contratos/` y `doc/`).
- **Por qué no lo vio ningún guardián:** ninguno lo carga.

**[BAJO] L4-09 · `apps/web/motor/29_vr.js:360`, `44b_carteles.js:220` y `01_datos.js:34` — el motor lee `D.titulo_vr` y `D.config.factorR8`, que no están en el contrato del índice y que no escribe ningún exportador ni `infra/dev`.**
- **Defecto:** son entradas sin contrato. Funcionan por defecto (título de la página o id de la finca; factor 0,5), pero la regla 3 dice que el motor y el exportador se ponen de acuerdo por contrato.
- **Escenario:** un exportador que empiece a escribir `config` con otra forma, por ejemplo `config.v` como la de `/api/config`, cambia el factor de copa sin pasar por ningún esquema.
- **Cómo se comprobó:** `grep` de `D.<campo>` en `apps/web/motor/` contra el esquema, y búsqueda de escritores en `tuberia/`, `infra/` y `apps/web/herramientas/`.
- **Por qué no lo vio ningún guardián:** `indice.schema.json` no tiene `additionalProperties: false` y nada compara lo que lee el motor con lo que fija el esquema.

**[BAJO] L4-10 · `tuberia/finca_8_teselas.py:114` — Cerro copia al índice todas las claves del intermedio salvo cinco.**
- **Defecto:** pasan campos fuera del contrato, como `W` y `H` en la salida sintética.
- **Escenario:** cualquier clave nueva que aparezca en `datos_cerro_embebido.json` llega al índice público sin control. Esto es asunto de la lente 9, por si fuera algo de la explotación.
- **Cómo se comprobó:** las claves de `exp/cerro/indice.json` en el scratchpad dan `['H', 'W']` de más.
- **Por qué no lo vio ningún guardián:** el esquema es abierto.

**[BAJO] L4-11 · `tuberia/hituelo_conv.py:81,108` — `dtm` y `grueso` se convierten a Int16 sin recortar (`astype("<i2")`), mientras que `pts` sí se recorta (`:100`).**
- **Defecto:** numpy desborda en silencio: 330 m dan −32.536. Con `z0 = min − 2 m`, un desnivel de más de ~325 m en una misma exportación da relieve con escalones falsos de 655 m, y el contrato no declara el rango.
- **Escenario:** una exportación de Hituelo con varias fincas y mucho desnivel. Es poco probable.
- **Cómo se comprobó:** probé en numpy el desbordamiento con `np.rint(...).astype('<i2')`. **No he comprobado** el desnivel real de Hituelo.
- **Por qué no lo vio ningún guardián:** el fixture y las entradas sintéticas tienen unos pocos metros de desnivel.

**[BAJO] L4-12 · `apps/web/motor/14_historia.js:111` (y `10b_capa_ndvi.js:14`) — `ndvi` es opcional en el contrato, pero `ndviEn()` usa `NDV.fechas` sin comprobar que haya NDVI.**
- **Defecto:** `10_ndvi`, `21_suelo` y la casilla de `10b` sí se protegen, y existe una prueba de «finca sin NDVI» (`componentes_c10d.test.js:115`) que no recorre la historia.
- **Escenario:** una finca nueva sin NDVI cuya historia tenga una escena con `ndviEn` da un error al pulsarla. No rompe la carga.
- **Cómo se comprobó:** lectura. No ejecutado.
- **Por qué no lo vio ningún guardián:** el fixture siempre trae `ndvi`.

**[BAJO] L4-13 · `doc/sistema/CONTRATOS.md:48` — la lista de opcionales del índice omite `copas_semilla`, `copas_param` y `biodiversidad`, que están en el esquema y que el motor lee (`07ab_generados.js:312`, `52_aves_mes.js:73`).**
- **Defecto:** la tabla de contratos tampoco nombra `ot-hoy.*` ni `juegos-clasificacion.schema.json`, que existen y se validan. Es documentación, y lo cruzo con la lente 10.
- **Cómo se comprobó:** comparé la línea 48 con `indice.schema.json:22-54`, y busqué el nombre de cada fichero de `contratos/` en CONTRATOS.md.
- **Por qué no lo vio ningún guardián:** `contratos.test.js:349-352` solo exige que CONTRATOS nombre las interfaces y unos pocos ficheros.

**[BAJO] L4-14 · `apps/web/motor/04c_olivos_tiles.js:83` — el motor no mira `contrato_origen` ni `srs` de `extras.gemelo`.**
- **Defecto:** un tileset hecho desde un contrato de datos v3 (cuando exista) con un índice v2 solo se descubriría por la huella.
- **Escenario:** defensa en profundidad, con el mismo origen que L4-01.
- **Cómo se comprobó:** lectura.
- **Por qué no lo vio ningún guardián:** solo hay una versión.

## 3. No verificado

- **El efecto visual de L4-01** (la escena corrida respecto de la física) y **la costura de L4-06**: necesitan Chrome con el fixture alterado o Hituelo real, y aquí no hay banco. Lo que sí está comprobado es la condición previa: el centro cambia y la huella no.
- **El desnivel real de Hituelo** (L4-11) y si alguna ventana real de Cerro está desalineada a 256 m (L4-03): son datos reales que no tengo.
- **Los contratos de red en vivo:** LiveKit (`destinationIdentities`, tasas reales, retardo p95), la serialización de Fastify en un servidor de verdad y la purga de la auditoría de voz contra Postgres. Solo los he leído.
- **`tiles3d.test.js`, `escena3d.test.js`, `presencia.test.js` y las pruebas de `apps/api`**: no los ejecuté, porque no hay `node_modules` en la raíz ni en `apps/api`. Sus afirmaciones las tomé de su código.
- **Si los 179 «consumos hacia módulos posteriores»** de la derivación son usos en tiempo de carga (habría un `undefined` al montar) o solo llamadas diferidas (inofensivas). No los he revisado uno a uno.

## 4. No revisado

- **`sesion.md`** salvo el muestreo de constantes del §1. Tampoco la llave (WebAuthn), la oficina y los aparatos, ni la rotación y revocación en `almacen.ts`.
- **`mundo-hoy.schema.json`** campo a campo contra `hoy.ts`, que tiene 663 líneas de esquema. Solo miré que se usa como serialización de respuesta y que el motor pinta con `textContent`.
- **Los contratos de la api** (`api.openapi.yaml`, `haza`, `vida`, `decoraciones`, `avatares`, `tiempo`, `ot-hoy`, `medidas`, `config`, `olivartrack-sync`, `livekit-roles`), `contratos/interfaces.json` contra los `return` de cada módulo (lo vigila `contratos.test.js:326-331`) y `contratos/mcp.md`.
- **`tuberia/tiles3d/genera.mjs`** más allá de la lectura del contrato y de `extras.gemelo`: geometría, `geometricError`, simplificación y glb.
- **`replica()`** de `finca_8_teselas.py` en ejecución: necesita `salida/cerro` real. Lo leí y no vi nada que rompa el contrato.
- **`tuberia/ids_copas.py` y `semillas_copas.py`** por dentro (ya los cubre `exportadores.test.js`), los intermedios de `tuberia/datos/{cerro,hituelo}/` salvo la línea del barajado, y `tuberia/biodiversidad/`.
