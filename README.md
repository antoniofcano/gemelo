# Gemelo

Gemelo digital en 3D de fincas de olivar, para el navegador (three.js r128): terreno, copas y troncos de cada olivo medidos con LiDAR,
suelo con ortofoto y NDVI, tiempo, vida, sonido, paseo en primera persona, vuelo, minimapa y modo VR (WebXR, Meta Quest).
Nace como mockup de [OlivarTrack](https://github.com/antoniofcano/olivartrack) para Cano & Damas Oleicultores.

Dos fincas montadas con el mismo motor: **Cerro Velasco** (5 parcelas, 7,1 ha) y **Hituelo** (4 fincas, 27 parcelas, 95 ha, ~5.900 olivos).

> Estado: prototipo. Funciona en Chrome (probado con renderizado por software) y sin errores de consola, pero el rendimiento
> en iPhone y Quest **no está medido**. Mira [doc/ESTADO.md](doc/ESTADO.md) y [doc/sistema/MEDIDAS.md](doc/sistema/MEDIDAS.md). **Versión: v0.2.0.** Método de trabajo: [CLAUDE.md](CLAUDE.md); índice: [doc/README.md](doc/README.md).

## Qué hay aquí

| Carpeta / fichero | Qué es |
|---|---|
| `apps/web/motor/*.js` | El motor, en módulos que se concatenan **por orden alfabético** dentro de un solo `<script>`: mundo y teselas (`02`), cola de trabajos (`02b`), terreno con 3 niveles (`04`), nube LiDAR (`05`), olivos con 3 niveles (`06`, `07`, `07b`), cámara, sol, paseo, historia, tiempo, vida, minimapa, paisaje, balizas, sonido, suelo, huellas, estación, perros, depuración (`?debug`) y **VR** (`29_vr.js`) |
| `apps/web/plantilla.html` | HTML y CSS de la página |
| `tuberia/salida_artefacto/montar_v2.py` | Monta la página: cabecera + datos + three.js + `apps/web/motor/` |
| `tuberia/finca_8_teselas.py`, `tuberia/hituelo_conv.py` | Exportador: de los intermedios (LiDAR, ortofoto, NDVI, suelo) a teselas de 256 m |
| `tuberia/datos/` | Scripts que producen esos intermedios (LiDAR del IGN, ortofoto PNOA, Sentinel-2, SoilGrids) para Cerro Velasco y Hituelo |
| `pruebas/` | Pruebas con Chrome headless (Playwright): carga y presupuesto de dibujo, vistas, VR con una sesión WebXR simulada |
| `doc/` | Toda la documentación ([índice](doc/README.md)): estado, decisiones ([ADR](doc/adr/README.md)), arquitectura, contratos, operación. El diseño original por teselas es una foto en [doc/historico/](doc/historico/DISENO-2026-10.md) |
| `contratos/` | Esquemas y ejemplos de los contratos de datos exportador→motor |

**Los datos no están en el repositorio** (teselas, nubes de puntos, ortofoto, marcas de olivos y datos de la explotación): pesan cientos de MB,
algunos son de uso interno y las fuentes del IGN hay que descargarlas. El motor es público; para reproducir una finca hay que generar sus datos
con `tuberia/datos/` (ver abajo).

## Arquitectura en una frase

El mundo se parte en teselas de 256 m alineadas a múltiplos de 256 en UTM30; cada tesela lleva suelo a 1 m, ortofoto, nube y árboles, y el coste
por fotograma depende de la distancia a la cámara (terreno a 1/2/8 m, olivos en 3 niveles, nube submuestreada). Detalle en [doc/sistema/ARCHITECTURE.md](doc/sistema/ARCHITECTURE.md) y en los [ADR](doc/adr/README.md).

## Construir

```bash
# Cliente web (Vite; el producto): página empaquetada en apps/web/dist/
cd apps/web && npm i && GEMELO_DATOS=<ruta a indice.json o embebido.json> npm run build && cd ../..

# Salida artefacto (sin servidor):
# Cerro Velasco, un solo HTML con todo embebido (≤ 16 MB)
python tuberia/salida_artefacto/montar_v2.py --finca cerro --salida gemelo_cerro.html   # sin --salida: gemelo_cerro_v2.html

# Hituelo: página ligera + ficheros de apoyo (t/<x>_<y>.json|jpg)
python tuberia/finca_8_teselas.py --finca hituelo       # necesita los intermedios de datos/hituelo
python tuberia/salida_artefacto/montar_v2.py --finca hituelo --modo ficheros
```

Los scripts de `tuberia/datos/` leen sus rutas de variables de entorno (`GEMELO_DATOS`, `GEMELO_DESCARGAS`, `GEMELO_LIDAR`, `GEMELO_IMAGEN`,
`GEMELO_HITUELO`, `GEMELO_PARCELAS`, `GEMELO_MDS`, `GEMELO_SUELO`); los valores por defecto son carpetas relativas. Requieren Python con
`numpy`, `scipy`, `laspy`, `rasterio`, `pillow` y `matplotlib`.

## Probar

```bash
npm i && npm run puerta                    # la puerta: guardianes con un fixture sintético (≈2-3 min con Chrome)
npm i playwright-core                      # y Chrome instalado (variable CHROME si no está en la ruta por defecto)
python -m http.server 8000
node pruebas/prueba3.js http://localhost:8000/hituelo/index.html salida/h     # carga, presupuesto, capturas
GEMELO_URL=http://localhost:8000/gemelo_cerro.html node pruebas/vr_mock.js     # VR con sesión simulada
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
