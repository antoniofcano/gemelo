# Decisiones pendientes

Decisiones que **no puede tomar un agente**: las cierra Antonio. Las técnicas se deciden y se cuentan (CLAUDE.md §6). Al cerrar una, se convierte en ADR (skill `adr`) o se anota en el ADR que la recoge. 🟡 abierta · ✅ cerrada.

## De un vistazo

| Abierta | Bloquea | Quién la cierra |
|---|---|---|
| VPS (V1): producto de correo de OVH y buzón del gemelo; DKIM/DMARC/SPF compartido; token de OlivarTrack (alcance, caducidad, IP, URL del MCP); desplegar primero con `GEMELO_OT=no`; Caddy de borde de Oficultor (quién, recarga, ventana, webs vecinas); DNS de `gemelo.canoydamas.es`; ruta en el VPS y dónde se construye la imagen; destino de las copias y custodia de la clave `age` (detalle en RUNBOOK-VPS) | V2 (desplegar) | Antonio |
| Marca: si «Cuarenta hazas» es el nombre que ve la gente (aplazada, decisión 44) | portada, correos y pestaña antes de abrir a gente real | Antonio |
| Medir 10 olivos en campo con cinta (plantilla de `tuberia/factores_campo.py`) | paso a `factorR8 = 1` (decisión 48) y factores reales de la tubería (49) | Antonio, en campo |

## Cerradas el 2026-10-28 (Antonio, de una en una)

