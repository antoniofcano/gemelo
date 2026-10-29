# Contrato `olivo-generado` (generador `olivo-2`)

Cómo se genera un olivo **por procedimiento y con semilla** a partir de lo medido de cada árbol, y qué viaja entre el generador, el trabajador y quien lo dibuja. Decisión y lo que queda abierto: [ADR-0017](../doc/adr/0017-constructor-de-olivos-generados.md). Esquema: [`olivo-generado.schema.json`](olivo-generado.schema.json). Código: `apps/web/olivo/` (módulo ES sin DOM). Lo vigila `pruebas/guardianes/olivo.test.js`.

Es la otra vía frente al catálogo de modelos fijos ([`olivos-tipo.md`](olivos-tipo.md), ADR-0012): en vez de 6-8 glb, **un árbol distinto por olivo**, siempre el mismo para la misma entrada. La forma es **ilustrativa** (regla 5 de CLAUDE.md); la altura, el diámetro de copa y hacia dónde carga salen de lo **medido**.

## 1. Entrada

`{tipo, parametros?, epoca, semilla}`

| Campo | Contenido |
|---|---|
| `tipo` | uno de los 7 de `TIPOS` (`planton`, `adulto1`, `adulto2`, `adulto3`, `centenario`, `centenario2`, `centenario3`); id estable en `ID_TIPO` (0-6). Da los parámetros por defecto |
| `parametros` | *(opcional)* los que se sobrescriben (`altura`, `copa`, `asim`, `rumbo`, `densidad`, `falda`, `relieve`, `pies`…; rangos en `RANGOS`). Desde el registro: `parametrosDeCopa(copa, copas_param[i], tipo)` (§3) |
| `epoca` | `reposo`, `boton`, `flor`, `cuajado`, `verde`, `envero`, `madura`. Desde un BBCH: `bbchAEpoca(bbch)` (0-50 reposo, 51-59 botón, 60-69 flor, 70-74 cuajado, 75-80 verde, 81-88 envero, 89-99 madura) |
| `semilla` | entero 0 … 2^32 − 1. Desde el registro: `semillaDeCopa(copa, copas_id[i], centro_utm)` → `{semilla, provisional}`: la semilla **es** el `copas_id` (del censo de OlivarTrack, 0 … 2^31 − 1, o provisional del exportador, 2^31 … 2^32 − 1, que se marca `provisional`: `tuberia/ids_copas.py`); sin `copas_id`, el mismo id provisional que daría el exportador desde la posición UTM (sin resolver colisiones) |

## 2. La receta (lo que da el generador)

Un objeto de arrays tipados, sin THREE, que pasa por `postMessage` como transferibles y que `montaOlivo(THREE, receta, materiales)` convierte en un `THREE.Group` (metros, +Y arriba, pivote en la base del tronco, norte = −Z):

- `v` (`"olivo-2"`), `entrada`, `escala` `[fxz, fy, fxz]` (el ajuste final a la altura y la copa pedidas), `corte` (color del corte de poda), `cuenta` (nodos, brotes, ramitas, relleno, frutos, cortes), `medidas` `{altura_m, copa_m, pies}`, `padre` (`Int32Array`: el árbol de ramas, −1 en las raíces).
- `piezas[]`, en orden de dibujo. Cada una: `clase` (`malla`, `instancias`; `puntos` solo en E2), `mat` (nombre de material, ver `MATERIALES`), `geo` (`propia` o una compartida: `ramita`, `relleno`, `oliva`, `tocon`, `corte`, `octa`), `sombra` `[proyecta, recibe]`, `prof` (material de sombra con recorte), `pos`/`rot`/`esc`; con geometría propia `atrib` (`position`, `normal`, `uv`, y en los pies `aHueco`, `aMuerta` para el sombreador de marcas) e `indice` (`Uint32Array`); con instancias `n`, `matrices` (16 × n), `colores` (3 × n), `nodo` (`Int32Array`: la rama que sostiene cada instancia, para cortar una rama con todo lo que lleva).
- Metadatos de niveles (fuera de la huella olivo-2): `rol` (`ramas`, `ramitas`, `relleno`, `olivas`), `rejilla` `[segs, rad]` de cada tubo y, en la madera fina (una sola pieza), `brote` (`Uint8Array`, 1 por prisma de brote de superficie).

**Huella olivo-2** (`huella(receta)`, SHA-256): los bytes canónicos de la receta — el JSON de la cabecera y de cada pieza (clase, mat, geo, sombra, prof, pos, rot, esc, n) y cada array tipado precedido de `nombre:Tipo:longitud\n`, en este orden: `padre`; por pieza `position`, `normal`, `uv`, `aHueco`, `aMuerta`, `indice`, `matrices`, `colores`, `nodo`. **Huella de niveles** (`huellaNiveles`): `[[rol, rejilla]…]` y cada `brote`. **Huella estructural** (`huellaEstructura`): todo lo entero (cuentas, índices, nodo, padre) y los flotantes de cabecera redondeados a 10⁻⁶, sin los arrays de flotantes.

