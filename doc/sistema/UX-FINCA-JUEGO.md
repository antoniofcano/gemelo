# La página de la finca como un videojuego a pantalla completa

> **Estado: propuesta de diseño (2026-10-30), pendiente de Antonio; sin implementar y sin probar con personas ni en dispositivos reales.** Rediseña la interfaz de `/finca/` (hoy `apps/web/plantilla.html` más lo que montan los módulos de `apps/web/motor/`) para que el mundo ocupe toda la pantalla y lo demás se abra solo cuando se pide. Maqueta navegable: [`prototipos/ux-finca-juego/index.html`](../../prototipos/ux-finca-juego/index.html) (cómo abrirla: [README](../../prototipos/ux-finca-juego/README.md)). Encaja con la UX aprobada de la web multiusuario ([UX.md §5](UX.md#5-dentro-del-mundo)) y la concreta para la página de la finca; donde se aparta, se dice en [§8](#8-decisiones-para-antonio). Se implementa **después de T8**, no antes ([§9](#9-plan-de-implementación-por-tareas)).

Petición de Antonio (30-oct-2026): «que sea súper sencilla y la protagonista la ventana del mundo; hay exceso de información, deslizadores y botones que vienen de una maqueta; piensa como si fuera un videojuego a pantalla completa […] y en el mundo en red la ventana del chat se ha de poder mover, porque abierta o minimizada tapa los controles de movimiento».

## Índice
1. [La idea en cinco líneas](#1-la-idea-en-cinco-líneas)
2. [Inventario de lo que se ve hoy](#2-inventario-de-lo-que-se-ve-hoy)
3. [Qué falla hoy](#3-qué-falla-hoy)
4. [La propuesta](#4-la-propuesta)
5. [Antes → después, elemento por elemento](#5-antes--después-elemento-por-elemento)
6. [El chat movible](#6-el-chat-movible)
7. [Librerías (regla 12)](#7-librerías-regla-12)
8. [Decisiones para Antonio](#8-decisiones-para-antonio)
9. [Plan de implementación por tareas](#9-plan-de-implementación-por-tareas)
10. [Lo que no está probado](#10-lo-que-no-está-probado)

---

## 1. La idea en cinco líneas

1. **El mundo ocupa toda la ventana** (100 % del alto visible, sin desplazar la página). Desaparecen la cabecera, el pie y la columna lateral; su contenido pasa a ventanas, al menú o se quita.
2. **HUD mínimo** en las cuatro esquinas: estado (brújula, cómo te mueves, el tiempo) arriba a la izquierda, una **barra de iconos** arriba a la derecha, la acción principal abajo en el centro y, solo en pantallas táctiles, la **cruceta abajo a la izquierda y las acciones abajo a la derecha** (pulgares).
3. **Cada cosa, su ventana**: Mapa, Capas, Tiempo, Historia, Gente, Chat, Ayuda. Se abren con su icono o con una tecla (1–6, M, T, F1) y se cierran con × o Esc. Una ventana grande a la vez; el minimapa y el chat flotan aparte y **se pueden mover**.
4. **Configuración** (menú ☰ / Esc) para lo que no se toca a diario: calidad, relieve exagerado, corrección de la ortofoto, sonido, controles, comodidad VR, accesibilidad, contador de rendimiento y medidor.
5. **Lo flotante nunca tapa los controles**: el chat, su burbuja y el minimapa se arrastran por su barra, recuerdan su sitio y, si caen sobre la cruceta, la barra o el estado, se apartan solos al sitio libre más cercano.

## 2. Inventario de lo que se ve hoy

Leído de `apps/web/plantilla.html` y de los módulos que crean o tocan cada pieza. «Frecuencia» es la de **un visitante** (no un desarrollador): alta = casi en cada visita; media = a veces; baja = rara vez; nunca = solo para medir o probar. Escritorio y móvil comparten el mismo HTML: en móvil (≤ 860 px) la columna lateral cae **debajo** del visor y el visor baja a 58 % del alto.

### 2.1 La página alrededor del visor

| # | Elemento | Dónde | Para qué | Frecuencia |
|---|---|---|---|---|
| 1 | Cabecera: título «Finca … en 3D» y párrafo | `plantilla.html` | Presentar la finca y de dónde salen forma y color | baja (una vez) |
| 2 | Pie: créditos, licencias, «Mockup…», nota de troncos ilustrativos y de la corrección | `plantilla.html` | Atribución CC BY y honestidad | baja, pero la atribución es obligatoria |
| 3 | El visor: caja de 420–740 px de alto con borde, dentro de la página | `plantilla.html`, `03_escena.js` | El mundo | — |

### 2.2 Dentro del visor

| # | Elemento | Dónde | Para qué | Frecuencia |
|---|---|---|---|---|
| 4 | Brújula «N ↑» (y a la vez interruptor del minimapa) | `plantilla.html`, `17_minimapa.js` | Orientarse; ocultar/mostrar el minimapa | media (el segundo uso no se descubre) |
| 5 | Tiempo al instante: flecha del viento y texto («Cielo despejado») | `15_tiempo.js` | Ver el tiempo simulado | media |
| 6 | Minimapa (ortofoto, tú, rastro, dron, conejos, gente, balizas; toque = zoom / ir) | `17_minimapa.js`, `19_balizas.js`, `26_presencia.js` | Saber dónde estás; ir con alguien o a una baliza | alta en paseo |
| 7 | Barra del visor: 🔊 sonido, ⛶ pantalla completa, 🚶 Pasear | `plantilla.html`, `20_sonido.js`, `24_pantalla.js` | Atajos | alta (Pasear), media (⛶), baja (🔊) |
| 8 | «🥽 Entrar en VR» (solo con WebXR) | `29_vr.js` | Entrar en VR | alta en Quest |
| 9 | Telemetría del dron (altura, velocidad, viento) | `16_vida.js` | Volar el dron | media (con dron) |
| 10 | Texto de ayuda de la órbita, siempre visible abajo a la izquierda | `plantilla.html`, `12_paseo.js` | Enseñar los gestos | alta la primera vez, después estorba |
| 11 | Texto de ayuda del paseo (todas las teclas) | `12_paseo.js`, `16_vida.js` | Enseñar las teclas | ídem |
| 12 | Cruceta: ▲ ◀ ▶ ▼, Correr, Cámara, Quad, Dron, Aterrizar, Subir, Bajar | `plantilla.html`, `12_paseo.js`, `16_vida.js`, `12b_llegada.js` | Moverse con el dedo | alta en móvil; **sale también en el ordenador** |
| 13 | Ficha de olivo / de haza (×, título, lista) | `09_camara.js`, `13b_hazas.js` | Datos del olivo o la haza tocados (H) | media |
| 14 | Ficha de baliza (tarjeta abajo a la izquierda) y aviso «¿Ir a esta baliza?» | `19_balizas.js` | Estado de la parcela, ir allí | media |
| 15 | Contador de `?debug` (abajo a la izquierda) | `28_depura.js` | Medir | nunca (visitante) |
| 16 | Caja del medidor «Medir 60 s» / «Copiar» (abajo a la derecha) | `30_mide.js` | Prueba T7 | nunca (visitante) |
| 17 | Panel **Gente y chat** (`?presencia=red`): abajo a la derecha, 280 px, plegable por su título; lista con Bloquear e «Ir con», chat, campo y Enviar | `26_presencia.js` | Ver quién está, hablar | alta en visitas en red |
| 18 | Velo del fundido («Ir con», balizas, aterrizar) | `12b_llegada.js` | Transición sin vuelo de cámara | — (no es interfaz) |

### 2.3 Debajo del visor: «El tiempo en la finca» (`15_tiempo.js`, `23_estacion.js`, `21_suelo.js`)

| # | Elemento | Frecuencia |
|---|---|---|
| 19 | Estado y «Leer de Vigía» | media |
| 20 | Deslizador «Momento» (0–71 h) y botones Ahora, +6 h, Mañana a las 12:00, Reproducir, y su resumen | media |
| 21 | Deslizador «Hierba según el NDVI del…» (`hSel`, la fecha de la estación) | baja |
| 22 | Selector «Probar un efecto» (lluvia, viento, niebla, helada de ejemplo) | baja |
| 23 | Tarjetas: estación, previsión de 72 h (gráfico), «El olivo en esta fecha» (con «Ver en Gemelo» y «Hoy») | media |
| 24 | Nota de interpretación (estación lejana, rejilla de 5 km, nubes aceleradas) | baja, pero es honestidad |

### 2.4 Debajo del visor: «La historia de la finca» (`14_historia.js`)

| # | Elemento | Frecuencia |
|---|---|---|
| 25 | «Empezar el recorrido», introducción, puntos de escena, título, texto, fuente, Anterior/Siguiente/Salir | media (una vez por visita) |

### 2.5 Columna lateral (`09_camara.js`, `10_ndvi.js`, `13_parcelas.js`, `08_marcadores.js`, `16_vida.js`, `18_paisaje.js`, `20_sonido.js`, `21_suelo.js`)

| # | Elemento | Frecuencia |
|---|---|---|
| 26 | **Parcelas** (y fincas, si hay varias): fichas para elegir | media |
| 27 | **Vista**: Nube LiDAR / Gemelo / Ortofoto, con su nota | media |
| 28 | Deslizador **Relieve exagerado** (1–3×) | baja |
| 29 | Deslizador **Corrección de la ortofoto** (0–1,5×) | casi nunca |
| 30 | Deslizador **Hora del día** (oculto; lo usa el panel VR) | — |
| 31 | Selector **Calidad del follaje** | baja |
| 32 | «Volver a la vista inicial» | media |
| 33 | «Pasear por el olivar», «Subir al quad», «Sacar el dron» (duplican el n.º 7 y la cruceta) | media |
| 34 | **Capas**: 10 casillas (linde, copas LiDAR, guardados, desfase, NDVI, copas por NDVI, ocultar árboles, fauna, paisaje, hierba) **y «Sonido ambiente»** (duplica el 🔊) | media |
| 35 | **Suelo · SoilGrids** (texturas por profundidad, tabla) | baja |
| 36 | **Vegetación · NDVI** (fecha, rango, evolución, deslizador `ndviSel`, leyenda, nota) — solo con la capa NDVI | baja |
| 37 | **Lo medido** (copas, guardados, altura mediana, desfase) y la nota del desfase | baja–media |

### 2.6 VR (`29_vr.js`)

| # | Elemento | Frecuencia |
|---|---|---|
| 38 | Panel flotante (Y): modo, hora ±, fecha ±, exageración ±, parcela ◀ ▶, Sonido, Viñeta, **Medir 60 s**, Salir de VR, sección Gente («Ir con») | alta en Quest |
| 39 | Tarjeta de ficha de olivo (se cierra a los 14 s), ficha de baliza («Ir a esta baliza», «Cerrar»), tarjeta del medidor | media |

**Cuenta de hoy:** en escritorio, sin desplazar, se ven 4 controles del visor, 2 textos de ayuda y la columna lateral con 3 deslizadores, 1 selector, 5 botones y 11 casillas; desplazando, 3 deslizadores más, 9 botones y 1 selector. En total, **≈ 50 controles** alrededor de un mundo que ocupa ~60 % del ancho y ~70 % del alto.

## 3. Qué falla hoy

1. **El mundo no es el protagonista**: es una caja dentro de una página que se desplaza. En el móvil, el visor es el 58 % del alto y debajo hay una página entera.
2. **Herencia de maqueta**: deslizadores de ajuste fino (relieve, corrección de la ortofoto) al mismo nivel que «Pasear».
3. **Duplicados**: Pasear (×2), Quad y Dron (×2), sonido (🔊 y casilla), fecha del NDVI (`hSel` y `ndviSel`, que además se sincronizan a mano en `21_suelo.js`).
4. **El chat tapa la cruceta**: el panel Gente/chat (`26_presencia.js`) va abajo a la derecha con `z-index: 30`, el mismo sitio que la cruceta (`.pad`, abajo a la derecha); plegado sigue encima. Además, la caja del medidor también va abajo a la derecha.
5. **La cruceta sale en el ordenador** (no hay detección de pantalla táctil) y en el móvil va a la derecha: el pulgar izquierdo no hace nada.
6. **Cosas que no se descubren**: el minimapa se oculta tocando la brújula; los textos de ayuda están siempre puestos en vez de enseñarse una vez.
7. **Pantalla completa a medias**: es un botón que agranda el visor; en el iPhone no hay Fullscreen API para esto y el `Esc` tiene tres significados (salir del paseo, de la pantalla completa, de un aviso).
8. **Depuración en el HUD del visitante**: el contador de `?debug` y la caja del medidor ocupan esquinas que la cruceta necesita.

## 4. La propuesta

### 4.1 Principios
- **Pantalla completa por diseño**: la página **es** el visor (`100dvh`, sin desplazamiento, `viewport-fit=cover` y márgenes de `env(safe-area-inset-*)`). El botón ⛶ solo pide además la Fullscreen API para quitar las barras del navegador.
- **Lo que se usa a diario, a un toque; lo que se ajusta una vez, en Configuración; lo de medir, fuera del HUD.**
- **Pulgares libres**: en táctil, las dos esquinas de abajo son de los controles; nada flotante se queda encima.
- **Honestidad visible** (regla 5): cada capa y cada ficha llevan su etiqueta (*medido*, *deducido*, *ilustrativo*, *modelo*, *guardado*); ver [§4.9](#49-honestidad-medido--deducido--ilustrativo-regla-5).
- **Una sola forma de hacer cada cosa**, con su tecla, su botón y su equivalente en VR (regla 3 de la skill `interaccion`).

### 4.2 Distribución

```
ESCRITORIO                                         MÓVIL VERTICAL            MÓVIL HORIZONTAL
┌──────────────────────────────────────────────┐   ┌───────────────────┐   ┌───────────────────────────────────┐
│(N)[🛰 Vista aérea ▾]      [🗺][🧭][🌦][📖][👥][💬][❔][⛶][☰]│   │(N)[🚶 A pie▾] [🗺][🧭][💬][⋯][☰]│   │(N)[🚶▾]  avisos    [🗺][🧭][💬][⋯][☰]│
│[☀ 18 °C · NE 3 m/s]        avisos            │   │[☀ 18 °C]          │   │[☀ 18 °C]               ┌minimapa┐ │
│┌minimapa┐                         ┌ventana─┐ │   │            ┌minimapa│   │        ┌chat──────┐    └────────┘ │
│└────────┘                         │ Capas  │ │   │            └───────┘│   │        │          │               │
│                                   │        │ │   │ ┌chat──────┐        │   │ ▲      └──────────┘     [Correr][Cám]│
│┌chat──────┐        MUNDO          └────────┘ │   │ └──────────┘        │   │◀ ▶                      [Quad][Dron] │
│└──────────┘    [🚶 Pasear aquí]              │   │  ▲          [Cor][Cám]│   │ ▼                                    │
│        © IGN-CNIG · Copernicus · ISRIC · ⓘ   │   │◀ ▶          [Quad][Dr]│   └───────────────────────────────────┘
└──────────────────────────────────────────────┘   │  ▼                  │
                                                   └───────────────────┘
```

### 4.3 HUD: lo que queda siempre a la vista

| Zona | Qué hay | Notas |
|---|---|---|
| Arriba izquierda | **Brújula** (gira con la cámara; tocarla = mirar al norte) · **Selector de modo** «🛰 Vista aérea ▾ / 🚶 A pie / 🏍 Quad / 🚁 Dron / 🥽 VR» · **chip del tiempo** («☀ 18 °C · ↙ NE 3 m/s»; tocarlo abre Tiempo) | El selector sustituye a los botones Pasear/Quad/Dron de la columna y de la barra. VR solo si hay WebXR |
| Arriba derecha | **Barra de iconos** (44 × 44 px): 🗺 Mapa · 🧭 Capas · 🌦 Tiempo · 📖 Historia · 👥 Gente* · 💬 Chat* · ❔ Ayuda · ⛶ Pantalla completa · ☰ Menú | *solo en el mundo en red. En ≤ 560 px de ancho o ≤ 460 px de alto quedan Mapa, Capas, Chat, ⋯ y ☰; «⋯» abre el resto |
| Arriba centro | **Avisos** efímeros (máx. 3, 4 s, `aria-live="polite"`) · telemetría del dron (solo con dron) · tarjeta del **recorrido** de la historia (cuando está en marcha) | |
| Abajo centro | **«🚶 Pasear aquí»** (solo en vista aérea) · **leyenda NDVI** (solo con la capa NDVI o el tinte) · **línea de atribución** («© IGN-CNIG CC BY 4.0 · Copernicus · ISRIC · ⓘ qué es medido»; abre Créditos) | En táctil y fuera de la vista aérea la atribución se esconde para dejar sitio a los pulgares; queda en el menú y en el mapa |
| Abajo izquierda | **Cruceta** (solo táctil y fuera de la vista aérea): ▲ ◀ ▶ ▼ de 52 px | Pulgar izquierdo. «Mano zurda» la pasa a la derecha |
| Abajo derecha | **Acciones** (solo táctil y fuera de la vista aérea): Correr, Cámara, Quad, Dron; con dron: Subir, Bajar, «Aterrizar aquí» | Pulgar derecho |
| Flotante | **Minimapa** y **chat** (o su burbuja), movibles ([§6](#6-el-chat-movible)) · **ficha** contextual (olivo, haza, baliza) | La ficha sale bajo la barra (escritorio) o bajo el estado (táctil) y se cierra con × o Esc |

«Táctil» = `matchMedia("(pointer: coarse)")`, ajustable en Configuración (Automático / Siempre / Nunca). Hoy la cruceta sale siempre en el paseo.

### 4.4 Ventanas emergentes

- **Una ventana grande a la vez** (Capas, Tiempo, Historia, Gente, Ayuda y el mapa ampliado); abrir otra cierra la anterior. Son **no modales** (`role="dialog"`, `aria-modal="false"`): el mundo sigue vivo y, en escritorio, se puede seguir andando con el teclado.
- **Dónde**: escritorio, columna a la derecha bajo la barra (380 px). Móvil vertical: **hoja inferior** (hasta el 72 % del alto) que esconde la cruceta mientras está abierta (estás leyendo, no andando). Móvil horizontal: **lateral derecho a toda altura**; esconde solo las acciones, la cruceta sigue (se puede andar con Capas abierta).
- **Cerrar**: ×, su mismo icono, o Esc. El foco va al título al abrir y vuelve al icono al cerrar.

| Ventana | Tecla | Contenido (desde lo de hoy) |
|---|---|---|
| **Mapa** (minimapa) | M · 1 | El minimapa de hoy, flotante y movible, con ⤢ «Ampliar» y × |
| **Mapa ampliado** | ⤢ o toque en el minimapa | Mapa grande · lista de **parcelas** («Ir» con fundido, «Cifras») · **Lo medido** de la selección · **Suelo** (modelo SoilGrids) · evolución del NDVI · «Ver toda la finca desde arriba» |
| **Capas** | 2 | **Cómo se dibuja** (Nube LiDAR / Gemelo / Ortofoto) · **Datos**: linde, copas LiDAR, guardados, desfase, vigor NDVI (+ su fecha y leyenda), copas por NDVI · **Ambiente**: paisaje, hierba, fauna, ocultar árboles. Cada fila con su etiqueta de procedencia |
| **Tiempo y estación** | 3 | Pestañas **Ahora** (lo de Vigía, de cuándo es, «Momento» 0–71 h, Ahora, Reproducir) · **Próximas 72 h** (gráfico) · **El olivo** (una sola **fecha del campo** para hierba, estación y NDVI) · «Probar un efecto (no es el tiempo real)» plegado · nota de interpretación |
| **Historia** | 4 | Introducción y «Empezar el recorrido». Al empezar, la ventana se cierra y el recorrido sigue en una **tarjeta pequeña arriba** (título, una frase, ◀ ▶, ×), como el registro de misiones de un juego |
| **Gente** | 5 | Lista (tú, y los demás con «Ir con» y Bloquear) · «Visita libre: sin voz» |
| **Chat** | T · 6 | Flotante y movible ([§6](#6-el-chat-movible)) |
| **Ayuda** | F1 | Qué es medido/deducido/ilustrativo · teclado · táctil · mando · «Volver a ver los consejos de inicio» |

«+6 h» y «Mañana a las 12:00» se quitan: el deslizador y «Ahora» bastan. «Leer de Vigía/OlivarTrack» se quedan dentro de su ventana.

### 4.5 Menú y Configuración (☰ o Esc)

Diálogo **modal** (`<dialog>` nativo: atrapa el foco y Esc lo cierra) con «▶ Volver a la finca» arriba y pestañas (patrón ARIA, flechas, Inicio, Fin). Se guarda al momento en `localStorage` (con `try/catch`; si falla, dura la visita). Misma estructura que [UX.md §4.11](UX.md#411-configuración), recortada a lo que la finca tiene hoy:

| Pestaña | Ajustes |
|---|---|
| Gráficos | Calidad **Automática** (recomendada) / Baja / Media / Alta (hoy «Calidad del follaje») · Ahorro de batería (30 fps) |
| Vista | **Relieve exagerado** · **Corrección de la ortofoto** (con su explicación: ajuste medido, no ortorrectificación) · Mostrar la brújula · Superficie en ha / m² |
| Sonido | Sonido ambiente (uno solo: se quitan el 🔊 y la casilla duplicada) · Volumen |
| Controles | Controles táctiles Automático / Siempre / Nunca · **Mano** diestra / zurda · Sensibilidad al mirar · Invertir eje vertical · «Ver todos los atajos» |
| Comodidad VR | Giro 30° / 45° / suave · Viñeta suave / fuerte / apagada · Permitir vuelo (A) y mirador (B) · Postura de pie / sentado |
| Accesibilidad | Tamaño del texto 100–200 % · Alto contraste en el HUD · Movimiento: sistema / reducido / normal |
| Avanzado | **Contador de rendimiento** (= `?debug`) · **Medir 60 s** (solo con el contador) · Devolver el chat y el mapa a su sitio · Restablecer la configuración |
| Créditos y fuentes | Atribución completa (IGN-CNIG CC BY 4.0, Copernicus, ISRIC CC BY 4.0) y la leyenda medido/deducido/ilustrativo |
| Acerca de la finca | El título y el párrafo de la cabecera de hoy y la nota del pie («modelo de trabajo, no una medición topográfica») |

Los parámetros de URL (`?debug`, `&mide=N`, `?escena=…`, `?presencia=…`) siguen funcionando igual: las pruebas y el protocolo de T7 no cambian.

### 4.6 Pantalla completa

- **Siempre**: la página ocupa la ventana (`height: 100dvh`, `overflow: hidden`), con márgenes de zona segura.
- **⛶ / F**: `element.requestFullscreen({ navigationUI: "hide" })` sobre el visor, con gesto del usuario (regla 6 de `interaccion`). Funciona en Chrome, Edge y Firefox de escritorio y en Chrome de Android. En **iPad** con Safari existe (con prefijo `webkit` en versiones antiguas).
- **iPhone: no existe** para una página (Safari solo deja poner a pantalla completa un `<video>`). Allí ⛶ explica «Compartir → Añadir a pantalla de inicio» y la web se abre como aplicación sin barras gracias a un **manifiesto** (`display: "fullscreen"`, con `standalone` de reserva) y `apple-mobile-web-app-capable`. **[SUPUESTO]** que el aspecto en modo aplicación del iPhone sea aceptable: no probado.
- **Esc en pantalla completa**: el navegador lo usa para salir y la página no lo recibe. En Chrome y Edge de escritorio se puede pedir `navigator.keyboard.lock(["Escape"])` (Keyboard Lock API) para que Esc abra el menú y haga falta **mantenerlo** para salir; en el resto, el primer Esc saca de la pantalla completa (y se acepta). La orientación (`screen.orientation.lock`) **no** se bloquea: se deja girar.

### 4.7 Teclado y mando

Las teclas de letra solo funcionan con el foco en el mundo, nunca en un campo (WCAG 2.1.4); las flechas en una pestaña o un menú navegan, no mueven.

| Tecla | Acción | Hoy |
|---|---|---|
| W A S D / flechas | andar y girar (en vista aérea, desplazar) | igual |
| Mayús | correr | igual |
| **Intro** | en vista aérea: **pasear aquí**; con dron: aterrizar | nuevo en vista aérea |
| **Inicio** o **0** | volver a la **vista aérea** | hoy lo hace Esc |
| Q · E · V | quad · dron · primera/tercera persona | igual |
| Espacio / C · L | dron: subir / bajar · aterrizar | igual |
| **1–6** | mapa, capas, tiempo, historia, gente, chat | nuevo |
| M · T · H | minimapa · chat · ficha de la haza donde estás | M y H iguales; T como en UX.md |
| **P** (paseando) | saca o quita la **lámina de la previsión** en el mundo ([§4.11](#411-el-tiempo-en-un-mundo-3d-de-la-ventana-a-la-lámina)); en vista aérea, un aviso | nuevo |
| F · F1 | pantalla completa · ayuda | nuevo |
| **Esc** | cierra lo último abierto (menú desplegable → ficha → ventana → recorrido); si no hay nada, **abre el menú** | hoy sale del paseo y de la pantalla completa |
| ← → (con el recorrido abierto, en vista aérea) | escena anterior / siguiente | igual |

**Mando de juego** (Gamepad API, mapeo `standard`; **no existe hoy en pantalla**, propuesta): palanca izquierda andar · palanca derecha mirar · A acción (pasear aquí / aterrizar / pulsar) · B cerrar · X correr · Y mapa · LB/RB ventana anterior/siguiente · Menú: menú · Vista: ayuda · cruceta arriba/abajo: quad/dron. En VR siguen los mandos de [VR.md](VR.md).

### 4.8 Estados: qué muestra el HUD en cada modo

| | Vista aérea | A pie | Quad | Dron | VR |
|---|---|---|---|---|---|
| Selector de modo | 🛰 | 🚶 | 🏍 | 🚁 | (fuera de la pantalla) |
| Abajo centro | «Pasear aquí», atribución | — | — | — | — |
| Cruceta (táctil) | no | sí | sí | sí (+ Subir/Bajar) | no |
| Acciones (táctil) | no | Correr, Cámara, Quad, Dron | Cámara, Quad, Dron | Aterrizar aquí, Quad, Dron | no |
| Arriba centro | avisos | avisos | avisos | telemetría + avisos | — |
| Minimapa por defecto | oculto la primera vez | visible | visible | visible | en el panel |
| Toque corto en el mundo | ficha del olivo / haza | ficha | ficha | **anillo de llegada** ([UX.md §5.9](UX.md#59-ir-a-un-punto-desde-el-aire-el-anillo-de-llegada-vr-y-dron)) | gatillo |

Cada cambio de modo deja el estado limpio (soltar teclas, avisar a la fauna) como hoy en `24_pantalla.js`; con **movimiento reducido** la bajada volando al pasear se cambia por un fundido corto.

**VR**: el panel flotante (Y) se reordena como la barra: pestañas **Mundo** (modo, hora, fecha), **Ir a** (parcelas y gente con «Ir con») y **Comodidad** (viñeta, giro, sonido, exageración); «Salir de VR» siempre abajo; **«Medir 60 s» solo con `?debug`** (hoy está siempre). La maqueta solo lo dibuja (botón «Panel VR (dibujo)»).

### 4.9 Honestidad: medido / deducido / ilustrativo (regla 5)

| Dónde | Cómo se ve |
|---|---|
| Ventana Capas | Cada capa con su etiqueta: linde y copas *medido* · guardados *guardado (OlivarTrack)* · NDVI y tinte *deducido* · paisaje *deducido* · hierba y fauna *ilustrativo* |
| Fichas (olivo, haza, baliza) | Cada fila con etiqueta y de dónde y de cuándo es («Altura de copa 3,4 m · medido · LiDAR 2024»; «Troncos y ramas · ilustrativo») |
| Leyenda NDVI en el HUD | «relativo a esta finca y fecha · sin calibrar» |
| Ventana Tiempo | De cuándo es el dato de Vigía; «Probar un efecto» rotulado «no es el tiempo real»; nota de interpretación |
| Mapa ampliado | Lo medido con *medido*; suelo con *modelo SoilGrids 250 m · no es una analítica* |
| HUD | «ⓘ qué es medido» en la línea de atribución; Ayuda y Créditos con la leyenda completa |

Las etiquetas **no** se pueden apagar en Configuración.

### 4.10 Accesibilidad
- Objetivos **≥ 44 × 44 px** (cruceta y acciones 52 px; en Quest 56 px, como [UX.md §7](UX.md#7-accesibilidad)); texto base 15–16 px escalable al 200 %.
- **Foco visible** de 3 px en ámbar (`:focus-visible`), que se ve sobre cielo y sobre olivar; el foco va a la ventana al abrirla y vuelve al botón al cerrarla.
- **ARIA**: iconos con `aria-label` y la tecla en `title`; `aria-expanded`/`aria-controls` en los que abren ventanas, `aria-pressed` en los interruptores (mapa, chat), pestañas con su patrón, `role="status"` en los avisos, `aria-live` en el chat.
- **Contraste**: el HUD y las ventanas usan «cristal oscuro» (fondo ≈ 80–94 % opaco con desenfoque) y texto claro: se lee igual sobre cielo claro que sobre el olivar; alto contraste opcional (fondo negro opaco y bordes blancos).
- **Movimiento**: `prefers-reduced-motion` y el ajuste propio (sistema / reducido / normal) quitan animaciones del HUD y cambian la bajada volando por un fundido.
- **Arrastrar tiene alternativa sin arrastrar** (WCAG 2.5.7): el chat y el minimapa se mueven con las flechas desde su agarre y con «⋯ Llevar a…» (cuatro esquinas o su sitio de partida).

### 4.11 El tiempo en un mundo 3D: de la ventana a la lámina

**Revisión (2026-10-30, leído del código).** En pantalla, el tiempo se cuenta tres veces: el **mundo** lo simula (nubes, lluvia, viento en las copas: `15_tiempo.js`), la **chapita** del HUD (`#tIns`) lo resume en una línea con una flecha de hacia dónde sopla, y la **ventana Tiempo** (3) trae las tarjetas de la estación (*medido*) y de la previsión (*modelado*). En VR solo queda el mundo: la chapita y la ventana son HTML y **no se ven en las gafas**, y el panel no tenía nada del tiempo; no había forma de leer la previsión con el casco puesto. Además, de paso: la flecha de la chapita gira con `orb.az` también al pasear (con el paseo manda `pp.ang`), y el gráfico de la ventana pinta `dentroDeUmbrales` (lo lleva el otro trabajo de `/api/tiempo`).

**Propuesta.** Lo que en pantalla es una ventana, en el mundo es un **objeto del mundo**: una **lámina** que se saca cuando se pide, se planta delante a la altura de los ojos y se queda **anclada al sitio** (no pegada a la cabeza, que marea y tapa), girándose despacio hacia quien la mira, como un cartel de campo; se lee de pie a 1-2 m y se deja atrás al irse (a más de 40 m en VR o 60 m en pantalla se cierra y se libera). Cuenta lo mismo que la ventana pero en **tarjetas grandes** y sin gráficos finos: **Ahora** (temperatura, humedad y lluvia *medidas* en la estación, con «estación a X km, hace N min»; cielo y viento de la previsión, porque el anemómetro está descartado por Vigía) y las **próximas horas** por bloques de 3 h hoy y por días después (*modelado*: «por finca, rejilla de ~5 km»), cada una con el cielo **dibujado** (sin emoji: sale igual en las Quest), la temperatura, la probabilidad y los mm de lluvia y el viento con una **flecha que apunta de dónde viene, orientada en el mundo** (arriba en la lámina = hacia donde miras a través de ella; por eso la lámina sabe hacia dónde está girada y redibuja las flechas al cambiar 15°). La honestidad va en la propia lámina: *medido* / *modelado*, y con datos simulados un rótulo ámbar «SIMULADO · no es el tiempo real». **Nada de umbrales ni de «se puede tratar»**: la lámina no lo cuenta (regla 1 de Vigía). En VR el resumen grande vive en la pestaña **Mundo** del panel (el tiempo es cómo está el mundo, como la hora y la fecha; se ve nada más entrar; y una cuarta pestaña estrecharía las tres de 1 m) con **«Ver previsión»** (444 × 72 px, 7 cm de alto), que saca la lámina y cierra el panel para verla (Y lo vuelve a abrir); en pantalla, **P** paseando, o el botón «Ver la previsión en el mundo» de la ventana Tiempo (evento `prevision:alterna` del Bus, [eventos](../../contratos/eventos.md); desde C3 la lámina es un componente, [ADR-0023](../adr/0023-componentes-del-mundo.md)).

| | Lo que hay (`35_fichas_tiempo.js`, `29_vr.js`) |
|---|---|
| Datos | `TiempoVivo.lee()` cuando el motor lo exponga; si no, un respaldo **simulado** con la misma forma (ningún valor de la explotación) |
| Lámina | 1,3 × 0,89 m, canvas de 1.024 × 704 (788 px/m): letra mínima 24 px (3 cm de cuerpo), cifras de 36-84 px; a 1,4 m en VR y 2,4 m en pantalla; gira a lo sumo 60°/s y solo si se ha desviado más de 8° |
| Presupuesto | **1 malla** (1 llamada de dibujo) y **1 textura** de 2,9 MB sin mipmaps; se crea al abrir y se libera entera al cerrar; el canvas se repinta solo si cambia lo que se ve (datos, el minuto de «hace», la hora del bloque o 15° de rumbo) |
| Pruebas | `pruebas/guardianes/fichas_tiempo.test.js`: maqueta, iconos, flecha, firma y liberar en Node; en el navegador, P en escritorio (llamadas y texturas) y, con `GEMELO_VR=1`, «Ver previsión» en la VR simulada |

**No probado:** nada en unas Quest ni en un móvil: si se lee a 1-2 m, si el giro de la lámina incomoda, si la flecha «arriba = hacia donde miras» se entiende sin explicarla, ni cuánto cuesta subir la textura en el casco.

## 5. Antes → después, elemento por elemento

Los números son los del [inventario](#2-inventario-de-lo-que-se-ve-hoy). HUD = se queda a la vista; Ventana X; Config = Configuración; Quitar = desaparece (con su motivo).

| # | Hoy | Después |
|---|---|---|
| 1 | Cabecera | Config → Acerca de la finca (y el `<title>`) |
| 2 | Pie | HUD: línea de atribución corta · Config → Créditos (completa) · Acerca de la finca (resto) |
| 3 | Visor en una caja | **Toda la ventana** |
| 4 | Brújula que oculta el minimapa | HUD: brújula que gira y lleva al norte; el minimapa tiene su propio icono |
| 5 | Tiempo al instante | HUD: chip del tiempo (abre Tiempo) |
| 6 | Minimapa | Ventana Mapa (flotante, movible, con Ampliar) |
| 7 | 🔊 · ⛶ · 🚶 Pasear | 🔊 → Config → Sonido · ⛶ → HUD (barra) · Pasear → HUD (abajo centro y selector de modo) |
| 8 | Entrar en VR | HUD: selector de modo (solo con WebXR) |
| 9 | Telemetría del dron | HUD: arriba centro (solo con dron) |
| 10–11 | Textos de ayuda fijos | **Quitar** del HUD → 3 consejos la primera vez + Ventana Ayuda |
| 12 | Cruceta (a la derecha, también en el ordenador) | HUD solo táctil: cruceta a la izquierda, acciones a la derecha |
| 13 | Ficha de olivo / haza | HUD contextual, con etiquetas de procedencia |
| 14 | Ficha y aviso de baliza | HUD contextual (misma zona que la ficha) |
| 15 | Contador `?debug` | Config → Avanzado (y `?debug` igual); en táctil, arriba, no en las esquinas de abajo |
| 16 | Caja del medidor | Config → Avanzado (solo con el contador) y `&mide=N` igual |
| 17 | Panel Gente y chat | Ventana Gente + **chat flotante movible** ([§6](#6-el-chat-movible)) |
| 18 | Velo del fundido | Igual |
| 19–20 | Tiempo: estado, Vigía, Momento, Ahora, +6 h, Mañana 12:00, Reproducir | Ventana Tiempo → Ahora; **se quitan** «+6 h» y «Mañana a las 12:00» (el deslizador ya lo hace) |
| 21 | Fecha de la hierba (`hSel`) | Ventana Tiempo → El olivo: **una sola fecha del campo** con `ndviSel` |
| 22 | Probar un efecto | Ventana Tiempo, plegado y rotulado «no es el tiempo real» |
| 23–24 | Tarjetas y nota del tiempo | Ventana Tiempo (pestañas) |
| 25 | Historia | Ventana Historia para empezar → tarjeta de recorrido arriba |
| 26 | Parcelas | Mapa ampliado: lista con «Ir» y «Cifras» |
| 27 | Vista (Nube / Gemelo / Ortofoto) | Ventana Capas, arriba |
| 28 | Relieve exagerado | Config → Vista |
| 29 | Corrección de la ortofoto | Config → Vista |
| 30 | Hora del día (oculta) | Igual (la usa el panel VR); la hora la manda Tiempo |
| 31 | Calidad del follaje | Config → Gráficos («Automática» por defecto) |
| 32 | Volver a la vista inicial | Mapa ampliado («Ver toda la finca desde arriba») y tecla Inicio |
| 33 | Pasear / Quad / Dron de la columna | **Quitar** (duplicados del selector de modo, la cruceta y Q/E) |
| 34 | 10 capas + Sonido ambiente | Ventana Capas (agrupadas Datos / Ambiente); Sonido → Config |
| 35 | Suelo · SoilGrids | Mapa ampliado (con *modelo*) |
| 36 | Vegetación · NDVI | Capas (fecha bajo la capa) + leyenda en el HUD + evolución en el Mapa ampliado |
| 37 | Lo medido | Mapa ampliado (de la parcela elegida o de toda la finca) |
| 38 | Panel VR | Pestañas Mundo / Ir a / Comodidad; Medir solo con `?debug` |
| 39 | Fichas VR | Igual |

**Resultado:** en escritorio, en vista aérea, quedan a la vista **13 controles** (brújula, modo, chip del tiempo, 9 iconos, Pasear) más la atribución y el minimapa; en el móvil, 8.

## 6. El chat movible

**Qué pidió Antonio**: que el chat, abierto o minimizado, no tape los controles de movimiento y se pueda mover.

- **Abierto**: ventana flotante (300 × 300 px como máximo, el 46 % del alto en pantallas bajas) con una **barra superior que es el asa** (⠿ agarre, título, ⋯ «Llevar a…», – minimizar). Se arrastra con ratón, dedo o lápiz (Pointer Events con `setPointerCapture`; `touch-action: none` solo en el asa, para que la lista se pueda desplazar).
- **Minimizado**: **burbuja** de 56 px con el número de no leídos; **también se arrastra**; un toque sin mover (< 6 px) la abre. Con teclado, Intro o Espacio.
- **Recuerda su sitio** en `localStorage` (`gemelo.chat.pos.<forma>`, en fracciones del ancho y el alto, con `try/catch`), uno por forma de pantalla: escritorio, vertical y horizontal (el sitio que vale en vertical no vale al girar).
- **Zonas que nunca tapa**: la cruceta, las acciones, la barra de iconos, el estado y «Pasear aquí» (cada una con 6 px de margen). Al soltar, al girar la pantalla, al cambiar de modo (aparece la cruceta) o al abrir una ventana, si se cruza con alguna, **se aparta al sitio libre más cercano** (prueba encima, debajo, a los lados de cada zona y una rejilla de reserva) y lo dice con un aviso corto. Mientras se arrastra se dibujan las zonas.
- **Sitio por defecto, nunca encima de la cruceta**: escritorio, abajo a la izquierda (allí no hay cruceta); táctil, a la izquierda por encima de la cruceta; la burbuja, en el borde izquierdo a media altura. En horizontal, donde no cabe entre la cruceta y el estado, va al centro.
- **Sin arrastrar** (WCAG 2.5.7): desde el agarre, flechas (16 px; con Mayús, 64 px) e Inicio (sitio de partida); «⋯ Llevar a» con las cuatro esquinas y «Donde estaba al principio»; Configuración → Avanzado → «Devolver el chat y el mapa a su sitio».
- **Escribir no mueve al paseante** (como hoy, `stopPropagation`); Esc en el campo minimiza. El chat sigue sin guardarse (decisión 40) y todo el texto entra con `textContent`.
- El **minimapa** usa la misma pieza (asa propia, mismas zonas, mismo guardado).

## 7. Librerías (regla 12)

| Necesidad | Propuesta | Por qué |
|---|---|---|
| Arrastrar chat, burbuja y minimapa | **`@neodrag/vanilla`** (MIT, sin dependencias, unos pocos kB; mantenida) con `handle`, `bounds` y `onDragEnd`, importada con `import()` como ya se hace con `livekit-client` | Resuelve puntero, táctil, límites y el umbral de arrastre. **La lógica de «zonas que no se tapan» la hace el gemelo** (≈ 40 líneas): ninguna librería de arrastre evita varios rectángulos a la vez. Versión: se fija la última estable al instalarla (no se ha elegido aún; [SUPUESTO] que su API de 2.x sirve tal cual) |
| Alternativa al arrastre | Pointer Events del navegador (lo que usa la maqueta, ≈ 30 líneas) | Si Antonio prefiere no sumar dependencia: el arrastre en sí es pequeño y estándar |
| Diálogo modal del menú | `<dialog>` nativo | Atrapa el foco y gestiona Esc sin librería |
| Pestañas y menús | Patrón ARIA a mano (≈ 20 líneas) | Una librería de componentes (p. ej. un sistema de diseño completo) pesa mucho más que lo que ahorra aquí |
| Joystick analógico táctil (si se elige en vez de la cruceta) | **`nipplejs`** (MIT) | La librería de referencia para palancas virtuales; [SUPUESTO] su mantenimiento actual, revisar al instalar |
| Pantalla completa, bloqueo de Esc, mando | Fullscreen API, Keyboard Lock API, Gamepad API del navegador | Son del navegador; no hace falta librería |

La maqueta no usa ninguna dependencia (un solo fichero, sin red).

## 8. Decisiones para Antonio

Cada una con la recomendación del diseño. Ninguna está tomada; si se aprueban, van a [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md) con su número.

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | **La página entera es el visor** (fuera cabecera, pie y columna) | a) sí, `/finca/` es un juego a pantalla completa · b) mantener una versión «página» con desplazamiento | **a**: lo pedido; la cabecera y el pie pasan a «Acerca de» y «Créditos» |
| D2 | **Esc** | a) cierra lo último y, si no hay nada, abre el menú (convención de juego); salir del paseo con Inicio/0 o el selector · b) como hoy: Esc sale del paseo | **a**: un solo significado; el menú tiene «Volver a la vista aérea» |
| D3 | **Controles táctiles** | a) cruceta a la izquierda y acciones a la derecha (pulgares), solo en pantallas táctiles · b) palanca analógica (`nipplejs`) a la izquierda · c) como hoy | **a** ahora (es lo que ya funciona, solo cambia de sitio) y **b** como prueba después, con «Mano zurda» para invertir |
| D4 | **Chat y Gente** | a) chat flotante y movible + ventana Gente aparte · b) un cajón con pestañas Haza/Chat/Gente (UX.md, decisión de diseño 10) | **a** para la finca: se charla mientras se anda y el chat debe poder quedarse a la vista y pequeño; Gente y Haza son de consultar. Se apunta en UX.md si se aprueba |
| D5 | **Una ventana grande a la vez** | a) sí (más el minimapa y el chat flotantes) · b) varias ventanas abiertas y movibles | **a**: más sencillo, cabe en el móvil y no tapa el mundo |
| D6 | **Fecha única del campo** (hierba, estación y NDVI con un solo deslizador) | a) unificar · b) dejar dos | **a**: hoy se sincronizan a mano y confunden |
| D7 | **Quitar** «+6 h», «Mañana a las 12:00», los botones Pasear/Quad/Dron de la columna, el 🔊 duplicado y los textos de ayuda fijos | a) quitar · b) mantener alguno | **a** |
| D8 | **iPhone sin pantalla completa** | a) manifiesto de aplicación web + «Añadir a pantalla de inicio» · b) aceptar las barras de Safari | **a** (barato y reversible); probar en un iPhone antes de darlo por bueno |

## 9. Plan de implementación por tareas

**Después de T8** (no ahora: T8 toca `apps/web/plantilla.html` y `apps/web/motor/`). Cada tarea, en un commit con su prueba y su nota de comodidad (regla 11), pasando la puerta. Módulos nuevos en el hueco 31–89 (después de `30_mide.js`, porque consumen casi todo). Las pruebas que hoy buscan ids de la plantilla (`escena3d.test.js`, `llegada.test.js`, `presencia_dev.test.js`, `prueba_arb.js`) se mantienen verdes **conservando los ids** de los controles que se mueven (los controles cambian de sitio, no de nombre) hasta que se cambien en su misma tarea.

| Tarea | Qué | Ficheros | Comprobación |
|---|---|---|---|
| **U1 · Lienzo a pantalla completa** | `plantilla.html` pasa a visor a toda la ventana (`100dvh`, zonas seguras, sin desplazamiento); cabecera y pie a un `<dialog>` de menú (aún con solo Créditos y Acerca de); la columna lateral y las secciones de tiempo e historia se esconden **sin borrarse** (sus controles siguen existiendo para los módulos) | `apps/web/plantilla.html`, `24_pantalla.js` | nueva prueba de Node sobre la plantilla (sin Chrome): sin desbordamiento declarado, ids conservados; e2e `web` y `carga` verdes; captura a 1280 × 800 y 390 × 844 por el banco |
| **U2 · HUD y barra de iconos** | Módulo `31_hud.js`: estado (brújula, selector de modo, chip del tiempo), barra, avisos, «Pasear aquí», atribución; el selector llama a lo que ya existe (`btnPaseo`, `ponQuad`, `ponDron`, VR) | `apps/web/motor/31_hud.js`, `plantilla.html`, `17_minimapa.js` (la brújula deja de ocultar el mapa), `29_vr.js` (su botón entra en el selector) | contrato del módulo (`contrato_modulos.js --escribe`); prueba de Node: cada botón tiene nombre accesible y ≥ 44 px declarado; e2e: Intro pasea, Inicio vuelve |
| **U3 · Ventanas** | Módulo `32_ventanas.js` (abrir/cerrar, una a la vez, hoja/lateral según tamaño, foco, Esc); Capas, Tiempo (pestañas; fecha única), Historia (tarjeta de recorrido), Ayuda, Mapa ampliado (parcelas, lo medido, suelo); **se mueven** los nodos de hoy dentro de las ventanas para no reescribir `13_parcelas.js`, `15_tiempo.js`, `14_historia.js`, `10_ndvi.js` | `32_ventanas.js`, `plantilla.html`, `14_historia.js`, `21_suelo.js`/`23_estacion.js` (fecha única) | e2e: abrir cada ventana con su tecla y su icono, Esc cierra, el foco vuelve; capas siguen funcionando (`escena3d`, `web`) |
| **U4 · Configuración** | Módulo `33_ajustes.js`: pestañas, guardado en `localStorage`, aplicar calidad (Automática = perfil adaptativo de pantalla, ver `videojuegos`), relieve, corrección, sonido único, controles táctiles, mano, sensibilidad, accesibilidad, contador (= `?debug`) y medidor | `33_ajustes.js`, `28_depura.js`, `30_mide.js` (sus cajas solo con el ajuste o la URL), `20_sonido.js`, `09_camara.js` | prueba de Node del guardado y de los valores por defecto; `mide.test.js` sigue verde con `&mide` |
| **U5 · Táctil y pulgares** | Cruceta a la izquierda, acciones a la derecha, solo con `pointer: coarse` (o el ajuste); «Mano zurda» | `plantilla.html`, `12_paseo.js`, `16_vida.js`, `12b_llegada.js` | `llegada.test.js` verde; e2e con `hasTouch` a 390 × 844 y 844 × 390: la cruceta no se cruza con nada |
| **U6 · Chat movible** | Pieza `movible()` + zonas que no se tapan en `34_movibles.js` (con `@neodrag/vanilla` por `import()`, o Pointer Events: D-librería), usada por el chat y la burbuja de `26_presencia.js` y por el minimapa; guardado por forma de pantalla | `34_movibles.js`, `26_presencia.js`, `17_minimapa.js`, `apps/web/package.json` si se usa la librería | prueba de Node del cálculo de sitio libre (rectángulos); e2e con `?presencia=sim`: arrastrar el chat encima de la cruceta y comprobar que acaba fuera; girar y comprobar; teclado |
| **U7 · Pantalla completa y teclado** | ⛶/F con Fullscreen API, Keyboard Lock en Chrome/Edge, aviso del iPhone, manifiesto web; mapa de teclas nuevo (1–6, Intro, Inicio, F, F1, Esc) | `24_pantalla.js`, `31_hud.js`, `apps/web/plantilla.html`, `apps/web/vite.config.js` (manifiesto) | e2e: teclas; `?debug` sin cambios; nota «no probado en iPhone» |
| **U8 · Panel VR** | Pestañas Mundo / Ir a / Comodidad; Medir solo con `?debug`; ajustes de Comodidad VR leídos de Configuración | `29_vr.js` | `vr.test.js` y `vr_gente.test.js` (con `GEMELO_VR=1`, por el banco); `CONTRATOS.md` si cambia el mapa de botones |
| **U9 · Mando de juego** (opcional) | Gamepad API con el mapeo de [§4.7](#47-teclado-y-mando) | `apps/web/motor/35_mando.js` | prueba con un `navigator.getGamepads` simulado |
| **U10 · Documentación** | `UX.md` (decisión D4), skill `interaccion` (mapa de entradas), `CONTRATOS.md` si cambian mandos, CHANGELOG por tarea, ESTADO al acabar | `doc/sistema/UX.md`, `.claude/skills/interaccion/SKILL.md`, `doc/sistema/CONTRATOS.md` | `documentacion.test.js` |

Presupuesto de dibujo: el HUD es HTML/CSS, no toca triángulos ni llamadas; el desenfoque del cristal (`backdrop-filter`) puede costar en móviles flojos: medir con `?debug` en un aparato real y, si cuesta, quitarlo (el fondo ya es casi opaco).

## 10. Lo que no está probado

- **Nada con personas** ni en **dispositivos reales** (iPhone, Android, Quest). La maqueta se comprobó en Chrome sin pantalla a tamaño escritorio y con los marcos de móvil vertical y horizontal: carga sin errores de consola, abre ventanas y menú, arrastra el chat encima de la cruceta y lo aparta (ver el [README de la maqueta](../../prototipos/ux-finca-juego/README.md)).
- **Pulgares de verdad**: si la cruceta de 52 px a la izquierda y las acciones a la derecha caen cómodas en un iPhone de 6,1″ y en uno de 6,7″, y en horizontal con las muescas.
- **Fullscreen y modo aplicación en iPhone**, **Keyboard Lock** en Chrome/Edge y el comportamiento de Esc dentro de la pantalla completa.
- **Accesibilidad real**: sin lector de pantalla (NVDA, VoiceOver, TalkBack) ni auditor automático; contraste del cristal oscuro sobre el mundo real (en la maqueta el mundo es un dibujo).
- **Rendimiento**: el coste de `backdrop-filter` sobre el lienzo WebGL, en ningún aparato.
- **VR**: el panel reordenado es un dibujo; nada en unas Quest.
- **Mando de juego**: solo propuesta.
