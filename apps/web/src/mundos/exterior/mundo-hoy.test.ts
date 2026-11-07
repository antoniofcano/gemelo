// «Hoy en el campo» (EV-3a; MU5-n, A3-7b1: antes apps/web/motor/53_mundo_hoy.js). Lo puro (el contrato, las líneas, el tablón) lo prueba el guardián de Node contra el ejemplo del
// contrato (pruebas/guardianes/mundo_hoy.test.js); aquí, el CICLO DE VIDA con dobles del DOM (nucleo/prueba-dom.ts): sin servidor no hace nada; con servidor pide la lectura,
// pinta la tarjeta y avisa una vez en el HUD; libera() para el reloj de 10 min, corta la petición en vuelo (AbortController), saca la tarjeta y lo que llegue tarde no se pinta.
// HONESTIDAD: sin navegador ni maquetación; la tarjeta de verdad en la ventana del tiempo, en el banco.
import { afterEach, describe, expect, it } from "vitest";
import { ID_MUNDO_HOY, MundoHoyPuro, manifiestoMundoHoy } from "./mundo-hoy.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
const espera = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };   // microtareas: el setTimeout de los dobles no corre solo

const lectura = (dias: string[] = ["2026-11-05", "2026-11-06"]) => ({
  version: 1, ahora: { fecha: "2026-11-05", hora: "11:30", zona: "Europe/Madrid", diaDelAnio: 309, estacionDelAnio: "otoño" },
  fuentes: { olivartrack: { encendida: true, disponible: true }, vigia: { encendida: true, disponible: true } },
  avisos: [{ tipo: "recogida", texto: "Hoy hay recogida en curso.", parcelas: [], de: "olivartrack", consultadoEn: "2026-11-05T10:00:00Z" }], notas: [], completo: true,
  tiempo: { previsionCorta: { consultadoEn: "2026-11-05T10:00:00Z", dias: dias.map(f => ({ fecha: f, tmax: 18, tmin: 7, lluviaMm: 0, probabilidadLluviaMax: 10 })) } }, fenologia: null, trabajoSemana: null, miradas: null
});

function monta(o: { base?: string; respuesta?: () => Promise<unknown> }) {
  m = creaMundo();
  const caja = m.el("div", "tPanAhora"), est = m.el("div", "tEst"); caja.appendChild(est); m.documento.body.appendChild(caja);
  const reg = { pedidas: [] as Array<{ u: string; op: { signal?: AbortSignal; credentials?: string } }>, hud: [] as string[], emitidos: [] as string[] };
  m.ventana.fetch = (u: string, op: { signal?: AbortSignal; credentials?: string }) => { reg.pedidas.push({ u, op }); return o.respuesta ? o.respuesta() : new Promise(() => {}); };
  const c = manifiestoMundoHoy({ D: { base: o.base === undefined ? "/teselas/x/" : o.base, parcelas: [] }, $: (id: string) => m!.documento.getElementById(id), Hud: { aviso: (t: string) => reg.hud.push(t) } });
  const api = c.monta({ emite: (ev: string) => { reg.emitidos.push(ev); return 0; } } as never) as { libera(): void; estado(): { datos: unknown; visible?: boolean; motivo?: string } };
  return { c, api, reg, m, caja, est };
}
const ok = (cuerpo: unknown) => () => Promise.resolve({ status: 200, json: () => Promise.resolve(cuerpo) });

describe("«Hoy en el campo»: ciclo de vida", () => {
  it("sin servidor no pide nada, no crea la tarjeta y no deja relojes", async () => {
    const { api, reg, m, caja } = monta({ base: "" }); await espera();
    expect(reg.pedidas).toEqual([]); expect(caja.children.length).toBe(1); expect(m.relojes()).toBe(0); expect(api.estado()).toEqual({ datos: null, motivo: "sin_api" }); api.libera();
  });
  it("con servidor: pide una vez con la cookie, pinta la tarjeta antes de la estación, avisa una vez en el HUD y emite «mundo:hoy»", async () => {
    const { api, reg, m, caja, est } = monta({ respuesta: ok(lectura()) }); await espera();
    expect(reg.pedidas.map(p => p.u)).toEqual(["/api/mundo/hoy"]); expect(reg.pedidas[0]!.op.credentials).toBe("same-origin");
    const tarjeta = m.documento.getElementById("tHoyCampo");
    expect(tarjeta).toBeTruthy(); expect(caja.children.indexOf(tarjeta)).toBeLessThan(caja.children.indexOf(est)); expect(tarjeta.hidden).toBe(false);
    expect(tarjeta.textContent).toMatch(/Hoy en el campo/); expect(reg.hud).toEqual(["Hoy hay recogida en curso."]); expect(reg.emitidos).toEqual(["mundo:hoy"]);
    expect(m.relojes()).toBe(1);
    api.libera();
  });
  it("libera(): para el reloj, corta la petición en vuelo, saca la tarjeta y lo que llegue tarde no se pinta", async () => {
    let suelta: (r: unknown) => void = () => {};
    const { api, reg, m, caja } = monta({ respuesta: () => new Promise(r => { suelta = r; }) }); await espera();
    expect(reg.pedidas.length).toBe(1); expect(reg.pedidas[0]!.op.signal!.aborted).toBe(false); expect(m.relojes()).toBe(1); expect(caja.children.length).toBe(2);
    api.libera();
    expect(reg.pedidas[0]!.op.signal!.aborted).toBe(true); expect(m.relojes()).toBe(0); expect(caja.children.length).toBe(1);
    suelta({ status: 200, json: () => Promise.resolve(lectura()) }); await espera();
    expect(caja.children.length).toBe(1); expect(reg.hud).toEqual([]); expect(reg.emitidos).toEqual([]);
  });
  it("diez montajes y liberaciones no dejan relojes ni nodos", async () => {
    for (let i = 0; i < 10; i++) {
      const { api, m, caja } = monta({ respuesta: ok(lectura()) }); await espera();
      api.libera(); expect(m.relojes()).toBe(0); expect(caja.children.length).toBe(1); m.limpia();
    }
    m = null;
  });
  it("L8-12: «Mañana» es el día siguiente por su fecha, no el segundo de la lista (la api quita los días sin horas)", () => {
    const con = (dias: string[]) => MundoHoyPuro.lineas(MundoHoyPuro.valida(lectura(dias)), Date.parse("2026-11-05T10:40:00Z"), []).find((l: { texto: string }) => /^Mañana/.test(l.texto));
    expect(con(["2026-11-05", "2026-11-06"]).texto).toMatch(/^Mañana \(06\/11\)/);
    expect(con(["2026-11-05", "2026-11-07", "2026-11-08"])).toBeUndefined();   // hoy sin horas de mañana: nada de poner pasado mañana con la palabra «Mañana»
    expect(con(["2026-11-06"]).texto).toMatch(/^Mañana \(06\/11\)/);   // y si falta hoy pero está mañana, sale
  });
  it("el componente es del exterior, con su bandera ?mundohoy= y sin presupuesto", () => {
    const { c } = monta({ base: "" });
    expect(c.id).toBe(ID_MUNDO_HOY); expect(c.mundos).toEqual(["exterior"]); expect(c.bandera).toEqual({ defecto: true, url: "mundohoy" }); expect(c.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
  });
});
