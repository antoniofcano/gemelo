"use strict";
// El servicio hornero (O7f, ADR-0018 §4; tuberia/olivos/servicio.mjs y salud.mjs) con el generador SINTÉTICO (sin three-gen, sin Docker, sin Chrome):
//   - los disparadores: arranque, índice, calendario, GEN_VERSION/CACHE_VERSION y cambio de época; y NINGUNO por el simple paso del tiempo (sin vuelta diaria);
//   - la próxima fecha en que cambia el par época actual/siguiente, calculada con el calendario;
//   - el candado por finca: dos hornos a la vez sobre la misma finca no pasan;
//   - la salud: listo y durmiendo hasta una fecha = sano; error, sin estado o atascado = enfermo.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const os = require("os");
const { RAIZ, fs, path } = require("./_util");
const imp = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const hasta = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await dormir(25); };

let SV, SA, HN, E, S;
test.before(async () => {
  SV = await imp("tuberia", "olivos", "servicio.mjs"); SA = await imp("tuberia", "olivos", "salud.mjs"); HN = await imp("tuberia", "olivos", "hornero.mjs");
  E = await imp("apps", "web", "olivo", "epocas.js"); S = await imp("pruebas", "olivo", "horneado", "sintetica.mjs");
});
const generador = () => ({ GEN_VERSION: S.GEN_VERSION_SINTETICA, CACHE_VERSION: S.CACHE_VERSION_SINTETICA,
  claveReceta: (e, nivel) => "olivo|" + S.GEN_VERSION_SINTETICA + "|c" + S.CACHE_VERSION_SINTETICA + "|" + nivel + "|" + e.tipo + "|" + e.epoca + "|" + e.semilla + "|{}",
  receta: e => S.recetaSintetica({ semilla: e.semilla, nivel: "E0", epoca: e.epoca }), aNivel: (r, nivel) => S.recetaSintetica({ semilla: r.entrada.semilla, nivel, epoca: r.entrada.epoca }) });
const cal = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "epocas-calendario.json"), "utf8"));

test("próxima fecha en que cambia el par época actual/siguiente: la primera con otra época, con el calendario del repo", () => {
  const tabla = E.tablaDe(cal, "hituelo"), f = new Date("2026-10-29T10:00:00Z"), p = SV.proximoCambioDeEpoca(tabla, f, E.epocaDeFecha);
  assert.ok(p && p.desde > "2026-10-29", "una fecha futura");
  assert.notStrictEqual(E.epocaDeFecha(tabla, new Date(p.desde + "T00:00:00Z")), E.epocaDeFecha(tabla, f));
  const antes = new Date(Date.parse(p.desde + "T00:00:00Z") - 86400000);
  assert.strictEqual(E.epocaDeFecha(tabla, antes), E.epocaDeFecha(tabla, f), "el día anterior sigue en la misma época");
  assert.strictEqual(SV.despertarEn(p.desde, "03:00"), Date.parse(p.desde + "T03:00:00Z"));
  assert.throws(() => SV.minutosDe("25:00")); assert.strictEqual(SV.minutosDe("03:30"), 210);
});

