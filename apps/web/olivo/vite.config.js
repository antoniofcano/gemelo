// Dos builds del constructor de olivos (vite 6.4.5, devDependency de apps/web/olivo):
//   vite build                  → la herramienta (herramienta/index.html) en GEMELO_OLIVO_SALIDA o apps/web/olivo/dist/herramienta, con las fotos
//                                 de texturas/ servidas en su raíz
//   GEMELO_OLIVO_IIFE=1 vite build → olivo.iife.js (global OlivoGen) en GEMELO_OLIVO_SALIDA o apps/web/olivo/dist/iife, para la salida artefacto
//                                 (un <script> clásico): «three-gen» NO se empaqueta, se toma del THREE global (el r128 de cdnjs del gemelo)
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OLIVO = path.dirname(fileURLToPath(import.meta.url));
const IIFE = !!process.env.GEMELO_OLIVO_IIFE;

export default defineConfig(IIFE ? {
  logLevel: "warn",
  publicDir: false,
  resolve: { alias: [{ find: "./crea_trabajador.js", replacement: path.join(OLIVO, "sin_trabajador.js") }] },
  build: {
    outDir: process.env.GEMELO_OLIVO_SALIDA || path.join(OLIVO, "dist", "iife"),
    emptyOutDir: true, target: "es2019", minify: true,
    lib: { entry: path.join(OLIVO, "index.js"), name: "OlivoGen", formats: ["iife"], fileName: () => "olivo.iife.js" },
    rollupOptions: { external: ["three-gen"], output: { globals: { "three-gen": "THREE" } } },
  },
} : {
  root: path.join(OLIVO, "herramienta"),
  base: "./",
  logLevel: "warn",
  publicDir: path.join(OLIVO, "texturas"),
  worker: { format: "es" },
  build: { outDir: process.env.GEMELO_OLIVO_SALIDA || path.join(OLIVO, "dist", "herramienta"), emptyOutDir: true, target: "es2020", chunkSizeWarningLimit: 4000 },
});
