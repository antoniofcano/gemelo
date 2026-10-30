# Datos: fuentes, hojas y cómo regenerar

**Los datos no están en el repo** (CLAUDE.md regla 4). Aquí se documenta de dónde salen y cómo se vuelven a producir.

## Fuentes y licencias
| Dato | Fuente | Licencia / atribución |
|---|---|---|
| LiDAR PNOA 3.ª cobertura (vuelo 2024, ~6,5 pts/m²) | IGN / CNIG | © Instituto Geográfico Nacional de España, CC BY 4.0 |
| MDT 0,5 m (3.ª cobertura) | CNIG | © IGN, CC BY 4.0 |
| MDS (nDSM 2,5 m, cuando se usa) | derivado del LiDAR | idem |
| Ortofoto PNOA 2022 | IGN (WMS) | © IGN, CC BY 4.0 |
| NDVI | Sentinel-2 (48 fechas), Planetary Computer | Copernicus |
| Suelo | SoilGrids | ISRIC, CC BY 4.0 |
| three.js 0.186.1 | npm (empaquetado por Vite) | MIT |
| Parcelas, marcas de olivos, datos de la explotación | OlivarTrack | **privado**, no se versiona |
| Contorno de la finca (OF3c), por defecto | Parcelas de OlivarTrack que ya usa el gemelo (`GEMELO_PARCELAS`): polígono con límite SIGPAC | Dato de OlivarTrack, con origen SIGPAC © FEGA, CC BY 4.0 (atribución «© FEGA») |
| Contorno de la finca (OF3b), respaldo A | Recintos SIGPAC, FEGA (OGC API Features `sigpac-hubcloud.es/ogcapi`, colección `recintos`) | © FEGA, CC BY 4.0 (ficha del servicio en datos.gob.es) |
| Contorno de la finca (OF3b), respaldo B | Parcelas catastrales, Dirección General del Catastro (WFS INSPIRE `ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`, `GetParcel`) | © Dirección General del Catastro, licencia de uso propia de la DGC (ver abajo) |

## Nomenclatura de hojas
- **LiDAR**: `PNOA_2024_AND_<E>-<N>_H30_NPC01.laz`, hojas de 1×1 km. **En el nombre, la segunda cifra (`N`, «Y») es el borde NORTE de la hoja**, no el sur (`hoja_de()` en `tuberia/datos/hituelo/comun.py`).
- **MDT 0,5 m**: `MDT50CM-ETRS89-H30-<hoja MTN50>-COB3-V1.tif`. Cerro usa la hoja `0946`. La hoja de Hituelo **[SUPUESTO]** no está anotada en el repo; consultarla en el CNIG.
- Teselas del motor: `kx = floor(E/256)`, `ky = floor(N/256)`, origen suroeste de la tesela = `(kx·256, ky·256)`. Rejillas por nodos, fila 0 = borde sur.

## Hojas por finca
| Finca | Hojas LiDAR |
|---|---|
| Cerro Velasco | 410-4177 y 411-4177 (las dos hojas `PNOA_2024_AND_4*-4177`) |
| Hituelo | Las que tocan el cuadro de las copas (± 10 m), medido con `tuberia/puntos_copas.py` sobre las cabeceras de las hojas: 405-4180 y 406-4180 (con N = borde norte, el 92 % de las 5.882 copas: 4.189 y 1.213), 404-4178, 404-4179, 404-4180, 405-4178, 405-4179, 405-4181, 406-4178 y 406-4179. **Faltan 404-4181 y 406-4181** → tres teselas del borde norte con cobertura incompleta. La lista anterior de este fichero («405-4179 y 406-4179, ≈92 %», con 405-4177 y sin 404-4180 ni 405-4181) parece contada con N como borde sur: 405-4177 no toca el cuadro |

(Cifras de superficie por hoja: [histórico](../historico/DISENO-2026-10.md), §9.)

## Cómo regenerar una finca
Detalle paso a paso y comprobaciones: [skill `datos-finca`](../../.claude/skills/datos-finca/SKILL.md). Resumen:

