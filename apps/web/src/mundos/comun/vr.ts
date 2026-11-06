// La VR inmersiva (WebXR, Meta Quest Browser): el paseo en primera persona con mandos, un panel flotante y un perfil de rendimiento propio (MU5-n, A3-6c; antes apps/web/motor/29_vr.js,
// que queda como talón). Fuera de una sesión XR no hace nada salvo comprobar (una vez) si el navegador ofrece WebXR y, si lo ofrece, mostrar el botón «Entrar en VR».
// La cámara cuelga de un «rig» (Group) que es el origen del espacio de seguimiento: mover o girar el rig mueve o gira al usuario por el mundo (three r128 no puede desplazar el espacio de referencia).
// Durante la sesión, camera.position es la pose LOCAL de la cabeza dentro del rig (la reescribe three al pintar); la cabeza en el mundo es VRX.cab (rig + giro · pose local).
// El resto del programa sigue leyendo camera.position como siempre: justo antes de usarlo, actualizaPaseo() lo deja en la cabeza del mundo (pp), y three lo vuelve a sobrescribir al pintar.
// Partida en cinco piezas que comparten el estado VRX y el contexto `c` (cada pieza toma por su nombre lo de las que se crearon antes; lo de después, por `c` al usarlo):
//   vr-rig.ts            el rig y la cámara, y los mandos como rayos (sus escuchas, ejes, botones, flancos y vibración) y la altura de la vista;
//   vr-teletransporte.ts el arco a pie, el rayo desde el aire (vuelo y mirador), el fundido a negro y el mirador;
//   vr-panel.ts          las láminas (panel, ficha, ficha con botones), agarrarlas, PanelVR por filas, Gente, la medida y el gatillo;
//   vr-sesion.ts         WebXR sí o no, el botón, el perfil de las gafas y su adaptador, entrar y salir, «sessiongranted» y los ganchos de depuración;
//   este fichero         el estado VRX, la viñeta de confort, la locomoción de cada fotograma (vrActualiza) y el componente.
// Lo puro (confort, medidas de las fichas, Gente, «sessiongranted») está en vr-puros.ts; los tipos (DepsVr, CtxVr), en vr-tipos.ts. El código es el de 29_vr movido tal cual (lo
// repartió un generador por líneas; solo se tiparon los parámetros y lo que el legado reescribe pasó a función: paseando(), primera(), persona(), teclas(), gm…).
// Es un componente de TODOS los mundos (mundos: "todos"): la VR tiene que seguir al entrar en un interior; se mueve por el mundo activo (gm.suelo, gm.dentro, gm.obstaculo; MU2-4) y su
// near/far es el del Ambiente del mundo activo (aplicaCamara; MU2-7). Lo registra 90_final.js (como Vida: el legado la usa por su nombre desde que se monta). Su libera() suelta de verdad
// lo que crea una vez por página (los rayos, el arco y su marca, la línea, el velo, la viñeta y las tres láminas con sus texturas) y quita sus escuchas (los mandos, el botón,
// «sessiongranted», el Bus, el presentador, Configuración); si hay una sesión abierta, la termina antes.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, MaterialMin } from "../../nucleo/materiales.ts";
import { aplicaCamara } from "../../nucleo/ambiente.ts";
import { BuclePuro } from "../../nucleo/bucle.ts";
import { FundidoPuro, creaFundido } from "../../nucleo/fundido.ts";
import type { T } from "./tipos.ts";
import { VrConfortPuro, VrFichaPuro } from "./vr-puros.ts";
import { creaVrRig } from "./vr-rig.ts";
import { creaVrTeletransporte } from "./vr-teletransporte.ts";
import { creaVrPanel } from "./vr-panel.ts";
import { creaVrSesion } from "./vr-sesion.ts";
import type { CtxVr, DepsVr } from "./vr-tipos.ts";
export type { CtxVr, DepsVr } from "./vr-tipos.ts";

export const ID_VR = "vr";

