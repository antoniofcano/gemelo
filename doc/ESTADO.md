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
- Historia parametrizada por finca: 11 escenas para Cerro y 10 para Hituelo (`14_historia.js`); desde 2026-10-28 la historia de Hituelo **se muestra** (`tuberia/hituelo_conv.py` emite `sin_historia = false`; hay que regenerar `indice.json` para que llegue a una página ya exportada). Sin lectura en vivo en Hituelo.
- Suelo nuevo, más realista, integrado en `apps/web/motor/` (ADR-0007 Aceptado): relieve por bump, caminos y rodadas, hierba de cartulinas con atlas de briznas, flores y espigas.
- Modo VR ([VR.md](sistema/VR.md)), con su mock de WebXR y la prueba completa ya en el repo; probado solo con el mock ([ADR-0005](adr/0005-webxr-perfil-propio.md)).
- **Fase 0 del plan multiusuario** (2026-10-28): monorepo (`apps/web/motor/`, `tuberia/`), build con Vite y three 0.128.0, y la web empaquetada dibuja lo mismo que la salida artefacto (guardián `web.test.js`). CI escrito (`.github/workflows/puerta.yml`), **sin ejecutar** porque no se ha hecho `push`.
- **F1b** (2026-10-29): hueco del constructor de olivos-tipo (`Catalogo`, ids y tipos por árbol, contrato `olivos-tipo`); con tipo −1 los recuentos de dibujo no cambian (medido). Probado solo con el catálogo sintético en SwiftShader; los exportadores aún no emiten `copas_id`/`copas_tipo`.
- **Entorno local con Docker** (2026-10-29): web + teselas por Caddy, PostGIS, LiveKit (`--dev`) y buzón; e2e real en verde (el mundo carga con 0 errores servido desde `/teselas`). La api aún no está enchufada.
- **F1a en local** (2026-10-29): `apps/api` + `infra/` de producción + `tuberia/hazas`; 51 pruebas de la api (21 contra PostGIS en contenedor), `infra/probar-caddy.sh` y ensayo de copia/restauración con datos sintéticos en verde. **Sin desplegar**; no probados el VPS, el borde real, el SMTP de OVH, el MCP real de OlivarTrack (formas de respuesta supuestas) ni `age`/`rclone` reales ([RUNBOOK-VPS](operacion/RUNBOOK-VPS.md)).
- **F1d** (prototipo, 2026-10-29): tubería 3D Tiles 1.1 hecha y medida solo con el fixture (validador de CesiumGS sin errores; visor: lejos 2 llamadas/4,4 k tri, cerca 10/19,9 k, SwiftShader). Falta Hituelo real, integrarla en el motor (tras F1c) y Quest. ADR-0015 Propuesto.
- **Ids estables por árbol** (2026-10-29): los exportadores emiten `copas_id`/`copas_tipo`; hoy **todos los ids son provisionales** (por posición) porque las marcas de OlivarTrack no traen el id del olivo. Falta ese campo en la exportación de OlivarTrack (CONTRATOS §1.1).
- **F1c** (2026-10-29): three 0.186.1 (ADR-0016): motor en color y luz modernos; la artefacto carga three de jsDelivr con importmap. Capturas antes/después pendientes de aprobar. No probado en iPhone, Quest ni en un artefacto publicado.
- Repositorio público con las fuentes unificadas y este sistema de trabajo: puerta con 85 comprobaciones (`npm run puerta`, ≈2-3 min), fixture sintético, contratos, 8 ADR y 11 skills.

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
- Estabilizar la prueba VR completa con el mock: con SwiftShader la página se cae («Target crashed») tras ~25 pasos; es opcional en la puerta (PLAN P4).
- **Arquitectura multiusuario «Cuarenta hazas»** ([propuesta](sistema/ARQUITECTURA-MULTIUSUARIO.md), [ADR-0009](adr/0009-plataforma-multiusuario-cuarenta-hazas.md), Propuesto): estudio pendiente del agente `arquitecto-multiusuario`. Decididos: Postgres propio en Docker, VPS en OVH, `gemelo.canoydamas.es`, hazas ajenas visibles; por decidir: grabar visitas.
- Borrar el artefacto desechable de la prueba de plataforma (con confirmación).
- Más: [DECISIONS-PENDING](rumbo/DECISIONS-PENDING.md).

## Riesgos

- Presupuesto de dibujo en dispositivos móviles (Hituelo de cerca llega a 1,4 M triángulos en SwiftShader: [MEDIDAS](sistema/MEDIDAS.md)).
- Cifras reales de fincas en un repo público (decisión de Antonio; ver DECISIONS-PENDING).
- Los intermedios de Cerro (`datos_cerro_embebido.json`) no se producen con ningún script del repo: regenerar Cerro desde cero no está garantizado.
