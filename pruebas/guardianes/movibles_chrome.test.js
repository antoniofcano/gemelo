"use strict";
// El chat, su burbuja y el minimapa, movibles, en Chrome sin pantalla (SwiftShader: vale para sitios y recuentos, no para fps): con ?presencia=sim&chat=1 se pasea,
// se arrastra el chat y luego la burbuja encima de la cruceta y de la barra con la emulación táctil de un móvil (390 × 844 y 844 × 390) y deben acabar fuera de ellas;
// recuerdan su sitio al recargar, «Llevar a…» y el teclado funcionan, la burbuja cuenta los no leídos y el mapa se pliega con M (no con la brújula).
// No prueba iPhone ni Android reales ni el Quest: eso es la nota de comodidad. Chrome lo lanza lanza() dentro del turno del banco (una sola prueba pesada a la vez).
const test = require("node:test"), assert = require("node:assert");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("el chat y el minimapa movibles en navegador") || saltoPagina("el chat y el minimapa movibles en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

const cruzan = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function abre(ancho, alto) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }), p = await ctx.newPage(), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.errores = errores; p.ctx = ctx;
  await entra(p);
  return p;
}
async function entra(p) {
  await p.goto(base + "?presencia=sim&chat=1&n=3");
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
  await p.evaluate(() => document.getElementById("btnPaseo").click());   // paseo: aparece la cruceta
  await p.waitForFunction(() => document.getElementById("visor").classList.contains("paseo"), null, { timeout: 30000 });
  await p.waitForFunction(() => { const c = document.getElementById("presenciaGente"); return c && !c.hidden && c.getBoundingClientRect().width > 0; }, null, { timeout: 30000 });
  // Lo que se comprueba es maquetación y arrastre del DOM (CSS px): con la escena montada y el paseo puesto, el dibujo 3D no hace falta y SwiftShader lo paga por
  // fotograma (medido en PB2: cada gesto espera varios fotogramas; cargar la página cuesta ~3,5 s y el resto de los ~110 s por orientación son esos gestos)
  await p.evaluate(() => { window.__g.renderer.render = function () {}; });
  await p.evaluate(() => document.getElementById("visor").scrollIntoView({ block: "start" }));
  await p.waitForTimeout(400);
}
// rectángulos en píxeles del visor (el contenedor de lo flotante)
const rects = p => p.evaluate(() => {
  const v = document.getElementById("visor"), vr = v.getBoundingClientRect();
  const r = s => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.left - vr.left, y: b.top - vr.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; };
  return { visor: { w: vr.width, h: vr.height }, chat: r("#presenciaGente"), burbuja: r("#presenciaBurbuja"), mapa: r("#mapaFlotante"), pad: r(".pad-mov") || r(".pad"), barra: r("#hudBarra") || r(".t-barra"),   // la plantilla de la UX (U1-U5): cruceta .pad-mov y barra #hudBarra; las de antes, de respaldo
    ins: r("#tIns"), norte: r("#norte"),
    agarre: r("#presenciaGente .agarre"), minimiza: r("#presenciaGente button[aria-label='Minimizar el chat']"), vr: { x: vr.left, y: vr.top } };
});
const arrastra = async (p, de, a) => { await p.mouse.move(de.cx, de.cy); await p.mouse.down(); await p.mouse.move((de.cx + a.cx) / 2, (de.cy + a.cy) / 2, { steps: 6 }); await p.mouse.move(a.cx, a.cy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(250); };
const libreDe = (r, nombre, otros) => otros.filter(Boolean).forEach(z => assert.ok(!cruzan(r, z), nombre + " tapa " + JSON.stringify(z) + " estando en " + JSON.stringify(r)));
const dentro = (r, v, nombre) => assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= v.w + 0.5 && r.y + r.h <= v.h + 0.5, nombre + " se sale del visor: " + JSON.stringify(r));

