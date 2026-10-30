// Olivos (OF7, doc/sistema/OFICINA.md §9.2): los parámetros de la escalera de olivos (deslizadores con sus límites y su valor de hoy), los interruptores de
// componentes y el historial de versiones de la configuración, contra la api real (/api/admin/config…, solo admin). Una versión lleva los tres bloques del
// contrato (contratos/config.schema.json): aquí se editan «escalera», «componentes» y, desde OF9, «epocas» (pestaña Épocas: 7 ventanas MM-DD, común y por finca,
// con la comprobación de los 366 días; si la configuración no las trae, vale el calendario del repo). Una versión nunca se reescribe:
// un borrador nuevo por cada guardado, «a prueba» (solo la cargan las cuentas de oficina), «para todos» (admin + confirmación reciente) y «volver» (una copia).
// La vista previa es SIMULADA e ilustrativa: no mide nada. Todo el DOM va con textContent (nada de HTML a mano).
import { iniciaOlivoReal } from "./olivo_real.js";
import { $, api, aviso, conConfirmacion, confirma, fecha, h, vacia } from "./comun.js";
import { APARATOS, APAR, CAMPO, COMPONENTES, EPOCAS, ESTADOS, GRUPOS, PARAM, PARAMS, aCuerpo, acciones, avisosPrevia, cambios, cambiosComp, cambiosEp, cobertura, copiaTabla, defectos, desdeCuerpo, formatea, mismasEp, mismosComp, mismosValores, numero, redondea, resumen, simula, tablaDePartida, valida, validaEp } from "./olivos_puro.js";

const copia = o => JSON.parse(JSON.stringify(o));
const PESTANAS = [["esc", "Escalera"], ["com", "Componentes"], ["epo", "Épocas"], ["real", "Olivo real"], ["his", "Historial"]];
const FINCA_ID = /^[a-z0-9_]+$/;

