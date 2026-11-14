# Re-verificación de las lentes 4 y 9 contra el código actual

Solo lectura. Ejecuté `node --test pruebas/guardianes/secretos.test.js` (8/8 en verde). Sin secretos, IPs, correos ni coordenadas copiados.

## Lente 4 — Contratos

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L4-01 | ALTO | RESUELTO | `apps/web/src/mundos/exterior/escena-tiles.ts:74` `motivoMarco()` compara `centro_utm`/`z0` a 1 cm y se usa en `:238` (falla y retira la escena); `tuberia/tiles3d/comprueba.mjs:21-22` hace lo mismo. Vigilan: `escena-tiles.test.ts:67,179` (Vitest) y `pruebas/guardianes/tiles3d.test.js:203` (tileset corrido 10 m). No se ha visto en Chrome. |
| L4-02 | MEDIO | YA NO APLICA | Las cabeceras adivinadas ya no existen en `src/`: lo declaran `import`/`export`. El guardián de pasos usa tokenizador (acorn). Vigila `contratos.test.js:145` (PLAN MU0-2, CHANGELOG). |
| L4-03 | MEDIO | RESUELTO | `doc/sistema/CONTRATOS.md:71` dice que `v` es el rectángulo con dato dentro de la huella, no alineado. Vigila `contratos.test.js:56`. |
| L4-04 | MEDIO | RESUELTO | `exportadores.test.js:99` valida las teselas de los exportadores sintéticos contra `tesela.schema.json` y sus tamaños. Se salta sin numpy/scipy/pillow (no lo comprobé). |
| L4-05 | MEDIO | ABIERTO | `contratos/indice.schema.json` (`paisaje`): `edificios`/`arboles` siguen como `array` sin `items`; el tipo generado `datos/contratos/indice.ts:83` los deja `unknown[]`. `mundos/exterior/paisaje.ts:169` sigue leyendo `e.color[0]!` sin guarda. |
| L4-06 | MEDIO | ABIERTO | `tuberia/hituelo_conv.py:97`: `np.pad(sf, ..., mode="edge")` sigue repitiendo el borde propio, no el de la tesela vecina. No medida la costura visual. |
| L4-07 | MEDIO | ABIERTO | `CONTRATOS.md:59` sigue diciendo que `ext` es «la caja de teselas/ventana»; `hituelo_conv.py:27` lo calcula con la caja del NDVI (`bbox25830`). Sin cambio ni prueba. |
| L4-08 | MEDIO | PARCIAL | `olivo-generado.schema.json` ya genera `datos/contratos/olivo-generado.ts` con guardián de frescura (`tipos_contratos.test.js`), pero ninguna prueba valida datos contra ese esquema ni lo compara con la fila duplicada de `indice.schema.json` (`copas_param`). CONTRATOS.md:16 sigue citando `contratos.test.js` como vigilante, y no la compila. |
| L4-09 | BAJO | ABIERTO | `D.titulo_vr` (`mundos/comun/vr-panel.ts:232`, `exterior/carteles.ts:205`) y `D.config.factorR8` (`exterior/factor-r8.ts:19`) siguen sin estar en `indice.schema.json`. |
| L4-10 | BAJO | ABIERTO | `tuberia/finca_8_teselas.py:101` sigue copiando todas las claves salvo cinco. Atenuante: el único exportador real ya es Hituelo (`--choices hituelo`); `construye()` solo lo ejercitan las pruebas sintéticas. |
| L4-11 | BAJO | ABIERTO | `tuberia/hituelo_conv.py:81,108`: `dtm` y `grueso` se convierten con `astype("<i2")` sin recorte (solo `pts` lleva `.clip` en `:100`). |
| L4-12 | BAJO | RESUELTO | `mundos/exterior/historia.ts:166` sale si no hay `NDV.fechas`; prueba en `historia.test.ts` (ndviEn sin NDVI). |
| L4-13 | BAJO | ABIERTO | `CONTRATOS.md:49` (opcionales) sigue sin `copas_semilla`, `copas_param` ni `biodiversidad`; solo aparece 1 vez `ot-hoy`/`juegos-clasificacion`/`olivo-generado` fuera de la tabla de contratos. |
| L4-14 | BAJO | ABIERTO | `mundos/exterior/olivos-tiles.ts` solo comprueba huellas (`:131,157`) y `finca_id`; no mira `contrato_origen` ni `srs`. L4-01 lo mitiga (centro/z0). |

## Lente 9 — Seguridad y privacidad

