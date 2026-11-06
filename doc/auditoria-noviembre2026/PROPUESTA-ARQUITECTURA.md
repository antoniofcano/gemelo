# Propuesta de refactorización: del motor monolítico a un gemelo de mundos múltiples

**2026-11-06 · sobre v0.2.0 `4ab0ae6` · propuesta, no decisión.** Pide un ADR (0033) antes de la primera línea de código. Decisiones ya tomadas por Antonio en la conversación del 2026-11-06: TypeScript, módulos ES, Vitest para la lógica en Node, migración *strangler* (nunca reescritura total a la vez), three 0.187 + TSL para pantalla, super-three solo como build de optimización para Quest. Tres mundos como primer caso: **exterior** (el olivar de hoy), **fábrica/museo** (el molino, con maquinaria animada) y **bodega/sala de conferencias** (voz, pizarra, pantalla compartida, aforo).

## 1. Diagnóstico en una frase

El código es **un solo mundo con una sola escena global** y lo está haciendo bien; el problema es que todo lo que lo hace funcionar (coordenadas, ambiente, bucle, presencia, materiales) es global y sin tipos, y **las promesas escritas (topes, `dispose`, contratos, documentación) van por delante de lo que el código cumple**. Añadir dos mundos sobre eso multiplica cada promesa incumplida por tres.

Pruebas (auditoría noviembre 2026): 95 ficheros en una IIFE (`genera_motor.mjs:141`); ~120 llamadas al alias global `suelo(` en 31 ficheros y `scene.add` directo en 26 (lente 8 §3.2-3.3); `D.ext` como «dentro del mundo» en 12 módulos; ambiente (sol, nubes, lluvia, niebla, `exag`) codificado a un exterior sin interruptor (lente 8 §3.3); `90_final.js:36-54` cablea a mano 13 actualizaciones; sin `dispose` en 15/16/18/19/21/04d (L2-05); cabeceras Expone/Consume con 496 consumos falsos (L4-02); 19 `onBeforeCompile` + 11 `ShaderMaterial` que no existen para el `WebGPURenderer` (lente 5, anexo A); perfiles VR que solo bajan (L7-03); una excepción en el fotograma para el bucle para siempre (L7-01).

Lo que ya está bien y se conserva: `Componentes` con `monta/libera` (`02c`), `Cola` como generador, `Entidades`, `Red.sala(clave).une()` y la presencia por sala (`37_red`, `38`), `LlegadaPuro`/`IrAPuro` que ya reciben suelo y caja por argumento, `Mundo` como función pura de `D`, el fundido a negro de `29_vr`, los contratos versionados con esquema, la `apps/api` en TypeScript con Fastify, LiveKit y WebAuthn (sólida según lente 9), y una cultura de guardianes y medidas que pocas empresas tienen.

## 2. Principios (los que de verdad deciden)

