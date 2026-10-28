# Cuarenta hazas · Arquitectura multiusuario

> **Estado: propuesta (28-oct-2026), aún sin implementar y sin contrastar con el motor actual.** Texto recibido de Antonio tal cual (con los formatos de tabla adaptados) y sus respuestas a las decisiones abiertas al final. Es el documento que da sentido al proyecto: lo que hoy hay en `apps/web/motor/` es la **fase 1** de esta visión. El contraste con el repo lo hace el agente [`arquitecto-multiusuario`](../../.claude/agents/arquitecto-multiusuario.md); la decisión queda en [ADR-0009](../adr/0009-plataforma-multiusuario-cuarenta-hazas.md). Las cifras y los datos externos (LiveKit, 3D Tiles, WebXR en móviles, normativa) son afirmaciones del documento **sin verificar** por este repo.

## Resumen

Propuesta: una sola aplicación web para los tres dispositivos, LiveKit como única pieza de tiempo real, y OlivarTrack como fuente de verdad detrás de una proyección pública por haza. Todo corre en un VPS europeo con Docker Compose, sobre PostgreSQL + PostGIS; ninguna app de tienda.

- **Escritorio y Quest abren la misma URL.** three.js pinta la escena; en el navegador de las Quest, WebXR la vuelve inmersiva con un botón. Sin build nativo ni Meta Store.
- **El móvil de campo es la misma web en «modo corresponsal».** Publica su GPS, su rumbo y la cámara; en el mundo aparece como un avatar más con una pantalla flotante de vídeo en directo.
- **Voz, vídeo y posiciones viajan por LiveKit**, un servidor WebRTC de código abierto. Con unos 40 hogares cabe todo en una sala por visita; no hace falta servidor de juego aparte hasta que haya puzles con estado compartido.
- **Los hogares nunca tocan la base de datos de OlivarTrack.** Leen una proyección por haza que publica una Cloud Function, el mismo patrón que Mirador hacia los arrendadores.

Lo que se paga por esta sencillez: el móvil no hace realidad aumentada (WebXR AR no existe en iPhone y en Android es inmaduro), así que en campo es mapa 2D + vídeo, no superposición sobre la cámara.

## Los tres clientes

Un solo código web con tres modos; el dispositivo decide el modo al entrar.

| Cliente | Cómo entra | Qué ve | Qué publica | Límite a vigilar |
| --- | --- | --- | --- | --- |
| Escritorio | Cualquier navegador moderno | Escena 3D con ratón y teclado; paneles de su haza | Posición, avatar, chat, voz si activa el micro | Ninguno serio |
| Meta Quest | Navegador de Quest → botón «Entrar en VR» (WebXR) | Inmersivo con mandos o manos | Cabeza y dos manos, voz | 72 fps: pocas llamadas de dibujo, LOD, texto grande |
| Móvil de campo (personal) | La web instalada como PWA en Android | Mapa 2D de la haza con los avatares que tiene cerca, voz y chat | GPS, rumbo de la brújula, cámara trasera, voz | Cobertura 4G, batería, pantalla encendida, GPS bajo copa |
| Móvil del hogar | La misma web en el navegador | 3D táctil, sin VR | Posición, avatar, chat | Móviles antiguos: bajar calidad |

El corresponsal de campo es siempre personal de la explotación y va con Android, como ya se decidió en OlivarTrack; un XCover7 sirve.

## Piezas del sistema

*(El original incluía un diagrama: «arquitectura · 3 clientes, 4 contenedores».)* Todo el tráfico web entra por Caddy; solo el audio y el vídeo van directos a LiveKit por UDP. La api lee OlivarTrack por su MCP con una credencial de solo lectura; nada del VPS puede escribir en él.

## Tiempo real: presencia, voz y vídeo

Una sala de LiveKit por visita (guiada o libre) lleva las tres cosas; no hay un segundo servidor de tiempo real.

- **Presencia.** Cada cliente envía su pose 10 veces por segundo por el canal de datos de LiveKit: posición y giro en escritorio y móvil; cabeza y dos manos en Quest. Mensajes binarios pequeños; los demás interpolan para que el movimiento no salte.
- **Avatares.** El aspecto (estilo bloque, nombre elegido) se guarda en Postgres y se manda una vez al entrar, no en cada mensaje.
- **Voz.** Pistas de audio WebRTC con audio espacial en el navegador (Web Audio, un panner por avatar): oyes más fuerte a quien tienes al lado. En visitas grandes, el cliente se suscribe solo a las voces cercanas.
- **Vídeo de campo.** El móvil publica una pista de vídeo; los visores la pintan como textura en una pantalla flotante sobre el avatar del corresponsal. LiveKit adapta la calidad a la subida 4G que haya.
- **Chat.** Mensajes de texto por el mismo canal de datos; los que deban quedar (preguntas sobre la haza) los guarda la api en Postgres.

