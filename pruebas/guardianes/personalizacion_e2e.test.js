"use strict";
// La personalización de los árboles de punta a punta (P7f): Chrome contra la api REAL con PostGIS en un contenedor (Testcontainers, NO el entorno de la
// persona) y el motor de verdad (build con Vite sobre el fixture sintético), con la CSP de infra/Caddyfile IMPUESTA. Solo con GEMELO_DOCKER=1 (y dentro del
// turno del banco: lanza() lo pide). Recorrido:
//   Ruiz (titular de H-01): elige un olivo de su haza con un clic, «Nombrar», «Colgar foto o dibujo» (aviso con casilla, reducción en el aparato, subida,
//   PUT), renombrar sin perder la foto, verlo en el mundo (el rótulo del DOM y la lámina colgada del árbol, liberada al soltar);
//   Olid (otra familia): ve el nombre y la imagen en el olivo ajeno, solo ofrece «Denunciar», denuncia (y la segunda vez le dice que ya lo hizo);
//   unas gafas vinculadas de Ruiz: ven pero no escriben (la api responde 403 solo_titular);
//   Ruiz quita lo suyo: deja de verse para Olid.
// Y deja una captura en pruebas/salida/personaliza/ (se borra con la carpeta de salida; no se versiona).
const test = require("node:test"), assert = require("node:assert");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { RAIZ, chrome, playwright, fixture, fs, path } = require("./_util");

const SALTO = process.env.GEMELO_DOCKER !== "1" ? "recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la personalización contra la api real NO se ha comprobado" : null;

// un PNG de 2400 x 1800 (más grande que el límite de reducción) con un degradado y un rayado, sin dependencias: para ver que el aparato lo reduce antes de subirlo
function pngSintetico(w, h) {
  const fila = w * 3 + 1, raw = Buffer.alloc(fila * h);
  for (let y = 0; y < h; y++) { raw[y * fila] = 0; for (let x = 0; x < w; x++) { const o = y * fila + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = ((x >> 5) + (y >> 5)) & 1 ? 200 : 60; } }
  const trozo = (tipo, datos) => { const t = Buffer.concat([Buffer.from(tipo), datos]), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(datos.length); c.writeUInt32BE(zlib.crc32(t) >>> 0); return Buffer.concat([l, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(raw)), trozo("IEND", Buffer.alloc(0))]);
}

