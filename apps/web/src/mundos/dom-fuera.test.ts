// Guardián «el DOM del exterior se va con él» (A3-8b; COMPONENTES §3.2; MUNDOS §8). Con el gestor de mundos de verdad (nucleo/mundos.ts), el registro de componentes de
// verdad (con un Bus como el de 02c, cableados como en 90_final.js: avisa → «mundo:entra/sale») y los dobles de DOM (nucleo/prueba-dom.ts): los manifiestos de verdad de los
// componentes del exterior que tienen DOM (sus «dom»; su monta y su libera, dobles) y una página con los nodos que nombran. Tras gm.cambia("vacio"), ningún nodo de un
// componente del exterior queda a la vista (todos llevan data-fuera-de-mundo, que la plantilla esconde con display: none !important); los de todo mundo, sí. Al volver, cada
// nodo está como estaba: lo que el usuario había cerrado (hidden) sigue cerrado, lo que la vista de familia escondía (display: none) sigue escondido, y nadie más lleva la marca.
// HONESTIDAD: los dobles no son un navegador (ni CSS ni maquetación): que la regla de plantilla.css esconda de verdad lo marcado lo comprueba pruebas/guardianes/componentes.test.js leyendo la regla; cómo se ve, el banco.
import { afterEach, describe, expect, it } from "vitest";
import { ATRIBUTO_FUERA, creaComponentes } from "../nucleo/componentes.ts";
import type { BusComponentes, Manifiesto, RaizDom } from "../nucleo/componentes.ts";
import { creaCola } from "../nucleo/cola.ts";
import { creaWorldManager } from "../nucleo/mundos.ts";
import { creaMundo, type Mundo } from "../nucleo/prueba-dom.ts";
import { creaExterior } from "./exterior.ts";
import { creaVacio } from "./vacio.ts";
import { manifiestoParcelas } from "./exterior/parcelas.ts";
import { manifiestoHistoria } from "./exterior/historia.ts";
import { manifiestoMundoHoy } from "./exterior/mundo-hoy.ts";
import { manifiestoVistaFamilia } from "./exterior/vista-familia.ts";
import { manifiestoFichasTiempo } from "./exterior/fichas-tiempo.ts";
import { manifiestoPersonalizacion } from "./exterior/personalizacion.ts";
import { manifiestoCapaNdvi } from "./exterior/capa-ndvi.ts";
import { manifiestoPaisaje } from "./exterior/paisaje.ts";
import { manifiestoHierba } from "./exterior/hierba.ts";
import { manifiestoMarcadoresLidar } from "./exterior/marcadores-lidar.ts";
import { manifiestoAvesMes } from "./exterior/aves-mes.ts";
import { manifiestoJuegos } from "./exterior/juegos.ts";
import { manifiestoBalizas } from "./exterior/balizas.ts";
import { manifiestoEscena3D } from "./exterior/escena-tiles.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

function bus(): BusComponentes {
  const oy: Record<string, ((d?: unknown) => void)[]> = {};
  return {
    on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { const l = (oy[ev] || []).slice(); for (const f of l) f(d); return l.length; },
  };
}
const nada = { libera() { /* doble */ } };
/** los manifiestos de verdad (su id, sus mundos y su «dom»), con monta y libera de mentira: aquí solo importa qué DOM nombran */
function deVerdad(): Manifiesto[] {
  const d = {} as A;
  return [manifiestoParcelas(nada), manifiestoHistoria(nada), manifiestoMundoHoy({ D: {}, $: () => null } as A), manifiestoVistaFamilia({ D: {} }), manifiestoFichasTiempo(d),
    manifiestoPersonalizacion(d), manifiestoCapaNdvi(() => d), manifiestoPaisaje(d), manifiestoHierba(d), manifiestoMarcadoresLidar(d), manifiestoAvesMes(d), manifiestoJuegos(d),
    manifiestoBalizas(d), manifiestoEscena3D(d)]
    .map(x => ({ ...x, consume: [], expone: [], fases: {}, actualiza: {}, monta: () => ({}), libera: () => { /* doble */ } }));
}
/** un componente de todo mundo con su DOM (el HUD, la agenda…): no se esconde nunca */
const deTodos: Manifiesto = { id: "de-todos", consume: [], expone: [], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 }, mundos: "todos",
  dom: ["#hudBarra"], monta: () => ({}), libera: () => { /* doble */ } };

