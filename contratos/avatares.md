# Contrato `avatares` (v = 1 y v = 2)

Qué sirve el servidor para que el motor dibuje **avatares VRM** (ADR-0020, P7b) y cómo se hace. El cliente (P7c) y la portada (P7d) leen **solo** este contrato. Esquema: [`avatares.schema.json`](avatares.schema.json) (JSON Schema 2020-12). Ejemplo que lo cumple: [`avatares-ejemplo.json`](avatares-ejemplo.json) (inventado: no hay tales ficheros). Lo vigila `pruebas/guardianes/avatares.test.js` (esquema, tubería sobre un VRM sintético, licencias, `fuentes.json`) y, para Caddy, `pruebas/guardianes/dev.test.js`.

La idea en una frase: **un catálogo cerrado de 6-12 avatares, optimizado y con la licencia leída del propio fichero, servido tras sesión desde el mismo origen.** Desde la **v2** ([ADR-0025](../doc/adr/0025-avatares-por-piezas-contrato-v2.md), AV4) el catálogo es de **cuerpos con sus piezas dentro, paletas y receta** (§9); los §1-8 siguen valiendo para los dos (la v2 admite aún los `avatares[]` de la v1). Ejemplo v2: [`avatares-v2-ejemplo.json`](avatares-v2-ejemplo.json) (inventado). Los `.vrm` no se versionan (regla 4); en el repo van el esquema, el ejemplo, la tubería y un VRM sintético que las pruebas generan.

## 1. Lo que se sirve

Caddy (dev [`infra/dev/Caddyfile`](../infra/dev/Caddyfile) y producción [`infra/Caddyfile`](../infra/Caddyfile)), **solo con sesión** (`forward_auth`, como `/teselas`; sin ella, 401 o 303 a la portada):

| Ruta | Contenido | Caché |
|---|---|---|
| `/avatares/catalogo.json` | el catálogo (§2) | `private, no-cache` (se revalida) |
| `/avatares/<id>.vrm` | el avatar, `Content-Type: model/gltf-binary` | `private, max-age=31536000, immutable` |
| cualquier otra ruta bajo `/avatares/` | — | 404 `no-store` (las variantes `.br`/`.zst`/`.gz` solo las usa Caddy por dentro; no se piden) |

**El cliente pide siempre `/avatares/<id>.vrm?v=<sha256 del catálogo>`.** Caddy ignora la query; la URL cambia con el contenido, así que `immutable` es seguro aunque la oficina sustituya el fichero de un id. Tras bajarlo, el cliente comprueba el `sha256` del `ArrayBuffer`; si no coincide, trata el avatar como ausente (muñeco, ADR-0020 §6). Mismo origen: el motor no hace `fetch` a otros hosts.

Compresión de transporte: la tubería deja junto a cada `.vrm` su `.vrm.br`, `.vrm.zst` y `.vrm.gz`, y Caddy los sirve con `file_server { precompressed br zstd gzip }` (no depende de qué tipos comprime `encode` por defecto).

## 2. El catálogo (`catalogo.json`)

| Campo | Contenido |
|---|---|
| `v` | 1 |
| `compresion` | `cuantizacion` \| `meshopt` \| `ninguna` (§4) |
| `topes` | los topes con los que se construyó (triángulos objetivo y máximo, bytes, píxeles de textura, texturas, materiales) |
| `avatares[]` | 1 a 12. Cada uno: |
| · `id` | `^[a-z0-9-]{1,32}$`; es el que viaja en `avatar.vrm` de los metadatos de presencia y en la tabla `avatares` |
| · `nombre`, `descripcion?` | texto visible y alternativa accesible (portada) |
| · `fichero` | siempre `<id>.vrm` |
| · `sha256`, `bytes` | huella y tamaño **del fichero tal como se sirve** |
| · `vrm_version` | `"1.0"` o `"0.x"` (three-vrm admite las dos; los 0.x piden `rotateVRM0`) |
| · `triangulos`, `primitivas`, `materiales`, `texturas` | medidos tras optimizar; `primitivas` ≈ llamadas de dibujo por avatar |
| · `contornos_quitados?` | materiales MToon a los que se apagó el contorno |
| · `autor` | del `meta` del VRM |
| · `licencia` | `{spdx, url, credito_obligatorio, texto_credito}`; `credito_obligatorio` → «Créditos» de la portada |
| · `fuente` | `{nombre, url?}` de dónde salió |
| · `colores_muneco` | `{camisa, piel, sombrero}` (`#rrggbb`, `#rrggbb`, `ninguno`\|`paja`\|`gorra`): el muñeco lejano (ADR-0020 §5). Solo valen a quien no eligió piel ni ropa: si la persona eligió `tono` o `arriba` (AV2, [presencia](presencia.md)), manda lo suyo |

