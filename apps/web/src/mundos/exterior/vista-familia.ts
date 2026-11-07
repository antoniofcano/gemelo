// La vista simple para las familias (U9; petición de Antonio, 2026-11-02; MU5-n, A3-7b1: antes apps/web/motor/48_vista_familia.js, que queda como talón): «Capas y vista» y «Mapa y
// parcelas» están bien para la oficina, pero una familia ve UNA sola vista del gemelo y UN solo interruptor de olivos; elegir entre OlivarTrack, LiDAR y desfase no le dice nada. Lo del
// NDVI se queda. Es del EXTERIOR: oculta controles que solo existen en el mundo exterior (el selector de modo del mapa, las marcas, el desfase) y rotula «Copas del LiDAR». Componente
// «vista-familia» de los mundos ["exterior"], con un libera() que lo deshace todo: los estilos ocultados, el rótulo, el modo que se forzó, y ahora además la petición de la sesión en
// vuelo (AbortController), cuyo resultado tardío ya no cambia nada. No crea nada: solo OCULTA controles de la plantilla (display:none).
//  · Para la familia: se oculta el selector de modo (queda «Gemelo», forzado), «Guardados en OlivarTrack» y «Desfase» de «Datos», «Guardados», «Desfase medio» y la nota del desfase
//    del mapa; «Copas del LiDAR» se rotula «Olivos» (la capa dibuja las copas medidas, y su pastilla «medido»; el recuento de olivos es «detectado»). Se quedan Linde, NDVI y Ambiente.
//  · Oficina y admin lo ven todo como hoy; sin servidor o sin sesión (fixture, pruebas, local), todo como hoy.
//  · El rol lo da GET /api/sesion (campo «rol»: hogar, guia, corresponsal, oficina, admin; ya existe: no se añade ninguna ruta); mientras no llega, se ve lo de siempre. ?vista=completa
//    fuerza la vista completa (pruebas) y ?vista=familia la de familia (sin esperar a la sesión).
// Es presentación, no seguridad: la api sigue comprobando el rol en cada ruta; los datos ocultos no se protegen aquí. Presupuesto (regla 6): 0 llamadas, 0 triángulos.
// Código movido tal cual (solo se tipan parámetros y variables).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "../comun/tipos.ts";
import { HazasPuro } from "./hazas.ts";

export const ID_VISTA_FAMILIA = "vista-familia";

/** Lo que el talón de 48 le da: el índice de la finca (D) */
export interface DepsVistaFamilia { D: T }


  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/vista_familia.test.js)
