# Medidas del motor por teselas (Chrome headless con SwiftShader, 1000×900; los fps reales faltan: solo un iPhone los da)

> Referencia viva: se actualiza al volver a medir (protocolo: [skill `medir`](../../.claude/skills/medir/SKILL.md)). Cifras de octubre de 2026; solo SwiftShader, los fps reales faltan.

## Cerro Velasco, antes y después (mismas cámaras; banco de entonces `prueba.js`, no versionado: hoy `pruebas/prueba3.js`)

| Vista | Llamadas | Triángulos | Puntos | Heap JS |
|---|---|---|---|---|
| Mapa, modo Nube — antes | 214 | 765 k | 679 k | 91 MB |
| Mapa, modo Nube — después | 234 | 238 k | 232 k | 84 MB |
| Mapa, modo Gemelo — antes | 220 | 1.677 k | 973 k | 185 MB |
| Mapa, modo Gemelo — después | 225 | 261 k | 0,6 k | 83 MB |
| Cerca, Gemelo — antes | 134 | 1.708 k | 973 k | 262 MB |
| Cerca, Gemelo — después | 137 | 437 k | 0,6 k | 92 MB |
| Tiempo hasta «listo» | 11,3 s | | | 5,5 s (embebido) · 3 s (ficheros) |

El paso a Gemelo ya no bloquea (los olivos de 64 m se construyen a rebanadas; antes 1,35 s medidos por el agente B).

## Escala (modo ficheros, `prueba3.js`)

| Mundo | Teselas | Olivos | Mapa lejano (llamadas / k tri) | Cerca (llamadas / k tri) | Heap |
|---|---|---|---|---|---|
| Cerro | 12 | 1.077 | 225 / 238 | 175 / 671 | 61→92 MB |
| Cerro ×9 en el espacio (banco de estrés) | 108 | 9.693 | 592 / 409 (sobre todo objetos por parcela) | 115 / 757 | 59→141 MB |
| **Hituelo** | 46 | 5.859 | 496 / 616 | 166 / 1.389 | 52→138 MB |

Presupuesto de diseño por fotograma: ≤ 1,7 M triángulos, ≤ 1,4 M puntos (tope explícito), ~250 llamadas en vistas de cerca. En Hituelo el cerca llega a 1,4 M triángulos con 28 olivos de nivel 0 construidos: hay margen, pero **hay que medirlo en el iPhone**.

## three 0.128.0 → 0.186.1 (2026-10-29, fixture sintético, [ADR-0016](../adr/0016-actualizacion-de-three.md))

`GEMELO_MIDE=1 node --test pruebas/guardianes/carga.test.js`, salida artefacto, escenarios de `pruebas/guardianes/_navegador.js` (900×650). Cerro / Hituelo.

| Escenario | Llamadas r128 → 0.186.1 | Triángulos r128 → 0.186.1 | Puntos | Heap JS |
|---|---|---|---|---|
| lejos | 167 / 167 → 167 / 168 | 82.156 → 82.364 / 82.366 | 620 = | 24 → 27 MB |
| cerca | 55 / 55 → 56 / 56 | 430.374 → 430.654 | 2.825 = | 35-36 → 36 MB |
| nube | 133 / 88 → 94 / 98 (varía con la carga, no se compara) | 176.317 / 173.339 → 173.738 / 174.032 | 2.960 = | 34 → 37-38 MB |

Sin cambios de presupuesto: lo que la subida añadía se quitó en el código (lo transparente de dos caras volvía a dibujarse en dos pasadas: `forceSinglePass`; las estelas vacías contaban una llamada: no se dibujan vacías). Los conos tienen menos triángulos (sin caras degeneradas en la punta). El paquete de Vite (motor + three) pesa 981 kB sin comprimir; la salida artefacto pide a jsDelivr `three.module.js` (0,66 MB) y `three.core.js` (1,46 MB) sin minificar. **fps: no medidos** (SwiftShader).

## Presencia simulada (F2 sin red, 2026-10-29, fixture sintético, [presencia](../../contratos/presencia.md))

