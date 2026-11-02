// Build de la portada y las pantallas de entrada (apps/web/portada/, UX.md §4; decisión 56: la portada vive en apps/web).
// Sale a apps/web/dist-portada/, que se sirve en «/» (infra/Caddyfile: root /srv/portada; en dev, infra/dev/compose.yml).
// Una sola dependencia, @simplewebauthn/browser (OF13b-7, regla 12), que se pide con import() al abrir «Entrar» y no pesa en el arranque. Vite pone hash a los nombres (assets/ con caché inmutable) y deja el JS y el CSS en ficheros
// propios, sin nada en línea (CSP estricta: script-src 'self'; style-src 'self').
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(WEB, "portada"),
  base: "/",
  logLevel: "warn",
  build: {
    outDir: process.env.GEMELO_PORTADA_SALIDA || path.join(WEB, "dist-portada"),
    emptyOutDir: true,
    target: "es2022",                 // await de primer nivel en el módulo
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,             // nada en data: ni en línea
  },
});
