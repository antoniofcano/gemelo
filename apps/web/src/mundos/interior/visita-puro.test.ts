// La visita del museo (v1.1): lo puro (comprobación, recorrido con histéresis, etiquetas, fuentes, páginas) y la visita con dobles en VR (las filas del
// panel, sus botones, la tapa y su liberación). El recuadro de pantalla y las marcas se prueban en el navegador (pruebas/guardianes/visita_chrome.test.js).
import { describe, expect, it } from "vitest";
import ejemplo from "../../../../../modelos/interiores/ejemplo/mundo.json";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";
import type { Pose2 } from "../../nucleo/mundos.ts";
import { VisitaPuro as V } from "./visita-puro.ts";
import { creaVisita } from "./visita.ts";

const MAN = ejemplo as unknown as MundoInterior;
const copia = <X>(o: X): X => JSON.parse(JSON.stringify(o));

describe("VisitaPuro.valida", () => {
  it("el ejemplo del contrato vale; sin paradas no es un error", () => {
    expect(V.valida(MAN)).toEqual([]);
    const m = copia(MAN); delete m.paradas;
    expect(V.valida(m)).toEqual([]);
  });
  it("rechaza lo que rompería la visita (y entonces el interior entra sin ella)", () => {
    let m = copia(MAN); (m.paradas![0] as any).pos = [1, 2];
    expect(V.valida(m).join()).toMatch(/pos/);
    m = copia(MAN); m.paradas!.push(copia(m.paradas![0]!));
    expect(V.valida(m).join()).toMatch(/repetida/);
    m = copia(MAN); delete (m.paradas![1]!.ficha as any).texto;
    expect(V.valida(m).join()).toMatch(/ficha/);
    m = copia(MAN); (m as any).paradas = [];
    expect(V.valida(m).join()).toMatch(/de 1 a 16/);
  });
});

describe("el recorrido", () => {
  const P = MAN.paradas!;
  const en = (i: number): [number, number] => [P[i]!.pos[0], -P[i]!.pos[2]];
  it("en la oferta y paseando libre no abre nada", () => {
    const r = V.creaRecorrido(P);
    expect(r.modo()).toBe("oferta");
    expect(r.paso(...en(1))).toBeNull();
    r.deja(); expect(r.modo()).toBe("libre"); expect(r.paso(...en(1))).toBeNull();
  });
  it("abre al entrar en el radio, cierra al alejarse con histéresis y la siguiente es la de después", () => {
    const r = V.creaRecorrido(P);
    r.empieza();   // la llegada del ejemplo: fuera de todos los radios
    expect(r.sig()).toBe(0);
    expect(r.paso(...en(0))).toMatchObject({ abre: 0 });
    expect(r.abierta()).toBe(0); expect(r.sig()).toBe(1); expect(r.vista(0)).toBe(true);
    expect(r.paso(...en(0))).toBeNull();   // quieto: no se vuelve a abrir
    const [x, y] = en(0);
    expect(r.paso(x + P[0]!.radio + 0.3, y)).toBeNull();   // fuera del radio, dentro de la histéresis: sigue abierta
    expect(r.abierta()).toBe(0);
    expect(r.paso(x + P[0]!.radio + V.HISTERESIS + 0.1, y)).toMatchObject({ cierra: 0 });
    expect(r.abierta()).toBe(-1);
    expect(r.paso(...en(0))).toMatchObject({ abre: 0 });   // rearmada: se puede volver
  });
  it("quien visita manda: llegar a otra parada la abre y la siguiente pasa a ser la de después; al acabar, fin", () => {
    const r = V.creaRecorrido(P);
    r.empieza();
    expect(r.paso(...en(2))).toMatchObject({ abre: 2 });
    expect(r.sig()).toBe(3); expect(r.fin()).toBe(true);
    expect(r.siguiente()).toBe(-1); expect(r.abierta()).toBe(-1);
  });
  it("si al empezar ya se está en una parada (la primera suele ser la llegada), se abre en el siguiente paso", () => {
    const r = V.creaRecorrido(P);
    r.empieza();
    expect(r.paso(...en(0))).toMatchObject({ abre: 0 });
  });
  it("«Siguiente parada» cierra la abierta y dice cuál toca", () => {
    const r = V.creaRecorrido(P);
    r.empieza(); r.paso(...en(0));
    expect(r.siguiente()).toBe(1); expect(r.abierta()).toBe(-1);
  });
  it("angHacia: mira al punto del glb en el marco de quien anda", () => {
    expect(V.angHacia(0, 0, [0, 0, -5])).toBeCloseTo(0);          // −z del glb = +y de quien anda: de frente
    expect(V.angHacia(0, 0, [5, 0, 0])).toBeCloseTo(Math.PI / 2);  // +x: a la derecha
  });
});

