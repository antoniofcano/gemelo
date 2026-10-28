// Páginas HTML mínimas del enlace mágico: sin JavaScript, sin estilos externos ni en línea (pasan la CSP estricta).
// La página intermedia existe para que el enlace se gaste con un POST del navegador y no con el GET de un escáner
// de correo que abra los enlaces para revisarlos.
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);

function pagina(titulo: string, cuerpo: string): string {
  return "<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<meta name=\"referrer\" content=\"no-referrer\"><title>" + esc(titulo) + "</title></head><body><main>" + cuerpo + "</main></body></html>\n";
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
