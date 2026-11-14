// La palanca flotante (EV2-B2, doc/historico/VIABILIDAD-INTERACCION.md §B; MU5-n, A3-6c: antes apps/web/motor/34b_palanca.js, que queda como talón): andar con el pulgar, encendida por defecto
// en pantalla táctil. Nace donde apoyas el dedo (nipplejs 1.0.4, modo «dynamic», MIT; regla 12) en la mitad del pulgar (#palanca en plantilla.html: la izquierda, la derecha con mano zurda);
// arrastrar la otra mitad gira al paseante. Alimenta el paseo por el camino que ya hay: ponPalanca/giraPalanca de 12_paseo, que actualizaPaseo suma al teclado y a la cruceta (la física, los
// troncos, el quad y el dron son los de siempre). La cuenta (zona muerta, curva, dirección) es PalancaPuro (paseo.ts). Apagada con el ajuste «controles.palanca» o con ?palanca=0; en
// escritorio sin pantalla táctil no aparece (?palanca=1 la fuerza). Apagada, o sin paseo, no se descarga nipplejs ni se crea nada (el import() se queda en el talón, para que Vite trocee igual).
// CSP (infra/Caddyfile: style-src 'self'): nipplejs da estilo a sus elementos con element.style (CSSOM), que la CSP permite; no escribe atributos style= ni <style>.
// Componente «palanca-tactil» de TODOS los mundos (la locomoción es de todo mundo). Su libera() destruye la palanca, quita las escuchas del lienzo, del botón y de la media query, desconecta
// el observador del visor y se borra de Configuración. Código movido tal cual (solo se tipan los parámetros); lo que cambia (paseando, Ajustes) entra por función.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_PALANCA = "palanca-tactil";

export interface DepsPalanca {
  $(id: string): T; lienzo: T; visor: T; documento: T; busqueda: string; PalancaPuro: T; ponPalanca(av: number, lat: number): void; giraPalanca(rad: number): void;
  sensMirar(): { k: number }; paseando(): boolean; Ajustes(): T; cargaNipple(): Promise<T>;
}

export function creaPalanca(d: DepsPalanca) {
  var $ = d.$, lienzo = d.lienzo, visor = d.visor, document: T = d.documento, location = { search: d.busqueda }, PalancaPuro = d.PalancaPuro, ponPalanca = d.ponPalanca, giraPalanca = d.giraPalanca;
  var sensMirar = d.sensMirar, paseando = d.paseando;
  var quitar: (() => void)[] = [], suelto = false;   // A3-6c: cómo quitar lo que se engancha
  function escucha(o: T, tipo: string, fn: T) { if (!o) return; o.addEventListener(tipo, fn); quitar.push(function () { o.removeEventListener(tipo, fn); }); }
  return (function () {
    var zona = $("palanca"); if (!zona) return { libera: function () { /* sin #palanca no hay nada que soltar */ } };
    var raiz = document.documentElement, joy: T = null, pidiendo = false, giro: T = null;
    function quiere() {
      var Ajustes = d.Ajustes(), aj: T = true; try { aj = Ajustes.lee("controles.palanca"); } catch (e) { /* sin Configuración: encendida */ }
      var tac = false; try { tac = Ajustes.tactil(); } catch (e) { /* sin Configuración: no táctil */ }
      return PalancaPuro.activa(tac, aj, location.search);
    }
    function apaga() { if (joy) { try { joy.destroy(); } catch (e) { /* ya destruida */ } joy = null; } ponPalanca(0, 0); }
    function enciende() {
      if (joy || pidiendo) return; pidiendo = true;
      d.cargaNipple().then(function (m: T) {
        pidiendo = false; if (joy || suelto || !quiere()) return;
        var nip = m.default || m; joy = nip.create({ zone: zona, mode: "dynamic", multitouch: false, size: 120, color: "#ffffff", restOpacity: 0.55, fadeTime: 120, threshold: 0.05 });
        joy.on("move", function (e: T) { var d = e && e.data, v = d && d.vector ? PalancaPuro.lee(d.vector.x, d.vector.y) : null; if (v) ponPalanca(v.av, v.lat); });   // nipplejs 1.0: un solo argumento, los datos en e.data (en 0.x eran (e, datos))
        joy.on("end", function () { ponPalanca(0, 0); });
      }).catch(function () { pidiendo = false; raiz.setAttribute("data-palanca", "no"); });   // si no carga, vuelve la cruceta: nunca sin mando
    }
    function aplica() {
      var q = quiere(); raiz.setAttribute("data-palanca", q ? "si" : "no");
      if (q && paseando()) enciende(); else if (!q) apaga();
    }
    aplica();
    try { var q = d.Ajustes().alCambiar(function (c: T) { if (c === "controles.palanca" || c === "controles.tactil") aplica(); }); if (typeof q === "function") quitar.push(q); } catch (e) { /* sin Configuración */ }
    try { var mm = matchMedia("(pointer: coarse)"); escucha(mm, "change", aplica); } catch (e) { /* sin matchMedia */ }
    // al empezar o dejar de pasear, venga de donde venga (el botón, ir andando a un punto, entrar en VR, el selector de modo): el visor cambia su clase «paseo»
    function alPasear() { if (paseando()) { if (quiere()) enciende(); } else ponPalanca(0, 0); }
    if (typeof MutationObserver !== "undefined" && typeof visor !== "undefined" && visor) { var mo = new MutationObserver(alPasear); mo.observe(visor, { attributes: true, attributeFilter: ["class"] }); quitar.push(function () { mo.disconnect(); }); }
    escucha($("btnPaseo"), "click", function () { setTimeout(alPasear, 0); });
    // mirar: arrastrar el dedo por la otra mitad (la que no es de la palanca); el toque corto sigue eligiendo lo que haya debajo (09_camara.js)
    function esMitadDelGiro(x: T) { var r = lienzo.getBoundingClientRect(), izq = x < r.left + r.width / 2; return raiz.getAttribute("data-mano") === "zurda" ? izq : !izq; }
    escucha(lienzo, "pointerdown", function (e: T) {
      if (!paseando() || raiz.getAttribute("data-palanca") !== "si" || giro) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (esMitadDelGiro(e.clientX)) giro = { id: e.pointerId, x: e.clientX };
    });
    escucha(lienzo, "pointermove", function (e: T) { if (giro && e.pointerId === giro.id) { giraPalanca(PalancaPuro.giro(e.clientX - giro.x, sensMirar().k)); giro.x = e.clientX; } });
    ["pointerup", "pointercancel"].forEach(function (ev: T) { escucha(lienzo, ev, function (e: T) { if (giro && e.pointerId === giro.id) giro = null; }); });
    return { libera: function () { if (suelto) return; suelto = true; apaga(); quitar.splice(0).forEach(function (f) { f(); }); giro = null; } };
  })();
}
export type Palanca = ReturnType<typeof creaPalanca>;

/** El componente «palanca-tactil» (solo ciclo de vida; de todos los mundos): lo registra el talón de 34b con Componentes.registra */
export function manifiestoPalanca(api: { libera(): void }): Manifiesto {
  return {
    id: ID_PALANCA, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