1. **Cuatro fronteras con interfaz tipada y sin ciclos:** `nucleo` (render, bucle, XR, cola, presupuesto) → `mundos` (contenido; cada mundo un paquete) → `red` (sesión, salas, presencia, voz) → `datos` (contratos, índices, teselas). `mundos` depende de `nucleo` y `datos`; nunca al revés. `red` no sabe qué hay en un mundo; solo conoce salas e identidades.
2. **Un mundo no toca la escena global:** recibe una raíz (`Group`), un `Ambiente` que pone y quita, un `Suelo` que contesta, un canal de red. Lo que no pase por esa interfaz no existe para él. Esto cierra de golpe los 26 `scene.add` y las 120 `suelo(`.
3. **Lo que se puede probar sin navegador, se prueba sin navegador.** Coordenadas, presupuesto, estado de mundos, controlador de calidad, códec de presencia, planificación de rutas: Vitest en Node, con el fixture. Chrome solo para lo visual y las medidas. Hoy el banco es el cuello de botella porque demasiado depende de Chrome (CLAUDE.md §6); esto lo abarata.
4. **Los mundos interiores no llevan sombreadores propios.** Materiales estándar de three (`MeshStandardMaterial` con mapas horneados y KTX2, `MeshBasicMaterial` con lightmap). Así corren igual en `WebGLRenderer`, super-three y `WebGPURenderer`, y la migración a TSL no los toca. Es la decisión más barata y más potente de la propuesta: **las dos salas nuevas nacen compatibles con los dos renderers sin escribir TSL**.
5. **Un renderer por build, elegido al arrancar, detrás de una interfaz que los mundos no ven.** Pantalla: three 0.187 `WebGLRenderer` hoy, `WebGPURenderer` cuando F4 lo iguale. Quest: super-three + multiview mientras valga la pena medida. Los mundos hablan con `Render` (tipo, info, compileAsync, XR), no con three directamente para nada global.
6. **Promesa escrita = guardián que la vigila.** Cada regla de CLAUDE.md que la auditoría ha visto incumplida (dispose, cabeceras, topes, única lista) pasa a tener un guardián en Node o se borra de CLAUDE.md. No se admite una regla sin guardián.
7. **Strangler, no big bang.** El motor viejo sigue arrancando entero en cada commit. Cada módulo migrado se borra del viejo. El viejo se encoge; nunca se bifurca.

## 3. Estructura objetivo

```
apps/
  web/                      cliente (Vite, TypeScript estricto)
    src/
      nucleo/               Render, Bucle, Cola, Presupuesto, XR, Fundido, Componentes, Entidades, Ajustes
      mundos/               WorldManager + interfaz World + Puerta
        exterior/           el olivar: Mundo(teselas), Tiempo, Vida, Paisaje, Olivos, NDVI, Minimapa…
        molino/             fábrica/museo: nave.glb, maquinaria (prensa, empiedro), guion del proceso, sonido
        bodega/             sala de conferencias: pizarra, pantalla, atril, aforo, moderación
      red/                  Sesion, Salas, Presencia (códec), Voz (LiveKit), Avatares
      datos/                tipos generados de contratos/, carga de índice y teselas, fixtures
      ui/                   HUD, ventanas, panel VR, ajustes (hoy 24, 31, 32, 33)
      motor-legado/         la IIFE actual, encogiéndose (se borra al final)
    pruebas/                Vitest (Node) + las de Chrome que queden
  api/                      como está (TypeScript, Fastify, node:test); gana «sala por mundo»
contratos/                  esquemas; de ellos se generan los tipos TS (json-schema-to-typescript)
tuberia/                    Python, como está
```

Interfaz de un mundo (la del informe WorldManager, tipada y con dos añadidos: `ambiente` y `red`):

```ts
export interface World {
  readonly id: "exterior" | "molino" | "bodega";
  readonly sala: string;                  // sala de LiveKit/presencia propia
  carga(ctx: Contexto): Promise<void>;    // import() de assets; puede tardar; el fundido sigue a negro
  entra(desde: Puerta | null): void;      // coloca al paseante y a la cámara
  actualiza(dt: number, cuadro: Cuadro): void;
  suelo(x: number, y: number): number;
  dentro(p: Vec3): boolean;               // caja para el exterior; paredes para interiores
  obstaculo(a: Vec3, b: Vec3): Vec3 | null;
  ambiente(): Ambiente;                   // sol/cielo/niebla/luces/exag; el nucleo lo aplica y lo quita
  presupuesto(perfil: Perfil): Presupuesto;
  sale(): void;
  libera(): void;                         // dispose real; guardián: info.memory vuelve
}
```

`WorldManager` mantiene exactamente un mundo activo, una raíz por mundo en la única `scene`, y hace la transición `cierra() → sale() → libera()|congela() → carga() → entra() → abre()`, presentando un fotograma negro a la sesión XR en cada paso (L7-05, L7-06 quedan cubiertos por diseño). `Red.sala(mundo.sala).une()` cambia el canal; la identidad y el avatar viajan. La pose lleva `mundo` (lente 8 §3.4) para que un rezagado no se pinte en el mundo equivocado.

