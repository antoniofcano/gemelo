// El menú de muñeca en VR (EV2-A3), componente «muneca-vr» (MU5-n, A3-6a: antes apps/web/motor/31c_muneca.js, que queda como talón y no era un componente: se
// enganchaba a 29_vr al cargarse y no se soltaba nunca). Movido tal cual. Componente de TODO mundo (mundos: "todos", COMPONENTES §3.2): el menú va contigo en las
// gafas, estés en el exterior o en un interior. Dibuja (la lámina de 29_vr), así que vive en mundos/comun/ (MUNDOS §1). Su libera() suelta la lámina (como al salir
// de VR), quita sus enganches de PanelVR (alFotograma y alGatillo) y del Bus («vr:sale», «voz:estado») y los ganchos de las pruebas (window.__vrMuneca y
// __vrMunecaPulsa). No tiene materiales propios ni sombreador: la lámina es creaLamina de 29_vr (MeshBasicMaterial; vale con multiview).
// ?xrmuneca=0|1 y Configuración → Comodidad VR (vr.muneca) lo siguen apagando y encendiendo en vivo, como antes; ?muneca=0 (la bandera del componente, nueva) lo quita entero.

/** Lo que el legado le da (el talón de 31c_muneca.js): todo lo de 29_vr, 12_paseo, 12b, 13b, 15_tiempo, 02e y 31b, por getters (lo migran A3-4 y A3-6c). */
export interface DepsMuneca {
  THREE: any; location: { search: string }; window: any; renderer: any; ComponentesPuro: any;
  readonly VRX: any; readonly vrRig: any; readonly PanelVR: any; readonly HudPersonalPuro: any; readonly Hazas: any; readonly Usables: any; readonly Llegada: any; readonly pp: any;
  readonly vrMano: any; readonly vrRayoDe: any; readonly creaLamina: any; readonly vrBajoRayo: any; readonly vrRect: any; readonly vrAj: any; readonly vrPintaFicha: any; readonly vrPulso: any;
  readonly horaMundoTexto: any;
}
/** Lo que usa del contexto del componente: el Bus por él (lo que engancha se suelta solo al liberar). */
export interface ContextoMuneca { on(ev: string, fn: (d?: any) => void): () => void; emite(ev: string, d?: unknown): number }
export const ID_MUNECA = "muneca-vr";

