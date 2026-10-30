// Piezas comunes de la oficina: DOM construido nodo a nodo (todo es texto: un correo o un nombre nunca se interpretan como HTML), llamadas
// a la api del mismo origen, avisos, diálogos de confirmación y la «confirmación reciente» (ADR-0024).
export const $ = (s, r) => (r || document).querySelector(s);

/** h("button", { class: "boton", onclick: fn, "data-x": 1 }, "texto", otroNodo…) */
export function h(etiqueta, atributos, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const hijo of hijos.flat()) if (hijo !== null && hijo !== undefined && hijo !== false) el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  return el;
}
export const vacia = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const fecha = iso => (iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—");
export const dia = iso => (iso ? new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" }) : "—");

// ------------------------------------------------------------------ api
let oficinaAbierta = false;
/** oficina.js lo llama cuando la sesión ya vale para la oficina (OF13: abierta con la llave, si es obligatoria). */
export function marcaOficinaAbierta() { oficinaAbierta = true; }
/**
 * Llama a la api. Devuelve { ok, estado, datos, error, mensaje }. Una sesión caducada (401) vuelve a la portada.
 * Con `crudo` devuelve el Response entero en `respuesta` (para descargar ficheros).
 */
export async function api(metodo, url, cuerpo, opciones) {
  const init = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
  if (cuerpo !== undefined) { init.body = JSON.stringify(cuerpo); init.headers["content-type"] = "application/json"; }
  let r;
  try { r = await fetch(url, init); } catch { return { ok: false, estado: 0, error: "sin_red", mensaje: "No se pudo contactar con el servidor. Comprueba la conexión." }; }
  if (r.status === 401) { location.href = "/"; return { ok: false, estado: 401, error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." }; }
  if (opciones && opciones.crudo && r.ok) return { ok: true, estado: r.status, respuesta: r };
  let datos = null;
  try { datos = r.status === 204 ? null : await r.json(); } catch { /* sin cuerpo */ }
  // OF13: la sesión dejó de valer para la oficina (p. ej. revocaron la llave con la que se entró): vuelta a la pantalla de la llave
  // (solo con la oficina ya abierta: antes, la pantalla de la llave ya está a la vista y recargar no arreglaría nada)
  if (r.status === 403 && datos && datos.error === "llave_requerida" && oficinaAbierta) location.reload();
  return { ok: r.ok, estado: r.status, datos, error: datos && datos.error, mensaje: (datos && datos.mensaje) || (r.ok ? "" : "No se pudo completar (" + r.status + ").") };
}

// ------------------------------------------------------------------ avisos
export function aviso(texto, tipo, deshacer) {
  const d = h("div", { class: "aviso" + (tipo === "mal" ? " mal" : "") }, h("span", null, texto));
  $("#avisos").append(d);
  setTimeout(() => d.remove(), tipo === "mal" ? 9000 : 5000);
  if (deshacer) d.append(h("button", { class: "boton peq", type: "button", onclick: () => { deshacer(); d.remove(); } }, "Deshacer"));
  $("#anuncio").textContent = texto;
}

// ------------------------------------------------------------------ diálogos
/**
 * Confirma una acción. `cuerpo`: nodos del texto; `escribe`: texto que hay que teclear tal cual (p. ej. el correo) para habilitar el botón.
 * `hecho()` puede devolver un mensaje de error (texto) para dejar el diálogo abierto con él; undefined cierra.
 */
export function confirma({ titulo, cuerpo, si, escribe, hecho }) {
  const dl = $("#dlgConfirma"), entrada = $("#dlgConfEntrada"), btn = $("#dlgConfSi");
  $("#dlgConfT").textContent = titulo;
  vacia($("#dlgConfTexto")).append(...[].concat(cuerpo));
  btn.textContent = si; btn.disabled = !!escribe;
  $("#dlgConfEscribe").hidden = !escribe; entrada.value = ""; $("#dlgConfError").textContent = "";
  if (escribe) $("#dlgConfEscribeT").textContent = "Escribe «" + escribe + "» para confirmar";
  entrada.oninput = () => { btn.disabled = entrada.value.trim().toLowerCase() !== String(escribe).toLowerCase(); };
  $("#dlgConfNo").onclick = () => dl.close();
  $("#fConfirma").onsubmit = async e => {
    e.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    const err = await hecho();
    btn.disabled = false;
    if (err) $("#dlgConfError").textContent = err; else dl.close();
  };
  dl.showModal();
  (escribe ? entrada : btn).focus();
}

/**
 * Ejecuta `accion()` (que devuelve el resultado de api()). Si la api pide confirmación reciente (403 confirmacion_requerida), ofrece
 * mandar un enlace nuevo a la propia cuenta y reintenta cuando la persona dice que ya ha entrado. Devuelve el último resultado.
 */
export async function conConfirmacion(accion) {
  for (;;) {
    const r = await accion();
    if (r.error !== "confirmacion_requerida") return r;
    const sigue = await pideReconfirmar();
    if (!sigue) return r;
  }
}
// OF13: con la llave de acceso obligatoria, la confirmación reciente es usar la llave (oficina.js pone aquí usaLlave de llave.js).
let confirmador = null;
/** `fn()` devuelve el resultado de api() de la aserción WebAuthn; null vuelve al enlace por correo. */
export function fijaConfirmador(fn) { confirmador = fn; }
const TEXTO_RECONF_ENLACE = "Esto es delicado y pide haber entrado hace poco. Te mandamos un enlace nuevo a tu correo: ábrelo en este mismo navegador (vale 15 minutos) y vuelve aquí.";
const TEXTO_RECONF_LLAVE = "Esto es delicado y pide haberte confirmado hace poco. Usa tu llave de acceso (la huella, la cara o el PIN de este aparato, tu teléfono o tu llave física) y se reintenta solo.";

function pideReconfirmar() {
  return new Promise(resuelve => {
    const dl = $("#dlgReconfirma"), estado = $("#reconfEstado"), manda = $("#reconfManda"), llave = $("#reconfLlave"), conLlave = !!confirmador;
    estado.textContent = ""; manda.disabled = false; llave.disabled = false;
    $("#reconfTexto").textContent = conLlave ? TEXTO_RECONF_LLAVE : TEXTO_RECONF_ENLACE;
    manda.hidden = conLlave; $("#reconfReintenta").hidden = conLlave; llave.hidden = !conLlave;
    let fin = false;
    const cierra = valor => { if (fin) return; fin = true; dl.close(); resuelve(valor); };
    llave.onclick = async () => {
      llave.disabled = true;
      estado.textContent = "Esperando a tu llave…";
      const r = await confirmador();
      if (r.ok) { cierra(true); return; }
      estado.textContent = r.mensaje; llave.disabled = false;
    };
    manda.onclick = async () => {
      manda.disabled = true;
      const r = await api("POST", "/api/oficina/confirmar", {});
      estado.textContent = r.ok ? "Enlace mandado a tu correo. Ábrelo en este navegador y vuelve aquí." : r.mensaje;
      if (!r.ok) manda.disabled = false;
    };
    $("#reconfNo").onclick = () => cierra(false);
    $("#fReconfirma").onsubmit = e => { e.preventDefault(); cierra(true); };
    dl.onclose = () => cierra(false);
    dl.showModal();
  });
}
