// Mundo (OF14, escalón 1): las cuentas de la sección, sin DOM ni red, para probarlas con node. Valida lo que se escribe en los formularios
// (anunciar, expulsar, balizas oficiales) y arma el cuerpo que espera la api (apps/api/src/presencia/oficina_mundo.ts y rutas.ts), con los
// mismos límites. La api vuelve a validar todo: esto solo ahorra la ida y vuelta y dice el error en claro.

export const ANUNCIO_MAX = 280, TITULO_MAX = 60, TEXTO_MAX = 280, MOTIVO_MAX = 200;
export const HORAS = { min: 1, max: 168, defecto: 8 };
export const SALAS = { todas: "Todas las salas", general: "La sala general", visita: "La sala de la visita" };
/** Los mismos rangos que la api (UTM_X, UTM_Y de oficina_mundo.ts), EPSG:25830. */
export const UTM = { x: [100_000, 900_000], y: [3_900_000, 4_900_000] };
export const TEXTO_EXPULSION = "Se le sacará 15 minutos: queda fuera de la sala y no recibe tokens nuevos hasta entonces.";
export const CADUCIDADES = [[1, "1 hora"], [8, "8 horas"], [24, "1 día"], [72, "3 días"], [168, "7 días"]];

/** Como la api (limpiaTexto): junta los espacios y quita lo de control y de dirección. */
const rango = (a, b) => String.fromCharCode(a) + "-" + String.fromCharCode(b);
const RARO = new RegExp("[" + rango(0x00, 0x1f) + rango(0x7f, 0x9f) + rango(0x200b, 0x200f) + rango(0x2028, 0x202e) + rango(0x2066, 0x2069) + String.fromCharCode(0xfeff) + "]", "g");
export const limpia = t => String(t == null ? "" : t).replace(RARO, " ").replace(/\s+/g, " ").trim();
/** Letras tal como las cuenta la api (por caracteres, no por unidades UTF-16). */
export const cuenta = t => Array.from(String(t == null ? "" : t)).length;

/** «12 / 280» (con aviso al pasarse), para el contador del campo. */
export function textoCuenta(t, max) {
  const n = cuenta(limpia(t));
  return n + " / " + max + (n > max ? " (te pasas " + (n - max) + ")" : "");
}

export function cuerpoAnuncio(v) {
  const texto = limpia(v.texto);
  if (!texto) return { ok: false, error: "Escribe el anuncio." };
  if (cuenta(texto) > ANUNCIO_MAX) return { ok: false, error: "El anuncio tiene como mucho " + ANUNCIO_MAX + " letras." };
  const sala = v.sala || "todas";
  if (!Object.prototype.hasOwnProperty.call(SALAS, sala)) return { ok: false, error: "Elige a qué sala va." };
  return { ok: true, cuerpo: { texto, sala } };
}

