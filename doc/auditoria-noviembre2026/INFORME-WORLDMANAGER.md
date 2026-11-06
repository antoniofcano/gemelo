# La nave como mundo aparte: diagnóstico y esqueleto de un `Mundos` (WorldManager) sobre el motor del gemelo

Base: `antoniofcano/gemelo` en `4ab0ae6` (2026-11-05, v0.2.0). three 0.186.1 en la build de pantalla, `super-three` 0.185.0 en la build de VR (Quest, multiview por defecto), Vite 6.4.5, `3d-tiles-renderer` 0.5.3, `livekit-client` 2.22.4, `@pixiv/three-vrm` 3.5.5. Todo lo que se cita es `apps/web/motor/<fichero>:<línea>` salvo que se diga otra cosa. Lo que no he podido comprobar va marcado **[NO VERIFICADO]**; las estimaciones, **[ESTIMACIÓN]**.

Una advertencia antes de nada: lo que pides contradice dos frases que ya están escritas en el repo (`doc/sistema/ARQUITECTURA-MULTIUSUARIO.md:128-130`): «Al cruzar la puerta se ocultan las teselas exteriores; la sala de LiveKit es la misma» y «El Gaussian splatting queda como alternativa… no compensa». No es un problema, pero cambiar de opinión aquí es una decisión de arquitectura con alternativas reales: toca ADR (regla 8 de `CLAUDE.md`), no un commit cualquiera. Le llamaría ADR-0033 «Mundos».

---

## 1. Diagnóstico: cómo está el código hoy frente a «mundos separables»

### 1.1 Un solo bloque, por diseño

- **Un ámbito compartido.** `apps/web/herramientas/genera_motor.mjs:141-146` concatena los 95 ficheros de `motor/` en orden alfabético dentro de UNA IIFE (`01_datos.js:8` la abre, `99_cierre.js` la cierra). No hay módulos ES por dentro: `var` y ámbito común. ADR-0023 lo contó: ~285 nombres compartidos, 448 dependencias entre módulos. Es una decisión consciente (ADR-0010, ADR-0023 alternativa B) y funciona; pero significa que **«mundo» no existe como concepto en el código**: existe «el motor».
- **Una escena, un renderer, una cámara, creados al cargar.** `03_escena.js:11-17`: `renderer = new THREE.WebGLRenderer({ canvas, antialias: XrPerillas.aa, [multiviewStereo] })`, `scene = new THREE.Scene()`, `camera = new PerspectiveCamera(42, 1, 0.5, max(5000, 4·EXT))`. El `far`, la niebla (`FOG0/FOG1`, `01_datos.js:21`) y el `near` salen de la extensión de la finca (`D.ext`). **26 ficheros hacen `scene.add(...)` directamente** (16_vida 5 veces, 15_tiempo 4, 29_vr 2, 14_historia 2, 18_paisaje, 19_balizas, 21_suelo, 22b, 26b, 38, 39, 44b, 47b, 50…). Nadie añade a un grupo raíz propio del mundo; todo cuelga de `scene`.
- **Los datos son globales y son LA finca.** `01_datos.js:10`: `D = JSON.parse(#datos)` (el índice incrustado por `genera_motor.mjs:174`). `D.ext`, `D.teselas`, `D.tileset`, `D.paisaje`, `D.centro_utm` se leen por todo el motor. El exterior no es «un mundo con datos»: es el único universo de coordenadas que el motor conoce.
- **El bucle nombra al exterior.** `90_final.js:30-61`, `cuadro(t)`: tras la cámara, llama a mano a `Usables.actualiza`, `actualizaTiempo`, `actualizaOlivo`, `actualizaVida`, `actualizaMinimapa`, `actualizaPaisaje`, `actualizaBalizas`, `actualizaSuelo`, `actualizaNube`, `Arboles.actualiza`, `actualizaCarga` (pide teselas por la posición de la cámara: `90_final.js:21`), `Laminas.revisa`, `Cola.corre`, `Escena3D.actualiza`, `renderer.render(scene, camera)` (línea 55). Los **31 componentes** registrados (`Componentes.registra`) van por fases sin nombrarlos; los ~10 módulos «de siempre» siguen a mano. El motor está a medio camino de la migración incremental que fijó ADR-0023 (C10 «al tocarlos»).
- **La locomoción está pegada al terreno de la finca.** `12_paseo.js` y `29_vr.js` llaman a `suelo(x, y)` de `02_mundo.js` (3 y 9 llamadas), chocan contra `copas` (`29_vr.js:563`) y recortan a `D.ext` (`29_vr.js:565`, `12_paseo.js:116`, `12b_llegada.js:18`). Dentro de una nave con suelo plano y paredes, nada de eso vale.
- **Casi nada del exterior sabe liberarse.** Hay `dispose()` en lo que carga a trozos (`02_mundo.js:130` ortofotos, `05_nube.js:52`, `07ab_generados.js:674`, `07b_arboles.js:77`, `04b_escena3d.js:287 libera()`), pero `18_paisaje.js`, `21_suelo.js`, `19_balizas.js`, `15_tiempo.js`, `16_vida.js` tienen **cero** `dispose` y crean geometrías y materiales en el primer nivel del módulo al cargar. `Mundo` (`02_mundo.js`) no tiene `libera()` de teselas: solo suelta ortofotos lejanas. Y hay relojes propios fuera del bucle (`31_hud.js:213` dos `setInterval`, `31b_hud_personal.js:68`, `15_tiempo.js:613,631`).
- **Hay ya una fuga medida al entrar y salir de VR** (PLAN AG-P1b: ~3 geometrías y ~1 textura por sesión; `pruebas/guardianes/memoria_vr_chrome.test.js`). Cambiar de mundo multiplicará ese tipo de fuga si no hay un contrato de liberación.

