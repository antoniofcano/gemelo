# Maqueta · la finca como un videojuego a pantalla completa

Maqueta navegable de la propuesta de interfaz de `/finca/`: el mundo a toda la ventana, un HUD mínimo, una barra de iconos que abre ventanas, un menú de Configuración y el chat movible. El diseño, el inventario de lo que hay hoy, la tabla «antes → después», las decisiones y el plan están en [doc/sistema/UX-FINCA-JUEGO.md](../../doc/sistema/UX-FINCA-JUEGO.md).

**Es una maqueta:** el «mundo» es un dibujo en un lienzo 2D (olivos en perspectiva), no el gemelo, y no dice nada de rendimiento. **Todos los datos son ficticios** (finca de ejemplo, parcelas A–E, alias, cifras, tiempo). No hay red, ni WebXR, ni voz.

## Cómo abrirla
Un solo fichero, sin dependencias ni red: abre `prototipos/ux-finca-juego/index.html` con doble clic (Chrome, Edge, Firefox o Safari recientes: usa consultas de contenedor de CSS). También servida: `python -m http.server 8000` y `http://localhost:8000/prototipos/ux-finca-juego/`.

## El simulador (la barra rayada de arriba, no es parte del producto)

| Control | Qué cambia |
|---|---|
| Ver como | Escritorio (toda la ventana) · Móvil vertical (390 × 844, con muesca simulada) · Móvil horizontal (844 × 390). En móvil salen los controles táctiles |
| Navegador | Chrome/Android (la pantalla completa funciona) · Safari/iPhone (⛶ explica «Añadir a pantalla de inicio») |
| Mundo en red | Enseña u oculta Gente y Chat |
| WebXR disponible | Añade «Entrar en VR» al selector de modo |
| Ver zonas que el chat no tapa | Dibuja en rojo la cruceta, las acciones, la barra y el estado |
| Llega un mensaje | Mete un mensaje en el chat (con el chat minimizado, sube el contador de la burbuja) |
| Panel VR (dibujo) | Cómo quedaría el panel flotante reordenado |
| Borrar lo guardado | Olvida la configuración y el sitio del chat y del mapa |

## Qué probar
- **Moverse**: arrastra en el mundo para mirar; «🚶 Pasear aquí» (o Intro) baja al olivar; W A S D o la cruceta; el selector de arriba a la izquierda cambia entre vista aérea, a pie, quad y dron; Inicio vuelve a la vista aérea.
- **Ventanas**: los iconos de arriba a la derecha o las teclas 1–6, M, T, F1. En móvil vertical son una hoja inferior (la cruceta se esconde); en horizontal, un lateral (la cruceta sigue).
- **Chat movible**: arrástralo por su barra (⠿) encima de la cruceta y suéltalo: se aparta solo. Minimízalo (–) y arrastra la burbuja. Con el teclado: foco en ⠿ y flechas; o «⋯ Llevar a». Cambia de «Ver como»: cada forma de pantalla recuerda su sitio.
- **Menú y Configuración**: ☰ o Esc (cuando no hay nada abierto). Funcionan de verdad en la maqueta: tamaño del texto, alto contraste, movimiento, mano zurda, controles táctiles, sensibilidad, brújula y contador de rendimiento (con cifras inventadas).
- **Honestidad**: toca un olivo (ficha con etiquetas medido/deducido/ilustrativo), mira Capas y la línea «ⓘ qué es medido».

## Qué no simula
El motor 3D, las teselas, el rendimiento, la Fullscreen API dentro del marco de móvil (en «Escritorio» sí pide la pantalla completa real), el bloqueo de Esc, el mando de juego, WebXR, la voz y la red.

## Cómo se comprobó
Con Chrome sin pantalla (playwright-core del repo, por el turno del banco) a 1280 × 800: la página carga sin errores de consola, en las tres formas de pantalla abre las ventanas y el menú, el chat arrastrado encima de la cruceta acaba fuera de ella y la burbuja también. El script vive fuera del repo (no forma parte de la puerta). **No probado:** lectores de pantalla, auditor de accesibilidad, iPhone, Android y Meta Quest.
