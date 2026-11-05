// Voz por cercanía (F3k-4, ADR-0032 e): las cuentas de la sección, sin DOM ni red, para probarlas con node. Interruptor general, bandeja de avisos de
// persona y suspensiones, contra GET/PUT /api/admin/voz/cercania, GET /api/admin/voz/avisos y POST/DELETE /api/admin/voz/suspensiones.
// El texto de un aviso lo escribe una familia: es un DATO y una queja, no una prueba de lo dicho (la pantalla lo pinta con textContent).

export const MOTIVOS = { insultos: "insultos", acoso: "acoso", contenido_sexual: "contenido sexual", parece_menor: "parece menor", otro: "otro motivo" };
export const ESTADOS = { "": "Pendientes", nuevo: "Nuevos", visto: "Vistos", resuelto: "Resueltos", descartado: "Descartados", todo: "Todos" };
export const ABIERTOS = ["nuevo", "visto"];
export const ETIQUETA_ESTADO = { nuevo: ["p-aviso", "nuevo"], visto: ["p-suave", "visto"], resuelto: ["p-ok", "resuelto"], descartado: ["p-suave", "descartado"] };
/** Los plazos de suspensión que admite la api (7 y 30 días son PROPUESTA provisional del ADR-0032; null = hasta nuevo aviso). */
export const DURACIONES = [{ valor: "7", dias: 7, texto: "7 días" }, { valor: "30", dias: 30, texto: "30 días" }, { valor: "indef", dias: null, texto: "Hasta nuevo aviso" }];
export const TEXTO_CONFIRMA_ENCENDER = "La voz por cercanía se activará para las cuentas que la tengan marcada; hasta cerrar la EIPD, solo cuentas de prueba.";
export const TEXTO_CONFIRMA_APAGAR = "Apagarla deshace ahora mismo todos los corros que haya: quien esté hablando dejará de oírse con los demás.";

/** Cómo se nombra a un hogar en la oficina: su alias, o un nombre neutro con el id interno (nunca el correo). */
export const nombreHogar = (hogar_id, alias) => (alias && String(alias).trim() ? String(alias).trim() : "Cuenta n.º " + hogar_id);

/** El estado del interruptor para la pantalla: { clase, titulo, detalle, puedeEncender, activa }. `c` es la respuesta de GET /api/admin/voz/cercania. */
export function vistaInterruptor(c) {
  if (!c) return { clase: "p-suave", titulo: "Sin datos", detalle: "No se pudo leer el estado.", puedeEncender: false, activa: false };
  const activa = !!(c.interruptor && c.interruptor.activa);
  if (!c.presencia) return { clase: "p-mal", titulo: "No disponible", detalle: "Este servidor no tiene la visita compartida (LiveKit) configurada: no hay voz por cercanía.", puedeEncender: false, activa };
  if (!c.permitida) return { clase: "p-mal", titulo: activa ? "Encendida, pero el servidor no la permite" : "Apagada: el servidor no la permite", detalle: "El tope del entorno (GEMELO_VOZ_CERCANIA=no) la mantiene cerrada: no se puede encender desde aquí.", puedeEncender: false, activa };
  return {
    clase: activa ? "p-ok" : "p-suave", titulo: activa ? "Encendida" : "Apagada",
    detalle: activa ? "Cada cuenta que la tenga marcada (y haya aceptado su aviso) puede hablar en corro. Hasta cerrar la EIPD, solo cuentas de prueba." : "Nadie puede hablar en corro. Encenderla no la abre a todos: cada cuenta la activa en su ajuste tras aceptar el aviso.",
    puedeEncender: true, activa,
  };
}
/** La línea de datos de la tarjeta: corros y hogares ahora, avisos nuevos y suspensiones vigentes. */
export function resumenCercania(c) {
  if (!c) return "";
  const n = (x, uno, varios) => x + " " + (x === 1 ? uno : varios);
  return n(c.corros, "corro", "corros") + " · " + n(c.hogares, "hogar", "hogares") + " ahora · " + n(c.avisos_nuevos, "aviso nuevo", "avisos nuevos") + " · " + n((c.suspensiones || []).length, "suspensión vigente", "suspensiones vigentes");
}

/** Los avisos, tal cual los da la api, más el nombre ya resuelto (si quien avisa ya no existe, se dice). Los más nuevos primero. */
export function normalizaAvisos(avisos) {
  return (avisos || []).map(a => ({
    id: a.id, estado: a.estado, motivo: a.motivo, texto: a.texto || "", corro: a.corro || null, creado_en: a.creado_en, decidido_en: a.decidido_en || null,
    avisa: a.avisa ? nombreHogar(a.avisa.hogar_id, a.avisa.alias) : "una cuenta que ya no existe",
    avisado: a.avisado ? { hogar_id: a.avisado.hogar_id, nombre: nombreHogar(a.avisado.hogar_id, a.avisado.alias), hogares_7d: a.avisado.hogares_7d || 0, suspendido: !!a.avisado.suspendido } : null,
  })).sort((x, y) => y.id - x.id);
}
export function pasaEstado(a, estado) {
  if (!estado) return ABIERTOS.includes(a.estado);
  if (estado === "todo") return true;
  return a.estado === estado;
}
export const filtraAvisos = (lista, estado) => lista.filter(a => pasaEstado(a, estado));
export const nuevosAvisos = lista => lista.filter(a => a.estado === "nuevo").length;
export const motivoTexto = m => MOTIVOS[m] || "otro motivo";

/** Los estados a los que se puede pasar un aviso (la api admite visto, resuelto y descartado; reabrir = volver a «visto»). */
export function accionesDeAviso(a) {
  if (a.estado === "nuevo") return ["visto", "resuelto", "descartado"];
  if (a.estado === "visto") return ["resuelto", "descartado"];
  return ["visto"];
}
const VERBO_ESTADO = { visto: "Marcar como visto", resuelto: "Dar por resuelto", descartado: "Descartar", reabrir: "Reabrir" };
export const etiquetaAccion = (a, destino) => (destino === "visto" && a.estado !== "nuevo" ? VERBO_ESTADO.reabrir : VERBO_ESTADO[destino]);
export const avisoCambio = destino => ({ visto: "Marcado como visto.", resuelto: "Aviso dado por resuelto.", descartado: "Aviso descartado." }[destino] || "Hecho.");

/** El cuerpo de POST /api/admin/voz/suspensiones a partir del plazo elegido; null si no vale. */
export function cuerpoSuspension(hogar_id, valor) {
  const d = DURACIONES.find(x => x.valor === valor);
  if (!d || !Number.isInteger(hogar_id) || hogar_id < 1) return null;
  return { hogar_id, dias: d.dias };
}
/** «hasta el 12/11/2026», «hasta nuevo aviso»; `automatica`: la puso el sistema (3 hogares distintos en 7 días) y espera revisión. */
export function textoSuspension(s, formato) {
  const hasta = s.hasta ? "hasta el " + (formato ? formato(s.hasta) : s.hasta) : "hasta nuevo aviso";
  return hasta + (s.automatica ? " (automática: a la espera de que la revise una persona)" : "");
}
/** Cuántos avisos de voz sin mirar trae el resumen de la bandeja (GET /api/admin/bandeja/resumen → nuevas.aviso_voz). */
export const avisosVozDelResumen = r => (r && r.nuevas && Number.isInteger(r.nuevas.aviso_voz) ? r.nuevas.aviso_voz : 0);
export const textoAvisosVoz = n => n + " aviso" + (n === 1 ? "" : "s") + " de voz sin mirar";
