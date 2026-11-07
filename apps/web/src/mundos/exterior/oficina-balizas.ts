// Las balizas oficiales de la oficina (OF10; doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114). A3-8b: antes vivían dentro de «oficina-mundo» (A3-7b2,
// mundos/exterior/oficina-mundo.ts, y antes apps/web/motor/39_oficina_mundo.js, que sigue siendo el talón de los dos); al partirlo, los anuncios, las invitaciones y el panel
// pasan a apps/web/src/ui/oficina-mundo.ts, de TODO mundo, y las balizas se quedan aquí, componente «oficina-balizas» del exterior (mundos: ["exterior"]): son columnas en
// su escena sobre su suelo, una capa de su minimapa y un tipo de sus Entidades, y la api las pide por finca. Código movido tal cual de la oficina.
//  · BALIZAS OFICIALES (GET /api/balizas-oficiales y el tema «balizas» de la sala, que valida y pasa la oficina: alAviso): columnas verde oliva con una bandera clara, más
//    bajas que las de las parcelas (19_balizas.js: de colores por su estado y con rombo) y en el minimapa como una bandera cuadrada con ◆: el tipo «baliza-oficial» de
//    Entidades, con su ficha común (título, texto, hasta cuándo, «Ir a esta baliza») y, si eres de la oficina, «Mover aquí» y «Quitar».
//  · Para el panel de la oficina (de todo mundo): si ahora se puede poner una baliza (disponible: el exterior es el mundo activo) y el cuerpo de «Poner aquí» donde estás.
// Consume «OficinaMundo» (ui/oficina-mundo.ts): lo puro (OficinaMundoPuro), pedir a la api con SU cancelación (pideCon) y avisar en el panel o en el HUD (avisa). Así ?oficina=0
// apaga los dos y, si se libera la oficina, antes se liberan sus balizas. Su libera() suelta el tipo de Entidades, la capa del minimapa, las mallas y los materiales (por la
// fábrica, con dueño «oficina-balizas») y CANCELA sus peticiones en vuelo (pedir, mover y quitar balizas). Los trozos de montaGrafica a refresca los evalúan en Node
// pruebas/guardianes/estaticos.test.js y recorte.test.js (el .ts leído como JavaScript: sin tipos ni «dp.»).
import type { Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = any;

export const ID_OFICINA_BALIZAS = "oficina-balizas";

/** Lo que el talón de 39 le da (el mismo objeto que a la oficina): THREE, D (01), el suelo (02) y Componentes (02c), Entidades/Estaticos/Materiales (02e-02j), la escena (03),
 *  la cámara de órbita, el paseo, la llegada, el minimapa, la presencia (Aspecto, Encuentro, sitioJunto); VRX (29_vr), paseando (12) y enQuad (16), que otros reescriben, por getter */
export interface DepsOficinaBalizas {
  THREE: T; D: T; suelo: T; Componentes: T; Entidades: T; Estaticos: T; Materiales: T; scene: T; camera: T; Estado: T; objetivo: T; pp: T; Llegada: T; Minimapa: T;
  Aspecto: T; Encuentro: T; sitioJunto: T; readonly VRX: T; readonly paseando: boolean; readonly enQuad: boolean;
}

// [motor:inicio] (lo evalúa en Node pruebas/guardianes/oficina_mundo.test.js con THREE, DOM, la red y la presencia de mentira, junto con la oficina)
export function OficinaBalizasMotor(dp: DepsOficinaBalizas, n: T, of: T) {
  var OP: T = of.Puro, FINCA_ID: T = dp.D.finca_id || "", CENTRO: T = dp.D.centro_utm || null;
  var COLOR: T = dp.Aspecto.CHALECO, CLARO: T = dp.Aspecto.INSIGNIA, ALTO = 18, REFRESCO_S = 300;
  var balizas: T = [], st: T = { pedidas: 0, error: null }, materiales: T = dp.Materiales.de("oficina-balizas");   // lo que cree este componente se libera con su libera() (MATERIALES §5)
  var ctl: T = new AbortController(), pide: T = of.pideCon(ctl.signal);   // A3-7b2: libera() cancela lo que esté en vuelo (A3-8b: con su propia cancelación)
  var tRefresco = 0, vivo = true;
  var gB: T = null, mCol: T = null, mBan: T = null, geos: T = [], m4: T = null, v1: T = null, v2: T = null, q0: T = null, vS: T = null, w0: T = null;
  function limpia(t?: T) { return of.limpia(t); }   // Chat.limpia, por la oficina
  function oyente() { if (dp.VRX.on) return { x: dp.VRX.cab.x, y: -dp.VRX.cab.z }; if (dp.paseando) return { x: dp.pp.x, y: dp.pp.y }; return { x: dp.objetivo.x, y: -dp.objetivo.z }; }
  function soyOficina() { return !!of.soyOficina(); }

  // ---- las balizas oficiales: dos mallas instanciadas (columna y bandera, 20 como mucho: 2 llamadas para todas), creadas con la primera
  function montaGrafica() {
    m4 = new dp.THREE.Matrix4(); v1 = new dp.THREE.Vector3(); v2 = new dp.THREE.Vector3(); q0 = new dp.THREE.Quaternion(); vS = new dp.THREE.Vector3(1, 1, 1); w0 = new dp.THREE.Vector3();
    gB = new dp.THREE.Group(); gB.name = "balizas-oficiales"; dp.scene.add(gB);
    var gC: T = new dp.THREE.CylinderGeometry(0.3, 0.55, ALTO, 10, 1, true), gF: T = new dp.THREE.BoxGeometry(1.5, 0.95, 0.06);
    gC.translate(0, ALTO / 2, 0); gF.translate(0.78, ALTO + 0.1, 0);   // la bandera, a un lado de lo alto de la columna
    var mC: T = materiales.estandar("MeshBasicMaterial", { color: COLOR, transparent: true, opacity: 0.42, depthWrite: false, blending: dp.THREE.AdditiveBlending, fog: false }), mF: T = materiales.estandar("MeshBasicMaterial", { color: CLARO, fog: false });   // A3-7b2: de la fábrica, con dueño (A3-8b: «oficina-balizas»)
    geos = [gC, gF];
    mCol = new dp.THREE.InstancedMesh(gC, mC, OP.BALIZAS_MAX); mBan = new dp.THREE.InstancedMesh(gF, mF, OP.BALIZAS_MAX);
    [mCol, mBan].forEach(function (m?: T) { m.count = 0; gB.add(m); }); dp.Estaticos.congela(gB);   // AG-1.15: quietas; cada baliza lleva su matriz de instancia   // se recortan: coloca() les calcula el volumen envolvente
  }
  function coloca() {
    if (!balizas.length && !gB) return;
    if (!gB) montaGrafica();
    balizas.forEach(function (b?: T, i?: T) {
      b.pos = { x: b.x, y: dp.suelo(b.x, b.y) * dp.Estado.exag, z: -b.y };
      m4.compose(v1.set(b.pos.x, b.pos.y, b.pos.z), q0, vS); mCol.setMatrixAt(i, m4); mBan.setMatrixAt(i, m4);
    });
    mCol.count = mBan.count = balizas.length; mCol.instanceMatrix.needsUpdate = true; mBan.instanceMatrix.needsUpdate = true;
    if (balizas.length) { mCol.computeBoundingSphere(); mBan.computeBoundingSphere(); }   // después de escribir las matrices: la que three calculara con 0 instancias quedaría vacía
    gB.visible = balizas.length > 0;
  }
  function refresca() {
    if (!of.hayApi() || !FINCA_ID || !CENTRO) return Promise.resolve(false);
    st.pedidas++; tRefresco = 0;
    return pide("GET", "balizas-oficiales?finca=" + encodeURIComponent(FINCA_ID)).then(function (j?: T) {
      if (!vivo) return false;
      balizas = OP.leeBalizas(j, CENTRO, FINCA_ID, limpia); st.error = null; coloca(); return true;
    }, function (e?: T) { st.error = e && e.message ? e.message : String(e); return false; });
  }
  function idDe(b?: T) { return "baliza-oficial:" + b.id; }
  function deId(id?: T) { for (var i = 0; i < balizas.length; i++) if (idDe(balizas[i]) === id) return balizas[i]; return null; }
  function enPantalla(cx?: T, cy?: T, r?: T) {   // ¿el toque cae en la columna (del pie a lo alto, a menos de 22 px)?
    var mejor: T = null, md = 22;
    balizas.forEach(function (b?: T) {
      if (!b.pos) return;
      v1.set(b.pos.x, b.pos.y, b.pos.z).project(dp.camera); v2.set(b.pos.x, b.pos.y + ALTO, b.pos.z).project(dp.camera); if (v1.z > 1 && v2.z > 1) return;
      var ax: T = (v1.x * 0.5 + 0.5) * r.width + r.left, ay: T = (-v1.y * 0.5 + 0.5) * r.height + r.top, bx: T = (v2.x * 0.5 + 0.5) * r.width + r.left, by: T = (-v2.y * 0.5 + 0.5) * r.height + r.top;
      var vx: T = bx - ax, vy: T = by - ay, L: T = vx * vx + vy * vy || 1, t: T = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / L)), d: T = Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
      if (d < md) { md = d; mejor = b; }
    });
    return mejor ? { id: idDe(mejor), s: md / 22 } : null;
  }
  function enRayo(rr?: T) {   // como las balizas de las parcelas: el punto de la columna más cercano al rayo, con un radio que crece con la distancia
    var o: T = rr.ray.origin, d: T = rr.ray.direction, bb: T = d.y, den: T = 1 - bb * bb, mejor: T = null, ms = 1e9;
    if (den < 1e-6) return null;
    balizas.forEach(function (b?: T) {
      var g: T = b.pos; if (!g) return; w0.set(o.x - g.x, o.y - g.y, o.z - g.z);
      var dw: T = d.x * w0.x + d.y * w0.y + d.z * w0.z, s: T = Math.max(0, Math.min(ALTO + 0.6, (w0.y - bb * dw) / den));
      var t: T = (g.x - o.x) * d.x + (g.y + s - o.y) * d.y + (g.z - o.z) * d.z; if (t < 0.5 || t > 2500) return;
      var dist: T = Math.hypot(o.x + d.x * t - g.x, o.y + d.y * t - g.y - s, o.z + d.z * t - g.z), rad: T = Math.max(1.2, t * 0.012), sc: T = dist / rad;
      if (sc < 1 && sc + t * 0.0005 < ms) { ms = sc + t * 0.0005; mejor = { id: idDe(b), t: t, s: sc }; }
    });
    return mejor;
  }
  function irA(b?: T) {
    var L: T = dp.sitioJunto({ x: b.x, y: b.y }, oyente(), dp.Encuentro.BALIZA, dp.enQuad && !dp.VRX.on ? 1.05 : 0.55);
    return dp.Llegada.ve(L.x, L.y, L.ang);
  }
  function fichaBaliza(id?: T, modo?: T) {
    var b: T = deId(id); if (!b) return null;
    var f: T = { titulo: "◆ Oficina · " + b.titulo, color: COLOR, filas: [], lineas: [], pie: "Baliza oficial: la puso la oficina", acciones: [{ id: "oir", txt: "Ir a esta baliza", fn: function () { return irA(b); } }] };
    if (b.texto) { f.filas.push({ k: "Dice", v: b.texto }); f.lineas.push(b.texto); }
    var h: T = OP.hasta(b.hasta, Date.now()); f.filas.push({ k: "Se ve", v: h }); f.lineas.push("Se ve " + h);
    if (soyOficina() && of.hayApi()) {   // la oficina la mueve a donde está o la quita (la api lo vuelve a comprobar)
      f.acciones.push({ id: "omv", txt: "Mover aquí", fn: function () { return mueve(b); } });
      f.acciones.push({ id: "oqu", txt: modo === "vr" ? "Quitar" : "Quitar baliza", fn: function () { return quitaBaliza(b); } });
    }
    return f;
  }
  var quitaTipo: T = dp.Entidades.registra({ tipo: "baliza-oficial", dueno: "39_oficina_mundo", prioridad: 21, sinAnillo: true, pantalla: enPantalla, rayo: enRayo, ficha: fichaBaliza,
    existe: function (id?: T) { return !!deId(id); },
    lista: function () { return balizas.map(function (b?: T) { return { id: idDe(b), x: b.x, y: b.y, titulo: b.titulo }; }); },
    pos: function (id?: T) { var b: T = deId(id); return b && b.pos ? { x: b.pos.x, y: b.pos.y, z: b.pos.z } : null; },
    radio: function () { return 1.2; } });
  n.limpia(quitaTipo);
  // en el minimapa: una bandera cuadrada verde oliva con ◆ (las de las parcelas son rombos de colores)
  n.limpia(dp.Minimapa.capa(function (c?: T, X?: T, Y?: T) {
    balizas.forEach(function (b?: T) {
      var x: T = X(b.x), y: T = Y(b.y);
      c.strokeStyle = "#101418"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 7); c.stroke();
      c.fillStyle = "#a3b236"; c.fillRect(x, y - 7, 8, 6); c.strokeRect(x, y - 7, 8, 6);
      c.fillStyle = "#f4ecc2"; c.beginPath(); c.moveTo(x + 4, y - 6.2); c.lineTo(x + 5.6, y - 4); c.lineTo(x + 4, y - 1.8); c.lineTo(x + 2.4, y - 4); c.closePath(); c.fill();
    });
  }, 5));

  // ---- lo que hace la oficina (la api lo comprueba todo y lo apunta en la auditoría); el aviso, en el panel de la oficina o en el HUD (of.avisa)
  function mueve(b?: T) {
    var u: T = OP.aUtm(oyente().x, oyente().y, CENTRO);
    return pide("PUT", "admin/balizas/" + b.id, { x: u.x, y: u.y }).then(function () { of.avisa("Baliza movida."); return refresca(); }, function (e?: T) { of.avisa(e.message); return false; });
  }
  function quitaBaliza(b?: T) { return pide("DELETE", "admin/balizas/" + b.id).then(function () { of.avisa("Baliza quitada."); return refresca(); }, function (e?: T) { of.avisa(e.message); return false; }); }
  // para el panel de la oficina (A3-8b): ¿se puede poner una aquí? (el exterior, el mundo activo) y el cuerpo de «Poner aquí» donde estás, o null si no vale
  function disponible() { return vivo && !!FINCA_ID && !!CENTRO && (!dp.Componentes || !dp.Componentes.mundo || dp.Componentes.mundo() === "exterior"); }
  function cuerpo(titulo?: T, texto?: T, horas?: T) { return OP.cuerpoBaliza(FINCA_ID, oyente(), CENTRO, titulo, texto, horas, limpia); }
  // el tema «balizas» de la sala (validado por la oficina): se repiden si son de esta finca
  function alAviso(finca?: T) { if (finca === FINCA_ID) refresca(); }

  // ---- fase «tarde» (cada 0,5 s): las balizas se repiden cada 5 min y se recolocan si cambia la exageración
  var exagHecha: T = dp.Estado.exag;
  function tarde(dt?: T) {
    tRefresco += dt; if (tRefresco >= REFRESCO_S) refresca();
    if (dp.Estado.exag !== exagHecha) { exagHecha = dp.Estado.exag; coloca(); }
  }
  function libera() {
    vivo = false; ctl.abort();
    if (gB) { dp.scene.remove(gB); [mCol, mBan].forEach(function (m?: T) { m.dispose(); }); geos.forEach(function (g?: T) { g.dispose(); }); materiales.libera(); gB = null; mCol = mBan = null; }
    balizas = [];
  }
  function estado() { return { balizas: balizas.map(function (b?: T) { return { id: b.id, x: b.x, y: b.y, titulo: b.titulo }; }), pedidas: st.pedidas, error: st.error, mallas: gB ? [mCol.count, mBan.count] : null }; }
  refresca();
  return { tarde: tarde, libera: libera, estado: estado, refresca: refresca, disponible: disponible, cuerpo: cuerpo, alAviso: alAviso };
}
// [motor:fin]

