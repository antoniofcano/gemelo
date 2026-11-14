// El minimapa del paseo (MU5-n, A3-7a: antes apps/web/motor/17_minimapa.js, que queda como talón): la ortofoto vista desde arriba con tú, tu rastro, el dron, las
// balizas, los demás y las capas que añaden otros (Minimapa.capa), en una ventana flotante y movible (34_movibles) que se pliega con M. Vive en ui/ porque es un
// lienzo 2D del DOM, pero es SOLO DEL EXTERIOR: dibuja la finca (la ortofoto de Mundo.pintaOrto, las parcelas de D, los olivos de cIn), que le llega por argumento;
// en un interior no hay nada que pintar, y un mundo que quiera su mapa tendrá su propio componente. Componente «minimapa» con mundos: ["exterior"]: su libera()
// quita las escuchas del lienzo, de los botones y del teclado, cancela el enganche a Movibles si no ha saltado, olvida las capas y devuelve el lienzo #mapita a su
// sitio de la plantilla (saca la ventana flotante que creó). Código movido tal cual (solo se tipan parámetros y variables, y «x.addEventListener(» pasa a
// «escucha(x, »); lo que el legado reescribe o declara después (paseando, enQuad, enDron, avisoBaliza, dibujaBalizasMini, Movibles) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_MINIMAPA = "minimapa-finca";   // no «minimapa»: 90_final nombra así su bloque del Reparto (componentes.test.js mira que nadie nombre a un componente)

/** Lo que el talón de 17 le da: la finca (D, x0, yN, ANCHO, ALTO de 01_datos; Mundo y cIn de 02_mundo), $, Entidades y Usables (02e), pp (12_paseo) y dr (16_vida);
 *  por getter, lo que cambia (paseando, enQuad, enDron) o se declara después (avisoBaliza y dibujaBalizasMini de 19_balizas, Movibles de 34) */
export interface DepsMinimapa {
  $(id: string): T; D: T; x0: number; yN: number; ANCHO: number; ALTO: number; Mundo: T; cIn: T; Entidades: T; Usables: T; pp: T; dr: T;
  readonly paseando: boolean; readonly enQuad: boolean; readonly enDron: boolean; readonly avisoBaliza: (k: T) => void; readonly dibujaBalizasMini: (c: T, X: T, Y: T, bal: T) => void; readonly Movibles: T;
  ventana: T; documento: T;
}