| Id | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| L9-01 | MEDIO | DECISIÓN DE ANTONIO, cerrada | DECISIONS-PENDING nº 219 (2026-11-06): (a) privados desde ahora, sin reescribir el historial salvo asesoría o gitleaks. Código: `tuberia/datos/cerro/` ya no existe y `git grep` solo encuentra ids con «polígono-9» sintéticos. Vigila `secretos.test.js:106-127` (decisión 219). El historial no se reescribe; gitleaks (nº 222, MU0-4) dio limpio. |
| L9-02 | BAJO | DECISIÓN DE ANTONIO, cerrada | Misma decisión 219. `git grep` no encuentra UTM norte 417xxxx ni lat/lon precisas; `dev.test.js` usa centro ficticio 500000/4100000. Hueco: los patrones solo cubren la franja norte de Cerro; el centro UTM de Hituelo no tiene patrón. |
| L9-03 | MEDIO | RESUELTO | `exterior/historia.ts`: los callers escapan con `esc()` (líneas 219-336, incl. `esc(x.t.titulo)`). `tabla()` (`:171`) sigue sin escapar celdas, pero cada celda pasa antes por `esc`. Vigilan `historia.test.ts:58` y `historia_vivo.test.js:119`. |
| L9-04 | BAJO | RESUELTO | `apps/web/herramientas/genera_motor.mjs:29` `escapaJsonEnScript` y `escapaHtml` (`:25,38`). Vigila `genera_motor.test.js`. |
| L9-05 | BAJO | ACEPTADO | `infra/Caddyfile:31` y `infra/dev/Caddyfile:33` siguen en `Report-Only`. ACEPTADOS.md lo propone, firma de Antonio pendiente. |
| L9-06 | MEDIO | ABIERTO | `apps/api/src/presencia/livekit.ts:25` `TTL_S = 15*60`; sin webhook de LiveKit ni TTL corto (no hay `webhook` en `apps/api/src`; `corro.ts:7` lo da por aceptable). `removeParticipant` está en `:240`. Previsto en PLAN MU3-2 (⬜) y ADR-0033. `auto_create` no aparece en `infra/livekit.yaml`: sin fijar. No probado contra LiveKit real. |
| L9-07 | BAJO | RESUELTO (cliente) | `apps/web/src/red/sala.ts:134-137` normaliza el alias (NFD, 0→o, 1/l/\|/!→i) y oculta como «Visitante» a quien nombre «oficina». `apps/api/src/yo/rutas.ts:16` sigue con `RESERVADOS` de palabra exacta: la defensa vive solo en el cliente. |
| L9-08 | BAJO | PARCIAL | `secretos.test.js` añade JWT (`:18`), LiveKit clave y par (`:19-20`), Anthropic (`:21`), `public/artifacts` (`:25`) y patrones de parcela/UTM/lat-lon (`:109`), con prueba de muestras (`:74`). Faltan: «asignación de secreto» (`:17`) sigue solo con nombres en inglés (`secret`, `token`...; sin `secreto`/`clave`); no hay `Bearer`; `claude.ai/chat/…` no está en `ARTEFACTO`; no mira el historial (solo se pasó gitleaks una vez a mano, MU0-4; el workflow de CI no lo incluye). |
| L9-09 | BAJO | ABIERTO | `contratos/indice.schema.json:33`: `ot.parcelas.*.tareas`/`fenologia` siguen como `{"type":"array"}`, sin `items` ni `additionalProperties:false`. |

## Recuento

| Veredicto | N | Ids |
|---|---|---|
| RESUELTO | 7 | L4-01, L4-03, L4-04, L4-12, L9-03, L9-04, L9-07 (cliente) |
| YA NO APLICA | 1 | L4-02 |
| PARCIAL | 2 | L4-08, L9-08 |
| ABIERTO | 10 | L4-05, L4-06, L4-07, L4-09, L4-10, L4-11, L4-13, L4-14, L9-06, L9-09 |
| ACEPTADO (firma pendiente) | 1 | L9-05 |
| DECISIÓN DE ANTONIO, cerrada por nº 219 | 2 | L9-01, L9-02 |

Por severidad (23 hallazgos):
- ALTO: 1 resuelto.
- MEDIO (L4-02..08, L9-01, L9-03, L9-06): resueltos o sin defecto L4-03, L4-04, L9-03, L4-02, L9-01 (5); abiertos L4-05, L4-06, L4-07, L9-06 (4); parcial L4-08 (1).
- BAJO (L4-09..14, L9-02, L9-04, L9-05, L9-07..09): resueltos L4-12, L9-02, L9-04, L9-07 (4); abiertos L4-09, L4-10, L4-11, L4-13, L4-14, L9-09 (6); parcial L9-08 (1); aceptado L9-05 (1).

## Lo que no pude revisar

- Efecto en Chrome de L4-01 (escena corrida) y de L4-06 (costura de color): no se ejecuta Chrome.
- No ejecuté las pruebas Vitest (`escena-tiles.test.ts`, `historia.test.ts`) ni `tiles3d.test.js`, `exportadores.test.js`, `contratos.test.js` ni `genera_motor.test.js`: sus afirmaciones salen de leer el código. Solo corrí `secretos.test.js`.
- Comportamiento real de LiveKit ante un JWT reutilizado (L9-06) y valor efectivo de `auto_create`.
- Historial de git: me fío del resultado de gitleaks que anota PLAN MU0-4 / DECISIONS-PENDING nº 222; no lo repetí.
- L9-07: no seguí el camino del chat hasta comprobar que siempre pasa por la normalización del alias en `sala.ts`.
- Si el paisaje de Hituelo real trae edificios sin `color` (L4-05) o desniveles mayores de 325 m (L4-11): datos reales fuera del repo.