Puerta: una `Entidad` con `radioCerca` en el exterior y en cada interior; cruzarla dispara el cambio; con histéresis de 2 m para que no oscile.

## 4. Render: cómo convivir con dos renderers sin escribir todo dos veces

| Capa | Pantalla (hoy) | Pantalla (F4+) | Quest |
|---|---|---|---|
| Paquete | three 0.187 | three 0.187 `three/webgpu` | super-three 0.185 (alias de Vite) + parche multiview |
| Renderer | `WebGLRenderer` | `WebGPURenderer{forceWebGL, multiview}` | `WebGLRenderer` (super-three) |
| Materiales del exterior | GLSL (`onBeforeCompile`) | TSL desde la fábrica | GLSL |
| Materiales de molino y bodega | estándar | estándar | estándar |
| Splats (si se usan) | Spark (WebGL2) | Spark Radix / nativo r186+ (experimental) | Spark, solo si compila con super-three (no verificado) |

Reglas:
- **La fábrica `Materiales` es el único sitio que importa three para sombreadores.** Un nombre sin versión TSL cuando `Render.tipo === "nuevo"` es un `console.warn` y un guardián en rojo (lente 5 anexo A, hoy calla).
- **El guardián de `#include` iguales** (`builds_f2.test.js:56`) se relaja a «los trozos que el motor parchea» (L7: `uv_vertex` cambia en 0.187 y no afecta).
- **Orden de migración a TSL** (de MULTIVIEW.md §2): primero los tres trozos compartidos (`colorVertSRGB`, `parcheTiempo`, terreno `04d`), que desbloquean la mayoría; después por impacto visual en VR. Se hace **dentro** del strangler: cada módulo del exterior que se migra a TypeScript se lleva su material a la fábrica con las dos versiones.
- **Salida del doble renderer:** repetir F2 con 0.187 antes de escribir sombreadores nuevos; cuando el nuevo iguale el multiview en Quest, super-three se retira (ADR-0031 ya lo dice). Hasta entonces, el coste real de las dos builds es: dos `dist/`, un cargador, un parche frágil y un guardián; con los interiores sin sombreadores propios, ese coste **no crece** con los mundos nuevos.

## 5. Red y servidor

- **Sala por mundo** en LiveKit y en presencia: `exterior`, `molino`, `bodega` (y `bodega:<reunión>` para reuniones privadas). Enmienda a ARQUITECTURA-MULTIUSUARIO.md:128-130 (L10-09) vía ADR-0033. Roles en `livekit-roles.json` v9.
- **Aforo y moderación en servidor**, no en cliente: la api decide quién entra a `bodega`, con cuántos y quién es ponente; el cliente solo pinta. Hoy la expulsión no revoca el token hasta 15 min (L9-06): con `removeParticipant` de `livekit-server-sdk` se cierra.
- **Pantalla compartida y pizarra:** la pantalla es un `VideoTexture` desde una pista de LiveKit (`getDisplayMedia` del ponente, desde ordenador); la pizarra es un `CanvasTexture` cuyos trazos van por el canal de datos de presencia con un contrato `pizarra.md` versionado. Nada nuevo de infraestructura: LiveKit ya está desplegado (`infra/livekit.yaml`).
- **Voz espacial:** `PositionalAudio` alimentado por la pista de cada avatar, que ya se hace por cercanía en el exterior (ADR-0032); en la bodega, radio de cercanía grande o «todos oyen al ponente».

## 6. Pruebas y calidad