test("motivoDeVuelta: arranque, índice, calendario, versión y cambio de época; el paso del tiempo no dispara nada; un fallo espera su reintento", () => {
  const G = { GEN_VERSION: "g1", CACHE_VERSION: 2 }, man = { gen_version: "g1", cache_version: 2, formato: 1, actual: "envero" };
  const c = (x) => Object.assign({ primera: false, ahora: 1000, fallo: null, reintentoMs: 300000, manifiesto: man, G, formato: 1, epocaHoy: "envero",
    sellos: { indice: "a", calendario: "b" }, previos: { indice: "a", calendario: "b" }, despertarEn: 5000 }, x);
  assert.strictEqual(SV.motivoDeVuelta(c({})), null, "todo al día: sigue durmiendo");
  assert.strictEqual(SV.motivoDeVuelta(c({ ahora: 4999 })), null, "ni a las puertas del cambio");
  assert.match(SV.motivoDeVuelta(c({ primera: true })), /arranque/);
  assert.match(SV.motivoDeVuelta(c({ manifiesto: null })), /sin manifiesto/);
  assert.match(SV.motivoDeVuelta(c({ sellos: { indice: "z", calendario: "b" } })), /índice/);
  assert.match(SV.motivoDeVuelta(c({ sellos: { indice: "a", calendario: "z" } })), /calendario/);
  assert.match(SV.motivoDeVuelta(c({ G: { GEN_VERSION: "g2", CACHE_VERSION: 2 } })), /GEN_VERSION/);
  assert.match(SV.motivoDeVuelta(c({ G: { GEN_VERSION: "g1", CACHE_VERSION: 3 } })), /CACHE_VERSION/);
  assert.match(SV.motivoDeVuelta(c({ ahora: 5000 })), /cambio de época/, "llegada la hora de despertar");
  assert.strictEqual(SV.motivoDeVuelta(c({ epocaHoy: "madura", ahora: 1000 })), null, "la época ya cambió en el calendario pero aún no es la hora de despertar: espera");
  assert.match(SV.motivoDeVuelta(c({ despertarEn: null, epocaHoy: "madura" })), /cambio de época/, "sin despertar programado se compara la época del manifiesto");
  assert.strictEqual(SV.motivoDeVuelta(c({ fallo: { en: 900 }, ahora: 1000, sellos: { indice: "z", calendario: "b" } })), null, "tras un fallo no se reintenta en cada comprobación");
  assert.match(SV.motivoDeVuelta(c({ fallo: { en: 0 }, ahora: 300000 })), /reintento/);
});

test("candado por finca: el segundo que lo pide no lo obtiene hasta que el primero lo libera", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "candado-")), ruta = path.join(dir, "hituelo");
  const a = await SV.tomaCandado(ruta); assert.strictEqual(typeof a, "function");
  assert.strictEqual(await SV.tomaCandado(ruta), null, "otro hornero ya trabaja en la finca");
  const otra = await SV.tomaCandado(path.join(dir, "cerro")); assert.strictEqual(typeof otra, "function", "otra finca, otro candado"); await otra();
  await a();
  const b = await SV.tomaCandado(ruta); assert.strictEqual(typeof b, "function", "liberado, se puede volver a tomar"); await b();
});

test("servicio: hornea al arrancar, no hace nada mientras duerme y vuelve a hornear solo si cambia el índice; con el candado ocupado no lanza", async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "servicio-")), cfg = { fincas: ["fixture"], datos: path.join(t, "d"), salida: path.join(t, "s"), estado: path.join(t, "e"),
    hora: "03:00", compruebaMs: 25, reintentoMs: 60000, calendario: path.join(RAIZ, "contratos", "epocas-calendario.json"), release: false, limpia: true };
  fs.mkdirSync(path.join(cfg.datos, "fixture"), { recursive: true }); const indice = path.join(cfg.datos, "fixture", "indice.json"); fs.writeFileSync(indice, "{}");
  const vueltas = [], hornea = async o => { vueltas.push(o); return HN.hornea(o); }, parar = { parado: false };
  const p = SV.servicio(cfg, { hornea, generador: generador(), parar, log: () => {} });
  await hasta(() => vueltas.length >= 1 && fs.existsSync(path.join(cfg.estado, "servicio.json")) && (JSON.parse(fs.readFileSync(path.join(cfg.estado, "servicio.json"), "utf8")).fincas.fixture.durmiendo_hasta)); await dormir(500);
  assert.strictEqual(vueltas.length, 1, "una vuelta al arrancar y ninguna más mientras nada cambia (muchas comprobaciones de sellos): " + vueltas.length);
  const st = JSON.parse(fs.readFileSync(path.join(cfg.estado, "fixture.json"), "utf8"));
  assert.deepStrictEqual([st.fase, st.error, st.hechas, st.total], ["listo", null, 16, 16], "el estado del hornero está en su carpeta de estado");
  assert.ok(!fs.existsSync(path.join(cfg.salida, "fixture", "olivos", "estado.json")), "y NO en la carpeta servida");
  const lat = JSON.parse(fs.readFileSync(path.join(cfg.estado, "servicio.json"), "utf8"));
  assert.match(lat.fincas.fixture.durmiendo_hasta, /^\d{4}-\d\d-\d\dT03:00:00Z$/, "duerme hasta el cambio de época, a la hora configurada");
  const sano = SA.evaluaSalud({ fixture: st }, lat, { ahora: Date.now(), latidoMaxS: 60 });
  assert.ok(sano.sano && /durmiendo hasta/.test(sano.texto), sano.texto);
  // cambia el índice: una vuelta (idempotente: todo reutilizado)
  fs.writeFileSync(indice, JSON.stringify({ cambio: 1234567 })); await hasta(() => vueltas.length >= 2); await dormir(300);
  assert.strictEqual(vueltas.length, 2, "el sello del índice cambió: una vuelta más");
  assert.match(JSON.parse(fs.readFileSync(path.join(cfg.estado, "servicio.json"), "utf8")).fincas.fixture.ultimo_motivo, /índice/);
  // con el candado de otro, la vuelta se aplaza (no se lanzan dos hornos sobre la misma finca)
  const ajeno = await SV.tomaCandado(path.join(cfg.estado, "fixture")); fs.writeFileSync(indice, '{"cambio":7654321999}'); await dormir(800);
  assert.strictEqual(vueltas.length, 2, "otro hornero tiene el candado: no se lanza");
  await ajeno(); parar.parado = true; if (parar.despierta) parar.despierta(); await p;
});

