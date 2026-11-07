// Las pruebas puras de la detección del aparato (AG-0.3), que antes evaluaba pruebas/guardianes/aparato.test.js sobre el trozo [puro] y el módulo
// apps/web/motor/01a_aparato.js. MU5-n (A3-8a): el código vive en ./aparato.ts y sus pruebas, aquí (MUNDOS §9.2: se mueven, no se duplican).
// El guardián conserva lo que cruza con el legado: el talón evaluado con el Nucleo de verdad, que solo él lee el agente, el orden de montaje y 02_mundo por clase.
// HONESTIDAD: los agentes de la tabla están reconstruidos a mano del formato conocido de cada navegador (no capturados en el aparato). Lo que NO está
// probado: un Quest ni un iPhone reales (qué anuncia de verdad su agente y qué mide su WebGL), ni el Vision Pro (¿maxTouchPoints?).
import { assert, describe, it } from "vitest";
import { AparatoPuro as P, creaAparato } from "./aparato.ts";


const UA = {
  quest3: "Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0.0.1.58 SamsungBrowser/4.0 Chrome/126.0.0.0 VR Safari/537.36",
  quest3s: "Mozilla/5.0 (Linux; Android 12; Quest 3S) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/37.0.0.0.0 Chrome/130.0.0.0 VR Safari/537.36",
  quest2: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/30.0.0.4.8 SamsungBrowser/4.0 Chrome/112.0.0.0 Mobile VR Safari/537.36 Quest 2",
  questPro: "Mozilla/5.0 (Linux; Android 12; Quest Pro) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.0.0 Chrome/120.0.0.0 VR Safari/537.36",
  quest1: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/12.0.0.4.8 Chrome/83.0.4103.106 Mobile VR Safari/537.36",
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadMovil: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadComoMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  visionPro: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/2.0 Safari/605.1.15 (visionOS Safari)"
};
/** un Aparato nuevo sobre un navigator de mentira (o forzado a una clase, con Aparato.pon), como lo crea el talón de 01a_aparato.js */
function aparatoDe(nav?: any, ventana?: any) {
  if (typeof nav === "string") { const a = creaAparato({ navegador: {}, ventana }); a.pon(nav); return a; }
  return creaAparato({ navegador: nav || {}, ventana });
}

