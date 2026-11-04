"use strict";
// F0 (doc/sistema/MULTIVIEW.md, §plan): qué objetos ponen las llamadas de dibujo EN VR, por ojo y en total. Con el WebXR simulado (pruebas/mock_xr.js) se entra en VR
// con el fixture y, durante UN fotograma XR, se envuelve renderer.renderBufferDirect (como desgloseLlamadas de _navegador.js, pero con el ojo: el índice de la
// cámara en renderer.xr.getCamera().cameras). Es una MEDIDA (recuentos de SwiftShader, que valen; no fps): imprime la tabla y solo afirma lo que no depende del aparato
// (hay dos ojos, el total del espía coincide con renderer.info.render.calls y no hay errores). Opcional (GEMELO_VR=1), por el banco, un Chrome a la vez:
//   GEMELO_VR=1 node --test pruebas/guardianes/vr_desglose.test.js
// Con GEMELO_VR_FINCA=hituelo|cerro (cerro por defecto). No probado en un Quest.
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("el desglose de llamadas en VR") || saltoPagina("el desglose de llamadas en VR");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: process.env.GEMELO_VR_FINCA || "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

/** En la página: espía un fotograma XR. Devuelve { ojos, filas: [[clave, ojo0, ojo1, triOjo0, triOjo1]], total, info, infoTri } */
function desgloseVR() {
  const g = window.__g, R = g.renderer, S = g.scene, orig = R.renderBufferDirect, cuenta = {}, tiles = g.Escena3D && g.Escena3D.grupo ? g.Escena3D.grupo() : null;
  const pista = t => t === tiles ? " [3dtiles]" : g.Arboles && g.Arboles.grupo === t ? " [arboles]" : "";
  const arriba = o => { let p = o; while (p.parent && p.parent !== S) p = p.parent; return p; };
  const nombre = o => (o.name ? o.name + ":" : "") + o.type;
  const espia = function (cam, sc, geo, mat, obj) {
    const cams = R.xr.getCamera().cameras || [], oj = sc === null ? 0 : Math.max(0, cams.indexOf(cam)), t = arriba(obj);
    const k = (sc === null ? "sombra" : "principal") + " · #" + S.children.indexOf(t) + " " + nombre(t) + pista(t) + (t === obj ? "" : " › " + nombre(obj)) + " · " + (mat && mat.type);
    const f = cuenta[k] || (cuenta[k] = [0, 0, 0, 0]), t0 = R.info.render.triangles, r = orig.apply(this, arguments);
    f[oj]++; f[2 + oj] += R.info.render.triangles - t0;
    return r;
  };
  const f0 = window.__mockXR.fotogramas;
  return new Promise(ok => {
    const espera = () => {
      if (window.__mockXR.fotogramas < f0 + 2) return setTimeout(espera, 5);
      R.renderBufferDirect = espia;
      const f1 = window.__mockXR.fotogramas, fin = () => {
        if (window.__mockXR.fotogramas < f1 + 1) return setTimeout(fin, 2);
        R.renderBufferDirect = orig;
        const filas = Object.entries(cuenta).map(([k, v]) => [k].concat(v)).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
        ok({ ojos: (R.xr.getCamera().cameras || []).length, filas, total: filas.reduce((s, f) => s + f[1] + f[2], 0), info: R.info.render.calls, infoTri: R.info.render.triangles });
      };
      setTimeout(fin, 2);
    };
    espera();
  });
}

describe("desglose de llamadas en VR (WebXR simulado)", () => {
  before(async () => { if (!SALTO) await prepara(); });
  test("qué objetos ponen las llamadas de dibujo en VR, por ojo", { timeout: 600000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 (WebXR simulado; inestable con SwiftShader)");
    const p = await nav.newPage({ viewport: { width: 450, height: 325 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    try {
      await p.goto(url + "?debug&hora=12:00");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug, null, { timeout: 120000, polling: 500 });
      await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {});
      await p.waitForTimeout(8000);   // las teselas y los generados siguen llegando un rato
      await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
      await p.waitForTimeout(6000);
      const d = await p.evaluate(desgloseVR);
      const p0 = d.filas.reduce((s, f) => s + f[1], 0), p1 = d.filas.reduce((s, f) => s + f[2], 0), t0 = d.filas.reduce((s, f) => s + f[3], 0), t1 = d.filas.reduce((s, f) => s + f[4], 0);
      console.log("   VR · ojos " + d.ojos + " · llamadas ojo 0 = " + p0 + ", ojo 1 = " + p1 + ", total " + d.total + " (renderer.info: " + d.info + " llamadas, " + d.infoTri + " triángulos; espía: " + (t0 + t1) + ")");
      console.log("   llamadas O0 | O1 | tri O0 | tri O1 | objeto");
      d.filas.slice(0, 25).forEach(f => console.log("   " + String(f[1]).padStart(5) + " | " + String(f[2]).padStart(4) + " | " + String(f[3]).padStart(7) + " | " + String(f[4]).padStart(7) + " | " + f[0]));
      assert.ok(d.ojos >= 2, "el mock da dos ojos: " + d.ojos);
      assert.ok(d.total > 0, "algo se dibuja");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
