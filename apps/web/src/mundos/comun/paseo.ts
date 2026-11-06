// El paseo (MU5-n, A3-6c; antes apps/web/motor/12_paseo.js): una persona que camina por el olivar (flechas o WASD; Mayús corre; V cambia de cámara), la cruceta y los botones del paseo,
// la palanca (lo puro: PalancaPuro) y la cámara de seguimiento o en primera persona. Se mueve por el mundo activo (gm.obstaculo, gm.suelo; MU2-4).
// Componente «paseo» de TODOS los mundos (la locomoción es de todo mundo). Su libera() quita al muñequito de la escena con sus geometrías y sus materiales y quita las escuchas del botón
// «Pasear», del teclado, de la cruceta, de la ventana y del documento (antes no se quitaban nunca).
// El estado que el resto del legado lee por su nombre (paseando, persona, teclas) vive aquí y el talón lo espeja en sus var en cuanto cambia (espeja), como Vida en 16_vida; primera es del
// legado (la escriben 16_vida y 29_vr) y entra por función. Lo que se declara después (12c_ir_a, 13_parcelas, 16_vida, 24_pantalla, 33_ajustes, 90_final) entra por función: IrA, gm y los
// mandos de la vida son intermediarios que preguntan en cada llamada. Código movido tal cual (solo se tipan los parámetros).
// Ilustrativo (regla 5): el muñequito no es una persona medida.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_PASEO = "paseo";

// [puro:inicio]
export var PalancaPuro = (function () {
  var ZONA_MUERTA = 0.15;
  // x, y: vector de la palanca (y > 0 = empujar hacia delante). Devuelve { fuerza 0..1, av −1..1 (avance), lat −1..1 (a la derecha) }
  function lee(x: T, y: T) {
    x = +x || 0; y = +y || 0;
    var m = Math.sqrt(x * x + y * y); if (!(m > ZONA_MUERTA)) return { fuerza: 0, av: 0, lat: 0 };
    var f = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));   // proporcional: continuo en el borde de la zona muerta y saturado en 1
    return { fuerza: f, av: y / m * f, lat: x / m * f };
  }
  // el paso en el mundo (x al este, y al norte) mirando hacia ang (rad; 0 = norte, crece hacia el este): av al frente, lat a la derecha
  function mundo(av: T, lat: T, ang: T) { var s = Math.sin(ang), c = Math.cos(ang); return { x: av * s + lat * c, y: av * c - lat * s }; }
  // giro al arrastrar la otra mitad: píxeles → radianes, con la sensibilidad de Configuración (la de la órbita: 0,006 rad/px)
  function giro(dxPx: T, sens: T) { return (+dxPx || 0) * 0.006 * (+sens > 0 ? +sens : 1); }
  // ¿se enciende la palanca? tactil: ¿pantalla táctil? (Ajustes.tactil); ajuste: «controles.palanca»; busqueda: location.search.
  // Encendida por defecto en táctil; ?palanca=0 la apaga y ?palanca=1 la fuerza (para probar con ratón); en escritorio sin táctil, nada.
  function activa(tactil: T, ajuste: T, busqueda: T) {
    var m = /[?&]palanca=([01])(?![0-9A-Za-z])/.exec(busqueda || "");
    if (m) return m[1] === "1";
    return !!tactil && ajuste !== false;
  }
  return { ZONA_MUERTA: ZONA_MUERTA, lee: lee, mundo: mundo, giro: giro, activa: activa };
})();
// [puro:fin]

export interface DepsPaseo {
  THREE: T; scene: T; camera: T; Estado: T; Materiales: T; D: T; $(id: string): T; lienzo: T; visor: T; copaAlta(x: number, y: number): number; sensMirar(): { k: number; y: number };
  /** del legado: primera (la escriben 16_vida y 29_vr); 13_parcelas, 16_vida (Vida, enQuad, enDron), 24_pantalla (TR, iniciaTransicion, iniciaSalida), 33_ajustes, 12c (IrA), 90_final (gm) */
  primera(): boolean; ponPrimera(v: boolean): void; parcelaSel(): number; fincaSel(): number; fincas(): T[];
  /** los mandos de la vida (16_vida, que se monta después): velPaseo, giroPaseo, ponQuad, ponDron, vidaPaseo, cicloVista, dronMando, camaraDron, vidaEntra, vidaSale */
  vida: Record<string, (...a: T[]) => T>; enQuad(): boolean; enDron(): boolean; TR(): T; iniciaTransicion(): void; iniciaSalida(): void; Ajustes(): T; IrA(): T; gm(): T;
  /** el legado copia paseando, persona y teclas en sus var cada vez que cambian */
  espeja(e: { paseando: boolean; persona: T; teclas: T }): void;
  documento: T; ventana: T;
}

