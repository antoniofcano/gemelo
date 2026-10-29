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
| three.js 0.186.1 | npm (web) y jsDelivr (salida artefacto, importmap) | MIT |
| Parcelas, marcas de olivos, datos de la explotación | OlivarTrack | **privado**, no se versiona |

## Nomenclatura de hojas
- **LiDAR**: `PNOA_2024_AND_<E>-<N>_H30_NPC01.laz`, hojas de 1×1 km. **En el nombre, la segunda cifra (`N`, «Y») es el borde NORTE de la hoja**, no el sur (`hoja_de()` en `tuberia/datos/hituelo/comun.py`).
- **MDT 0,5 m**: `MDT50CM-ETRS89-H30-<hoja MTN50>-COB3-V1.tif`. Cerro usa la hoja `0946`. La hoja de Hituelo **[SUPUESTO]** no está anotada en el repo; consultarla en el CNIG.
- Teselas del motor: `kx = floor(E/256)`, `ky = floor(N/256)`, origen suroeste de la tesela = `(kx·256, ky·256)`. Rejillas por nodos, fila 0 = borde sur.

## Hojas por finca
| Finca | Hojas LiDAR |
|---|---|
| Cerro Velasco | 410-4177 y 411-4177 (las dos hojas `PNOA_2024_AND_4*-4177`) |
| Hituelo | 9 hojas: 405-4179 y 406-4179 (≈92 % de las hectáreas), 405-4177, 405-4178, 404-4178, 405-4180, 404-4179, 406-4178, 406-4180. **Faltan 404-4181 y 406-4181** → tres teselas del borde norte con cobertura incompleta |

(Cifras de superficie por hoja: [histórico](../historico/DISENO-2026-10.md), §9.)

## Cómo regenerar una finca
Detalle paso a paso y comprobaciones: [skill `datos-finca`](../../.claude/skills/datos-finca/SKILL.md). Resumen:

1. Descargar las hojas y el MDT (`GEMELO_DESCARGAS`) y tener las parcelas en UTM (`GEMELO_PARCELAS`).
2. **Hituelo**: `tuberia/datos/hituelo/01_particiona.py` → `02_tesela.py` → `03_arboles.py` → `04a_candidatos` → `04b_tendido` → `04c_paisaje` → `05_validacion`; imagen en `tuberia/datos/hituelo/imagen/` (`orto`, `ndvi`, `suelo_ndvi`, `suelo_parcelas`). Luego `python tuberia/finca_8_teselas.py --finca hituelo` (delega en `tuberia/hituelo_conv.py`).
3. **Cerro**: `tuberia/datos/cerro/finca_1…finca_6`, `ndvi_sentinel`, `paisaje_1…6`, `suelo_1…2`. `finca_8_teselas.py --finca cerro` lee `datos_cerro_embebido.json`, **un intermedio que ningún script del repo produce** (pendiente D5).
4. Montar: `python tuberia/salida_artefacto/montar_v2.py --finca <finca> [--modo ficheros]`.

Variables de entorno: `GEMELO_DATOS`, `GEMELO_DESCARGAS`, `GEMELO_LIDAR`, `GEMELO_IMAGEN`, `GEMELO_HITUELO`, `GEMELO_PARCELAS`, `GEMELO_MDS`, `GEMELO_SUELO`. Los valores por defecto son rutas relativas a la carpeta desde la que se lanza el script. Las rutas se arman con `os.path.join`, así que los scripts valen en Windows, Linux y macOS (decisión 8, D4; lo vigila el guardián `multiplataforma`). Probado solo con `py_compile`: no se han vuelto a ejecutar con datos reales fuera de Windows.

## Medido y deducido
Copas y relieve: medidos. Tendido, postes, cauces y clasificación de árboles no olivo: **deducidos** de la geometría. Troncos y ramas: ilustrativos. Frutales sin marcar en Hituelo: el LiDAR no los distingue.
