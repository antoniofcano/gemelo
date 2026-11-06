// Los marcadores de la nube LiDAR (componente «marcadores-lidar», ADR-0023, C10 tercera tanda; MU5-n, A3-2b: antes apps/web/motor/08b_marcadores_lidar.js, que queda
// como talón). Las copas detectadas (octaedros), los olivos guardados en OlivarTrack (anillos) y las líneas de desfase entre ambos. Componente de los mundos
// ["exterior"] con un libera() que suelta de verdad: las mallas instanciadas, las geometrías y los materiales (los de la fábrica, con dueño «marcadores-lidar»).
// aplica() (08_marcadores) les avisa con «mundo:aplica» (cambió la exageración, el modo o los datos: recoloca lo que cuelga del terreno) y capas() con
// «capas:cambia» (las casillas «Copas del LiDAR», «Guardados en OlivarTrack» y «Desfase entre ambos»). ?marcadores=0 los apaga.
// Medido / deducido (regla 5): las copas son medidas (LiDAR 2024); los anillos son lo que guardó OlivarTrack; el desfase, su diferencia. Nada ilustrativo.
// Del legado recibe por argumento lo que necesita (THREE, la escena, los datos y la fábrica de materiales); no lee globales.
import type { Manifiesto, ContextoComponente } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface PuntoLidar { x: number; y: number; h?: number; par?: number }
export interface DepsMarcadoresLidar {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  Estaticos: { congela(o: unknown): void };
  /** 03_escena: el valor de una variable CSS como color (--lidar, --guardado) */
  colorCss(nombre: string): unknown;
  /** las copas detectadas dentro de las parcelas, los olivos guardados en OlivarTrack y todas las copas (marc[i].par indexa copas) */
  cIn: PuntoLidar[];
  marc: PuntoLidar[];
  copas: PuntoLidar[];
  suelo(x: number, y: number): number;
  /** Estado.exag (un campo que cambia: se lee en cada colocación) */
  Estado: { exag: number };
  /** 08_marcadores: ¿ya están los datos de las teselas? (un valor que cambia: va por función) */
  listo(): boolean;
  /** el DOM del menú: las casillas «cCopas», «cMarc» y «cDesf» */
  $(id: string): { checked: boolean };
  Materiales: Materiales;
  /** 02g: el presupuesto de VR (anillos y octaedros por escalón); null si no está */
  VrPresupuesto?: { instancias(n: string, l: unknown[]): void; olvida(n: string): void; renueva(n: string): void } | null;
}

export const ID_MARCADORES_LIDAR = "marcadores-lidar";