### 1.2 Lo que ya juega a favor (y que no hay que reinventar, regla 12)

- **`Componentes` (`02c_componentes.js:276-373`)** ya es un ciclo de vida: `monta(n)` → fases → `libera(api)` con `n.limpia(fn)` que se suelta solo (`:287-301`), apagado en cascada de quien consume lo que se libera (`:321-331`), **y un componente registrado después de `arranca()` se monta en el acto (`:282`, pensado para `import()` perezoso)**. Esto es exactamente el gancho que necesita un mundo cargado bajo demanda.
- **`Pausa` (`02c:134-141`)** ya para el mundo entero salvo la fase «pausa» (los juegos a pantalla completa, `40_juegos.js:260`). Es el precedente de «el exterior no se actualiza»; pero **no se aplica en VR** (`90_final.js:34`: `Pausa.activa() && !VRX.on`), así que no sirve tal cual.
- **La red ya es un canal.** `37_red.js`: `Red.sala(clave).une(cred)`; `une()` en una sala ya ocupada **deja la anterior y entra en la nueva bajo la misma clave** (`:150-175`). La presencia (`38_presencia_compartida.js:476 cambiaSala`, `:415 conectaUna`) ya cambia de sala pidiendo otro token a `POST /api/presencia/token { dispositivo, sala }`. La identidad, el alias y el avatar los pone la api en los metadatos del token: **la identidad del avatar ya es independiente de la sala**. Lo que falta es solo una clave de sala nueva.
- **El fundido a negro ya existe en VR y en pantalla.** `29_vr.js:88-96` (`vrFundido(fn)`: velo pegado a la cámara, 0,15 s + 0,15 s, llama a `fn` a oscuras) y `12b_llegada.js:90-95` (`fundePantalla`, `funde(fn)` elige según `VRX.on`). Es el fundido de la llegada; vale tal cual para el cambio de mundo, salvo que `fn` ahí es síncrona y la carga de la nave es asíncrona (hay que poder «quedarse a oscuras» hasta que el otro mundo esté listo: ver §2.5).
- **La sesión XR es del renderer, no de la escena.** `29_vr.js:670-698 entraVR` hace `renderer.xr.enabled = true`, `setAnimationLoop(vrAnimacion)`, `xr.setSession(ses)`; `vrAnimacion` (`:699`) llama a `cuadro()`. Mientras nadie toque `renderer.xr`, ni haga `setAnimationLoop(null)`, ni recargue la página, **la sesión sobrevive a cualquier cambio de contenido de `scene`**. Lo que sí hay que cuidar: `entraVR` añade `vrRig`, `panel.m`, `ficha.m`, `fichaB.m`, `arco`, `vtLin` a `scene` (`:690`); si se cambiase el objeto `scene`, se perderían.
- **La cercanía ya es un servicio.** `02e_entidades.js`: un tipo registrado con `cerca(x, y)` y `radioCerca` entra en `Usables.actualiza` (cada 0,1 s mientras paseas, también en VR porque `vrActualiza` llama a `actualizaPaseo`) y emite `usable:cerca`. Una «puerta» es una entidad más.
- **El `import()` perezoso con alias de Vite ya es el patrón** para todo lo pesado (`vite.config.js:257-268`: `gemelo-olivo`, `livekit-client`, `three-vrm`, `nipplejs`, `three-mesh-bvh`) y Vite trocea solo. Un módulo de la nave es un alias más.
- **ADR-0023, alternativa D** deja escrito el destino: «un componente puede vivir en `apps/web/componentes/<id>/` como módulo ES cargado con `import()` y registrarse igual» (fase C10). La nave es el primer caso que lo justifica.
- **La fábrica de materiales** (`02i_materiales.js`) es el único sitio por donde debe pasar cualquier sombreador propio; cualquier material de la nave debe nacer ahí (el guardián de trinquete lo vigila).

### 1.3 Veredicto

Hoy el código es un bloque monolítico **con un sistema de componentes que ya tiene el ciclo de vida correcto** pero que solo cubre un tercio del motor. Separar «mundos» no exige módulos ES ni reescribir la IIFE: exige (a) que el exterior deje de ser implícito (un objeto `World` que agrupe lo que hoy está suelto en `90_final.js` y en el primer nivel de 15-20 módulos), (b) que la locomoción pregunte al mundo activo por el suelo y los límites, y (c) que la nave nazca desde el primer día como componente con `libera()` completo. El exterior no se va a poder **liberar** de verdad a corto plazo sin tocar ~15 ficheros; sí se puede **ocultar y congelar** con cambios pequeños. Esa es la frontera honesta entre lo barato y lo caro.

---

## 2. Propuesta: `Mundos` sobre tu código

### 2.1 Decisiones de diseño (y por qué, con su coste)

