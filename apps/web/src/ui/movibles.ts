// Las ventanas flotantes que se pueden mover (UX-del-juego §6; MU5-n, A3-7a: antes apps/web/motor/34_movibles.js, que queda como talón): el chat, su burbuja y el
// minimapa se arrastran por su barra, recuerdan su sitio por forma de pantalla y nunca se quedan encima de los controles. Componente «movibles» de TODOS los
// mundos (las ventanas flotantes son de la página): su libera() quita las escuchas de cada asa, del menú «Llevar a…», de la ventana y el observador del visor,
// cancela el fotograma y el aviso pendientes y saca los nodos que creó (el aviso, las zonas y los menús). Código movido tal cual (solo se tipan parámetros y
// variables, y «x.addEventListener(» pasa a «escucha(x, », el soltador); lo que el legado reescribe o declara después (Hud) entra por getter (dp.Hud).
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_MOVIBLES = "movibles";

/** Lo que el talón de 34 le da: el visor (03_escena), el HUD (31_hud, por getter: se monta antes, pero así lo lee siempre al día) y la ventana y el documento */
export interface DepsMovibles { visor: T; readonly Hud: T; ventana: T; documento: T }

  // ---------- ventanas flotantes que se pueden mover (UX-del-juego §6): el chat, su burbuja y el minimapa se arrastran por su barra, recuerdan su sitio por
  // forma de pantalla (escritorio, vertical, horizontal) y nunca se quedan encima de los controles (cruceta, barra, estado, «Pasear aquí»): si caen allí,
  // se apartan al hueco libre más cercano. Sin arrastrar (WCAG 2.5.7): flechas e Inicio desde el agarre y «Llevar a…» con las cuatro esquinas.
  // Regla 12: el arrastre son Pointer Events del navegador (≈ 30 líneas). @neodrag/vanilla (lo que proponía UX §7) no evita varios rectángulos a la vez
  // —esa lógica es la que hay que escribir de todos modos—, añadiría una dependencia y una importación dinámica que la salida artefacto (un solo HTML, sin servidor) no puede resolver.
  // [puro:inicio]
  // El cálculo, sin DOM (lo evalúa en Node pruebas/guardianes/movibles.test.js): rectángulos {x, y, w, h} en píxeles del contenedor.