describe("AparatoPuro y creaAparato", () => {
  it("clasifica: la tabla de agentes (gafas, móviles, escritorios) y el modelo solo si el agente lo declara", () => {
    const fila = [
      [UA.quest3, 0, 8, "quest", "quest-3"], [UA.quest3s, 0, 8, "quest", "quest-3s"], [UA.quest2, 0, 4, "quest", "quest-2"], [UA.questPro, 0, 8, "quest", "quest-pro"],
      [UA.quest1, 0, 4, "quest", ""],   // Quest 1: reconocida como gafas, sin modelo (no se inventa)
      [UA.chromeWin, 0, 8, "escritorio", ""], [UA.chromeLinux, 0, 8, "escritorio", ""], [UA.firefoxWin, 0, undefined, "escritorio", ""],
      [UA.safariMac, 0, undefined, "escritorio", ""], [UA.visionPro, 0, undefined, "escritorio", ""],
      [UA.iphone, 5, undefined, "movil", ""], [UA.ipadMovil, 5, undefined, "movil", ""], [UA.ipadComoMac, 5, undefined, "movil", ""],
      [UA.androidChrome, 5, 8, "movil", ""], [UA.androidTablet, 5, 4, "movil", ""],
      ["", 0, undefined, "escritorio", ""], [undefined, undefined, undefined, "escritorio", ""], [null, null, null, "escritorio", ""], [42, "x", "y", "escritorio", ""],
      ["Node", 0, undefined, "escritorio", ""], ["curl/8.0", 0, undefined, "escritorio", ""], [{ toString() { throw new Error("no"); } }, 0, 0, "escritorio", ""]
    ];
    const et = (ua: unknown) => (typeof ua === "string" ? ua.slice(0, 60) : typeof ua);
    for (const [ua, tac, mem, clase, modelo] of fila) {
      const r = P.clasifica(ua, tac, mem);
      assert.strictEqual(r.clase, clase, et(ua) + " → " + clase);
      assert.strictEqual(r.modelo, modelo, "modelo de " + et(ua));
    }
    assert.strictEqual(P.clasifica(UA.safariMac, 0).clase, "escritorio", "un Mac sin pantalla táctil es escritorio");
    assert.strictEqual(P.clasifica(UA.chromeWin, 10, 8).clase, "escritorio", "un portátil táctil con Windows sigue siendo escritorio (no hay una regla por táctil)");
  });

  it("clasifica: memoriaBaja solo con deviceMemory de verdad y ≤ 4 GB (la regla que ya usaba el motor)", () => {
    assert.strictEqual(P.clasifica(UA.chromeWin, 0, 4).memoriaBaja, true);
    assert.strictEqual(P.clasifica(UA.chromeWin, 0, 2).memoriaBaja, true);
    assert.strictEqual(P.clasifica(UA.chromeWin, 0, 8).memoriaBaja, false);
    for (const m of [undefined, null, 0, NaN, "4", Infinity]) assert.strictEqual(P.clasifica(UA.chromeWin, 0, m).memoriaBaja, false, "memoria " + String(m));
  });

  it("politica: los valores del motor no cambian (ortoMax 20/8, caché 150/60) y la Quest fuera de VR usa el presupuesto ligero", () => {
    const esc = P.politica("escritorio", false), mov = P.politica("movil", false), q = P.politica("quest", false), pobre = P.politica("escritorio", true);
    assert.deepEqual([esc.ortoMax, esc.cacheMemMB, esc.cacheMemVrMB, esc.olivosLigero, esc.perfilOlivos], [20, 150, 60, false, "escritorio"]);
    assert.deepEqual([mov.ortoMax, mov.cacheMemMB, mov.olivosLigero, mov.perfilOlivos], [8, 60, true, "movil"]);
    assert.deepEqual([q.ortoMax, q.cacheMemMB, q.olivosLigero, q.perfilOlivos], [8, 60, true, "gafas"], "el defecto de 07b_arboles: ahora reconoce las gafas");
    assert.deepEqual([pobre.ortoMax, pobre.cacheMemMB, pobre.olivosLigero, pobre.perfilOlivos], [8, 60, true, "movil"], "escritorio con ≤ 4 GB: presupuesto ligero, como antes");
    assert.deepEqual([esc.postprocesado, mov.postprocesado, q.postprocesado], [true, false, false]);
    assert.deepEqual([esc.sombras, mov.sombras, q.sombras], ["normales", "cortas", "cortas"]);
    assert.strictEqual(P.politica("escritorio", false, { msaa: 4 }).alphaToCoverage, true);
    assert.strictEqual(P.politica("escritorio", false, { msaa: 0 }).alphaToCoverage, false);
    assert.strictEqual(P.politica("escritorio", false, null).alphaToCoverage, false, "sin medir no se promete");
    assert.doesNotThrow(() => P.politica(undefined, undefined, undefined));
  });

  it("capacidadesDe: lo medido en un contexto de mentira; lo no medido queda null; un contexto roto no lanza", () => {
    const gl2 = { MAX_SAMPLES: 1, MAX_TEXTURE_SIZE: 2, getInternalformatParameter() {}, getParameter: (k: number) => (k === 1 ? 4 : 8192),
      getSupportedExtensions: () => ["WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "OVR_multiview2"] };
    const c = P.capacidadesDe(gl2, { deviceMemory: 8, hardwareConcurrency: 8, maxTouchPoints: 5 });
    assert.deepEqual([c.webgl2, c.msaa, c.maxTextura, c.astc, c.etc, c.s3tc, c.multiview, c.memoria, c.nucleos, c.tactil], [true, 4, 8192, true, true, false, true, 8, 8, true]);
    const gl1 = { MAX_TEXTURE_SIZE: 2, getParameter: () => 4096, getSupportedExtensions: () => [] };
    const c1 = P.capacidadesDe(gl1, {});
    assert.deepEqual([c1.webgl2, c1.msaa, c1.maxTextura, c1.astc, c1.memoria, c1.nucleos, c1.tactil], [false, null, 4096, false, null, null, null]);
    const sin = P.capacidadesDe(null, undefined);
    assert.deepEqual(Object.values(sin).filter(v => v !== null), [], "sin contexto ni navigator, todo «no medido»");
    assert.doesNotThrow(() => P.capacidadesDe({ MAX_SAMPLES: 1, getInternalformatParameter() {}, getParameter() { throw new Error("contexto perdido"); } }, {}));
  });

  it("linea: «Aparato: Quest 3 · VR · MSAA 4 · ASTC sí» y sin medir «?»", () => {
    assert.strictEqual(P.linea({ clase: "quest", modelo: "quest-3", vr: true, capacidades: { msaa: 4, astc: true } }), "Aparato: Quest 3 · VR · MSAA 4 · ASTC sí");
    assert.strictEqual(P.linea({ clase: "escritorio", modelo: "", vr: false, capacidades: { msaa: 8, astc: false } }), "Aparato: Escritorio · MSAA 8 · ASTC no");
    assert.strictEqual(P.linea({ clase: "movil", capacidades: {} }), "Aparato: Móvil · MSAA ? · ASTC ?");
    assert.strictEqual(P.linea({ clase: "quest", modelo: "", capacidades: {} }), "Aparato: Quest · MSAA ? · ASTC ?");
    assert.doesNotThrow(() => P.linea(undefined));
  });

  it("el módulo sobre un navigator de mentira en cada clase; sin navigator ni window no lanza y cae a escritorio", () => {
    const q = aparatoDe({ userAgent: UA.quest3, maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 8 });
    assert.deepEqual([q.clase(), q.modelo(), q.vr(), q.politica().perfilOlivos], ["quest", "quest-3", false, "gafas"]);
    assert.deepEqual(q.capacidades().memoria, 8); assert.strictEqual(q.capacidades().webgl2, null, "sin contexto enlazado, WebGL «no medido»");
    assert.strictEqual(aparatoDe({ userAgent: UA.iphone, maxTouchPoints: 5 }).clase(), "movil");
    assert.strictEqual(aparatoDe({ userAgent: UA.chromeWin }).clase(), "escritorio");
    const vacio = aparatoDe(undefined); assert.strictEqual(vacio.clase(), "escritorio"); assert.doesNotThrow(() => { vacio.capacidades(); vacio.politica(); vacio.linea(); vacio.estado(); });
    assert.strictEqual(vacio.agente(), "");
    // se completa al enlazar el renderizador y al entrar en VR
    const gl = { MAX_SAMPLES: 1, MAX_TEXTURE_SIZE: 2, getInternalformatParameter() {}, getParameter: (k: number) => (k === 1 ? 4 : 4096), getSupportedExtensions: () => ["WEBGL_compressed_texture_astc"], getContextAttributes: () => ({ antialias: true }) };
    let dentro = false; q.enlaza({ vr: () => dentro, gl: () => gl, sesion: () => ({ frameRate: 90, environmentBlendMode: "opaque" }) });
    assert.strictEqual(q.linea(), "Aparato: Quest 3 · MSAA 4 · ASTC sí"); assert.strictEqual(q.capacidades().vr, null);
    dentro = true;
    assert.strictEqual(q.linea(), "Aparato: Quest 3 · VR · MSAA 4 · ASTC sí"); assert.deepEqual(q.capacidades().vr, { frecuencia: 90, mezcla: "opaque", msaaContexto: true });
    assert.strictEqual(q.politica().alphaToCoverage, true);
    const rota = aparatoDe({}); rota.enlaza({ vr() { throw new Error("x"); }, gl() { throw new Error("y"); }, sesion() { throw new Error("z"); } });
    assert.doesNotThrow(() => { rota.vr(); rota.capacidades(); rota.linea(); });
  });

  it("__aparato(): clase, modelo, capacidades y política para la telemetría, y NUNCA el agente completo", () => {
    const ventana: any = {}, a = aparatoDe({ userAgent: UA.quest3, deviceMemory: 8 }, ventana);
    assert.strictEqual(typeof ventana.__aparato, "function");
    const e = ventana.__aparato();
    assert.deepEqual([e.clase, e.modelo, e.vr, e.capacidades.memoria, e.politica.perfilOlivos], ["quest", "quest-3", false, 8, "gafas"]);
    assert.ok(!JSON.stringify(e).includes("OculusBrowser") && !JSON.stringify(e).includes("Mozilla"), "ni rastro del agente en el estado");
    assert.strictEqual(typeof e.linea, "string"); assert.ok(a.agente().includes("OculusBrowser"), "el agente en bruto solo sale por Aparato.agente() (la medida que se decide enviar)");
  });

  it("Aparato.pon (solo pruebas) fuerza la clase y el modelo y se deshace con pon(null)", () => {
    const a = aparatoDe({ userAgent: UA.chromeWin, deviceMemory: 8 });
    a.pon("quest", { modelo: "quest-3s", vr: true }); assert.deepEqual([a.clase(), a.modelo(), a.vr(), a.politica().olivosLigero], ["quest", "quest-3s", true, true]);
    a.pon("movil"); assert.deepEqual([a.clase(), a.modelo(), a.vr()], ["movil", "", false]);
    a.pon("escritorio", { memoria: 2 }); assert.deepEqual([a.clase(), a.politica().ortoMax, a.capacidades().memoria], ["escritorio", 8, 2]);
    a.pon("platillo"); assert.strictEqual(a.clase(), "escritorio", "una clase desconocida no cambia nada");
    a.pon("quest"); a.pon(null); assert.strictEqual(a.clase(), "escritorio");
  });
});
