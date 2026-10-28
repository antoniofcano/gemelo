# Estado del gemelo

Único sitio de «dónde estamos y qué falta». Se toca solo cuando el estado cambia (no en cada commit). Lo hecho se cuenta en el [CHANGELOG](../CHANGELOG.md); el rumbo, en [PLAN](rumbo/PLAN.md).

**Versión: v0.2.0** · **Al día a: 2026-10-28** · **Prototipo**: funciona en Chrome con renderizado por software y sin errores de consola; el rendimiento en iPhone y Quest **no está medido**.

## Publicado

- **Nada publicado de forma estable desde este repo.** Existe un artefacto desechable de la prueba de plataforma (privado; su enlace no se guarda en el repo público). Hay que borrarlo cuando proceda (**pide confirmación**).
- Un gemelo anterior (v20) vive como artefacto de claude.ai y no se ha tocado.

## Hecho

- Motor por teselas de 256 m con niveles de detalle: terreno (1/2/8 m), olivos (L0/L1/L2 con silueta de olivo) y nube LiDAR ([ADR-0001](adr/0001-teselas-256m-utm30.md), [ADR-0002](adr/0002-niveles-de-detalle.md)).
- Color del suelo y NDVI en el sombreador; suelo abierto con detalle de la ortofoto ([ADR-0007](adr/0007-suelo-abierto-de-la-ortofoto.md)).
- Cola de trabajos a rebanadas con presupuesto por fotograma.
- Historia parametrizada por finca: guion de 11 escenas para Cerro y de 10 para Hituelo en `14_historia.js`. **Ojo:** `hituelo_conv.py` emite `textos.sin_historia = true`, así que hoy la historia de Hituelo queda **oculta** al montar.
- Modo VR, probado solo con un mock de WebXR que no está versionado ([ADR-0005](adr/0005-webxr-perfil-propio.md)).
- Repositorio público con las fuentes unificadas y este sistema de trabajo: puerta con 85 comprobaciones (`npm run puerta`, ≈1,5 min), fixture sintético, contratos, 8 ADR y 11 skills.

## Datos

| Finca | Contenido |
|---|---|
| Cerro Velasco | 5 parcelas, 7,1 ha, ~1.080 olivos en 12 teselas |
| Hituelo | 4 fincas, 27 parcelas, 95 ha, ~5.900 olivos detectados frente a 5.961 declarados, 46 teselas |

Fuentes: LiDAR PNOA 3.ª cobertura (vuelo 2024), MDT 0,5 m, ortofoto PNOA 2022 (copas ~1,1–1,4 m al este), NDVI Sentinel-2 (48 fechas), SoilGrids. Detalle y licencias: [DATOS.md](operacion/DATOS.md).

## Sin comprobar en hardware real

- fps en iPhone y Quest; mareo y comodidad del panel VR.
- Carga de ficheros de apoyo (`fetch`, `<img>`) en el marco de artefactos **con sesión** (prueba 0 «a medias»). Si falla, Hituelo (≈52 MB de teselas) no cabe en una página: plan B en [RUNBOOK](operacion/RUNBOOK.md).
- Lecturas en vivo por MCP (OlivarTrack, Vigía): [contratos/mcp.md](../contratos/mcp.md).
- Rodadas del suelo a 0,5 m/px (salen suaves). Alternativa: ortofoto a 0,25 m solo en teselas con caminos, +~2 MB.
- Generadores y `fetch` de ficheros en Safari iOS.

## Pendiente

- **Licencia** (decisión de Antonio): hoy «todos los derechos reservados» por defecto.
- Decidir si el suelo nuevo sustituye al anterior; integrar el suelo realista en la rama de producción.
- Fundido entre niveles de olivos.
- Frutales sin marcar en Hituelo (el LiDAR no los distingue).
- Historia de Marín Hituelo (sin trabajos ni fenología en OlivarTrack).
- Tres teselas del borde norte con cobertura incompleta si faltan las hojas 404-4181 y 406-4181.
- Portabilidad de los exportadores (separadores `\` fijos).
- Recrear y versionar `mock_xr.js`: sin él, `pruebas/vr_mock.js` no se puede ejecutar desde el repo (PLAN P4).
- Borrar el artefacto desechable de la prueba de plataforma (con confirmación).
- Más: [DECISIONS-PENDING](rumbo/DECISIONS-PENDING.md).

## Riesgos

- Presupuesto de dibujo en dispositivos móviles (Hituelo de cerca llega a 1,4 M triángulos en SwiftShader: [MEDIDAS](sistema/MEDIDAS.md)).
- Cifras reales de fincas en un repo público (decisión de Antonio; ver DECISIONS-PENDING).
- Los intermedios de Cerro (`datos_cerro_embebido.json`) no se producen con ningún script del repo: regenerar Cerro desde cero no está garantizado.
