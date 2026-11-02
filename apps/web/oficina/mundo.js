// Mundo (OF14, escalón 1; doc/sistema/OFICINA.md §6): anunciar a toda la sala, expulsar a una familia y balizas oficiales, con las rutas que ya
// existen (POST /api/admin/presencia/anuncio y /expulsar; GET /api/balizas-oficiales y POST/PUT/DELETE /api/admin/balizas). Todo el DOM con h()
// (texto, nunca HTML). La api vuelve a validar; aquí solo se ahorra la ida y vuelta (mundo_puro.js) y se enseña su error en claro.
import { $, api, aviso, confirma, h, vacia } from "./comun.js";
import { ANUNCIO_MAX, CADUCIDADES, HORAS, SALAS, cuerpoAnuncio, cuerpoBaliza, cuerpoExpulsion, cuerpoMover, etiquetaFamilia, textoCaduca, textoConfirmaExpulsion, textoCuenta } from "./mundo_puro.js";

const FINCA_POR_DEFECTO = "hituelo";

export function iniciaMundo({ sesion }) {
  let preparado = false, familias = [], balizas = [], finca = FINCA_POR_DEFECTO, buscando = 0, cargandoBalizas = 0, moviendo = null;
  void sesion;
  const estado = (id, texto, mal) => { const p = $(id); p.textContent = texto; p.classList.toggle("error", !!mal); };

  // ---------------------------------------------------------------- anunciar
  async function anuncia(e) {
    e.preventDefault();
    const c = cuerpoAnuncio({ texto: $("#mAnuncioT").value, sala: $("#mAnuncioS").value });
    if (!c.ok) { estado("#mAnuncioM", c.error, true); $("#mAnuncioT").focus(); return; }
    const b = $("#mAnuncioB");
    b.disabled = true; estado("#mAnuncioM", "Enviando…");
    const r = await api("POST", "/api/admin/presencia/anuncio", c.cuerpo);
    b.disabled = false;
    if (!r.ok) { estado("#mAnuncioM", r.mensaje, true); return; }
    const n = (r.datos && r.datos.salas ? r.datos.salas : []).length;
    estado("#mAnuncioM", n ? "Enviado." : "Enviado, pero no había ninguna sala abierta: no lo ha visto nadie.");
    $("#mAnuncioT").value = ""; cuentaAnuncio();
  }
  const cuentaAnuncio = () => { $("#mAnuncioN").textContent = textoCuenta($("#mAnuncioT").value, ANUNCIO_MAX); };

  // ---------------------------------------------------------------- expulsar
  async function buscaFamilias() {
    const n = ++buscando, p = new URLSearchParams({ limite: "50" }), q = $("#mExpulsaQ").value.trim();
    if (q) p.set("q", q);
    const r = await api("GET", "/api/admin/hogares?" + p);
    if (n !== buscando) return;
    if (!r.ok) { estado("#mExpulsaM", r.mensaje, true); return; }
    familias = r.datos.hogares.filter(f => f.rol === "hogar");
    const s = vacia($("#mExpulsaS"));
    s.append(h("option", { value: "" }, familias.length ? "Elige una familia…" : "Ninguna familia coincide"));
    for (const f of familias) s.append(h("option", { value: String(f.id) }, etiquetaFamilia(f)));
  }

  function pideExpulsar(e) {
    e.preventDefault();
    const c = cuerpoExpulsion({ hogar_id: $("#mExpulsaS").value, motivo: $("#mExpulsaMot").value });
    if (!c.ok) { estado("#mExpulsaM", c.error, true); $("#mExpulsaS").focus(); return; }
    const f = familias.find(x => x.id === c.cuerpo.hogar_id);
    confirma({
      titulo: "¿Expulsar a esta familia?", si: "Expulsar 15 minutos",
      cuerpo: [h("p", null, textoConfirmaExpulsion(f ? etiquetaFamilia(f) : "esta familia"))],
      hecho: async () => {
        const r = await api("POST", "/api/admin/presencia/expulsar", c.cuerpo);
        if (!r.ok) return r.mensaje;
        estado("#mExpulsaM", r.datos && r.datos.estaba_en_sala ? "Expulsada: estaba en la sala y ya no está." : "Expulsada 15 minutos (no estaba en la sala ahora).");
        aviso("Familia expulsada 15 minutos.");
        $("#mExpulsaMot").value = "";
        return undefined;
      },
    });
  }

  // ---------------------------------------------------------------- balizas
  async function cargaBalizas() {
    const n = ++cargandoBalizas;
    const r = await api("GET", "/api/balizas-oficiales?finca=" + encodeURIComponent(finca));
    if (n !== cargandoBalizas) return;
    if (!r.ok) { estado("#mBalizaCuenta", r.mensaje, true); return; }
    balizas = r.datos.balizas;
    pintaBalizas();
  }

  function pintaBalizas() {
    const ul = vacia($("#mBalizaLista")), ahora = Date.now();
    estado("#mBalizaCuenta", balizas.length ? balizas.length + (balizas.length === 1 ? " baliza vigente" : " balizas vigentes") + " en " + finca + "." : "No hay balizas oficiales vigentes en " + finca + ".");
    for (const b of balizas) {
      ul.append(h("li", { class: "item", "data-baliza": b.id },
        h("div", { class: "miniatura", "aria-hidden": "true" }, "🚩"),
        h("div", { class: "cuerpo" },
          h("div", { class: "cab" }, h("b", null, b.titulo), h("span", { class: "pill p-info" }, textoCaduca(b.hasta, ahora))),
          b.texto ? h("p", { class: "texto" }, b.texto) : null,
          h("p", { class: "nota" }, "x " + b.x + " · y " + b.y + " (UTM 25830)"),
          h("div", { class: "barra-h" },
            h("button", { class: "boton peq", type: "button", onclick: () => abreMover(b) }, "Mover"),
            h("button", { class: "boton peq peligro-suave", type: "button", onclick: () => pideQuitar(b) }, "Quitar")))));
    }
  }

  async function ponBaliza(e) {
    e.preventDefault();
    const c = cuerpoBaliza({ finca, titulo: $("#mBalizaT").value, texto: $("#mBalizaX").value, x: $("#mBalizaPx").value, y: $("#mBalizaPy").value, horas: $("#mBalizaH").value });
    if (!c.ok) { estado("#mBalizaM", c.error, true); return; }
    const b = $("#mBalizaB");
    b.disabled = true; estado("#mBalizaM", "Poniendo…");
    const r = await api("POST", "/api/admin/balizas", c.cuerpo);
    b.disabled = false;
    if (!r.ok) { estado("#mBalizaM", r.mensaje, true); return; }
    estado("#mBalizaM", "Baliza puesta.");
    for (const id of ["#mBalizaT", "#mBalizaX", "#mBalizaPx", "#mBalizaPy"]) $(id).value = "";
    await cargaBalizas();
  }

  function pideQuitar(b) {
    confirma({
      titulo: "¿Quitar la baliza?", si: "Quitar", cuerpo: [h("p", null, "Se quita «" + b.titulo + "» del mundo para todos. Queda retirada en la auditoría, no se borra.")],
      hecho: async () => {
        const r = await api("DELETE", "/api/admin/balizas/" + b.id);
        if (!r.ok) return r.mensaje;
        estado("#mBalizaM", "Baliza quitada.");
        await cargaBalizas();
        return undefined;
      },
    });
  }

  function abreMover(b) {
    moviendo = b;
    $("#mMoverNombre").textContent = "«" + b.titulo + "». Solo se mueve el punto: el título, el texto y la caducidad no se editan (quítala y pon otra).";
    $("#mMoverX").value = String(b.x); $("#mMoverY").value = String(b.y); $("#mMoverError").textContent = "";
    $("#dlgBalizaMover").showModal();
    $("#mMoverX").focus();
  }
  async function mueve(e) {
    e.preventDefault();
    const c = cuerpoMover($("#mMoverX").value, $("#mMoverY").value);
    if (!c.ok) { $("#mMoverError").textContent = c.error; return; }
    const r = await api("PUT", "/api/admin/balizas/" + moviendo.id, c.cuerpo);
    if (!r.ok) { $("#mMoverError").textContent = r.mensaje; return; }
    $("#dlgBalizaMover").close();
    estado("#mBalizaM", "Baliza movida.");
    await cargaBalizas();
  }

  // ---------------------------------------------------------------- arranque
  async function cargaFincas() {
    const r = await api("GET", "/api/admin/hazas");
    const fincas = r.ok ? [...new Set(r.datos.hazas.map(z => z.finca))].sort() : [];
    if (!fincas.length) fincas.push(FINCA_POR_DEFECTO);
    if (!fincas.includes(finca)) finca = fincas[0];
    const s = vacia($("#mBalizaFinca"));
    s.append(...fincas.map(f => h("option", { value: f, selected: f === finca }, f)));
    s.disabled = fincas.length < 2;
  }

  function prepara() {
    if (preparado) return;
    preparado = true;
    $("#mAnuncioS").append(...Object.entries(SALAS).map(([k, t]) => h("option", { value: k }, t)));
    $("#mBalizaH").append(...CADUCIDADES.map(([hs, t]) => h("option", { value: String(hs), selected: hs === HORAS.defecto }, t)));
    $("#mAnuncioF").addEventListener("submit", anuncia);
    $("#mAnuncioT").addEventListener("input", cuentaAnuncio);
    $("#mExpulsaF").addEventListener("submit", pideExpulsar);
    let t = 0;
    $("#mExpulsaQ").addEventListener("input", () => { clearTimeout(t); t = setTimeout(buscaFamilias, 250); });
    $("#mBalizaF").addEventListener("submit", ponBaliza);
    $("#mBalizaRef").addEventListener("click", cargaBalizas);
    $("#mBalizaFinca").addEventListener("change", e => { finca = e.target.value; cargaBalizas(); });
    $("#fBalizaMover").addEventListener("submit", mueve);
    $("#mMoverNo").addEventListener("click", () => $("#dlgBalizaMover").close());
    cuentaAnuncio();
  }

  async function abre() {
    prepara();
    await Promise.all([cargaFincas(), buscaFamilias()]);
    await cargaBalizas();
  }

  return { abre, estado: () => ({ finca, balizas: balizas.map(b => ({ id: b.id, titulo: b.titulo })), familias: familias.length }) };
}
