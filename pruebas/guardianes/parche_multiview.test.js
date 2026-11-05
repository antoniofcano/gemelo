// Guardián del parche de super-three en la build de VR (apps/web/herramientas/parche_multiview.mjs, MULTIVIEW.md §«Texturas en negro»).
// Con multiview, super-three 0.185.0 aplaza las subidas de texturas y no las ejecuta nunca: terreno y olivos en negro en el Quest (2026-11-05).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const RAIZ = path.join(__dirname, "..", "..");
const WEB = path.join(RAIZ, "apps", "web");
const SUPER = path.join(WEB, "node_modules", "super-three", "build", "three.module.js");
const carga = () => import(pathToFileURL(path.join(WEB, "herramientas", "parche_multiview.mjs")).href);

test("el plugin está en vite.config.js", () => {
  const v = fs.readFileSync(path.join(WEB, "vite.config.js"), "utf8");
  assert.match(v, /import \{ multiviewSubeTexturas \} from "\.\/herramientas\/parche_multiview\.mjs"/);
  assert.match(v, /plugins: \[[\s\S]*multiviewSubeTexturas\(\)/);
});

test("parchea el super-three instalado: sube lo aplazado justo tras el dibujo multiview", { skip: !fs.existsSync(SUPER) && "sin apps/web/node_modules (npm ci)" }, async () => {
  const { parcheaMultiview, ORIGINAL } = await carga();
  const code = fs.readFileSync(SUPER, "utf8");
  const p = parcheaMultiview(code);
  const i = p.indexOf(ORIGINAL), j = p.indexOf("textures.runDeferredUploads();");
  assert.ok(i >= 0 && j > i && j - i < ORIGINAL.length + 120, "la subida va inmediatamente después del renderScene multiview");
  assert.match(p, /textures\.setDeferTextureUploads\( false \); textures\.runDeferredUploads\(\);/);
  assert.strictEqual(p.length - code.length > 0, true);
});

test("si el trozo no está (otra versión), falla en vez de parchear a ciegas", async () => {
  const { parcheaMultiview, multiviewSubeTexturas } = await carga();
  assert.throws(() => parcheaMultiview("function runDeferredUploads() {}"), /aparece 0 veces/);
  const pl = multiviewSubeTexturas();
  assert.strictEqual(pl.transform("x", "/a/node_modules/three/build/three.module.js"), null, "la build de pantalla (three) no se toca");
  assert.strictEqual(pl.transform("x", "/a/otro.js"), null);
});

// el multiview define viewMatrix, modelViewMatrix, projectionMatrix y normalMatrix como macros: ningún PARÁMETRO de función GLSL puede llamarse así
// (en el Quest 3 rompía todos los materiales de three: «array size must be a constant integer expression», 2026-11-05)
const PARAM_PROHIBIDO = /\bin\s+mat[34]\s+(viewMatrix|modelViewMatrix|projectionMatrix|normalMatrix)\b(?!\w)/;
test("tras el parche, ningún sombreador de super-three tiene un parámetro con el nombre de una macro del multiview", { skip: !fs.existsSync(SUPER) && "sin apps/web/node_modules (npm ci)" }, async () => {
  const { parcheaMultiview } = await carga();
  const p = parcheaMultiview(fs.readFileSync(SUPER, "utf8"));
  const malos = (p.match(new RegExp(PARAM_PROHIBIDO.source, "g")) || []);
  assert.deepStrictEqual(malos, [], "parámetros que el multiview convierte en array");
  assert.match(p, /'#extension GL_OVR_multiview : require',\n\t+customVertexExtensions,/, "las #extension del material van antes del layout(num_views)");
});

test("los sombreadores propios del motor tampoco usan esos nombres como parámetro", () => {
  const MOTOR = path.join(WEB, "motor");
  const malos = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).filter(f => PARAM_PROHIBIDO.test(fs.readFileSync(path.join(MOTOR, f), "utf8")));
  assert.deepStrictEqual(malos, []);
});
