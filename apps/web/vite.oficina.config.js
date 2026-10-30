// Build de la oficina (apps/web/oficina/, doc/sistema/OFICINA.md, ADR-0024): entrada aparte, sin three ni motor.
// Sale a apps/web/dist-oficina/, que se sirve en «/oficina/» SOLO con sesión de oficina (infra/Caddyfile: root /srv con
// /srv/oficina; en dev, infra/dev/compose.yml). Como la portada: assets/ con hash (caché inmutable) y nada en línea
// (CSP estricta: script-src 'self'; style-src 'self').
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(WEB, "oficina"),
  base: "/oficina/",
  logLevel: "warn",
  build: {
    outDir: process.env.GEMELO_OFICINA_SALIDA || path.join(WEB, "dist-oficina"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,             // nada en data: ni en línea
    chunkSizeWarningLimit: 700,       // el trozo de Hazas (OpenLayers + proj4, ≈ 560 kB) va aparte y solo se pide al entrar en la sección
  },
});
