// El Ambiente de cada mundo (MUNDOS §4; MU2-7): el cielo, el fondo, la niebla, las luces, el near/far de la cámara (en pantalla y en VR) y la
// exageración vertical. Cada mundo da el suyo (World.ambiente()) y el gestor (nucleo/mundos.ts) lo aplica al entrar en él, a oscuras, con
// aplicaAmbiente(…), que es lo que hacía 03_escena.js al montarse (el fondo y la niebla desde --sky, FOG0 y FOG1; el hemisferio y el sol en la
// escena; near 0,5 y far max(5000, 4·EXT)) y 29_vr.js al entrar y salir de la sesión (near de la perilla xrnear y far 6000).
// No se «deshace» al salir: cada Ambiente es completo (todos sus campos dicen cómo queda la escena), así que volver a un mundo es aplicar el suyo
// otra vez. Por eso aplicaAmbiente es idempotente: aplicarlo dos veces deja la escena igual que una, sin colgar dos veces una luz ni reservar nada.
// Vive en nucleo/ y no en mundos/ porque lo aplica el gestor, y nucleo no importa de mundos (MUNDOS §1); mundos/mundo.ts lo reexporta.
// three no trae tipos en el repo (no hay @types/three): la escena, la cámara, los colores, la niebla y las luces son tipos mínimos estructurales,
// como en nucleo/presupuesto.ts, y lo que hay que crear (un THREE.Color, un THREE.Fog) lo crea quien llama, con las fábricas `color` y `niebla`.

/** Lo mínimo de una luz de three (Light) que el aplicador mira: dónde está colgada. */
export interface LuzAmbiente { parent?: unknown }

/** El near/far de la cámara de un mundo (m). */
export interface CamaraAmbiente { near: number; far: number }

/** MUNDOS §4: lo que el gestor aplica al entrar el mundo. */
export interface Ambiente {
  /** «exterior»: lo pinta 15_tiempo cada fotograma (sol, cielo, nubes, estrellas, lluvia, niebla), y `fondo` y `niebla` son su punto de partida;
   *  «ninguno»: un interior, que pone su fondo y su niebla (o ninguna) y nada los mueve */
  cielo: "exterior" | "ninguno";
  /** color sRGB del fondo (scene.background); null = sin fondo (el del lienzo) */
  fondo: number | null;
  /** la niebla lineal (THREE.Fog): color sRGB, cerca y lejos (m); null = sin niebla */
  niebla: { color: number; cerca: number; lejos: number } | null;
  /** las luces del mundo, con su intensidad: las crea el mundo y el aplicador las cuelga de la escena y descuelga las del mundo de antes */
  luces: readonly LuzAmbiente[];
  /** near/far en pantalla y, si es otro, en una sesión de VR (si no se da, el de pantalla también en VR) */
  camara: CamaraAmbiente & { vr?: CamaraAmbiente };
  /** la exageración vertical del mundo: el exterior, la del usuario (1-3, el deslizador #exag); los interiores, 1 fijo. Se escribe en Estado.exag */
  exag: number;
  /** si el mundo quiere otro tone mapping (AG-2.5). NO lo aplica aplicaAmbiente todavía: ningún mundo lo pide y el de Render.tono sigue en 03_escena */
  tono?: { constante: string; expo: number };
}

/** Lo mínimo de un THREE.Color: el aplicador reusa el suyo con setHex (sRGB → lineal, como new THREE.Color(hex)). */
export interface ColorAmbiente { setHex(hex: number): unknown }
/** Lo mínimo de un THREE.Fog. */
export interface NieblaAmbiente { color: ColorAmbiente; near: number; far: number }

