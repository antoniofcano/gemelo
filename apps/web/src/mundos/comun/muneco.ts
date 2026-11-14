// El muñeco de los demás, «Ir con alguien» y lo que cuesta dibujar a la gente (MU5-n, A3-6a: antes el trozo puro de apps/web/motor/26_presencia.js, que queda como
// talón): Muneco (la animación del muñeco lejano, calculada en el receptor), Encuentro (dónde dejarte junto a alguien o a una baliza), Cuenta (llamadas y triángulos
// del grupo «presencia», PB8) y creaSitioJunto (Encuentro con las copas y el suelo del mundo, que le da el legado). Movidos tal cual. Son de dibujo y de mundo
// (pies en el suelo de ESTE mundo, copas, troncos), no de red: viven en mundos/comun/, lo de todo mundo que dibuja (MUNDOS §1, «Cómo quedó (MU5-n, A3-6a)»).
// Sin three ni DOM. Lo prueban muneco.test.ts y pruebas/guardianes/presencia.test.js, muneco_aspecto.test.js y vr_gente.test.js.
import { Aspecto } from "../../red/sala.ts";

// [puro:inicio] — el muñeco, el encuentro y la cuenta: sin THREE ni DOM
// El muñeco de los demás (P5): el mismo del paseante local (12_paseo.js: cuerpo, cabeza, dos piernas y dos brazos) con su misma
// animación de paso, calculada en el RECEPTOR con la velocidad horizontal que sale de la interpolación (la pose no trae nada de
// esto: el contrato v1 no cambia). Los pies van al suelo de ESTE mundo (suelo local × exageración); de la pose solo se usan la
// posición horizontal, la orientación de la cabeza y, con gafas, la altura de la cabeza sobre el suelo (para agacharse).
export const Muneco: any = (function () {
  var ALTURA: any = 1.6, PASO: any = 3.4, VREF: any = 1.7, AMP: any = 0.75, BRAZO: any = 0.8, BOTE: any = 0.03;   // los de su paseo (12_paseo.js)
  var SUAVE_V: any = 8, GIRO: any = 6, V_ANDA: any = 0.25, V_MAX: any = 8, SALTO: any = 5, AGACHO_MAX: any = 0.9;
  var SENTADO_P: any = 1.15, SENTADO_B: any = 1.05, MANDO_B: any = 1.0;   // los de 16_vida.js (vidaPaseo): en quad, piernas 1,15 y brazos 1,05 rad; con el dron, brazos 1,0
  var SILLA_BAJA: any = 0.31, SILLA_B: any = 0.55;   // AV2: cuánto baja el cuerpo sentado en su silla (cadera a ≈ 0,55 m) y el ángulo de los brazos hacia las ruedas
  var V_MAX_QUAD: any = 14;   // en quad se va a 12 m/s: la velocidad suavizada no se recorta a la de andar
  function crea() { return { x: null, z: null, vel: 0, paso: 0, yaw: 0 }; }
  function ang(d?: any) { return Math.atan2(Math.sin(d), Math.cos(d)); }
  // st: estado del avatar; x, z: posición interpolada (ejes de three); yawCab: hacia dónde apunta su cabeza (giro en y; 0 = −z);
  // dt en s; sueloLocal: suelo(x, −z) de este mundo (sin exagerar); hCab: altura de su cabeza sobre el suelo según la pose;
  // conManos: trae manos (Quest) → los brazos no se animan; modo (P6): 0 a pie, 1 en quad (sentado: piernas y brazos adelante, sin paso, el cuerpo
  // 0,2 m detrás del centro del quad, como el paseante local en 16_vida.js), 2 con el dron (de pie, brazos al mando, sin paso).
  // Devuelve en `o` lo que se necesita para colocar las piezas (y el vehículo: o.vehiculo, o.yVeh, o.atras).
  // silla (AV2, decisión 131, criterio C7): a pie (modo 0) y con la silla de ruedas puesta, va SENTADO como en el quad (piernas 1,15 rad, sin paso) pero con los brazos a las ruedas, a la
  // misma velocidad y por los mismos caminos; el cuerpo baja SILLA_BAJA para que la cadera quede a ≈ 0,55 m y la cabeza a ≈ 1,3 m. o.vehiculo = 3 (la silla: se dibuja aparte).
  function avanza(st?: any, x?: any, z?: any, yawCab?: any, dt?: any, sueloLocal?: any, exag?: any, hCab?: any, conManos?: any, o?: any, modo?: any, silla?: any) {
    o = o || {}; modo = modo === 1 || modo === 2 ? modo : 0;
    if (st.x === null) { st.x = x; st.z = z; st.yaw = yawCab; }
    var dx: any = x - st.x, dz: any = z - st.z, d: any = Math.sqrt(dx * dx + dz * dz), v: any = dt > 0 && d < SALTO ? d / dt : 0;   // un salto (vuelve tras un hueco) no es andar
    var k: any = Math.min(1, dt * SUAVE_V);
    st.vel += (Math.min(v, modo === 1 ? V_MAX_QUAD : V_MAX) - st.vel) * k;
    // gira hacia donde anda; quieto, hacia donde apunta. Suave: como mucho GIRO rad/s… en proporción a lo que falta
    // en quad o con el dron el cuerpo va hacia donde apunta la cabeza (el emisor publica su rumbo; en quad, el del quad, que también da marcha atrás)
    var obj: any = !modo && st.vel > V_ANDA && d > 1e-6 ? Math.atan2(-dx, -dz) : yawCab;
    st.yaw = ang(st.yaw + ang(obj - st.yaw) * Math.min(1, dt * GIRO));
    st.x = x; st.z = z; o.vehiculo = modo; o.atras = 0;
    if (!modo && silla) {
      var ms: any = Math.min(1, st.vel / VREF);
      st.paso += st.vel * dt * PASO;   // solo para el vaivén de los brazos
      o.vehiculo = 3; o.yVeh = 0; o.yPies = sueloLocal * exag - SILLA_BAJA; o.yaw = st.yaw; o.vel = st.vel; o.mov = ms;
      o.piernaI = o.piernaD = SENTADO_P;
      o.brazoI = o.brazoD = conManos ? 0 : SILLA_B + Math.sin(st.paso) * 0.2 * ms;
      o.agacho = 0; o.yCab = o.yPies + ALTURA;
      return o;
    }
    if (modo) {   // sentado en el quad o quieto con el mando: sin paso ni bote
      var q: any = modo === 1;
      o.yVeh = sueloLocal * exag + 0.02; o.yPies = sueloLocal * exag - (q ? 0.02 : 0); o.atras = q ? 0.2 : 0;
      o.yaw = st.yaw; o.vel = st.vel; o.mov = 0;
      o.piernaI = o.piernaD = q ? SENTADO_P : 0;
      o.brazoI = o.brazoD = conManos ? 0 : q ? SENTADO_B : MANDO_B;
      o.agacho = 0; o.yCab = o.yPies + ALTURA;
      return o;
    }
    st.paso += st.vel * dt * PASO;
    var mov: any = Math.min(1, st.vel / VREF), sw: any = Math.sin(st.paso) * AMP * mov;
    o.yPies = sueloLocal * exag + Math.abs(Math.sin(st.paso)) * BOTE * mov;
    o.yaw = st.yaw; o.vel = st.vel; o.mov = mov;
    o.piernaI = sw; o.piernaD = -sw;
    o.brazoI = conManos ? 0 : -sw * BRAZO; o.brazoD = conManos ? 0 : sw * BRAZO;
    o.agacho = Math.max(0, Math.min(AGACHO_MAX, ALTURA - (isFinite(hCab) ? hCab : ALTURA)));
    o.yCab = o.yPies + ALTURA - o.agacho;
    return o;
  }
  // piezas del muñeco (las mismas medidas que el paseante de 12_paseo.js), con el pivote ARRIBA (hombro, cadera, cuello):
  // [ancho, largo, fondo, x, y del pivote, ¿pierna?, ¿brazo?]. y del pivote sin agacharse; agachado, baja el cuerpo y encogen las piernas
  var PIEZAS: any = [[0.46, 0.62, 0.25, 0, 1.48, 0, 0], [0.17, 0.86, 0.2, -0.12, 0.86, 1, 0], [0.17, 0.86, 0.2, 0.12, 0.86, 1, 0], [0.11, 0.58, 0.12, -0.3, 1.46, 0, 1], [0.11, 0.58, 0.12, 0.3, 1.46, 0, 1]];
  return { ALTURA: ALTURA, SILLA_BAJA: SILLA_BAJA, SILLA_B: SILLA_B, SENTADO_P: SENTADO_P, SENTADO_B: SENTADO_B, MANDO_B: MANDO_B, crea: crea, avanza: avanza, PIEZAS: PIEZAS };
})();
// «Ir con alguien» (I1): dónde dejarte cuando vas a donde está otra persona (Encuentro; el salto lo hace Llegada, 12b_llegada.js). A 2,5 m de ella (si no cabe, 3, 2, 3,5 o 4 m), por el lado desde el que
// llegas y, si ahí hay árbol, probando cada 30° alrededor; mirándola. Un sitio vale si no cae dentro de ninguna copa (radio medio de su perfil LiDAR)
// ni a menos de rTronco + 0,2 m de un tronco y está dentro de la finca (3 m de margen, como el paseo). Si ninguno está libre de copas, el primero libre
// de troncos; si ni eso, el primero empujado fuera de los troncos como hace el paseo (12_paseo.js). t, desde = {x este, y norte};
// obst = [{x, y, r}] (r = radio de la copa; 0 si no se sabe); ext = D.ext [oeste, norte, este, sur]; opc = {rTronco (0,55 a pie, 1,05 en quad), suelo(x, y), dentro(x, y)
// (un sitio solo vale si da true: las zonas de un interior, visita guiada compartida)}.
// Devuelve {x, y, ang (rumbo del paseo: 0 norte, π/2 este), z (suelo, si se da la función), libre: "copa" | "tronco" | "empujado", d}.
export const Encuentro: any = (function () {
  var DISTS: any = [2.5, 3, 2, 3.5, 4], BALIZA: any = [4.5, 4, 5, 3.5, 5.5], PASO: any = Math.PI / 6, MARGEN: any = 3, HOLGURA: any = 0.2;
  function dentro(x?: any, y?: any, ext?: any) { return !ext || (x >= ext[0] + MARGEN && x <= ext[2] - MARGEN && y >= ext[3] + MARGEN && y <= ext[1] - MARGEN); }
  function mide(x?: any, y?: any, obst?: any, rT?: any) {   // 2 = libre de copas y troncos, 1 = solo de troncos, 0 = toca un tronco
    var r: any = 2;
    for (var i: any = 0; i < obst.length; i++) {
      var o: any = obst[i], d: any = Math.hypot(x - o.x, y - o.y);
      if (d < rT + HOLGURA) return 0;
      if (d < (o.r || 0)) r = 1;
    }
    return r;
  }
  function punto(t?: any, desde?: any, obst?: any, ext?: any, opc?: any) {
    opc = opc || {}; obst = obst || [];
    var DS: any = opc.dists && opc.dists.length ? opc.dists : DISTS, rT: any = opc.rTronco > 0 ? opc.rTronco : 0.55, dx: any = desde ? desde.x - t.x : 0, dy: any = desde ? desde.y - t.y : -1;
    var base: any = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : -Math.PI / 2;   // ángulo matemático (desde el este, antihorario); sin dirección clara, por el sur
    var mejor: any = null, nivelMejor: any = -1, primero: any = null;
    for (var i: any = 0; i < DS.length && nivelMejor < 2; i++) {
      for (var k: any = 0; k < 12; k++) {
        var a: any = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * PASO, x: any = t.x + Math.cos(a) * DS[i], y: any = t.y + Math.sin(a) * DS[i];
        if (!dentro(x, y, ext) || (opc.dentro && !opc.dentro(x, y))) continue;
        if (!primero) primero = { x: x, y: y };
        var n: any = mide(x, y, obst, rT);
        if (n > nivelMejor) { nivelMejor = n; mejor = { x: x, y: y, d: DS[i] }; if (n === 2) break; }
      }
    }
    var libre: any = nivelMejor === 2 ? "copa" : "tronco";
    if (nivelMejor < 1) {   // todo cerca toca algún tronco: el primero, empujado fuera de cada tronco (como el paseo)
      mejor = primero || { x: t.x + Math.cos(base) * DS[0], y: t.y + Math.sin(base) * DS[0] }; libre = "empujado";
      for (var j: any = 0; j < obst.length; j++) {
        var o: any = obst[j], ex: any = mejor.x - o.x, ey: any = mejor.y - o.y, dd: any = Math.hypot(ex, ey), R: any = rT + HOLGURA;
        if (dd < R) { dd = dd || 0.001; mejor.x = o.x + ex / dd * R; mejor.y = o.y + ey / dd * R; }
      }
      if (ext) { mejor.x = Math.max(ext[0] + MARGEN, Math.min(ext[2] - MARGEN, mejor.x)); mejor.y = Math.max(ext[3] + MARGEN, Math.min(ext[1] - MARGEN, mejor.y)); }
      mejor.d = Math.hypot(mejor.x - t.x, mejor.y - t.y);
    }
    mejor.ang = Math.atan2(t.x - mejor.x, t.y - mejor.y); mejor.libre = libre;
    if (typeof opc.suelo === "function") mejor.z = opc.suelo(mejor.x, mejor.y);
    return mejor;
  }
  // I4: quién está en una parcela (las balizas como punto de encuentro): de los puntos que se dibujan (las entidades «persona» de Entidades.lista: ya sin vista aérea ni
  // bloqueados), los que caen dentro de su linde; dentro(x, y, [anillo]) es HazasPuro.dentroPoligono (13b_hazas.js). Alias en orden alfabético
  function enParcela(puntos?: any, linde?: any, dentro?: any) {
    var l: any = []; if (!puntos || !linde || typeof dentro !== "function") return l;
    for (var i: any = 0; i < puntos.length; i++) if (dentro(puntos[i].x, puntos[i].y, [linde])) l.push(puntos[i].alias);
    return l.sort(function (a?: any, b?: any) { return a < b ? -1 : a > b ? 1 : 0; });
  }
  return { DISTS: DISTS, BALIZA: BALIZA, punto: punto, enParcela: enParcela };
})();
// PB8: lo que cuesta dibujar al grupo «presencia», sin página. Las mallas son instanciadas (38_presencia_compartida.js, montaGrafica): cuerpo (5 cajas por plaza), cabeza y nombre
// dibujan SIEMPRE todas las plazas; sombrero y apoyo, manos y ruedas solo las instancias en uso, y una malla sin instancias no cuenta como llamada. Triángulos por instancia:
// caja 12, cabeza (icosaedro) 20, nombre (plano) 2, mano (caja) 12, rueda (cilindro de 10 lados) 40. El quad y el dron de los demás (hasta 2 llamadas más) no entran: sin nadie en
// vehículo, no se dibujan. Cuenta.instancias reparte las instancias a partir de lo que lleva cada persona (la misma regla que Aspecto.cajas); Cuenta.grupo, el coste del conjunto.
export const Cuenta: any = (function () {
  var TRI: any = { caja: 12, cabeza: 20, nombre: 2, mano: 12, rueda: 40 };
  // personas: [{ quest, sombrero, mov, oficial, ruedas? }] (una por plaza ocupada); plazas: las instanciadas (cuerpos); sin ellas, tantas como personas
  function instancias(personas?: any, plazas?: any) {
    var n: any = plazas == null ? personas.length : plazas, quest: any = 0, cajas: any = 0, ruedas: any = 0, i: any, p: any;
    for (i = 0; i < personas.length; i++) {
      p = personas[i]; if (p.quest) quest++;
      cajas += Aspecto.cajas(p.sombrero, p.mov, p.oficial); if (p.mov === "silla") ruedas += 2;
    }
    return { plazas: n, cuerpo: n * Muneco.PIEZAS.length, cabeza: n, nombres: n, cajas: cajas, manos: quest * 2, ruedas: ruedas };
  }
  // c: { plazas, cuerpo, cabeza, nombres, cajas, manos, ruedas } (el resultado de instancias o lo que informa __presencia()); devuelve { llamadas, triangulos }
  function grupo(c?: any) {
    var m: any = Muneco.PIEZAS.length, ll: any = 0;
    if (c.plazas > 0) ll += 3;   // cuerpo, cabeza, nombres
    if (c.cajas > 0) ll++; if (c.manos > 0) ll++; if (c.ruedas > 0) ll++;
    return { llamadas: ll, triangulos: c.plazas * (m * TRI.caja + TRI.cabeza + TRI.nombre) + c.cajas * TRI.caja + c.manos * TRI.mano + c.ruedas * TRI.rueda };
  }
  // el muñeco del paseante a pie sin accesorios (60 + 20 + 2 = 82) y con sombrero (94); con gafas, +24 de las manos: lo que dicen CLAUDE/MEDIDAS
  return { TRI: TRI, instancias: instancias, grupo: grupo };
})();
// [puro:fin]