export function cuerpoExpulsion(v) {
  const id = Number(v.hogar_id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return { ok: false, error: "Elige a qué familia." };
  const motivo = limpia(v.motivo);
  if (cuenta(motivo) > MOTIVO_MAX) return { ok: false, error: "El motivo tiene como mucho " + MOTIVO_MAX + " letras." };
  return { ok: true, cuerpo: motivo ? { hogar_id: id, motivo } : { hogar_id: id } };
}

/** Un número escrito a la española («4 123 456,5») o a la inglesa; NaN si no lo es. */
export function numero(t) {
  const s = String(t == null ? "" : t).trim().replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Coordenadas UTM (x, y) a { ok, x, y } o el error. */
export function validaPunto(vx, vy) {
  const x = numero(vx), y = numero(vy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "Pon las dos coordenadas UTM (x e y), en metros." };
  if (x < UTM.x[0] || x > UTM.x[1]) return { ok: false, error: "La x está fuera de rango (entre " + UTM.x[0] + " y " + UTM.x[1] + ")." };
  if (y < UTM.y[0] || y > UTM.y[1]) return { ok: false, error: "La y está fuera de rango (entre " + UTM.y[0] + " y " + UTM.y[1] + ")." };
  return { ok: true, x, y };
}

export function cuerpoBaliza(v) {
  if (!/^[a-z0-9_-]{1,32}$/.test(String(v.finca || ""))) return { ok: false, error: "Elige la finca." };
  const titulo = limpia(v.titulo);
  if (!titulo) return { ok: false, error: "La baliza necesita un título." };
  if (cuenta(titulo) > TITULO_MAX) return { ok: false, error: "El título tiene como mucho " + TITULO_MAX + " letras." };
  const texto = limpia(v.texto);
  if (cuenta(texto) > TEXTO_MAX) return { ok: false, error: "El texto tiene como mucho " + TEXTO_MAX + " letras." };
  const p = validaPunto(v.x, v.y);
  if (!p.ok) return p;
  const horas = v.horas === "" || v.horas == null ? HORAS.defecto : Number(v.horas);
  if (!Number.isInteger(horas) || horas < HORAS.min || horas > HORAS.max) return { ok: false, error: "La caducidad va de 1 hora a 7 días." };
  const cuerpo = { finca: v.finca, x: p.x, y: p.y, titulo, horas };
  if (texto) cuerpo.texto = texto;
  return { ok: true, cuerpo };
}

/** PUT /api/admin/balizas/:id solo mueve (x, y): el título, el texto y la caducidad no se editan (se quita y se pone otra). */
export function cuerpoMover(vx, vy) {
  const p = validaPunto(vx, vy);
  return p.ok ? { ok: true, cuerpo: { x: p.x, y: p.y } } : p;
}

/** «quedan 5 h» a partir del ISO de la api; `ahora` (ms) se pasa para poder probarlo. */
export function textoCaduca(hastaIso, ahora) {
  const t = Date.parse(hastaIso);
  if (Number.isNaN(t)) return "sin fecha";
  const min = Math.round((t - ahora) / 60000);
  if (min <= 0) return "caducada";
  if (min < 60) return "quedan " + min + " min";
  const h = Math.round(min / 60);
  return h < 48 ? "quedan " + h + " h" : "quedan " + Math.round(h / 24) + " días";
}

/** Texto de la confirmación de expulsar: a quién, y qué pasa. */
export const textoConfirmaExpulsion = etiqueta => "Vas a sacar de la visita a «" + etiqueta + "». " + TEXTO_EXPULSION;

/** Etiqueta de una familia en la lista de elegir: alias o nombre interno, y el correo. */
export function etiquetaFamilia(f) { return (f.alias || f.nombre_interno || "sin alias") + (f.correo ? " · " + f.correo : ""); }

// ---------------------------------------------------------------- OF14, escalón 2: quién está en el mundo (GET /api/admin/presencia/participantes)
/** Cada cuánto se vuelve a preguntar mientras la sección se ve (la api, además, cachea 4 s). */
export const REFRESCO_MS = 10_000;
export const ROLES = { hogar: "Familia", guia: "Guía", corresponsal: "Corresponsal", oficina: "Oficina" };
export const APARATOS = { escritorio: "Ordenador", movil: "Móvil", quest: "Gafas" };

/** `general`, `visita` o `guiada-<evento>` → texto. Lo desconocido se enseña tal cual (es un dato). */
export function etiquetaSala(sala) {
  const g = /^guiada-([1-9][0-9]{0,9})$/.exec(String(sala));
  if (g) return "Visita guiada " + g[1];
  return sala === "general" ? "Sala general" : sala === "visita" ? "Sala de la visita" : String(sala);
}
/** «hace 5 min» a partir del ISO que da la api; `ahora` (ms) se pasa para poder probarlo. Sin fecha: «—». */
export function textoHace(iso, ahora) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return "—";
  const min = Math.floor((ahora - t) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return "hace " + min + " min";
  const h = Math.floor(min / 60);
  return h < 48 ? "hace " + h + " h" + (min % 60 ? " " + (min % 60) + " min" : "") : "hace " + Math.floor(h / 24) + " días";
}
/** La frase viva del recuento («aria-live»). */
export function textoPersonas(r) {
  const n = r.total;
  if (!n) return "Ahora no hay nadie en el mundo.";
  const base = n === 1 ? "1 persona conectada" : n + " personas conectadas";
  return r.truncado ? base + " (se enseñan las primeras " + r.participantes.length + ")." : base + ".";
}
/** Qué mira: la haza (si la api la sabe) o «vista aérea»; hoy el motor no publica ninguna de las dos, así que casi siempre «—». */
export function textoMira(f) { return f.haza ? f.haza + (f.vista === "aerea" ? " (vista aérea)" : "") : f.vista === "aerea" ? "Vista aérea" : "—"; }
/** La respuesta de la api → filas de la tabla, ya con textos. «Expulsar» y «Ver la familia» solo si se sabe de qué hogar es y no es la oficina. */
export function filasMundo(r, ahora) {
  return (r && Array.isArray(r.participantes) ? r.participantes : []).map(f => ({
    salaClave: String(f.sala), sala: etiquetaSala(f.sala), alias: f.alias, rol: ROLES[f.rol] || "Familia", aparato: APARATOS[f.aparato] || "—", hace: textoHace(f.conectado_desde, ahora), mira: textoMira(f),
    hogarId: Number.isInteger(f.hogar_id) && f.hogar_id > 0 ? f.hogar_id : null, esOficina: f.rol === "oficina",
    puedeExpulsar: Number.isInteger(f.hogar_id) && f.hogar_id > 0 && f.rol !== "oficina",
  }));
}
/** ¿Se refresca solo? Solo con la sección Mundo a la vista y la pestaña visible. */
export const debeRefrescar = (seccionVisible, pestanaVisible) => seccionVisible === true && pestanaVisible === true;

// ---------------------------------------------------------------- OF14, escalón 3: salas (cerrar con aviso y silenciar)
// Solo lo que la api YA admite con la sesión de oficina (apps/api/src/presencia/voz_rutas.ts, puedeModerar = guía del evento o oficina; livekit-roles v7):
//   POST /api/presencia/guiadas/:evento/cerrar     { segundos? 5-60, 15 por omisión }   aviso, vuelta a la sala general y DeleteRoom
//   POST /api/presencia/guiadas/:evento/silenciar  {}                                    silencia a todos menos al guía (MutePublishedTrack)
// NO hay silenciar a UNA persona (la api solo silencia a todos y ni siquiera da a la oficina la identidad de LiveKit de cada conexión) ni cerrar las salas
// general y visita (no tienen voz ni evento; para sacar a alguien de ellas está «Expulsar»). Sin esas rutas aquí no se ofrece nada de eso.
export const AVISO_CIERRE = { min: 5, max: 60, defecto: 15 };
const CLAVE_GUIADA = /^guiada-([1-9][0-9]{0,9})$/;
/** `guiada-<n>` → n (número, como el evento de la agenda); cualquier otra sala → null. */
export function eventoDeSala(sala) { const g = CLAVE_GUIADA.exec(String(sala)); return g ? Number(g[1]) : null; }
/** Qué botones tiene una sala según lo que la api admite: solo las guiadas, y solo con gente dentro (sin gente la sala ni existe en LiveKit). */
export function accionesDeSala(sala, personas) {
  const evento = eventoDeSala(sala), hay = Number.isInteger(personas) && personas > 0;
  return { evento, voz: evento !== null, cerrar: evento !== null && hay, silenciar: evento !== null && hay };
}
/** Las filas de la tabla → las salas con su recuento. La general y la de la visita salen siempre (aunque estén a 0); las guiadas, solo si hay alguien. */
export function salasDeFilas(filas) {
  const cuenta = new Map([["general", 0], ["visita", 0]]);
  for (const f of filas || []) cuenta.set(f.salaClave, (cuenta.get(f.salaClave) || 0) + 1);
  const rango = c => (c === "general" ? -2 : c === "visita" ? -1 : eventoDeSala(c) ?? Number.MAX_SAFE_INTEGER);
  return [...cuenta].sort((a, b) => rango(a[0]) - rango(b[0]) || a[0].localeCompare(b[0])).map(([clave, personas]) => ({ clave, nombre: etiquetaSala(clave), personas, ...accionesDeSala(clave, personas) }));
}
/** «3 personas», «1 persona», «nadie». */
export const textoGente = n => (n === 1 ? "1 persona" : n > 1 ? n + " personas" : "nadie");
/** El aviso previo del cierre: entero entre 5 y 60 s; vacío = 15 s. Cuerpo de POST …/cerrar. */
export function cuerpoCierre(valor) {
  const t = String(valor == null ? "" : valor).trim();
  if (t === "") return { ok: true, cuerpo: { segundos: AVISO_CIERRE.defecto } };
  const n = /^[0-9]{1,3}$/.test(t) ? Number(t) : NaN;
  if (!Number.isInteger(n) || n < AVISO_CIERRE.min || n > AVISO_CIERRE.max) return { ok: false, error: "El aviso previo va de " + AVISO_CIERRE.min + " a " + AVISO_CIERRE.max + " segundos, en números enteros." };
  return { ok: true, cuerpo: { segundos: n } };
}
/** Lo que dice el diálogo de cerrar (decisión 155: se avisa y se vuelve a la sala general). */
export const textoCierre = personas => "Se avisará a " + (personas === 1 ? "la 1 persona" : "las " + personas + " personas") + " y volverán a la sala general. Las familias no podrán volver a entrar a esta visita hasta que acabe su horario; el guía y la oficina sí.";
export const textoSilencio = personas => "Se silenciará el micrófono de todos menos el del guía (" + textoGente(personas) + " en la sala). Nadie puede reactivarlo desde fuera: cada persona decide si lo vuelve a abrir.";
/** La respuesta de /cerrar o /silenciar → frase para el estado vivo. */
export function resultadoCierre(d, nombre) { return d && d.avisados === false ? nombre + ": cerrada; no había nadie a quien avisar." : nombre + ": avisadas las personas, se cierra en " + (d && d.segundos ? d.segundos : AVISO_CIERRE.defecto) + " segundos."; }
export function resultadoSilencio(d, nombre) {
  const n = d && Number.isInteger(d.pistas) ? d.pistas : 0;
  return nombre + ": " + (n === 0 ? "no había ningún micrófono abierto." : n === 1 ? "1 micrófono silenciado." : n + " micrófonos silenciados.") + (d && d.palabra_quitada ? " Se quitó la palabra." : "");
}
