// Llave de acceso de la oficina (OF13, contratos/sesion.md § Llave de acceso): piezas puras, sin DOM ni red, para la pantalla
// de la llave, la confirmación con llave y la tarjeta de Sistema. Las comprueba pruebas/guardianes/oficina_llave.test.js.

/**
 * Qué enseñar al abrir la oficina, a partir de `llave` de GET /api/oficina/sesion:
 *   { pantalla: false }                     la sesión ya vale (llave no obligatoria, o abierta con llave)
 *   { pantalla: true, alta, entrada }       qué botones: crear una llave (la primera vez o rehabilitada) y/o entrar con la suya
 *   { pantalla: true, bloqueada: true }     la cuenta tuvo llaves y no le queda ninguna: solo un admin (o la consola) la rehabilita
 */
export function pantallaLlave(llave) {
  if (!llave || !llave.requerida) return { pantalla: false };
  const entrada = llave.activas > 0, alta = llave.puede_alta === true;
  if (!entrada && !alta) return { pantalla: true, bloqueada: true, alta: false, entrada: false };
  return { pantalla: true, bloqueada: false, alta, entrada };
}

/** Texto para la persona según el error del navegador (WebAuthnError de @simplewebauthn/browser o DOMException). */
export function textoErrorLlave(e) {
  const codigo = e && (e.code || ""), nombre = e && (e.name || "");
  if (codigo === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || nombre === "InvalidStateError") return "Esa llave ya está dada de alta en tu cuenta. Usa otra, o entra con ella.";
  if (codigo === "ERROR_INVALID_DOMAIN" || codigo === "ERROR_INVALID_RP_ID" || nombre === "SecurityError") return "Esta dirección no admite llaves de acceso (hace falta https y el nombre del sitio, no una IP). Ábrela con su dirección de siempre.";
  if (codigo === "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT") return "Esa llave no puede comprobar que eres tú (huella, cara o PIN). Usa otra.";
  if (codigo === "ERROR_CEREMONY_ABORTED" || nombre === "AbortError") return "Se canceló. Vuelve a pulsar el botón cuando quieras.";
  if (nombre === "NotAllowedError") return "Se canceló o se agotó el tiempo. Vuelve a intentarlo; si no aparece nada, comprueba que el aparato tiene bloqueo de pantalla (huella, cara o PIN).";
  if (nombre === "NotSupportedError" || nombre === "ConstraintError") return "Este aparato no tiene una llave que sirva. Prueba con el teléfono (código QR) o con una llave física.";
  return "No se pudo usar la llave. Vuelve a intentarlo.";
}

/** Una línea para reconocer una llave en la lista. `hace(iso)` da «hace 2 h» (sistema_puro.js). */
export function resumenLlave(l, hace) {
  const partes = ["dada de alta " + (hace(l.creada_en) || "ahora"), l.ultima_vez_en ? "usada " + (hace(l.ultima_vez_en) || "ahora") : "sin usar"];
  if (l.respaldada) partes.push("sincronizada en tu cuenta del aparato");
  if (l.descubrible === false) partes.push("no sirve para entrar sin correo");   // OF13b-8: solo si la api lo dice (las anteriores a OF13b)
  if (l.revocada_en) partes.push("revocada " + (hace(l.revocada_en) || "ahora"));
  return partes.join(" · ");
}

/** El nombre que se propone para una llave nueva (el que dé la persona manda; la api lo recorta a 40). */
export function nombrePropuesto(agente) {
  const a = agente || "";
  if (/iPhone/.test(a)) return "iPhone";
  if (/iPad/.test(a)) return "iPad";
  if (/Android/.test(a)) return "Teléfono Android";
  if (/Windows/.test(a)) return "Windows Hello de este ordenador";
  if (/Mac OS X|Macintosh/.test(a)) return "Touch ID de este Mac";
  return "Este aparato";
}

// ------------------------------------------------------------------ OF13b-8: entrar con la llave, sin enlace (LLAVES-DE-ACCESO § 3.4, § 10)

export const TEXTO_SIN_WEBAUTHN = "Este navegador no admite llaves de acceso. Abre la oficina en un Chrome, Edge, Safari o Firefox al día, o recibe un enlace por correo.";
/** El mismo texto para cualquier fallo de la api al entrar (llave desconocida, revocada, firma, reto…): no delata nada (A7). */
export const TEXTO_ENTRADA_FALLIDA = "Esa llave no sirve aquí o no se pudo comprobar. Vuelve a intentarlo o entra con un enlace por correo.";

/** Adónde llevar a la persona tras `POST /api/auth/llave`: manda el estado del aparato; si no hay (cuenta de familia), el `destino` solo si es una ruta del mismo origen. */
export function destinoTrasEntrada(datos) {
  const d = datos || {};
  if (d.aparato === "aprobado") return "/oficina/";
  if (d.aparato === "pendiente") return "/api/oficina/pendiente";   // decisión 184: la llave no aprueba un aparato; la página dice cómo se aprueba
  if (typeof d.destino === "string" && /^\/(?!\/)[A-Za-z0-9\-._~/#?=%&]*$/.test(d.destino)) return d.destino;
  return "/";
}

const textoLimite = r => (r.estado === 429 && typeof r.mensaje === "string" && r.mensaje ? r.mensaje : TEXTO_ENTRADA_FALLIDA);

/**
 * La ceremonia de entrada sin sesión ni correo: opciones → llave del aparato → verificación. Todo lo de fuera va en `d` (para probarla sin
 * navegador): soporta(), cancela() (aborta la ceremonia previa ANTES de pedir otras opciones: la cookie del reto es una sola, y una
 * ceremonia vieja que acabara después llegaría con el reto nuevo y fallaría), post(ruta, cuerpo) → { ok, estado, datos, mensaje } sin
 * redirigir nunca, y firma(opciones) = startAuthentication. Devuelve { ok: true, destino, aparato } o { ok: false, mensaje, sinSoporte? }.
 */
export async function entraConLlave(d) {
  if (!d.soporta()) return { ok: false, sinSoporte: true, mensaje: TEXTO_SIN_WEBAUTHN };
  d.cancela();
  const o = await d.post("/api/auth/llave/opciones", {});
  if (!o.ok || !o.datos) return { ok: false, mensaje: textoLimite(o) };
  let respuesta;
  try { respuesta = await d.firma(o.datos); } catch (e) { return { ok: false, mensaje: textoErrorLlave(e) }; }
  const r = await d.post("/api/auth/llave", { respuesta });
  if (!r.ok || !r.datos || r.datos.ok !== true) return { ok: false, mensaje: textoLimite(r) };
  return { ok: true, destino: destinoTrasEntrada(r.datos), aparato: r.datos.aparato || null };
}

/** Qué decir tras dar de alta una llave desde Sistema: `descubrible` viene de la api (false solo si el aparato dijo que no la dejó residente). */
export function avisoAlta(nombre, descubrible) {
  if (descubrible === false) {
    return { tipo: "mal", repetir: true, texto: "Llave añadida (" + nombre + "), pero este aparato no la guarda para entrar sin correo: con ella tendrás que seguir pidiendo un enlace. Repite el alta con Windows Hello, el gestor de contraseñas del navegador, tu teléfono o una llave física con PIN." };
  }
  return { tipo: "ok", repetir: false, texto: "Llave añadida: " + nombre + ". El aparato la guarda: la próxima vez podrás pulsar «Entrar con mi llave» sin pedir un enlace." };
}
