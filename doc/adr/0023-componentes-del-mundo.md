# ADR-0023 — Componentes del mundo: núcleo estable y registro de componentes

- **Estado:** Aceptado (Antonio, 2026-10-30; decisiones 117-124: registro ligero, encendido desde la oficina ya, entidades y usables tras los pilotos, sin Colyseus ni ECS general, solo componentes del repo, C1-C3 ya)
- **Fecha:** 2026-10-30

## Contexto
Antonio (2026-10-30): «la arquitectura del mundo ha de permitir la evolución sin tener que romper la programación… como si fueran plugins y/o componentes nuevos que pones y quitas»; «esto va a derivar en un Agro-Verse». Vienen minijuegos, juegos casuales, avatares, fauna, objetos de las familias y el panel de la oficina ([PLAN](../rumbo/PLAN.md#ideas-de-mejora-sin-fecha-se-convierten-en-tarea-cuando-antonio-lo-diga)).

Hoy el motor son 47 ficheros concatenados en una IIFE ([ADR-0010](0010-monorepo-y-build-con-vite.md)) que comparten 285 nombres, con 448 dependencias entre módulos (121 hacia un módulo posterior). `90_final.js` llama a mano a 19 actualizaciones; `29_vr.js` consume de 24 módulos; ventanas, teclas, ajustes y panel VR son listas cerradas; la plantilla tiene ids que tocan hasta cinco módulos. Añadir la Configuración tocó seis módulos ajenos; las fichas del tiempo, el panel VR. Diagnóstico completo, con ejemplos y commits: [COMPONENTES.md](../sistema/COMPONENTES.md#1-diagnóstico-medido-sobre-main-en-eb83472).

Lo que ya funciona y no se quiere perder: cabeceras «Expone / Consume» derivadas y vigiladas, interfaces fijadas en `contratos/interfaces.json`, el patrón `XPuro` probado en Node, la `Cola` con presupuesto, banderas que no crean nada sin activarse e `import()` perezoso dentro del motor concatenado.

## Decisión
Separamos un **núcleo estable** (datos, mundo, cola, escena, cámara y entradas, ajustes) de **componentes registrados**: cada componente es un fichero de `apps/web/motor/` que solo llama a `Componentes.registra({ id, consume, expone, eventos, bandera, presupuesto, fases, monta, actualiza, libera })`. El bucle recorre **fases** sin nombrar componentes, la interfaz ofrece **puntos de extensión** (HUD, ventanas, teclas, ajustes, panel VR, minimapa, capas), los componentes se hablan por un **bus de eventos** y un guardián en Node comprueba el contrato. Se mantiene el estilo actual (`var`, concatenación); se migra de forma incremental empezando por tres pilotos.

Diseño del contrato y de los servicios: [COMPONENTES.md §3](../sistema/COMPONENTES.md#3-diseño-propuesto-núcleo-estable--componentes-registrados).

## Alternativas consideradas
- **A. Dejarlo como está** (módulos con cabecera derivada y disciplina). Coste cero hoy, pero cada pieza nueva sigue tocando el bucle, el panel VR o la plantilla, y quitar una exige editar a sus consumidores. Con minijuegos y objetos de familias en cola, el coste crece con cada pieza. Descartada.
- **B. Registro de componentes ligero dentro de la concatenación** (la elegida). Encaja con el estilo y con las pruebas actuales; el manifiesto es comprobable en Node; permite migrar uno a uno. Coste: un fichero de núcleo, un guardián nuevo y adaptar los puntos de la interfaz. No impide nada de C ni D.
- **C. ECS completo (bitecs o miniplex) para todo el motor.** Lo usan Mozilla Hubs y Decentraland; da id estable, composición y rendimiento con miles de entidades. Pero nuestro problema es la extensibilidad del producto (UI, bucle, red), no iterar miles de entidades; reescribiría todos los módulos (big bang) y no resuelve por sí solo HUD, ventanas ni panel VR. Se reserva para **dentro** de un componente que lo necesite (física de «La recolección», fauna densa), con su versión fijada (regla 12). Descartada como arquitectura general.
- **D. Pasar a módulos ES con un cargador** (`import`/`export` por fichero, Vite trocea y `import()` carga cada componente). Es la forma «moderna» y da fronteras reales del lenguaje. Pero obliga a reescribir los 285 nombres compartidos como importaciones de golpe, rompe las cabeceras derivadas, los trozos `[puro:…]` evaluados en Node y el orden de montaje, y no aporta nada que B no dé mientras un único equipo mantiene el código. Queda como **destino posible** para componentes grandes (fase C10): un componente puede vivir en `apps/web/componentes/<id>/` como módulo ES cargado con `import()` y registrarse igual. Descartada como primer paso.

## Consecuencias
- **Positivas:** añadir o quitar un componente no toca el bucle ni a los demás (lo comprueba la generación del motor sin él); cada componente dice qué consume, qué expone, qué eventos usa, cuánto puede dibujar y cómo se libera; se acaban los `setTimeout(0)` «tras montar» y la mayoría de los 52 `typeof X !== "undefined"`; los relojes propios (`setInterval`, `onBeforeRender`) pasan a la fase «tarde» del bucle, que se para en VR y con la página oculta; el encendido por URL, servidor y oficina sale gratis del manifiesto; base para entidades, usables, red y juegos.
- **Negativas / coste:** un nivel de indirección (llamar por `Componentes.api(id)` o por el bus en vez de por nombre); el guardián añade reglas que fallarán en commits que hoy pasan; durante la migración conviven dos estilos (llamadas en `cuadro` y fases); los puntos de extensión del panel VR obligan a cambiar las coordenadas absolutas por filas, con riesgo visual que hay que comprobar en VR simulada y, al final, en el Quest; el presupuesto por componente es declarado hasta que se mida con el banco. Estimación **[SUPUESTO]**: C1–C3, unas 3-4 sesiones de agente; la migración completa, por goteo, al tocar cada módulo.
- **Implicaciones futuras:** las entidades con id estable y los usables (C7) son la base del Agro-Verse (objetos de familias, juegos, otros cultivos); un servidor de estado de juego (Colyseus u otro) entra como un componente más con su plugin de API si una decisión lo pide; un componente puede declarar a qué cultivo aplica.

## Plan por fases

| Id | Tarea | Depende de | Tipo | Estado |
|---|---|---|---|---|
| C1 | Núcleo de componentes: `Componentes` y `Bus` en un fichero `02c_` del motor, fases en `cuadro()` junto a las llamadas de hoy, catálogo de eventos en `contratos/`, guardián en Node (reglas de COMPONENTES §3.2) y `genera_motor.mjs` con lista de exclusión; sin cambio visible | este ADR aceptado | opus | ✅ ([COMPONENTES §6](../sistema/COMPONENTES.md#6-lo-hecho-c1-c3-y-c4-más-abajo); el motor ya lee el bloque `componentes` de la configuración, sin pedir `/api/config` hasta C6) |
| C2 | Puntos de extensión: `Hud.icono`, `Ventanas.registra`, `Teclas.registra`, `Ajustes.registra` (fusiona el esquema), `PanelVR.filas` por filas, `Minimapa.capa`, `Capas.registra`; nota de comodidad | C1 | opus | ✅ |
| C3 | Piloto 1: fichas del tiempo como componente (fuera `setInterval`, `setTimeout(0)`, `typeof` y el evento de `document`; `29_vr.js` deja de nombrarlas) | C2 | sonnet | ✅ (queda un `typeof TiempoVivo`, módulo que aún no es componente) |
| C4 | Piloto 2: sonido como componente (`20_sonido.js`: lo nombraban 29, 33, 19 y 24; pasan a eventos del Bus, `Ajustes.registra` y `PanelVR.filas`) | C2 | sonnet | ✅ (id `sonido-ambiente`; `ejeArroyo`/`distArroyo` se mudaron a `18_paisaje.js`) |
| C5 | Piloto 3: `Red` (la conexión de LiveKit fuera de `26_presencia.js`, temas por componente) y presencia como componente sobre ella; avatares como componente que consume `Presencia` | C1 | opus | ⬜ |
| C6 | Encendido por servidor: plugins del API (`{ id, activo, rutas }`, `app.ts` recorre una lista) y `GET /api/config` con contrato y OpenAPI; el cliente lo lee con precedencia URL > servidor > defecto | C1 | sonnet | ✅ `GET /api/config` versionada y su lectura en el motor (con OF6: [COMPONENTES §6](../sistema/COMPONENTES.md#c6--encendido-y-parámetros-por-servidor)); los plugins del API, sin hacer |
| C7 | Entidades con id estable y usables (selección única para toque, clic, rayo VR y cercanía; ficha común): copas, balizas, hazas y personas, uno por commit | C2 | opus | ✅ `02e_entidades.js` (`Entidades` registra tipos, no objetos; `Usables`): [COMPONENTES §6](../sistema/COMPONENTES.md#c7--entidades-con-id-estable-y-usables); 09 y 29 ya no nombran a 06, 13b, 19 ni 26 |
| C8 | Láminas: el lienzo-en-el-mundo de las fichas del tiempo como servicio del núcleo | C3 | sonnet | ✅ `02d_laminas.js` (servicio `Laminas`; las fichas del tiempo lo usan) |
| C9 | Anfitrión de juegos y primer casual («Tres olivas» u otro que elija Antonio) como componente; récord validado en el API | C2, C6, C8 y decisiones de Antonio | opus | ⬜ |
| C10 | Migración del resto (vida, perros, paisaje, minimapa, balizas, hazas, estación, huellas, suelo, depura, mide) al tocarlos; componentes grandes como módulo ES con `import()` si conviene | C1-C3 | sonnet | ⬜ |
| C11 | 🔶 Medida por componente: `Group` propio por componente, recuento en `?debug` y «con y sin» por el banco | C1 | sonnet | ⬜ |
| C12 | (Condicional) servidor de estado de juego si un juego en tiempo real lo pide | decisión de Antonio | opus | ⬜ |

## Comprobación
- Guardián en Node (C1): manifiestos válidos, `consume` resoluble y sin ciclos, `presupuesto` y `libera` declarados, suma de presupuestos dentro de `diseno` de `pruebas/presupuesto.json`, eventos en su catálogo, y ningún componente usa en su primer nivel globales de otro componente (derivado con `pruebas/contrato_modulos.js`).
- «Quitar funciona»: el motor generado sin cada piloto pasa sintaxis y contratos (Node); en Chrome, por el banco, carga y `renderer.info.memory` vuelve a la base tras `libera` (🔶).
- Las pruebas actuales (`npm run puerta`) siguen en verde en cada fase; los topes de `pruebas/presupuesto.json` no suben por la migración (medido por el banco antes y después, regla 6).
- **No probado:** el panel VR por filas, sin probar en el Quest (solo con el WebXR simulado); iPhone, sin probar; los presupuestos por componente son declarados (**[SUPUESTO]**) hasta C11. C1-C3 hechos y comprobados en Node y por el banco ([COMPONENTES §6](../sistema/COMPONENTES.md#6-lo-hecho-c1-c3-y-c4-más-abajo)).