Cerro embebido, escenarios `lejos` y `cerca` de `pruebas/guardianes/_navegador.js` (900×650), Chrome headless con SwiftShader, dos repeticiones; `?presencia=sim&n=…`. Las llamadas y los triángulos que añade la presencia no varían entre repeticiones; los del resto de la escena en `cerca` sí (lo que la `Cola` ha construido al medir).

| Visitantes | Llamadas lejos / cerca | Triángulos añadidos | JS de la presencia por fotograma (media; pico) | Geometrías / texturas añadidas |
|---|---|---|---|---|
| 0 (sin la bandera) | 168 / 56 | 0 | 0 | 0 / 0 |
| 10 (3 de Quest) | 173 / 61 (+5) | +508 | 0,31–0,48 ms; 0,7 ms | +5 / +1 |
| 40 (11 de Quest) | 173 / 61 (+5) | +1.984 | 0,56–0,91 ms; 1,1 ms | +5 / +1 |

- **Las mismas 5 llamadas con 10 que con 40** (cuerpo, cabeza, sombrero, manos, nombres): instanciado. Unos 50 triángulos por avatar. Muy por debajo de los topes de `pruebas/presupuesto.json`, que no se tocan.
- **Sin la bandera se dibuja lo mismo que en `main`:** `carga.test.js` con `GEMELO_MIDE=1`, cuatro pasadas de `main` y cuatro de la rama: Cerro `lejos` 167–168 / 82.364–82.366 y `cerca` 56 / 430.654 en las dos; puntos idénticos; los valores de Hituelo y de `nube` cambian de una pasada a otra también en `main` (lo que haya cargado la `Cola`) y la rama no da ninguno que `main` no dé.
- **El JS** es el de `Presencia.actualiza` (andar de los simulados, codificar, red de mentira, decodificar, interpolar y colocar instancias), medido con `performance.now()` en este PC; el del fotograma entero en SwiftShader (1–3 fps) no significa nada. **En iPhone y Quest, no medido.**
- **VR con el WebXR simulado** (`pruebas/mock_xr.js`): con 10 y 40 visitantes entra en VR, los avatares siguen en la escena y llegan todos (`vistos = n`), sin errores. Las llamadas en VR no se comparan (varían de una pasada a otra con la carga).
- **Red y retardo:** los de la simulación en el navegador no valen (la simulación va al ritmo de los fotogramas y SwiftShader da 1–3). Los de referencia son los de Node en `presencia.test.js` (códec: ≤ 5 mm y 0,241°; interpolación: ≤ 0,8 cm a 10 Hz y ≤ 6 cm a 2 Hz) y la carga útil calculada del contrato (24 B × 10 Hz = 240 B/s por cercano en escritorio; 560 B/s en Quest). Sin LiveKit no hay cifra de retardo real.

## Tirones (rebanada máxima de la cola, ms, escritorio)
R (ruido) 13 · N (nube, incluye decodificar una ortofoto) 12–40 antes de separar la decodificación · T (terreno) 6 · C (olivos N0) 10–20 · B 3. Con el presupuesto de 6 ms/fotograma (3,5 en paseo) el peor fotograma añade ≈ una rebanada. En un iPhone espera 2–3 veces más.

## Límites conocidos
- Las ortofotos decodificadas (2,4 MB por tesela de 768 px; 1 MB a 512 px) se sueltan solo a 900 m; sin LRU fino.
- Dentro de una tesela todo el relieve y la copa (258² + 256²) están siempre en memoria: 49 teselas ≈ 20 MB; la nube de las lejanas se libera a > 1,2× 2.300 m.
- Las teselas se piden a ≤ 1.800 m de la cámara, de 3 en 3.
- Las teselas sin datos (fuera de las parcelas + 60 m) son un hueco: el mundo de Hituelo es un mosaico, no un rectángulo.
- NDVI de Hituelo en el HTML: 2,3 MB (u8) → 3 MB; página 4,6 MB. Si el artefacto no admite `fetch` de ficheros de apoyo, Hituelo (52 MB de teselas) no cabe en una sola página.
