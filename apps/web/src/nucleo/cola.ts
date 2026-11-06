// La cola de trabajos y el reloj de carga (antes apps/web/motor/02b_cola.js; MUNDOS §6 y §9.4, pieza 1). Lo pesado (mallas de terreno, nube de
// una tesela, un olivar de 64 m, texturas de ruido) se construye a rebanadas: cada trabajo es un generador y cada «yield» es un punto donde se puede
// parar. Cola.corre(ms) hace avanzar el más urgente (menor prio = más cerca) hasta agotar el presupuesto de tiempo del fotograma, de modo que cargar
// una tesela nueva o construir los olivos de una celda no congela la imagen ni el paseo.
// Nada de aquí lee globales al cargarse: el reloj entra por argumento de creaCola({ ahora }).

/** AG-1.5: las reglas del reloj de carga, sin estado:
 *   CargaPuro.base(o)            ms por fotograma para todo lo que carga a rebanadas (lo reparte 07b_arboles entre los generados y la Cola): los de siempre
 *                                (más si faltan olivos de cerca y el aparato va holgado: emaDt ≤ 34 ms), recortados por el tope del aparato
 *                                (o.pol.cargaMs, o.pol.cargaMsVr en VR) y menos la deuda (o.deuda: lo que el tileset gastó en el motor fuera de la Cola)
 *   CargaPuro.parseTiles(pol, vr) teselas que la librería de 3D Tiles analiza a la vez (parseQueue.maxJobs); sin política, las 5 de la librería
 *   CargaPuro.prioridadRed(tile)  la prioridad de red de la descarga de una tesela (RequestInit.priority): "high" lo que se ve y está cerca
 *                                (< CERCA m del volumen de la tesela), "low" lo que no está en el encuadre, "auto" el resto y lo que no se sabe */
export interface PoliticaCarga { cargaMs?: number; cargaMsVr?: number; tilesParse?: number; tilesParseVr?: number }
export interface EntradaBase { emaDt?: number; faltan?: number; paseando?: boolean; vr?: boolean; pol?: PoliticaCarga | null; deuda?: number }
export interface TeselaRed { traversal?: { inFrustum?: boolean; distanceFromCamera?: number } | null }

const CERCA = 200;

function base(o?: EntradaBase | null): number {
  const e: EntradaBase = o || {};
  const justo = (e.emaDt as number) > 0.034;
  let b: number;
  if ((e.faltan as number) > 0 && !justo) b = e.paseando ? 8 : 12; else b = justo ? (e.paseando ? 3 : 4.5) : (e.paseando ? 3.5 : 6);
  const pol: PoliticaCarga = e.pol || {}, tope = e.vr ? pol.cargaMsVr : pol.cargaMs;
  if (typeof tope === "number" && tope > 0 && b > tope) b = tope;
  return Math.max(0, b - ((e.deuda as number) > 0 ? (e.deuda as number) : 0));
}

function parseTiles(pol?: PoliticaCarga | null, vr?: boolean): number {
  const n = pol ? (vr ? pol.tilesParseVr : pol.tilesParse) : 0;
  return typeof n === "number" && n >= 1 ? Math.floor(n) : 5;
}

function prioridadRed(tile?: TeselaRed | null): "high" | "low" | "auto" {
  const t = tile && tile.traversal;
  if (!t) return "auto";
  if (t.inFrustum === false) return "low";
  return t.inFrustum === true && typeof t.distanceFromCamera === "number" && t.distanceFromCamera < CERCA ? "high" : "auto";
}

export const CargaPuro = { CERCA, base, parseTiles, prioridadRed };

/** Un trabajo: generador cuyo valor de retorno recibe `fin`. */
export type Trabajo = Generator<unknown, unknown, unknown>;

/** Lo que cuesta cada tipo de trabajo (1.ª letra de la clave): rebanadas, ms totales, la más larga y la media móvil. */
export interface EstTipo { n: number; ms: number; max: number; prom: number }

interface Job { clave: string; prio: number; gen: Trabajo; fin?: (valor: unknown) => void; muerto?: boolean }
/** Un trabajo sacado de la Cola sin cancelarlo (MU2-6, aparcaDe): la clave entera (con su dueño), su prioridad, su generador a medias y su `fin`. */
export interface TrabajoAparcado { readonly clave: string; readonly prio: number; readonly gen: Trabajo; readonly fin?: ((valor: unknown) => void) | undefined }

export interface OpcionesCola {
  /** el reloj en ms (performance.now del legado; en las pruebas, uno de mentira) */
  ahora: () => number;
}

/** Dueño de una clave por prefijo (MUNDOS §6): «exterior:N12» es del dueño «exterior»; una clave sin «:» no tiene dueño (es la de siempre). */
export function duenoDe(clave: string): string | null {
  const i = clave.indexOf(":");
  return i > 0 ? clave.slice(0, i) : null;
}

