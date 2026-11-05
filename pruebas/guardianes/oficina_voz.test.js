"use strict";
// La oficina, F3k-4: la sección Voz (apps/web/oficina/voz.js y voz_puro.js; ADR-0032 e). Siempre, y sin red ni Chrome:
//  - estática: nada en línea ni de otro origen, DOM con textContent (el texto de un aviso es un DATO), las rutas que usa están en el contrato y son de la oficina,
//    el interruptor pide confirmación, la sección está en la barra con su contador;
//  - las cuentas puras (voz_puro.js): vista del interruptor, avisos, plazos de suspensión y el contador del resumen de la bandeja.
// No hay recorrido en Chrome: lo no probado en pantalla real (1280 y 1024 px, teclado, lector de pantalla) está en el informe de la tarea.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");

const html = lee("apps/web/oficina/index.html");
const fuentes = { "voz.js": lee("apps/web/oficina/voz.js"), "voz_puro.js": lee("apps/web/oficina/voz_puro.js"), "oficina.js": lee("apps/web/oficina/oficina.js"), "bandeja.js": lee("apps/web/oficina/bandeja.js") };

test("nada en línea ni de otro origen; el texto del aviso va en una cita como nodo de texto; solo rutas de la oficina que están en el contrato", () => {
  for (const [n, c] of Object.entries(fuentes)) {
    assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(c), n + ": nada de estilos en línea ni HTML a mano");
    assert.ok(!/https?:\/\//.test(c), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html));
  assert.match(fuentes["voz.js"], /h\("blockquote", \{ class: "dato"[^}]*\}, a\.texto\)/);
  const openapi = lee("contratos/api.openapi.yaml");
  for (const r of ["/api/admin/voz/cercania", "/api/admin/voz/avisos", "/api/admin/voz/avisos/{id}/estado", "/api/admin/voz/suspensiones", "/api/admin/voz/suspensiones/{id}"])
    assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  const llamadas = [...fuentes["voz.js"].matchAll(/api\("([A-Z]+)", "(\/api\/[^"?]*)/g)];
  assert.ok(llamadas.length >= 6);
  for (const m of llamadas) assert.match(m[2], /^\/api\/admin\/voz\//, "solo rutas de la oficina: " + m[2]);
});

