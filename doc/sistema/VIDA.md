# La vida de las hazas en el servidor (V3)

Base de datos y api de lo que hacen las familias en su haza antes de subir al VPS, para no migrar con gente dentro: decisiones 91-97 de [DECISIONS-PENDING](../rumbo/DECISIONS-PENDING.md). Contrato (rutas, permisos, errores, lista blanca): [contratos/vida.md](../../contratos/vida.md). Tablas: `apps/api/migraciones/0004_vida.sql`. Código: `apps/api/src/vida/`. Las pantallas (motor y panel) **no** están hechas.

## Qué hay

| Pieza | Tablas | Rutas | Estado |
|---|---|---|---|
| Id del olivo congelado (92) | `olivos` + `finca`, `copas_id`, `id_ot`, `visto_en_vuelo`, `retirado_en` | (las de abajo usan `finca` + `copas_id`) | hecho |
| Personalizar árboles (91, 96) | `personalizaciones`, `medios` | `GET /api/hazas/{id}/olivos`, `PUT`/`DELETE /api/olivos/{finca}/{copas_id}`, `POST /api/medios`, `GET /api/medios/{clave}` | hecho, sin pantalla |
| Denuncias y retirada (93) | `denuncias`, `avisos` | `POST /api/personalizaciones/{id}/denuncias`, `POST /api/admin/personalizaciones/{id}/retirar` | hecho, sin pantalla |
| Bandeja de la oficina (94) | `bandeja` | `POST /api/hazas/{id}/sugerencias`, `GET /api/admin/bandeja`, `POST /api/admin/bandeja/{id}/estado` | hecho, sin pantalla; «pasar a OlivarTrack» es apuntar el id (el gemelo no escribe allí) |
| Diario, avisos, trazabilidad, eventos (97) | `diario_haza`, `avisos`, `avisos_hogar`, `lotes`, `lote_haza`, `lote_hogar`, `visitas` ampliada, `visitas_asistentes` ampliada | ninguna todavía | solo tablas |

**Titular** (decisión 96): la sesión guarda de dónde nació (`sesiones.origen`): `enlace` (el adulto con el enlace mágico) o `vinculo` (un aparato vinculado con el código corto, p. ej. las Quest que usa cualquiera en casa). Solo una sesión `enlace` sube, personaliza o sugiere; `/api/sesion` lo dice en `titular`. Las sesiones de antes de la 0004 cuentan como `enlace`.

## Almacenamiento de los ficheros (decisión técnica)

**Carpeta en un volumen del VPS (`GEMELO_MEDIOS`), servida por la propia api tras sesión.** Alternativas:

- *Carpeta servida por Caddy (`file_server`)*: más rápida, pero Caddy no sabe si un contenido está retirado; la retirada «en un clic» (decisión 93) obligaría a borrar el fichero al momento y perder la prueba para la denuncia. Descartada.
- *S3 (OVH Object Storage)*: otra pieza, otra credencial y datos de las familias fuera del VPS; para ~40 hogares y fotos de ≤ 1600 px (cientos de KB cada una: estimado, no medido con fotos reales) no compensa. Se puede pasar después cambiando solo `src/vida/medios.ts` (la base guarda la `clave`, no la ruta).

La base guarda solo la descripción (`medios`: clave al azar, tipo, bytes, ancho, alto, SHA-256, quién y desde qué sesión, aviso aceptado). Los ficheros entran en las copias junto con la base.

**Pendiente en `infra/` (no tocado aquí):** volumen y variable `GEMELO_MEDIOS` del servicio `api` en `infra/compose.yml` e `infra/dev`; abrir el tamaño de `POST /api/medios` en el Caddy interno (hoy `request_body max_size 1MB` en `/api/*`) y en el bloque de borde (2 MB), o reducir la foto en el navegador antes de subirla (lo más barato: el panel la reduce a 1600 px antes de mandarla); la copia de seguridad del volumen; `GEMELO_MEDIOS*` en `infra/entorno.ejemplo`.

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
- **No probado**: la imagen Docker de producción con sharp en alpine (el lock trae los binarios `linuxmusl`); el Caddy con subidas de más de 1 MB; el casado de un vuelo nuevo; ninguna pantalla (motor, panel, Quest, iPhone).
