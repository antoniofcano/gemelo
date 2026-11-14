# Revisión independiente de los remates (5379ab43) y de la ronda del banco (8a458a3c)

Solo lectura: no se ejecutó ninguna prueba, build, Chrome ni Docker. Todo lo de abajo sale de leer código, pruebas y diffs. Lo que dependía de ejecutar (gitleaks contra el historial, la integración con PostGIS, la memoria de VR en Chrome) queda **no comprobado**.

## Veredictos

| Id | Veredicto | Evidencia fichero:línea |
|---|---|---|
| L9-06 | Cerrado, con reservas bajas | `apps/api/src/presencia/reingreso.ts:81-103` (consulta parametrizada, sin SQL concatenado: el único dato variable es `$1` = `TTL_S`); `rutas.ts:73-81` (el `try/catch` del `onReady` evita tumbar el arranque); `reingreso.ts:96-99` (marca con la hora de la auditoría, así vence a `cuando + TTL_S`); `pruebas/integracion/reingreso.test.ts` (comprueba que vence a los 15 min de la expulsión, no del arranque; se salta sin Docker) |
| L9-08 | Cerrado, reservas bajas | `.github/workflows/puerta.yml:19-34` (YAML bien formado, `fetch-depth: 0`, versión 8.30.1 fija, `sha256sum -c`, `gitleaks git ... .`); `.gitleaks.toml:10-16` (`condition = "AND"`, ruta exacta y forma exacta); `pruebas/guardianes/ci_gitleaks.test.js:11-37` |
| L9-08 (patrón UTM este) | Cerrado | `pruebas/guardianes/secretos.test.js` (diff de b1367238: lookbehind `(?<![#\w.,-])`, rango 405000-429999, excluye múltiplos de 1000; muestras que marca y que no) |
| L3-22 | Cerrado, cosmético bajo | `apps/web/src/nucleo/hace.ts:6-18`; las cinco llamadas pasan bien las unidades (ver abajo); `hace.test.ts:7-31` |
| L8-01 | Cerrado | `tiempo.test.ts` (diff de 4633574c): la prueba 1 falla si `tiempo.ts:113` deja de pasar `paseando` al paso; la prueba 2 falla si `arranque.ts:577` deja de pasarlo a `creaTiempo` |
| L1-10 | Cerrado | `ui/ajustes.ts:52-70` (`conCache`, `sinCache`) y `ajustes.ts:343-344` (`api.sinCache(); reducidoYa = null;` en `libera`); las dos pruebas nuevas fallan sin el arreglo |
| L6-03 | Cerrado | `nucleo/movimiento.ts:8-18`; `ui/ajustes.ts:119` (sistema/reducido/normal); `nucleo/movimiento.test.ts:38-46` |
| L6-06 | Cerrado | `mundos/comun/corro.test.ts` (diff de 0e917dc2): `toBe` nodo a nodo; fallaría si la lista se rehace con nodos nuevos iguales |
| L1-06 | Cerrado en lo que dice («fixture»); sin cubrir `fixture_olivos_*` | `pruebas/presupuesto.json:5-24` (todos los topes de `fixture` ≤ 2× su `medido` y ≥ él, revisado uno a uno: máximo 1,67× en `heapMB`); `pruebas/guardianes/carga.test.js:25-43` |
| L1-07 | Cerrado | `nucleo/render.ts:106-158`, `ui/ganchos.ts:34`, `carga.test.js:58-60`; la estimación solo corre al llamar a `__g.memoria()` |
| L2-06 | Cerrado, con umbral débil para goteos lentos | `pruebas/guardianes/memoria_vr_chrome.test.js:21-24, 117-119` |

## Respuestas a los puntos pedidos

### (a) reingreso.ts

- **Inyección SQL: no.** `SQL_EXPULSIONES_VIVAS` es una constante; `TTL_S` va como parámetro `$1` (`make_interval(secs => $1)`). `hogar` y `evento` salen de `detalle->>` y se validan con `Number` + `isSafeInteger` + `>= 1` (`reingreso.ts:94-100`). Una fila rara se salta.
- **Coste al arrancar: bajo.** Una consulta con `cuando > now() - 900 s` sobre `auditoria_cuando (cuando DESC)` (`migraciones/0001_inicial.sql:177`). El filtro por `accion` va después del rango de índice. Solo se ejecuta si hay LiveKit configurado.
- **Si la consulta falla:** el `try/catch` de `rutas.ts:76-79` registra un `error` y la api arranca. No tumba el arranque (bien), pero queda **abierto en falla** (ver H-3).
- **Horas.** La marca se pone con `en` = hora de la base (`extract(epoch FROM cuando)`), de modo que vence a `cuando + 900 s`. La fila de auditoría se escribe al final de la expulsión (`rutas.ts:49`, `voz_rutas.ts:313`), unos instantes DESPUÉS de la marca original, así que la marca reconstruida dura como mucho unos segundos más que la original: es del lado seguro. Entre reloj de la base y reloj del proceso puede haber deriva (mismo equipo en el despliegue: irrelevante).
- **Datos personales: ninguno nuevo.** Solo se lee `accion`, `detalle.hogar`/`detalle.evento` (ids numéricos) y `cuando`. El `log.warn` lleva `sala` y el mensaje de error, no el hogar ni el prefijo. `motivo` (texto libre de la oficina) ya se guardaba antes y no se lee aquí.
- **La prueba fallaría sin el arreglo:** la unidad (`pruebas/unidad/reingreso.test.ts:143`, `:158`) y la integración cubren la reconstrucción y el cableado; la integración **no se ha ejecutado** (se salta sin Docker) y la consulta contra una base real no está comprobada.