| Decisión | Elegida | Alternativa descartada | Por qué |
|---|---|---|---|
| ¿Una `THREE.Scene` o una por mundo? | **Una sola `scene`**, cada mundo es un `Group` raíz + sus luces, niebla y fondo que el mundo pone/quita al activarse | Intercambiar la variable `scene` | 26 módulos la referencian; `29_vr` cuelga de ella el rig, los paneles y el velo; cambiarla en mitad de una sesión XR obliga a recolgar todo. Un grupo raíz por mundo es lo que ya hacen `18_paisaje` (`gPaisaje`) y `07b` (`gArboles`) |
| ¿Renderer y cámara? | **Compartidos**, el mundo solo ajusta `camera.near/far` al activarse (como ya hace `entraVR`, `29_vr.js:689`) | Renderer por mundo | Dos renderers = dos contextos GL = perder la sesión XR. Descartado sin discusión |
| ¿El exterior se descarga? | **Fase 1: se oculta y congela** (`raiz.visible = false`, sin `actualiza`, sin pedir teselas, `Escena3D` sin `update`). **Fase 2: `dispose` real** solo cuando cada módulo del exterior tenga `libera()` | Dispose completo desde el primer día | Hoy no se puede escribir sin tocar 18, 19, 21, 15, 16, 14, 02_mundo y los relojes del HUD. Ocultar deja la memoria del exterior viva (hoy ≈350 MB de presupuesto en Quest): es el precio de no romper nada en el paso 1, y se mide |
| ¿La nave como fichero `NN_nave.js` concatenado o módulo ES aparte? | **Módulo ES aparte** (`apps/web/mundos/nave/`), cargado con `import("gemelo-mundo-nave")`, que recibe un `Nucleo` y se registra con `Componentes.registra` | Un fichero más en `motor/` | Un fichero en `motor/` entraría en el bundle principal (hoy todo se concatena) y Spark (~cientos de KB + workers) no debe cargarse en quien no entre en la nave. El módulo aparte es lo que ADR-0023 D ya prevé |
| ¿Cómo llega el módulo a lo interno de la IIFE? | Un objeto **`Nucleo`** explícito (lista blanca) que la IIFE le pasa | `window.__g`-style globales | Lo que la nave usa queda escrito en un sitio; el guardián de contratos puede comprobarlo |
| ¿El mundo es un canal de red? | **Sí: clave de sala nueva `nave`** en api y contrato; la presencia pide token con `sala: "nave"` al entrar y vuelve a `general` al salir | Misma sala, filtrar poses por mundo en el cliente | Filtrar en cliente sigue recibiendo 10 Hz de poses de gente de otro mundo y las dibuja «en el sitio equivocado» si no se filtra bien. Canal = cero coste y cero riesgo de mezcla. Coste: tocar api + contrato (ver §3) |
| ¿Coordenadas de la nave? | **Marco local propio** (origen en la puerta interior, y arriba) | Colocarla en coordenadas de finca | Los splats y la precisión del códec de pose agradecen números pequeños; el `Mundos` guarda el punto de retorno del exterior. Comprobar que el códec de 24/56 B (`contratos/presencia.md`) no asume el rango de la finca **[NO VERIFICADO]** |

### 2.2 La interfaz de un `World`

Todo en el estilo del motor (`var`, sin clases, funciones puras separadas). Un mundo es un objeto con este contrato; `Mundos` lo valida como `ComponentesPuro.valida` valida manifiestos (con un trozo `[puro:…]` probado en Node):

```js
{
  id: "exterior" | "nave",
  // carga lo que necesite (import(), fetch del mismo origen, Spark…). Devuelve promesa. No toca la escena todavía.
  carga: function (nucleo) { return Promise; },
  // mete su raíz en la escena, pone luces/niebla/fondo, ajusta camera.near/far, registra entidades (puertas), pide su sala. Síncrono.
  entra: function (nucleo, llegada /* { x, y, ang } en SU marco */) {},
  // cada fotograma, solo cuando está activo. Lo llama cuadro() tras la cámara. Reemplaza a las llamadas a mano del exterior.
  actualiza: function (dt, t) {},
  // el suelo y los límites: lo que hoy preguntan 12_paseo, 29_vr y 12b a `suelo()` y `D.ext`
  suelo: function (x, y) { return altura; },          // metros, en el marco del mundo
  dentro: function (x, y) { return bool; },           // ¿se puede estar aquí? (reemplaza a los recortes a D.ext; en la nave, las paredes)
  obstaculo: function (x, y) { return { x, y } | null; },   // reemplaza al choque con `copas` (troncos); en la nave, columnas/piezas
  // saca su raíz, quita luces/niebla/entidades, suelta la sala. Síncrono. El mundo sigue en memoria (puede volver a entra()).
  sale: function (nucleo) { return { x, y, ang }; },  // devuelve dónde estabas, para el retorno
  // libera GPU y memoria: dispose de geometrías, materiales, texturas, workers. Tras esto, hace falta carga() otra vez.
  libera: function (nucleo) {},
  // qué necesita del núcleo (lista blanca) y cuánto puede dibujar (regla 6)
  consume: ["Materiales", "Laminas", "Entidades", "Red", …],
  presupuesto: { llamadas: 60, triangulos: 300000, texturasMB: 64 }
}
```

`carga`/`libera` asíncrono/síncrono adrede: así el fundido a negro puede esperar a `carga()` y `entra()` ocurre en un solo fotograma a oscuras.

### 2.3 El `Nucleo`: lo que la IIFE presta a un mundo externo

Un objeto construido en un fichero nuevo `02m_mundos.js` (va tras `02l_tope_tiles.js` y antes de `03_escena.js`? No: necesita `renderer/scene/camera`, así que **`03b_mundos.js`**, justo después de `03_escena.js`). Lista blanca inicial:

`THREE` (el de la build, nunca otro), `renderer`, `scene`, `camera`, `Bus`, `Componentes`, `Entidades`, `Usables`, `Laminas`, `Materiales`, `Cola`, `Aparato`, `Render`, `InfoDibujo`, `Config`, `Ajustes`, `Red` (vía `Componentes.api("red-salas")`), `Presencia` (vía `Componentes.api("presencia-compartida")`), y de VR solo `{ rig: vrRig, fundido: vrFundido, estado: () => VRX.on }` (no `VRX` entero).

