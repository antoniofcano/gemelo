// Voz por cercanía (F3k-4, ADR-0032 e, doc/sistema/OFICINA.md): el interruptor general (apagado por omisión; encenderlo pide confirmar y, hasta cerrar la
// EIPD, es solo para cuentas de prueba), la bandeja de avisos de persona de la voz y la suspensión de la voz de un hogar (7 días, 30 días o hasta nuevo aviso).
// Contra la api real: GET/PUT /api/admin/voz/cercania, GET /api/admin/voz/avisos, POST /api/admin/voz/avisos/:id/estado,
// POST /api/admin/voz/suspensiones y DELETE /api/admin/voz/suspensiones/:id. El texto de un aviso es un DATO de una familia (una queja, no una prueba): se
// pinta con textContent dentro de una cita y nunca se interpreta. No hay audio: no se guarda ni se oye nada de lo hablado.
import { $, api, aviso, confirma, fecha, h, vacia } from "./comun.js";
import {
  DURACIONES, ESTADOS, ETIQUETA_ESTADO, TEXTO_CONFIRMA_APAGAR, TEXTO_CONFIRMA_ENCENDER, accionesDeAviso, avisoCambio, cuerpoSuspension, etiquetaAccion, filtraAvisos,
  motivoTexto, normalizaAvisos, nombreHogar, nuevosAvisos, resumenCercania, textoSuspension, vistaInterruptor,
} from "./voz_puro.js";