// ----- 5) la viñeta de confort (un velo con el centro transparente, pegado a la cabeza): su material, en la fábrica (MU5-n, A3-6c; antes Materiales.sombreador("vineta-vr", …) en 29_vr)
export const MATERIAL_VINETA = "vineta-vr";
/** Lo que se le pasa a crea(): los uniformes (uK, cuánto se cierra; uA, dónde empieza a oscurecer), que mueve vrActualiza */
export interface OpcVineta { uniforms: Record<string, { value: unknown }> }
/** La viñeta: el clásico es el ShaderMaterial de siempre, movido, que recibe sus uniformes (el mismo objeto: vrActualiza los mueve) */
export function defVineta(): DefMaterial<OpcVineta> {
  return {
    clasico: function (opc, c) {
      return new (c.THREE["ShaderMaterial"] as new (o: unknown) => MaterialMin)({
        uniforms: opc.uniforms, transparent: true, depthTest: false, depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uK; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(uA, uA + 0.34, r) * uK; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }"
      });
    },
    // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). Un MeshBasicNodeMaterial con el estado de dibujo del clásico
    // (transparente, sin probar ni escribir profundidad; sin niebla, como el ShaderMaterial, que nace con fog false) y el mismo cálculo: r = |uv − 0,5| · 2 y la opacidad
    // smoothstep(uA, uA + 0,34, r) · uK sobre negro, con los MISMOS { value } de uK y uA que mueve vrActualiza (releídos en cada objeto, onObjectUpdate).
    // FALTA: nada conocido del dibujo; NO VERIFICADO que el grafo compile ni que se vea igual por ojo con multiview (capturas por material: MU6; el Quest sigue en super-three, MULTIVIEW §4.1).
    tsl: function (opc, c) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Tn = c.TSL as any, M = c.THREE["MeshBasicNodeMaterial"] as new (o: unknown) => MaterialMin;
      const u = opc.uniforms as Record<string, { value: number }>;
      const uK = Tn.uniform(u["uK"]!.value).onObjectUpdate(function () { return u["uK"]!.value; }), uA = Tn.uniform(u["uA"]!.value).onObjectUpdate(function () { return u["uA"]!.value; });
      const r = Tn.length(Tn.uv().sub(0.5)).mul(2.0), a = Tn.smoothstep(uA, uA.add(0.34), r).mul(uK);
      const m = new M({ transparent: true, depthTest: false, depthWrite: false, fog: false }) as MaterialMin & { colorNode: unknown; opacityNode: unknown };
      m.colorNode = Tn.vec3(0.0, 0.0, 0.0); m.opacityNode = a;
      return m;
    }
  };
}

