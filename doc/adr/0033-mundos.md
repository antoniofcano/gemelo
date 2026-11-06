# ADR-0033 — Mundos: varias salas en un solo PWA, con fronteras tipadas y migración strangler

- **Estado:** Aceptado (2026-11-06, Antonio, con las decisiones 216-227 cerradas en la opción recomendada: [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md#mundos-múltiples-adr-0033-cerradas-el-2026-11-06))
- **Fecha:** 2026-11-06
- **Orden de trabajo** (Antonio, 2026-11-06, tras aceptarlo): dos ejes que no se bloquean. El exterior (código) va primero y libera el exterior justo después de MU2. Los interiores (modelado) siguen aparte, atados solo al contrato de mundo interior, y se unen en MU3 y MU4 ([PLAN](../rumbo/PLAN.md#mundos-múltiples-adr-0033)).

## Contexto
Antonio quiere un metaverso de varias salas sobre el gemelo: **exterior** (el olivar de hoy), **molino** (la fábrica restaurada como museo, con maquinaria animada de principios del siglo XX) y **bodega** (sala de conferencias con voz espacial, pizarra, pantalla compartida, aforo y moderación). Cada sala es un mundo con su sala de red, pero todas viven en el mismo PWA para no perder la sesión WebXR al cambiar de una a otra. Ya ha decidido (2026-11-06, no se reabre aquí): TypeScript estricto y módulos ES en el cliente, Vitest para la lógica en Node, migración *strangler*, three 0.187 en pantalla con paso gradual a TSL/`WebGPURenderer` según el [ADR-0031](0031-migrar-al-webgpurenderer-con-multiview.md), super-three solo como build de optimización del Quest, y «cada promesa escrita tiene un guardián o se borra».

Punto de partida: la auditoría de noviembre ([RESUMEN](../auditoria-noviembre2026/RESUMEN.md), [PROPUESTA-ARQUITECTURA](../auditoria-noviembre2026/PROPUESTA-ARQUITECTURA.md), [INFORME-WORLDMANAGER](../auditoria-noviembre2026/INFORME-WORLDMANAGER.md), [lente 8 §3](../auditoria-noviembre2026/lente-8-mundos.md#3-acoplamientos-al-universo-único)). Lo que sigue lo he leído en el código de `main` (da49133, 2026-11-06):

- **Un solo bloque.** `apps/web/herramientas/genera_motor.mjs:20-24` concatena los 92 ficheros de `apps/web/motor/` en orden alfabético, y `:49` escribe un único módulo ES con `import * as THREE from "three"` delante. Dentro, `01_datos.js:8-10` abre la IIFE con `"use strict"` y lee el índice de la finca en el global `D`, y `99_cierre.js` la cierra. «Mundo» no existe como concepto: existe «el motor».
- **Una escena, una cámara y un ambiente, los del exterior.** `03_escena.js:14` crea el `WebGLRenderer`, `:17` crea la `scene` y la cámara (`far` sale de la extensión de la finca), `:30-31` cuelgan de la escena un hemisferio y un sol globales, y `:40` pone el fondo y la niebla desde `FOG0/FOG1`.
  - Hoy, 46 llamadas a `scene.add(` en 27 ficheros, 82 llamadas sueltas a `suelo(` en 32 y lecturas de `D.ext` en 13. Son recuentos con `grep`, no medidas.
- **El bucle nombra al exterior.** En `90_final.js:36-54`, `cuadro()` llama a mano a `actualizaTiempo`, `actualizaOlivo`, `actualizaVida`, `actualizaMinimapa`, `actualizaPaisaje`, `actualizaBalizas`, `actualizaSuelo`, `actualizaNube`, `Arboles.actualiza`, `actualizaCarga` y `Escena3D.actualiza`, entre las fases de `Componentes`.
- **Liberar casi no existe.** `15_tiempo`, `16_vida`, `18_paisaje`, `19_balizas` y `21_suelo` no tienen ni un `dispose` (comprobado con `grep`: L2-05). Así que hoy el exterior se puede **ocultar**, pero no **liberar**.
- **La red ya es un canal, pero de dos salas fijas.**
  - En la api: `apps/api/src/presencia/livekit.ts:16` define `SALAS = { general: "hituelo-libre", visita: "hituelo-visita" }`, y `rutas.ts:72` limita `sala` a esas claves.
  - En el cliente: `38_presencia_compartida.js:370` tiene `SALAS_MUNDO` con las mismas dos, y `:477` rechaza cualquier otra.
  - Lo que **sí** generaliza: la sala de voz con turno de palabra de las guiadas, `guiada-<evento>` (roles por papel, cierre y palabra en [livekit-roles.json](../../contratos/livekit-roles.json) v8), y la de cada corro, `corro-<id>` ([ADR-0032](0032-voz-por-cercania-en-la-visita-libre.md)).
- **Lo escrito contradice lo que se pide.** [ARQUITECTURA-MULTIUSUARIO.md:128-130](../sistema/ARQUITECTURA-MULTIUSUARIO.md#interiores-la-fábrica-como-museo) dice: «Al cruzar la puerta se ocultan las teselas exteriores; la sala de LiveKit es la misma». También dice que el *splatting* «no compensa». Es el hallazgo L10-09.
- **Dos builds y una bifurcación detrás de la versión de three.**
  - Pantalla: three 0.186.1. Quest: super-three 0.185.0 con el parche de multiview (`apps/web/package.json:27-28`, ADR-0031).
  - Consultado en npm el 2026-11-06: three 0.187.0 está publicado desde el 2026-10-30, y la última super-three sigue siendo la 0.185.0.
  - El mantenedor de super-three dice tener los arreglos en una rama r187 ([MULTIVIEW §7](../sistema/MULTIVIEW.md#texturas-en-negro-2026-11-05-corregido-en-el-build)) **[NO VERIFICADO]**.
- **Las reglas vigentes que esto toca.**
  - CLAUDE.md §5 dice: «Estilo del motor: `var`, `"use strict"`, sin módulos por dentro». La regla 2 dice que el orden alfabético de `motor/` es el orden de montaje.
  - [ADR-0010](0010-monorepo-y-build-con-vite.md) fijó la concatenación. [ADR-0023](0023-componentes-del-mundo.md) dejó escrito que un componente podría vivir como módulo ES cargado con `import()` (su alternativa D).
  - Un ADR no cambia una regla de oro: el choque va a la decisión 216.

## Decisión
**El gemelo pasa a ser un conjunto de mundos dentro de un solo PWA, con un solo renderer, una sola escena y una sola cámara.**
- Un `WorldManager` mantiene exactamente un mundo activo y hace la transición a oscuras, sin tocar nunca `renderer.xr`.
- Cada mundo cuelga de su propia raíz, pone y quita su `Ambiente` y tiene su propia sala de presencia y de LiveKit.
- El código nuevo se escribe en TypeScript estricto, en cuatro fronteras sin ciclos (`nucleo`, `mundos`, `red`, `datos`), y se prueba con Vitest en Node.
- El motor de hoy se estrangula módulo a módulo: arranca entero en cada commit y solo encoge.
- Los mundos interiores no llevan sombreadores propios.

Lo concreto (el diseño de las interfaces está en [MUNDOS.md](../sistema/MUNDOS.md)):

1. **Mundos interiores.**
   - Un `World` (contrato en MUNDOS.md §2) tiene este ciclo de vida: `carga → entra → actualiza → sale → congela | libera`.
   - El exterior es el primer `World`: envuelve lo que hoy llama `90_final.js` a mano.
   - Molino y bodega son módulos ES aparte, cargados con `import()` solo cuando alguien cruza su puerta. Viven en su propio trozo del paquete y nadie los descarga si no entra (el patrón de `gemelo-olivo` en `apps/web/vite.config.js:17,68`).
   - Cada mundo tiene su **marco local**. En los interiores, el origen está en la puerta interior, `y` es la cota sobre el suelo interior y no hay exageración (`exag = 1` fijo).
   - **Congelar el exterior** no es solo ocultarlo:
     - hay que cortar también `actualizaCarga` y `Escena3D.actualiza`, porque piden teselas según dónde esté la cámara (`90_final.js:19,54`). Con coordenadas locales cerca de (0,0), si no se cortan, se cargarían teselas del exterior alrededor del origen [deducido];
     - y los trabajos de la `Cola` necesitan dueño: hoy solo se cancelan por clave exacta (`02b_cola.js:50`).
   - Una **puerta** es una `Entidad` con radio de cercanía e histéresis. Su posición sale del índice o de la configuración del servidor, nunca del código.
2. **Una sala de presencia y de LiveKit por mundo.**
   - Las claves de sala de la api pasan a ser `exterior`, `molino` y `bodega`. `exterior` conserva el nombre de LiveKit de hoy (`hituelo-libre`) para no romper clientes ni la auditoría. La de la visita sigue igual.
   - **Bodega:** la sala de datos `bodega`, más una sala de voz con turno de palabra por reunión, `bodega-<reunión>`. Es el patrón de `guiada-<evento>`: ponente = guía, y la api da la palabra, cierra y modera.
   - **Aforo:** lo decide la api con la lógica de cupo que ya existe (`apps/api/src/agenda/cupo.ts`). El cliente solo lo pinta.
   - **Pantalla compartida:** una pista `screen_share` que solo puede publicar el ponente desde un ordenador.
   - **Pizarra:** un tema de datos con su contrato versionado.
   - **Identidad, alias y avatar** no cambian: los pone la api en el token, como hoy.
   - **Lo que la bodega necesita y hoy no existe:**
     - **vídeo en la red:** `37_red.js:17` dice «el vídeo no está (F4)», y ningún rol de `livekit-roles.json` tiene `screen_share`;
     - **más de 4 voces a la vez:** `45_voz.js:45` fija `MAX_VOCES = 4`, que no basta para una reunión de 6 en la que pueda hablar cualquiera (decisión 225).
   - **Una guiada que cruza mundos** (decisión 226). Recomendación: la sala de voz `guiada-<evento>` no depende del mundo, así que la voz del guía sigue al cruzar la puerta. La sala de datos sí cambia con el mundo. El guía mueve al grupo con el tema `sala` que ya existe ([presencia.md](../../contratos/presencia.md)).
   - **Expulsar.** La api ya llama a `removeParticipant` (`apps/api/src/presencia/livekit.ts:236`). El hueco de L9-06 es que el JWT se puede reutilizar mientras dura `TTL_S` = 15 min (`:25`). Con tres salas por persona pesa más: se cierra en la fase 3 con un webhook de LiveKit que vuelve a expulsar a quien está en la lista, o con un TTL corto y refresco.
   - **Pose:** sigue en la v1. Los bits 6-7 del byte 1, hoy reservados e ignorados por los receptores, llevan el mundo (`0` exterior, `1` molino, `2` bodega, `3` otro). Sirve de defensa contra un mensaje rezagado durante el cambio. El aislamiento de verdad lo da la sala.
   - Todo esto va en `livekit-roles.json` v9 y `presencia.md` (MUNDOS.md §7).
3. **Enmienda de [ARQUITECTURA-MULTIUSUARIO.md:128-130](../sistema/ARQUITECTURA-MULTIUSUARIO.md#interiores-la-fábrica-como-museo)** (se aplica al aceptar este ADR):
   - «Al cruzar la puerta, el exterior se congela (y, cuando sepa liberarse, se libera); cada interior tiene su propia sala de presencia y de LiveKit».
   - También están desfasadas las líneas `:11` y `:35`, que dicen «una sala por visita»: hoy hay salas fijas por finca (`hituelo-libre`, `hituelo-visita`), más `guiada-<evento>` y `corro-<id>`.
   - El *splatting* pasa de «no compensa» a «opción abierta para el molino, no en la primera versión», porque Spark solo funciona sobre `WebGLRenderer` y nadie ha probado que funcione con super-three ni con multiview ([INFORME-WORLDMANAGER §4](../auditoria-noviembre2026/INFORME-WORLDMANAGER.md#4-dónde-encaja-spark-y-qué-le-hace-al-renderer-compartido)).
4. **Cuatro fronteras, con dependencias en un solo sentido** (MUNDOS.md §1):
   - `nucleo` (render, bucle, XR, Cola, presupuesto, fundido, componentes y entidades) no importa de ninguna de las otras tres;
   - `datos` (tipos generados de `contratos/`, carga de índice y teselas) no importa de ninguna;
   - `red` (sesión, salas, códec de pose, voz) importa solo de `datos`;
   - `mundos` importa de las otras tres;
   - `ui` y `motor-legado` son clientes.
   - Lo vigila una librería que mira las importaciones (`dependency-cruiser`; decisión técnica, MUNDOS.md §8).
5. **Los interiores no llevan sombreadores propios.**
   - En `mundos/molino` y `mundos/bodega` solo valen materiales estándar de three (`MeshStandardMaterial`, `MeshLambertMaterial`, `MeshBasicMaterial`) con mapas horneados y texturas KTX2.
   - No valen `onBeforeCompile`, `ShaderMaterial` ni `NodeMaterial` propio.
   - La maquinaria se anima con `AnimationMixer` sobre glTF.
   - Así sirven igual en `WebGLRenderer`, super-three y `WebGPURenderer`, y la migración a TSL no los toca.
   - Un guardián cuenta esos usos en esas carpetas, con tope 0.
6. **TypeScript, Vitest y strangler.**
   - Código nuevo en `apps/web/src/`: TypeScript estricto (la base de `apps/api/tsconfig.json`, misma versión de `typescript` fijada) y módulos ES.
     - Vite lo compila sin paso nuevo, pero no comprueba tipos: `tsc --noEmit` entra en la puerta rápida.
   - **`apps/web/motor/` no se renombra ni se mueve:** encoge donde está.
     - Hay 63 guardianes que evalúan sus trozos `[puro]` por ruta.
     - También dependen de esa carpeta `contratos/interfaces.json`, el comprobador de cabeceras, la opción `--sin` y CLAUDE.md §2/§5.
   - **Las variables primitivas que el legado reescribe** (`exag`, `modo`, `calidad`, `paseando`, `listo`) no pueden llegar por `import`, porque una importación es de solo lectura. Antes de migrar a quien las usa, pasan a vivir en un objeto.
   - **El legado sigue tal cual.** La IIFE recibe lo migrado por importaciones que `genera_motor.mjs` añade delante, junto al `import` de three que ya pone. Dentro, el módulo viejo deja su nombre como `var X = <importado>`, así que la cabecera, el orden y los consumidores no cambian (MUNDOS.md §9, fase 1).
   - **Reglas del strangler:**
     - un módulo del legado que se toca para algo más que un arreglo de una línea se migra en ese mismo cambio;
     - lo migrado se borra del legado en ese commit;
     - un contador de líneas de `motor/` en un guardián **solo puede bajar** (trinquete);
     - los hallazgos de la auditoría de un módulo se arreglan al migrarlo, cada uno con su prueba (salvo las tandas 0 y 1, que van antes).
   - Vitest para lo de `apps/web/src`. Los guardianes de `pruebas/guardianes/` siguen en `node:test`, y la api también. La puerta rápida corre las tres cosas.
7. **Render.**
   - Se mantienen las dos builds del ADR-0031.
   - Los mundos no hablan con `renderer` ni con `scene`. Hablan con `Render` (tipo, build, info de dibujo, `compila`, estado XR) y con su raíz.
   - `Render` y la fábrica de materiales (`02i_materiales.js`) son los únicos sitios que saben qué renderer hay.
   - **three 0.187 va en un commit aparte** (es la tarea AG-0.4 del PLAN, con el proceso del [ADR-0016](0016-actualizacion-de-three.md)), nunca junto a un cambio de renderer.
     - Como pronto el 2026-11-13: dos semanas después de su publicación, como pide [MULTIVIEW §5](../sistema/MULTIVIEW.md#5-qué-versión-de-three).
     - Hoy lo bloquea a propósito `pruebas/guardianes/builds_f1.test.js:62`, que exige la 0.186.1.
     - La build del Quest sigue en super-three 0.185.0 hasta que se publique su r187. Hasta entonces, las dos builds van a dos versiones distintas (decisión 224).
   - No se escribe TSL hasta tener fijada la versión de three, porque en r187 TSL cambia nombres.

## Alternativas consideradas
- **La misma sala para todos los mundos, filtrando por mundo en el cliente** (lo que dice hoy ARQUITECTURA-MULTIUSUARIO.md:130). Descartada:
  - cada cliente seguiría recibiendo las poses de gente de otros mundos, a 10 Hz;
  - un fallo del filtro pinta a alguien en el sitio equivocado;
  - en la bodega no sirve: una reunión privada no puede depender de que el cliente filtre.
  - La sala por mundo reusa lo que ya hacen las guiadas y los corros, y aísla en el servidor.
- **Cada mundo, una página (URL) aparte.** Cambiar de documento corta la sesión WebXR. El Quest Browser permite seguir la sesión en la página siguiente (`sessiongranted`, [IWSDK.md](../sistema/IWSDK.md)), pero no es estándar, no está en todos los navegadores (**[NO VERIFICADO]** en el Quest Browser 154) y se perdería todo lo que hay en memoria: teselas, avatares y voz. Descartada.
- **Una `THREE.Scene` por mundo.**
  - Aislaría mejor. Pero `29_vr.js` cuelga de la escena el rig, los paneles y el velo, y 27 ficheros llaman a `scene.add`.
  - Cambiar de objeto `scene` con la sesión XR abierta obliga a volver a colgarlo todo.
  - Descartada: una raíz `Group` por mundo da el mismo aislamiento a menor coste.
- **Un renderer (o un contexto GL) por mundo.** Dos contextos son perder la sesión XR. Descartada.
- **Reescribir el cliente entero en TypeScript a la vez (*big bang*).** Descartada por Antonio. Además, son 20.322 líneas medidas y en producción.
- **Quedarse en JS y tipar el legado con JSDoc y `checkJs`.** Es más barato y no toca el empaquetado. Pero no da módulos ni fronteras, y los tipos se quedarían en comentarios, como hoy las cabeceras «Expone/Consume» (L4-02). Descartada como destino. Como mucho, una ayuda temporal en algún fichero del legado que se vaya a migrar enseguida.
- **Interiores con TSL desde el primer día.**
  - Los ataría al `WebGPURenderer`, que en el Quest rinde peor: `render()` 3,1 ms frente a 1,1 ms de super-three con multiview en la página de humo ([MEDIDAS](../sistema/MEDIDAS.md#multiview-en-el-quest-3-con-la-página-de-humo-2026-11-04-foto-no-se-mantiene)).
  - Y obligaría a mantener dos versiones de cada material.
  - Descartada: los materiales estándar valen para los dos renderers sin escribir nada.
- **Gaussian splatting (Spark) para la nave del molino en la v1.** Spark exige `WebGLRenderer` y `antialias: false`, y nadie lo ha probado con super-three ni con multiview. Aplazada, no descartada: decisión 223 y una prueba de humo de un día antes de usarlo.
- **Un marco o motor ajeno para las salas** (A-Frame, React Three Fiber, IWSDK, Unity). Otro motor de dibujo y otra forma de trabajar ([IWSDK.md](../sistema/IWSDK.md): no se adopta). Unity rompe el WebXR sin tienda. Descartada.
- **Liberar del todo el exterior (`dispose` real) antes de hacer ninguna sala.** Es más limpio en memoria, pero retrasa las salas lo que tarden 15 o más módulos en saber liberarse. Es la decisión 218: la recomendación es congelar primero, medir en el Quest y adelantar la liberación si la medida no cabe.

## Consecuencias
- **Positivas:**
  - las dos salas nuevas nacen compatibles con los dos renderers;
  - la red aísla en el servidor;
  - el cambio de mundo usa el fundido que ya existe (`29_vr.js:88-96`, `12b_llegada.js:90-95`), partido en `cierra/abre`;
  - lo puro (coordenadas, presupuesto, controlador de VR, códec de pose, máquina de estados del cambio, rutas) se prueba en Vitest sin Chrome, y eso abarata el banco;
  - las cabeceras «Expone/Consume» dejan de ser comentarios que se adivinan y pasan a ser `import`/`export` que comprueba el compilador.
- **Negativas / coste:**
  - durante meses conviven dos estilos (IIFE con `var` y TypeScript) y dos sistemas de pruebas en el cliente;
  - `genera_motor.mjs` gana un puente que hay que vigilar;
  - el exterior congelado sigue ocupando memoria mientras no sepa liberarse: cuánta es **sin medir**;
  - hay que tocar la api y el contrato para tener sala por mundo, y la bodega añade permisos de pantalla compartida;
  - las dos builds siguen (dos `dist/`, un parche frágil);
  - estimación: 60-80 días de agente hasta acabar con el legado, y 40-46 hasta tener las dos salas (**[ESTIMACIÓN]**, desglose en el [PLAN](../rumbo/PLAN.md#mundos-múltiples-adr-0033)).
- **Implicaciones futuras:**
  - CLAUDE.md §5 y la regla 2 hay que reescribirlas al aceptar este ADR (decisión 216);
  - ADR-0010 y ADR-0023 quedan enmendados en lo que dicen del estilo del motor (los cuerpos no se reescriben; se añade una enmienda fechada);
  - cuando el legado llegue a 0 líneas, `genera_motor.mjs` desaparece y `apps/web/src/` pasa a ser la entrada;
  - cuando el `WebGPURenderer` iguale el multiview en el Quest (F2 repetida), se retira super-three (ADR-0031).

## Comprobación
- **Guardianes que nacen con este ADR** (todos en Node, detalle en MUNDOS.md §8):
  - las fronteras sin ciclos;
  - interiores sin sombreadores propios (tope 0);
  - trinquete de líneas del legado;
  - el puente de `genera_motor.mjs` (el motor generado con y sin puente expone los mismos nombres);
  - promesa↔guardián (cada regla de CLAUDE.md apunta a la prueba que la vigila);
  - máquina de estados del `WorldManager` con mundos falsos;
  - «ir y volver deja la memoria como estaba»: `renderer.info.memory` en el banco, por mundo;
  - sala por mundo en la api, que una identidad no puede pedir el token de un mundo que no le toca;
  - la pose con mundo: ida y vuelta, y lectura «a la antigua».
- **Medidas:**
  - capturas y recuentos iguales al terminar la fase 1;
  - memoria del exterior congelado en Chrome y en el Quest (fase 2);
  - una reunión de 6 en la bodega en el Quest a 72 Hz, con tantas voces a la vez como diga la decisión 225 (fase 3);
  - una máquina animada a 72 Hz en el Quest (fase 4).
- **No probado:**
  - nada de esto en el Quest ni en el iPhone;
  - que la sesión XR sobreviva al cambio de raíz en el Quest real (en el banco solo con `pruebas/mock_xr.js`);
  - Spark con super-three;
  - la pantalla compartida en el Quest;
  - la carga de LiveKit con tres salas a la vez en el VPS, cuyos núcleos siguen **[NO VERIFICADO]**.
