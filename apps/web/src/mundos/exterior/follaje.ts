// El follaje de los olivos del modo Gemelo (MU5-n, A3-2b; antes apps/web/motor/07_follaje.js, que queda como talón): las hojas (un montoncito plateado por punto LiDAR de copa,
// sprites con textura propia), el relleno de la copa, la corteza y las aceitunas de cada celda de nivel 0 (follajeG, a rebanadas por la Cola) y las manchas de sombra bajo
// cada copa (construyeSombras: UNA malla instanciada para toda la finca). Aquí viven la textura de las hojas, la de la sombra y los cuatro materiales (matHojaG, matHojaP,
// matCorteza, matSombra); libera() suelta la malla de sombras, la geometría, los materiales y las dos texturas, y olvida la fuente de VrPresupuesto.
// Los arreglos de la auditoría de noviembre de 2026 (L2-01, L5-02, L1-08): construyeSombras() ya no vacía gSombras con children.pop() sin dispose, que perdía un búfer
// de instancias por llamada (unos 380 KB en Hituelo) y SACABA TAMBIÉN la malla de sombras del paisaje y de los edificios (instSombraPA, de 18_paisaje, que se crea una sola
// vez y no vuelve a colgarse). Ahora solo toca SU malla: la rehace únicamente si cambió el número de olivos (si no, reescribe las matrices de la que ya tiene: ni malla
// nueva ni búfer nuevo) y, si la rehace, la quita y la libera antes (remove + dispose).
// Medido / deducido / ilustrativo (regla 5): las hojas colocan el LiDAR medido, con color de la ortofoto; los frutos y las sombras bajo las copas son ilustrativos.
// Del legado recibe por argumento lo que necesita (THREE, el mundo, el Estado y la fábrica de materiales); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo; el motor son números y arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsFollaje {
  THREE: T3;
  /** un lienzo cuadrado de lado `lado` px (document.createElement("canvas") en el navegador) */
  lienzo(lado: number): T3;
  /** 03_escena: marca una textura como color (sRGB) */
  texColor(t: T3): T3;
  Materiales: Materiales;
  Estaticos: { congela(o: unknown): void };
  /** el grupo de las sombras (06_arboles) */
  gSombras: { add(o: unknown): void; remove(o: unknown): void; children: unknown[] };
  Estado: { exag: number; calidad: number };
  ESC_R8: number;
  suelo(x: number, y: number): number;
  copaAlta(x: number, y: number): number;
  aviva(c3: number[], x: number, y: number): void;
  colorEn(x: number, y: number, h: number, c3: number[]): void;
  hash(n: number): number;
  copas: T3[];
  radioEn(perfil: number[], ang: number): number;
  /** 23_estacion: las aceitunas y flores de una celda (se carga después: por función) */
  construyeFrutosLista(grupo: unknown): void;
  /** 18_paisaje: coloca las sombras según el sol, y lee la malla de los olivos (instSombra, que escribe este módulo) */
  sombrasSol(forzar: boolean): void;
  ponInstSombra(inst: unknown): void;
  /** 02g: el presupuesto de VR (las manchas de sombra desde el escalón 2); null si no está */
  VrPresupuesto?: { fuente(nombre: string, fn: (v: unknown) => void): void; olvida(nombre: string): void } | null;
}

export const ID_FOLLAJE = "follaje";

