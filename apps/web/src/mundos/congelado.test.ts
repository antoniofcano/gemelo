// Guardián «exterior congelado» (MUNDOS §8; MU2-6). Con dobles del legado (pasos que apuntan su nombre, raíces y HUD de mentira, la pose de 12_paseo) y
// el núcleo de verdad (el Bucle, la Cola con su ColaDeMundo «exterior», el gestor y el registro de Componentes con un Bus como el de 02c), cableados como
// en 90_final.js: tras gm.cambia("vacio") el exterior queda «listo» (cargado y congelado), sin trabajos «exterior:» en la Cola, sin carga de teselas ni
// Escena3D en el fotograma, con sus componentes parados y sus raíces ocultas; al volver, todo se reanuda donde estaba y la pose es la de antes.
// HONESTIDAD: prueba la maquinaria con dobles. Que el motor de verdad se vea igual, y que en el aparato no se pidan teselas, lo mira el banco (MU2-8), no aquí.
import { describe, expect, it } from "vitest";
import { creaBucle } from "../nucleo/bucle.ts";
import type { PasoBucle } from "../nucleo/bucle.ts";
import { creaCola, creaColaDeMundo } from "../nucleo/cola.ts";
import type { Trabajo } from "../nucleo/cola.ts";
import { creaComponentes } from "../nucleo/componentes.ts";
import type { BusComponentes, Manifiesto } from "../nucleo/componentes.ts";
import { aplicaAmbiente } from "../nucleo/ambiente.ts";
import { creaWorldManager } from "../nucleo/mundos.ts";
import type { Pose2 } from "../nucleo/mundos.ts";
import { creaExterior } from "./exterior.ts";
import { creaVacio } from "./vacio.ts";

function bus(): BusComponentes {
  const oy: Record<string, ((d?: unknown) => void)[]> = {};
  return {
    on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { const l = (oy[ev] || []).slice(); for (const f of l) f(d); return l.length; },
  };
}
const manifiesto = (id: string, fases: Manifiesto["actualiza"], extra: Partial<Manifiesto> = {}): Manifiesto => ({
  id, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  fases: Object.fromEntries(Object.keys(fases || {}).map(f => [f, 0])), actualiza: fases, monta: () => ({}), libera: () => {}, ...extra,   // fases: cada fotograma
});
/** un trabajo que tarda `n` rebanadas y apunta cuántas lleva */
function* trabajo(hecho: { n: number }, n: number): Trabajo { for (let i = 0; i < n; i++) { hecho.n++; yield; } return hecho.n; }

/** El cableado de 90_final.js con dobles. El fotograma: cámara → gm.actualiza (exterior: tiempo, nube, árboles, carga) → componentes «mundo» y «tarde» →
 *  láminas → Cola → gm.antesDelRender (exterior: Escena3D) → render. */
function banco() {
  let t = 0;
  let rel = 0;   // el reloj de la Cola avanza 1 ms cada vez que se lee: con corre(4), unas pocas rebanadas por fotograma
  const traza: string[] = [], cola = creaCola({ ahora: () => (rel += 1) }), colaExt = creaColaDeMundo(cola, "exterior");
  const B = bus(), C = creaComponentes({ bus: B, ahora: () => 0 });
  C.registra(manifiesto("del-exterior", { mundo: () => { traza.push("c-ext:mundo"); }, tarde: () => { traza.push("c-ext:tarde"); } }));
  C.registra(manifiesto("de-todos", { mundo: () => { traza.push("c-todos:mundo"); } }, { mundos: ["exterior", "vacio"] }));
  const pp = { x: 120, y: -40, ang: 0.7, paso: 3 };
  const pose = { lee: (): Pose2 => pp, pon: (p: Pose2) => { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } };
  // raíces: la de los olivos (visible), la de la nube (apagada por el usuario: tiene que seguir apagada al volver) y la persona (de todo mundo: no se toca)
  const olivos = { visible: true }, nube = { visible: false }, persona = { visible: true }, escena = [olivos, nube, persona];
  const brujula = { style: { visibility: "" } }, ficha = { style: { visibility: "visible" } };
  const paso = (n: string, extra: Partial<PasoBucle> = {}): PasoBucle => ({ bloque: null, fn: () => { traza.push(n); }, ...extra });
  let Bucle: ReturnType<typeof creaBucle> | null = null;
  const exterior = creaExterior({
    recorre: (p, dt, tt) => { (Bucle as ReturnType<typeof creaBucle>).recorre(p, dt, tt); },
    pasos: [paso("tiempo"), paso("nube"), paso("árboles"), paso("carga", { caro: true })],
    antesDelRender: [paso("Escena3D", { caro: true })],
    cola: colaExt, pose, raices: () => escena.filter(o => o !== persona), hud: () => [brujula, ficha],
  });
  const fundido = { cierra: () => Promise.resolve(), abre: () => Promise.resolve() };
  const gm = creaWorldManager({
    fundido, cola, temporizador: () => () => {},
    avisa: (ev, d) => { B.emite(ev, d); },
    contexto: base => { base.limpia(() => { C.liberaMundo(base.id); }); return base; },
  });
  gm.registra(() => Promise.resolve(exterior), "exterior");
  gm.registra(() => Promise.resolve(creaVacio({ pose })), "vacio");
  Bucle = creaBucle({
    ahora: () => t, pideCuadro: () => {},
    pasos: [
      paso("cámara"), { bloque: null, fn: gm.actualiza },
      { bloque: null, fn: (dt, tt) => { C.actualiza("mundo", dt, tt); C.actualiza("tarde", dt, tt); } }, paso("láminas"),
      { bloque: null, caro: true, fn: () => { traza.push("Cola"); cola.corre(4); } }, { bloque: null, fn: gm.antesDelRender },
      { render: true, fn: () => { traza.push("render"); } },
    ],
  });
  const fotograma = (): string[] => { traza.length = 0; t += 16; (Bucle as ReturnType<typeof creaBucle>).cuadro(t); return traza.slice(); };
  return { gm, C, cola, colaExt, exterior, pp, olivos, nube, persona, brujula, ficha, fotograma };
}

