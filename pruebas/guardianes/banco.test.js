"use strict";
// Banco de pruebas (TESTING.md §«Banco de pruebas»): el turno es exclusivo entre procesos y caduca si el dueño muere; los encargos se
// validan; la puerta y las e2e de Docker pasan por el turno. Sin navegador: usa una carpeta de banco propia (GEMELO_BANCO) para no
// tocar el turno real del equipo.
const test = require("node:test"), assert = require("node:assert");
const { spawn } = require("child_process");
const { RAIZ, propia, lee, fs, path } = require("./_util");

const BANCO = propia("banco");
const TURNO = path.join(RAIZ, "pruebas", "banco", "turno.js");

/** Un proceso hijo que coge el turno, lo tiene `ms` y lo suelta; devuelve [inicio, fin] en ms de reloj */
function cogeTurno(ms) {
  const env = Object.assign({}, process.env, { GEMELO_BANCO: BANCO });
  delete env.GEMELO_TURNO;   // dentro de la puerta viene puesto: aquí hay que pedirlo de verdad
  const js = "const t=require(" + JSON.stringify(TURNO) + ");t.conTurno('prueba',async()=>{const a=Date.now();await new Promise(r=>setTimeout(r," + ms + "));console.log(JSON.stringify([a,Date.now()]))},{aviso:()=>{}})";
  return new Promise((ok, mal) => { let out = ""; const p = spawn(process.execPath, ["-e", js], { cwd: RAIZ, env }); p.stdout.on("data", d => out += d); p.on("exit", c => c === 0 ? ok(JSON.parse(out)) : mal(new Error("salida " + c))); });
}

test("el turno es exclusivo: dos procesos que lo piden a la vez no se solapan", { timeout: 60000 }, async () => {
  const [a, b] = await Promise.all([cogeTurno(1500), cogeTurno(1500)]);
  const [primero, segundo] = a[0] <= b[0] ? [a, b] : [b, a];
  assert.ok(segundo[0] >= primero[1], "se solapan: " + JSON.stringify([a, b]));
});

test("un encargo sin carpeta servida se rechaza; uno válido queda en la cola con sus variantes", () => {
  process.env.GEMELO_BANCO = BANCO;
  delete require.cache[require.resolve("../banco/turno")]; delete require.cache[require.resolve("../banco/encarga")];
  const { lee: leeEncargo, encarga, ENCARGOS } = require("../banco/encarga");
  assert.throws(() => leeEncargo(["--raiz", path.join(BANCO, "no-existe")]), /--raiz/);
  const raiz = path.join(BANCO, "pagina"); fs.mkdirSync(raiz, { recursive: true }); fs.writeFileSync(path.join(raiz, "index.html"), "<p>hola</p>");
  const e = leeEncargo(["--raiz", raiz, "--variante", "gen=?olivos=gen", "--variante", "base=", "--capturas", "--de", "prueba"]);
  const { id } = encarga(e), guardado = JSON.parse(fs.readFileSync(path.join(ENCARGOS, id + ".json"), "utf8"));
  assert.deepStrictEqual(guardado.variantes, [{ nombre: "gen", consulta: "?olivos=gen" }, { nombre: "base", consulta: "" }]);
  assert.strictEqual(guardado.capturas, true);
  delete process.env.GEMELO_BANCO;
});

test("la puerta, el Chrome de las pruebas y la e2e de Docker pasan por el turno", () => {
  assert.match(JSON.parse(lee("package.json")).scripts.puerta, /pruebas\/banco\/puerta\.js/, "npm run puerta debe ir por el banco");
  assert.match(lee("pruebas/guardianes/_navegador.js"), /GEMELO_CHROME_WS[\s\S]*banco\/turno"\)\.pide/, "lanza() debe usar el Chrome compartido o pedir el turno");
  assert.match(lee("pruebas/guardianes/dev.test.js"), /banco\/turno"\)\.pide\("docker/, "la e2e de Docker debe pedir el turno");
  assert.ok(JSON.parse(lee("package.json")).devDependencies["proper-lockfile"].match(/^\d+\.\d+\.\d+$/), "proper-lockfile con versión exacta");
});

test("[hituelo] el banco mide y captura el PASEO: ronda pequeña con paseo y paseoAnda sobre el fixture (pide el turno solo)", { timeout: 420000 }, async t => {
  const { motivoSalto, sirve, lanza, mide, TODOS_ESCENARIOS, VENTANA_CHICA } = require("./_navegador");
  const { montaPagina, saltoPagina } = require("./_pagina");
  const salto = motivoSalto("el paseo en el banco") || saltoPagina("el paseo en el banco"); if (salto) return t.skip(salto);
  const WEB = propia("banco-paseo");
  fs.cpSync(montaPagina({ finca: "hituelo" }).carpeta, path.join(WEB, "hituelo"), { recursive: true });
  // el encargo acepta los escenarios del paseo y rechaza los que no existen
  process.env.GEMELO_BANCO = BANCO;
  delete require.cache[require.resolve("../banco/turno")]; delete require.cache[require.resolve("../banco/encarga")];
  const { lee: leeEncargo } = require("../banco/encarga");
  assert.deepStrictEqual(leeEncargo(["--raiz", path.join(WEB, "hituelo"), "--escenarios", "paseo,paseoAnda"]).escenarios, ["paseo", "paseoAnda"]);
  assert.throws(() => leeEncargo(["--raiz", path.join(WEB, "hituelo"), "--escenarios", "volando"]), /escenario desconocido/);
  delete process.env.GEMELO_BANCO;
  const srv = await sirve(WEB), nav = await lanza(), caps = path.join(WEB, "capturas"), P0 = TODOS_ESCENARIOS.paseo.paseo;
  try {
    const esc = { paseo: TODOS_ESCENARIOS.paseo, paseoAnda: { paseo: Object.assign({}, TODOS_ESCENARIOS.paseoAnda.paseo, { anda: 3 }) } };
    const r = await mide(nav, "http://127.0.0.1:" + srv.address().port + "/hituelo/index.html", { escenarios: esc, capturas: caps, viewport: VENTANA_CHICA });
    assert.deepStrictEqual(r.errores, [], r.errores.join("\n"));
    for (const n of ["paseo", "paseoAnda"]) {
      const x = r.medidas[n]; assert.ok(x, "falta la medida " + n);
      assert.ok(x.paseo && x.paseo.paseando, n + ": debe estar paseando al medir");
      assert.ok(x.llamadas > 0 && x.triangulos > 0, n + ": sin dibujo");
      assert.ok(fs.statSync(path.join(caps, n + ".png")).size > 5000, n + ": captura vacía");
    }
    const b = r.medidas.paseoAnda.paseo, d = Math.hypot(b.x - P0.x, b.y - P0.y);
    t.diagnostic("paseoAnda: ha andado " + Math.round(d * 10) / 10 + " m en 3 s (SwiftShader: poca cadencia)");
    assert.ok(d > 0.3, "paseoAnda no se ha movido");
  } finally { await nav.close(); srv.close(); }
});
