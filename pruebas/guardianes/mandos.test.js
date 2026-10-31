"use strict";
// I6: los mandos y las manos en VR (apps/web/motor/36_mandos.js). En Node, sin navegador: que el build lleve los perfiles de WebXR Input Profiles
// del mismo origen (<página>/xr/perfiles/), solo los elegidos y con su licencia, que nada del build apunte a jsDelivr y que el motor pida las
// manos. Que un modelo se carga de verdad con el WebXR simulado lo comprueba pruebas/prueba_vr.js (GEMELO_VR=1, vr.test.js).
// Sin Vite o sin 3d-tiles-renderer (cd apps/web && npm ci) la parte del build se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = saltoPagina("los perfiles de los mandos en el build");
const MOTOR = path.join(RAIZ, "apps", "web", "motor");
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
// lo que puede anunciar un Quest (1/2/3/3S/Pro) y los genéricos de respaldo (generic-trigger es el de por defecto de la fábrica de three)
const ESPERADOS = ["generic-hand", "generic-trigger", "generic-trigger-squeeze-thumbstick", "meta-quest-touch-plus", "meta-quest-touch-plus-v2",
  "meta-quest-touch-pro", "oculus-touch-v2", "oculus-touch-v3"];

test("el motor: el componente mandos-vr usa la ruta propia, pide las manos y ya no dibuja cubos en 29_vr", () => {
  const m = lee("36_mandos.js"), vr = lee("29_vr.js");
  assert.ok(!/jsdelivr|https?:\/\//.test(m.replace(/^\s*\/\/.*$/gm, "")), "36_mandos.js no debe nombrar otro host");
  assert.match(m, /RUTA = "\.\/xr\/perfiles"/);
  assert.match(m, /\.setPath\(RUTA\)/, "la fábrica de mandos debe ir a la ruta propia");
  assert.match(m, /setPath\(RUTA \+ "\/generic-hand\/"\)/, "la fábrica de manos debe ir a la ruta propia");
  assert.match(vr, /optionalFeatures: \[[^\]]*"hand-tracking"/, "la sesión debe pedir hand-tracking como opcional");
  assert.match(vr, /Bus\.emite\("vr:rig-monta", \{ rig: vrRig \}\)/); assert.match(vr, /Bus\.emite\("vr:rig-libera"\)/);
  assert.ok(!/BoxGeometry\(0\.045/.test(vr), "el cubo del mando ya no vive en 29_vr.js (solo como respaldo en 36_mandos.js)");
});

test("el build lleva los perfiles elegidos en xr/perfiles/, su licencia, y nada apunta a jsDelivr", t => {
  if (SALTO) return t.skip(SALTO);
  const P = montaPagina({ finca: "cerro" }), X = path.join(P.carpeta, "xr", "perfiles");
  assert.ok(fs.existsSync(path.join(X, "LICENSE.md")), "falta la licencia MIT de @webxr-input-profiles/assets");
  const L = JSON.parse(fs.readFileSync(path.join(X, "profilesList.json"), "utf8"));
  const dirs = fs.readdirSync(X).filter(f => fs.statSync(path.join(X, f)).isDirectory()).sort();
  assert.deepStrictEqual(dirs, ESPERADOS, "solo los perfiles elegidos");
  for (const k of Object.keys(L)) assert.ok(fs.existsSync(path.join(X, L[k].path)), "profilesList.json apunta a " + L[k].path + ", que no está");
  assert.ok(L["meta-quest-touch-plus"] && L["oculus-touch-v3"] && L["generic-trigger"], "faltan perfiles del Quest o el genérico en profilesList.json");
  assert.ok(!L["htc-vive"] && !L["oculus-touch"], "profilesList.json debe recortarse a lo copiado (si no, un perfil no copiado da 404 en vez de caer en el genérico)");
  let bytes = 0;
  for (const p of ESPERADOS.filter(p => p !== "generic-hand")) {
    const prof = JSON.parse(fs.readFileSync(path.join(X, p, "profile.json"), "utf8"));
    for (const lado of Object.keys(prof.layouts)) {
      const a = prof.layouts[lado].assetPath; assert.ok(a && fs.existsSync(path.join(X, p, a)), p + "/" + lado + ": falta " + a);
    }
  }
  for (const lado of ["left", "right"]) assert.ok(fs.existsSync(path.join(X, "generic-hand", lado + ".glb")), "falta generic-hand/" + lado + ".glb");
  for (const f of fs.readdirSync(X, { recursive: true })) { const p = path.join(X, String(f)); if (fs.statSync(p).isFile()) bytes += fs.statSync(p).size; }
  assert.ok(bytes < 20e6, "los perfiles pesan " + (bytes / 1e6).toFixed(1) + " MB (tope 20 MB)");
  const js = fs.readdirSync(path.join(P.carpeta, "assets")).filter(f => f.endsWith(".js"));
  const conCdn = js.filter(f => fs.readFileSync(path.join(P.carpeta, "assets", f), "utf8").includes("cdn.jsdelivr.net"));
  assert.deepStrictEqual(conCdn, [], "hay JS del build que nombran jsDelivr");
  assert.ok(js.some(f => /XRControllerModelFactory|xr\/perfiles/.test(fs.readFileSync(path.join(P.carpeta, "assets", f), "utf8"))), "no está la fábrica de mandos en el build");
});

test("la CSP de producción no abre otros orígenes para los modelos (connect-src e img-src del mismo origen)", () => {
  const c = fs.readFileSync(path.join(RAIZ, "infra", "Caddyfile"), "utf8"), csp = /Content-Security-Policy[^"]*"([^"]+)"/.exec(c)[1];
  assert.match(csp, /connect-src 'self' blob:;/); assert.match(csp, /img-src 'self' data: blob:;/);
  assert.ok(!/jsdelivr/.test(csp));
});
