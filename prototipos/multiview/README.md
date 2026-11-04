# Humo multiview (F2b) — página desechable

Responde con números a la pregunta de F2 ([MULTIVIEW.md](../../doc/sistema/MULTIVIEW.md), [ADR-0031](../../doc/adr/0031-migrar-al-webgpurenderer-con-multiview.md)): **¿cuánto ahorra el multiview en el Quest 3 con una escena como la nuestra?** Es una página aparte, **sin datos de la finca** (el repo es público): una escena sintética e **ilustrativa** con un número fijo de llamadas de dibujo y de triángulos, tres renderizadores y un medidor dentro de VR. Es desechable: cuando F2 se cierre, se borra o se archiva.

**No probada en el Quest** (regla 7). En este equipo solo se ha comprobado que las tres builds se construyen y llevan cada una su renderizador (`pruebas/guardianes/humo_multiview.test.js`, solo Node). Que la escena se vea bien en un navegador no se ha mirado aún (no se abrió Chrome).

## Los tres modos

Dos three no pueden convivir en una página (sus clases no son las mismas y `instanceof` falla), así que son **tres builds de Vite** de la misma escena. `index.html` + `elige.js` cargan la que pida `?modo=`.

| `?modo=` | three | Renderizador | Cómo se enciende el multiview |
|---|---|---|---|
| `clasico` (por defecto) | three **0.186.1** | `WebGLRenderer` | No existe en el clásico de three (lo quitó en 2020, MULTIVIEW §1.1). Es la referencia: lo que corre hoy en el Quest. |
| `super` | super-three **0.185.0** | `WebGLRenderer` de super-three | `new WebGLRenderer({ multiviewStereo: true })`: `multiviewStereo = false` en `node_modules/super-three/src/renderers/WebGLRenderer.js:86`, que llega a `new WebXRManager( _this, _gl, extensions, multiviewStereo )` (`:565`); allí `scope.isMultiview = useMultiview && extensions.has( 'OCULUS_multiview' )` (`webxr/WebXRManager.js:492`) pide la capa de proyección con `textureType = 'texture-array'` (`:500-504`). `&mv=0` lo apaga. |
| `nuevo` | three **0.186.1** | `WebGPURenderer({ forceWebGL: true, multiview: true })` | `multiview = false` en `three/src/renderers/common/Renderer.js:105` → `new XRManager( this, multiview )` (`:730`); se enciende si hay capas y `renderer.hasFeature( 'OVR_multiview2' )` (`XRManager.js:1253`). `&mv=0`: el mismo renderizador sin multiview (separa el coste del renderizador nuevo del ahorro del multiview). Con `DirectRenderPipeline` por defecto (sin la pasada de salida intermedia, MULTIVIEW §2.4); `&directo=0` la quita. |

En la página, la línea «Sesión XR: multiview activo sí/no» dice si **de verdad** se encendió al entrar (super: `renderer.xr.isMultiview`; nuevo: `renderer.xr.useMultiview()`), con la capa (`XRProjectionLayer` o `XRWebGLLayer`) y su `textureArrayLength` (2 = `texture-array`).

Versiones fijadas en `package.json` de esta carpeta (`three` 0.186.1, `super-three` 0.185.0, `vite` 6.4.5, las mismas que `apps/web`), con su `package-lock.json`. Va aparte de `apps/web` para no instalar super-three en el cliente (eso lo hace F2a) ni tocar su build. Lo que reusa, sin copiarlo (regla 12): los alias de three de `apps/web/herramientas/builds.mjs` (la build `vr` para super-three), la estadística del medidor del gemelo (`MideEst`, trozo puro de `apps/web/motor/30_mide.js`) y la lectura de `renderer.info` para los dos renderizadores (`RenderPuro`, de `02h_render.js`), por el complemento `herramientas/puro.mjs`. Así las cifras se cuentan igual que en [MEDIDAS](../../doc/sistema/MEDIDAS.md).

## Parámetros de la URL

