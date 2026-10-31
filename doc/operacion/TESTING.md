# Pruebas

Dos familias: **guardianes** (proceso, rápidos, en la puerta) y **pruebas de navegador** (medida y comportamiento, con Chrome). Lista de la puerta: [ONBOARDING](ONBOARDING.md#la-puerta).

## Estrategia de pruebas (desde el 2026-10-30)

El cuello de botella es el **banco** (un solo Chrome con SwiftShader o un Docker en un i5): cada minuto de navegador que se ahorra se gana en cada puerta y en cada agente. La estrategia ataca eso sin perder lo que vigilamos. Las tareas que la construyen están en el [tablero](../rumbo/PLAN.md) (PB2, PB4-PB9).

1. **Pirámide: lo más abajo posible.** Primero lógica pura en Node (funciones `XPuro`, milisegundos); el navegador solo confirma el montaje, el dibujo y los recorridos de pantalla; Docker solo lo que necesita la base, LiveKit o el Caddy reales. Una prueba de navegador que comprueba lógica se baja a Node (PB2, PB8).
2. **Propiedades además de ejemplos.** Para reglas que siempre se cumplen (contratos, validaciones, geometría, calendarios, aforo) se generan miles de casos con `fast-check` en vez de diez a mano (PB7). Ya lo hacíamos a mano en épocas y oficina.
3. **Dos puertas** (Antonio, 2026-10-30): `npm run puerta:rapida` (solo Node, sin Chrome ni Docker, minutos) tras cada fusión; `npm run puerta:pesada` (completa, con Chrome y Docker) una vez por tanda de desarrollos, y es **la única que autoriza a subir `main`**. **Solo lo afectado mientras se trabaja; todo antes de subir.** Un selector decide qué pruebas tocan los ficheros cambiados: **`npm run puerta:afectadas`** (PB4; `-- --desde <ref>` en vez de `main`, `-- --solo-node` como la rápida, `-- --lista` solo imprime la elección). Con `GEMELO_SOLO_NODE=1` (la rápida y `-- --solo-node`) la puerta no pide el turno del banco ni lanza Chrome: ejecuta las pruebas de Node directamente; los agentes y las tandas intermedias pasan solo eso; la **puerta completa** sigue siendo obligatoria antes de subir `main`. Cómo decide, en orden: (1) las cabeceras Expone/Consume del motor: un módulo cambiado arrastra a sus consumidores, transitivo; (2) las rutas y los `require`/`import` que cada guardián nombra en su código (sin contar comentarios; `apps/web` a secas es demasiado ancho para decidir); (3) reglas gruesas y un mapa corto en `pruebas/banco/afectadas.json` (`contratos/` → contratos y api; `apps/api/` → api; `doc/` → documentacion; `package*.json` → todo). Un fichero que nada reconoce elige **todo** (más vale de más), y los baratos (sintaxis, higiene, secretos, documentacion, contratos) entran siempre. Imprime qué pruebas eligió y por qué, y **no autoriza a subir**. Las pruebas de navegador entran por el `join(WEB, "motor")` de `_pagina.js` (construyen el motor): por eso un cambio en el motor elige a muchas, por prudencia. Guardián: `afectadas.test.js` (listas de cambiados simuladas, sin git).
4. **Pruebas inestables, a la vista.** Un registro de qué prueba ha fallado a veces y por qué (arranque de PostGIS, antivirus, página caída por memoria); un reintento único y marcado para las conocidas, nunca silencioso; una prueba inestable se arregla o se aparta con su tarea, no se tapa (PB6).
5. **«Se ve igual», con referencia aprobada.** Para lo visual (olivos, avatares, luz, UI) se comparan capturas con una imagen de referencia que aprueba Antonio (Playwright `toHaveScreenshot`, con tolerancia); un cambio visual querido actualiza la referencia en el mismo commit (PB5).
6. **Recuentos, no fps, en el banco; fps solo en aparatos.** SwiftShader mide triángulos, llamadas y memoria contra `pruebas/presupuesto.json`. La fluidez real sale del medidor del gemelo (`&mide=60`) en el Quest y el móvil, guardada para compararla en el tiempo (PB9); hasta entonces, «no probado».
7. **La máquina de pruebas, fuera de este equipo.** En cuanto haya CI (G1), la puerta corre en GitHub en paralelo y con caché en cada subida; este equipo queda para los agentes y la VR.
8. **Cada prueba dice qué vigila y qué no.** Los saltos se anuncian con su motivo («NO se ha comprobado…»), y lo no probado en aparatos se dice no probado.

## Qué test escribo
| Cambio | Prueba |
|---|---|
| Módulo nuevo en `apps/web/motor/` | `node pruebas/contrato_modulos.js --escribe` (cabecera Expone/Consume, la comprueba `contratos.test.js`); `sintaxis.test.js` lo comprueba solo y envuelto |
| Campo nuevo en el exportador | contrato + esquema + fixture (`contratos.test.js`) |
| Cambio gráfico | `medir` antes/después (`prueba3.js`) y, si procede, subir/bajar `pruebas/presupuesto.json` con razón |
| Cambio en VR | `vr_mock.js` + nota de comodidad **no probado en casco** |
| Documento nuevo | su línea en `doc/README.md` (`documentacion.test.js`) |
| Una regla que debe cumplirse **siempre** (aforo, cobertura de un calendario, «lo que la api produce cumple el esquema», geometría, idempotencia, simetría) | una **propiedad** con `fast-check` (4.10.2, devDependency de la raíz y de `apps/api`), además de 2-3 ejemplos con nombre. Modelo: `apps/api/pruebas/unidad/propiedades.test.ts`. Reglas: semilla fija (`seed`) y `numRuns` acotado (la suite entera, unos segundos); generadores simples (`fc.record`, `fc.uniqueArray`…), nunca un generador de esquemas casero (regla 12); y comparar contra un modelo de referencia o una regla distinta de la del código, no repetir el código. Si falla, fast-check da el **contraejemplo mínimo** y la semilla: se decide si falla el código o la propiedad antes de tocar nada; un fallo real del código sin decidir queda como `test(..., { todo })` con el contraejemplo, nunca se apaga. Para ejemplos concretos (un mensaje, un caso del contrato) sigue valiendo el test de ejemplos |

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
- **`npm run puerta`** (`pruebas/banco/puerta.js`) coge el turno, arranca **un** Chrome con `launchServer` de Playwright y todas las pruebas se conectan a él (`GEMELO_CHROME_WS`); las e2e de Docker (`GEMELO_DOCKER=1`) caen dentro del mismo turno. Con `GEMELO_SOLO_NODE=1` no pide el turno ni lanza Chrome (guardián: `banco.test.js`).
- **`lanza()`** (`_navegador.js`) usa ese Chrome compartido si lo hay; si no, pide el turno y lo suelta al cerrar. **`mide()`** tiene tope (`GEMELO_TOPE_MEDIDA`, 240 s por defecto): si se pasa, devuelve lo medido con `parcial: true` en vez de quedarse colgada; y guarda capturas si se le pide.
- **Agentes: encargan, no lanzan.** Para medir su build en navegador, un agente **no** abre un Chrome propio: deja un encargo y sigue trabajando en lo ligero.
  - `npm run banco:encarga -- --raiz <carpeta servida> --variante base= --variante gen=?olivos=gen --capturas --de <agente>` (añade `--espera` para quedarse esperando el resultado, y `--desglose` para las llamadas de dibujo de un fotograma por objeto en cada escenario: `desgloseLlamadas()` de `_navegador.js`, que separa la pasada principal de la de sombras).
  - `npm run banco:ronda` (o `-- --vigila`) abre **un** Chrome dentro del turno y hace todos los encargos seguidos. Cada uno deja `resultado.json` (y capturas) en `<banco>/resultados/<id>/`. Un encargo que falla no para la ronda.
    - **Escenarios del paseo** (opcionales; no están en los de siempre, así que sus recuentos no cambian; se piden con `--escenarios`): `paseo` (entra en el paseo en un punto fijo del fixture, junto a los olivos del escenario `cerca`, y espera a la Cola y a los generados como `mide()`), `paseoAnda` (además mantiene avance 6 s con la tecla simulada y mide al final) y `paseoGira` (vuelta completa en el sitio, hasta 60 s). La medida añade `paseo: {x, y, ang}` (dónde acabó) y la captura incluye el minimapa. Se manejan con `window.__g.paseoEn/paseoSale/paseoTecla/paseoEstado` (`27_debug.js`). Ej.: `npm run banco:encarga -- --raiz <carpeta> --escenarios paseo,paseoAnda --capturas --de <agente>`. SwiftShader vale para recuentos y memoria; la distancia andada depende de la cadencia (dt), no es una medida de fps. Guardián: `banco.test.js`.
- **Solo lo afectado (PB4).** `npm run puerta:afectadas` (`pruebas/banco/afectadas.js`, datos en `afectadas.json`) saca de `git diff` frente a `main` (más los ficheros nuevos sin seguir) las pruebas que tocan y las pasa por `puerta.js`, así que lleva el mismo turno, el mismo Chrome único y el mismo reporte de inestables que la puerta. Ver el punto 3 de la estrategia; no sube nada ni sustituye a `puerta:pesada`.
- **Pruebas inestables a la vista (PB6).** La puerta (y cualquier prueba suelta lanzada con `npm run puerta -- <fichero>`) recoge los fallos con un reporter de `node:test` (`pruebas/banco/reporter_fallos.js`) y los pasa por `pruebas/banco/inestables.js`:
  - **Registro**: cada fallo se apunta en `pruebas/salida/inestables.json` (no versionado): prueba, fecha, motivo resumido y si al repetir pasó (`pasó`, `falló`, `no se reintenta`).
  - **Reintento único y marcado**: solo si **todos** los fallos de un fichero casan con una firma de `pruebas/banco/inestables.json` (patrón, motivo, tarea; hoy: arranque de PostGIS de testcontainers, EPERM del antivirus, «Page crashed» por memoria) se repite ese fichero **una vez**. Si pasa, cuenta como pasado pero el resumen lo dice: «pasó al segundo intento: <motivo>». Un fallo sin firma (o un fichero con alguno sin firma) no se reintenta nunca.
  - **Informe** al final de la puerta: cuántas pasaron al reintento, cuáles, y desde cuándo fallan a veces (del registro), más los fallos que siguen en rojo.
  - **Regla**: una firma nueva entra con su motivo y la tarea que la arreglará; es para infraestructura (red, memoria, antivirus, arranque), nunca para tapar una aserción que falla. Cuando la tarea arregla la causa, se quita la firma. Guardián: `inestables.test.js` (ejecutor falso, sin Chrome).
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
11. **Un agente pesado a la vez, acompañado de ligeros** (Antonio, 2026-10-30, sustituye a «dos pesados»): solo un agente en su fase pesada (Chrome, Docker o Blender); mientras mide, el siguiente pesado puede ir escribiendo su código sin tocar el banco. Los huecos se llenan con ligeros según la memoria libre: dos o tres con más de ~1,5 GB, uno con menos. Motivo: el banco solo deja un Chrome, así que un segundo pesado solo espera en fila ocupando memoria; los ligeros, en cambio, avanzan.
12. **Primero lo que abarata el cuello de botella** (Antonio, 2026-10-30): una tarea que reduce el tiempo del banco (p. ej. PB2) va por delante de las demás pesadas, porque lo que ahorra se gana en cada puerta y en cada agente siguiente.

## Pruebas de navegador (`pruebas/`)

**Ventana de las pruebas (PB1, 2026-10-30):** las de presupuesto (carga, escena3d, olivo) usan `VENTANA` (900×650) y todos sus escenarios, para seguir comparándose con las cifras de siempre; las demás pueden usar `VENTANA_CHICA` (450×325) o su propio viewport, con DPR 1 si sus comprobaciones son de CSS. Cada prueba tiene un coste fijo (carga y esperas) y solo baja con la ventana si domina el pintado: **medir antes de bajarla**. Para comparar antes y después, calentar primero la caché de páginas de Vite (`pruebas/salida/paginas`). **PB2:** en SwiftShader el coste es por fotograma, no por cargar la página (unos 3,5 s); las pruebas de maquetación y arrastre (movibles_chrome, la clasificación de juego_cosecha) anulan `renderer.render` tras montar la escena. `ventanaDe()` y `GEMELO_VENTANA=grande|chica` permiten contrastar recuentos con las dos ventanas.
| Script | Para qué |
|---|---|
| `prueba3.js <url> <prefijo>` | carga con `?debug`, llamadas, triángulos, puntos, heap, peticiones a `/t/`, capturas |
| `prueba_arb.js <ruta> <prefijo> [escenarios]` | tiempo hasta construir los olivos N0 (sirve `GEMELO_RAIZ` sin servidor) |
| `vistas2.js <url> <prefijo> '<json>'` | capturas con cámara posicionada por UTM y hora fija |
| `prueba_vr.js <url> <prefijo> [sinxr]` | VR completo con el WebXR simulado de `mock_xr.js` (entrar, andar, girar, teletransporte, panel, ficha, vuelo, mirador, correr, salir). Con `sinxr`, comprueba que sin WebXR no hay botón ni errores. Completa: opcional en la puerta (`GEMELO_VR=1`, inestable con SwiftShader) |
| `vr_mock.js` | variante corta: andar frente a correr con el mock |
| `escena3d_recorrido.js <carpeta servida> [--pasos 60] [--salida <json>]` | criterios 3 y 4 del ADR-0015 con cualquier finca y su `tileset/` al lado (p. ej. Hituelo real): vuelos de punta a punta sin esperar a la carga contando rayos sin relieve (`Escena3D.sondea()`) y relieve dibujado frente a `Mundo.suelo` por lado de tesela. Pide el turno del banco |