describe("el exterior congelado (MU2-6)", () => {
  it("antes de cambiar, el fotograma va en el orden nuevo: el exterior, lo de todo mundo, la Cola, Escena3D y el render", async () => {
    const b = banco();
    b.C.arranca();   // como 90_final: Componentes.arranca() y luego gm.arranca("exterior")
    expect((await b.gm.arranca("exterior")).ok).toBe(true);
    expect(b.fotograma()).toEqual(["cámara", "tiempo", "nube", "árboles", "carga", "c-ext:mundo", "c-todos:mundo", "c-ext:tarde", "láminas", "Cola", "Escena3D", "render"]);
  });

  it("tras gm.cambia(\"vacio\"): «listo», sin trabajos exterior: en la Cola, sin carga ni Escena3D, sus componentes parados, raíces y HUD ocultos", async () => {
    const b = banco();
    b.C.arranca(); await b.gm.arranca("exterior");
    const hecho = { n: 0 };
    b.colaExt.pon("N7", 5, trabajo(hecho, 10));          // la nube de una tesela, a medias
    b.cola.add("vnivel", 5, trabajo({ n: 0 }, 100));     // uno de todo mundo (el nivel de VR), sin dueño
    b.fotograma(); b.fotograma();
    expect(hecho.n).toBeGreaterThan(0);
    const antes = hecho.n, pose = { x: b.pp.x, y: b.pp.y, ang: b.pp.ang };

    const r = await b.gm.cambia("vacio", { x: 3, y: -2, ang: 0 });
    expect(r.ok).toBe(true);
    expect(b.gm.actual).toBe("vacio");
    expect(b.gm.fichaDe("exterior")).toBe("listo");
    expect(b.cola.pendientesDe("exterior")).toBe(0);
    expect(b.cola.hay("exterior:N7")).toBe(false);
    expect(b.colaExt.aparcados()).toBe(1);
    expect(b.cola.hay("vnivel")).toBe(true);             // lo de todo mundo sigue en la Cola
    expect(b.olivos.visible).toBe(false); expect(b.nube.visible).toBe(false); expect(b.persona.visible).toBe(true);
    expect(b.brujula.style.visibility).toBe("hidden"); expect(b.ficha.style.visibility).toBe("hidden");
    expect(b.C.mundo()).toBe("vacio");
    expect({ x: b.pp.x, y: b.pp.y }).toEqual({ x: 3, y: -2 });   // el vacío pone a quien mira en su llegada

    // lo que pida el exterior mientras está congelado (una tesela que llega por la red) tampoco entra en la Cola
    expect(b.colaExt.pon("R9", 1, trabajo({ n: 0 }, 1))).toBe(true);
    expect(b.cola.pendientesDe("exterior")).toBe(0);
    for (let i = 0; i < 5; i++) {
      const f = b.fotograma();
      expect(f).toEqual(["cámara", "c-todos:mundo", "láminas", "Cola", "render"]);   // ni tiempo, ni carga, ni Escena3D; solo los componentes del vacío
    }
    expect(hecho.n).toBe(antes);                         // el trabajo del exterior no ha avanzado

    const v = await b.gm.cambia("exterior");
    expect(v.ok).toBe(true);
    expect(b.gm.fichaDe("vacio")).toBe("listo");
    expect({ x: b.pp.x, y: b.pp.y, ang: b.pp.ang }).toEqual(pose);   // la pose de antes (sale() del exterior → entra() con su retorno)
    expect(b.olivos.visible).toBe(true); expect(b.nube.visible).toBe(false); expect(b.persona.visible).toBe(true);   // la nube, apagada como estaba
    expect(b.brujula.style.visibility).toBe(""); expect(b.ficha.style.visibility).toBe("visible");
    expect(b.colaExt.aparcados()).toBe(0);
    expect(b.cola.pendientesDe("exterior")).toBe(2);      // N7 a medias y R9
    expect(b.fotograma()).toEqual(["cámara", "tiempo", "nube", "árboles", "carga", "c-ext:mundo", "c-todos:mundo", "c-ext:tarde", "láminas", "Cola", "Escena3D", "render"]);
    b.cola.cancela("vnivel");                             // (para que la Cola no reparta con él y se vea avanzar al de la nube)
    for (let i = 0; i < 4; i++) b.fotograma();
    expect(hecho.n).toBeGreaterThan(antes);              // y sigue donde iba, no desde el principio
    expect(hecho.n).toBeLessThanOrEqual(10);
  });

  it("MU2-7: exterior → vacío → exterior con el Ambiente de verdad (nucleo/ambiente.ts) deja la escena como estaba", async () => {
    // una scene de mentira con la forma de la de three: hijos, add/remove (que fijan parent), fondo y niebla
    type Nodo = { nombre: string; visible: boolean; parent?: unknown; dispose?(): void };
    const children: Nodo[] = [];
    const scene = {
      children, background: null as unknown, fog: null as unknown,
      add(o: Nodo) { if (children.indexOf(o) < 0) children.push(o); o.parent = scene; },
      remove(o: Nodo) { const i = children.indexOf(o); if (i >= 0) children.splice(i, 1); o.parent = null; },
    };
    class Color { hex: number; constructor(h: number) { this.hex = h; } setHex(h: number) { this.hex = h; return this; } }
    const camara = { near: 0.1, far: 2000, updateProjectionMatrix() {} }, estado = { exag: 1 }, deslizador = { value: "2" };
    const hemi: Nodo = { nombre: "hemi", visible: true }, sol: Nodo = { nombre: "sol", visible: true }, olivos: Nodo = { nombre: "olivos", visible: true }, persona: Nodo = { nombre: "persona", visible: true };
    scene.add(olivos); scene.add(persona);
    const pp = { x: 50, y: 60, ang: 0 }, pose = { lee: (): Pose2 => pp, pon: (p: Pose2) => { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } };
    const exterior = creaExterior({
      pasos: [], recorre: () => {}, pose, raices: () => children.filter(o => o !== persona),
      ambiente: { fondo: () => 0x9ec5e8, niebla: { cerca: 600, lejos: 4000 }, luces: [hemi, sol], extension: 1500, nearVr: () => 0.1, exag: () => Number(deslizador.value) },
    });
    let creadas = 0;
    const vacio = creaVacio({ pose, luz: (tipo, color, k) => { creadas++; return { nombre: tipo + ":" + color.toString(16) + ":" + k.toFixed(2), visible: true, dispose() {} } as Nodo; } });
    const cola = creaCola({ ahora: () => 0 });
    const gm = creaWorldManager({
      fundido: { cierra: () => Promise.resolve(), abre: () => Promise.resolve() }, cola, temporizador: () => () => {},
      aplicaAmbiente: a => { aplicaAmbiente(a, { scene, camara, estado, renderer: { xr: { isPresenting: false } }, color: h => new Color(h), niebla: (h, c, l) => ({ color: new Color(h), near: c, far: l }) }); },
    });
    gm.registra(() => Promise.resolve(exterior), "exterior");
    gm.registra(() => Promise.resolve(vacio), "vacio");
    const foto = () => ({
      hijos: children.map(o => o.nombre + (o.visible ? "" : "(oculto)")), fondo: (scene.background as Color | null)?.hex ?? null,
      niebla: scene.fog ? [(scene.fog as { color: Color }).color.hex, (scene.fog as { near: number }).near, (scene.fog as { far: number }).far] : null,
      camara: [camara.near, camara.far], exag: estado.exag,
    });

    await gm.arranca("exterior");   // lo que hacía 03_escena al montarse: el hemisferio y el sol colgados, fondo y niebla de --sky, near 0,5 y far max(5000, 4·EXT)
    const antes = foto();
    expect(antes).toEqual({ hijos: ["olivos", "persona", "hemi", "sol"], fondo: 0x9ec5e8, niebla: [0x9ec5e8, 600, 4000], camara: [0.5, 6000], exag: 2 });

    await gm.cambia("vacio");
    expect(foto()).toEqual({ hijos: ["olivos(oculto)", "persona", "ambiental:ffffff:2.51", "direccional:ffffff:3.77"], fondo: 0x8a8a8a, niebla: null, camara: [0.05, 80], exag: 1 });
    expect(hemi.parent).toBeNull(); expect(sol.parent).toBeNull();

    await gm.cambia("exterior");
    expect(foto()).toEqual(antes);
    expect(hemi.visible && sol.visible).toBe(true);
    await gm.cambia("vacio"); await gm.cambia("exterior");
    expect(foto()).toEqual(antes);
    expect(creadas).toBe(2);   // las luces del vacío se crean una vez, no en cada visita
  });

  it("libera() del exterior no lanza (TODO de MU5) y congelar dos veces no pierde cómo estaban las raíces", () => {
    const b = banco();
    b.exterior.congela(); b.exterior.congela();
    expect(b.olivos.visible).toBe(false);
    b.exterior.entra(null, null);
    expect(b.olivos.visible).toBe(true); expect(b.nube.visible).toBe(false);
    expect(() => { b.exterior.libera(); b.exterior.libera(); }).not.toThrow();
  });
});