| # | Decisión | Respuesta | Dónde queda |
|---|---|---|---|
| 1 | Licencia | **Todos los derechos reservados** (repo público, sin licencia libre) | README; no se crea `LICENSE` |
| 2 | Cifras reales e id interno en `doc/historico/DISENO-2026-10.md` | **Anonimizar** (quitar el id interno y nombres que no hagan falta; dejar cifras agregadas) | ✅ hecho (bb52d50) |
| 3 | Suelo nuevo frente al anterior | **El nuevo** | ADR-0007 |
| 4 | Qué se publica antes del servidor | **Nada hasta F1a** | PUBLICACION |
| 5 | Ramas | **`main`** | CLAUDE.md §6 |
| 6 | Versión inicial | **0.2.0**; la 1.0.0 cuando F1a esté desplegada y usada | VERSION |
| 7 | Artefacto desechable de la prueba 0 | **Conservarlo** hasta retirar la salida artefacto (F2) | ESTADO |
| 8 | Exportadores multiplataforma | **Sí, ahora** | ✅ hecho (2302e88) |
| 9 | Historia de Hituelo | **Se muestra** | `tuberia/hituelo_conv.py` |
| 10 | Grabar visitas guiadas | **No se graba el directo**; como mucho clips cortos revisados por la oficina antes de publicar | ADR-0009, fase 3 |
| 11 | Arquitectura multiusuario (ADR-0009) | **Aceptada, con 3D Tiles 1.1 + 3DTilesRendererJS para la escena** (en contra de la recomendación del estudio, que proponía conservar las teselas propias) | ADR-0009, PLAN |
| 12 | Qué es una haza y quién la asigna | **Tabla propia** (zona dibujada que abarca una o varias parcelas de OlivarTrack, o un trozo); **la asigna la oficina** | ADR-0009, fase 1a |
| 13 | Qué se ve de una haza ajena | **Sin titular, con alias opcional** del hogar; datos **agronómicos sin kilos** (superficie, olivos con fuente, tratamientos, analíticas, fenología, avance %, NDVI relativo) | ADR-0009, fase 1a |
| 14 | Recuento de olivos y fincas | **LiDAR (medido) + declarado al lado**, cada uno con su fuente; **solo Hituelo** en F1a | ADR-0009, fase 1a |
| 15 | Correo del enlace mágico | **SMTP de OVH** (dominio canoydamas.es) | ADR-0009, fase 1a |
| 16 | Qué se ve sin sesión | **Solo la portada**; mundo, hazas y datos tras sesión | ADR-0009, fase 1a |
| 17 | Token de lectura de OlivarTrack | **Token propio** de solo lectura para el gemelo (cambio pequeño en OlivarTrack) | fase 2 |
| 18 | Cambio visual al subir three | **Aceptar el aspecto nuevo** (color y luz modernos, recalibrado a ojo) | fase 1c |
| 19 | Corresponsal de campo | **La misma web como PWA** (Wake Lock) | fase 4 |
| 20 | Salida artefacto | **Se mantiene hasta la fase 2** y luego se retira | ADR-0010 |
| 21 | **Cuándo desplegar en el VPS** | ahora / cuando haya algo funcional y probado en local | despliegue de F1a en OVH | ✅ 2026-10-29: **nada en el VPS hasta tener algo funcional y probado en local** (entorno `infra/dev` con la api enchufada, el mundo cargando y el recorrido de entrada completo) |
| 22 | **Uno o varios mundos** | sala por finca / mundo común de la explotación / un solo mundo | F2 (salas y origen de coordenadas) | ✅ 2026-10-29: **un único mundo: Hituelo.** Cerro Velasco, por pequeño, queda para pruebas iniciales y maquetas manejables |
| 23 | **Aspecto nuevo de three 0.186.1** (F1c) | aceptar / ajustar | cierre de F1c | ✅ 2026-10-29: **aceptado**; la luz de la tarde, más clara, **se deja así** (se recalibrará con datos reales de Hituelo) |
| 24 | **Relieve fino del suelo** (ahora sí se aplica) | mantener / apagar / solo escritorio | coste en Quest | ✅ 2026-10-29: **se mantiene y en VR se apaga** en cuanto el perfil baja por fotograma justo (`VR_PERFILES[].b`) |
| 25 | **CDN de three en la salida artefacto** | jsDelivr / cdnjs / incrustado | salida artefacto | ✅ 2026-10-29: **jsDelivr** (módulo, misma versión exacta que la web) |
| 26 | **Constructor · nivel 0 actual dentro del radio del generador/variantes** | apagar / rehacer celdas / interruptor | P7 del constructor | ✅ 2026-10-29: **se apaga ahí**; fuera, todo como hoy |
| 27 | **Constructor · presupuesto cercano** | K por presupuesto / K fijo / subir TOPE_TRI | P7 | ✅ 2026-10-29: **K según presupuesto** (E0 solo el más cercano, el resto E1), siempre dentro de los topes |
| 28 | **Constructor · media distancia** | variantes hasta donde quepan / E3 nuevo / impostores | P7 | ✅ 2026-10-29: **variantes E2 (E2-VR en gafas) mientras quepan**; después el nivel 1 actual |
| 29 | **Constructor · madera fina** | metadato con olivo-2 intacto / dos mallas y olivo-3 | P3 | ✅ 2026-10-29: **metadato aparte, olivo-2 intacto** (huellas sin cambios) |
| 30 | **Constructor · texturas (3 fotos de campo)** | en el repo con licencia / fuera como datos / solo dibujadas | P3 | ✅ 2026-10-29: **en el repo, con licencia de Antonio** (todos los derechos reservados, como el código) |
| 31 | **Constructor · posición del tronco** | puntos bajos→marca corregida→asim 0 / siempre la marca / sin asimetría | P6 | ✅ 2026-10-29: **puntos LiDAR bajos (0,3–1,2 m); si no, la marca de OlivarTrack corregida del desfase; si no, asimetría 0** |
| 32 | **Constructor · dónde se calculan los parámetros** | tubería Python / motor | P6 | ✅ 2026-10-29: **en la tubería Python** (columna `copas_param`) |
| 33 | **Constructor · orden respecto a F1c** | antes / después | P7 | ✅ 2026-10-29: **F1c ya está en main**: el enganche va sobre three 0.186.1 |
| 34 | **Constructor · rótulo del olivo generado** | ilustrativo + provisional / solo ilustrativo / sin rótulo | P7 | ✅ 2026-10-29: **«forma ilustrativa con medidas del LiDAR»** y, mientras el id no venga del censo, **«id provisional»** |
| 35 | **F1d · cuándo se acepta ADR-0015** | criterios locales / esperar al Quest | cierre de F1d | ✅ 2026-10-29: **con los criterios 1–4 en local**; Quest (5–6) queda **no probado** hasta medirlo |
| 36 | **F1d · construcciones en el tileset** | ya / más adelante | F1d | ✅ 2026-10-29: **más adelante**; F1d solo mueve terreno y olivos, `18_paisaje.js` sigue igual |
| 37 | **F1d · nube LiDAR** | sigue en el motor / al tileset | F1d | ✅ 2026-10-29: **sigue en el motor** (`05_nube.js`) |
| 38 | **F1d · doble descarga glb + json** | aceptar / leer el glb en CPU | F1d | ✅ 2026-10-29: **se acepta por ahora**; se mide (sin cifra aún) y se recorta el json cuando la escena nueva sea la de por defecto |
| 39 | **F2 · sala de la visita libre** | sala fija / sala por día | F2 | ✅ 2026-10-29: **una sala fija de Hituelo**; las guiadas, sala por visita |
| 40 | **F2 · conservación del chat** | no se guarda / 30 días / indefinido | F2 | ✅ 2026-10-29: **no se guarda**; solo las preguntas sobre una haza, en su tabla |
| 41 | **F2 · EIPD ampliada** | antes de F2 con gente real / con F3 | F2–F3 | ✅ 2026-10-29: **una sola EIPD con F3 (voz)**; hasta entonces F2 solo con cuentas de prueba |
| 42 | **F2 · moderación** | mínima en F2 / toda en F3 / completa en F2 | F2 | ✅ 2026-10-29: **mínima en F2** (expulsar desde el servidor, con auditoría); rol de guía completo en F3 |
| 43 | **Maqueta de UX** (`prototipos/ux/`, `doc/sistema/UX.md`) | aprobada / con cambios / rehacer | F1a y F2 | ✅ 2026-10-29: **aprobada como base**; UX.md es la guía de diseño |
| 44 | **Marca** («Cuarenta hazas» producto o interno) | producto / interno / aplazar | portada y correos | 🟡 2026-10-29: **aplazada**; nombre provisional hasta antes de abrir a gente real |
| 45 | **Perfiles de menores** | no / sin chat ni voz / con voz en guiadas | primer acceso, voz | ✅ 2026-10-29: **no por ahora**; solo cuentas adultas; se reabre con asesoría junto a la EIPD de F3 |
| 46 | **Vincular las gafas** | código corto / enlace mágico / las dos | acceso en Quest | ✅ 2026-10-29: **código corto** (5 min) aprobado desde un dispositivo con sesión |
| 47 | **Hablar en Quest** | grip derecho provisional / definitivo / botón del panel | F3 | ✅ 2026-10-29: **grip derecho provisional**; se decide al probarlo en casco (no probado) |
| 48 | **Constructor · r8 (radio dibujado de la copa)** | pasar a 1 tras medir en campo / pasar a 1 ya / quedarse en 0,5 | copas del motor y P7 | ✅ 2026-10-29: **r8 es radio** (Cerro: CHM da 1,33 × r8, la ortofoto marca el borde en r8, 0,2 % de solapes con factor 1; anexo de ADR-0017). **Se pasa a `factorR8 = 1` cuando la cinta de campo** (10 olivos, `tuberia/factores_campo.py`) dé copa ≈ 2 × r8; antes se rehace la copa del nivel 0, se repite el coste con la escala adaptativa fija y se cambia el GLOSARIO. Hasta entonces, 0,5 |
| 49 | **Constructor · sesgo de la medida** | en el generador / en la tubería / no | `copas_param` | ✅ 2026-10-29: **en la tubería, con factores a 1,0**; los 1,16/1,20 del simulador no se aplican a datos reales. Plantilla de campo (10 olivos: altura y copa con cinta en dos direcciones, id provisional y posición) y script que saca los factores reales |
| 50 | **Constructor · semilla con id provisional** | aceptar cambio / guardar semilla | censo de OlivarTrack | ✅ 2026-10-29: **la semilla se guarda** en el registro del árbol al asignarse; al llegar el censo, cada id provisional pasa su semilla al olivo más cercano. Solo un cambio de `GEN_VERSION` cambia la forma, y queda escrito |
| 51 | **Constructor · ids de tipo** | prefijo / rangos | catálogos | ✅ 2026-10-29: **nombre propio de catálogo, sin versión** (p. ej. `olivos:centenario-3p`); `GEN_VERSION` aparte. En el tileset, `_TIPO` es número local con tabla número → nombre en `extras.gemelo`. El tipo 0 de pruebas, solo en el fixture |
| 52 | **Constructor · coste por árbol** | fusionar (olivo-3) / limitar K | P7 | ✅ 2026-10-29: **ni lo uno ni lo otro**: forma intacta (olivo-2) y fusión en la capa de dibujo, una `BatchedMesh` por material compartida por todos los árboles cercanos (instancias para ramitas y olivas), objetivo ~6–7 llamadas en total; límite de árboles generados por presupuesto de triángulos del aparato (550 k escritorio, perfil VRP en gafas); `renderer.info` antes y después |
| 53 | **F1a · Referrer-Policy de producción** | `strict-origin-when-cross-origin` / portada con `fetch` | portada | ✅ 2026-10-29: **`strict-origin-when-cross-origin`** en `infra/Caddyfile`, como en dev |
| 54 | **F1a · certificado en local** | aviso de la CA de Caddy / mkcert | entorno local | ✅ 2026-10-29: **se acepta el aviso**, sin instalar nada (en el Quest saldría igual) |
| 55 | **F1a · usuario de la base en local** | dueño / mínimos como producción | entorno local | ✅ 2026-10-29: **el mismo usuario de permisos mínimos que en producción** (`gemelo_api`) |
| 56 | **F1a · dónde vive la portada** | `apps/web` / app aparte | portada y entrada | ✅ 2026-10-29: **`apps/web`**: portada y mundo, la misma web |
| 57 | **Primera prueba en aparatos** (navegador, móvil, Quest) | cada uno por su cuenta / viéndose entre sí | prueba en hardware real | ✅ 2026-10-29: **cada aparato por su cuenta** en Hituelo real con los olivos generados; verse entre sí (F2 con LiveKit), en una segunda prueba |
| 58 | **Acceso de móvil y gafas al entorno local** | WiFi solo durante la prueba / túnel / adb | prueba en aparatos | ✅ 2026-10-29: **por la WiFi, solo durante la prueba** (interruptor `--red-local`, solo la web por https); sin él, todo en 127.0.0.1 |
| 59 | **Constructor · three propia (0.128) para calcular el árbol** | dejarla / pasar el cálculo a 0.186 (olivo-3) | P7 | ✅ 2026-10-29: **se deja**: el cálculo con su three 0.128 (mismo árbol que «Olivos tipo», 273 huellas) y el dibujo con la 0.186 del gemelo |
| 60 | **F2 · quien está en órbita (vista aérea)** | no se ve, sale en «Gente» / avatar en el punto mirado / avatar en su cámara | F2 | ✅ 2026-10-29: **sin avatar en el mundo**; el panel Gente lo lista «en vista aérea» y aparece al bajar a pasear. Técnicas (decididas por el agente, contadas): sala libre `hituelo-libre`; cercanía 55/65 m; durante un despliegue cada versión ve solo a la suya (vale con cuentas de prueba) |
| 61 | **Entrar en las Quest para la prueba en aparatos** | código corto ya / `dev:enlace` con QR / `adb reverse` | prueba en aparatos (decisión 57) | ✅ 2026-10-29: **construir ya el código corto** de la decisión 46 (sirve para la prueba y para el producto) |
| 62 | **Olivos generados: dónde se calculan** | en cada aparato / horneados por tesela en el servidor | O5-O7, VPS | ✅ 2026-10-29: **horneados en el servidor** («hornero»): todos los olivos en todos sus niveles, ocupe lo que ocupe en disco, con **la época actual y la siguiente**; recalcula solo lo que cambia (época, vuelo nuevo/`copas_param`, censo, `GEN_VERSION`); recetas direccionadas por su huella (inmutables) y un manifiesto por tesela; el aparato solo descarga lo cercano según la caché (O5). En la salida artefacto, plan B: cálculo en el navegador. Formato según la medida O6; ADR-0018 |
| 63 | **Hornero: qué se hornea** (corrige la 62 tras la medida O6) | mixto / todo horneado / todo en el aparato | O7, VPS | ✅ 2026-10-29: **mixto**: el servidor hornea las **variantes compartidas E2 y E2-VR** (pocas, bajan una vez y quedan en caché), con la época actual y la siguiente; el aparato **calcula los ~6 propios cercanos (E0/E1)** con la caché de O5; con buena conexión puede bajar también propios horneados. Motivo: hornear cada olivo cercano obligaba a bajar 78–555 MB por paseo de 500 m (O6, MEDIDAS). Brotli 9 en el día a día; ADR-0018 |
| 64 | **Hornero: fechas de cada época** | calendario fijo ajustable / fenología de OlivarTrack / mixto | O7c, O7f | ✅ 2026-10-29: **calendario fijo en el repo, ajustable por Antonio**; OlivarTrack, más adelante |
| 65 | **ADR-0018 (hornero mixto)** | aceptar / propuesto hasta medir | O7 | ✅ 2026-10-29: **aceptado**; las cifras estimadas se confirman en O7g/O7h |
