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
export function etiquetaFamilia(f) { return (f.alias || f.nombre_interno || "sin alias") + " · " + f.correo; }
