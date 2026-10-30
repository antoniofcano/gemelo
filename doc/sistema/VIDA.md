# La vida de las hazas en el servidor (V3)

Base de datos y api de lo que hacen las familias en su haza antes de subir al VPS, para no migrar con gente dentro: decisiones 91-97 de [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md). Contrato (rutas, permisos, errores, lista blanca): [contratos/vida.md](../../contratos/vida.md). Tablas: `apps/api/migraciones/0004_vida.sql`. Código: `apps/api/src/vida/`. La pantalla del motor para los árboles (nombrar, colgar una imagen, verlo, denunciar) la hace el componente `personalizacion` (P7f, abajo); la del panel de la oficina, [OFICINA](OFICINA.md) (bandeja); lo demás de la tabla sigue sin pantalla.

## Qué hay

| Pieza | Tablas | Rutas | Estado |
|---|---|---|---|
| Id del olivo congelado (92) | `olivos` + `finca`, `copas_id`, `id_ot`, `visto_en_vuelo`, `retirado_en` | (las de abajo usan `finca` + `copas_id`) | hecho |
| Personalizar árboles (91, 96) | `personalizaciones`, `medios` | `GET /api/hazas/{id}/olivos`, `PUT`/`DELETE /api/olivos/{finca}/{copas_id}`, `POST /api/medios`, `GET /api/medios/{clave}` | hecho, sin pantalla |
| Denuncias y retirada (93) | `denuncias`, `avisos` | `POST /api/personalizaciones/{id}/denuncias`, `POST /api/admin/personalizaciones/{id}/retirar` | hecho; denunciar desde el motor: P7f; retirar, en la bandeja de la oficina |
| Bandeja de la oficina (94) | `bandeja` | `POST /api/hazas/{id}/sugerencias`, `GET /api/admin/bandeja`, `POST /api/admin/bandeja/{id}/estado` | hecho; sugerir desde el motor: P7f; bandeja en la oficina; «pasar a OlivarTrack» es apuntar el id (el gemelo no escribe allí) |
| Diario, avisos, trazabilidad, eventos (97) | `diario_haza`, `avisos`, `avisos_hogar`, `lotes`, `lote_haza`, `lote_hogar`, `visitas` ampliada, `visitas_asistentes` ampliada | ninguna todavía | solo tablas |

**Titular** (decisión 96): la sesión guarda de dónde nació (`sesiones.origen`): `enlace` (el adulto con el enlace mágico) o `vinculo` (un aparato vinculado con el código corto, p. ej. las Quest que usa cualquiera en casa). Solo una sesión `enlace` sube, personaliza o sugiere; `/api/sesion` lo dice en `titular`. Las sesiones de antes de la 0004 cuentan como `enlace`.

## La pantalla del motor: el componente `personalizacion` (P7f)

`apps/web/motor/42_personalizacion.js` (componente, bandera `?personaliza=0` para apagarlo; defecto encendido). **Sin servidor** (la salida de fixture, sin `D.base` `/teselas/…` ni `?api=`) no pide nada, no crea nada y no cambia ninguna ficha. Con servidor:

| Qué | Cómo |
|---|---|
| Quién soy | `GET /api/sesion` → `titular` (decisión 96). Mientras no se sabe, no se ofrece escribir. |
| Qué hay | `GET /api/hazas/{id}/olivos` de cada haza que se ve, al arrancar, cada 2 minutos y tras cada cambio propio. Solo entra lo que cumple la lista blanca del contrato. |
| La ficha | **no hay ficha propia**: `Entidades.complementa("olivo", …)` añade a la ficha común las filas «Nombre» y «Foto»/«Pintura» y las acciones de `Usables`. El **titular en un olivo de su haza**: «Nombrar» (o «Cambiar nombre»), «Colgar foto o dibujo», «Quitar» (si hay algo) y «Sugerir a la oficina». **Cualquiera en un olivo ajeno** con nombre o imagen: «Denunciar» (motivo y texto; una vez por contenido). Unas gafas vinculadas ven y denuncian, pero en lo suyo solo leen la fila «solo con tu enlace». Un olivo con id provisional (`i<n>`) no se puede personalizar. |
| Subir | selector (JPEG, PNG, WebP), **reducción en el aparato** (canvas, lado mayor ≤ 1280 px, JPEG 0,85; la api la vuelve a codificar a WebP sin EXIF ni GPS), el **aviso obligatorio** (el de la api, con casilla; sin ella no se sube) más la línea de la decisión 102, `POST /api/medios?acepto=true` y luego `PUT /api/olivos/…` con **solo** `{ objeto }`. |
| Errores | texto claro por caso (tamaño 413, tipo 415, límite por hora 429, subidas apagadas 503, sesión caducada, solo titular, no es tu haza, ya denunciado, nombre no válido con el texto de la api). **Decisión 102**: la api no distingue «cuentas de prueba»; si la subida está apagada (503 `subidas_apagadas`) la pantalla lo explica y dice que por ahora solo suben fotos las cuentas de prueba. No se inventa ningún permiso en el cliente: lo decide la api. |
| En el mundo | el **nombre** sobre el olivo a menos de 45 m (los 12 más cercanos), en el DOM (0 llamadas y 0 triángulos); la **imagen** en una lámina de `Laminas` colgada del árbol al elegirlo (1 llamada, 2 triángulos, 1 textura de 512 px de ancho; se libera al soltar). |
| VR | lo que se lee (el nombre y que hay imagen en la ficha, la lámina) y «Denunciar» con el motivo «otro» (el resultado, por el evento `personalizacion:resultado`). **Subir una foto, nombrar y sugerir no se hacen en VR** (piden teclado y elegir un fichero): la ficha de VR lo dice («no en VR: se hace desde el móvil o el ordenador»). |