/** AG-1.5 «carga sin tirones»: la Cola es además el RELOJ DE CARGA del fotograma, compartido con lo que carga fuera de ella:
 *   · cada tipo de trabajo (1.ª letra de la clave, o de lo que sigue al dueño si lo hay) lleva la media de lo que cuesta una rebanada (est[k].prom);
 *     no se EMPIEZA una rebanada que, por esa media, se saldría del presupuesto: queda para el fotograma siguiente (la rebanada inicial de cada
 *     llamada va siempre, así la Cola nunca se para). El orden de las rebanadas no cambia (siempre la de menor prio);
 *   · Cola.debe(ms, fuente) apunta trabajo que se hizo fuera de la Cola y fuera del presupuesto (lo que el tileset dispara en el motor al llegar una
 *     tesela, 04b_escena3d): es una DEUDA que 07b_arboles descuenta del presupuesto del fotograma siguiente (Cola.deuda()); Cola.corre la salda.
 *     Cola.cobra(fuente, f) envuelve una función para que lo que tarde se apunte así. est[fuente] lo enseña ?debug (28_depura) como las demás;
 *   · dueño por prefijo: Cola.cancelaDe("exterior") cancela los trabajos cuya clave empieza por «exterior:» y no toca los demás; Cola.aparcaDe("exterior")
 *     los saca sin cancelarlos y Cola.repone(lista) los vuelve a meter (MU2-6: el mundo congelado). */
export function creaCola(opc: OpcionesCola) {
  const ahora = opc.ahora;
  const jobs: Job[] = [], activos: Record<string, Job> = {}, est: Record<string, EstTipo> = {};
  let deuda = 0;
  const tot = { n: 0, ms: 0 };   // lo de todos los tipos sumado (n rebanadas, ms), para la autopsia de fotogramas lentos del medidor (30_mide, Q0g)

  function tipo(k: string): EstTipo { return est[k] || (est[k] = { n: 0, ms: 0, max: 0, prom: 0 }); }
  function tipoDeClave(clave: string): string { const d = duenoDe(clave); return clave.charAt(d === null ? 0 : d.length + 1); }
  function apunta(e: EstTipo, dm: number): void { tot.n++; tot.ms += dm; e.n++; e.ms += dm; if (dm > e.max) e.max = dm; e.prom = e.n === 1 ? dm : e.prom + (dm - e.prom) * 0.2; }

  function add(clave: string, prio: number, gen: Trabajo, fin?: (valor: unknown) => void): boolean {
    let j = activos[clave];
    if (j) { j.prio = prio; return false; }   // la prioridad es la última pedida (la distancia a la cámara cambia)
    j = { clave, prio, gen, fin }; jobs.push(j); activos[clave] = j; return true;
  }
  function cancela(clave: string): void { const j = activos[clave]; if (j) { j.muerto = true; delete activos[clave]; } }
  function hay(clave: string): boolean { return !!activos[clave]; }
  function cancelaDe(dueno: string): number {
    let n = 0;
    for (const clave of Object.keys(activos)) if (duenoDe(clave) === dueno) { cancela(clave); n++; }
    return n;
  }
  // MU2-6: aparcar = sacar de la Cola los trabajos vivos de un dueño SIN cancelarlos (sus generadores siguen a medias, en memoria) y devolverlos;
  // repone() los vuelve a meter tal cual. Es lo que hace un mundo al congelarse (ColaDeMundo.aparca): cancelar dejaría a medias el estado de quien
  // los pidió (una tesela con su nube «pedida» para siempre, una celda de olivos que no se vuelve a pedir…), porque `fin` no se llama al cancelar.
  function aparcaDe(dueno: string): TrabajoAparcado[] {
    const fuera: TrabajoAparcado[] = [];
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i] as Job;
      if (j.muerto || duenoDe(j.clave) !== dueno) continue;
      jobs.splice(i, 1); if (activos[j.clave] === j) delete activos[j.clave];
      fuera.push({ clave: j.clave, prio: j.prio, gen: j.gen, fin: j.fin });
    }
    return fuera.reverse();   // en el orden en que se pidieron
  }
  function repone(lista: readonly TrabajoAparcado[]): number {
    let n = 0;
    for (const a of lista) if (add(a.clave, a.prio, a.gen, a.fin)) n++;
    return n;
  }
  function pendientesDe(dueno: string): number {
    let n = 0;
    for (const j of jobs) if (!j.muerto && duenoDe(j.clave) === dueno) n++;
    return n;
  }
  function corre(ms: number): void {
    const t0 = ahora();
    let hechas = 0;
    while (jobs.length) {
      const usado = ahora() - t0; if (usado >= ms) break;
      let bi = 0; for (let i = 1; i < jobs.length; i++) if ((jobs[i] as Job).prio < (jobs[bi] as Job).prio) bi = i;
      const j = jobs[bi] as Job;
      if (j.muerto) { jobs.splice(bi, 1); continue; }
      const e = tipo(tipoDeClave(j.clave));
      if (hechas > 0 && usado + e.prom > ms) break;   // AG-1.5: no cabe (por lo que suele costar): al fotograma siguiente
      const ts = ahora(), r = j.gen.next(), dm = ahora() - ts; apunta(e, dm); hechas++;
      if (r.done) { jobs.splice(bi, 1); if (activos[j.clave] === j) delete activos[j.clave]; if (j.fin) j.fin(r.value); }
    }
    deuda = 0;   // lo que se debía ya se descontó del presupuesto de este fotograma (07b_arboles)
  }
  function vacia(ms: number): void { const t0 = ahora(); while (jobs.length && ahora() - t0 < ms) corre(50); }   // para el arranque: termina todo lo pendiente
  function debe(ms: number, fuente?: string): void { if (!(ms > 0)) return; deuda += ms; apunta(tipo(fuente || "fuera"), ms); }
  function cobra<A extends unknown[], R, T>(fuente: string, f: (this: T, ...args: A) => R): (this: T, ...args: A) => R {
    return function (this: T, ...args: A): R { const t = ahora(); try { return f.apply(this, args); } finally { debe(ahora() - t, fuente); } };
  }

  return { est, tot, add, cancela, hay, cancelaDe, aparcaDe, repone, pendientesDe, corre, vacia, debe, cobra, deuda: () => deuda, pendientes: () => jobs.length };
}