test("calendario de la configuración publicada (decisión 112): manda si cubre el año; si no o si falta, el fichero; su sello solo mira las épocas", () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "calcfg-")), rutaCal = path.join(RAIZ, "contratos", "epocas-calendario.json"), rutaCfg = path.join(t, "config.json");
  const sinCfg = SV.calendarioDe(rutaCal, null, E.validaTabla);
  assert.deepStrictEqual([sinCfg.origen, sinCfg.cal.comun], ["fichero", cal.comun]);
  assert.strictEqual(SV.calendarioDe(rutaCal, rutaCfg, E.validaTabla).origen, "fichero", "el fichero de la configuración aún no existe");
  const comun = JSON.parse(JSON.stringify(cal.comun)); comun.verde.hasta = "09-14"; comun.envero.desde = "09-15";
  fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, epocas: { comun } }));
  const c1 = SV.calendarioDe(rutaCal, rutaCfg, E.validaTabla);
  assert.strictEqual(c1.origen, "configuración"); assert.deepStrictEqual(c1.cal.comun, comun); assert.deepStrictEqual(c1.cal.fincas, {});
  assert.strictEqual(E.epocaDeFecha(E.tablaDe(c1.cal, "hituelo"), new Date("2026-09-12T00:00:00Z")), "verde", "el 12 de septiembre es verde con la configuración");
  fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, escalera: { bandaM: 1 }, epocas: { comun } }));
  assert.strictEqual(SV.calendarioDe(rutaCal, rutaCfg, E.validaTabla).sello, c1.sello, "cambiar la escalera no cambia el sello de las épocas");
  const hueco = JSON.parse(JSON.stringify(comun)); hueco.flor.hasta = "06-01";
  fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, epocas: { comun: hueco } }));
  const c2 = SV.calendarioDe(rutaCal, rutaCfg, E.validaTabla);
  assert.strictEqual(c2.origen, "fichero"); assert.match(c2.aviso, /no cubren el año/);
  fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, componentes: {} }));
  assert.strictEqual(SV.calendarioDe(rutaCal, rutaCfg, E.validaTabla).origen, "fichero", "una configuración sin épocas no cambia nada");
});

