"use strict";
// AG-3a / F1 (doc/sistema/MULTIVIEW.md §4, ADR-0031): la fábrica única de materiales (apps/web/motor/02i_materiales.js), en Node y con el three de verdad.
//   · equivalencia: lo que da la fábrica es lo mismo que daba el código de antes (el mismo ShaderMaterial con sus uniformes, defines y código; el mismo
//     parche con la misma clave de programa; encadena con el mismo contrato que la de la biblioteca de olivos, apps/web/olivo/materiales.js);
//   · el punto de la versión nueva (TSL, F4): solo se usa con Render.tipo «nuevo», que hoy no existe;
//   · el TRINQUETE: los onBeforeCompile y new THREE.ShaderMaterial que quedan FUERA de la fábrica, con su motivo por fichero. Uno nuevo falla; si un
//     fichero baja (porque se migró), hay que bajar aquí su cuenta: la cuenta solo puede bajar (F6: a cero).
// No dibuja nada: el aspecto igual en pantalla lo confirma el banco (capturas de siempre) y, en VR, el Quest (no probado aquí).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ, fs } = require("./_util");
const { fabrica } = require("./_materiales");

let THREE, OLIVO;
test.before(async () => {
  THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href);
  OLIVO = await import(pathToFileURL(path.join(RAIZ, "apps/web/olivo/materiales.js")).href);
});
const plano = x => JSON.parse(JSON.stringify(x));   // lo que sale del vm es de otro reino: se compara su contenido
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
/** como lo hace three al compilar: el objeto «shader» de un material de la biblioteca, con sus uniformes clonados */
function shaderDe(tipo) {
  const L = THREE.ShaderLib[tipo];
  return { uniforms: THREE.UniformsUtils.clone(L.uniforms), vertexShader: L.vertexShader, fragmentShader: L.fragmentShader, defines: {} };
}