// ---------- EV2-A3: el menú de muñeca en VR (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 4; tanda 9, 2026-11-05). Al girar la muñeca hacia la cara
// (como quien mira un reloj: el dorso o la palma hacia los ojos, y mirándola) aparece pegado a ella una lámina pequeña con lo tuyo: «hora · tu haza ·
// hablar · volver», los mismos cuatro de la capa personal de pantalla (EV2-A4, 31b_hud_personal.js), con sus textos (HudPersonalPuro). Se pulsa con el
// rayo y el gatillo del OTRO mando o tocándola con la punta del otro mando («dedo»). Desaparece al bajar la muñeca o dejar de mirarla. No sustituye al
// panel grande (Y): lo complementa, también con ?ui=capas (EV2-A2: el panel nace y se queda en el mundo; la muñeca va contigo).
// Qué muñeca: la contraria a la mano que apunta, según Configuración → Controles → Mano (controles.mano): diestra = la izquierda, zurda = la derecha.
// Con mando, la lámina sigue al grip; con manos (seguimiento de manos), a la articulación «wrist», y el eje de la palma sale de la muñeca y los nudillos.
// Encendido por defecto [SUPUESTO]: ?xrmuneca=0|1 manda; si no, Configuración → Comodidad VR (vr.muneca); si no, sí.
// Regla 12: no hay acciones propias. Hora = la previsión del tiempo de 35_fichas_tiempo («prevision:alterna», la lámina del tiempo; la misma que el botón
// de la ventana Tiempo) · tu haza = la ficha de la haza donde estás (Hazas.enPunto y Usables.elige, como la tecla H y 31b) · hablar = «habla:alterna»
// (47_habla.js; solo dentro de una visita guiada y con permiso, como en 31b) · volver = de vuelta donde empezó la sesión VR (Llegada.ve, con fundido)
// [SUPUESTO: en pantalla «volver» es la vista aérea, que en VR no existe]. La lámina es creaLamina de 29_vr (canvas como textura de un plano,
// MeshBasicMaterial: vale con multiview), el rayo vrRayoDe/vrBajoRayo y el pintado vrRect. Se engancha con PanelVR.alFotograma y PanelVR.alGatillo
// (los puntos de extensión de 29_vr), así 29_vr no nombra este módulo. Va después de 31b porque consume HudPersonalPuro.
// Presupuesto (regla 6): UNA malla (2 triángulos, 1 llamada solo mientras se ve) y una textura de 512 × 384 sin mipmaps (768 KB), creadas la primera vez
// que aparece en la sesión, reutilizadas y liberadas al salir de VR («vr:sale»). El lienzo solo se repinta si cambia lo que se ve (firma, mirada 4 veces
// por segundo, o el resaltado). No entra en los escalones de 02g_vr_presupuesto (no hay nada que recortar por distancia). Nada de esto probado en unas Quest.
// [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/vr_muneca.test.js)
export const MunecaPuro: any = (function () {
  // Umbrales de partida [SUPUESTO], sin probar en un casco. cara: coseno entre el eje de la palma y la línea muñeca → ojos (0,70 ≈ 46°); mirada: coseno
  // entre hacia dónde mira la cabeza y la línea ojos → muñeca (0,85 ≈ 32°). d: metros de la muñeca a los ojos. Para aparecer tiene que cumplirse «entra»
  // durante tEntra s seguidos; para irse, dejar de cumplirse «sigue» (más holgado: histéresis) durante tSale s. lado: "ambos" (dorso o palma), "dorso"
  // o "palma". En el grip de WebXR el dorso de la mano izquierda mira a −X y el de la derecha a +X (especificación WebXR, gripSpace).
  var U: any = { entraCara: 0.70, sigueCara: 0.45, entraMirada: 0.85, sigueMirada: 0.65, dMin: 0.12, dMax: 0.70, dSigue: 0.85, tEntra: 0.25, tSale: 0.35, lado: "ambos" };
  // La lámina: 0,16 × 0,12 m, 512 × 384 px (0,31 mm/px). dist: a cuánto se mira una muñeca [SUPUESTO]. alto/acerca: la lámina, por encima de la muñeca y
  // un poco hacia los ojos (m). Cuatro botones en rejilla de 2 × 2 con huecos de 16 px (5 mm: 14 mm equivalentes a 1 m vistos a 0,35 m).
  var MEDIDAS: any = { W: 512, H: 384, pw: 0.16, ph: 0.12, dist: 0.35, alto: 0.07, acerca: 0.03, cab: 64, margen: 16, hueco: 16, cols: 2, filas: 2, lineas: { titulo: 36, boton: 34 } };
  var DEDO: any = { arma: 0.03, toca: 0.008, atras: -0.04 };   // el «dedo»: se arma a más de 3 cm delante de la lámina y pulsa al llegar a 8 mm (o hasta 4 cm detrás)
  var t1: any = { x: 0, y: 0, z: 0 }, t2: any = { x: 0, y: 0, z: 0 };
  // v' = q · v · q⁻¹ (la misma cuenta que Vector3.applyQuaternion de three)
  function rota(q?: any, x?: any, y?: any, z?: any, out?: any) {
    var qx: any = q.x, qy: any = q.y, qz: any = q.z, qw: any = q.w;
    var ix: any = qw * x + qy * z - qz * y, iy: any = qw * y + qz * x - qx * z, iz: any = qw * z + qx * y - qy * x, iw: any = -qx * x - qy * y - qz * z;
    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy; out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz; out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
  }
  // el eje del dorso con mando: el ±X del grip (q) según la mano. out = { x, y, z } de largo 1
  function ejeGrip(q?: any, mano?: any, out?: any) { return rota(q, mano === "right" ? 1 : -1, 0, 0, out || {}); }
  // con manos: la normal del plano muñeca–nudillo del índice–nudillo del meñique (w, i, p = posiciones de las articulaciones wrist, index-finger-metacarpal
  // y pinky-finger-metacarpal). Su sentido (dorso o palma) no está comprobado en un casco [SUPUESTO]: con lado "ambos" no importa
  function ejeMano(w?: any, i?: any, p?: any, mano?: any, out?: any) {
    out = out || {};
    var ax: any = i.x - w.x, ay: any = i.y - w.y, az: any = i.z - w.z, bx: any = p.x - w.x, by: any = p.y - w.y, bz: any = p.z - w.z, s: any = mano === "right" ? -1 : 1;
    var nx: any = ay * bz - az * by, ny: any = az * bx - ax * bz, nz: any = ax * by - ay * bx, l: any = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
    out.x = s * nx / l; out.y = s * ny / l; out.z = s * nz / l; return out;
  }
  // w = posición de la muñeca, eje = hacia dónde mira su dorso (largo 1), c = { p, q } la cabeza; todo en el MISMO espacio (el del rig).
  // → out { d, dorso, palma, cara, mirada }
  function mide(w?: any, eje?: any, c?: any, out?: any, u?: any) {
    u = u || U; out = out || {};
    var dx: any = c.p.x - w.x, dy: any = c.p.y - w.y, dz: any = c.p.z - w.z, d: any = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    dx /= d; dy /= d; dz /= d;
    var sx: any = eje.x * dx + eje.y * dy + eje.z * dz, F: any = rota(c.q, 0, 0, -1, t2);
    out.d = d; out.dorso = sx; out.palma = -sx;
    out.cara = u.lado === "dorso" ? sx : u.lado === "palma" ? -sx : Math.abs(sx);
    out.mirada = -(F.x * dx + F.y * dy + F.z * dz);
    return out;
  }
  // la histéresis con retardo. st = { visible, t } (se modifica); m = mide(…) o null (sin pose: cuenta como «no»). → "aparece" | "desaparece" | ""
  function decide(st?: any, m?: any, dt?: any, u?: any) {
    u = u || U;
    var entra: any = !!m && m.d >= u.dMin && m.d <= u.dMax && m.cara >= u.entraCara && m.mirada >= u.entraMirada;
    var sigue: any = !!m && m.d >= u.dMin && m.d <= u.dSigue && m.cara >= u.sigueCara && m.mirada >= u.sigueMirada;
    if (!st.visible) {
      st.t = entra ? st.t + dt : 0;
      if (st.t >= u.tEntra) { st.visible = true; st.t = 0; return "aparece"; }
      return "";
    }
    st.t = sigue ? 0 : st.t + dt;
    if (st.t >= u.tSale) { st.visible = false; st.t = 0; return "desaparece"; }
    return "";
  }
  // dónde va la lámina (en el espacio del rig) y cómo gira para mirar a los ojos: Euler «YXZ» = (pitch, yaw, 0); su cara (+Z) apunta a la cabeza
  function coloca(w?: any, c?: any, out?: any, medida?: any) {
    medida = medida || MEDIDAS; out = out || {};
    var dx: any = c.p.x - w.x, dy: any = c.p.y - w.y, dz: any = c.p.z - w.z, d: any = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    out.x = w.x + dx / d * medida.acerca; out.y = w.y + medida.alto + dy / d * medida.acerca; out.z = w.z + dz / d * medida.acerca;
    var hx: any = c.p.x - out.x, hy: any = c.p.y - out.y, hz: any = c.p.z - out.z;
    out.yaw = Math.atan2(hx, hz); out.pitch = -Math.atan2(hy, Math.hypot(hx, hz));
    return out;
  }
  // qué muñeca lleva el menú: la contraria a la mano que apunta (controles.mano: "diestra" → la izquierda; "zurda" → la derecha)
  function manoMenu(ajuste?: any) { return ajuste === "zurda" ? "right" : "left"; }
  // los accesos, con los textos de la capa personal de pantalla. hp = HudPersonalPuro (31b); e = { hora (texto), hazas (¿hay?), haza ({ id, es_mia } o
  // null), voz (el último «voz:estado» o null) } → [{ id, txt, nombre, on }] en el orden de la pantalla: hora · tu haza · hablar · volver
  function accesos(hp?: any, e?: any) {
    var l: any = [], h: any = hp.hora(e.hora), z: any = hp.haza(e.haza || null, !!e.hazas), b: any = hp.hablar(e.voz || null), v: any = hp.volver("vr");
    l.push({ id: "hora", txt: h.texto, nombre: h.nombre, on: false });
    if (z.visible) l.push({ id: "haza", txt: z.texto, nombre: z.nombre, on: !!(e.haza && e.haza.es_mia) });
    if (b.visible) l.push({ id: "hablar", txt: b.texto, nombre: b.nombre, on: b.pulsado });
    l.push({ id: "volver", txt: v.texto, nombre: "Volver adonde empezaste en las gafas", on: false });
    return l;
  }
  // los botones en la rejilla (px del lienzo), por filas de izquierda a derecha
  function rejilla(l?: any, medida?: any) {
    medida = medida || MEDIDAS;
    var w: any = Math.floor((medida.W - 2 * medida.margen - (medida.cols - 1) * medida.hueco) / medida.cols), h: any = Math.floor((medida.H - medida.cab - medida.margen - (medida.filas - 1) * medida.hueco) / medida.filas);
    return l.slice(0, medida.cols * medida.filas).map(function (a?: any, k?: any) { var c: any = k % medida.cols, f: any = Math.floor(k / medida.cols); return { id: a.id, txt: a.txt, on: a.on, x: medida.margen + c * (w + medida.hueco), y: medida.cab + f * (h + medida.hueco), w: w, h: h }; });
  }
  // el toque con la punta del otro mando: z = metros delante de la cara de la lámina (positivo, del lado de los ojos); dentro = ¿cae sobre la lámina?
  // st = { armado } (se modifica). → true el fotograma en que pulsa (una vez por acercamiento)
  function dedo(st?: any, z?: any, dentro?: any) {
    if (z > DEDO.arma) { st.armado = true; return false; }
    if (!dentro) return false;
    if (st.armado && z <= DEDO.toca && z >= DEDO.atras) { st.armado = false; return true; }
    return false;
  }
  function bajo(B?: any, x?: any, y?: any) { for (var k: any = 0; k < B.length; k++) if (x >= B[k].x && x <= B[k].x + B[k].w && y >= B[k].y && y <= B[k].y + B[k].h) return B[k]; return null; }
  // lo que se ve: si cambia, se repinta (y solo entonces)
  function firma(l?: any, hover?: any) { return hover + "|" + l.map(function (a?: any) { return a.id + (a.on ? "1" : "0") + a.txt; }).join(";"); }
  // ?xrmuneca manda (true/false; undefined si no está); si no, el ajuste vr.muneca; si no, encendido
  function encendido(url?: any, ajuste?: any) {
    if (url === true || url === false) return url;
    return !(ajuste === false || ajuste === "false" || ajuste === 0 || ajuste === "no");
  }
  return { U: U, MEDIDAS: MEDIDAS, DEDO: DEDO, rota: rota, ejeGrip: ejeGrip, ejeMano: ejeMano, mide: mide, decide: decide, coloca: coloca, manoMenu: manoMenu,
    accesos: accesos, rejilla: rejilla, dedo: dedo, bajo: bajo, firma: firma, encendido: encendido };
})();
// [puro:fin]
/** Monta el menú (sin crear nada hasta que aparece la primera vez en una sesión de VR) y devuelve { pulsa, libera, liberaLamina }. */
export function creaMuneca(dp: DepsMuneca, n: ContextoMuneca) {
  // del legado, por argumento (A3-6a): lo de 29_vr, 12_paseo, 12b, 13b, 15_tiempo, 02e y 31b se pide a dp en cada uso (getters del talón: A3-4 y A3-6c los migran)
  const THREE = dp.THREE, location = dp.location, window = dp.window, renderer = dp.renderer, ComponentesPuro = dp.ComponentesPuro;
  const quita: (() => void)[] = [];   // A3-6a: los enganches (PanelVR y el Bus), para soltarlos en libera()
  var M: any = MunecaPuro.MEDIDAS, lam: any = null, st: any = { visible: false, t: 0 }, dd: any = { armado: false }, B: any = [], items: any = [], hover: any = "", firmaVista: any = "", tFirma: any = 0;
  var inicio: any = null, sesion: any = -1, pinturas: any = 0, voz: any = null, lado: any = "left", fuente: any = "";
  var w: any = { x: 0, y: 0, z: 0 }, eje: any = { x: 1, y: 0, z: 0 }, c: any = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, medida: any = {}, pos: any = {};
  var m4: any = new THREE.Matrix4(), v: any = new THREE.Vector3(), qc: any = new THREE.Quaternion();
  var URL_ON: any = ComponentesPuro.valorUrl(typeof location !== "undefined" ? location.search : "", "xrmuneca");
  function activo() { return MunecaPuro.encendido(URL_ON, dp.vrAj("vr.muneca", true)); }
  function crea() { if (lam) return; lam = dp.creaLamina(M.W, M.H, M.pw, M.ph); lam.nombre = "muneca"; dp.vrRig.add(lam.m); }   // reserva-ok: la primera vez de cada sesión
  function libera() {
    st.visible = false; st.t = 0; dd.armado = false; hover = ""; firmaVista = ""; B = []; items = []; sesion = -1;
    if (!lam) return;
    dp.vrRig.remove(lam.m); lam.m.geometry.dispose(); lam.m.material.dispose(); lam.tex.dispose(); lam.cv.width = lam.cv.height = 0; lam = null;
  }
  function cabeza() {   // la pose de la cabeza en el espacio del rig, la del XRFrame de este fotograma (camera.position ya lleva la del mundo: actualizaPaseo)
    var vp: any = null; try { vp = dp.VRX.frame && dp.VRX.base ? dp.VRX.frame.getViewerPose(dp.VRX.base) : null; } catch (e: any) { vp = null; }
    var t: any = vp && vp.transform; if (!t) return false;
    if (t.position && t.orientation) { c.p.x = t.position.x; c.p.y = t.position.y; c.p.z = t.position.z; c.q.x = t.orientation.x; c.q.y = t.orientation.y; c.q.z = t.orientation.z; c.q.w = t.orientation.w; return true; }
    if (!t.matrix) return false;   // solo la matriz (como en el WebXR de mentira de las pruebas): de ella, la posición y el giro
    m4.fromArray(t.matrix); c.p.x = t.matrix[12]; c.p.y = t.matrix[13]; c.p.z = t.matrix[14]; qc.setFromRotationMatrix(m4); c.q.x = qc.x; c.q.y = qc.y; c.q.z = qc.z; c.q.w = qc.w;
    return true;
  }
  // la muñeca que lleva el menú, en el espacio del rig: con manos, la articulación wrist (y el eje de la palma, de los nudillos); con mando, el grip
  function muneca(o?: any) {
    fuente = "";
    if (!o || !o.src || o.mano !== lado) return false;
    if (o.src.hand) {
      var J: any = renderer.xr.getHand(o.i).joints, a: any = J && J["wrist"], i: any = J && J["index-finger-metacarpal"], p: any = J && J["pinky-finger-metacarpal"];
      if (!a || !i || !p || !a.visible) return false;
      w.x = a.position.x; w.y = a.position.y; w.z = a.position.z; MunecaPuro.ejeMano(a.position, i.position, p.position, lado, eje); fuente = "mano"; return true;
    }
    if (!o.g.visible) return false;
    w.x = o.g.position.x; w.y = o.g.position.y; w.z = o.g.position.z; MunecaPuro.ejeGrip(o.g.quaternion, lado, eje); fuente = "grip"; return true;
  }
  function hazaAqui() { try { return dp.Hazas.enPunto(dp.pp.x, dp.pp.y); } catch (e: any) { return null; } }   // en VR, pp es la cabeza (vrActualiza)
  function hayHazas() { try { return !!dp.Hazas.estado().activo; } catch (e: any) { return false; } }
  function pulsa(b?: any) {
    if (!b) return;
    if (b.id === "hora") n.emite("prevision:alterna");   // la lámina de la previsión (35_fichas_tiempo); sin ese componente, nadie la atiende
    else if (b.id === "haza") { var q: any = hazaAqui(); if (q) dp.Usables.elige("haza:" + q.id, "tecla"); else dp.vrPintaFicha("Hazas", ["No estás dentro de ninguna haza."]); }   // lo mismo que H y 31b
    else if (b.id === "hablar") n.emite("habla:alterna", {});
    else if (b.id === "volver") { if (inicio) dp.Llegada.ve(inicio.x, inicio.y); }
    tFirma = 1;   // a mirar ya lo que cambió
  }
  function pinta() {
    var cx: any = lam.cx, W: any = M.W, H: any = M.H;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; dp.vrRect(cx, 0, 0, W, H, 22); cx.fill();
    cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#e9eef2"; cx.font = "bold 28px system-ui, sans-serif"; cx.fillText("Lo tuyo", 18, 34);
    cx.textAlign = "right"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.fillText("gatillo o toca", W - 18, 34);
    cx.font = "bold 30px system-ui, sans-serif"; cx.textAlign = "center";
    B.forEach(function (q?: any) {
      cx.fillStyle = hover === q.id ? "#4a5866" : q.on ? "#2e7d3a" : "#2a3139"; dp.vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill();
      var t: any = q.txt; while (cx.measureText(t).width > q.w - 20 && t.length > 4) t = t.slice(0, -2); if (t !== q.txt) t += "…";
      cx.fillStyle = "#ffffff"; cx.fillText(t, q.x + q.w / 2, q.y + q.h / 2 + 1);
    });
    cx.textAlign = "left"; lam.tex.needsUpdate = true; pinturas++;
  }
  function fotograma(dt?: any) {
    if (!dp.VRX.on) return;
    if (sesion !== dp.VRX.sesionesN) { sesion = dp.VRX.sesionesN; inicio = { x: dp.VRX.cab.x, y: -dp.VRX.cab.z }; st.visible = false; st.t = 0; }   // reserva-ok: una vez por sesión (dónde empezó)
    if (!activo()) { st.visible = false; st.t = 0; if (lam) lam.m.visible = false; return; }
    var nl: any = MunecaPuro.manoMenu(dp.vrAj("controles.mano", "diestra")); if (nl !== lado) { lado = nl; st.visible = false; st.t = 0; }
    var L: any = dp.vrMano(lado), m: any = cabeza() && muneca(L) ? MunecaPuro.mide(w, eje, c, medida) : null;
    if (MunecaPuro.decide(st, m, dt) === "aparece") { crea(); firmaVista = ""; tFirma = 1; dd.armado = false; dp.vrPulso(L, 0.12, 12); }
    if (!st.visible || !lam) { if (lam) lam.m.visible = false; return; }
    if (m) { MunecaPuro.coloca(w, c, pos); lam.m.position.set(pos.x, pos.y, pos.z); lam.m.rotation.set(pos.pitch, pos.yaw, 0, "YXZ"); }
    lam.m.visible = true; lam.m.updateWorldMatrix(true, false);
    tFirma += dt;
    if (tFirma >= 0.25) { tFirma = 0; var hy: any = hayHazas(); items = MunecaPuro.accesos(dp.HudPersonalPuro, { hora: dp.horaMundoTexto(), hazas: hy, haza: hy ? hazaAqui() : null, voz: voz }); B = MunecaPuro.rejilla(items); }   // reserva-ok: 4 veces por segundo, solo a la vista
    var R: any = dp.vrMano(lado === "left" ? "right" : "left"), hv: any = "";
    if (R.src && R.mano && R.mano !== lado) {
      var q: any = dp.vrBajoRayo(lam, B, dp.vrRayoDe(R)); hv = q ? q.id : "";
      lam.m.updateMatrix(); m4.copy(lam.m.matrix).invert(); v.copy(R.c.position).applyMatrix4(m4);   // la punta del otro mando, en la lámina (los dos cuelgan del rig)
      var dentro: any = Math.abs(v.x) <= M.pw / 2 && Math.abs(v.y) <= M.ph / 2;
      var bd: any = dentro ? MunecaPuro.bajo(B, (v.x / M.pw + 0.5) * M.W, (0.5 - v.y / M.ph) * M.H) : null;
      if (bd && v.z < MunecaPuro.DEDO.arma) hv = bd.id;
      if (MunecaPuro.dedo(dd, v.z, dentro) && bd) { dp.vrPulso(R, 0.4, 25); pulsa(bd); }
    }
    if (hv !== hover) hover = hv;
    var f: any = MunecaPuro.firma(items, hover);   // reserva-ok: solo con el menú a la vista
    if (f !== firmaVista) { firmaVista = f; pinta(); }
  }
  function gatillo(o?: any, rr?: any) {   // el gatillo del otro mando; true = es del menú (también si cae entre botones: no pulsa lo de detrás)
    if (!lam || !lam.m.visible || o.mano === lado) return false;
    lam.m.updateWorldMatrix(true, false);
    var q: any = dp.vrBajoRayo(lam, B, rr); if (q === null) return false;
    if (q) pulsa(q);
    return true;
  }
  quita.push(dp.PanelVR.alFotograma(fotograma), dp.PanelVR.alGatillo(gatillo));
  quita.push(n.on("vr:sale", libera));   // al salir de VR se suelta la lámina (se vuelve a crear la primera vez que aparezca en la sesión siguiente)
  quita.push(n.on("voz:estado", function (e?: any) { voz = e || null; tFirma = 1; }));
  window.__vrMuneca = function () {   // pruebas (vr_mock) y ?debug
    return { activo: activo(), visible: !!(lam && lam.m.visible), creada: !!lam, mano: lado, fuente: fuente, hover: hover, pinturas: pinturas, inicio: inicio,
      botones: B.map(function (b?: any) { return { id: b.id, txt: b.txt, x: b.x, y: b.y, w: b.w, h: b.h }; }), pos: lam ? lam.m.position.toArray() : null };
  };
  window.__vrMunecaPulsa = function (id?: any) { for (var k: any = 0; k < B.length; k++) if (B[k].id === id) { pulsa(B[k]); return true; } return false; };
  // A3-6a: el libera() del componente: la lámina (malla, geometría, material, textura y lienzo), los enganches de PanelVR y del Bus y los ganchos de las pruebas
  function liberaTodo() {
    libera();
    quita.splice(0).forEach(function (q) { try { if (typeof q === "function") q(); } catch (e: any) {} });
    delete window.__vrMuneca; delete window.__vrMunecaPulsa;
  }
  return { pulsa: pulsa, libera: liberaTodo, liberaLamina: libera };
}