### (b) puerta.yml y .gitleaks.toml

- YAML bien formado; `fetch-depth: 0` presente; versión fija `8.30.1`; el binario se comprueba con `sha256sum -c` contra `checksums.txt` de la misma publicación; `gitleaks git --config .gitleaks.toml --redact --no-banner --exit-code 1 .` (subcomando `git`, recorre commits). El `run` de GitHub usa `bash -eo pipefail`, así que si `grep` no encuentra la línea el paso falla (no se salta la comprobación).
- La excepción es estrecha: `AND` de ruta exacta (`^apps/api/pruebas/unidad/avisos_correo\.test\.ts$`) y de una forma exacta por línea; `useDefault = true`, sin `disabledRules`, sin `[allowlist]` global. El guardián comprueba todo eso, incluidos ejemplos que NO deben casar.
- **No comprobado:** que 8.30.1 exista y que sus nombres de asset sean exactamente los de la URL (los patrones `gitleaks_<v>_linux_x64.tar.gz` y `gitleaks_<v>_checksums.txt` son los habituales); que la sintaxis `[[allowlists]]` con `condition`/`regexTarget` la acepte esa versión; y que no salte ningún otro hallazgo en el historial. Sin ejecutarlo en CI no se sabe si el primer pase sale en verde.

### (c) hace.ts

- NaN, no numéricos e infinitos: `""`. Negativos y futuros (por mucho que sea): «hace 1 min» (documentado, ver H-5). 89 min: «hace 89 min». 90 min: «hace 2 h» (1,5 redondea a 2). 36 h − 1 min: «hace 36 h». 36 h exactas: «hace 2 días» (1,5 redondea a 2).
- Unidades de las cinco llamadas: `historia.ts`, `mundo-hoy.ts`, `carteles.ts`: `haceDesde(iso, ahora)` con `ahora` en ms, y `haceDesde` divide por 60000: correcto. `tiempo-puro.ts`: `haceDesde(iso, ahora())` (ms): correcto. `fichas-tiempo.ts`: `haceMinutos(Math.max(0, h) * 60)` con `h` en horas: correcto. Cambio de comportamiento declarado: las fichas pasan de «horas hasta 48 h» a 36 h.
- Mejora de paso: `tiempo-puro.hace` con una fecha inválida antes daba «hace NaN min»; ahora da `""`.

### (d) movimiento.ts

- `ajustes.ts:119`: «sistema» → `sistemaReduceMovimiento(window)`, «reducido» → true, «normal» → false. Antes de que exista Ajustes (pasos < 33) `movimientoReducido(null, window)` cae al sistema (`arranque.ts`, `typeof Ajustes !== "undefined"`), y `33_ajustes` corrige con `Tiempo.calma` por el oyente `alMovimiento` (que llama a `fn` en el acto).
- Nadie más lee la media query: solo `movimiento.ts` y `ajustes.ts` (que importa `CONSULTA_MOVIMIENTO` para el oyente de «change»). Lo vigila `movimiento.test.ts:38-46`, que busca el literal `prefers-reduced-motion` en todo `apps/web/src` (incluida `arranque.ts`) sin comentarios. No detecta quien construya la cadena por otro camino (no es un riesgo real hoy).

### (e) presupuesto.json y bytesEstimados

- Los 18 pares tope/medida de `fixture` cumplen `medido ≤ tope ≤ 2× medido` (revisados a mano; el mayor es heap 45/27 = 1,67×). La prueba lo impone leyendo el fichero (`carga.test.js:25-43`) y los topes se comparan además con la medida real (`carga.test.js:56-61`).
- `bytesEstimados` NO recorre la escena por fotograma: `Render.memoria()` solo la llama `__g.memoria()` (`ganchos.ts:34`), que usa la prueba al final de cada escenario; el medidor `?debug` usa `renderer.info.memory`, no esto.

### (f) memoria_vr_chrome

Ver H-2.

## Hallazgos nuevos

