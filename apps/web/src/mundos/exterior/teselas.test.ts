// El Mundo del exterior (MU5-n, A3-1a; antes 02_mundo.js): L1-05 (la tesela se decodifica en la Cola del exterior, a rebanadas, y sus oyentes también) y
// L2-03 (las teselas fuera de rango se sueltan; libera() lo suelta todo). Con la Cola de verdad (nucleo/cola.ts), un fetch de mentira y una tesela de 4 m.
// HONESTIDAD: el coste real por tesela (ms de JSON.parse y de los oyentes) y la memoria que se recupera en Hituelo solo los da el banco; aquí, el orden y el estado.
import { describe, expect, it } from "vitest";
import { creaCola, creaColaDeMundo } from "../../nucleo/cola.ts";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMundo, RADIO_SUELTA } from "./teselas.ts";
import type { DepsMundo, ImagenMin, RespuestaMin, Tesela } from "./teselas.ts";

const b64 = (s: string): Uint8Array => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };   // el de 01_datos
const i16 = (s: string): Int16Array => { const u = b64(s); return new Int16Array(u.buffer.slice(u.byteOffset, u.byteOffset + (u.length & ~1))); };
const aB64 = (a: ArrayBufferView): string => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i] as number); return btoa(s); };

const TS = 4;   // teselas de 4 m con RES 1: relieve de 6 × 6 (con margen), suelo a 2 m: 4 × 4 × 3
function jsonTesela(cota: number): string {
  const dtm = new Int16Array(36).fill(cota * 100), chm = new Uint8Array(16).fill(25), suelo = new Uint8Array(48).fill(128), pts = new Int16Array([100, 100, 500, 200, 200, 600]);
  return JSON.stringify({ dtm: aB64(dtm), chm: aB64(chm), suelo: aB64(suelo), pts: aB64(pts), np: 2 });
}
/** un mundo de n teselas en fila (x = 0, 4, 8…), con un fetch que se resuelve a mano (pendientes) y una Cola del exterior si se pide */
function monta(o: { n?: number; conCola?: boolean; rejilla?: Array<[number, number]>; exag?: () => number } = {}) {
  const n = o.n || 2, teselas: Record<string, { kx: number; ky: number; v: number[]; np: number }> = {};
  for (let i = 0; i < n; i++) teselas["k" + i] = { kx: i, ky: 0, v: [i * TS, 0, (i + 1) * TS, TS], np: 2 };
  if (o.rejilla) { for (const k of Object.keys(teselas)) delete teselas[k]; o.rejilla.forEach(([kx, ky]) => { teselas["k" + kx + "_" + ky] = { kx, ky, v: [kx * TS, ky * TS, (kx + 1) * TS, (ky + 1) * TS], np: 2 }; }); }
  let reloj = 0;
  const pendientes: Array<{ url: string; resuelve: (r: RespuestaMin) => void }> = [], imagenes: ImagenMin[] = [], lienzos: unknown[] = [];
  let tic = 0;   // el reloj de la Cola avanza 1 ms en cada lectura: corre(1.5) hace exactamente una rebanada
  const cola = creaCola({ ahora: () => ++tic }), colaExt = creaColaDeMundo(cola, "exterior");
  const deps: DepsMundo = {
    D: { ts: TS, srs: 2, centro_utm: [0, 0], teselas, grueso: { b64: aB64(new Int16Array(4).fill(700)), x0: 0, yN: 8, res: 8, w: 2, h: 2 }, mosaico: { jpg: "m.jpg", x0: 0, yN: TS, res: 1, w: 1, h: 1 } },
    RES: 1, b64, i16, busqueda: "", ortoMaxDefecto: () => 20, ahora: () => reloj,
    lienzo: () => { const l = { width: 2, height: 2, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16) }) }) }; lienzos.push(l); return l; },
    imagen: () => { const im: ImagenMin = { onload: null, onerror: null, src: "", complete: true, naturalWidth: 2, width: 2, height: 2 }; imagenes.push(im); return im; },
    trae: (url) => new Promise<RespuestaMin>((resuelve) => { pendientes.push({ url, resuelve }); }),
    cola: o.conCola === false ? null : () => colaExt, consola: { error() {} }, ...(o.exag ? { exag: o.exag } : {})
  };
  const M = creaMundo(deps);
  /** responde a la petición i con la tesela de cota z (o con un 404) y deja que corran las promesas */
  async function responde(i: number, z: number | null): Promise<void> {
    const p = pendientes[i] as { resuelve: (r: RespuestaMin) => void };
    p.resuelve(z === null ? { ok: false, status: 404, text: () => Promise.resolve("") } : { ok: true, status: 200, text: () => Promise.resolve(jsonTesela(z)) });
    for (let k = 0; k < 5; k++) await Promise.resolve();
  }
  const imagenesListas = (): void => { for (const im of imagenes.splice(0)) if (im.onload) im.onload(); };
  return { M, cola, colaExt, pendientes, responde, imagenesListas, lienzos, avanza: (ms: number) => { reloj += ms; } };
}