export function creaOficinaBalizas(dp: DepsOficinaBalizas, n: T) { return OficinaBalizasMotor(dp, n, n.api("oficina-mundo")); }
export type OficinaBalizas = ReturnType<typeof creaOficinaBalizas>;

// el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. Consume la oficina (OficinaMundo): ?oficina=0, ?red=0 o ?presencia=0
// se la llevan con ella.
export function manifiestoOficinaBalizas(dp: DepsOficinaBalizas): Manifiesto {
  return {
    id: ID_OFICINA_BALIZAS, version: 1,
    consume: ["OficinaMundo", "Estaticos", "Entidades", "Minimapa", "Aspecto", "Encuentro", "sitioJunto", "Llegada", "VRX", "paseando", "pp", "objetivo", "enQuad"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "balizasoficiales" },   // ?balizasoficiales=0 apaga solo las balizas; ?oficina=0, las dos (consume la oficina)
    // columna y bandera instanciadas (2 llamadas para las 20, y solo si hay alguna; 20 + 12 triángulos cada una, contados con three 0.186.1: 640 con las 20)
    presupuesto: { llamadas: 2, triangulos: 640 },
    fases: { tarde: 0.5 },
    mundos: ["exterior"],   // A3-8b: las balizas oficiales son de su escena, su suelo y su minimapa
    monta: function (n) { return creaOficinaBalizas(dp, n as T); },
    actualiza: { tarde: function (dt, _t, api: T) { api.tarde(dt); } },
    libera: function (api: T) { if (api) api.libera(); }
  };
}