| Parámetro | Por defecto | Qué es |
|---|---|---|
| `modo` | `clasico` | `clasico`, `super` o `nuevo` |
| `n` | 200 | llamadas de dibujo **por ojo** de la escena (10-2000; los casos: 100, 200, 400). Se suma 1 del panel. |
| `tri` | 200000 | triángulos **por ojo** (el gemelo en VR: ~150-300 k) |
| `msaa` | 1 | antialias del contexto y de la capa XR |
| `mv` | 1 | multiview (solo `super` y `nuevo`) |
| `directo` | 1 | `DirectRenderPipeline` (solo `nuevo`) |
| `escala`, `fov` | 0,9 y 1 | `setFramebufferScaleFactor` y `setFoveation`, como el gemelo (Q0b) |
| `seg`, `calent` | 60 y 3 | duración de la medida y calentamiento, en s |

La escena: un suelo con textura (1 llamada, ~25 % de los triángulos), unos `InstancedMesh` Lambert de «copas» (5 % de las llamadas, ~25 % de los triángulos), mallas con un sombreador propio (10 %: `ShaderMaterial` en clasico y super; el mismo cálculo en TSL en nuevo, que no ejecuta `ShaderMaterial`) y el resto Lambert (70 %) y Standard con textura (30 %), un material por cada diez mallas; luz hemisférica y direccional, niebla, **sin sombras**. Todo con `frustumCulled = false`, para que las llamadas no dependan de hacia dónde se mire. El reparto exacto lo da `prototipos/multiview/src/plan.js` y sale en el texto de la medida.

## Construir

```sh
cd prototipos/multiview
npm ci
npm run build            # las tres; o npm run build:clasico | build:super | build:nuevo
```

Sale en `prototipos/multiview/dist/` (no se versiona): `index.html`, `elige.js` y `clasico/`, `super/`, `nuevo/` con un `humo.js` cada una (~0,75-1,1 MB). `HUMO_SALIDA=<carpeta>` cambia la salida.

## Servirla para el Quest

WebXR exige un origen seguro (https o `localhost`). Dos caminos; **no se ha desplegado nada**:

1. **Por USB, sin red ni certificados (el recomendado):** `npm run sirve` (Vite en `http://localhost:4173`), el Quest en modo desarrollador conectado por USB, `adb reverse tcp:4173 tcp:4173`, y en el navegador del casco `http://localhost:4173/?modo=clasico&n=200`. `localhost` es origen seguro, así que WebXR funciona por http. Es el mismo truco que [DESARROLLO-LOCAL](../../doc/operacion/DESARROLLO-LOCAL.md) usa para el entorno local. La depuración remota (`chrome://inspect` en el ordenador) da la consola del casco por el mismo cable.
2. **En el servidor del gemelo, bajo una ruta de pruebas** (p. ej. `/pruebas/humo-multiview/`): copiar `dist/` al servidor y un `handle_path` en el Caddy. La página cumple su CSP (`script-src 'self'`, sin scripts en línea, sin otros hosts, sin trabajadores). **Es desplegar: lo decide Antonio** (regla 9) y no está hecho.

Un túnel (cloudflared, ngrok) también daría https, pero saca la página por un tercero; con el USB no hace falta.

## Cómo se mide en el casco

1. Abrir el caso (tabla de abajo) y pulsar «ENTER VR». La medida empieza sola: 3 s de calentamiento y 60 s de medida. Quieto, mirando al frente (el panel está delante, a 1,6 m).
2. El panel dentro de VR enseña el resultado al terminar; el gatillo la repite.
3. Al salir de VR, el resultado está en la página: **«Copiar»** y pegarlo en el chat (texto plano; no se envía a ningún servidor). También sale en la consola.
4. Con OVR Metrics Tool, a la vez: CPU, GPU y nivel de rendimiento (MULTIVIEW, «Qué mide Antonio en el Quest»).
5. A ojo, en cada modo con multiview: los dos ojos bien colocados (sin ojo corrido ni imagen doble), el borde de las esferas (MSAA) y la foveación.