[MEDIO] H-1 · `pruebas/presupuesto.json:26-34` — los topes de `fixture_olivos_gen` y `fixture_olivos_escalera` quedan fuera de la regla «medido y ≤ 2×» que L1-06 puso para `fixture`; la propia auditoría los citó (L1-06 (e): `escalera.cerca` = 1 M de triángulos, 2,2× lo medido; hoy sigue igual, y `gen.cerca` 680 k frente a 278 k medidos son 2,4×; `escalera.lejos` llamadas 155 frente a 124) — escenario: un cambio que sume ~100 mallas sin instanciar en `?olivos=escalera` pasa `olivo.test.js` — cómo se comprobó: leyendo `presupuesto.json` y `carga.test.js` (la prueba de 2× solo itera `FINCAS × ESCENARIOS` de `fixture`) — por qué no lo vio ningún guardián: el nuevo solo mira `fixture`. L1-06 se puede dar por cerrado solo para `fixture`; estos dos bloques o se miden o se declaran aparte como cálculos.

[BAJO] H-2 · `pruebas/guardianes/memoria_vr_chrome.test.js:21-24, 117-119` — el umbral (≤ 3 geometrías y ≤ 3 texturas en 8 sesiones tras calentar 2) detecta un goteo de ≥ ~0,4 por sesión; uno más lento (1 recurso cada 3-4 sesiones, o de otro tipo: destinos de render, oyentes, objetos JS) pasa. El heap admite 40 MB sin `--expose-gc` (la propia prueba dice que `gc` probablemente no existe), así que un goteo de varios MB por sesión también pasa. Además `quieta()` deja que las teselas terminen de cargar/expulsarse, y una bajada por expulsión de teselas puede compensar una subida por fuga (la comprobación solo mira `fin − calen ≤ margen`, no el mínimo). Con 8 sesiones no hay forma de afirmar «no gotea», solo «no gotea más de ~0,4/sesión». Conviene que la nota de MEDIDAS lo diga así. Quest: no probado (ya lo dice la prueba).

[BAJO] H-3 · `apps/api/src/presencia/rutas.ts:76-79` y `:49` / `voz_rutas.ts:313` — (i) si la consulta de reconstrucción falla, la api arranca sin marcas (falla abierto) y solo deja un `app.log.error`; (ii) la auditoría se escribe DESPUÉS de las llamadas a LiveKit; si `expulsaHogar` lanza, la marca queda en memoria pero no hay fila de auditoría, y un reinicio posterior la pierde (la nota de `rutas.ts:33` ya dice que el error sube). Estrecho (reinicio en los 15 min siguientes y a la vez fallo de LiveKit), pero la promesa «un reinicio ya no deja entrar» tiene esas dos excepciones sin documentar.

[BAJO] H-4 · `pruebas/guardianes/carga.test.js:25-43, 59` — la regla de 2× es coherente consigo misma pero no demuestra que `medido` sea una medida real (es un número escrito al lado; la única garantía es la fecha y el `$comment`). Además `if (m.gpuMB >= 0)` salta en silencio el tope de GPU si `__g.memoria` falta (devuelve -1). Una prueba que exija `gpuMB >= 0` cuando hay escena cerraría esto.

[BAJO] H-5 · `apps/web/src/nucleo/hace.ts:8-10` — dos saltos cosméticos por el redondeo (89 min → «hace 89 min», 90 min → «hace 2 h», sin «1 h»; 35 h 59 min → «hace 36 h», 36 h → «hace 2 días», sin «1 día»), y cualquier instante futuro, aunque sea de un año, se muestra «hace 1 min» y oculta una deriva de reloj o un dato corrupto. La guarda de «una sola copia» (`hace.test.ts:35-36`) solo busca `"hace " +`: una copia escrita con plantilla o `` `hace ${…}` `` no se detectaría.

[BAJO] H-6 · `.github/workflows/puerta.yml:28-30` — la suma se baja de la misma publicación que el binario: detecta una descarga corrupta pero no una publicación comprometida. Fijar el hash SHA-256 esperado en el workflow (y que el guardián compare ese literal) lo cerraría. Además la reconstrucción de `.gitleaks.toml` y el primer pase por el historial público no se han ejecutado: es el único sitio donde un falso positivo antiguo (otro fichero o forma) pondría roja la puerta.

[BAJO] H-7 · `doc/rumbo/PLAN.md:119` — AG-P1b («Goteo de memoria por sesión de VR») sigue en ⬜ mientras L2-06 y MU0-5 (misma ronda, `PLAN.md:195`) dicen que el goteo ya no está. Hay que marcar AG-P1b como cerrado o sustituido por L2-06 (regla 8: la documentación se corrige con el commit que cambia lo cierto).

## Lo no comprobado (no es hallazgo)

- Ejecución de la integración con PostGIS (`pruebas/integracion/reingreso.test.ts`), de gitleaks sobre el historial y de `memoria_vr_chrome` en Chrome: no se ejecutó nada.
- Quest, iPhone y el comportamiento real de LiveKit (renovación de token, 404 de sala inexistente: ya marcados NO VERIFICADO en el código).
- Que gitleaks 8.30.1 exista y acepte el TOML tal cual.
