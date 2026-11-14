// La Configuración (A3-7a, MU5-n; antes 33_ajustes.js). Con dobles del DOM (prueba-dom.ts): pinta sus pestañas en #menuAjustes, guarda en el almacén con su prefijo,
// aplica a <html> lo que no tiene otro dueño (data-*), y un componente añade su pestaña con Ajustes.registra; libera() quita todas sus escuchas (controles, deslizadores
// y media queries) y saca lo que pintó, pero Ajustes.lee sigue valiendo. El esquema y la precedencia de la URL los prueba ajustes.test.js (AjustesPuro).
// HONESTIDAD: sin CSS, sin foco y sin maquetación; en el iPhone y en el Quest, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { AjustesPuro, ID_CONFIGURACION, creaAjustes, manifiestoAjustes } from "./ajustes.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta(busqueda = "") {
  m = creaMundo({ busqueda });
  const d = m.documento, host = m.el("section", "menuAjustes"), exag = m.el("input", "exag"), emitidos: string[] = [];
  d.body.appendChild(host); d.body.appendChild(exag); exag.value = "1";
  const A = creaAjustes({ $: (id: string) => d.getElementById(id), fmt: (n: number) => String(n), Bus: { emite: (ev: string) => { emitidos.push(ev); return 0; }, hay: () => false },
    Render: { build: "pantalla" }, renderer: { getPixelRatio: () => 1, setPixelRatio() { /* doble */ } }, Hud: null, Movibles: null, tamano() { /* doble */ }, ventana: m.ventana, documento: d });
  return { A, m, d, host, emitidos };
}

describe("Configuración", () => {
  it("lo puro sigue igual: valida y no deja pasar un valor fuera de rango", () => {
    expect(AjustesPuro.valida("acc.texto", 999)).toBe(200); expect(AjustesPuro.valida("vr.giro", "7")).toBe("30");
  });
  it("pinta sus pestañas, guarda con su prefijo y aplica a <html>", () => {
    const { A, d, host } = monta();
    expect(host.getAttribute("data-ajustes")).toBe("listo"); expect(d.getElementById("aj-t-graficos")).not.toBe(null);
    expect(A.pon("acc.contraste", true)).toBe(true); expect(d.documentElement.getAttribute("data-contraste")).toBe("alto");
    expect(m!.ventana.localStorage.getItem("gemelo.ajustes.acc.contraste")).toBe("true");
  });
  it("L6-03: «Movimiento» llega a lo 3D: movimientoReducido() y alMovimiento(fn) siguen el ajuste (y «sistema», la media query); el oyente de los deps se llama al arrancar y en cada cambio", () => {
    m = creaMundo(); const d = m.documento, host = m.el("section", "menuAjustes"); d.body.appendChild(host);
    const vistos: boolean[] = [];
    const A = creaAjustes({ $: (id: string) => d.getElementById(id), fmt: (n: number) => String(n), Bus: { emite: () => 0, hay: () => false }, Render: { build: "pantalla" },
      renderer: { getPixelRatio: () => 1, setPixelRatio() { /* doble */ } }, Hud: null, Movibles: null, tamano() { /* doble */ }, ventana: m.ventana, documento: d, movimiento: (r: boolean) => { vistos.push(r); } });
    expect(A.movimientoReducido()).toBe(false); expect(vistos).toEqual([false]);   // «Como el sistema» y el sistema (el doble) no lo pide
    A.pon("acc.movimiento", "reducido"); expect(A.movimientoReducido()).toBe(true); expect(d.documentElement.getAttribute("data-movimiento")).toBe("reducido");
    A.pon("acc.movimiento", "normal"); expect(A.movimientoReducido()).toBe(false); expect(vistos).toEqual([false, true, false]);
    const otros: boolean[] = [], quita = A.alMovimiento((r: boolean) => { otros.push(r); }); A.pon("acc.movimiento", "reducido"); quita(); A.pon("acc.movimiento", "normal");
    expect(otros).toEqual([false, true]);
  });
  it("L6-19: «Restablecer toda la configuración» pide una segunda pulsación (el botón lo dice); L6-20: «Atajos de una sola tecla» encendidos por defecto", () => {
    const { A, d } = monta();
    expect(A.atajos()).toBe(true); A.pon("acc.atajos", false); expect(A.atajos()).toBe(false);
    A.pon("acc.contraste", true);
    const b = d.getElementById("ajReinicia"); b.click();
    expect(A.lee("acc.contraste")).toBe(true); expect(A.lee("acc.atajos")).toBe(false); expect(b.textContent).toMatch(/otra vez/);
    b.click(); expect(A.lee("acc.contraste")).toBe(false); expect(A.atajos()).toBe(true); expect(b.textContent).toBe("Restablecer toda la configuración");
  });
  it("?debug manda sobre el contador (y avisa al medidor)", () => {
    const { A, emitidos } = monta("?debug"); expect(A.lee("avanzado.contador")).toBe(true); expect(emitidos).toContain("medida:muestra");
  });
  it("un componente añade su pestaña con Ajustes.registra y la quita", () => {
    const { A, d } = monta();
    const q = A.registra("sonido", { activo: { tipo: "bool", def: true } }, { t: "Sonido", campos: [{ k: "activo", t: "Sonido" }] });
    expect(d.getElementById("aj-t-sonido")).not.toBe(null); expect(A.lee("sonido.activo")).toBe(true);
    q(); expect(d.getElementById("aj-t-sonido")).toBe(null); expect(A.lee("sonido.activo")).toBe(undefined);
  });
  it("libera() quita todas sus escuchas y saca la interfaz; Ajustes.lee sigue valiendo", () => {
    const { A, m, host } = monta();
    expect(m.escuchas()).toBeGreaterThan(10);
    A.libera();
    expect(m.escuchas()).toBe(0); expect(host.children.length).toBe(0); expect(host.getAttribute("data-ajustes")).toBe(null); expect(A.lee("vr.giro")).toBe("30");
  });
  it("L1-10: lee() va en caché; si otra pestaña cambia un ajuste (evento «storage» de la ventana), se vuelve a leer", () => {
    const { A, m } = monta();
    expect(A.lee("vr.giro")).toBe("30");
    m.ventana.localStorage.setItem("gemelo.ajustes.vr.giro", JSON.stringify("45"));
    expect(A.lee("vr.giro")).toBe("30");   // la caché
    (m.ventana._escuchas.storage as ((e: unknown) => void)[]).forEach((f) => f({ key: "gemelo.ajustes.vr.giro" }));
    expect(A.lee("vr.giro")).toBe("45");
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoAjustes(monta().A);
    expect(c.id).toBe(ID_CONFIGURACION); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});
