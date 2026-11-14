// La Configuración (UX-FINCA-JUEGO §4.5; MU5-n, A3-7a: antes apps/web/motor/33_ajustes.js, que queda como talón): los ajustes de la persona, guardados en localStorage
// (prefijo gemelo.ajustes.) con try/catch; la URL manda sobre el ajuste (?debug, &mide=). La interfaz se pinta en #menuAjustes con pestañas ARIA; los módulos que dependen
// de un ajuste lo leen (Ajustes.lee) o se suscriben (Ajustes.alCambiar). Componente «configuracion» de TODOS los mundos (los ajustes son de la persona, no del mundo):
// su libera() quita las escuchas de sus controles, de los deslizadores de la página (relieve y corrección) y de las dos media queries, y saca la interfaz que pintó en
// #menuAjustes. Los ajustes siguen leyéndose después (el almacén no se suelta): quien los lee no se rompe. Código movido tal cual (solo se tipan parámetros y
// variables, y «x.addEventListener(» pasa a «escucha(x, »); lo que el legado reescribe o declara después (Hud, Movibles, tamano) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_CONFIGURACION = "configuracion";

/** Lo que el talón de 33 le da: $, fmt (01_datos), el Bus, Render (02h) y el renderer (03_escena); por getter, Hud (31), Movibles (34) y tamano (90_final) */
export interface DepsAjustes { $(id: string): T; fmt(n: number, d?: number): string; Bus: T; Render: T; renderer: T; readonly Hud: T; readonly Movibles: T; readonly tamano: () => void; ventana: T; documento: T;
  /** L6-03: quien mueve el mundo con el tiempo (el reloj de nubes y viento de 15_tiempo) y cambia con «Movimiento»: se le llama al arrancar y cada vez que cambia (el ajuste o, en «sistema», el sistema) */
  movimiento?: (reducido: boolean) => void }

  // ---------- Configuración (UX-FINCA-JUEGO §4.5): los ajustes de la persona, guardados en localStorage (prefijo gemelo.ajustes.) con try/catch (si falla, duran la visita).
  // Una URL manda sobre el ajuste (?debug, &mide=). La UI se pinta por JS en #menuAjustes (lo crea la plantilla); si no existe y hay un <dialog id="menu">, se crea un <section> de respaldo.
  // Los módulos que dependen de un ajuste lo LEEN (Ajustes.lee) o se suscriben (Ajustes.alCambiar); aquí solo se aplica lo que no tiene dueño: los controles de la página,
  // atributos data-* en <html> para el CSS (contraste, movimiento, mano, brújula, unidades, táctil) y el texto.

  // [puro:inicio] — esquema, validación, guardado y precedencia de la URL: sin DOM; pruebas/guardianes/ajustes.test.js evalúa este trozo tal cual en Node
