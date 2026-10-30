# Componentes del mundo: diagnóstico y diseño

Diseño aceptado ([ADR-0023](../adr/0023-componentes-del-mundo.md), **Aceptado**; decisiones 117-124); **C1-C3 hechos** (lo construido y en qué se apartó del diseño: [§6](#6-lo-hecho-c1-c3)). Responde a la petición de Antonio del 2026-10-30: que el mundo pueda crecer «como si fueran plugins y/o componentes nuevos que pones y quitas», sin romper lo que hay, camino de un **Agro-Verse**. Aquí va el diagnóstico de hoy medido sobre el código, el diseño del contrato de un componente y lo que falta para el Agro-Verse; el ADR recoge la decisión, las alternativas y el plan por fases (C1…C12). Los §1-§5 son el diagnóstico y el diseño tal como se aceptaron (foto del 2026-10-30); lo construido está en §6.

## 1. Diagnóstico (medido sobre `main` en `eb83472`)

Cifras sacadas de `deriva()` de `pruebas/contrato_modulos.js` (la misma derivación textual que escribe las cabeceras «Expone / Consume»; puede colar algún nombre local que coincida, así que son un orden de magnitud, no un recuento exacto).

| Medida | Valor |
|---|---|
| Módulos en `apps/web/motor/` | 47 |
| Nombres de primer nivel que otro módulo usa (globales de la IIFE) | 285 |
| Aristas «A consume de B» | 448 |
| …de ellas hacia un módulo **posterior** en el orden de montaje | 121 |
| Más consumidos | `03_escena` (39 módulos), `02_mundo` (35), `01_datos` (35), `15_tiempo` (29), `12_paseo` (26), `16_vida` (25) |
| Que más dependen | `90_final` (26 módulos), `29_vr` (24), `07b_arboles` (18), `14_historia` (17), `33_ajustes` (15) |
| Comprobaciones `typeof X !== "undefined"` (¿existe el otro módulo?) | 52 |

### 1.1 Cómo se acoplan hoy

- **Un solo ámbito para todo.** `01_datos.js` abre la IIFE y `99_cierre.js` la cierra; cualquier `var` o `function` con dos espacios de sangría es visible para los 46 módulos restantes. No hay frontera: `16_vida.js` expone 26 nombres (`enQuad`, `dron`, `ponDron`, `mira`, `esfera`…) y los usan 25 módulos, entre ellos el paseo, el HUD, el VR y el minimapa. La fauna, los vehículos y utilidades de geometría viven mezclados en el mismo fichero.
- **El orden alfabético es el grafo de dependencias, pero solo a medias.** `genera_motor.mjs` concatena con `readdirSync().sort()`. 121 aristas apuntan hacia delante y funcionan solo porque se usan dentro de funciones que se llaman después del montaje (p. ej. `01_datos` consume `Mundo` y `nivel`; `14_historia` y `17_minimapa` consumen `cuadro` de `90_final`). Lo que se ejecuta **al montar** y necesita a un módulo posterior recurre a trucos:
  - `setTimeout(function () { … }, 0)` «tras montar todos los módulos» en `31_hud.js` (para suscribirse a `Ajustes`, que va después) y en `35_fichas_tiempo.js` (para `TiempoVivo.alCambiar`);
  - 52 `typeof X !== "undefined"` defensivos: `31_hud.js` pregunta por `Ventanas`, `Ajustes`, `Movibles` y `Menu`; `29_vr.js` por `FichasTiempo` (`vrHayTiempo()`); `33_ajustes.js` por `Mide`, `renderer`, `tamano`, `iniciaSonido`.
- **El bucle conoce a todos.** `cuadro(t)` en `90_final.js` llama a mano a 19 actualizaciones (17 en una sola línea) (`actualizaTiempo`, `actualizaOlivo`, `actualizaVida`, `actualizaMinimapa`, `actualizaPaisaje`, `actualizaBalizas`, `actualizaSonido`, `actualizaSuelo`, `actualizaNube`, `Arboles.actualiza`, `actualizaCarga`, `actualizaHuellas`, `actualizaPerros`, `Presencia.actualiza`, `Hazas.actualiza`, `Cola.corre`, `Escena3D.actualiza`, `depuraCuadro`, `Mide.cuadro`). Añadir algo que vive por fotograma es tocar esa línea; quitarlo, también. Quien no quiere tocarla se busca su propio reloj: `setInterval` en `15_tiempo.js`, `31_hud.js` (250 y 100 ms) y `35_fichas_tiempo.js` (500 ms), y `onBeforeRender` en la lámina de la previsión. Son relojes que no se paran en VR ni con la página oculta y que el presupuesto de `Cola` no ve.
- **La plantilla es un contrato oral.** `plantilla.html` tiene ~140 `id`, y varios módulos tocan los mismos: `#ficha` lo usan 5 módulos (`09_camara`, `12_paseo`, `13b_hazas`, `29_vr`, `31_hud`); `#ndviSel`, 4; `#btnPaseo`, `#btnPantalla`, `#fichaTitulo`, `#fichaDatos`, `#hFin`, 3 cada uno. Los módulos se hablan a veces **simulando clics** en botones de otro (`31_hud.js` hace `$("btnPaseo").click()` y `$("hFin").click()`; `33_ajustes.js` despacha `change` sobre `#calidad` y sobre los deslizadores `#exag`/`#corr`; `29_vr.js` cambia `#cSonido` y despacha `change`). Si alguien renombra un id, no falla ninguna cabecera de contrato.
- **Los puntos de la interfaz son listas cerradas.**
  - Ventanas: `VentanasPuro.IDS` fija seis (`mapa`, `capas`, `tiempo`, `historia`, `gente`, `ayuda`) y sus nodos están en la plantilla.
  - Teclas: `HudPuro.accionTecla` fija `Digit1…6` → esas ventanas.
  - Configuración: `AjustesPuro.ESQUEMA` es un único objeto con las claves de todos (gráficos, sonido, VR, accesibilidad) y `PESTANAS` fija su interfaz.
  - Panel VR: `VR_PESTANAS = [mundo, ira, comodidad]` y cada botón con coordenadas absolutas en píxeles del lienzo (`b("tiempo", 520, y0 + 264 + 144, 444, 72, …)`); `29_vr.js` consume de 24 módulos, entre ellos `FichasTiempo`, `Presencia`, `BAL`, `Mide`, `snd`.
  - Minimapa: `17_minimapa.js` llama a `dibujaBalizasMini`, `dibujaPerrosMini`, `Presencia` y `Movibles` por su nombre.
- **Eventos a medias.** Ya hay dos `CustomEvent` en `document` (`gemelo:chat` de `31_hud.js` y `gemelo:prevision-mundo` de `15_tiempo.js` → `35_fichas_tiempo.js`) y suscripciones propias (`Ajustes.alCambiar`, `TiempoVivo.alCambiar`, `Mundo.alCargar`, `Catalogo.alCambiar`), cada una con su forma. No hay un catálogo de eventos ni un guardián que los vigile.
- **Cada pieza elige con quién habla en la red.** `26_presencia.js` abre la sala de LiveKit y reparte por `topic` (`pose`, `chat`) dentro de su propio `recibeDatos`. Un minijuego en red tendría que tocar `26_presencia.js` o abrir otra conexión.
- **El API registra a mano.** `apps/api/src/app.ts` llama en fila a `rutasSalud`, `rutasAuth`, `rutasHazas`, `rutasYo`, `rutasAdmin`, `rutasPresencia`, `rutasTiempo`, `rutasVida`; el encendido de cada servicio va por variables (`GEMELO_OT=no`, `GEMELO_VIGIA=no`) y campos opcionales de `Contexto`. No hay `/api/config` que diga al cliente qué hay encendido.

### 1.2 Lo que ya está bien (y se conserva)

- **Cabeceras «Expone / Consume» derivadas del código** y vigiladas por `pruebas/guardianes/contratos.test.js`: hoy se ve el acoplamiento; falta poder **limitarlo**.
- **Interfaces con miembros fijados** en `contratos/interfaces.json` (`Mundo`, `Cola`, `Escena3D`, `TiempoVivo`, `Presencia`, `Hazas`…), comprobadas miembro a miembro.
- **El patrón `XPuro` + `X`** con trozos `[puro:inicio]…[puro:fin]` evaluados en Node (llegada, hazas, tiempo, presencia, avatares, HUD, ventanas, ajustes, movibles, fichas del tiempo): la lógica se prueba sin Chrome. Es el germen natural del componente: núcleo puro + adaptador al motor.
- **La `Cola`** con generadores y presupuesto en milisegundos: es ya un servicio del núcleo que cualquiera usa sin conocer a los demás.
- **Banderas que no crean nada sin activarse** (`?presencia=`, `?olivos=`, `13b_hazas` sin `D.base`), y **carga perezosa con `import()`** dentro del motor concatenado (`livekit-client`, `@pixiv/three-vrm`, `3d-tiles-renderer`, `gemelo-olivo`): demuestra que Vite resuelve `import()` en este estilo sin cambiar a módulos ES.
- **`Ajustes.lee/pon/alCambiar`** y **`Movibles.hazMovible`**: ya son puntos de extensión, aunque el esquema de ajustes sea central.

### 1.3 Lo que dolió al añadir piezas (commits reales)

| Pieza | Commit | Además del fichero nuevo y su prueba, tocó… |
|---|---|---|
| Ventanas (`32_ventanas.js`) | `617bcc5` | `31_hud.js` |
| HUD (`31_hud.js`) | `28e48c4` | `14_historia.js` |
| Ventanas movibles (`34_movibles.js`) | `449dd18` | `17_minimapa.js` (43 líneas), `26_presencia.js` (78) |
| Configuración (`33_ajustes.js`) | `3fcd136` | `14_historia`, `20_sonido`, `26_presencia`, `28_depura`, `30_mide`, `90_final` (seis módulos ajenos) |
| Fichas del tiempo (`35_fichas_tiempo.js`) | `ee27ce8` | `29_vr.js` (38 líneas: botón, resumen y tarjeta en el panel), `pruebas/contrato_modulos.js` |
| Tiempo por el servidor | merge `eb83472` | `15_tiempo.js` (287 líneas), `23_estacion.js`, `35_fichas_tiempo.js`, `plantilla.html`, `app.ts`, `config.ts`, `contexto.ts`, `principal.ts` |

Las fichas del tiempo son el mejor caso: su autor ya trabajó «como plugin» (fichero propio, `setInterval`, `onBeforeRender`, evento `gemelo:prevision-mundo`, `typeof TiempoVivo`), y aun así tuvo que meterse en el panel VR porque no hay forma de que una pieza **ofrezca** un botón. Quitar hoy las fichas del tiempo exige editar `29_vr.js`; quitar el sonido, cinco módulos; quitar la presencia, más de diez.

## 2. Qué hacen otros motores y mundos

| Referencia | Unidad de extensión | Qué tomamos |
|---|---|---|
| **Bevy** (Rust) | `Plugin` con `build(app)` que añade sistemas a **fases** ordenadas (`Startup`, `Update`, `PostUpdate`) y recursos | el registro por fases: el bucle no nombra a nadie, recorre fases |
| **Unity** / **PlayCanvas** | componente con ciclo `Awake/initialize → Update → OnDestroy/destroy` | el ciclo de vida `monta → actualiza → libera` |
| **Unreal** | descriptor `.uplugin` (nombre, versión, dependencias, módulos) | el manifiesto declarativo y comprobable antes de ejecutar |
| **Godot** | nodos + autoloads + señales | el bus de señales en vez de llamadas directas |
| **Mozilla Hubs** (three + bitecs) / **Decentraland SDK7** | ECS: entidades con id, componentes de datos, sistemas; componentes **en red** con id estable | el id estable de entidad y que lo compartido en red sea «estado de una entidad», no un mensaje ad hoc |
| **bitecs** / **miniplex** | ECS de JavaScript (por arrays tipados / por objetos) | por ahora nada (§4): nuestro cuello no es iterar miles de entidades por fotograma |

Lo común: **un manifiesto** que se lee antes de ejecutar, **fases** en lugar de una línea con todos, **eventos** en lugar de llamadas, y **ciclo de vida** con liberación. Un ECS completo es una pieza distinta: resuelve rendimiento y composición de muchos objetos iguales, no la extensibilidad del producto.

## 3. Diseño propuesto: núcleo estable + componentes registrados

### 3.1 El núcleo (no se toca al añadir o quitar un componente)

Lo que hoy es `01_datos` a `09_camara` más `Cola`, la escena y las entradas: `D`, `Mundo`, `Cola`, `renderer/scene/camera`, cámara y modos de movimiento, `Escena3D`, `Ajustes` (motor) y los servicios nuevos de abajo. Sus interfaces van a `contratos/interfaces.json` como hoy. El núcleo es lo único que un componente puede consumir **por nombre**; el resto, por el registro o el bus.

Servicios nuevos del núcleo (un fichero, `apps/web/motor/02c_componentes.js`, más un enganche en `90_final.js`):

- **`Componentes`**: `registra(def)`, `arranca()` (en `90_final`, tras montar todos los ficheros), `actualiza(fase, dt, t)`, `activo(id)`, `api(id)`, `libera(id)`, `resumen()`.
- **`Bus`**: `on(evento, fn) → quita`, `emite(evento, datos)`. Eventos con nombre `dominio:accion` (`tiempo:cambia`, `baliza:abre`, `ventana:abre`, `ajuste:cambia`, `vr:entra`, `vr:sale`, `entidad:usa`). Sustituye a los `CustomEvent` de `document` y, con el tiempo, a los `alCambiar` sueltos (que se quedan como envoltorio).
- **Puntos de extensión** (C2): `Hud.icono(def)`, `Ventanas.registra(id, def)`, `Ajustes.registra(prefijo, esquema, pestaña)`, `PanelVR.filas(pestaña, fn)` con maquetación por filas en vez de coordenadas, `Teclas.registra(codigo, accion)`, `Minimapa.capa(fn)`, `Capas.registra(def)` (capas de datos del mundo con su procedencia: medido, deducido o ilustrativo, regla 5).

### 3.2 El contrato de un componente

Estilo del motor intacto (`var`, sin módulos ES dentro, concatenación): un componente es un fichero de `apps/web/motor/` que **solo** llama a `Componentes.registra` en su primer nivel.

```js
  // [puro:inicio] … la lógica sin DOM ni THREE, como hoy (FichasTiempoPuro) … [puro:fin]
  Componentes.registra({
    id: "fichas-tiempo", version: 1,
    consume: ["TiempoVivo", "Hud", "PanelVR"],         // interfaces del núcleo u otros componentes (las comprueba el guardián)
    expone: ["FichasTiempo"],                         // lo que otros pueden pedir con Componentes.api("fichas-tiempo")
    eventos: { escucha: ["tiempo:cambia", "vr:sale"], emite: ["lamina:abre"] },
    bandera: { defecto: true, url: "fichas" },        // ?fichas=0 la apaga; /api/config manda en el servidor (C6)
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 1 },   // regla 6: lo que puede sumar como mucho
    fases: { tarde: 0.5 },                            // «tarde» cada 0,5 s (sustituye al setInterval); «mundo» cada fotograma
    monta: function (n) { … return api; },            // n = el núcleo; puede devolver una promesa (import() perezoso)
    actualiza: { tarde: function (dt, t) { revisa(); } },
    libera: function () { … dispose() de todo … }     // obligatorio si monta crea recursos de GPU o escucha algo
  });
```

Reglas que vigila un guardián nuevo (C1, en Node, sin Chrome):

1. Cada fichero componente no usa en su primer nivel ningún global de otro componente; sus «Consume» derivados por `contrato_modulos.js` solo pueden ser del núcleo (lista cerrada) o de `Componentes`/`Bus`.
2. `consume` de cada componente existe en el núcleo o en el `expone` de otro componente registrado; no hay ciclos.
3. Todo componente declara `presupuesto` y `libera`; la suma de presupuestos de los encendidos por defecto cabe en `pruebas/presupuesto.json` → `diseno`.
4. Todo evento emitido o escuchado está en el catálogo de eventos (un JSON nuevo en `contratos/`); ninguno queda sin quien lo emita.
5. **Quitar funciona:** se genera el motor sin cada componente piloto (`genera_motor.mjs` con una lista de exclusión) y la sintaxis y el contrato siguen en verde. La prueba en Chrome de «con y sin» (`renderer.info` vuelve a la base tras `libera`) va por el banco (🔶).

### 3.3 El bucle con fases

`cuadro(t)` deja de nombrar a nadie salvo el núcleo:

```
dt → cámara (núcleo: VR, paseo u órbita) → Componentes.actualiza("mundo")   → Arboles/carga de teselas (núcleo)
   → Componentes.actualiza("tarde") (cada uno a su ritmo, repartido entre fotogramas) → Cola.corre(presupuesto)
   → render → Componentes.actualiza("trasRender") (depura, mide)
```

Dentro de una fase, el orden lo da `orden` del manifiesto (y si falta, la dependencia), no el nombre del fichero. Durante la migración, las llamadas viejas de `cuadro` conviven con `Componentes.actualiza`; cada piloto que migra quita la suya.

### 3.4 Encendido: URL, servidor y oficina

Precedencia: **URL** (desarrollo y pruebas, como `?presencia=sim`) > **`/api/config`** (lo que el servidor sirve: componentes encendidos y sus parámetros, por rol u hogar cuando lo decida la oficina) > **defecto del manifiesto**. Sin servidor (página estática), manda el defecto. En el API, cada carpeta de `apps/api/src/` pasa a exportar un plugin `{ id, activo(config), rutas(app, ctx) }` y `app.ts` recorre una lista; `GET /api/config` se deriva de esa lista (sin datos de la explotación ni secretos).

### 3.5 Carga perezosa

El manifiesto y lo barato van en el paquete; lo pesado se pide con `import()` dentro de `monta`, como ya hacen la presencia, los avatares y los olivos generados. Un componente apagado no descarga su librería. Más adelante (fase C10), un componente grande puede vivir en `apps/web/componentes/<id>/` como módulo ES que Vite trocea; el registro no cambia.

## 4. Lo que le falta al mundo para el Agro-Verse

| Pieza | Por qué | Coste | Cuándo |
|---|---|---|---|
| **Entidades con id estable** (`olivo:<id>` de ADR-0012, `baliza:<parcela>`, `haza:<id>`, `persona:<identidad>`, `objeto:<uuid>`): un registro con tipo, posición, procedencia y dueño | hoy cada pieza tiene su forma de «cosa del mundo» (copas en arrays, balizas en `BAL`, hazas en su GeoJSON, personas en `Presencia`); los juegos, la personalización de árboles (V3) y la red necesitan nombrar lo mismo igual | medio: registro + adaptadores en copas, balizas, hazas y presencia; sin cambiar su dibujo | tras los pilotos (C7) |
| **Usables**: un solo sistema de interacción (tocar, clic, rayo en VR, cercanía) sobre entidades que declaran `acciones` y una `ficha` | hoy `09_camara` (`eligeCopa`), `19_balizas` (`eligeBaliza`), `13b_hazas` (tecla H y toque) y `29_vr` resuelven cada uno su selección y escriben en `#ficha`; un objeto colgado por una familia o una pieza de juego necesitaría el quinto camino | medio-alto: toca 09, 19, 13b y 29, uno por commit; nota de comodidad (regla 11) | C7, con las entidades |
| **Red** (bus de red): `Red.publica(tema, datos, {fiable})`, `Red.escucha(tema, fn)` sobre la sala de LiveKit | hoy `26_presencia.js` es dueño de la conexión y de los temas `pose` y `chat`; un juego o el estado compartido de una entidad irían por aquí sin tocar la presencia | bajo-medio: sacar la conexión de 26 a un servicio; la presencia pasa a ser un cliente más | C5, piloto |
| **Láminas** (lienzo 2D como textura en el mundo, que se abre, se repinta solo si cambia y se libera) | la lámina de la previsión (`35_fichas_tiempo.js`) es justo lo que pide un juego casual en VR y las fichas de entidades | bajo: extraer de 35 | C8 |
| **Anfitrión de juegos** (espera → cuenta atrás → juego → resultado; lienzo 2D sobre el mundo en pausa o lámina en VR; récord validado en el API) | los cinco minijuegos y los casuales de [PLAN](../rumbo/PLAN.md#ideas-de-mejora-sin-fecha-se-convierten-en-tarea-cuando-antonio-lo-diga) comparten esqueleto | medio; cada juego, un componente | C9, tras decisiones de Antonio |
| **Servidor de estado de juego** (Colyseus u otro) | solo si hay partidas en tiempo real con reglas que alguien deba arbitrar ([ARQUITECTURA-MULTIUSUARIO](ARQUITECTURA-MULTIUSUARIO.md#tiempo-real-presencia-voz-y-vídeo)); los casuales son de una persona y la clasificación se valida en el API | alto (otro servicio, otro despliegue) | no ahora (C12, condicional) |
| **ECS** (bitecs o miniplex) | solo si una escena mueve miles de entidades dinámicas por fotograma (aceitunas con física en «La recolección», fauna densa) | medio dentro de un componente; alto si se impone al motor | no ahora; si llega, dentro del componente que lo pida |
| **Cultivo y mundo por componente** (`aplica: { cultivo: "olivar" }`) | el Agro-Verse traerá otras fincas y quizá otros cultivos; olivos, estación BBCH y poda son del olivar | bajo si se declara desde el principio | en el manifiesto desde C1 (campo opcional) |

## 5. Comodidad, presupuesto y lo no probado

- El diseño no cambia ningún gesto ni el panel por sí mismo; cada migración de interacción (C2, C7) lleva su nota de comodidad (regla 11). **No probado**: nada de esto existe; iPhone y Quest, sin probar.
- El presupuesto por componente es **declarado**; medirlo de verdad exige que cada componente cuelgue lo suyo de un `Group` propio (`n.grupo(id)`) para que `?debug` cuente llamadas y triángulos por componente. Hasta medirlo con el banco, las cifras declaradas son **[SUPUESTO]**. Ejemplo de por qué importa: la bandada de `16_vida.js` suma 98 de las 124 llamadas de «lejos» en el fixture (ver `pruebas/presupuesto.json`), y hoy nada lo atribuye a la fauna.

## 6. Lo hecho (C1-C3)

**C1 · núcleo** (`apps/web/motor/02c_componentes.js`): `ComponentesPuro` (validar el manifiesto, ordenar por `consume` → `expone` con detección de ciclos, encendido, validar la configuración), `Bus`, `Teclas` y `Componentes` (`registra`, `arranca`, `actualiza(fase)`, `configura`, `api`, `activo`, `enciende`, `libera`, `resumen`; `window.__componentes()`). `90_final.js` llama a `Componentes.arranca()` antes del primer fotograma y a las fases `mundo` (tras la cámara y los módulos de siempre), `tarde` (antes de la `Cola`) y `trasRender`; las llamadas de los módulos que no son componentes siguen como estaban. Catálogo de eventos: [eventos.md](../../contratos/eventos.md) (+ `eventos.json` y su esquema). Configuración: [config.schema.json](../../contratos/config.schema.json) con el bloque `componentes` (`{ id: { activo, parametros? } }`). `genera_motor.mjs --sin <fichero>` (o `GEMELO_SIN`) deja componentes fuera del motor. Guardián: `pruebas/guardianes/componentes.test.js`.

**C2 · puntos de extensión** (todos devuelven la función que lo quita): `Hud.icono(def)`, `Ventanas.registra(id, { titulo, construye })`, `Ajustes.registra(prefijo, esquema, pestaña, aplica?)` (con `AjustesPuro.fusiona`), `PanelVR.filas(pestaña, fila)` y `PanelVR.tapa(fn)`, `Minimapa.capa(fn, orden?)`, `Capas.registra(def)` (`32b_capas.js`, exige procedencia). Las ventanas, teclas, ajustes y filas de siempre no cambian de id, tecla ni sitio: en `29_vr.js` las filas de las tres pestañas se registran con `PanelVR.filas` con los mismos altos de antes (88 px; 96 la parcela), así que caen en los mismos píxeles.

**C3 · piloto** (`35_fichas_tiempo.js`, componente `fichas-tiempo`): solo define su lógica (`FichasTiempoPuro`, `FichasTiempoMotor`) y se registra; usa `Teclas` (P), `PanelVR.filas` (la fila del tiempo en Mundo, con «Ver previsión»), `PanelVR.tapa` (la ficha de la baliza espera si la lámina está delante), el Bus (`prevision:alterna` desde la ventana Tiempo, `vr:sale`) y la fase `tarde` cada 0,5 s. Fuera: su `setInterval`, su `setTimeout(0)`, su escucha de `document` y su teclado propio; `29_vr.js` ya no lo nombra (ni `FichasTiempo` ni `vrHayTiempo`). Apagado (`?fichas=0`, configuración) o fuera del motor: el botón de la ventana Tiempo se esconde (`Bus.hay`), la pestaña Mundo del panel VR queda sin su fila y nada más cambia.

**C4 (sonido) no se ha hecho**: `20_sonido.js` lo nombran `29_vr.js` (fila «Sonido» del panel y `iniciaSonido` al entrar), `33_ajustes.js` (`sonido.activo`), `19_balizas.js` y `24_pantalla.js`; convertirlo pide pasar esos usos a eventos y a `Ajustes.registra`, y queda como siguiente paso (ADR, C4).

### En qué se aparta del diseño de §3 (y por qué)

- **`/api/config` no se pide todavía.** Pedirla sin que exista daría un 404 en cada carga con servidor, y las pruebas de dev cuentan cualquier respuesta ≥ 400 como error. El motor ya lee el bloque `componentes` si la página trae `<script type="application/json" id="config">` y expone `Componentes.configura(bloque)`, que enciende y apaga en caliente: C6 solo tiene que hacer el `fetch` y llamar a `configura`.
- **La fase `tarde` también corre en VR**: en VR el bucle lo lleva la sesión, que llama al mismo `cuadro()`; lo que se para es el reloj propio (`setInterval`) que había antes, que corría aunque la página estuviera oculta. Con la página oculta, el navegador para el bucle y con él las fases.
- **Regla 1 del guardián, afinada**: un componente no expone nada en su primer nivel, nadie lo nombra (ni su id ni lo que expone, fuera de comentarios) y no consume de otro componente; lo que usa de módulos que aún no son componentes (`TiempoVivo`, `Hud`, `VRX`, `paseando`…) lo declara en `consume`. Durante la migración el «núcleo» que se puede consumir sin declarar es `01_datos`, `02_mundo`, `02b_cola`, `02c_componentes` y `03_escena`.
- **`PanelVR.filas(pestaña, fila)`** recibe una fila con `alto`, `botones(b, y)`, `pinta(cx, y, W, h)`, `firma()` y `debug()`, no una función suelta: así el panel sabe cuándo repintar sin que la fila lleve su propio reloj.

### Nota de comodidad (regla 11)

- **Qué cambia para quien juega**: nada a propósito. Mismas teclas (P paseando; la P sigue sin hacer nada con el foco en un campo, con Ctrl/Alt/Cmd o al repetirse), mismo botón «Ver la previsión en el mundo», mismas filas y botones del panel VR en las mismas coordenadas del lienzo (lo fija `pruebas/guardianes/fichas_tiempo.test.js`). Diferencia visible: si la lámina no está (apagada o fuera del motor), el botón de la ventana Tiempo no aparece en vez de no hacer nada.
- **Qué se probó y dónde**: en Node, el registro, las teclas, el panel por filas de la pieza y el montaje y liberado de la lámina con un THREE de mentira; en Chrome sin pantalla por el banco, las pruebas de navegador de la puerta (ver el informe de la medida en el commit).
- **No probado**: en unas Quest (el panel por filas, la fila del tiempo y «Ver previsión» con el rayo) ni en un iPhone. El panel VR por filas solo se ha comprobado con el WebXR simulado.