- **Vitest en `apps/web`** para todo lo puro: `Mundo` (ya es función de `D`), `LlegadaPuro`, `IrAPuro`, `IdTiles`, códec de presencia, controlador de calidad VR (la simulación que hizo la lente 7 pasa a ser una prueba), `WorldManager` con mundos falsos, `Presupuesto`, contratos contra tipos generados. Objetivo: que la puerta rápida cubra el 80 % de la lógica sin Chrome.
- **Chrome queda para:** capturas por material (clásico vs nuevo), medidas de `info.memory` al montar/liberar cada `World` (guardián nuevo: «ir y volver deja la memoria como estaba»), medida de bucle. `apps/api` sigue con `node:test` (no hay motivo para tocar lo que funciona; unificar es un bajo para más adelante).
- **Tipos generados de los contratos** (`contratos/*.schema.json` → `datos/tipos.ts`): la cabecera Expone/Consume deja de ser un comentario que `contrato_modulos.js` adivina (L4-02) y pasa a ser `import`/`export` que el compilador comprueba. La regla 2 de CLAUDE.md se cumple por construcción.
- **Guardianes nuevos en Node:** dispose por componente; promesa↔guardián (cada regla de CLAUDE.md apunta a un test); globales duplicados (L5-01); inventario de materiales vs versiones TSL; topes del fixture recalibrados (L1-06) y tope de GPU (L1-07).
- **`try/catch` por fotograma** con salida limpia de XR al tercer fallo (L7-01) y escucha de `visibilitychange`, `reset`, `webglcontextlost` (L7-02, L7-10): en `nucleo/Bucle`, una vez, para todos los mundos.

## 7. Plan de migración (strangler), por fases con criterio de salida

Estimaciones marcadas **[ESTIMACIÓN]** en días de agente con Antonio revisando; el banco (un Chrome) manda, así que las fases ligeras van en paralelo con las pesadas (CLAUDE.md §6).

| Fase | Qué | Criterio de salida | [ESTIMACIÓN] |
|---|---|---|---|
| **0 Decidir** | ADR-0033 (mundos interiores, sala por mundo, interiores sin sombreadores propios, TS + Vitest, strangler); arreglar el alto L4-01; tanda 1 del PLAN (que las medidas y contratos digan la verdad) | ADR aceptado; puerta en verde; topes recalibrados | 4 d |
| **1 Cimientos sin cambio visible** | `tsconfig` estricto; Vitest; Vite consume `src/` + `motor-legado/` juntos; `nucleo/` con `Render`, `Bucle` (con try/catch y eventos), `Cola`, `Presupuesto`, `Fundido` extraídos de 02b/02g/02h/29/90 y **re-exportados a la IIFE** para que el viejo siga igual; tipos generados de contratos | El gemelo se ve y mide igual (capturas y `info` iguales); `npm run puerta:rapida` corre Vitest | 6-8 d |
| **2 Exterior como primer World** | `mundos/exterior/` envuelve la IIFE: `actualiza` recoge las 13 llamadas de `90_final`; `suelo/dentro/obstaculo` del mundo sustituyen `D.ext`, `suelo(`, `copas` en `12_paseo`, `12b`, `12c`, `29_vr`, `16_vida`, `38`; raíz `Group` única; `Ambiente` extraído de `03_escena` + `15_tiempo`; sala `exterior` | WorldManager con un solo mundo, sin regresión; guardián «ocultar y volver a mostrar el exterior deja memoria igual» (fase 1 del dispose: congelar) | 8-10 d |
| **3 Bodega** (la más barata: geometría simple, materiales estándar, lo que vale es la red) | `mundos/bodega/` con nave glb low-poly, puerta en el exterior, sala `bodega`, voz por LiveKit, pantalla compartida, pizarra v0, aforo en api, panel de moderación; `cierra/abre` en XR; pose con `mundo` | Dos personas en bodega y una fuera no se ven; reunión de 6 con pantalla compartida en Quest a 72 Hz | 10-12 d |
| **4 Molino** | `mundos/molino/` con malla de la nave (protocolo de captura) y una máquina en marcha (prensa de viga) con sonido; guion del proceso; museo = visita guiada reutilizando `46_guiada` | Una máquina completa animada a 72 Hz en Quest; el resto es contenido, no arquitectura | 8 d + modelado |
| **5 Dispose real y encoger el legado** | `libera()` real del exterior (tanda 3 del PLAN); los módulos del exterior migran a `src/mundos/exterior/*.ts` uno a uno, cada uno con su material a la fábrica (GLSL + TSL) y su prueba en Vitest; `motor-legado/` se vacía | `renderer.info.memory` vuelve al salir del exterior; 0 ficheros en `motor-legado/` | 20-30 d, repartidos |
| **6 Renderer nuevo en pantalla** | F3-F5 de ADR-0031 sobre la fábrica ya tipada; `WebGPURenderer` por defecto en pantalla | Capturas iguales por material; medida ≤ clásico | según MULTIVIEW |
| **7 Una sola build** | Repetir F2 en Quest con el three del momento; retirar super-three si iguala | Una `dist/`; parche borrado | cuando three lo permita |

