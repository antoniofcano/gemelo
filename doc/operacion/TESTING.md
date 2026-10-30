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
| `sintaxis` | `node --check` de `apps/web/motor/*.js` | un módulo roto rompe todo el motor | corregir el error que imprime |
| `higiene` | marcas de conflicto, CRLF, `C:\Users`, correos | el repo es público | quitar la ruta/correo; convertir a LF |
| `version` | versión única en `VERSION`, `package.json`, CHANGELOG, CLAUDE, README, ESTADO | las versiones divergen en silencio | subir todas juntas (skill `release`) |
| `documentacion` | enlaces relativos, índices, techos, «foto» en histórico | la doc se pudre | añadir la fila, arreglar el enlace, archivar |
| `contratos` | fixture y `apps/web/motor/` contra los esquemas (JSON Schema 2020-12 con ajv, estricto; también que los esquemas rechazan datos rotos) | el exportador y el motor se desacoplan | cambiar contrato, esquema y fixture a la vez |
| `build` | la web de Vite construida con el fixture, las dos fincas con tileset y sin él, y la caché de páginas | un cambio rompe el build | ver el error de Vite |
| `carga` | 0 errores de consola y topes de dibujo | regresiones de render | mirar consola; si el tope sube a propósito, explicarlo en el commit |
| `secretos` | claves, datos de explotación, ficheros pesados | datos privados en repo público | sacarlo del historial si ya se subió (consultar antes) |
| `vr` | sin WebXR no hay botón ni errores; prueba completa con el mock (opcional) | regresiones del modo VR | ver `pruebas/prueba_vr.js` y `doc/sistema/VR.md` |
| `multiplataforma` | rutas con separador `\` escrito a mano en `tuberia/**/*.py`; `os.path.join` sin `import os` | los exportadores deben funcionar en Windows, Linux y macOS (decisión 8) | armar la ruta con `os.path.join` (o `pathlib`) e importar `os` |
| `web` | la web de Vite = el motor tal cual ; carga sin errores, con la three de `apps/web`, y solo pide a su mismo origen | el build no debe cambiar el comportamiento | mirar la diferencia por escenario; si es intencionada, va con su ADR |
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
    - **Escenarios del paseo** (opcionales; no están en los de siempre, así que sus recuentos no cambian; se piden con `--escenarios`): `paseo` (entra en el paseo en un punto fijo del fixture, junto a los olivos del escenario `cerca`, y espera a la Cola y a los generados como `mide()`), `paseoAnda` (además mantiene avance 6 s con la tecla simulada y mide al final) y `paseoGira` (vuelta completa en el sitio, hasta 60 s). La medida añade `paseo: {x, y, ang}` (dónde acabó) y la captura incluye el minimapa. Se manejan con `window.__g.paseoEn/paseoSale/paseoTecla/paseoEstado` (`27_debug.js`). Ej.: `npm run banco:encarga -- --raiz <carpeta> --escenarios paseo,paseoAnda --capturas --de <agente>`. SwiftShader vale para recuentos y memoria; la distancia andada depende de la cadencia (dt), no es una medida de fps. Guardián: `banco.test.js`.
- Las e2e de Docker no se encargan: se piden con `GEMELO_DOCKER=1` y esperan su turno solas.
- **Orden de trabajo:** primero lo que no necesita navegador ni Docker (código, contratos, pruebas de Node); lo que pasa por Chrome o Docker, al final y por el banco. Lo visual lo mira Antonio en su Chrome (con GPU), no se espera a SwiftShader para eso.
- **Procesos pesados que no son Chrome** (Blender en segundo plano para los avatares, AV3): `node pruebas/banco/proceso.js --que "<para qué>" [--memoria-gb 1.5] -- <orden> …` espera a que haya esa memoria libre, pide el turno, lanza la orden y lo suelta al acabar (guardián: `avatares_creador.test.js`).
- Los scripts sueltos de medida (`pruebas/olivo/*.mjs`, `prueba3.js`, `vistas2.js`…) deben pedir el turno (`require("./banco/turno").conTurno(...)`) o pasar por un encargo; los nuevos, siempre.

## La cola de agentes

Requisito de Antonio (2026-10-30): la cola **nunca se queda parada** y **nunca deja el equipo frito**. Quien coordina (persona o agente) la lleva así:

1. **Tareas atómicas.** Cada tarea hace una cosa, con su comprobación, en su copia de trabajo y con sus ficheros en exclusiva; si dos tocan lo mismo, se reparte por ficheros o se ponen en fila. Un pacto escrito fija los nombres que se comparten.
2. **Orden: prioridad, dependencias y coste.** Primero lo que desbloquea a otras tareas o al VPS; una tarea no arranca antes que aquello de lo que depende.
3. **Mirar la máquina antes de lanzar** (`Get-CimInstance Win32_Processor` y `Win32_OperatingSystem` en PowerShell). Con poca memoria libre (< ~1,5 GB) no se lanza nada pesado y se mira qué ocupa: el entorno Docker (`npm run dev:abajo` / `dev:arriba`, sin borrar datos) se puede parar si nadie lo está usando.
4. **Pesado frente a ligero.** Pesado: Chrome sin pantalla, Docker, Blender, builds grandes; pasa **siempre** por el turno del banco y no se solapa. Ligero: leer, escribir, contratos, pruebas de Node; llena la cola mientras lo pesado espera su turno.
5. **La cola siempre ocupada.** Al terminar un agente, se lanza el siguiente en la misma respuesta si hay recursos; no se espera a que acabe la puerta ni una fusión.
6. **Fusión y pruebas pesadas, agrupadas.** Se juntan las ramas a medida que llegan (con las pruebas de Node), pero la puerta completa y las pruebas de Chrome/Docker van agrupadas, al final de una tanda o tras un cambio importante; `main` se sube a GitHub **solo** con la puerta completa en verde.
7. **Copias de trabajo limpias.** Ninguna tarea crea uniones (junctions) hacia la copia principal; antes de borrar una copia se buscan y se quitan sin seguirlas (`[System.IO.Directory]::Delete(ruta, $false)`), y después se comprueba que `node_modules` y `pruebas/salida/fixture` de la copia principal siguen llenos.
8. **Instalar** solo de fuente oficial y versión estable, con versión fijada (regla 12).
9. **Cada agente, con el modelo de IA más adecuado** (Antonio, 2026-10-30), elegido **antes de lanzarlo** por rendimiento y coste, y dicho en el encargo:
   - **opus**: diseño y arquitectura, código delicado (sombreadores, presupuesto de dibujo, seguridad, migraciones con datos, contratos nuevos), depuración difícil, propuestas con decisiones para Antonio.
   - **sonnet**: tareas mecánicas o bien acotadas (documentación, pantallas sobre un diseño ya hecho, infra con receta, adaptar pruebas, componentes sobre un patrón que ya existe).
   - **haiku**: recuentos, búsquedas y comprobaciones sencillas sin escribir código de producto.
   - **fable**: permitido por Antonio (2026-10-30) cuando haga falta, para lo que opus no resuelve bien o lo excepcionalmente difícil; se dice en el encargo por qué se elige.
   - En la duda, el modelo más barato que pueda hacerlo bien; si un agente de sonnet se atasca o la tarea resulta más delicada de lo previsto, se relanza con opus. El tablero de PLAN lleva el modelo de cada tarea («Enrutador de modelo»).
10. **Cada agente pasa solo sus pruebas** (Antonio, 2026-10-30): las de Node que quiera y, de navegador, **solo las que tocan su cambio** (las nuevas y las que comprueban lo que modificó), una a una por el banco. Ni la puerta completa ni tandas grandes de Chrome: la puerta entera la pasa **solo quien coordina**, una vez por tanda, antes de subir `main`. El encargo dice qué pruebas de navegador le tocan. Motivo: una tanda grande tiene el banco 10–30 min y los demás esperan; una prueba suelta, unos minutos.
11. **Como mucho dos agentes pesados a la vez** (Antonio, 2026-10-30): en una misma tanda no corren más de dos agentes que necesiten Chrome, Docker o Blender; el resto de huecos se llenan con tareas ligeras. Motivo: el banco solo deja un Chrome, así que un tercero solo espera en fila ocupando memoria.

## Pruebas de navegador (`pruebas/`)

**Ventana de las pruebas (PB1, 2026-10-30):** las de presupuesto (carga, escena3d, olivo) usan `VENTANA` (900×650) y todos sus escenarios, para seguir comparándose con las cifras de siempre; las demás pueden usar `VENTANA_CHICA` (450×325) o su propio viewport, con DPR 1 si sus comprobaciones son de CSS. Cada prueba tiene un coste fijo (carga y esperas) y solo baja con la ventana si domina el pintado: **medir antes de bajarla**. Para comparar antes y después, calentar primero la caché de páginas de Vite (`pruebas/salida/paginas`).
| Script | Para qué |
|---|---|
| `prueba3.js <url> <prefijo>` | carga con `?debug`, llamadas, triángulos, puntos, heap, peticiones a `/t/`, capturas |
| `prueba_arb.js <ruta> <prefijo> [escenarios]` | tiempo hasta construir los olivos N0 (sirve `GEMELO_RAIZ` sin servidor) |
| `vistas2.js <url> <prefijo> '<json>'` | capturas con cámara posicionada por UTM y hora fija |
| `prueba_vr.js <url> <prefijo> [sinxr]` | VR completo con el WebXR simulado de `mock_xr.js` (entrar, andar, girar, teletransporte, panel, ficha, vuelo, mirador, correr, salir). Con `sinxr`, comprueba que sin WebXR no hay botón ni errores. Completa: opcional en la puerta (`GEMELO_VR=1`, inestable con SwiftShader) |
| `vr_mock.js` | variante corta: andar frente a correr con el mock |
| `escena3d_recorrido.js <carpeta servida> [--pasos 60] [--salida <json>]` | criterios 3 y 4 del ADR-0015 con cualquier finca y su `tileset/` al lado (p. ej. Hituelo real): vuelos de punta a punta sin esperar a la carga contando rayos sin relieve (`Escena3D.sondea()`) y relieve dibujado frente a `Mundo.suelo` por lado de tesela. Pide el turno del banco |