export function creaMinimapa(dp: DepsMinimapa) {
  var window: T = dp.ventana, document: T = dp.documento, sol = creaSoltador(), escucha = sol.escucha;
  // ---------- el minimapa del paseo: la ortofoto vista desde arriba con tú, tu rastro, el dron y los conejos (M o un toque cambia el zoom)
  var mini: T = { cv: dp.$("mapita"), cerca: false, oculto: false, rastro: [], t: 0, pts: [], bal: [], sel: null }, MW: T = 240, MH: T = Math.round(MW * dp.ALTO / dp.ANCHO);
  // I1: con la presencia compartida, los demás que se ven (las entidades «persona», Entidades.lista: de tu sala, con pose y sin bloquear) salen como puntos
  // violeta (en quad, un cuadrado; con el dron, un rombo). Un toque en un punto muestra su alias («toca otra vez para ir»); otro toque en 4 s te lleva con esa
  // persona (su acción «ir», Usables.usa: la misma que «Ir con» de su ficha y del panel VR). Sin presencia no hay tipo «persona» y no sale nadie
  var SEL_T: T = 4, TOQUE: T = 14;
  (function () {
    var dpr: T = Math.min(window.devicePixelRatio || 1, 2); mini.cv.width = MW * dpr; mini.cv.height = MH * dpr; mini.cv.style.width = MW + "px"; mini.cv.style.height = MH + "px"; mini.dpr = dpr; mini.ctx = mini.cv.getContext("2d");
    function cambia() { mini.cerca = !mini.cerca; mini.t = 1; mini.cv.title = mini.cerca ? "Vista cercana: toca para ver toda la finca" : "Toda la finca: toca para acercar"; pintaZoom(); }
    escucha(mini.cv, "click", function (e?: T) {
      var r: T = mini.cv.getBoundingClientRect(), x: T = (e.clientX - r.left) * MW / (r.width || MW), y: T = (e.clientY - r.top) * MH / (r.height || MH), mejor: T = null, dm: T = TOQUE * TOQUE;
      if (Minimapa.toca(x, y)) { mini.sel = null; return; }   // una capa con toque (la puerta del cortijo) manda
      mini.pts.forEach(function (p?: T) { var d: T = (p.px - x) * (p.px - x) + (p.py - y) * (p.py - y); if (d < dm) { dm = d; mejor = p; } });
      if (!mejor) {   // I4: el rombo de una baliza abre su aviso («¿Ir a esta baliza?»); fuera de puntos y rombos, cambia el zoom, como siempre
        var bal: T = null, db: T = TOQUE * TOQUE;
        mini.bal.forEach(function (p?: T) { var d: T = (p.px - x) * (p.px - x) + (p.py - y) * (p.py - y); if (d < db) { db = d; bal = p; } });
        mini.sel = null; if (bal) dp.avisoBaliza(bal.k); else cambia(); return;
      }
      if (mini.sel && mini.sel.id === mejor.id && mini.sel.t > 0) { mini.sel = null; dp.Usables.usa(mejor.id, "ir"); }   // segundo toque: vamos
      else mini.sel = { id: mejor.id, t: SEL_T };
      mini.t = 1;
    });
    mini.cv.title = "Toda la finca: toca para acercar";
    // el minimapa es una ventana flotante y movible (34_movibles.js): una barra con el agarre ⠿, el zoom y plegar. Plegado deja solo la barra (así se vuelve a abrir
    // también con el dedo); M lo pliega y lo despliega en el paseo. La brújula (N ↑) ya no lo oculta. Se recuerda en este navegador (si el almacenamiento falla, solo dura la visita)
    try { mini.oculto = localStorage.getItem("gemelo.minimapa") === "oculto"; } catch (e: T) {}
    var bru: T = dp.$("norte");
    if (bru) { bru.removeAttribute("aria-pressed"); bru.title = "Brújula: el norte, arriba"; }
    var mb: T = "font:inherit;color:inherit;background:none;border:0;min-width:44px;min-height:44px;cursor:pointer;padding:0;font-size:1.0625rem";
    function boton(txt?: T, etiqueta?: T, clase?: T) { var b: T = document.createElement("button"); b.type = "button"; b.textContent = txt; b.setAttribute("aria-label", etiqueta); b.title = etiqueta; b.style.cssText = mb; if (clase) b.className = clase; return b; }
    var agarre: T = boton("⠿", "Mover el minimapa: flechas del teclado (Mayús, más deprisa; Inicio, a su sitio)", "agarre"), tit: T = document.createElement("strong"),
      bZoom: T = boton("🔍", "Acercar el mapa"), bPlega: T = boton("▾", "Plegar el minimapa"), asa: T = document.createElement("div");
    agarre.style.cursor = "grab"; agarre.style.color = "rgba(255,255,255,0.7)"; tit.textContent = "Mapa"; tit.style.cssText = "flex:1;font-size:.8125rem;padding-right:6px";
    asa.className = "asa"; asa.style.cssText = "display:flex;align-items:center;gap:2px;padding-left:2px;cursor:grab"; [agarre, tit, bZoom, bPlega].forEach(function (e?: T) { asa.appendChild(e); });
    var wrap: T = document.createElement("div"); wrap.id = "mapaFlotante"; wrap.hidden = true;
    wrap.style.cssText = "position:absolute;left:14px;top:48px;z-index:6;border-radius:10px;overflow:hidden;width:max-content;max-width:calc(100% - 28px);background:rgba(16,20,24,0.88);color:#fff;font:.8125rem system-ui,sans-serif;border:1.5px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(0,0,0,.28)";
    mini.cv.parentNode.insertBefore(wrap, mini.cv); wrap.appendChild(asa); wrap.appendChild(mini.cv);
    mini.cv.hidden = false; mini.cv.style.cssText += ";position:static;display:block;border:0;border-radius:0;box-shadow:none;max-width:none";
    mini.wrap = wrap;
    function pintaZoom() { bZoom.setAttribute("aria-pressed", String(mini.cerca)); bZoom.title = mini.cerca ? "Ver toda la finca" : "Acercar el mapa"; bZoom.setAttribute("aria-label", bZoom.title); }
    function pintaPlega() { mini.cv.hidden = mini.oculto; bPlega.textContent = mini.oculto ? "▸" : "▾"; bPlega.title = mini.oculto ? "Desplegar el minimapa (M)" : "Plegar el minimapa (M)"; bPlega.setAttribute("aria-label", bPlega.title); bPlega.setAttribute("aria-expanded", String(!mini.oculto)); }
    function plega(v?: T) {
      mini.oculto = v; pintaPlega(); mini.t = 1;
      try { localStorage.setItem("gemelo.minimapa", mini.oculto ? "oculto" : "visible"); } catch (e: T) {}
      if (typeof dp.Movibles !== "undefined" && dp.Movibles) dp.Movibles.revisa();   // al plegarse o desplegarse cambia de tamaño: que no pise nada
    }
    escucha(bZoom, "click", cambia); escucha(bPlega, "click", function () { plega(!mini.oculto); });
    pintaZoom(); pintaPlega();
    mini.plega = plega;
    // 34_movibles.js se carga después de este módulo: se engancha cuando ya está
    sol.espera(setTimeout(function () { if (typeof dp.Movibles !== "undefined" && dp.Movibles) mini.mov = dp.Movibles.hazMovible(wrap, asa, "mapa", null, { defecto: function (d?: T) { return d.tactil ? { x: d.W - d.mg.r - d.w - 10, y: d.mg.t + 64 } : { x: d.mg.l + 14, y: d.mg.t + 112 }; } }); }, 0));
    escucha(window, "keydown", function (e?: T) { if (!dp.paseando || e.code !== "KeyM") return; var t: T = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return; plega(!mini.oculto); e.preventDefault(); });
  })();
  // punto de extensión (ADR-0023, C2): Minimapa.capa(fn, orden?) añade una capa al minimapa; fn(c, X, Y, info) pinta sobre el contexto 2D con X(este) e Y(norte)
  // en píxeles del mapa, info = { cerca, MW, MH }. Se pinta tras balizas y perros y antes de la gente, de ti y del dron, en orden creciente. Devuelve quita.
  // Eje B (la puerta del cortijo): toca(x, y), opcional, recibe un toque en el mapa (px) antes que la gente, las balizas y el zoom; si devuelve true, es suyo.
  var Minimapa: T = (function () {
    var capas: T = [];
    function capa(fn?: T, orden?: T, toca?: T) {
      if (typeof fn !== "function") return function () {};
      var c: T = { fn: fn, orden: orden || 0, toca: typeof toca === "function" ? toca : null }; capas.push(c); capas.sort(function (a?: T, b?: T) { return a.orden - b.orden; }); mini.t = 1;
      return function () { var i: T = capas.indexOf(c); if (i >= 0) capas.splice(i, 1); mini.t = 1; };
    }
    function pinta(c?: T, X?: T, Y?: T, info?: T) { for (var i: T = 0; i < capas.length; i++) { c.save(); try { capas[i].fn(c, X, Y, info); } catch (e: T) {} c.restore(); } }
    function toca(x?: T, y?: T) { for (var i: T = capas.length - 1; i >= 0; i--) { var f: T = capas[i].toca; if (!f) continue; try { if (f(x, y)) { mini.t = 1; return true; } } catch (e: T) {} } return false; }
    return { capa: capa, pinta: pinta, toca: toca, cuantas: function () { return capas.length; }, olvida: function () { capas.length = 0; } };   // olvida: A3-7a, para libera()
  })();
  // tu rastro: un punto cada 2,5 m, hasta 240 (AG-1.4c: sin Math.hypot —se compara el cuadrado— y sin crear un par nuevo por punto una vez lleno: se recicla el más viejo)
  function actualizaRastro() {
    var r: T = mini.rastro, u: T = r[r.length - 1], dx: T = u ? u[0] - dp.pp.x : 0, dy: T = u ? u[1] - dp.pp.y : 0, d2: T = dx * dx + dy * dy, q: T;
    if (u && d2 > 625) r.length = 0;   // un salto (ir con alguien): el rastro empieza de nuevo, sin una raya de lado a lado
    if (!u || d2 > 6.25) {
      if (r.length >= 240) { q = r.shift(); q[0] = dp.pp.x; q[1] = dp.pp.y; } else q = [dp.pp.x, dp.pp.y];   // reserva-ok: solo mientras el rastro crece hasta 240 puntos
      r.push(q);
    }
  }
  function actualizaMinimapa(dt?: T) {
    var ver: T = dp.paseando; mini.wrap.hidden = !ver;
    if (ver !== mini.ver) { mini.ver = ver; if (ver && mini.mov) mini.mov.coloca(); }   // al aparecer, a su sitio guardado (o el de partida), fuera de los controles
    if (!dp.paseando) { mini.rastro.length = 0; return; }
    actualizaRastro();
    if (mini.sel) { mini.sel.t -= dt; if (mini.sel.t <= 0) { mini.sel = null; mini.t = 1; } }
    mini.t += dt; if (mini.oculto || mini.t < 0.08) return; mini.t = 0;   // oculto: sigue el rastro, pero no se pinta
    var c: T = mini.ctx, k: T = mini.dpr, ancho: T = mini.cerca ? 150 : dp.ANCHO, alto: T = ancho * dp.ALTO / dp.ANCHO, cx0: T = mini.cerca ? dp.pp.x : dp.x0 + dp.ANCHO / 2, cy0: T = mini.cerca ? dp.pp.y : dp.yN - dp.ALTO / 2;
    var vx0: T = cx0 - ancho / 2, vy1: T = cy0 + alto / 2, esc: T = MW / ancho;     // ventana del mapa: x este, y norte
    var X: T = function (x?: T) { return (x - vx0) * esc; }, Y: T = function (y?: T) { return (vy1 - y) * esc; };
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, MW, MH);
    c.save(); c.beginPath(); c.rect(0, 0, MW, MH); c.clip();
    dp.Mundo.pintaOrto(c, vx0, vy1, ancho, alto, MW, MH);
    c.fillStyle = "rgba(10,14,8,0.18)"; c.fillRect(0, 0, MW, MH);
    // las parcelas: contorno de luz
    c.lineWidth = 1.6; c.strokeStyle = "#40f0ff"; c.fillStyle = "rgba(64,240,255,0.08)";
    dp.D.parcelas.forEach(function (pr?: T) { c.beginPath(); pr.linde.forEach(function (q?: T, i?: T) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); c.closePath(); c.fill(); c.stroke(); });
    if (mini.cerca) { c.fillStyle = "rgba(140,190,90,0.9)"; dp.cIn.forEach(function (o?: T) { var px: T = X(o.x), py: T = Y(o.y); if (px > -3 && px < MW + 3 && py > -3 && py < MH + 3) { c.beginPath(); c.arc(px, py, 1.6, 0, 6.283); c.fill(); } }); }
    // tu rastro
    c.lineWidth = 2; c.strokeStyle = "rgba(255,154,46,0.9)"; c.beginPath(); mini.rastro.forEach(function (q?: T, i?: T) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); c.stroke();
    // (los conejos los pinta su componente, fauna-olivar, con Minimapa.capa)
    dp.dibujaBalizasMini(c, X, Y, mini.bal); Minimapa.pinta(c, X, Y, { cerca: mini.cerca, MW: MW, MH: MH });
    // los demás (solo con la presencia compartida): violeta con borde blanco, distinto de tu flecha naranja; en vista cercana, con su alias al lado
    mini.pts.length = 0;
    var gente: T = dp.Entidades.lista("persona");   // [{ id: "persona:…", alias, x este, y norte, modo }] o null sin presencia
    if (gente) {
      var etiq: T = [];
      c.lineWidth = 1.4; c.strokeStyle = "#ffffff"; c.fillStyle = "#b26bff";
      gente.forEach(function (g?: T) {
        var px: T = X(g.x), py: T = Y(g.y); if (px < -4 || px > MW + 4 || py < -4 || py > MH + 4) return;
        mini.pts.push({ id: g.id, px: px, py: py });
        c.beginPath();
        if (g.modo === 1) c.rect(px - 4, py - 4, 8, 8);   // en quad
        else if (g.modo === 2) { c.moveTo(px, py - 5.5); c.lineTo(px + 5.5, py); c.lineTo(px, py + 5.5); c.lineTo(px - 5.5, py); c.closePath(); }   // con el dron
        else c.arc(px, py, 4, 0, 6.283);
        c.fill(); c.stroke();
        var sel: T = mini.sel && mini.sel.id === g.id;
        if (sel || mini.cerca) etiq.push({ t: sel ? g.alias + " · toca otra vez para ir" : g.alias, px: px, py: py, sel: sel });
      });
      if (mini.sel && !mini.pts.some(function (p?: T) { return p.id === mini.sel.id; })) mini.sel = null;   // ya no se ve: se olvida
      c.font = "600 10px system-ui, sans-serif"; c.textBaseline = "middle";
      etiq.forEach(function (e?: T) {
        var w: T = c.measureText(e.t).width + 8, ex: T = Math.max(2, Math.min(MW - w - 2, e.px + 7)), ey: T = Math.max(8, Math.min(MH - 8, e.py));
        c.fillStyle = e.sel ? "rgba(178,107,255,0.92)" : "rgba(16,20,24,0.72)"; c.fillRect(ex, ey - 7, w, 14);
        c.fillStyle = "#ffffff"; c.textAlign = "left"; c.fillText(e.t, ex + 4, ey + 0.5);
      });
      c.textBaseline = "alphabetic";
    }
    // el dron, unido a ti con un hilo, y el cuadro de lo que ve
    if (dp.enDron) {
      var dx: T = X(dp.dr.x), dy: T = Y(dp.dr.y); c.strokeStyle = "rgba(64,240,255,0.7)"; c.lineWidth = 1; c.beginPath(); c.moveTo(X(dp.pp.x), Y(dp.pp.y)); c.lineTo(dx, dy); c.stroke();
      c.save(); c.translate(dx, dy); c.rotate(dp.dr.yaw); c.fillStyle = "#40f0ff"; c.strokeStyle = "#06222a"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -6); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    // tú: una flecha que mira hacia donde miras (el quad, más grande)
    c.save(); c.translate(X(dp.pp.x), Y(dp.pp.y)); c.rotate(dp.pp.ang); var s: T = dp.enQuad ? 1.25 : 1;
    c.fillStyle = "rgba(255,255,255,0.22)"; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 22 * s, -1.95, -1.19); c.closePath(); c.fill();   // el campo de visión
    c.fillStyle = "#ff7a1a"; c.strokeStyle = "#ffffff"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -8 * s); c.lineTo(6 * s, 6 * s); c.lineTo(0, 3 * s); c.lineTo(-6 * s, 6 * s); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.restore();
    c.fillStyle = "rgba(255,255,255,0.92)"; c.font = "600 11px system-ui, sans-serif"; c.textAlign = "center"; c.fillText("N", MW - 12, 14);
    c.font = "500 10px system-ui, sans-serif"; c.textAlign = "left"; c.fillStyle = "rgba(255,255,255,0.9)"; c.fillText(mini.cerca ? "150 m" : "finca", 7, MH - 7);
  }


  // A3-7a: libera() quita las escuchas y el enganche pendiente a Movibles, olvida las capas y devuelve #mapita a su sitio (fuera de la ventana flotante, que se saca)
  function libera() {
    sol.suelta(); Minimapa.olvida();
    var w: T = mini.wrap; if (w && w.parentNode) { w.parentNode.insertBefore(mini.cv, w); w.parentNode.removeChild(w); }
    mini.rastro.length = 0; mini.pts.length = 0; mini.sel = null;
  }
  return { Minimapa: Minimapa, actualizaMinimapa: actualizaMinimapa, mini: mini, libera: libera };
}
export type MinimapaUI = ReturnType<typeof creaMinimapa>;

/** El componente «minimapa» (solo ciclo de vida; SOLO DEL EXTERIOR: dibuja la finca): lo registra el talón de 17 con Componentes.registra */
export function manifiestoMinimapa(api: { libera(): void }): Manifiesto {
  return {
    id: ID_MINIMAPA, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: ["exterior"], dom: ["#mapita"],   // A3-8b: el minimapa, escondido fuera del exterior (el HUD del exterior ya lo escondía, MU2-6)
    monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
