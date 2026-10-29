// Build del visor de prueba del prototipo F1d (no es apps/web). Salida en dist/ (o GEMELO_T3D_SALIDA); el tileset se sirve al lado, en tileset/.
// La página (index.html) se escribe aquí y no se versiona: la raíz ignora *.html y build.test.js solo admite apps/web/plantilla.html.
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const PAGINA = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visor 3D Tiles (prototipo)</title>
  <style>
    html, body { margin: 0; height: 100%; background: #b8c8d8; overflow: hidden; font: 13px system-ui, sans-serif; }
    #aviso { position: fixed; left: 8px; bottom: 8px; padding: 4px 8px; background: rgba(255, 255, 255, 0.8); border-radius: 4px; }
  </style>
</head>
<body>
  <div id="aviso">Prototipo F1d: tileset sintético en 3D Tiles 1.1 (no son datos reales). Copas medidas en la fuente; troncos ilustrativos.</div>
  <script type="module" src="./main.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(import.meta.dirname, "index.html"), PAGINA);

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  logLevel: "warn",
  build: { outDir: process.env.GEMELO_T3D_SALIDA || "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
