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