describe("L1-05: la tesela se decodifica en la Cola del exterior, a rebanadas", () => {
  it("al llegar el json no se decodifica nada fuera de la Cola; Cola.corre lo hace en varias rebanadas («M») y los oyentes van después, también en la Cola («MA»)", async () => {
    const { M, cola, colaExt, responde, imagenesListas } = monta();
    const avisos: string[] = []; M.alCargar((t: Tesela) => { avisos.push("a:" + t.key); }); M.alCargar((t: Tesela) => { avisos.push("b:" + t.key); });
    M.actualiza(2, 50, -2);
    const t = M.lista[0] as Tesela;
    expect(t.estado).toBe(1);
    await responde(0, 7);
    expect(t.dtm).toBeNull(); expect(t.estado).toBe(1);   // el JSON.parse y la decodificación esperan a la Cola
    expect(colaExt.pendientes()).toBe(1);
    cola.corre(1.5);   // una sola rebanada
    expect(t.dtm).toBeNull();
    cola.corre(1e6);
    expect(t.estado).toBe(2); expect(t.dtm && t.dtm[0]).toBe(7); expect(M.suelo(2, 2)).toBeCloseTo(7);
    expect((cola.est["M"] as { n: number }).n).toBeGreaterThanOrEqual(4);   // parse, relieve, copa y suelo, puntos: al menos cuatro rebanadas
    expect(avisos).toEqual([]);   // los oyentes, tras la ortofoto
    imagenesListas();
    expect(avisos).toEqual([]); expect(colaExt.pendientes()).toBe(1);
    cola.corre(1.5); expect(avisos).toEqual(["a:k0"]);   // un oyente por rebanada
    cola.corre(1.5); expect(avisos).toEqual(["a:k0", "b:k0"]);
    expect(colaExt.pendientes()).toBe(0);
  });
  it("sin Cola (las pruebas que no la dan) se decodifica en el acto, como antes; una tesela que falla queda en estado 3", async () => {
    const { M, responde, imagenesListas } = monta({ conCola: false });
    const avisos: string[] = []; M.alCargar((t: Tesela) => { avisos.push(t.key); });
    M.actualiza(4, 50, -2);
    await responde(0, 3); await responde(1, null);
    const [a, b] = M.lista as [Tesela, Tesela];
    expect(a.estado).toBe(2); expect(a.pts && a.pts.length).toBe(6); expect(b.estado).toBe(3);
    imagenesListas(); expect(avisos).toEqual(["k0"]);
  });
  it("un json roto no rompe la Cola: la tesela queda en estado 3", async () => {
    const { M, cola, pendientes } = monta();
    M.actualiza(2, 50, -2);
    (pendientes[0] as { resuelve: (r: RespuestaMin) => void }).resuelve({ ok: true, status: 200, text: () => Promise.resolve("{roto") });
    for (let k = 0; k < 5; k++) await Promise.resolve();
    expect(() => cola.corre(1e6)).not.toThrow();
    expect((M.lista[0] as Tesela).estado).toBe(3);
  });
});

describe("L2-07: una ortofoto decodificada ocupa lo que cuenta ortoEstado (sin el lienzo guardado aparte)", () => {
  it("decodificar guarda los píxeles, no el lienzo; el lienzo se vacía; ortoEstado().mb suma solo los píxeles", async () => {
    const { M, cola, responde, imagenesListas, lienzos } = monta({ n: 1 });
    M.actualiza(2, 50, -2); await responde(0, 5); cola.corre(1e6); imagenesListas(); cola.corre(1e6);
    const t = M.lista[0] as Tesela;
    M.decodificaOrto(t);
    expect(t.ortPix).not.toBeNull(); expect(t.ortCv).toBeNull();
    const l = lienzos[lienzos.length - 1] as { width: number; height: number }; expect([l.width, l.height]).toEqual([0, 0]);
    expect(M.ortoEstado().vivas).toBe(1);
  });
});