describe("la ficha", () => {
  const f = MAN.paradas![1]!.ficha;
  it("etiquetas de procedencia (regla 5) y lo pendiente solo como cuenta", () => {
    expect(V.etiquetas(f)).toEqual({ visible: "Lo que ves: ilustrativo (modelado a mano)", texto: "Lo que cuenta: documentado con fuentes" });
    expect(V.etiquetas({ procedencia_visible: "ilustrativo", procedencia_texto: ["documentado", "testimonio"] }).texto).toBe("Lo que cuenta: documentado con fuentes y testimonio de la familia");
    expect(V.pendiente({})).toBeNull();
    const p = V.pendiente({ pendiente: ["¿cuántos rulos tenía?", "¿de qué taller?"] })!;
    expect(p).toMatch(/2 preguntas abiertas/); expect(p).not.toMatch(/rulos|taller/);
  });
  it("las fuentes llevan el número de su [n] (su puesto en fuentes[] del mundo), dicen si no se verificaron y solo dan url https", () => {
    const fu = V.fuentesDe(f, MAN.fuentes);
    expect(fu.map(x => x.n)).toEqual([1, 2]);
    expect(V.fuenteTexto(fu[1]!)).toMatch(/^\[2\] .*sin verificar$/);
    expect(fu[1]!.url).toBe("https://example.org/ejemplo");
    expect(V.fuentesDe(f, [{ id: "ejemplo-a", cita: "x", url: "javascript:alert(1)", verificada: true }])[0]!.url).toBeNull();
  });
  it("la puerta con la que sigue: abierta si su mundo existe; si no, «próximamente»", () => {
    const puertas = [...MAN.puertas, { id: "bodega", a: "bodega", pos: [1, 0, -5], rumbo: 180, ancho: 1, alto: 2, llegada: { pos: [1, 0, -4], rumbo: 0 } }] as MundoInterior["puertas"];
    expect(V.sigue({ puerta: "bodega" }, puertas, () => false)).toMatchObject({ abierta: false, texto: "Bodega: próximamente" });
    expect(V.sigue({ puerta: "principal" }, puertas, () => false)).toMatchObject({ abierta: true, a: "exterior" });
    expect(V.sigue({}, puertas, () => true)).toBeNull();
  });
  it("envuelve por palabras y pagina con las fuentes aparte", () => {
    const l = V.envuelve("uno dos tres cuatro cinco seis", 9);
    expect(l).toEqual(["uno dos", "tres", "cuatro", "cinco", "seis"]);
    expect(l.every(x => x.length <= 9)).toBe(true);
    const pags = V.paginas(f, MAN.fuentes, 40, 6, "Sigue: Bodega: próximamente");
    const todo = pags.flat().map(x => x.t).join(" ");
    expect(pags.every(p => p.length <= 6)).toBe(true);
    expect(todo).toContain("Dato curioso:"); expect(todo).toContain("Lo que ves: ilustrativo"); expect(todo).toContain("próximamente");
    const ult = pags[pags.length - 1]!;
    expect(ult[0]).toEqual({ t: "Fuentes", e: "destacado" });   // plegadas: en su propia página
    expect(V.paginas({ ...f, texto: "", fuentes: [] }, undefined, 40, 6).length).toBeGreaterThan(0);
  });
});