Cuándo añadir un servidor de estado (Colyseus o similar): cuando haya puzles o aula con reglas que alguien deba arbitrar. Hasta entonces sería una pieza más sin trabajo.

## Del campo al mundo

El corresponsal aparece en el mundo donde está físicamente, con la escena y el GPS en el mismo sistema de coordenadas.

1. **Un origen fijo para la finca.** La escena trabaja en metros locales (este-norte-arriba) desde un punto de referencia de la explotación. Hazas, olivos (las 6.156 coordenadas del conteo) y el terreno se proyectan a ese sistema una vez, al construir la escena.
2. **GPS a escena.** El móvil convierte cada lectura con la misma fórmula y la manda por el canal de datos. La brújula da el rumbo; con él se dibuja un cono de visión que indica hacia dónde apunta la cámara.
3. **Precisión.** Bajo copa el GPS del móvil puede errar varios metros, y en marco tradicional hay unos 10-13 m entre olivos. Suavizado de la posición y, opcionalmente, «imán» al olivo más cercano cuando el corresponsal se para delante de uno.
4. **Vídeo.** Cámara trasera a 720p como techo; LiveKit baja a 360p si la cobertura cae. Wake Lock para que la pantalla no se apague y aviso de batería en la PWA.
5. **Sin cobertura.** Si no hay subida suficiente, el móvil graba un clip corto y lo sube después, ligado a la haza y la fecha, como registro de trazabilidad en lugar de directo.

Queda fuera a propósito: superponer avatares sobre la imagen de la cámara (AR). Es lo vistoso, pero en web solo funciona en parte de Android y multiplica el trabajo.

## Datos y base de datos

Recomendación: PostgreSQL con PostGIS en un contenedor, más una api pequeña propia. Las hazas y los olivos son geometría, y PostGIS los responde de forma nativa («qué olivos caen en esta haza», «qué haza tengo debajo»).

| Opción | Qué te da | Qué cuesta | Encaje |
| --- | --- | --- | --- |
| **PostgreSQL + PostGIS + api propia** | Un contenedor de base de datos; geometría nativa; control total | La autenticación la pones tú, con una librería (enlace mágico por correo) dentro de la api | Recomendada: menos piezas |
| Supabase autoalojado | Auth, almacenamiento de ficheros, permisos por fila, panel Studio | Una docena de contenedores, más RAM y actualizaciones delicadas | Solo si quieres el panel y la auth hechos |
| Supabase en la nube + VPS solo para LiveKit | Lo mismo sin mantenerlo | Otro proveedor y otra factura; datos fuera de tu VPS | Bueno para arrancar rápido |
| SQLite | Un fichero, cero mantenimiento | Geometría más pobre (SpatiaLite) y un solo escritor | Suficiente para un prototipo, corto para publicar |

Tablas de partida: `hogares`, `hazas` (polígono), `olivos` (punto, haza, volumen de copa), `eventos_haza` (tratamientos y análisis tal como llegan de OlivarTrack), `preguntas`, `clips`, `avatares`, `visitas`.

**Conexión con OlivarTrack: por su MCP, con dos usos distintos.**

- **Sincronía.** Un proceso programado de la api actúa como cliente MCP y llama a las herramientas de lectura (parcelas, insumos aplicados, pases, analíticas) para cada haza. Guarda lo recibido en `eventos_haza` con clave natural, así que repetir la lectura no duplica.
- **Preguntas de los hogares.** «¿Qué le echasteis a mi haza en mayo?» Aquí MCP encaja de lleno: un agente en la api consulta OlivarTrack y responde con explicación educativa.
- **Punto débil.** Las herramientas MCP devuelven respuestas pensadas para un modelo de lenguaje. Si devuelven texto y no JSON estructurado, la sincronía será frágil. Conviene que las de lectura den también una salida estructurada con esquema fijo.
- **Seguridad.** El MCP de OlivarTrack tiene herramientas de escritura (registrar entrega, proponer tarea, anotar observación). El VPS debe entrar con una credencial que solo exponga lectura, filtrada en el servidor de OlivarTrack y no en el cliente. Las preguntas de los hogares son entrada no confiable, y una lista blanca en el cliente no frena una inyección de instrucciones.
- **Trabajadores.** Esas herramientas de lectura no deben devolver nombres ni trazas GPS hacia el VPS.