1. Descargar las hojas y el MDT (`GEMELO_DESCARGAS`) y tener las parcelas en UTM (`GEMELO_PARCELAS`).
2. **Hituelo**: `tuberia/datos/hituelo/01_particiona.py` → `02_tesela.py` → `03_arboles.py` → `04a_candidatos` → `04b_tendido` → `04c_paisaje` → `05_validacion`; imagen en `tuberia/datos/hituelo/imagen/` (`orto`, `ndvi`, `suelo_ndvi`, `suelo_parcelas`). Luego `python tuberia/finca_8_teselas.py --finca hituelo` (delega en `tuberia/hituelo_conv.py`).
3. **Cerro**: `tuberia/datos/cerro/finca_1…finca_6`, `ndvi_sentinel`, `paisaje_1…6`, `suelo_1…2`. `finca_8_teselas.py --finca cerro` lee `datos_cerro_embebido.json`, **un intermedio que ningún script del repo produce** (pendiente D5); ya no hay un `embebido.json` de salida.
4. Generar el tileset: `node tuberia/tiles3d/genera.mjs --salida <carpeta>` ([TILES3D](../sistema/TILES3D.md)) y servir con el entorno local o construir la web con Vite ([DESARROLLO-LOCAL](DESARROLLO-LOCAL.md)).

