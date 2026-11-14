# Auditoría noviembre 2026: re-verificación del 2026-11-14

🗄️ Foto del 2026-11-14 sobre `main` en 14b4be09, después de la refactorización a mundos (ADR-0033). No se mantiene. Lo vigente es [PLAN](PLAN.md), [ACEPTADOS](ACEPTADOS.md) y [doc/rumbo/PLAN.md](../rumbo/PLAN.md).

## Cómo se hizo

- **Revisores:** cinco, distintos de los que encontraron los hallazgos, como pide la skill `auditoria`. Cada uno revisó dos lentes y solo leyó.
- **Criterio:** se comprobaron los 156 hallazgos contra el código de hoy, sin fiarse de lo que el PLAN da por arreglado.
- **Lo que se ejecutó:** algunas pruebas de Node y Vitest de los módulos tocados, todas en verde.
- **Lo que no se ejecutó:** ni Chrome, ni Docker, ni el Quest. Lo que exige ejecutarse o un aparato no cuenta como resuelto.
- **Comprobación del orquestador:** comprobé a mano dos afirmaciones de los revisores, y las dos son ciertas:
  - el guardián de rótulos ya no mira el código actual (§Hallazgos nuevos);
  - el ajuste «movimiento reducido» lo usa el CSS, pero no lo 3D, así que L6-03 queda como **parcial**.

El detalle, con una línea de evidencia por hallazgo, está en estos anexos:

- [lentes 1-2](reverificacion/lentes-1-2.md)
- [lentes 3-8](reverificacion/lentes-3-8.md)
- [lentes 4-9](reverificacion/lentes-4-9.md)
- [lentes 5-7](reverificacion/lentes-5-7.md)
- [lentes 6-10](reverificacion/lentes-6-10.md)

## Resultado

**No es un «10 de software».** El único hallazgo alto está resuelto, pero siguen abiertos o a medias **40 de los 73 medios**.

| Veredicto | Hallazgos |
|---|---|
| Resuelto, con su prueba | 39 |
| Ya no aplica (el código desapareció o Cerro salió del producto) | 3 |
| Cerrado por decisión de Antonio (L9-01 y L9-02, decisión 219) | 2 |
| Parcial | 11 |
| Abierto | 62 |
| Aceptado en ACEPTADOS.md, **sin la firma de Antonio** | 38 |
| Decisión de Antonio aún abierta (L6-07, «Bloquear» sin deshacer) | 1 |
| **Total** | **156** |

**Por lente:**

| Lente | Resuelto | Parcial | Abierto | Aceptado (sin firma) | Otros |
|---|---|---|---|---|---|
| 1-2 Rendimiento y memoria | 14 | 2 | 7 | 0 | — |
| 3-8 Datos y mundos | 6 | 3 | 18 | 8 | 2 ya no aplica |
| 4-9 Contratos y seguridad | 7 | 2 | 10 | 1 | 1 ya no aplica, 2 decididos |
| 5-7 Modelado y VR | 8 | 1 | 8 | 9 | — |
| 6-10 Interacción y documentación | 4 | 3 (L6-03 entre ellos) | 19 | 20 | L6-07 pendiente |

El alto, **L4-01, está resuelto.** El motor (`mundos/exterior/escena-tiles.ts`, `motivoMarco`) y `tuberia/tiles3d/comprueba.mjs` rechazan un tileset con otro `centro_utm` o `z0`. Lo vigilan `escena-tiles.test.ts` y `tiles3d.test.js`.

La refactorización arregló sobre todo lo que estaba en su camino:

- la memoria y el `dispose` de los módulos (tanda 3);
- la VR robusta en el bucle (tanda 6, salvo L7-04 y L7-07);
- lo que más pesaba en el Quest (tanda 2).

Lo que no estaba en su camino sigue casi como estaba:

- las tandas 4 (datos y rótulos), 7 (interacción) y 8 (documentación);
- la ronda del banco MU0-5 (topes y memoria de GPU).

## Medios abiertos o parciales (40)

- **Medidas que no son topes (MU0-5 del PLAN, sin hacer):**
  - L1-06: los topes de `presupuesto.json` no se han recalibrado desde la auditoría.
  - L1-07: no hay tope de memoria de GPU.
  - L2-06 (parcial): `memoria_vr_chrome` sigue en `todo`.
