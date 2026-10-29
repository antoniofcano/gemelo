// Build del cliente web (ADR-0010). La raíz es la carpeta que genera herramientas/genera_motor.mjs (por defecto .generado/).
// three entra como módulo ES (`import * as THREE from "three"`), con la versión exacta de package.json; la salida artefacto
// carga esa MISMA versión desde jsDelivr con un importmap (tuberia/salida_artefacto/montar_v2.py lee la versión de aquí, ADR-0016).
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const WEB = path.dirname(fileURLToPath(import.meta.url));
// el constructor de olivos (ADR-0017), que el motor pide con import("gemelo-olivo") solo con ?olivos=gen; si apps/web/olivo no está instalado
// (cd apps/web/olivo && npm i), un sustituto vacío: el build no falla y el motor dibuja lo de siempre
const OLIVO = fs.existsSync(path.join(WEB, "olivo", "node_modules", "three-gen", "package.json")) ? path.join(WEB, "olivo", "index.js") : path.join(WEB, "olivo", "sin_olivo.js");
// la escena 3D Tiles (?escena=tiles, F1d): el motor pide import("3d-tiles-renderer") solo con la bandera; sin la librería instalada, un sustituto
// sin TilesRenderer (el motor vuelve al relieve de siempre). Su build importa «three» y «three/addons/…»: por eso los alias de three son exactos
const T3D = path.join(WEB, "node_modules", "3d-tiles-renderer", "build", "index.js");
const TILES = fs.existsSync(T3D) ? T3D : path.join(WEB, "herramientas", "sin_tiles3d.js");

export default defineConfig({
  root: process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"),
  base: "./",
  logLevel: "warn",
  // la raíz puede estar fuera de apps/web (las pruebas la generan en pruebas/salida/): «three» se resuelve siempre al de apps/web/node_modules
  resolve: {
    alias: [
      { find: /^three$/, replacement: path.join(WEB, "node_modules", "three", "build", "three.module.js") },
      { find: /^three\/addons\//, replacement: path.join(WEB, "node_modules", "three", "examples", "jsm") + "/" },
      { find: /^gemelo-olivo$/, replacement: OLIVO },
      { find: /^3d-tiles-renderer$/, replacement: TILES },
      // livekit-client (F2, ?presencia=red): el motor lo pide con import() solo con esa bandera; sin ella no se descarga
      { find: /^livekit-client$/, replacement: path.join(WEB, "node_modules", "livekit-client", "dist", "livekit-client.esm.mjs") },
    ],
  },
  worker: { format: "es" },
  build: {
    outDir: process.env.GEMELO_WEB_SALIDA || path.join(WEB, "dist"),
    emptyOutDir: true,
    target: "es2019",
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
