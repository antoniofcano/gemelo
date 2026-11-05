# Recortes alfa a `alphaToCoverage` (AG-2.1)

Los materiales de recorte alfa (hierba, follaje, ramitas, impostores) usaban `alphaTest`: el borde es duro, en escalera, y con el movimiento de la cabeza en VR parpadea. Con **MSAA** del contexto, `alphaToCoverage` convierte el alfa del borde en cobertura de muestras y lo suaviza sin ordenar ni mezclar. Estado: **hecho y probado en Node; sin comparar en pantalla (capturas pendientes) y no probado en Quest ni en iPhone**.

## Qué cambia

Todo pasa por la fábrica (`Materiales.recorte(mat)`, `apps/web/motor/02i_materiales.js`). Un material con `alphaTest > 0` se marca `alphaToCoverage = true`; las sombras (`MeshDepthMaterial`) no, porque el mapa de sombras no tiene MSAA. Se **conserva el umbral original** del `alphaTest`: three suaviza con `smoothstep(alphaTest, alphaTest + fwidth(a), a)` y descarta (`discard`) lo del todo transparente, así que no se escribe profundidad ahí y el recorte no se desplaza (subir o bajar el umbral agrandaría o encogería la silueta; los mipmaps de las hojas están calculados para ese umbral).

| Material | Módulo | alphaTest |
|---|---|---|
| hoja grande y pequeña del follaje (`matHojaG`, `matHojaP`, puntos) | `07_follaje.js` | 0,4 |
| matas de hierba (`matMata`, con `onBeforeCompile`: el fundido por tramado hace `discard` y el color solo toca `rgb`, el alfa llega intacto) | `21_suelo.js` | 0,42 |
| impostor lejano y sustituto | `07ac_lejanos.js` | 0,5 |
| relleno, ramitas 0/1 y tarjetas de los olivos generados (biblioteca `apps/web/olivo`, por el parche `parcheGen`) | `07ab_generados.js` | 0,5 / 0,45 / 0,45 |

No cambian: las sombras de todos ellos (`*_sombra`, siguen con `alphaTest`); las láminas de texto (`02d_laminas.js`, `alphaTest` 0,5: carteles, fuera de AG-2.1); el suelo de fotos (`04f_suelo_fotos.js`: no tiene recorte alfa; no se toca por EV-1k); el horneado del atlas de impostores (07ac `hornea`): su blanco no tiene MSAA y el alfa del atlas tiene que seguir siendo el del recorte duro, así que `Materiales.recortes(false)` apaga el `alphaToCoverage` mientras dibuja y `recortes(true)` lo devuelve.

Con `alphaToCoverage` three quita la definición `OPAQUE` del material: el alfa de salida deja de forzarse a 1 y es el que lleva la cobertura.

## Cómo compararlo

`?a2c=0|1` (defecto **1**, encendido):

- `?a2c=1` o sin perilla: `alphaToCoverage` donde haya MSAA.
- `?a2c=0`: el `alphaTest` de siempre.
- Un valor distinto avisa en consola y se usa 1. Con `?xraa=0` (sin MSAA) no se enciende ni por defecto, y `Materiales.a2c.motivo` lo dice.

Capturas lado a lado (no abre Chrome; deja un encargo en el banco): `node pruebas/a2c_capturas.js` (`--dry` imprime la orden). Variantes `a2c0` y `a2c1`; escenarios `lejos`, `cerca` (olivar de cerca: ramitas, follaje, impostores) y `paseo` (a pie de suelo, la hierba). Se miran los bordes de las hojas y las matas, el parpadeo al moverse y que la silueta no cambie de tamaño.

## MSAA por modo

El contexto se crea con `antialias: XrPerillas.aa` (`03_escena.js`; defecto sí, `?xraa=0` lo quita) en pantalla y en VR; en la sesión XR three crea la capa con `antialias: attributes.antialias` y 4 muestras si lo hay. Lo que no se sabe sin dispositivo: si el navegador concede de verdad el MSAA (puede negarlo) y qué hace el multiview de la build VR con él. Si en un modo no hay MSAA, `alphaToCoverage` degrada a un corte duro, sin empeorar.

## Coste

El MSAA ya estaba pagado (el contexto lo pedía igual). Los recuentos de triángulos y llamadas no cambian, y los materiales cambian de programa (sin `OPAQUE`), no de número. **No se afirma ninguna cifra de fps ni de ms**: no se ha medido (regla 7). Hay que medir con `?debug` en dispositivo, `?a2c=0` frente a `?a2c=1`. Las pruebas de píxeles del banco no se han relanzado con este cambio: si alguna se mueve, el defecto se pone a 0 en `eligeA2c` (`02i_materiales.js`).

## Pruebas

`pruebas/guardianes/a2c.test.js` (Node, con three y super-three): la perilla, que cada material recortado lleva `alphaToCoverage` cuando toca y las sombras no, y que cada sitio del motor pasa por la fábrica. `materiales_f1` sigue en verde (no se añade ningún `onBeforeCompile`).
