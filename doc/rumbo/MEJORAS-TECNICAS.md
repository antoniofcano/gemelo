# Mejoras técnicas del agroverso (hoja de ruta de rendimiento)

Origen: análisis de Antonio del 2026-11-03 («Agroverso: mejoras pendientes»), del que aquí solo se recoge **la parte técnica**; lo comercial y de producto se queda fuera del repo (es público). Se contrastó con el código el mismo día: 32 `frustumCulled = false`, 11 `ShaderMaterial` y 15 `onBeforeCompile` (el análisis dice 17), 9 lecturas de `userAgent` en 8 ficheros del motor, `camera.near = 0.3` en VR y **multiview solo en `WebGPURenderer`** (no está en el `WebGLRenderer` clásico de three 0.186.1). Las cifras de memoria y de ahorro que trae el análisis **no están verificadas**: se medirán (regla 7). Las tareas están en el [PLAN](PLAN.md) con prefijo `AG-`; la parte de medida en el casco, en [OPTIMIZACION](../sistema/OPTIMIZACION.md).

## Criterio de éxito (el mismo de OPTIMIZACION)
72 Hz con p95 ≤ 13,9 ms y menos del 1 % de fotogramas perdidos, con el controlador en el nivel 0 o 1. Primera medida real (Quest 3, 2026-11-02): p95 20,7 ms, no cumple.

## Cómo se trabaja
- Un punto, un commit, puerta verde en cada uno; medida antes y después con lo que SwiftShader sí da (llamadas, triángulos, bytes de textura, tareas largas), **no fps**.
- Tres puntos de vista fijos para medidas y capturas: a pie bajo copa, a 30 m de altura y en el mirador.
- Lo que cambia el aspecto se aprueba con capturas lado a lado (decisión 23).
- Regla 12: librería mantenida antes que código casero, con versión fijada. Nada reabre decisiones cerradas.

## Fase 0 · Preparar la medición
| Id | Mejora | Qué | Tarea |
|---|---|---|---|
| AG-0.1 | Prueba en las Quest por USB | `adb reverse` + `chrome://inspect`; ya estudiado en [IWSDK](../sistema/IWSDK.md) | Q2a, Q2b |
| AG-0.2 | Telemetría de aparato | Hecha en Node (contrato v2 de medidas) | Q0e |
| AG-0.3 | **Módulo único `Aparato`** | Una sola detección (escritorio, móvil, Quest, modelo), capacidades medidas y tabla de política por clase; guardián: nadie más lee `userAgent`. Hoy hay 9 lecturas en 8 ficheros y `07b_arboles` no reconoce las Quest | AG-0.3 |
| AG-0.4 | three 0.187 y 3d-tiles-renderer 0.5.4 | Subida con capturas; revisar `xr.getCamera()` en `04b_escena3d` (en 0.187 devuelve el ojo izquierdo, según el análisis, **sin verificar**). Hoy: three 0.186.1, 3d-tiles-renderer 0.5.3 | AG-0.4 |

Política por clase (de partida): postprocesado solo en escritorio; sombras cortas en móvil y gafas; `alphaToCoverage` con MSAA; presupuesto de olivos 550 k en escritorio y por perfil VR en gafas.

## Fase 1 · Rendimiento sin cambio de aspecto
En gafas **cada llamada de dibujo se paga dos veces** (sin multiview): todo lo que baja llamadas cuenta doble.
| Id | Mejora | Tarea |
|---|---|---|
| AG-1.1 | Texturas KTX2 (ortofotos, atlas, hojas, corteza) | dentro de Q0d |
| AG-1.2 | Geometría meshopt (no Draco: tirones de CPU en Quest) | dentro de Q0d |
| AG-1.3 | Revisar los 32 `frustumCulled = false` uno a uno | AG-1.3 |
| AG-1.4 | Cero reservas por fotograma (temporales de módulo; empezar por 38, 16, 16b; HUD y depuración a 4 Hz) | AG-1.4 |
| AG-1.5 | Carga sin tirones: presupuesto por fotograma compartido, `compileAsync`, prioridad de red | AG-1.5 |
| AG-1.6 | Rayos con `three-mesh-bvh` (tocar olivos, teletransporte, suelo) | AG-1.6 |
| AG-1.7 | Caché de teselas en el aparato (service worker, versión en la URL) | AG-1.7 |

## Fase 2 · Rendimiento con cambio de aspecto (se aprueba con capturas)
| Id | Mejora | Tarea |
|---|---|---|
| AG-2.1 | Transparencias a `alphaToCoverage` (hierba, follaje, ramitas, impostores) | AG-2.1 |
| AG-2.2 | Cartulinas recortadas a la silueta (tubería) | AG-2.2 |
| AG-2.3 | **VR: `near` de 0,3 a 0,05-0,1 y umbral de JS del controlador de 13 a 7-8 ms** midiendo entre fotogramas XR | AG-2.3 — **hecho en Node** (near 0,1 con `?xrnear=`; umbral 8 ms con `escalera.vrJsMs` y `?xrjs=`); no probado en un Quest, el efecto es una hipótesis hasta medir con y sin cambio ([VR.md](../sistema/VR.md#perillas-de-rendimiento-por-url)) |
| AG-2.4 | Confort: fundido a negro de 150-250 ms en mirador y teletransporte, viñeta por defecto, topes de vuelo más bajos | AG-2.4 |
| AG-2.5 | Tone mapping: probar AgX y ACES | AG-2.5 |
| AG-2.6 | Capa quad de WebXR para el panel | dentro de Q0d |

## Fase 3 · El renderizador nuevo (WebGPURenderer, multiview)
Es la única vía a multiview en three. Cuesta reescribir en TSL los 28 sombreadores propios (11 + 17). Riesgo conocido del análisis: con `forceWebGL`, r186 gastaba más CPU por objeto; 0.187 lo ataca y **nadie lo ha medido en una Quest**. Orden: preparar el camino sin cambiar de renderizador (fábrica única de materiales, uniformes por instancia, arranque tolerante a `await renderer.init()`, guardián de `ShaderMaterial` fuera de la fábrica) y, **después de medir las fases 1 y 2**, una prueba desechable de 1-2 días con la hierba en TSL y tres configuraciones (clásico, nuevo sin multiview, nuevo con multiview). Se migra solo si multiview mejora claramente en CPU o fps. Tareas: AG-3a y AG-3b.

## Proceso y calidad
CI sin ejecutar (G1, mientras tanto un hook pre-push con la puerta ligera), Cerro no reproducible (D5), posible fuga al entrar y salir de VR (P4: medir `renderer.info.memory` y el heap tras cada sesión) y evaluar IWER (hecho en Q2d).

## Decisiones técnicas abiertas
| Decisión | Se decide con |
|---|---|
| Migrar al renderizador nuevo (28 sombreadores a TSL) o quedarse en el clásico | La prueba acotada, tras medir las fases 1 y 2 |
| Cambiar de motor (Wonderland, Unity o Godot nativos) | Solo si tras las fases 1-3 no se llega a 72 Hz (Q1) |
| Tone mapping: AgX, ACES o ninguno | Capturas lado a lado |
| r8: ¿radio o diámetro? (hoy `factorR8 = 0,5`) | La superposición con la ortofoto y 10 medidas de campo |

## Descartado (por ahora)
Multiview en el `WebGLRenderer` actual (no existe), postprocesado en gafas (anula la foveación), Draco, `logarithmicDepthBuffer`, giroscopio para mirar en el móvil, `three-mesh-ui` (sin actualizar desde 2023), React Three Fiber, IWSDK para ganar rendimiento ([IWSDK](../sistema/IWSDK.md)).
