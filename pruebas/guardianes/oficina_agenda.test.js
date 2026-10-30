"use strict";
// La oficina, OF11: la sección Agenda (apps/web/oficina/agenda.js, doc/sistema/OFICINA.md §7). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen (CSP estricta), DOM con textContent, las rutas que usa están en el contrato y son de la oficina,
//    todas las rutas de la api con la guarda de oficina (admin) o de sesión (hogar), el correo no se promete;
//  - las cuentas puras (agenda_puro.js): formulario → cuerpo de la api, filtros, meses y textos.
// No hay recorrido en Chrome de la Agenda: lo no probado en navegador (1280 y 1024 px, teclado, diálogo de evento) está en el informe de la tarea.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");

const html = lee("apps/web/oficina/index.html");
const fuentes = { "agenda.js": lee("apps/web/oficina/agenda.js"), "agenda_puro.js": lee("apps/web/oficina/agenda_puro.js"), "oficina.js": lee("apps/web/oficina/oficina.js") };

test("nada en línea ni de otro origen; los textos se pintan con textContent y solo se llama a rutas de la oficina que están en el contrato", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
  const openapi = lee("contratos/api.openapi.yaml");
  for (const r of ["/api/admin/eventos", "/api/admin/eventos/{id}", "/api/admin/eventos/{id}/cancelar", "/api/admin/eventos/{id}/inscritos", "/api/admin/eventos/{id}/avisar", "/api/agenda", "/api/agenda/{id}/inscripcion"])
    assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  for (const m of fuentes["agenda.js"].matchAll(/api\("([A-Z]+)", "(\/api\/[^"?]*)/g)) assert.match(m[2], /^\/api\/admin\/eventos/, "la oficina solo usa sus rutas: " + m[2]);
});

