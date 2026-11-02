// Enlaces entre secciones de la oficina (OF15a, doc/sistema/OFICINA.md §3 y §4): el hash de la URL es «#seccion» o «#seccion/parametro».
// Hoy llevan parámetro dos: «#hazas/H-01» (el código de la haza) y «#familias/12» (el id numérico del hogar). Lógica pura, sin DOM:
// la prueba de Node la ejercita (pruebas/guardianes/oficina_enlaces.test.js).

/** Qué parámetro admite cada sección (el resto, ninguno). Lo que no cuadra no se acepta: nunca llega a una consulta ni al DOM sin pasar por aquí. */
const PARAMETROS = {
  hazas: /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/,   // código de la haza: «H-01», «H-12b»…
  familias: /^[1-9][0-9]{0,9}$/,               // id del hogar
};

/** «#hazas/H-01» → { sec: "hazas", param: "H-01" }; sin parámetro o con uno inválido, param es null (se abre la sección a secas). */
export function parseaHash(hash) {
  let t = String(hash === undefined || hash === null ? "" : hash);
  if (t[0] === "#") t = t.slice(1);
  const i = t.indexOf("/");
  const sec = i < 0 ? t : t.slice(0, i);
  if (i < 0) return { sec, param: null };
  let param = t.slice(i + 1);
  try { param = decodeURIComponent(param); } catch { return { sec, param: null }; }
  const re = PARAMETROS[sec];
  return { sec, param: re && re.test(param) ? param : null };
}

/** { sec, param } → «#sec» o «#sec/param»; un parámetro que la sección no admite se omite. */
export function construyeHash(sec, param) {
  const re = PARAMETROS[sec];
  return "#" + sec + (re && param !== null && param !== undefined && re.test(String(param)) ? "/" + encodeURIComponent(String(param)) : "");
}