test("servicio con GEMELO_HORNERO_CONFIG: hornea con el calendario publicado y vuelve a hornear si cambian sus épocas", async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "servicio-cfg-")), rutaCfg = path.join(t, "config.json"), cfg = { fincas: ["fixture"], datos: path.join(t, "d"), salida: path.join(t, "s"),
    estado: path.join(t, "e"), hora: "03:00", compruebaMs: 25, reintentoMs: 60000, calendario: path.join(RAIZ, "contratos", "epocas-calendario.json"), config: rutaCfg, release: false, limpia: true };
  fs.mkdirSync(path.join(cfg.datos, "fixture"), { recursive: true }); fs.writeFileSync(path.join(cfg.datos, "fixture", "indice.json"), "{}");
  const comun = JSON.parse(JSON.stringify(cal.comun)); fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, epocas: { comun } }));
  const vueltas = [], hornea = async o => { vueltas.push(o); return HN.hornea(o); }, parar = { parado: false };
  const p = SV.servicio(cfg, { hornea, generador: generador(), parar, log: () => {} });
  await hasta(() => vueltas.length >= 1); await dormir(300);
  assert.strictEqual(vueltas.length, 1); assert.strictEqual(vueltas[0].calendario.origen, "configuración versionada (GEMELO_HORNERO_CONFIG)");
  fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, escalera: { bandaM: 1 }, epocas: { comun } })); await dormir(300);
  assert.strictEqual(vueltas.length, 1, "cambiar otra cosa de la configuración no re-hornea");
  comun.verde.hasta = "09-14"; comun.envero.desde = "09-15"; fs.writeFileSync(rutaCfg, JSON.stringify({ v: 1, epocas: { comun } }));
  await hasta(() => vueltas.length >= 2); await dormir(200);
  assert.strictEqual(vueltas.length, 2, "cambiaron las épocas publicadas: una vuelta más");
  assert.match(JSON.parse(fs.readFileSync(path.join(cfg.estado, "servicio.json"), "utf8")).fincas.fixture.ultimo_motivo, /calendario/);
  parar.parado = true; if (parar.despierta) parar.despierta(); await p;
});

test("re-hornear desde la oficina (OF9): una petición con id nuevo lanza UNA vuelta y se anota atendida; no se repite, ni siquiera tras reiniciar el hornero", async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "servicio-pedido-")), rutaPedido = path.join(t, "pedido-rehornear.json"), cfg = { fincas: ["fixture"], datos: path.join(t, "d"), salida: path.join(t, "s"),
    estado: path.join(t, "e"), hora: "03:00", compruebaMs: 25, reintentoMs: 60000, calendario: path.join(RAIZ, "contratos", "epocas-calendario.json"), pedido: rutaPedido, release: false, limpia: true };
  fs.mkdirSync(path.join(cfg.datos, "fixture"), { recursive: true }); fs.writeFileSync(path.join(cfg.datos, "fixture", "indice.json"), "{}");
  const lat = () => JSON.parse(fs.readFileSync(path.join(cfg.estado, "servicio.json"), "utf8")).fincas.fixture;
  assert.strictEqual(SV.idDePedido(rutaPedido), null, "sin fichero, sin petición");
  fs.writeFileSync(rutaPedido, JSON.stringify({ id: "../mal" })); assert.strictEqual(SV.idDePedido(rutaPedido), null, "un id que no vale no cuenta");
  fs.writeFileSync(rutaPedido, "{no es json"); assert.strictEqual(SV.idDePedido(rutaPedido), null, "ilegible no cuenta ni tumba");
  const vueltas = [], hornea = async o => { vueltas.push(o); return HN.hornea(o); };
  let parar = { parado: false }, p = SV.servicio(cfg, { hornea, generador: generador(), parar, log: () => {} });
  await hasta(() => vueltas.length >= 1); await dormir(300);
  assert.strictEqual(vueltas.length, 1, "arranque");
  fs.writeFileSync(rutaPedido, JSON.stringify({ v: 1, id: "11111111-aaaa", pedido_en: "2026-10-30T10:00:00Z", por: 1 }));
  await hasta(() => vueltas.length >= 2 && lat().pedido_atendido); await dormir(300);
  assert.strictEqual(vueltas.length, 2, "la petición lanza una vuelta");
  assert.strictEqual(lat().pedido_atendido, "11111111-aaaa"); assert.match(lat().pedido_atendido_en, /^\d{4}-/); assert.match(lat().ultimo_motivo, /pedido desde la oficina/);
  await dormir(300); assert.strictEqual(vueltas.length, 2, "la misma petición no se atiende dos veces");
  parar.parado = true; if (parar.despierta) parar.despierta(); await p;
  // reinicio: el latido recuerda lo atendido; la vuelta de arranque no es por la petición vieja y una petición nueva sí cuenta
  const v2 = []; parar = { parado: false };
  p = SV.servicio(cfg, { hornea: async o => { v2.push(o); return HN.hornea(o); }, generador: generador(), parar, log: () => {} });
  await hasta(() => v2.length >= 1); await dormir(300);
  assert.strictEqual(v2.length, 1); assert.doesNotMatch(lat().ultimo_motivo, /pedido/, "tras reiniciar, la petición vieja no se repite");
  fs.writeFileSync(rutaPedido, JSON.stringify({ v: 1, id: "22222222-bbbb", pedido_en: "2026-10-30T11:00:00Z", por: 1 }));
  await hasta(() => v2.length >= 2 && lat().pedido_atendido === "22222222-bbbb"); assert.strictEqual(v2.length, 2);
  parar.parado = true; if (parar.despierta) parar.despierta(); await p;
});