export var MoviblesPuro: T = (function () {
    var HUECO: T = 6, SEPARA: T = 4;
    function seCruzan(a?: T, b?: T) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    // PB8: «¿se solapa X con la cruceta o la barra?» como función: la primera zona (de las que no son null) que r cruza, o null si está libre; lo usan los asserts de
    // colocación de movibles_chrome.test.js (lo que antes comprobaba el navegador rectángulo a rectángulo, ahora se prueba en Node con rectángulos)
    function tapaA(r?: T, zonas?: T) { for (var i: T = 0; i < zonas.length; i++) if (zonas[i] && seCruzan(r, zonas[i])) return zonas[i]; return null; }
    // r cabe en el contenedor {w, h} con una tolerancia de tol px (0,5 por defecto: el redondeo del navegador)
    function dentroDe(r?: T, v?: T, tol?: T) { tol = tol == null ? 0.5 : tol; return r.x >= -tol && r.y >= -tol && r.x + r.w <= v.w + tol && r.y + r.h <= v.h + tol; }
    function engorda(r?: T, m?: T) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
    function marg(mg?: T) { mg = mg || {}; return { t: mg.t || 0, b: mg.b || 0, l: mg.l || 0, r: mg.r || 0 }; }
    // t: {w, h} lo que ocupa la ventana; W, H: el contenedor; mg: márgenes de zona segura. Lo deja dentro, con 6 px de aire
    function limita(t?: T, x?: T, y?: T, W?: T, H?: T, mg?: T) {
      mg = marg(mg);
      var xmax: T = Math.max(mg.l + HUECO, W - mg.r - t.w - HUECO), ymax: T = Math.max(mg.t + HUECO, H - mg.b - t.h - HUECO);
      return { x: Math.max(mg.l + HUECO, Math.min(xmax, x)), y: Math.max(mg.t + HUECO, Math.min(ymax, y)) };
    }
    // el sitio libre más cercano a (x, y) fuera de las zonas (que ya vienen con su margen): prueba encima, debajo y a los lados de cada zona y una rejilla de reserva.
    // Devuelve {x, y, libre}; libre=false si no hay hueco en ningún sitio (entonces deja la ventana donde la pidieron, dentro de los límites)
    function libre(t?: T, x?: T, y?: T, zonas?: T, W?: T, H?: T, mg?: T) {
      var p: T = limita(t, x, y, W, H, mg);
      function ok(q?: T) { var r: T = { x: q.x, y: q.y, w: t.w, h: t.h }; return zonas.every(function (z?: T) { return !seCruzan(r, z); }); }
      if (ok(p)) return { x: p.x, y: p.y, libre: true };
      var cand: T = [], i: T, gx: T, gy: T;
      zonas.forEach(function (z?: T) { cand.push(limita(t, p.x, z.y - t.h - SEPARA, W, H, mg), limita(t, p.x, z.y + z.h + SEPARA, W, H, mg), limita(t, z.x - t.w - SEPARA, p.y, W, H, mg), limita(t, z.x + z.w + SEPARA, p.y, W, H, mg)); });
      for (gy = 0; gy <= 1.001; gy += 0.125) for (gx = 0; gx <= 1.001; gx += 0.125) cand.push(limita(t, gx * W, gy * H, W, H, mg));
      cand = cand.filter(ok);
      if (!cand.length) return { x: p.x, y: p.y, libre: false };
      var mejor: T = cand[0], dm: T = Infinity, d: T;
      for (i = 0; i < cand.length; i++) { d = Math.hypot(cand[i].x - p.x, cand[i].y - p.y); if (d < dm) { dm = d; mejor = cand[i]; } }
      return { x: mejor.x, y: mejor.y, libre: true };
    }
    // la forma de pantalla, que decide qué sitio guardado vale: lo que vale en vertical no vale al girar
    function forma(W?: T, H?: T, tactil?: T) { return !tactil ? "escritorio" : W >= H ? "horizontal" : "vertical"; }
    function clave(nombre?: T, f?: T) { return "gemelo." + nombre + ".pos." + f; }
    // guardado en fracciones del contenedor; almacen es un Storage (o algo con setItem/getItem/removeItem) o null. Nunca lanza
    function guarda(almacen?: T, nombre?: T, f?: T, x?: T, y?: T, W?: T, H?: T) {
      if (!almacen || !(W > 0) || !(H > 0)) return false;
      try { almacen.setItem(clave(nombre, f), JSON.stringify({ fx: Math.round(x / W * 10000) / 10000, fy: Math.round(y / H * 10000) / 10000 })); return true; } catch (e: T) { return false; }
    }
    function lee(almacen?: T, nombre?: T, f?: T, W?: T, H?: T) {
      if (!almacen) return null;
      try {
        var g: T = JSON.parse(almacen.getItem(clave(nombre, f)));
        if (!g || typeof g.fx !== "number" || typeof g.fy !== "number" || !isFinite(g.fx) || !isFinite(g.fy)) return null;
        return { x: g.fx * W, y: g.fy * H };
      } catch (e: T) { return null; }
    }
    function olvida(almacen?: T, nombres?: T) {
      if (!almacen) return false;
      try { nombres.forEach(function (n?: T) { ["escritorio", "vertical", "horizontal"].forEach(function (f?: T) { almacen.removeItem(clave(n, f)); }); }); return true; } catch (e: T) { return false; }
    }
    // «Llevar a…»: ai arriba-izquierda, ad arriba-derecha, bi abajo-izquierda, bd abajo-derecha (pegada al borde; libre() la aparta de lo que tape)
    function esquina(cual?: T, t?: T, W?: T, H?: T, mg?: T) { return limita(t, cual.charAt(1) === "i" ? 0 : W, cual.charAt(0) === "a" ? 0 : H, W, H, mg); }
    // flechas (16 px; con Mayús, 64 px); null si la tecla no mueve. Inicio lo resuelve quien llama (es su sitio de partida)
    function mueve(tecla?: T, mayus?: T, x?: T, y?: T) {
      var d: T = mayus ? 64 : 16;
      if (tecla === "ArrowLeft") return { x: x - d, y: y }; if (tecla === "ArrowRight") return { x: x + d, y: y };
      if (tecla === "ArrowUp") return { x: x, y: y - d }; if (tecla === "ArrowDown") return { x: x, y: y + d };
      return null;
    }
    return { HUECO: HUECO, seCruzan: seCruzan, tapaA: tapaA, dentroDe: dentroDe, engorda: engorda, limita: limita, libre: libre, forma: forma, clave: clave, guarda: guarda, lee: lee, olvida: olvida, esquina: esquina, mueve: mueve };
  })();
  // [puro:fin]
