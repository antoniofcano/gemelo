# Juegos casuales: el anfitrión y «Cae la cosecha»

C9a del plan de componentes ([ADR-0023](../adr/0023-componentes-del-mundo.md)); decisiones 125 (primer casual: piezas del olivar que caen y se juntan de tres en tres) y 136 (en pantalla ya, antes de las entidades y usables; la versión VR, C9b, tras las láminas C8). Idea de partida: [PLAN · Juegos casuales «para volver»](../rumbo/PLAN.md#ideas-de-mejora-sin-fecha-se-convierten-en-tarea-cuando-antonio-lo-diga).

## 1. Piezas

| Pieza | Fichero | Qué es |
|---|---|---|
| Pausa del mundo | `apps/web/motor/02c_componentes.js` (`Pausa`) y `90_final.js` | `Pausa.pon(quien)` / `Pausa.quita(quien)`. Mientras alguien la pide, `cuadro()` no mueve la cámara, no actualiza ningún módulo, no corre la `Cola` ni pinta la escena: solo la fase nueva **`pausa`** de los componentes y el contador de `?debug`. Emite `mundo:pausa`. No se aplica en VR. |
| Anfitrión | `apps/web/motor/40_juegos.js` (componente `juegos`, bandera `?juegos=`) | Icono «Juegos» en la barra (🎲, en «⋯» si la pantalla es estrecha), ventana «Juegos» con una tarjeta por juego (récord y «Jugar»), tecla **J**. Abre el juego a pantalla completa sobre el mundo en pausa, lo cierra con **Esc** o «×» y devuelve el foco a donde estaba. Guarda el récord. |
| «Cae la cosecha» | `apps/web/motor/41_cae_la_cosecha.js` (componente `cae-la-cosecha`, bandera `?cosecha=`) | Las reglas (`CaeLaCosechaPuro`), el dibujo de las piezas (`CaeLaCosechaDibujo`) y la partida en pantalla (teclado, puntero y botones). |
| Récord de la familia | `apps/api/src/juegos/rutas.ts`, `apps/api/migraciones/0009_juegos.sql` | `POST /api/juegos/:id/partidas` y `GET /api/juegos/:id/records` ([api.openapi.yaml](../../contratos/api.openapi.yaml)). |
| Sonidos | `apps/web/motor/20_sonido.js` | Atiende `sonido:juego` (notas cortas sintetizadas; siguen el interruptor y el volumen de siempre). |

Los dos componentes no se nombran: se encuentran por el Bus ([eventos.md](../../contratos/eventos.md)). El juego se ofrece con `juego:ofrece` al montarse; si el anfitrión llega después, este pregunta con `juego:pide` y el juego responde. Al apagarse, el juego emite `juego:retira`. Apagar uno u otro (URL, configuración del servidor, o quitarlo del motor) no rompe nada (lo prueba `componentes.test.js`).

## 2. Contrato juego ↔ anfitrión

Un juego se ofrece con `{ id, titulo, descripcion?, ayuda?, version?, crea(ctx) }`. El anfitrión llama a `crea` con

- `ctx.lienzo`: el `<canvas>` (el anfitrión le da tamaño con `redimensiona`);
- `ctx.mandos`: una caja vacía bajo el lienzo para los botones del juego;
- `ctx.epoca`: la época del olivo de hoy (`?epoca=` o el calendario de la configuración, `Config.tablaEpocas`), o `null`;
- `ctx.semilla`: la de esta partida (`?semilla=N` para las pruebas);
- `ctx.reducido`: `prefers-reduced-motion`.

y recibe una partida con `redimensiona(w, h, dpr)`, `actualiza(dt) → ¿repintar?`, `pinta()`, `tecla(code) → ¿usada?`, `pausa(si)`, `pausada()`, `estado() → { puntos, fin, … }`, `resultado() → { puntos, duracion_s, … }` y `libera()`. Esc y P son del anfitrión (salir y pausa); el resto del teclado se le pasa al juego. El anfitrión pone la barra (título, puntos, récord, «Pausa»/«Seguir», «×») y la pantalla final («Otra partida», «Volver al olivar»).

## 3. «Cae la cosecha»: las reglas

Diseño propio del género «piezas que caen» (ningún juego concreto se reproduce: ni nombre, ni piezas, ni pantallas, ni reglas exactas).

- **Tablero** de 7 columnas × 12 filas. Caen **ramas** de 2 piezas; a partir de los 40 s, algunas de 3 (30 %; 60 % desde los 90 s).
- **Piezas**: aceituna verde, aceituna negra, hoja, piedra y terrón. En floración (épocas `boton`, `flor`, `cuajado`) la **flor** sustituye a la aceituna negra.
- **Mover, girar, bajar, soltar.** El giro es de un cuarto de vuelta sobre la pieza inicial de la rama; contra una pared o una pieza se corre de lado si cabe.
- Al apoyarse, **cada pieza cae por su columna** hasta tocar algo.
- **Regla de juntar: grupo conectado.** Tres o más piezas iguales que se tocan **por un lado** (en línea, en codo o en cualquier forma) se van al capacho. Se eligió frente a «tres en línea» porque es la más clara para abuelos y nietos («si se tocan tres iguales, se van»), no exige ver diagonales ni contar en fila, y toda línea de tres también es un grupo: nunca castiga a quien piensa en líneas.
- Lo de arriba cae y, si al caer se juntan otras, es una **cadena**.
- **Puntos**: 10 por pieza × eslabón de la cadena (hasta ×5), y 10 más por cada pieza de un grupo pasada de tres.
- **Velocidad**: una fila cada 0,8 s al empezar; 0,05 s menos cada 15 s, hasta 0,25 s (a los 2 min 30 s). Con eso y las ramas de 3, la partida dura de 1 a 3 minutos.
- **Fin**: cuando una rama no cabe (su columna está llena o no hay sitio arriba en el centro). La raya discontinua de arriba avisa.
- **Sin castigos ni prisas fuera de la partida**: sin compras, sin anuncios, sin vidas ni esperas; se puede pausar y salir cuando se quiera (una partida a medias no se guarda).

**Dibujo.** Las piezas se dibujan con trazos en el canvas, sin emoji ni fuentes de iconos (se ven igual en todos los aparatos). Cada una tiene **su silueta**, no solo su color: aceituna verde = un óvalo de pie con rabillo; negra = dos aceitunas juntas; hoja = hoja estrecha en diagonal con su nervio; flor = cuatro pétalos en cruz; piedra = polígono de aristas; terrón = contorno de bultos con granos. El borde de cada pieza contrasta al menos 3:1 con su relleno (lo comprueba la prueba). Una sombra discontinua enseña dónde caerá la rama; la siguiente se ve al lado.

## 4. Controles

| Acción | Teclado | Ratón o dedo sobre el tablero | Botones (≥ 56 × 64 px) |
|---|---|---|---|
| Mover | ← → (o A, D) | deslizar de lado: una columna por casilla recorrida | «Izquierda», «Derecha» (mantener repite) |
| Girar | ↑ (o W, X) | tocar (toque corto sin moverse) | «Girar» |
| Bajar una fila | ↓ (o S) | — | «Bajar» (mantener repite) |
| Soltar hasta el fondo | Espacio o Intro | deslizar hacia abajo, deprisa | «Soltar» |
| Pausa | P | — | «Pausa» / «Seguir» |
| Salir | Esc | — | «×» y «Volver al olivar» |
| Abrir los juegos | J (en el mundo) | icono 🎲 de la barra | — |

Con el juego abierto, el teclado se coge en la fase de captura (`keydown` de `window`): no llega al paseo, al HUD ni a las teclas de otros componentes. Se suelta al cerrar. Si la página se oculta, la partida se pausa sola. Si se entra en VR con un juego abierto, se cierra.

## 5. Récord

- **En el aparato**: `localStorage["gemelo.record.<id>"]`, con try/catch (en ventana privada o con el almacén bloqueado, no hay récord local y nada falla).
- **De la familia** (solo si la página la sirve el servidor: `D.base` `/teselas/…` o `?api=`, la misma regla que `/api/config`): al acabar, `POST /api/juegos/<id>/partidas { puntos, duracion_s }` con la sesión del hogar (también la de unas gafas vinculadas: juegan los nietos). La respuesta trae el récord del hogar y si esta partida lo bate. Al abrir la ventana o el juego, `GET …/records`. Sin sesión, sin red o con error, queda el del aparato, sin avisos en la consola.
- **Validación en la api**: el juego tiene que existir; la duración, entre 3 s y 1 h; los puntos, como mucho `base + porSegundo × duración` (para «Cae la cosecha», 1.000 + 200 × s: el juego no da más de ~60 puntos por pieza y una partida real se queda muy por debajo; el mismo tope está en el motor y lo comprueba la prueba). Lo no creíble da 422 y no se guarda. Límite: 20 por minuto por IP y 60 partidas por hora por hogar. No para a quien se empeñe (el juego corre en su aparato): solo las trampas groseras.
- **Solo el propio hogar**: `GET …/records` da el mejor del hogar y cuántas partidas lleva; nada de otras familias. **Pendiente de Antonio** si se comparan récords entre familias (o por alias), y si hay límite de partidas para menores (decisión 45).
- **RGPD**: las partidas salen en `/api/yo/datos` (`partidas_de_juegos`) y se borran con el hogar (cascada). La api solo puede leer y añadir en la tabla.

## 6. Presupuesto (regla 6)

- **Escena 3D**: 0 llamadas y 0 triángulos (los dos componentes declaran presupuesto 0). Con el juego abierto **no hay render** del mundo (0 renders por fotograma) y el último fotograma se queda de fondo bajo la capa.
- **Lienzo 2D**: un `<canvas>` del tamaño de la zona de juego (× `devicePixelRatio`, hasta 2), que **solo se repinta si cambia algo** (la rama baja, un movimiento, un destello).
- **Medida** (2026-10-30, por el banco: Chrome sin pantalla con SwiftShader, Cerro del fixture, 3 s de cada; `ScriptDuration` de CDP entre fotogramas y `renderer.info.render.frame`; vale para comparar, **no** como fps del aparato):

| Escenario | Fotogramas en 3 s | Renders 3D | Llamadas del último render | JS por fotograma | Fase «pausa» | Repintados del lienzo |
|---|---|---|---|---|---|---|
| Escritorio 1280 × 800, mundo | 21 | 21 | 29 | 2,21 ms | — | — |
| Escritorio, juego abierto | 181 | **0** | — | **0,16 ms** | 0,023 ms | 3 |
| Móvil 390 × 780 (×2), mundo | 16 | 16 | 22 | 2,17 ms | — | — |
| Móvil, juego abierto | 180 | **0** | — | **0,17 ms** | 0,031 ms | 3 |

  El juego cuesta unas 13 veces menos JS por fotograma que el mundo que pausa y ninguna llamada de dibujo 3D; con SwiftShader el bucle pasa de ~7 a 60 fotogramas por segundo porque deja de pintar el mundo. Lo comprueba la prueba en cada pasada (`juego_cosecha.test.js`: 0 renders y JS del juego ≤ JS del mundo). **No medido** en un aparato real.

## 7. Nota de comodidad (regla 11)

- **Qué se pensó para mayores y peques**: texto de 16 px o más (puntos a 19 px, la pantalla final a 22-24 px), botones de 56 × 64 px con icono y palabra, la regla más simple posible, una sombra que dice dónde caerá la rama, ninguna cuenta atrás ni castigo por salir, pausa siempre a mano, sonidos cortos y suaves que siguen el interruptor del sonido, y sin depender del color.
- **Qué se probó y dónde**: en Node (reglas con semilla, dibujo con un contexto de mentira, registro con y sin cada componente) y en Chrome sin pantalla por el banco (escritorio con teclado; móvil 390 × 780 con toques y deslizamientos emulados: abrir, jugar, pausar, cerrar, 0 errores, botones ≥ 44 px).
- **No probado**: en un iPhone ni en un Android de verdad (el deslizar y el toque corto, el tamaño real de los botones con el pulgar, Safari), con lector de pantalla, con personas mayores, ni el sonido real. En VR no hay juego (C9b).

## 8. Lo que falta

- C9b: el juego en VR como lámina en el mundo (tras C8).
- La «partida del día» con algo real de la haza, y los avatares de la familia en el juego (decisión 125): por diseñar.
- Récords entre familias o por alias y límite para menores: decisiones de Antonio.