/** Dónde se aplica: la única scene, la cámara, si hay sesión de VR, el Estado (exag) y cómo crear un color y una niebla (THREE.Color, THREE.Fog). */
export interface EscenaAmbiente {
  scene: { background: unknown; fog: unknown; add(o: LuzAmbiente): unknown; remove(o: LuzAmbiente): unknown };
  camara: { near: number; far: number; updateProjectionMatrix(): void };
  /** el renderizador: en VR si renderer.xr.isPresenting (sin él, siempre en pantalla) */
  renderer?: { xr: { isPresenting: boolean } } | null;
  /** el estado compartido del legado (nucleo/estado.ts): su exag pasa a ser la del mundo */
  estado?: { exag: number } | null;
  /** new THREE.Color(hex): se llama una vez por escena, la primera que hace falta un fondo */
  color(hex: number): ColorAmbiente;
  /** new THREE.Fog(hex, cerca, lejos): una vez por escena, la primera que hace falta niebla */
  niebla(hex: number, cerca: number, lejos: number): NieblaAmbiente;
}

/** Lo que el aplicador recuerda de cada escena: las luces que colgó, y su color de fondo y su niebla (se reusan: no se reserva al volver a aplicar). */
interface Recuerdo { luces: LuzAmbiente[]; fondo: ColorAmbiente | null; niebla: NieblaAmbiente | null }
const recuerdos = new WeakMap<object, Recuerdo>();
function recuerdo(scene: object): Recuerdo {
  let r = recuerdos.get(scene);
  if (!r) { r = { luces: [], fondo: null, niebla: null }; recuerdos.set(scene, r); }
  return r;
}

/** El near/far que toca: el de VR con sesión (si el mundo da uno), el de pantalla si no. */
function camaraDe(amb: Ambiente, enVr: boolean): CamaraAmbiente { return enVr && amb.camara.vr ? amb.camara.vr : amb.camara; }

/** Solo el near/far del Ambiente (lo usa 29_vr al entrar y salir de la sesión, con el Ambiente del mundo activo). Sin Ambiente, no toca nada.
 *  Si no cambia nada, ni siquiera recalcula la proyección. Devuelve si cambió. */
export function aplicaCamara(amb: Ambiente | null, camara: EscenaAmbiente["camara"], enVr: boolean): boolean {
  if (!amb) return false;
  const c = camaraDe(amb, enVr);
  if (camara.near === c.near && camara.far === c.far) return false;
  camara.near = c.near; camara.far = c.far; camara.updateProjectionMatrix();
  return true;
}

/** Deja la escena como pide el Ambiente: fondo, niebla, luces (descuelga las que colgó antes y no son de este; cuelga las suyas que no lo
 *  estén), near/far (de pantalla o de VR) y exag. Idempotente. */
export function aplicaAmbiente(amb: Ambiente, d: EscenaAmbiente): void {
  const s = d.scene, r = recuerdo(s);
  // el fondo: un color propio, reusado (15_tiempo pone el suyo cada fotograma sobre este punto de partida si cielo = «exterior»)
  if (amb.fondo === null) s.background = null;
  else {
    if (r.fondo) r.fondo.setHex(amb.fondo); else r.fondo = d.color(amb.fondo);
    s.background = r.fondo;
  }
  // la niebla: una propia, reusada; 15_tiempo la mueve en su sitio (scene.fog.color, .near, .far) mientras el exterior está activo
  const n = amb.niebla;
  if (!n) s.fog = null;
  else {
    if (r.niebla) { r.niebla.color.setHex(n.color); r.niebla.near = n.cerca; r.niebla.far = n.lejos; }
    else r.niebla = d.niebla(n.color, n.cerca, n.lejos);
    s.fog = r.niebla;
  }
  // las luces: fuera las del mundo de antes que no sean de este, dentro las de este que no estén colgadas de la escena
  const nuevas = amb.luces;
  for (const l of r.luces) if (nuevas.indexOf(l) < 0 && l.parent === s) s.remove(l);
  for (const l of nuevas) if (l.parent !== s) s.add(l);
  r.luces = nuevas.slice();
  aplicaCamara(amb, d.camara, !!(d.renderer && d.renderer.xr.isPresenting));
  if (d.estado) d.estado.exag = amb.exag;
}
