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

## Tirones (rebanada máxima de la cola, ms, escritorio)
R (ruido) 13 · N (nube, incluye decodificar una ortofoto) 12–40 antes de separar la decodificación · T (terreno) 6 · C (olivos N0) 10–20 · B 3. Con el presupuesto de 6 ms/fotograma (3,5 en paseo) el peor fotograma añade ≈ una rebanada. En un iPhone espera 2–3 veces más.

## Olivos generados con `?olivos=gen` (2026-10-29, fixture sintético de Hituelo, [ADR-0017](../adr/0017-constructor-de-olivos-generados.md))
Chrome headless con SwiftShader (recuentos y memoria, no fps), máquina cargada; `?arbsc=1`; `pruebas/olivo/p7_medidas.mjs`. Escenarios de `carga.test.js`.

| Escenario | Sin la bandera (llamadas / tri / heap) | Con `?olivos=gen` | Lote de generados |
|---|---|---|---|
| Lejos (600 m) | 168 / 82 k / 30 MB | igual (desde lejos no se genera nada) | — |
| Cerca (45 m) | 56 / 431 k / 38 MB | 47 / 546 k / 44 MB | 6 mallas · 2 olivos (E0 + E1) · 135 k tri (222 k con la pasada de sombras) |
| Nube | 88 / 173 k / 38 MB | sin lote (los árboles no se ven en modo Nube) | — |

- **Sin la bandera** el motor dibuja lo mismo que antes (mismos recuentos en las tres vistas que la medida previa y que `carga.test.js`).
- **Lote**: corteza, madera muerta y olivas en una `BatchedMesh` cada una; ramitas A, B y relleno, instanciadas; olivas de E2 como puntos. Para 2-7 olivos, 6-7 llamadas EN TOTAL. Antes de fijar el coste de las sombras (sin contarlas), se dibujaban 7 olivos (6 propios + 1 variante, 288-308 k tri) y la escena llegaba a 655 k tri: por eso el presupuesto cuenta la pasada de sombras.
- **Presupuesto**: el 45 % del tope del aparato (550 k en escritorio; el del perfil VR en gafas), contando la pasada de sombras. Con olivos centenarios de 100 k tri (E0) y 50 k (E1), caben el más cercano en E0 y otro en E1; las variantes E2 quedan fuera en el fixture.
- **Generación**: sin trabajador (salida artefacto, IIFE) va a rebanadas por la Cola (`G…` en `?debug`); con la máquina cargada, la rebanada más larga llegó a 15 ms. En el cliente web (Vite) va al trabajador. **No medido** con datos reales de Hituelo ni en aparatos.

## Límites conocidos
- Las ortofotos decodificadas (2,4 MB por tesela de 768 px; 1 MB a 512 px) se sueltan solo a 900 m; sin LRU fino.
- Dentro de una tesela todo el relieve y la copa (258² + 256²) están siempre en memoria: 49 teselas ≈ 20 MB; la nube de las lejanas se libera a > 1,2× 2.300 m.
- Las teselas se piden a ≤ 1.800 m de la cámara, de 3 en 3.
- Las teselas sin datos (fuera de las parcelas + 60 m) son un hueco: el mundo de Hituelo es un mosaico, no un rectángulo.
- NDVI de Hituelo en el HTML: 2,3 MB (u8) → 3 MB; página 4,6 MB. Si el artefacto no admite `fetch` de ficheros de apoyo, Hituelo (52 MB de teselas) no cabe en una sola página.