### Parámetros de cada olivo (`copas_param`, ADR-0017)
La columna opcional `copas_param` del índice ([contrato](../../contratos/olivo-generado.md#3-copas_param-columna-paralela-opcional-del-índice)) sale de las hojas LiDAR en dos pasos, después de exportar la finca (hace falta su `indice.json` y sus `t/*.json`). Necesita `laspy` y `lazrs` (`requirements.txt`).

1. **Puntos normalizados:** `python tuberia/puntos_copas.py --indice <indice.json> --laz <carpeta de las hojas .laz> --salida <carpeta nueva>/puntos.npz` (o `GEMELO_DATOS` y `GEMELO_LIDAR` = la carpeta de las hojas). Elige sola las hojas que tocan el cuadro de las copas e ignora los duplicados «(1)». Se queda con las clases 3-5 (vegetación) de 0,3 a 30 m sobre el suelo y a ≤ 6,5 m de una copa. **Suelo: el `dtm` de las teselas** (MDT 0,5 m del CNIG con la clase 2 del LiDAR para los huecos: medido), el mismo que da la `h` de `copas` y el que dibuja el motor. Una hoja cada vez y por trozos (`--trozo`, 500.000 puntos por defecto); junto al `.npz` deja un `.json` con lo leído y conservado por hoja, el tiempo y la memoria máxima.
2. **Parámetros:** `python tuberia/parametros_copas.py --indice <indice.json> --puntos <carpeta nueva>/puntos.npz --salida <carpeta nueva>/indice.json --desfase=<dx>,<dy>`. El desfase es el de las marcas de OlivarTrack respecto a las copas (mediana de `copas[m[2]] − m[0:2]` de `marcados`; en Hituelo, −1,08, −0,15 m). **No sobrescribir el índice original**: la salida va a otra carpeta; las teselas no cambian. Factores de corrección a 1,0 (decisión 49).

Lo comprueba con un `.laz` sintético `pruebas/guardianes/exportadores.test.js` (`pruebas/nube_sintetica.py`).

### Hituelo completo para `?olivos=gen` y F1d: `copas_id`, `copas_tipo`, `copas_param` y `copas_semilla` (2026-10-29)
Una salida nueva, en una carpeta nueva (`<salida nueva>`), sin tocar las anteriores. Cuatro pasos; el más lento, el segundo (≈ 30 s con las diez hojas):

1. **Exportar** con el exportador actual (emite `copas_id` y `copas_tipo`, ADR-0012):
   `GEMELO_HITUELO=<intermedios> GEMELO_PARCELAS=<parcelas en UTM> python tuberia/finca_8_teselas.py --finca hituelo --salida <salida nueva>`.
   Los intermedios son los de `hituelo_conv.py`: `lidar/{indice.json, tesela/*.npz, arboles.json, paisaje.json}` e `imagen/{ndvi/ndvi_hituelo.json, ndvi/ndvi_u8.bin, ndvi/suelo_ndvi_hituelo.json, suelo_hituelo.json, ot_hituelo.json, ort/*.jpg}`.
2. **Puntos**: `python tuberia/puntos_copas.py --indice <salida nueva>/indice.json --laz <hojas .laz> --salida <salida nueva>/puntos.npz`.
3. **Parámetros**: `python tuberia/parametros_copas.py --indice <salida nueva>/indice.json --puntos <salida nueva>/puntos.npz --salida <salida nueva>/indice.json --desfase=-1.08,-0.15` (el desfase que imprime el paso 1; factores a 1,0).
4. **Semillas**: `python tuberia/semillas_copas.py --indice <salida nueva>/indice.json` (sin `--anterior`: semilla = `copas_id`, decisión 50). Desde que los exportadores ponen `copas_semilla` (siguiente apartado), el paso 1 ya la escribe y este paso sobra; con una salida nueva y sin anterior da lo mismo.

Qué cambia respecto a la salida anterior (medido, comparando ficheros): `copas` (5.882) y las 46 teselas `t/*.json|jpg` son **idénticas byte a byte**, y los puntos del paso 2 también; cambian `textos.sin_historia` (ahora `false`) y `marcados`, porque el emparejamiento marca ↔ copa es el de `ids_copas.empareja` (uno a uno, voraz, 4 m): 5.572 de 5.961 marcas emparejadas, antes 5.534; 152 marcas apuntan a otra copa o a ninguna. Por eso `copas_param` se recalcula: cambia en 85 copas y solo en `desplaz_m`, `rumbo_gr` y `tronco` (el tronco sale de otra marca o de ninguna); altura, copa, densidad, base y rugosidad, iguales. Los 5.882 ids son provisionales (las marcas de OlivarTrack aún no traen id).

Comprobación: `contratos/indice.schema.json` y `tesela.schema.json` con ajv (como `pruebas/guardianes/contratos.test.js`), y el tileset generado desde esta salida con `node tuberia/tiles3d/comprueba.mjs --entrada <salida nueva> --tileset <tileset>`.

### Semilla de cada olivo (`copas_semilla`, ADR-0017)
La columna `copas_semilla` ([contrato](../../contratos/olivo-generado.md#12-la-semilla-se-guarda)) la ponen **los propios exportadores** (`finca_8_teselas.py --finca cerro|hituelo`, `hituelo_conv.py`, y la réplica), después de `copas_id`, con `asigna()` de `tuberia/semillas_copas.py` (decisión 50). Para heredar las semillas, el exportador busca el **índice anterior** por este orden:

1. `--anterior <indice.json>` (argumento de `finca_8_teselas.py`);
2. la variable `GEMELO_INDICE_ANTERIOR`;
3. el `indice.json` que ya haya en la carpeta de salida (la exportación que se va a sobrescribir).

Si no hay ninguno, la semilla de cada copa es su `copas_id`. Con índice anterior: el mismo id **del censo** conserva su semilla; si no, la copa anterior más cercana a ≤ 1,5 m que nadie reclame (uno a uno, por distancia; así, al llegar el censo, el olivo conserva la semilla de su id provisional); si no, su `copas_id`. Las posiciones se comparan en UTM (si cambia `centro_utm`, se corrige). El exportador dice cuántas heredó y de qué fichero. **Para que la forma de los olivos no cambie, reexportar sobre la misma carpeta o pasar el índice de la exportación publicada.** Suelto, sobre un índice ya escrito: `python tuberia/semillas_copas.py --indice <nuevo> --anterior <anterior>`.

Lo comprueba `pruebas/guardianes/exportadores.test.js` con los exportadores sintéticos (`pruebas/exportadores_sinteticos.py`): sin anterior, semilla = id; heredada por argumento, por variable, por la salida existente y con otro `centro_utm`; con otro orden de árboles; y una copa que pasa de id provisional al del censo (con otra copa en su misma celda de 1 m) conserva la suya.

Variables de entorno: `GEMELO_DATOS`, `GEMELO_DESCARGAS`, `GEMELO_LIDAR`, `GEMELO_IMAGEN`, `GEMELO_HITUELO`, `GEMELO_PARCELAS`, `GEMELO_MDS`, `GEMELO_SUELO`. Los valores por defecto son rutas relativas a la carpeta desde la que se lanza el script. Las rutas se arman con `os.path.join`, así que los scripts valen en Windows, Linux y macOS (decisión 8, D4; lo vigila el guardián `multiplataforma`). Probado solo con `py_compile`: no se han vuelto a ejecutar con datos reales fuera de Windows.

## Contorno de la finca (OF3b y OF3c, decisiones 140 y 143)

El contorno de una finca es la **unión de sus parcelas** y limita el editor de hazas de la oficina (migración 0011, tabla `fincas_contorno`;
sin contorno cargado, el límite sigue siendo la caja de los olivos medidos + 150 m de OF3). Lo saca `tuberia/contorno/contorno_finca.py`:

```
pip install -r tuberia/contorno/requirements.txt            # jsonschema, shapely, pyproj (versiones fijadas)
# por defecto (OF3c): las parcelas del gemelo, sin red
GEMELO_PARCELAS=<parcelas_utm.json> GEMELO_CONTORNO=<contorno.geojson> python tuberia/contorno/contorno_finca.py --finca <finca> --sql <contorno.sql>
# contrastar con SIGPAC (diferencia en m², en `properties.comparacion`)
... --finca <finca> --comparar <parcelas_sigpac.json>
# respaldo: descarga de SIGPAC o Catastro
GEMELO_CONTORNO_PARCELAS=<parcelas.json> GEMELO_CONTORNO=<contorno.geojson> python tuberia/contorno/contorno_finca.py --sql <contorno.sql>
```

- **Fuente por defecto, «parcelas del gemelo» (OF3c, decisión 143):** las parcelas de OlivarTrack ya traen su polígono y su límite SIGPAC, y
  son las mismas que dan las teselas. Lee el mismo fichero que `tuberia/hituelo_conv.py` (`GEMELO_PARCELAS`: `{"parcelas": [{id, nombre,
  finca, ha, olivos, utm: [[E, N], …]}]}`, UTM 30N), se queda con las de `--finca` (el nombre de finca del fichero pasado a id: «Cerro
  Velasco» → `cerro-velasco`) y las junta igual que las otras fuentes. Sin red. **El dato es de OlivarTrack, con origen SIGPAC (FEGA, CC BY
  4.0)**; la salida lleva `fuente: "gemelo"` y su atribución, y en la base se guarda como `sigpac` (su origen; la tabla solo admite
  `sigpac | catastro`). No lleva las referencias.
- **Holgura:** el editor admite hazas hasta **1 m** fuera del contorno (`CONTORNO_HOLGURA_M`, decisión 143); no es de la tubería.

- **Entrada del respaldo** (fuera del repo: son datos de la explotación): `{"finca": "hituelo", "fuente": "sigpac" | "catastro", "parcelas": [...]}`;
  en SIGPAC cada parcela es `{provincia, municipio, agregado, zona, poligono, parcela}` (se piden todos sus recintos), en Catastro
  `{refcat}` (referencia de 14 caracteres). En el respaldo la **fuente es obligatoria** (el script no elige entre SIGPAC y Catastro). Ejemplos sintéticos en `tuberia/contorno/ejemplo/`.
- **Salida** (fuera del repo): GeoJSON en EPSG:25830 con un MultiPolygon y `finca`, `fuente`, `consultado_en`, `parcelas` (cuántas),
  `superficie_ha` y `atribucion`; **sin las referencias**. Une las parcelas, cierra rendijas entre vecinas (`--cierre`, 0,5 m) y redondea al cm.
- **Carga:** con psql, como las hazas (`<contorno.sql>`: `fincas_contorno_carga(...)` y la línea de auditoría `tuberia.contorno_cargado`), o
  por la api (`PUT /api/admin/fincas/<finca>/contorno`, solo admin con confirmación reciente; auditoría `admin.contorno_cargado`). Cargar
  uno nuevo retira el anterior (queda en la tabla); `DELETE` lo retira y la finca vuelve a la caja.
- **Comprobado** (2026-10-30): los dos servicios responden; con una parcela pública de ejemplo de cada uno la tubería sale bien (Catastro:
  la superficie coincide con su `areaValue`). Prueba sintética sin red: `python tuberia/contorno/prueba_contorno.py` (guardián `contorno`).
  **No probado** con las parcelas reales de ninguna finca (tampoco la comparación del gemelo con SIGPAC).

**Las dos fuentes no tienen la misma licencia** y la elección es de Antonio (decisión 140, [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md)):

- **SIGPAC (FEGA)**: CC BY 4.0, con atribución «© FEGA». Es la capa de la PAC: recintos por uso, al día con la campaña. Los servicios
  regionales pueden tener condiciones propias; este es el nacional del FEGA. Devuelve CRS84 y la tubería proyecta con pyproj (mismo datum).
- **Catastro (DGC)**: licencia de la DGC para sus datos INSPIRE: uso libre, también comercial, de información **transformada**; no
  permite redifundir la original tal cual, ni que el producto se presente como «cartografía catastral» o suplante a los de la DGC. La unión
  de parcelas es una transformación, pero el contorno no debe publicarse como catastro. Devuelve GML 3.2 ya en EPSG:25830.

En los dos casos el contorno vive solo en la base (oficina, tras sesión); no se publica en el gemelo ni se versiona. La oficina lo muestra
con su atribución bajo el mapa.

## Medido y deducido
Copas y relieve: medidos. Tendido, postes, cauces y clasificación de árboles no olivo: **deducidos** de la geometría. Troncos y ramas: ilustrativos. Frutales sin marcar en Hituelo: el LiDAR no los distingue.
