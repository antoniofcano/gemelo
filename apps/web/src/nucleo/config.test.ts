// Las pruebas puras de la configuración del servidor en el motor (C6 de ADR-0023, OF6 de doc/sistema/OFICINA.md), que antes evaluaba
// pruebas/guardianes/config_motor.test.js sobre el trozo [puro] de apps/web/motor/02c_componentes.js. MU5-n (A3-8a): el código vive en ./config.ts y estas
// pruebas, aquí (MUNDOS §9.2): los umbrales (van juntos, recortados, con sus reglas) y la lectura (sin servidor no pide nada; 200 → la configuración;
// 401/404/503, sin red, respuesta rara o tarde → el código, SIN escribir en consola). El guardián conserva lo que cruza con los contratos y el legado: los
// límites contra el esquema, la precedencia con los VR_PERFILES de 29_vr, las épocas contra apps/web/olivo/epocas.js, Config entero en el talón y quién lee cada parámetro.
import { assert, describe, it } from "vitest";
import EJ from "../../../../contratos/config-ejemplo.json";
import { ConfigPuro as P } from "./config.ts";


describe("ConfigPuro", () => {
  it("umbrales: van juntos, recortados, con E1 ≤ E0/1,5 y E2 ≤ E1/1,5; si no, los del código", () => {
    const C = [700, 250, 90], u = (x: unknown) => ({ v: 1, escalera: { umbralesPx: x } });
    assert.deepEqual(P.umbrales(u({ e0: 800, e1: 300, e2: 100 }), C), { v: [800, 300, 100], origen: "config" });
    assert.deepEqual(P.umbrales(u({ e0: 5000, e1: 300, e2: 100 }), C).v, [2000, 300, 100], "recortados");
    assert.strictEqual(P.umbrales(u({ e0: 700, e1: 600, e2: 90 }), C).origen, "codigo");
    assert.match(P.umbrales(u({ e0: 700, e1: 250, e2: 200 }), C).motivo as string, /incoherentes/);
    assert.strictEqual(P.umbrales(u({ e0: 700 }), C).origen, "codigo", "a medias, no");
    assert.deepEqual(P.umbrales(u({ e0: 800, e1: 300, e2: 100 }), C, [900, 300, 80]), { v: [900, 300, 80], origen: "url" });
    assert.deepEqual(P.umbrales(null, C), { v: C, origen: "codigo" });
  });


  // ---------- la lectura
  const respuesta = (status: number, cuerpo: unknown) => ({ status, json: () => Promise.resolve(cuerpo) });
  it("lectura: sin servidor no pide; 200 → la configuración; 401/404/503, sin red, rara o tarde → el código; nunca escribe en consola", async () => {
    const con = console as any, consola: [string, any][] = ["error", "warn", "log"].map(k => [k, con[k]]), escritos: string[] = [];
    for (const [k] of consola) con[k] = (...a: unknown[]) => escritos.push(k + ": " + a.join(" "));
    try {
      let pedidas: [string, any][] = [];
      const f = (r: any) => (u: string, o?: any): any => { pedidas.push([u, o]); return typeof r === "function" ? r() : Promise.resolve(r); };
      assert.strictEqual(P.prefijoApi("", "datos/"), null); assert.strictEqual(P.prefijoApi("", "/teselas/hituelo/"), "/api/");
      assert.strictEqual(P.prefijoApi("?api=/prueba/", "datos/"), "/prueba/"); assert.strictEqual(P.prefijoApi("?api=https://otro.example/", "/teselas/x/"), null, "nunca otro host");
      let r = await P.lee({ fetch: f(respuesta(200, {})), prefijo: null });
      assert.deepEqual([r.cfg, r.estado.motivo, pedidas.length], [null, "sin servidor", 0]);
      r = await P.lee({ fetch: f(respuesta(200, { version: 7, estado: "publicada", config: EJ })), prefijo: "/api/" });
      assert.deepEqual([r.cfg, r.estado.origen, r.estado.version, r.estado.estadoVersion], [EJ, "servidor", 7, "publicada"]);
      assert.strictEqual(pedidas[0]![0], "/api/config"); assert.strictEqual(pedidas[0]![1].credentials, "same-origin");
      r = await P.lee({ fetch: f(respuesta(200, { version: null, estado: null, config: { v: 1 } })), prefijo: "/api/" });
      assert.deepEqual([r.cfg, r.estado.origen, r.estado.motivo], [{ v: 1 }, "codigo", "sin versión publicada"]);
      for (const s of [401, 404, 503, 500]) {
        r = await P.lee({ fetch: f(respuesta(s, {})), prefijo: "/api/" });
        assert.deepEqual([r.cfg, r.estado.motivo], [null, "http " + s]);
      }
      r = await P.lee({ fetch: f(() => Promise.reject(new TypeError("Failed to fetch"))), prefijo: "/api/" });
      assert.deepEqual([r.cfg, r.estado.motivo], [null, "sin red o respuesta ilegible"]);
      r = await P.lee({ fetch: f({ status: 200, json: () => Promise.reject(new SyntaxError("x")) }), prefijo: "/api/" });
      assert.strictEqual(r.cfg, null);
      for (const raro of [null, [], { config: { v: 2 } }, { config: { v: 1, componentes: { A: { activo: 1 } } } }, { config: { v: 1, escalera: [] } }]) {
        r = await P.lee({ fetch: f(respuesta(200, raro)), prefijo: "/api/" });
        assert.strictEqual(r.cfg, null, JSON.stringify(raro));
      }
      r = await P.lee({ fetch: f(() => new Promise((res: (v: unknown) => void) => setTimeout(() => res(respuesta(200, { version: 1, config: EJ })), 300))), prefijo: "/api/", espera: 50 });
      assert.deepEqual([r.cfg, r.tarde], [null, true], "lo que llega tarde se ignora");
      assert.match(r.estado.motivo as string, /tarde/);
      await new Promise(res => setTimeout(res, 320));
    } finally { for (const [k, fn] of consola) con[k] = fn; }
    assert.deepEqual(escritos, [], "ni un error ni un aviso en consola");
  });
});
