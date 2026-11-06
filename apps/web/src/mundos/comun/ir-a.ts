// Tocar para ir andando (tanda 9; MU5-n, A3-6c: antes apps/web/motor/12c_ir_a.js, que queda como talón): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el
// suelo hace que el paseante camine hasta allí. No salta ni se teletransporta: gira hacia el punto y anda con el avance de siempre (la misma velocidad, pendiente, troncos y borde de la finca
// de actualizaPaseo, 12_paseo.js), con el anillo de la llegada (Llegada, 12b_llegada.js: una sola malla ya existente) en el destino. Se cancela con cualquier tecla, la cruceta, la palanca o
// el quad/dron; otro toque cambia el destino. Rodea los troncos (EV2-B3: IrAPuro.planifica). Una línea de puntos (una sola THREE.Points, creada una vez, oculta sin destino) marca el camino.
// Un arrastre o una pulsación larga no lo dispara. Si el toque cae sobre un olivo, una baliza o una persona, manda lo que ya hacía (elegir/ficha; 09_camara.js): aquí solo llega lo que no
// eligió nada. Ajuste «controles.tocarIr» (Configuración → Controles; encendido); en la dirección, ?tocar=0 lo apaga y ?tocar=1 lo fuerza. La lógica pura está en nucleo/locomocion.ts.
// Componente «ir-a» de TODOS los mundos (la locomoción es de todo mundo): se mueve por el mundo activo (gm.obstaculo, gm.dentro). Su libera() quita la línea de la escena y suelta su
// geometría y su material. Código movido tal cual; lo que el legado reescribe o declara después (paseando, teclas, enQuad, enDron, VRX, Ajustes, gm) entra por función.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { IrAPuro } from "../../nucleo/locomocion.ts";
import { TODO_MUNDO } from "./tipos.ts";
import type { T } from "./tipos.ts";

export const ID_IR_A = "ir-a";

export interface DepsIrA {
  THREE: T; scene: T; Estado: T; Materiales: T;
  /** 02_mundo: el suelo de dibujo (la línea de puntos) y el censo de troncos (el rodeo cruza un segmento con cada uno) */
  suelo(x: number, y: number): number; copas(): T[];
  /** 12_paseo (paseando y teclas cambian), su pp; 12b_llegada; 16_vida y 29_vr (se montan después); 33_ajustes; el gestor de mundos (90_final) */
  paseando(): boolean; teclas(): T; pp: T; Llegada: T; enQuad(): boolean; enDron(): boolean; VRX(): T; Ajustes(): T; gm(): T;
  busqueda: string;
}

