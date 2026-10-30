// Agenda (OF11, doc/sistema/OFICINA.md §7): los eventos con aforo (visitas, cosechas abiertas, catas, talleres, directos), sus inscripciones por familia,
// la lista de espera y los avisos. Contra la api real: GET/POST/PUT /api/admin/eventos, /cancelar, /inscritos y /avisar. El aforo cuenta PERSONAS; la
// espera pasa a apuntados sola cuando se libera una plaza (lo hace la api). Los textos del evento los escribe la oficina; los alias de las familias son
// DATOS: todo se pinta con textContent. Hoy NO sale correo: los avisos llegan a la campana del gemelo (la api dice cuántos correos quedan pendientes).
import { $, api, aviso, confirma, fecha, h, vacia } from "./comun.js";
import { ESTADOS, ETIQUETA_INSCRITO, FILTROS, TIPOS, agrupaPorMes, aCampoLocal, cuentaPorFiltro, cuerpoDeFormulario, filtra, resumenPlazas, textoDeAviso } from "./agenda_puro.js";

const ICONO = { guiada: "🚶", libre: "🌿", recoleccion: "🫒", cata: "🥄", taller: "🛠️", directo: "🎙️", evento: "📅" };
const PILL = { borrador: "p-suave", abierta: "p-ok", cerrada: "p-aviso", cancelada: "p-mal" };