Las fases 3 y 4 pueden empezar en cuanto acabe la 2; no esperan a la 5. Ese es el beneficio del principio 4: **las salas nuevas no dependen de la migración del exterior**.

## 8. Qué NO se propone (y por qué)

- **Python en el cliente:** no existe para WebXR; la tubería y el servidor ya están en el lenguaje que les toca.
- **Reescribir el exterior de cero:** 20.000 líneas que funcionan y están medidas; se migran por módulo con su prueba.
- **Un motor de juego (Unity/Unreal) para las salas:** rompería WebXR/PWA sin tienda, gratis y privado, que es una decisión de producto.
- **Mundos como páginas o apps separadas:** cambiar de URL mata la sesión XR; se hace dentro de un solo PWA.
- **Splats en la primera versión de las salas:** Spark ata a WebGL2 y su compatibilidad con super-three y con 0.187 no está verificada; malla horneada primero, splat como capa opcional cuando el renderer lo permita.
- **Cambiar `node:test` por Vitest en `apps/api`:** funciona; no hay hallazgo que lo pida.

## 9. Riesgos y tradeoffs, sin adornos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El strangler se eterniza y conviven dos estilos un año | Alta si no hay regla | Regla: ningún commit toca un módulo del legado sin migrarlo; `motor-legado/` tiene un contador en ESTADO que solo baja (trinquete) |
| El exterior congelado en memoria hace que las salas no quepan en Quest | Media | Medir en fase 2 (`info.memory` del exterior congelado); si no cabe, la fase 5 (dispose real) adelanta a la 3 |
| Doble renderer y doble material durante meses | Cierta | Principio 4 (interiores sin sombreadores) limita el doble trabajo al exterior, que ya existe; nada nuevo se escribe dos veces |
| super-three deja de publicarse (último 0.185, 2026-07) | Media | El parche ya falla al construir si cambia; la salida (una build con el renderer nuevo) está en ADR-0031; el Quest nunca depende de un sombreador que solo exista en super-three |
| Tipos generados de contratos descubren que el motor lee campos fuera de contrato (L4-05, L4-07, L4-09) | Cierta | Es exactamente lo que se quiere: cada uno se arregla en el contrato o en el motor en el commit que lo descubre |
| Antonio es el único desarrollador y el banco es un i5 con 8 GB | Cierta | Fases ligeras (TS, pruebas Node) en paralelo; Chrome solo en los criterios de salida; agentes atómicos como ya dice CLAUDE.md §6 |

## 10. Decisiones que necesita de Antonio antes de la fase 0

1. ADR-0033: aceptar los principios 1, 4 y 5 (fronteras, interiores sin sombreadores, un renderer por build).
2. Orden de las salas: **bodega antes que molino** (barata y desbloquea el uso) o al revés (contenido diferenciador primero). La propuesta dice bodega.
3. Dispose real del exterior: ¿fase 5 (después de las salas) o adelantada si la medida de la fase 2 no cabe en Quest?
4. Las decisiones de datos y seguridad de `ACEPTADOS.md` (L9-01, L3-06, L3-07) afectan a lo que las salas van a mostrar a los hogares.
