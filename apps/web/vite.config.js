// Build del cliente web (ADR-0010). La raíz es la carpeta que genera herramientas/genera_motor.mjs (por defecto .generado/).
// three entra como módulo ES (`import * as THREE from "three"`), con la versión exacta de package.json (ADR-0016).
import { defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
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

// I6: los modelos de los mandos y de las manos en VR (XRControllerModelFactory / XRHandModelFactory de three) salen de @webxr-input-profiles/assets
// (MIT, versión fijada en package.json), servidos del MISMO origen en <página>/xr/perfiles/ (CLAUDE.md §5: el motor no pide a otros hosts).
// Solo los perfiles que puede anunciar un Quest (1/2/3/3S/Pro) y los genéricos de respaldo; profilesList.json se recorta a ellos, para que un
// perfil que no copiamos no apunte a un 404 y caiga en el genérico. generic-trigger es el perfil por defecto de la fábrica (DEFAULT_PROFILE).
export const PERFILES_XR = ["meta-quest-touch-plus", "meta-quest-touch-plus-v2", "meta-quest-touch-pro", "oculus-touch-v2", "oculus-touch-v3",
  "generic-trigger", "generic-trigger-squeeze-thumbstick", "generic-hand"];
export const RUTA_XR = "xr/perfiles";
const XR_ORIGEN = normalizePath(path.join(WEB, "node_modules", "@webxr-input-profiles", "assets"));
const XR_CDN = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles";
// red de seguridad: si alguien olvida setPath(), las fábricas de three no deben ir a jsDelivr; su ruta por defecto pasa a ser la nuestra (y si three
// cambia esa constante, el build falla aquí en vez de abrir otro origen sin que nadie lo vea)
function perfilesXrSinCdn() {
  return {
    name: "gemelo-perfiles-xr-sin-cdn",
    transform(code, id) {
      if (!/[\\/]webxr[\\/](XRControllerModelFactory|XRHandMeshModel)\.js$/.test(id)) return null;
      if (!code.includes(XR_CDN)) throw new Error("three ya no trae la ruta de jsDelivr esperada en " + id + ": revisa vite.config.js (I6)");
      return { code: code.split(XR_CDN).join("./" + RUTA_XR), map: null };
    },
  };
}

// la versión del gemelo (fichero VERSION de la raíz del repo) para la telemetría de fluidez (PB9): el motor la manda con la medida si la persona la envía
const VERSION = (() => { try { return fs.readFileSync(path.join(WEB, "..", "..", "VERSION"), "utf8").trim(); } catch { return "dev"; } })();

export default defineConfig({
  define: { __GEMELO_VERSION__: JSON.stringify(VERSION) },
  root: process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"),
  base: "./",
  // el manifiesto de aplicación web y su icono (decisión 90: en el iPhone, «Añadir a pantalla de inicio» abre la finca sin las barras de Safari);
  // la raíz es una carpeta generada, así que la carpeta pública se dice aquí
  publicDir: path.join(WEB, "public"),
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
  plugins: [
    perfilesXrSinCdn(),
    viteStaticCopy({
      silent: true,
      targets: [
        ...PERFILES_XR.map(p => ({ src: XR_ORIGEN + "/dist/profiles/" + p + "/*", dest: RUTA_XR + "/" + p })),
        { src: XR_ORIGEN + "/LICENSE.md", dest: RUTA_XR },
        { src: XR_ORIGEN + "/dist/profiles/profilesList.json", dest: RUTA_XR,
          transform: c => { const L = JSON.parse(c), o = {}; for (const k of Object.keys(L)) if (PERFILES_XR.includes(L[k].path.split("/")[0])) o[k] = L[k]; return JSON.stringify(o, null, 1); } },
      ],
    }),
  ],
  worker: { format: "es" },
  build: {
    outDir: process.env.GEMELO_WEB_SALIDA || path.join(WEB, "dist"),
    emptyOutDir: true,
    target: "es2019",
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
