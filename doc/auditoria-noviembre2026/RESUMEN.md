# Auditoría noviembre 2026 — Resumen

**v0.2.0 · commit `4ab0ae6` · 2026-11-06.** Diez lentes, 156 hallazgos: **0 críticos, 1 alto, 73 medios, 82 bajos.** El alto está verificado contra el código por el orquestador. Nada se ha medido en ejecución (sin Chrome, sin Docker, sin dispositivo): todo hallazgo de rendimiento y memoria es lectura de código y queda pendiente de la skill `medir`.

No hay un «10 de software» porque hay un alto y 73 medios confirmables; tampoco hay un hallazgo que impida seguir usando el gemelo hoy. El problema no es un defecto grave: es que **los topes, los contratos y la documentación prometen más de lo que el código cumple**, y eso es exactamente lo que una refactorización a mundos múltiples va a tensar.

## Por lente

| Lente | Alto | Medio | Bajo | Lo esencial |
|---|---|---|---|---|
| 1 Rendimiento | 0 | 8 | 4 | Los topes de 1,4 M puntos y 1,7 M triángulos están escritos pero no se imponen; en VR la escala de olivos llega a 2,5 porque «holgado» se mide contra 16 ms a 72 Hz; la nube LiDAR se monta aunque no se vea; teselas decodificadas fuera de la Cola; topes del fixture desfasados. |
| 2 Memoria | 0 | 6 | 5 | Confirmado: 15/16/18/19/21/04d no tienen `dispose` (CLAUDE.md §5 lo promete); `Mundo` nunca suelta datos de tesela; `TilesRenderer` con LRU por defecto; nube retiene ~125 MB CPU + ~39 MB GPU (estimado); goteo por sesión VR ya medido y sin guardián activo. |
| 3 Datos | 0 | 11 | 12 | Cabecera de Cerro escrita a mano; hectáreas declaradas rotuladas como medidas; recuento de olivos «medido» que sale de detector + regla; desfase de copas no aplicado al color de L1/L2 y con tres cifras distintas; tarjeta «Hoy en el campo» congelada si falla la relectura. |
| 4 Contratos | **1** | 7 | 6 | **L4-01 (alto):** el motor no compara `centro_utm`/`z0` del tileset con el índice; la huella no lo detecta. Cabeceras Expone/Consume derivadas del texto con comentarios (496 falsos consumos, nombres cortos omitidos). Exportadores reales sin validar contra el esquema. |
| 5 Modelado | 0 | 3 | 9 | `matTronco` declarado dos veces; `construyeSombras` pierde `instSombraPA` y no libera; inventario de 19 `onBeforeCompile` + 11 `ShaderMaterial`: con `WebGPURenderer` ninguno se ejecuta y nadie avisa. |
| 6 Interacción | 0 | 10 | 13 | Tres ajustes de accesibilidad que no hacen lo que prometen (tamaño de texto, alto contraste, movimiento reducido); sin teclado en vista aérea; cajas de voz sobre el HUD; «Bloquear» a un toque sin deshacer; denuncia en VR sin respuesta. |
| 7 VR | 0 | 7 | 7 | Una excepción en el fotograma para el bucle para siempre; solo se escucha `end`; los perfiles de calidad solo bajan; precompilación sin multiview; fundido que no cubre mirador, «parcela ▶» ni teletransporte; panel que vuela tras un salto. |
| 8 Mundos | 0 | 7 | 7 | Lluvia y cámara orbital ancladas a `objetivo`; `sol2()` de la skill no existe; clima de otra fecha no rotulado; época de olivos generados con reloj del navegador. Inventario de acoplamientos al universo único (insumo de la refactorización). |
| 9 Seguridad | 0 | 3 | 6 | Sin secretos en 994 ficheros; ids de parcela de OlivarTrack e ids internos publicados (decisión de Antonio); texto de OlivarTrack en `innerHTML`; token de LiveKit válido 15 min tras expulsión; guardián de secretos con huecos. |
| 10 Documentación | 0 | 11 | 13 | ESTADO se contradice (VPS, Vigía, contadores); PLAN marca P2 hecha; ONBOARDING «única lista» con 27 de 162 guardianes; ARCHITECTURE con 51 de 89 módulos; **no existe ADR sobre interiores** y ARQUITECTURA-MULTIUSUARIO.md:128-130 contradice la propuesta de mundos múltiples. |

## Verificación del alto