El catálogo no lleva fechas ni nada que cambie sin que cambie un avatar: la tubería es **determinista** (mismo origen, mismos bytes, probado).

## 3. Licencias: lo que la tubería rechaza

`tuberia/avatares/vrm.mjs` lee el `meta` del propio VRM y **se niega** a meter el que no deje servirlo desde nuestro servidor a cualquiera, para una empresa, y modificarlo (se optimiza):

- **VRM 1.0:** `avatarPermission = everyone`, `commercialUsage = corporation`, `allowRedistribution = true`, `modification = allowModificationRedistribution`, con `name`, `authors` y `licenseUrl`. Los valores por defecto de la especificación (`onlyAuthor`, `personalNonProfit`, sin redistribución) lo rechazan.
- **VRM 0.x:** `allowedUserName = Everyone`, `commercialUssageName = Allow` y `licenseName` **CC0 o CC_BY** (no CC_BY_NC, SA, ND, `Redistribution_Prohibited` ni `Other`).
- El identificador **SPDX** lo declara quien da de alta el avatar (`<x>.avatar.json`, campo `licencia.spdx`); un VRM 0.x con CC0/CC_BY lo trae en el `meta` y, si se declara otro distinto, se rechaza. Un VRM 1.0 sin SPDX declarado se rechaza.
- `credito_obligatorio` es `true` si el `meta` pide `creditNotation = required` o el SPDX es CC-BY-*.

El `meta` es lo que el autor escribió: la tubería no puede saber si es verdad. Quien da de alta un avatar sigue verificando la fuente a mano (la de los provisionales, en `tuberia/avatares/fuentes.json`).

## 4. Optimización y compresión (medido el 2026-10-29)

Con `@gltf-transform` 4.5.1 (+ `meshoptimizer` 1.3.0, `sharp` 0.35.5): texturas ≤ 1024 px (solo bajan; formato conservado), simplificación con la misma proporción en todas las mallas hasta `triangulos_objetivo` si se pasa de `triangulos_max`, contorno de MToon apagado, y compresión de mallas. **No borra, funde ni reordena nodos, materiales ni mallas** (las extensiones de VRM los nombran por índice) y lo comprueba al terminar; las texturas de MToon se tratan como referencias del grafo, y las de VRM 0.x se retraducen a los índices de `textures` de la salida.

**Compresión elegida: cuantización (`KHR_mesh_quantization`)**, sin WebAssembly. Medido con los cuatro CC0 provisionales (bytes sin comprimir / **tras gzip**, que es lo que viaja con Caddy; zstd da lo mismo ±3 %):

| Avatar | Origen | Cuantización | Meshopt |
|---|---|---|---|
| robert | 1,66 MB | 733 kB / **284 kB** | 292 kB / **257 kB** |
| mikel | 2,03 MB | 863 kB / **313 kB** | 317 kB / **277 kB** |
| rose | 2,40 MB | 976 kB / **395 kB** | 403 kB / **359 kB** |
| polydancer | 1,24 MB | 514 kB / **168 kB** | 184 kB / **146 kB** |

Meshopt ahorra **9-13 % de lo que viaja** (22-39 kB por avatar; el grueso es la textura, que ni uno ni otro tocan) a costa de `'wasm-unsafe-eval'` en `script-src`, que la CSP de Caddy (`script-src 'self'`, hoy en Report-Only) no tiene y que abriría la puerta a cualquier WebAssembly del origen. Con ≤ 12 avatares de una vez por sesión no compensa. La tubería sabe hacer las dos (`--compresion meshopt`; el guardián comprueba que decodifica igual), pero **el catálogo sale con cuantización** y su CSP no cambia. La cuantización no deforma al avatar con esqueleto (probado: cuadro delimitador en la pose de reposo, ±1 cm). **No probado:** el cargador del cliente (P7c; `GLTFLoader` de three admite `KHR_mesh_quantization` de serie) ni en dispositivos reales.

## 5. Cómo se construye

```
GEMELO_AVATARES_ORIGEN=<carpeta fuera del repo>  node tuberia/avatares/descarga.mjs     # baja los CC0 provisionales de fuentes.json (sha256 fijado)
GEMELO_AVATARES_ORIGEN=… GEMELO_AVATARES=<salida> node tuberia/avatares/construye.mjs   # meta → optimiza → <id>.vrm (+ .br/.zst/.gz) + catalogo.json
```

