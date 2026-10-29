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
| P2 | Primera auditoría completa (skill `auditoria`) | ✅ código y pruebas de Node; dos navegadores, en P4 | tras estabilizar los guardianes |
| P3 | Licencia | ✅ chat en el motor, expulsión en la api; integración sin ejecutar | decisión de Antonio |
| P4 | Estabilizar la prueba VR con el mock | 🟨 | `mock_xr.js` y `prueba_vr.js` recuperados e incluidos; la prueba completa se cae con SwiftShader tras ~25 pasos (opcional con `GEMELO_VR=1`) |
| P6 | Sustituir código casero por librerías (regla 12): ✅ validador de esquemas → `ajv`; pendiente: servidor estático de las pruebas → librería y revisar el resto | 🟨 | |
| P5 | Arquitectura multiusuario «Cuarenta hazas» | 🟨 | estudiada; plan por fases aprobado (abajo); ADR-0009 (Propuesto) |

## Multiusuario: fases (plan aprobado el 2026-10-28; decisiones de Antonio en DECISIONS-PENDING)

| Fase | Qué | Estado | Listo cuando |
|---|---|---|---|
| F0 | Monorepo + build Vite (three 0.128.0), CI de la puerta | ✅ en local (commit f32fae8); CI sin ejecutar hasta el primer push | la web dibuja lo mismo que la artefacto |
| F1a | Una persona en el VPS (solo Hituelo): api, Postgres+PostGIS, hazas propias, enlace mágico por SMTP de OVH, portada pública y resto tras sesión, ficha de haza (sin titular, sin kilos), CSP, copias | 🟡 probado en local de punta a punta (api enchufada en `infra/dev`, e2e del recorrido de entrada); roles de producción y `--red-local` (prueba en aparatos pendiente, decisión 57); siguiente: portada y entrada de la UX y lindes en el mundo; después (decisión 21) VPS, SMTP y token de OlivarTrack | hogar de prueba entra y ve las hazas; restauración ensayada |
| F1b | Hueco del constructor de olivos-tipo: `Catalogo`, id y tipo por árbol, contrato `olivos-tipo` | ✅ en local · ADR-0012 | con `tipo=-1` se ve igual (medido); glb de fixture dentro de presupuesto |
| F1c | three moderno (0.186.1, módulos ES), aceptando el aspecto nuevo | ✅ en local · ADR-0016 · aspecto aprobado (decisiones 23-25) | puerta verde; capturas nuevas aprobadas por Antonio |
| F1d | Escena en 3D Tiles 1.1 + 3DTilesRendererJS (decisión 11): tubería glb + `tileset.json`, terreno, olivos, construcciones; supera ADR-0001/0002 | 🟨 tubería con Hituelo real validada (0.2.0: 269 glb, 40,9 MB); paso 3a hecho (0.3.0, tileset v2: raíz sin contenido, 248 glb calculados, nombres de tipo reales), Hituelo por regenerar; ADR-0015 Propuesto, criterio 1 hecho; motor sin tocar (paso 3); plan del motor hecho (bandera `?escena=tiles`, decisiones 35–38) | Hituelo en escritorio y Quest con el presupuesto medido de nuevo; Quest p95 ≤ 13,9 ms |
| F2 | Presencia compartida (LiveKit); token propio de OlivarTrack; se retira la salida artefacto | 🟡 en curso: contrato de pose y roles, códec, interpolación y avatares simulados hechos (sin red; decisiones 39–42, solo cuentas de prueba hasta la EIPD de F3); falta LiveKit (cliente y tokens), pose local y chat | escritorio y Quest se ven y escriben; pose p95 < 250 ms |
| F3 | Voz y visita guiada; no se graba el directo | ⬜ | 10 personas limpias; el guía modera |
| F4 | Corresponsal de campo como PWA | ⬜ | visita con corresponsal; error de posición medido |
| F5 | Aula, puzles, dron, museo; constructor de olivos real | ⬜ | según sus ADR |
| UX | Propuesta de acceso, configuración e interacción + maqueta (`prototipos/ux/`) | ✅ aprobada como base (decisiones 43–47); marca aplazada | se construye en F1a (portada, entrada, código corto de las Quest) y F2 |
| Olivos generados | Constructor «olivo-2» como módulo (`apps/web/olivo/`, ADR-0017 Propuesto): un árbol por olivo con semilla guardada y medidas del LiDAR (`copas_param`) | 🟡 en main: P2–P7 (`?olivos=gen`, lote de 6-7 llamadas) y `copas_param` de Hituelo desde las LAZ; falta reexportar Hituelo con `copas_id`, cargarlo con `copas_param` y probar en aparatos; desglosar el coste de `factorR8 = 1` | olivos generados en Hituelo real dentro del presupuesto de cada aparato; `factorR8 = 1` tras la cinta de campo (decisión 48) |

**Un solo mundo (decisión 22):** el mundo multiusuario es Hituelo (un origen de coordenadas, una sala de LiveKit por visita); Cerro Velasco queda como finca de pruebas y maquetas.

**Despliegue (decisión 21):** no se despliega en el VPS hasta que haya algo funcional y probado en local: `npm run dev:arriba` con la api enchufada, el mundo cargando servido desde `/teselas`, y el recorrido completo de entrada (correo → enlace mágico en el buzón de pruebas → sesión → ficha de haza) probado de punta a punta.

