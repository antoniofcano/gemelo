# Runbook: qué hacer si algo falla

Primero, siempre: abre la página con `?debug` y la consola del navegador. `window.__g.listo()` debe devolver `true`.

## No carga / se queda en «cargando»
1. Consola: ¿`PAGEERROR`? Casi siempre es un módulo con un error de sintaxis o un orden roto: `npm run puerta` (sintaxis) lo localiza.
2. `file://` sin servidor: el modo ficheros necesita `fetch` y no funciona; sirve con `python -m http.server 8000`.
3. three.js viene de cdnjs: sin red no hay motor.
4. Cerro embebido: ¿pesa más de 16 MB? La plataforma lo rechaza.

## Una tesela falla o falta
- Síntoma: hueco, relieve plano o ortofoto gris en un cuadrado de 256 m.
- Mira la pestaña de red: ¿404 en `t/<kx>_<ky>.json|jpg`? Falta el fichero o la clave del índice no coincide.
- Una tesela sin datos (fuera de parcelas + 60 m) es **un hueco por diseño** (pendiente M6).
- Mientras llega una tesela fina, el motor contesta con el relieve grueso de 8 m: no debe haber huecos, solo suavidad. Un hueco real es un bug.
- Tres teselas del borde norte de Hituelo tienen cobertura incompleta si faltan las hojas LiDAR 404-4181 y 406-4181 (conocido).
- Regenerar: `python finca_8_teselas.py --finca <finca>` (necesita los intermedios).

## El WMS del IGN no responde (al regenerar la ortofoto)
- Los scripts de `datos/` piden en trozos pequeños. Una petición grande se cuelga (comprobado con el WCS del MDT 5 m: 500×500 m responde en 0,2 s, la caja entera no responde en 60 s).
- Reintenta con trozos más pequeños; la ortofoto PNOA es la de 2022. El IGN cae a ratos: espera y repite, no cambies de fuente sin decidirlo.
- La página publicada **no** depende del IGN: la CSP impide pedirlo desde ella.

## Falla el marco de artefactos (ficheros de apoyo)
- Prueba 0 «a medias»: no se ha confirmado con sesión que `fetch` e `<img>` del mismo origen funcionen en el marco.
- Síntoma: la página carga pero las teselas dan error de red o CSP.
- **Plan B** (por orden): (1) probar `<img>` en vez de `fetch` para las ortofotos; (2) Hituelo en varias páginas, una por zona, que quepan cada una en 16 MB; (3) JSON/base64 como `assets` (ata la subida a una sesión de editor).
- Sin navegador autenticado, **solo una persona** puede confirmar que cargan: díselo a Antonio.
- Un `.bin` no se admite (tipos servidos: html, css, js, mjs, wasm, json, txt, csv, png, jpg, webp, svg, fuentes, mp3/mp4…). Por eso json/jpg ([ADR-0008](../adr/0008-ficheros-de-apoyo-json-jpg.md)).

## Va lento / se cierra la pestaña (móvil)
- `?debug`: mira ms de JS, llamadas y triángulos. SwiftShader no sirve para fps ([skill `medir`](../../.claude/skills/medir/SKILL.md)).
- Palancas: `Arboles.perfil`, calidad, distancias `U1`/`U2`, anillo de teselas. Mide antes y después.
- iPhone y Quest: **no probado**.

## VR no entra
- El botón solo aparece si `navigator.xr` soporta `immersive-vr`. La prueba con mock: `GEMELO_URL=… node pruebas/vr_mock.js` (necesita `mock_xr.js`, que **no está versionado**: recrearlo es la iniciativa P4 del PLAN).
- Mareo/comodidad: no probado en casco; si se prueba, anotar en ESTADO.

## Lecturas en vivo (OlivarTrack, Vigía) vacías
- Son datos de MCP, **no verificados** en vivo ([contratos/mcp.md](../../contratos/mcp.md)). La página funciona con los datos embebidos (`D.ot`) y los muestra con su fecha de consulta.