/** Lo que el legado le da a sitioJunto: las copas del LiDAR (02_mundo; se piden en cada uso), el recuadro de la finca y el suelo (metros, sin exagerar). */
export interface DepsSitioJunto {
  readonly copas: { x: number; y: number; perfil: number[] }[];
  D: { ext: number[] };
  suelo(x: number, y: number): number;
}
/** sitioJunto(t, desde, dists?, rTronco?) de siempre (también la usan las balizas, 19_balizas.js), con las copas, el recuadro y el suelo por argumento. */
export function creaSitioJunto(d: DepsSitioJunto) {
// el sitio libre junto a t = {x este, y norte} (Encuentro.punto) con los árboles de alrededor (copas: radio medio del perfil LiDAR); dists, las distancias
// a probar (por defecto 2,5-4 m: ir con alguien; Encuentro.BALIZA, 4-5,5 m: ir a una baliza); desde, de dónde llegas
function sitioJunto(t?: any, desde?: any, dists?: any, rTronco?: any) {
  var obst: any = [], R2: any = 196;   // 14 m alrededor
  for (var i: any = 0; i < d.copas.length; i++) {
    var o: any = d.copas[i], dx: any = o.x - t.x, dy: any = o.y - t.y;
    if (dx * dx + dy * dy < R2) obst.push({ x: o.x, y: o.y, r: o.perfil.reduce(function (s?: any, v?: any) { return s + v; }, 0) / 8 });
  }
  return Encuentro.punto(t, desde, obst, d.D.ext, { dists: dists, rTronco: rTronco, suelo: d.suelo });
}
  return sitioJunto;
}
