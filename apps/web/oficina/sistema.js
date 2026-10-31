// Sistema (OF5, doc/sistema/OFICINA.md §10): una página de estado y unos pocos botones. Salud de cada servicio, correo (con prueba a la propia cuenta),
// OlivarTrack (con «Sincronizar ahora» para admin), Vigía, hornero (con «Re-hornear ahora» para admin, OF9), aparatos de oficina y auditoría.
// Todo contra /api/admin/*; el DOM se hace con h() (texto, nunca HTML). La api manda una lista blanca (sin URLs ni rutas del servidor): aquí no se pide nada más.
import { $, api, aviso, conConfirmacion, confirma, fecha, h, vacia } from "./comun.js";
import { bytes, celdasFluidez, consultaMedidas, ESTADO_APARATO, ESTADO_OT, ESTADO_SALUD, hace, juicioFluidez, resumenSincronia, sobreQue } from "./sistema_puro.js";

const PAGINA = 50;
const pill = (tabla, k) => { const [c, t] = tabla[k] || ["p-info", String(k)]; return h("span", { class: "pill " + c }, t); };
const cuando = iso => (iso ? fecha(iso) + " (" + (hace(iso) || "ahora") + ")" : "—");

export function iniciaSistema({ sesion }) {
  let ultima = null, filas = [], siguiente = null, cargasAud = 0;
  const esAdmin = () => sesion.rol === "admin";

  // ---------------------------------------------------------------- estado general
  async function cargaSistema() {
    const r = await api("GET", "/api/admin/sistema");
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    ultima = r.datos;
    pintaSalud(); pintaCorreo(); pintaOt(); pintaVigia(); pintaHornero();
  }

  function pintaSalud() {
    const ul = vacia($("#sSalud"));
    for (const s of ultima.salud) {
      ul.append(h("li", { "data-servicio": s.id }, h("span", { class: "punto " + s.estado, "aria-hidden": "true" }), h("b", null, s.nombre), pill(ESTADO_SALUD, s.estado), h("span", { class: "nota" }, s.detalle)));
    }
    $("#sSaludHora").textContent = "Comprobado " + (hace(ultima.generado_en) || "ahora") + ", a las " + new Date(ultima.generado_en).toLocaleTimeString("es-ES", { timeStyle: "short" }) + ".";
  }

  function pintaCorreo() {
    const c = ultima.correo, p = vacia($("#sCorreo"));
    p.append(...[ "Modo ", h("code", null, c.modo), c.modo === "buzon" ? " (el buzón de pruebas: no sale ningún correo de verdad)" : "",
      " · ", ...(c.ultima_prueba ? ["última prueba ", c.ultima_prueba.ok ? h("span", { class: "pill p-ok" }, "bien") : h("span", { class: "pill p-mal" }, "falló"), " " + cuando(c.ultima_prueba.cuando)] : ["sin probar todavía"])]);
  }

  function pintaOt() {
    const o = ultima.olivartrack, cuerpo = vacia($("#sOt"));
    $("#sOtModo").textContent = o.modo === "no" ? "La lectura de OlivarTrack está apagada (GEMELO_OT=no)." : "Modo " + o.modo + ". Las herramientas son de solo lectura; lo que escribe el gemelo en OlivarTrack son propuestas.";
    for (const f of o.herramientas) {
      cuerpo.append(h("tr", { "data-herramienta": f.herramienta },
        h("td", null, h("code", null, f.herramienta)),
        h("td", null, pill(ESTADO_OT, f.estado)),
        h("td", { class: "nota" }, f.consultado_en ? "dato de " + cuando(f.consultado_en) : "intentada " + cuando(f.intentada_en),
          f.completa ? "" : h("span", { class: "interno" }, f.estado === "error" ? (f.aviso || "no se pudo leer") : "no está completa: no se sacan totales de ahí"))));
    }
    if (!o.herramientas.length) cuerpo.append(h("tr", null, h("td", { colspan: "3", class: "nota" }, "Todavía no se ha sincronizado nada.")));
    $("#bSinc").hidden = !esAdmin();
    $("#bSinc").disabled = !o.puede_sincronizar;
  }

  function pintaVigia() {
    const v = ultima.vigia, d = vacia($("#sVigia"));
    if (!v.conector) { d.append(h("p", null, h("span", { class: "pill p-info" }, "sin conector")), h("p", { class: "nota" }, "La api no lee Vigía (GEMELO_VIGIA=" + v.modo + "): el mundo usa un tiempo simulado y lo dice.")); return; }
    d.append(h("p", null, "Modo ", h("code", null, v.modo), v.origen === "fixture" ? " (datos de maqueta, no de Vigía)" : ""));
    const ul = h("ul", { class: "lista" });
    for (const t of v.herramientas) {
      ul.append(h("li", { "data-vigia": t.herramienta }, h("code", null, t.herramienta), " ", t.leidoEn ? ["última lectura ", cuando(t.leidoEn)] : "aún sin lectura",
        t.fallo ? [" ", h("span", { class: "pill p-aviso" }, "el último intento falló")] : null));
    }
    d.append(ul, h("p", { class: "nota" }, "Lo que se ve aquí es de cuándo llegó, no el dato: la api no llama a Vigía por mirar."));
  }

  function pintaHornero() {
    const o = ultima.hornero, d = vacia($("#sHornero"));
    if (!o.conectado) { d.append(h("p", null, h("span", { class: "pill p-info" }, "sin conectar")), h("p", { class: "nota" }, o.detalle)); return; }
    d.append(h("p", null, pill(ESTADO_SALUD, o.salud), " ", o.detalle, o.latido_en ? " Latido " + (hace(o.latido_en) || "ahora") + "." : ""));
    for (const f of o.fincas) {
      d.append(h("div", { class: "finca-hornero", "data-finca": f.finca },
        h("p", null, h("b", null, f.finca), " · época actual ", h("b", null, f.epoca_actual || "—"), " · siguiente ", h("b", null, f.epoca_siguiente || "—")),
        h("p", { class: "nota" }, (f.objetos === null ? "sin manifiesto" : f.objetos + " objetos · " + bytes(f.bytes)) + " · horneado " + cuando(f.horneado_en)),
        f.durmiendo_hasta ? h("p", { class: "nota" }, "Duerme hasta " + fecha(f.durmiendo_hasta)) : null,
        f.error ? h("p", { class: "error" }, "Último error: " + f.error) : null));
    }
    pintaPedido(o);
  }
  /** El botón «Re-hornear ahora» (solo admin, y si la api sabe dónde dejar la petición) y en qué va la última petición. */
  function pintaPedido(o) {
    const p = o.pedido, b = $("#bRehornear"), nota = vacia($("#sPedido"));
    b.hidden = !esAdmin(); b.disabled = !o.conectado || !o.puede_rehornear || (p && p.estado === "pendiente");
    if (!o.conectado) return;
    if (!o.puede_rehornear) { nota.textContent = "La api no sabe dónde dejarle la petición (falta el volumen de la configuración publicada)."; return; }
    if (!p) { nota.textContent = "Sin peticiones. Una petición se atiende en la próxima comprobación del hornero (como mucho 10 minutos)."; return; }
    nota.append(...(p.estado === "pendiente" ? [h("span", { class: "pill p-aviso" }, "pedido, esperando al hornero"), " desde " + cuando(p.pedido_en) + ". El hornero mira cada 10 minutos."]
      : [h("span", { class: "pill p-ok" }, "atendido"), " pedido " + cuando(p.pedido_en) + ", atendido " + cuando(p.atendido_en) + "."]));
  }

  // ---------------------------------------------------------------- acciones
  $("#bSistemaRefresca").addEventListener("click", () => { cargaSistema(); cargaAparatos(); cargaFluidez(); cargaAuditoria(false); });

  $("#bCorreo").addEventListener("click", async () => {
    const b = $("#bCorreo"); b.disabled = true;
    const r = await api("POST", "/api/admin/correo/prueba", {});
    b.disabled = false;
    aviso(r.ok ? r.datos.mensaje : r.mensaje, r.ok ? undefined : "mal");
    cargaSistema(); cargaAuditoria(false);
  });

  $("#bRehornear").addEventListener("click", () => {
    confirma({
      titulo: "Re-hornear ahora",
      cuerpo: [h("p", null, "Se le pide al hornero una vuelta en su próxima comprobación (como mucho 10 minutos). No regenera todo a la fuerza: lo que no ha cambiado se reutiliza, así que si todo está al día tarda un segundo y no escribe nada."),
        h("p", { class: "nota" }, "Si has entrado hace tiempo te pedirá un enlace nuevo.")],
      si: "Pedir la vuelta",
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/hornero/rehornear", {}));
        if (!r.ok) return r.mensaje || "No se pudo pedir.";
        aviso("Petición dejada: el hornero la recoge en su próxima comprobación (≤ 10 min)");
        cargaSistema(); cargaAuditoria(false);
        return undefined;
      },
    });
  });

  $("#bSinc").addEventListener("click", () => {
    confirma({
      titulo: "Sincronizar con OlivarTrack ahora",
      cuerpo: [h("p", null, "Se leen de OlivarTrack los pases, las novedades y el avance de recolección y se guardan en el gemelo. Es solo lectura; puede tardar unos segundos."),
        h("p", { class: "nota" }, "Si has entrado hace tiempo te pedirá un enlace nuevo.")],
      si: "Sincronizar",
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/sincronia", {}));
        if (!r.ok) return r.mensaje || "No se pudo sincronizar.";
        aviso("Sincronía hecha: " + resumenSincronia(r.datos.resumen), r.datos.resumen.some(x => x.estado === "error") ? "mal" : undefined);
        cargaSistema(); cargaAuditoria(false);
        return undefined;
      },
    });
  });

  // ---------------------------------------------------------------- fluidez en aparatos (PB9): medido por cada aparato, agregado por día y aparato
  let cargasFlu = 0;
  async function cargaFluidez() {
    const n = ++cargasFlu;
    const r = await api("GET", consultaMedidas({ aparato: $("#sFluAp").value, desde: $("#sFluDesde").value, hasta: $("#sFluHasta").value }));
    if (n !== cargasFlu) return;
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    const cuerpo = vacia($("#sFlu"));
    for (const f of r.datos.filas) {
      const c = celdasFluidez(f);
      cuerpo.append(h("tr", { "data-dia": f.dia, "data-aparato": f.aparato },
        h("td", null, c.dia), h("td", null, c.aparato), h("td", null, c.medidas), h("td", null, h("b", null, c.p95)), h("td", null, c.objetivo), h("td", null, pill({ x: juicioFluidez(f) }, "x")),
        h("td", null, c.mediana), h("td", null, c.peor), h("td", { class: "nota" }, c.navegadores), h("td", { class: "nota" }, c.versiones)));
    }
    if (!r.datos.filas.length) cuerpo.append(h("tr", null, h("td", { colspan: "10", class: "nota" }, "Todavía no ha llegado ninguna medida (con estos filtros).")));
    $("#sFluNota").textContent = r.datos.filas.length ? r.datos.filas.length + " fila" + (r.datos.filas.length > 1 ? "s" : "") + ", la más reciente primero." : "";
  }
  for (const id of ["#sFluAp", "#sFluDesde", "#sFluHasta"]) $(id).addEventListener("change", cargaFluidez);

  // ---------------------------------------------------------------- aparatos de oficina
  async function cargaAparatos() {
    const r = await api("GET", "/api/admin/aparatos");
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    const ul = vacia($("#sAparatos"));
    for (const a of r.datos.aparatos.filter(x => x.estado !== "caducado" && x.estado !== "revocado").concat(r.datos.aparatos.filter(x => x.estado === "revocado").slice(0, 3))) {
      ul.append(h("li", { class: "aparato", "data-aparato": a.id, "data-nombre": a.nombre, "data-este": a.es_este ? "1" : "0" },
        h("span", null, a.nombre, a.es_este ? " (este)" : "", h("br"),
          h("span", { class: "nota" }, a.rol + " · " + (a.ultimo_uso_en ? "usado " + (hace(a.ultimo_uso_en) || "ahora") : "sin usar") + " · "), pill(ESTADO_APARATO, a.estado)),
        h("span", { class: "en-linea" },
          a.estado === "pendiente" && !a.es_este ? h("button", { class: "boton peq prim", type: "button", "data-ap": a.id, "data-acc": "aprobar", "aria-label": "Aprobar el aparato " + a.nombre }, "Aprobar") : null,
          a.estado === "aprobado" || a.estado === "pendiente" ? h("button", { class: "boton peq", type: "button", "data-ap": a.id, "data-acc": "revocar", "aria-label": "Revocar el aparato " + a.nombre }, "Revocar") : null)));
    }
    if (!ul.children.length) ul.append(h("li", { class: "nota" }, "No hay aparatos."));
  }
  $("#sAparatos").addEventListener("click", e => {
    const b = e.target.closest("[data-ap]");
    if (!b) return;
    const li = b.closest("li"), id = Number(b.dataset.ap), nombre = li.dataset.nombre;
    if (b.dataset.acc === "aprobar") {
      confirma({ titulo: "Aprobar el aparato", cuerpo: [h("p", null, "«" + nombre + "» podrá entrar a la oficina con su cuenta. Compruébalo: que sea un aparato que reconoces."), h("p", { class: "nota" }, "Pide haber entrado hace poco.")], si: "Aprobar",
        hecho: async () => {
          const r = await conConfirmacion(() => api("POST", "/api/admin/aparatos/" + id + "/aprobar", {}));
          if (!r.ok) return r.mensaje;
          aviso("Aparato aprobado: " + nombre); cargaAparatos(); cargaAuditoria(false); return undefined;
        } });
    } else {
      const este = li.dataset.este === "1";
      confirma({ titulo: "Revocar el aparato", cuerpo: [h("p", null, "«" + nombre + "» deja de ser confiable y se cierran sus sesiones en el acto."), este ? h("p", { class: "error" }, "Es el aparato que estás usando: te sacará de la oficina.") : null], si: "Revocar",
        hecho: async () => {
          const r = await api("POST", "/api/admin/aparatos/" + id + "/revocar", {});
          if (!r.ok) return r.mensaje;
          aviso("Aparato revocado: " + nombre); if (este) location.href = "/"; else { cargaAparatos(); cargaAuditoria(false); } return undefined;
        } });
    }
  });

  // ---------------------------------------------------------------- auditoría
  async function cargaAuditoria(mas) {
    const n = ++cargasAud, p = new URLSearchParams({ limite: String(PAGINA) }), f = $("#sAudF").value;
    if (f) p.set("accion", f);
    if (mas && filas.length) p.set("antes", String(filas[filas.length - 1].id));
    const r = await api("GET", "/api/admin/auditoria?" + p);
    if (n !== cargasAud) return;
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    filas = mas ? filas.concat(r.datos.filas) : r.datos.filas;
    siguiente = r.datos.siguiente;
    if (r.datos.acciones) {
      const sel = $("#sAudF"), actual = sel.value;
      vacia(sel).append(h("option", { value: "" }, "Todas las acciones"), ...r.datos.acciones.map(a => h("option", { value: a }, a)));
      if (actual && !r.datos.acciones.includes(actual)) sel.append(h("option", { value: actual }, actual));
      sel.value = actual;
    }
    pintaAuditoria();
  }
  function pintaAuditoria() {
    const cuerpo = vacia($("#sAud"));
    for (const f of filas) {
      cuerpo.append(h("tr", { "data-audit": f.id },
        h("td", null, fecha(f.cuando)),
        h("td", null, f.quien ? (f.quien.rol || "cuenta borrada") + " #" + f.quien.hogar : h("span", { class: "nota" }, "sistema o cuenta borrada")),
        h("td", null, h("code", null, f.accion)),
        h("td", { class: "nota" }, sobreQue(f.detalle))));
    }
    if (!filas.length) cuerpo.append(h("tr", null, h("td", { colspan: "4", class: "nota" }, "Nada con ese filtro.")));
    $("#sAudMas").hidden = siguiente === null;
    $("#sAudCuenta").textContent = filas.length + " filas" + (siguiente === null ? "" : ", hay más");
  }
  $("#sAudF").addEventListener("change", () => cargaAuditoria(false));
  $("#sAudMas").addEventListener("click", () => cargaAuditoria(true));

  return { abre() { cargaSistema(); cargaAparatos(); cargaFluidez(); cargaAuditoria(false); }, estado: () => ({ ultima, filas: filas.length, siguiente }) };
}