El exterior, al estar dentro de la IIFE, no necesita el `Nucleo`; la nave sí. Es la misma frontera que hoy tienen `gemelo-olivo` o `three-vrm`: una librería que recibe lo que necesita.

### 2.4 `Mundos`: el gestor (en `03b_mundos.js`)

```js
var MundosPuro = (function () {   // [puro:inicio] probado en Node
  // valida(def) → errores; transicion(estado, evento) → estado siguiente (maquina: "en" → "saliendo" → "cargando" → "entrando" → "en"; "error" vuelve a "en" el anterior)
})();
var Mundos = (function () {
  var defs = {}, actual = null, estado = "en", retorno = {};   // retorno[id] = { x, y, ang } donde se dejó cada mundo
  function registra(def) { … MundosPuro.valida … defs[def.id] = def; }
  function cambia(aId, llegada) {
    if (estado !== "en" || !defs[aId] || actual === defs[aId]) return Promise.resolve(false);
    var de = actual; estado = "saliendo";
    return nucleo.fundido.cierra().then(function () {          // §2.5: a negro y se QUEDA a negro
      retorno[de.id] = de.sale(nucleo); Bus.emite("mundo:sale", { id: de.id });
      estado = "cargando";
      return defs[aId].carga(nucleo);                           // import(), Spark, glb… con la pantalla negra
    }).then(function () {
      estado = "entrando"; actual = defs[aId];
      actual.entra(nucleo, llegada || retorno[aId] || null); Bus.emite("mundo:entra", { id: aId });
      estado = "en";
      return nucleo.fundido.abre();
    }).catch(function (e) {                                     // si la nave falla, se vuelve al exterior sin dejar al usuario a oscuras
      console.error("mundos: no se pudo entrar en " + aId, e); actual = de; de.entra(nucleo, retorno[de.id]); estado = "en"; return nucleo.fundido.abre().then(function () { return false; });
    });
  }
  function actualiza(dt, t) { if (estado === "en" && actual) actual.actualiza(dt, t); }
  function suelo(x, y) { return actual ? actual.suelo(x, y) : 0; }
  function dentro(x, y) { return actual ? actual.dentro(x, y) : true; }
  function obstaculo(x, y) { return actual ? actual.obstaculo(x, y) : null; }
  return { registra, cambia, actualiza, suelo, dentro, obstaculo, actual: () => actual && actual.id, estado: () => estado };
})();
```

**Enganche al bucle (`90_final.js`):** el bloque de llamadas a mano (`:38-50`) y `actualizaCarga`, `Arboles.actualiza`, `Escena3D.actualiza` se mueven **tal cual** dentro de `exterior.actualiza(dt, t)`; `cuadro()` queda: cámara/VR → `Usables.actualiza` → `Mundos.actualiza(dt, t)` → `Componentes.actualiza("mundo")` → `Componentes.actualiza("tarde")` → `Laminas.revisa` → `Cola.corre` → render → `trasRender`. **Los componentes** ganan un campo opcional en el manifiesto, `mundos: ["exterior"]` (hoy ausente = todos), y `Componentes.actualiza` (`02c:345-355`) salta a los que no pertenecen al mundo actual; `Mundos` emite `mundo:entra/sale` para que un componente que quiera reaccionar (ocultar su UI, soltar su sala) lo haga por el Bus. Esto deja los 31 componentes sin tocar salvo los que dibujan cosas del exterior (presencia, avatares, lindes, carteles, decoraciones, balizas oficiales…), que solo añaden la línea `mundos: ["exterior"]`.

**Enganche a la sesión XR:** ninguno. `cuadro()` sigue siendo llamado por `vrAnimacion`; `vrRig` sigue en `scene`; `Mundos.cambia` nunca toca `renderer.xr`. Lo único que el mundo cambia al entrar es `camera.near/far` y, en VR, `vrRig` se coloca con `vrAparece(x, y, ang)` (`29_vr.js:120`) que ya existe (hay que exponer una variante que no asuma `suelo()` de la finca: hoy `vrAparece` → `vrIrA` → `suelo()`; con `Mundos.suelo` queda resuelto). **Riesgo real:** `Escena3D` llama `Sched.setXRSession` (`04b:208`) y `XrPerillas`/`VrPresupuesto` recortan por perfil VR; en la nave esos presupuestos no significan nada. Conviene que el perfil VR (`vrPerfil`, `29_vr.js:642`) consulte `Mundos.actual()` y no toque `Arboles/Escena3D` si no están activos.

### 2.5 Fundido a negro que «se queda»

`vrFundido(fn)` (`29_vr.js:90`) y `fundePantalla(fn)` (`12b:90`) son de ida y vuelta automática. Hace falta separar en dos mitades sin duplicar: en `29_vr.js`, `vrFundidoCierra()` → promesa que resuelve cuando `opacity` llega a 1 y **deja `vrFun.fase = 2` detenido**; `vrFundidoAbre()` → arranca la vuelta. `vrFundido(fn)` se reescribe como `cierra().then(fn).then(abre)` (misma semántica, prueba `__vrVuelo` sigue). Igual para el velo DOM de 12b. `Nucleo.fundido = { cierra, abre }` elige por `VRX.on`. Importante en VR: el velo es `vrNegro` colgado de `camera` (`:88`), así que sobrevive al cambio de mundo porque la cámara no cambia; la nave no debe tocar `camera.children`.

Mientras está a negro, `Mundos.estado !== "en"` y `cuadro()` **sigue renderizando** (hay que seguir presentando fotogramas a la sesión XR o el Quest muestra el entorno del sistema); lo que se renderiza es la escena con el mundo saliente ya oculto y el velo opaco. Coste: un fotograma casi vacío, ideal.