- **Datos y rótulos (tanda 4):**
  - L3-01: el color de los olivos L1 y L2 sale sin desfase.
  - L3-02: la copa a r8 × 0,5 se rotula como medida; sigue pendiente la decisión 48/81.
  - L3-03: la nota del NDVI dice «relativo a esta parcela».
  - L3-05: la fenología lleva la fecha de lectura.
  - L3-07 (parcial): falta la cifra medida de las hectáreas.
  - L3-08: «Hoy en el campo» lleva «medido» en datos anotados.
  - L3-09: la tarjeta «Hoy en el campo» no envejece.
  - L8-01: la lluvia va anclada a `objetivo`.
  - L8-02: la cámara orbital no sabe dónde está el suelo.
  - L8-03 (parcial): la skill `mundos-virtuales` sigue citando `sol2()`.
  - L8-06: la época de los olivos generados sale del reloj del navegador.
  - L8-07: el suelo de fondo está hundido 1,5 m y su prueba lo da por bueno.
- **Contratos:**
  - L4-05: `paisaje` sin `items`.
  - L4-06: el margen del suelo se rellena por réplica del borde en `hituelo_conv.py`.
  - L4-07: `ext` en CONTRATOS.
  - L4-08 (parcial): ninguna prueba valida datos contra `olivo-generado`.
- **Seguridad:**
  - L9-06: el token de LiveKit sigue valiendo 15 min tras una expulsión. Está previsto en MU3-2.
- **VR:**
  - L7-04: la precompilación sigue sin multiview.
  - L7-07: la documentación se contradice sobre la build de VR.
- **Interacción (tanda 7):**
  - L6-01: el tamaño de texto no llega al HUD.
  - L6-02: el alto contraste borra el estado pulsado.
  - L6-03 (parcial): el ajuste de movimiento no llega a lo 3D (las máquinas solo miran el sistema).
  - L6-04: no hay teclado en la vista aérea.
  - L6-05: las cajas de voz tapan el HUD.
  - L6-06: la lista del corro roba el foco.
  - L6-08: denunciar en VR no da respuesta.
  - L6-09: la Ayuda describe la cruceta.
  - L6-10: las flechas de la historia no responden con el foco en un botón.
- **Documentación (tanda 8):**
  - L10-02: ESTADO se contradice.
  - L10-03: los textos de antes del despliegue siguen vivos.
  - L10-04: la cifra de ESTADO no aparece en MEDIDAS.
  - L10-05: líneas falsas en ESTADO.
  - L10-06: las filas P2, P3 y P5 del PLAN.
  - L10-07 (parcial): ARCHITECTURE.
  - L10-08: el README habla de «gatillo derecho».
  - L10-10: cinco estudios de un día siguen en `sistema/`.
  - L10-11: el mapa de CLAUDE.md no incluye `apps/api` ni `infra`.

## Hallazgos nuevos de la re-verificación

- **El guardián de rótulos está ciego.** `pruebas/guardianes/rotulos.test.js` busca en `apps/web/(motor|oficina)/`, y `motor/` ya no existe. La regla «ninguna cifra de olivos junto a "medido"» ya no mira `apps/web/src/`. A mano no aparece ninguna infracción, pero la promesa no tiene guardián efectivo (regla 13). Es medio. **Arreglado el mismo día:** la regla mira `apps/web/src/**/*.ts` y una prueba comprueba que entre sus fuentes hay código del cliente. Sigue sin infracciones.
- **Ajuste de movimiento contra preferencia del sistema.** Las máquinas de los interiores leen `prefers-reduced-motion` y no el ajuste «movimiento» de la aplicación (`mundos/interior/cableado.ts`, `reducido`). Forma parte de L6-03.

## Lo que necesita a Antonio

- **Firmar o rechazar los 38 aceptados** de [ACEPTADOS.md](ACEPTADOS.md). Ninguno tiene firma, así que hoy cuentan como abiertos.
- **L6-07:** decidir si «Bloquear» se puede deshacer desde el cliente o solo desde la oficina.
- **Autorizar la ronda del banco MU0-5,** la que cierra L1-06, L1-07 y L2-06, y las medidas en el Quest (tandas 2, 3 y 6), que siguen **sin probar** en aparato.

## No verificado

Todo lo que exige ejecutarse o un aparato:

- cifras de memoria, puntos, triángulos y llamadas;
- el goteo de VR;
- Quest, iPhone y lectores de pantalla;
- datos reales;
- el estado del VPS y de Vigía.

Detalle en cada anexo.