export function creaVr(d: DepsVr) {
  var THREE = d.THREE, camera = d.camera, Estado = d.Estado, Materiales = d.Materiales;
  var VRX: T = {
    on: false, entrando: false, sesion: null, base: null, soporta: false, estado: "comprobando…", ojo: 0, frame: null,
    rig: { x: 0, y: 0, z: 0, yaw: 0 }, vuelo: false, mirador: false, correr: false, vineta: true, nivel: 0,
    modoPrev: "nube", calPrev: 1, nearPrev: 0.5, farPrev: 5000, prev: {}, giroOk: true, parcSel: 0, emaDt: 13.9, emaJs: 6, tEstable: 0, umb: null, compila: null, nBaj: 0, nAlt: 0, tNivel: 0,
    tp: null, salto: false, hover: "", tFicha: 0, fichaT: 0, fichaDe: "", sucio: true, hapt: 0, hMov: 0, sesionesN: 0, cab: new THREE.Vector3(), mira: { x: 0, z: -1 },
    captura: null, voz: null, gente: null, genteFirma: "", tGente: 0, pestana: "mundo", giro: 30, sinPint: false, fichaId: "", balFirma: "", balInfo: null, hoverB: "", botonesB: []
  };
  Materiales.define(MATERIAL_VINETA, defVineta());
  var c = { d: d, VRX: VRX, materiales: Materiales.de(ID_VR), Nucleo: { creaFundido: creaFundido, FundidoPuro: FundidoPuro, BuclePuro: BuclePuro, aplicaCamara: aplicaCamara },
    vrGatillo: function (o: T) { c.panel.vrGatillo(o); } } as CtxVr;

  // ----- 5) la viñeta de confort (un velo con el centro transparente, pegado a la cabeza)
  var vrVineta = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), c.materiales.crea(MATERIAL_VINETA, { uniforms: { uK: { value: 0 }, uA: { value: 0.4 } } }));   // el clásico es el ShaderMaterial de siempre (defVineta, arriba)
  vrVineta.position.set(0, 0, -0.32); vrVineta.renderOrder = 999; vrVineta.frustumCulled = false; vrVineta.visible = false;
  c.vrVineta = vrVineta;

  c.rig = creaVrRig(c);
  c.tele = creaVrTeletransporte(c);
  c.panel = creaVrPanel(c);
  c.tele.enlaza(c.panel);
  c.sesion = creaVrSesion(c);
  var RG = c.rig, TT = c.tele, P = c.panel, Usables = d.Usables, Laminas = d.Laminas, VrPresupuesto = d.VrPresupuesto, suelo = d.suelo, pp = d.pp, pendFactor = d.pendFactor;
  var actualizaPaseo = d.actualizaPaseo, ponPrimera = d.ponPrimera, persona = d.persona;
  var vrCabeza = RG.vrCabeza, vrMano = RG.vrMano, vrEjes = RG.vrEjes, vrBoton = RG.vrBoton, vrFlanco = RG.vrFlanco, vrPulso = RG.vrPulso, vrPulsoIzq = RG.vrPulsoIzq, vrDz = RG.vrDz;
  var vrRayoDe = RG.vrRayoDe, vrIrA = RG.vrIrA, vrBaseY = RG.vrBaseY, vrAplicaRig = RG.vrAplicaRig, vrV2 = RG.vrV2, vrV3 = RG.vrV3, vrEjeY = RG.vrEjeY;
  var vrFundidoPaso = TT.vrFundidoPaso, vrMirador = TT.vrMirador, vrVueloTp = TT.vrVueloTp, vrArco = TT.vrArco, vrSalta = TT.vrSalta, arco = TT.arco, arcoMarca = TT.arcoMarca, VT = TT.VT;
  var panel = P.panel, ficha = P.ficha, fichaB = P.fichaB, vrMed = P.vrMed, VR_CAPAS = P.VR_CAPAS, PanelVR = P.PanelVR, vrPanelConmuta = P.vrPanelConmuta, vrVinetaConmuta = P.vrVinetaConmuta;
  var vrAgarreTic = P.vrAgarreTic, vrQueda = P.vrQueda, vrSigue = P.vrSigue, vrGenteTic = P.vrGenteTic, vrBajoRayo = P.vrBajoRayo, vrPintaPanel = P.vrPintaPanel, vrFichaTic = P.vrFichaTic;
  var vrPintaAcciones = P.vrPintaAcciones;

  function vrActualiza(dt: T, tms?: T) {
    var gm = c.d.gm();   // c.d: aquí dentro, d es el ángulo del giro por saltos (como en 29_vr)
    vrFundidoPaso(dt);
    var r = VRX.rig, h = vrCabeza(), L = vrMano("left"), R = vrMano("right"), iz = vrEjes(L.src), de = vrEjes(R.src);
    // botones: Y panel, X viñeta, A vuelo, B mirador
    if (vrFlanco("Y", vrBoton(L.src, 5))) { vrPanelConmuta(); vrPulso(L, 0.2, 20); }
    if (vrFlanco("X", vrBoton(L.src, 4))) vrVinetaConmuta();
    if (vrFlanco("A", vrBoton(R.src, 4))) { VRX.vuelo = !VRX.vuelo; VRX.mirador = false; VRX.sucio = true; vrPulso(R, 0.2, 20); }
    var fB = vrFlanco("B", vrBoton(R.src, 5)), fP = vrFlanco("RS", vrBoton(R.src, 3));
    if (VRX.captura && (fB || fP)) { if (VRX.captura.boton(fB ? "B" : "palanca")) vrPulso(R, 0.3, 25); }   // C9b: con un juego en lámina, B pausa y pulsar la palanca sale
    else if (fB) { vrMirador(!VRX.mirador); vrPulso(R, 0.3, 25); }
    vrAgarreTic(dt);   // VR-L1: el grip de cada mando agarra la lámina que apunta (antes que correr: el izquierdo no corre mientras agarra)
    var vrAg = P.agarre();
    VRX.correr = vrBoton(L.src, 1) && !(vrAg && vrAg.o === L);
    if (VRX.voz) VRX.voz.mando(vrBoton(L.src, 0), vrPulsoIzq);   // F3e: el gatillo izquierdo (botón 0) y el pulso del mando, cada fotograma
    // giro a saltos (palanca derecha ← →) y teletransporte (palanca derecha ↑: arco; al soltar, salta)
    var gx = vrDz(de.x), gy = vrDz(de.y), mueveStick = 0;
    if (VRX.captura) { VRX.captura.palanca(de.x, de.y, dt); gx = gy = 0; }   // C9b: la palanca derecha es del juego en lámina (ni giro ni teletransporte)
    if (Math.abs(gx) > 0.7 && Math.abs(gx) > Math.abs(gy)) {
      if (VRX.giroOk) { VRX.giroOk = false; var d = -Math.sign(gx) * VRX.giro * Math.PI / 180; vrV2.set(r.x - h.x, 0, r.z - h.z).applyAxisAngle(vrEjeY, d); r.x = h.x + vrV2.x; r.z = h.z + vrV2.z; r.yaw += d; VRX.hMov = 0.25; vrPulso(R, 0.1, 10);
        [panel, ficha, fichaB].forEach(function (l: T) { if (!l.ini || !l.m.visible) return; var pg = VrFichaPuro.gira(l.m.position.x, l.m.position.z, h.x, h.z, d); l.m.position.x = pg.x; l.m.position.z = pg.z; });   // EV2-A2 y VR-L1: las láminas giran contigo (el giro no las deja de lado)
      }
    } else if (Math.abs(gx) < 0.35) VRX.giroOk = true;
    if (VRX.vuelo || VT.act) vrVueloTp(R, gy < -0.6 && Math.abs(gx) < 0.5);   // desde el aire: rayo recto y anillo (2b)
    else if (gy < -0.6 && Math.abs(gx) < 0.5) { VRX.tp = vrArco(R); arco.visible = true; arcoMarca.visible = !!VRX.tp; if (VRX.tp) arcoMarca.position.set(VRX.tp.x, suelo(VRX.tp.x, -VRX.tp.z) * Estado.exag + 0.08, VRX.tp.z); VRX.tpAct = true; }
    else { if (VRX.tpAct && VRX.tp) { var tp = VRX.tp; vrSalta(tp.x, -tp.z, function () { vrIrA(tp.x, -tp.z); VRX.hMov = 0.35; }); vrPulso(R, 0.35, 30); } VRX.tpAct = false; VRX.tp = null; arco.visible = false; arcoMarca.visible = false; }
    // andar (palanca izquierda): relativo a la mirada
    var av = -vrDz(iz.y), la = vrDz(iz.x), g = camera.getWorldDirection(vrV3);
    var fx = g.x, fz = g.z, hl = Math.hypot(fx, fz) || 1, hx = fx / hl, hz = fz / hl;   // dirección horizontal de la mirada
    var CV = VrConfortPuro.VEL, vel = VRX.vuelo ? (VRX.correr ? CV.vuelaRapido : CV.vuela) : (VRX.correr ? CV.corre : CV.anda) * pendFactor(), mov0 = Math.min(1, Math.hypot(av, la)), mov = VRX.movF = VrConfortPuro.rampa(VRX.movF || 0, mov0, dt);
    vel *= mov0 > 0 ? mov / mov0 : 0;   // la rampa de salida (~0,15 s) escala la velocidad; soltar la palanca frena en seco
    var dx = 0, dz = 0, dy = 0;
    if (mov > 0) {
      if (VRX.vuelo) { dx = g.x * av * vel * dt - hz * la * vel * dt; dz = g.z * av * vel * dt + hx * la * vel * dt; dy = g.y * av * vel * dt; }
      else { dx = hx * av * vel * dt - hz * la * vel * dt; dz = hz * av * vel * dt + hx * la * vel * dt; }
    }
    var nx = h.x + dx, nz = h.z + dz;
    // los troncos no se atraviesan (a pie, o volando a ras: 0,55 m) y no se sale del borde (siempre; volando alto, radio 0 = solo el borde). MU2-4: gm.obstaculo, en el marco del mundo (y = −z)
    var aRas = !VRX.vuelo || h.y - gm.suelo(h.x, -h.z) * Estado.exag < 3, rTronco = aRas ? 0.55 : 0, ob = gm.obstaculo(nx, -nz, rTronco); if (ob) { nx = ob.x; nz = -ob.y; }
    r.x += nx - h.x; r.z += nz - h.z; if (VRX.vuelo) r.y += dy;
    var gnd = gm.suelo(nx, -nz) * Estado.exag + vrBaseY();
    if (VRX.vuelo) r.y = Math.max(r.y, gnd + 0.4); else r.y += (gnd - r.y) * Math.min(1, dt * 12);
    VRX.hMov = Math.max(0, VRX.hMov - dt); var mueve = mov > 0 || VRX.hMov > 0;
    // lo que el resto del programa mira: el «paseo» (pp) es la cabeza; el muñequito va oculto
    pp.x = nx; pp.y = -nz; pp.ang = Math.atan2(hx, -hz); if (!VRX.vuelo && mov > 0) pp.paso += vel * mov0 * dt * 3.4;
    var teclas = c.d.teclas(); teclas.up = teclas.down = teclas.left = teclas.right = false;
    actualizaPaseo(dt); ponPrimera(true); persona().visible = false;
    vrAplicaRig();
    VrPresupuesto.mueve(nx, nz);   // Q0c-a (02g): recorta por distancia solo tras moverse 15-75 m; sin reservas
    // viñeta de confort mientras te mueves
    var vn = VrConfortPuro.vineta(vel * mov0, VRX.vinetaTipo, VRX.hMov > 0), vu = vrVineta.material.uniforms;
    vrVineta.visible = VRX.vineta; vu.uK.value = VrConfortPuro.sigue(vu.uK.value, mueve ? vn.k : 0, dt); vu.uA.value = vn.abre;
    // láminas
    var rr = vrRayoDe(R), hv = "";
    if (VR_CAPAS) Laminas.apunta(rr);   // EV2-A1: el resalte de los botones de las fichas en el mundo (sin la bandera, ni un rayo de más)
    if (panel.m.visible) {
      if (VR_CAPAS) vrQueda(panel, vrMed.panel.dist, vrMed.panel.bajo, !mueve); else vrSigue(panel, dt, vrMed.panel.dist, vrMed.panel.bajo);
      vrGenteTic(dt);
      var q = vrBajoRayo(panel, VRX.botones, rr); hv = q ? q.id : "";
      if (hv !== VRX.hover) { VRX.hover = hv; VRX.sucio = true; }
      if (VRX.sucio) vrPintaPanel();
    }
    if (ficha.m.visible) { vrSigue(ficha, dt, vrMed.ficha.dist, vrMed.ficha.bajo); if (!ficha.agarrada) VRX.fichaT -= dt; if (VRX.fichaT <= 0) { ficha.m.visible = false; if (VRX.fichaDe) Usables.cierra(VRX.fichaDe, "tiempo"); VRX.fichaDe = ""; } }
    vrFichaTic(dt); VRX.salto = false;
    if (fichaB.m.visible) {
      vrSigue(fichaB, dt, vrMed.fichaB.dist, vrMed.fichaB.bajo);
      var qb = vrBajoRayo(fichaB, VRX.botonesB, rr), hb = qb ? qb.id : "";
      if (hb !== VRX.hoverB) { VRX.hoverB = hb; if (VRX.balInfo) vrPintaAcciones(VRX.balInfo); }
    }
    PanelVR.fotograma(dt);   // EV2-A3: lo enganchado (el menú de muñeca, 31c_muneca.js), con el rig ya colocado
  }

  // ---- el ciclo de vida del componente: libera() suelta de verdad lo que la VR creó una vez por página y quita sus escuchas; monta() vuelve a enganchar lo que se quitó
  var liberada = false;
  function libera() {
    if (liberada) return; liberada = true;
    c.sesion.libera();   // primero: si hay sesión, se cierra como al salir (descuelga el rig, el panel, los rayos y el velo)
    P.libera(); TT.libera(); RG.libera();
    if (vrVineta.parent) vrVineta.parent.remove(vrVineta);
    vrVineta.geometry.dispose(); vrVineta.material.dispose();
    c.materiales.libera();   // lo que quede de la fábrica con dueño «vr» (los de arriba ya se soltaron con su dispose y la fábrica los olvida)
  }
  function monta() { if (!liberada) return; liberada = false; RG.monta(); P.monta(); c.sesion.monta(); }
  /** el manifiesto: solo ciclo de vida (lo registra 90_final.js; el legado usa la VR por su nombre desde que se monta) y de todos los mundos */
  var componente: Manifiesto = {
    id: ID_VR, version: 1, consume: ["renderer", "scene", "camera"], expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 }, fases: {}, mundos: "todos",
    monta: function () { monta(); return { libera: libera }; }, libera: function () { libera(); }
  };
  return {
    VRX: VRX, vrRig: RG.vrRig, vrDebugExtra: c.sesion.vrDebugExtra, vrMano: vrMano, vrRayoDe: vrRayoDe, vrCierra: TT.vrCierra, vrAbre: TT.vrAbre, vrFundido: TT.vrFundido, vrAparece: TT.vrAparece,
    creaLamina: P.creaLamina, panel: panel, vrBajoRayo: vrBajoRayo, vrRect: P.vrRect, vrAj: RG.vrAj, PanelVR: PanelVR, vrPintaFicha: P.vrPintaFicha, vrRecoloca: RG.vrRecoloca,
    vrPulso: vrPulso, vrActualiza: vrActualiza, vrFin: c.sesion.vrFin, entraVR: c.sesion.entraVR, vrSale: c.sesion.vrSale, vrVineta: vrVineta, partes: c, libera: libera, monta: monta,
    componente: componente
  };
}
export type Vr = ReturnType<typeof creaVr>;