### 2.6 El disparador: la puerta

El exterior registra un tipo de entidad `puerta` (`Entidades.registra`, como `19_balizas.js:118`) con `cerca(x, y)` y `radioCerca: 1.5`, `pos` en la fachada del edificio de la fábrica (que ya está en `D.paisaje.edificios`, clase 6 del LiDAR, `18_paisaje.js:10-23`; la posición exacta de la puerta es un dato que hay que añadir al índice o a la configuración del servidor, nunca a mano en el código). Al `usable:cerca` con `id === "puerta:nave"` → `Mundos.cambia("nave", { x: 0, y: 1, ang: 0 })`. Dentro, la nave registra `puerta:exterior` y al cruzarla → `Mundos.cambia("exterior")` (el retorno guardado lo coloca fuera, a 1-2 m de la puerta mirando hacia fuera, para no re-disparar: **histéresis** obligatoria, o si no entras y sales en bucle). Con `radioCerca` y una zona de umbral (dentro del vano) evitas disparos por pasar al lado. En VR el gatillo no hace falta; en pantalla tampoco (coherente con «acercarse»).

### 2.7 Carga bajo demanda de la nave

- `apps/web/mundos/nave/index.js` (módulo ES): `export function crea(nucleo) { return World; }`. Importa `three` (resuelto por alias a la build correcta: three o super-three, **nunca** otra copia) y, dentro de `carga()`, `import("@sparkjsdev/spark")` y el glb/splat del mismo origen (`/teselas/<finca>/nave/…` o una ruta nueva en Caddy; CSP y «solo mismo origen», `CLAUDE.md §5`).
- `vite.config.js`: alias `{ find: /^gemelo-mundo-nave$/, replacement: path.join(WEB, "mundos", "nave", "index.js") }` y, como con `gemelo-olivo`, un sustituto vacío si no está instalado para que el build no falle.
- En la IIFE, `03b_mundos.js` registra un **talón** `{ id: "nave", carga: () => import("gemelo-mundo-nave").then(m => m.crea(nucleo)).then(w => Object.assign(talon, w)) }`. Vite trocea `nave` + Spark en su chunk; nadie lo descarga si no cruza la puerta. Precarga opcional (`<link rel=modulepreload>`) cuando el usuario está a <30 m de la puerta, para que el fundido no dure 3 s con 4G: lo decide una medida.
- **Dos builds:** el chunk de la nave se construye dos veces (pantalla y vr), igual que todo. Nada especial.

### 2.8 Estado compartido

- **Avatar e identidad:** nada que hacer. Los pone la api en el token (`contratos/livekit-roles.json` «identidad»); la sesión (cookie) es la misma.
- **Sala:** la presencia pide token con `sala: "nave"` al `mundo:entra` y `sala: "general"` al volver (reutiliza `cambiaSala`, `38:476`, quitando la restricción a `SALAS_MUNDO` de dos claves). Mientras cambias de mundo, 1-3 s sin presencia: aceptable y honesto (mostrar «Entrando…» como ya hace `ponEstado`).
- **Posición de retorno:** `Mundos.retorno["exterior"]` (`pp.x, pp.y, pp.ang` de `12_paseo`), en memoria; si la pestaña se recarga, se pierde: aceptable.
- **Voz:** los corros (`47b`) y la guiada viven en salas propias; al entrar en la nave hay que decidir si el corro sigue (misma sala de audio, otra de pose) o se deshace. Propuesta: sigue (no hay motivo técnico para cortarlo), pero la cercanía se mide en el marco del mundo actual y no se puede invitar a alguien que está en otro mundo. Es una decisión de producto para el ADR.

---

## 3. Cambios mínimos para que el exterior sea el primer `World`

Ficheros a tocar, en orden, con lo que cambia en cada uno. Nada de esto cambia el aspecto ni los recuentos (regla 6: se mide antes y después igualmente).