**L4-01 · `04b_escena3d.js:147` y `04c_olivos_tiles.js:83-96` — confirmado.** `genera.mjs:376` escribe `centro_utm` y `z0` en `extras.gemelo`; el motor compara solo `finca_id` (04b:147) y, para los olivos, `contrato_tileset`, `id_fuente` y `huella_registro` (04c:83-96). La huella se calcula sobre `copas_id`, no sobre el centro, así que un índice reexportado con otra ventana (centro desplazado ~11 m en la reproducción del revisor) pasa todas las comprobaciones. Efecto: escena desplazada respecto a la física sin aviso. Severidad alta y no crítica porque requiere una condición realista (reexportar sin regenerar el tileset) y no rompe la carga: la rompe silenciosamente. Arreglo: comparar dos campos en 04b:147 con un `falla()`; prueba: tileset con `centro_utm` distinto al índice debe fallar.

## Hallazgos que cambian de severidad según algo que no está aquí

- **L9-01** sube a crítico si Antonio considera privado el vínculo empresa ↔ ids de parcela de OlivarTrack (polígono/parcela). Decisión suya.
- **Historial de git** (lente 9): el clon es superficial; un secreto o un dato privado en un commit anterior sería crítico. Hace falta un clon completo y `gitleaks` o `git log -p` antes de dar la lente 9 por cerrada.
- **L2-02 / L2-04** suben a alto si la medida en Quest 3 confirma que la pestaña cae por memoria.
- **L3-05 / L3-06** suben a alto con datos reales si la fenología mostrada como «del momento» tiene semanas, o si el recuento «medido» difiere del declarado en más de lo que se tolera.

## Lo que se repite entre lentes (una causa, varios síntomas)

1. **`construyeSombras` (07_follaje.js:78):** L1-08, L2-01, L5-02. Un solo arreglo cierra tres.
2. **Nube LiDAR siempre montada (05_nube.js):** L1-01, L2-02. Un interruptor por modo cierra dos y libera ~160 MB estimados.
3. **Sin `dispose` en 15/16/18/19/21/04d:** L2-05 y la base de la fase 2 del WorldManager (descargar el exterior). No es solo deuda: es el bloqueo real de los mundos múltiples.
4. **Promesa escrita que el código no cumple:** CLAUDE.md §5 (dispose), regla 2 (cabeceras), ONBOARDING (única lista), ESTADO, PLAN, ARCHITECTURE, skill `mundos-virtuales` (`sol2`), skill `modelado-3d` (sombras por nivel). La documentación del proyecto está por delante del código; eso engaña a los agentes que la leen como verdad.
5. **Topes que no son topes:** triángulos, puntos, memoria GPU, perfiles VR que solo bajan. Lo que se mide en el fixture no toca ningún regulador.

## No verificado (consolidado)

Todo lo que exige ejecución o un aparato: cifras de rendimiento y memoria (todas deducidas), Quest 3 (perfiles, multiview, foveación, mareo, memoria de pestaña), iPhone, lector de pantalla, LiveKit en vivo (token reutilizado tras expulsión, tasas), MCP en vivo (OlivarTrack, Vigía), servidor en vivo (cabeceras, `/api/interno`), historial de git, datos reales de Hituelo y Cerro, compatibilidad de Spark con three 0.187 y con super-three, el efecto visual de L4-01 y L4-06. Detalle por lente en cada `lente-N-*.md`.

## No revisado (consolidado)

`07ab_generados.js` entero, `apps/web/olivo/` (constructor), la mayor parte de `apps/api` (rutas admin, vida, hazas, agenda, juegos, medidas, config; migraciones; respaldos; CI), `prototipos/`, `tuberia/tiles3d/genera.mjs` más allá del contrato, `sesion.md` salvo constantes, los cuerpos de muchos documentos de `doc/sistema/` y `doc/operacion/`, `npm audit`, la EIPD como texto legal.

## Qué hacer con esto

`PLAN.md` ordena los arreglos por tandas (alto primero, luego lo que desbloquea la refactorización y las medidas, luego Quest, memoria, datos, seguridad, VR, interacción, documentación). `ACEPTADOS.md` propone qué bajos se aceptan por escrito y qué decisiones son de Antonio. La propuesta de arquitectura (`PROPUESTA-ARQUITECTURA.md`) se apoya en los hallazgos 3, 4 y 5 de la lista de causas y en el inventario de acoplamientos de la lente 8.