export function creaFollaje(d: DepsFollaje) {
  const THREE = d.THREE, texColor = d.texColor, Materiales = d.Materiales, Estaticos = d.Estaticos, gSombras = d.gSombras, Estado = d.Estado, ESC_R8 = d.ESC_R8;
  const suelo = d.suelo, copaAlta = d.copaAlta, aviva = d.aviva, colorEn = d.colorEn, hash = d.hash, copas = d.copas, radioEn = d.radioEn, construyeFrutosLista = d.construyeFrutosLista;
  const sombrasSol = d.sombrasSol, VrPresupuesto = d.VrPresupuesto || null, lienzo = d.lienzo;
  const materiales = Materiales.de(ID_FOLLAJE);   // MU5-n: los cuatro materiales (estándar: sin sombreador propio) se piden con dueño «follaje» y se liberan con su libera()
  // follaje: cada punto LiDAR de copa es un montoncito de hojas plateadas (sprites con textura propia)
  function texturaHojas() {
    var cv = lienzo(128); var x = cv.getContext("2d"), seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    x.translate(64, 64); x.lineCap = "round";
    for (var r = 0; r < 7; r++) {            // ramillas claras que cruzan el sprite
      var ang = rnd() * 6.283, l = 26 + rnd() * 30; x.strokeStyle = "rgba(205,195,160,0.95)"; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4); x.lineTo(Math.cos(ang) * l, Math.sin(ang) * l); x.stroke();
      for (var h = 0; h < 5; h++) {         // hojas a pares a lo largo de la ramilla
        var d = 6 + h * (l / 6), bx = Math.cos(ang) * d, by = Math.sin(ang) * d;
        for (var lado = -1; lado <= 1; lado += 2) {
          var rot = ang + lado * (0.55 + rnd() * 0.5), len = 17 + rnd() * 13, wd = 2.4 + rnd() * 1.8, pale = rnd() < 0.42, t = pale ? 215 + rnd() * 35 : 95 + rnd() * 45;
          x.save(); x.translate(bx, by); x.rotate(rot);
          x.fillStyle = "rgb(" + Math.round(t * (pale ? 0.97 : 0.8)) + "," + Math.round(t) + "," + Math.round(t * (pale ? 0.9 : 0.72)) + ")";
          x.beginPath(); x.ellipse(len / 2, 0, len / 2, wd, 0, 0, 6.283); x.fill();
          x.strokeStyle = pale ? "rgba(120,125,100,0.5)" : "rgba(40,50,30,0.6)"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(1, 0); x.lineTo(len - 2, 0); x.stroke(); x.restore();
        }
      }
    }
    var tex = texColor(new THREE.CanvasTexture(cv)); tex.generateMipmaps = true; return tex;
  }
  var texHojas = texturaHojas();
  var matHojaG: T3 = Materiales.recorte(materiales.estandar("PointsMaterial", { size: 3.1, map: texHojas, alphaTest: 0.4, vertexColors: true, sizeAttenuation: true, transparent: false }));   // AG-2.1: alphaToCoverage con MSAA (?a2c=0 lo quita)
  var matHojaP: T3 = Materiales.recorte(materiales.estandar("PointsMaterial", { size: 1.7, map: texHojas, alphaTest: 0.4, vertexColors: true, sizeAttenuation: true, transparent: false }));
  var matCorteza: T3 = materiales.estandar("PointsMaterial", { size: 0.5, vertexColors: true, sizeAttenuation: true });
  function texturaSombra() {
    var cv = lienzo(64); var x = cv.getContext("2d"), g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(20,18,10,0.55)"); g.addColorStop(0.65, "rgba(20,18,10,0.32)"); g.addColorStop(1, "rgba(20,18,10,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return texColor(new THREE.CanvasTexture(cv));
  }
  var matSombra: T3 = materiales.estandar("MeshBasicMaterial", { map: texturaSombra(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var geoSombra = new THREE.PlaneGeometry(1, 1); geoSombra.rotateX(-Math.PI / 2);
  // Q0c-a: en VR, desde el escalón 2 las manchas de sombra (ilustrativas) no se dibujan (02g_vr_presupuesto); sombrasSol sigue poniendo su opacidad
  if (VrPresupuesto) VrPresupuesto.fuente("sombras", function (v: any) { matSombra.visible = v !== false; });
  function* follajeG(arr: any, P: any, grupo: any) {   // hojas, relleno y frutos de una lista de olivos y de los puntos LiDAR que caen en ellos (P: x, y, z, h, b, n)
    var gp = [], gc = [], pp = [], pc = [], bp = [], bc = [], c3: any = [0, 0, 0], r = 1;
    function azar() { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; }
    for (var q = 0; q < P.n; q++) {
      if (q % 2500 === 2499) yield;
      var x = P.x[q], y = P.y[q], z = P.z[q], h = P.h[q];
      if (P.b[q]) { var tb = 0.30 + 0.12 * hash(q); bp.push(x, z * Estado.exag, -y); bc.push(0.46 * tb * 1.8, 0.38 * tb * 1.8, 0.30 * tb * 1.8); continue; }
      if (h < 0.7) continue;
      colorEn(x, y, h, c3); aviva(c3, x, y);
      var cop = copaAlta(x, y), rel = cop > 0.5 ? Math.min(1, h / cop) : 1, luz = 0.85 + 0.42 * rel;
      var n: any = Estado.calidad === 2 ? ((q % 3 === 0) ? 1 : 2) : Estado.calidad === 1 ? ((q % 3 === 0) ? 1 : 0) : 0;  // más montoncitos por punto: la copa se cierra
      for (var k = 0; k < n + 1; k++) {
        var jx = azar() * 0.7, jy = azar() * 0.7, jz = azar() * 1.1 - (k ? 0.15 : 0);
        var tono = 0.88 + 0.28 * hash(q * 5 + k), col = [c3[0] * luz * tono, c3[1] * luz * tono, c3[2] * luz * tono];
        var xx: any = x + jx, yy: any = y + jy, zz: any = Math.max(z + jz, 0.6 + suelo(x, y)) * Estado.exag;
        if (k === 0 && q % 2 === 0) { gp.push(xx, zz, -yy); gc.push(col[0], col[1], col[2]); } else { pp.push(xx, zz, -yy); pc.push(col[0], col[1], col[2]); }
      }
    }
    for (var ai = 0; ai < arr.length; ai++) {
      var t = arr[ai], n = t.i;
      if (ai % 6 === 5) yield;
      var ht = Math.min(1.5, Math.max(0.9, t.h * 0.3)), cb = ht + 0.1, top = Math.max(t.h, cb + 1.4), gz = suelo(t.x, t.y);
      var relleno = Estado.calidad === 2 ? 48 : Estado.calidad === 1 ? 22 : 0;
      for (var k = 0; k < relleno; k++) {
        var th = (hash(n * 97 + k) * 6.283), rr = radioEn(t.perfil, th) * ESC_R8, u = Math.sqrt(hash(n * 131 + k * 3 + 1)) * 0.88, rad = u * rr;
        var domo = Math.sqrt(Math.max(0, 1 - u * u)), yy: any = cb + (top - cb) * (0.18 + 0.78 * domo) - hash(n * 53 + k * 7) * 0.9;
        var xx = t.x + Math.cos(th) * rad, zz = t.y + Math.sin(th) * rad, hh = Math.max(0.8, yy);
        colorEn(xx, zz, hh, c3); aviva(c3, xx, zz);
        var luz2 = 0.70 + 0.35 * (yy - cb) / Math.max(top - cb, 1), tono = 0.85 + 0.3 * hash(n * 17 + k);
        (k % 3 === 0 ? gp : pp).push(xx, (gz + yy) * Estado.exag, -zz);
        (k % 3 === 0 ? gc : pc).push(c3[0] * luz2 * tono, c3[1] * luz2 * tono, c3[2] * luz2 * tono);
      }
    }
    function pts(pos: any, col: any, mat: any) { var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere(); return new THREE.Points(g, mat); }
    grupo.add(pts(gp, gc, matHojaG)); grupo.add(pts(pp, pc, matHojaP)); grupo.add(pts(bp, bc, matCorteza)); construyeFrutosLista(grupo);
  }
  let inst: T3 = null;   // la malla de sombras de los olivos (la ÚNICA que toca este módulo en gSombras)
  const tm = new THREE.Object3D();
  function construyeSombras(): void {   // sombras suaves bajo cada copa (una malla instanciada para todos los olivos)
    const cap = copas.length + 1;
    if (inst && inst.instanceMatrix.count !== cap) quitaSombras();   // cambió el número de olivos: otra malla (la anterior se quita y se libera)
    if (!inst) {
      inst = new THREE.InstancedMesh(geoSombra, matSombra, cap); inst.frustumCulled = false;   // r151: la esfera de una InstancedMesh abarca sus instancias y se calcula una vez; estas se recolocan
      Estaticos.congela(inst); gSombras.add(inst);
    }
    let n2 = 0;
    copas.forEach(function (t: any) { if (!t.oliv) return; const rm = t.perfil.reduce(function (a: any, b: any) { return a + b; }, 0) / 8; tm.position.set(t.x + 0.4, (suelo(t.x, t.y) + 0.06) * Estado.exag, -t.y - 0.1); tm.scale.set(rm * 2.5 * ESC_R8, 1, rm * 2.5 * ESC_R8); tm.updateMatrix(); inst.setMatrixAt(n2++, tm.matrix); });
    inst.count = n2; inst.instanceMatrix.needsUpdate = true; d.ponInstSombra(inst); sombrasSol(true);
  }
  /** quita SU malla de gSombras y libera su búfer de instancias (three no lo suelta sin dispose); las demás mallas del grupo (las del paisaje) no se tocan */
  function quitaSombras(): void {
    if (!inst) return;
    gSombras.remove(inst); inst.dispose(); inst = null; d.ponInstSombra(null);
  }
  let suelto = false;
  /** quita la malla de sombras y suelta su geometría, los cuatro materiales y las dos texturas; olvida la fuente de VR. Llamarlo dos veces no libera dos veces. */
  function libera(): void {
    if (suelto) return; suelto = true;
    quitaSombras();
    if (VrPresupuesto) VrPresupuesto.olvida("sombras");
    geoSombra.dispose(); matSombra.map.dispose(); texHojas.dispose();
    materiales.libera();   // matHojaG, matHojaP, matCorteza y matSombra (y los saca de la lista de los recortes alfa)
  }
  /** el componente (ADR-0023): el ciclo de vida del follaje (texturas, materiales y la malla de sombras). Solo ciclo de vida: las hojas las dibujan las celdas de 07b;
   *  no se apaga desde la URL. Lo registra 90_final.js (el objeto lo usa el legado desde el primer fotograma). */
  const componente: Manifiesto = {
    id: ID_FOLLAJE, version: 1,
    consume: ["Materiales", "Estaticos", "gSombras", "Estado", "copas", "radioEn"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 1, triangulos: 2 * 30000 },   // la malla de sombras: UNA llamada con 2 triángulos por olivo (techo para 30.000 olivos); las hojas son puntos de las celdas de 07b
    mundos: ["exterior"],
    monta: function () { return { libera }; },
    libera: function () { libera(); }
  };
  return { texHojas, matHojaG, matHojaP, matCorteza, matSombra, geoSombra, follajeG, construyeSombras, libera, materiales, sombras: function () { return inst; }, componente };
}
export type Follaje = ReturnType<typeof creaFollaje>;