describe("L7-12: sueloListo dice si la cota ya es la del relieve fino", () => {
  it("una tesela del índice sin cargar no está lista (suelo() es el grueso); cargada, sí; soltada, otra vez no; fuera del índice siempre lista", async () => {
    const { M, cola, responde, imagenesListas } = monta({ n: 1 });
    expect(M.sueloListo(2, 2)).toBe(false); expect(M.sueloListo(500, 500)).toBe(true);
    M.actualiza(2, 50, -2); await responde(0, 5);
    expect(M.sueloListo(2, 2)).toBe(false);   // el json llegó, pero se decodifica en la Cola
    cola.corre(1e6); imagenesListas(); cola.corre(1e6);
    expect(M.sueloListo(2, 2)).toBe(true); expect(M.suelo(2, 2)).toBeCloseTo(5);
    M.liberaOrtoLejos(RADIO_SUELTA + 100, 50, 0); M.liberaOrtoLejos(RADIO_SUELTA + 100, 50, 0);
    expect(M.sueloListo(2, 2)).toBe(false);
  });
});

describe("L2-03: el Mundo suelta las teselas fuera de rango", () => {
  it("una tesela cargada a más de RADIO_SUELTA m en dos pasadas seguidas pierde dtm, chm, suel, pts, la ortofoto y los bins; alSoltar avisa; vuelve a «sin pedir»", async () => {
    const { M, cola, responde, imagenesListas } = monta({ n: 1 });
    const sueltas: string[] = []; M.alSoltar((t: Tesela) => { sueltas.push(t.key); });
    M.actualiza(2, 50, -2); await responde(0, 5); cola.corre(1e6); imagenesListas(); cola.corre(1e6);
    const t = M.lista[0] as Tesela; t["bins"] = { x: [0] };
    M.decodificaOrto(t); expect(t.ortPix).not.toBeNull();
    const lejos = RADIO_SUELTA + 100;
    M.liberaOrtoLejos(lejos, 50, 0);
    expect(t.pts).not.toBeNull();   // la primera pasada solo la marca
    M.liberaOrtoLejos(lejos, 50, 0);
    expect(t.pts).toBeNull(); expect(t.dtm).toBeNull(); expect(t.chm).toBeNull(); expect(t.suel).toBeNull(); expect(t.ortImg).toBeNull(); expect(t.ortPix).toBeNull(); expect(t["bins"]).toBeNull();
    expect(t.estado).toBe(0); expect(sueltas).toEqual(["k0"]); expect(M.estadoTeselas().sueltas).toBe(1);
    expect(M.suelo(2, 2)).toBeCloseTo(7);   // lo que no está cargado sale del relieve grueso
    // al volver cerca, se pide otra vez
    M.actualiza(2, 50, -2); expect(t.estado).toBe(1);
  });
  it("si se acerca entre las dos pasadas no se suelta; las que vienen de camino no se tocan", async () => {
    const { M, cola, responde } = monta({ n: 2 });
    M.actualiza(2, 50, -2); await responde(0, 5); cola.corre(1e6);
    const [a, b] = M.lista as [Tesela, Tesela];
    expect(b.estado).toBe(1);
    M.sueltaLejos(RADIO_SUELTA + 100, 50, 0); M.sueltaLejos(2, 50, -2); M.sueltaLejos(RADIO_SUELTA + 100, 50, 0);
    expect(a.estado).toBe(2);
    M.sueltaLejos(RADIO_SUELTA + 100, 50, 0);
    expect(a.estado).toBe(0); expect(b.estado).toBe(1);
  });
  it("lo que llega de una petición anterior a soltar se tira (la generación de la tesela)", async () => {
    const { M, cola, responde } = monta({ n: 1 });
    M.actualiza(2, 50, -2);
    const t = M.lista[0] as Tesela;
    await responde(0, 5);
    M.sueltaTesela(t);   // mientras se decodifica en la Cola
    cola.corre(1e6);
    expect(t.dtm).toBeNull(); expect(t.estado).toBe(0);
  });
  it("libera() suelta todas las teselas y el mosaico; se puede llamar dos veces; el componente vuelve a pedir el mosaico al montarse", async () => {
    const { M, cola, responde, imagenesListas } = monta({ n: 2 });
    let arrancado = false; M.arranca(() => { arrancado = true; }); imagenesListas();
    expect(arrancado).toBe(true); expect(M.mosaico.pix).not.toBeNull();
    M.actualiza(4, 50, -2); await responde(0, 5); await responde(1, 6); cola.corre(1e6);
    expect(M.lista.every((t) => t.estado === 2)).toBe(true);
    M.libera(); M.libera();
    expect(M.lista.every((t) => t.estado === 0 && !t.dtm && !t.pts && !t.suel && !t.chm)).toBe(true);
    expect(M.mosaico.pix).toBeNull(); expect(M.mosaico.img).toBeNull();
    const api = M.componente.monta({} as never) as { estado(): { cargadas: number } };
    imagenesListas(); expect(M.mosaico.pix).not.toBeNull();
    expect(api.estado().cargadas).toBe(0);
  });
});