/** Monta los marcadores y devuelve su api; `suelta()` lo libera todo (una sola vez). */
export function creaMarcadoresLidar(d: DepsMarcadoresLidar, n: ContextoComponente) {
  const THREE = d.THREE, scene = d.scene, Estaticos = d.Estaticos, cIn = d.cIn, marc = d.marc, copas = d.copas, suelo = d.suelo, Estado = d.Estado, $ = d.$;
  const materiales = d.Materiales.de(ID_MARCADORES_LIDAR);   // lo que cree este componente se libera con su libera()
  const gCopas = new THREE.Group(), gMarc = new THREE.Group(), gDesf = new THREE.Group();
  gCopas.name = "copas"; gMarc.name = "marcas"; gDesf.name = "desfase";   // los nombres los usa el desglose de llamadas de las pruebas
  [gCopas, gMarc, gDesf].forEach(function (g: T3) { scene.add(g); });   // AG-1.15: sus mallas se congelan abajo; las instancias llevan su propia matriz y las recoloca coloca()
  const geoCopa = new THREE.OctahedronGeometry(0.38), matOcta = materiales.estandar("MeshBasicMaterial", { color: d.colorCss("--lidar") });
  const mCopas = new THREE.InstancedMesh(geoCopa, matOcta, cIn.length); mCopas.frustumCulled = false; gCopas.add(mCopas);   // r151: la esfera de una InstancedMesh se calcula una vez con sus instancias; estas se recolocan con la exageración
  const ani = new THREE.RingGeometry(0.55, 0.95, 8); ani.rotateX(-Math.PI / 2);
  const matMarc = materiales.estandar("MeshBasicMaterial", { color: d.colorCss("--guardado"), side: THREE.DoubleSide });
  const mMarc = new THREE.InstancedMesh(ani, matMarc, marc.length); mMarc.frustumCulled = false; gMarc.add(mMarc);
  // Q0c-a: en VR, el escalón decide hasta qué distancia se dibujan anillos y octaedros (02g_vr_presupuesto); suelto en las pruebas no está
  const vrPres = d.VrPresupuesto || null;
  if (vrPres) { vrPres.instancias("marcasOT", [mMarc]); vrPres.instancias("copasLidar", [mCopas]); }
  const desfGeo = new THREE.BufferGeometry(), matDesf = materiales.estandar("LineBasicMaterial", { color: 0xffffff, transparent: true, opacity: 0.9 });
  gDesf.add(new THREE.LineSegments(desfGeo, matDesf));
  [gCopas, gMarc, gDesf].forEach(function (g: T3) { Estaticos.congela(g); });   // AG-1.15: nada de esto se mueve como objeto (la exageración va en las matrices de instancia y en los vértices)
  const tmpMarc = new THREE.Object3D();
  function coloca(): void {
    cIn.forEach(function (c, i) { tmpMarc.position.set(c.x, (suelo(c.x, c.y) + (c.h as number) + 1.4) * Estado.exag, -c.y); tmpMarc.updateMatrix(); mCopas.setMatrixAt(i, tmpMarc.matrix); }); mCopas.instanceMatrix.needsUpdate = true;
    const seg: number[] = [];
    marc.forEach(function (m, i) {
      const gz = suelo(m.x, m.y); tmpMarc.position.set(m.x, (gz + 0.35) * Estado.exag, -m.y); tmpMarc.updateMatrix(); mMarc.setMatrixAt(i, tmpMarc.matrix);
      if ((m.par as number) >= 0) { const c = copas[m.par as number] as PuntoLidar, g2 = suelo(c.x, c.y); seg.push(m.x, (gz + 0.5) * Estado.exag, -m.y, c.x, (g2 + 0.5) * Estado.exag, -c.y); }
    }); mMarc.instanceMatrix.needsUpdate = true;
    desfGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    // la esfera de recorte se calcula tras escribir las posiciones (three la calcula una sola vez, con lo que hubiera en el primer fotograma, y la exageración las mueve en y); con un vértice no finito, sin recorte
    if (seg.every(isFinite)) desfGeo.computeBoundingSphere(); else desfGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    if (vrPres) { vrPres.renueva("marcasOT"); vrPres.renueva("copasLidar"); }   // Q0c-a (las pruebas sacan coloca() suelta)
  }
  function ponCapas(): void { gCopas.visible = $("cCopas").checked; gMarc.visible = $("cMarc").checked; gDesf.visible = $("cDesf").checked; }
  n.on("mundo:aplica", coloca);
  n.on("capas:cambia", ponCapas);
  // montado tarde (la configuración del servidor, a mano): los datos ya están y las casillas ya existen
  if (d.listo()) coloca();
  ponCapas();
  let disp = false;
  /** quita los grupos de la escena y suelta mallas, geometrías y materiales; llamarlo dos veces no libera dos veces */
  function suelta(): void {
    if (disp) return; disp = true;
    if (vrPres) { vrPres.olvida("marcasOT"); vrPres.olvida("copasLidar"); }
    [gCopas, gMarc, gDesf].forEach(function (g: T3) { scene.remove(g); });
    mCopas.dispose(); mMarc.dispose(); geoCopa.dispose(); ani.dispose(); desfGeo.dispose();
    materiales.libera();   // los tres materiales (Basic y Line, estándar: sin sombreador propio, no hay variante TSL que escribir)
  }
  return { coloca, capas: ponCapas, grupos: function () { return [gCopas, gMarc, gDesf]; }, suelta, materiales };
}
export type MarcadoresLidar = ReturnType<typeof creaMarcadoresLidar>;

/** El manifiesto del componente «marcadores-lidar» (el mismo de siempre, ahora de los mundos ["exterior"]): lo registra el talón de 08b con Componentes.registra. */
export function manifiestoMarcadoresLidar(d: DepsMarcadoresLidar): Manifiesto {
  return {
    id: ID_MARCADORES_LIDAR, version: 1,
    consume: ["Estaticos", "scene", "colorCss", "cIn", "marc", "copas", "suelo", "Estado", "listo", "VrPresupuesto"],
    expone: [],
    eventos: { escucha: ["mundo:aplica", "capas:cambia"], emite: [] },
    bandera: { defecto: true, url: "marcadores" },
    presupuesto: { llamadas: 3, triangulos: 240000 },   // [SUPUESTO] techo para 10.000 copas (octaedro de 8 triángulos) y 10.000 marcas (anillo de 8 lados = 16 triángulos, antes 20 lados = 40) = 8·N + 16·M; Hituelo tiene 5.882 copas. Una maqueta de 140 copas y 60 marcas mide 2 llamadas y 3.520 triángulos (componentes_c10c.test.js); con «Desfase» encendida suma la llamada de las líneas
    fases: {},
    mundos: ["exterior"],
    monta: function (n) { return creaMarcadoresLidar(d, n); },
    actualiza: {},
    libera: function (api) { if (api) (api as MarcadoresLidar).suelta(); }
  };
}
