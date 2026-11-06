// La llegada (MU5-n, A3-6c; antes apps/web/motor/12b_llegada.js, que queda como talón): el anillo en el suelo adonde quieres ir y el salto hasta él (de pie, fuera de troncos, a la altura
// del suelo, andando). Una sola pieza para la VR y la pantalla:
//   · VR (29_vr.js), volando o en el mirador: palanca derecha ↑ mantenida = rayo recto del mando al suelo y anillo; al soltar, fundido y de pie en el anillo.
//   · Pantalla (con el Dron de 16_vida.js): un clic o un toque corto en el suelo pone el anillo (otro lo mueve; arrastrar no lo pone); «Aterrizar aquí», Intro o L te deja de pie en él con
//     un fundido corto; sin anillo, aterrizar guarda el Dron como siempre.
// El suelo es el de la CPU del mundo activo (gm.suelo()·exag; MU2-4), no el relieve dibujado del tileset. Nada se mueve sin que el usuario lo pida y el salto va con fundido (~0,3 s), nunca
// con vuelo de cámara. aparece(x, y, ang) y ve(x, y, ang) (con fundido) los puede usar cualquier otro módulo para «aparecer en (x, y) mirando a ang» (p. ej. ir con otro visitante).
// La lógica pura está en nucleo/locomocion.ts (LlegadaPuro). Componente «anillo-llegada» de TODOS los mundos (la locomoción es de todo mundo). Su libera() quita el anillo (geometría y material),
// el velo y las escuchas del lienzo, del botón y de la ventana. Código movido tal cual; lo que el legado reescribe o declara después (paseando, enDron, ponDron, VRX, vrFundido, vrAparece,
// gm) entra por función: gm es un intermediario que pregunta en cada llamada al gestor de mundos (90_final lo declara después).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { LlegadaPuro } from "../../nucleo/locomocion.ts";
import { TODO_MUNDO } from "./tipos.ts";
import type { T } from "./tipos.ts";

export const ID_LLEGADA = "anillo-llegada";   // «llegada» a secas lo nombran textos de otros módulos (la regla de quitar un componente lo prohíbe)

export interface DepsLlegada {
  THREE: T; scene: T; camera: T; Estado: T; Materiales: T; lienzo: T; visor: T; $(id: string): T;
  /** 12_paseo (paseando cambia), su pp y camPos, entraPaseo; 16_vida y 29_vr (se montan después); el gestor de mundos (90_final) */
  paseando(): boolean; pp: T; camPos: T; entraPaseo(): void; enDron(): boolean; ponDron(on: boolean): void;
  VRX(): T; vrFundido(fn: () => void): boolean; vrAparece(x: number, y: number, ang?: number | null): void; gm(): T;
  documento: T; ventana: T;
}