for (const [nombre, W, H, forma] of [["vertical 390 × 844", 390, 844, "vertical"], ["horizontal 844 × 390", 844, 390, "horizontal"]]) {
  test("[" + nombre + "] el chat, la burbuja y el mapa arrastrados encima de la cruceta acaban fuera de ella", { skip: SALTO || false, timeout: 900000 }, async t => {
    const p = await abre(W, H);
    try {
      let R = await rects(p);
      assert.ok(R.pad, "con el paseo debe verse la cruceta (.pad-mov)"); assert.ok(R.chat, "el chat debe verse");
      libreDe(R.chat, "el chat de partida", [R.pad, R.barra, R.norte]); dentro(R.chat, R.visor, "el chat");
      const zonasFijas = r => [r.pad, r.barra, r.ins, r.norte];

      // 1. el chat, arrastrado por el agarre hasta el centro de la cruceta
      await arrastra(p, R.agarre, R.pad);
      R = await rects(p);
      libreDe(R.chat, "el chat tras soltarlo sobre la cruceta", zonasFijas(R)); dentro(R.chat, R.visor, "el chat");
      const clave = await p.evaluate(() => Object.keys(localStorage).filter(k => /^gemelo\.chat\.pos\./.test(k)));
      assert.deepStrictEqual(clave, ["gemelo.chat.pos." + forma], "se guarda por forma de pantalla: " + clave);
      const sitioChat = { x: R.chat.x, y: R.chat.y };

      // 2. minimizar: aparece la burbuja; se arrastra encima de la cruceta
      await p.click("#presenciaGente button[aria-label='Minimizar el chat']");
      await p.waitForFunction(() => { const b = document.getElementById("presenciaBurbuja"); return b && !b.hidden && b.getBoundingClientRect().width > 0; }, null, { timeout: 5000 });
      R = await rects(p);
      assert.strictEqual(R.chat, null, "minimizado, el chat no se ve"); assert.ok(R.burbuja); libreDe(R.burbuja, "la burbuja de partida", zonasFijas(R));
      await arrastra(p, R.burbuja, R.pad);
      R = await rects(p);
      assert.ok(R.burbuja, "tras arrastrarla sigue siendo burbuja (no se abrió)"); libreDe(R.burbuja, "la burbuja sobre la cruceta", zonasFijas(R)); dentro(R.burbuja, R.visor, "la burbuja");
      // sobre la barra / el estado de arriba
      const arriba = R.barra || R.norte; await arrastra(p, R.burbuja, arriba);
      R = await rects(p); libreDe(R.burbuja, "la burbuja sobre la barra", zonasFijas(R));

      // 3. no leídos con el chat minimizado; un toque sin mover abre
      await p.evaluate(() => { window.__presenciaChat("uno"); window.__presenciaChat("dos"); });
      assert.strictEqual((await p.textContent("#presenciaBurbuja")).replace("💬", "").trim(), "2", "la burbuja cuenta los no leídos");
      assert.match(await p.getAttribute("#presenciaBurbuja", "aria-label"), /2 sin leer/);
      await p.mouse.click(R.burbuja.cx, R.burbuja.cy); await p.waitForTimeout(300);
      R = await rects(p);
      assert.ok(R.chat && !R.burbuja, "un toque abre el chat y esconde la burbuja"); libreDe(R.chat, "el chat reabierto", zonasFijas(R));
      assert.match(await p.textContent("#presenciaGente ol"), /Prueba: dos/);
      await p.click("#presenciaGente button[aria-label='Minimizar el chat']"); await p.click("#presenciaBurbuja"); await p.waitForTimeout(200);
      assert.strictEqual((await p.textContent("#presenciaBurbuja")).replace("💬", "").trim(), "", "abierto de nuevo, sin contador");

      // 4. teclado: desde el agarre, Inicio y flechas; nunca acaba encima de la cruceta
      await p.focus("#presenciaGente .agarre");
      await p.keyboard.press("Home"); R = await rects(p); libreDe(R.chat, "el chat tras Inicio", zonasFijas(R));
      const antes = { x: R.chat.x, y: R.chat.y };
      for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowRight");
      await p.keyboard.press("Shift+ArrowUp");
      R = await rects(p); libreDe(R.chat, "el chat tras las flechas", zonasFijas(R));
      assert.ok(R.chat.x !== antes.x || R.chat.y !== antes.y, "las flechas lo mueven");

      // 5. «Llevar a…»: arriba a la derecha y «donde estaba»
      await p.click("#presenciaGente button[aria-label='Llevar el chat a…']");
      await p.click("#presenciaGente [data-esquina='ad']"); await p.waitForTimeout(200);
      R = await rects(p); libreDe(R.chat, "el chat llevado a la esquina", zonasFijas(R)); dentro(R.chat, R.visor, "el chat");
      assert.ok(R.chat.y + R.chat.h / 2 < R.visor.h / 2 + 60, "llevado a una esquina de arriba: " + JSON.stringify(R.chat));
      await p.click("#presenciaGente button[aria-label='Llevar el chat a…']"); await p.click("#presenciaGente [data-esquina='defecto']");
      R = await rects(p); libreDe(R.chat, "el chat en su sitio de partida", zonasFijas(R));
      await p.click("#presenciaGente button[aria-label='Llevar el chat a…']"); await p.click("#presenciaGente [data-esquina='bi']"); R = await rects(p); libreDe(R.chat, "el chat abajo a la izquierda", zonasFijas(R));

      // 6. el mapa: visible en el paseo, movible, y sobre la cruceta se aparta; la brújula no lo oculta; M lo pliega
      R = await rects(p); assert.ok(R.mapa, "el minimapa se ve al pasear");
      await p.click("#norte"); await p.waitForTimeout(150);
      assert.ok((await rects(p)).mapa, "la brújula ya no oculta el minimapa");
      R = await rects(p); await arrastra(p, { cx: R.vr.x + R.mapa.x + 22, cy: R.vr.y + R.mapa.y + 22 }, R.pad);
      R = await rects(p); libreDe(R.mapa, "el mapa sobre la cruceta", zonasFijas(R)); dentro(R.mapa, R.visor, "el mapa");
      const altoAntes = R.mapa.h;
      await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press("m"); await p.waitForTimeout(200);
      R = await rects(p); assert.ok(R.mapa && R.mapa.h < altoAntes, "M pliega el minimapa (queda la barra)"); libreDe(R.mapa, "el mapa plegado", zonasFijas(R));
      await p.keyboard.press("m"); await p.waitForTimeout(200);
      R = await rects(p); assert.ok(R.mapa.h >= altoAntes - 1, "M lo despliega");

      // 7. recargar: el chat vuelve a donde se dejó para esta forma de pantalla
      await p.click("#presenciaGente button[aria-label='Llevar el chat a…']"); await p.click("#presenciaGente [data-esquina='ai']");
      const guardado = (await rects(p)).chat;
      await entra(p); R = await rects(p);
      assert.ok(Math.abs(R.chat.x - guardado.x) <= 2 && Math.abs(R.chat.y - guardado.y) <= 2, "recuerda su sitio al recargar: " + JSON.stringify([R.chat, guardado]));
      libreDe(R.chat, "el chat recordado", zonasFijas(R));

      // 8. girar la pantalla: el sitio de la otra forma no se aplica y nada queda sobre la cruceta
      await p.setViewportSize({ width: H, height: W }); await p.waitForTimeout(600);
      R = await rects(p); libreDe(R.chat, "el chat tras girar", zonasFijas(R)); dentro(R.chat, R.visor, "el chat");

      assert.deepStrictEqual(p.errores, [], "sin errores de página ni de consola");
      t.diagnostic(nombre + ": chat " + JSON.stringify([Math.round(sitioChat.x), Math.round(sitioChat.y)]) + " tras soltarlo sobre la cruceta; sin errores");
    } finally { await p.ctx.close(); }
  });
}
