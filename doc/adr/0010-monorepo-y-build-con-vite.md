# ADR-0010 — Monorepo y paso de build con Vite

- **Estado:** Aceptado
- **Fecha:** 2026-10-28 (aprobado por Antonio con el plan multiusuario)

## Contexto
El motor era un único `<script>` sin módulos, montado por `montar_v2.py` con three r128 de cdnjs y los datos en línea. Llevarlo a un servidor multiusuario ([ADR-0009](0009-plataforma-multiusuario-cuarenta-hazas.md)) exige paquetes de npm (`livekit-client`, PWA), versiones fijadas y una CSP estricta sin scripts en línea, y añade piezas nuevas (api, tubería de teselas, infraestructura) que necesitan su sitio.

## Decisión
El repo pasa a ser un monorepo: `apps/web/` (cliente: `motor/` = el antiguo `src/` sin cambios, `herramientas/genera_motor.mjs`, `vite.config.js`, `plantilla.html`), `apps/api/` (más adelante), `tuberia/` (exportadores y `datos/`, con `salida_artefacto/montar_v2.py` como salida secundaria sin servidor), `contratos/`, `infra/` (más adelante), `pruebas/` y `doc/`. El cliente se empaqueta con **Vite**; en la fase 0 la entrada es `import * as THREE from "three"` + la concatenación exacta del motor, con **three fijado a 0.128.0** (el mismo r128). Subir three es la fase 1c, con su propio ADR.

## Alternativas consideradas
- **Seguir sin build** (UMD desde CDN) — no da CSP `script-src 'self'` limpia ni versiones fijadas, y la CSP de producción prohibiría el script en línea.
- **Convertir ya cada módulo en módulo ES** — mucho cambio sin beneficio inmediato; se hará módulo a módulo cuando haga falta, con el mismo guardián de contratos.
- **esbuild/webpack/rollup a mano** — Vite trae servidor de desarrollo, HTML y PWA con menos configuración.

## Consecuencias
- **Positivas:** el motor no cambia (lo prueba `web.test.js`: la página de Vite dibuja lo mismo que la artefacto); hay sitio para la api y la infraestructura.
- **Negativas / coste:** dependencias de npm que mantener (`apps/web/package.json`); dos salidas mientras se conserve la artefacto.
- **Supera:** la convención «ES5, un solo `<script>`, sin módulos ni transpilado» de CLAUDE.md §5 (el motor sigue sin módulos por dentro, pero se empaqueta).

## Comprobación
`pruebas/guardianes/web.test.js`: la entrada es exactamente la concatenación, three es 0.128.0, y la página empaquetada carga sin errores con los mismos recuentos que la artefacto (tolerancia: 2 unidades o 2 %, por la variación propia del motor entre cargas). **Datos aún en línea** en la página; pasan a pedirse a la api en la fase 1a.
