# Runbook: qué hacer si algo falla

Primero, siempre: abre la página con `?debug` y la consola del navegador. `window.__g.listo()` debe devolver `true`.

## No carga / se queda en «cargando»
1. Consola: ¿`PAGEERROR`? Casi siempre es un módulo con un error de sintaxis o un orden roto: `npm run puerta` (sintaxis) lo localiza.
2. `file://` no sirve: la página necesita `fetch` a `t/` y al tileset del mismo origen; sírvela con el entorno local (`npm run dev:arriba`) o una página de pruebas.
3. Panel «Esta finca no tiene escena»: el índice no trae `tileset` o el tileset falló (el panel dice el motivo y la consola trae un `console.error`). Mira que `tileset/tileset.json` se sirva del mismo origen y que el índice apunte a él.

## Una tesela falla o falta
- Síntoma: hueco, relieve plano o ortofoto gris en un cuadrado de 256 m.
- Mira la pestaña de red: ¿404 en `t/<kx>_<ky>.json|jpg`? Falta el fichero o la clave del índice no coincide.
- Una tesela sin datos (fuera de parcelas + 60 m) es **un hueco por diseño** (pendiente M6).
- Mientras llega una tesela fina, el motor contesta con el relieve grueso de 8 m: no debe haber huecos, solo suavidad. Un hueco real es un bug.
- Tres teselas del borde norte de Hituelo tienen cobertura incompleta si faltan las hojas LiDAR 404-4181 y 406-4181 (conocido).
- Regenerar: `python tuberia/finca_8_teselas.py --finca <finca>` (necesita los intermedios).

## El WMS del IGN no responde (al regenerar la ortofoto)
- Los scripts de `tuberia/datos/` piden en trozos pequeños. Una petición grande se cuelga (comprobado con el WCS del MDT 5 m: 500×500 m responde en 0,2 s, la caja entera no responde en 60 s).
- Reintenta con trozos más pequeños; la ortofoto PNOA es la de 2022. El IGN cae a ratos: espera y repite, no cambies de fuente sin decidirlo.
- La página servida **no** depende del IGN: el motor solo pide a su mismo origen y la CSP lo impide.

## Va lento / se cierra la pestaña (móvil)
- `?debug`: mira ms de JS, llamadas y triángulos. SwiftShader no sirve para fps ([skill `medir`](../../.claude/skills/medir/SKILL.md)).
- Palancas: `Arboles.perfil`, calidad, distancias `U1`/`U2`, anillo de teselas. Mide antes y después.
- iPhone y Quest: **no probado**.

## VR no entra
- El botón solo aparece si `navigator.xr` soporta `immersive-vr`. La prueba con mock: `node pruebas/prueba_vr.js <url> <prefijo>` (usa `pruebas/mock_xr.js`; la prueba completa es opcional con `GEMELO_VR=1`, ver [VR.md](../sistema/VR.md)).
- Mareo/comodidad: no probado en casco; si se prueba, anotar en ESTADO.

## Lecturas en vivo (OlivarTrack, Vigía) vacías
- Son datos de MCP, **no verificados** en vivo ([contratos/mcp.md](../../contratos/mcp.md)). La página funciona con los datos embebidos (`D.ot`) y los muestra con su fecha de consulta.