describe("el componente «mundo-teselas»", () => {
  it("es un manifiesto válido del exterior, sin dibujo, y su libera() es el del Mundo", async () => {
    const { M, cola, responde } = monta({ n: 1 });
    expect(ComponentesPuro.valida(M.componente)).toEqual([]);
    expect(M.componente.id).toBe("mundo-teselas"); expect(M.componente.mundos).toEqual(["exterior"]);
    expect(M.componente.presupuesto).toMatchObject({ llamadas: 0, triangulos: 0 });
    M.actualiza(2, 50, -2); await responde(0, 5); cola.corre(1e6);
    M.componente.libera(null);
    expect((M.lista[0] as Tesela).dtm).toBeNull();
  });
});

describe("L8-08: la distancia a una tesela exagera su cota como la cámara", () => {
  it("con una cámara a 2 m sobre un suelo de 80 m, la distancia es 2 con cualquier exageración (antes, 82 con exag 2)", () => {
    for (const e of [1, 2, 3]) {
      const { M } = monta({ exag: () => e }), t = M.lista[0] as Tesela; t.hc = 80;
      expect(M.dist(t, 2, 80 * e + 2, -2)).toBeCloseTo(2, 9);
    }
  });
  it("sin exag en las dependencias (otros montajes), como siempre: exag 1", () => {
    const { M } = monta(), t = M.lista[0] as Tesela; t.hc = 80; expect(M.dist(t, 2, 82, -2)).toBeCloseTo(2, 9);
  });
});

describe("L8-09: aseguraOrto no toma por vecina la tesela del borde opuesto de la fila de al lado", () => {
  it("la vecina este de una tesela del borde este no es la del borde oeste de la fila siguiente; la vecina real sí se decodifica", () => {
    const { M } = monta({ rejilla: [[1, 0], [0, 1], [0, 0]] });   // rejilla 2 × 2 con el hueco (1,1): G[2] sería (0,1)
    const t = M.lista[0] as Tesela, ajena = M.lista[1] as Tesela, oeste = M.lista[2] as Tesela;
    const imagenOk = (): ImagenMin => ({ onload: null, onerror: null, src: "", complete: true, naturalWidth: 2, width: 2, height: 2 });
    t.ortImg = imagenOk(); ajena.ortImg = imagenOk(); oeste.ortImg = imagenOk();
    for (const _ of M.aseguraOrto(t)) { /* una rebanada por tesela */ }
    expect(t.ortPix).toBeTruthy(); expect(oeste.ortPix).toBeTruthy();   // ella y su vecina oeste (kx 0, ky 0)
    expect(ajena.ortPix).toBeNull();   // la (0,1) no es vecina de (1,0) por el lado este
  });
});

describe("L8-13: el minimapa de cerca pinta el mosaico donde falta la tesela", () => {
  it("la vista de cerca (≤ 1,5 teselas) dibuja primero el mosaico de 1 m y luego las ortofotos de las teselas; sin mosaico, el color liso de siempre", () => {
    const { M, imagenesListas } = monta();
    const llamadas: string[] = [], c = { fillStyle: "", fillRect() { llamadas.push("liso:" + c.fillStyle); }, drawImage(im: { src: string }) { llamadas.push(im.src.endsWith("m.jpg") ? "mosaico" : "tesela"); } };
    M.pintaOrto(c as never, 0, 4, 4, 4, 64, 64); expect(llamadas).toEqual(["liso:#8d8668"]);   // sin mosaico: lo liso
    llamadas.length = 0; M.arranca(() => {}); imagenesListas();
    M.pintaOrto(c as never, 0, 4, 4, 4, 64, 64);
    expect(llamadas[0]).toBe("liso:#8d8668"); expect(llamadas).toContain("mosaico"); expect(llamadas.indexOf("mosaico")).toBe(1);
  });
});
