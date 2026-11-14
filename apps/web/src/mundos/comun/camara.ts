// La cámara orbital y los gestos de la vista aérea (MU5-n, A3-6c; antes apps/web/motor/09_camara.js, que queda como talón): girar, acercar y desplazar con el ratón o los dedos, el toque corto
// que elige lo que hay debajo (Usables, C7) o, paseando, echa a andar hasta allí (IrA, 12c), los botones de modo (Nube, Gemelo, Ortofoto), las capas y los deslizadores de exageración y
// corrección. La sensibilidad y el eje invertido salen de Configuración → Controles (33_ajustes; sin ella, 1× y sin invertir).
// Componente «camara» de TODOS los mundos (la vista y sus gestos son de todo mundo). Su libera() quita las escuchas del lienzo, de los botones de modo, de las capas y de los deslizadores.
// Código movido tal cual (solo se tipan los parámetros); lo que el legado reescribe o declara después (paseando, kcor, IrA, parcelaSel, elegirParcela, Ajustes) entra por función.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_CAMARA = "camara-orbital";

export interface DepsCamara {
  THREE: T; camera: T; lienzo: T; Estado: T; $(id: string): T; fmt(n: number, dec?: number): string; DIST_MAX: number; DIST_INI: number; Usables: T;
  /** 08_marcadores (antes) */ aplica(): void; capas(): void; aplicaLuego(): void;
  /** 02_mundo: la altura del suelo (m, sin exagerar) en (x, norte); sin ella, la cámara no sabe dónde está el suelo (L8-02) */ suelo?: (x: number, y: number) => number;
  /** lo que cambia o se declara después: 12_paseo, 02_mundo (kcor, que se escribe), 12c, 13_parcelas, 33_ajustes */
  paseando(): boolean; ponKcor(v: number): void; IrA(): T; parcelaSel(): number; elegirParcela(i: number): void; Ajustes(): T;
}