/** El manifiesto (ADR-0023). Siempre montado (como antes, que se enganchaba al cargar): no crea nada hasta que la muñeca aparece en una sesión de VR. */
export function manifiestoMuneca(dp: DepsMuneca) {
  return {
    id: ID_MUNECA, version: 1,
    consume: ["ComponentesPuro", "Usables", "renderer", "pp", "Llegada", "Hazas", "horaMundoTexto", "VRX", "vrRig", "vrMano", "vrRayoDe", "creaLamina", "vrBajoRayo", "vrRect", "vrAj",
      "PanelVR", "vrPintaFicha", "vrPulso", "HudPersonalPuro"],
    expone: [] as string[],
    eventos: { escucha: ["vr:sale", "voz:estado"], emite: ["prevision:alterna", "habla:alterna"] },
    // ?muneca=0 quita el componente entero (para medir con y sin, como los demás); ?xrmuneca y vr.muneca siguen decidiendo en vivo si aparece (MunecaPuro.encendido),
    // como antes: con ?xrmuneca=0 el componente está montado y window.__vrMuneca contesta (activo: false)
    bandera: { defecto: true, url: "muneca" },
    // UNA malla (2 triángulos, 1 llamada solo mientras se ve) y una textura de 512 × 384 sin mipmaps (768 KB), creadas la primera vez que aparece en la sesión
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 1 },
    fases: {},
    mundos: "todos" as const,   // A3-6a: de todo mundo (COMPONENTES §3.2)
    monta: function (n: ContextoMuneca) { return creaMuneca(dp, n); },
    actualiza: {},
    libera: function (api: any) { if (api) api.libera(); }
  };
}
