# Auditoría noviembre 2026 — Plan por tandas

Regla del skill: críticos y altos primero; **cada arreglo lleva una prueba que falla antes y pasa después**. Cada tanda es un conjunto de commits pequeños que pasan la puerta rápida; la puerta pesada una vez por tanda. Los ids remiten a `lente-N-*.md`.

Orden elegido: primero el alto; luego lo que **desbloquea la refactorización y hace que las medidas signifiquen algo** (si no, las tandas de rendimiento se harían a ciegas); luego lo que más pesa en Quest; después memoria, datos, seguridad, VR, interacción y documentación. Las tandas 2 a 4 conviene hacerlas **dentro** del strangler (ver `PROPUESTA-ARQUITECTURA.md`): cada módulo que se migra a TypeScript se arregla en el mismo paso.

## Tanda 0 — el alto (medio día)

| Id | Arreglo | Prueba que falla antes y pasa después |
|---|---|---|
| L4-01 | En `04b_escena3d.js:147`, `falla()` si `G.centro_utm` o `G.z0` difieren de `D.centro_utm`/`D.z0` (tolerancia 1 cm, 1 cm); `comprueba.mjs` compara lo mismo en la tubería | `tiles3d.test.js`: tileset generado con un índice y servido con otro cuyo centro difiere 10 m → el motor apaga la escena 3D Tiles con mensaje |

## Tanda 1 — que las medidas y los contratos digan la verdad (2-3 días)

| Id | Arreglo | Prueba |
|---|---|---|
| L4-02 | `contrato_modulos.js`: quitar comentarios y cadenas antes de buscar nombres; bajar el filtro de longitud a 2 con lista blanca; regenerar cabeceras | `--comprueba` falla con una cabecera que declara un consumo que solo existe en un comentario, y con `x0` sin declarar |
| L1-06 | Recalibrar `presupuesto.json` con el fixture actual; fijar `arbsc` y la hora en el banco; añadir al fixture una tesela con la densidad real de Hituelo para que algún regulador se dispare | `carga.test.js` falla si el tope de «lejos» es más de 2× la medida actual |
| L1-07 | Tope de memoria GPU: `renderer.info.memory` (geometrías, texturas) y bytes estimados por tesela en `_navegador.js` | `carga.test.js` con tope de texturas que falla al doblar las ortofotos |
| L2-06 | Activar `memoria_vr_chrome.test.js` (quitar `todo`) con el goteo medido en AG-P1b como umbral | La prueba falla hoy (3 geometrías + 1 textura por sesión) y pasa cuando `29_vr.js`/`36_mandos` liberen |
| L4-03, L4-04 | Alinear contrato y guardián sobre `teselas.v`; validar las teselas de los exportadores reales contra `tesela.schema.json` en `exportadores.test.js` | Guardián falla con una tesela de Cerro de tamaño distinto a 258² |
| L10-21 | Indexar `doc/auditoria-noviembre2026/` en `doc/README.md` | `documentacion.test.js` pasa |
| L10-09 | **ADR-0033 «Mundos interiores»** que enmiende ARQUITECTURA-MULTIUSUARIO.md:128-130 (sala de LiveKit propia por mundo; splats como opción, no descartados) | Guardián de ADR: índice y estado coherentes |

## Tanda 2 — lo que más pesa en Quest (1 semana, con medidas antes y después)

| Id | Arreglo | Prueba |
|---|---|---|
| L1-01, L2-02 | `actualizaNube` solo en modo nube; `liberaNube` al salir del modo; distancia de liberación coherente con la de carga (1.800 m) | `nube.test.js`: en modo Gemelo, tras 2 s, cero mallas de nube montadas y `info.memory.geometries` sin ellas |
| L1-02 | Aplicar `escala` a todos los niveles y recalcular al cambiar la cámara, no solo al cambiar de nivel | Prueba en Node con la cuenta de puntos: nunca > 1,4 M con el fixture denso |
| L1-03, L7-03 | Escala de olivos en VR: «holgado» contra el presupuesto del perfil (`02g`), no contra 16 ms; perfiles con histéresis que suben al cabo de N fotogramas buenos | Simulación del controlador en Node (el revisor de L7 ya la hizo): tras 20 fotogramas a 9 ms el nivel sube |
| L1-04 | Contar el nivel 0 en `TOPE_TRI`; cuando se supera, bajar escala hasta 1,0 y después recortar L0 | Prueba en Node: con 900 olivos L0 el tope se respeta |
| L1-05, L2-03 | Decodificar teselas por la `Cola` (o `Worker`) y apuntarlo como deuda; `Mundo` suelta `dtm`/`pts`/etc. de teselas fuera de rango | `medida_bucle`: ningún `r.json()` fuera de la Cola; `mundo.test.js`: tras alejarse, la tesela no conserva `pts` |

## Tanda 3 — memoria y dispose (3-4 días; es la fase 2 del WorldManager)

| Id | Arreglo | Prueba |
|---|---|---|
| L2-01, L5-02, L1-08 | `construyeSombras`: `remove` + `dispose` de la `InstancedMesh` anterior; no tocar `instSombraPA`; no reconstruir si `copas` no cambió | `follaje.test.js`: tras 10 `aplica()`, 1 malla de sombras y `instSombraPA` presente |
| L2-05 | `dispose` real en 15_tiempo, 16_vida, 18_paisaje, 19_balizas, 21_suelo, 04d; registrar cada uno como `Componente` con `libera` | `componentes.test.js`: montar y liberar cada uno deja `info.memory` como estaba |
| L2-04 | Ajustar `lruCache` de `TilesRenderer` al presupuesto del perfil | Prueba con tope de bytes del caché |
| L2-07..L2-11 | Ortofotos: contar los bytes reales; `close()` de ImageBitmap en lejanos; vaciar `bufs` de VRM; parar relojes del HUD al liberar | Una prueba por módulo en `componentes.test.js` |
| L5-01 | Renombrar uno de los dos `matTronco` | Guardián de globales duplicados (nuevo, en Node: dos `var X` en el mismo ámbito del motor concatenado) |