test("motivoDeVuelta: una petición de re-hornear manda sobre todo, también sobre el reintento de un fallo", () => {
  const G = { GEN_VERSION: "g1", CACHE_VERSION: 2 }, man = { gen_version: "g1", cache_version: 2, formato: 1, actual: "envero" };
  const c = x => Object.assign({ primera: false, ahora: 1000, fallo: null, pedido: null, reintentoMs: 300000, manifiesto: man, G, formato: 1, epocaHoy: "envero", sellos: { indice: "a", calendario: "b" }, previos: { indice: "a", calendario: "b" }, despertarEn: 5000 }, x);
  assert.strictEqual(SV.motivoDeVuelta(c({})), null);
  assert.match(SV.motivoDeVuelta(c({ pedido: "abc-12345" })), /pedido desde la oficina/);
  assert.match(SV.motivoDeVuelta(c({ pedido: "abc-12345", fallo: { en: 999 } })), /pedido desde la oficina/);
});

test("salud: listo y durmiendo = sano; en curso reciente = sano; error, sin estado, atascado o sin latido = enfermo", () => {
  const ahora = Date.parse("2026-10-29T12:00:00Z"), latido = { latido_en: "2026-10-29T11:59:00Z", fincas: { f: { durmiendo_hasta: "2026-11-01T03:00:00Z" } } };
  const listo = { fase: "listo", hechas: 16, total: 16, epoca_actual: "envero", error: null, actualizado_en: "2026-10-29T08:00:00Z" };
  const ev = (st, la, o) => SA.evaluaSalud({ f: st }, la, Object.assign({ ahora, topeVueltaS: 900, latidoMaxS: 1860 }, o));
  const s = ev(listo, latido); assert.ok(s.sano); assert.match(s.texto, /durmiendo hasta 2026-11-01T03:00:00Z/);
  assert.ok(ev({ fase: "horneando", hechas: 3, total: 16, actualizado_en: "2026-10-29T11:59:30Z" }, null).sano, "en curso, movido hace 30 s (el latido no se exige)");
  const atascado = ev({ fase: "horneando", hechas: 3, total: 16, actualizado_en: "2026-10-29T11:00:00Z" }, latido); assert.ok(!atascado.sano); assert.match(atascado.texto, /ATASCADO/);
  const err = ev({ fase: "error", error: "no valida" }, latido); assert.ok(!err.sano); assert.match(err.texto, /ERROR: no valida/);
  assert.ok(!ev(null, latido).sano, "sin estado"); assert.ok(!ev(listo, null).sano, "sin latido");
  assert.ok(!ev(listo, Object.assign({}, latido, { latido_en: "2026-10-29T10:00:00Z" })).sano, "el servicio dejó de latir");
});