export function creaCamara(d: DepsCamara) {
  var THREE = d.THREE, camera = d.camera, lienzo = d.lienzo, Estado = d.Estado, $ = d.$, fmt = d.fmt, DIST_MAX = d.DIST_MAX, DIST_INI = d.DIST_INI, Usables = d.Usables;
  var aplica = d.aplica, capas = d.capas, aplicaLuego = d.aplicaLuego, paseando = d.paseando, ponKcor = d.ponKcor, parcelaSel = d.parcelaSel, elegirParcela = d.elegirParcela;
  var IrA = { toca: function (cx: T, cy: T, mov: T, ms: T, tipo: T) { return d.IrA().toca(cx, cy, mov, ms, tipo); } };   // 12c se monta después
  var escuchas: (() => void)[] = [];   // A3-6c: las escuchas de la vista, para quitarlas en libera()
  function escucha(o: T, tipo: string, fn: T, opc?: T) { if (!o) return; o.addEventListener(tipo, fn, opc); escuchas.push(function () { o.removeEventListener(tipo, fn, opc); }); }
  // cámara orbital
  var objetivo = new THREE.Vector3(0, 12, 0), orb = { az: -0.55, el: 0.62, dist: DIST_INI }, orbIni = JSON.parse(JSON.stringify(orb));
  // L8-02: la órbita sabe dónde está el suelo (el relieve real del mundo activo × la exageración; el mundo pone z = −norte). Sin `suelo` (dobles de prueba), como antes.
  var sueloAt = d.suelo, HOLGURA = 2;   // m mínimos de la cámara sobre el suelo que tiene debajo
  function sueloY(x: number, z: number): number { return sueloAt ? sueloAt(x, -z) * Estado.exag : NaN; }
  /** pone el blanco sobre el suelo bajo él (tras un pan o un cambio de exageración); sin suelo, no hace nada */
  function asienta() { var y = sueloY(objetivo.x, objetivo.z); if (isFinite(y)) objetivo.y = y; }
  function camara() {
    var ce = Math.cos(orb.el), se = Math.sin(orb.el), cx = objetivo.x + orb.dist * ce * Math.sin(orb.az), cz = objetivo.z + orb.dist * ce * Math.cos(orb.az), cy = objetivo.y + orb.dist * se;
    var sc = sueloY(cx, cz); if (isFinite(sc) && cy < sc + HOLGURA) cy = sc + HOLGURA;   // nunca bajo el suelo (una ladera entre la cámara y el blanco)
    camera.position.set(cx, cy, cz); camera.lookAt(objetivo);
  }
  // Configuración → Controles (33_ajustes.js): sensibilidad al mirar y eje vertical invertido; sin 33_ajustes.js, 1× y sin invertir
  function sensMirar() {
    var k = 1, y = 1;
    var Ajustes = d.Ajustes(); try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { k = Number(Ajustes.lee("controles.sens")) || 1; y = Ajustes.lee("controles.invertir") ? -1 : 1; } } catch (e) { /* sin Configuración: 1× y sin invertir */ }
    return { k: k, y: y };
  }
  var punteros: T = {}, movido = 0;
  var toquePaseo: T = null;   // en el paseo no se gira la vista con el dedo, pero un toque corto elige lo que haya debajo (olivo, baliza…)
  escucha(lienzo, "pointerdown", function (e: T) {
    if (paseando()) { toquePaseo = { x: e.clientX, y: e.clientY, t: performance.now(), mov: 0 }; return; }
    lienzo.setPointerCapture(e.pointerId); punteros[e.pointerId] = { x: e.clientX, y: e.clientY }; movido = 0; });
  escucha(lienzo, "pointermove", function (e: T) {
    if (paseando()) { if (toquePaseo) toquePaseo.mov = Math.max(toquePaseo.mov, Math.hypot(e.clientX - toquePaseo.x, e.clientY - toquePaseo.y)); return; }
    var p = punteros[e.pointerId]; if (!p) return;
    var ids: T = Object.keys(punteros), dx = e.clientX - p.x, dy = e.clientY - p.y; movido += Math.abs(dx) + Math.abs(dy);
    if (ids.length === 1) { if (e.shiftKey || e.buttons === 2) pan(dx, dy); else { var se = sensMirar(); orb.az -= dx * 0.006 * se.k; orb.el = Math.max(0.08, Math.min(1.5, orb.el + dy * 0.006 * se.k * se.y)); } }
    else if (ids.length === 2) { var o = punteros[ids.filter(function (i: T) { return i != e.pointerId; })[0]]; var antes = Math.hypot(p.x - o.x, p.y - o.y), ahora = Math.hypot(e.clientX - o.x, e.clientY - o.y); orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (antes / Math.max(ahora, 1)))); pan(dx / 2, dy / 2); }
    p.x = e.clientX; p.y = e.clientY;
  });
  function suelta(e: T) {
    if (paseando()) { var q = toquePaseo; toquePaseo = null; if (q && e.type === "pointerup" && Math.hypot(e.clientX - q.x, e.clientY - q.y) < 10 && performance.now() - q.t < 600) { var mov = Math.max(q.mov, Math.hypot(e.clientX - q.x, e.clientY - q.y)), ms = performance.now() - q.t; if (!elige(e.clientX, e.clientY)) IrA.toca(e.clientX, e.clientY, mov, ms, e.pointerType); } return; }   // sin nada elegido debajo, el toque corto va andando (12c_ir_a.js)
    var tocar = Object.keys(punteros).length === 1 && movido < 6; delete punteros[e.pointerId]; if (tocar && e.type === "pointerup") elige(e.clientX, e.clientY); }
  escucha(lienzo, "pointerup", suelta); escucha(lienzo, "pointercancel", suelta); escucha(lienzo, "contextmenu", function (e: T) { e.preventDefault(); });
  escucha(lienzo, "wheel", function (e: T) { e.preventDefault(); if (paseando()) return; orb.dist = Math.max(30, Math.min(DIST_MAX, orb.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  function pan(dx: T, dy: T) { var f = orb.dist * 0.0016, rx = Math.cos(orb.az), rz = -Math.sin(orb.az); objetivo.x -= dx * f * rx; objetivo.z -= dx * f * rz; objetivo.x += dy * f * Math.sin(orb.az); objetivo.z += dy * f * Math.cos(orb.az); asienta(); }

  // un toque corto o un clic: elige lo que haya debajo (C7: Usables, 02e_entidades.js; cada tipo de cosa del mundo dice si está bajo el dedo y gana por
  // tipo y por cercanía); sobre nada, suelta lo elegido y cierra la ficha
  function elige(cx: T, cy: T) { return Usables.toque(cx, cy); }

  function pon(m: T) { Estado.modo = m; ["Nube", "Gem", "Orto"].forEach(function (n: T) { $("m" + n).setAttribute("aria-pressed", String((n === "Nube" && m === "nube") || (n === "Gem" && m === "gem") || (n === "Orto" && m === "orto"))); }); aplica(); }
  escucha($("mNube"), "click", function () { pon("nube"); }); escucha($("mGem"), "click", function () { pon("gem"); }); escucha($("mOrto"), "click", function () { pon("orto"); });
  ["cLinde", "cCopas", "cMarc", "cDesf"].forEach(function (id: T) { escucha($(id), "change", capas); });
  escucha($("exag"), "input", function (e: T) { Estado.exag = Number(e.target.value); $("exagV").textContent = fmt(Estado.exag, Estado.exag % 1 ? 2 : 0) + "×"; asienta(); aplicaLuego(); });
  escucha($("corr"), "input", function (e: T) { var kcor = Number(e.target.value); ponKcor(kcor); $("corrV").textContent = fmt(kcor, kcor % 1 ? 2 : 0) + "×"; aplicaLuego(); });   // kcor es de 02_mundo: se escribe por función
  escucha($("reiniciar"), "click", function () { elegirParcela(parcelaSel()); });

  function libera() { escuchas.splice(0).forEach(function (f) { f(); }); }
  return { objetivo: objetivo, orb: orb, camara: camara, sensMirar: sensMirar, pon: pon, libera: libera };
}
export type Camara = ReturnType<typeof creaCamara>;

/** El componente «camara-orbital» (solo ciclo de vida; de todos los mundos): lo registra el talón de 09 con Componentes.registra */
export function manifiestoCamara(api: { libera(): void }): Manifiesto {
  return {
    id: ID_CAMARA, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