Junto a cada `<x>.vrm` de origen puede haber `<x>.avatar.json` (`id`, `nombre`, `descripcion`, `autor`, `licencia:{spdx,url}`, `fuente`, `colores_muneco`); `descarga.mjs` lo escribe. Opciones de `construye.mjs`: `--origen`, `--salida`, `--compresion cuantizacion|meshopt|ninguna`, `--topes <json>`. Salida: una línea JSON con los aceptados y los **rechazados con sus motivos**; sale con 1 si rechazó alguno (los rechazados no se escriben). Ambas carpetas deben estar **fuera del repo** (o en `pruebas/salida/`). En local, la salida es la `GEMELO_AVATARES` que sirve el entorno ([DESARROLLO-LOCAL](../doc/operacion/DESARROLLO-LOCAL.md)); en producción, `/srv/gemelo/publicado/avatares/` (legible por todos, `0644`/`0755`).

## 6. Los topes

Los del ADR-0020 §2, que son **valores de partida sin medir en aparatos** (P7e los ajusta): objetivo 15.000 triángulos, máximo 20.000, 2 MB por fichero, texturas ≤ 1024 px, ≤ 3 texturas y ≤ 4 materiales (el ADR dice «primitivas fundidas por material»: la tubería **no funde** —rompería los índices de VRM—, así que el tope se aplica a materiales y `primitivas` se informa). Un avatar que los pase se rechaza (`--topes` los cambia con motivo). Los cuatro provisionales los cumplen con holgura (3,5-6 k triángulos, 1 material, 1 textura): el catálogo final de Cano & Damas puede ser mucho más rico.

## 7. Qué NO está probado

- El motor (P7c) todavía no lee este contrato; la portada (P7d) sí (§8).
- Que Caddy sirva los precomprimidos y las cabeceras de verdad (probado el **texto** de los Caddyfile; no se levantó Docker). `infra/probar-caddy.sh` no cubre `/avatares`.
- Ningún avatar en un navegador, un iPhone o unas Quest. La optimización conserva las extensiones de VRM (comprobado por JSON y por geometría), pero que three-vrm los anime igual que el original **no se ha visto**.
- Los colores del muñeco de los provisionales son **supuestos** a ojo.

## 8. La portada (P7d)

La pantalla del avatar ([UX §4.7](../doc/sistema/UX.md)) lee `/avatares/catalogo.json` (tras sesión; sin él, 404 o vacío, solo ofrece el muñeco), enseña `nombre` y `descripcion` como lista de radios y, con WebGL, una vista previa 3D (`apps/web/portada/vista3d.js`, cargada con `import()` solo en esa pantalla; `@pixiv/three-vrm` 3.5.5 y `three` 0.186.1 como el motor). Pide `/avatares/<fichero>?v=<sha256>`, comprueba la huella del `ArrayBuffer` y, si no coincide o falla, se queda sin vista 3D (el avatar se elige igual). Guarda la elección con `PUT /api/yo/avatar` (`vrm` = el `id`; `null` o ausente = el muñeco) y la lee con `GET /api/yo/avatar` ([api.openapi.yaml](api.openapi.yaml)); la api la guarda en `avatares.vrm` (migración `0003_avatar_vrm.sql`, `CHECK` con el mismo patrón de `id`) y la pone en los metadatos de presencia como `avatar.vrm` **solo si hay uno**. La api **no conoce el catálogo**: un `id` que ya no esté lo trata el cliente como ausente (muñeco). Los créditos: la pantalla «Créditos de los avatares» lista `autor`, `licencia` (`spdx` con su `url`, solo si es https), `texto_credito` y `fuente`; los de `credito_obligatorio` aparte.

## 9. La v2: cuerpos, piezas, paletas y receta (AV4, [ADR-0025](../doc/adr/0025-avatares-por-piezas-contrato-v2.md))

**Un VRM por cuerpo con todas sus piezas dentro** (pelo, vello, ropa de faena, sombreros), cada una una malla con nombre propio pesada al mismo esqueleto y ajustada a ese cuerpo, hechas por el mismo guion (`tuberia/avatares/creador/cuerpos.py`). El motor enseña las de la receta, oculta las demás (lo oculto ni se dibuja ni se sube a la GPU) y tiñe por nombre de material. Lo escribe `tuberia/avatares/creador/catalogo.mjs`; el esquema es el mismo fichero (`oneOf` v1 / v2).

