# ADR-0031 — Migrar al `WebGPURenderer` (backend WebGL) con multiview para VR

- **Estado:** Propuesto
- **Fecha:** 2026-11-04

## Contexto
En el Quest 3, en VR, la mediana va al vsync (14 ms), pero el p95 está en 16-21 ms frente a un objetivo de 13,9 ms. La autopsia de los fotogramas lentos dice que el 93 % son «sin causa» (coste fijo). Con `&xrescala=0.8` el p95 no mejora, así que **manda la CPU**: JS por fotograma (6-8 ms, con `render()` dentro) y el envío de 166-300 llamadas, que son la suma de los dos ojos ([MEDIDAS](../sistema/MEDIDAS.md)). El `WebGLRenderer` clásico de three 0.186.1 dibuja cada ojo por separado y no tiene multiview. Solo lo tiene el `WebGPURenderer` con su backend WebGL (`OVR_multiview2`). Pero ese renderizador no ejecuta `onBeforeCompile` ni `ShaderMaterial` (26 sombreadores propios), dibuja los `Points` de 1 px y añade una pasada de salida con sRGB. Estudio completo: [MULTIVIEW.md](../sistema/MULTIVIEW.md). Antonio ha decidido ir al renderizador nuevo.

## Decisión
Migramos el motor al `WebGPURenderer` de three con `forceWebGL: true`, `multiview: true` y `DirectRenderPipeline`. Lo hacemos por fases (F0-F6 de [MULTIVIEW.md](../sistema/MULTIVIEW.md#4-el-plan-por-fases)): todos los sombreadores pasan por una fábrica única con versión TSL, el renderizador se elige al arrancar (`?render=nuevo` y luego por aparato, primero en VR) y el clásico se retira cuando el nuevo lo iguale. La prueba de humo en el Quest (F2) tiene criterios de abandono fijados antes de medir.

**Enmienda 2026-11-04 (Antonio): dos builds del mismo código fuente** ([MULTIVIEW.md §4.1](../sistema/MULTIVIEW.md#41-dos-builds-del-mismo-código-fuente-decisión-de-antonio-2026-11-04)).
- **Build de pantalla** (escritorio y móvil): three (0.186.1; 0.187 en F3) y migración gradual y sin prisas al `WebGPURenderer` + TSL, material a material.
- **Build de VR** (Quest): el alias `three` → `super-three` (variante MIT de A-Frame, hoy 0.185.0), que trae multiview en el `WebGLRenderer` clásico (`multiviewStereo`) y conserva `onBeforeCompile` y `ShaderMaterial`: el Quest tendría multiview sin esperar a la migración. **Solo se activa si la prueba de humo F2 en el Quest lo justifica.**
- Dos three no pueden convivir en una página: la página elige la build al cargar (el Quest, por la clase de `Aparato`, `01a_aparato.js`; `?build=` la fuerza para probar).
- Mientras dure la migración, cada sombreador tiene dos versiones en la fábrica (`02i_materiales.js`): el GLSL de siempre (clásico y super-three) y la TSL (pantalla con el renderizador nuevo).
- **Salida:** cuando el renderizador nuevo de three haga bien multiview en VR (F2 repetida con la versión de three del momento), el Quest pasa también a TSL, se retira super-three y queda una build.

## Alternativas consideradas
- **Seguir con el `WebGLRenderer` y bajar llamadas** (fusionar, instanciar, `BatchedMesh`, presupuesto por componente en VR): no da el multiview. Se hace igualmente, porque lo que ahorra se suma.
- **`super-three`** (bifurcación MIT de A-Frame, la que usa el IWSDK de Meta), con multiview en el `WebGLRenderer` clásico y sin reescribir sombreadores: implica bajar a 0.185, depender de una bifurcación y convivir con un fallo conocido de subidas de textura aplazadas. Se descartó como destino único; con la enmienda del 2026-11-04 pasa a ser **la build de VR transitoria** (solo el Quest, solo si F2 lo justifica, y con salida fijada), no el destino.
- **Backend WebGPU en XR:** three 0.186.1 apaga ahí el multiview (`XRManager.js:787-793`) y el Quest necesitaría `XRGPUBinding`. Descartado.
- **Escribir nuestro propio multiview sobre el clásico:** sería mantener una bifurcación de three a mano (regla 12). Descartado.

## Consecuencias
- **Positivas:** un dibujo por objeto para los dos ojos, con un ahorro de CPU estimado de 0,8-3,8 ms por fotograma con nuestras llamadas (**[ESTIMACIÓN]**, por medir en F2); capas de cuarto y cilindro hechas (EV2-A5); `reversedDepthBuffer` disponible; los sombreadores, en un solo sitio y sin parches de texto frágiles entre versiones.
- **Negativas / coste:** ~3-4 días de preparación, 1-2 de prueba de humo y ~10-15 días de agente para los materiales (**[ESTIMACIÓN]**); el terreno (`04d`), los olivos generados (`07ab` y su biblioteca) y los impostores (`07ac`) son de dificultad alta; los puntos pasan a *sprites* (hasta ×4 vértices); dos renderizadores conviven unas semanas (paquete más grande, doble mantenimiento); los guardianes de `#include` y de sustituciones se reescriben contra TSL; las cifras de llamadas antes y después no se comparan sin decir el renderizador.
- **Implicaciones futuras:** se sube three a la serie 187 (arreglos de MSAA y XR del backend WebGL) en un commit aparte (F3); TSL cambia de nombres entre versiones, así que la fábrica es el único sitio que lo importa; el visor de la oficina migra al final.

## Comprobación
- F0: la sonda dice si el Quest expone `OVR_multiview2` con `framebufferTextureMultisampleMultiviewOVR`, y el medidor separa los ms de `render()` (el techo del ahorro).
- F2: con 200 llamadas por ojo, «nuevo con multiview» baja el ms de `render()` ≥ 30 % y el p95 ≥ 1 ms frente al clásico, con los dos ojos bien y MSAA y foveación aplicados. Si no, este ADR pasa a rechazado con la medida.
- F1 (hecho en Node): `pruebas/guardianes/materiales_f1.test.js` (equivalencia de la fábrica y trinquete), `pruebas/guardianes/render_f1.test.js` (adaptador de `renderer.info`, `?render=nuevo` reservado, arranque tolerante) y `pruebas/guardianes/builds_f1.test.js` (la build de siempre no cambia; la de VR con el alias a super-three, probada con un stub).
- F1-F6: guardián de trinquete (`onBeforeCompile` y `ShaderMaterial` fuera de la fábrica, solo a la baja), adaptador de `renderer.info` probado en Node, comparación de capturas clásico frente a nuevo por material, topes de `pruebas/presupuesto.json` por renderizador.
- **No probado:** nada en el Quest (ni la extensión, ni el ahorro, ni `DirectRenderPipeline` en XR); el multiview no se puede probar en el banco (SwiftShader y `pruebas/mock_xr.js` no lo tienen); iPhone y escritorio, **no probados** con el renderizador nuevo.


## Resultado de la prueba de humo F2 (2026-11-04)
Medido por Antonio en su Quest 3 (Quest Browser 154) con la página de humo, n = 200 llamadas por ojo ([MEDIDAS](../sistema/MEDIDAS.md#multiview-en-el-quest-3-con-la-página-de-humo-2026-11-04-foto-no-se-mantiene)): el navegador ofrece el multiview sin banderas; `render()` (mediana) clásico 2,0 ms, super-three 2,0 ms, **super-three con multiview 1,1 ms (−45 %)**, `WebGPURenderer` 4,0 ms y con multiview 3,1 ms (y sin foveación en la capa). Se confirma el enfoque de las dos builds: la de VR con super-three y multiview; el renderizador nuevo, solo en la pantalla y sin prisa, a repetir con three 0.187. Falta medir cuánto pesa `render()` en el fotograma del gemelo real (build de VR con `?xrmv=0|1`) antes de pasar este ADR a «Aceptado».
