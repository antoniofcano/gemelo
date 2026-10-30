// Familias (OF2, doc/sistema/OFICINA.md §3): lista con búsqueda y filtro, alta, y la ficha de cada una (nombre interno, alias, haza,
// sesiones, reenviar enlace, baja y reactivación, exportar y borrar). Todo contra /api/admin/*; el DOM se construye con h() (texto, nunca HTML).
import { $, api, aviso, conConfirmacion, confirma, dia, fecha, h, vacia } from "./comun.js";

const PAGINA = 100;
const ETIQUETA = { activa: ["p-ok", "activa"], pendiente: ["p-aviso", "sin primer acceso"], baja: ["p-mal", "de baja"] };
const ROLES = [["hogar", "Familia (hogar)"], ["guia", "Guía"], ["corresponsal", "Corresponsal"], ["oficina", "Oficina"], ["admin", "Admin"]];
const esOficina = rol => rol === "oficina" || rol === "admin";
const pill = estado => h("span", { class: "pill " + ETIQUETA[estado][0] }, ETIQUETA[estado][1]);

export function iniciaFamilias({ sesion }) {
  let lista = [], total = 0, hazas = [], seleccion = null, sesiones = null, temporizador = 0, cargas = 0;
  const esAdmin = () => sesion.rol === "admin";

  // ---------------------------------------------------------------- lista
  async function carga(mas) {
    const n = ++cargas;
    const p = new URLSearchParams({ limite: String(PAGINA), desde: String(mas ? lista.length : 0) });
    const q = $("#fBusca").value.trim(), estado = $("#fFiltro").value;
    if (q) p.set("q", q);
    if (estado) p.set("estado", estado);
    const r = await api("GET", "/api/admin/hogares?" + p);
    if (n !== cargas) return;   // llegó una búsqueda más nueva
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    lista = mas ? lista.concat(r.datos.hogares) : r.datos.hogares;
    total = r.datos.total;
    pintaLista();
  }
  async function cargaHazas() {
    const r = await api("GET", "/api/admin/hazas");
    if (r.ok) hazas = r.datos.hazas;
  }
  const refresca = async () => { await Promise.all([carga(false), cargaHazas()]); if (seleccion !== null) await abreFicha(seleccion, false); };

  function pintaLista() {
    const cuerpo = vacia($("#fTabla"));
    for (const f of lista) {
      cuerpo.append(h("tr", { "aria-selected": String(f.id === seleccion), "data-fila": f.id },
        h("td", { class: "correo" }, f.correo, f.rol !== "hogar" ? [" ", h("span", { class: "pill p-info" }, f.rol)] : null, f.nombre_interno ? h("span", { class: "interno" }, f.nombre_interno) : null),
        h("td", null, f.alias || h("span", { class: "nota" }, "—")),
        h("td", null, f.hazas.length ? f.hazas.join(", ") : "—"),
        h("td", null, pill(f.estado)),
        h("td", null, String(f.sesiones)),
        h("td", null, h("button", { class: "boton peq", type: "button", "data-fam": f.id, "aria-label": "Ver la ficha de " + f.correo }, "Ver"))));
    }
    if (!lista.length) cuerpo.append(h("tr", null, h("td", { colspan: "6", class: "nota" }, "Ninguna familia coincide.")));
    $("#fCuenta").textContent = lista.length + " de " + total + " cuentas · las cuentas las da la oficina: no hay alta abierta";
    $("#fMas").hidden = lista.length >= total;
  }

  $("#fBusca").addEventListener("input", () => { clearTimeout(temporizador); temporizador = setTimeout(() => carga(false), 250); });
  $("#fFiltro").addEventListener("change", () => carga(false));
  $("#fMas").addEventListener("click", () => carga(true));
  $("#fTabla").addEventListener("click", e => {
    const b = e.target.closest("[data-fam]");
    if (b) abreFicha(Number(b.dataset.fam), true);
  });

  // ---------------------------------------------------------------- ficha
  async function abreFicha(id, foco) {
    seleccion = id;
    for (const tr of $("#fTabla").querySelectorAll("tr[data-fila]")) tr.setAttribute("aria-selected", String(Number(tr.dataset.fila) === id));
    const fila = lista.find(f => f.id === id);
    if (!fila) { seleccion = null; pintaFicha(); return; }
    const r = await api("GET", "/api/admin/hogares/" + id + "/sesiones");
    if (seleccion !== id) return;
    sesiones = r.ok ? r.datos : { sesiones: [], aparatos_oficina: [] };
    pintaFicha();
    if (foco) $("#fFicha h2").focus();
  }

  function pintaFicha() {
    const el = vacia($("#fFicha")), f = lista.find(x => x.id === seleccion);
    if (!f) { el.append(h("p", { class: "nota" }, "Elige una familia para ver su ficha.")); return; }
    const deOficina = esOficina(f.rol), vetada = deOficina && !esAdmin();
    el.append(h("h2", { tabindex: "-1" }, f.correo));
    el.append(h("dl", { class: "datos" },
      h("dt", null, "Estado"), h("dd", null, pill(f.estado), f.baja_en ? h("div", { class: "nota" }, "Baja el " + dia(f.baja_en) + " · contenido oculto, se borra el " + dia(f.borrado_en)) : null),
      h("dt", null, "Rol"), h("dd", null, f.rol, esAdmin() && !vetada ? fichaRol(f) : null),
      h("dt", null, "Alias"), h("dd", null, f.alias ? [f.alias, " ", h("button", { class: "boton peq suave", type: "button", onclick: () => quitaAlias(f) }, "Quitar alias")] : h("span", { class: "nota" }, "sin alias (lo elige la familia)")),
      h("dt", null, "Normas"), h("dd", null, f.normas_version ? "v" + f.normas_version + " · " + dia(f.normas_aceptadas_en) : "—"),
      h("dt", null, "Avisos por correo"), h("dd", null, f.avisos_correo ? "sí" : "no"),
      h("dt", null, "Alta"), h("dd", null, dia(f.creado_en))));
    if (vetada) { el.append(h("p", { class: "nota" }, "Es una cuenta de oficina: solo la administración puede cambiarla.")); return; }
    el.append(fichaNombre(f));
    el.append(fichaHaza(f));
    el.append(fichaSesiones(f));
    el.append(fichaAcciones(f));
  }

  function fichaNombre(f) {
    const entrada = h("input", { class: "entrada", id: "fNombre", maxlength: "60", autocomplete: "off", value: f.nombre_interno || "" });
    const guarda = async () => {
      const r = await api("PATCH", "/api/admin/hogares/" + f.id, { nombre_interno: entrada.value.trim() });
      if (!r.ok) return aviso(r.mensaje, "mal");
      aviso("Nombre interno guardado"); await refresca();
    };
    return h("div", { class: "campo" }, h("label", { for: "fNombre" }, "Nombre interno (solo lo ve la oficina; no sale nunca a las familias)"),
      h("div", { class: "en-linea" }, entrada, h("button", { class: "boton", type: "button", onclick: guarda }, "Guardar")));
  }

  function fichaRol(f) {
    const sel = h("select", { class: "entrada", "aria-label": "Nuevo rol de " + f.correo }, ROLES.map(([v, t]) => h("option", { value: v, selected: v === f.rol }, t)));
    const cambia = async () => {
      if (sel.value === f.rol) return;
      const r = await conConfirmacion(() => api("PATCH", "/api/admin/hogares/" + f.id, { rol: sel.value }));
      if (!r.ok) { aviso(r.mensaje, "mal"); sel.value = f.rol; return; }
      aviso("Rol cambiado; sus sesiones se han cerrado"); await refresca();
    };
    return h("div", { class: "en-linea" }, sel, h("button", { class: "boton peq", type: "button", onclick: cambia }, "Cambiar rol"));
  }

  function fichaHaza(f) {
    const sel = h("select", { id: "fHaza", class: "entrada", disabled: f.estado === "baja" },
      h("option", { value: "" }, "Sin haza"),
      hazas.map(z => h("option", { value: z.id, selected: f.hazas.includes(z.codigo) }, z.codigo + " · " + z.nombre + (z.hogar_id && z.hogar_id !== f.id ? " (de otra familia)" : ""))));
    sel.addEventListener("change", () => asignaHaza(f, sel));
    return h("div", { class: "campo" }, h("label", { for: "fHaza" }, "Haza"), sel, f.estado === "baja" ? h("span", { class: "nota" }, "De baja: reactívala para asignarle una haza.") : null);
  }

  async function asignaHaza(f, sel) {
    const nueva = sel.value ? Number(sel.value) : null, z = hazas.find(x => x.id === nueva);
    const hace = async () => {
      const r = await api("PUT", "/api/admin/hogares/" + f.id + "/haza", { haza_id: nueva });
      if (!r.ok) { aviso(r.mensaje, "mal"); await refresca(); return r.mensaje; }
      const q = r.datos.quitada_a;
      aviso(nueva ? "Haza " + z.codigo + " asignada a " + f.correo + (q ? " (se le quitó a " + q.correo + ")" : "") : "Haza quitada a " + f.correo);
      await refresca();
    };
    if (z && z.hogar_id && z.hogar_id !== f.id) {
      confirma({ titulo: "Quitar la haza a otra familia", si: "Asignar", hecho: hace, cuerpo: h("p", null, "La haza " + z.codigo + " es de " + z.hogar_correo + ". Al asignarla a " + f.correo + " se le quita a esa familia, y lo que colgó en ella dejará de verse.") });
      sel.value = String(hazas.find(x => f.hazas.includes(x.codigo))?.id ?? "");   // vuelve hasta que se confirme
    } else await hace();
  }

  function fichaSesiones(f) {
    const caja = h("div", null, h("h3", null, "Aparatos y sesiones"));
    const ss = sesiones.sesiones;
    if (!ss.length) caja.append(h("p", { class: "nota" }, "Ninguna sesión abierta."));
    for (const s of ss) {
      caja.append(h("div", { class: "aparato" },
        h("span", null, s.aparato + (s.por_codigo_corto ? " (código corto)" : ""), h("br"), h("span", { class: "nota" }, "último uso: " + fecha(s.ultima_actividad_en))),
        h("button", { class: "boton peq", type: "button", "aria-label": "Cerrar la sesión de " + s.aparato, onclick: () => cierraSesion(f, s) }, "Cerrar")));
    }
    for (const a of sesiones.aparatos_oficina) {
      caja.append(h("div", { class: "aparato" }, h("span", null, "Aparato de oficina: " + a.nombre, h("br"), h("span", { class: "nota" }, a.estado + " · último uso: " + fecha(a.ultimo_uso_en)))));
    }
    if (ss.length) caja.append(h("p", null, h("button", { class: "boton", type: "button", onclick: () => cierraTodas(f) }, "Cerrar todas las sesiones")));
    return caja;
  }

  async function cierraSesion(f, s) {
    const r = await api("DELETE", "/api/admin/sesiones/" + s.id);
    if (!r.ok) return aviso(r.mensaje, "mal");
    aviso("Sesión cerrada en «" + s.aparato + "»"); await refresca();
  }
  function cierraTodas(f) {
    confirma({ titulo: "Cerrar todas las sesiones", si: "Cerrar todas",
      cuerpo: h("p", null, f.correo + " tendrá que volver a entrar con un enlace en todos sus aparatos (también las gafas)."),
      hecho: async () => { const r = await api("POST", "/api/admin/hogares/" + f.id + "/revocar", {}); if (!r.ok) return r.mensaje; aviso("Sesiones cerradas"); await refresca(); } });
  }

  async function quitaAlias(f) {
    const r = await api("PATCH", "/api/admin/hogares/" + f.id, { quitar_alias: true });
    if (!r.ok) return aviso(r.mensaje, "mal");
    aviso("Alias quitado; queda en la auditoría"); await refresca();
  }

  function fichaAcciones(f) {
    const b = (texto, fn, clase) => h("button", { class: "boton" + (clase ? " " + clase : ""), type: "button", onclick: fn }, texto);
    return h("div", { class: "barra-h" },
      f.estado !== "baja" ? b("Reenviar enlace", () => reenvia(f)) : b("Reactivar", () => reactiva(f)),
      b("Exportar sus datos", () => exporta(f)),
      f.estado !== "baja" ? b("Dar de baja…", () => daDeBaja(f)) : null,
      b("Borrar (RGPD)…", () => borra(f), "peligro"));
  }

  async function reenvia(f) {
    const r = await api("POST", "/api/admin/hogares/" + f.id + "/enlace", {});
    aviso(r.ok ? "Enlace mandado a " + f.correo + " (caduca en 15 min)" : r.mensaje, r.ok ? undefined : "mal");
  }
  async function reactiva(f) {
    const r = await api("POST", "/api/admin/hogares/" + f.id + "/reactivar", {});
    if (!r.ok) return aviso(r.mensaje, "mal");
    aviso("Cuenta reactivada: su contenido vuelve a verse" + (r.datos.hazas_devueltas ? " (y su haza)" : "")); await refresca();
  }
  async function exporta(f) {
    const r = await api("GET", "/api/admin/hogares/" + f.id + "/exportar", undefined, { crudo: true });
    if (!r.ok) return aviso(r.mensaje, "mal");
    const url = URL.createObjectURL(await r.respuesta.blob());
    const a = h("a", { href: url, download: "datos-hogar-" + f.id + ".json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    aviso("Datos de " + f.correo + " descargados (JSON)");
  }
  function daDeBaja(f) {
    confirma({ titulo: "Dar de baja", si: "Dar de baja",
      cuerpo: h("p", null, "Se cierran sus sesiones, la haza queda sin asignar y lo que colgó (nombres de árboles, fotos, pinturas, diario) deja de verse al momento y se borra a los 30 días, salvo que se reactive antes."),
      hecho: async () => { const r = await api("POST", "/api/admin/hogares/" + f.id + "/baja", {}); if (!r.ok) return r.mensaje; aviso("Cuenta de baja"); await refresca(); } });
  }
  function borra(f) {
    confirma({ titulo: "Borrar la cuenta (RGPD)", si: "Borrar para siempre", escribe: f.correo,
      cuerpo: [h("p", null, "Se borra la cuenta y todo lo suyo al momento, sin los 30 días de espera. La auditoría queda sin su referencia. No se puede deshacer."), h("p", { class: "nota" }, "Pide haber entrado hace menos de 15 minutos.")],
      hecho: async () => {
        const r = await conConfirmacion(() => api("DELETE", "/api/admin/hogares/" + f.id, { correo: f.correo }));
        if (!r.ok) return r.mensaje;
        aviso("Cuenta borrada"); seleccion = null; sesiones = null; pintaFicha(); await refresca();
      } });
  }

  // ---------------------------------------------------------------- alta
  const dlg = $("#dlgAlta");
  function avisoHaza() {
    const z = hazas.find(x => String(x.id) === $("#altaHaza").value);
    $("#altaAviso").textContent = z && z.hogar_id ? "Ahora es de " + z.hogar_correo + ": al darla de alta se le quitará." : "";
  }
  $("#bAlta").addEventListener("click", async () => {
    await cargaHazas();
    $("#fAlta").reset(); $("#altaError").textContent = "";
    vacia($("#altaHaza")).append(h("option", { value: "" }, "Sin haza por ahora"), hazas.map(z => h("option", { value: z.id }, z.codigo + " · " + z.nombre + (z.hogar_id ? " (de otra familia)" : ""))));
    vacia($("#altaRol")).append(ROLES.filter(([v]) => esAdmin() || !esOficina(v)).map(([v, t]) => h("option", { value: v }, t)));
    avisoHaza();
    dlg.showModal(); $("#altaCorreo").focus();
  });
  $("#altaHaza").addEventListener("change", avisoHaza);
  $("#altaCancela").addEventListener("click", () => dlg.close());
  $("#fAlta").addEventListener("submit", async e => {
    e.preventDefault();
    const correo = $("#altaCorreo").value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { $("#altaError").textContent = "Ese correo no parece válido."; return; }
    const cuerpo = { correo, rol: $("#altaRol").value, enviar: $("#altaEnviar").checked };
    if ($("#altaNombre").value.trim()) cuerpo.nombre_interno = $("#altaNombre").value.trim();
    if ($("#altaHaza").value) cuerpo.haza_id = Number($("#altaHaza").value);
    $("#altaOk").disabled = true;
    const r = await conConfirmacion(() => api("POST", "/api/admin/hogares", cuerpo));
    $("#altaOk").disabled = false;
    if (!r.ok) { $("#altaError").textContent = r.mensaje; return; }
    dlg.close();
    const q = r.datos.haza_quitada_a;
    aviso("Cuenta creada" + (cuerpo.enviar ? (r.datos.enlace_enviado ? " y enlace de bienvenida mandado a " + correo : "; el correo NO salió: reenvía el enlace desde su ficha") : "") + (q ? " (la haza se le quitó a otra familia)" : ""),
      cuerpo.enviar && !r.datos.enlace_enviado ? "mal" : undefined);
    $("#fBusca").value = ""; $("#fFiltro").value = "";
    await carga(false); await cargaHazas();
    await abreFicha(r.datos.id, true);
  });

  let iniciada = false;
  return {
    /** Al entrar en la sección: carga la lista y las hazas (la primera vez, también la ficha vacía). */
    async abre() {
      if (!iniciada) { iniciada = true; pintaFicha(); }
      await Promise.all([carga(false), cargaHazas()]);
    },
  };
}