export function iniciaAgenda({ sesion }) {
  let lista = [], filtro = "proximos", cargas = 0, panel = null;   // panel: { id, modo: "inscritos" | "avisar", datos? }
  const porId = id => lista.find(e => e.id === id);

  // ---------------------------------------------------------------- carga
  async function carga() {
    const n = ++cargas;
    const r = await api("GET", "/api/admin/eventos?limite=500");
    if (n !== cargas) return;
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    lista = r.datos.eventos;
    pinta();
  }

  // ---------------------------------------------------------------- pintado
  function pinta() {
    const ahora = Date.now(), cuenta = cuentaPorFiltro(lista, ahora);
    const filtros = vacia($("#aFiltros"));
    for (const [k, nombre] of Object.entries(FILTROS)) filtros.append(h("button", { class: "boton", type: "button", "data-filtro": k, "aria-pressed": String(filtro === k) }, nombre + " (" + cuenta[k] + ")"));
    const visibles = filtra(lista, filtro, ahora), ul = vacia($("#aLista"));
    for (const g of agrupaPorMes(visibles)) {
      ul.append(h("li", { class: "mes" }, h("h3", null, g.titulo)));
      for (const e of g.eventos) ul.append(tarjeta(e));
    }
    if (!visibles.length) ul.append(h("li", { class: "nota" }, lista.length ? "Nada con este filtro." : "Todavía no hay eventos. Crea el primero con «Nuevo evento»."));
    $("#aResumen").textContent = visibles.length + " de " + lista.length + " eventos";
  }

  function tarjeta(e) {
    const cancelado = e.estado === "cancelada", pasado = Date.parse(e.empieza_en) <= Date.now();
    const cab = h("div", { class: "cab" }, h("b", null, TIPOS[e.tipo] || e.tipo), " · " + fecha(e.empieza_en) + (e.termina_en ? " – " + fecha(e.termina_en) : ""),
      e.lugar ? " · " + e.lugar : null, e.haza ? " · haza " + e.haza.codigo : null, e.presencial ? " · presencial" : " · en el mundo", " ",
      h("span", { class: "pill " + (PILL[e.estado] || "p-suave") }, pasado && !cancelado ? "ya empezó" : ESTADOS[e.estado] || e.estado));
    const cuerpo = h("div", { class: "cuerpo" }, h("p", { class: "texto" }, h("b", null, e.titulo)), cab);
    if (e.descripcion) cuerpo.append(h("p", { class: "nota" }, e.descripcion));
    cuerpo.append(h("p", { class: "nota" }, resumenPlazas(e) + (e.inscripcion_hasta ? " · inscripción hasta " + fecha(e.inscripcion_hasta) : "")));
    cuerpo.append(acciones(e, cancelado, pasado));
    if (panel && panel.id === e.id) cuerpo.append(panel.modo === "inscritos" ? panelInscritos(e) : panelAvisar(e));
    return h("li", { class: "item" + (cancelado ? " retirado" : ""), "data-evento": e.id }, h("div", { class: "miniatura", "aria-hidden": "true" }, ICONO[e.tipo] || "📅"), cuerpo);
  }

  function acciones(e, cancelado, pasado) {
    const b = (texto, accion, extra) => h("button", { class: "boton peq" + (extra ? " " + extra : ""), type: "button", onclick: accion }, texto);
    const fila = h("div", { class: "barra-h" });
    fila.append(b("Ver inscritos", () => abre(e, "inscritos")));
    if (!cancelado) {
      if (!pasado) fila.append(b("Avisar…", () => abre(e, "avisar")));
      fila.append(b("Editar", () => formulario(e)));
      fila.append(b("Duplicar", () => formulario(e, true)));
      if (!pasado) fila.append(b("Cancelar evento", () => cancela(e), "peligro"));
    } else fila.append(b("Duplicar", () => formulario(e, true)));
    return fila;
  }

  async function abre(e, modo) {
    if (panel && panel.id === e.id && panel.modo === modo) { panel = null; pinta(); return; }
    panel = { id: e.id, modo, datos: null };
    if (modo === "inscritos") {
      const r = await api("GET", "/api/admin/eventos/" + e.id + "/inscritos");
      if (!r.ok) { aviso(r.mensaje, "mal"); panel = null; return; }
      panel.datos = r.datos;
    }
    pinta();
    const donde = $("[data-evento='" + e.id + "'] .panel");
    const primero = donde && donde.querySelector("textarea, input");
    if (primero) primero.focus();
  }

  // ---------------------------------------------------------------- inscritos (alias o nombre interno y hazas; nunca el correo)
  function panelInscritos(e) {
    const d = panel.datos;
    const cuerpo = h("div", { class: "panel" });
    if (!d || !d.inscritos.length) { cuerpo.append(h("p", { class: "nota" }, "Nadie se ha apuntado todavía.")); return cuerpo; }
    const filas = d.inscritos.map(i => h("tr", null,
      h("td", null, i.nombre_interno || i.alias || "Familia " + i.hogar_id, i.de_baja ? " (de baja)" : ""),
      h("td", null, i.hazas.length ? i.hazas.join(", ") : "—"), h("td", null, String(i.personas)),
      h("td", null, h("span", { class: "pill " + (i.estado === "apuntado" ? "p-ok" : i.estado === "en_espera" ? "p-aviso" : "p-suave") }, ETIQUETA_INSCRITO[i.estado] || i.estado), i.promovida_en ? " (pasó de la espera el " + fecha(i.promovida_en) + ")" : null),
      h("td", null, fecha(i.estado === "anulado" ? i.anulado_en : i.apuntado_en))));
    cuerpo.append(h("div", { class: "tabla-env" }, h("table", { "aria-label": "Inscritos en «" + e.titulo + "»" },
      h("thead", null, h("tr", null, ["Familia", "Hazas", "Personas", "Estado", "Cuándo"].map(t => h("th", { scope: "col" }, t)))), h("tbody", null, filas))));
    cuerpo.append(h("p", { class: "nota" }, "Solo la familia y sus hazas; el correo no se enseña. La espera pasa a apuntados sola, por orden, cuando alguien se borra o se sube el aforo."));
    return cuerpo;
  }

  // ---------------------------------------------------------------- avisar
  function panelAvisar(e) {
    const titulo = h("input", { class: "entrada", maxlength: "120", id: "avt-" + e.id, value: "Sobre «" + e.titulo.slice(0, 80) + "»", autocomplete: "off" });
    const texto = h("textarea", { maxlength: "2000", rows: "3", id: "avx-" + e.id });
    const a = h("select", { class: "entrada", id: "ava-" + e.id }, h("option", { value: "todos" }, "Apuntados y en espera"), h("option", { value: "apuntados" }, "Solo apuntados"), h("option", { value: "espera" }, "Solo la lista de espera"));
    const f = h("form", { class: "panel", novalidate: true },
      h("p", { class: "nota" }, "Le llega a cada familia como un aviso en el gemelo. Tope: 3 avisos de la oficina por familia y semana. El correo todavía no sale (queda registrado quién lo pidió)."),
      h("label", { class: "campo", for: "ava-" + e.id }, "A quién"), a,
      h("label", { class: "campo", for: "avt-" + e.id }, "Título"), titulo,
      h("label", { class: "campo", for: "avx-" + e.id }, "Texto (opcional; si lo dejas vacío va la fecha del evento)"), texto,
      h("div", { class: "barra-h" }, h("button", { class: "boton prim peq", type: "submit" }, "Enviar aviso"),
        h("button", { class: "boton peq suave", type: "button", onclick: () => { panel = null; pinta(); } }, "Cancelar")));
    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      const t = titulo.value.trim();
      if (!t) { aviso("Escribe el título del aviso.", "mal"); titulo.focus(); return; }
      const cuerpo = { titulo: t, a: a.value };
      if (texto.value.trim()) cuerpo.texto = texto.value.trim();
      const r = await api("POST", "/api/admin/eventos/" + e.id + "/avisar", cuerpo);
      if (!r.ok) { aviso(r.mensaje || "No se pudo avisar.", "mal"); return; }
      panel = null; aviso(textoDeAviso(r.datos)); pinta();
    });
    return f;
  }

  // ---------------------------------------------------------------- cancelar
  function cancela(e) {
    confirma({
      titulo: "Cancelar el evento",
      cuerpo: [h("p", null, "Vas a cancelar «" + e.titulo + "». Las " + (e.hogares + e.en_espera) + " familias apuntadas o en espera recibirán un aviso en el gemelo. No se puede deshacer."), h("p", { class: "nota" }, "Para solo cambiar la fecha o el lugar, edítalo y avisa a quien esté apuntado.")],
      si: "Cancelar el evento",
      hecho: async () => {
        const r = await api("POST", "/api/admin/eventos/" + e.id + "/cancelar", {});
        if (!r.ok) return r.mensaje;
        aviso("Evento cancelado y familias avisadas."); await carga();
      },
    });
  }

  // ---------------------------------------------------------------- crear, editar y duplicar
  let editando = null;   // null = nuevo; si no, el evento que se edita
  function formulario(e, duplicar) {
    editando = e && !duplicar ? e : null;
    $("#dlgEventoT").textContent = editando ? "Editar el evento" : duplicar ? "Duplicar el evento" : "Nuevo evento";
    $("#evTitulo").value = e ? e.titulo + (duplicar ? " (copia)" : "") : "";
    $("#evTipo").value = e ? e.tipo : "guiada";
    $("#evEmpieza").value = e && !duplicar ? aCampoLocal(e.empieza_en) : "";
    $("#evTermina").value = e && !duplicar ? aCampoLocal(e.termina_en) : "";
    $("#evHasta").value = e && !duplicar ? aCampoLocal(e.inscripcion_hasta) : "";
    $("#evPlazas").value = e && e.plazas ? String(e.plazas) : "";
    $("#evLugar").value = e && e.lugar ? e.lugar : "";
    $("#evDescripcion").value = e && e.descripcion ? e.descripcion : "";
    $("#evPresencial").checked = !!(e && e.presencial);
    $("#evEstado").value = e && !duplicar && e.estado !== "cancelada" ? e.estado : "abierta";
    $("#evError").textContent = "";
    $("#dlgEvento").showModal();
    $("#evTitulo").focus();
  }

  $("#fEvento").addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = cuerpoDeFormulario({
      titulo: $("#evTitulo").value, tipo: $("#evTipo").value, empieza_en: $("#evEmpieza").value, termina_en: $("#evTermina").value, inscripcion_hasta: $("#evHasta").value,
      plazas: $("#evPlazas").value, lugar: $("#evLugar").value, descripcion: $("#evDescripcion").value, presencial: $("#evPresencial").checked, estado: $("#evEstado").value,
    }, Date.now(), !editando);
    if (!v.ok) { $("#evError").textContent = v.error; return; }
    $("#evOk").disabled = true;
    const r = editando ? await api("PUT", "/api/admin/eventos/" + editando.id, v.cuerpo) : await api("POST", "/api/admin/eventos", v.cuerpo);
    $("#evOk").disabled = false;
    if (!r.ok) { $("#evError").textContent = r.mensaje; return; }
    $("#dlgEvento").close();
    if (editando) {
      const d = r.datos || {};
      aviso("Evento guardado." + (d.promovidos ? " " + d.promovidos + " familia" + (d.promovidos === 1 ? "" : "s") + " pasó de la espera a apuntada." : "") + (d.con_inscritos ? " Hay " + d.con_inscritos + " familias inscritas: si cambió la fecha o el lugar, avísalas." : ""));
    } else aviso("Evento creado.");
    await carga();
  });
  $("#evCancela").addEventListener("click", () => $("#dlgEvento").close());
  $("#bEventoNuevo").addEventListener("click", () => formulario(null));
  $("#aRecarga").addEventListener("click", carga);
  $("#aFiltros").addEventListener("click", ev => { const b = ev.target.closest("button[data-filtro]"); if (b) { filtro = b.dataset.filtro; panel = null; pinta(); } });
  for (const [k, nombre] of Object.entries(TIPOS)) $("#evTipo").append(h("option", { value: k }, nombre));

  return { abre: carga, estado: () => ({ eventos: lista.length, filtro, rol: sesion.rol }) };
}
