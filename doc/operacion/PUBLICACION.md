# Publicación

No hay servidor ni hosting: el gemelo se publica como **artefacto de claude.ai** (página + ficheros de apoyo) o como **HTML estático** (cualquier servidor de ficheros). **Publicar lo decide Antonio** (CLAUDE.md regla 9): un agente prepara la carpeta, lista lo que subirá y espera el OK. Receta paso a paso: [skill `publicar-artefacto`](../../.claude/skills/publicar-artefacto/SKILL.md).

## Límites de la plataforma de artefactos
(Leídos de las instrucciones de la herramienta y del contrato 0.2.90; ver [ADR-0008](../adr/0008-ficheros-de-apoyo-json-jpg.md). Lo marcado **[SUPUESTO]** no está comprobado.)

| Mecanismo | Límite |
|---|---|
| Página HTML (todo embebido) | ≤ 16 MB, incluidos los `data:` |
| `files` (ficheros de apoyo, rutas relativas) | texto ≤ 16 MB; binario ≤ 15 MB por fichero; **64 MB y 255 ficheros por publicación**; **511 ficheros / 256 MB por versión**; solo tipos web estándar; se pueden añadir en publicaciones sucesivas a la misma `url` |
| Tipos admitidos | html, css, js, mjs, wasm, json, txt, csv, png, jpg, webp, svg, fuentes, mp3/mp4… **Un `.bin` no se admite** (comprobado al publicar la prueba 0) |
| `assets` | 20 MiB por activo; exige la capacidad `db`; solo editores suben; ata a una sesión |
| `fetch` a otros hosts | bloqueado por la CSP (solo scripts de cdnjs/jsdelivr/unpkg/tailwind/jquery y hojas de Google Fonts) |
| `fetch` y `<img>` del mismo origen a ficheros de apoyo | **[SUPUESTO] sin comprobar con sesión** (prueba 0 «a medias») |
| Conectores MCP | capacidad `mcp`; los conectores se referencian por su **nombre visible** |

## Formato de los ficheros de apoyo
`t/<kx>_<ky>.json` (relieve, copa, suelo, nube en base64) y `t/<kx>_<ky>.jpg` (ortofoto 512²). Sin binario crudo. Detalle en [CONTRATOS](../sistema/CONTRATOS.md#4-contrato-de-publicación).

## Receta resumida
1. Puerta en verde (`npm run puerta`).
2. Montar la finca (`montar_v2.py`) a una **carpeta de trabajo fuera de `publicar/` versionado** (`publicar/` ya está ignorado por git).
3. Hituelo: ≈52 MB de teselas + página de ≈4,6 MB ≈ 57 MB en 93 ficheros: **cabe en una publicación (64 MB, 255 ficheros) con ≈7 MB de margen**. Si crece, partir en tandas a la misma `url`.
4. Lista de `files` con ruta publicada → ruta de origen; capacidades (`mcp` si la historia lee en vivo).
5. **Pedir confirmación** a Antonio con la lista.
6. Publicar; verificar que lo publicado es lo nuevo (leer el artefacto de vuelta, comparar tamaño/versión).
7. Anotar en ESTADO (enlace **no** en el repo público si el artefacto es privado: ver DECISIONS-PENDING).
8. Recordar: sin navegador autenticado, **solo una persona** puede confirmar que las teselas cargan en el marco.

## Qué no se publica
Datos de la explotación no destinados a ello, claves, rutas locales. El artefacto herda la privacidad del enlace: si lleva datos de OlivarTrack (`D.ot`), es **privado por defecto**.
