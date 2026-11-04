# ADR-0031 — Migrar al `WebGPURenderer` (backend WebGL) con multiview para VR

- **Estado:** Propuesto
- **Fecha:** 2026-11-04

## Contexto
En el Quest 3, en VR, la mediana va al vsync (14 ms), pero el p95 está en 16-21 ms frente a un objetivo de 13,9 ms. La autopsia de los fotogramas lentos dice que el 93 % son «sin causa» (coste fijo). Con `&xrescala=0.8` el p95 no mejora, así que **manda la CPU**: JS por fotograma (6-8 ms, con `render()` dentro) y el envío de 166-300 llamadas, que son la suma de los dos ojos ([MEDIDAS](../sistema/MEDIDAS.md)). El `WebGLRenderer` clásico de three 0.186.1 dibuja cada ojo por separado y no tiene multiview. Solo lo tiene el `WebGPURenderer` con su backend WebGL (`OVR_multiview2`). Pero ese renderizador no ejecuta `onBeforeCompile` ni `ShaderMaterial` (26 sombreadores propios), dibuja los `Points` de 1 px y añade una pasada de salida con sRGB. Estudio completo: [MULTIVIEW.md](../sistema/MULTIVIEW.md). Antonio ha decidido ir al renderizador nuevo.

## Decisión
Migramos el motor al `WebGPURenderer` de three con `forceWebGL: true`, `multiview: true` y `DirectRenderPipeline`. Lo hacemos por fases (F0-F6 de [MULTIVIEW.md](../sistema/MULTIVIEW.md#4-el-plan-por-fases)): todos los sombreadores pasan por una fábrica única con versión TSL, el renderizador se elige al arrancar (`?render=nuevo` y luego por aparato, primero en VR) y el clásico se retira cuando el nuevo lo iguale. La prueba de humo en el Quest (F2) tiene criterios de abandono fijados antes de medir.

## Alternativas consideradas
- **Seguir con el `WebGLRenderer` y bajar llamadas** (fusionar, instanciar, `BatchedMesh`, presupuesto por componente en VR): no da el multiview. Se hace igualmente, porque lo que ahorra se suma.
- **`super-three`** (bifurcación MIT de A-Frame, la que usa el IWSDK de Meta), con multiview en el `WebGLRenderer` clásico y sin reescribir sombreadores: implica bajar a 0.185, depender de una bifurcación y convivir con un fallo conocido de subidas de textura aplazadas. Se descarta como destino; sirve como referencia de medida en F2.
- **Backend WebGPU en XR:** three 0.186.1 apaga ahí el multiview (`XRManager.js:787-793`) y el Quest necesitaría `XRGPUBinding`. Descartado.
- **Escribir nuestro propio multiview sobre el clásico:** sería mantener una bifurcación de three a mano (regla 12). Descartado.

## Consecuencias
- **Positivas:** un dibujo por objeto para los dos ojos, con un ahorro de CPU estimado de 0,8-3,8 ms por fotograma con nuestras llamadas (**[ESTIMACIÓN]**, por medir en F2); capas de cuarto y cilindro hechas (EV2-A5); `reversedDepthBuffer` disponible; los sombreadores, en un solo sitio y sin parches de texto frágiles entre versiones.
- **Negativas / coste:** ~3-4 días de preparación, 1-2 de prueba de humo y ~10-15 días de agente para los materiales (**[ESTIMACIÓN]**); el terreno (`04d`), los olivos generados (`07ab` y su biblioteca) y los impostores (`07ac`) son de dificultad alta; los puntos pasan a *sprites* (hasta ×4 vértices); dos renderizadores conviven unas semanas (paquete más grande, doble mantenimiento); los guardianes de `#include` y de sustituciones se reescriben contra TSL; las cifras de llamadas antes y después no se comparan sin decir el renderizador.
- **Implicaciones futuras:** se sube three a la serie 187 (arreglos de MSAA y XR del backend WebGL) en un commit aparte (F3); TSL cambia de nombres entre versiones, así que la fábrica es el único sitio que lo importa; el visor de la oficina migra al final.

## Comprobación
- F0: la sonda dice si el Quest expone `OVR_multiview2` con `framebufferTextureMultisampleMultiviewOVR`, y el medidor separa los ms de `render()` (el techo del ahorro).
- F2: con 200 llamadas por ojo, «nuevo con multiview» baja el ms de `render()` ≥ 30 % y el p95 ≥ 1 ms frente al clásico, con los dos ojos bien y MSAA y foveación aplicados. Si no, este ADR pasa a rechazado con la medida.
- F1-F6: guardián de trinquete (`onBeforeCompile` y `ShaderMaterial` fuera de la fábrica, solo a la baja), adaptador de `renderer.info` probado en Node, comparación de capturas clásico frente a nuevo por material, topes de `pruebas/presupuesto.json` por renderizador.
- **No probado:** nada en el Quest (ni la extensión, ni el ahorro, ni `DirectRenderPipeline` en XR); el multiview no se puede probar en el banco (SwiftShader y `pruebas/mock_xr.js` no lo tienen); iPhone y escritorio, **no probados** con el renderizador nuevo.
