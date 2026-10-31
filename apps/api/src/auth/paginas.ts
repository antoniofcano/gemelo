// Páginas HTML mínimas del enlace mágico: sin JavaScript, sin estilos externos ni en línea (pasan la CSP estricta).
// La página intermedia existe para que el enlace se gaste con un POST del navegador y no con el GET de un escáner
// de correo que abra los enlaces para revisarlos.
//
// Política de referente: `strict-origin`, NO `no-referrer`. Con `no-referrer`, Chrome manda `Origin: null` en el POST de
// un formulario (comprobado el 2026-10-29 con Chrome headless en la e2e de infra/dev) y la comprobación de Origin
// (seguridad/origen.ts) rechaza el botón «Entrar» con 403. `strict-origin` manda solo el origen, nunca la ruta ni la
// consulta: el token de la URL (?t=…) no sale en el Referer. La meta manda sobre la cabecera que ponga un proxy.
export const POLITICA_REFERENTE = "strict-origin";
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);

function pagina(titulo: string, cuerpo: string): string {
  return "<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<meta name=\"referrer\" content=\"" + POLITICA_REFERENTE + "\"><title>" + esc(titulo) + "</title></head><body><main>" + cuerpo + "</main></body></html>\n";
}

export function paginaEntrar(token: string): string {
  return pagina("Entrar", "<h1>Entrar en el gemelo</h1><p>Pulsa el botón para entrar en este dispositivo.</p>" +
    "<form method=\"post\" action=\"/api/auth/entrar\"><input type=\"hidden\" name=\"t\" value=\"" + esc(token) + "\">" +
    "<button type=\"submit\">Entrar</button></form>");
}

export const TEXTOS_ENLACE = {
  caducado: ["Este enlace ya no sirve", "El enlace ha caducado: vale 15 minutos desde que lo pedimos."],
  usado: ["Este enlace ya se usó", "Cada enlace sirve una sola vez; si has entrado desde otro dispositivo, sigue allí."],
  no_valido: ["Este enlace no sirve", "Puede que esté incompleto. Pide uno nuevo."],
} as const;

export function paginaEnlaceMalo(motivo: keyof typeof TEXTOS_ENLACE): string {
  const [t, p] = TEXTOS_ENLACE[motivo];
  return pagina(t, "<h1>" + esc(t) + "</h1><p>" + esc(p) + "</p><p><a href=\"/\">Pedir un enlace nuevo</a></p>");
}

/** Cuenta de oficina que entra desde un aparato aún no aprobado (ADR-0024, contratos/sesion.md § Oficina). */
export function paginaAparatoPendiente(nombre: string, minSegundoEnlace: number): string {
  return pagina("Aparato pendiente", "<h1>Este aparato está pendiente</h1>" +
    "<p>Has entrado en la oficina desde un aparato nuevo (<strong>" + esc(nombre) + "</strong>). Por seguridad, la oficina no se abre en él hasta que se apruebe.</p>" +
    "<ul><li>Pide a otra persona de la oficina que lo apruebe desde un aparato ya aprobado (Sistema → Aparatos de oficina), o</li>" +
    "<li>pasados " + minSegundoEnlace + " minutos, pide otro enlace desde este mismo navegador y ábrelo aquí: eso lo aprueba.</li></ul>" +
    "<p>Si no has sido tú, avisa a la oficina: alguien puede estar usando tu correo.</p>" +
    "<p><a href=\"/\">Pedir un enlace</a></p>");
}

/** La baja de los avisos por correo (OF11c): el GET de un escáner de correo no la hace; hace falta pulsar (POST). */
export function paginaBajaAvisos(token: string): string {
  return pagina("Avisos por correo", "<h1>Dejar de recibir los avisos por correo</h1><p>Seguirás viendo los avisos dentro del gemelo.</p>" +
    "<form method=\"post\" action=\"/api/avisos/baja\"><input type=\"hidden\" name=\"t\" value=\"" + esc(token) + "\">" +
    "<button type=\"submit\">Dejar de recibirlos</button></form>");
}
export function paginaBajaHecha(): string {
  return pagina("Avisos por correo", "<h1>Listo</h1><p>No te mandaremos más avisos por correo. Los seguirás viendo dentro del gemelo.</p><p><a href=\"/\">Ir al gemelo</a></p>");
}
export function paginaBajaMala(): string {
  return pagina("Avisos por correo", "<h1>Este enlace no sirve</h1><p>Puede que esté incompleto. Entra en el gemelo para cambiar tus avisos.</p><p><a href=\"/\">Ir al gemelo</a></p>");
}
