// Escuchar el cambio de tema de la página (claro/oscuro): el atributo data-theme de <html> (lo pone el selector del menú) y la preferencia del sistema
// (prefers-color-scheme). MU5-n (A3-8a): antes lo escribía a mano 15_tiempo.js dentro de su cableado (con una `var` dentro de una función, que un talón no admite);
// ahora el talón lo pide aquí. Nada de aquí lee globales: el documento, la ventana y el MutationObserver entran por argumento.

export interface DepsTema {
  documento: { documentElement: unknown };
  ventana: { matchMedia?: ((q: string) => { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void }) | null };
  Observador: new (fn: () => void) => { observe(n: unknown, o: { attributes: boolean; attributeFilter: string[] }): void; disconnect(): void };
}

/** fn() cada vez que cambia el tema; devuelve la función que deja de escuchar (las dos cosas). */
export function escuchaTema(deps: DepsTema, fn: () => void): () => void {
  var mo = new deps.Observador(fn), mq = deps.ventana.matchMedia ? deps.ventana.matchMedia("(prefers-color-scheme: dark)") : null;
  mo.observe(deps.documento.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); if (mq) mq.addEventListener("change", fn);
  return function () { mo.disconnect(); if (mq) mq.removeEventListener("change", fn); };
}
