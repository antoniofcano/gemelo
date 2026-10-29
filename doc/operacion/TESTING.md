# Pruebas

Dos familias: **guardianes** (proceso, rápidos, en la puerta) y **pruebas de navegador** (medida y comportamiento, con Chrome). Lista de la puerta: [ONBOARDING](ONBOARDING.md#la-puerta).

## Qué test escribo
| Cambio | Prueba |
|---|---|
| Módulo nuevo en `apps/web/motor/` | `node pruebas/contrato_modulos.js --escribe` (cabecera Expone/Consume, la comprueba `contratos.test.js`); `sintaxis.test.js` lo comprueba solo y envuelto |
| Campo nuevo en el exportador | contrato + esquema + fixture (`contratos.test.js`) |
| Cambio gráfico | `medir` antes/después (`prueba3.js`) y, si procede, subir/bajar `pruebas/presupuesto.json` con razón |
| Cambio en VR | `vr_mock.js` + nota de comodidad **no probado en casco** |
| Documento nuevo | su línea en `doc/README.md` (`documentacion.test.js`) |

## Qué significa este rojo
| Guardián | Qué vigila | Por qué existe | Cómo se arregla |
|---|---|---|---|
| `sintaxis` | `node --check` de `apps/web/motor/*.js` | un módulo roto rompe todo el `<script>` | corregir el error que imprime |
| `higiene` | marcas de conflicto, CRLF, `C:\Users`, correos | el repo es público | quitar la ruta/correo; convertir a LF |
| `version` | versión única en `VERSION`, `package.json`, CHANGELOG, CLAUDE, README, ESTADO | las versiones divergen en silencio | subir todas juntas (skill `release`) |
| `documentacion` | enlaces relativos, índices, techos, «foto» en histórico | la doc se pudre | añadir la fila, arreglar el enlace, archivar |
| `contratos` | fixture y `apps/web/motor/` contra los esquemas (JSON Schema 2020-12 con ajv, estricto; también que los esquemas rechazan datos rotos) | el exportador y el motor se desacoplan | cambiar contrato, esquema y fixture a la vez |
| `build` | `tuberia/salida_artefacto/montar_v2.py` con el fixture, las dos fincas | un cambio rompe el montaje | ver el error de Python |
| `carga` | 0 errores de consola y topes de dibujo | regresiones de render | mirar consola; si el tope sube a propósito, explicarlo en el commit |
| `secretos` | claves, datos de explotación, ficheros pesados | datos privados en repo público | sacarlo del historial si ya se subió (consultar antes) |
| `vr` | sin WebXR no hay botón ni errores; prueba completa con el mock (opcional) | regresiones del modo VR | ver `pruebas/prueba_vr.js` y `doc/sistema/VR.md` |
| `multiplataforma` | rutas con separador `\` escrito a mano en `tuberia/**/*.py`; `os.path.join` sin `import os` | los exportadores deben funcionar en Windows, Linux y macOS (decisión 8) | armar la ruta con `os.path.join` (o `pathlib`) e importar `os` |
| `web` | la web de Vite = el motor tal cual, y dibuja lo mismo que la artefacto | el build no debe cambiar el comportamiento | mirar la diferencia por escenario; si es intencionada, va con su ADR |
| `olivos` | catálogo de olivos-tipo: esquema (ajv), glb válido (`gltf-validator`), reglas del contrato y triángulos por nivel; activación del `Catalogo` en Chrome | el constructor de olivos-tipo y el motor se desacoplan | ver `contratos/olivos-tipo.md`; si cambia la forma sintética, `node modelos/olivos/fixture/genera.js` |

## Entorno
- SwiftShader (Chrome headless) vale para **recuentos de dibujo y memoria**; **no vale para fps**. Los fps reales solo los da un dispositivo con `?debug`.
- Variables: `CHROME`, `PLAYWRIGHT_CORE`, `GEMELO_URL`, `GEMELO_RAIZ`, `VW`, `VH`, `FECHA`, `PYTHON`; `GEMELO_MIDE=1` imprime las cifras medidas por `carga.test.js` (para ajustar `pruebas/presupuesto.json`) y `GEMELO_ESPERA` (ms) alarga la espera de carga.
- Cada guardián trabaja en su propia carpeta temporal (`pruebas/salida/<nombre>-<pid>`, ignorada y borrada al salir), así que corren en paralelo sin pisarse.
- Las excepciones a un guardián (`EXCEPCIONES_*`) llevan el motivo y una decisión abierta de DECISIONS-PENDING; el guardián falla si la excepción ya no hace falta.
- Si falta Chrome o `playwright-core`, las pruebas de navegador se **saltan con aviso** (no pasan en silencio).

## Banco de pruebas: un solo Chrome o Docker a la vez (política desde el 2026-10-29)

El equipo de trabajo es un i5 de 4 núcleos con 7,7 GB: dos Chrome sin pantalla (SwiftShader dibuja con la CPU) o un Chrome y un Docker a la vez lo dejan al 100 % y todo va más lento que en fila. Por eso **lo pesado va por turno** y **lo ligero va primero**:

- **Turno** (`pruebas/banco/turno.js`, con `proper-lockfile`): en todo el equipo, sea desde la puerta, un guardián suelto o el worktree de un agente, solo hay **un** Chrome de pruebas o **un** entorno Docker de pruebas. El candado vive en la carpeta temporal del sistema (común a todos los worktrees) y caduca solo si el proceso que lo tiene muere. `npm run banco:quien` dice quién lo tiene.
- **`npm run puerta`** (`pruebas/banco/puerta.js`) coge el turno, arranca **un** Chrome con `launchServer` de Playwright y todas las pruebas se conectan a él (`GEMELO_CHROME_WS`); las e2e de Docker (`GEMELO_DOCKER=1`) caen dentro del mismo turno.
- **`lanza()`** (`_navegador.js`) usa ese Chrome compartido si lo hay; si no, pide el turno y lo suelta al cerrar. **`mide()`** tiene tope (`GEMELO_TOPE_MEDIDA`, 240 s por defecto): si se pasa, devuelve lo medido con `parcial: true` en vez de quedarse colgada; y guarda capturas si se le pide.
- **Agentes: encargan, no lanzan.** Para medir su build en navegador, un agente **no** abre un Chrome propio: deja un encargo y sigue trabajando en lo ligero.
  - `npm run banco:encarga -- --raiz <carpeta servida> --variante base= --variante gen=?olivos=gen --capturas --de <agente>` (añade `--espera` para quedarse esperando el resultado, y `--desglose` para las llamadas de dibujo de un fotograma por objeto en cada escenario: `desgloseLlamadas()` de `_navegador.js`, que separa la pasada principal de la de sombras).
  - `npm run banco:ronda` (o `-- --vigila`) abre **un** Chrome dentro del turno y hace todos los encargos seguidos. Cada uno deja `resultado.json` (y capturas) en `<banco>/resultados/<id>/`. Un encargo que falla no para la ronda.
  - Las e2e de Docker no se encargan: se piden con `GEMELO_DOCKER=1` y esperan su turno solas.
- **Orden de trabajo:** primero lo que no necesita navegador ni Docker (código, contratos, pruebas de Node); lo que pasa por Chrome o Docker, al final y por el banco. Lo visual lo mira Antonio en su Chrome (con GPU), no se espera a SwiftShader para eso.
- Los scripts sueltos de medida (`pruebas/olivo/*.mjs`, `prueba3.js`, `vistas2.js`…) deben pedir el turno (`require("./banco/turno").conTurno(...)`) o pasar por un encargo; los nuevos, siempre.

## Pruebas de navegador (`pruebas/`)
| Script | Para qué |
|---|---|
| `prueba3.js <url> <prefijo>` | carga con `?debug`, llamadas, triángulos, puntos, heap, peticiones a `/t/`, capturas |
| `prueba_arb.js <ruta> <prefijo> [escenarios]` | tiempo hasta construir los olivos N0 (sirve `GEMELO_RAIZ` sin servidor) |
| `vistas2.js <url> <prefijo> '<json>'` | capturas con cámara posicionada por UTM y hora fija |
| `prueba_vr.js <url> <prefijo> [sinxr]` | VR completo con el WebXR simulado de `mock_xr.js` (entrar, andar, girar, teletransporte, panel, ficha, vuelo, mirador, correr, salir). Con `sinxr`, comprueba que sin WebXR no hay botón ni errores. Completa: opcional en la puerta (`GEMELO_VR=1`, inestable con SwiftShader) |
| `vr_mock.js` | variante corta: andar frente a correr con el mock |