## Escena: la finca en teselas

150 ha son unos 1,5 km². No cabe entera a máxima calidad en unas Quest, pero tampoco hace falta un motor de mundo abierto. Propuesta: teselas en el estándar 3D Tiles 1.1, generadas por un script propio y cargadas con 3DTilesRendererJS, la librería de NASA-AMMOS para three.js, que trae y suelta teselas según la distancia.

- **Rejilla.** Árbol de cuadrantes con hojas de unos 100 × 100 m (150-200 teselas) y 2-3 niveles de detalle por encima. Solo se carga lo que el punto de vista necesita.
- **Terreno.** MDT LiDAR del PNOA convertido en malla por tesela, más simple en los niveles lejanos. Textura de ortofoto, o colores planos si mantienes el estilo bloque, que abarata mucho las texturas.
- **Olivos.** Los 6.156 contados, más los que queden fuera del conteo. Cada tesela lleva una lista de instancias (posición, tipo, escala, giro y, más adelante, volumen de copa) como instancias GPU dentro del glTF. Los 6-8 modelos tipo se descargan una sola vez; a distancia se sustituyen por un olivo simplificado o un plano con imagen.
- **Construcciones.** Huellas del Catastro con altura sacada del LiDAR, extruidas de forma sencilla. Las que importan (cortijo, naves) se modelan en Blender.
- **Hazas y lindes.** Fuera de la malla: capa vectorial servida por la api desde PostGIS. Así resaltas «tu haza» sin regenerar teselas.
- **Tubería.** Un script (Python, o gltf-transform en Node) lee MDT, ortofoto, olivos y edificios y genera los glb y el `tileset.json`. Caddy los sirve como estáticos con caché larga. Se regenera cuando cambian los datos, no en cada visita.

Coste real: es la parte más laboriosa del proyecto, más que el multiusuario. Atajo para empezar antes: rejilla fija de 100 m sin niveles de detalle, con niebla. Vale en escritorio; en Quest con la finca entera probablemente no llegue a 72 fps.

## Fuentes de datos

El mundo se construye con datos públicos y los de Vigía; el dron afina la escala de cada olivo. Cada fuente sirve a la escala que tiene, no más.

| Fuente | Resolución | En el mundo | En el análisis |
| --- | --- | --- | --- |
| Dron Phantom 4 Multispectral RTK | Unos 5 cm por píxel a 100 m | Altura y diámetro reales de cada olivo | Vigor y volumen de copa por árbol |
| Ortofoto PNOA | 25 cm | Textura del suelo o referencia de color | — |
| LiDAR PNOA (CNIG) | MDT de 2 m | Terreno de las teselas | Altura de copa aproximada (superficie menos terreno) |
| Catastro INSPIRE | Huella por edificio | Construcciones extruidas | — |
| Sentinel-2 vía Vigía | 10 m (NDVI), 20 m (NDRE) | Capa de vigor por haza | Evolución en el tiempo |
| Clima de Vigía | Estación de la finca | Cielo, lluvia y hora del día reales | Riesgos sanitarios |
| SoilGrids | 250 m (una celda = 6,25 ha) | Ficha informativa por haza | Contexto, no mapa fino |

SoilGrids es un modelo global, no una medida: en la ficha de cada haza conviene mostrar al lado las analíticas de suelo de OlivarTrack. Los datos del IGN, Copernicus y SoilGrids exigen citar la fuente; un panel de créditos en el mundo lo resuelve.

## Vuelos con dron RTK

El dron no mejora el suelo, mejora la copa. El MDT del LiDAR ya es bueno para el terreno, que no cambia, y la fotogrametría no ve bajo los olivos. Lo que el dron da y el satélite no es la forma y el vigor de cada árbol, en vez de un píxel de 10-20 m que mezcla olivo y calle.