export var VistaFamiliaPuro: T = (function () {
    var OFICIAL = ["oficina", "admin"];
    // qué se oculta para la familia: { id, sube } (sube: selector del ancestro que se esconde de verdad; "" = el propio elemento)
    var OCULTA = [
      { id: "tModo", sube: "" }, { id: "mNube", sube: ".modo" }, { id: "notaModo", sube: "" },
      { id: "cMarc", sube: "label" }, { id: "cDesf", sube: "label" },
      { id: "kMarc", sube: "div" }, { id: "kDes", sube: "div" }, { id: "notaDesfase", sube: "" }
    ];
    var ROTULOS = [{ id: "cCopas", sube: "label", antes: "Copas del LiDAR", ahora: "Olivos" }];
    var MODO = "mGem";
    // qué vista toca: ?vista=completa|familia manda; si no, solo con sesión de una familia (rol conocido y no oficial); sin rol (sin sesión), la completa
    function vista(busqueda?: T, rol?: T) {
      var m = /[?&]vista=([^&#]*)/.exec(busqueda || ""), v = m ? decodeURIComponent(m[1] as string).toLowerCase() : "";
      if (v === "completa" || v === "familia") return v;
      if (typeof rol !== "string" || !rol) return "completa";
      return OFICIAL.indexOf(rol) >= 0 ? "completa" : "familia";
    }
    function plan(v?: T) { return v === "familia" ? { oculta: OCULTA, rotulos: ROTULOS, forzar: MODO } : { oculta: [], rotulos: [], forzar: null }; }
    return { vista: vista, plan: plan, OCULTA: OCULTA, ROTULOS: ROTULOS, MODO: MODO };
  })();
  // [puro:fin]

export function manifiestoVistaFamilia(dp: DepsVistaFamilia): Manifiesto {
  var D: T = dp.D;

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/vista_familia.test.js con un DOM de mentira)
  function VistaFamiliaMotor(n?: T) {
    var P = VistaFamiliaPuro, API = HazasPuro.prefijoApi(location.search, D.base), busqueda = location.search;
    var guardado: T = [], rotulado: T = [], modoAntes: T = null, forzoModo = false, vivo = true, aplicada = "completa", ctl = new AbortController();   // A3-7b1: libera() corta la petición de la sesión
    function destino(d?: T) { var e = document.getElementById(d.id); if (e && d.sube && e.closest) e = e.closest(d.sube); return e; }
    function oculta(d?: T) {
      var e = destino(d); if (!e || guardado.some(function (g?: T) { return g.e === e; })) return;
      guardado.push({ e: e, display: e.style.display }); e.style.display = "none";
    }
    function rotula(d?: T) {
      var e = destino(d); if (!e || !e.childNodes) return;
      for (var i = 0; i < e.childNodes.length; i++) {
        var t: T = e.childNodes[i];
        if (t.nodeType === 3 && t.nodeValue.indexOf(d.antes) >= 0) { rotulado.push({ t: t, antes: t.nodeValue }); t.nodeValue = t.nodeValue.replace(d.antes, d.ahora); return; }
      }
    }
    function modoActual() { var ids = ["mNube", "mGem", "mOrto"]; for (var i = 0; i < ids.length; i++) { var b = document.getElementById(ids[i] as string); if (b && b.getAttribute("aria-pressed") === "true") return ids[i]; } return null; }
    function pulsa(id?: T) { var b = document.getElementById(id); if (b && b.click) b.click(); }
    function deshaz() {
      guardado.splice(0).forEach(function (g?: T) { g.e.style.display = g.display; });
      rotulado.splice(0).forEach(function (r?: T) { r.t.nodeValue = r.antes; });
      if (forzoModo && modoAntes) pulsa(modoAntes);
      forzoModo = false; modoAntes = null; aplicada = "completa";
    }
    function pone(v?: T) {
      if (!vivo || v === aplicada) return;
      deshaz();
      var p = P.plan(v);
      p.oculta.forEach(oculta); p.rotulos.forEach(rotula);
      if (p.forzar) { modoAntes = modoActual(); if (modoAntes !== p.forzar) { pulsa(p.forzar); forzoModo = true; } }
      aplicada = v;
    }
    // montaje: ?vista= manda; si no, con servidor se pregunta quién eres (GET /api/sesion, la cookie del mismo origen); sin servidor o sin sesión, la vista completa
    if (/[?&]vista=(completa|familia)(?:[&#]|$)/i.test(busqueda)) pone(P.vista(busqueda, null));
    else if (API) {
      Promise.resolve().then(function () { return fetch(API + "sesion", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal }); })
        .then(function (r?: T) { return r && r.status === 200 && r.json ? r.json() : null; })
        .then(function (j?: T) { if (vivo && j && typeof j.rol === "string") pone(P.vista(busqueda, j.rol)); })
        .catch(function () {});
    }
    return {
      libera: function () { vivo = false; ctl.abort(); deshaz(); },
      estado: function () { return { vista: aplicada, ocultos: guardado.length, rotulados: rotulado.length, forzoModo: forzoModo }; }
    };
  }
  // [motor:fin]

  return {
    id: "vista-familia", version: 1,   // el id literal: lo lee el guardián de 48
    consume: ["HazasPuro"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "vista" },
    presupuesto: { llamadas: 0, triangulos: 0 },
    mundos: ["exterior"],
    monta: function (n?: T) { return VistaFamiliaMotor(n); },
    libera: function (api?: T) { if (api) api.libera(); }
  };
}
