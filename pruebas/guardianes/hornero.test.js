"use strict";
// El hornero de olivos (O7c, ADR-0018; tuberia/olivos/hornero.mjs) con el generador SINTÉTICO (sin three-gen, sin datos, sin Chrome):
//   - hornea las variantes de la época actual y la siguiente, el manifiesto valida y cada objeto verifica su huella (sobre los bytes descomprimidos);
//   - una segunda corrida seguida no hornea nada y no toca el manifiesto; sin manifiesto, los objetos existentes no se reescriben;
//   - cambiar la fecha a otra época añade solo lo nuevo; --limpia borra lo que ningún manifiesto referencia (y conserva el anterior);
//   - la calidad de brotli o la versión del generador distintas lo rehacen todo; el avance queda en estado.json; las mismas entradas dan las mismas huellas.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const os = require("os");
const { RAIZ, fs, path } = require("./_util");
const imp = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);

let HN, N, F, S;
test.before(async () => { HN = await imp("tuberia", "olivos", "hornero.mjs"); N = await imp("apps", "web", "olivo", "horneado_node.js"); F = await imp("apps", "web", "olivo", "horneado.js"); S = await imp("pruebas", "olivo", "horneado", "sintetica.mjs"); });

const generador = (gen = S.GEN_VERSION_SINTETICA) => {
  let llamadas = 0;
  return { llamadas: () => llamadas, GEN_VERSION: gen, CACHE_VERSION: S.CACHE_VERSION_SINTETICA,
    claveReceta: (e, nivel) => "olivo|" + gen + "|c" + S.CACHE_VERSION_SINTETICA + "|" + nivel + "|" + e.tipo + "|" + e.epoca + "|" + e.semilla + "|{}",
    receta: e => { llamadas++; return S.recetaSintetica({ semilla: e.semilla, nivel: "E0", epoca: e.epoca }); },
    aNivel: (r, nivel) => S.recetaSintetica({ semilla: r.entrada.semilla, nivel, epoca: r.entrada.epoca }) };
};
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), "hornero-"));
const objetos = dir => fs.readdirSync(dir).filter(n => /^[0-9a-f]{32}\.br$/.test(n)).sort();
const base = (salida, g, extra) => Object.assign({ finca: "fixture", salida, generador: g, fecha: "2026-10-29", ahora: () => "2026-10-29T12:00:00Z" }, extra);
const man = (dir, n) => JSON.parse(fs.readFileSync(path.join(dir, n || "manifiesto.json"), "utf8"));

test("hornea las 16 variantes (4 semillas × E2/E2VR × época actual y siguiente), valida y cada objeto verifica su huella", async () => {
  const sal = carpeta(), g = generador(), r = await HN.hornea(base(sal, g)), dir = path.join(sal, "fixture", "olivos");
  assert.strictEqual(r.actual, "envero"); assert.strictEqual(r.siguiente, "madura");
  assert.strictEqual(r.total, 16); assert.strictEqual(r.horneadas, 16); assert.strictEqual(r.reutilizadas, 0); assert.ok(r.escribio_manifiesto);
  assert.strictEqual(g.llamadas(), 8, "una E0 por semilla y época: E2 y E2VR salen de la misma");
  const m = man(dir);
  assert.deepStrictEqual(HN.validaManifiesto(m, dir), []);
  assert.deepStrictEqual(m.epocas.map(e => e.epoca), ["envero", "madura"]); assert.deepStrictEqual(m.propios, { activos: false }); assert.strictEqual(m.brotli, 9);
  assert.strictEqual(m.variantes.length, 16); assert.deepStrictEqual(objetos(dir), [...new Set(m.variantes.map(f => f.huella))].map(h => h + ".br").sort());
  for (const f of m.variantes) {
    const crudo = N.descomprimeBr(fs.readFileSync(path.join(dir, f.huella + ".br")));
    assert.strictEqual(crudo.length, f.bytes); assert.ok(await F.verificaHuella(crudo, f.huella), "huella de " + f.huella);
    assert.strictEqual(F.decodifica(crudo).cabecera.nivel, f.nivel);
    assert.strictEqual(fs.statSync(path.join(dir, f.huella + ".br")).size, f.bytes_br);
  }
  assert.ok(!fs.readdirSync(dir).some(n => n.includes(".tmp-")), "sin temporales");
  const st = man(dir, "estado.json");
  assert.strictEqual(st.fase, "listo"); assert.strictEqual(st.hechas, 16); assert.strictEqual(st.total, 16); assert.strictEqual(st.error, null);
});

test("las mismas entradas dan las mismas huellas que el manifiesto de ejemplo (semillas 11 y 23)", async () => {
  const sal = carpeta(); await HN.hornea(base(sal, generador(), { semillas: [11, 23] }));
  const m = man(path.join(sal, "fixture", "olivos")), ej = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "horneado", "manifiesto-ejemplo.json"), "utf8"));
  const clave = v => v.map(f => [f.tipo, f.semilla, f.nivel, f.epoca, f.huella, f.bytes].join("|")).sort();
  assert.deepStrictEqual(clave(m.variantes), clave(ej.variantes));
});

