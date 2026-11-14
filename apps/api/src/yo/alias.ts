// Qué alias no puede elegir un hogar (PUT /api/yo/alias): nada que parezca un teléfono ni que suplante a la oficina o a un papel del sistema (L9-07).
// La comparación usa la MISMA normalización que el cliente (apps/web/src/red/sala.ts, leeInfo): sin tildes, en minúsculas, 0 → o, 1/l/|/! → i y sin
// espacios ni signos; así «Ofícina», «La Oficina», «0ficina» u «Oficina 1» no pasan en la api, que antes solo rechazaba la palabra exacta.
// Lo vigila apps/api/pruebas/unidad/alias.test.ts (que además comprueba que sala.ts sigue con la misma normalización).

/** el alias tal como lo compara el cliente: sin tildes, minúsculas, 0 → o, 1/l/|/! → i, solo a-z */
export function normalizaAlias(alias: string): string {
  return alias.normalize("NFD").toLowerCase().replace(/0/g, "o").replace(/[1l|!]/g, "i").replace(/[^a-z]/g, "");
}

/** «oficina» no puede aparecer en ningún sitio del alias (como en el cliente, que lo enseña como «Visitante»); los demás papeles, como alias entero */
const CONTIENE = ["oficina"];
// ya normalizados (la «l» pasa a «i»: «olivartrack» → «oiivartrack»)
const ENTEROS = ["guia", "admin", "administracion", "corresponsal", "olivartrack"].map(normalizaAlias);

export function aliasReservado(alias: string): boolean {
  const n = normalizaAlias(alias);
  return CONTIENE.some((p) => n.includes(p)) || ENTEROS.includes(n);
}

/** 6 cifras o más seguidas (sin espacios ni guiones): parece un teléfono */
export function pareceTelefono(alias: string): boolean {
  return /\d{6,}/.test(alias.replace(/[ -]/g, ""));
}
