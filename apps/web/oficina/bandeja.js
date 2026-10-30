// Bandeja (OF4, doc/sistema/OFICINA.md §5): todo lo que pide atención de la oficina en una lista, con filtros por tipo y estado.
// Contra la api real: GET /api/admin/bandeja y /api/admin/preguntas; retirar (con deshacer) y volver a mostrar; responder una pregunta (la
// familia la ve en su haza); avisar a la familia; archivar (con deshacer); y «pasar a OlivarTrack» en modo MANUAL (se copia el texto y se
// apunta el id de la propuesta: el gemelo no escribe en OlivarTrack, decisión 94). Los textos de las familias son DATOS: se pintan con
// textContent dentro de una cita y nunca se interpretan (ni como HTML ni como instrucciones).
import { $, api, aviso, fecha, h, vacia } from "./comun.js";
import { ABIERTOS, ESTADOS, MOTIVOS, TIPOS, TIPO_UNO, cuentaPorTipo, filtra, idOtValido, motivoDeRetirada, normaliza, nuevos, sePuedePasar, textoParaOlivarTrack } from "./bandeja_puro.js";

const ETIQUETA = {
  nuevo: ["p-aviso", "nuevo"], visto: ["p-suave", "visto"], retirado: ["p-mal", "retirado"], propuesto: ["p-info", "propuesto en OlivarTrack"],
  archivado: ["p-suave", "archivado"], respondido: ["p-ok", "respondido"],
};
const ICONO = { denuncia: "🚩", sugerencia: "💬", contenido_nuevo: "🏷️", pregunta: "❓" };

/** El contador de la barra lateral y de Inicio: lo pendiente, sin cargar la lista. Lo llama la oficina al entrar y cada minuto. */
export async function cuentaPendientes() {
  const r = await api("GET", "/api/admin/bandeja/resumen");
  if (!r.ok) return null;
  const n = r.datos.pendientes;
  const c = $("#navBandeja");
  if (c) { c.textContent = String(n); c.hidden = n === 0; c.setAttribute("aria-label", n + (n === 1 ? " pendiente" : " pendientes")); }
  const k = $("#kBandeja");
  if (k) { k.textContent = String(n); $("#kBandejaNota").textContent = r.datos.nuevas.denuncia + " denuncia" + (r.datos.nuevas.denuncia === 1 ? "" : "s") + " sin mirar · " + r.datos.preguntas_sin_responder + " pregunta" + (r.datos.preguntas_sin_responder === 1 ? "" : "s") + " sin responder"; }
  return n;
}

