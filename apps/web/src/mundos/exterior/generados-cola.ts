// La cola PROPIA de los olivos generados (O8c, AG-1.5): como la del motor (menor prio = antes; cada next() es una rebanada), pero solo con lo de los generados y con
// su propio tope de ms en el fotograma. Así el más cercano no espera detrás de las teselas y celdas pendientes de la Cola del motor, ni ellas detrás de él (en
// SwiftShader, con Hituelo real, la cola compartida tardó ≈ 7 min en dar 2 olivos: MEDIDAS). MU5-n (A3-2a): antes dentro de Generados en 07ab_generados.js; el
// código es el de siempre, movido. Sin THREE ni DOM: el reloj entra por argumento (performance en el motor, uno de mentira en las pruebas).
// AG-1.5: un trabajo que cede { espera: f } queda dormido mientras f() sea cierto (compiladoG, esperando a la GPU): no se le da rebanada ni gasta el presupuesto en
// vueltas vacías; los demás siguen por su prioridad.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface Trabajo { clave: string; prio: number; gen: Iterator<A, A, A>; fin?: ((v: A) => void) | null; espera?: (() => boolean) | null }

export function creaColaPropia(reloj: { now(): number }) {
  var trabajos: Trabajo[] = [], gastado = 0;
  /** pone un trabajo (si ya hay uno con esa clave, solo le cambia la prioridad) */
  function encola(clave: string, prio: number, gen: Iterator<A, A, A>, fin?: ((v: A) => void) | null): void {
    for (var i = 0; i < trabajos.length; i++) { var t = trabajos[i] as Trabajo; if (t.clave === clave) { t.prio = prio; return; } }
    trabajos.push({ clave: clave, prio: prio, gen: gen, fin: fin || null });
  }
  function hay(clave: string): boolean { return trabajos.some(function (t) { return t.clave === clave; }); }
  /** avanza los trabajos por prioridad hasta gastar ms (o hasta que todos esperen) */
  function corre(ms: number): void {
    var t0 = reloj.now();
    while (trabajos.length && reloj.now() - t0 < ms) {
      var bi = -1; for (var i = 0; i < trabajos.length; i++) { var ti = trabajos[i] as Trabajo; if (ti.espera) { if (ti.espera()) continue; ti.espera = null; } if (bi < 0 || ti.prio < (trabajos[bi] as Trabajo).prio) bi = i; }
      if (bi < 0) break;   // todos esperan
      var j = trabajos[bi] as Trabajo, r = j.gen.next();
      if (r.done) { trabajos.splice(bi, 1); if (j.fin) j.fin(r.value); } else if (r.value && typeof r.value.espera === "function") j.espera = r.value.espera;
    }
    gastado = reloj.now() - t0;
  }
  /** MU5-n: suelta todos los trabajos sin acabarlos (sus generadores se cierran con return(), sin llamar a su fin); devuelve cuántos */
  function vacia(): number {
    var n = trabajos.length;
    trabajos.splice(0).forEach(function (t) { try { if (t.gen.return) t.gen.return(undefined); } catch (e) { /* un generador que falla al cerrarse no para la liberación */ } });
    return n;
  }
  return {
    encola, hay, corre, vacia,
    /** lo que gastó la última corre() (ms) */
    gastado: function () { return gastado; },
    /** cuántos trabajos quedan */
    cuantos: function () { return trabajos.length; },
    /** a cero (paso() lo hace antes de correr) */
    ponCero: function () { gastado = 0; }
  };
}
export type ColaPropia = ReturnType<typeof creaColaPropia>;

// AG-1.5: el lote acabado se compila (renderer.compileAsync de three: con KHR_parallel_shader_compile, el enlace de los sombreadores va en paralelo)
// ANTES de entrar en la escena, para que el fotograma en que aparece no compile. El trabajo «Glote» sigue en la cola mientras tanto (no se monta
// otro lote a la vez y pendientes() lo cuenta); si la compilación falla, el lote entra igual (compilará al dibujarse, como antes). Sin renderer
// (Node) o sin compileAsync, el lote sale tal cual: lo montado es el mismo. [SUPUESTO] en VR el programa con multivista puede no ser el que se
// compila aquí (depende del destino de dibujo de la sesión): no probado en un Quest.
// entorno() da el renderer, la cámara y la escena, y se pide cuando el lote ya está montado (como antes, que se leían entonces)
export function* compiladoG(gen: Iterator<A, A, A>, entorno: () => { renderer: A; camara: A; escena: A }): Generator<A, A, A> {
  var g: A = yield* (gen as Generator<A, A, A>);
  var e = entorno(), renderer = e.renderer, camera = e.camara, scene = e.escena;
  if (!g || !renderer || typeof renderer.compileAsync !== "function" || !scene) return g;
  var compilado = false, hecho = function () { compilado = true; };
  try { renderer.compileAsync(g, camera, scene).then(hecho, hecho); } catch (e) { compilado = true; }
  if (!compilado) yield { espera: function () { return !compilado; } };
  return g;
}
