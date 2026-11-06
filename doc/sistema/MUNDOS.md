# Mundos: interfaces, contratos y fase 1 (ADR-0033)

**2026-11-06 · diseño, sin código todavía.** Las interfaces están en TypeScript solo como documentación: ningún fichero de `apps/web/src/` existe aún. La decisión y sus alternativas están en el [ADR-0033](../adr/0033-mundos.md). Las fases, en el [PLAN](../rumbo/PLAN.md#mundos-múltiples-adr-0033). Lo que decidió Antonio el 2026-11-06, en [DECISIONS-PENDING 216-227](../rumbo/DECISIONS-PENDING.md#mundos-múltiples-adr-0033-cerradas-el-2026-11-06).

Cada afirmación sobre el código remite a `fichero:línea` de `apps/web/motor/` (en `main` da49133) salvo que se diga otra cosa. Cada interfaz dice qué hallazgos de la [auditoría de noviembre](../auditoria-noviembre2026/RESUMEN.md) resuelve. **[NO VERIFICADO]** = no lo he podido comprobar. **[SUPUESTO]** = cifra o hecho de diseño.

## 1. Las cuatro fronteras

```
apps/web/src/
  nucleo/    Render, Bucle, Cola, Presupuesto, Fundido, XR, Componentes, Entidades, Ajustes, Bus,
             WorldManager (MU2-1: aquí y no en mundos/, ver §3)                                       → no importa de nadie
  datos/     tipos generados de contratos/, índice, teselas, fixtures                                → no importa de nadie
  red/       Sesion, Salas, códec de pose, Voz, Pizarra (transporte)                                 → importa de datos
  mundos/    World, Ambiente, Contexto (mundo.ts); exterior/, molino/, bodega/, vacio/               → importa de nucleo, datos y red
  ui/        HUD, ventanas, panel VR (cuando se migren 24, 31, 32 y 33)                              → cliente de todo
apps/web/motor/   el legado (IIFE), que encoge en su sitio: no se renombra (ADR-0033 §6)              → cliente de todo, por el puente
```

- **Reglas.**
  - Ninguna dependencia hacia arriba ni ciclos.
  - `red` no sabe qué hay dentro de un mundo: solo conoce salas, identidades y temas.
  - Un mundo no importa a otro mundo.
  - Solo `nucleo/render` y la fábrica de materiales importan algo de `three` que dependa del renderer: `three/webgpu`, TSL, `WebGLRenderer`.
  - Los mundos importan `three` solo para geometría, materiales estándar, `Group` y `AnimationMixer`.
- **Guardián:** `dependency-cruiser`, con versión fijada (regla 12: una librería mantenida en vez de un comprobador casero). Las reglas van en `apps/web/.dependency-cruiser.cjs` y corre en la puerta rápida.
- **Resuelve:**
  - L4-02 (cabeceras «Expone/Consume» adivinadas a partir de comentarios: en `src/` las sustituyen `import`/`export`);
  - la causa común 4 del RESUMEN (lo escrito promete más de lo que el código cumple);
  - la frontera que pedía [ARQUITECTURA-MULTIUSUARIO](ARQUITECTURA-MULTIUSUARIO.md).

## 2. `World`

```ts
export type IdMundo = "exterior" | "molino" | "bodega";
export interface Pose2 { x: number; y: number; ang: number }   // en el marco del mundo: x este, y norte (m), ang (rad); como hoy pp.x/pp.y/pp.ang de 12_paseo

export interface World {
  readonly id: IdMundo;
  readonly sala: ClaveSala;                       // §7: «exterior» | «molino» | «bodega»; la api la traduce al nombre de LiveKit
  readonly marco: "finca" | "local";              // el exterior, relativo a centro_utm; los interiores, origen en su puerta interior
  readonly presupuesto: (perfil: Perfil) => Presupuesto;   // regla 6: lo que puede dibujar en cada perfil (pantalla, VR nivel 0-3)

  carga(ctx: Contexto): Promise<void>;            // import() de assets, glb, KTX2; puede tardar; con ctx.senal abortable. No toca la escena
  entra(desde: Puerta | null, llegada: Pose2 | null): void;   // cuelga su raíz, aplica su Ambiente, registra sus entidades; síncrono, a oscuras
  actualiza(dt: number, t: number): void;         // cada fotograma, solo si está activo
  sale(): Pose2;                                  // descuelga la raíz, quita Ambiente y entidades; devuelve dónde estaba quien mira
  congela(): void;                                // sigue en memoria, sin actualizar, sin Cola y sin pedir teselas; puede volver a entra()
  libera(): void;                                 // dispose de geometrías, materiales, texturas, workers y relojes; tras esto, hace falta carga()

  suelo(x: number, y: number): number;            // cota del suelo en su marco (m, sin exagerar)
  dentro(x: number, y: number): boolean;          // ¿se puede estar aquí? Exterior: la caja D.ext; interiores: el polígono de las paredes
  obstaculo(x: number, y: number, radio: number): Pose2 | null;   // el punto corregido si choca (troncos fuera; columnas y máquinas dentro)
  ambiente(): Ambiente;                            // §4
}
```

- **Por qué cada parte:**
  - `suelo/dentro/obstaculo` sustituyen las 82 llamadas sueltas a `suelo(` (en 32 ficheros), los recortes a `D.ext` (13 ficheros) y los bucles sobre `copas` de `12_paseo.js:112-116`, `12b_llegada.js` y `29_vr.js:563-566` (lente 8 §3.1-3.2). `LlegadaPuro.rayoSuelo` e `IrAPuro.planifica` ya reciben suelo y caja por argumento: solo hay que pasarles los del mundo.
  - `congela` es la fase barata y `libera` la cara. **Congelar** tiene que cortar `actualizaCarga` y `Escena3D.actualiza` (`90_final.js:19,54`): si no, con la cámara en un marco local cerca de (0,0), se pedirían teselas del exterior alrededor del origen [deducido]. Y tiene que cancelar los trabajos de la Cola que son suyos (§6).
  - `libera` es la promesa de CLAUDE.md §5 («todo recurso de GPU se libera»), que hoy no cumplen `15_tiempo`, `16_vida`, `18_paisaje`, `19_balizas` ni `21_suelo` (cero `dispose`).
- **Cómo quedó (MU2-1, 2026-11-06).** Los tipos están en dos sitios, por la frontera de §1 (`nucleo` no importa de nadie):
  - `apps/web/src/nucleo/mundos.ts`: `IdMundo`, `Pose2`, `Puerta`, `ContextoBase` y `MundoBase<C>`, que es lo que el gestor necesita de un mundo (el ciclo de vida y los delegados `suelo`/`dentro`/`obstaculo`);
  - `apps/web/src/mundos/mundo.ts`: `World extends MundoBase<Contexto>`, con `sala`, `marco`, `presupuesto` y `ambiente()`, más `Ambiente`, `Contexto`, `Perfil`, `Presupuesto`, `ClaveSala` y `RenderDeMundo` (un `Pick` de lo que da `creaRender`).
  - **Lo que cambia respecto al diseño de arriba, y por qué:**
    - `IdMundo` gana `"vacio"`: el interior de prueba de MU2-8 (`?mundo=vacio`) necesita un id. `ClaveSala` admite `null` (el vacío no tiene sala).
    - `alSalir?: "congela" | "libera"` en el mundo: es la política de §3 (por defecto «congela», decisión 218), y quien crea el gestor la puede sustituir con `politica(mundo)`.
    - `libera()` ha de poder llamarse dos veces: si una carga acaba después del tope de tiempo, el gestor vuelve a liberar lo que haya hecho mientras tanto.
    - `ctx.senal` se aborta si la carga falla o agota el tiempo, y al **liberar**; no al congelar, porque un mundo congelado conserva su contexto y vuelve a `entra()` sin `carga()`.
    - three no trae tipos en el repo (no hay `@types/three`): `raiz`, `luces` y `rig` son un tipo mínimo estructural (`Objeto3D`), como `MallaInstanciada` en `nucleo/presupuesto.ts`.
    - Del `Contexto` de §6 solo están tipados los campos que ya existen en TypeScript (`id`, `senal`, `cola`, `limpia`, `raiz`, `render`, `perfil`, `xr`). `bus`, `entidades`, `laminas`, `materiales`, `ajustes`, `aparato` y `canal` entran con la tarea que los migra (MU2-5, MU2-7, fase 3), en vez de tiparlos ahora con `unknown` de relleno.
- **Resuelve:**
  - L2-05 (sin `dispose`), L2-03 (`Mundo` no suelta teselas: el exterior lo hace en `libera`) y la causa común 3 del RESUMEN;
  - el inventario de la lente 8 §3.1-3.3;
  - L2-06 (el goteo por sesión VR) queda vigilado por el mismo guardián de memoria (§8).

## 3. `WorldManager`

```ts
export type EstadoCambio = "en" | "cerrando" | "saliendo" | "cargando" | "entrando" | "abriendo";
export interface ResultadoCambio { ok: boolean; mundo: IdMundo; motivo?: "mismo" | "ocupado" | "fallo_carga" | "tiempo" | "sin_permiso" }

export interface WorldManager {
  registra(def: () => Promise<World>, id: IdMundo): void;        // talón perezoso: el import() solo se hace al cruzar la puerta
  cambia(a: IdMundo, llegada?: Pose2): Promise<ResultadoCambio>; // cierra (a negro y se QUEDA) → sale → congela|libera → carga → entra → abre
  readonly actual: IdMundo;
  readonly estado: EstadoCambio;
  retorno(id: IdMundo): Pose2 | null;                             // dónde se dejó cada mundo (en memoria; se pierde al recargar)
  // delegados que usa la locomoción (12_paseo, 12b, 12c, 29_vr, 16_vida) en vez de suelo()/D.ext/copas
  suelo(x: number, y: number): number;
  dentro(x: number, y: number): boolean;
  obstaculo(x: number, y: number, radio: number): Pose2 | null;
}
```

- **Invariantes:**
  - hay un mundo activo y solo uno;
  - `renderer.xr`, `setAnimationLoop` y el objeto `scene` no se tocan nunca. La sesión XR es del renderer: `29_vr.js` hace `setAnimationLoop` y `xr.setSession` al entrar, y cuelga el rig, los paneles y el velo de la `scene`;
  - mientras dura la transición, el bucle **sigue presentando fotogramas** a la sesión XR (la escena sin mundo y el velo opaco);
  - si la carga falla o pasa del tope de tiempo, se vuelve al mundo anterior y se abre el velo. Nunca se queda nadie a oscuras;
  - con el cambio en curso no se acepta otro.
- **Máquina de estados:** es un trozo puro (`WorldManagerPuro.transicion(estado, evento)`), probado en Vitest con mundos falsos. Los fallos inyectados en `carga`, `entra` y `sale` también se prueban ahí.
- **Cómo quedó (MU2-1, 2026-11-06).** `apps/web/src/nucleo/mundos.ts` exporta `WorldManagerPuro` (`ESTADOS`, `TABLA`, `ACTUALIZA_EN`, `TIEMPO_MAX_MS` y `transicion(estado, evento)`, sin efectos) y `creaWorldManager(deps)`. Lo reexporta `nucleo/index.ts`, pero **nada del legado lo usa todavía** (MU2-3 en adelante): este paso no cambia nada visible. Lo prueba `nucleo/mundos.test.ts` en Vitest con mundos falsos, un fundido falso, un temporizador falso y la Cola de verdad.
  - **Dependencias, por argumento:** `fundido` (`cierra`/`abre`, MU2-2), `cola` (la de `creaCola`: de ella sale la `ColaDeMundo` de cada uno y con `cancelaDe(id)` se cancelan sus trabajos al salir), `temporizador(fn, ms)` (devuelve cómo cancelarlo), `tiempoMax` (por defecto 20 s **[SUPUESTO]**, sin medir), y opcionales `ahora`, `contexto(base)` (el `Contexto` entero sobre lo que da el gestor), `politica(mundo)`, `permiso(a, puerta)`, `avisa(evento, datos)` y `consola`. No recibe ni `renderer` ni `scene`: no puede tocar `renderer.xr`.
  - **Lo que cambia respecto al diseño de arriba, y por qué:**
    - **Vive en `nucleo/`, no en `mundos/`** (§1). El legado solo ve `@gemelo/nucleo` por el puente (§9.3), y `nucleo` no puede importar de `mundos`; el gestor es maquinaria genérica, como el `Bucle`, y no sabe nada de ningún mundo concreto. El exterior lo montará el legado como un objeto con la forma de `MundoBase` (MU2-3) y lo registrará con `Nucleo.creaWorldManager`.
    - **`libera()` del mundo que sale va al final, no entre `sale` y `carga`.** Al salir siempre se congela (y se cancelan sus trabajos de la Cola); si su política es «libera», se libera en `abriendo`, cuando el nuevo ya ha entrado. Liberar no tiene vuelta atrás: así, si la carga del nuevo falla, el de antes sigue en memoria y se vuelve a él sin cargar nada. El precio es que, durante la carga, los dos están en memoria; si la medida del Quest (MU2-9) dice que no cabe, hará falta un «libera antes» con recarga en la vuelta atrás.
    - **Más motivos en `ResultadoCambio`:** `sin_registrar` (nadie registró ese id), `fallo_sale` y `fallo_entra` (lanzó `sale()` del viejo o `entra()` del nuevo; en los dos se vuelve al de antes), además de `mismo`, `ocupado`, `fallo_carga` (el `import()` o `carga()`), `tiempo` y `sin_permiso`. Y lleva `error` y `ms`. `mundo` es el activo al terminar, `null` si no hay ninguno.
    - **`cambia(a, llegada?, puerta?)`:** la puerta, opcional, llega a `entra(desde, …)` y a `permiso`. Sin `llegada`, se entra donde se dejó ese mundo (`retorno(a)`).
    - **`arranca(a, llegada?)`:** el primer mundo, sin fundido (el velo de carga de la página ya tapa) y sin mundo de antes. Antes de él, `actual` es `null` y los delegados dan suelo 0, `dentro` falso y ningún obstáculo.
    - **`actualiza(dt, t)`:** llama al del mundo activo solo en `en`, `cerrando` y `abriendo` (a oscuras no hay nada colgado que actualizar). `fichaDe(id)` dice si cada mundo está `sin_cargar`, `listo` (cargado y congelado) o `activo`, para `?debug` y las pruebas.
    - **El permiso se pregunta antes de cerrar el fundido:** si es que no, no se oscurece nada.
    - **«mundo:entra» y «mundo:sale»** salen por `avisa` con `{ id, desde, hacia }`; en una vuelta atrás, el de antes «entra» desde el que no pudo entrar. Su contrato en `eventos.json` es de MU2-5.
  - **`ColaDeMundo`** (§6) está en `nucleo/cola.ts` (`creaColaDeMundo(cola, dueño)`): `pon`, `cancela`, `hay`, `cancelaTodo` (= `cancelaDe(dueño)`) y `pendientes`, con las claves `dueño:clave`.
- **Cómo quedó (MU2-3, 2026-11-06): el exterior es el primer mundo registrado.** `apps/web/src/mundos/exterior.ts` exporta `creaExterior({ pasos, recorre, suelo })`, un objeto con la forma de `MundoBase` (`id: "exterior"`), y `creaCargaTeselas(…)` (el paso «carga de teselas», que antes era `actualizaCarga` de `90_final.js`, igual). `90_final.js` solo cablea: crea el exterior con sus pasos, crea el gestor, `registra(…, "exterior")`, da `gm.actualiza` al `Bucle` como un paso y arranca con `gm.arranca("exterior")`. **Sin cambio visible.**
  - **Una segunda puerta al legado: `@gemelo/mundos`.** El exterior vive en `mundos/` (§1) y `nucleo/` no puede importarlo (dependency-cruiser), así que el legado lo ve por un alias propio, `Mundos.<x>` (`apps/web/src/mundos/index.ts`; `genera_motor.mjs` escribe `import * as Mundos from "@gemelo/mundos";` detrás de la del núcleo; alias en `vite.config.js` y `tsconfig.json`). `puente.test.js` vigila las dos. Los interiores seguirán siendo `import()` perezosos, sin pasar por aquí.
  - **El reparto de los pasos del fotograma.** Dentro de `exterior.actualiza(dt, t)`, en el orden de siempre: entidades (`Usables`), tiempo, olivo (estación), vida, minimapa, paisaje, balizas, suelo, nube, componentes fase «mundo», árboles (niveles), carga de teselas, componentes fase «tarde», láminas, `Cola.corre` y `Escena3D.actualiza`. En el `Bucle`, fuera del mundo: cámara/paseo/VR (la locomoción es de todo mundo y pasará por `gm.suelo/dentro/obstaculo`, MU2-4), el render, la fase «trasRender» y el medidor (`depura/vrFin`). **Los componentes («mundo» y «tarde»), las láminas y la `Cola` son de todo mundo, pero van dentro del exterior** porque en el fotograma están *entre* pasos del exterior (`nube` → componentes → árboles → carga → componentes → láminas → `Cola` → `Escena3D.actualiza`) y un solo `gm.actualiza()` no puede intercalarlos sin cambiar el orden. MU2-6 los saca (ver abajo).
  - **`Bucle.recorre(lista, dt, t)`** (nuevo en `nucleo/bucle.ts`): recorre una sublista con las reglas del bucle (un paso «caro» no corre con la página oculta, el render se cronometra, cada bloque suma al reparto). Así los pasos del exterior conservan su reparto (Q0h) y su «caro»; el paso del `Bucle` que llama a `gm.actualiza` es «bloque: null» (se mide por dentro).
  - **Arranque.** `gm.arranca` es asíncrona aunque la carga sea inmediata; el primer fotograma (`Render.arranca`) se pide al cumplirse, para que no corra un fotograma sin mundo activo (que se saltaría los pasos). Si fallara el arranque, se registra y el bucle arranca igualmente.
  - **Fundido en pantalla.** `Nucleo.creaFundidoPantalla` (`nucleo/fundido.ts`): `cierra()`/`abre()` con un velo de DOM mínimo (mismo CSS y 0,15 s que `fundePantalla` de `12b_llegada.js`, que es privado y de ida y vuelta), creado en el primer `cierra()` (hasta entonces el documento no cambia) y opaco hasta `abre()`. Si al cerrar hay sesión de VR, las dos mitades van por `vrCierra`/`vrAbre`. **Nada lo dispara todavía** (no hay un segundo mundo); probado con un documento falso, no en un navegador.
  - **Mínimos, de otras tareas.** `carga` resuelve ya; `entra`, `congela` y `libera` no hacen nada y `sale()` devuelve la pose cero (**MU2-6**: congelar de verdad —cortar `actualizaCarga` y `Escena3D.actualiza`, cancelar la Cola, soltar teselas y GPU—, `entra/sale` con la raíz y la pose de `12_paseo`, y sacar del exterior los pasos de todo mundo). `suelo` es el de `02_mundo` (metros, sin exagerar); `dentro` es siempre verdadero y `obstaculo` siempre `null` (**MU2-4**: la caja `D.ext` y las copas, y que la locomoción pase por `gm`). `ambiente()` y el resto de `World`, **MU2-7**.
- **Fundido:** el de hoy es de ida y vuelta (`29_vr.js:88-96` `vrFundido(fn)`, `12b_llegada.js:90-95` `funde(fn)`). Se parte en `cierra(): Promise<void>` y `abre(): Promise<void>`, y `vrFundido(fn)` se reescribe como `cierra().then(fn).then(abre)`, con la misma semántica.
- **Resuelve:**
  - L7-05 y L7-06 por diseño: todo salto de mundo pasa por `cierra/abre`, y el panel se recoloca a oscuras;
  - L7-01: el `Bucle` del núcleo envuelve cada fotograma en `try/catch`, cuenta los fallos y sale limpio de XR al tercero. Hoy `Componentes` ya protege cada componente en cada fase (`02c_componentes.js:359-360`), pero no protege ni las llamadas a mano de `90_final.js` ni el camino de VR;
  - L7-02 y L7-10: `Bucle` escucha `visibilitychange`, el `reset` del espacio de referencia y `webglcontextlost/restored`, una vez y para todos los mundos.

## 4. `Ambiente`

```ts
export interface Ambiente {
  cielo: "exterior" | "ninguno";                 // «exterior»: lo pinta 15_tiempo (sol, nubes, estrellas, lluvia); «ninguno»: el interior pone su fondo
  fondo: number | null;                          // color sRGB si cielo = «ninguno»
  niebla: { color: number; cerca: number; lejos: number } | null;
  luces: readonly THREE.Light[];                 // las crea el mundo; el núcleo las cuelga al entrar y las quita al salir (hoy hemi y sol, 03_escena.js:30-31)
  camara: { near: number; far: number };         // el exterior: 0,5 y max(5000, 4·EXT) (03_escena.js:17); un interior, p. ej. 0,05 y 80 [SUPUESTO]
  exag: number;                                  // el exterior, la del usuario (1-3); los interiores, 1 fijo
  tono?: { constante: string; expo: number };    // si el mundo quiere otro tone mapping (AG-2.5); si no, el de Render.tono
}
```

- **Dónde se aplica:** el núcleo lo aplica en `entra` y lo deshace en `sale`, guardando lo que había.
- **Lo que hoy falta para que funcione:**
  - `15_tiempo.js` (sol, nubes, lluvia, estrellas y niebla, codificados alrededor del origen del exterior) tiene que obedecer a `cielo: "ninguno"` y dejar de actualizarse;
  - `exag` deja de ser una primitiva global que se reescribe (`03_escena.js:45`, la escriben `09_camara.js:44` y `27_debug.js:28`) y pasa a ser un campo de un objeto (§9.4). **Hecho en A1-13:** `Estado.exag` (`nucleo/estado.ts`); falta que cada mundo tenga el suyo;
  - `near/far` se cambian en caliente durante la sesión XR, cuando hoy solo se tocan en `entraVR`. Que super-three lo admita **sin reiniciar la capa** está **[NO VERIFICADO]**.
- **Resuelve:**
  - la lente 8 §3.3 («no existe un interruptor para el ambiente»);
  - L8-01: la lluvia y la cámara orbital, ancladas a quien mira, se arreglan al migrar `15_tiempo` y `09_camara` dentro del exterior;
  - L8-05: el clima de otra fecha, rotulado.

## 5. `Puerta`

```ts
export interface Puerta {
  readonly id: string;                  // «exterior→molino», «molino→exterior»…
  readonly de: IdMundo; readonly a: IdMundo;
  readonly pos: { x: number; y: number };          // en el marco de «de»; sale del índice o de la configuración del servidor, NUNCA del código
  readonly radio: number;               // radio de cercanía (m), p. ej. 1,5 [SUPUESTO]
  readonly histeresis: number;          // hay que alejarse ≥ radio + histeresis para que se rearme (p. ej. 2 m [SUPUESTO])
  readonly llegada: Pose2;              // en el marco de «a»: 1,5-2 m dentro y mirando hacia dentro, para no volver a disparar la otra
  readonly requiere?: "sesion" | "invitacion" | "aforo";   // la bodega: la api dice si se entra (§7)
}
```

- **Cómo es:** una `Entidad` más (`02e_entidades.js`: `cerca(x, y)` y `radioCerca`, que entra en `Usables.actualiza` cada 0,1 s, también en VR). Cruzarla llama a `WorldManager.cambia(a, llegada)`. En VR no hace falta gatillo, ni tampoco en pantalla: basta con acercarse. Si `requiere` falla, una lámina explica el motivo y no se cambia de mundo.
- **Resuelve:** lente 8 §3.4 (`Entidades` sin mundo). Cada mundo registra solo sus entidades y el minimapa pinta las del mundo activo.

## 6. `Contexto` y `Render`

```ts
export interface Contexto {             // lo que el núcleo presta a un mundo (lista blanca: el «Nucleo» del informe del WorldManager, tipado)
  readonly raiz: THREE.Group;           // la del mundo; el núcleo la cuelga de la única scene en entra() y la descuelga en sale()
  readonly render: Render;
  readonly cola: ColaDeMundo;           // la Cola de siempre (02b_cola.js), pero con dueño: cancelaTodo() al congelar o liberar
  readonly bus: Bus;                    // eventos de contratos/eventos.json, con «mundo:entra» y «mundo:sale» nuevos
  readonly entidades: Entidades;
  readonly laminas: Laminas;            // texto en el mundo (y en el velo, si la carga pasa de 1 s)
  readonly materiales: MaterialesEstandar;   // en los interiores, solo estándar (§8, guardián «interiores sin sombreadores propios»)
  readonly ajustes: Ajustes;
  readonly aparato: Aparato;            // clase del aparato (01a_aparato.js): elige texturas y presupuesto
  readonly perfil: () => Perfil;        // perfil de calidad activo (pantalla, o VR nivel 0-3 de 02g_vr_presupuesto.js)
  readonly canal: CanalMundo;           // la sala del mundo, ya unida por el WorldManager (§7)
  readonly xr: { activa(): boolean; rig: THREE.Object3D };   // solo esto de 29_vr, no VRX entero
  readonly senal: AbortSignal;          // se aborta al salir: carga() cancelable
  limpia(fn: () => void): void;         // como n.limpia de Componentes (02c_componentes.js:287-301): se llama en libera()
}

export interface Render {               // lo que ya es 02h_render.js (Render, InfoDibujo), tipado
  readonly tipo: "clasico" | "nuevo";
  readonly build: "pantalla" | "vr";
  info(): InfoDibujo;                   // { renderizador, llamadas, triangulos, puntos, lineas, geometrias, texturas, programas }
  memoria(): { geometrias: number; texturas: number; bytesEstimados: number };   // L1-07: tope de memoria de GPU
  compila(obj: THREE.Object3D): Promise<void>;   // compileAsync con la cámara XR si hay sesión (L7-04: precompilar con la variante multiview)
}

export interface ColaDeMundo { pon(clave: string, prio: number, trabajo: Generator): void; cancela(clave: string): void; cancelaTodo(): void }   // hecho en MU2-1, con hay() y pendientes() (§3)
```

- **`Render` ya existe** en `02h_render.js` (`Render.tipo`, `.build`, `.arranca` tolerante a `init()`, e `InfoDibujo.lee`): se tipa y se le añaden `memoria()` y `compila()`, no se reescribe.
- **La `Cola`** hoy solo cancela por clave exacta (`02b_cola.js:50`). El dueño por mundo es un prefijo de clave gestionado por `ColaDeMundo`.
- **Resuelve:**
  - los 46 `scene.add` (en 27 ficheros): un mundo solo tiene su `raiz`;
  - la lente 8 §3.1-3.2 (`D` global y el alias `suelo`);
  - el anexo A de la lente 5: con `Render.tipo === "nuevo"`, un material sin versión TSL hace saltar un aviso y un guardián en rojo;
  - L1-07 (tope de memoria de GPU);
  - L7-04 (precompilar con multiview).

## 7. Contratos nuevos o que cambian

Regla 3: contrato, esquema y fixture van en el mismo commit que el código que los usa (fase 3 para la red). Aquí solo se diseñan.

### 7.1 Sala por mundo: `livekit-roles.json` v9
- **`salas`** gana una entrada por mundo:
  - `exterior` es la libre de hoy y **conserva el nombre `hituelo-libre`**;
  - `molino`, de datos y sin audio, como la libre: `hituelo-molino`;
  - `bodega`, de datos: `hituelo-bodega`;
  - `bodega_reunion`, la voz de cada reunión: `bodega-<reunión>`, con el patrón de `guiada-<evento>`;
  - la de la visita, `hituelo-visita`, no cambia.
- **Los nombres llevan la finca** (`<finca>-<mundo>`), como hoy.
- **`roles_bodega`** (por papel, como `roles_guiada`):
  - **ponente:** `microphone`, `screen_share` y `screen_share_audio`;
  - **moderación:** `microphone`;
  - **asistente:** sin pistas hasta que la api le da la palabra, con el mismo mecanismo `UpdateParticipant` de `palabra`.
  - Nadie lleva `roomAdmin`.
- **`aforo`:** lo comprueba la api al firmar el token, contando conexiones por hogar con la lógica de cupo de la agenda (`apps/api/src/agenda/cupo.ts`). Además, el `max_participants` de la sala se fija al crearla. Hoy ese tope es global y vale 50 (`infra/livekit.yaml:12`).
- **`temas_de_datos.pizarra`** (§7.3).
- **En la api:**
  - el `enum` de `sala` pasa de `general|visita` (`apps/api/src/presencia/rutas.ts:72` y `contratos/api.openapi.yaml`) a las claves nuevas, manteniendo `general` como alias de `exterior` durante una versión;
  - `CLAVES_SALA` (`apps/api/src/presencia/livekit.ts:18`) pasa a recorrerlas todas al expulsar, como ya hace.
- **L9-06:** el JWT sigue valiendo 15 min (`TTL_S`, `livekit.ts:25`) aunque ya se llame a `removeParticipant` (`:236`). Se cierra con un webhook `participant_joined` que vuelve a expulsar a quien está en la lista, que se puede probar en Node. La alternativa es un TTL de 2 min con refresco. Decisión técnica en la fase 3.

### 7.2 Pose: `presencia.md` (sigue en la v1)
- **El mundo, en los bits 6-7 del byte 1:** `0` exterior, `1` molino, `2` bodega, `3` otro.
  - Hoy esos bits son reservados y los receptores los ignoran ([presencia.md](../../contratos/presencia.md), byte 1), así que es el mismo truco que el modo P6: un cliente de antes lee `0` y sigue igual.
  - El receptor descarta la pose cuyo mundo no es el suyo. Es una defensa contra el mensaje rezagado del cambio de sala: el aislamiento lo da la sala.
  - Con más de 3 mundos, `3` = «otro» y solo manda la sala.
- **Coordenadas:** el origen es el del **mundo** (en `presencia.md`, «Sistema de coordenadas» deja de decir «Hituelo, decisión 22: un solo mundo»).
  - En los interiores, `y` es la cota sobre el suelo interior y la exageración no aplica.
  - El `int32` en centímetros (±21.474 km) no asume el rango de la finca (lente 8 §3.4).
- **Prueba:** ida y vuelta con los tres mundos en los dos tipos (24 y 56 B), lectura «a la antigua» y descarte por mundo distinto.

### 7.3 Pizarra (contrato nuevo, previsto como contratos/pizarra.md v1)
- **Por dónde viaja:** por el tema `pizarra` de la sala de datos `bodega`.
- **Qué viaja:** trazos, no imágenes. Cada mensaje es `{ v: 1, id, trazo: [[x, y], …] (coordenadas normalizadas 0-1 en u16), color: índice de paleta (0-7), grosor: 1-4, fin?: true }` o `{ v: 1, borra: "todo" | id }`, en JSON UTF-8. Límites:
  - **≤ 2 KB por mensaje, ≤ 20 mensajes/s por emisor** [SUPUESTO]. El receptor descarta lo que se pase.
- **Quién puede dibujar:** LiveKit no restringe un tema por rol (`canPublishData` es todo o nada, `livekit-roles.json`). Por eso el receptor descarta los trazos de quien no tenga `papel: ponente | moderacion` en los metadatos que firma la api. El servidor no lo impone: es una limitación conocida y se dice en la EIPD.
- **Cómo se pinta:** en un `CanvasTexture` del mundo bodega. Nunca como HTML (L9-03: nada de `innerHTML` con texto ajeno).
- **Qué se guarda:** nada por defecto, como el chat (decisión 40). Si Antonio quiere guardarla, es la decisión 225.

### 7.4 Pantalla compartida
- **Qué es:** una pista `screen_share` (y `screen_share_audio`) que solo puede publicar el ponente, desde un ordenador (`getDisplayMedia`). En la bodega se dibuja en un `VideoTexture` con material básico.
- **Lo que hoy no existe:** la red no tiene vídeo (`37_red.js:17`: «El vídeo no está (F4)»). Se añade la suscripción a pistas de vídeo en la capa `red`, con simulcast bajo para el Quest [SUPUESTO].
- **No probado:** que el Quest pueda emitir con `getDisplayMedia` (**[NO VERIFICADO]**; por eso se propone «desde ordenador») y el ancho de banda por el VPS (va con F3h).

### 7.5 Otros
- **`contratos/eventos.json`:** gana `mundo:entra` y `mundo:sale` (`{ id, desde }`).
- **El índice:** gana `puertas` (posición en el marco del exterior). Con ese campo nuevo cambian a la vez el contrato, su esquema y el fixture.
- **Los manifiestos de cada interior** (glb, texturas, presupuesto) son otro contrato y van fuera del repo, como los datos (regla 4; decisión 227).

## 8. Guardianes nuevos (promesa escrita = guardián)

| Guardián | Qué promete | Dónde corre | Fase |
|---|---|---|---|
| Tipos | `tsc --noEmit -p apps/web` sin errores, en modo estricto | puerta rápida (Node) | 1 |
| Vitest | todo `apps/web/src/**/*.test.ts` en verde | puerta rápida (Node), lanzado desde un guardián de `node:test` para conservar el informe de inestables de `pruebas/banco/puerta.js` | 1 |
| Fronteras | §1 sin ciclos ni dependencias hacia arriba (`dependency-cruiser`) | puerta rápida | 1 |
| Puente | el motor generado expone los mismos nombres con el puente que sin él, y cada nombre del legado que migra tiene su talón | puerta rápida | 1 |
| Trinquete del legado | las líneas de `apps/web/motor/*.js` solo bajan respecto a un número escrito en el propio guardián | puerta rápida | 1 |
| Promesa↔guardián | cada regla de CLAUDE.md y cada tope de `pruebas/presupuesto.json` apuntan a la prueba que los vigila; si no, la regla se borra (decisión 216) | puerta rápida | 1 |
| Tipos de contratos frescos | los `.ts` generados desde `contratos/*.schema.json` (`json-schema-to-typescript`, versión fijada) coinciden con los esquemas | puerta rápida | 1 |
| Equivalencia visual | capturas de `pruebas/vistas2.js` y recuentos de `pruebas/presupuesto.json` iguales antes y después | banco (Chrome), una vez por fase | 1 |
| WorldManager | máquina de estados, fallo de carga con vuelta, ningún toque a `renderer.xr` (mundos falsos) | Vitest | 2 |
| Exterior congelado | sin pedir teselas, sin actualizar `Escena3D` y sin trabajos suyos en la Cola mientras está congelado | Vitest + banco | 2 |
| Ir y volver | `renderer.info.memory` y el heap vuelven a la base tras N cambios de mundo (amplía `memoria_vr_chrome.test.js`, hoy con su prueba en `todo`: L2-06) | banco | 2 |
| Interiores sin sombreadores propios | 0 `onBeforeCompile`, `ShaderMaterial`, `RawShaderMaterial` y `NodeMaterial` propios en `apps/web/src/mundos/molino` y `…/bodega` | puerta rápida | 2 |
| Sala por mundo | la api firma solo las claves de `livekit-roles.json` v9; aforo; ponente con `screen_share`, asistente sin pistas | `apps/api` (`node:test`) | 3 |
| Pose con mundo | §7.2 | Vitest | 3 |
| Pizarra | tope de bytes y de frecuencia; trazos de quien no es ponente, descartados | Vitest | 3 |
| Presupuesto por mundo | cada mundo respeta su `presupuesto(perfil)` en el banco | banco | 3-4 |

## 9. Fase 1 al detalle: cimientos sin cambio visible

**Criterio de salida:**
- puerta rápida en verde con Vitest y `tsc` dentro;
- capturas de `pruebas/vistas2.js` iguales píxel a píxel con el mismo umbral de siempre;
- recuentos de dibujo idénticos a los de `pruebas/presupuesto.json`, ya recalibrados en la tanda 1 de la auditoría (L1-06);
- el motor generado expone los mismos nombres;
- el trinquete del legado ha bajado.

Antes de la fase 1 van la fase 0 y las tandas 0 y 1 de la auditoría: el [PLAN](../rumbo/PLAN.md#mundos-múltiples-adr-0033).

### 9.1 `tsconfig`
- **Base común:** `tsconfig.base.json` en la raíz, con lo que ya usa `apps/api/tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` y `erasableSyntaxOnly`.
  - `erasableSyntaxOnly` deja que Node 24 ejecute los `.ts` quitando los tipos, como hace hoy la api. Así un guardián de `node:test` puede importar un `.ts` puro sin compilar.
  - La api pasa a extender esta base en un commit aparte, sin cambiar su comportamiento.
- **El de `apps/web`:** `apps/web/tsconfig.json` con `module: "esnext"`, `moduleResolution: "bundler"`, `lib: ["es2022", "dom"]`, `types: ["vite/client"]` e `include: ["src/**/*.ts"]`. Vite compila los `.ts` sin ningún paso nuevo y `tsc --noEmit` los comprueba.
- **Versiones:** `typescript` en la misma versión fijada que la api (5.9.3), para no tener dos compiladores. La 7.x (el compilador nativo, **[NO VERIFICADO]**) queda para más adelante.
- **El legado no se tipa** salvo el puente: `apps/web/src/legado.d.ts` declara lo que el núcleo recibe del legado al instalarse.

### 9.2 Vitest
- **Versión:** `vitest@5.1.0`, fijada en `apps/web/package.json`. Su dependencia `vite ^6.4` casa con el `vite` 6.4.5 instalado (comprobado en npm el 2026-11-06).
- **Configuración:** `apps/web/vitest.config.ts`, con `environment: "node"`, `include: ["src/**/*.test.ts"]` y sin DOM. Lo que necesite DOM no es lógica pura: va al banco.
- **Ejecutores:** los guardianes de `pruebas/guardianes/` siguen en `node:test` (son 168 ficheros, y no hay hallazgo que pida cambiarlos), y `apps/api` también.
  - **Excepción:** cuando un módulo se migra, las pruebas de su trozo `[puro]` pasan a Vitest junto a él y se borran de su guardián en el mismo commit, para que no haya dos pruebas de lo mismo.
- **Cómo entra en la puerta:** un guardián nuevo lanza `tsc --noEmit` y `vitest run`, así que `npm run puerta:rapida` y la pesada lo corren sin tocar `pruebas/banco/puerta.js`.

### 9.3 Cómo conviven `src/` y la IIFE en Vite
- **Lo que hay hoy:**
  - `genera_motor.mjs:49` escribe `motor.generado.js` como **un módulo ES**: `import * as THREE from "three"` y, detrás, los 92 ficheros concatenados;
  - la IIFE que abre `01_datos.js:8` ve `THREE` porque las importaciones de un módulo son visibles en todo él;
  - las importaciones se evalúan **antes** que el cuerpo.
- **El puente:**
  1. `genera_motor.mjs` añade una línea más delante: `import * as Nucleo from "@gemelo/nucleo";`, con un alias de Vite a `apps/web/src/nucleo/index.ts` como los de `vite.config.js:66-80`.
  2. El módulo que se migra (por ejemplo `02b_cola.js`) **no se borra**: queda como **talón** en su mismo sitio del orden, con su cabecera, y su cuerpo pasa a ser `var CargaPuro = Nucleo.CargaPuro; var Cola = Nucleo.creaCola({ … lo que consumía … });`.
  3. Así siguen igual el orden de montaje (regla 2), las cabeceras «Expone/Consume», `contrato_modulos.js`, `contratos/interfaces.json`, `--sin` y los 92 nombres de fichero, y la IIFE no se entera.
- **Cómo quedó (A1-7, MU1-5, 2026-11-06; ningún módulo migrado aún):**
  - **La línea:** `genera_motor.mjs` exporta `IMPORTA_THREE`, `IMPORTA_NUCLEO` e `IMPORTA_CSS` y `entradaMotor(sin)`; el texto es `import * as THREE from "three";`, `import * as Nucleo from "@gemelo/nucleo";`, `import "./plantilla.css";` y la concatenación de siempre. La del núcleo va **segunda**, junto a la de three: las importaciones se evalúan antes que el cuerpo sea cual sea su orden.
  - **El alias:** `vite.config.js` (`NUCLEO`, delante de `gemelo-olivo`) en las dos builds, porque no depende de `GEMELO_BUILD`; y el mismo en `apps/web/tsconfig.json` (`paths`). Vite compila el `.ts` sin paso nuevo.
  - **`apps/web/src/nucleo/index.ts`** es lo único que ve el legado: lo que exporta es `Nucleo.<nombre>`. Hoy reexporta solo `partesDeVersion` (A1-3). Como nada del legado lo usa todavía, Rollup lo quita del paquete; en cuanto un talón nombra algo, entra.
  - **El talón** lleva la cabecera de siempre (la regenera `contrato_modulos.js --escribe`), la marca `// [talón] apps/web/src/nucleo/<fichero>.ts` y solo declaraciones `  var X = …Nucleo.…;`, con dos espacios de sangría para que `contrato_modulos.js` vea lo que expone, y como mucho 30 líneas de código.
  - **Guardianes:** `pruebas/guardianes/puente.test.js` comprueba cinco cosas:
    - que el texto es el de antes (escrito a mano en la prueba) más esa línea, también con `--sin`;
    - que los nombres que expone cada módulo coinciden con la foto `pruebas/guardianes/referencias/puente_nombres.json`. Es una foto en vez de «con y sin puente», porque con un talón ya no hay un «sin puente» que generar. Se rehace con `GEMELO_PUENTE_ESCRIBE=1` solo si el cambio es a propósito;
    - que ningún módulo declara `Nucleo` y que todo `Nucleo.<x>` del legado lo exporta `index.ts`;
    - la forma de cada talón;
    - que las dos builds resuelven el alias y llevan el núcleo, con Vite de verdad sobre una entrada mínima con un talón dentro de la IIFE.

    `pruebas/guardianes/trinquete_legado.test.js` lleva el tope de líneas de `motor/*.js` **sin cabeceras**: las cabeceras se derivan solas y no son código. El tope es exacto: si el legado sube, la prueba falla, y si baja también, hasta que el mismo commit baje el tope.
- **Lo que no se hace, y por qué:**
  - **Nada en `src/` lee globales del legado al cargarse.** Lo que necesita del legado lo recibe por argumento cuando el talón llama a su fábrica (`creaCola(deps)`, `instala(ctx)`). Sin esto, el orden de evaluación rompería el montaje.
  - **Las primitivas que el legado reescribe** (`exag`, `modo`, `calidad`, `paseando`, `listo`) no pueden ser importaciones (son de solo lectura). El módulo TS que las necesite las recibe dentro de un objeto (§9.4).
  - **Descartado:** compilar TS a una IIFE y concatenarla, porque se pierden los tipos en la frontera, y convertir toda la IIFE de golpe.
- **Los mundos interiores no pasan por el puente:**
  - son trozos perezosos: `import("@gemelo/mundo-bodega")`, con el mismo patrón y el mismo sustituto vacío que `gemelo-olivo`, `vite.config.js:17,68`;
  - se registran con un talón en el `WorldManager`;
  - reciben su `Contexto`.

### 9.4 Qué se extrae a `nucleo/` en la fase 1, y cómo se reexporta
Solo lo que ya es puro o casi, y está probado en Node. En este orden, un commit por fila, cada uno con su talón y sus pruebas movidas a Vitest:

| # | De | A `apps/web/src/…` | Talón en el legado | Arreglo de la auditoría que entra |
|---|---|---|---|---|
| 1 (hecha, A1-10) | `02b_cola.js` (`CargaPuro`, `Cola`) | `nucleo/cola.ts` | `var CargaPuro = Nucleo.CargaPuro; var Cola = Nucleo.creaCola(…)` | dueño por prefijo (`cancelaTodo`), preparación de `congela` |
| 2 (hecha, A1-11) | `02h_render.js` (`Render`, `InfoDibujo`) | `nucleo/render.ts` | `var Render = …, InfoDibujo = …` | `memoria()` (L1-07, si no entró ya en la tanda 1) |
| 3 (hecha, A1-12) | `02g_vr_presupuesto.js` (`VrPresupuestoPuro`, `VrControlPuro`) | `nucleo/presupuesto.ts` | ídem | L7-03 y L1-03 (perfiles que también suben; «holgado» contra el perfil): con cambio de comportamiento solo en VR, va en commit aparte con su prueba |
| 4 (hecha, A1-11) | `02f_xr_perillas.js` | `nucleo/xr-perillas.ts` | ídem | — |
| 5 (hecha, A1-11) | `02e_entidades.js` (`EntidadesPuro`) | `nucleo/entidades.ts` | ídem | — |
| 6 (hecha, A1-11) | `12b_llegada.js` (`LlegadaPuro`), `12c_ir_a.js` (`IrAPuro`) | `nucleo/locomocion.ts` | ídem | prepara §2: reciben suelo, caja y obstáculos |
| 7 (hecha, A1-13) | estado mutable: `exag`, `modo`, `calidad` (`03_escena.js:45`) | `nucleo/estado.ts` (`Estado.exag`…) | `var Estado = Nucleo.creaEstado();` en `03_escena.js`; `var exag` desaparece y sus lectores en el legado leen `Estado.exag` (161 sitios en 38 módulos, en commit aparte) | requisito de §4 |
| 8 (hecha, A1-14) | nuevo: `Bucle` | `nucleo/bucle.ts` | `var Bucle = Nucleo.creaBucle({ …, pasos: [ … ] })` en `90_final.js`, con las mismas llamadas en el mismo orden; `var cuadro = Bucle.cuadro, bucle = Bucle.bucle` | L7-01, L7-02, L7-10 (`try/catch` por fotograma, `visibilitychange`, pérdida de contexto) |
| 9 | nuevo: tipos de contratos | `datos/tipos/*.ts` generados | — | L4-03, L4-04, L4-05 (salen a la luz los campos fuera de contrato) |

- **Pieza 1, hecha (A1-10 = MU1-6).** `nucleo/cola.ts` exporta `CargaPuro`, `creaCola({ ahora })` y `duenoDe`; `02b_cola.js` es el primer talón (4 líneas) y la Cola sale del núcleo con el mismo orden de trabajo y los mismos presupuestos por fotograma. Lo nuevo, aditivo: el dueño por prefijo (`exterior:N12`; `cancelaDe(dueño)` y `pendientesDe(dueño)`), con lo que `ColaDeMundo.cancelaTodo()` de §6 se escribe encima sin tocar la Cola otra vez. Las pruebas puras de la Cola y de `CargaPuro` se movieron de `carga_sin_tirones.test.js` a `nucleo/cola.test.ts` (Vitest); `contratos/interfaces.json` lleva `fuente` y `fabrica` para que `contratos.test.js` siga vigilando los miembros exactos sobre `creaCola` y que el talón la llame. El motor legado pasó de 19.774 a 19.712 líneas (`TOPE`).

- **Pieza 2, hecha (A1-11 = MU1-7).** `nucleo/render.ts` exporta `RenderPuro`, `InfoDibujo` y `creaRender({ busqueda, build, almacen, consola })`; `02h_render.js` es el talón (`var Render = Nucleo.creaRender({…})`). Con el mismo comportamiento (`?render=`, `?tono=`, `?expo=`, la build, `arranca`) y lo nuevo, aditivo: `Render.enlaza({ rd, escena, camara, camaraXr })` (la llama `03_escena.js`, una línea más en el legado) y con él `Render.info()`, `Render.memoria()` y `Render.compila(obj)` (`compileAsync` con la cámara XR si hay sesión). **Honestidad:** `memoria().bytesEstimados` vale 0 («no estimado») hasta que L1-07 lo alimente con tamaños de textura, que three no da; `compila` con multiview está **no probado** en el Quest. Los guardianes que evalúan `02h` en un vm (`_materiales.js`) le prestan el núcleo de verdad (`Nucleo`, cargado con `require` del `.ts` en Node 22.18+). Las pruebas puras pasaron de `render_f1.test.js` a `nucleo/render.test.ts`; se quedan en el guardián las que cruzan con three y con el legado.

- **Pieza 4, hecha (A1-11 = MU1-7).** `nucleo/xr-perillas.ts` exporta `XrPerillasPuro` y `creaXrPerillas({ busqueda, almacen, ignoradosOlivos })`; `02f_xr_perillas.js` es el talón. Mismo comportamiento y mismos nombres en `XrPerillas` (`aa`, `efectivas`, `js()`, `linea()`, `multiview`…). Del legado recibe por argumento la URL, el almacén (de él lee una vez «vr.multiview») y los ignorados de `02m_tope_olivos` (`typeof TopeOlivos`), con lo que la cabecera «Consume» de `02f` queda en `02m` y el módulo `14_historia` deja de «exponer» `rango` (una función local suya que `02f` tomaba por consumo: la foto `puente_nombres.json` se rehízo solo por eso). Las pruebas puras y las del estado pasaron de `xr_perillas.test.js` a `nucleo/xr-perillas.test.ts`; `tope_tiles`, `vr_control` y `vr_gente_presupuesto` toman la lógica de `Nucleo` (`pruebas/guardianes/_nucleo.js`). Sin cambio de comportamiento en VR: **no probado en el Quest**.

- **Pieza 5, hecha (A1-11 = MU1-7), solo la parte pura.** `nucleo/entidades.ts` exporta `EntidadesPuro` (ids, validación, `gana`, `cercano`, `lineas`); `02e_entidades.js` **no es un talón completo**: conserva `Entidades` (registro) y `Usables` (selección, ficha en el DOM, anillo en la escena), que tocan el DOM, el Bus y la escena y se migran con la fase 2, y sustituye su bloque `[puro]` por `var EntidadesPuro = Nucleo.EntidadesPuro;`. Las cinco pruebas puras pasaron de `entidades.test.js` a `nucleo/entidades.test.ts`; el resto (con DOM, Bus y THREE de mentira) se queda en el guardián, que ahora le presta el `Nucleo` de verdad.

- **Pieza 6, hecha (A1-11 = MU1-7), solo la parte pura.** `nucleo/locomocion.ts` exporta `LlegadaPuro` e `IrAPuro` (rayo contra el suelo, aterrizar fuera de troncos, toque frente a arrastre, girar, avanzar, rodear troncos, línea de puntos). Ya reciben el suelo (`alto`), la caja (`ext`) y los obstáculos (`copas`) por argumento, que es lo que pide §2: no hizo falta cambiarles la firma. `12b_llegada.js` y `12c_ir_a.js` **no son talones completos**: conservan `Llegada` e `IrA` (el anillo, el velo, la línea de puntos y los oyentes tocan THREE y el DOM) y sustituyen su bloque `[puro]` por `var LlegadaPuro = Nucleo.LlegadaPuro;` / `var IrAPuro = Nucleo.IrAPuro;`. Las pruebas puras pasaron de `llegada.test.js` e `ir_a.test.js` a `nucleo/locomocion.test.ts`; los guardianes conservan la costura por texto y lo que corre en Chrome (no abierto en esta tanda).

- **Pieza 3, hecha (A1-12 = MU1-8).** Migración pura, sin cambio de comportamiento: `nucleo/presupuesto.ts` exporta `VrPresupuestoPuro`, `VrControlPuro` y `creaVrPresupuesto({ ventana })` (la fábrica de `VrPresupuesto`; la ventana entra por argumento para publicar `__vrPresupuesto`, sin leer globales al cargarse); `02g_vr_presupuesto.js` es un talón completo (3 líneas). Las pruebas puras pasaron de `vr_presupuesto.test.js`, `vr_control.test.js` y `vr_gente_presupuesto.test.js` a `nucleo/presupuesto.test.ts` (Vitest); en los guardianes queda lo que cruza con el legado (`VR_PERFILES` y la Cola de 29_vr, las perillas de 02f, `Aparato` de 01a y los módulos que se apuntan, con `Nucleo` en su contexto). `_reservas.js` vigila `mueve` en el `.ts`. El motor legado pasó de 19.303 a 19.135 líneas (`TOPE`). La foto `puente_nombres.json` no cambia: el talón expone los mismos tres nombres.

- **Pieza 7, hecha (A1-13 = MU1-9).** Cambio mecánico, sin cambio de comportamiento: `nucleo/estado.ts` exporta `creaEstado(inicial?)` (un objeto nuevo `{ exag: 1, modo: "nube", calidad: 1 }` en cada llamada, con lo que cada mundo podrá tener el suyo) y `ESTADO_INICIAL`; `03_escena.js` sustituye `var exag = 1, modo = "nube", calidad = 1;` por `var Estado = Nucleo.creaEstado();` (no es un talón: el resto del módulo sigue en el legado). Las 161 lecturas y escrituras de las tres variables, en 38 módulos, pasaron a `Estado.exag`, `Estado.modo` y `Estado.calidad` con un reescritor de acorn que resuelve los ámbitos (una local o un parámetro `modo` no se tocan; las claves de objeto, como `modo:` de `window.__g` y `exag:` de `__vrDebug`, tampoco). Los manifiestos que consumían `exag` o `modo` consumen `Estado`; la foto `puente_nombres.json` cambia solo en `03_escena.js` (ya no expone `exag`, `modo` ni `calidad`, sino `Estado`). Lo vigila `pruebas/guardianes/estado_mutable.test.js`: nadie vuelve a declarar ni a usar sueltas las tres, `Estado` nace una vez y no se reasigna, y un trinquete con el resto del inventario.
  - **El inventario (acorn, 2026-11-06):** las globales de la IIFE reasignadas fuera de su declaración y escritas en más de un módulo, o escritas en uno y leídas en otro, eran 27 (contando `ndLo`/`ndHi`, que nacen en `02_mundo` pero solo las escribe y las lee `10_ndvi`). Pasan a `Estado` las tres de esta fila; quedan 22, en el trinquete: `primera`, `paseando`, `persona`, `teclas` (12_paseo; `primera` la escriben también 16_vida y 29_vr), `listo` (08_marcadores; la escribe 90_final), `kcor` (02_mundo; la escribe 09_camara), `tinte` (02_mundo; la escribe 10_ndvi), `ndviIdx` (10_ndvi; la escribe 14_historia), `instSombra` (18_paisaje; la escribe 07_follaje), `aguaNivel` (18_paisaje), `avTipo`, `OT`, `VIVO` (14_historia), `enDron`, `enQuad`, `tVida`, `vq` (16_vida), `FACTOR_R8`, `FACTOR_R8_GEN` (01_datos), `fincaSel`, `parcelaSel` (13_parcelas) y `tMundo` (15_tiempo). Las que reescribe otro módulo (`primera`, `listo`, `kcor`, `tinte`, `ndviIdx`, `instSombra`) son las siguientes candidatas; `paseando` y `listo` son las que §9.3 ya nombra.

- **Pieza 8, hecha (A1-14 = MU1-10).** `nucleo/bucle.ts` exporta `creaBucle(deps)` y `BuclePuro` (constantes, textos de aviso, `rumbo`, `giraXZ`, `recoloca`). `90_final.js` ya no tiene `cuadro()` ni `bucle()` propios: da la lista de pasos (cada uno con su bloque de `Reparto`, `null` si se mide dentro, `caro` si se salta con la página oculta, `render` para el cronómetro de F0) y las dependencias del legado por argumento (reloj, `requestAnimationFrame`, `Pausa`, `Reparto`, `Ajustes`, `VRX`, `Hud.aviso`, `document`, `renderer.domElement`, `setTimeout`). En el caso normal, las mismas llamadas, en el mismo orden, con las mismas lecturas de reloj. Lo nuevo: L7-01 (`try/catch` por fotograma; mensajes limitados; en VR, al tercer fallo seguido, `session.end()` con aviso), L7-02 (`visibilitychange` de la página y de la sesión: sin los pasos caros mientras está oculta y sin el `dt` largo al volver; `reset` del espacio de referencia → `vrRecoloca`, una función nueva de `29_vr.js`) y L7-10 (`webglcontextlost`: `preventDefault`, bucle parado, aviso y fuera de VR; `webglcontextrestored`: se rehace —three reconstruye su estado y vuelve a subir lo que conserva— con aviso de recargar si falta algo, y aviso de recargar si no vuelve en 10 s). Las escuchas de la sesión y de su espacio se ponen y se quitan solas al cambiar la sesión (una comparación por fotograma). La foto `puente_nombres.json` cambia solo porque `29_vr.js` expone `vrRecoloca`. Las comprobaciones de texto del bucle que hacían `componentes.test.js`, `mide.test.js` y `escena3d.test.js` se adaptan a la lista de pasos; la lógica (pausa, lecturas de reloj, reparto) la prueba `nucleo/bucle.test.ts`. El motor legado pasó de 19.135 a 19.124 líneas (`TOPE`). Sin cambio en VR en el caso normal; los casos de fallo, **no probados en el Quest**.

- **Fuera de la fase 1:**
  - `02c_componentes.js`, por tamaño (396 líneas) y porque de él cuelgan 32 componentes: va en la fase 2;
  - `02_mundo.js`, que es el exterior: fase 2;
  - `29_vr.js`, en la fase 2 y solo el fundido partido.

### 9.5 Cómo se demuestra que el gemelo se ve y mide igual
1. **Antes de empezar:** una toma de referencia en el banco, encargada una vez (`npm run banco:encarga`) con el fixture: `pruebas/vistas2.js` (capturas a hora fija), `pruebas/prueba3.js` (recuentos, llamadas, triángulos y memoria), `pruebas/vr_mock.js` (VR simulada). Se apunta en [MEDIDAS](MEDIDAS.md) como «foto, no se mantiene».
2. **En cada commit:** puerta rápida (Node, Vitest y `tsc`), más el guardián del puente: los mismos nombres expuestos, y el texto generado igual al anterior salvo el talón y la línea de importación.
3. **Al final de la fase:** una sola ronda del banco con las mismas tres pruebas, comparada con la referencia. Las capturas, con el umbral de siempre. Los recuentos y `renderer.info.memory`, **idénticos**. Cualquier diferencia se explica o se arregla antes de cerrar.
4. **Lo que no se puede demostrar en el banco:**
   - los fps y el p95 en el Quest (SwiftShader no mide fps);
   - el multiview, porque el banco no lo tiene.
   - Esos los mide Antonio con `?mide` en el Quest si cambia algo del bucle de VR (la fila 3 del §9.4). Si no cambia nada, se dice «**no probado en el Quest, sin cambios en el camino de VR**».

## 10. Riesgos

| Riesgo | Probabilidad | Señal | Mitigación |
|---|---|---|---|
| **El strangler se eterniza** y conviven dos estilos un año | Alta | el trinquete del legado deja de bajar durante dos tandas | Regla «quien toca, migra» (ADR-0033 §6); trinquete que solo baja; contador en ESTADO; la fase 5 tiene una tarea por módulo en el PLAN, con su tamaño. Si en 8 semanas el legado no ha bajado un 25 %, se revisa el plan [ESTIMACIÓN] |
| **La memoria del exterior congelado no deja sitio** a un interior en el Quest | Media | caída de la pestaña o heap > presupuesto con un interior cargado | Medir en la fase 2 (heap y `renderer.info.memory` con el exterior congelado, en Chrome y en el Quest). Intermedio inmediato: al entrar a un interior se liberan `Escena3D` y la nube, que ya saben liberarse (`04b_escena3d.js:289`, `05_nube.js`), y se congela el resto. Si no basta, la fase 5 se adelanta a la 3 (decisión 218) |
| **Doble renderer y doble material** durante meses | Cierta | — | Los interiores no llevan sombreadores (ADR-0033 §5): el doble trabajo se queda en el exterior, que ya existe. Ningún material nuevo se escribe dos veces. No se escribe TSL hasta fijar la versión de three |
| **super-three deja de publicarse** o se queda en 0.185 | Media | sin r187 en npm a primeros de diciembre | El parche falla al construir si super-three cambia (`parche_multiview.mjs`). La pantalla puede subir a 0.187 sola (decisión 224). Ningún mundo depende de un sombreador que solo exista en super-three. Si se abandona, la salida es la del ADR-0031: F2 repetida con el `WebGPURenderer` del momento, o el clásico sin multiview (+15 % de `render()`, medido en AG-3c) |
| **Las dos builds se separan de versión** (0.187 pantalla, 0.185 Quest) | Alta mientras dure | el guardián de `#include` iguales (`builds_f2.test.js`) en rojo | Relajarlo a «los trozos que el motor parchea» y mantenerlo para los dos; capturas en las dos builds |
| **El banco de un solo Chrome** en un i5 con 8 GB se atasca | Alta | colas del banco de horas; memoria libre < 1 GB | Lo puro a Vitest (objetivo: el 80 % de la lógica sin Chrome); una sola ronda del banco por fase con base compartida; las tareas ligeras en paralelo con una pesada; medir CPU y memoria antes de lanzar (CLAUDE.md §6) |
| **Se cargan teselas del exterior dentro de un interior** | Alta si no se corta | peticiones a `/teselas` con un interior activo | `congela` corta carga, `Escena3D` y la Cola; guardián en Vitest y en el banco |
| **Se pierde la sesión XR** al cambiar de mundo | Media | el Quest saca al usuario al entorno del sistema | `WorldManager` nunca toca `renderer.xr`; `try/catch` por fotograma; prueba con `pruebas/vr_mock.js`; medida en el Quest real (no se puede en el banco) |
| **Pantalla compartida y voz de 6** saturan el VPS o el Quest | Media | F3h (10 personas con audio) aún sin medir | Solo el ponente desde ordenador, simulcast bajo, `MAX_VOCES` decidido (decisión 225); medir antes de abrir a familias |
| **Hay datos privados en el repo público** (escaneos de la nave con personas, modelos) | Baja-media | guardián de secretos | Modelos y capturas fuera del repo (regla 4), servidos por `/teselas/<finca>/<mundo>/`; decisión 227 |
| **Los tipos generados descubren campos fuera de contrato** | Cierta | `tsc` en rojo al generar | Es lo que se busca: cada uno se arregla en el contrato o en el motor en el commit que lo descubre |

## 11. Qué cambia respecto a la propuesta de la auditoría

- **`apps/web/motor/` se queda donde está.** La propuesta lo movía a `motor-legado/`, pero lo citan por ruta 63 guardianes de trozos `[puro]`, `contratos/interfaces.json`, el comprobador de cabeceras, `--sin` y CLAUDE.md.
- **El puente usa talones con nombre** en vez de reexportar sin más, para que la regla 2 (orden de montaje) siga siendo cierta durante el strangler.
- **`Render` no se extrae: ya existe** (`02h_render.js`). Se tipa y gana `memoria()` y `compila()`.
- **Cifras corregidas sobre `main`:**

  | Qué | Decía la propuesta | Es hoy |
  |---|---|---|
  | ficheros en la IIFE | 95 | 92 |
  | líneas que cita de `genera_motor.mjs` | `:141` | `:20-25` (el fichero tiene 67 líneas) |
  | llamadas a `suelo(` | ~120 | 82-84 |
  | `onBeforeCompile` | 19 | casi todos por la fábrica: 11 `parchea`, 5 `encadena`, 9 `sombreador`; fuera, 4 asignaciones directas y 3 `ShaderMaterial` |

- **La pose no cambia de versión:** el mundo va en los bits 6-7 reservados de la v1, y el aislamiento lo da la sala.
- **Expulsar y revocar:** `removeParticipant` ya se usa (`livekit.ts:236`), en contra de lo que decía la propuesta en §5. El hueco de L9-06 es la reutilización del JWT durante 15 min.
- **La voz no es `PositionalAudio`:** es `<audio>` silenciado con `PannerNode` y `MAX_VOCES = 4` (`45_voz.js:45`). El criterio «reunión de 6» depende de la decisión 225.
- **La pantalla compartida sí necesita infraestructura nueva:** vídeo en la red, que hoy no hay (`37_red.js:17`), y permisos `screen_share`.
- **La bodega reusa las guiadas** (turno de palabra, cierre, moderación) **y el cupo de la agenda** para el aforo, en vez de montar moderación nueva.
- **three 0.187 va en un commit aparte** (AG-0.4), como pronto el 2026-11-13. La build del Quest se queda en 0.185.0 hasta que se publique super-three r187.
