// Llave de acceso de la oficina (OF13, contratos/sesion.md § Llave de acceso). La ceremonia la hace @simplewebauthn/browser
// (regla 12): aquí se piden las opciones a la api, se le pasan y se devuelve la respuesta. Tres piezas:
//   - la pantalla de la llave (antes de nada, si la sesión aún no se abrió con ella): crear la llave la primera vez o entrar;
//   - usaLlave(), que comun.js usa como «confirmación reciente» cuando la llave es obligatoria;
//   - la tarjeta «Llaves de acceso» de Sistema: las propias (añadir otra, revocar) y, para admin, las de todas las cuentas.
// DOM con h() (texto, nunca HTML); nada en línea; solo el mismo origen.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { $, api, aviso, conConfirmacion, confirma, h, vacia } from "./comun.js";
import { nombrePropuesto, pantallaLlave, resumenLlave, textoErrorLlave } from "./llave_puro.js";
import { hace } from "./sistema_puro.js";

const SIN_WEBAUTHN = { ok: false, error: "sin_webauthn", mensaje: "Este navegador no admite llaves de acceso. Abre la oficina en un Chrome, Edge, Safari o Firefox al día." };

/** Crea una llave en este aparato y la da de alta en la cuenta. Devuelve el resultado de api() (o uno con el error del navegador). */
export async function creaLlave(nombre) {
  if (!browserSupportsWebAuthn()) return SIN_WEBAUTHN;
  const o = await api("POST", "/api/oficina/llaves/alta/opciones", {});
  if (!o.ok) return o;
  let respuesta;
  try { respuesta = await startRegistration({ optionsJSON: o.datos }); } catch (e) { return { ok: false, error: "navegador", mensaje: textoErrorLlave(e) }; }
  return api("POST", "/api/oficina/llaves/alta", nombre ? { nombre, respuesta } : { respuesta });
}

/** Usa una llave de la cuenta: abre la sesión de oficina o, ya dentro, es la confirmación reciente. */
export async function usaLlave() {
  if (!browserSupportsWebAuthn()) return SIN_WEBAUTHN;
  const o = await api("POST", "/api/oficina/llaves/entrada/opciones", {});
  if (!o.ok) return o;
  let respuesta;
  try { respuesta = await startAuthentication({ optionsJSON: o.datos }); } catch (e) { return { ok: false, error: "navegador", mensaje: textoErrorLlave(e) }; }
  return api("POST", "/api/oficina/llaves/entrada", { respuesta });
}

