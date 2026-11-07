// Entidades y usables (ADR-0023, C7; doc/sistema/COMPONENTES.md §6; MU5-n, A3-7a: antes apps/web/motor/02e_entidades.js, que queda como talón): las cosas del mundo
// con un id estable y UNA sola forma de elegirlas. Entidades es un registro de TIPOS (cada módulo registra el suyo y responde por sus cosas); Usables, la selección
// única para el toque y el clic, el rayo y el gatillo de VR y la cercanía al pasear, con la ficha común (#ficha) y el anillo de resaltado. La lógica pura sigue en
// nucleo/entidades.ts (EntidadesPuro, A1-11). Vive en ui/ porque es la selección y la ficha de la interfaz; lo de cada mundo lo registra su tipo, por argumento.
// Componente «seleccion-usables» de TODOS los mundos: su libera() suelta el anillo (Usables.libera, el de siempre) y además lo que se enganchaba y no se quitaba nunca:
// la × de la ficha, el observador de #ficha y la caja de acciones con su escucha (Usables.desengancha). Código movido tal cual (solo se tipan parámetros y variables);
// lo que se monta después de 02e (la escena y el lienzo de 03, pp de 12, dr y enDron de 16, VRX de 29) y lo que se reescribe (paseando) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { EntidadesPuro } from "../nucleo/entidades.ts";
import type { T } from "./tipos.ts";

export const ID_USABLES = "seleccion-usables";

/** Lo que el talón de 02e le da: $ (01_datos), THREE y el Bus (02c); por getter, lo que se monta después (scene, lienzo, pp, dr, enDron, VRX) o cambia (paseando) */
export interface DepsEntidades {
  $(id: string): T; THREE: T; Bus: T; readonly Materiales: T; readonly scene: T; readonly lienzo: T; readonly pp: T; readonly dr: T; readonly enDron: boolean; readonly paseando: boolean; readonly VRX: T;
  ventana: T; documento: T;
}