test("una segunda corrida seguida no rehace nada ni toca el manifiesto; sin manifiesto, los objetos existentes no se reescriben", async () => {
  const sal = carpeta(), dir = path.join(sal, "fixture", "olivos"); await HN.hornea(base(sal, generador()));
  const ruta = path.join(dir, "manifiesto.json"), antes = fs.readFileSync(ruta, "utf8"), mt = fs.statSync(ruta).mtimeMs, g = generador();
  const r = await HN.hornea(base(sal, g, { ahora: () => "2026-10-29T13:00:00Z" }));
  assert.strictEqual(r.horneadas, 0); assert.strictEqual(r.reutilizadas, 16); assert.strictEqual(r.escribio_manifiesto, false); assert.strictEqual(g.llamadas(), 0, "ni siquiera se genera");
  assert.strictEqual(fs.readFileSync(ruta, "utf8"), antes); assert.strictEqual(fs.statSync(ruta).mtimeMs, mt);
  assert.ok(!fs.existsSync(path.join(dir, "manifiesto.anterior.json")), "sin cambios no hay «anterior»");
  fs.unlinkSync(ruta);
  const mtObj = Object.fromEntries(objetos(dir).map(n => [n, fs.statSync(path.join(dir, n)).mtimeMs])), r2 = await HN.hornea(base(sal, generador()));
  assert.strictEqual(r2.horneadas, 0); assert.strictEqual(r2.ya_existian, 16, "los objetos ya estaban: se genera, pero no se reescribe"); assert.ok(r2.escribio_manifiesto);
  for (const n of objetos(dir)) assert.strictEqual(fs.statSync(path.join(dir, n)).mtimeMs, mtObj[n], n + " no debe reescribirse");
});

test("cambiar la fecha a otra época añade solo lo nuevo; --limpia borra lo huérfano y conserva lo del manifiesto anterior", async () => {
  const sal = carpeta(), dir = path.join(sal, "fixture", "olivos"); await HN.hornea(base(sal, generador()));        // envero + madura
  const viejos = new Set(objetos(dir)), g = generador(), r = await HN.hornea(base(sal, g, { fecha: "2026-11-15" })); // madura + reposo
  assert.strictEqual(r.actual, "madura"); assert.strictEqual(r.siguiente, "reposo");
  assert.strictEqual(r.horneadas, 8); assert.strictEqual(r.reutilizadas, 8, "madura ya estaba"); assert.strictEqual(g.llamadas(), 4, "solo las E0 de reposo");
  const m = man(dir);
  assert.deepStrictEqual(HN.validaManifiesto(m, dir), []); assert.strictEqual(m.actual, "madura"); assert.deepStrictEqual(m.epocas.map(e => e.epoca), ["madura", "reposo"]);
  assert.strictEqual(man(dir, "manifiesto.anterior.json").actual, "envero");
  assert.strictEqual(objetos(dir).length, 24, "sin --limpia no se borra nada"); for (const v of viejos) assert.ok(objetos(dir).includes(v));
  // dos épocas más allá, con --limpia: lo de envero ya no lo cita ni el manifiesto ni el anterior
  const r3 = await HN.hornea(base(sal, generador(), { fecha: "2027-02-01", limpia: true }));   // reposo + boton
  assert.strictEqual(r3.actual, "reposo"); assert.strictEqual(r3.horneadas, 8); assert.strictEqual(r3.borrados, 8, "las 8 de envero");
  const quedan = new Set(objetos(dir));
  for (const n of ["manifiesto.json", "manifiesto.anterior.json"]) for (const f of man(dir, n).variantes) assert.ok(quedan.has(f.huella + ".br"), f.huella);
  assert.strictEqual(quedan.size, 24);
});

test("otra calidad de brotli o otra versión del generador lo rehace todo; si se cae a mitad, el manifiesto viejo queda íntegro y el estado dice el error", async () => {
  const sal = carpeta(), dir = path.join(sal, "fixture", "olivos"); await HN.hornea(base(sal, generador()));
  const r = await HN.hornea(base(sal, generador(), { release: true }));
  assert.strictEqual(r.reutilizadas, 0); assert.strictEqual(man(dir).brotli, 11); assert.strictEqual(r.horneadas + r.ya_existian, 16); assert.ok(r.bytes_br_total > 0);
  const r2 = await HN.hornea(base(sal, generador("sintetico-2"))); assert.strictEqual(r2.reutilizadas, 0); assert.strictEqual(r2.horneadas, 16, "otra clave y otra cabecera: otros bytes");
  const antes = fs.readFileSync(path.join(dir, "manifiesto.json"), "utf8"), g = generador("sintetico-3"); let n = 0; const orig = g.aNivel;
  g.aNivel = (...a) => { if (++n === 5) throw new Error("se cayó a mitad"); return orig(...a); };
  await assert.rejects(HN.hornea(base(sal, g)), /a mitad/);
  assert.strictEqual(fs.readFileSync(path.join(dir, "manifiesto.json"), "utf8"), antes, "el manifiesto no se toca si no se terminó");
  const st = man(dir, "estado.json"); assert.strictEqual(st.fase, "error"); assert.match(st.error, /a mitad/); assert.strictEqual(st.hechas, 4);
});

test("--propios no está implementado y lo dice; una finca inválida se rechaza", async () => {
  await assert.rejects(HN.hornea(base(carpeta(), generador(), { propios: true })), /propios/);
  await assert.rejects(HN.hornea(base(carpeta(), generador(), { finca: "../x" })), /finca inválida/);
});
