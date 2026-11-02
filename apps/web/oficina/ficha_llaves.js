// «Llaves de acceso» en la ficha de una cuenta (OF13b-6, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md §5.4): la lista de las llaves de la cuenta (nombre, creada,
// último uso, si sirve para «Entrar con mi llave» sin correo, si está viva o revocada) y, en las familias, los botones «Quitar esta llave» y «Quitar todas las
// llaves». Sin acceso al documento: recibe `h` (el constructor de nodos de comun.js, que solo hace texto) y los textos de fecha, así se prueba con un DOM de
// mentira (pruebas/guardianes/oficina_llaves_ficha.test.js). Nunca se pinta el id de credencial ni la clave: la api no los manda.

/** Por qué una llave de oficina (o una anterior a OF13b) no sirve para entrar sin escribir el correo. */
export const TEXTO_NO_DESCUBRIBLE = "Esta llave no se guardó en el aparato: no sirve para «Entrar con mi llave» sin correo; crea otra";
export const TEXTO_SIN_LLAVES_FAMILIA = "Esta familia no tiene llaves de acceso: entra con el enlace de su correo.";
export const TEXTO_SIN_LLAVES_OFICINA = "Esta cuenta no tiene llaves de acceso.";
export const TEXTO_NOTA_QUITAR = "Quitar una llave la deja sin uso y cierra las sesiones abiertas con ella; la familia recibe un correo que lo cuenta (dice «la oficina», no quién). El enlace de su correo sigue sirviendo para entrar.";

/**
 * Normaliza una llave de las dos listas: la de la familia (`GET /api/admin/hogares/{id}/llaves`: `viva`, `sincronizada`) y la de las cuentas de oficina
 * (`GET /api/admin/llaves`: `revocada_en`, `respaldada`). `descubrible` ausente (api antigua) se toma como verdadero: no se acusa de lo que no se sabe.
 */
export function normalizaLlave(l) {
  return {
    id: l.id, nombre: String(l.nombre || "Llave"), creada_en: l.creada_en || null, ultima_vez_en: l.ultima_vez_en || null, revocada_en: l.revocada_en || null,
    viva: typeof l.viva === "boolean" ? l.viva : !l.revocada_en,
    descubrible: l.descubrible !== false,
    sincronizada: l.sincronizada === true || l.respaldada === true,
  };
}

/** Las etiquetas de una llave: [clase de la píldora, texto]. */
export function etiquetasDeLlave(llave, fecha) {
  const l = normalizaLlave(llave), et = [];
  et.push(l.viva ? ["p-ok", "viva"] : ["p-mal", "revocada" + (l.revocada_en ? " el " + fecha(l.revocada_en) : "")]);
  if (l.viva && !l.descubrible) et.push(["p-aviso", "sin entrada directa"]);
  if (l.viva && l.sincronizada) et.push(["p-info", "sincronizada"]);
  return et;
}

/**
 * La sección. `opciones`: { llaves, fecha, dia, puedeQuitar, alQuitar(llave), alQuitarTodas(), sinLlaves }. Sin `puedeQuitar` es solo lectura (las cuentas
 * de oficina se gestionan en Sistema → Llaves, con confirmación y la regla de la última llave).
 */
export function construyeLlaves(h, opciones) {
  const { fecha, dia, puedeQuitar } = opciones;
  const llaves = (opciones.llaves || []).map(normalizaLlave);
  const vivas = llaves.filter(l => l.viva);
  const caja = h("div", { "data-llaves": "" }, h("h3", null, "Llaves de acceso"));
  if (!llaves.length) { caja.append(h("p", { class: "nota" }, opciones.sinLlaves || TEXTO_SIN_LLAVES_FAMILIA)); return caja; }
  for (const l of llaves) {
    const filas = [h("span", null, l.nombre, " ", etiquetasDeLlave(l, fecha).map(([clase, texto]) => [h("span", { class: "pill " + clase }, texto), " "]),
      h("br"), h("span", { class: "nota" }, "creada el " + dia(l.creada_en) + " · último uso: " + fecha(l.ultima_vez_en)))];
    if (l.viva && !l.descubrible) filas.push(h("br"), h("span", { class: "nota", "data-no-descubrible": "" }, TEXTO_NO_DESCUBRIBLE));
    caja.append(h("div", { class: "aparato", "data-llave": l.id },
      h("span", null, filas),
      puedeQuitar && l.viva ? h("button", { class: "boton peq", type: "button", "aria-label": "Quitar la llave «" + l.nombre + "»", onclick: () => opciones.alQuitar(l) }, "Quitar esta llave") : null));
  }
  if (puedeQuitar) {
    caja.append(h("p", { class: "nota" }, TEXTO_NOTA_QUITAR));
    if (vivas.length) caja.append(h("p", null, h("button", { class: "boton peligro", type: "button", onclick: () => opciones.alQuitarTodas() }, "Quitar todas las llaves")));
  }
  return caja;
}

/** El texto del aviso tras quitar (la api dice si el correo salió). */
export function textoTrasQuitar(correo, quitadas, avisoEnviado) {
  const que = quitadas === 1 ? "Llave quitada" : quitadas + " llaves quitadas";
  return que + " a " + correo + "; sus sesiones se cerraron. " + (avisoEnviado ? "Se le avisó por correo." : "El correo de aviso NO salió: avísale tú.");
}