test("la api: las rutas de oficina con su guarda, las de hogar con la de sesión, y el aforo y la promoción se hacen con el evento bloqueado", () => {
  const ts = lee("apps/api/src/agenda/rutas.ts");
  const admin = [...ts.matchAll(/app\.(get|post|put)(?:<[^\n]*?>)?\("\/api\/admin\/eventos[^"]*", \{\s*preHandler: ([A-Z_a-z]+)/g)];
  assert.strictEqual(admin.length, 6, "seis rutas de oficina");
  for (const m of admin) assert.strictEqual(m[2], "OFICINA", "ruta de oficina sin la guarda: " + m[0]);
  const hogar = [...ts.matchAll(/app\.(get|post|delete)(?:<[^\n]*?>)?\("\/api\/agenda[^"]*", \{?\s*(?:preHandler: )?([A-Z_a-z]+)/g)];
  assert.strictEqual(hogar.length, 3, "tres rutas de hogar");
  for (const m of hogar) assert.strictEqual(m[2], "requiereSesion", "ruta de hogar sin guarda de sesión: " + m[0]);
  assert.match(ts, /SELECT \* FROM visitas WHERE id = \$1 FOR UPDATE/, "el evento se bloquea antes de contar plazas");
  assert.ok(!/(?:\bg|\bh|hogares)\.correo\b|SELECT[^`;]*[ ,]correo[ ,]/i.test(ts), "la api de la agenda nunca lee ni devuelve el correo de una familia");
  assert.match(lee("apps/api/migraciones/0012_agenda.sql"), /promovida_en/);
  assert.match(lee("apps/api/src/app.ts"), /await rutasAgenda\(app, ctx\)/);
});

test("la sección está en la barra lateral, hecha, con su formulario accesible y diciendo la verdad del correo", () => {
  assert.match(fuentes["oficina.js"], /\["agenda", "📅", "Agenda", true\]/);
  assert.match(fuentes["oficina.js"], /import \{ iniciaAgenda \} from "\.\/agenda\.js"/);
  for (const id of ["s-agenda", "aFiltros", "aLista", "aResumen", "bEventoNuevo", "dlgEvento", "fEvento", "evTitulo", "evTipo", "evEmpieza", "evPlazas", "evEstado", "evError"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /role="group" aria-label="Filtrar los eventos"/);
  assert.match(html, /<dialog id="dlgEvento" aria-labelledby="dlgEventoT">/);
  assert.match(html, /el correo todavía no sale/);
  assert.match(fuentes["agenda.js"], /h\("td", null, i\.nombre_interno \|\| i\.alias/, "los inscritos salen por familia, sin correo");
});

test("cuentas puras: del formulario a la api y vuelta, filtros, meses y textos", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "agenda_puro.js")).href);
  const AHORA = Date.parse("2026-10-30T10:00:00Z");
  const base = { titulo: "  Cata   de aceite ", tipo: "cata", empieza_en: "2026-11-20T18:00", termina_en: "", inscripcion_hasta: "", plazas: "12", lugar: " Patio ", descripcion: "", presencial: true, estado: "abierta" };
  let r = P.cuerpoDeFormulario(base, AHORA, true);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.cuerpo.titulo, "Cata de aceite", "espacios recortados y juntados");
  assert.strictEqual(r.cuerpo.plazas, 12); assert.strictEqual(r.cuerpo.lugar, "Patio");
  assert.strictEqual(r.cuerpo.termina_en, null); assert.strictEqual(r.cuerpo.descripcion, null); assert.strictEqual(r.cuerpo.inscripcion_hasta, null);
  assert.strictEqual(P.cuerpoDeFormulario({ ...base, plazas: "" }, AHORA, true).cuerpo.plazas, null, "sin aforo");
  assert.strictEqual(new Date(r.cuerpo.empieza_en).getTime(), new Date("2026-11-20T18:00").getTime(), "el campo local pasa a instante");
  for (const [malo, texto] of [[{ titulo: "  " }, /título/], [{ tipo: "fiesta" }, /tipo/], [{ empieza_en: "" }, /empieza/], [{ empieza_en: "2020-01-01T10:00" }, /futuro/],
    [{ termina_en: "2026-11-20T17:00" }, /después de empezar/], [{ inscripcion_hasta: "2026-11-21T10:00" }, /plazo/], [{ plazas: "0" }, /aforo/], [{ plazas: "2.5" }, /aforo/], [{ plazas: "abc" }, /aforo/],
    [{ lugar: "x".repeat(121) }, /lugar/], [{ estado: "cancelada" }, /estado/]]) {
    r = P.cuerpoDeFormulario({ ...base, ...malo }, AHORA, true);
    assert.ok(!r.ok && texto.test(r.error), JSON.stringify(malo) + " → " + r.error);
  }
  assert.ok(P.cuerpoDeFormulario({ ...base, empieza_en: "2020-01-01T10:00" }, AHORA, false).ok, "al editar un evento ya empezado no se exige el futuro");
  assert.strictEqual(P.aCampoLocal(new Date("2026-11-20T18:00").toISOString()), "2026-11-20T18:00", "ida y vuelta del campo local");
  assert.strictEqual(P.aCampoLocal(null), ""); assert.strictEqual(P.deCampoLocal(""), null); assert.strictEqual(P.deCampoLocal("no"), null);

  const ev = (id, empieza, estado) => ({ id, empieza_en: empieza, estado, hogares: 0, apuntadas: 0, en_espera: 0, plazas: null });
  const lista = [ev(1, "2026-12-05T10:00:00Z", "abierta"), ev(2, "2026-11-02T10:00:00Z", "abierta"), ev(3, "2026-09-01T10:00:00Z", "cerrada"), ev(4, "2026-11-10T10:00:00Z", "cancelada"), ev(5, "2026-11-20T10:00:00Z", "borrador")];
  assert.deepStrictEqual(P.filtra(lista, "proximos", AHORA).map(e => e.id), [2, 5, 1], "próximos: del más cercano al más lejano, sin cancelados");
  assert.deepStrictEqual(P.filtra(lista, "pasados", AHORA).map(e => e.id), [3]);
  assert.deepStrictEqual(P.filtra(lista, "cancelados", AHORA).map(e => e.id), [4]);
  assert.deepStrictEqual(P.cuentaPorFiltro(lista, AHORA), { proximos: 3, pasados: 1, cancelados: 1, todos: 5 });
  const meses = P.agrupaPorMes(P.filtra(lista, "proximos", AHORA));
  assert.deepStrictEqual(meses.map(m => m.eventos.map(e => e.id)), [[2, 5], [1]], "noviembre y diciembre");

  assert.match(P.resumenPlazas({ plazas: 10, apuntadas: 10, hogares: 4, en_espera: 2, plazas_libres: 0 }), /10 de 10 plazas.*4 familias.*2 familias en espera.*completo/);
  assert.match(P.resumenPlazas({ plazas: null, apuntadas: 1, hogares: 1, en_espera: 0 }), /sin aforo · 1 familia \(1 persona\)/);
  assert.match(P.textoDeAviso({ enviados: 0, omitidos_por_tope: 0 }), /No hay a quién avisar/);
  assert.match(P.textoDeAviso({ enviados: 0, omitidos_por_tope: 2 }), /tope/);
  assert.match(P.textoDeAviso({ enviados: 3, omitidos_por_tope: 1, correo_pendiente: 2 }), /3 familias en el gemelo.*1 omitida por el tope.*correo todavía no sale: 2 familias lo pidió/);
});