// ---------------------------------------------------------------- equivalencia
test("sombreador(): el mismo ShaderMaterial que new THREE.ShaderMaterial (uniformes, defines, código, estado y clave de programa)", () => {
  const { Materiales } = fabrica(THREE);
  const uni = { uT: { value: 0 }, uColor: { value: new THREE.Color(0x336699) } };
  const op = () => ({ uniforms: uni, defines: { N: 3 }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor, vY);\n#include <colorspace_fragment>\n}" });
  const a = new THREE.ShaderMaterial(op()), b = Materiales.sombreador("prueba", op());
  assert.ok(b.isShaderMaterial && b.constructor === THREE.ShaderMaterial, "es un ShaderMaterial de three");
  assert.strictEqual(b.uniforms, uni, "los uniformes son los mismos objetos (quien los anima los sigue moviendo)");
  for (const k of ["vertexShader", "fragmentShader", "transparent", "depthWrite", "side", "blending", "fog"]) assert.deepStrictEqual(b[k], a[k], k);
  assert.deepStrictEqual(b.defines, a.defines);
  assert.strictEqual(b.customProgramCacheKey(), a.customProgramCacheKey());
  const ja = a.toJSON(), jb = b.toJSON(); delete ja.uuid; delete jb.uuid;
  assert.deepStrictEqual(jb, ja, "toJSON igual (salvo el uuid)");
});

test("parchea(): asigna la MISMA función (three usa su texto como clave del programa) y, si se da, la misma clave", () => {
  const { Materiales } = fabrica(THREE);
  function parche(sh) { sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uExag;"); sh.uniforms.uExag = { value: 2 }; }
  const a = new THREE.MeshLambertMaterial({ vertexColors: true }); a.onBeforeCompile = parche;
  const b = Materiales.parchea(new THREE.MeshLambertMaterial({ vertexColors: true }), "prueba-parche", parche);
  assert.strictEqual(b.onBeforeCompile, parche);
  assert.strictEqual(b.customProgramCacheKey(), a.customProgramCacheKey(), "la misma clave de programa que asignándolo a mano");
  const sa = shaderDe("lambert"), sb = shaderDe("lambert"); a.onBeforeCompile(sa); b.onBeforeCompile(sb);
  assert.deepStrictEqual(Object.keys(sb.uniforms), Object.keys(sa.uniforms)); assert.strictEqual(sb.vertexShader, sa.vertexShader); assert.strictEqual(sb.fragmentShader, sa.fragmentShader);
  assert.deepStrictEqual(sb.defines, sa.defines);
  const c = Materiales.parchea(new THREE.MeshBasicMaterial(), "prueba-clave", parche, "mi-clave");
  assert.strictEqual(c.customProgramCacheKey(), "mi-clave");
  // dos parches distintos con el mismo patrón de texto (p. ej. «function (sh) { parche(sh, u); }») siguen compartiendo programa, como antes: no se envuelve
  const d = Materiales.parchea(new THREE.MeshBasicMaterial(), "prueba-parche", parche);
  assert.strictEqual(d.customProgramCacheKey(), b.customProgramCacheKey());
});

test("encadena(): el mismo contrato que encadena() de apps/web/olivo/materiales.js (orden de los parches y clave combinada) y, con la de la biblioteca, es ella", () => {
  const { Materiales } = fabrica(THREE);
  const orden = [];
  const previo = function (sh) { orden.push("previo"); sh.vertexShader += "//previo"; };
  const fn = function (sh) { orden.push("fn"); sh.vertexShader += "//fn"; };
  const hazMat = () => { const m = new THREE.MeshStandardMaterial(); m.onBeforeCompile = previo; m.customProgramCacheKey = function () { return "mtoon"; }; return m; };
  const a = OLIVO.encadena(hazMat(), fn, "vrm-fundido"), b = Materiales.encadena(hazMat(), "prueba-encadena", fn, "vrm-fundido");
  const sa = shaderDe("standard"), sb = shaderDe("standard");
  a.onBeforeCompile(sa); const oa = orden.splice(0); b.onBeforeCompile(sb); const ob = orden.splice(0);
  assert.deepStrictEqual(ob, oa); assert.deepStrictEqual(ob, ["previo", "fn"]);
  assert.strictEqual(sb.vertexShader, sa.vertexShader);
  assert.strictEqual(b.customProgramCacheKey(), a.customProgramCacheKey()); assert.strictEqual(b.customProgramCacheKey(), "mtoon|vrm-fundido");
  // la de 26b_avatares antes de F1: (clave ? clave.call(this) : "") + "|vrm-fundido": la misma
  // sin clave: la longitud del texto del parche, como la biblioteca
  const c = OLIVO.encadena(new THREE.MeshBasicMaterial(), fn), d = Materiales.encadena(new THREE.MeshBasicMaterial(), "prueba-sin-clave", fn);
  assert.strictEqual(d.customProgramCacheKey().split("|")[1], c.customProgramCacheKey().split("|")[1]);
  // con la de la biblioteca (07ab_generados le pasa M.encadena): la llama a ella con los mismos argumentos
  const llamadas = []; const propia = (m, f, k) => { llamadas.push([f, k]); return OLIVO.encadena(m, f, k); };
  const e = Materiales.encadena(new THREE.MeshBasicMaterial(), "gen-olivo", fn, "gen-luz-fundido", propia);
  assert.deepStrictEqual(llamadas, [[fn, "gen-luz-fundido"]]); assert.ok(e.customProgramCacheKey().endsWith("|gen-luz-fundido"));
});

test("la versión nueva (TSL, F4) solo se usa con el renderizador nuevo; hoy ?render=nuevo se queda en el clásico y la fábrica da lo de siempre", () => {
  const avisos = [];
  for (const busqueda of ["", "?render=nuevo", "?render=clasico"]) {
    const { Materiales, Render } = fabrica(THREE, { busqueda, console: { warn: m => avisos.push(m), error() {} } });
    assert.strictEqual(Render.tipo, "clasico");
    let usada = 0; Materiales.nuevo("prueba-nuevo", () => { usada++; return new THREE.MeshBasicMaterial(); });
    const m = Materiales.sombreador("prueba-nuevo", { vertexShader: "void main(){}", fragmentShader: "void main(){}" });
    assert.ok(m.isShaderMaterial); assert.strictEqual(usada, 0, "sin renderizador nuevo no se pide la versión TSL");
  }
  assert.strictEqual(avisos.length, 1); assert.match(avisos[0], /reservado.*aún no existe/);
  const { Materiales } = fabrica(THREE);
  assert.throws(() => Materiales.sombreador("", {}), /falta el nombre/);
  Materiales.parchea(new THREE.MeshBasicMaterial(), "a", () => {}); Materiales.parchea(new THREE.MeshBasicMaterial(), "a", () => {}); Materiales.sombreador("b", {});
  assert.deepStrictEqual(plano(Materiales.inventario()), { a: { tipo: "parche", n: 2 }, b: { tipo: "sombreador", n: 1 } });
});

// ---------------------------------------------------------------- los nombres de la fábrica en el motor (la clave con la que F4 registrará cada versión TSL)
test("cada material del motor que pasa por la fábrica tiene un nombre literal, en minúsculas con guiones, y uno por sitio", () => {
  const dir = path.join(RAIZ, "apps/web/motor"), visto = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "02i_materiales.js")) {
    const s = sinComentarios(fs.readFileSync(path.join(dir, f), "utf8")), re = /Materiales\.(parchea|encadena|sombreador)\(([^,)]*)/g;
    let m;
    while ((m = re.exec(s))) {
      const arg = m[1] === "sombreador" ? m[2].trim() : (s.slice(m.index).match(/^Materiales\.\w+\([^,]+,\s*("[^"]*"|[^,]+)/) || [])[1];
      assert.match(arg || "", /^"[a-z0-9]+(-[a-z0-9]+)*"$/, f + ": el nombre de Materiales." + m[1] + " debe ser un literal (es la clave de su versión TSL): " + arg);
      (visto[arg] = visto[arg] || []).push(f);
    }
  }
  // el mismo nombre en más de un sitio solo si es el mismo material (los dos de profundidad de 07ab)
  const repetidos = Object.entries(visto).filter(([n, fs2]) => fs2.length > 1 && !(n === '"gen-profundidad"' && fs2.every(x => x === "07ab_generados.js")));
  assert.deepStrictEqual(repetidos, [], "nombres repetidos en la fábrica");
  assert.ok(Object.keys(visto).length >= 20, "pasan por la fábrica " + Object.keys(visto).length + " materiales");
});

// ---------------------------------------------------------------- el trinquete
// [onBeforeCompile, new THREE.ShaderMaterial, motivo]. Cuenta el texto sin comentarios (también las lecturas de onBeforeCompile). Solo puede BAJAR.
const FUERA = {
  "apps/web/motor/04d_sombreado_tiles.js": [1, 0, "el terreno de 3D Tiles (F4 #1, dificultad alta): otro agente lo está cambiando durante F1; pasa a Materiales.parchea en cuanto se fusione"],
  "apps/web/motor/15_tiempo.js": [1, 3, "parcheTiempo del follaje y los ShaderMaterial de nubes, lluvia y barrera (F4 #0 y #9): otro agente lo está cambiando durante F1"],
  "apps/web/motor/21_suelo.js": [2, 0, "matas y piedras (F4 #6): otro agente lo está cambiando durante F1"],
  "apps/web/olivo/materiales.js": [2, 0, "encadena(), el punto único de la biblioteca de olivos (lee el parche previo y pone el suyo); el motor la reusa por Materiales.encadena (07ab)"]
};
function cuenta(f) {
  const s = sinComentarios(lee(f));
  return [(s.match(/onBeforeCompile/g) || []).length, (s.match(/new\s+THREE\.ShaderMaterial\b/g) || []).length];
}
test("trinquete: los onBeforeCompile y new THREE.ShaderMaterial fuera de la fábrica son los anotados, cada uno con su motivo, y solo pueden bajar", () => {
  const hay = {}, mal = [];
  for (const d of ["apps/web/motor", "apps/web/olivo"]) {
    for (const f of fs.readdirSync(path.join(RAIZ, d)).filter(f => f.endsWith(".js") && f !== "02i_materiales.js")) {
      const c = cuenta(d + "/" + f); if (c[0] || c[1]) hay[d + "/" + f] = c;
    }
  }
  for (const [f, c] of Object.entries(hay)) {
    const a = FUERA[f];
    if (!a) mal.push(f + ": " + c[0] + " onBeforeCompile y " + c[1] + " ShaderMaterial fuera de la fábrica (usa Materiales.parchea / .encadena / .sombreador de 02i_materiales.js)");
    else if (c[0] > a[0] || c[1] > a[1]) mal.push(f + ": " + c.join(" / ") + " y hay anotados " + a[0] + " / " + a[1] + ": la cuenta solo puede bajar");
  }
  assert.deepStrictEqual(mal, [], mal.join("\n"));
  for (const [f, a] of Object.entries(FUERA)) {
    assert.ok(typeof a[2] === "string" && a[2].length > 20, f + ": el motivo");
    const c = hay[f] || [0, 0];
    assert.deepStrictEqual(c, [a[0], a[1]], f + ": anotados " + a[0] + " / " + a[1] + " y hay " + c.join(" / ") + " (si se migró, baja la cuenta aquí)");
  }
  // la fábrica es la que los tiene: un parche y un ShaderMaterial (más los de encadenaPropia)
  const F = cuenta("apps/web/motor/02i_materiales.js");
  assert.deepStrictEqual(F, [3, 1], "02i_materiales.js: onBeforeCompile (parchea y encadenaPropia) y un new THREE.ShaderMaterial");
});