| Campo | Contenido |
|---|---|
| `v` | 2 |
| `compresion`, `topes` | como en v1; los `topes` son los del **fichero** de cada cuerpo (lleva todas sus piezas: más triángulos y materiales que un avatar cerrado) |
| `topes_combinacion` | `{triangulos, primitivas}`: lo que se **dibuja** de un avatar completo (cuerpo + la pieza más cara de cada tipo). Es el presupuesto que cuenta para el Quest (26b dibuja 3 a la vez); lo comprueba `comprueba.mjs` |
| `paletas` | `piel` (10, índice = `tono`), `ropa` (10, índice = `arriba` / `abajo`), `pelo` (7-10, índice = `pelo_color`, con canoso y blanco): `{id, nombre, color}`. **Las mismas** que `Aspecto` del motor (`26_presencia.js`) y que la portada: de lejos y de cerca, el mismo color (C13). Lo vigila el guardián |
| `cuerpos[]` | `id`, `nombre`, `descripcion?`, `edad` (`peque`\|`joven`\|`adulta`\|`mayor`), `complexion` (`delgada`\|`media`\|`ancha`), **`ofrecer`** (los peques, `false`: decisión 132; la portada no los enseña y el motor los trata como ausentes), `fichero`, `sha256`, `bytes`, `vrm_version`, `triangulos` y `primitivas` (del cuerpo solo), `materiales` y `texturas` (del fichero), `autor`, `licencia`, `fuente`, `piezas` (ids que trae dentro) y `mirada` (`huesos`\|`expresion`\|`ninguna`: si `VRMLookAt` mueve los ojos) |
| `piezas[]` | `id`, `tipo` (`pelo`\|`vello`\|`ropa`\|`accesorio`), `nombre`, `malla` (nombre del nodo en el VRM: `pieza_<id>`), `materiales` (con qué se tiñe), `triangulos` (el máximo entre cuerpos), `cubre_ropa_base?` (con ella no se dibuja la ropa base del cuerpo, que va debajo), `sombrero?` (`paja`\|`gorra`: el del muñeco al que equivale), `color?` (fijo, para lo que no se tiñe con la receta), `edades?` (por talla, **nunca** por sexo: C5) |
| `avatares[]?` | los cerrados de la v1 (provisionales, decisión 134), con `avatar.vrm` como siempre |

**Sin campo de sexo ni de género** en ningún sitio (C8); los nombres y descripciones pasan la lista negra de C9 (guardián).

**Tinte (motor, decisión 128).** Por nombre de material, sobre blanco y sin texturas: `piel` ← `paletas.piel[tono]`; `ropa_base` ← `paletas.ropa[arriba]`; `ropa_abajo` ← `paletas.ropa[abajo]`; `pelo` (pelo y vello) ← `paletas.pelo[pelo_color]`; `sombrero` ← el `color` de la pieza; `ojos`, como viene.

**La receta** (en `avatar` de los metadatos de presencia; campos **opcionales** del contrato [presencia](presencia.md) v1; la api valida su forma y que el JSON de los campos de AV4 —`cuerpo`, `pelo`, `pelo_color`, `vello`, `ropa`, `acc`— no pase de **200 bytes** (400 `receta_larga`; la más larga del catálogo de hoy, ≈ 105); los de AV2 son listas cerradas, ≤ 100 bytes más; no conoce el catálogo):

| Campo | Valores | Si falta o no está en el catálogo |
|---|---|---|
| `cuerpo` | id de `cuerpos[]` con `ofrecer: true` | sin cuerpo: manda `vrm` (v1) y, si tampoco, el muñeco |
| `pelo`, `vello`, `ropa` | id de `piezas[]` de ese tipo | sin pieza (sin pelo, sin vello, la ropa base) |
| `pelo_color` | 0-9 (índice de `paletas.pelo`) | el primero |
| `acc` | lista de ≤ 3 ids de `piezas[]` de tipo `accesorio` | ninguno; el `sombrero` de siempre (`paja`/`gorra`) enseña la pieza con ese `sombrero` |
| `tono`, `arriba`, `abajo`, `altura`, `complexion`, `movilidad` | los de AV2 ([presencia](presencia.md)) | los de AV2 |

Con `cuerpo`, la `altura` escala el VRM (×0,93 / ×1 / ×1,07) y la `complexion` de la receta debe ser la del cuerpo (la portada la copia: el muñeco lejano se ensancha igual). Con `movilidad = silla`, el VRM va sentado (la postura del quad, con los brazos a las ruedas) y la silla del muñeco se dibuja con él.

**Compatibilidad.** Un cliente con el lector v1 ve `v: 2` como «sin catálogo»: todos los avatares le salen como el muñeco (teñido con la receta, AV2). Un cliente v2 lee también un catálogo v1. Con `cuerpo` y `vrm` a la vez, manda `cuerpo` si se puede dibujar.

**Qué no está probado (v2):** iPhone, Quest y una GPU de verdad (los costes son recuentos); el acabado de pelo, vello, ropa y sombreros lo revisa una persona con las capturas (decisión 130); que el VRM sentado encaje con la silla del muñeco de cerca.
