# Tone mapping (AG-2.5)

Perilla de URL para **probar** el tone mapping del renderizador y que Antonio elija. Estado: **comparación pendiente de capturas**; el valor por defecto no cambia.

## Qué hace cada opción

`?tono=<valor>` (y, opcional, `?expo=<0,1 a 4>`, que solo cuenta si hay un tono distinto de `neutro`; admite coma decimal):

| Valor | Constante de three | Qué es |
|---|---|---|
| `neutro` (defecto, y cualquier valor desconocido o ausente) | `NoToneMapping` | Lo de siempre: el motor no toca el renderizador. El aspecto es exactamente el de antes. |
| `agx` | `AgXToneMapping` | Curva tipo película, desatura los brillos con suavidad; de las tres, la que menos vira los tonos. |
| `aces` | `ACESFilmicToneMapping` | ACES filmic: más contraste y saturación en medios, vira algo los verdes y los tonos cálidos. |
| `neutral` | `NeutralToneMapping` | Khronos PBR Neutral: casi no cambia el color por debajo de un umbral y comprime solo los brillos; la más cercana a `neutro`. |

Verlas: `…/?tono=agx`, `…/?tono=aces`, `…/?tono=neutral` (combinable con el resto, p. ej. `?tono=agx&expo=1.2&hora=18:45`). Un valor desconocido avisa en la consola (`tono: …`) y se usa `neutro`. Código: `RenderPuro.eligeTono` en `02h_render.js` (puro, probado en Node por `pruebas/guardianes/tono.test.js`) y su aplicación en `03_escena.js`, el único sitio que fija `renderer.toneMapping`.

## Qué se ve afectado

- Se mapean los materiales de three que no piden lo contrario y los de sombreador propio que incluyen `#include <tonemapping_fragment>` (las nubes de `15_tiempo.js`). No se mapean los que ya llevaban `toneMapped: false` (láminas e iconos de `02d_laminas.js`) ni la lluvia (su sombreador no incluye el fragmento).
- **El cielo y la niebla.** El fondo es un color liso (`scene.background`, el horizonte): three lo pinta como color de limpieza, **sin** tone mapping. La niebla (`scene.fog`, del mismo color) sí entra en el sombreador de cada objeto, antes del tone mapping. Con un tono activo, el terreno lejano se funde con un color distinto al del fondo (puede verse una costura en el horizonte, más clara u oscura). Es lo que hay que mirar en las capturas; si molesta, la corrección se decide después (p. ej. precalcular el color del fondo con la misma curva). No se ha corregido por adelantado: no se ha medido.
- No hay postprocesado en el motor, así que no hay doble mapeo.

## Las dos builds y WebXR

La build de pantalla (three 0.186.1) y la de VR (`GEMELO_BUILD=vr`, super-three 0.185.0) comparten el código: ambas tienen las cuatro constantes (lo comprueba `tono.test.js` en las dos). En three, el tone mapping se aplica al dibujar en pantalla **o en el objetivo de WebXR** (`isXRRenderTarget`) y no al dibujar en otros objetivos; por lo que se sabe del código de three, `renderer.toneMapping` también vale dentro de una sesión de VR. Eso es lectura del código, **no una prueba**.

## Qué no está probado

- **Quest: no probado.** Ni cómo se ve ni cuánto cuesta (el tone mapping añade unas operaciones por fragmento; sin medir).
- **iPhone: no probado.**
- Sin capturas aún: la orden está lista (`node pruebas/tono_capturas.js`, ver abajo) pero no se ha ejecutado; SwiftShader vale para ver el aspecto, no para fps.

## Sacar las capturas lado a lado

Por el banco, nunca con un Chrome propio ([TESTING](../operacion/TESTING.md)):

```
node pruebas/tono_capturas.js --finca hituelo     # monta la página del fixture y encarga: neutro, agx, aces, neutral × lejos, cerca, paseo
npm run banco:ronda                                # cuando el banco esté libre
```

(`--dry` imprime la orden sin ejecutar nada.) Las capturas quedan en la carpeta de resultados del banco, no se versionan.
