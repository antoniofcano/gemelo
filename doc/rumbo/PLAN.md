# Plan

Mapa de iniciativas con su estado y el ADR que las sostiene. **No** es el estado del día ([ESTADO](../ESTADO.md)) ni la crónica ([CHANGELOG](../../CHANGELOG.md)). Se toca solo cuando una iniciativa cambia de estado. Leyenda: ✅ hecho · 🟨 en marcha · ⏸️ aparcado · ⬜ sin empezar · 🚫 decidido no hacerlo.

## Línea maestra: de Cerro Velasco a las fincas de Hituelo

| Tramo | Qué | Estado |
|---|---|---|
| 1 | `Mundo` con una «tesela cero» y luego teselas de 256 m | ✅ ADR-0001 |
| 2 | LOD de terreno, olivos y nube; cola con presupuesto | ✅ ADR-0002 |
| 3 | Hituelo (46 teselas, 27 parcelas), calidad Alta | ✅ ADR-0003 |
| 4 | VR con perfil propio | 🟨 hecho con mock; falta casco real · ADR-0005 |
| 5 | Medir en dispositivo real (iPhone, Quest) | ⬜ |
| 6 | Publicar con ficheros de apoyo (prueba 0 completa) | 🟨 «a medias» · ADR-0008 |

## Motor y gráficos

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| M1 | Suelo abierto con detalle de ortofoto | ✅ | ADR-0007 (Aceptado): el suelo nuevo sustituye al anterior |
| M2 | Suelo realista en la rama de producción | ✅ | integrado en `apps/web/motor/` el 2026-10-28 (04_terreno, 21_suelo); falta medir presupuesto con datos reales |
| M3 | Fundido entre niveles de olivos (dither/histéresis) | ⬜ | hoy hay «salto» al cambiar de nivel |
| M4 | LRU fina de ortofotos decodificadas | ⬜ | hoy solo se sueltan a 900 m |
| M5 | Rodadas del suelo a 0,25 m/px solo en teselas con caminos | ⏸️ | +~2 MB; esperar a ver si hace falta |
| M6 | Huecos entre teselas sin datos | ⬜ | el mundo es un mosaico, no un rectángulo |

## Datos y contenido

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| D1 | Frutales sin marcar en Hituelo | ⏸️ | el LiDAR no los distingue |
| D2 | Historia de Marín Hituelo | ⏸️ | sin trabajos ni fenología en OlivarTrack |
| D3 | Hojas 404-4181 y 406-4181 (borde norte) | ⬜ | 3 teselas con cobertura incompleta |
| D4 | Portabilidad de los exportadores | ✅ | `os.path.join` en `tuberia/`; guardián multiplataforma; sin ejecutar con datos reales fuera de Windows |
| D5 | Producir `datos_cerro_embebido.json` con un script del repo | ⬜ | hoy es un intermedio sin origen versionado |

## Proceso y calidad

| # | Iniciativa | Estado | Detalle |
|---|---|---|---|
| P1 | Sistema de trabajo: guardianes, contratos, ADR, skills | 🟨 | este andamiaje |
| P2 | Primera auditoría completa (skill `auditoria`) | ⬜ | tras estabilizar los guardianes |
| P3 | Licencia | ⬜ | decisión de Antonio |
| P4 | Estabilizar la prueba VR con el mock | 🟨 | `mock_xr.js` y `prueba_vr.js` recuperados e incluidos; la prueba completa se cae con SwiftShader tras ~25 pasos (opcional con `GEMELO_VR=1`) |
| P6 | Sustituir código casero por librerías (regla 12): ✅ validador de esquemas → `ajv`; pendiente: servidor estático de las pruebas → librería y revisar el resto | 🟨 | |
| P5 | Arquitectura multiusuario «Cuarenta hazas» | 🟨 | estudiada; plan por fases aprobado (abajo); ADR-0009 (Propuesto) |

## Multiusuario: fases (plan aprobado el 2026-10-28; decisiones de Antonio en DECISIONS-PENDING)

| Fase | Qué | Estado | Listo cuando |
|---|---|---|---|
| F0 | Monorepo + build Vite (three 0.128.0), CI de la puerta | ✅ en local (commit f32fae8); CI sin ejecutar hasta el primer push | la web dibuja lo mismo que la artefacto |
| F1a | Una persona en el VPS (solo Hituelo): api, Postgres+PostGIS, hazas propias, enlace mágico por SMTP de OVH, portada pública y resto tras sesión, ficha de haza (sin titular, sin kilos), CSP, copias | 🟡 código, contratos y pruebas en local (`apps/api`, `infra/`, ADR-0013/0014); falta desplegar en el VPS, SMTP y token de OlivarTrack | hogar de prueba entra y ve las hazas; restauración ensayada |
| F1b | Hueco del constructor de olivos-tipo: `Catalogo`, id y tipo por árbol, contrato `olivos-tipo` | ✅ en local · ADR-0012 | con `tipo=-1` se ve igual (medido); glb de fixture dentro de presupuesto |
| F1c | three moderno (0.186.1, módulos ES), aceptando el aspecto nuevo | ✅ en local · ADR-0016 · capturas pendientes de aprobar | puerta verde; capturas nuevas aprobadas por Antonio |
| F1d | Escena en 3D Tiles 1.1 + 3DTilesRendererJS (decisión 11): tubería glb + `tileset.json`, terreno, olivos, construcciones; supera ADR-0001/0002 | 🟨 prototipo de tubería con el fixture (`tuberia/tiles3d/`, ADR-0015 Propuesto); motor sin tocar, tras F1c | Hituelo en escritorio y Quest con el presupuesto medido de nuevo; Quest p95 ≤ 13,9 ms |
| F2 | Presencia compartida (LiveKit); token propio de OlivarTrack; se retira la salida artefacto | ⬜ | escritorio y Quest se ven y escriben; pose p95 < 250 ms |
| F3 | Voz y visita guiada; no se graba el directo | ⬜ | 10 personas limpias; el guía modera |
| F4 | Corresponsal de campo como PWA | ⬜ | visita con corresponsal; error de posición medido |
| F5 | Aula, puzles, dron, museo; constructor de olivos real | ⬜ | según sus ADR |
| UX | Propuesta de acceso, configuración e interacción + maqueta (`prototipos/ux/`) | 🟨 entregada, pendiente de revisión | Antonio la revisa |

**Un solo mundo (decisión 22):** el mundo multiusuario es Hituelo (un origen de coordenadas, una sala de LiveKit por visita); Cerro Velasco queda como finca de pruebas y maquetas.

**Despliegue (decisión 21):** no se despliega en el VPS hasta que haya algo funcional y probado en local: `npm run dev:arriba` con la api enchufada, el mundo cargando servido desde `/teselas`, y el recorrido completo de entrada (correo → enlace mágico en el buzón de pruebas → sesión → ficha de haza) probado de punta a punta.

Tareas sueltas decididas: ✅ anonimizar `doc/historico/DISENO-2026-10.md` (decisión 2) · ✅ exportadores multiplataforma (decisión 8, D4).

## Decidido no hacerlo (por ahora)

- 🚫 `logarithmicDepthBuffer`: se usa `near` dinámico y `far` mayor (coste en iOS sin medir **[SUPUESTO]**).
- 🚫 Binario crudo en los ficheros de apoyo: la plataforma no lo admite (ADR-0008).
