---
name: medir
description: Protocolo para medir dibujo, memoria y tiempos del motor antes y después de un cambio gráfico (Chrome headless con SwiftShader, o ?debug en un dispositivo real). Úsala siempre que se afirme algo sobre rendimiento, presupuesto o memoria, y al subir o bajar los topes de pruebas/presupuesto.json.
---

# Medir

Regla 7: *medir antes de afirmar*. Sin una medida reproducible no se dice «más rápido», «cabe» ni «va bien».

## Qué vale con cada instrumento
| Instrumento | Vale para | **No** vale para |
|---|---|---|
| Chrome headless + **SwiftShader** (`--use-gl=swiftshader`) | llamadas de dibujo, triángulos, puntos, geometrías/texturas, heap JS, ms de JS de la `Cola`, tiempo hasta «listo» | **fps**, comodidad, térmica, memoria de GPU real |
| `?debug` en **iPhone / Quest / PC real** | fps, ms de JS por fotograma, llamadas, triángulos, teselas y olivos por nivel | reproducibilidad entre dispositivos |

Los fps reales **solo** los da un dispositivo real. Una cifra de SwiftShader se rotula «(SwiftShader)».

## Antes / después con la misma cámara
1. Servir la finca con su tileset (fixture: `npm run fixture` y la página de `montaPagina` de `pruebas/guardianes/_pagina.js`; reales: según `DATOS.md` y el entorno local de `DESARROLLO-LOCAL.md`). Las cifras de la escena de siempre ya no se pueden reproducir: las anteriores a T8 fase 2 son historia.
2. **Antes** (en la rama sin el cambio): `node pruebas/prueba3.js <url> <prefijo>` con escenarios fijos. Escenario = `{az, el, dist, ox, oy, modo}`; `modo` ∈ `nube|gem|orto`. Por defecto ejecuta inicial/medio/…; pasa un JSON como 3.º argumento para fijar los tuyos. Esperar a que `Cola.pendientes() === 0` (variable `ESPERA` en ms).
3. **Después** (con el cambio), idénticos escenarios y datos.
4. Para el fixture, el guardián `carga` hace lo mismo con tres escenarios (`lejos`, `cerca`, `nube`); `GEMELO_MIDE=1 node --test pruebas/guardianes/carga.test.js` imprime las cifras.
5. Repetir ≥ 2 veces: el heap fluctúa; llamadas/triángulos/puntos no (son deterministas con la misma cámara).

## Qué se reporta
Tabla con **antes / después** de: llamadas, triángulos (k), puntos, geometrías, texturas, heap (MB), tiempo hasta «listo» y rebanada máxima de la `Cola` si el cambio toca trabajos. Más: finca, versión/commit, cámara, navegador y que es SwiftShader. Se compara con el presupuesto de diseño (≤ 1,7 M tri, ≤ 1,4 M puntos, ≈250 llamadas, ≈350 MB; [ADR-0002](../../../doc/adr/0002-niveles-de-detalle.md), superado: el diseño de cifras sigue en `pruebas/presupuesto.json`).

## Después de medir
- Actualizar `doc/sistema/MEDIDAS.md` solo si se han re-medido las vistas de allí; dejar la fecha.
- Si el cambio sube un recuento a propósito: subir el tope de `pruebas/presupuesto.json` **explicándolo en el commit**.
- Si el cambio podría afectar a móviles/VR y no hay dispositivo: escribir en ESTADO «no medido en dispositivo».
- Fugas: comparar `renderer.info.memory` al ir lejos → cerca → lejos; debe volver a su orden de magnitud.
