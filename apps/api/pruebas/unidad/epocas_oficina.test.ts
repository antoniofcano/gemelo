// OF9: la comprobación de los 366 días de la pestaña Épocas de la oficina (apps/web/oficina/olivos_puro.js) dice lo mismo que la barrera de la api
// (src/config/valida.ts): con tablas al azar, el mismo veredicto; y lo que la pantalla acepta, la api lo acepta como configuración completa.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validaConfig, validaTabla, EPOCAS } from "../../src/config/valida.ts";

const P = (await import(new URL("../../../web/oficina/olivos_puro.js", import.meta.url).href)) as {
  validaTabla: (t: unknown) => { nivel: string; texto: string }[]; tablaDePartida: () => Record<string, { desde: string; hasta: string }>; aCuerpo: (...a: unknown[]) => unknown; defectos: () => unknown;
};

const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mmdd = (n: number) => { let m = 0; while (n >= DIAS_MES[m]!) { n -= DIAS_MES[m]!; m++; } return String(m + 1).padStart(2, "0") + "-" + String(n + 1).padStart(2, "0"); };
function semilla(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test("la comprobación de la oficina y la de la api dan el mismo veredicto con tablas al azar", () => {
  const r = semilla(21);
  let buenas = 0, malas = 0;
  for (let i = 0; i < 300; i++) {
    const cortes: number[] = []; while (cortes.length < 7) { const c = Math.floor(r() * 366); if (!cortes.includes(c)) cortes.push(c); } cortes.sort((a, b) => a - b);
    const t: Record<string, { desde: string; hasta: string }> = {};
    EPOCAS.forEach((e, k) => { t[e] = { desde: mmdd(cortes[k]!), hasta: mmdd((cortes[(k + 1) % 7]! + 365) % 366) }; });
    if (r() < 0.5) t[EPOCAS[Math.floor(r() * 7)]!]![r() < 0.5 ? "desde" : "hasta"] = mmdd(Math.floor(r() * 366));
    const oficina = P.validaTabla(t).every(m => m.nivel !== "mal"), api = validaTabla(t).length === 0;
    assert.equal(oficina, api, JSON.stringify(t));
    // y la configuración completa que armaría la pantalla la acepta la api exactamente cuando la pantalla la acepta
    if (oficina) { assert.deepEqual(validaConfig({ v: 1, epocas: { comun: t } }), []); buenas++; } else { assert.ok(validaConfig({ v: 1, epocas: { comun: t } }).length > 0); malas++; }
  }
  assert.ok(buenas > 50 && malas > 50, buenas + " buenas, " + malas + " malas");
});

test("el cuerpo que arma la pantalla con épocas común y de finca lo acepta la api", () => {
  const hit = P.tablaDePartida(); hit.verde!.hasta = "09-14"; hit.envero!.desde = "09-15";
  const cuerpo = P.aCuerpo(P.defectos(), {}, null, { comun: P.tablaDePartida(), fincas: { hituelo: hit } });
  assert.deepEqual(validaConfig(cuerpo), []);
});
