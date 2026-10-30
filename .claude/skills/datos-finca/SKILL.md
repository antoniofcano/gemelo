---
name: datos-finca
description: Cómo añadir o regenerar una finca en el gemelo (hojas LiDAR y MDT, ortofoto, NDVI, suelo, exportar teselas, montar y probar) con su lista de comprobaciones y los problemas conocidos. Úsala al incorporar una finca nueva o al rehacer los datos de Cerro o Hituelo.
---

# Datos de una finca

Los datos **no se versionan** (ADR-0004): todo sucede en local con variables `GEMELO_*`. Fuentes y licencias: [DATOS.md](../../../doc/operacion/DATOS.md). Formatos exactos: [CONTRATOS.md](../../../doc/sistema/CONTRATOS.md).

## Pasos
1. **Parcelas en UTM 30N** (de OlivarTrack, uso interno): `GEMELO_PARCELAS` (JSON con `parcelas[{id, nombre, finca, olivos, ha, utm[[E,N]…]}]`). No se sube.
2. **Hojas necesarias:** calcular qué hojas LiDAR de 1 km (`PNOA_2024_AND_<E>-<N>_H30_NPC01.laz`; **N es el borde norte de la hoja**) tocan las parcelas + 60 m, y la hoja MTN50 del MDT 0,5 m. Descargarlas a `GEMELO_DESCARGAS` (CNIG). Priorizar las que cubren más hectáreas; anotar las que falten (efecto: teselas con cobertura incompleta).
3. **LiDAR → teselas intermedias** (`tuberia/datos/hituelo/01_particiona.py` → `02_tesela.py` → `03_arboles.py` → `04a_candidatos` → `04b_tendido` → `04c_paisaje` → `05_validacion`): usar `python -I`. Salida en `GEMELO_LIDAR` (`tesela/<kx>_<ky>.npz`, `arboles.json`, `paisaje.json`).
4. **Imagen** (`tuberia/datos/hituelo/imagen/`): ortofoto PNOA por tesela (`ort/<kx>_<ky>.jpg`, 512²), NDVI Sentinel-2 (`ndvi_u8.bin` + json), suelo (`suelo_parcelas`, `suelo_ndvi`), `ot_<finca>.json` (instantánea de OlivarTrack).
5. **Exportar:** `python tuberia/finca_8_teselas.py --finca <finca> [--salida <carpeta>]` → `salida/<finca>/{indice.json, t/}` (con `copas_id` y `copas_tipo`). Para una finca nueva hay que añadir su opción al exportador (hoy `cerro`|`hituelo`, y `tuberia/hituelo_conv.py` está escrito para Hituelo): decisión técnica, se cuenta en un ADR si cambia el contrato.
6. **Tileset y página:** `node tuberia/tiles3d/genera.mjs` sobre la salida del exportador (el índice lleva `tileset`) y `cd apps/web && GEMELO_DATOS=<indice.json> npm run build`, o el entorno local de `infra/dev`. Si la finca no tiene guion de historia: `textos.sin_historia = true` (lo aplica `genera_motor.mjs`).
7. **Probar:** servir y `node pruebas/prueba3.js <url> <prefijo>` con `?debug`; mirar a ojo órbita, Gemelo, Ortofoto, NDVI, paseo y minimapa.
8. **Actualizar** `doc/operacion/DATOS.md` (hojas, nombre de la finca), `ESTADO.md` (datos) y CHANGELOG.

## Lista de comprobaciones
- [ ] Cada tesela del índice tiene su `.json` y su `.jpg`; `np` coincide con los puntos de `pts`.
- [ ] `centro_utm` entero; `ext` y `v` en metros relativos; `v[0] = kx·256 − cx`.
- [ ] `copas_id` y `copas_tipo` con la misma longitud que `copas` e ids únicos. Ver la línea `ids: N del censo, M provisionales; desfase marcas->copas …` del exportador: el desfase ≈ 1,1–1,5 m y casi todas las marcas emparejadas; los ids del censo (`< 2^31`) son los de OlivarTrack, los provisionales (`>= 2^31`) salen de la posición UTM (`tuberia/ids_copas.py`, CONTRATOS §1.1) y deben ser **los mismos que en la exportación anterior** para los árboles que no se han movido (comparar por posición). Ningún `aviso:` de id repetido o no válido sin explicar. `copas_tipo` = −1 mientras no haya regla en `asigna_tipos()`. Lo de siempre lo vigila `exportadores.test.js` con datos sintéticos; con los reales, mirarlo.
- [ ] Olivos detectados frente a declarados (Hituelo ≈5.900 vs 5.961): explicar la diferencia.
- [ ] La suma de hectáreas de `parcelas` y las cifras de `textos` coinciden.
- [ ] NDVI: `fechas`, `media` y tamaño `fechas × h × w` coherentes; `suelo_ndvi` con `a`/`b` por fecha.
- [ ] Corrección de copas: medir el desfase de la ortofoto de esa finca (ADR-0006), no heredar el de Cerro sin decirlo.
- [ ] Paisaje marcado como **deducido**; frutales sin distinguir (D1).
- [ ] Sin datos reales en el repo: `npm run puerta` (guardián `secretos`).

## Problemas conocidos
- Las rutas de `tuberia/` se arman con `os.path.join`: nunca un separador `\` escrito a mano (lo vigila el guardián `multiplataforma`; decisión 8, D4). Fuera de Windows solo está comprobado que compilan, no se han ejecutado con datos reales.
- Cerro: su intermedio embebido (`datos_cerro_embebido.json`) ya no se usa en la escena ni en el fixture (T8 fase 2); si hace falta regenerar Cerro, ningún script del repo produce ese intermedio (D5).
- Hojas 404-4181 y 406-4181 de Hituelo sin descargar → 3 teselas del borde norte incompletas.
- Una petición WMS/WCS grande al IGN se cuelga: pedir en trozos de ≈500 m.
- La ortofoto PNOA 2022 desplaza las copas hacia el este ~1,1–1,4 m.
- El JSON de parcelas de entrada trae un carácter roto en «Polígono» (`arregla()` lo repara).