El texto lleva: el caso y el reparto de la escena; la sonda (`OVR_multiview2` y si trae `framebufferTextureMultisampleMultiviewOVR`, `OCULUS_multiview`, `MAX_VIEWS_OVR`, `createProjectionLayer`, el antialias del contexto); si el multiview se encendió en la sesión y con qué capa; mediana, p95, p99 y peor del intervalo entre fotogramas; ms de JS por fotograma y, dentro, ms de `renderer.render()`; llamadas y triángulos de `renderer.info` (de los dos ojos: sin multiview el clásico cuenta dos por objeto, con multiview una).

## Casos a medir

3 modos con 4 variantes × 3 N × MSAA. Prioridad: **la fila de N = 200 con MSAA** primero (es la de los criterios); luego 100 y 400; `msaa=0` solo si con MSAA algo sale mal o hay tiempo.

| Variante | N = 100 | N = 200 | N = 400 |
|---|---|---|---|
| clásico (`?modo=clasico`) | `&n=100` | `&n=200` | `&n=400` |
| super-three con multiview (`?modo=super`) | `&n=100` | `&n=200` | `&n=400` |
| super-three sin multiview (`?modo=super&mv=0`) | — | `&n=200` | — |
| nuevo sin multiview (`?modo=nuevo&mv=0`) | `&n=100` | `&n=200` | `&n=400` |
| nuevo con multiview (`?modo=nuevo`) | `&n=100` | `&n=200` | `&n=400` |
| nuevo con multiview, sin `DirectRenderPipeline` (`?modo=nuevo&directo=0`) | — | `&n=200` | — |

Cada celda, con `&msaa=1` (por defecto) y, si toca, `&msaa=0`. Son 14 casos con MSAA, de 63 s cada uno más entrar y salir. Los criterios piden **tres repeticiones** de los casos de N = 200 (clásico, nuevo sin y nuevo con multiview); el gatillo repite la medida sin salir de VR. En total, unos 40-60 minutos: si no da tiempo, primero la fila de N = 200.

Lo que dice cada comparación: **clásico frente a nuevo sin multiview** = lo que cuesta de más el renderizador nuevo; **nuevo sin frente a nuevo con** = lo que ahorra el multiview en el nuevo; **clásico frente a super-three con multiview** = lo que ahorra el multiview sin cambiar de renderizador (la build de VR transitoria, MULTIVIEW §4.1); **super-three sin multiview frente a clásico** = lo que pesa bajar a 0.185 y la bifurcación.

## Criterios de F2 (de MULTIVIEW.md, fijados antes de medir)

Copiados tal cual de [MULTIVIEW.md](../../doc/sistema/MULTIVIEW.md#criterios-de-f2-fijados-antes-de-medir); si cambian allí, manda allí.

- **Éxito (se sigue a F3-F4):** con 200 llamadas por ojo, «nuevo con multiview» baja el **ms de `render()`** al menos un **30 %** frente al clásico y el **p95** al menos **1 ms**, sin empeorar la mediana ni la imagen. Tres repeticiones por caso, la misma vista y la línea «Caso: …» del texto anotada.
- **Abandono (se para, el clásico sigue y el ADR pasa a rechazado con la medida):** el Quest no tiene `OVR_multiview2` usable sin banderas; o «nuevo con multiview» no mejora al clásico en ≥ 1 ms de p95 a 200 llamadas; o la imagen sale mal (ojo corrido, MSAA roto) sin arreglo en 0.187.x.
- **Ambiguo** (mejora < 1 ms): se repite con la escena real a medio migrar (terreno y olivos de F4 #1-#3) antes de decidir. No se migra todo a ciegas.

La medida de super-three con multiview sirve para decidir si se activa la build de VR transitoria (MULTIVIEW §4.1), con los mismos umbrales frente al clásico.

## Lo que esta página no mide

- La escena del gemelo: ni teselas 3D Tiles, ni olivos generados, ni nube, ni sombras, ni la Cola. La escena es sintética e **ilustrativa**; las cifras dicen cómo escala el coste por llamada en cada renderizador, no los fps del gemelo.
- three 0.187.x: MULTIVIEW §5 pide medir también con ella; aquí solo está 0.186.1 (y super-three 0.185.0). Para 0.187, cambiar la versión en `package.json` y reconstruir.
- Lo que cuesta compilar los sombreadores: la medida empieza tras 3 s, con todo compilado.