## Tanda 4 — datos y rótulos (3 días; decisiones de Antonio en varios)

| Id | Arreglo | Prueba |
|---|---|---|
| L3-04 | Cabecera de Cerro desde el índice, como Hituelo | `plantilla.test.js`: ningún número de ha/olivos escrito a mano |
| L3-06, L3-07, L3-08 | Rótulos: «detectado (LiDAR + regla)» en vez de «medido» para olivos; «declarado» para hectáreas; «anotado» para fenología y tareas de OlivarTrack | Guardián de rótulos: cada pastilla `medido` apunta a una fuente con `medido: true` en el índice |
| L3-01, L3-02, L3-11 | Aplicar `desp(h)` al color de L1/L2; o radio completo o texto que diga «a la mitad»; una sola cifra de desfase en un solo sitio | Prueba en Node del color con desfase; guardián de cifra única |
| L3-03, L3-05, L3-09 | Nota de NDVI que diga «relativo a la ventana»; fecha en la fenología del cartel; tarjeta «Hoy» con «última lectura hace N min» que caduca | Pruebas de texto |
| L8-01, L8-02 | Lluvia y cámara orbital ancladas a quien mira; `objetivo.y` con el suelo real al hacer pan | `camara.test.js` |
| L8-05, L8-06 | Clima de otra fecha rotulado «estimado»; época de olivos generados con la fecha del mundo, no del navegador | Pruebas en Node |

## Tanda 5 — seguridad (2 días)

| Id | Arreglo | Prueba |
|---|---|---|
| L9-03 | `14_historia.js`: `textContent` o escape para todo texto de OlivarTrack | Prueba con un título `<img onerror>` que no se ejecuta |
| L9-06 | LiveKit: al expulsar, revocar con la API de servidor (`removeParticipant`) además de dejar de emitir tokens; o tokens de 2 min con refresco | Prueba de api: tras expulsar, `removeParticipant` se llama |
| L9-04 | Escapar `</script` al incrustar el índice | `genera_motor.test.js` |
| L9-08 | Guardián de secretos: añadir patrones (`secreto`, `clave`, JWT, claves LiveKit/Anthropic, `public/artifacts`, coordenadas, referencias de parcela) | Falla con un fixture que contiene cada patrón |
| L9-01, L9-02 | **Decisión de Antonio** (ver ACEPTADOS). Si se anonimiza: mover ids de parcela a un fichero fuera del repo leído por `GEMELO_*` | Guardián de secretos con patrón de referencia catastral |
| Historial | Clon completo + `gitleaks` por todo el historial | Resultado en `REVERIFICACION` |

## Tanda 6 — VR robusta (3 días; medidas en Quest obligatorias)

| Id | Arreglo | Prueba |
|---|---|---|
| L7-01 | `try/catch` por fotograma de VR con contador y salida limpia de la sesión al tercer fallo | `mock_xr`: una excepción inyectada no para el bucle |
| L7-02, L7-10 | Escuchar `visibilitychange`, `reset` del espacio de referencia, `webglcontextlost/restored` | `mock_xr` con esos eventos |
| L7-05, L7-06 | Fundido en mirador, «parcela ▶» y teletransporte; el panel se recoloca tras el fundido, sin interpolar | `prueba_vr`: todo salto > 5 m pasa por `cierra()/abre()` |
| L7-04 | Precompilar con la variante multiview en la build del Quest (`renderer.compileAsync` con la cámara XR) | Medida del primer fotograma en Quest |
| L7-07 | Una sola verdad sobre la build de VR (`builds.mjs`, `vite.config.js`, PUBLICACION.md) | Guardián de documentación |

## Tanda 7 — interacción (3 días)

L6-01, L6-02, L6-03 (los tres ajustes de accesibilidad hacen lo que dicen; pruebas de CSS computado como las que hizo el revisor), L6-04 (teclado en vista aérea), L6-05/06 (cajas de voz con sitio reservado y lista que no roba el foco), L6-07/08 (confirmación de «Bloquear» y respuesta a la denuncia en VR), L6-09/10 (textos de Ayuda y flechas de la historia). Nota de comodidad en cada commit (regla 11).

## Tanda 8 — documentación (1 día con `/documentalista`)

L10-02, -04, -05 (ESTADO vuelve a ser estado, no historia), L10-03 (todo lo que dice «sin VPS»), L10-06 (PLAN: P2, P3, P5), L10-07 (ARCHITECTURE con los 89 módulos o generado), L10-01 (ONBOARDING: lista generada desde `pruebas/guardianes/`), L10-10 (cinco estudios a `historico/`), L10-11 (mapa del repo con `apps/api` e `infra`), L10-08, -12..-24.

## Re-verificación

`REVERIFICACION-v0.3.0.md` por revisores distintos: cada arreglo con su prueba en verde en la puerta pesada, las medidas de Quest para las tandas 2, 3 y 6, y el `gitleaks` del historial.
