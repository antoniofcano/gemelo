// El soltador de la interfaz (A3-7a, MU5-n): apunta lo que una pieza de ui/ engancha (escuchas del DOM, observadores, relojes, nodos que crea, lo que
// devuelve «quita» de otro) para que su libera() lo suelte todo de una vez. Antes, en el legado, casi nada de esto se soltaba nunca (L2-11: los relojes del HUD).
// escucha(o, tipo, fn, opc?) es addEventListener con su removeEventListener apuntado: el código movido del legado solo cambia «o.addEventListener(» por
// «escucha(o, » (mismo tipo, misma función, mismas opciones). suelta() deshace en orden inverso; un fallo al soltar no corta los demás.
import type { T } from "./tipos.ts";

export interface Soltador {
  escucha(o: T, tipo: string, fn: T, opc?: T): void;
  /** un MutationObserver (o lo que tenga disconnect) que hay que desconectar */
  observa<O extends { disconnect(): void }>(mo: O): O;
  /** un setInterval que hay que parar (devuelve el mismo id) */
  intervalo(id: T): T;
  /** un setTimeout que hay que cancelar si no ha saltado (devuelve el mismo id) */
  espera(id: T): T;
  /** un nodo del DOM creado por la pieza: se saca de su padre al soltar */
  nodo<N>(n: N): N;
  /** cualquier otra cosa que deshacer (la «quita» de un punto de extensión, una suscripción…) */
  quita(f: (() => void) | null | undefined): void;
  suelta(): void;
  /** cuántas cosas hay apuntadas (pruebas) */
  cuenta(): number;
}

export function creaSoltador(): Soltador {
  var quitar: Array<() => void> = [];
  return {
    escucha: function (o: T, tipo: string, fn: T, opc?: T) {
      if (!o) return;
      o.addEventListener(tipo, fn, opc);
      quitar.push(function () { o.removeEventListener(tipo, fn, opc); });
    },
    observa: function (mo) { quitar.push(function () { mo.disconnect(); }); return mo; },
    intervalo: function (id: T) { quitar.push(function () { clearInterval(id); }); return id; },
    espera: function (id: T) { quitar.push(function () { clearTimeout(id); }); return id; },
    nodo: function (n: T) { quitar.push(function () { if (n && n.parentNode) n.parentNode.removeChild(n); }); return n; },
    quita: function (f) { if (typeof f === "function") quitar.push(f); },
    suelta: function () { quitar.splice(0).reverse().forEach(function (f) { try { f(); } catch (e) { /* ya suelto: sigue con lo demás */ } }); },
    cuenta: function () { return quitar.length; }
  };
}