export function creaPaseo(d: DepsPaseo) {
  var THREE = d.THREE, scene = d.scene, camera = d.camera, Estado = d.Estado, D = d.D, $ = d.$, lienzo = d.lienzo, visor = d.visor, copaAlta = d.copaAlta, sensMirar = d.sensMirar;
  var primera = d.primera, ponPrimera = d.ponPrimera, enQuad = d.enQuad, enDron = d.enDron, TR = d.TR, document: T = d.documento, window: T = d.ventana;
  function iniciaTransicion() { d.iniciaTransicion(); }
  function iniciaSalida() { d.iniciaSalida(); }
  function deVida(n: string) { return function (...a: T[]) { return d.vida[n]!.apply(null, a); }; }   // 16_vida se monta después: el talón pregunta en cada llamada
  var velPaseo = deVida("velPaseo"), giroPaseo = deVida("giroPaseo"), ponQuad = deVida("ponQuad"), vidaPaseo = deVida("vidaPaseo"), ponDron = deVida("ponDron"), cicloVista = deVida("cicloVista");
  var dronMando = deVida("dronMando"), camaraDron = deVida("camaraDron"), vidaEntra = deVida("vidaEntra"), vidaSale = deVida("vidaSale");
  var IrA = { paso: function (dt: T, manda: T) { return d.IrA().paso(dt, manda); }, cancela: function () { d.IrA().cancela(); } };
  var gm = { suelo: function (x: T, y: T) { return d.gm().suelo(x, y); }, obstaculo: function (x: T, y: T, r: T) { return d.gm().obstaculo(x, y, r); } };
  var materiales = d.Materiales.de(ID_PASEO);   // los materiales del muñequito, con dueño «paseo» (se sueltan con libera())
  var escuchas: (() => void)[] = [];   // A3-6c: las escuchas del paseo, para quitarlas en libera()
  function escucha(o: T, tipo: string, fn: T, opc?: T) { if (!o) return; o.addEventListener(tipo, fn, opc); escuchas.push(function () { o.removeEventListener(tipo, fn, opc); }); }
  function espeja() { d.espeja({ paseando: paseando, persona: persona, teclas: teclas }); }
  var paseando = false, persona: T = null, teclas: T = {}, pp = { x: 0, y: 0, ang: 0, paso: 0 }, camPos = new THREE.Vector3();   // primera es del legado (la escriben 16_vida y 29_vr)
  // AV2 (decisión 133): «Altura de la vista» en Configuración (vista.altura): de pie (ojos a 1,62 m, como siempre) o sentado (1,20 m); independiente del avatar. Sin Configuración, de pie.
  var OJOS_PIE = 1.62, OJOS_SENTADO = 1.2;
  function alturaOjos() { var Ajustes = d.Ajustes(); return typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee && Ajustes.lee("vista.altura") === "sentado" ? OJOS_SENTADO : OJOS_PIE; }
  function creaPersona() {
    var g = new THREE.Group(), mt = function (c: T) { return materiales.estandar("MeshLambertMaterial", { color: c }); };
    var piel = mt(0xd6a27a), camisa = mt(0xe28a1c), pant = mt(0x37455c), gorra = mt(0x2e5d34);
    function caja(w: T, h: T, d: T, m: T, x: T, y: T, z: T) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); }
    function miembro(w: T, h: T, d: T, m: T, px: T, py: T, pz: T) { var pv = new THREE.Group(); pv.position.set(px, py, pz); var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.y = -h / 2; pv.add(me); g.add(pv); return pv; }
    caja(0.46, 0.62, 0.25, camisa, 0, 1.17, 0);
    var cab = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), piel); cab.position.set(0, 1.6, 0); g.add(cab);
    var gor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 14), gorra); gor.position.set(0, 1.72, 0); g.add(gor);
    caja(0.2, 0.025, 0.12, gorra, 0, 1.69, -0.15);
    g.userData = { pi: miembro(0.17, 0.86, 0.2, pant, -0.12, 0.86, 0), pd: miembro(0.17, 0.86, 0.2, pant, 0.12, 0.86, 0), bi: miembro(0.11, 0.58, 0.12, camisa, -0.3, 1.46, 0), bd: miembro(0.11, 0.58, 0.12, camisa, 0.3, 1.46, 0) };
    return g;
  }
  // ---------- la palanca (EV2-B1, doc/sistema/VIABILIDAD-INTERACCION.md §B): lo puro para andar con un pulgar, sin THREE ni DOM (lo evalúa en Node pruebas/guardianes/palanca.test.js).
  // Una palanca da un vector (x a la derecha, y hacia delante, de −1 a 1 sobre su radio). Aquí se vuelve «cuánto avanzo, cuánto me desplazo de lado»:
  // zona muerta del 15 % (el pulgar tiembla), después velocidad proporcional al desplazamiento (0 en el borde de la zona muerta, 1 al saturar el radio)
  // y la dirección es la del dedo relativa a la cámara de seguimiento, que va siempre detrás del paseante (mira hacia pp.ang).
  // (PalancaPuro, el trozo puro de la palanca, va arriba, a nivel de módulo: lo leen 34b_palanca y palanca.test.js)
  // lo que la palanca (34b_palanca.js) deja y actualizaPaseo lee: mandoPalanca.av / mandoPalanca.lat (−1..1) y el giro pendiente (rad). Sin palanca, todo a 0 y el paseo no cambia.
  var mandoPalanca = { av: 0, lat: 0, giro: 0 };
  function ponPalanca(av: T, lat: T) { mandoPalanca.av = +av || 0; mandoPalanca.lat = +lat || 0; }
  function giraPalanca(rad: T) { mandoPalanca.giro += +rad || 0; }
  persona = creaPersona(); persona.visible = false; scene.add(persona); espeja();
  function entraPaseo() {
    var parcelaSel = d.parcelaSel(), fincaSel = d.fincaSel(), fincas = d.fincas();
    paseando = true; ponPrimera(false); espeja();
    var pr0 = D.parcelas[parcelaSel >= 0 ? parcelaSel : (fincaSel >= 0 ? fincas[fincaSel].parcelas[0] : 0)]; pp.x = pr0.centro[0]; pp.y = pr0.centro[1] - 6; pp.ang = 0;
    persona.visible = true; $("btnPaseo").setAttribute("aria-pressed", "true");   // el botón «Pasear» se esconde al pasear: se sale con Inicio o el selector de modo (31_hud.js)
    visor.classList.add("paseo"); $("ayudaPaseo").hidden = false; $("ayuda").hidden = true; $("ficha").hidden = true; lienzo.tabIndex = 0; lienzo.focus({ preventScroll: true });
    camPos.set(pp.x, 5, -pp.y + 5); vidaEntra(); iniciaTransicion();
  }
  function salePaseo() {
    paseando = false; IrA.cancela(); persona.visible = false; teclas = {}; espeja(); ponPalanca(0, 0); mandoPalanca.giro = 0; vidaSale(); iniciaSalida(); $("btnPaseo").setAttribute("aria-pressed", "false");
    visor.classList.remove("paseo"); $("ayudaPaseo").hidden = true; $("ayuda").hidden = false;
  }
  escucha($("btnPaseo"), "click", function () { if (paseando) salePaseo(); else entraPaseo(); });
  var MAPA: T = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ShiftLeft: "run", ShiftRight: "run", Space: "sube", KeyC: "baja" };
  escucha(window, "keydown", function (e: T) {
    if (!paseando) return; var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    // Esc ya no sale del paseo (decisión 84): cierra lo último abierto o abre el menú (31_hud.js); a la vista aérea se vuelve con Inicio o 0
    if (e.code === "KeyV") { cicloVista(); return; }
    if (e.code === "KeyQ") { ponQuad(!enQuad()); return; }
    if (e.code === "KeyE") { ponDron(!enDron()); return; }
    if (MAPA[e.code]) { teclas[MAPA[e.code]] = true; e.preventDefault(); }
  });
  escucha(window, "keyup", function (e: T) { if (MAPA[e.code]) teclas[MAPA[e.code]] = false; });
  ["up", "down", "left", "right"].forEach(function (d: T) {
    var b = $("pad-" + d); if (!b) return;
    escucha(b, "pointerdown", function (e: T) { e.preventDefault(); teclas[d] = true; b.setPointerCapture(e.pointerId); });
    // soltar en todos los casos: al levantar el dedo, si el navegador cancela el gesto o pierde el dedo (en móvil, una selección de texto
    // o el menú de pulsación larga se comían el pointerup y el paseante seguía andando solo)
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev: T) { escucha(b, ev, function () { teclas[d] = false; }); });
    escucha(b, "contextmenu", function (e: T) { e.preventDefault(); });
    escucha(b, "selectstart", function (e: T) { e.preventDefault(); });
  });
  // si la página pierde el foco (otra app, otra pestaña, una llamada) se sueltan todas las teclas y botones
  function sueltaTodo() { ["up", "down", "left", "right"].forEach(function (d: T) { teclas[d] = false; }); ponPalanca(0, 0); }
  escucha(window, "blur", sueltaTodo);
  escucha(document, "visibilitychange", function () { if (document.hidden) sueltaTodo(); });
  escucha($("padRun"), "click", function () { teclas.run = !teclas.run; $("padRun").setAttribute("aria-pressed", String(!!teclas.run)); });
  escucha($("padCam"), "click", function () { cicloVista(); });
  function actualizaPaseo(dt: T) {
    var irA = IrA.paso(dt, !!(teclas.up || teclas.down || teclas.left || teclas.right || mandoPalanca.av || mandoPalanca.lat || mandoPalanca.giro));   // «tocar para ir andando» (12c_ir_a.js): null sin destino o si algo del usuario lo cancela
    var av = (teclas.up ? 1 : 0) - (teclas.down ? 1 : 0), gi = (teclas.right ? 1 : 0) - (teclas.left ? 1 : 0);
    var lat = 0;   // paso lateral de la palanca (solo a pie; en quad y dron el lado de la palanca gira, como la cruceta)
    if (mandoPalanca.av || mandoPalanca.lat) { av = Math.max(-1, Math.min(1, av + mandoPalanca.av)); if (enQuad() || enDron()) gi = Math.max(-1, Math.min(1, gi + mandoPalanca.lat)); else lat = mandoPalanca.lat; }
    if (mandoPalanca.giro) { pp.ang += mandoPalanca.giro; mandoPalanca.giro = 0; }   // arrastrar la otra mitad: mirar
    if (irA) { av = irA.av; pp.ang = irA.ang; }   // camina hacia el punto tocado: gira y avanza; la velocidad, los troncos y el borde son los de siempre
    if (TR().act && TR().t < TR().tCae + 0.25) { av = 0; gi = 0; lat = 0; }   // quieto mientras cae
    if (enDron()) { dronMando(av, gi, dt); av = 0; gi = 0; }
    var vel = velPaseo(av, dt);
    pp.ang += gi * dt * giroPaseo(vel) * sensMirar().k;   // la sensibilidad de Configuración → Controles también gira al paseante (09_camara.js); el eje vertical no aplica
    var nx = pp.x + Math.sin(pp.ang) * vel * dt, ny = pp.y + Math.cos(pp.ang) * vel * dt;
    if (lat) { var pl = PalancaPuro.mundo(0, lat * (teclas.run ? 4.3 : 1.7) * 0.8, pp.ang); nx += pl.x * dt; ny += pl.y * dt; }
    // los troncos no se atraviesan y no se sale de la finca: el mundo activo empuja fuera del círculo de cada tronco (0,55 m; 1,05 en quad) y recorta a su borde
    // (MU2-4: gm.obstaculo; en el exterior, los olivos de copas y D.ext con 3 m de margen, como antes)
    var o = gm.obstaculo(nx, ny, enQuad() ? 1.05 : 0.55); if (o) { nx = o.x; ny = o.y; }
    pp.x = nx; pp.y = ny; pp.paso += Math.abs(vel) * dt * 3.4;
    var mov = Math.min(1, Math.abs(vel) / 1.7), sw = Math.sin(pp.paso) * 0.75 * mov, ud = persona.userData;
    ud.pi.rotation.x = sw; ud.pd.rotation.x = -sw; ud.bi.rotation.x = -sw * 0.8; ud.bd.rotation.x = sw * 0.8;
    var gy = gm.suelo(pp.x, pp.y) * Estado.exag;   // el suelo del mundo activo (MU2-4), exagerado como siempre
    persona.position.set(pp.x, gy + Math.abs(Math.sin(pp.paso)) * 0.03 * mov, -pp.y); persona.rotation.y = -pp.ang; persona.visible = !primera(); vidaPaseo(dt, gy, vel);
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang);
    if (camaraDron(dt, gy)) { }
    else if (primera()) { var oj = alturaOjos(); camera.position.set(pp.x, gy + oj, -pp.y); camera.lookAt(pp.x + fx * 10, gy + oj - 0.17, -pp.y + fz * 10); }
    else {
      var DC = enQuad() ? 7.2 : 4.4;
      // la cámara no se mete en las copas: se recorre el tramo cabeza → cámara cada 25 cm y, si entra en una copa (altura medida del LiDAR,
      // copaAlta), se acerca hasta justo antes (mínimo 1,2 m); así no se ve el olivo «por dentro» con aceitunas y hojas gigantes
      var cabY = gy + 1.5, finY = gy + 2.3, DMIN = 1.2;
      for (var s = 0.6; s <= DC; s += 0.25) {
        var sx = pp.x - Math.sin(pp.ang) * s, sy = pp.y - Math.cos(pp.ang) * s, hc = copaAlta(sx, sy);
        if (hc > 0.8 && cabY + (finY - cabY) * s / DC < gm.suelo(sx, sy) * Estado.exag + hc + 0.3) { DC = Math.max(DMIN, s - 0.35); break; }
      }
      var objx = pp.x - fx * DC, objz = -pp.y - fz * DC, objy = Math.max(gy + 2.3, gm.suelo(objx, -objz) * Estado.exag + 1.2);
      camPos.x += (objx - camPos.x) * Math.min(1, dt * 5); camPos.z += (objz - camPos.z) * Math.min(1, dt * 5); camPos.y += (objy - camPos.y) * Math.min(1, dt * 5);
      camera.position.copy(camPos); camera.lookAt(pp.x + fx * 1.5, gy + 1.3, -pp.y + fz * 1.5);
    }
  }



  /** libera(): fuera de la escena el muñequito (sus geometrías y sus materiales) y las escuchas del botón «Pasear», del teclado, de la cruceta, de la ventana y del documento */
  var suelto = false;
  function libera() {
    if (suelto) return; suelto = true;
    if (paseando) salePaseo();
    escuchas.splice(0).forEach(function (f) { f(); });
    if (persona.parent) persona.parent.remove(persona);
    persona.traverse(function (o: T) { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    materiales.libera();
  }
  var api = { pp: pp, camPos: camPos, PalancaPuro: PalancaPuro, ponPalanca: ponPalanca, giraPalanca: giraPalanca, entraPaseo: entraPaseo, salePaseo: salePaseo, actualizaPaseo: actualizaPaseo,
    estado: function () { return { paseando: paseando, persona: persona, teclas: teclas }; }, libera: libera, componente: null as Manifiesto | null };
  api.componente = manifiestoPaseo(api);   // lo registra 90_final.js (como Vida)
  return api;
}
export type Paseo = ReturnType<typeof creaPaseo>;

/** El componente «paseo» (solo ciclo de vida: lo mueve el bucle; de todos los mundos): lo registra el talón de 12 con Componentes.registra */
export function manifiestoPaseo(api: { libera(): void }): Manifiesto {
  return {
    id: ID_PASEO, version: 1, consume: ["scene"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 11, triangulos: 520 },
    fases: {}, mundos: "todos",
    monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