export type Cola = ReturnType<typeof creaCola>;

/** La Cola vista desde un mundo (MUNDOS §6, MU2-1): las mismas operaciones, pero cada clave lleva delante el dueño («molino:» + clave), así
 *  cancelaTodo() es cancelaDe(dueño) y no toca los trabajos de otro mundo ni los de siempre (claves sin dueño). La crea el WorldManager para el
 *  Contexto de cada mundo: el mundo no ve la Cola entera. */
export interface ColaDeMundo {
  readonly dueno: string;
  pon(clave: string, prio: number, trabajo: Trabajo, fin?: (valor: unknown) => void): boolean;
  cancela(clave: string): void;
  hay(clave: string): boolean;
  cancelaTodo(): number;
  /** los suyos que están en la Cola (aparcados, no: ver aparcados()) */
  pendientes(): number;
  /** MU2-6, al congelar el mundo: saca sus trabajos de la Cola sin cancelarlos, y lo que pida mientras (una tesela que llega por la red) se queda
   *  también aquí, sin correr. Devuelve cuántos sacó. */
  aparca(): number;
  /** MU2-6, al volver a entrar: los aparcados vuelven a la Cola, en el orden en que se pidieron, y siguen donde iban. Devuelve cuántos. */
  repone(): number;
  /** cuántos tiene aparcados (0 si no está aparcada) */
  aparcados(): number;
}
/** Lo que se necesita de la Cola para darle dueño (la de creaCola cumple). */
export interface ColaConDueno {
  add(clave: string, prio: number, gen: Trabajo, fin?: (valor: unknown) => void): boolean;
  cancela(clave: string): void;
  hay(clave: string): boolean;
  cancelaDe(dueno: string): number;
  pendientesDe(dueno: string): number;
  aparcaDe(dueno: string): TrabajoAparcado[];
  repone(lista: readonly TrabajoAparcado[]): number;
}

export function creaColaDeMundo(cola: ColaConDueno, dueno: string): ColaDeMundo {
  if (!dueno || dueno.indexOf(":") >= 0) throw new Error("creaColaDeMundo: el dueño no puede ser vacío ni llevar «:» («" + dueno + "»)");
  const k = (clave: string): string => dueno + ":" + clave;
  // MU2-6: mientras está aparcada (el mundo congelado), lo suyo vive aquí, por clave entera y en el orden en que se pidió, y no en la Cola
  let aparcada: Map<string, TrabajoAparcado> | null = null;
  return {
    dueno,
    pon: (clave, prio, trabajo, fin) => {
      if (!aparcada) return cola.add(k(clave), prio, trabajo, fin);
      const c = k(clave), ya = aparcada.get(c);
      aparcada.set(c, ya ? { clave: c, prio, gen: ya.gen, fin: ya.fin } : { clave: c, prio, gen: trabajo, fin });   // como add: la prioridad es la última pedida
      return !ya;
    },
    cancela: clave => { if (aparcada) aparcada.delete(k(clave)); else cola.cancela(k(clave)); },
    hay: clave => (aparcada ? aparcada.has(k(clave)) : cola.hay(k(clave))),
    cancelaTodo: () => { let n = cola.cancelaDe(dueno); if (aparcada) { n += aparcada.size; aparcada.clear(); } return n; },
    pendientes: () => cola.pendientesDe(dueno),
    aparca: () => {
      if (!aparcada) aparcada = new Map();
      const fuera = cola.aparcaDe(dueno);
      for (const a of fuera) aparcada.set(a.clave, a);
      return fuera.length;
    },
    repone: () => {
      if (!aparcada) return 0;
      const lista = Array.from(aparcada.values()); aparcada = null;
      return cola.repone(lista);
    },
    aparcados: () => (aparcada ? aparcada.size : 0),
  };
}