describe("la visita en VR, con dobles", () => {
  function banco(vr = true) {
    const pp: Pose2 = { x: 0, y: 1.5, ang: Math.PI };
    const filas: Record<string, any> = {}, tapas: Array<() => boolean> = [];
    let abiertos = 0, repintados = 0;
    const PanelVR = {
      filas: (p: string, f: any) => { expect(p).toBe("mundo"); filas[f.id] = f; return () => { delete filas[f.id]; }; },
      tapa: (fn: () => boolean) => { tapas.push(fn); return () => { tapas.splice(tapas.indexOf(fn), 1); }; },
      repinta: () => { repintados++; },
    };
    const v = creaVisita({
      man: copia(MAN), THREE: null, documento: null, PanelVR, abrePanel: () => { abiertos++; },
      escena: { add() {}, remove() {} }, pose: { lee: () => pp, pon: p => { Object.assign(pp, p); } }, vr: () => vr, existe: () => false,
    });
    /** los botones que pinta ahora la fila de la visita */
    const botones = () => { const B: any[] = []; filas.visita.botones((id: string, x: number, y: number, w: number, h: number, txt: string, fn: () => void) => B.push({ id, x, w, txt, fn }), 300); return B; };
    const pulsa = (id: string) => { const b = botones().find(q => q.id === id); expect(b, id).toBeTruthy(); b.fn(); };
    return { v, pp, filas, tapas, botones, pulsa, abiertos: () => abiertos, repintados: () => repintados };
  }
  it("al montar en VR abre el panel con la oferta; empezar, llegar, pasar página, siguiente (gira sin mover) y salir", () => {
    const b = banco();
    b.v.monta();
    expect(b.abiertos()).toBe(1);
    expect(Object.keys(b.filas).sort()).toEqual(["visita", "visita-ficha"]);
    expect(b.botones().map(q => q.txt)).toEqual(["Empezar la visita", "Pasear libre"]);
    for (const q of b.botones()) expect(q.x + q.w).toBeLessThanOrEqual(984);   // dentro del panel (1.024 px, margen de 40)
    expect(b.filas["visita-ficha"].visible()).toBe(false);
    b.pulsa("vis-empieza");
    expect(b.v.estado()).toMatchObject({ modo: "visita", siguiente: 0, abierta: -1 });
    const p0 = MAN.paradas![1]!.pos; b.pp.x = p0[0]; b.pp.y = -p0[2];   // la 2.ª, que tiene fuentes: dos páginas
    b.v.cada();
    expect(b.v.estado().abierta).toBe(1); expect(b.abiertos()).toBe(2);   // al llegar, el panel se abre
    expect(b.filas["visita-ficha"].visible()).toBe(true); expect(b.tapas.some(fn => fn())).toBe(true);
    for (const q of b.botones()) expect(q.x + q.w).toBeLessThanOrEqual(984);
    b.pulsa("vis-pag+"); b.pulsa("vis-pag+"); b.pulsa("vis-pag+");
    expect(b.v.estado().pagina).toBeGreaterThan(0);
    const antes = { x: b.pp.x, y: b.pp.y };
    b.pulsa("vis-siguiente");
    expect(b.pp).toMatchObject(antes);   // no se mueve
    const p1 = MAN.paradas![2]!.pos;
    expect(b.pp.ang).toBeCloseTo(V.angHacia(antes.x, antes.y, p1));
    expect(b.v.estado()).toMatchObject({ abierta: -1, siguiente: 2 });
    b.pulsa("vis-sal");
    expect(b.v.estado().modo).toBe("libre");
    expect(b.botones().map(q => q.txt)).toEqual(["Empezar la visita"]);
    expect(b.repintados()).toBeGreaterThan(0);
  });
  it("la ficha se pinta en el lienzo del panel dentro de su fila y sin salirse del ancho", () => {
    const b = banco(); b.v.monta(); b.pulsa("vis-empieza");
    const p1 = MAN.paradas![1]!.pos; b.pp.x = p1[0]; b.pp.y = -p1[2]; b.v.cada();
    const textos: Array<{ t: string; y: number; max?: number }> = [];
    const cx: any = { fillRect() {}, fillText: (t: string, _x: number, y: number, max?: number) => { textos.push({ t, y, max }); } };
    b.filas["visita-ficha"].pinta(cx, 500, 1024);
    expect(textos[0]!.t).toBe("2. La rueda que gira");
    for (const t of textos) { expect(t.y).toBeGreaterThanOrEqual(500); expect(t.y).toBeLessThan(500 + b.filas["visita-ficha"].alto); if (t.max !== undefined) expect(t.max).toBeLessThanOrEqual(1024 - 80); }
  });
  it("libera quita las filas y la tapa; sin paradas no monta nada", () => {
    const b = banco(); b.v.monta(); b.v.libera();
    expect(Object.keys(b.filas)).toEqual([]); expect(b.tapas).toEqual([]);
    const m = copia(MAN); delete m.paradas;
    const filas: string[] = [];
    creaVisita({ man: m, THREE: null, documento: null, PanelVR: { filas: (_p, f) => { filas.push(f.id); return () => {}; } }, escena: { add() {}, remove() {} }, pose: { lee: () => ({ x: 0, y: 0, ang: 0 }), pon() {} }, vr: () => true, existe: () => true }).monta();
    expect(filas).toEqual([]);
  });
  it("fuera de VR no abre el panel", () => {
    const b = banco(false); b.v.monta();
    expect(b.abiertos()).toBe(0);
  });
});