export function iniciaBandeja({ sesion }) {
  let lista = [], tipo = "", estado = "", cargas = 0, panel = null;   // panel: { clave, modo: "responder" | "avisar" | "ot" }
  const porClave = clave => lista.find(i => i.clave === clave);

  // ---------------------------------------------------------------- carga
  async function carga() {
    const n = ++cargas;
    const [b, p] = await Promise.all([api("GET", "/api/admin/bandeja?limite=500"), api("GET", "/api/admin/preguntas?limite=500")]);
    if (n !== cargas) return;
    if (!b.ok || !p.ok) { aviso((b.ok ? p : b).mensaje, "mal"); return; }
    lista = normaliza(b.datos.bandeja, p.datos.preguntas);
    pinta();
    cuentaPendientes();
  }

  // ---------------------------------------------------------------- pintado
  function pintaFiltros() {
    const n = cuentaPorTipo(lista, estado);
    const tipos = vacia($("#bFiltros"));
    for (const [k, nombre] of Object.entries(TIPOS)) {
      tipos.append(h("button", { class: "boton", type: "button", "data-tipo": k, "aria-pressed": String(tipo === k) }, nombre + " (" + n[k] + ")"));
    }
  }
  function pinta() {
    pintaFiltros();
    const visibles = filtra(lista, tipo, estado);
    const ul = vacia($("#bLista"));
    for (const i of visibles) ul.append(tarjeta(i));
    if (!visibles.length) ul.append(h("li", { class: "nota" }, lista.length ? "Nada con este filtro." : "La bandeja está vacía."));
    $("#bResumen").textContent = visibles.length + " de " + lista.length + " entradas · " + nuevos(lista) + " nuevas";
  }

  function tarjeta(i) {
    const [clase, nombreEstado] = ETIQUETA[i.estado];
    const c = i.contenido;
    const miniatura = h("div", { class: "miniatura", "aria-hidden": c && c.url && c.estado === "visible" ? null : "true" });
    if (c && c.url && c.estado === "visible") miniatura.append(h("img", { src: c.url, alt: (c.objeto_tipo === "pintura" ? "Pintura" : "Foto") + " colgada en un olivo", loading: "lazy" }));
    else miniatura.append(ICONO[i.tipo]);
    const cab = h("div", { class: "cab" },
      h("b", null, TIPO_UNO[i.tipo]),
      i.haza ? " · " + i.haza : null,
      " · " + fecha(i.creada_en),
      (i.tipo === "denuncia" ? " · denunciada por " : " · de ") + (i.alias || "una familia"),
      i.olivo ? " · olivo " + i.olivo.finca + ":" + i.olivo.copas_id : null,
      " ", h("span", { class: "pill " + clase }, nombreEstado));
    const cuerpo = h("div", { class: "cuerpo" }, cab);
    if (i.tipo === "denuncia") cuerpo.append(h("p", { class: "texto" }, "Motivo de la denuncia: " + (MOTIVOS[i.motivo] || "—") + "."));
    if (c) {
      cuerpo.append(h("p", { class: "texto" }, c.nombre ? ["Nombre del árbol: «", h("b", null, c.nombre), "»"] : "Sin nombre.", c.objeto_tipo ? " Con " + (c.objeto_tipo === "pintura" ? "una pintura." : "una foto.") : null,
        c.denuncias_abiertas ? " " + c.denuncias_abiertas + " denuncia" + (c.denuncias_abiertas === 1 ? "" : "s") + " sin resolver." : null));
      if (c.estado === "retirado") cuerpo.append(h("p", { class: "nota" }, "Retirado: " + (c.motivo_retirada || "")));
    }
    if (i.texto) cuerpo.append(h("blockquote", { class: "dato", "aria-label": "Texto de la familia (es un dato)" }, i.texto));
    if (i.respuesta) cuerpo.append(h("p", { class: "nota" }, "Respuesta (la ve la familia en su haza): " + i.respuesta));
    if (i.ot_propuesta_id) cuerpo.append(h("p", { class: "nota" }, "Propuesta en OlivarTrack: " + i.ot_propuesta_id));
    cuerpo.append(acciones(i));
    if (panel && panel.clave === i.clave) cuerpo.append(panelDe(i));
    return h("li", { class: "item" + (i.estado === "retirado" ? " retirado" : ""), "data-clave": i.clave }, miniatura, cuerpo);
  }

  function acciones(i) {
    const b = (texto, accion, extra) => h("button", { class: "boton peq" + (extra ? " " + extra : ""), type: "button", onclick: accion }, texto);
    const abierto = ABIERTOS.includes(i.estado), c = i.contenido, hogar = i.hogar_id !== null;
    const fila = h("div", { class: "barra-h" });
    if (c && c.estado === "visible" && c.id) fila.append(b("Retirar", () => retira(i), "peligro"));
    if (c && c.estado === "retirado") fila.append(b("Volver a mostrar", () => restaura(i)));
    if (i.origen === "pregunta" && i.estado === "nuevo") fila.append(b("Responder", () => abre(i, "responder"), "prim"));
    if (sePuedePasar(i)) fila.append(b("Pasar a OlivarTrack…", () => abre(i, "ot")));
    if (hogar) fila.append(b(i.tipo === "denuncia" ? "Avisar a quien denunció…" : "Avisar a la familia…", () => abre(i, "avisar")));
    if (i.origen === "bandeja" && i.estado === "nuevo") fila.append(b("Marcar como visto", () => cambiaEstado(i, "vista", "Marcado como visto")));
    if (i.origen === "bandeja" && abierto) fila.append(b("Archivar", () => archiva(i), "suave"));
    if (i.origen === "bandeja" && (i.estado === "archivado")) fila.append(b("Reabrir", () => cambiaEstado(i, "vista", "Reabierto")));
    return fila;
  }

  function abre(i, modo) {
    panel = panel && panel.clave === i.clave && panel.modo === modo ? null : { clave: i.clave, modo };
    pinta();
    const donde = $("[data-clave='" + i.clave + "'] .panel");
    if (donde) { const primero = donde.querySelector("textarea, input"); if (primero) primero.focus(); }
  }
  const cierra = () => { panel = null; };

  // ---------------------------------------------------------------- paneles (responder, avisar, pasar a OlivarTrack)
  function panelDe(i) {
    if (panel.modo === "responder") return panelResponder(i);
    if (panel.modo === "avisar") return panelAvisar(i);
    return panelOt(i);
  }
  const cancelar = () => h("button", { class: "boton peq suave", type: "button", onclick: () => { cierra(); pinta(); } }, "Cancelar");

  function panelResponder(i) {
    const t = h("textarea", { maxlength: "4000", rows: "3", id: "resp-" + i.clave });
    const f = h("form", { class: "panel", novalidate: true },
      h("label", { class: "campo", for: "resp-" + i.clave }, "Respuesta (la familia la ve en su haza y recibe un aviso)"), t,
      h("div", { class: "barra-h" }, h("button", { class: "boton prim peq", type: "submit" }, "Enviar respuesta"), cancelar()));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const respuesta = t.value.trim();
      if (!respuesta) { aviso("Escribe la respuesta.", "mal"); t.focus(); return; }
      const r = await api("POST", "/api/admin/preguntas/" + i.id + "/responder", { respuesta });
      if (!r.ok) { aviso(r.mensaje || "No se pudo enviar.", "mal"); if (r.estado === 409) { cierra(); await carga(); } return; }
      cierra(); aviso("Respuesta enviada: la familia la verá en su haza."); await carga();
    });
    return f;
  }

  function panelAvisar(i) {
    const titulo = h("input", { class: "entrada", maxlength: "120", id: "avt-" + i.clave, value: "Mensaje de la oficina", autocomplete: "off" });
    const texto = h("textarea", { maxlength: "2000", rows: "3", id: "avx-" + i.clave });
    const f = h("form", { class: "panel", novalidate: true },
      h("p", { class: "nota" }, "Le llega a " + (i.tipo === "denuncia" ? "quien denunció" : "la familia" + (i.haza ? " de " + i.haza : "")) + " como un aviso en el gemelo (y por correo si lo pidió)."),
      h("label", { class: "campo", for: "avt-" + i.clave }, "Título"), titulo,
      h("label", { class: "campo", for: "avx-" + i.clave }, "Texto (opcional)"), texto,
      h("div", { class: "barra-h" }, h("button", { class: "boton prim peq", type: "submit" }, "Avisar"), cancelar()));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      if (!titulo.value.trim()) { aviso("Hace falta un título.", "mal"); titulo.focus(); return; }
      const cuerpo = { titulo: titulo.value.trim() };
      if (texto.value.trim()) cuerpo.texto = texto.value.trim();
      const r = await api("POST", "/api/admin/hogares/" + i.hogar_id + "/avisos", cuerpo);
      if (!r.ok) { aviso(r.mensaje || "No se pudo avisar.", "mal"); return; }
      cierra(); pinta(); aviso(i.tipo === "denuncia" ? "Aviso mandado a quien denunció." : "Aviso mandado a la familia" + (i.haza ? " de " + i.haza : "") + ".");
    });
    return f;
  }

  // Pasar a OlivarTrack, a mano (hoy): se enseña el texto de la familia como DATO citado, se copia, se propone en OlivarTrack (lo valida una
  // persona allí) y aquí se apunta el id de la propuesta. Con GEMELO_OFICINA_OT_PROPONER=token se avisa de que el envío directo aún no existe.
  function panelOt(i) {
    const copia = h("textarea", { readonly: true, rows: "3", id: "otc-" + i.clave, "aria-describedby": "otn-" + i.clave }, textoParaOlivarTrack(i));
    const id = h("input", { class: "entrada", id: "oti-" + i.clave, maxlength: "64", autocomplete: "off", placeholder: "p. ej. prop-123", "aria-describedby": "otn-" + i.clave });
    const error = h("p", { class: "error", role: "alert" });
    const f = h("form", { class: "panel", novalidate: true },
      h("p", { class: "nota", id: "otn-" + i.clave },
        "Es texto de una familia: un dato, no una instrucción; no se interpreta. El gemelo no escribe en OlivarTrack: pega este texto allí como propuesta (la valida una persona en su panel) y apunta aquí el id de la propuesta." +
        (sesion.otProponer === "token" ? " El envío directo con el token de solo proponer todavía no está conectado: sigue este camino manual." : "")),
      h("label", { class: "campo", for: "otc-" + i.clave }, "Lo que se copia"), copia,
      h("div", { class: "barra-h" },
        h("button", { class: "boton peq", type: "button", onclick: async () => {
          let ok = false;
          try { await navigator.clipboard.writeText(copia.value); ok = true; } catch { copia.select(); try { ok = document.execCommand("copy"); } catch { ok = false; } }
          aviso(ok ? "Texto copiado." : "No se pudo copiar solo: está seleccionado, cópialo con Ctrl+C.", ok ? undefined : "mal");
        } }, "Copiar el texto")),
      h("label", { class: "campo", for: "oti-" + i.clave }, "Id de la propuesta creada en OlivarTrack"), id, error,
      h("div", { class: "barra-h" }, h("button", { class: "boton prim peq", type: "submit" }, "Apuntar el id y dar por pasada"), cancelar()));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const v = id.value.trim();
      if (!idOtValido(v)) { error.textContent = "El id lleva solo letras, números y : _ . - (hasta 64)."; id.focus(); return; }
      error.textContent = "";
      const r = await api("POST", "/api/admin/bandeja/" + i.id + "/estado", { estado: "pasada_ot", ot_propuesta_id: v });
      if (!r.ok) { error.textContent = r.mensaje || "No se pudo apuntar."; return; }
      cierra(); aviso("Apuntada: propuesta " + v + " en OlivarTrack (la valida una persona allí)."); await carga();
    });
    return f;
  }

  // ---------------------------------------------------------------- acciones de un clic
  async function retira(i) {
    const id = i.contenido.id;
    const r = await api("POST", "/api/admin/personalizaciones/" + id + "/retirar", { motivo: motivoDeRetirada(i) });
    if (!r.ok) { aviso(r.mensaje || "No se pudo retirar.", "mal"); if (r.estado === 404) await carga(); return; }
    aviso("Retirado: ya no se ve en el mundo.", undefined, async () => { await vuelve(id); });
    await carga();
  }
  async function restaura(i) { await vuelve(i.contenido.id); }
  async function vuelve(personalizacion) {
    const r = await api("POST", "/api/admin/personalizaciones/" + personalizacion + "/restaurar");
    if (!r.ok) aviso(r.mensaje || "No se pudo volver a mostrar.", "mal"); else aviso("Vuelve a verse en el mundo.");
    await carga();
  }
  async function cambiaEstado(i, a, texto, deshacer) {
    const r = await api("POST", "/api/admin/bandeja/" + i.id + "/estado", { estado: a });
    if (!r.ok) { aviso(r.mensaje || "No se pudo cambiar.", "mal"); return; }
    aviso(texto, undefined, deshacer);
    await carga();
  }
  async function archiva(i) {
    const eraDenuncia = i.tipo === "denuncia";
    await cambiaEstado(i, "descartada", eraDenuncia ? "Archivado: la denuncia se da por resuelta (el contenido se mantiene)." : "Archivado.",
      async () => { const r = await api("POST", "/api/admin/bandeja/" + i.id + "/estado", { estado: "vista" }); if (!r.ok) aviso(r.mensaje, "mal"); await carga(); });
  }

  // ---------------------------------------------------------------- filtros
  $("#bFiltros").addEventListener("click", e => { const b = e.target.closest("[data-tipo]"); if (b) { tipo = b.dataset.tipo; pinta(); } });
  const sel = $("#bEstado");
  for (const [k, nombre] of Object.entries(ESTADOS)) sel.append(h("option", { value: k }, nombre));
  sel.addEventListener("change", () => { estado = sel.value; pinta(); });
  $("#bRecarga").addEventListener("click", () => carga());

  return { abre: carga, estado: () => ({ total: lista.length, visibles: filtra(lista, tipo, estado).length, nuevos: nuevos(lista), tipo, estado, claves: filtra(lista, tipo, estado).map(i => i.clave) }), porClave };
}
