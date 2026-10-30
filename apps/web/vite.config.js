// Build del cliente web (ADR-0010). La raíz es la carpeta que genera herramientas/genera_motor.mjs (por defecto .generado/).
// three entra como módulo ES (`import * as THREE from "three"`), con la versión exacta de package.json (ADR-0016).
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const WEB = path.dirname(fileURLToPath(import.meta.url));
// el constructor de olivos (ADR-0017), que el motor pide con import("gemelo-olivo") solo con ?olivos=gen; si apps/web/olivo no está instalado
// (cd apps/web/olivo && npm i), un sustituto vacío: el build no falla y el motor dibuja lo de siempre
const OLIVO = fs.existsSync(path.join(WEB, "olivo", "node_modules", "three-gen", "package.json")) ? path.join(WEB, "olivo", "index.js") : path.join(WEB, "olivo", "sin_olivo.js");
// la escena 3D Tiles: el motor pide import("3d-tiles-renderer") al abrir una finca con tileset; la librería es obligatoria (apps/web: npm ci).
// Su build importa «three» y «three/addons/…»: por eso los alias de three son exactos
const TILES = path.join(WEB, "node_modules", "3d-tiles-renderer", "build", "index.js");
if (!fs.existsSync(TILES)) throw new Error("falta 3d-tiles-renderer: cd apps/web && npm ci");

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
      // @pixiv/three-vrm (P7c, avatares VRM): import() solo con presencia y alguien con avatar del catálogo; su build ES solo importa «three»
      { find: /^@pixiv\/three-vrm$/, replacement: path.join(WEB, "node_modules", "@pixiv", "three-vrm", "lib", "three-vrm.module.js") },
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
