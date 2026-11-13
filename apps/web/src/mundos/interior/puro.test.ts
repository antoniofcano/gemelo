// Lo puro del mundo interior genérico (eje B): perfil, ruta, comprobación del manifiesto (contrastada con el validador del eje B), marcos, zonas y puertas.
import { describe, expect, it } from "vitest";
import ejemploJson from "../../../../../modelos/interiores/ejemplo/mundo.json";
import esquema from "../../../../../contratos/mundo-interior.schema.json";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";
import { InteriorPuro as P } from "./puro.ts";

const ejemplo = (): MundoInterior => JSON.parse(JSON.stringify(ejemploJson));
/** los módulos de Node, solo para contrastar con el validador del eje B (tsconfig no trae los tipos de Node: el cliente es del navegador) */
const deNode = (m: string): Promise<any> => import(/* @vite-ignore */ m);
/** un manifiesto con la forma de los patios (rectángulos a distinta cota, tres puertas: exterior, otro interior y uno que no existe). Inventado. */
function patiosFalsos(): MundoInterior {
  return {
    v: 1, id: "patios", nombre: "Patios (sintético)", fuente: "ilustrativo", licencia: { spdx: "CC0-1.0", autor: "prueba", atribucion: "" }, glb: "patios.glb", unidades: "m", arriba: "+Y",
    zonas: [
      { id: "sur", anillo: [[-3, 0], [3, 0], [3, -7], [-3, -7]], y: -0.1 },
      { id: "norte", anillo: [[-3, -7], [3, -7], [3, -20], [-3, -20]], y: -0.6 },
    ],
    puertas: [
      { id: "principal", a: "exterior", pos: [0, 0, 0], rumbo: 0, ancho: 6, alto: 2.8, llegada: { pos: [0, -0.1, -1.7], rumbo: 180 } },
      { id: "fabrica", a: "fabrica", pos: [3.2, -0.6, -15], rumbo: 90, ancho: 1, alto: 2.3, llegada: { pos: [1.5, -0.6, -15], rumbo: 270 } },
      { id: "verja", a: "vivienda", pos: [-3.2, -0.1, -3], rumbo: 270, ancho: 2, alto: 2, llegada: { pos: [-1.5, -0.1, -3], rumbo: 90 } },
    ],
  };
}

describe("InteriorPuro: perfil y ruta", () => {
  it("la carpeta ligera («quest») en VR o en unas gafas; la completa («pantalla») en escritorio y en móvil", () => {
    expect(P.perfil({ vr: true, clase: "escritorio" })).toBe("quest");
    expect(P.perfil({ vr: false, clase: "quest" })).toBe("quest");
    expect(P.perfil({ vr: false, clase: "escritorio" })).toBe("pantalla");
    expect(P.perfil({ vr: false, clase: "movil" })).toBe("pantalla");
  });
  it("<base><mundo>/<perfil>/, del mismo origen: /teselas/<finca>/ en el servidor, junto a la página sin base; otro host, no", () => {
    expect(P.ruta("/teselas/hituelo/", "patios", "quest")).toBe("/teselas/hituelo/patios/quest/");
    expect(P.ruta("/teselas/hituelo", "fabrica", "pantalla")).toBe("/teselas/hituelo/fabrica/pantalla/");
    expect(P.ruta("", "patios", "pantalla")).toBe("patios/pantalla/");
    expect(P.ruta(undefined, "patios", "pantalla")).toBe("patios/pantalla/");
    for (const b of ["https://otro.example/teselas/", "//otro.example/", "data:x"]) expect(() => P.ruta(b, "patios", "quest"), b).toThrow(/mismo origen/);
    for (const m of ["../x", "Patios", "", "a/b"]) expect(() => P.ruta("/teselas/hituelo/", m, "quest"), m).toThrow(/id de mundo/);
  });
});