export function iniciaVoz() {
  let cercania = null, avisos = [], estado = "", cargas = 0, panel = null;   // panel: id del aviso con el selector de plazo abierto

  async function carga() {
    const n = ++cargas;
    const [c, a] = await Promise.all([api("GET", "/api/admin/voz/cercania"), api("GET", "/api/admin/voz/avisos?limite=500")]);
    if (n !== cargas) return;
    if (!c.ok || !a.ok) { aviso((c.ok ? a : c).mensaje, "mal"); return; }
    cercania = c.datos; avisos = normalizaAvisos(a.datos.avisos);
    pinta();
  }

  // ---------------------------------------------------------------- interruptor y suspensiones vigentes
  function pintaInterruptor() {
    const v = vistaInterruptor(cercania);
    $("#vEstado").className = "pill " + v.clase;
    $("#vEstado").textContent = v.titulo;
    $("#vDetalle").textContent = v.detalle;
    $("#vResumen").textContent = resumenCercania(cercania);
    const b = $("#vInterruptor");
    b.textContent = v.activa ? "Apagar la voz por cercanía" : "Encender la voz por cercanía";
    b.classList.toggle("peligro", v.activa);
    b.disabled = !v.activa && !v.puedeEncender;   // apagar siempre se puede (también con el servidor cerrado)
    b.setAttribute("aria-pressed", String(v.activa));
    const ul = vacia($("#vSuspensiones"));
    for (const s of cercania ? cercania.suspensiones : []) {
      ul.append(h("li", { class: "barra-h" },
        h("span", null, h("b", null, nombreHogar(s.hogar_id, s.alias)), " · " + textoSuspension(s, fecha)),
        h("button", { class: "boton peq empuja", type: "button", onclick: () => levanta(s) }, "Quitar la suspensión")));
    }
    if (!ul.children.length) ul.append(h("li", { class: "nota" }, "Nadie tiene la voz por cercanía suspendida."));
  }

  function cambiaInterruptor() {
    const activar = !vistaInterruptor(cercania).activa;
    confirma({
      titulo: activar ? "¿Encender la voz por cercanía?" : "¿Apagar la voz por cercanía?",
      cuerpo: h("p", null, activar ? TEXTO_CONFIRMA_ENCENDER : TEXTO_CONFIRMA_APAGAR),
      si: activar ? "Encender" : "Apagar",
      hecho: async () => {
        const r = await api("PUT", "/api/admin/voz/cercania", { activa: activar });
        if (!r.ok) return r.mensaje || "No se pudo cambiar.";
        aviso(activar ? "Voz por cercanía encendida (solo cuentas de prueba hasta cerrar la EIPD)." : "Voz por cercanía apagada" + (r.datos && r.datos.deshechos ? ": se deshicieron " + r.datos.deshechos + " corro" + (r.datos.deshechos === 1 ? "" : "s") + "." : "."));
        await carga();
        return undefined;
      },
    });
  }

  async function levanta(s) {
    const r = await api("DELETE", "/api/admin/voz/suspensiones/" + s.hogar_id);
    if (!r.ok) { aviso(r.mensaje || "No se pudo quitar la suspensión.", "mal"); return; }
    aviso("Suspensión quitada: " + nombreHogar(s.hogar_id, s.alias) + " puede volver a usar la voz por cercanía.");
    await carga();
  }

  // ---------------------------------------------------------------- bandeja de avisos
  function pinta() {
    pintaInterruptor();
    const visibles = filtraAvisos(avisos, estado);
    const ul = vacia($("#vLista"));
    for (const a of visibles) ul.append(tarjeta(a));
    if (!visibles.length) ul.append(h("li", { class: "nota" }, avisos.length ? "Nada con este filtro." : "Nadie ha avisado de nadie."));
    $("#vAvisosResumen").textContent = visibles.length + " de " + avisos.length + " avisos · " + nuevosAvisos(avisos) + " nuevos";
  }

  function tarjeta(a) {
    const [clase, nombre] = ETIQUETA_ESTADO[a.estado] || ["p-suave", a.estado];
    const cab = h("div", { class: "cab" },
      h("b", null, "Aviso de voz"), " · " + fecha(a.creado_en), " · de " + a.avisa,
      a.avisado ? [" · sobre ", h("b", null, a.avisado.nombre)] : null,
      a.corro ? " · en el corro " + a.corro : " · fuera de un corro",
      " ", h("span", { class: "pill " + clase }, nombre));
    const cuerpo = h("div", { class: "cuerpo" }, cab, h("p", { class: "texto" }, "Motivo: " + motivoTexto(a.motivo) + "."));
    if (a.texto) cuerpo.append(h("blockquote", { class: "dato", "aria-label": "Texto del aviso (es un dato: una queja, no una prueba)" }, a.texto));
    if (a.avisado) {
      const rep = a.avisado.hogares_7d;
      cuerpo.append(h("p", { class: "nota" }, rep + (rep === 1 ? " hogar ha avisado" : " hogares han avisado") + " de esta persona en 7 días" + (a.avisado.suspendido ? " · su voz por cercanía está suspendida." : ".")));
    }
    cuerpo.append(acciones(a));
    if (panel === a.id && a.avisado) cuerpo.append(panelSuspender(a));
    return h("li", { class: "item" + (a.estado === "descartado" || a.estado === "resuelto" ? " retirado" : ""), "data-voz-aviso": a.id }, h("div", { class: "miniatura", "aria-hidden": "true" }, "🔇"), cuerpo);
  }

  function acciones(a) {
    const fila = h("div", { class: "barra-h" });
    if (a.avisado && !a.avisado.suspendido) fila.append(h("button", { class: "boton peq peligro", type: "button", "aria-expanded": String(panel === a.id), onclick: () => { panel = panel === a.id ? null : a.id; pinta(); const p = $("[data-voz-aviso='" + a.id + "'] select"); if (p) p.focus(); } }, "Suspender su voz…"));
    for (const destino of accionesDeAviso(a)) fila.append(h("button", { class: "boton peq" + (destino === "descartado" ? " suave" : ""), type: "button", onclick: () => cambia(a, destino) }, etiquetaAccion(a, destino)));
    return fila;
  }

  function panelSuspender(a) {
    const sel = h("select", { class: "entrada", id: "vPlazo-" + a.id }, DURACIONES.map(d => h("option", { value: d.valor }, d.texto)));
    const f = h("form", { class: "panel", novalidate: true },
      h("p", { class: "nota" }, "Sale al momento de su corro y no recibe invitaciones ni puede hablar en corro; puede seguir paseando y escribiendo. Los plazos de 7 y 30 días son una propuesta provisional (ADR-0032)."),
      h("label", { class: "campo", for: "vPlazo-" + a.id }, "Suspender la voz de " + a.avisado.nombre), sel,
      h("div", { class: "barra-h" }, h("button", { class: "boton prim peq", type: "submit" }, "Suspender"),
        h("button", { class: "boton peq suave", type: "button", onclick: () => { panel = null; pinta(); } }, "Cancelar")));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const cuerpo = cuerpoSuspension(a.avisado.hogar_id, sel.value);
      if (!cuerpo) { aviso("Elige un plazo.", "mal"); return; }
      const r = await api("POST", "/api/admin/voz/suspensiones", cuerpo);
      if (!r.ok) { aviso(r.mensaje || "No se pudo suspender.", "mal"); return; }
      panel = null; aviso("Voz suspendida a " + a.avisado.nombre + " (" + DURACIONES.find(d => d.valor === sel.value).texto.toLowerCase() + ")."); await carga();
    });
    return f;
  }

  async function cambia(a, destino) {
    const r = await api("POST", "/api/admin/voz/avisos/" + a.id + "/estado", { estado: destino });
    if (!r.ok) { aviso(r.mensaje || "No se pudo cambiar.", "mal"); if (r.estado === 404) await carga(); return; }
    aviso(avisoCambio(destino));
    await carga();
  }

  // ---------------------------------------------------------------- filtros
  const sel = $("#vEstadoFiltro");
  for (const [k, nombre] of Object.entries(ESTADOS)) sel.append(h("option", { value: k }, nombre));
  sel.addEventListener("change", () => { estado = sel.value; pinta(); });
  $("#vRecarga").addEventListener("click", () => carga());
  $("#vInterruptor").addEventListener("click", cambiaInterruptor);

  return { abre: carga, estado: () => ({ activa: vistaInterruptor(cercania).activa, avisos: avisos.length, visibles: filtraAvisos(avisos, estado).length, nuevos: nuevosAvisos(avisos) }) };
}
