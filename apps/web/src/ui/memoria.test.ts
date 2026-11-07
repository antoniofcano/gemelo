// La memoria de la interfaz entera (A3-7a, MU5-n): con un solo DOM de mentira (prueba-dom.ts) se montan juntas las piezas de ui/ que enganchan algo a la página
// (movibles, ventanas, HUD, lo tuyo, menú y pantalla completa, Configuración, capas, minimapa y contador) y luego se liberan en el orden inverso, como lo haría el
// núcleo de componentes con el último mundo vivo. Tras liberar no queda ningún reloj (L2-11), ningún observador ni ninguna escucha en la ventana, el documento o los
// nodos de la plantilla. HONESTIDAD: los nodos que crea cada pieza se van con ella (sus escuchas no se cuentan); en el navegador, la prueba de «con y sin» va por el banco.
import { afterEach, describe, expect, it } from "vitest";
import { creaAjustes } from "./ajustes.ts";
import { creaCapas } from "./capas.ts";
import { creaDepura } from "./depura.ts";
import { creaHud } from "./hud.ts";
import { creaHudPersonal } from "./hud-personal.ts";
import { creaMinimapa } from "./minimapa.ts";
import { creaMovibles } from "./movibles.ts";
import { creaPantalla } from "./pantalla.ts";
import { creaVentanas } from "./ventanas.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

/** las escuchas que siguen vivas en la ventana, el documento y los nodos que ya estaban (la plantilla) */
function vivasEn(nodos: A[]) { return nodos.reduce((s, n) => s + Object.values(n._escuchas as Record<string, unknown[]>).reduce((a, l) => a + l.length, 0), 0); }

describe("la interfaz entera, montada y liberada", () => {
  it("no deja relojes, observadores ni escuchas en la página", () => {
    m = creaMundo();
    const d = m.documento, $ = (id: string) => d.getElementById(id), plantilla: A[] = [];
    const nodo = (tag: string, id: string, padre?: A) => { const e = m!.el(tag, id); (padre || d.body).appendChild(e); plantilla.push(e); return e; };
    const visor = nodo("div", "visor"), hud = nodo("div", "hud"), barra = nodo("div", "hudBarra", hud);
    nodo("button", "bMas", barra); nodo("div", "hudMas", hud); nodo("div", "hudAvisos", hud); nodo("button", "norte", hud); nodo("span", "hudAguja", hud);
    for (const id of ["hudPersonal", "hpHora", "hpHaza", "hpHablar", "hpVolver", "hpHoraT", "hpHazaT", "hpHablarT"]) nodo("button", id, hud);
    const dlg = nodo("dialog", "menu"); nodo("section", "menuAjustes", dlg); for (const id of ["menuVolver", "bMenu", "btnPantalla", "btnPaseo", "exag", "corr"]) nodo("button", id);
    const vc = nodo("section", "ventanaCapas", visor); vc.className = "ventana"; nodo("section", "ventanaAyuda", visor).className = "ventana";
    const casa = nodo("div", "casaMapa"); nodo("canvas", "mapita", casa);
    const Bus = { on: () => () => { /* doble */ }, emite: () => 0, hay: () => false };
    const vacio = {};
    let Hud: A = null, Movibles: A = null;
    const piezas: A[] = [];
    Movibles = creaMovibles({ visor, get Hud() { return Hud; }, ventana: m.ventana, documento: d }); piezas.push(Movibles);
    const Ventanas = creaVentanas({ $, lienzo: m.el("canvas"), visor, paseando: false, Movibles, ventana: m.ventana, documento: d }); piezas.push(Ventanas);
    const MP = creaPantalla({ $, paseando: false, get Hud() { return Hud; }, tamano() { /* doble */ }, ventana: m.ventana, documento: d }); piezas.push(MP);
    Hud = creaHud({ $, Bus, THREE: { Vector3: class { x = 0; y = 0; z = -1; } }, lienzo: m.el("canvas"), visor, camera: { getWorldDirection: (v: A) => v }, orb: {}, pp: {}, dr: {}, VRX: { on: false },
      ponQuad() { /* doble */ }, ponDron() { /* doble */ }, paseando: false, enQuad: false, enDron: false, Ventanas, Ajustes: null, Movibles, Menu: MP.Menu, ventana: m.ventana, documento: d }); piezas.push(Hud);
    piezas.push(creaHudPersonal({ $, Bus, Hazas: { enPunto: () => null, estado: () => ({}) }, horaMundoTexto: () => "12:00", objetivo: {}, pp: {}, Usables: vacio, Hud, paseando: false }));
    piezas.push(creaAjustes({ $, fmt: String, Bus, Render: { build: "pantalla" }, renderer: { getPixelRatio: () => 1, setPixelRatio() { /* doble */ } }, Hud, Movibles, tamano() { /* doble */ },
      ventana: m.ventana, documento: d }));
    piezas.push(creaCapas({ $, documento: d }));
    piezas.push(creaMinimapa({ $, D: { parcelas: [] }, x0: 0, yN: 0, ANCHO: 100, ALTO: 100, Mundo: { pintaOrto() { /* doble */ } }, cIn: [], Entidades: { lista: () => null }, Usables: vacio,
      pp: { x: 0, y: 0, ang: 0 }, dr: {}, paseando: false, enQuad: false, enDron: false, avisoBaliza() { /* doble */ }, dibujaBalizasMini() { /* doble */ }, Movibles, ventana: m.ventana, documento: d }));
    piezas.push(creaDepura({ Aparato: vacio, Mundo: { lista: [] }, Cola: vacio, Bus, XrPerillas: vacio, InfoDibujo: vacio, visor, renderer: vacio, Arboles: vacio, vrDebugExtra: () => "",
      Ajustes: { lee: () => false }, ventana: m.ventana, documento: d }));
    m.avanza();   // los setTimeout de «tras montar»: el HUD con Configuración, el minimapa con Movibles
    expect(m.intervalos().length).toBe(3);   // el estado y la brújula del HUD, lo tuyo
    expect(m.observadores()).toBeGreaterThan(0); expect(vivasEn([m.ventana, d].concat(plantilla))).toBeGreaterThan(20);
    piezas.slice().reverse().forEach(p => p.libera());
    expect(m.relojes()).toBe(0); expect(m.observadores()).toBe(0); expect(vivasEn([m.ventana, d].concat(plantilla))).toBe(0);
  });
});
