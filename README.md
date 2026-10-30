# Gemelo

Gemelo digital en 3D de fincas de olivar, para el navegador (three.js 0.186.1): terreno, copas y troncos de cada olivo medidos con LiDAR,
suelo con ortofoto y NDVI, tiempo, vida, sonido, paseo en primera persona, vuelo, minimapa y modo VR (WebXR, Meta Quest).
Nace como mockup de [OlivarTrack](https://github.com/antoniofcano/olivartrack) para Cano & Damas Oleicultores.

Dos fincas montadas con el mismo motor: **Cerro Velasco** (5 parcelas, 7,1 ha) y **Hituelo** (4 fincas, 27 parcelas, 95 ha, ~5.900 olivos).

> Estado: prototipo. Funciona en Chrome (probado con renderizado por software) y sin errores de consola, pero el rendimiento
> en iPhone y Quest **no está medido**. Mira [doc/ESTADO.md](doc/ESTADO.md) y [doc/sistema/MEDIDAS.md](doc/sistema/MEDIDAS.md). **Versión: v0.2.0.** Método de trabajo: [CLAUDE.md](CLAUDE.md); índice: [doc/README.md](doc/README.md).

## Qué hay aquí

| Carpeta / fichero | Qué es |
|---|---|
| `apps/web/motor/*.js` | El motor, en módulos que se concatenan **por orden alfabético** (lo fija `apps/web/herramientas/genera_motor.mjs`) y Vite empaqueta: mundo y teselas (`02`), cola de trabajos (`02b`), escena 3D Tiles (`04b`-`04d`), nube LiDAR (`05`), olivos con 3 niveles (`06`, `07`, `07b`), cámara, sol, paseo, historia, tiempo, vida, minimapa, paisaje, balizas, sonido, suelo, huellas, estación, perros, depuración (`?debug`) y **VR** (`29_vr.js`) |
| `apps/web/plantilla.html` | HTML y CSS de la página |
| `apps/web/herramientas/`, `apps/web/vite.config.js` | Generan el motor y construyen la página con Vite |
| `tuberia/tiles3d/` | Genera el tileset 3D Tiles de cada finca a partir del contrato v2 |
| `tuberia/finca_8_teselas.py`, `tuberia/hituelo_conv.py` | Exportador: de los intermedios (LiDAR, ortofoto, NDVI, suelo) a teselas de 256 m |
| `tuberia/datos/` | Scripts que producen esos intermedios (LiDAR del IGN, ortofoto PNOA, Sentinel-2, SoilGrids) para Cerro Velasco y Hituelo |
| `pruebas/` | Pruebas con Chrome headless (Playwright): carga y presupuesto de dibujo, vistas, VR con una sesión WebXR simulada |
| `doc/` | Toda la documentación ([índice](doc/README.md)): estado, decisiones ([ADR](doc/adr/README.md)), arquitectura, contratos, operación. El diseño original por teselas es una foto en [doc/historico/](doc/historico/DISENO-2026-10.md) |
| `contratos/` | Esquemas y ejemplos de los contratos de datos exportador→motor |

**Los datos no están en el repositorio** (teselas, nubes de puntos, ortofoto, marcas de olivos y datos de la explotación): pesan cientos de MB,
algunos son de uso interno y las fuentes del IGN hay que descargarlas. El motor es público; para reproducir una finca hay que generar sus datos
con `tuberia/datos/` (ver abajo).

## Arquitectura en una frase

Los datos se parten en teselas de 256 m alineadas a múltiplos de 256 en UTM30 (físicas y consultas de `Mundo`); la escena se sirve como tileset 3D Tiles 1.1 ([ADR-0015](doc/adr/0015-escena-en-3d-tiles.md)) y el coste
por fotograma depende del error en pantalla y de la distancia a la cámara (terreno por niveles del tileset, olivos por niveles, nube submuestreada). Detalle en [doc/sistema/ARCHITECTURE.md](doc/sistema/ARCHITECTURE.md) y en los [ADR](doc/adr/README.md).

## Construir

```bash
# Exportar una finca (necesita los intermedios de datos/<finca>) y generar su tileset
python tuberia/finca_8_teselas.py --finca hituelo
node tuberia/tiles3d/genera.mjs --salida <carpeta del tileset>

# Cliente web (Vite; el producto): página empaquetada en apps/web/dist/
cd apps/web && npm i && GEMELO_DATOS=<ruta a indice.json> npm run build && cd ../..
```

El gemelo se sirve solo desde el servidor: el entorno local (`npm run dev:arriba`, [DESARROLLO-LOCAL](doc/operacion/DESARROLLO-LOCAL.md)) o, más adelante, el VPS. La salida artefacto de claude.ai se retiró ([ADR-0021](doc/adr/0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md)).

Los scripts de `tuberia/datos/` leen sus rutas de variables de entorno (`GEMELO_DATOS`, `GEMELO_DESCARGAS`, `GEMELO_LIDAR`, `GEMELO_IMAGEN`,
`GEMELO_HITUELO`, `GEMELO_PARCELAS`, `GEMELO_MDS`, `GEMELO_SUELO`); los valores por defecto son carpetas relativas. Requieren Python con
`numpy`, `scipy`, `laspy`, `rasterio`, `pillow` y `matplotlib`.

## Probar

```bash
npm i && npm run puerta                    # la puerta: guardianes con un fixture sintético (≈2-3 min con Chrome)
npm i playwright-core                      # y Chrome instalado (variable CHROME si no está en la ruta por defecto)
# con la web servida (npm run dev:arriba) o una página de pruebas/salida/paginas/
node pruebas/prueba3.js <url de la página> salida/h     # carga, presupuesto, capturas
GEMELO_URL=<url de la página> node pruebas/vr_mock.js   # VR con sesión simulada
```

Añade `?debug` a la URL para ver fps, milisegundos de JS por fotograma, llamadas de dibujo, triángulos, teselas y olivos por nivel.

## Modo VR (Meta Quest)

El botón «Entrar en VR» solo aparece si `navigator.xr` soporta `immersive-vr`. Controles: palanca izquierda andar, derecha giro por saltos de 30°,
gatillo derecho teletransporte, **A** vuelo, **B** mirador, **Y** panel flotante, grip correr. Probado únicamente con un mock de WebXR: los fps,
el mareo y la comodidad del panel **no se han probado en un casco real**.

## Qué es medido y qué es deducido

La copa de cada olivo es medida del LiDAR de 2024; su tronco y sus ramas son una forma ilustrativa. El tendido eléctrico, los postes, los cauces y la
clasificación de los árboles que no son olivo se **deducen** de la geometría. La ortofoto PNOA muestra las copas ~1,4 m al este de su posición real y el
motor lo corrige. Las lecturas en vivo de OlivarTrack y Vigía por MCP no se han verificado.

## Fuentes y atribución

- LiDAR PNOA 3.ª cobertura, MDT 0,5 m, MDS, ortofoto PNOA: © Instituto Geográfico Nacional de España (CC BY 4.0).
- Sentinel-2: Copernicus (Planetary Computer). SoilGrids: ISRIC, CC BY 4.0.
- three.js (MIT).

## Licencia

Todos los derechos reservados (decisión de Antonio, 2026-10-28): el repositorio es público para leerlo, pero el código no tiene licencia libre.
