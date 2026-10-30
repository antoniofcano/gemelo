# Contrato: la vida de las hazas (olivos personalizados, fotos, denuncias y bandeja)

Decisiones 91-97 ([DECISIONS-PENDING](../doc/rumbo/DECISIONS-PENDING.md)). Rutas: [api.openapi.yaml](api.openapi.yaml). Lista blanca: [olivos-haza.schema.json](olivos-haza.schema.json) con su ejemplo sintético [olivos-haza-ejemplo.json](olivos-haza-ejemplo.json). Tablas: `apps/api/migraciones/0004_vida.sql`. Código: `apps/api/src/vida/`. Datos personales, conservación y almacenamiento: [doc/sistema/VIDA.md](../doc/sistema/VIDA.md). Lo comprueban `apps/api/pruebas/unidad/vida.test.ts` (sin base) y `apps/api/pruebas/integracion/vida.test.ts` (PostGIS en contenedor, `GEMELO_DOCKER=1`).

## Identidad del olivo (decisión 92)

| Qué | Valor |
|---|---|
| Id definitivo | `(finca, copas_id)`: el `copas_id` del índice del motor ([CONTRATOS §1.1](../doc/sistema/CONTRATOS.md#11-indicejson-va-en-la-página-como-d)), **congelado** en la tabla `olivos` (un disparador impide cambiarlo) |
| De dónde sale | `id_estable` = `«finca»:«copas_id»` de la carga de `tuberia/hazas` (`desde_fixture.py`); un `id_estable` con otra forma no tiene `copas_id` y no se puede personalizar |
| Id de OlivarTrack | `olivos.id_ot`, nulo; se enlaza al lado cuando llegue (con `id_ot_enlazado_en`) |
| En la api | `/api/olivos/{finca}/{copas_id}`; en las respuestas, `finca` + `copas_id` |

## Quién hace qué

| Acción | Quién | Ruta |
|---|---|---|
| Ver los olivos personalizados de una haza | cualquier sesión | `GET /api/hazas/{id}/olivos` |
| Ver una foto | cualquier sesión, si está colgada y visible (o es suya, o es la oficina) | `GET /api/medios/{clave}` |
| Subir una foto o pintura | **titular**: sesión nacida del enlace mágico (`/api/sesion` → `titular: true`); unas gafas vinculadas con el código corto, no (decisión 96) | `POST /api/medios?acepto=true` |
| Nombrar un olivo y colgarle la foto | titular, y solo en un olivo que cae dentro de una haza asignada a su hogar | `PUT /api/olivos/{finca}/{copas_id}` |
| Quitar lo suyo | titular | `DELETE /api/olivos/{finca}/{copas_id}` |
| Denunciar | cualquier sesión, una vez por contenido | `POST /api/personalizaciones/{id}/denuncias` |
| Sugerir a la oficina | titular, sobre su haza (y opcionalmente un olivo de ella) | `POST /api/hazas/{id}/sugerencias` |
| Bandeja, cambiar estado, retirar | rol `admin` (la oficina) | `GET /api/admin/bandeja`, `POST /api/admin/bandeja/{id}/estado`, `POST /api/admin/personalizaciones/{id}/retirar` |

Errores con nombre: `solo_titular` (403, sesión de aparato vinculado), `no_es_tu_haza` (403), `olivo_no_existe` (404), `nombre_no_valido` (400), `medio_no_valido` (400), `ya_denunciado` (409), `tipo_no_admitido` / `no_es_imagen` (415), `imagen_demasiado_grande` (413), `subidas_apagadas` (503, sin `GEMELO_MEDIOS`), `demasiadas_peticiones` (429, el mismo texto para todos).

## Lista blanca (decisión 13)

Un hogar ajeno ve de cada olivo personalizado **solo** `id` (de la personalización, para denunciarla), `finca`, `copas_id`, `nombre` y `objeto` (`tipo` foto/pintura, `url` de la propia api, `ancho`, `alto`). Nunca quién lo subió, desde qué sesión, ni fechas. Solo sale lo `visible` y del **titular actual** de la haza: si la oficina la reasigna, lo del anterior deja de verse (queda en la base). La api serializa con el esquema del contrato (`additionalProperties: false`): un campo de más no sale.

## Subida

| Qué | Valor |
|---|---|
| Cuerpo | la imagen tal cual, `Content-Type: image/jpeg`, `image/png` o `image/webp` (sin multipart) |
| Aviso | `?acepto=true` obligatorio: «Sube solo fotos o pinturas del olivo o del campo. No subas caras de menores ni datos personales (nombres, matrículas, direcciones, teléfonos). Lo que subes lo ven al momento las demás familias; la oficina puede retirarlo.» (`TEXTO_AVISO`, versión `AVISO_VERSION` = 1, se guarda con la fecha en `medios`) |
| Comprobación | el formato se lee del **contenido** con sharp (libvips): un PNG que dice ser JPEG, un GIF o un SVG → 415; más de 40 MP → 413 sin descomprimir |
| Lo que se guarda | **WebP** re-codificado (calidad 82), enderezado por su EXIF y reducido a **≤ 1600 px** de lado, **sin metadatos** (ni EXIF, ni GPS, ni XMP, ni ICC); nombre al azar de 128 bits; nunca el fichero original |
| Tamaño | `GEMELO_MEDIOS_MAX_MB` (8 por defecto). El Caddy interno y el de borde dejan pasar `POST /api/medios` hasta 9 MB y cortan el resto de `/api/*` a 1 MB y 2 MB (V7; si se sube el tope por encima de 8, subir también `max_size` en `infra/Caddyfile` y `infra/bloque-borde.txt`) |
| Límites | 30/min por IP; `GEMELO_MEDIOS_SUBIDAS_HORA` (20) por hogar; las escrituras (personalizar, denunciar, sugerir), `GEMELO_VIDA_ESCRITURAS_HORA` (60) por hogar |
| Servir | `GET /api/medios/{clave}` tras sesión, `cache-control: private, max-age=300`, `content-security-policy: default-src 'none'; sandbox` |

Subir no publica: la foto se ve cuando el titular la cuelga de un olivo (`PUT`). Una subida que nadie cuelga se purga al día.

## Nombre

1-40 caracteres tras normalizar espacios; letras, números, espacios y `' ’ . , ; : ! ¡ ¿ ? ( ) -`. Filtro **básico** (`src/vida/filtro.ts`): sin enlaces ni dominios, sin 6 cifras o más seguidas (teléfono, DNI, cuenta), sin una lista corta de palabras gruesas (palabra entera, sin tildes). El resto lo atiende la denuncia.

## Bandeja de la oficina (decisión 94)

Entradas de tres tipos: `contenido_nuevo` (cada personalización creada o cambiada, sin repetir mientras haya una sin ver: a la oficina le sirve de sugerencia, decisión 91), `sugerencia` (texto del titular) y `denuncia`. Estados: `nueva` → `vista` → `pasada_ot` (con `ot_propuesta_id`, obligatorio y solo con ella) o `descartada`. **El gemelo no escribe en OlivarTrack**: «pasar a OlivarTrack» lo hace la oficina allí y apunta aquí el id de la propuesta. Descartar una denuncia la resuelve como `se_mantiene`.

**Retirar** (un clic): la personalización pasa a `retirado` con motivo y quién; deja de verse y de servirse al momento; sus denuncias quedan `retirado`; lo pendiente de la bandeja sobre ella pasa a `vista`; el hogar recibe un aviso (`avisos`/`avisos_hogar`); queda `admin.contenido_retirado` en la auditoría. El titular puede volver a colgar algo en ese olivo.

## Tablas sin pantalla todavía (decisión 97)

`diario_haza` (labor, nota, foto, hito; de la oficina, del corresponsal o de OlivarTrack con clave natural), `avisos` + `avisos_hogar` (entrega por hogar, leído y correo enviado), `lotes` + `lote_haza` (fechas de recogida) + `lote_hogar` (sin kilos ni litros), y `visitas` ampliada a eventos (tipos `evento`, `taller`, `recoleccion`; plazas, plazo, estado) con inscripción (`personas`, `apuntado`/`en_espera`/`anulado`). Sus rutas llegan con sus pantallas; la descarga de datos del hogar (`GET /api/yo/datos`) ya las incluye.