export var AjustesPuro: T = (function () {
    var PREFIJO: T = "gemelo.ajustes.";
    function bool(def?: T) { return { tipo: "bool", def: def }; }
    function num(def?: T, min?: T, max?: T, paso?: T) { return { tipo: "num", def: def, min: min, max: max, paso: paso }; }
    function opc(def?: T, ops?: T) { return { tipo: "opc", def: def, ops: ops }; }
    var ESQUEMA: T = {
      "graficos.calidad": opc("auto", ["auto", "0", "1", "2"]), "graficos.ahorro": bool(false),
      "vista.exag": num(1, 1, 3, 0.25), "vista.corr": num(1, 0, 1.5, 0.25), "vista.brujula": bool(true), "vista.personal": bool(true), "vista.suelo": bool(false), "vista.tono": opc("neutro", ["neutro", "agx", "aces", "neutral"]), "vista.a2c": bool(false), "vista.unidades": opc("ha", ["ha", "m2"]), "vista.altura": opc("pie", ["pie", "sentado"]),
      "controles.tactil": opc("auto", ["auto", "si", "no"]), "controles.mano": opc("diestra", ["diestra", "zurda"]), "controles.sens": num(1, 0.4, 2, 0.2), "controles.invertir": bool(false), "controles.palanca": bool(true), "controles.tocarIr": bool(true),
      "vr.giro": opc("30", ["15", "30", "45", "60"]), "vr.vineta": opc("suave", ["suave", "fuerte", "no"]), "vr.vuelo": bool(false), "vr.multiview": bool(true), "vr.muneca": bool(true),
      "acc.texto": num(100, 100, 200, 25), "acc.contraste": bool(false), "acc.movimiento": opc("sistema", ["sistema", "reducido", "normal"]), "acc.atajos": bool(true),
      "avanzado.contador": bool(false)
    };
    // lo que fuerza la URL (clave del ajuste → expresión sobre location.search); la URL manda y no se guarda
    var URL_MANDA: T = { "avanzado.contador": /[?&]debug\b/ };
    // un valor o el defecto: nunca lanza ni deja pasar un valor fuera de rango (un localStorage manipulado o de otra versión)
    function valida(clave?: T, v?: T) {
      var e: T = ESQUEMA[clave]; if (!e) return undefined;
      if (e.tipo === "bool") return typeof v === "boolean" ? v : e.def;
      if (e.tipo === "num") { if (typeof v !== "number" || !isFinite(v)) return e.def; return Math.min(e.max, Math.max(e.min, v)); }
      return typeof v === "string" && e.ops.indexOf(v) >= 0 ? v : e.def;
    }
    function esValido(clave?: T, v?: T) { var e: T = ESQUEMA[clave]; if (!e) return false; return valida(clave, v) === v || (e.tipo === "num" && typeof v === "number" && isFinite(v)); }
    // L1-10: la generación del esquema (fusiona y retira la suben): la caché de lee() de cada almacén se vacía al cambiar
    var genEsq = 0;
    // el almacén: algo con getItem/setItem/removeItem (localStorage). Si falla (modo privado, bloqueado), se cae a la memoria de la visita
    // L1-10: lee() guarda en caché lo que devuelve (hay quien lee cada fotograma: graficos.ahorro, avanzado.contador, vista.altura); la vacían pon (wr/rm), restablece,
    // un cambio del esquema y olvida() (otra pestaña cambió el almacén: el evento «storage» de la ventana)
    function crea(almacen?: T, busqueda?: T) {
      var mem: T = {}, oyentes: T = [], cache: T = {}, genCache = genEsq, conCache = true;
      function rd(clave?: T) {
        try { if (almacen) { var s: T = almacen.getItem(PREFIJO + clave); if (s != null) return JSON.parse(s); } } catch (e: T) {}
        return Object.prototype.hasOwnProperty.call(mem, clave) ? mem[clave] : undefined;
      }
      function wr(clave?: T, v?: T) { delete cache[clave]; mem[clave] = v; try { if (almacen) almacen.setItem(PREFIJO + clave, JSON.stringify(v)); } catch (e: T) {} }
      function rm(clave?: T) { delete cache[clave]; delete mem[clave]; try { if (almacen) almacen.removeItem(PREFIJO + clave); } catch (e: T) {} }
      function forzado(clave?: T) { return URL_MANDA[clave] && URL_MANDA[clave].test(busqueda || "") ? true : undefined; }
      function guardado(clave?: T) { var v: T = rd(clave); return v === undefined ? ESQUEMA[clave] && ESQUEMA[clave].def : valida(clave, v); }
      function lee(clave?: T) {
        if (!ESQUEMA[clave]) return undefined;
        if (genCache !== genEsq) { cache = {}; genCache = genEsq; }
        if (conCache && Object.prototype.hasOwnProperty.call(cache, clave)) return cache[clave];
        var f: T = forzado(clave), v: T = f !== undefined ? f : guardado(clave); if (conCache) cache[clave] = v; return v;
      }
      function olvida() { cache = {}; }
      // L1-10: sin quien la vacíe (la Configuración se liberó y con ella la escucha de «storage»), la caché se apaga: cada lee() va al almacén, como antes de L1-10
      function sinCache() { cache = {}; conCache = false; }
      function avisa(clave?: T, v?: T, antes?: T) { oyentes.slice().forEach(function (fn?: T) { try { fn(clave, v, antes); } catch (e: T) {} }); }
      function pon(clave?: T, v?: T) {
        if (!ESQUEMA[clave]) return false;
        if (!esValido(clave, v)) return false;
        v = valida(clave, v); var antes: T = lee(clave), g: T = guardado(clave);
        if (v === ESQUEMA[clave].def) rm(clave); else wr(clave, v);
        if (g !== v || antes !== lee(clave)) avisa(clave, lee(clave), antes);
        return true;
      }
      function restablece() { Object.keys(ESQUEMA).forEach(function (k?: T) { var antes: T = lee(k); rm(k); if (lee(k) !== antes) avisa(k, lee(k), antes); }); }
      function alCambiar(fn?: T) { if (typeof fn === "function") oyentes.push(fn); return function () { var i: T = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; }
      return { lee: lee, pon: pon, alCambiar: alCambiar, restablece: restablece, olvida: olvida, sinCache: sinCache, defecto: function (c?: T) { return ESQUEMA[c] && ESQUEMA[c].def; }, forzado: forzado, claves: function () { return Object.keys(ESQUEMA); } };
    }
    // superficie en hectáreas o metros cuadrados (decisión de Configuración → Vista); fmt: formateador (n, decimales) → texto
    function superficie(ha?: T, unidades?: T, fmt?: T) { return unidades === "m2" ? fmt(Math.round(ha * 10000), 0) + " m²" : fmt(ha, 1) + " ha"; }
    // punto de extensión (ADR-0023, C2): un componente añade sus ajustes con un prefijo propio. esquema = { clave: { tipo: "bool"|"num"|"opc", def, min?, max?, paso?, ops? } }
    // (claves sin el prefijo). Devuelve la lista de errores; si está vacía, las claves «prefijo.clave» ya están en ESQUEMA. Un prefijo ya usado no se fusiona.
    function fusiona(prefijo?: T, esquema?: T) {
      var e: T = [], nuevas: T = {};
      if (!/^[a-z][a-z0-9]*$/.test(prefijo || "")) return ["prefijo: minúsculas y cifras"];
      if (Object.keys(ESQUEMA).some(function (k?: T) { return k.indexOf(prefijo + ".") === 0; })) return ["prefijo ya usado: " + prefijo];
      Object.keys(esquema || {}).forEach(function (k?: T) {
        var x: T = esquema[k], c: T = prefijo + "." + k;
        if (!/^[a-z][a-zA-Z0-9]*$/.test(k)) { e.push(c + ": clave no válida"); return; }
        if (!x || ["bool", "num", "opc"].indexOf(x.tipo) < 0) { e.push(c + ": tipo bool, num u opc"); return; }
        if (x.tipo === "bool" && typeof x.def !== "boolean") { e.push(c + ": def booleano"); return; }
        if (x.tipo === "num" && !(typeof x.def === "number" && typeof x.min === "number" && typeof x.max === "number" && x.min <= x.def && x.def <= x.max)) { e.push(c + ": num con min ≤ def ≤ max"); return; }
        if (x.tipo === "opc" && !(Array.isArray(x.ops) && x.ops.indexOf(x.def) >= 0)) { e.push(c + ": opc con def dentro de ops"); return; }
        nuevas[c] = x.tipo === "bool" ? bool(x.def) : x.tipo === "num" ? num(x.def, x.min, x.max, x.paso || 1) : opc(x.def, x.ops.slice());
      });
      if (!Object.keys(nuevas).length && !e.length) e.push("esquema vacío");
      if (!e.length) { Object.keys(nuevas).forEach(function (c?: T) { ESQUEMA[c] = nuevas[c]; }); genEsq++; }
      return e;
    }
    function retira(prefijo?: T) { Object.keys(ESQUEMA).forEach(function (k?: T) { if (k.indexOf(prefijo + ".") === 0) delete ESQUEMA[k]; }); genEsq++; }
    return { PREFIJO: PREFIJO, ESQUEMA: ESQUEMA, valida: valida, crea: crea, superficie: superficie, fusiona: fusiona, retira: retira };
  })();
  // [puro:fin]
export function creaAjustes(dp: DepsAjustes) {
  var window: T = dp.ventana, document: T = dp.documento, location: T = window.location, sol = creaSoltador(), escucha = sol.escucha;

  var Ajustes: T = (function () {
    var almacen: T = null; try { almacen = window.localStorage; } catch (e: T) { almacen = null; }
    var api: T = AjustesPuro.crea(almacen, location.search), E: T = AjustesPuro.ESQUEMA, raiz: T = document.documentElement;
    // L6-03: «Movimiento» (sistema, reducido o normal) es lo que leen también lo 3D (la transición al paseo, el tiempo, las máquinas de los interiores): movimientoReducido()
    // lo da sin consultar la media query en cada fotograma (se recalcula al cambiar el ajuste o el sistema) y alMovimiento(fn) avisa de cada cambio
    var reducidoYa: T = null, oyentesMov: T = [];
    function calculaReducido() { var m: T = api.lee("acc.movimiento"); if (m === "sistema") return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); return m === "reducido"; }
    function movimientoReducido() { return reducidoYa !== null ? reducidoYa : calculaReducido(); }
    function alMovimiento(fn?: T) { if (typeof fn !== "function") return function () {}; oyentesMov.push(fn); try { fn(movimientoReducido()); } catch (e: T) {} return function () { var i: T = oyentesMov.indexOf(fn); if (i >= 0) oyentesMov.splice(i, 1); }; }
    function tactil() { var t: T = api.lee("controles.tactil"); if (t === "auto") return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches); return t === "si"; }
    api.movimientoReducido = movimientoReducido; api.alMovimiento = alMovimiento; api.tactil = tactil;
    api.atajos = function () { return api.lee("acc.atajos") !== false; };   // L6-20: ¿valen los atajos de una sola tecla? (los leen el HUD, las Teclas, el paseo y la cámara)
    api.superficie = function (ha?: T) { return AjustesPuro.superficie(ha, api.lee("vista.unidades"), dp.fmt); };
    // calidad de los olivos: null = automática (la escala adaptativa de 07b manda); si no, la escala que se fija. 07b la lee con Ajustes.escalaArboles() (ver el informe de U4)
    api.escalaArboles = function () { var c: T = api.lee("graficos.calidad"); return c === "auto" ? null : ({ "0": 0.7, "1": 1, "2": 1.6 } as T)[c]; };
    api.esquema = E;
    escucha(window, "storage", function (ev?: T) { if (!ev || ev.key == null || String(ev.key).indexOf(AjustesPuro.PREFIJO) === 0) api.olvida(); });   // L1-10: otra pestaña cambió un ajuste

    // ----- aplicar: lo que no tiene otro dueño
    // las reglas de Configuración (data-* de <html> y la clase .ajustes) viven en plantilla.css: un <style> creado aquí lo rechaza la CSP (style-src 'self'; V12)
    function ligaControl(id?: T, clave?: T, evento?: T) {   // un control que ya existe en la página (relieve, corrección) y el ajuste se mantienen iguales en las dos direcciones
      var el: T = dp.$(id); if (!el) return;
      escucha(el, evento, function () { if (Number(el.value) !== api.lee(clave)) api.pon(clave, Number(el.value)); });
    }
    function empujaControl(id?: T, valor?: T, evento?: T) {
      var el: T = dp.$(id); if (!el || Number(el.value) === Number(valor)) return;
      el.value = String(valor); el.dispatchEvent(new Event(evento, { bubbles: true }));
    }
    var aplicaPor: T = {
      "graficos.calidad": function (v?: T) {   // el selector de calidad del follaje (13_parcelas lo escucha); «Automática» deja la Media, que es la de siempre
        var s: T = dp.$("calidad"), val: T = v === "auto" ? "1" : v; if (!s || s.value === val) return; s.value = val; s.dispatchEvent(new Event("change", { bubbles: true }));
      },
      "graficos.ahorro": function (v?: T) {   // menos píxeles (resolución 1×) y el bucle a ~30 fotogramas/s (90_final lee el ajuste)
        if (typeof dp.renderer === "undefined") return;
        var pr: T = v ? 1 : Math.min(window.devicePixelRatio || 1, 2); if (dp.renderer.getPixelRatio() === pr) return;
        dp.renderer.setPixelRatio(pr); if (typeof dp.tamano === "function") dp.tamano();
      },
      "vista.exag": function (v?: T) { empujaControl("exag", v, "input"); },
      "vista.corr": function (v?: T) { empujaControl("corr", v, "input"); },
      "vista.brujula": function (v?: T) { raiz.setAttribute("data-brujula", v ? "si" : "no"); },
      "vista.personal": function (v?: T) { raiz.setAttribute("data-personal", v ? "si" : "no"); },
      "vista.unidades": function (v?: T) { raiz.setAttribute("data-unidades", v); },
      "controles.tactil": function () { raiz.setAttribute("data-tactil", tactil() ? "si" : "no"); },
      "controles.mano": function (v?: T) { raiz.setAttribute("data-mano", v); },
      "acc.texto": function (v?: T) { raiz.style.setProperty("--escala-texto", String(v / 100)); raiz.setAttribute("data-texto", v > 100 ? "mayor" : "normal"); },
      "acc.contraste": function (v?: T) { raiz.setAttribute("data-contraste", v ? "alto" : "normal"); },
      "acc.movimiento": function () {
        var antes: T = reducidoYa; reducidoYa = calculaReducido(); raiz.setAttribute("data-movimiento", reducidoYa ? "reducido" : "normal");
        if (antes !== reducidoYa) oyentesMov.slice().forEach(function (fn?: T) { try { fn(reducidoYa); } catch (e: T) {} });
      },
      "avanzado.contador": function () { dp.Bus.emite("medida:muestra", { on: !!api.lee("avanzado.contador") }); }
    };
    var started: T = false;   // el audio solo arranca con un gesto: el primer cambio hecho por la persona
    function aplica(clave?: T) { var f: T = aplicaPor[clave]; if (f) { try { f(api.lee(clave)); } catch (e: T) {} } }

    // ----- la interfaz de Configuración (pestañas ARIA dentro de #menuAjustes)
    var PESTANAS: T = [
      { id: "graficos", t: "Gráficos", campos: [
        { k: "graficos.calidad", t: "Calidad", ops: [["auto", "Automática (recomendada)"], ["0", "Baja"], ["1", "Media"], ["2", "Alta"]], nota: "Automática ajusta sola cuántos olivos se dibujan al detalle según lo que aguante el aparato; Baja, Media y Alta la fijan. Es el selector «Calidad del follaje» de siempre." },
        { k: "graficos.ahorro", t: "Ahorro de batería (resolución 1× y unos 30 fotogramas por segundo)" } ] },
      { id: "vista", t: "Vista", campos: [
        { k: "vista.exag", t: "Relieve exagerado", fmt: function (v?: T) { return dp.fmt(v, v % 1 ? 2 : 0) + "×"; } },
        { k: "vista.corr", t: "Corrección de la ortofoto", fmt: function (v?: T) { return dp.fmt(v, v % 1 ? 2 : 0) + "×"; }, nota: "Ajuste empírico medido en otra finca y aplicado aquí sin recalibrar (las copas se ven desplazadas al este según su altura); no es una ortorrectificación." },
        { k: "vista.brujula", t: "Mostrar la brújula" },
        { k: "vista.personal", t: "Mostrar hora, tu haza, hablar y volver" },
        { k: "vista.suelo", t: "Suelo con texturas de la finca", nota: "Hojarasca, compost, ruedo, camino y piedras de cerca, sacados de fotos de la finca; el color sigue siendo el de la ortofoto. Se aplica al recargar la página. En las gafas sigue apagado hasta medirlo." },
        { k: "vista.tono", t: "Tono (tone mapping)", ops: [["neutro", "Neutro (el de siempre)"], ["agx", "AgX (suave, apaga menos los colores)"], ["aces", "ACES (cinematográfico, más contraste)"], ["neutral", "Neutral de Khronos (fiel a los colores)"]], nota: "Cómo se pasa la luz de la escena a la pantalla. Se aplica al recargar la página; ?tono= en la dirección manda sobre esto. La exposición (?expo=) solo va en la dirección." },
        { k: "vista.a2c", t: "Bordes suaves en hojas y hierba (alphaToCoverage)", nota: "Alisa el borde de las hojas y la hierba cuando hay MSAA; apagado, las copas de cerca salen más limpias. Se aplica al recargar la página; ?a2c=0|1 en la dirección manda sobre esto." },
        { k: "vista.unidades", t: "Superficie en", ops: [["ha", "hectáreas"], ["m2", "metros cuadrados"]] },
        { k: "vista.altura", t: "Altura de la vista", ops: [["pie", "De pie (ojos a 1,62 m)"], ["sentado", "Sentado (ojos a 1,20 m)"]], nota: "Al pasear y en las gafas VR. No depende de tu avatar. En las gafas se suma a la altura que dé el visor: si juegas sentado y el visor ya sabe dónde está el suelo, déjalo en «De pie»." } ] },
      { id: "controles", t: "Controles", campos: [
        { k: "controles.tactil", t: "Controles táctiles", ops: [["auto", "Automático"], ["si", "Siempre"], ["no", "Nunca"]], nota: "Automático: solo con pantalla táctil." },
        { k: "controles.mano", t: "Mano", ops: [["diestra", "Diestra (cruceta a la izquierda)"], ["zurda", "Zurda (cruceta a la derecha)"]] },
        { k: "controles.sens", t: "Sensibilidad al mirar", fmt: function (v?: T) { return dp.fmt(v, 1) + "×"; } },
        { k: "controles.invertir", t: "Invertir el eje vertical al mirar" },
        { k: "controles.tocarIr", t: "Tocar para ir andando", nota: "A pie, un toque corto en el suelo camina hasta allí. Un arrastre no. En la dirección, ?tocar=0 lo apaga." },
        { k: "controles.palanca", t: "Palanca para andar", nota: "En pantalla táctil: apóyala con el pulgar donde quieras. Apagada, vuelve la cruceta. En la dirección, ?palanca=0 la apaga." } ] },
      { id: "vr", t: "Comodidad VR", nota: "Se aplica en las gafas. Nada de esto está probado en unas Quest.", campos: [
        { k: "vr.giro", t: "Giro", ops: [["15", "A saltos de 15°"], ["30", "A saltos de 30°"], ["45", "A saltos de 45°"], ["60", "A saltos de 60°"]] },
        { k: "vr.vineta", t: "Viñeta", ops: [["suave", "Suave"], ["fuerte", "Fuerte"], ["no", "Apagada"]] },
        { k: "vr.vuelo", t: "Permitir vuelo (A) y mirador (B)" },
        { k: "vr.muneca", t: "Menú de muñeca (gira la muñeca izquierda hacia la cara)", nota: "Accesos rápidos pegados a la muñeca: volver al inicio, panel, viñeta, hora e «Ir con». ?xrmuneca (0 o 1) en la dirección manda sobre esto. Sin probar en unas Quest." },
        { k: "vr.multiview", t: "Multiview (dibuja los dos ojos de una vez)", soloBuild: "vr", nota: "Solo en la versión para gafas. Se aplica al recargar la página; ?xrmv (0 o 1) en la dirección manda sobre esto. Sin probar en unas Quest desde este panel." } ] },
      { id: "acc", t: "Accesibilidad", campos: [
        { k: "acc.texto", t: "Tamaño del texto", fmt: function (v?: T) { return v + " %"; } },
        { k: "acc.contraste", t: "Alto contraste en el HUD" },
        { k: "acc.atajos", t: "Atajos de una sola tecla (letras, números, + y −)", nota: "Apágalos si dictas por voz o usas un conmutador: siguen las flechas, Esc, F1, Inicio, Intro, Mayús, Espacio, Re Pág y Av Pág, y todos los botones." },
        { k: "acc.movimiento", t: "Movimiento", ops: [["sistema", "Como el sistema"], ["reducido", "Reducido"], ["normal", "Normal"]], nota: "Reducido: sin animaciones del HUD, sin el vuelo de la cámara ni la caída al pasear, nubes y viento quietos y las máquinas de los interiores paradas al entrar." } ] },
      { id: "avanzado", t: "Avanzado", campos: [
        { k: "avanzado.contador", t: "Contador de rendimiento (lo mismo que ?debug)", nota: "Los fps solo valen en un aparato real; en Chrome sin GPU no son fps de nada." },
        { boton: "Medir 60 s", id: "ajMedir", solo: "contador", nota: "El medidor solo está con el contador encendido (o con &mide=N en la URL)." },
        { boton: "Devolver el chat y el mapa a su sitio", id: "ajRecoloca" },
        { boton: "Restablecer toda la configuración", id: "ajReinicia", texto: function () { return reinicioArmado() ? "Pulsa otra vez para restablecerlo todo" : "Restablecer toda la configuración"; },
          nota: "Vuelve todo a como venía, también el texto, el contraste, el movimiento y la mano. Pide pulsar dos veces." } ] }
    ];

    function recoloca() {   // chat, burbuja y mapa de vuelta a su sitio (UB: Movibles); si aún no está, se borran las posiciones guardadas
      var hecho: T = false;
      try { if (typeof dp.Movibles !== "undefined" && dp.Movibles) {
        if (typeof dp.Movibles.devuelve === "function") { dp.Movibles.devuelve(); hecho = true; }
        else if (typeof dp.Movibles.restablece === "function") { dp.Movibles.restablece(); hecho = true; }
      } } catch (e: T) {}
      if (!hecho) { try { Object.keys(localStorage).forEach(function (k?: T) { if (k.indexOf("gemelo.chat.pos.") === 0 || k.indexOf("gemelo.mapa.pos.") === 0) localStorage.removeItem(k); }); } catch (e: T) {} }
      try { if (typeof dp.Movibles !== "undefined" && dp.Movibles && typeof dp.Movibles.revisa === "function") dp.Movibles.revisa(); } catch (e: T) {}
      try { if (typeof dp.Hud !== "undefined" && dp.Hud && dp.Hud.aviso) dp.Hud.aviso("Chat y mapa en su sitio", 2500); } catch (e: T) {}
    }
    // L6-19: «Restablecer» pide una segunda pulsación en 8 s (el botón cambia su texto y lo dice el aviso del HUD): un toque suelto no borra el contraste ni la mano
    var reinicioT: T = 0;
    function reinicioArmado() { return reinicioT > 0 && Date.now() - reinicioT < 8000; }
    function avisa(t?: T) { try { if (typeof dp.Hud !== "undefined" && dp.Hud && dp.Hud.aviso) dp.Hud.aviso(t, 4000); } catch (e: T) {} }
    var ACCIONES: T = {
      ajMedir: function () { if (!dp.Bus.hay("medida:inicia")) return; var d: T = dp.$("menu"); try { if (d && d.close) d.close(); } catch (e: T) {} dp.Bus.emite("medida:inicia", { segundos: 60 }); },
      ajRecoloca: recoloca,
      ajReinicia: function () {
        if (!reinicioArmado()) { reinicioT = Date.now(); pinta(); avisa("Pulsa otra vez «Restablecer» para volver toda la configuración a como venía (también la accesibilidad)."); return; }
        reinicioT = 0; api.restablece(); pinta(); avisa("Configuración restablecida");
      }
    };

    var cont: T = null, hojas: T = {};   // los controles pintados, por clave
    function el(tag?: T, cls?: T, txt?: T) { var e: T = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function pintaCampo(c?: T, panel?: T) {
      var d: T = el("div", "aj-op");
      if (c.boton) {
        var b: T = el("button", "aj-boton", c.boton); b.type = "button"; b.id = c.id; escucha(b, "click", c.alClic || ACCIONES[c.id]); d.appendChild(b); hojas[c.id] = { boton: b, solo: c.solo, activo: c.activo, texto: c.texto };
      } else if (c.ops) {
        var f: T = el("fieldset"), lg: T = el("legend", null, c.t); f.appendChild(lg); hojas[c.k] = { radios: [] };
        c.ops.forEach(function (o?: T) {
          var l: T = el("label", "aj-fila"), i: T = el("input"); i.type = "radio"; i.name = "aj-" + c.k; i.value = o[0]; i.setAttribute("data-aj", c.k);
          l.appendChild(i); l.appendChild(document.createTextNode(o[1])); f.appendChild(l); hojas[c.k].radios.push(i);
        });
        d.appendChild(f);
      } else if (E[c.k].tipo === "bool") {
        var l2: T = el("label", "aj-fila"), i2: T = el("input"); i2.type = "checkbox"; i2.id = "aj-c-" + c.k; i2.name = i2.id; i2.setAttribute("data-aj", c.k); l2.appendChild(i2); l2.appendChild(document.createTextNode(c.t)); d.appendChild(l2); hojas[c.k] = { casilla: i2 };
      } else {
        var w: T = el("div", "aj-rango"), fila: T = el("div"), lb: T = el("label", null, c.t), sp: T = el("strong"), r: T = el("input");
        r.type = "range"; r.min = E[c.k].min; r.max = E[c.k].max; r.step = E[c.k].paso; r.id = "aj-r-" + c.k; r.name = "aj-" + c.k; r.setAttribute("data-aj", c.k); lb.htmlFor = r.id; fila.style.cssText = "display:flex;justify-content:space-between;gap:8px";
        sp.style.marginLeft = "auto"; fila.appendChild(lb); fila.appendChild(sp); w.appendChild(fila); w.appendChild(r); d.appendChild(w); hojas[c.k] = { rango: r, valor: sp, fmt: c.fmt };
      }
      if (c.nota) d.appendChild(el("p", "aj-nota", c.nota));
      if (c.k && E[c.k] && Object.keys(URL_FUERZA).indexOf(c.k) >= 0) { var nu: T = el("p", "aj-nota", "Lo fuerza la dirección de la página (?debug)."); nu.hidden = true; d.appendChild(nu); hojas[c.k].urlNota = nu; }
      panel.appendChild(d);
    }
    var URL_FUERZA: T = { "avanzado.contador": 1 };
    function pinta() {   // los controles reflejan los ajustes
      Object.keys(hojas).forEach(function (k?: T) {
        var h: T = hojas[k], v: T = api.lee(k), forz: T = api.forzado(k) !== undefined;
        if (h.radios) h.radios.forEach(function (r?: T) { r.checked = String(v) === r.value; });
        if (h.casilla) { h.casilla.checked = !!v; h.casilla.disabled = forz; }
        if (h.rango) { h.rango.value = String(v); h.valor.textContent = h.fmt ? h.fmt(v) : String(v); }
        if (h.urlNota) h.urlNota.hidden = !forz;
        if (h.boton && h.texto) { try { h.boton.textContent = h.texto(); } catch (e: T) {} }   // un componente (47_habla: retirar el permiso de voz) pone el texto y el estado de su botón
        if (h.boton && h.activo) { try { h.boton.disabled = !h.activo(); } catch (e: T) {} }
        if (h.boton && h.solo === "contador") { var on: T = !!api.lee("avanzado.contador") || /[?&]mide\b/.test(location.search); h.boton.disabled = !on; }
      });
    }
    function seleccionaPestana(id?: T, enfoca?: T) {
      PESTANAS.forEach(function (p?: T) {
        var t: T = document.getElementById("aj-t-" + p.id), q: T = document.getElementById("aj-p-" + p.id), s: T = p.id === id;
        t.setAttribute("aria-selected", String(s)); t.tabIndex = s ? 0 : -1; q.hidden = !s; if (s && enfoca) t.focus();
      });
    }
    var lista: T = null;
    function construyePestana(p?: T) {   // su pestaña y su panel (al construir o, si llega de un componente, después)
      var t: T = el("button", null, p.t); t.type = "button"; t.id = "aj-t-" + p.id; t.setAttribute("role", "tab"); t.setAttribute("aria-controls", "aj-p-" + p.id); t.setAttribute("aria-selected", "false"); t.tabIndex = -1;
      escucha(t, "click", function () { seleccionaPestana(p.id, false); });
      escucha(t, "keydown", function (e?: T) {
        var n: T = PESTANAS.indexOf(p), m: T = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as T)[e.key], d: T = null;
        if (m) d = (n + m + PESTANAS.length) % PESTANAS.length; else if (e.key === "Home") d = 0; else if (e.key === "End") d = PESTANAS.length - 1;
        if (d !== null) { e.preventDefault(); seleccionaPestana(PESTANAS[d].id, true); }
      });
      lista.appendChild(t);
      var q: T = el("div"); q.id = "aj-p-" + p.id; q.setAttribute("role", "tabpanel"); q.setAttribute("aria-labelledby", t.id); q.hidden = true;
      q.appendChild(el("h3", null, p.t)); if (p.nota) q.appendChild(el("p", "aj-nota", p.nota));
      p.campos.forEach(function (c?: T) { if (c.soloBuild && (typeof dp.Render === "undefined" || dp.Render.build !== c.soloBuild)) return; pintaCampo(c, q); });   // soloBuild: el control existe solo en esa build (el multiview, en la de VR)
      cont.appendChild(q);
    }
    function construye() {
      var host: T = document.getElementById("menuAjustes");
      if (!host) { var dlg: T = document.getElementById("menu"); if (!dlg || dlg.tagName !== "DIALOG") return; host = document.createElement("section"); host.id = "menuAjustes"; host.setAttribute("aria-label", "Configuración"); dlg.appendChild(host); }
      if (host.getAttribute("data-ajustes") === "listo") return; host.setAttribute("data-ajustes", "listo"); host.classList.add("ajustes"); cont = host;
      lista = el("div", "aj-pestanas"); lista.setAttribute("role", "tablist"); lista.setAttribute("aria-label", "Configuración");
      host.appendChild(lista);
      PESTANAS.forEach(construyePestana);
      escucha(host, "change", function (e?: T) { var i: T = e.target, k: T = i.getAttribute && i.getAttribute("data-aj"); if (!k) return; started = true; api.pon(k, E[k].tipo === "bool" ? i.checked : E[k].tipo === "num" ? Number(i.value) : i.value); });
      escucha(host, "input", function (e?: T) { var i: T = e.target, k: T = i.getAttribute && i.getAttribute("data-aj"); if (!k || i.type !== "range") return; started = true; api.pon(k, Number(i.value)); });
      seleccionaPestana(PESTANAS[0].id, false); pinta();
    }

    // ----- arranque
    var textoBtn: T = dp.$("btnSonido"); if (textoBtn && textoBtn.parentNode) textoBtn.parentNode.removeChild(textoBtn);   // el 🔊 duplicado (decisión 89)
    var cs: T = dp.$("cSonido"); if (cs) { var lab: T = cs.closest && cs.closest("label"); if (lab) lab.hidden = true; }   // la casilla vieja de Capas: el sonido tiene ahora su pestaña (la añade el componente, Ajustes.registra)
    ligaControl("exag", "vista.exag", "input"); ligaControl("corr", "vista.corr", "input");
    api.alCambiar(function (clave?: T) { aplica(clave); pinta(); });
    if (window.matchMedia) { try { escucha(matchMedia("(prefers-reduced-motion: reduce)"), "change", function () { aplica("acc.movimiento"); }); escucha(matchMedia("(pointer: coarse)"), "change", function () { aplica("controles.tactil"); }); } catch (e: T) {} }
    api.claves().forEach(aplica);
    if (dp.movimiento) alMovimiento(dp.movimiento);   // L6-03
    api.pinta = function () { construye(); pinta(); };   // por si el menú se crea después
    // punto de extensión (ADR-0023, C2): Ajustes.registra(prefijo, esquema, pestaña, aplica?) añade los ajustes de un componente (AjustesPuro.fusiona) y su
    // pestaña en Configuración, antes de «Avanzado»: pestaña = { id?, t, nota?, campos: [{ k (sin prefijo), t, ops?, fmt?, nota? } | { boton, id, alClic, activo?(), texto?(), nota? }] }. aplica(clave, valor), si
    // se da, se llama al registrarse y en cada cambio de sus claves, como los aplicaPor de aquí. Devuelve quita (saca la pestaña y las claves; lo guardado
    // se queda para la próxima vez), o null si el esquema no vale (lo dice en la consola).
    api.registra = function (prefijo?: T, esquema?: T, pestana?: T, aplicaFn?: T) {
      var e: T = AjustesPuro.fusiona(prefijo, esquema);
      if (e.length) { try { console.error("[Ajustes] " + prefijo + ": " + e.join("; ")); } catch (er: T) {} return null; }
      var p: T = null, quitaOy: T = null;
      if (pestana) {
        p = { id: pestana.id || prefijo, t: pestana.t || prefijo, nota: pestana.nota, campos: (pestana.campos || []).map(function (c?: T) { return c.boton ? Object.assign({}, c) : Object.assign({}, c, { k: prefijo + "." + c.k }); }) };
        PESTANAS.splice(Math.max(0, PESTANAS.length - 1), 0, p);
        if (cont) { construyePestana(p); var av: T = document.getElementById("aj-t-avanzado"), tp: T = document.getElementById("aj-t-" + p.id); if (av && tp) lista.insertBefore(tp, av); pinta(); }
      }
      if (typeof aplicaFn === "function") {
        quitaOy = api.alCambiar(function (k?: T, v?: T) { if (k && k.indexOf(prefijo + ".") === 0) { try { aplicaFn(k, v); } catch (er: T) {} } });
        Object.keys(esquema).forEach(function (k?: T) { try { aplicaFn(prefijo + "." + k, api.lee(prefijo + "." + k)); } catch (er: T) {} });
      }
      return function () {
        if (quitaOy) quitaOy();
        if (p) {
          var i: T = PESTANAS.indexOf(p), sel: T = document.getElementById("aj-t-" + p.id), eraSel: T = !!(sel && sel.getAttribute("aria-selected") === "true");
          if (i >= 0) PESTANAS.splice(i, 1);
          ["aj-t-", "aj-p-"].forEach(function (x?: T) { var n: T = document.getElementById(x + p.id); if (n && n.parentNode) n.parentNode.removeChild(n); });
          p.campos.forEach(function (c?: T) { delete hojas[c.boton ? c.id : c.k]; });
          if (cont && eraSel) seleccionaPestana(PESTANAS[0].id, false);
        }
        AjustesPuro.retira(prefijo);
      };
    };
    construye();
    // A3-7a: libera() quita las escuchas (controles, deslizadores de la página y media queries) y saca la interfaz pintada en #menuAjustes; el almacén sigue (Ajustes.lee vale)
    api.libera = function () {
      sol.suelta();
      // L1-10: sin la escucha de «storage» (y de la media query), lo recordado ya no se entera de otra pestaña ni del sistema: se deja de recordar
      api.sinCache(); reducidoYa = null;
      if (cont) { while (cont.firstChild) cont.removeChild(cont.firstChild); cont.removeAttribute("data-ajustes"); cont.classList.remove("ajustes"); if (cont.getAttribute("aria-label") === "Configuración" && !cont.children.length && cont.parentNode && cont.parentNode.id === "menu") cont.parentNode.removeChild(cont); }
      cont = null; lista = null; hojas = {};
    };
    return api;
  })();
  return Ajustes;
}
export type Ajustes = ReturnType<typeof creaAjustes>;

/** El componente «configuracion» (solo ciclo de vida; de todos los mundos): lo registra el talón de 33 con Componentes.registra */
export function manifiestoAjustes(api: { libera(): void }): Manifiesto {
  return {
    id: ID_CONFIGURACION, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: ["medida:inicia", "medida:muestra"] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
