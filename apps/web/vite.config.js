// Build del cliente web (ADR-0010). La raíz es la carpeta que genera herramientas/genera_motor.mjs (por defecto .generado/).
// three se fija a 0.128.0 (el mismo r128 que la salida artefacto toma de cdnjs): subirlo es la fase 1c, con su ADR.
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"),
  base: "./",
  logLevel: "warn",
  resolve: { alias: { three: path.join(WEB, "node_modules", "three", "build", "three.module.js") } },
  build: {
    outDir: process.env.GEMELO_WEB_SALIDA || path.join(WEB, "dist"),
    emptyOutDir: true,
    target: "es2019",
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
