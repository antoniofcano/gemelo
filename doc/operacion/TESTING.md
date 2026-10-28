# Pruebas

Dos familias: **guardianes** (proceso, rápidos, en la puerta) y **pruebas de navegador** (medida y comportamiento, con Chrome). Lista de la puerta: [ONBOARDING](ONBOARDING.md#la-puerta).

## Qué test escribo
| Cambio | Prueba |
|---|---|
| Módulo nuevo en `src/` | cabecera Expone/Consume (la comprueba `contratos.test.js`); `node --check` automático |
| Campo nuevo en el exportador | contrato + esquema + fixture (`contratos.test.js`) |
| Cambio gráfico | `medir` antes/después (`prueba3.js`) y, si procede, subir/bajar `pruebas/presupuesto.json` con razón |
| Cambio en VR | `vr_mock.js` + nota de comodidad **no probado en casco** |
| Documento nuevo | su línea en `doc/README.md` (`documentacion.test.js`) |

## Qué significa este rojo
| Guardián | Qué vigila | Por qué existe | Cómo se arregla |
|---|---|---|---|
| `sintaxis` | `node --check` de `src/*.js` | un módulo roto rompe todo el `<script>` | corregir el error que imprime |
| `higiene` | marcas de conflicto, CRLF, `C:\Users`, correos | el repo es público | quitar la ruta/correo; convertir a LF |
| `version` | versión única en `VERSION`, `package.json`, CHANGELOG, CLAUDE, README, ESTADO | las versiones divergen en silencio | subir todas juntas (skill `release`) |
| `documentacion` | enlaces relativos, índices, techos, «foto» en histórico | la doc se pudre | añadir la fila, arreglar el enlace, archivar |
| `contratos` | fixture y `src/` contra los esquemas | el exportador y el motor se desacoplan | cambiar contrato, esquema y fixture a la vez |
| `build` | `montar_v2.py` con el fixture, las dos fincas | un cambio rompe el montaje | ver el error de Python |
| `carga` | 0 errores de consola y topes de dibujo | regresiones de render | mirar consola; si el tope sube a propósito, explicarlo en el commit |
| `secretos` | claves, datos de explotación, ficheros pesados | datos privados en repo público | sacarlo del historial si ya se subió (consultar antes) |

## Entorno
- SwiftShader (Chrome headless) vale para **recuentos de dibujo y memoria**; **no vale para fps**. Los fps reales solo los da un dispositivo con `?debug`.
- Variables: `CHROME`, `PLAYWRIGHT_CORE`, `GEMELO_URL`, `GEMELO_RAIZ`, `VW`, `VH`, `FECHA`.
- Si falta Chrome o `playwright-core`, las pruebas de navegador se **saltan con aviso** (no pasan en silencio).

## Pruebas de navegador (`pruebas/`)
| Script | Para qué |
|---|---|
| `prueba3.js <url> <prefijo>` | carga con `?debug`, llamadas, triángulos, puntos, heap, peticiones a `/t/`, capturas |
| `prueba_arb.js <ruta> <prefijo> [escenarios]` | tiempo hasta construir los olivos N0 (sirve `GEMELO_RAIZ` sin servidor) |
| `vistas2.js <url> <prefijo> '<json>'` | capturas con cámara posicionada por UTM y hora fija |
| `vr_mock.js` | VR con sesión WebXR simulada (`mock_xr.js`) |