**Determinismo — medido:** misma entrada → mismos bytes **en el mismo motor de JavaScript**. Entre motores cambia el último bit de algún flotante (Chrome 131 frente a Node 24: 12 de 23 760 valores de las matrices de las olivas, diferencia máxima 1,5·10⁻¹⁹), porque `Math.sin`/`Math.cos` no son exactos por norma; la huella estructural y todos los recuentos coinciden. Por eso el guardián compara con Node la huella exacta y con el navegador la estructural y la diferencia de flotantes. **No probado:** Safari (JavaScriptCore) ni Firefox (SpiderMonkey).

### Niveles de detalle
`aNivel(receta, k)` (de la maqueta «Olivos en el gemelo», sobre arrays): `E0` completo; `E1` sin los prismas de brote y olivas como octaedros; `E2` además los tubos a un cuarto de resolución (uno de cada dos anillos y de cada dos lados) y olivas como puntos; `E2VR` además el aclareo: la mitad de las ramitas, las de mayor puntuación (`radio horizontal / radio de copa + 0,75 · max(0, y/H − 0,35)` más un desempate fijo por índice), ×1,38, y el relleno ×1,25. Centenario 3 pies, envero, semilla 7: **102 978 / 48 378 / 19 366 / 14 618** triángulos, 36 llamadas de dibujo en todos.

## 3. `copas_param` (columna paralela opcional del índice)

Junto a `copas[]`, `copas_id[]` y `copas_tipo[]` ([CONTRATOS §1.1](../doc/sistema/CONTRATOS.md#11-indicejson-va-en-la-página-como-d)): una fila por copa o `null`. Todo **medido** del LiDAR por `tuberia/parametros_copas.py`:

| Posición | Campo | Qué es |
|---|---|---|
| 0 | `altura_m` | percentil 95 de la altura de los puntos de copa |
| 1 | `copa_m` | diámetro del contorno: 2 × media de los 8 radios (p95 por octante desde el centro de copa) |
| 2 | `desplaz_m` | del tronco al centro de copa, en planta |
| 3 | `rumbo_gr` | hacia dónde carga: 0 = norte (+y del índice, −Z del motor), 90 = este |
| 4 | `densidad` | fracción de celdas de 0,5 m del contorno con puntos de copa |
| 5 | `base_m` | percentil 5 de la altura de los puntos de copa (la falda) |
| 6 | `rugosidad` | desviación típica de la superficie de arriba / altura |
| 7 | `tronco` | 0 = LiDAR (retornos de 0,3-1,2 m bajo la copa), 1 = marca de OlivarTrack corregida de su desfase, 2 = ni lo uno ni lo otro: centro de copa y **asimetría 0** (decisión de Antonio nº 31). Manda el LiDAR |

`parametrosDeCopa` lo convierte (fórmulas del bloque 4 de la maqueta): `altura`, `copa`, `densidad` y `rumbo` (redondeado a 5°) tal cual — **medidos** —; `asim = min(0,6, desplaz / (copa/2) · 1,8)`, `falda = 1 − base/altura`, `relieve = min(1, 1,8 · rugosidad)` — **deducidos** —; devuelve además `origen` por campo. Sin fila, solo `altura = h` y `copa = 2 × media(r8) × factorR8` — r8 es el **radio** medido; `factorR8` es el mismo factor de configuración que el motor (`FACTOR_R8`, `?factorR8=`): 0,5 por defecto (como se dibuja hoy), 1 = la copa a su radio medido (decisión abierta nº 48).

**Calibración (sintética):** olivos generados con parámetros conocidos, convertidos en una nube de puntos de LiDAR simulado y medidos con el mismo cálculo (`pruebas/olivo/calibracion.mjs`): el p95 y el radio medio quedan por debajo del máximo y de la caja que usa el generador (factor medido k ≈ 1,16 en altura y ≈ 1,20 en copa). No se aplica por defecto (decisión pendiente, ADR-0017).

## 4. Versiones

`GEN_VERSION` (`apps/web/olivo/version.js`) nombra el generador. Las huellas de referencia viven en `pruebas/olivo/huellas-<GEN_VERSION>.json` (las de `olivo-2` las da el oráculo, `pruebas/olivo/oraculo.mjs`, con la referencia que no se versiona). Si cambia **un byte** de alguna receta o el código del núcleo (`nucleo.js`, `tipos.js`, `azar.js`), se sube `GEN_VERSION` y se escriben sus huellas; si el árbol no cambia (un comentario), se vuelve a sellar con `node pruebas/olivo/compara.mjs --todos --sella`.
