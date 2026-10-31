// Agenda (OF11): las cuentas de la sección, sin DOM ni red, para probarlas con node. Convierte lo que se escribe en el formulario (fechas locales de
// <input type="datetime-local">) en el cuerpo que espera la api y vuelve; clasifica los eventos (próximos, pasados, cancelados) y los agrupa por mes.

export const TIPOS = { guiada: "Visita guiada", libre: "Visita libre", recoleccion: "Cosecha abierta", cata: "Cata", taller: "Taller", directo: "Directo", evento: "Otro evento" };
export const ESTADOS = { borrador: "Borrador", abierta: "Inscripción abierta", cerrada: "Inscripción cerrada", cancelada: "Cancelado" };
export const FILTROS = { proximos: "Próximos", pasados: "Pasados", cancelados: "Cancelados", todos: "Todos" };
export const ETIQUETA_INSCRITO = { apuntado: "apuntado", en_espera: "en espera", anulado: "se borró" };
export const MAX_PERSONAS_HOGAR = 10;

const dos = n => String(n).padStart(2, "0");

/** Instante ISO → valor de <input type="datetime-local"> en la hora local ("" si no hay). */
export function aCampoLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()) + "T" + dos(d.getHours()) + ":" + dos(d.getMinutes());
}

/** Valor de <input type="datetime-local"> (hora local) → instante ISO en UTC; null si está vacío o no es una fecha. */
export function deCampoLocal(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Valida el formulario y devuelve { ok: true, cuerpo } o { ok: false, error } (un texto para la persona). `v` son los valores en bruto
 * (texto de los campos); `ahora` (ms) se pasa para poder probarlo. Una cadena vacía es «sin valor» (null en la api).
 */
export function cuerpoDeFormulario(v, ahora, esNuevo) {
  const titulo = String(v.titulo || "").trim().replace(/\s+/g, " ");
  if (!titulo) return { ok: false, error: "Hace falta un título." };
  if (titulo.length > 120) return { ok: false, error: "El título tiene como mucho 120 letras." };
  if (!Object.prototype.hasOwnProperty.call(TIPOS, v.tipo)) return { ok: false, error: "Elige el tipo de evento." };
  const empieza = deCampoLocal(v.empieza_en);
  if (!empieza) return { ok: false, error: "Pon cuándo empieza." };
  if (esNuevo && Date.parse(empieza) <= ahora) return { ok: false, error: "El evento tiene que empezar en el futuro." };
  const termina = v.termina_en ? deCampoLocal(v.termina_en) : null;
  if (v.termina_en && !termina) return { ok: false, error: "La hora de fin no es válida." };
  if (termina && Date.parse(termina) <= Date.parse(empieza)) return { ok: false, error: "Tiene que acabar después de empezar." };
  const hasta = v.inscripcion_hasta ? deCampoLocal(v.inscripcion_hasta) : null;
  if (v.inscripcion_hasta && !hasta) return { ok: false, error: "El fin del plazo de inscripción no es válido." };
  if (hasta && Date.parse(hasta) > Date.parse(empieza)) return { ok: false, error: "El plazo de inscripción no puede acabar después de empezar el evento." };
  let plazas = null;
  if (String(v.plazas || "").trim() !== "") {
    plazas = Number(v.plazas);
    if (!Number.isInteger(plazas) || plazas < 1 || plazas > 5000) return { ok: false, error: "El aforo es un número de personas entre 1 y 5000 (vacío: sin aforo)." };
  }
  const lugar = String(v.lugar || "").trim();
  if (lugar.length > 120) return { ok: false, error: "El lugar tiene como mucho 120 letras." };
  const descripcion = String(v.descripcion || "").trim();
  if (descripcion.length > 2000) return { ok: false, error: "La descripción tiene como mucho 2000 letras." };
  if (!["borrador", "abierta", "cerrada"].includes(v.estado)) return { ok: false, error: "Elige el estado de la inscripción." };
  return {
    ok: true,
    cuerpo: {
      titulo, tipo: v.tipo, empieza_en: empieza, termina_en: termina, plazas, inscripcion_hasta: hasta, lugar: lugar || null, descripcion: descripcion || null,
      presencial: !!v.presencial, estado: v.estado,
    },
  };
}

/** Clasifica y filtra (la lista de la api viene de la más lejana a la más cercana; aquí se ordena como se lee). */
export function filtra(eventos, filtro, ahora) {
  const t = e => Date.parse(e.empieza_en);
  const futuro = e => t(e) > ahora;
  const sel = eventos.filter(e => {
    if (filtro === "todos") return true;
    if (filtro === "cancelados") return e.estado === "cancelada";
    if (e.estado === "cancelada") return false;
    return filtro === "pasados" ? !futuro(e) : futuro(e);
  });
  return sel.sort((a, b) => (filtro === "pasados" || filtro === "todos" ? t(b) - t(a) : t(a) - t(b)));
}

export function cuentaPorFiltro(eventos, ahora) {
  return { proximos: filtra(eventos, "proximos", ahora).length, pasados: filtra(eventos, "pasados", ahora).length, cancelados: filtra(eventos, "cancelados", ahora).length, todos: eventos.length };
}

/** Agrupa ya ordenados por mes («octubre de 2026»), conservando el orden. */
export function agrupaPorMes(eventos) {
  const grupos = [];
  for (const e of eventos) {
    const d = new Date(e.empieza_en);
    const clave = d.getFullYear() + "-" + dos(d.getMonth() + 1);
    let g = grupos[grupos.length - 1];
    if (!g || g.clave !== clave) { g = { clave, titulo: d.toLocaleDateString("es-ES", { month: "long", year: "numeric" }), eventos: [] }; grupos.push(g); }
    g.eventos.push(e);
  }
  return grupos;
}

/** «6 de 10 plazas · 2 en espera», «sin aforo · 3 familias». Las plazas son PERSONAS. */
export function resumenPlazas(e) {
  const espera = e.en_espera ? " · " + e.en_espera + (e.en_espera === 1 ? " familia en espera" : " familias en espera") : "";
  if (e.plazas === null) return "sin aforo · " + e.hogares + (e.hogares === 1 ? " familia" : " familias") + " (" + e.apuntadas + (e.apuntadas === 1 ? " persona" : " personas") + ")" + espera;
  return e.apuntadas + " de " + e.plazas + " plazas (personas) · " + e.hogares + (e.hogares === 1 ? " familia" : " familias") + espera + (e.plazas_libres === 0 ? " · completo" : "");
}

/** El aviso que sale tras avisar: cuántos, cuántos omitidos por el tope semanal y cuántos correos quedan pendientes (hoy no salen). */
export function textoDeAviso(r) {
  if (!r.enviados && !r.omitidos_por_tope) return "No hay a quién avisar: nadie está apuntado o en espera.";
  if (!r.enviados) return "Nadie recibió el aviso: " + r.omitidos_por_tope + " familia" + (r.omitidos_por_tope === 1 ? "" : "s") + " ya ha llegado al tope de avisos de esta semana.";
  return "Aviso enviado a " + r.enviados + " familia" + (r.enviados === 1 ? "" : "s") + " en el gemelo" + (r.omitidos_por_tope ? " (" + r.omitidos_por_tope + " omitida" + (r.omitidos_por_tope === 1 ? "" : "s") + " por el tope semanal)" : "")
    + (r.correo_pendiente ? ". El correo todavía no sale: " + r.correo_pendiente + " familia" + (r.correo_pendiente === 1 ? " lo" : "s lo") + " pidió y queda registrado." : ".");
}