- **Equipo.** El Phantom 4 Multispectral lleva banda de borde rojo, así que da NDRE (y NDVI) directo a unos 5 cm. Con RTK y correcciones por NTRIP (la red pública andaluza o una base propia), los vuelos de fechas distintas casan sin puntos de control.
- **Su límite.** La cámara RGB es de 2 MP: buen mapa de vigor, pero un modelo 3D de copa más tosco que el de un dron RGB de 20 MP. Para medir olivos tradicionales grandes suele bastar; si no, un vuelo RGB aparte.
- **Procesado.** En un PC con GPU, no en el VPS: WebODM (código abierto, en Docker) o DJI Terra. Salen ortomosaico, mapas de reflectancia, índices, modelo de superficie y nube de puntos.
- **Un vuelo, tres consumidores.** Los rasters van a un almacén común. Vigía saca índices por árbol y por haza; OlivarTrack recibe el volumen de copa para ponderar el aforo; la tubería de teselas escala cada instancia de olivo con su altura y diámetro reales.
- **Cadencia.** Vigor, 2-4 vuelos al año en momentos fenológicos clave; geometría de copa, uno al año tras la poda.
- **Normativa.** Operador registrado en AESA y la categoría que toque; en finca rural es sencillo, pero revisa cercanía a núcleos y zonas restringidas.

## Interiores: la fábrica como museo

Con dos salas unidas por un tabique abierto, el interior no necesita escanearse: es una caja sencilla. Se modela en Blender con medidas reales, se viste con texturas sacadas de fotos y dentro se colocan los elementos del molino como objetos 3D. Sale más ligero, encaja con el estilo y se edita sin volver a capturar nada.

- **La nave.** Suelo, muros, cubierta, huecos y el tabique abierto, con medidas de plano o de medidor láser. Unos cientos de polígonos.
- **Texturas.** Fotos de muros, suelo y cubierta convertidas en texturas repetibles (color, relieve, rugosidad). Si se quiere coherencia con el exterior estilo bloque, se simplifican a la misma paleta.
- **Luz cocinada.** La iluminación se calcula una vez en Blender y se guarda en una textura. Es lo que más calidad da en Quest y casi no cuesta rendimiento.
- **Las piezas del molino.** Cada elemento (rulos, prensas, capachos, tinajas…) es un glTF independiente que se coloca y se mueve sin tocar la nave. Las piezas existen, pero bajo escombro: se escanean una a una con el móvil por fotogrametría cuando estén limpias y accesibles por todos los lados, y se simplifican. Antes, un escaneo del estado actual sirve para planificar el desescombro y como «antes» del museo.
- **El museo.** Cartelas, fotos antiguas y vídeos como paneles, y un punto de interés por pieza que el guía puede señalar en la visita.
- **Rendimiento.** Dos salas con una veintena de piezas caben de sobra en Quest, sin carga por partes.
- **Entrada.** Al cruzar la puerta se ocultan las teselas exteriores; la sala de LiveKit es la misma.

El Gaussian splatting queda como alternativa si algún día se quiere el aspecto fotográfico exacto del edificio; para dos salas con piezas añadidas no compensa. Las gafas sí sirven para revisar escala y recorridos dentro del modelo antes de publicarlo.

## Privacidad, roles y moderación

El streaming de campo choca con la regla de no compartir vídeo ni fotos de personas: la cámara grabará a quien trabaje en el olivar. Hay que resolverlo por diseño, no por buena voluntad.

- **Quién puede emitir.** Solo el rol corresponsal; el token que firma la api da permiso de publicar vídeo a ese rol y a ningún otro. Los hogares no emiten vídeo nunca.
- **Cuándo.** Solo en visitas programadas, con aviso previo a la cuadrilla. Las personas trabajadoras deben estar informadas; conviene sumar este tratamiento a la EIPD ya hecha para OlivarTrack.
- **Qué se guarda.** El directo no se graba por defecto. Los clips que pasan a trazabilidad los revisa la oficina antes de publicarlos.
- **Voz entre desconocidos.** En una comunidad de hogares habrá menores. Propuesta: voz abierta solo en visitas guiadas, con un guía que puede silenciar o expulsar; en visita libre, chat de texto y silenciar/bloquear al alcance de cualquiera.

| Rol | Ve | Habla | Emite vídeo | Modera |
| --- | --- | --- | --- | --- |
| Hogar | Su haza en detalle; el resto de la finca en general *(ver decisión: ahora también ve las ajenas en detalle)* | En visitas guiadas | No | No |
| Guía | Todo | Sí | No | Sí |
| Corresponsal | Mapa 2D de su zona | Sí | Sí | No |
| Administración | Todo, más el panel | Sí | No | Sí |

## Despliegue en el VPS

Un solo `docker-compose.yml` levanta todo; un VPS de 4 núcleos y 8 GB sobra para 40 hogares con un vídeo de campo a la vez. Elegir proveedor con centro de datos en la UE por el RGPD.