/** la página: un nodo por cada raíz que nombran los manifiestos (con su ancestro si la raíz «sube») y el HUD de todo mundo */
function pagina(mundo: Mundo, defs: Manifiesto[]) {
  const body = mundo.documento.body, nodos: A[] = [];
  const barra = mundo.el("nav", "hudBarra"); body.appendChild(barra);
  const crea = (r: RaizDom): A => {
    const sel = typeof r === "string" ? r : r.sel, sube = typeof r === "string" ? "" : r.sube;
    const id = /^#([\w-]+)$/.exec(sel), abre = /^\[data-abre="([\w-]+)"\]$/.exec(sel);
    let el: A;
    if (id) el = mundo.el(sube ? "input" : "div", id[1]);
    else if (abre) { el = mundo.el("button"); el.setAttribute("data-abre", abre[1]); }
    else throw new Error("selector que la prueba no sabe crear: " + sel);
    if (!sube) { (abre ? barra : body).appendChild(el); return el; }
    const padre = sube.startsWith(".") ? mundo.el("div") : mundo.el(sube);
    if (sube.startsWith(".")) padre.className = sube.slice(1);
    padre.appendChild(el); body.appendChild(padre); return padre;   // lo que se esconde de verdad es el ancestro
  };
  for (const d of defs) for (const r of d.dom || []) { const sel = typeof r === "string" ? r : r.sel; if (!mundo.documento.querySelector(sel)) nodos.push(crea(r)); }
  return { barra, nodos };
}
/** ¿a la vista? Ni él ni ningún ancestro llevan hidden, display: none ni la marca de fuera de su mundo */
function aLaVista(el: A): boolean {
  for (let p = el; p && p.tagName; p = p.parentNode) if (p.hidden || (p.style && p.style.display === "none") || p.hasAttribute(ATRIBUTO_FUERA)) return false;
  return true;
}
const foto = (l: A[]) => l.map(e => ({ hidden: e.hidden, display: e.style.display, marca: e.hasAttribute(ATRIBUTO_FUERA) }));

function banco() {
  m = creaMundo();
  const defs = deVerdad(), p = pagina(m, defs), B = bus();
  const C = creaComponentes({ bus: B, ahora: () => 0, documento: m.documento });
  for (const d of defs.concat([deTodos])) expect(C.registra(d), d.id).toBe(true);
  const pose = { lee: () => ({ x: 0, y: 0, ang: 0 }), pon: () => { /* doble */ } };
  const gm = creaWorldManager({
    fundido: { cierra: () => Promise.resolve(), abre: () => Promise.resolve() }, cola: creaCola({ ahora: () => 0 }), temporizador: () => () => { /* sin reloj */ },
    avisa: (ev, d) => { B.emite(ev, d); },
    contexto: base => { base.limpia(() => { C.liberaMundo(base.id); }); return base; },
  });
  gm.registra(() => Promise.resolve(creaExterior({ recorre: () => { /* sin pasos */ }, pasos: [], pose })), "exterior");
  gm.registra(() => Promise.resolve(creaVacio({ pose })), "vacio");
  return { C, gm, defs, ...p };
}