export function creaEntidades(dp: DepsEntidades) {
  var window: T = dp.ventana, document: T = dp.documento;
  // ---------- entidades y usables (ADR-0023, C7; doc/sistema/COMPONENTES.md §6): las cosas del mundo con un id estable y UNA sola forma de elegirlas.
  // Entidades: un registro de TIPOS, no de objetos. Cada módulo que tiene cosas en el mundo registra su tipo (olivo, baliza, haza, persona…) y responde
  // por ellas: el registro no copia sus datos (miles de copas siguen en su array), solo sabe a quién preguntar por un id. Ids: «tipo:resto», p. ej.
  // olivo:<finca>:<copas_id> (ADR-0012), baliza:<parcela>, haza:<id>, persona:<id>.
  //   Entidades.registra({ tipo, dueno, prioridad, fondo?, ficha(id, modo), pantalla?(cx, cy, rect), rayo?(raycaster), cerca?(x, y), radioCerca?,
  //     pos?(id) → {x, y, z} (escena), radio?(id) → m, existe?(id), lista?() → [{ id, … }], muestra?(id, modo) → true si la enseña él (su propio recuadro),
  //     abierta?() → id que tiene abierto por su cuenta (la baliza, por cercanía), cierra?(id), suelta?(), sinAnillo?: true }) → quita
  //     pantalla: el toque o el clic en (cx, cy) px de la ventana → { id, s } (s: 0 = de lleno … 1 = en el borde de su tolerancia) o null
  //     rayo: el rayo de un mando (THREE.Raycaster) → { id, t (m por el rayo), s } o null · cerca: quien pasea en (x este, y norte) → { id, d (m) } o null
  //     ficha(id, modo) → { titulo, filas?: [{ k, v, de? }], lineas?, color?, destacado?, gente?, pie?, acciones?: [{ id, txt, fn }] } (texto llano, nunca HTML)
  // Usables: la selección única para el toque y el clic (09_camara), el rayo y el gatillo (29_vr) y la cercanía al pasear. Gana, al tocar, el tipo de más
  // prioridad y dentro de él el más de lleno; con el rayo, el primero por el rayo (a menos de 0,5 m, el de más prioridad); los de fondo (la haza: el suelo
  // bajo el dedo) solo si no hay otro. Una ficha común: en pantalla el recuadro #ficha de siempre (título, pares y botones de acción); en VR la pinta quien
  // se registre como presentador (29_vr, en sus láminas). Resaltado común: un anillo al pie de lo elegido (1 llamada, 80 triángulos, solo mientras hay algo
  // elegido; se crea la primera vez y se libera con Usables.libera). Eventos en el Bus: usable:elige, usable:suelta, usable:usa, usable:cerca.
  // Presupuesto (regla 6): nada por fotograma salvo la cercanía (paseando y cada 0,1 s: una distancia por cosa de los tipos con cerca, hoy las balizas) y
  // recolocar el anillo si está visible; ni un raycast por fotograma (el toque proyecta o lanza un rayo solo al tocar; el rayo de VR, solo al apretar el gatillo).
  // La lógica pura (ids, validación, quién gana, cercanía, líneas de la ficha) pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/entidades.ts (MUNDOS §9.4, pieza 5).
  // Este módulo conserva el registro (Entidades) y la selección (Usables), que tocan el DOM, el Bus y la escena: no es un talón completo.

  // [motor:inicio] (lo evalúa en Node pruebas/guardianes/entidades.test.js con un DOM y un THREE de mentira, y con el Nucleo de verdad)
  var Entidades: T = (function () {
    var P: T = EntidadesPuro, defs: T = {}, orden: T = [];
    function falla(t?: T, e?: T) { try { console.error("[Entidades] " + t, e); } catch (e2: T) {} }
    // registra un tipo; devuelve la función que lo quita (null si la definición no vale o el tipo ya tiene dueño: dos dueños para un tipo, nunca)
    function registra(d?: T) {
      var e: T = P.valida(d);
      if (e.length) { falla((d && d.tipo) + ": " + e.join("; ")); return null; }
      if (defs[d.tipo]) { falla(d.tipo + ": ya lo gestiona " + defs[d.tipo].dueno); return null; }
      defs[d.tipo] = d; orden.push(d.tipo);
      return function () {
        if (defs[d.tipo] !== d) return;
        delete defs[d.tipo]; orden.splice(orden.indexOf(d.tipo), 1);
        Usables.olvida(d.tipo);   // si lo elegido era de este tipo, se suelta
      };
    }
    function de(x?: T) { return defs[P.tipoDe(x)] || null; }
    function tipo(t?: T) { return defs[t] || null; }
    function tipos() { return orden.slice(); }
    function existe(x?: T) { var d: T = de(x); if (!d) return false; try { return d.existe ? !!d.existe(x) : true; } catch (e: T) { falla(x, e); return false; } }
    // complementa(tipo, fn): un componente añade filas y acciones a la ficha de un tipo que no es suyo (P7f: «Nombrar» y «Denunciar» en la del olivo) sin
    // que el tipo lo sepa; fn(ficha, id, modo) modifica la ficha en su sitio (texto llano, como ella). Devuelve la función que lo quita. Un fallo suyo no tira la ficha.
    var extras: T = {};
    function complementa(t?: T, fn?: T) {
      if (typeof t !== "string" || typeof fn !== "function") return function () {};
      (extras[t] = extras[t] || []).push(fn);
      return function () { var l: T = extras[t], i: T = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
    }
    function fichaDe(x?: T, modo?: T) {
      var d: T = de(x), f: T = null; if (!d) return null;
      modo = modo || "pantalla";
      try { f = d.ficha(x, modo); } catch (e: T) { falla(x, e); }
      if (!f) return null;
      (extras[d.tipo] || []).slice().forEach(function (fn?: T) { try { fn(f, x, modo); } catch (e: T) { falla(x, e); } });
      f.id = x; f.tipo = d.tipo; return f;
    }
    function pos(x?: T) { var d: T = de(x); try { return d && d.pos ? d.pos(x) || null : null; } catch (e: T) { falla(x, e); return null; } }
    function listaTipo(t?: T) { var d: T = defs[t]; if (!d) return null; try { return d.lista ? d.lista() || [] : []; } catch (e: T) { falla(t, e); return []; } }   // null: no hay ese tipo
    // pregunta a cada tipo que sepa (metodo = "pantalla", "rayo" o "cerca") y junta sus respuestas como candidatos de EntidadesPuro.gana / cercano
    function candidatos(metodo?: T, a?: T, b?: T, c?: T) {
      var out: T = [];
      orden.forEach(function (t?: T) {
        var d: T = defs[t], r: T; if (typeof d[metodo] !== "function") return;
        try { r = d[metodo](a, b, c); } catch (e: T) { falla(t + "." + metodo, e); return; }
        if (!r) return;
        (Array.isArray(r) ? r : [r]).forEach(function (q?: T) {
          if (q && typeof q.id === "string" && P.tipoDe(q.id) === t) out.push({ id: q.id, tipo: t, prioridad: d.prioridad, fondo: !!d.fondo, s: +q.s || 0, t: +q.t || 0, d: q.d, radio: d.radioCerca });
        });
      });
      return out;
    }
    function resumen() { return orden.map(function (t?: T) { var d: T = defs[t]; return { tipo: t, dueno: d.dueno, prioridad: d.prioridad, fondo: !!d.fondo, toque: !!d.pantalla, rayo: !!d.rayo, cerca: !!d.cerca }; }); }
    return { registra: registra, complementa: complementa, de: de, tipo: tipo, tipos: tipos, existe: existe, ficha: fichaDe, pos: pos, lista: listaTipo, candidatos: candidatos, resumen: resumen };
  })();

  var Usables: T = (function () {
    var P: T = EntidadesPuro, actual: T = null, como: T = "", conAcciones: T = false, enFicha: T = null, cerca: T = null, presentadores: T = {}, anillo: T = null, quitaX: T = null, moFicha: T = null, M: T = null;
    // MU5-n (A3-7a, segundo commit): el material del anillo es estándar, de la fábrica, con dueño «seleccion-usables» (Materiales, de 02i, se monta después: se pide al crear el anillo)
    function materiales() { return M || (M = dp.Materiales.de("seleccion-usables")); }
    function modoVista() { return typeof dp.VRX !== "undefined" && dp.VRX && dp.VRX.on ? "vr" : "pantalla"; }
    // ---- la ficha común en pantalla: el recuadro #ficha de siempre (título, pares <dt>/<dd> y, si la ficha trae acciones, sus botones debajo); textContent, nunca HTML
    function engancha() {
      if (quitaX) return; var x: T = dp.$("cerrarFicha"); if (!x) return;
      quitaX = function () { if (enFicha && enFicha === actual) cierra(actual, "cerrada"); enFicha = null; var f: T = dp.$("ficha"); if (f) f.hidden = true; };
      x.addEventListener("click", quitaX);
      // la ficha también se cierra por otros sitios (Esc en 31_hud, entrar al paseo en 12_paseo): si se esconde con algo elegido, se suelta (y su anillo)
      var caja: T = dp.$("ficha");
      if (caja && typeof MutationObserver !== "undefined") (moFicha = new MutationObserver(function () { if (caja.hidden && enFicha) { var e: T = enFicha; enFicha = null; if (e === actual) cierra(e, "cerrada"); } })).observe(caja, { attributes: true, attributeFilter: ["hidden"] });   // moFicha: A3-7a, para desengancha()
    }
    function botonesPantalla(caja?: T, acciones?: T) {
      var ac: T = dp.$("fichaAcciones");
      if (!acciones || !acciones.length) { if (ac) ac.hidden = true; return; }
      if (!ac) {
        ac = document.createElement("div"); ac.id = "fichaAcciones"; ac.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"; caja.appendChild(ac);
        ac.addEventListener("click", function (e?: T) { var b: T = e.target && e.target.closest && e.target.closest("button[data-accion]"); if (b && enFicha) usa(enFicha, b.getAttribute("data-accion")); });
      }
      ac.textContent = "";
      acciones.forEach(function (a?: T) {
        var b: T = document.createElement("button"); b.type = "button"; b.setAttribute("data-accion", a.id); b.textContent = a.txt;
        b.style.cssText = "font:inherit;color:inherit;min-height:44px;min-width:44px;padding:6px 12px;border-radius:8px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.55)";
        ac.appendChild(b);
      });
      ac.hidden = false;
    }
    function pintaPantalla(f?: T) {
      var caja: T = dp.$("ficha"), dl: T = dp.$("fichaDatos"); if (!caja || !dl) return;
      engancha();
      dp.$("fichaTitulo").textContent = f.titulo || ""; dl.textContent = "";
      (f.filas || []).forEach(function (q?: T) {
        var dt: T = document.createElement("dt"), dd: T = document.createElement("dd"); dt.textContent = q.k; dd.textContent = q.v;
        if (q.de) { var s: T = document.createElement("small"); s.style.display = "block"; s.style.color = "var(--muted)"; s.textContent = q.de; dd.appendChild(s); }
        dl.appendChild(dt); dl.appendChild(dd);
      });
      botonesPantalla(caja, f.acciones);
      caja.hidden = false;
    }
    // presentador(modo, fn): quién pinta la ficha en ese modo (29_vr registra el de "vr"); fn(ficha). Devuelve la función que lo quita. Se encadenan
    // (EV2-A1): el último que se registra va primero y, si devuelve false («no es mía»), la ficha pasa al de antes; quitarlo deja al de antes como estaba
    function presentador(m?: T, fn?: T) {
      if (typeof fn !== "function") return function () {};
      (presentadores[m] = presentadores[m] || []).push(fn);
      return function () { var l: T = presentadores[m], i: T = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
    }
    function presenta(m?: T, f?: T) {
      var l: T = (presentadores[m] || []).slice();
      for (var i: T = l.length - 1; i >= 0; i--) { var r: T; try { r = l[i](f); } catch (e: T) { try { console.error("[Usables] presentador " + m, e); } catch (e2: T) {} r = undefined; } if (r !== false) return true; }
      return false;
    }
    function muestra(x?: T, repinta?: T) {   // repinta: la ficha ya estaba a la vista y solo ha cambiado (no se vuelve a avisar al tipo)
      var d: T = Entidades.de(x), m: T = modoVista(), propio: T = false; if (!d) return false;
      if (d.muestra && !repinta) { try { propio = d.muestra(x, m) === true; } catch (e: T) { try { console.error("[Usables] " + x, e); } catch (e2: T) {} } }
      if (propio) { conAcciones = false; return true; }   // la enseña él (la baliza, en su propio recuadro)
      var f: T = Entidades.ficha(x, m); if (!f) return false;
      conAcciones = !!(f.acciones && f.acciones.length);
      if (m === "vr") presenta("vr", f);
      else { enFicha = x; pintaPantalla(f); }
      return true;
    }
    // ---- elegir y soltar
    function eligeU(x?: T, comoE?: T) {
      var d: T = Entidades.de(x); if (!d || !Entidades.existe(x)) return false;
      if (actual && actual !== x) avisaSuelta(actual, "otra");
      actual = x; como = comoE || "codigo";
      dp.Bus.emite("usable:elige", { id: x, tipo: d.tipo, como: como });
      muestra(x); resalteU(); return true;
    }
    function avisaSuelta(x?: T, motivo?: T) { var d: T = Entidades.de(x); if (d && d.suelta) { try { d.suelta(x); } catch (e: T) {} } dp.Bus.emite("usable:suelta", { id: x, motivo: motivo }); }
    // el toque o el clic en (cx, cy): lo que hay debajo se elige; si no hay nada, se suelta lo elegido y se cierra la ficha
    function toque(cx?: T, cy?: T) {
      var r: T = typeof dp.lienzo !== "undefined" && dp.lienzo ? dp.lienzo.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
      var g: T = P.gana(Entidades.candidatos("pantalla", cx, cy, r), "toque");
      if (!g) { sueltaU("nada"); return null; }
      eligeU(g.id, "toque"); return g.id;
    }
    // el rayo de un mando y su gatillo (VR): lo primero que toca se elige; sin nada, no se suelta lo que haya (apretar al aire no cierra fichas)
    function rayo(rr?: T) { var g: T = P.gana(Entidades.candidatos("rayo", rr), "rayo"); if (!g) return null; eligeU(g.id, "rayo"); return g.id; }
    // soltar: lo elegido deja de estarlo, todos los tipos sueltan lo que tuvieran forzado (la baliza vuelve a la de cercanía) y la ficha común se cierra
    function sueltaU(motivo?: T) {
      Entidades.tipos().forEach(function (t?: T) { var d: T = Entidades.tipo(t); if (d.suelta && (!actual || P.tipoDe(actual) !== t)) { try { d.suelta(null); } catch (e: T) {} } });
      if (actual) { var a: T = actual; actual = null; avisaSuelta(a, motivo || "suelta"); }
      conAcciones = false; enFicha = null; var f: T = typeof dp.$ === "function" && dp.$("ficha"); if (f) f.hidden = true;
      resalteU();
    }
    // cerrar la ficha de x (su «Cerrar» o la ×): su tipo la cierra si tiene recuadro propio y, si era lo elegido, deja de estarlo
    function cierra(x?: T, motivo?: T) {
      var d: T = Entidades.de(x); if (d && d.cierra) { try { d.cierra(x); } catch (e: T) {} }
      if (x && x === actual) { actual = null; conAcciones = false; dp.Bus.emite("usable:suelta", { id: x, motivo: motivo || "cerrada" }); }
      resalteU(); return true;
    }
    // la ficha de x ha cambiado (la de la haza llega de la api): si está a la vista, se repinta
    function refresca(x?: T) {
      if (modoVista() === "pantalla") { if (enFicha === x && !dp.$("ficha").hidden) muestra(x, true); }
      else if (x === actual && !conAcciones) muestra(x, true);
    }
    // una acción de la ficha de x («Ir a esta baliza», «Ir con»…): true si se hizo
    function usa(x?: T, accion?: T) {
      var f: T = Entidades.ficha(x, modoVista()), a: T = f && (f.acciones || []).filter(function (q?: T) { return q.id === accion; })[0], r: T;
      if (!a || typeof a.fn !== "function") return false;
      try { r = a.fn(); } catch (e: T) { try { console.error("[Usables] " + x + " " + accion, e); } catch (e2: T) {} return false; }
      if (r === false) return false;
      dp.Bus.emite("usable:usa", { id: x, accion: accion }); return true;
    }
    // una ficha sin entidad (la tecla H fuera de toda haza): en pantalla, en el recuadro común
    function mensaje(titulo?: T, filas?: T) { if (actual) { var a: T = actual; actual = null; avisaSuelta(a, "otra"); } conAcciones = false; enFicha = null; pintaPantalla({ titulo: titulo, filas: filas }); resalteU(); }
    // la ficha con acciones que hay que tener a la vista (VR): la elegida si trae acciones y no tiene recuadro propio, o la que un tipo tiene abierta por su
    // cuenta (la baliza a menos de 17 m). null si ninguna
    function abierta() {
      if (actual && conAcciones && Entidades.existe(actual)) return actual;
      var ts: T = Entidades.tipos();
      for (var i: T = 0; i < ts.length; i++) { var d: T = Entidades.tipo(ts[i]), x: T = null; if (!d.abierta) continue; try { x = d.abierta(); } catch (e: T) {} if (x) return x; }
      return null;
    }
    // ---- la cercanía, al pasear (a pie, en quad, con el dron, en VR): lo más cerca dentro del radio de su tipo (hoy, la baliza a menos de 17 m)
    function dondeEstoy() {
      if (typeof dp.paseando === "undefined" || !dp.paseando) return null;
      if (typeof dp.enDron !== "undefined" && dp.enDron && typeof dp.dr !== "undefined") return { x: dp.dr.x, y: dp.dr.y };
      return typeof dp.pp !== "undefined" ? { x: dp.pp.x, y: dp.pp.y } : null;
    }
    // cada 0,1 s, no en cada fotograma (medido en Node: así cuesta de media menos que el recorrido de 19_balizas que sustituye; un paseante a 7 m/s anda 0,7 m)
    var tCerca: T = 1;
    function actualiza(dt?: T) {
      tCerca += dt || 0;
      if (tCerca >= 0.1) {
        tCerca = 0;
        var p: T = dondeEstoy(), c: T = p ? P.cercano(Entidades.candidatos("cerca", p.x, p.y)) : null, antes: T = cerca ? cerca.id : null;
        cerca = c ? { id: c.id, d: c.d } : null;
        if ((c ? c.id : null) !== antes) dp.Bus.emite("usable:cerca", { id: c ? c.id : null });
      }
      if (anillo && anillo.visible) colocaAnillo();
    }
    function cercano() { return cerca ? { id: cerca.id, d: cerca.d } : null; }
    // ---- el resaltado común: un anillo en el suelo, al pie de lo elegido (los tipos que ya se ven solos, como la baliza, llevan sinAnillo: true)
    function colocaAnillo() {
      var d: T = actual && Entidades.de(actual), p: T = d && !d.sinAnillo ? Entidades.pos(actual) : null;
      if (!p) { anillo.visible = false; return false; }
      var r: T = 1.2; if (d.radio) { try { r = Math.max(0.4, +d.radio(actual) || 1.2); } catch (e: T) {} }
      anillo.position.set(p.x, p.y + 0.15, p.z); anillo.scale.set(r, r, r); anillo.visible = true; return true;
    }
    function resalteU() {
      if (!actual) { if (anillo) anillo.visible = false; return; }
      var d: T = Entidades.de(actual); if (!d || d.sinAnillo || !d.pos) { if (anillo) anillo.visible = false; return; }
      if (!anillo) {
        var g: T = new dp.THREE.RingGeometry(0.86, 1, 40); g.rotateX(-Math.PI / 2);
        anillo = new dp.THREE.Mesh(g, materiales().estandar("MeshBasicMaterial", { color: 0x40f0ff, transparent: true, opacity: 0.85, depthWrite: false, fog: false, forceSinglePass: true }));
        anillo.name = "resaltado"; anillo.renderOrder = 5; dp.scene.add(anillo);   // se recorta: la geometría es fija (solo se escala y se mueve)
      }
      colocaAnillo();
    }
    // un tipo se ha quitado del registro: si lo elegido era suyo, se suelta (sin preguntarle: ya no está)
    function olvida(t?: T) { if (actual && P.tipoDe(actual) === t) { var a: T = actual; actual = null; conAcciones = false; dp.Bus.emite("usable:suelta", { id: a, motivo: "quitada" }); if (enFicha === a) { enFicha = null; var f: T = dp.$("ficha"); if (f) f.hidden = true; } resalteU(); } if (cerca && P.tipoDe(cerca.id) === t) cerca = null; }
    function libera() { if (anillo) { dp.scene.remove(anillo); anillo.geometry.dispose(); anillo.material.dispose(); anillo = null; } if (M) M.libera(); }
    function estado() { return { actual: actual, como: como, conAcciones: conAcciones, enFicha: enFicha, cerca: cercano(), anillo: !!(anillo && anillo.visible), tipos: Entidades.resumen() }; }
    function elegido() { return actual; }
    // A3-7a: lo que engancha() y botonesPantalla() dejaban puesto para siempre: la × de la ficha, el observador de #ficha y la caja de acciones con su escucha
    function desengancha() {
      var x: T = dp.$("cerrarFicha"); if (quitaX && x) x.removeEventListener("click", quitaX); quitaX = null;
      if (moFicha) { moFicha.disconnect(); moFicha = null; }
      var ac: T = dp.$("fichaAcciones"); if (ac && ac.parentNode) ac.parentNode.removeChild(ac);
    }
    engancha();   // la × de la ficha común, desde el principio (también para lo que aún escribe #ficha por su cuenta)
    return { toque: toque, rayo: rayo, elige: eligeU, suelta: sueltaU, cierra: cierra, refresca: refresca, usa: usa, mensaje: mensaje, abierta: abierta, elegido: elegido,
      actualiza: actualiza, cercano: cercano, presentador: presentador, olvida: olvida, libera: libera, estado: estado, desengancha: desengancha };
  })();
  // [motor:fin]
  window.__usables = function () { return Usables.estado(); };   // pruebas y ?debug
  return { Entidades: Entidades, Usables: Usables };
}
export type EntidadesUsables = ReturnType<typeof creaEntidades>;

/** El componente «seleccion-usables» (solo ciclo de vida; de todos los mundos): lo registra el talón de 02e con Componentes.registra */
export function manifiestoEntidades(api: { Usables: { libera(): void; desengancha(): void } }): Manifiesto {
  return {
    id: ID_USABLES, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: ["usable:cerca", "usable:elige", "usable:suelta", "usable:usa"] }, bandera: { defecto: true },
    presupuesto: { llamadas: 1, triangulos: 80 },   // el anillo de resaltado, solo mientras hay algo elegido
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.Usables.libera(); api.Usables.desengancha(); }
  };
}