describe("InteriorPuro.valida: lo que el motor comprueba del manifiesto", () => {
  it("el ejemplo del contrato y uno con la forma de los patios valen; el id tiene que ser el pedido", () => {
    expect(P.valida(ejemplo(), "sala-ejemplo")).toEqual([]);
    expect(P.valida(patiosFalsos(), "patios")).toEqual([]);
    expect(P.valida(patiosFalsos(), "fabrica").join()).toMatch(/se pidió «fabrica»/);
  });
  it("rechaza lo que rompería la carga, cada caso con su motivo", () => {
    const casos: Array<[string, (m: any) => void, RegExp]> = [
      ["no es un objeto", () => undefined, /no es un objeto/],
      ["versión", m => { m.v = 2; }, /versión 1/],
      ["unidades", m => { m.unidades = "cm"; }, /unidades/],
      ["arriba", m => { m.arriba = "+Z"; }, /arriba/],
      ["glb", m => { m.glb = "../fuera.glb"; }, /glb/],
      ["fuente", m => { m.fuente = "inventado"; }, /fuente/],
      ["sin zonas", m => { m.zonas = []; }, /zonas: de 1 a 64/],
      ["zona con dos puntos", m => { m.zonas[0].anillo = [[0, 0], [1, 1]]; }, /anillo/],
      ["zona diminuta", m => { m.zonas[0].anillo = [[0, 0], [0.5, 0], [0.5, -0.5]]; }, /0,5 m²/],
      ["principal fuera del origen", m => { m.puertas[0].pos = [1, 0, 0]; }, /origen/],
      ["llegada fuera de zona", m => { m.puertas[0].llegada.pos = [50, 0, -50]; }, /llegada/],
      ["llegada a otra cota", m => { m.puertas[0].llegada.pos = [0, 0.5, -1.7]; }, /llegada/],
      ["a su propio mundo", m => { m.puertas[1].a = "patios"; }, /propio mundo/],
      ["rumbo", m => { m.puertas[1].rumbo = 360; }, /rumbo/],
      ["id repetido", m => { m.puertas[2].id = "fabrica"; }, /repetido/],
    ];
    for (const [que, rompe, motivo] of casos) {
      const m: any = patiosFalsos(); const r = rompe(m);
      const errores = P.valida(que === "no es un objeto" ? r : m, "patios");
      expect(errores.join(" · "), que).toMatch(motivo);
    }
  });
  // regla 12: la comprobación del motor no es la del validador del eje B (ajv no cabe con la CSP); se contrastan para que no se separen
  it("contrastado con tuberia/interiores/valida.js: el ejemplo pasa en los dos y los casos rotos del manifiesto los rechazan los dos", async (c) => {
    const { createRequire } = await deNode("node:module"), { fileURLToPath } = await deNode("node:url"), fs = await deNode("node:fs");
    const raiz = new URL("../../../../../", import.meta.url);
    let valida: ((m: unknown, b: Uint8Array) => Promise<{ ok: boolean; errores: string[] }>) | null = null;
    try { valida = createRequire(import.meta.url)(fileURLToPath(new URL("tuberia/interiores/valida.js", raiz))).valida; } catch { valida = null; }
    if (!valida) { c.skip("sin las dependencias de la raíz (npm ci): el contraste con el validador del eje B NO se ha comprobado"); return; }
    const glb = new Uint8Array(fs.readFileSync(new URL("modelos/interiores/ejemplo/sala.glb", raiz)));
    expect((await valida!(ejemplo(), glb)).errores).toEqual([]);
    expect(P.valida(ejemplo(), "sala-ejemplo")).toEqual([]);
    const rotos: Array<(m: any) => void> = [
      m => { m.v = 2; }, m => { m.unidades = "cm"; }, m => { m.puertas[0].pos = [1, 0, 0]; }, m => { m.puertas[0].llegada.pos = [0, 0, -9]; },
      m => { m.puertas[0].a = "sala-ejemplo"; }, m => { m.zonas.push({ ...m.zonas[0] }); }, m => { m.zonas[0].anillo = [[0, 0], [0.4, 0], [0.4, -0.4]]; },
    ];
    for (const rompe of rotos) {
      const m: any = ejemplo(); rompe(m);
      const nodo = await valida!(m, glb);
      expect(nodo.ok, rompe.toString()).toBe(false);
      expect(P.valida(m, "sala-ejemplo").length, rompe.toString()).toBeGreaterThan(0);
    }
  });
});

describe("InteriorPuro: marcos (glb → quien anda)", () => {
  it("rumbo del contrato (desde +Z hacia +X) → ang de quien anda: 180° es mirar hacia −Z, que es su +y", () => {
    expect(P.angDeRumbo(180)).toBeCloseTo(0);
    expect(P.angDeRumbo(0)).toBeCloseTo(Math.PI);
    expect(P.angDeRumbo(90)).toBeCloseTo(Math.PI / 2);
    expect(P.angDeRumbo(270)).toBeCloseTo(-Math.PI / 2);
    // avanzar con ang (sin ang, cos ang) en (x, y) es avanzar por (sin r, cos r) en (x, z) del glb, con z = −y
    for (const r of [0, 37, 90, 180, 300]) {
      const a = P.angDeRumbo(r), rad = r * Math.PI / 180;
      expect(Math.sin(a)).toBeCloseTo(Math.sin(rad)); expect(-Math.cos(a)).toBeCloseTo(Math.cos(rad));
    }
  });
  it("la llegada del ejemplo: (0, 0, −1,5) mirando a 180° → x 0, y 1,5, ang 0", () => {
    const p = P.poseDe(ejemplo().puertas[0]!.llegada);
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(1.5); expect(p.ang).toBeCloseTo(0);
  });
  it("dónde aparece quien entra: por la puerta de este interior que lleva al mundo de donde viene; si no hay, por la principal", () => {
    const m = patiosFalsos();
    expect(P.llegada(m, "fabrica")).toMatchObject({ x: 1.5, y: 15 });
    expect(P.llegada(m, "exterior")).toMatchObject({ x: 0, y: 1.7 });
    expect(P.llegada(m, null)).toMatchObject({ x: 0, y: 1.7 });
    expect(P.llegada(m, "bodega")).toMatchObject({ x: 0, y: 1.7 });
  });
});

