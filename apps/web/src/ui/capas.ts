// Las capas del mundo (ADR-0023, C2; MU5-n, A3-7a: antes apps/web/motor/32b_capas.js, que queda como talón): el punto de extensión que pone una casilla en la ventana
// «Capas y vista», con la pastilla de su procedencia (regla 5: medido, deducido o ilustrativo). Componente «capas-mundo» de TODOS los mundos (la ventana es de la
// página, no de un mundo): su libera() saca las casillas que se registraron (apagando antes las encendidas). Código movido tal cual; lo del legado entra por dp.
import type { Manifiesto } from "../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_CAPAS = "capas-mundo";

/** Lo que el talón de 32b le da: $ (01_datos) */
export interface DepsCapas { $(id: string): T; documento: T }

  // ---------- punto de extensión de las capas del mundo (ADR-0023, C2): Capas.registra(def) pone una casilla en la ventana «Capas y vista», en el grupo
  // «Datos» o «Ambiente», con la pastilla de su procedencia (regla 5 del repo: medido, deducido o ilustrativo; sin ella no se registra) y la llama al
  // encenderla y apagarla. def = { id, nombre, procedencia, grupo?: "datos"|"ambiente", activa?: bool, color?: CSS, nota?, alterna(on) }. Devuelve quita
  // (saca la casilla; si estaba encendida, la apaga antes). Las casillas de la plantilla (linde, copas, NDVI, paisaje…) siguen como estaban.
  // [puro:inicio] (sin DOM: lo evalúa en Node pruebas/guardianes/componentes.test.js)
export var CapasPuro: T = (function () {
    var PROC: T = ["medido", "deducido", "ilustrativo"], GRUPOS: T = ["datos", "ambiente"];
    function valida(d: T) {
      var e: T = [];
      if (!d || typeof d !== "object") return ["la capa no es un objeto"];
      if (typeof d.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(d.id)) e.push("id: minúsculas, cifras y guiones");
      if (typeof d.nombre !== "string" || !d.nombre.trim()) e.push("nombre: texto");
      if (PROC.indexOf(d.procedencia) < 0) e.push("procedencia: medido, deducido o ilustrativo (regla 5)");
      if (d.grupo !== undefined && GRUPOS.indexOf(d.grupo) < 0) e.push("grupo: datos o ambiente");
      if (typeof d.alterna !== "function") e.push("alterna(on): función");
      return e;
    }
    return { PROC: PROC, GRUPOS: GRUPOS, valida: valida };
  })();
  // [puro:fin]
export function creaCapas(dp: DepsCapas) {
  var document: T = dp.documento;
  var Capas: T = (function () {
    var reg: T = {};
    function grupo(nombre: T) {   // el <div> que sigue al <h3> «Datos» o «Ambiente» de la ventana de capas
      var v: T = dp.$("ventanaCapas"), hs: T = v ? v.querySelectorAll("h3") : [];
      for (var i: T = 0; i < hs.length; i++) if (hs[i].textContent.trim().toLowerCase() === nombre) { var n: T = hs[i].nextElementSibling; while (n && n.tagName !== "DIV") n = n.nextElementSibling; if (n) return n; }
      return v ? v.querySelector(".cuerpo") : null;
    }
    function registra(d: T) {
      var e: T = CapasPuro.valida(d); if (!e.length && (reg[d.id] || dp.$("capa-" + d.id))) e = ["id repetido: " + d.id];
      if (e.length) { try { console.error("[Capas] " + (d && d.id) + ": " + e.join("; ")); } catch (er: T) {} return null; }
      var casa: T = grupo(d.grupo || "datos"); if (!casa) return null;
      var l: T = document.createElement("label"), i: T = document.createElement("input"), pu: T = document.createElement("span"), pi: T = document.createElement("span");
      l.className = "capa"; i.type = "checkbox"; i.id = "capa-" + d.id; i.checked = !!d.activa;
      pu.className = "punto"; pu.style.background = d.color || "var(--line)"; pi.className = "pill p-" + d.procedencia; pi.textContent = d.procedencia;
      l.appendChild(i); l.appendChild(pu); l.appendChild(document.createTextNode(d.nombre + " ")); l.appendChild(pi);
      if (d.nota) l.title = d.nota;
      casa.appendChild(l);
      function cambia() { try { d.alterna(i.checked); } catch (er: T) { try { console.error("[Capas] " + d.id, er); } catch (e2: T) {} } }
      i.addEventListener("change", cambia); if (i.checked) cambia();
      reg[d.id] = { d: d, l: l, i: i, quita: quita };   // A3-7a: con su quita, para libera()
      return quita;
      function quita() { if (i.checked) { i.checked = false; cambia(); } if (l.parentNode) l.parentNode.removeChild(l); i.removeEventListener("change", cambia); delete reg[d.id]; }
    }
    function lista() { return Object.keys(reg).map(function (k: T) { return { id: k, nombre: reg[k].d.nombre, procedencia: reg[k].d.procedencia, activa: reg[k].i.checked }; }); }
    // A3-7a: libera() saca todas las casillas registradas (apagando antes las encendidas, como su quita) y suelta su escucha
    function libera() { Object.keys(reg).forEach(function (k: T) { reg[k].quita(); }); }
    return { registra: registra, lista: lista, libera: libera };
  })();
  return Capas;
}
export type Capas = ReturnType<typeof creaCapas>;

/** El componente «capas-mundo» (solo ciclo de vida; de todos los mundos): lo registra el talón de 32b con Componentes.registra */
export function manifiestoCapas(api: { libera(): void }): Manifiesto {
  return {
    id: ID_CAPAS, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
