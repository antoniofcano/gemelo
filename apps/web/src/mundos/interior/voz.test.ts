// La lectura en voz alta de las fichas: lo puro (voz española, trozos, texto, etiquetas) y lo fino con dobles de speechSynthesis (sin navegador).
// La integración con la ficha y el panel de VR en un navegador real (voces del sistema) queda por probar en dispositivo.
import { describe, expect, it } from "vitest";
import { creaVoz } from "./voz.ts";
import { VozPuro as V } from "./voz-puro.ts";

describe("VozPuro.elegirVoz", () => {
  it("prefiere es-ES, luego es-*, luego es; nunca otro idioma", () => {
    expect(V.elegirVoz([{ lang: "en-US" }, { lang: "es-MX" }, { lang: "es-ES" }])).toBe(2);
    expect(V.elegirVoz([{ lang: "en-US" }, { lang: "es_MX" }])).toBe(1);
    expect(V.elegirVoz([{ lang: "fr-FR" }, { lang: "es" }])).toBe(1);
    expect(V.elegirVoz([{ lang: "en-GB" }, { lang: "pt-PT" }])).toBe(-1);
    expect(V.elegirVoz([])).toBe(-1);
    expect(V.elegirVoz(null)).toBe(-1);
  });
  it("en el empate, la del sistema por defecto", () => {
    expect(V.elegirVoz([{ lang: "es-ES" }, { lang: "es-ES", default: true }])).toBe(1);
  });
});

describe("VozPuro.trocea", () => {
  it("parte por frases sin pasar del máximo y sin perder palabras", () => {
    const t = "Primera frase corta. Segunda frase, algo más larga que la primera. Tercera.";
    const r = V.trocea(t, 40);
    expect(r.every(x => x.length <= 40)).toBe(true);
    expect(r.join(" ")).toBe(t);
  });
  it("una frase más larga que el máximo se parte por palabras; vacío, nada", () => {
    const t = "uno dos tres cuatro cinco seis siete ocho nueve diez";
    const r = V.trocea(t, 15);
    expect(r.every(x => x.length <= 15)).toBe(true);
    expect(r.join(" ")).toBe(t);
    expect(V.trocea("")).toEqual([]);
  });
});

describe("VozPuro.textoLectura y etiquetas", () => {
  it("lee título, texto y dato curioso, sin las marcas [n]", () => {
    const f = { titulo: "La prensa", texto: "Prensaba el aceite [1] con una viga [2, 3].", dato_curioso: "Pesaba una tonelada [4]" };
    expect(V.textoLectura(f)).toBe("La prensa. Prensaba el aceite con una viga. Dato curioso: Pesaba una tonelada.");
    expect(V.textoLectura({ titulo: "Sola", texto: "Un texto." })).toBe("Sola. Un texto.");
  });
  it("el estado y el texto del botón", () => {
    expect(V.estadoVoz(false, true)).toBe("sin_voz");
    expect(V.estadoVoz(true, false)).toBe("parada");
    expect(V.estadoVoz(true, true)).toBe("leyendo");
    expect(V.etiquetaVoz("parada")).toBe("Leer en voz alta");
    expect(V.etiquetaVoz("leyendo")).toBe("Callar");
    expect(V.etiquetaVoz("sin_voz")).toBe("Sin voz en español");
    expect(V.etiquetaAuto(false)).toBe("Lectura automática: no");
  });
});

/** doble de speechSynthesis: guarda lo que se habla y deja terminar o cancelar a mano */
function doble(voces: Array<{ lang: string }>) {
  const hablado: any[] = [], oyentes = new Map<string, () => void>();
  const synth = {
    getVoices: () => voces, speak: (u: any) => { hablado.push(u); },
    cancel: () => { hablado.length = 0; },
    addEventListener: (n: string, f: () => void) => { oyentes.set(n, f); }, removeEventListener: (n: string) => { oyentes.delete(n); },
  };
  class Utterance { lang = ""; voice: any = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; text: string; constructor(t: string) { this.text = t; } }
  return { synth, Utterance, hablado, oyentes };
}

describe("creaVoz (con dobles)", () => {
  it("lee por trozos, en voz española, y termina", () => {
    const d = doble([{ lang: "en-US" }, { lang: "es-ES" }]), cambios: number[] = [];
    const v = creaVoz({ synth: d.synth, Utterance: d.Utterance as any, alCambiar: () => cambios.push(1) });
    expect(v.estado()).toBe("parada");
    expect(v.lee("Una frase. " + "Otra frase larga ".repeat(20) + ".")).toBe(true);
    expect(v.estado()).toBe("leyendo");
    const u = d.hablado[0]; expect(u.lang).toBe("es-ES"); expect(u.voice.lang).toBe("es-ES");
    let n = 0;
    while (d.hablado.length) { const x = d.hablado.pop(); x.onend(); if (++n > 50) break; }
    expect(v.estado()).toBe("parada");
    expect(cambios.length).toBeGreaterThan(1);
  });
  it("sin voz española no lee ni habla en otro idioma", () => {
    const d = doble([{ lang: "en-US" }]);
    const v = creaVoz({ synth: d.synth, Utterance: d.Utterance as any });
    expect(v.estado()).toBe("sin_voz"); expect(v.lee("Hola.")).toBe(false); expect(d.hablado.length).toBe(0);
  });
  it("sin la API, no hay voz", () => {
    const v = creaVoz({ synth: null, Utterance: null });
    expect(v.api()).toBe(false); expect(v.hayVoz()).toBe(false); expect(v.lee("x")).toBe(false); v.calla(); v.libera();
  });
  it("calla() cancela y un fin tardío del trozo anterior no sigue leyendo", () => {
    const d = doble([{ lang: "es-ES" }]);
    const v = creaVoz({ synth: d.synth, Utterance: d.Utterance as any });
    v.lee("Frase uno. Frase dos muy larga ".repeat(10));
    const u = d.hablado[0]; v.calla();
    expect(v.estado()).toBe("parada"); u.onend(); expect(d.hablado.length).toBe(0);
  });
  it("leer otra ficha calla la anterior; libera() cancela y suelta el oyente", () => {
    const d = doble([{ lang: "es-ES" }]);
    const v = creaVoz({ synth: d.synth, Utterance: d.Utterance as any });
    expect(d.oyentes.has("voiceschanged")).toBe(true);
    v.lee("Primera."); const a = d.hablado[0]; v.lee("Segunda.");
    expect(d.hablado.length).toBe(1); expect(d.hablado[0].text).toBe("Segunda."); a.onend(); expect(d.hablado.length).toBe(1);
    v.libera(); expect(d.hablado.length).toBe(0); expect(d.oyentes.has("voiceschanged")).toBe(false); expect(v.estado()).toBe("parada");
  });
});