export function creaMovibles(dp: DepsMovibles) {
  var window: T = dp.ventana, document: T = dp.documento, sol = creaSoltador(), escucha = sol.escucha;
  var Movibles: T = (function () {
    var registro: T = [], SEL_RESPALDO: T = ".pad-mov, .pad-acc, #hudBarra, #hudEstado, #bPasear, .pad, .t-barra, #tIns, #norte", zonasEl: T = null, avisoEl: T = null, tAvisa: T = 0, cola: T = 0;
    function almacen() { try { return window.localStorage; } catch (e: T) { return null; } }
    function cont(m?: T) { return m.el.parentElement || document.body; }
    function medidas(c?: T) {
      var cs: T = getComputedStyle(c), n: T = function (v?: T) { return parseFloat(cs.getPropertyValue(v)) || 0; };
      return { W: c.clientWidth, H: c.clientHeight, mg: { t: n("--sa-t"), b: n("--sa-b"), l: n("--sa-l"), r: n("--sa-r") } };
    }
    function tactil() { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e: T) { return false; } }
    function visible(el?: T) { return !el.hidden && el.getClientRects().length > 0; }
    function relativo(r?: T, c?: T) { var cr: T = c.getBoundingClientRect(); return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }; }
    function tam(m?: T) { return { w: m.el.offsetWidth, h: m.el.offsetHeight }; }
    // lo que una ventana flotante nunca tapa: Hud.zonasProhibidas() (31_hud.js) si existe; si no, los selectores de respaldo. Más el resto de flotantes visibles
    function zonas(m?: T, soloFijas?: T) {
      var c: T = cont(m), z: T = [];
      if (typeof dp.Hud !== "undefined" && dp.Hud && typeof dp.Hud.zonasProhibidas === "function") { try { z = dp.Hud.zonasProhibidas().slice(); } catch (e: T) { z = []; } }
      else Array.prototype.forEach.call(c.ownerDocument.querySelectorAll(SEL_RESPALDO), function (el?: T) { if (c.contains(el) && visible(el)) z.push(relativo(el.getBoundingClientRect(), c)); });
      if (!soloFijas) registro.forEach(function (o?: T) { if (o !== m && o.el.parentElement === c && visible(o.el)) z.push(relativo(o.el.getBoundingClientRect(), c)); });
      return z.map(function (r?: T) { return MoviblesPuro.engorda(r, MoviblesPuro.HUECO); });
    }
    function situa(m?: T, q?: T) { m.el.style.left = Math.round(q.x) + "px"; m.el.style.top = Math.round(q.y) + "px"; }
    // primero evitando también a los otros flotantes; en una pantalla pequeña puede no haber hueco para todos, y entonces solo mandan los controles (cruceta, barra, estado)
    function libreEn(m?: T, x?: T, y?: T) {
      var d: T = medidas(cont(m)), q: T = MoviblesPuro.libre(tam(m), x, y, zonas(m), d.W, d.H, d.mg);
      return q.libre ? q : MoviblesPuro.libre(tam(m), x, y, zonas(m, true), d.W, d.H, d.mg);
    }
    function avisa(txt?: T) {
      if (typeof dp.Hud !== "undefined" && dp.Hud && typeof dp.Hud.aviso === "function") { dp.Hud.aviso(txt, 2500); return; }
      var c: T = registro.length ? cont(registro[0]) : document.body;
      if (!avisoEl || avisoEl.parentElement !== c) { avisoEl = document.createElement("div"); avisoEl.setAttribute("role", "status"); avisoEl.style.cssText = "position:absolute;left:50%;top:48px;transform:translateX(-50%);z-index:40;max-width:calc(100% - 24px);padding:5px 12px;border-radius:99px;font:.8125rem system-ui,sans-serif;color:#fff;background:rgba(16,20,24,0.88);pointer-events:none"; c.appendChild(avisoEl); }
      avisoEl.textContent = txt; avisoEl.hidden = false; clearTimeout(tAvisa); tAvisa = setTimeout(function () { avisoEl.hidden = true; }, 2500);
    }
    function muestraZonas(m?: T, ver?: T) {
      if (zonasEl) { zonasEl.remove(); zonasEl = null; }
      if (!ver) return;
      var c: T = cont(m); zonasEl = document.createElement("div"); zonasEl.setAttribute("aria-hidden", "true"); zonasEl.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:29";
      zonas(m).forEach(function (z?: T) { var d: T = document.createElement("div"); d.style.cssText = "position:absolute;left:" + z.x + "px;top:" + z.y + "px;width:" + z.w + "px;height:" + z.h + "px;border:2px dashed #e5484d;background:rgba(229,72,77,0.12);border-radius:12px"; zonasEl.appendChild(d); });
      c.appendChild(zonasEl);
    }
    function formaAhora(m?: T) { var d: T = medidas(cont(m)); return MoviblesPuro.forma(d.W, d.H, tactil()); }
    function guardaPos(m?: T) { var d: T = medidas(cont(m)); MoviblesPuro.guarda(almacen(), m.nombre, MoviblesPuro.forma(d.W, d.H, tactil()), m.el.offsetLeft, m.el.offsetTop, d.W, d.H); }
    function defecto(m?: T) {
      var d: T = medidas(cont(m)), t: T = tam(m), q: T = m.opc.defecto ? m.opc.defecto({ W: d.W, H: d.H, mg: d.mg, w: t.w, h: t.h, tactil: tactil() }) : null;
      return q || { x: d.mg.l + 10, y: d.H - d.mg.b - t.h - 10 };
    }
    // sitio guardado para esta forma de pantalla (o el de partida), y luego al hueco libre más cercano. Hay que llamarla con la ventana ya visible (si no, no tiene medidas)
    function coloca(m?: T) {
      if (!visible(m.el)) return false;
      var d: T = medidas(cont(m)), g: T = MoviblesPuro.lee(almacen(), m.nombre, MoviblesPuro.forma(d.W, d.H, tactil()), d.W, d.H), q: T = g || defecto(m), l: T = libreEn(m, q.x, q.y);
      situa(m, l); m.forma = MoviblesPuro.forma(d.W, d.H, tactil()); return true;
    }
    function llevaA(m?: T, cual?: T) {
      var d: T = medidas(cont(m)), t: T = tam(m), q: T = cual === "defecto" ? defecto(m) : MoviblesPuro.esquina(cual, t, d.W, d.H, d.mg), l: T = libreEn(m, q.x, q.y);
      situa(m, l); guardaPos(m);
    }
    function hazMovible(el?: T, asa?: T, nombre?: T, alClic?: T, opc?: T) {
      var m: T = { el: el, asa: asa, nombre: nombre, alClic: alClic, opc: opc || {}, forma: "" }, a: T = null;
      registro = registro.filter(function (o?: T) { return o.el !== el; }); registro.push(m);
      if (getComputedStyle(el).position === "static") el.style.position = "absolute";
      asa.style.touchAction = "none";   // solo en el asa: el resto de la ventana (la registro del chat) se sigue desplazando con el dedo
      escucha(asa, "pointerdown", function (e?: T) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        var b: T = e.target.closest ? e.target.closest("button, a, input") : null;
        if (b && b !== asa && !b.classList.contains("agarre")) return;   // los botones de la barra (minimizar, ⋯, zoom…) no arrastran
        a = { id: e.pointerId, x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, mov: 0 };
        try { asa.setPointerCapture(e.pointerId); } catch (x: T) { /* sin captura el arrastre sigue mientras el puntero esté encima */ }
        e.preventDefault();
      });
      escucha(asa, "pointermove", function (e?: T) {
        if (!a || e.pointerId !== a.id) return;
        var dx: T = e.clientX - a.x, dy: T = e.clientY - a.y; a.mov = Math.max(a.mov, Math.hypot(dx, dy));
        if (a.mov < 4) return;
        var d: T = medidas(cont(m)); el.classList.add("arrastrando"); situa(m, MoviblesPuro.limita(tam(m), a.l + dx, a.t + dy, d.W, d.H, d.mg)); if (!zonasEl) muestraZonas(m, true);
      });
      function fin(e?: T) {
        if (!a || e.pointerId !== a.id) return;
        var mov: T = a.mov; a = null; el.classList.remove("arrastrando"); muestraZonas(m, false);
        if (mov < 6) { if (alClic) alClic(); return; }   // un toque sin mover (< 6 px) es un clic (la burbuja se abre)
        var q: T = libreEn(m, el.offsetLeft, el.offsetTop);
        if (Math.abs(q.x - el.offsetLeft) > 1 || Math.abs(q.y - el.offsetTop) > 1) avisa("Recolocado para no tapar los controles");
        situa(m, q); guardaPos(m);
      }
      escucha(asa, "pointerup", fin); escucha(asa, "pointercancel", fin);
      escucha(asa, "click", function (e?: T) { if (e.detail === 0 && alClic && asa === el) alClic(); });   // con teclado (Intro o Espacio) abre; con el dedo lo decide fin()
      escucha(asa, "keydown", function (e?: T) {   // sin arrastrar (WCAG 2.5.7): flechas, Mayús más deprisa, Inicio al sitio de partida
        if (e.target !== asa && !(e.target.classList && e.target.classList.contains("agarre"))) return;
        var q: T = e.key === "Home" ? defecto(m) : MoviblesPuro.mueve(e.key, e.shiftKey, el.offsetLeft, el.offsetTop);
        if (!q) return;
        e.preventDefault(); e.stopPropagation(); situa(m, libreEn(m, q.x, q.y)); guardaPos(m);
      });
      return { coloca: function () { return coloca(m); }, llevaA: function (cual?: T) { llevaA(m, cual); }, el: el, nombre: nombre,
        menuLlevar: function (boton?: T) { return menuLlevar(m, boton); } };
    }
    // «Llevar a…»: el botón ⋯ de la barra abre cuatro esquinas y «Donde estaba al principio» dentro de la propia ventana
    var ESQ: T = [["ai", "↖ Arriba a la izquierda"], ["ad", "↗ Arriba a la derecha"], ["bi", "↙ Abajo a la izquierda"], ["bd", "↘ Abajo a la derecha"], ["defecto", "Donde estaba al principio"]];
    function menuLlevar(m?: T, boton?: T) {
      var menu: T = document.createElement("div"); menu.hidden = true; menu.setAttribute("role", "group"); menu.setAttribute("aria-label", "Llevar a…");
      menu.style.cssText = "position:absolute;right:6px;top:46px;z-index:2;width:220px;max-width:calc(100% - 12px);padding:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;border-radius:10px;background:rgba(16,20,24,0.96);border:1px solid rgba(255,255,255,0.3);color:#fff;font:.8125rem system-ui,sans-serif";
      ESQ.forEach(function (e?: T) {
        var b: T = document.createElement("button"); b.type = "button"; b.textContent = e[1]; b.setAttribute("data-esquina", e[0]);
        b.style.cssText = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;min-height:44px;padding:0 6px;cursor:pointer" + (e[0] === "defecto" ? ";grid-column:1/-1" : "");
        escucha(b, "click", function () { llevaA(m, e[0]); cierra(); var ag: T = m.el.querySelector(".agarre"); if (ag) ag.focus(); });
        menu.appendChild(b);
      });
      function cierra() { menu.hidden = true; boton.setAttribute("aria-expanded", "false"); }
      boton.setAttribute("aria-haspopup", "true"); boton.setAttribute("aria-expanded", "false");
      escucha(boton, "click", function () { var ab: T = menu.hidden; menu.hidden = !ab; boton.setAttribute("aria-expanded", String(ab)); if (ab) menu.querySelector("button").focus(); });
      escucha(menu, "keydown", function (e?: T) { if (e.key === "Escape") { e.stopPropagation(); cierra(); boton.focus(); } });
      m.el.appendChild(sol.nodo(menu));   // A3-7a: libera() lo saca
      return menu;
    }
    // tras un cambio de maniobra (aparece la cruceta), de ventana o de tamaño: nada flotante encima de los controles. Si la forma de pantalla cambió (se giró), vuelve
    // al sitio guardado para la nueva forma. Devuelve cuántas ventanas se han movidas
    function revisa() {
      var movidas: T = 0;
      registro.forEach(function (m?: T) {
        if (!visible(m.el)) return;
        if (m.forma && m.forma !== formaAhora(m)) { coloca(m); movidas++; return; }
        var q: T = libreEn(m, m.el.offsetLeft, m.el.offsetTop);
        if (Math.abs(q.x - m.el.offsetLeft) > 1 || Math.abs(q.y - m.el.offsetTop) > 1) { situa(m, q); movidas++; }
      });
      if (movidas) avisa("He apartado el chat o el mapa para no tapar los controles");
      return movidas;
    }
    function pronto() { if (cola) return; cola = requestAnimationFrame(function () { cola = 0; revisa(); }); }
    // «Devolver el chat y el mapa a su sitio» (Configuración): borra lo guardado y recoloca
    function restablece() {
      MoviblesPuro.olvida(almacen(), registro.map(function (m?: T) { return m.nombre; }));
      registro.forEach(function (m?: T) { coloca(m); });
    }
    escucha(window, "resize", pronto); escucha(window, "orientationchange", pronto);
    if (typeof MutationObserver !== "undefined" && typeof dp.visor !== "undefined" && dp.visor) sol.observa(new MutationObserver(pronto)).observe(dp.visor, { attributes: true });   // la maniobra (la cruceta aparece) cambia las clases del visor
    // L6-05: la columna del estado crece hacia abajo cuando entra la caja de la voz en #hudVoz (la palabra, el micro, el corro): el chat o el mapa que quede
    // debajo se aparta (si no, el chat abierto abajo a la izquierda tapaba «Hablar» del corro: corro_dev, 2026-11-14)
    var estado: T = document.getElementById ? document.getElementById("hudEstado") : null;
    if (typeof MutationObserver !== "undefined" && estado) sol.observa(new MutationObserver(pronto)).observe(estado, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    // A3-7a: libera() suelta lo apuntado (escuchas, observador, menús), cancela el fotograma y el aviso pendientes, saca el aviso y las zonas y olvida el registro
    function libera() {
      sol.suelta(); if (cola) { cancelAnimationFrame(cola); cola = 0; } clearTimeout(tAvisa); muestraZonas(null, false);
      if (avisoEl && avisoEl.parentNode) avisoEl.parentNode.removeChild(avisoEl); avisoEl = null; registro = [];
    }
    return { hazMovible: hazMovible, revisa: revisa, restablece: restablece, coloca: function (el?: T) { registro.forEach(function (m?: T) { if (m.el === el) coloca(m); }); }, libera: libera };
  })();
  return Movibles;
}
export type Movibles = ReturnType<typeof creaMovibles>;

/** El componente «movibles» (solo ciclo de vida; de todos los mundos): lo registra el talón de 34 con Componentes.registra */
export function manifiestoMovibles(api: { libera(): void }): Manifiesto {
  return {
    id: ID_MOVIBLES, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