1. **`03b_mundos.js` (nuevo)**: `MundosPuro` + `Mundos` + `Nucleo` (§2.3-2.4). Guardián nuevo un guardián nuevo `mundos.test.js` (propuesto, aún no existe) (Node): validación del contrato, máquina de estados, que el exterior registra `suelo/dentro/obstaculo`, que nada en `motor/` llama a `suelo(` ni lee `D.ext` para moverse salvo `02_mundo` y el propio mundo exterior.
2. **`90_final.js`**: mover las ~13 llamadas a mano (`:38-50` y `Arboles.actualiza`, `actualizaCarga`, `Escena3D.actualiza`) a `exterior.actualiza`; registrar el exterior como mundo con `raiz = scene` **de momento** (sin crear un `Group` raíz todavía: lo que hoy añade cada módulo a `scene` seguiría ahí; `sale()` lo oculta recorriendo una lista de raíces conocidas: `gPaisaje`, `gArboles`, `nube.g`, `tiles.group`, `gLinde`, los grupos de 16/19/21/15, el `grupo` de la presencia…). Segunda fase: un `gExterior` al que esos módulos añadan en vez de a `scene`.
3. **`12_paseo.js`** (3 sitios): `suelo(` → `Mundos.suelo(`; recorte a `D.ext` → `Mundos.dentro`; choque con `copas`/`tronco` → `Mundos.obstaculo`.
4. **`29_vr.js`** (9 `suelo(`, `:563-565`, `vrArco`, `vrBaseY`, `vrIrA`): lo mismo; `vrFundido` partido en `cierra/abre` (§2.5); `vrPerfil` no toca `Arboles/Escena3D` si el exterior no está activo.
5. **`12b_llegada.js`**: `rayoSuelo` recibe `Mundos.suelo` y `Mundos.dentro` (ya está parametrizado: `rayoSuelo(o, d, alto, ext, max)`, solo cambia `dentro`); `funde` partido igual que en VR.
6. **`02c_componentes.js`**: campo `mundos?: [ids]` en `valida` y filtro en `actualiza(fase)`; eventos `mundo:entra`, `mundo:sale` en `contratos/eventos.json`.
7. **`38_presencia_compartida.js`**: `cambiaSala` acepta la clave `nave`; se engancha a `mundo:entra/sale`; manifiesto sin `mundos` (está en los dos), pero sus muñecos y nombres se dibujan en el marco del mundo actual (la raíz instanciada `grupo` va a la raíz del mundo activo, no a `scene`).
8. **`26b_avatares.js`, `44_lindes.js`, `44b_carteles.js`, `50_decoraciones.js`, `39_oficina_mundo.js`, `08b`, `10b`, `04e`, `16b`, `25_perros`, `22b`, `51`, `52`, `53`**: una línea cada uno, `mundos: ["exterior"]`. Los que no son componentes (`14_historia`, `15_tiempo`, `16_vida`, `17_minimapa`, `18`, `19`, `21`, `23`) quedan cubiertos por `exterior.actualiza` y por la ocultación de raíces; el HUD exterior (minimapa, brújula, capas) se esconde en `mundo:sale` desde `31_hud`.
9. **`vite.config.js`**: alias `gemelo-mundo-nave` + sustituto vacío; `herramientas/genera_motor.mjs` no cambia.
10. **Servidor y contrato**: `apps/api/src/presencia/livekit.ts:16` `SALAS = { general, visita, nave: "hituelo-nave" }`; el `enum` de `sala` en `rutas.ts:69`; `contratos/livekit-roles.json` versión 9 con la sala `nave` (datos solo, sin audio, como la libre); `contratos/api.openapi.yaml`; prueba en `apps/api/pruebas/unidad/presencia.test.ts`. Expulsión: `expulsa()` recorre `CLAVES_SALA`, así que la nave entra sola.
11. **Infra**: ruta de los assets de la nave tras `forward_auth` en `infra/Caddyfile:115` (hoy `/teselas/*` ya lo está: lo más simple es `/teselas/<finca>/nave/`).
12. **Docs en el mismo commit**: ADR-0033, `ARCHITECTURE.md` (§2 y §4), `COMPONENTES.md`, `ARQUITECTURA-MULTIUSUARIO.md:128-130` (corregir las dos frases), CHANGELOG.

Lo que **no** se toca en esta fase: `02_mundo.js`, `04b_escena3d.js` (salvo que `actualiza` ya no se llame fuera del exterior), `07*`, `18`, `19`, `21` por dentro. Su `libera()` real es la fase 2.

---

## 4. Dónde encaja Spark, y qué le hace al renderer compartido

Lo que dice Spark de sí mismo (docs oficiales, leídas el 2026-11-06): se crea `new SparkRenderer({ renderer })` con **tu `THREE.WebGLRenderer`** y se añade a la escena (típicamente en la raíz); el renderer debe crearse con **`antialias: false`** («MSAA no mejora los splats y perjudica el rendimiento»); está «construido para three.js y WebGL2»; en WebXR pone `preUpdate: false` y el presupuesto de LoD por defecto en XR es 500-750 k splats; la carga de LoD usa 4 workers; `dispose()` libera el renderer. No nombra el Quest ni versión de three. Spark **no** usa el `WebGPURenderer`; hay un paquete aparte y experimental, Spark Radix 0.0.1 (29-10-2026), que sí dibuja con el `WebGPURenderer` de r186 vía TSL y cae a WebGL2 con limitaciones (orden de dibujo con retraso de varios fotogramas). Fuentes al final.

Consecuencias sobre tu código:

