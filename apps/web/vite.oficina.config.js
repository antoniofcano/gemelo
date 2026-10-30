// Build de la oficina (apps/web/oficina/, doc/sistema/OFICINA.md, ADR-0024): entrada aparte, sin three ni motor.
// Sale a apps/web/dist-oficina/, que se sirve en «/oficina/» SOLO con sesión de oficina (infra/Caddyfile: root /srv con
// /srv/oficina; en dev, infra/dev/compose.yml). Como la portada: assets/ con hash (caché inmutable) y nada en línea
// (CSP estricta: script-src 'self'; style-src 'self').
import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(fileURLToPath(import.meta.url));

// OF8 (Olivos > Olivo real): el constructor de olivos (ADR-0017), pedido con import("gemelo-olivo") solo al pulsar «Ver escalones» (un trozo aparte, con su three 0.128
// propio). Igual que el build del mundo: sin apps/web/olivo instalado (cd apps/web/olivo && npm ci), un sustituto vacío y la pestaña lo dice en vez de fallar el build.
const OLIVO = fs.existsSync(path.join(WEB, "olivo", "node_modules", "three-gen", "package.json")) ? path.join(WEB, "olivo", "index.js") : path.join(WEB, "olivo", "sin_olivo.js");

export default defineConfig({
  root: path.join(WEB, "oficina"),
  base: "/oficina/",
  logLevel: "warn",
  resolve: { alias: [{ find: /^gemelo-olivo$/, replacement: OLIVO }] },
  worker: { format: "es" },
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
