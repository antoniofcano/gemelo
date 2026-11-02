// La oficina (OF2): el esqueleto (navegación por secciones, cabecera con la sesión, tema), la sección Familias, (OF3) la de Hazas, (OF4) la Bandeja, (OF5) la de Sistema y (OF11) la Agenda.
// Mismo origen; nada en línea (CSP estricta). Las secciones hechas son funcionales; las demás dicen «próximamente».
import { $, api, fecha, fijaConfirmador, h, marcaOficinaAbierta, vacia } from "./comun.js";
import { iniciaLlavesSistema, muestraPantallaLlave, usaLlave } from "./llave.js";
import { iniciaFamilias } from "./familias.js";
import { cuentaPendientes, iniciaBandeja } from "./bandeja.js";
import { iniciaSistema } from "./sistema.js";
import { iniciaOlivos } from "./olivos.js";
import { iniciaFichaOlivo } from "./olivo_ficha.js";
import { iniciaAgenda } from "./agenda.js";
import { iniciaMundo } from "./mundo.js";
import { construyeHash, parseaHash } from "./enlaces_puro.js";

const SECCIONES = [
  ["inicio", "🏠", "Inicio", true], ["familias", "👪", "Familias", true], ["hazas", "🗺️", "Hazas", true], ["bandeja", "📥", "Bandeja", true],
  ["agenda", "📅", "Agenda", true], ["directos", "🎙️", "Directos", false], ["mundo", "🌳", "Mundo", true], ["olivos", "🫒", "Olivos", true],
  ["sistema", "⚙️", "Sistema", true],
];
const sesion = { rol: "oficina", cargada: false };
let actual = "inicio";
let familias = null, hazas = null, bandeja = null, sistema = null, olivos = null, agenda = null, mundo = null, llaves = null, fichaOlivo = null;

// ------------------------------------------------------------------ tema
$("#bTema").addEventListener("click", () => {
  const r = document.documentElement, oscuro = getComputedStyle(r).colorScheme.indexOf("dark") >= 0;
  r.setAttribute("data-theme", oscuro ? "light" : "dark");
  try { localStorage.setItem("oficina-tema", r.getAttribute("data-theme")); } catch { /* sin almacenamiento */ }
});
try { const t = localStorage.getItem("oficina-tema"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch { /* nada */ }

// ------------------------------------------------------------------ navegación
const nav = $("#nav");
for (const [id, ico, nombre, hecha] of SECCIONES) {
  nav.append(h("li", null, h("button", { type: "button", "data-sec": id },
    h("span", { class: "ico", "aria-hidden": "true" }, ico), nombre, hecha ? null : h("span", { class: "pronto" }, "pronto"),
    id === "bandeja" ? h("span", { class: "cuenta", id: "navBandeja", hidden: true }) : null)));
}
nav.addEventListener("click", e => { const b = e.target.closest("button[data-sec]"); if (b) ir(b.dataset.sec, true); });
document.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) ir(b.dataset.ir, true); });
window.addEventListener("hashchange", () => { const { sec, param } = parseaHash(location.hash); ir(sec, !!param, param); });
// OF15a: un enlace «#hazas/H-01» a la dirección en la que ya está no dispara hashchange (la haza pudo cambiarse desde el desplegable): se lleva a mano
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-enlace]");
  if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); const { sec, param } = parseaHash(location.hash); ir(sec, true, param); }
});