Cambios en lo que ya existía: `PUT /api/olivos/{finca}/{copas_id}` acepta `{ nombre }` o `{ objeto }` sueltos (lo omitido se queda; antes pedía los dos y la lista blanca no da el `medio_id`, así que renombrar habría quitado la foto); `Entidades.complementa`; `Laminas.abre({ en })`; `Hazas.vistas()` y `Hazas.enPunto(x, y)`.

Probado: Node (`personalizacion.test.js`) y Chrome contra la api real con PostGIS (`personalizacion_e2e.test.js`, `GEMELO_DOCKER=1`). **No probado**: iPhone, Quest, una foto de verdad de un móvil (HEIC, orientación EXIF en iOS), muchas hazas con muchos nombres. Medida y nota de comodidad: [COMPONENTES § P7f](COMPONENTES.md#p7f--la-personalización-de-los-árboles-en-el-mundo).

## Almacenamiento de los ficheros (decisión técnica)

**Carpeta en un volumen del VPS (`GEMELO_MEDIOS`), servida por la propia api tras sesión.** Alternativas:

- *Carpeta servida por Caddy (`file_server`)*: más rápida, pero Caddy no sabe si un contenido está retirado; la retirada «en un clic» (decisión 93) obligaría a borrar el fichero al momento y perder la prueba para la denuncia. Descartada.
- *S3 (OVH Object Storage)*: otra pieza, otra credencial y datos de las familias fuera del VPS; para ~40 hogares y fotos de ≤ 1600 px (cientos de KB cada una: estimado, no medido con fotos reales) no compensa. Se puede pasar después cambiando solo `src/vida/medios.ts` (la base guarda la `clave`, no la ruta).

La base guarda solo la descripción (`medios`: clave al azar, tipo, bytes, ancho, alto, SHA-256, quién y desde qué sesión, aviso aceptado). Los ficheros entran en las copias junto con la base.

**Hecho en `infra/` (V7):** volumen `medios` en `/datos/medios` (`GEMELO_MEDIOS`) en `infra/compose.yml` e `infra/dev/compose.yml`; `POST /api/medios` hasta ~9 MB en el Caddy interno, el de dev y el bloque de borde (el resto de `/api/*` sigue en 1 MB / 2 MB), con la prueba en `infra/probar-caddy.sh`; copia cifrada del volumen en `infra/respaldo.sh` y su ensayo en `infra/ensayar-restauracion.sh`; `GEMELO_MEDIOS*` en `infra/entorno.ejemplo`. Cómo se copia y se restaura: [RUNBOOK-VPS § Volúmenes](../operacion/RUNBOOK-VPS.md#volúmenes-qué-guardan-cómo-se-copian-y-se-restauran).

## Vuelo LiDAR nuevo (anotado, no implementado)

El id del olivo no cambia con un vuelo nuevo. Al cargar uno: (1) casar cada copa nueva con el olivo vivo (`retirado_en IS NULL`) más cercano a ≤ 1,5 m, **uno a uno** (la regla de `tuberia/semillas_copas.py`); (2) lo casado conserva `copas_id` y actualiza `geom`, `altura_m` y `visto_en_vuelo`; (3) lo que no casa del vuelo nuevo nace con `copas_id` nuevo (fuera de los usados); (4) el olivo viejo que no casa **no se borra** (tiene personalización e historia): se marca `retirado_en`, y su personalización deja de verse. La exportación al motor debe emitir esos `copas_id` (no unos nuevos por posición). Sin hacer: el script de casado y su prueba.

## Datos personales (para la EIPD)

Lo nuevo que se guarda de un hogar con la 0004, quién lo ve y cuánto dura. Los plazos son **propuesta técnica**: los fija Antonio (filas para DECISIONS-PENDING al final).

| Dato | Dónde | Quién lo ve | Cuánto se guarda |
|---|---|---|---|
| Foto o pintura subida (puede contener personas, aunque el aviso lo prohíbe) | fichero en `GEMELO_MEDIOS` + fila `medios` | colgada y visible: **todos los hogares con sesión**; sin colgar: el propio hogar; siempre: la oficina | mientras esté colgada; retirada (por la oficina o por el hogar): **30 días** (`GEMELO_MEDIOS_RETENCION_DIAS`) y se borra el fichero; sin colgar: 1 día; al borrar el hogar: en el acto |
| Quién subió y desde qué sesión, y cuándo aceptó el aviso | `medios.hogar_id`, `sesion_id`, `aviso_aceptado_en`; `personalizaciones.hogar_id`, `sesion_id` | solo la oficina (nunca sale a otros hogares) | como el contenido; la fila de la personalización retirada queda como registro hasta borrar el hogar |
| Nombre puesto a un olivo | `personalizaciones.nombre` | todos los hogares con sesión | mientras esté visible; retirado: queda como registro |
| Denuncias hechas (motivo y texto) | `denuncias` | solo la oficina | mientras exista el contenido denunciado; si el denunciante borra su cuenta, queda anónima |
| Sugerencias (texto) | `bandeja` | solo la oficina | sin plazo (**a decidir**) |
| Avisos recibidos y leídos | `avisos_hogar` | el hogar y la oficina | sin plazo (**a decidir**) |
| Inscripciones a visitas y eventos (cuántas personas) | `visitas_asistentes` | el hogar y la oficina (y el guía, cuando haya pantalla) | sin plazo (**a decidir**) |
| Lotes de aceite que recibe el hogar | `lote_hogar` | el hogar y la oficina | sin plazo (**a decidir**) |
| Auditoría (`vida.*`, `admin.contenido_retirado`, `admin.bandeja`) | `auditoria` (sin datos personales en `detalle`, salvo el motivo de retirada que escribe la oficina) | solo la oficina | como el resto de la auditoría; al borrar el hogar queda anónima |

Derechos: **acceso y portabilidad** (`GET /api/yo/datos` ya incluye olivos personalizados, fotos subidas con su URL, denuncias, sugerencias, avisos, inscripciones y lotes) y **supresión** (`DELETE /api/yo` o la oficina: la cascada borra filas y la api borra los ficheros en el acto; la purga periódica, cada 6 h, quita lo que quede). La foto sale del servidor ya sin EXIF ni GPS (la posición del olivo ya la da la haza; la del móvil que hizo la foto, no).

Riesgos que la EIPD debe mirar: fotos con menores o terceros (mitigado por aviso obligatorio, denuncia y retirada en un clic, **no** por revisión previa: decisión 93); visibilidad de lo colgado a toda la comunidad (lista blanca sin autor); quién en el hogar sube (solo la sesión del titular adulto).

## Qué está probado y qué no

- **Probado** (Node 24, Windows, sin Docker): tipos; filtro del nombre; la re-codificación de sharp (tipos por contenido, GIF/SVG/PNG disfrazado → 415, bomba de 50 MP → 413, EXIF con GPS y autor → WebP sin metadatos, enderezado y ≤ 1600 px); la lista blanca contra su contrato y su ejemplo; Origin, sesión y forma de cada ruta sin tocar la base; cada ruta está en el OpenAPI.
- **Con PostGIS en contenedor** (`apps/api/pruebas/integracion/vida.test.ts`, `GEMELO_DOCKER=1`): migración (ids derivados, congelados y únicos), subida y EXIF de punta a punta, titular sí / otro hogar no / gafas no, lista blanca para un hogar ajeno, denuncia → bandeja → retirada (deja de verse y de servirse, aviso, auditoría), sugerencias, RGPD con ficheros. Pasada el 2026-10-30 en Windows con Docker 29.6.1 (Testcontainers, `postgis/postgis` de `infra/compose.yml`): 8/8 de la vida y 28/28 de las de antes.
- **Probado con Docker (V7b, 2026-10-30, Docker Desktop en Windows; `GEMELO_DOCKER=1 node pruebas/docker_v7.js`)**: la imagen de producción de la api con sharp 0.35.5 (vips 8.18.7) en alpine, como usuario `node` (uid 1000), con sistema de ficheros de solo lectura y sin capacidades: re-codifica a WebP ≤ 1600 px y escribe en los volúmenes `medios` y `config`; la configuración se lee con el volumen en `:ro` (el hornero); `infra/probar-caddy.sh` con `/api/medios` hasta 9 MB (8 pasa, 10 da 413) en el Caddy interno y en el bloque de borde, y el resto de `/api/*` a 1 MB / 2 MB.
- **No probado**: los volúmenes con permisos de un Docker de Linux del VPS (en Docker Desktop el dueño del volumen nuevo se hereda igual, pero no es lo mismo); el borde real con subidas; el casado de un vuelo nuevo; ninguna pantalla (motor, panel, Quest, iPhone).