describe("la visita guiada en el recorrido y en la visita (vaA, lectura automática, «Llevar al grupo»)", () => {
  const P = MAN.paradas!;
  it("Recorrido.vaA: abre k desde fuera (también en la oferta), cierra la que hubiera y la siguiente es la de después; k que no existe, null", () => {
    const r = V.creaRecorrido(P);
    expect(r.vaA(1)).toMatchObject({ abre: 1, cierra: undefined });
    expect(r.modo()).toBe("visita"); expect(r.abierta()).toBe(1); expect(r.sig()).toBe(2); expect(r.vista(1)).toBe(true);
    expect(r.vaA(0)).toMatchObject({ abre: 0, cierra: 1 });
    expect(r.vaA(9)).toBeNull(); expect(r.vaA(-1)).toBeNull(); expect(r.vaA(0.5)).toBeNull();
    // desarmada hasta alejarse: quedarse en ella no la reabre ni la cierra
    expect(r.paso(P[0]!.pos[0], -P[0]!.pos[2])).toBeNull(); expect(r.abierta()).toBe(0);
  });
  function conGuiada(guia: boolean) {
    const filas: Record<string, any> = {}, pedidas: unknown[] = [], pp: Pose2 = { x: 0, y: 1.5, ang: 0 };
    let leidas = 0;
    const synth = { speaking: false, getVoices: () => [{ lang: "es-ES", name: "x", localService: true }], speak: () => { leidas++; }, cancel() {}, addEventListener() {}, removeEventListener() {} };
    const guiada = { enGuiada: () => true, soyGuia: () => guia, estado: () => null, pendiente: () => null, identidad: () => "x", pide: (c: unknown) => { pedidas.push(c); return true; } };
    const v = creaVisita({
      man: copia(MAN), THREE: null, documento: null, PanelVR: { filas: (_p: string, f: any) => { filas[f.id] = f; return () => { delete filas[f.id]; }; } }, abrePanel() {},
      escena: { add() {}, remove() {} }, pose: { lee: () => pp, pon: p => { Object.assign(pp, p); } }, vr: () => true, existe: () => false,
      voz: { synth, Utterance: function (this: any, t: string) { this.text = t; } }, mundo: "fabrica", guiada,
    });
    const botones = (id: string) => { const B: any[] = []; if (filas[id]) filas[id].botones((bid: string, _x: number, _y: number, _w: number, _h: number, txt: string, fn: () => void) => B.push({ id: bid, txt, fn }), 0); return B; };
    return { v, filas, pedidas, botones, leidas: () => leidas };
  }
  it("vaA abre la ficha; en la guiada no hay lectura automática (el botón de leer sigue)", () => {
    const b = conGuiada(false); b.v.monta();
    expect(b.v.vaA(1)).toBe(true);
    expect(b.v.estado()).toMatchObject({ modo: "visita", abierta: 1, impuestas: 1 });
    const ids = b.botones("visita-voz").map(q => q.id);
    expect(ids).toContain("vis-voz"); expect(ids).not.toContain("vis-voz-auto");
    expect(b.leidas()).toBe(0);
    expect(b.filas["visita-guia"].visible()).toBe(false);   // la familia no lleva al grupo
  });
  it("el guía en VR: «Llevar al grupo a la parada N» (la de la ficha o la siguiente), que pide el mundo y la parada", () => {
    const b = conGuiada(true); b.v.monta();
    expect(b.filas["visita-guia"].visible()).toBe(true);
    expect(b.botones("visita-guia").map(q => q.txt)).toEqual(["Llevar al grupo a la parada 1"]);
    b.v.vaA(1);
    const q = b.botones("visita-guia")[0]; expect(q.txt).toBe("Llevar al grupo a la parada 2"); q.fn();
    expect(b.pedidas).toEqual([{ mundo: "fabrica", parada: 1 }]);
    b.v.accion("lleva:2"); b.v.accion("lleva:7");
    expect(b.pedidas).toEqual([{ mundo: "fabrica", parada: 1 }, { mundo: "fabrica", parada: 2 }]);
  });
});
