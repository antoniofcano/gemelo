// Enlaces entre secciones de la oficina (OF15a, doc/sistema/OFICINA.md §3 y §4): el hash de la URL es «#seccion» o «#seccion/parametro».
// Hoy llevan parámetro cuatro: «#hazas/H-01» (el código de la haza), «#familias/12» (el id numérico del hogar) y, desde OF15b, «#olivo/hituelo/1234»
// (la ficha de un olivo: finca y copas_id) y «#olivos/hituelo/1234» (abre «Olivo real» con ese olivo ya buscado). Lógica pura, sin DOM:
// la prueba de Node la ejercita (pruebas/guardianes/oficina_enlaces.test.js).

/** Qué parámetro admite cada sección (el resto, ninguno). Lo que no cuadra no se acepta: nunca llega a una consulta ni al DOM sin pasar por aquí. */
const PARAMETROS = {
  hazas: /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/,   // código de la haza: «H-01», «H-12b»…
  familias: /^[1-9][0-9]{0,9}$/,               // id del hogar
  olivo: /^[a-z0-9_-]{1,32}\/(?:0|[1-9][0-9]{0,9})$/,    // OF15b: finca/copas_id (la ficha del olivo, vista dentro de Hazas)
  olivos: /^[a-z0-9_-]{1,32}\/(?:0|[1-9][0-9]{0,9})$/,   // OF15b: finca/copas_id (Olivos, pestaña «Olivo real»)
};
const COPAS_ID_MAX = 4294967295;   // el tope de la api (u32): un id mayor no es de ningún olivo
const valido = (sec, param) => { const re = PARAMETROS[sec]; return !!re && re.test(param) && (!/^olivos?$/.test(sec) || Number(param.split("/")[1]) <= COPAS_ID_MAX); };

/** «#hazas/H-01» → { sec: "hazas", param: "H-01" }; sin parámetro o con uno inválido, param es null (se abre la sección a secas). */
export function parseaHash(hash) {
  let t = String(hash === undefined || hash === null ? "" : hash);
  if (t[0] === "#") t = t.slice(1);
  const i = t.indexOf("/");
  const sec = i < 0 ? t : t.slice(0, i);
  if (i < 0) return { sec, param: null };
  let param = t.slice(i + 1);
  try { param = decodeURIComponent(param); } catch { return { sec, param: null }; }
  return { sec, param: valido(sec, param) ? param : null };
}

/** { sec, param } → «#sec» o «#sec/param»; un parámetro que la sección no admite se omite. */
export function construyeHash(sec, param) {
  return "#" + sec + (param !== null && param !== undefined && valido(sec, String(param)) ? "/" + encodeURIComponent(String(param)).replace(/%2F/gi, "/") : "");
}
