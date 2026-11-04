// F2b (doc/sistema/MULTIVIEW.md, F2; ADR-0031): construye las tres builds de la página de humo, una por renderizador, porque dos three no
// pueden convivir en la misma página (clases distintas). Cada una sale en <salida>/<modo>/humo.js con nombre fijo; <salida>/index.html y
// <salida>/elige.js (de pagina/) cargan la que pida ?modo=.
//   clasico → three 0.186.1, WebGLRenderer sin multiview          (src/entrada_clasico.js)
//   super   → super-three 0.185.0, WebGLRenderer con multiviewStereo (src/entrada_super.js; el alias «three» apunta a super-three)
//   nuevo   → three 0.186.1, WebGPURenderer({ forceWebGL: true, multiview })   (src/entrada_nuevo.js)
// Los alias de three los da apps/web/herramientas/builds.mjs (los mismos que la build de VR del gemelo: regla 12), con este node_modules.
// Uso: node construye.mjs [clasico|super|nuevo …]   (sin nada, las tres). HUMO_SALIDA=<carpeta> cambia dist/.
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aliasThree } from "../../apps/web/herramientas/builds.mjs";
import { puroDelMotor } from "./herramientas/puro.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const MODOS = ["clasico", "super", "nuevo"];
const SALIDA = process.env.HUMO_SALIDA ? path.resolve(process.env.HUMO_SALIDA) : path.join(AQUI, "dist");

function alias(modo) {
  const nm = path.join(AQUI, "node_modules");
  if (!fs.existsSync(path.join(nm, "three", "package.json"))) throw new Error("faltan las dependencias: cd prototipos/multiview && npm ci");
  // super: la build «vr» de builds.mjs (todo «three» y «three/…» a super-three); clasico y nuevo: la de «pantalla» (three) más three/webgpu y three/tsl
  const a = modo === "super" ? aliasThree("vr", AQUI, { GEMELO_SUPER_THREE: path.join(nm, "super-three") }) : aliasThree("pantalla", AQUI, {});
  if (modo === "nuevo") a.unshift(
    { find: /^three\/webgpu$/, replacement: path.join(nm, "three", "build", "three.webgpu.js") },
    { find: /^three\/tsl$/, replacement: path.join(nm, "three", "build", "three.tsl.js") });
  return a;
}

export async function construye(modo, salida = SALIDA) {
  if (!MODOS.includes(modo)) throw new Error("modo " + modo + " no existe (" + MODOS.join(" | ") + ")");
  await build({
    configFile: false, root: path.join(AQUI, "src"), base: "./", publicDir: false, logLevel: "warn",
    define: { __MODO__: JSON.stringify(modo) },
    resolve: { alias: alias(modo) },
    plugins: [puroDelMotor()],
    build: {
      outDir: path.join(salida, modo), emptyOutDir: true, target: "es2020", sourcemap: false, minify: true, chunkSizeWarningLimit: 4000,
      rollupOptions: { input: path.join(AQUI, "src", "entrada_" + modo + ".js"), output: { entryFileNames: "humo.js", chunkFileNames: "trozo-[hash].js", assetFileNames: "[name]-[hash][extname]" } },
    },
  });
}

export async function construyeTodo(modos = MODOS, salida = SALIDA) {
  fs.mkdirSync(salida, { recursive: true });
  for (const m of modos) await construye(m, salida);
  for (const f of ["index.html", "elige.js"]) fs.copyFileSync(path.join(AQUI, "pagina", f), path.join(salida, f));
  return salida;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pedidos = process.argv.slice(2);
  const s = await construyeTodo(pedidos.length ? pedidos : MODOS);
  console.log("humo multiview: " + (pedidos.length ? pedidos.join(", ") : MODOS.join(", ")) + " → " + path.relative(process.cwd(), s));
}