```yaml
services:
  caddy:      # 80/443, TLS automático, web estática y proxy
    image: caddy:2
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, ./web:/srv, caddy_data:/data]
  livekit:    # red del host: necesita un rango UDP para el medio
    image: livekit/livekit-server
    network_mode: host
    volumes: [./livekit.yaml:/etc/livekit.yaml]
  api:        # tokens, datos de haza, entrada desde OlivarTrack
    image: ghcr.io/<usuario>/api-hazas
    env_file: .env
  db:
    image: postgis/postgis:16-3.4
    volumes: [pg_data:/var/lib/postgresql/data]
volumes: { caddy_data: {}, pg_data: {} }
```

- **Puertos.** 443 para todo lo web; LiveKit abre además su puerto TCP de respaldo y un rango UDP. Su TURN integrado cubre redes que bloquean UDP. El cortafuegos del VPS cierra todo lo demás, incluido Postgres.
- **Publicar una versión.** GitHub Actions construye las imágenes, las sube al registro y por SSH hace `docker compose pull && docker compose up -d`. Un Git, un comando: lo mismo que se querrá para la instancia por cliente.
- **Copias.** `pg_dump` cada noche fuera del VPS, y los clips en almacenamiento de objetos compatible S3 cuando dejen de caber en disco.
- **Vigilancia.** Un chequeo externo de disponibilidad y los registros de los contenedores. Nada más hasta que haga falta.

## Fases

Cada fase se publica y se usa antes de empezar la siguiente; el multiusuario llega en la segunda, no en la primera.

1. **Finca visitable, una persona.** Tubería de teselas con terreno, construcciones y olivos instanciados desde los 6-8 modelos tipo; hazas como capa vectorial; escritorio y Quest; panel de «mi haza» con datos de la api. VPS con Caddy, api y Postgres. *Listo cuando:* un hogar entra con su enlace y ve su haza en las Quest a 72 fps.
2. **Presencia compartida.** LiveKit, avatares, posiciones y chat de texto. *Listo cuando:* dos personas, una en escritorio y otra en Quest, se ven y se escriben en la misma haza.
3. **Voz y visita guiada.** Audio espacial, rol de guía con moderación. *Listo cuando:* una visita de 10 personas suena limpia y el guía puede silenciar.
4. **Corresponsal de campo.** PWA con GPS, rumbo y cámara; pantalla de vídeo en el mundo; clips sin cobertura. *Listo cuando:* una visita guiada se hace con el corresponsal andando entre olivos y los visores le siguen.
5. **Aula y puzles.** Charlas en campo, poda, riesgos laborales; aquí sí puede entrar un servidor de estado. En paralelo, según haya datos: vuelo de dron que reescala los olivos y una sala piloto de la fábrica escaneada.

## Riesgos y decisiones abiertas

El mayor riesgo no es técnico: es la cobertura móvil en la finca y el encaje legal del vídeo con trabajadores.

| Riesgo | Señal temprana | Salida |
| --- | --- | --- |
| Subida 4G pobre en las hazas | Prueba de velocidad en 5-6 puntos de la finca antes de la fase 4 | Clips diferidos en lugar de directo; directo solo en zonas con cobertura |
| Rendimiento en Quest | Caída de fps al pasar de 8 olivos a la finca entera | Más instancias y menos tipos, LOD agresivo, niebla que oculte lo lejano |
| Vídeo de personas trabajando | Dudas en la cuadrilla o en la EIPD | Encuadre a copa y suelo, avisos, sin grabación por defecto |
| Un solo VPS cae | Visita interrumpida | Copias nocturnas y un compose que levanta todo en otra máquina en minutos |
| Menores en la voz abierta | Primera queja | Voz solo en visitas guiadas (ya propuesto) |

## Decisiones (respuestas de Antonio, 28-oct-2026)

- [x] **Supabase o Postgres a pelo con auth propia:** Postgres a pelo, con auth propia, **dentro del Docker del proyecto**.
- [x] **Proveedor del VPS y dominio:** el VPS propio en **OVH**, dominio **gemelo.canoydamas.es**.
- [x] **¿Pueden los hogares ver hazas ajenas en detalle o solo la suya?** Sí, en detalle: es una comunidad abierta. *(Cambia la fila «Hogar» de la tabla de roles y obliga a decidir qué datos de OlivarTrack se proyectan por haza sin identificar a su titular; ver el estudio.)*
- [ ] **¿Se graban las visitas guiadas para quien no pudo asistir?** Sin decidir («no sabría qué decir»). Pendiente: [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md).