/** Va a una sección; `param` es el del hash («#hazas/H-01»: código de la haza; «#familias/12»: id del hogar), solo para las que lo admiten. */
function ir(sec, foco, param = null) {
  // OF15b: «#olivo/<finca>/<copas_id>» es la ficha de un olivo, una vista dentro de Hazas (sin botón propio en la barra); sin parámetro válido, Hazas a secas
  const vista = sec === "olivo" && param ? "olivo" : null;
  if (sec === "olivo") sec = "hazas";   // en la barra, la ficha cuelga de Hazas
  if (!SECCIONES.some(s => s[0] === sec)) sec = "inicio";
  actual = vista || sec;
  const [, , nombre0, hecha] = SECCIONES.find(s => s[0] === sec), nombre = vista ? "Ficha del olivo" : nombre0;
  for (const id of ["inicio", "familias", "hazas", "bandeja", "agenda", "mundo", "olivos", "sistema", "olivo", "proximamente"]) $("#s-" + id).hidden = id !== (vista || (hecha ? sec : "proximamente"));
  if (!hecha) $("#proxTitulo").textContent = nombre + ": próximamente";
  for (const b of nav.querySelectorAll("button")) { if (b.dataset.sec === sec) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
  $("#titulo").textContent = nombre;
  document.title = nombre + " · Oficina · Cuarenta hazas";
  const hash = construyeHash(vista || sec, param);
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (sec === "familias") familias.abre(param ? Number(param) : null);
  if (vista) fichaOlivo.abre(param);
  else if (sec === "hazas") abreHazas(param);
  if (sec === "bandeja") bandeja.abre();
  if (sec === "agenda") agenda.abre();
  if (sec === "sistema") { sistema.abre(); llaves.abre(); }
  if (sec === "mundo") mundo.abre();
  if (sec === "olivos") {
    olivos.abre();
    // OF15b: «#olivos/<finca>/<copas_id>» (desde la ficha del olivo) abre «Olivo real» con ese olivo ya buscado
    if (param) { const [finca, id] = param.split("/"); olivos.ve("real", false); olivos.real.busca(finca, id); }
  } else if (olivos) olivos.sale();   // OF8b: el visor 3D no se queda con la GPU fuera de Olivos
  if (sec === "inicio") { cuentaFamilias(); cuentaPendientes(); }
  if (foco) $("#titulo").focus();
}

// ------------------------------------------------------------------ sesión
/** Lee la sesión; devuelve false si la oficina no se puede abrir todavía (OF13: falta entrar con la llave, y se enseña su pantalla). */
async function cargaSesion() {
  const r = await api("GET", "/api/oficina/sesion");
  if (!r.ok) { $("#pieSesion").textContent = "No se pudo leer la sesión (" + r.estado + ")."; return true; }
  const s = r.datos;
  if (muestraPantallaLlave(s.llave)) return false;
  // con la llave obligatoria, lo delicado se confirma con ella (no con un enlace por correo)
  const conLlave = !!(s.llave && s.llave.obligatoria);
  fijaConfirmador(conLlave ? usaLlave : null);
  sesion.rol = s.rol; sesion.cargada = true; sesion.otProponer = s.ot_proponer || "manual";
  const caduca = fecha(s.caduca_en) + ", o tras " + s.inactividad_min + " min sin actividad";
  $("#s-rol").textContent = s.rol === "admin" ? "admin" : "oficina";
  $("#s-aparato").textContent = s.aparato.nombre + " (" + s.aparato.estado + ")";
  $("#s-caduca").textContent = caduca;
  $("#s-confirmacion").textContent = s.confirmacion_vigente ? (conLlave ? "sí (usaste tu llave hace poco)" : "sí (entraste hace poco)")
    : (conLlave ? "no: lo delicado te pedirá tu llave" : "no: lo delicado te pedirá un enlace nuevo");
  vacia($("#pieSesion")).append("Entraste como ", h("b", null, s.rol === "admin" ? "admin" : "oficina"), " · este aparato: " + s.aparato.nombre + " · caduca " + fecha(s.caduca_en));
  return true;   // abierta: sin esto, quien la llama (que solo sigue con true) dejaba la oficina en «Cargando…»
}

async function cuentaFamilias() {
  const [t, p] = await Promise.all([api("GET", "/api/admin/hogares?limite=1"), api("GET", "/api/admin/hogares?estado=pendiente&limite=1")]);
  if (!t.ok) return;
  $("#kFamilias").textContent = String(t.datos.total);
  $("#kFamNota").textContent = "cuentas · " + (p.ok ? p.datos.total : "?") + " sin primer acceso";
}

// Hazas trae OpenLayers y proj4 (≈ 0,5 MB): se cargan la primera vez que se entra en la sección, no con la oficina.
async function abreHazas(codigo) {
  if (!hazas) {
    const { iniciaHazas } = await import("./hazas.js");
    hazas = hazas || iniciaHazas({ sesion });
    if (new URLSearchParams(location.search).has("prueba")) window.__hazas = hazas.estado;   // solo lectura, para la prueba de Chrome
  }
  if (actual === "hazas") hazas.abre(codigo);
}

$("#salir").addEventListener("click", async () => {
  await fetch("/api/sesion/salir", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  location.href = "/";
});

familias = iniciaFamilias({ sesion });
bandeja = iniciaBandeja({ sesion });
sistema = iniciaSistema({ sesion });
olivos = iniciaOlivos({ sesion });
fichaOlivo = iniciaFichaOlivo();
agenda = iniciaAgenda({ sesion });
mundo = iniciaMundo({ sesion });
if (new URLSearchParams(location.search).has("prueba")) window.__bandeja = () => bandeja.estado();   // solo lectura, para la prueba de Chrome
if (new URLSearchParams(location.search).has("prueba")) window.__olivos = () => olivos.estado();   // ídem (OF7)
if (new URLSearchParams(location.search).has("prueba")) window.__visorOlivo = { estado: () => olivos.real.visor(), muestreo: () => olivos.real.muestreo() };   // OF8b: el visor 3D de «Olivo real», solo lectura
llaves = iniciaLlavesSistema({ sesion });
// OF13: si la sesión aún tiene que abrirse con la llave, solo se ve su pantalla y no se pide nada más a la api
cargaSesion().then(abierta => {
  if (!abierta) return;
  marcaOficinaAbierta();
  cuentaPendientes(); setInterval(cuentaPendientes, 60_000);
  const { sec, param } = parseaHash(location.hash);
  ir(sec || "inicio", false, param);
}).catch(() => { $("#anuncio").textContent = "No se pudo leer la sesión."; });