Tareas sueltas decididas: ✅ anonimizar `doc/historico/DISENO-2026-10.md` (decisión 2) · ✅ exportadores multiplataforma (decisión 8, D4).

## Tablero de tareas (desde el 2026-10-29)

Las fases, partidas en tareas con sus dependencias. **Orden de lanzamiento:** primero las ligeras que desbloquean a otras, en paralelo; lo que pasa por Chrome o Docker (🔶), al final y por el [banco de pruebas](../operacion/TESTING.md#banco-de-pruebas-un-solo-chrome-o-docker-a-la-vez-política-desde-el-2026-10-29); 👤 = lo hace Antonio. Estado: ✅ hecho · 🟡 en curso · ⬜ por hacer.

| Id | Tarea | Depende de | Tipo | Estado |
|---|---|---|---|---|
| D1 | Hituelo v3: `copas_id`, `copas_tipo`, `copas_semilla`, `copas_param` (fuera del repo) | — | ligera | ✅ (salida de referencia de Hituelo) |
| A1 | Código corto para vincular las gafas: api, contrato y pruebas unitarias | — | ligera | ✅ (e2e con Docker en verde) |
| A2 | Portada y pantalla de entrada (UX) en `apps/web` | — | ligera | ✅ (e2e con Docker en verde) |
| A3 | Entorno local sirve Hituelo v3 con los olivos generados (cliente web con `gemelo-olivo`) | D1 | ligera | 🟡 en curso |
| A4 | Lindes de las hazas en el motor (el «3c») | — | ligera; 🔶 al medir | 🟡 código y pruebas de Node en main; medida encargada |
| A5 | e2e de entrada completa: portada → enlace → mundo con lindes; gafas → código → sesión | A1, A2, A4 | 🔶 Docker | ⬜ |
| A6 | **Prueba en aparatos** (navegador, móvil, Quest; decisión 57) | A1, A2, A3 | 👤 | ⬜ |
| T1 | F1d 3b: terreno 3D Tiles en el motor (`04b_escena3d.js`, `?escena=tiles`), código | — | ligera | ✅ en main (sin medir: T3) |
| T2 | Tileset de Hituelo regenerado con el generador 0.3.0 desde D1 | D1 | pesada de CPU, sin Chrome (72 s) | ✅ 248 glb, 0 errores |
| T3 | F1d 3b: medir con el fixture y con Hituelo; raíz vacía visible de lejos | T1, T2 | 🔶 | 🟡 raíz vacía y relieve comprobados con el fixture (`escena3d.test.js`); Hituelo encargado al banco |
| T4 | F1d 4: olivos del tileset con máscara (de cerca, los del motor y los generados) | T1 | ligera; 🔶 al medir | 🟡 código en main; medida encargada |
| T5 | F1d 5: sombreado (nubes, escarcha, NDVI, suelo) sobre el tileset | T1 | ligera; capturas 🔶 → 👤 | 🟡 código en main; capturas encargadas (NDVI y Ortofoto, a mano) |
| T6 | F1d 6-7: presupuesto y VR con el simulador | T3, T4, T5 | 🔶 | ⬜ |
| T7 | F1d 8: Quest real (p95 ≤ 13,9 ms) | T6 | 👤 | ⬜ |
| T8 | F1d 9: la escena nueva por defecto; se retira la vieja | T6 (T7 o «no probado», decisión 35) | ligera | ⬜ |
| P1 | F2: la api firma tokens de LiveKit (`POST /api/presencia/token`, `livekit-server-sdk`, roles del contrato) | — | ligera | ✅ |
| P2 | F2: el motor publica y recibe la pose con `livekit-client` (sustituye a la red simulada) | P1 | ligera | ⬜ |
| P3 | F2: chat por el canal de datos y moderación mínima (expulsar con auditoría, decisión 42) | P1 | ligera | ⬜ |
| P4 | F2: dos Chrome en la misma sala (p95 < 250 ms) y 40 clientes ligeros | P2, P3 | 🔶 Docker + Chrome | 🟡 en curso |
| O1 | Olivos generados: transición suave al acercarse (forma y luz; materiales con nubes y escarcha del motor) | — | ligera; 🔶 al medir | 🟡 código en main; medida encargada |
| O2 | Olivos generados: desglose del coste de `factorR8 = 1` por objeto | — | 🔶 | ⬜ |
| O3 | `semillas_copas.py` dentro de los exportadores | — | ligera | ✅ |
| O4 | Medir 10 olivos en campo con cinta (decisiones 48-49) | — | 👤 | ⬜ |
| V1 | VPS: preparar el despliegue (RUNBOOK-VPS al día, SMTP de OVH, token de OlivarTrack, comprobaciones previas) | — | ligera (documentos y guiones) | ✅ (8 preguntas a Antonio en DECISIONS-PENDING) |
| V2 | VPS: desplegar F1a | A5, A6, V1 (decisión 21) | 👤 confirma cada paso | ⬜ |
| G1 | Arreglar la facturación de GitHub para que corra el CI | — | 👤 | ⬜ |

## Decidido no hacerlo (por ahora)

- 🚫 `logarithmicDepthBuffer`: se usa `near` dinámico y `far` mayor (coste en iOS sin medir **[SUPUESTO]**).
- 🚫 Binario crudo en los ficheros de apoyo: la plataforma no lo admite (ADR-0008).