export function iniciaOlivos({ sesion }) {
  let versiones = [], publicada = null, enPrueba = null, pub = null, prueba = null;   // pub y prueba: { version, vals, comp, ep, cuerpo }
  let vals = defectos(), comp = {}, ep = null, epSel = "comun", base = null, miBorrador = null, cargado = false, pest = "esc", cargas = 0, ocupado = false;
  const cuerpos = new Map();   // versión → { cuerpo, vals, comp, ep } (una versión no se reescribe: se guarda para siempre)
  const real = iniciaOlivoReal();   // OF8: un olivo real por su id, con sus escalones lado a lado (no toca la configuración)
  const msgsApi = [];          // lo que la api dijo del último intento (config_no_valida)

  // ---------------------------------------------------------------- piezas fijas (se construyen una vez)
  const tabs = $("#oPestanas");
  for (const [id, nombre] of PESTANAS) tabs.append(h("button", { role: "tab", type: "button", id: "t-" + id, "aria-controls": "p-" + id, "aria-selected": String(id === pest), tabindex: id === pest ? null : "-1", "data-pest": id }, nombre));
  tabs.addEventListener("click", e => { const b = e.target.closest("[data-pest]"); if (b) ve(b.dataset.pest, true); });
  tabs.addEventListener("keydown", e => {
    const i = PESTANAS.findIndex(p => p[0] === pest);
    const j = e.key === "ArrowRight" ? (i + 1) % PESTANAS.length : e.key === "ArrowLeft" ? (i + PESTANAS.length - 1) % PESTANAS.length : e.key === "Home" ? 0 : e.key === "End" ? PESTANAS.length - 1 : -1;
    if (j >= 0) { e.preventDefault(); ve(PESTANAS[j][0], true); }
  });

  const sliders = {};
  for (const [g, titulo] of GRUPOS) {
    const caja = h("div", { class: "grupo-param" });
    $("#oForm").append(h("fieldset", null, h("legend", null, titulo), caja));
    for (const p of PARAMS.filter(x => x.g === g)) {
      const entrada = h("input", { type: "range", id: "r-" + p.k, min: p.min, max: p.max, step: p.paso, "aria-describedby": "d-" + p.k });
      const salida = h("output", { id: "o-" + p.k, for: "r-" + p.k });
      const fila = h("div", { class: "param", id: "par-" + p.k }, h("label", { for: "r-" + p.k }, p.n), salida, entrada,
        h("span", { class: "def", id: "d-" + p.k }, p.ayuda + " · por defecto " + (p.def === null ? "como escritorio" : formatea(p.k, p.def)) + " · " + formatea(p.k, p.min) + " a " + formatea(p.k, p.max)));
      entrada.addEventListener("input", () => { vals[p.k] = redondea(Number(entrada.value), p); sincroniza(); });
      caja.append(fila);
      sliders[p.k] = { entrada, salida, fila };
    }
  }
  // ---- Épocas (OF9): las filas se construyen una vez; pintaEpocas() solo cambia valores
  const celdas = {};
  for (const [e, n] of EPOCAS) {
    const ent = c => h("input", { class: "entrada", id: "ep-" + e + "-" + c, "data-e": e, "data-c": c, inputmode: "numeric", maxlength: "5", autocomplete: "off", placeholder: "MM-DD" });
    const d = ent("desde"), a = ent("hasta"), dias = h("td", { id: "ep-" + e + "-dias" });
    $("#eTabla").append(h("tr", { "data-epoca": e }, h("th", { scope: "row" }, n), h("td", null, h("label", { class: "vh", for: "ep-" + e + "-desde" }, "Desde, " + n), d),
      h("td", null, h("label", { class: "vh", for: "ep-" + e + "-hasta" }, "Hasta, " + n), a), dias));
    celdas[e] = { desde: d, hasta: a, dias };
  }
  $("#eTabla").addEventListener("input", ev => {
    const t = ev.target.closest("[data-e]"); if (!t) return;
    asegura()[t.dataset.e][t.dataset.c] = t.value.trim(); sincroniza();
  });
  $("#eFinca").addEventListener("change", () => { epSel = $("#eFinca").value; pintaEpocas(); });
  $("#eDef").addEventListener("click", () => { const t = asegura(); for (const [e] of EPOCAS) t[e] = copiaTabla(tablaDePartida())[e]; sincroniza(); aviso("Valores de partida en esta tabla (no se publica nada hasta que lo digas)"); });
  $("#eRepo").addEventListener("click", () => { ep = null; epSel = "comun"; sincroniza(); aviso("Sin épocas en la configuración: valdría el calendario del repo"); });
  $("#eAnade").addEventListener("click", () => {
    const id = $("#eNueva").value.trim();
    if (!FINCA_ID.test(id)) { aviso("El id de la finca son minúsculas, cifras y «_» (como en la finca_id de la api)", "mal"); return; }
    const x = asegura(); if (!x || ep.fincas[id]) { aviso(ep.fincas[id] ? "Esa finca ya tiene su tabla" : "No se pudo crear", "mal"); return; }
    ep.fincas[id] = copiaTabla(ep.comun); epSel = id; $("#eNueva").value = ""; sincroniza(); aviso("La finca " + id + " tiene su tabla propia (empieza como copia de la común)");
  });
  $("#eQuita").addEventListener("click", () => { if (!ep || epSel === "comun") return; const id = epSel; delete ep.fincas[id]; epSel = "comun"; sincroniza(); aviso("La finca " + id + " vuelve a la tabla común"); });
  /** Crea el bloque de épocas (a partir de los valores de partida) si no hay y devuelve la tabla que se está editando. */
  function asegura() {
    if (!ep) ep = { comun: tablaDePartida(), fincas: {} };
    return epSel === "comun" || !ep.fincas[epSel] ? ep.comun : ep.fincas[epSel];
  }

  const sAparato = $("#oAparato"), sPerfil = $("#oPerfil");
  for (const [k, n] of Object.entries(APARATOS)) sAparato.append(h("option", { value: k }, n[0].toUpperCase() + n.slice(1)));
  for (const i of [0, 1, 2, 3]) sPerfil.append(h("option", { value: String(i) }, "perfil " + i));
  const cambiaAparato = () => { $("#oPerfilCampo").hidden = sAparato.value !== "gafas"; pintaPrevia(); };
  sAparato.addEventListener("change", cambiaAparato); sPerfil.addEventListener("change", pintaPrevia);
  cambiaAparato();
  window.addEventListener("resize", () => { if (!$("#s-olivos").hidden && pest === "esc") pintaPrevia(); });

  $("#oDefecto").addEventListener("click", () => { vals = defectos(); comp = {}; ep = null; epSel = "comun"; sincroniza(); aviso("Valores por defecto en el borrador (no se publica nada hasta que lo digas)"); });
  $("#oDescarta").addEventListener("click", () => { reiniciaEditor(); aviso("Cambios descartados: vuelves a lo último en prueba o publicado"); });
  $("#oRecarga").addEventListener("click", () => refresca(false));
  $("#oGuarda").addEventListener("click", () => acciona(async () => {
    const igual = !!miBorrador && mismosValores(miBorrador.vals, vals) && mismosComp(miBorrador.comp, comp) && mismasEp(miBorrador.ep, ep), v = await guardaBorrador();
    if (v) aviso(igual ? "Ya estaba guardado como borrador v" + v : "Borrador v" + v + " guardado (no lo ve nadie todavía)");
  }));
  $("#oPrueba").addEventListener("click", () => acciona(publicaEnPrueba));
  $("#oProbar").addEventListener("click", probar);
  $("#oPublica").addEventListener("click", publicaParaTodos);

  function ve(id, foco) {
    pest = id;
    for (const [p] of PESTANAS) {
      const b = $("#t-" + p), sel = p === id;
      b.setAttribute("aria-selected", String(sel)); if (sel) b.removeAttribute("tabindex"); else b.setAttribute("tabindex", "-1");
      $("#p-" + p).hidden = !sel;
    }
    $("#oBarra").hidden = id === "his" || id === "real";
    if (foco) $("#t-" + id).focus();
    if (id === "esc") pintaPrevia();
    if (id === "epo") pintaEpocas();
    if (id === "his") pintaHistorial();
    if (id === "real") real.abre();
  }

  // ---------------------------------------------------------------- estado: carga y reinicio
  async function trae(version) {
    if (cuerpos.has(version)) return cuerpos.get(version);
    const r = await api("GET", "/api/admin/config/" + version);
    if (!r.ok) return null;
    const x = { cuerpo: r.datos.cuerpo, ...desdeCuerpo(r.datos.cuerpo) };
    cuerpos.set(version, x);
    return x;
  }
  async function refresca(primera) {
    const n = ++cargas;
    const r = await api("GET", "/api/admin/config");
    if (n !== cargas) return;
    if (!r.ok) { aviso(r.mensaje, "mal"); $("#oEstado").textContent = r.estado === 403 ? "Esta sección es solo para la cuenta de administración." : r.mensaje; return; }
    versiones = r.datos.versiones; publicada = r.datos.publicada; enPrueba = r.datos.en_prueba;
    const [a, b] = await Promise.all([publicada ? trae(publicada) : null, enPrueba ? trae(enPrueba) : null]);
    if (n !== cargas) return;
    pub = a && { version: publicada, ...a }; prueba = b && { version: enPrueba, ...b };
    if (miBorrador && !versiones.some(v => v.version === miBorrador.version && v.estado === "borrador")) miBorrador = null;
    if (primera || !cargado) { cargado = true; reiniciaEditor(); } else sincroniza();
    if (pest === "his") pintaHistorial();
  }
  function reiniciaEditor() {
    const x = prueba || pub;
    vals = x ? copia(x.vals) : defectos(); comp = x ? copia(x.comp) : {}; ep = x ? copia(x.ep) : null; epSel = "comun";
    base = (x && x.cuerpo) || (pub && pub.cuerpo) || null;
    sincroniza();
  }
  const refPub = () => (pub ? pub.vals : defectos());
  const refPubComp = () => (pub ? pub.comp : {});
  const igualA = x => !!x && mismosValores(vals, x.vals) && mismosComp(comp, x.comp) && mismasEp(ep, x.ep);
  const errsEp = () => validaEp(ep).filter(m => m.nivel === "mal");

  // ---------------------------------------------------------------- pintado
  function sincroniza() {
    const ref = refPub(), dif = cambios(vals, ref);
    for (const p of PARAMS) {
      const s = sliders[p.k], v = vals[p.k];
      s.entrada.value = String(v === null ? p.max : v); s.salida.textContent = formatea(p.k, v);
      s.fila.classList.toggle("cambiado", v !== ref[p.k]);
    }
    const nCambios = dif.length + cambiosComp(comp, refPubComp()).length + (mismasEp(ep, pub ? pub.ep : null) ? 0 : 1);
    const e = vacia($("#oEstado"));
    const quien = v => { const f = versiones.find(x => x.version === v); return f ? " · cuenta " + f.autor_id + ", " + fecha(f.estado_en) : ""; };
    e.append(...[publicada ? [h("span", { class: "pill p-ok" }, "publicada v" + publicada), quien(publicada)] : h("span", { class: "pill p-suave" }, "nada publicado: manda lo del código"),
      enPrueba ? [" · ", h("span", { class: "pill p-info" }, "en prueba v" + enPrueba + " (solo cuentas de oficina)")] : null,
      " · borrador: ", nCambios ? h("b", null, nCambios + " cambio" + (nCambios > 1 ? "s" : "")) : "sin cambios", " respecto a lo publicado"].flat().filter(x => x !== null));
    pintaMensajes();
    pintaComponentes();
    pintaEpocas();
    if (pest === "esc" && !$("#s-olivos").hidden) pintaPrevia();
  }
  function pintaMensajes() {
    const errs = [...valida(vals), ...errsEp()], ul = vacia($("#oMsgs"));
    for (const m of errs) ul.append(h("li", { class: m.nivel }, m.texto));
    for (const t of msgsApi) ul.append(h("li", { class: "mal" }, t));
    if (!errs.length && !msgsApi.length) ul.append(h("li", { class: "ok" }, "Los valores respetan los límites del contrato" + (ep ? " y las épocas cubren los 366 días" : "")));
    const sin = errs.length > 0 || ocupado, igualPrueba = igualA(prueba);
    $("#oGuarda").disabled = sin; $("#oPrueba").disabled = sin || igualPrueba; $("#oProbar").disabled = sin;
    $("#oPublica").disabled = sin || !igualPrueba;
    $("#oNotaPub").textContent = !enPrueba ? "Para publicar para todos, antes se publica en prueba (decisión 113)." : igualPrueba ? "Estos valores son los que están en prueba (v" + enPrueba + "): ya se pueden publicar para todos."
      : "Estos valores no son los de la prueba (v" + enPrueba + "): publícalos en prueba y comprueba el mundo antes de publicarlos para todos.";
  }
  function pintaPrevia() {
    if ($("#s-olivos").hidden || pest !== "esc") return;
    const ap = sAparato.value, perfil = Number(sPerfil.value), R = simula(vals, ap, perfil), cv = $("#oLienzo"), rc = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rc.width) {
      cv.width = Math.round(rc.width * dpr); cv.height = Math.round(rc.height * dpr);
      const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rc.width, H = rc.height, cx = W / 2, cy = H / 2, esc = Math.min(W, H) / 2 / 66, css = getComputedStyle(document.documentElement);
      c.fillStyle = "#6e6040"; c.fillRect(0, 0, W, H);
      const U = [vals.u0, vals.u1, vals.u2], D = U.map(u => 4 * R.kPx / (u * R.s));
      D.forEach((d, k) => {
        const b = Math.min(vals.banda, k ? (d - D[k - 1]) * 0.45 : d * 0.45);
        c.fillStyle = "rgba(255,255,255,.10)"; c.beginPath(); c.arc(cx, cy, (d + b) * esc, 0, Math.PI * 2); c.arc(cx, cy, Math.max(0, d - b) * esc, 0, Math.PI * 2, true); c.fill();
        c.strokeStyle = "rgba(255,255,255,.75)"; c.setLineDash([6, 5]); c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, d * esc, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.fillStyle = "#fff"; c.font = "12px system-ui"; c.fillText(["E0|E1", "E1|E2", "E2|lejano"][k] + " " + numero(d, 1) + " m", cx + d * esc * 0.71 + 4, cy - d * esc * 0.71 - 4);
      });
      const col = ["--e0", "--e1", "--e2", "--e3"].map(v => css.getPropertyValue(v).trim());
      CAMPO.forEach((t, i) => {
        const x = cx + t.x * esc, y = cy + t.y * esc; if (x < -10 || y < -10 || x > W + 10 || y > H + 10) return;
        const l = R.lv[i]; c.fillStyle = col[l]; c.beginPath(); c.arc(x, y, Math.max(1.5, t.r8 * vals.factor * esc * (l === 3 ? 0.6 : 1)), 0, Math.PI * 2); c.fill();
      });
      c.fillStyle = "#ffd166"; c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx + 6, cy + 6); c.lineTo(cx - 6, cy + 6); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.8)"; c.font = "12px system-ui"; c.fillText("Tú (paseando) · rejilla de 7 m · " + APAR[ap].n, 10, H - 10);
    }
    const nom = ap === "gafas" ? "E2-VR" : "E2";
    const cif = vacia($("#oCifras"));
    for (const [n, v] of [["E0", R.n[0]], ["E1", R.n[1]], [nom, R.n[2]], ["lejanos", R.n[3]]]) cif.append(h("div", null, h("small", null, n), h("span", { class: "cifra" }, v)));
    $("#oTriTxt").textContent = "Triángulos de la escalera: " + numero(R.tri) + " de " + numero(R.tope) + " (" + APAR[ap].n + (ap === "gafas" ? ", perfil " + perfil : "") + ") · s = " + numero(R.s, 2);
    $("#oMeter").value = Math.min(1, R.tri / R.tope);
    const m = avisosPrevia(R, ap);
    if (!m.length) m.push({ nivel: "ok", texto: "Cabe en " + APAR[ap].n + " con estos valores (simulado)" });
    const ul = vacia($("#oMsgsPrevia"));
    for (const x of m) ul.append(h("li", { class: x.nivel }, x.texto));
  }
  function pintaComponentes() {
    const ids = [...COMPONENTES.map(c => c.id)];
    for (const id of Object.keys(comp)) if (!ids.includes(id)) ids.push(id);
    const caja = $("#oComp");
    // se pinta de nuevo solo si cambia la lista (para no perder el foco al elegir)
    if (caja.dataset.ids !== ids.join()) {
      caja.dataset.ids = ids.join(); vacia(caja);
      for (const id of ids) {
        const c = COMPONENTES.find(x => x.id === id) || { id, n: id, ayuda: "no lo conoce el motor de hoy: se conserva y se ignora" };
        const sel = h("select", { class: "entrada", id: "c-" + id, "data-id": id },
          h("option", { value: "" }, "Por defecto (el del manifiesto)"), h("option", { value: "si" }, "Encendido"), h("option", { value: "no" }, "Apagado"));
        sel.addEventListener("change", () => { if (sel.value === "") delete comp[id]; else comp[id] = sel.value === "si"; sincroniza(); });
        caja.append(h("div", { class: "param comp", id: "cp-" + id }, h("label", { for: "c-" + id }, c.n, " ", h("code", null, id)), h("span", null), sel, h("span", { class: "def" }, c.ayuda)));
      }
    }
    for (const id of ids) {
      const sel = $("#c-" + id), v = comp[id] === undefined ? "" : comp[id] ? "si" : "no";
      if (sel.value !== v) sel.value = v;
      $("#cp-" + id).classList.toggle("cambiado", comp[id] !== refPubComp()[id]);
    }
  }
  function pintaEpocas() {
    if (!$("#p-epo")) return;
    const sel = $("#eFinca"), ids = ["comun", ...(ep ? Object.keys(ep.fincas) : [])];
    if (!ids.includes(epSel)) epSel = "comun";
    if (sel.dataset.ids !== ids.join()) {
      sel.dataset.ids = ids.join(); vacia(sel);
      for (const id of ids) sel.append(h("option", { value: id }, id === "comun" ? "Común (toda finca sin tabla propia)" : "Finca " + id + " (tabla propia)"));
    }
    sel.value = epSel;
    const tabla = !ep ? tablaDePartida() : epSel === "comun" ? ep.comun : ep.fincas[epSel], cob = cobertura(tabla);
    for (const [e] of EPOCAS) {
      const c = celdas[e];
      if (c.desde.value !== tabla[e].desde) c.desde.value = tabla[e].desde;
      if (c.hasta.value !== tabla[e].hasta) c.hasta.value = tabla[e].hasta;
      c.dias.textContent = String(cob.dias[e]);
    }
    $("#eQuita").disabled = epSel === "comun";
    const refEp = pub ? pub.ep : null, d = cambiosEp(ep, refEp);
    vacia($("#eEstado")).append(...(!ep ? [h("span", { class: "pill p-suave" }, "sin épocas en la configuración"), " vale el calendario del repo (valores de partida, sin respaldo de campo). Al editar se crea la tabla propia."]
      : [h("span", { class: "pill p-info" }, "épocas propias"), " " + (d.length ? d.length + " ventana" + (d.length > 1 ? "s" : "") + " distinta" + (d.length > 1 ? "s" : "") + " de lo publicado" : "iguales a lo publicado")]));
    const ul = vacia($("#eMsgs")), todos = validaEp(ep), mostrar = !ep ? [] : todos;
    for (const m of mostrar) ul.append(h("li", { class: m.nivel }, m.texto));
    if (!todos.some(m => m.nivel === "mal")) ul.append(h("li", { class: "ok" }, "Cubre los 366 días, una época cada día" + (ep ? "" : " (los valores de partida)")));
  }
  function pintaHistorial() {
    const cuerpo = vacia($("#oHis"));
    if (!versiones.length) { cuerpo.append(h("tr", null, h("td", { colspan: "5", class: "nota" }, "Todavía no hay ninguna versión: el motor usa lo del código."))); return; }
    for (const f of versiones) {
      const [clase, nombre] = ESTADOS[f.estado] || ["p-suave", f.estado], ac = acciones(f.estado), x = cuerpos.get(f.version);
      const botones = h("td", { class: "acciones" },
        ac.volver ? h("button", { class: "boton peq", type: "button", onclick: () => volver(f) }, "Volver a esta") : null,
        ac.alBorrador ? h("button", { class: "boton peq suave", type: "button", onclick: () => alBorrador(f) }, "Al borrador") : null,
        ac.retirar ? h("button", { class: "boton peq peligro-suave", type: "button", onclick: () => retira(f) }, "Retirar") : null);
      cuerpo.append(h("tr", { "data-version": f.version },
        h("td", null, "v" + f.version), h("td", null, h("span", { class: "pill " + clase }, nombre)),
        h("td", null, "cuenta " + f.autor_id + " · " + fecha(f.estado_en), f.copia_de ? h("span", { class: "interno" }, "copia de v" + f.copia_de) : null),
        h("td", null, f.nota || "", h("span", { class: "interno" }, x ? resumen(x.vals, x.comp, x.ep) : "…")), botones));
    }
    // los cuerpos que faltan (los 30 últimos) se piden y se vuelve a pintar; una versión no cambia, así que no se piden dos veces
    const faltan = versiones.slice(0, 30).filter(f => !cuerpos.has(f.version));
    if (faltan.length) { const n = cargas; Promise.all(faltan.map(f => trae(f.version))).then(() => { if (pest === "his" && n === cargas) pintaHistorial(); }); }
  }

  // ---------------------------------------------------------------- acciones sobre las versiones
  async function acciona(fn) {
    if (ocupado) return;
    ocupado = true; pintaMensajes();
    try { await fn(); } finally { ocupado = false; pintaMensajes(); }
  }
  function fallo(r) {
    msgsApi.length = 0;
    if (r.error === "config_no_valida" && r.datos && Array.isArray(r.datos.detalles)) msgsApi.push(...r.datos.detalles.map(d => "La api no lo acepta: " + d));
    aviso(r.mensaje || "No se pudo completar.", "mal"); pintaMensajes();
  }
  /** Guarda los valores de la pantalla como borrador (o devuelve el que ya se guardó igual). null si la api no lo acepta. */
  async function guardaBorrador() {
    if (valida(vals).length || errsEp().length) return null;
    if (miBorrador && mismosValores(miBorrador.vals, vals) && mismosComp(miBorrador.comp, comp) && mismasEp(miBorrador.ep, ep)) return miBorrador.version;
    const cuerpo = aCuerpo(vals, comp, base, ep), nota = resumen(vals, comp, ep);
    const r = await api("POST", "/api/admin/config", { cuerpo, nota: nota.slice(0, 500) });
    if (!r.ok) { fallo(r); return null; }
    msgsApi.length = 0;
    const anterior = miBorrador; miBorrador = { version: r.datos.version, vals: copia(vals), comp: copia(comp), ep: copia(ep) };
    if (anterior) await api("POST", "/api/admin/config/" + anterior.version + "/retirar");   // el borrador de antes ya no sirve (se retira, no se borra)
    await refresca(false);
    return r.datos.version;
  }
  async function publicaEnPrueba() {
    if (igualA(prueba)) { aviso("Estos valores ya están en prueba (v" + enPrueba + ")"); return true; }
    const v = await guardaBorrador(); if (!v) return false;
    const r = await api("POST", "/api/admin/config/" + v + "/prueba");
    if (!r.ok) { fallo(r); return false; }
    miBorrador = null;
    await refresca(false);
    aviso("v" + v + " en prueba: solo las cuentas de oficina la cargan, al recargar el mundo");
    return true;
  }
  async function probar() {
    if (ocupado) return;
    const w = window.open("", "_blank");   // abierta ya, con el gesto de la persona (después de esperar al servidor el navegador no la dejaría)
    ocupado = true; pintaMensajes();
    let bien = false;
    try { bien = igualA(prueba) || await publicaEnPrueba(); } finally { ocupado = false; pintaMensajes(); }
    if (w && bien) { w.opener = null; w.location.href = "/finca/?debug"; aviso("Se abre el mundo en otra pestaña con la versión en prueba (v" + enPrueba + ")"); }
    else if (w) w.close();
  }
  function publicaParaTodos() {
    if (!igualA(prueba)) return;
    const v = prueba.version, ref = pub ? pub.vals : defectos(), refC = pub ? pub.comp : {};
    const lista = [...cambios(vals, ref).map(k => PARAM[k].n + ": " + formatea(k, ref[k]) + " → " + formatea(k, vals[k])),
      ...cambiosComp(comp, refC).map(id => ((COMPONENTES.find(c => c.id === id) || { n: id }).n) + ": " + estadoComp(refC[id]) + " → " + estadoComp(comp[id])),
      ...cambiosEp(ep, pub ? pub.ep : null)], hayEp = !mismasEp(ep, pub ? pub.ep : null);
    confirma({
      titulo: "Publicar v" + v + " para todos",
      cuerpo: [h("p", null, "Cambia cómo se dibuja el mundo para todas las familias, en su próxima carga:"),
        h("ul", null, lista.length ? lista.map(t => h("li", null, t)) : h("li", null, "sin cambios respecto a lo publicado")),
        hayEp ? h("p", null, "Cambian las épocas: el hornero re-hornea lo que cambie en su próxima comprobación (como mucho 10 minutos; míralo en Sistema).") : null,
        h("p", { class: "nota" }, "Pide haber entrado hace menos de 15 minutos. Se puede volver atrás desde el historial; ninguna versión se reescribe.")],
      si: "Publicar para todos",
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/config/" + v + "/publicar"));
        if (!r.ok) return r.mensaje;
        await refresca(false); reiniciaEditor();
        aviso("v" + v + " publicada: la verán todos al recargar" + (hayEp ? "; el hornero recoge las épocas en su próxima comprobación (≤ 10 min, mira Sistema)" : ""));
        return undefined;
      },
    });
  }
  const estadoComp = v => (v === undefined ? "por defecto" : v ? "encendido" : "apagado");
  function volver(f) {
    const x = cuerpos.get(f.version);
    confirma({
      titulo: "Volver a v" + f.version,
      cuerpo: [h("p", null, ["Se publica una ", h("b", null, "versión nueva"), " con lo de la v" + f.version + " y para todos. Ninguna versión se reescribe."]), h("p", { class: "nota" }, x ? resumen(x.vals, x.comp, x.ep) : ""),
        h("p", { class: "nota" }, "Pide haber entrado hace menos de 15 minutos.")],
      si: "Volver y publicar",
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/config/" + f.version + "/volver"));
        if (!r.ok) return r.mensaje + (r.datos && r.datos.detalles ? " " + r.datos.detalles.join("; ") : "");
        await refresca(false); reiniciaEditor();
        aviso("Vuelta a v" + f.version + ": publicada como v" + r.datos.version);
        return undefined;
      },
    });
  }
  async function alBorrador(f) {
    const x = await trae(f.version);
    if (!x) { aviso("No se pudo leer la v" + f.version, "mal"); return; }
    vals = copia(x.vals); comp = copia(x.comp); ep = copia(x.ep); epSel = "comun"; sincroniza(); ve("esc", true);
    aviso("Los valores de v" + f.version + " están en el borrador (no se publica hasta que lo digas)");
  }
  async function retira(f) {
    const r = await api("POST", "/api/admin/config/" + f.version + "/retirar");
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    await refresca(false);
    aviso("v" + f.version + " retirada");
  }

  ve("esc", false);
  return {
    abre() { return refresca(!cargado); },
    ve,
    /** Solo lectura, para la prueba de Chrome. */
    estado() {
      return { cargado, publicada, enPrueba, versiones: versiones.map(v => ({ version: v.version, estado: v.estado, nota: v.nota, copia_de: v.copia_de })), vals: copia(vals), comp: copia(comp), ep: copia(ep), epSel,
        errores: [...valida(vals), ...errsEp()].map(m => m.texto), pestana: pest, rol: sesion.rol, boton: { prueba: !$("#oPrueba").disabled, publica: !$("#oPublica").disabled } };
    },
  };
}