describe("InteriorPuro.creaZonas: por dónde se anda", () => {
  const Z = P.creaZonas(patiosFalsos().zonas);
  it("dentro de alguna zona; el suelo, plano por zona; fuera, el de la más cercana", () => {
    expect(Z.dentro(0, 3)).toBe(true); expect(Z.dentro(0, 12)).toBe(true); expect(Z.dentro(4, 3)).toBe(false); expect(Z.dentro(0, -1)).toBe(false);
    expect(Z.suelo(0, 3)).toBe(-0.1); expect(Z.suelo(0, 12)).toBe(-0.6);
    expect(Z.suelo(0, -5)).toBe(-0.1); expect(Z.suelo(0, 40)).toBe(-0.6);
  });
  it("obstaculo: null dentro; fuera, el punto del borde más cercano, ya dentro, y siempre el mismo objeto", () => {
    expect(Z.obstaculo(1, 5)).toBeNull();
    const a = Z.obstaculo(5, 3);
    expect(a).not.toBeNull(); expect(a!.x).toBeCloseTo(3, 1); expect(a!.y).toBeCloseTo(3, 1); expect(Z.dentro(a!.x, a!.y)).toBe(true);
    const b = Z.obstaculo(0, -2);
    expect(b).toBe(a); expect(b!.y).toBeCloseTo(0, 1); expect(Z.dentro(b!.x, b!.y)).toBe(true);
    expect(P.creaZonas([]).obstaculo(9, 9)).toBeNull();
  });
});

describe("InteriorPuro.creaVigia: las puertas se cruzan al acercarse al umbral", () => {
  const pu = P.puertasPose(patiosFalsos().puertas);
  it("el umbral es un segmento del ancho de la puerta: un portón de 6 m se cruza por cualquier punto de su vano", () => {
    expect(P.aUmbral(pu[0]!, 2.5, 0.3)).toBeCloseTo(0.3);
    expect(P.aUmbral(pu[0]!, 0, 0.3)).toBeCloseTo(0.3);
    expect(P.aUmbral(pu[0]!, 4, 0)).toBeCloseTo(1);
    expect(P.aUmbral(pu[1]!, 3, 15)).toBeCloseTo(0.2);
  });
  it("al entrar por una llegada no se dispara su puerta; acercarse a otra la cruza una vez; hay que alejarse para rearmarla", () => {
    const v = P.creaVigia(pu);
    v.arma(0, 1.7);   // la llegada de la principal: a 1,7 m de su umbral (más que RADIO + HISTERESIS)
    expect(v.paso(0, 1.7)).toBeNull();
    expect(v.paso(2.7, 15)?.id).toBe("fabrica");
    expect(v.paso(2.75, 15)).toBeNull();   // sigue cerca: ya no
    expect(v.paso(1, 15)).toBeNull();      // se aleja 2,2 m: se rearma
    expect(v.paso(2.8, 15)?.id).toBe("fabrica");
    expect(v.paso(0, 0.3)?.id).toBe("principal");
  });
  it("si se entra cerca de una puerta (menos de RADIO + HISTERESIS), queda desarmada hasta alejarse", () => {
    const v = P.creaVigia(pu);
    v.arma(0, 1); expect(v.armadas()[0]).toBe(false);
    expect(v.paso(0, 0.3)).toBeNull();
    expect(v.paso(0, 2)).toBeNull(); expect(v.armadas()[0]).toBe(true);
    expect(v.paso(0, 0.3)?.id).toBe("principal");
  });
});

describe("InteriorPuro: presupuesto y rótulo", () => {
  it("los topes del contrato: pantalla 1 M / 400 / 256 MB; quest 300.000 / 150 / 96 MB (contratos/mundo-interior.schema.json)", () => {
    const esq = (esquema as any).$defs.presupuesto.const.perfiles;
    for (const k of ["pantalla", "quest"] as const) {
      expect(P.PRESUPUESTO[k].triangulos).toBe(esq[k].triangulos); expect(P.PRESUPUESTO[k].llamadas).toBe(esq[k].llamadas); expect(P.PRESUPUESTO[k].texturasMb).toBe(esq[k].texturas_mb);
    }
  });
  it("regla 5: el nombre, de qué es y que la luz horneada es ilustrativa", () => {
    expect(P.rotulo({ nombre: "Fábrica", fuente: "mixto" })).toBe("Fábrica · mixto: medido y modelado · luz horneada, ilustrativa");
    expect(P.rotulo({ nombre: "Patios", fuente: "ilustrativo" })).toMatch(/ilustrativo · luz horneada, ilustrativa$/);
  });
});