describe("el DOM de los componentes del exterior fuera de su mundo (A3-8b)", () => {
  it("cada componente del exterior con DOM lo nombra y valida; ninguno de todo mundo (MU5-n) se esconde", () => {
    const { C, defs } = banco();
    C.arranca();
    for (const d of defs) { expect(d.mundos, d.id).toEqual(["exterior"]); expect((d.dom || []).length, d.id).toBeGreaterThan(0); }
    expect(defs.map(d => d.id)).toEqual(expect.arrayContaining(["selector-parcelas", "historia-recorrido", "mundo-hoy", "vista-familia", "personalizacion"]));
    expect(C.domOculto()).toBe(0);   // en el exterior, nada escondido: sin cambio visible mientras nadie cambie de mundo
  });

  it("en ?mundo=vacio ningún nodo del exterior queda a la vista; al volver, cada uno como estaba (lo cerrado, cerrado)", async () => {
    const b = banco();
    b.C.arranca();
    expect((await b.gm.arranca("exterior")).ok).toBe(true);
    expect(b.nodos.length).toBeGreaterThan(20);
    // lo que el usuario y los componentes dejaron antes de salir: una ventana cerrada (hidden), un control escondido por la vista de familia (display: none) y otra abierta
    const mapa = m!.documento.getElementById("ventanaMapa"), historia = m!.documento.getElementById("ventanaHistoria"), modo = m!.documento.getElementById("tModo");
    mapa.hidden = true; modo.style.display = "none"; historia.hidden = false;
    const antes = foto(b.nodos);
    expect(b.nodos.filter(aLaVista).length).toBeGreaterThan(10);
    expect(aLaVista(b.barra)).toBe(true);

    expect((await b.gm.cambia("vacio", { x: 0, y: 0, ang: 0 })).ok).toBe(true);
    expect(b.C.mundo()).toBe("vacio");
    expect(b.nodos.filter(aLaVista)).toEqual([]);   // ni un nodo del exterior a la vista
    for (const n of b.nodos) expect(n.hasAttribute(ATRIBUTO_FUERA)).toBe(true);
    expect(aLaVista(b.barra)).toBe(true);           // lo de todo mundo, sí
    expect(mapa.hidden).toBe(true); expect(historia.hidden).toBe(false); expect(modo.style.display).toBe("none");   // esconder no toca lo del componente
    expect(b.C.domOculto()).toBe(b.nodos.length);

    expect((await b.gm.cambia("exterior")).ok).toBe(true);
    expect(foto(b.nodos)).toEqual(antes);           // como estaba: la ventana cerrada sigue cerrada, la abierta vuelve abierta
    expect(b.C.domOculto()).toBe(0);
    expect(aLaVista(historia)).toBe(true); expect(aLaVista(mapa)).toBe(false);
  });

  it("lo que el componente crea estando fuera de su mundo (n.dom) se esconde ya, y libera() quita la marca de lo que deja en la página", () => {
    m = creaMundo();
    const B = bus(), C = creaComponentes({ bus: B, ahora: () => 0, documento: m.documento });
    const fijo = m.el("div", "fijo"); m.documento.body.appendChild(fijo);
    let crea: ((id: string) => A) | null = null;
    C.registra({ id: "con-dom", consume: [], expone: [], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 }, mundos: ["exterior"], dom: ["#fijo"],
      monta: n => { crea = id => n.dom!(m!.el("div", id)); return {}; }, libera: () => { /* doble */ } });
    C.arranca();
    const a = (crea as unknown as (id: string) => A)("a");
    expect(a.hasAttribute(ATRIBUTO_FUERA)).toBe(false);
    B.emite("mundo:sale", { id: "exterior" }); B.emite("mundo:entra", { id: "vacio" });
    expect(fijo.hasAttribute(ATRIBUTO_FUERA)).toBe(true); expect(a.hasAttribute(ATRIBUTO_FUERA)).toBe(true);
    const b2 = (crea as unknown as (id: string) => A)("b");
    expect(b2.hasAttribute(ATRIBUTO_FUERA)).toBe(true);   // creado en el vacío: escondido desde ya
    expect(C.libera("con-dom")).toBe(true);
    expect([fijo, a, b2].map(e => e.hasAttribute(ATRIBUTO_FUERA))).toEqual([false, false, false]);
    expect(C.domOculto()).toBe(0);
  });

  it("un nodo que nombran dos componentes se esconde mientras uno de ellos lo tenga escondido; «dom» mal formado no valida", () => {
    m = creaMundo();
    const B = bus(), C = creaComponentes({ bus: B, ahora: () => 0, documento: m.documento });
    const comun = m.el("label"), casilla = m.el("input", "cX"); comun.appendChild(casilla); m.documento.body.appendChild(comun);
    const def = (id: string, mundos: Manifiesto["mundos"]): Manifiesto => ({ id, consume: [], expone: [], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
      mundos, dom: [{ sel: "#cX", sube: "label" }], monta: () => ({}), libera: () => { /* doble */ } });
    C.registra(def("uno", ["exterior"])); C.registra(def("otro", ["exterior", "molino"])); C.arranca();
    B.emite("mundo:sale", { id: "exterior" }); B.emite("mundo:entra", { id: "vacio" });
    expect(comun.hasAttribute(ATRIBUTO_FUERA)).toBe(true); expect(casilla.hasAttribute(ATRIBUTO_FUERA)).toBe(false);   // se esconde el ancestro (sube)
    C.libera("uno"); expect(comun.hasAttribute(ATRIBUTO_FUERA)).toBe(true);    // «otro» lo sigue teniendo escondido
    B.emite("mundo:sale", { id: "vacio" }); B.emite("mundo:entra", { id: "molino" });
    expect(comun.hasAttribute(ATRIBUTO_FUERA)).toBe(false);                     // en el molino, «otro» está en su mundo
    const malo = { ...def("malo", ["exterior"]), dom: [{ sel: "#cX" }] } as unknown as Manifiesto;
    expect(C.registra(malo)).toBe(false);
  });
});