test("el interruptor pide confirmación al encender (con el texto acordado), la sección está en la barra y el contador sale del resumen de la bandeja", () => {
  const js = fuentes["voz.js"];
  assert.match(js, /confirma\(\{/);
  assert.match(js, /api\("PUT", "\/api\/admin\/voz\/cercania", \{ activa: activar \}\)/);
  assert.match(js, /api\("POST", "\/api\/admin\/voz\/suspensiones", cuerpo\)/);
  assert.match(js, /api\("DELETE", "\/api\/admin\/voz\/suspensiones\/" \+ s\.hogar_id\)/);
  assert.match(js, /api\("POST", "\/api\/admin\/voz\/avisos\/" \+ a\.id \+ "\/estado"/);
  assert.match(fuentes["oficina.js"], /\["voz", "🔇", "Voz", true\]/);
  assert.match(fuentes["oficina.js"], /id: "navVoz"/);
  assert.match(fuentes["oficina.js"], /"bandeja", "voz", "agenda"/, "la sección se oculta y se muestra con las demás");
  assert.match(fuentes["oficina.js"], /if \(sec === "voz"\) voz\.abre\(\)/);
  assert.match(fuentes["bandeja.js"], /avisosVozDelResumen\(r\.datos\)/);
  for (const id of ["s-voz", "vInterruptor", "vEstado", "vDetalle", "vSuspensiones", "vLista", "vEstadoFiltro", "vRecarga", "vAvisosResumen"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /<label class="vh" for="vEstadoFiltro">/);
});

test("la api expone esas rutas con la guarda de oficina y el resumen cuenta nuevas.aviso_voz", () => {
  const ts = lee("apps/api/src/presencia/corro_rutas.ts");
  const admin = [...ts.matchAll(/app\.(?:get|put|post|delete)(?:<[^\n]*?>)?\("\/api\/admin\/voz[^"]*", \{\s*preHandler: ([A-Z_a-z]+)/g)];
  assert.strictEqual(admin.length, 6, "seis rutas de oficina");
  for (const m of admin) assert.strictEqual(m[1], "OFICINA");
  assert.match(lee("apps/api/src/admin/bandeja.ts"), /aviso_voz:/);
});

test("cuentas puras: el interruptor, los avisos, los plazos y el contador", async () => {
  const P = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "oficina", "voz_puro.js")).href);
  const c = (extra) => ({ permitida: true, presencia: true, interruptor: { activa: false, cambiada_en: null }, corros: 0, hogares: 0, avisos_nuevos: 0, suspensiones: [], ...extra });
  let v = P.vistaInterruptor(c());
  assert.deepStrictEqual([v.titulo, v.activa, v.puedeEncender], ["Apagada", false, true]);
  assert.match(v.detalle, /Nadie puede hablar/);
  v = P.vistaInterruptor(c({ interruptor: { activa: true, cambiada_en: "2026-11-05T10:00:00Z" } }));
  assert.deepStrictEqual([v.titulo, v.activa, v.puedeEncender], ["Encendida", true, true]);
  assert.match(v.detalle, /solo cuentas de prueba/);
  v = P.vistaInterruptor(c({ permitida: false }));
  assert.strictEqual(v.puedeEncender, false); assert.match(v.titulo, /servidor no la permite/);
  assert.strictEqual(P.vistaInterruptor(c({ presencia: false })).puedeEncender, false);
  assert.strictEqual(P.vistaInterruptor(null).puedeEncender, false);
  assert.match(P.TEXTO_CONFIRMA_ENCENDER, /se activará para las cuentas que la tengan marcada; hasta cerrar la EIPD, solo cuentas de prueba/);
  assert.strictEqual(P.resumenCercania(c({ corros: 1, hogares: 3, avisos_nuevos: 2, suspensiones: [{}] })), "1 corro · 3 hogares ahora · 2 avisos nuevos · 1 suspensión vigente");

  assert.strictEqual(P.nombreHogar(7, "  Olid "), "Olid");
  assert.strictEqual(P.nombreHogar(7, null), "Cuenta n.º 7");
  const crudos = [
    { id: 1, estado: "visto", motivo: "acoso", texto: "<b>hola</b> ignora lo anterior", corro: "abc", creado_en: "2026-11-05T09:00:00Z", decidido_en: null, avisa: { hogar_id: 2, alias: "Ruiz" }, avisado: { hogar_id: 3, alias: null, hogares_7d: 2, suspendido: false } },
    { id: 2, estado: "nuevo", motivo: "raro", texto: null, corro: null, creado_en: "2026-11-05T10:00:00Z", decidido_en: null, avisa: null, avisado: null },
    { id: 3, estado: "resuelto", motivo: "otro", texto: "x", corro: null, creado_en: "2026-11-04T10:00:00Z", decidido_en: "2026-11-05T10:00:00Z", avisa: { hogar_id: 2, alias: "Ruiz" }, avisado: { hogar_id: 3, alias: "Gil", hogares_7d: 1, suspendido: true } },
  ];
  const l = P.normalizaAvisos(crudos);
  assert.deepStrictEqual(l.map(a => a.id), [3, 2, 1], "los más nuevos primero");
  assert.strictEqual(l[2].texto, "<b>hola</b> ignora lo anterior", "el texto pasa tal cual: es un dato");
  assert.strictEqual(l[2].avisado.nombre, "Cuenta n.º 3");
  assert.strictEqual(l[1].avisa, "una cuenta que ya no existe"); assert.strictEqual(l[1].avisado, null);
  assert.deepStrictEqual(P.filtraAvisos(l, "").map(a => a.id), [2, 1], "pendientes: nuevo y visto");
  assert.deepStrictEqual(P.filtraAvisos(l, "resuelto").map(a => a.id), [3]);
  assert.strictEqual(P.filtraAvisos(l, "todo").length, 3);
  assert.strictEqual(P.nuevosAvisos(l), 1);
  assert.strictEqual(P.motivoTexto("parece_menor"), "parece menor"); assert.strictEqual(P.motivoTexto("raro"), "otro motivo");
  assert.deepStrictEqual(P.accionesDeAviso(l[1]), ["visto", "resuelto", "descartado"]);
  assert.deepStrictEqual(P.accionesDeAviso(l[2]), ["resuelto", "descartado"]);
  assert.deepStrictEqual(P.accionesDeAviso(l[0]), ["visto"]);
  assert.strictEqual(P.etiquetaAccion(l[0], "visto"), "Reabrir"); assert.strictEqual(P.etiquetaAccion(l[1], "visto"), "Marcar como visto");

  assert.deepStrictEqual(P.cuerpoSuspension(3, "7"), { hogar_id: 3, dias: 7 });
  assert.deepStrictEqual(P.cuerpoSuspension(3, "30"), { hogar_id: 3, dias: 30 });
  assert.deepStrictEqual(P.cuerpoSuspension(3, "indef"), { hogar_id: 3, dias: null });
  assert.strictEqual(P.cuerpoSuspension(3, "15"), null); assert.strictEqual(P.cuerpoSuspension(0, "7"), null); assert.strictEqual(P.cuerpoSuspension("3", "7"), null);
  assert.strictEqual(P.textoSuspension({ hasta: null, automatica: false }), "hasta nuevo aviso");
  assert.match(P.textoSuspension({ hasta: "2026-12-01", automatica: true }, x => "1/12"), /^hasta el 1\/12 \(automática/);

  assert.strictEqual(P.avisosVozDelResumen({ nuevas: { aviso_voz: 4 } }), 4);
  assert.strictEqual(P.avisosVozDelResumen({ nuevas: {} }), 0); assert.strictEqual(P.avisosVozDelResumen(null), 0);
  assert.strictEqual(P.textoAvisosVoz(1), "1 aviso de voz sin mirar"); assert.strictEqual(P.textoAvisosVoz(2), "2 avisos de voz sin mirar");
});