test("personalización de punta a punta: nombrar, colgar una imagen, verla, denunciarla desde otra cuenta, gafas sin escribir, quitar (CSP impuesta)", { timeout: 1_200_000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la personalización NO se ha comprobado");
  if (!fs.existsSync(path.join(RAIZ, "apps", "api", "node_modules", "fastify")) || !fs.existsSync(path.join(RAIZ, "apps", "web", "node_modules", "vite"))) return t.skip("faltan las dependencias de apps/api o apps/web (npm ci)");
  const { montaPagina } = require("./_pagina"), { lanza } = require("./_navegador");
  const fx = fixture(), pag = montaPagina({ finca: "hituelo", fixture: fx });
  const indice = pag.indice, parc = indice.parcelas[0], xs = parc.linde.map(q => q[0]), ys = parc.linde.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), xm = (x0 + x1) / 2;   // H-01 = mitad oeste de la primera parcela; H-02 = la este

  const nav = await lanza();
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const srv = spawn(process.execPath, ["pruebas/e2e/personaliza_servidor.ts", pag.carpeta, path.join(fx, "hituelo")], { cwd: path.join(RAIZ, "apps", "api"), env, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "", errs = "";
  srv.stdout.on("data", d => { salida += d; }); srv.stderr.on("data", d => { errs += d; });
  try {
    const info = await new Promise((ok, mal) => {
      const lim = setTimeout(() => mal(new Error("el servidor no arrancó en 5 min: " + errs)), 300_000);
      const mira = setInterval(() => {
        const m = /LISTO (\{.*\})/.exec(salida);
        if (m) { clearInterval(mira); clearTimeout(lim); ok(JSON.parse(m[1])); }
        else if (srv.exitCode !== null) { clearInterval(mira); clearTimeout(lim); mal(new Error("el servidor salió (" + srv.exitCode + "): " + errs)); }
      }, 500);
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const base = info.url, get = async r => (await fetch(base + r)).json();
    const errores = [];

    // una familia en su navegador: entra con su enlace mágico y abre el mundo con ?api=/api/ (la página de prueba no lleva D.base)
    async function familia(correo, vp) {
      const ctx = await nav.newContext({ viewport: vp || { width: 1100, height: 760 }, locale: "es-ES", ignoreHTTPSErrors: true, permissions: [] });
      await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      const pg = await ctx.newPage();
      pg.on("pageerror", e => errores.push(correo + " PAGEERROR " + String(e)));
      pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404|409)|style-src|inline style|fonts\.googleapis/.test(m.text())) errores.push(correo + " " + m.text()); });
      const { url } = await get("/__prueba/enlace?para=" + encodeURIComponent(correo));
      await pg.goto(url); await pg.click("button[type=submit], input[type=submit]"); await pg.waitForLoadState("load");
      return { ctx, pg };
    }
    async function abreMundo(pg, esperaPers) {
      await pg.goto(base + "/mundo/index.html?api=/api/&debug", { waitUntil: "commit", timeout: 120_000 });
      await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__personaliza, null, { timeout: 180_000 });
      await pg.waitForFunction(() => { const e = window.__personaliza(); return e.titular !== null && e.hazas >= 4 && e.cargadas >= 4; }, null, { timeout: 60_000 });
      if (esperaPers !== undefined) await pg.waitForFunction(n => window.__personaliza().personalizados === n, esperaPers, { timeout: 30_000 });
    }
    // mirar un olivo desde 25 m y devolver dónde está en pantalla (para clicar de verdad)
    async function miraYClica(pg, copasId) {
      await pg.evaluate(id => { const g = window.__g, c = g.copas.find(q => q.id === id); g.orb.az = 0.4; g.orb.el = 0.45; g.orb.dist = 25; g.objetivo.x = c.x; g.objetivo.z = -c.y; g.objetivo.y = g.suelo(c.x, c.y) + 4; g.pon("gem"); }, copasId);
      await pg.waitForTimeout(1200);
      const p = await pg.evaluate(id => {
        const g = window.__g, c = g.copas.find(q => q.id === id), cam = g.camera, ex = Number(document.getElementById("exag").value) || 1; cam.updateMatrixWorld();
        const m = cam.matrixWorldInverse.elements, q = cam.projectionMatrix.elements, v = [c.x, (g.suelo(c.x, c.y) + c.h * 0.7) * ex, -c.y, 1];
        const vx = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], vy = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], vz = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        const cx = q[0] * vx + q[8] * vz, cy = q[5] * vy + q[9] * vz, cw = -vz, r = document.getElementById("lienzo").getBoundingClientRect();
        return { x: r.left + (cx / cw * 0.5 + 0.5) * r.width, y: r.top + (-cy / cw * 0.5 + 0.5) * r.height };
      }, copasId);
      await pg.mouse.click(p.x, p.y);
      await pg.waitForFunction(id => (window.__usables().actual || "").endsWith(":" + id), copasId, { timeout: 10_000 });
      return p;
    }
    const botonesFicha = pg => pg.$$eval("#fichaAcciones button", bs => bs.map(b => b.textContent));
    const filasFicha = pg => pg.$$eval("#fichaDatos dt", ds => ds.map(d => d.textContent + "=" + [...d.nextElementSibling.childNodes].map(n => n.textContent.trim()).filter(Boolean).join(" | ")));
    const estadoBd = () => get("/__prueba/estado");

    // ---- dos olivos de H-01 (mitad oeste) y uno de H-02 elegidos del propio motor
    const ruiz = await familia("ruiz@example.com");
    await abreMundo(ruiz.pg);
    const olivos = await ruiz.pg.evaluate(([x0, xm, x1, y0, y1]) => window.__g.copas.filter(c => c.oliv && c.id >= 0).map(c => ({ id: c.id, x: c.x, y: c.y })).filter(c => c.y > y0 + 2 && c.y < y1 - 2)
      .map(c => Object.assign(c, { h: c.x < xm - 3 && c.x > x0 + 2 ? 1 : c.x > xm + 3 && c.x < x1 - 2 ? 2 : 0 })).filter(c => c.h), [[x0, xm, x1, y0, y1]][0]);
    const deH1 = olivos.filter(c => c.h === 1), deH2 = olivos.filter(c => c.h === 2);
    assert.ok(deH1.length >= 2 && deH2.length >= 1, "el fixture trae olivos en las dos mitades: " + deH1.length + " / " + deH2.length);
    const A = deH1[0].id, B = deH1[deH1.length - 1].id;

    // 1. un olivo mío sin nada: la ficha común ofrece nombrar y colgar (no quitar), y sugerir
    await miraYClica(ruiz.pg, A);
    assert.deepStrictEqual(await botonesFicha(ruiz.pg), ["Nombrar", "Colgar foto o dibujo", "Sugerir a la oficina"]);

    // 2. nombrar (con un nombre mal puesto primero: se queda en el recuadro con su motivo; luego uno bueno)
    await ruiz.pg.click("#fichaAcciones button:has-text('Nombrar')");
    await ruiz.pg.fill("#personalizaPanel input", "http://malo.example");
    await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForFunction(() => /no se puede usar|Solo letras/.test(document.querySelector("#personalizaPanel [data-msg]").textContent), null, { timeout: 15_000 });
    await ruiz.pg.fill("#personalizaPanel input", "  El   Abuelo ");
    await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15_000 });
    await ruiz.pg.waitForFunction(() => [...document.querySelectorAll("#fichaDatos dt")].some(d => d.textContent === "Nombre"), null, { timeout: 15_000 });
    assert.ok((await filasFicha(ruiz.pg)).includes("Nombre=El Abuelo | puesto por tu familia"), (await filasFicha(ruiz.pg)).join(" | "));
    assert.deepStrictEqual(await botonesFicha(ruiz.pg), ["Cambiar nombre", "Colgar foto o dibujo", "Quitar", "Sugerir a la oficina"]);
    let bd = await estadoBd(); assert.strictEqual(bd.personalizaciones.length, 1); assert.strictEqual(bd.personalizaciones[0].nombre, "El Abuelo"); assert.strictEqual(bd.personalizaciones[0].id_estable, "hituelo:" + A);

    // 3. el nombre sobre el olivo, en el DOM (sin coste de dibujo)
    await ruiz.pg.waitForFunction(() => window.__personaliza().conNombre === 1, null, { timeout: 15_000 });
    await ruiz.pg.waitForFunction(() => [...document.querySelectorAll("#rotulosOlivos > div")].some(d => d.textContent === "El Abuelo" && d.style.display === "block"), null, { timeout: 15_000 });

    // 4. colgar una imagen: el aviso, la casilla, la reducción en el aparato (2400 x 1800 → 1280 x 960) y la subida
    const png = pngSintetico(2400, 1800);
    const peticiones = [];
    ruiz.pg.on("request", r => { if (r.url().includes("/api/medios") && r.method() === "POST") peticiones.push({ url: r.url(), tipo: r.headers()["content-type"], bytes: (r.postDataBuffer() || Buffer.alloc(0)).length }); });
    await ruiz.pg.click("#fichaAcciones button:has-text('Colgar foto o dibujo')");
    const aviso = await ruiz.pg.textContent("#personalizaPanel");
    assert.ok(aviso.includes("No subas caras de menores ni datos personales") && aviso.includes("cuentas de prueba"), aviso);
    assert.strictEqual(await ruiz.pg.isDisabled("#personalizaPanel button[data-ok]"), true, "sin la casilla no se puede subir");
    await ruiz.pg.setInputFiles("#personalizaPanel input[type=file]", { name: "olivo.png", mimeType: "image/png", buffer: png });
    await ruiz.pg.check("#personalizaPanel input[data-acepta]");
    await ruiz.pg.selectOption("#personalizaPanel select", "pintura");
    await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 60_000 });
    assert.strictEqual(peticiones.length, 1); assert.match(peticiones[0].url, /\/api\/medios\?acepto=true$/); assert.strictEqual(peticiones[0].tipo, "image/jpeg", "el aparato la manda como JPEG reducido");
    assert.ok(peticiones[0].bytes < png.length && peticiones[0].bytes < 400_000, "se reduce antes de subir: " + peticiones[0].bytes + " B frente a " + png.length + " B");
    bd = await estadoBd();
    assert.strictEqual(bd.medios.length, 1); assert.strictEqual(bd.medios[0].tipo_mime, "image/webp"); assert.strictEqual(bd.medios[0].acepto, true); assert.strictEqual(bd.medios[0].aviso_version, 1);
    assert.deepStrictEqual([bd.medios[0].ancho, bd.medios[0].alto], [1280, 960], "la api recibió ya 1280 x 960 (sin la reducción en el aparato habría sido 1600 x 1200)");
    assert.strictEqual(bd.personalizaciones[0].objeto_tipo, "pintura"); assert.strictEqual(bd.personalizaciones[0].con_medio, true); assert.strictEqual(bd.personalizaciones[0].nombre, "El Abuelo", "colgar la imagen no borra el nombre");
    assert.strictEqual((await get("/__prueba/ficheros")).n, 1, "un fichero en la carpeta de fotos");

    // 5. renombrar sin perder la imagen (la lista no da el medio_id: el PUT lleva solo el nombre)
    await ruiz.pg.waitForFunction(() => [...document.querySelectorAll("#fichaDatos dt")].some(d => d.textContent === "Pintura"), null, { timeout: 15_000 });
    await ruiz.pg.click("#fichaAcciones button:has-text('Cambiar nombre')");
    await ruiz.pg.fill("#personalizaPanel input", "El Abuelo Juan"); await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15_000 });
    bd = await estadoBd(); assert.strictEqual(bd.personalizaciones[0].nombre, "El Abuelo Juan"); assert.strictEqual(bd.personalizaciones[0].con_medio, true, "renombrar no quita la imagen");

    // 6. la lámina colgada del árbol al elegirlo: UNA malla y UNA textura más; al soltar se libera todo
    await ruiz.pg.keyboard.press("Escape");   // cierra la ficha: suelta lo elegido
    await ruiz.pg.waitForFunction(() => !window.__usables().actual, null, { timeout: 10_000 });
    const mem = () => ruiz.pg.evaluate(() => ({ tex: window.__g.renderer.info.memory.textures, geo: window.__g.renderer.info.memory.geometries, laminas: window.__g.scene.children.filter(o => o.name === "imagen del olivo").length }));
    const antes = await mem(); assert.strictEqual(antes.laminas, 0);
    await miraYClica(ruiz.pg, A);
    await ruiz.pg.waitForFunction(() => window.__g.scene.children.some(o => o.name === "imagen del olivo"), null, { timeout: 15_000 });
    await ruiz.pg.waitForTimeout(1500);
    const con = await mem(); assert.strictEqual(con.laminas, 1, "una sola lámina"); assert.strictEqual(con.tex - antes.tex, 1, "una textura más"); assert.strictEqual(con.geo - antes.geo, 1, "una geometría más");
    const lam = await ruiz.pg.evaluate(() => { const o = window.__g.scene.children.find(q => q.name === "imagen del olivo"), c = window.__g.copas; return { pos: o.position.toArray(), tex: o.material.map.image.width + "x" + o.material.map.image.height }; });
    assert.ok(/^512x/.test(lam.tex), "la textura de la lámina es de 512 px de ancho: " + lam.tex);
    fs.mkdirSync(path.join(RAIZ, "pruebas", "salida", "personaliza"), { recursive: true });
    await ruiz.pg.screenshot({ path: path.join(RAIZ, "pruebas", "salida", "personaliza", "ruiz.png") });
    await ruiz.pg.keyboard.press("Escape");
    await ruiz.pg.waitForFunction(() => !window.__g.scene.children.some(o => o.name === "imagen del olivo"), null, { timeout: 10_000 });
    await ruiz.pg.waitForTimeout(500);
    const despues = await mem(); assert.deepStrictEqual([despues.tex, despues.geo], [antes.tex, antes.geo], "al soltar se libera todo (textura y geometría)");

    // 7. otra familia (Olid): ve el nombre y la imagen en el olivo AJENO, solo puede denunciar, y denuncia
    const olid = await familia("olid@example.com");
    await abreMundo(olid.pg, 1);
    await miraYClica(olid.pg, A);
    assert.ok((await filasFicha(olid.pg)).includes("Nombre=El Abuelo Juan | puesto por la familia de esa haza"), (await filasFicha(olid.pg)).join(" | "));
    assert.ok((await filasFicha(olid.pg)).some(f => /^Pintura=/.test(f)), "ve que hay una pintura");
    assert.deepStrictEqual(await botonesFicha(olid.pg), ["Denunciar"], "en el olivo ajeno solo se puede denunciar (nada de nombrar ni subir)");
    await olid.pg.waitForFunction(() => window.__g.scene.children.some(o => o.name === "imagen del olivo"), null, { timeout: 15_000 });
    // el fichero de la imagen lo sirve la api tras sesión, a quien no es de la familia
    const url = await olid.pg.evaluate(() => window.__personaliza && fetch("/api/hazas/1/olivos").then(r => r.json()).then(j => j.olivos[0].objeto.url));
    assert.match(url, /^\/api\/medios\/[a-f0-9]{32}\.webp$/);
    assert.strictEqual(await olid.pg.evaluate(u => fetch(u).then(r => r.status + " " + r.headers.get("content-type")), url), "200 image/webp");
    await olid.pg.click("#fichaAcciones button:has-text('Denunciar')");
    await olid.pg.selectOption("#personalizaPanel select", "no_es_del_olivar"); await olid.pg.fill("#personalizaPanel textarea", "prueba de denuncia");
    await olid.pg.click("#personalizaPanel button[data-ok]");
    await olid.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15_000 });
    bd = await estadoBd();
    assert.strictEqual(bd.denuncias.length, 1); assert.deepStrictEqual([bd.denuncias[0].motivo, bd.denuncias[0].texto, bd.denuncias[0].correo], ["no_es_del_olivar", "prueba de denuncia", "olid@example.com"]);
    assert.ok(bd.bandeja.some(b => b.tipo === "denuncia" && b.estado === "nueva"), "la denuncia entra en la bandeja de la oficina");
    await olid.pg.click("#fichaAcciones button:has-text('Denunciar')");
    await olid.pg.click("#personalizaPanel button[data-ok]");
    await olid.pg.waitForFunction(() => /Ya lo habías denunciado/.test(document.querySelector("#personalizaPanel [data-msg]").textContent), null, { timeout: 15_000 });
    await olid.pg.click("#personalizaPanel button[data-cancela]");
    // y Olid, en lo suyo (H-02), sí puede nombrar; en el de Ruiz, la api le dice que no es su haza si lo intenta a mano
    const intento = await olid.pg.evaluate(c => fetch("/api/olivos/hituelo/" + c, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: "Robado" }) }).then(async r => r.status + " " + (await r.json()).error), A);
    assert.strictEqual(intento, "403 no_es_tu_haza");

    // 8. unas gafas vinculadas de Ruiz: ven (y el nombre sale), no escriben (la ficha lo dice y la api lo niega)
    const gaf = await familia("ruiz@example.com"); const gctx = gaf.ctx, gp = gaf.pg;   // otra sesión de Ruiz, que pasa a ser la de unas gafas vinculadas
    await get("/__prueba/vinculo?para=ruiz@example.com");
    await gp.goto(base + "/mundo/index.html?api=/api/&debug", { waitUntil: "commit", timeout: 120_000 });
    await gp.waitForFunction(() => window.__g && window.__g.listo() && window.__personaliza, null, { timeout: 180_000 });
    await gp.waitForFunction(() => { const e = window.__personaliza(); return e.titular === false && e.cargadas >= 4; }, null, { timeout: 60_000 });
    await miraYClica(gp, B);
    assert.deepStrictEqual(await botonesFicha(gp), [], "sin acciones de escribir");
    assert.ok((await filasFicha(gp)).some(f => /^Personalizar=solo con tu enlace/.test(f)), (await filasFicha(gp)).join(" | "));
    assert.strictEqual(await gp.evaluate(c => fetch("/api/olivos/hituelo/" + c, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: "Gafas" }) }).then(async r => r.status + " " + (await r.json()).error), B), "403 solo_titular");
    await gctx.close();

    // 9. Ruiz quita lo suyo: la imagen y el nombre dejan de verse para Olid
    await miraYClica(ruiz.pg, A);
    await ruiz.pg.click("#fichaAcciones button:has-text('Quitar')");
    assert.match(await ruiz.pg.textContent("#personalizaPanel"), /¿Seguro\?/); await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15_000 });
    await ruiz.pg.waitForFunction(() => window.__personaliza().personalizados === 0, null, { timeout: 15_000 });
    assert.deepStrictEqual(await botonesFicha(ruiz.pg), ["Nombrar", "Colgar foto o dibujo", "Sugerir a la oficina"]);
    assert.strictEqual(await olid.pg.evaluate(() => fetch("/api/hazas/1/olivos").then(r => r.json()).then(j => j.olivos.length)), 0, "Olid ya no lo ve");
    // sugerir a la oficina (con enlace: la api lo rechaza; sin él, entra en la bandeja)
    await ruiz.pg.click("#fichaAcciones button:has-text('Sugerir a la oficina')");
    await ruiz.pg.fill("#personalizaPanel textarea", "Una rama partida junto al camino"); await ruiz.pg.click("#personalizaPanel button[data-ok]");
    await ruiz.pg.waitForSelector("#personalizaPanel", { state: "detached", timeout: 15_000 });
    assert.ok((await estadoBd()).bandeja.some(b => b.tipo === "sugerencia" && /rama partida/.test(b.texto)));

    // 10. sin avisos de la CSP impuesta ni errores de página
    // (los estilos en línea y la fuente de Google son de la página de siempre, no de este componente, que solo usa el CSSOM: se miran scripts, imágenes, conexiones y objetos)
    for (const p of [ruiz.pg, olid.pg]) assert.deepStrictEqual((await p.evaluate(() => window.__csp)).filter(v => !/^style-src|^font-src/.test(v)), [], "la CSP impuesta no se queja de scripts, imágenes ni conexiones");
    assert.deepStrictEqual(errores, []);
    await ruiz.ctx.close(); await olid.ctx.close();
  } finally {
    try { srv.stdin.end(); } catch (e) { /* ya cerrado */ }
    await new Promise(r => { srv.once("exit", r); setTimeout(() => { srv.kill(); r(); }, 30_000); });
    await nav.close();
  }
});
