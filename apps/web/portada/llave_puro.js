// Llaves de acceso en la portada (OF13b-7, ADR-0029; doc/sistema/LLAVES-DE-ACCESO.md §3 y UX.md §4.2b): piezas puras, sin DOM,
// sin red y sin la librería de WebAuthn. Las comprueba pruebas/guardianes/portada_llave.test.js. Los textos de error del navegador y
// el nombre propuesto del aparato son los de la oficina (regla 12: no se repiten): se reexportan.
export { nombrePropuesto, textoErrorLlave } from "../oficina/llave_puro.js";

export const CLAVE_RECUERDO = "gemelo.llave.oferta";
export const DIAS_AHORA_NO = 30;
const DIA_MS = 86400000;

/** Un único texto para cualquier fallo al entrar con la llave: no distingue causas (LLAVES-DE-ACCESO §10, OF13b-5). */
export const TEXTO_ERROR_ENTRADA = "No hemos podido entrar con esa llave. Prueba otra vez o recibe un enlace por correo.";
export const TEXTO_AVISO_APARATO = "Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta.";
export const TEXTO_AVISO_CORREO = "Te avisaremos por correo cuando se añada o se quite una llave. Si no has sido tú, entra con un enlace y quítala.";
export const TEXTO_ULTIMA_LLAVE = "Ya no te queda ninguna llave. Seguirás pudiendo entrar con el enlace que te mandamos al correo.";

/**
 * Qué recuerda este navegador de la oferta de crear una llave. `bruto` es lo guardado (texto JSON o null).
 * Devuelve { tipo: "nada" | "ahora_no" | "nunca" | "hecha", hasta }. «Ahora no» caduca a los 30 días (queda como «nada»).
 */
export function leeRecuerdo(bruto, ahora) {
  let o = null;
  try { o = bruto ? JSON.parse(bruto) : null; } catch { o = null; }
  if (!o || o.v !== 1) return { tipo: "nada", hasta: 0 };
  if (o.t === "nunca" || o.t === "hecha") return { tipo: o.t, hasta: 0 };
  if (o.t === "ahora_no" && Number.isFinite(o.hasta) && o.hasta > ahora) return { tipo: "ahora_no", hasta: o.hasta };
  return { tipo: "nada", hasta: 0 };
}

/** Lo que se guarda en el navegador para cada respuesta de la oferta (solo comodidad, nunca un secreto). */
export function recuerdoDe(tipo, ahora) {
  if (tipo === "ahora_no") return JSON.stringify({ v: 1, t: "ahora_no", hasta: ahora + DIAS_AHORA_NO * DIA_MS });
  if (tipo === "nunca" || tipo === "hecha") return JSON.stringify({ v: 1, t: tipo });
  return null;
}

/**
 * ¿Se ofrece «Crear una llave en este aparato»? Solo con todo esto a la vez:
 *   - la sesión nació del enlace del correo (`entrada === "enlace"`), es titular y no está en el primer acceso;
 *   - no es una cuenta de la oficina (allí la llave tiene su propia pantalla y reglas: LLAVES-DE-ACCESO §3.4);
 *   - el navegador admite llaves (`soporte`) y la cuenta puede añadir una (`GET /api/yo/llaves`: `puede_anadir`, que ya es falso en gafas y con el tope);
 *   - la persona no ha dicho «Ahora no» (30 días) ni «Este aparato no es mío», ni ya creó una aquí.
 */
export function debeOfrecer({ sesion, llaves, soporte, recuerdo }) {
  if (!soporte || !sesion || !llaves) return false;
  if (sesion.entrada !== "enlace" || sesion.titular !== true || sesion.primer_acceso) return false;
  if (sesion.rol === "oficina" || sesion.rol === "admin") return false;
  if (llaves.puede_anadir !== true) return false;
  return !recuerdo || recuerdo.tipo === "nada";
}

/** «Mis llaves» solo con sesión titular (no desde unas gafas). Quitar una llave no necesita que este navegador admita llaves; añadir, sí. */
export function muestraMisLlaves(sesion) {
  return !!sesion && sesion.titular === true && sesion.entrada !== "codigo";
}

/** Solo se navega a un destino del propio sitio que nos da la api. */
export function destinoSeguro(destino) {
  return typeof destino === "string" && /^\/(?!\/)[\w\-./#?=&]*$/.test(destino) ? destino : null;
}

/** «/#bienvenida» se resuelve dentro de la misma portada (ancla); lo demás es otra página. */
export function anclaDeDestino(destino) {
  const m = typeof destino === "string" ? /^\/#([a-z]+)$/.exec(destino) : null;
  return m ? m[1] : null;
}

/** «hace 5 min», «hace 3 h», «hace 2 días»; sin fecha válida, null. */
export function hace(iso, ahora) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 60) return "hace un momento";
  if (s < 3600) return "hace " + Math.round(s / 60) + " min";
  if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
  const d = Math.round(s / 86400);
  return "hace " + d + (d === 1 ? " día" : " días");
}

/** Una línea para reconocer una llave de la lista de «Mis llaves». */
export function resumenMiLlave(l, ahora) {
  const partes = ["creada " + (hace(l.creada_en, ahora) || "hace poco"), l.ultima_vez_en ? "usada " + (hace(l.ultima_vez_en, ahora) || "hace poco") : "sin usar todavía"];
  if (l.sincronizada) partes.push("guardada también en tu cuenta del aparato");
  return partes.join(" · ");
}

/** El texto de la confirmación de quitar una llave; si es la última, dice que el enlace sigue sirviendo. */
export function textoQuitar(l, total) {
  const base = "¿Quitar la llave «" + l.nombre + "»? Ese aparato dejará de entrar con ella y se cerrarán las sesiones que abrió con ella.";
  return total <= 1 ? base + " " + TEXTO_ULTIMA_LLAVE : base;
}

/** Texto para un fallo del alta o de la baja (api y navegador) sin jerga. `r` es { status, json }. */
export function textoFalloAlta(r) {
  const e = r && r.json && r.json.error;
  if (r && r.status === 0) return "No hemos podido conectar. Comprueba la conexión y vuelve a probar.";
  if (e === "demasiadas_llaves") return "Ya tienes el máximo de llaves. Quita alguna que no uses y vuelve a probar.";
  if (e === "llave_repetida") return "Esa llave ya está guardada. Usa otro aparato u otra llave.";
  if (e === "solo_titular") return "Desde unas gafas no se pueden crear llaves. Hazlo desde tu móvil u ordenador.";
  if (r && r.status === 429) return "Demasiados intentos seguidos. Espera unos minutos.";
  return "No hemos podido guardar la llave. Prueba otra vez.";
}