1. **Solo en la nave.** `SparkRenderer` y `SplatMesh` se crean en `nave.carga()`, cuelgan de la raíz de la nave y se `dispose()` en `nave.libera()`. El exterior no sabe que existe. Correcto y limpio.
2. **`antialias`.** `03_escena.js:11` crea el renderer con `antialias: XrPerillas.aa` (defecto `true`, `02f:17`). No se puede cambiar por mundo: el contexto GL es uno. Opciones honestas: (a) dejar MSAA y pagar en la nave lo que Spark dice que cuesta (sin medir en Quest: **[NO VERIFICADO]**); (b) apagar MSAA en todo el gemelo, lo que rompe `alphaToCoverage` (AG-2.1, `ALPHA-A-COBERTURA.md`), que **necesita MSAA**; hoy a2c está apagado por defecto, así que el coste real es renunciar a esa mejora; (c) `?xraa=0` existe ya como perilla: medir la nave con `xraa=0|1` antes de decidir. Yo empezaría por (c) y decidiría con la medida.
3. **Dos builds, dos `three`.** Spark importa `three` como peer; el alias de la build de VR lo resolverá a **super-three 0.185.0**. Spark contra una bifurcación de three con `multiviewStereo` encendido es territorio que **nadie ha probado**: el parche de `parche_multiview.mjs` existe precisamente porque con multiview ningún material de three compilaba; los sombreadores propios de Spark pueden tener el mismo problema (`viewMatrix`, `#extension` antes del `layout`). Y `multiviewStereo` se fija al construir el renderer (`03_escena.js:12`): **no se puede apagar al entrar en la nave**. Así que en el Quest hay tres salidas: (i) Spark funciona con multiview (ideal, improbable sin parche); (ii) en el Quest la nave se dibuja sin splats (glb horneado en Blender, que es lo que el propio repo proponía) y los splats quedan para pantalla; (iii) el cargador elige la build de pantalla cuando la URL trae `?mundo=nave` (pierdes el −15 % de `render()` medido en AG-3c en TODA la visita). Esto se decide con una **prueba de humo de un día** (prototipos/multiview ya tiene la infraestructura: `prototipos/multiview/src/humo.js`) antes de escribir la nave.
4. **Tu plan WebGPU (ADR-0031, F3-F6).** Spark 2.x no va a correr sobre el `WebGPURenderer` cuando migres la pantalla a TSL; tendrías que cambiar a Radix (experimental, sin LoD) o a lo que three traiga nativo (el titular de un artículo de radiancefields habla de un renderizador de splats nativo en r186 para WebGPU: **no lo he verificado**). Dicho claro: **si eliges splats con Spark hoy, estás atando la nave al `WebGLRenderer` clásico**. No es un drama (la nave es un mundo aparte y el renderer clásico sigue existiendo mientras dure la migración), pero significa que el día que retires el clásico (F6) la nave es un bloqueo. El `World` con `carga/libera` lo deja encapsulado: cambiar Spark por otra cosa dentro de la nave no toca el exterior.
5. **three 0.187.** Comprobar la compatibilidad de la versión fijada de Spark con 0.187 antes de AG-0.4 (**[NO VERIFICADO]**); fijar la versión exacta en `apps/web/package.json` (regla 12).
6. **Alternativa sin Spark** que el repo ya tenía: nave en glb con luz horneada, unos cientos de polígonos, piezas glTF (`ARQUITECTURA-MULTIUSUARIO.md:118-128`). Para una sala de reuniones en Quest a 72 Hz es lo que más margen deja; los splats dan el aspecto fotográfico a costa de 500-750 k splats por fotograma y un sort en worker. No es una decisión técnica mía: es qué quieres que la gente vea. El `Mundos` es el mismo en los dos casos.

---

## 5. Riesgos

| Riesgo | Dónde está | Qué hacer |
|---|---|---|
| **Fugas al cambiar de mundo** | La nave crea y libera todo en cada visita; Spark crea workers y texturas; `36_mandos` ya gotea por sesión VR (AG-P1b) | `nave.libera()` completo desde el primer commit; medir con `memoria_vr_chrome.test.js` adaptada a «N entradas y salidas de la nave» (`renderer.info.memory` y heap deben volver a la base); no añadir la nave a la puerta sin esa prueba |
| **Ocultar no es liberar** | Fase 1 deja el exterior en memoria: ortofotos (hasta 8 en Quest), nube, olivos generados, tileset | Medir el heap del exterior congelado; `Mundo.liberaOrtoLejos` y `liberaNube` existen y se pueden forzar al salir; el tileset tiene `libera()`; si la memoria aprieta en Quest, liberar esos tres primero (son los gordos) sin tocar 18/19/21 |
| **Perder la sesión XR** | Cualquier `renderer.xr.enabled = false`, `setAnimationLoop(null)`, recarga, o excepción no capturada dentro de `cuadro()` durante la transición (una excepción en el bucle XR deja de presentar fotogramas y el Quest saca al usuario) | `Mundos.cambia` nunca toca `renderer.xr`; `try/catch` en `carga()` con vuelta al exterior (ya en el esqueleto); no cambiar la variable `scene`; probar con `pruebas/vr_mock.js` una entrada y salida de la nave dentro de una sesión simulada |
| **Pantalla negra larga** | `carga()` de Spark + splat de decenas de MB por 4G del campo | Precarga al acercarse (<30 m); mostrar algo en el velo (un texto en la lámina, `Laminas`) si pasa de 1 s; tope de tiempo con vuelta al exterior |
| **Bucle de puerta** | Entrar y salir en el mismo sitio dispara la otra puerta | Punto de llegada desplazado 1,5-2 m y mirando hacia fuera; histéresis en `cerca` |
| **Presupuesto VR ciego** | `vrPerfil` recorta `Arboles/Escena3D/VrPresupuesto`; en la nave no mide nada útil; `VrControlPuro.decide` seguirá bajando de nivel por JS | La nave declara su `presupuesto` y el controlador, en la nave, solo ajusta `framebufferScaleFactor`/Spark LoD; es un cambio pequeño en `29_vr.js:642-666` |
| **Spark con super-three + multiview** | §4.3 | Humo de un día antes de nada; decidir (i)/(ii)/(iii) por escrito |
| **Guardianes** | `contrato_modulos.js` y `componentes.test.js` no saben de `apps/web/mundos/`; el de reservas por fotograma (`_reservas.js`) tampoco | Extender los guardianes al directorio nuevo en el mismo commit que lo crea |
| **Choque con las optimizaciones en marcha** | AG-2.x (cartulinas, impostores, tono), Q0c (controlador VR), AG-1.14 (planificador sobre la Cola) tocan `07*`, `29_vr`, `02b`; el `Mundos` toca `90_final`, `29_vr`, `12_paseo` | Hacer primero los pasos 1-6 de §6 (son de estructura, no de contenido, y casi no solapan); **no** empezar el `libera()` real del exterior (fase 2) hasta que AG-1.14 decida cómo se reparte la Cola, porque cambiaría el mismo código dos veces |
| **La migración TSL (F4)** | Reescribe materiales uno a uno; la nave con Spark no migra | Independientes si la nave queda encapsulada; dejar escrito en el ADR que la nave es «clásico hasta nuevo aviso» |