export function creaIrA(d: DepsIrA) {
  var THREE = d.THREE, scene = d.scene, Estado = d.Estado, suelo = d.suelo, pp = d.pp, Llegada = d.Llegada, location = { search: d.busqueda };
  var paseando = d.paseando, teclas = d.teclas, enQuad = d.enQuad, enDron = d.enDron, copas = d.copas;
  var materiales = d.Materiales.de(ID_IR_A);   // el material de la línea, con dueño «ir-a» (se suelta con libera())
  var st = IrAPuro.crea(), MAXP = 80, PASO_P = 1.2;
  // la línea de puntos: una sola malla de puntos (1 llamada, solo con destino); el búfer se rellena cada fotograma, no se crea nada nuevo
  var bufP = new Float32Array(MAXP * 3), geoP = new THREE.BufferGeometry(), atrP = new THREE.BufferAttribute(bufP, 3);
  atrP.setUsage(THREE.DynamicDrawUsage); geoP.setAttribute("position", atrP); geoP.setDrawRange(0, 0);
  var matP = materiales.estandar("PointsMaterial", { color: 0xffc94a, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
  var linea = new THREE.Points(geoP, matP); linea.frustumCulled = false; linea.visible = false; linea.renderOrder = 5; scene.add(linea);
  function pintaLinea() {
    if (!st.dest) { linea.visible = false; return; }
    var v = IrAPuro.puntosLinea(pp, st, PASO_P, MAXP);
    for (var i = 0; i < v.length; i++) { bufP[i * 3] = v[i]!.x; bufP[i * 3 + 1] = suelo(v[i]!.x, v[i]!.y) * Estado.exag + 0.18; bufP[i * 3 + 2] = -v[i]!.y; }
    geoP.setDrawRange(0, v.length); atrP.needsUpdate = true; linea.visible = v.length > 0;
  }
  function activo() { var a: T = true, Ajustes = d.Ajustes(); try { a = Ajustes.lee("controles.tocarIr"); } catch (e) { /* sin Configuración: encendido */ } return IrAPuro.activa(a, location.search); }
  function cancela() { if (st.dest) { IrAPuro.cancela(st); Llegada.borra(); } linea.visible = false; }
  // un toque corto o un clic sin nada elegido debajo (09_camara.js lo llama tras Usables.toque); mov y ms, desde que bajó el puntero. Devuelve si echó a andar
  function toca(cx: T, cy: T, mov: T, ms: T, tipo: T) {
    var gm = d.gm();
    if (!paseando() || d.VRX().on || enDron() || !activo() || !IrAPuro.esToque(mov, ms, tipo)) return false;
    var q = Llegada.apuntaPantalla(cx, cy); if (!q) return false;   // cielo o fuera de la finca: no pasa nada (y el anillo que hubiera sigue)
    var dd = { x: q.x, y: -q.z }, o = gm.obstaculo(dd.x, dd.y, 0.9); if (o) { dd.x = o.x; dd.y = o.y; }   // el destino no cae dentro de un tronco (ni fuera del borde; MU2-4)
    // el rodeo mira la lista de troncos (un segmento contra cada uno, que un obstaculo(x, y) de un punto no responde) y la caja del mundo activo (gm.dentro)
    var ruta = IrAPuro.planifica(pp, dd, copas(), IrAPuro.R_TRONCO, gm.dentro);   // null: sin rodeo, va recto (y si se atasca, replanifica o se rinde)
    IrAPuro.ir(st, dd.x, dd.y, ruta ? ruta.slice(0, -1) : [], copas(), gm.dentro); pintaLinea(); return true;
  }
  // desde actualizaPaseo (12_paseo.js), una vez por fotograma. manda: hay tecla, cruceta o palanca en uso → se cancela. Devuelve { av, ang } o null
  function paso(dt: T, manda: T) {
    if (!st.dest) return null;
    if (manda || enQuad() || enDron() || d.VRX().on || !paseando()) { cancela(); return null; }
    var r = IrAPuro.paso(st, pp, dt, teclas().run ? 4.3 : 1.7);
    if (!r || r.fin) { Llegada.borra(); linea.visible = false; return null; }
    pintaLinea(); return r;
  }
  // libera la malla (la escena no la vuelve a necesitar)
  function libera() { cancela(); scene.remove(linea); geoP.dispose(); matP.dispose(); materiales.libera(); }
  /** tras un libera(): la línea vuelve a la escena (su geometría y su material se vuelven a subir solos al dibujarse) */
  function monta() { if (!linea.parent) scene.add(linea); }
  return { libera: libera, monta: monta, linea: linea, toca: toca, paso: paso, cancela: cancela, activo: activo, destino: function () { return st.dest; } };
}
export type IrA = ReturnType<typeof creaIrA>;

/** El componente «ir-a» (solo ciclo de vida: el paseo lo mueve; de todos los mundos): lo registra el talón de 12c con Componentes.registra */
export function manifiestoIrA(api: IrA): Manifiesto {
  return {
    id: ID_IR_A, version: 1, consume: ["scene"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 1, triangulos: 0 },
    fases: {}, mundos: TODO_MUNDO,
    monta: function () { api.monta(); return api; }, libera: function () { api.libera(); }
  };
}