// ------------------------------------------------------------------ la pantalla de la llave
/** Si la sesión aún necesita la llave, enseña su pantalla (y esconde la oficina) y devuelve true. */
export function muestraPantallaLlave(llave) {
  const p = pantallaLlave(llave);
  if (!p.pantalla) return false;
  $("#app").hidden = true;
  $("#pLlave").hidden = false;
  const texto = $("#llaveTexto"), estado = $("#llaveEstado");
  if (!browserSupportsWebAuthn()) {
    texto.textContent = SIN_WEBAUTHN.mensaje;
    $("#fLlaveAlta").hidden = true; $("#llaveEntraP").hidden = true;
  } else if (p.bloqueada) {
    texto.textContent = "Tu cuenta ya tuvo llaves de acceso y ahora no le queda ninguna. Pide a un admin que te «rehabilite el alta» en Sistema; después, vuelve a entrar con un enlace y crea una nueva.";
    $("#fLlaveAlta").hidden = true; $("#llaveEntraP").hidden = true;
  } else {
    texto.textContent = p.entrada
      ? "La oficina pide tu llave de acceso: la huella, la cara o el PIN de este aparato, tu teléfono o tu llave física."
      : "La oficina pide una llave de acceso, además del enlace. Créala ahora en este aparato (con la huella, la cara o el PIN) o en tu teléfono; la próxima vez entrarás con ella.";
    $("#fLlaveAlta").hidden = !p.alta;
    $("#llaveEntraP").hidden = !p.entrada;
    if (p.alta && p.entrada) $("#llaveAltaB").textContent = "Crear otra llave (alta rehabilitada)";
    $("#llaveNombre").value = nombrePropuesto(navigator.userAgent);
  }
  const ocupado = si => { $("#llaveAltaB").disabled = si; $("#llaveEntraB").disabled = si; };
  $("#fLlaveAlta").onsubmit = async e => {
    e.preventDefault();
    ocupado(true); estado.textContent = "Sigue las indicaciones de tu aparato…";
    const r = await creaLlave($("#llaveNombre").value.trim());
    ocupado(false);
    if (r.ok) { estado.textContent = "Llave creada. Entrando en la oficina…"; location.reload(); } else estado.textContent = r.mensaje;
  };
  $("#llaveEntraB").onclick = async () => {
    ocupado(true); estado.textContent = "Esperando a tu llave…";
    const r = await usaLlave();
    ocupado(false);
    if (r.ok) { estado.textContent = "Entrando en la oficina…"; location.reload(); } else estado.textContent = r.mensaje;
  };
  $("#llaveSalir").onclick = async () => {
    await fetch("/api/sesion/salir", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    location.href = "/";
  };
  $("#llaveT").focus();
  return true;
}

// ------------------------------------------------------------------ la tarjeta de Sistema
export function iniciaLlavesSistema({ sesion }) {
  const esAdmin = () => sesion.rol === "admin";

  const fila = (l, propia, cuenta) => h("li", { class: "aparato", "data-llave": l.id, "data-nombre": l.nombre, "data-esta": l.es_esta ? "1" : "0" },
    h("span", null, l.nombre, l.es_esta ? " (la de esta sesión)" : "", h("br"), h("span", { class: "nota" }, resumenLlave(l, hace) + " "),
      l.revocada_en ? h("span", { class: "pill p-mal" }, "revocada") : h("span", { class: "pill p-ok" }, "viva")),
    l.revocada_en ? null : h("span", { class: "en-linea" },
      h("button", { class: "boton peq", type: "button", "data-revoca": l.id, "data-propia": propia ? "1" : "0", "data-cuenta": cuenta || "",
        "aria-label": "Revocar la llave " + l.nombre + (cuenta ? " de " + cuenta : "") }, "Revocar")));

  async function cargaPropias() {
    const r = await api("GET", "/api/oficina/llaves");
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    const ul = vacia($("#sLlaves"));
    for (const l of r.datos.llaves.filter(x => !x.revocada_en).concat(r.datos.llaves.filter(x => x.revocada_en).slice(0, 3))) ul.append(fila(l, true));
    if (!ul.children.length) ul.append(h("li", { class: "nota" }, "No tienes llaves de acceso."));
    $("#sLlavesNota").textContent = r.datos.obligatoria
      ? "La oficina pide una llave para entrar y para lo delicado. Ten al menos dos (por ejemplo, el ordenador y el teléfono): si pierdes la única, solo otro admin puede rehabilitarte."
      : "La llave no es obligatoria en este servidor (GEMELO_OFICINA_LLAVE=no): puedes crearla y usarla igual.";
  }

  async function cargaTodas() {
    $("#sLlavesAdmin").hidden = !esAdmin();
    if (!esAdmin()) return;
    const r = await api("GET", "/api/admin/llaves");
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    const ul = vacia($("#sLlavesTodas"));
    for (const c of r.datos.cuentas) {
      const vivas = c.llaves.filter(l => !l.revocada_en);
      const sub = h("ul", { class: "lista" }, ...vivas.map(l => fila(l, false, c.nombre)));
      ul.append(h("li", { "data-cuenta": c.hogar_id },
        h("b", null, c.nombre), " ", h("span", { class: "nota" }, c.rol + " · " + vivas.length + (vivas.length === 1 ? " llave viva" : " llaves vivas")),
        c.rehabilitada_hasta ? [" ", h("span", { class: "pill p-aviso" }, "alta rehabilitada hasta " + new Date(c.rehabilitada_hasta).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }))] : null,
        c.es_tuya ? null : [" ", h("button", { class: "boton peq", type: "button", "data-rehabilita": c.hogar_id, "data-nombre": c.nombre, "aria-label": "Rehabilitar el alta de la llave de " + c.nombre }, "Rehabilitar el alta")],
        vivas.length ? sub : null));
    }
    if (!ul.children.length) ul.append(h("li", { class: "nota" }, "No hay cuentas de oficina."));
  }

  $("#fLlaveOtra").addEventListener("submit", async e => {
    e.preventDefault();
    const b = $("#bLlaveOtra");
    b.disabled = true;
    const r = await creaLlave($("#sLlaveNombre").value.trim());
    b.disabled = false;
    if (!r.ok) { aviso(r.mensaje, "mal"); return; }
    aviso("Llave añadida: " + r.datos.nombre); $("#sLlaveNombre").value = ""; cargaPropias(); cargaTodas();
  });

  $("#s-sistema").addEventListener("click", e => {
    const rv = e.target.closest("[data-revoca]"), rh = e.target.closest("[data-rehabilita]");
    if (rv) {
      const id = Number(rv.dataset.revoca), li = rv.closest("li"), nombre = li.dataset.nombre, propia = rv.dataset.propia === "1", esta = li.dataset.esta === "1";
      confirma({ titulo: "Revocar la llave", cuerpo: [h("p", null, "«" + nombre + "»" + (rv.dataset.cuenta ? " de " + rv.dataset.cuenta : "") + " deja de servir y se cierran en el acto las sesiones abiertas con ella. No se puede deshacer."),
        esta ? h("p", { class: "error" }, "Es la llave con la que entraste: te sacará de la oficina.") : null, h("p", { class: "nota" }, "Pide haberte confirmado hace poco.")], si: "Revocar",
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", (propia ? "/api/oficina/llaves/" : "/api/admin/llaves/") + id + "/revocar", {}));
        if (!r.ok) return r.mensaje;
        aviso("Llave revocada: " + nombre);
        if (r.datos && r.datos.era_esta) location.href = "/"; else { cargaPropias(); cargaTodas(); }
        return undefined;
      } });
    } else if (rh) {
      const id = Number(rh.dataset.rehabilita), nombre = rh.dataset.nombre;
      confirma({ titulo: "Rehabilitar el alta de la llave", cuerpo: [h("p", null, "Durante 24 horas, " + nombre + " podrá crear una llave nueva entrando solo con un enlace a su correo. Hazlo únicamente si has hablado con esa persona y ha perdido sus llaves."),
        h("p", { class: "nota" }, "Si sospechas que le robaron una llave, revócala antes. Pide haberte confirmado hace poco.")], si: "Rehabilitar", escribe: nombre,
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/hogares/" + id + "/rehabilitar-llave", {}));
        if (!r.ok) return r.mensaje;
        aviso("Alta rehabilitada para " + nombre + " durante 24 h"); cargaTodas(); return undefined;
      } });
    }
  });

  return { abre() { cargaPropias(); cargaTodas(); } };
}
