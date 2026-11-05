"use strict";
// Q0n (apps/web/motor/02m_tope_olivos.js; doc/sistema/VR.md#tope-de-triángulos-de-los-olivos-del-motor-q0n): MEDIDA en el banco, con el WebXR
// simulado (pruebas/mock_xr.js) y el fixture, de lo que dibuja un fotograma XR en el nivel 3 fijo (?xrnivel=3) con los dos lazos (Q0k + Q0n), solo
// con el del tileset (&xrolivos=0), sin ninguno (&xrtri=0) y con un tope
// forzado bajo (&xrtri=60000) para ver recortar al lazo. Recuentos de SwiftShader (llamadas y triángulos de los dos ojos), que valen; NO fps.
// Imprime la tabla y solo afirma lo que no depende del aparato: entra en VR, el lazo de los olivos está activo con los dos y apagado sin ellos,
// tileset + olivos del motor no pasan del tope del nivel salvo «saturado», y no hay errores. Opcional (GEMELO_VR=1), por el banco, un Chrome a la vez:
//   GEMELO_VR=1 npm run puerta -- pruebas/guardianes/vr_tope_olivos.test.js
// GEMELO_VR_FINCA=hituelo|cerro (cerro por defecto), GEMELO_VR_NIVEL=0..3 (3 por defecto). No probado en un Quest.
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const SALTO = motivoSalto("el tope de los olivos en VR") || saltoPagina("el tope de los olivos en VR");
const NIVEL = Number(process.env.GEMELO_VR_NIVEL || 3);
// el fixture es pequeño (sus olivos del motor caben en la reserva del nivel 3): «tope forzado» baja T con ?xrtri= para que el lazo tenga que recortar
const VARIANTES = [["solo el del tileset (xrolivos=0)", "&xrolivos=0"], ["con los dos lazos", ""], ["sin lazos (xrtri=0)", "&xrtri=0"], ["tope forzado (xrtri=60000)", "&xrtri=60000"]];
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: process.env.GEMELO_VR_FINCA || "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

// en la página: tras dos fotogramas XR, lo que dibujó uno (los dos ojos) y lo que dicen los lazos
function lee1() {
  const g = window.__g, R = g.renderer, f0 = window.__mockXR.fotogramas;
  return new Promise(ok => {
    const espera = () => {
      if (window.__mockXR.fotogramas < f0 + 2) return setTimeout(espera, 5);
      const a = g.Arboles.resumen(), e = g.Escena3D.resumen ? g.Escena3D.resumen() : {}, v = window.__vrDebug();
      ok({ llamadas: R.info.render.calls, tri: R.info.render.triangles, nivel: v.nivel, linea: v.xr.linea, olivos: [a.nivel0, a.nivel1, a.nivel2], triEst: a.triEst, topeOlivos: a.topeOlivos || null, tiles: e.tope || null });
    };
    espera();
  });
}

describe("tope de los olivos del motor en VR (WebXR simulado)", () => {
  before(async () => { if (!SALTO && process.env.GEMELO_VR) await prepara(); });
  for (const [nombre, q] of VARIANTES) {
    test("nivel " + NIVEL + " · " + nombre, { timeout: 600000 }, async t => {
      if (SALTO) return t.skip(SALTO);
      if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 (WebXR simulado, por el banco)");
      const p = await nav.newPage({ viewport: { width: 450, height: 325 } }), errores = [];
      await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
      p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
      p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
      try {
        await p.goto(url + "?debug&hora=12:00&xrnivel=" + NIVEL + q);
        await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug, null, { timeout: 120000, polling: 500 });
        await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {});
        await p.waitForTimeout(8000);
        await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
        await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
        await p.waitForTimeout(30000);   // los lazos: 0,5 s por encima + 1,5 s de guarda por paso (hasta 4 s si se construye), en tiempo de reloj
        const d = await p.evaluate(lee1);
        const o = d.topeOlivos, ti = d.tiles;
        console.log("   MEDIDO vr-tope-olivos · nivel " + d.nivel + " · " + nombre + " · " + d.llamadas + " llamadas · " + d.tri + " triángulos (dos ojos) · olivos N0/N1/N2 " + d.olivos.join("/"));
        console.log("     tileset: " + (ti ? ti.tri + " tri / tope " + ti.tope + " (relieve " + ti.relieve + ", olivos " + ti.olivos + "), paso " + ti.k + "/" + ti.K + (ti.saturado ? " saturado" : "") : "—"));
        console.log("     olivos del motor: " + (o ? o.triMotor + " tri / reserva " + o.reserva + " (ocupa " + o.ocupa + "), factor " + o.factor + ", paso " + o.k + "/" + o.K + (o.saturado ? " saturado" : "") + ", recortes " + o.recortes : "—"));
        console.log("     línea: " + d.linea);
        assert.strictEqual(d.nivel, NIVEL);
        assert.ok(o, "en VR, Arboles.resumen().topeOlivos existe");
        if (q === "&xrtri=60000") {
          assert.ok(o.activo && o.reserva === 18000, "reserva de 0,3 × 60 k");
          assert.ok(o.recortes > 0 && o.factor < 1, "el lazo recorta: factor " + o.factor);
          assert.ok(o.triMotor <= o.reserva || o.saturado, "acaba en la reserva o saturado: " + o.triMotor);
        } else if (q === "") {
          assert.ok(o.activo, "con los dos lazos, el de los olivos está activo");
          assert.ok(ti && ti.tope + o.ocupa <= o.tope * 1.05 + 1, "el tileset recibe el tope menos lo que ocupan los olivos (± un paso de 5 %: se muestrean por separado)");
          if (!o.saturado && !(ti && ti.saturado)) assert.ok(o.triMotor <= o.reserva * 1.0001 || o.k > 0, "o cabe o el lazo está recortando");
        } else assert.ok(!o.activo, "apagado con " + q);
        assert.deepStrictEqual(errores, []);
      } finally { await p.close(); }
    });
  }
});