Qué va **antes** de las optimizaciones de contenido: el esqueleto de `Mundos` (§6 pasos 1-6), porque reorganiza el bucle y la locomoción, y cuanto más tarde se haga, más código nuevo (planificador, controlador) nacerá pegado a la finca. Qué va **después**: la liberación real del exterior y cualquier cosa que toque `07*`/`02b`, para no pisar AG-1.14/AG-2.6/AG-2.7.

---

## 6. Orden de trabajo en pasos pequeños y verificables

Cada paso: un commit, puerta rápida en verde, recuentos de `pruebas/presupuesto.json` iguales (regla 6), CHANGELOG. Los pasos 1-6 no cambian nada visible.

| # | Paso | Verificación | Tamaño [ESTIMACIÓN] |
|---|---|---|---|
| 0 | ADR-0033 «Mundos»: decisión, alternativas (misma sala vs canal; ocultar vs liberar; Spark vs glb horneado), corrección de `ARQUITECTURA-MULTIUSUARIO.md:128-130` | Revisión de Antonio | ½ día |
| 1 | `03b_mundos.js` con `MundosPuro` (contrato, máquina de estados) y `Mundos` con un solo mundo registrado, `exterior`, cuyo `actualiza` es vacío; `Nucleo` construido pero sin usar | un guardián nuevo `mundos.test.js` (propuesto, aún no existe) (Node); `contrato_modulos.js --comprueba` | ½ día |
| 2 | `90_final.js`: las llamadas a mano pasan a `exterior.actualiza`; `cuadro()` llama a `Mundos.actualiza` | Banco: misma vista, mismos recuentos; `prueba_vr.js` con el mock | ½ día |
| 3 | `Mundos.suelo/dentro/obstaculo` en `12_paseo`, `29_vr`, `12b_llegada`; guardián: nadie más llama a `suelo(` ni recorta a `D.ext` para moverse | `llegada.test.js`, `vr_confort.test.js` siguen; banco: paseo y teletransporte iguales | 1 día |
| 4 | Fundido partido en `cierra/abre` (VR y pantalla); `vrFundido(fn)` y `funde(fn)` reescritos encima | `__vrVuelo` en `prueba_vr.js`; `llegada.test.js` | ½ día |
| 5 | `exterior.sale()/entra()`: ocultar y congelar (lista de raíces, `Escena3D` sin update, sin pedir teselas, HUD exterior escondido); `mundos: ["exterior"]` en los componentes de §3.8; filtro en `Componentes.actualiza` | Guardián de componentes; banco: `__g` con un mundo «vacío» de prueba (`?mundo=vacio`) para medir el exterior congelado: heap y `renderer.info.memory` | 1-1½ días |
| 6 | Sala `nave` en api + contrato v9 + `cambiaSala` ampliado + enganche a `mundo:entra/sale` | `presencia.test.ts`, `red.test.js`; e2e con dos Chrome: uno entra en la nave y el otro deja de verle | ½-1 día |
| 7 | **Humo Spark en el Quest** (fuera del motor, `prototipos/`): una escena de splats pequeña con la build de pantalla y con super-three + multiview; `xraa=0|1`; `render()` ms y p95 | Página de humo + MEDIDAS.md «foto, no se mantiene» | 1 día + tu Quest |
| 8 | Decisión por escrito en el ADR: Spark en Quest sí/no, MSAA, build | — | — |
| 9 | `apps/web/mundos/nave/` v0: caja de la nave (glb, luz horneada), `carga/entra/actualiza/sale/libera` completos, alias en Vite, talón en `03b`, `?mundo=nave` para entrar sin puerta | Guardián de fugas «N entradas y salidas» en el banco; `renderer.info.memory` vuelve a la base | 1-2 días |
| 10 | Puerta: entidad `puerta` en el exterior y en la nave, histéresis, punto de llegada; posición de la puerta desde el índice o la configuración, no del código | Banco: paseo hasta la puerta → cambio → vuelta → misma posición ±0,5 m; `vr_mock` dentro de sesión | 1 día |
| 11 | Spark dentro de la nave (si el paso 8 dijo sí), `dispose()` en `libera`, presupuesto LoD por `Aparato.clase()` | Fugas otra vez; Quest real con `?mide` | 1-2 días |
| 12 | Nota de comodidad (regla 11): fundido, llegada, qué no se probó en el Quest | — | — |
| 13 | Fase 2 (más adelante, tras AG-1.14): `libera()` real por módulo del exterior (ortofotos y nube primero, tileset, luego 18/19/21/15/16) | Guardián «el exterior liberado deja `renderer.info.memory` en la base» | varios días, por goteo |

Lo que no sé y conviene medir antes de prometer nada: cuánto pesa el exterior congelado en el Quest (paso 5 lo dice), si Spark compila con super-three y multiview (paso 7), y cuánto tarda la carga de la nave por 4G en la finca (paso 9 con `?mide`).

---

## Fuentes externas consultadas (2026-11-06)

- Spark, «SparkRenderer»: https://sparkjs.dev/docs/spark-renderer (requisitos: `WebGLRenderer`, `antialias: false`, WebXR `preUpdate`, presupuestos LoD, `dispose`).
- Spark, visión general: https://sparkjs.dev/docs/overview/ («built for THREE.js and WebGL2»).
- Radiance Fields, «Spark Radix Brings WebGPU Splat Rendering to three.js» (29-10-2026): https://radiancefields.com/spark-radix-brings-webgpu-splat-rendering-to-threejs
- Radiance Fields, titular «Three.js Merges a Native Gaussian Splat Renderer for WebGPU in r186»: https://radiancefields.com/three.js-merges-a-native-gaussian-splat-renderer-for-webgpu-in-r186 (no leído: solo el titular).
- Repositorio de Spark: https://github.com/sparkjsdev/spark
