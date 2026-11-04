// Las dos builds del mismo motor (ADR-0031, decisión de Antonio del 2026-11-04; doc/sistema/MULTIVIEW.md «Dos builds»). La de VR construye (F2a) y aún
// no se publica ni la elige la página (F2c):
//   · «pantalla» (por defecto, la de siempre): three (apps/web/package.json, hoy 0.186.1) → apps/web/dist/. Escritorio y móvil; más adelante, el
//     WebGPURenderer + TSL material a material (F4).
//   · «vr» (GEMELO_BUILD=vr): el alias «three» apunta a super-three (la variante MIT de three que mantiene A-Frame, 0.185.0: multiview en el
//     WebGLRenderer clásico, `multiviewStereo`, y conserva onBeforeCompile) → apps/web/dist-vr/. Solo para el Quest, y solo si la prueba de humo F2 lo
//     justifica. super-three va en apps/web/package.json con versión exacta (F2a; GEMELO_SUPER_THREE=<carpeta del paquete> para probar otra).
//     El multiview lo pide el motor (03_escena, perilla xrmv de 02f_xr_perillas); este fichero solo cambia el three.
// No pueden convivir dos three en la misma página (clases distintas: instanceof falla): todo lo que importa «three» o «three/…» (el motor,
// 3d-tiles-renderer, three-vrm, three-mesh-bvh, gemelo-olivo) se resuelve a la MISMA carpeta. La página elige la build al cargar: eligeBuild().
import fs from "node:fs";
import path from "node:path";

export const BUILDS = Object.freeze({
  pantalla: Object.freeze({ paquete: "three", salida: "dist" }),
  vr: Object.freeze({ paquete: "super-three", salida: "dist-vr", version: "0.185.0" }),
});

/** La build pedida por el entorno (GEMELO_BUILD): «pantalla» si no se dice nada; un nombre que no existe es un error (no se construye «lo de siempre» por sorpresa) */
export function buildPedida(env = process.env) {
  const b = (env.GEMELO_BUILD || "pantalla").trim();
  if (!BUILDS[b]) throw new Error("GEMELO_BUILD=" + b + " no existe (pantalla | vr)");
  return b;
}

/** La carpeta del paquete de three de esa build. vr: GEMELO_SUPER_THREE o apps/web/node_modules/super-three; si falta, error con cómo instalarlo */
export function carpetaThree(build, web, env = process.env) {
  if (build === "pantalla") return path.join(web, "node_modules", "three");
  const dir = env.GEMELO_SUPER_THREE ? path.resolve(env.GEMELO_SUPER_THREE) : path.join(web, "node_modules", BUILDS.vr.paquete);
  if (!fs.existsSync(path.join(dir, "build", "three.module.js")))
    throw new Error("la build vr necesita super-three (" + dir + "): cd apps/web && npm i -E super-three@" + BUILDS.vr.version + " (o GEMELO_SUPER_THREE=<carpeta>)");
  return dir;
}

/** Los alias de Vite para «three». pantalla: exactamente los de siempre (three y three/addons/). vr: los mismos hacia super-three y, además,
 *  cualquier otra subruta «three/…» (three/examples/…, three/src/…), para que ninguna librería se lleve el three de pantalla */
export function aliasThree(build, web, env = process.env) {
  const dir = carpetaThree(build, web, env);
  const a = [
    { find: /^three$/, replacement: path.join(dir, "build", "three.module.js") },
    { find: /^three\/addons\//, replacement: path.join(dir, "examples", "jsm") + "/" },
  ];
  if (build !== "pantalla") a.push({ find: /^three\/(?!addons\/)/, replacement: dir + "/" });
  return a;
}

/** La carpeta de salida de esa build (GEMELO_WEB_SALIDA manda, como siempre) */
export function salida(build, web, env = process.env) {
  return env.GEMELO_WEB_SALIDA || path.join(web, BUILDS[build].salida);
}

/**
 * Qué build carga la página (aún no se usa: la página carga siempre la de pantalla). clase: la de AparatoPuro.clasifica (01a_aparato.js: la única
 * detección del aparato; el cargador la recibirá de ese mismo trozo, no de otra regla). busqueda: location.search (?build=pantalla|vr fuerza una,
 * para probar). hayVR: ¿se publicó la build vr junto a la de pantalla? Sin ella, siempre pantalla.
 */
export function eligeBuild(clase, busqueda, hayVR) {
  const m = /[?&]build=(pantalla|vr)\b/.exec(busqueda || "");
  if (m) return m[1] === "vr" && !hayVR ? "pantalla" : m[1];
  return clase === "quest" && hayVR ? "vr" : "pantalla";
}
