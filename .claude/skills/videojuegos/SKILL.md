---
name: videojuegos
description: Técnicas de videojuego aplicadas al gemelo: bucle y presupuesto de milisegundos por fotograma, streaming de mundo por teselas, colas, LOD y culling por distancia, pooling, estados, vida ambiental (fauna, sonido, huellas) y perfiles de calidad adaptativos. Úsala al tocar el bucle, la Cola, la carga de teselas, la fauna, el paseo, el quad/dron o cualquier cosa que cueste tiempo por fotograma.
---

# Técnicas de videojuego en el gemelo

El gemelo es un **mundo abierto en streaming** que debe sostenerse en un móvil y en un casco. Estas son las prácticas que ya usa y cómo mantenerlas. Mide con [`medir`](../medir/SKILL.md); los fps reales solo los da un dispositivo.

## El bucle (`90_final.js`, `cuadro(t)`)
`dt` acotado a 0,1 s → cámara (VR / paseo / órbita) → tiempo, olivo estacional, vida, minimapa, paisaje, balizas, sonido, suelo, terreno, nube → `Arboles.actualiza` → carga de teselas (cada 0,2 s) → huellas, perros → **`Cola.corre(presupuesto)`** → render. Reglas: el orden importa; nada nuevo debe hacer trabajo pesado sincrónico en `cuadro`; lo pesado va a la `Cola`.

## Presupuesto de tiempo por fotograma (`Cola`, `02b_cola.js`)
- Trabajos pesados = **generadores** con `yield` (cada `yield` es un punto de pausa). `Cola.corre(ms)` hace avanzar el más urgente (menor `prio` = más cerca) hasta agotar el presupuesto.
- Presupuesto dinámico (`Arboles.presupuesto()`): 6 ms (3,5 en paseo); más (12 / 8) si faltan olivos L0 y va holgado; menos (4,5 / 3) si el EMA del fotograma > 34 ms.
- Si un trabajo pasa de ~5 ms entre dos `yield`, trocéalo. Rebanadas medidas (escritorio): ruido 13 ms, nube 12–40, terreno 6, olivos N0 10–20 (en iPhone, ×2–3, **no medido**).

## Streaming de mundo (`02_mundo.js`)
Teselas de 256 m pedidas por cercanía a la cámara, **3 a la vez**, a ≤ 1.800 m; estados `0 ausente → 1 pedida → 2 decodificada → 3 fallo (reintento a 15 s)`. Mientras llega una tesela fina se contesta con el relieve grueso de 8 m: **nunca un hueco**. Con el quad o el dron (10–20 m/s) no se carga a la velocidad de lo que no se podría ver bien. Pendiente: LRU fino de ortofotos (M4).

## LOD y culling
Por **distancia al foco** (no por superficie): terreno 1/2/8 m, olivos L0/L1/L2 con histéresis, nube con `setDrawRange`, ortofotos decodificadas liberadas a > 900 m. Toda cifra nueva con su tope (`pruebas/presupuesto.json`).

## Pooling y memoria
Instancias (`InstancedMesh`) en vez de objetos; buffers reutilizados; **`dispose()` de todo lo que sale** (geometrías, texturas, `ImageBitmap.close()`). Un anillo fijo para huellas (`NH = 900`) y polvo (`NPV = 200`). Vigilar `renderer.info.memory` al ir y volver.

## Vida ambiental (`16_vida`, `25_perros`, `20_sonido`, `22_huellas`, `21_suelo`, `23_estacion`)
Todo **alrededor del jugador** y acotado (radio 55–70 m, ≤ 16.000 matas): ese es el patrón correcto, no simular lo lejano. Pájaros y conejos, perros con comportamiento simple (`amenazaConejo`), audio sintetizado (`AudioContext`, solo si está marcada la casilla de sonido), huellas y polvo según la pendiente y el suelo. Lo que cuesta se apaga primero en VR (`VRP.hierba`).

## Estados y modos
Cámara: órbita → paseo (primera/tercera persona) → quad (`Q`) → dron (`E`) → VR. Cada transición (`24_pantalla.js`) debe dejar el estado limpio: soltar teclas, ajustar `near`, avisar a la fauna (`vidaEntra/vidaSale`).

## «Game feel» sin mareo
Aceleración suave, límites de pendiente, transiciones de cámara con `suave()`, sin sacudidas de cámara; en VR **nada** de movimiento de cámara impuesto (ver [`interaccion`](../interaccion/SKILL.md)).

## Calidad adaptativa
`calidad` (puntos de hoja por árbol) y los **perfiles VR** (`VR_PERFILES`, 4 niveles; baja con JS > 13 ms o fotograma > 15,2 ms; sube tras 25 s con JS < 7 ms). Ojo con la oscilación: histéresis y tiempos. Otros dispositivos no tienen perfil propio: pendiente.

## Antes de dar por bueno un cambio
- [ ] ¿Cabe en el presupuesto de ms (sin bloqueos > 1 rebanada)?
- [ ] ¿Se libera lo que crea?
- [ ] ¿Funciona con la tesela aún sin llegar (relieve grueso)?
- [ ] ¿Se apaga o reduce en VR y en `?debug` se ve?
- [ ] Medido en SwiftShader (recuentos) y **marcado «fps no probado»** si no hay dispositivo.
