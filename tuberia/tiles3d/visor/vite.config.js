// Build del visor de prueba del prototipo F1d (no es apps/web). Salida en dist/ (o GEMELO_T3D_SALIDA); el tileset se sirve al lado, en tileset/.
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  logLevel: "warn",
  build: { outDir: process.env.GEMELO_T3D_SALIDA || "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
