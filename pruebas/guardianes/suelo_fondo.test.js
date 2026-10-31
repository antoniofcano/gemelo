"use strict";
// M6: el suelo de fondo (apps/web/motor/04e_suelo_fondo.js). Sin navegador: se evalúa el módulo con la three instalada y maquetas del resto del motor.
// Se comprueba: una malla de pocos triángulos que cubre la caja de la finca y su margen, SIEMPRE por debajo del relieve grueso (nunca asoma por encima),
// con las caras hacia arriba y el uv del mosaico bien orientado; que sigue la exageración vertical; que no existe si la escena 3D Tiles no está activa;
// que dispose() libera la geometría y el material pero NO la textura (es de 04d); y que su sustitución del sombreador encuentra su trozo en la three
// instalada. Lo que se VE (que el hueco ya no se ve y que de cerca no asoma) lo dice el banco con capturas. Sin three se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web"), THREE_JS = path.join(WEB, "node_modules", "three", "build", "three.module.js");
const SALTO = fs.existsSync(THREE_JS) ? null : "three no instalado (cd apps/web && npm ci): el suelo de fondo NO se ha comprobado";
const FUENTE = fs.readFileSync(path.join(WEB, "motor", "04e_suelo_fondo.js"), "utf8");

let THREE;
test.before(async () => { if (!SALTO) THREE = await import(pathToFileURL(THREE_JS).href); });

const grueso = (x, y) => 100 + 0.01 * x + 0.02 * y;   // un plano inclinado
function monta(estado = "activo", exag = 1) {
  const scene = new THREE.Scene(), tex = new THREE.Texture(), est = { v: estado }, ex = { v: exag };
  const D = { mosaico: { x0: 1000, yN: 4000, w: 2000, h: 1500, res: 1 }, grueso: { x0: 1000, yN: 4000, w: 250, h: 188, res: 8 } };
  const UN = { uMos: { value: tex } }, matSuelo = new THREE.MeshLambertMaterial({}), Mundo = { grueso }, Escena3D = { estado: () => est.v };
  // exag es una variable del motor que cambia: en la maqueta se lee con una función
  // desde C10 (tercera tanda) es un componente: se registra y se monta con un contexto de mentira; lo que devuelve monta() es el api de siempre
  const defs = [], src = FUENTE.replace(/\bexag\b/g, "exag()"), g = Function("THREE", "D", "Mundo", "UN", "matSuelo", "Escena3D", "scene", "exag", "Componentes", src + "\nreturn null;");
  g(THREE, D, Mundo, UN, matSuelo, Escena3D, scene, () => ex.v, { registra: d => (defs.push(d), true) });
  assert.strictEqual(defs.length, 1);
  return { SF: defs[0].monta({ on() {}, emite() {}, limpia() {} }), def: defs[0], scene, tex, est, ex, D, matSuelo };
}

test("una malla, pocos triángulos, cubre la caja con margen y queda siempre por debajo del relieve grueso", t => {
  if (SALTO) return t.skip(SALTO);
  const { SF, scene, D, matSuelo } = monta();
  SF.actualiza();
  const m = SF.malla(); assert.ok(m, "se crea con la escena activa");
  assert.strictEqual(scene.children.filter(o => o.isMesh && o.name === "sueloFondo").length, 1);
  const tri = m.geometry.index.count / 3; assert.ok(tri > 0 && tri <= 128 * 128 * 2, "pocos triángulos: " + tri);
  const pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv; let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = -pos.getZ(i);
    assert.ok(pos.getY(i) <= grueso(x, y) - SF.BAJA + 1e-3, "nunca por encima del grueso menos BAJA");
    xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y);
    assert.ok(Math.abs(uv.getX(i) - (x - D.mosaico.x0) / 2000) < 1e-4 && Math.abs(uv.getY(i) - (y - (4000 - 1500)) / 1500) < 1e-4, "uv del mosaico: norte arriba");
  }
  assert.ok(xa <= 1000 - SF.MARGEN + 1e-6 && xb >= 3000 + SF.MARGEN - 1e-6 && ya <= 4000 - 1504 - SF.MARGEN + 1e-6 && yb >= 4000 + SF.MARGEN - 1e-6, "cubre la caja de la finca y el margen");
  const nrm = m.geometry.attributes.normal; for (let i = 0; i < nrm.count; i += 97) assert.ok(nrm.getY(i) > 0.9, "cara hacia arriba");
  assert.strictEqual(m.material.map, SF.malla().material.map); assert.ok(m.material.map && m.material.polygonOffset && m.material.polygonOffsetFactor > 0, "textura del mosaico y polygonOffset hacia atrás");
  assert.strictEqual(m.material.color, matSuelo.color, "el color (luz, lluvia) es el del resto del relieve");
  assert.strictEqual(m.material.fog, true);
});

test("sigue la exageración vertical; no existe sin escena activa; dispose libera la geometría y el material, no la textura", t => {
  if (SALTO) return t.skip(SALTO);
  const { SF, scene, tex, est, ex } = monta("cargando");
  SF.actualiza(); assert.strictEqual(SF.malla(), null, "sin escena activa no se crea");
  est.v = "activo"; ex.v = 2.5; SF.actualiza(); const m = SF.malla(); assert.ok(m);
  m.updateMatrixWorld(true); assert.ok(Math.abs(m.matrixWorld.elements[5] - 2.5) < 1e-9, "escala vertical = exag");
  ex.v = 1; SF.actualiza(); assert.ok(Math.abs(m.matrixWorld.elements[5] - 1) < 1e-9);
  let g = 0, mt = 0, tx = 0; m.geometry.addEventListener("dispose", () => g++); m.material.addEventListener("dispose", () => mt++); tex.addEventListener("dispose", () => tx++);
  est.v = "sin"; SF.actualiza();
  assert.strictEqual(SF.malla(), null); assert.deepStrictEqual([g, mt, tx], [1, 1, 0]); assert.strictEqual(scene.children.length, 0);
});

test("su sustitución del sombreador encuentra su trozo en la three instalada", t => {
  if (SALTO) return t.skip(SALTO);
  const { SF } = monta(); SF.actualiza();
  const sh = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  SF.malla().material.onBeforeCompile(sh);
  assert.ok(!sh.fragmentShader.includes("#include <map_fragment>") && sh.fragmentShader.includes("sRGBTransferEOTF(texture2D(map, vMapUv))"), "map_fragment sustituido");
  assert.ok(THREE.ShaderChunk.colorspace_pars_fragment.includes("sRGBTransferEOTF"), "la three define sRGBTransferEOTF");
  assert.ok(THREE.ShaderChunk.map_fragment.includes("vMapUv"), "la three sigue llamando vMapUv a las coordenadas del mapa");
});
