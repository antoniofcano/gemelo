---
name: publicar-artefacto
description: Receta paso a paso para publicar el gemelo como artefacto de claude.ai (página más ficheros de apoyo por files) respetando los límites de la plataforma. Úsala solo cuando Antonio pida publicar o actualizar un artefacto; siempre con su confirmación sobre la lista exacta de ficheros.
---

# Publicar un artefacto

Fuente de verdad de los límites: [PUBLICACION.md](../../../doc/operacion/PUBLICACION.md) y `contratos/publicacion.json`. **Publicar es un acto externo y puede quedar cacheado: se confirma antes, siempre** (CLAUDE.md regla 9). Un artefacto con `D.ot` (datos de OlivarTrack) se publica **privado**.

## Pasos
1. **Puerta en verde** (`npm run puerta`) y release hecha si es una versión.
2. **Montar a una carpeta de trabajo** (en el *scratchpad* o `pruebas/salida/`, nunca en el repo versionado):
   - Cerro (embebido): `python montar_v2.py --finca cerro --salida <trabajo>/cerro/index.html` → una sola página, **≤ 16 MB**.
   - Hituelo (ficheros): `python finca_8_teselas.py --finca hituelo` y `python montar_v2.py --finca hituelo --modo ficheros --salida <trabajo>/hituelo/index.html` → página + `t/` al lado.
3. **Comprobar límites** (el guardián `build` lo hace con el fixture; con datos reales, a mano): página ≤ 16 MB; cada binario ≤ 15 MB; **≤ 64 MB y ≤ 255 ficheros por publicación**; ≤ 511 ficheros y 256 MB por versión; solo tipos web (json, jpg…; **nunca `.bin`**). Hituelo ≈ 57 MB y 93 ficheros: cabe en una publicación con ≈7 MB de margen.
4. **Lista de `files`**: `{"t/<kx>_<ky>.json": "<origen>", "t/<kx>_<ky>.jpg": "<origen>"}`; la ruta publicada es relativa y sin barra inicial; la página referencia `t/…` (D.base vacío).
5. **Capacidades:** `mcp` solo si la historia lee en vivo (Cerro); los conectores por su nombre visible (`Olivartrack`, `Vigia`). Cargar las skills `artifact-design` y `artifact-capabilities` antes de escribir la página.
6. **Pedir confirmación a Antonio** con: finca, versión, tamaño total, nº de ficheros, privacidad y si **crea** un artefacto nuevo o **actualiza** uno (con su `url`).
7. **Publicar** (herramienta Artifact). Si hay más de 255 ficheros o 64 MB, en tandas a la **misma `url`**.
8. **Verificar que lo publicado es lo nuevo**: leer el artefacto de vuelta (`read`), comparar tamaño y versión; no dar nada por hecho. Si falta alguna tesela, repetir con solo las que faltan.
9. **Anotar** en ESTADO (qué hay publicado y versión). El enlace de un artefacto privado **no** se escribe en el repo público.

## Lo que un agente NO puede confirmar
Con la sesión del agente (sin navegador autenticado) **no se puede ver** si el marco de artefactos deja hacer `fetch` e `<img>` de los ficheros de apoyo ni si las teselas cargan: **solo una persona** abriendo el enlace lo confirma (prueba 0 «a medias»). Dilo en el resumen y apunta el plan B de [RUNBOOK](../../../doc/operacion/RUNBOOK.md).

## Limpieza
Borrar el artefacto desechable de la prueba de plataforma es una acción irreversible: **solo si Antonio lo pide**, tras mirar qué se borra.