export function creaLlegada(dp: DepsLlegada) {
    var THREE = dp.THREE, scene = dp.scene, camera = dp.camera, Estado = dp.Estado, lienzo = dp.lienzo, visor = dp.visor, $ = dp.$, pp = dp.pp, camPos = dp.camPos, entraPaseo = dp.entraPaseo;
    var paseando = dp.paseando, enDron = dp.enDron, ponDron = dp.ponDron, VRX = dp.VRX, vrFundido = dp.vrFundido, vrAparece = dp.vrAparece, document: T = dp.documento, window: T = dp.ventana;
    var gm = { suelo: function (x: T, y: T) { return dp.gm().suelo(x, y); }, dentro: function (x: T, y: T) { return dp.gm().dentro(x, y); }, obstaculo: function (x: T, y: T, r: T) { return dp.gm().obstaculo(x, y, r); } };
    var materiales = dp.Materiales.de(ID_LLEGADA);   // el material del anillo, con dueño «anillo-llegada» (se suelta con libera())
    var escuchas: (() => void)[] = [];   // A3-6c: las escuchas del lienzo, del botón y de la ventana, para quitarlas en libera()
    function escucha(o: T, tipo: string, fn: T) { o.addEventListener(tipo, fn); escuchas.push(function () { o.removeEventListener(tipo, fn); }); }
    var COLOR = 0xffc94a;   // ámbar: distinto del anillo cian que señala la sombra del Dron y de la parábola del teletransporte a pie
    var anillo = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2), materiales.estandar("MeshBasicMaterial", { color: COLOR, fog: false, transparent: true, forceSinglePass: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    anillo.visible = false; anillo.renderOrder = 5; scene.add(anillo);
    var p: T = null, radio = 0, n = 0, ultimo: T = null, ocupado = false, rayo = new THREE.Raycaster(), ndc = new THREE.Vector2();
    var alto = function (x: T, z: T) { return gm.suelo(x, -z) * Estado.exag; };   // el suelo y la caja (gm.dentro) son los del mundo activo (MU2-4)
    // el velo de la pantalla (fuera de VR): un negro que se funde en 0,15 s, salta y se aclara en otros 0,15 s
    var velo = document.createElement("div"); velo.setAttribute("aria-hidden", "true");
    velo.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .15s linear;z-index:5";
    if (visor) visor.appendChild(velo);
    function coloca(desde: T) {
      anillo.visible = !!p; if (!p) return;
      radio = LlegadaPuro.radioMarca(Math.hypot(p.x - desde.x, p.y - desde.y, p.z - desde.z)); anillo.scale.setScalar(radio); anillo.position.set(p.x, p.y + 0.08 + radio * 0.02, p.z);
    }
    // apunta un rayo (o, d) al suelo; con `mirada`, descarta lo que cae por detrás de quien observa desde `desde`. Pone (o borra) el anillo y devuelve el punto o null
    function apunta(o: T, d: T, desde: T, mirada: T) {
      var q = LlegadaPuro.rayoSuelo(o, d, alto, gm.dentro);
      if (q && mirada && !LlegadaPuro.delante(desde, mirada, q)) q = null;
      p = q; coloca(desde); return q;
    }
    // desde la pantalla: el rayo de la cámara por el píxel (cx, cy) del lienzo
    function apuntaPantalla(cx: T, cy: T) {
      var r = lienzo.getBoundingClientRect(); if (!r.width || !r.height) return null;
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); camera.updateMatrixWorld(); rayo.setFromCamera(ndc, camera);
      var q = LlegadaPuro.rayoSuelo(rayo.ray.origin, rayo.ray.direction, alto, gm.dentro);
      if (q) { p = q; coloca(camera.position); }   // un toque fuera de la finca o al cielo no borra el anillo que ya había
      return q;
    }
    function borra() { p = null; anillo.visible = false; }
    function fundePantalla(fn: T) {
      if (ocupado) return false; ocupado = true; velo.style.opacity = "1";
      setTimeout(function () { try { fn(); } finally { velo.style.opacity = "0"; setTimeout(function () { ocupado = false; }, 160); } }, 160);
      return true;
    }
    function funde(fn: T) { return VRX().on ? vrFundido(fn) : fundePantalla(fn); }
    // aparecer de pie en (x, y) del mundo (y = norte), fuera de troncos y dentro de la finca, mirando a ang (ángulo del paseo: 0 = norte; si se omite, se conserva)
    function aparece(x: T, y: T, ang?: T) {
      // MU2-4: fuera de troncos (0,55 m, como al andar) y luego dentro del borde, en una llamada al mundo activo (antes: recorte a D.ext y luego fueraDeTroncos)
      var o = gm.obstaculo(x, y, 0.55); if (o) { x = o.x; y = o.y; } n++; ultimo = [x, y];
      if (VRX().on) { vrAparece(x, y, ang); return; }
      if (!paseando()) entraPaseo();
      if (enDron()) ponDron(false);
      pp.x = x; pp.y = y; if (ang !== undefined && ang !== null) pp.ang = ang;
      var gy = gm.suelo(x, y) * Estado.exag, fx = Math.sin(pp.ang), fy = Math.cos(pp.ang);
      camPos.set(x - fx * 4.4, gy + 2.3, -(y - fy * 4.4));   // la cámara de seguimiento ya detrás, sin recorrer el camino
    }
    function ve(x: T, y: T, ang?: T) { return funde(function () { aparece(x, y, ang); }); }
    // al anillo (si lo hay): fundido y de pie en él
    function alAnillo() { if (!p) return false; var q = p; borra(); return ve(q.x, -q.z); }
    // --- la pantalla con el Dron: clic o toque corto en el suelo = anillo; «Aterrizar aquí» / Intro / L
    var boton = $("padAterriza");
    function rotula() { if (!boton) return; boton.textContent = p ? "Aterrizar aquí" : "Aterrizar"; boton.setAttribute("aria-label", p ? "Aterrizar en el anillo marcado" : "Aterrizar: guardar el Dron donde estás"); }
    function conDron(on: T) { borra(); if (boton) boton.hidden = !on; rotula(); }
    function aterrizaConDron() { if (!enDron()) return; if (p) alAnillo(); else ponDron(false); }
    function porFotograma() { if (p && !VRX().on) coloca(camera.position); }
    var toque: T = null;
    escucha(lienzo, "pointerdown", function (e: T) {
      if (!paseando() || !enDron() || VRX().on) { toque = null; return; }
      toque = toque ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), tipo: e.pointerType, mov: 0 };   // un segundo dedo: es un gesto, no un toque
    });
    escucha(lienzo, "pointermove", function (e: T) { if (toque && e.pointerId === toque.id) toque.mov = Math.max(toque.mov, Math.hypot(e.clientX - toque.x, e.clientY - toque.y)); });
    escucha(lienzo, "pointerup", function (e: T) {
      if (!toque || e.pointerId !== toque.id) return; var t = toque; toque = null;
      t.mov = Math.max(t.mov, Math.hypot(e.clientX - t.x, e.clientY - t.y));
      if (enDron() && LlegadaPuro.esToque(t.mov, performance.now() - t.t, t.tipo) && apuntaPantalla(e.clientX, e.clientY)) rotula();
    });
    escucha(lienzo, "pointercancel", function () { toque = null; });
    if (boton) escucha(boton, "click", aterrizaConDron);
    escucha(window, "keydown", function (e: T) {
      if (!paseando() || !enDron() || VRX().on || (e.code !== "Enter" && e.code !== "NumpadEnter" && e.code !== "KeyL")) return;
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON" || t === "A") return;   // Intro sobre un botón es su clic
      e.preventDefault(); aterrizaConDron();
    });
    window.__llegada = function () { return { punto: p ? [p.x, p.y, p.z] : null, radio: radio, visible: anillo.visible, ultimo: ultimo, n: n, fundiendo: ocupado, paseando: paseando(), enDron: enDron(), pp: [pp.x, pp.y, pp.ang], boton: boton ? { hidden: boton.hidden, texto: boton.textContent } : null }; };
    /** libera(): el anillo fuera de la escena con su geometría y su material, el velo fuera del visor, las escuchas del lienzo, del botón y de la ventana, y el gancho de pruebas */
    function libera() {
      borra(); escuchas.splice(0).forEach(function (f: T) { f(); });
      if (anillo.parent) anillo.parent.remove(anillo); anillo.geometry.dispose(); anillo.material.dispose(); materiales.libera();
      if (velo.parentNode) velo.parentNode.removeChild(velo);
      delete window.__llegada;
    }
    /** tras un libera(): el anillo y el velo en su sitio (se vuelven a subir solos al dibujarse) */
    function monta() { if (!anillo.parent) scene.add(anillo); if (visor && !velo.parentNode) visor.appendChild(velo); }
    return { libera: libera, monta: monta, anillo: anillo, apunta: apunta, apuntaPantalla: apuntaPantalla, borra: borra, punto: function () { return p; }, aparece: aparece, ve: ve, alAnillo: alAnillo, funde: funde, conDron: conDron, porFotograma: porFotograma, aterrizaConDron: aterrizaConDron };
}
export type Llegada = ReturnType<typeof creaLlegada>;

/** El componente «anillo-llegada» (solo ciclo de vida; de todos los mundos): lo registra el talón de 12b con Componentes.registra */
export function manifiestoLlegada(api: Llegada): Manifiesto {
  return {
    id: ID_LLEGADA, version: 1, consume: ["scene"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 1, triangulos: 80 },
    fases: {}, mundos: TODO_MUNDO,
    monta: function () { api.monta(); return api; }, libera: function () { api.libera(); }
  };
}
