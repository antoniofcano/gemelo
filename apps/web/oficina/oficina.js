// La oficina (OF2): el esqueleto (navegación por secciones, cabecera con la sesión, tema) y la sección Familias.
// Mismo origen; nada en línea (CSP estricta). Solo Familias es funcional; las demás secciones dicen «próximamente».
import { $, api, fecha, h, vacia } from "./comun.js";
import { iniciaFamilias } from "./familias.js";

const SECCIONES = [
  ["inicio", "🏠", "Inicio", true], ["familias", "👪", "Familias", true], ["hazas", "🗺️", "Hazas", false], ["bandeja", "📥", "Bandeja", false],
  ["agenda", "📅", "Agenda", false], ["directos", "🎙️", "Directos", false], ["mundo", "🌳", "Mundo", false], ["olivos", "🫒", "Olivos", false],
  ["sistema", "⚙️", "Sistema", false],
];
const sesion = { rol: "oficina", cargada: false };
let actual = "inicio";
let familias = null;

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
    h("span", { class: "ico", "aria-hidden": "true" }, ico), nombre, hecha ? null : h("span", { class: "pronto" }, "pronto"))));
}
nav.addEventListener("click", e => { const b = e.target.closest("button[data-sec]"); if (b) ir(b.dataset.sec, true); });
document.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) ir(b.dataset.ir, true); });
window.addEventListener("hashchange", () => ir(location.hash.slice(1), false));

function ir(sec, foco) {
  if (!SECCIONES.some(s => s[0] === sec)) sec = "inicio";
  actual = sec;
  const [, , nombre, hecha] = SECCIONES.find(s => s[0] === sec);
  for (const id of ["inicio", "familias", "proximamente"]) $("#s-" + id).hidden = id !== (hecha ? sec : "proximamente");
  if (!hecha) $("#proxTitulo").textContent = nombre + ": próximamente";
  for (const b of nav.querySelectorAll("button")) { if (b.dataset.sec === sec) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
  $("#titulo").textContent = nombre;
  document.title = nombre + " · Oficina · Cuarenta hazas";
  if (location.hash !== "#" + sec) history.replaceState(null, "", "#" + sec);
  if (sec === "familias") familias.abre();
  if (sec === "inicio") cuentaFamilias();
  if (foco) $("#titulo").focus();
}

// ------------------------------------------------------------------ sesión
async function cargaSesion() {
  const r = await api("GET", "/api/oficina/sesion");
  if (!r.ok) { $("#pieSesion").textContent = "No se pudo leer la sesión (" + r.estado + ")."; return; }
  const s = r.datos;
  sesion.rol = s.rol; sesion.cargada = true;
  const caduca = fecha(s.caduca_en) + ", o tras " + s.inactividad_min + " min sin actividad";
  $("#s-rol").textContent = s.rol === "admin" ? "admin" : "oficina";
  $("#s-aparato").textContent = s.aparato.nombre + " (" + s.aparato.estado + ")";
  $("#s-caduca").textContent = caduca;
  $("#s-confirmacion").textContent = s.confirmacion_vigente ? "sí (entraste hace poco)" : "no: lo delicado te pedirá un enlace nuevo";
  vacia($("#pieSesion")).append("Entraste como ", h("b", null, s.rol === "admin" ? "admin" : "oficina"), " · este aparato: " + s.aparato.nombre + " · caduca " + fecha(s.caduca_en));
}

async function cuentaFamilias() {
  const [t, p] = await Promise.all([api("GET", "/api/admin/hogares?limite=1"), api("GET", "/api/admin/hogares?estado=pendiente&limite=1")]);
  if (!t.ok) return;
  $("#kFamilias").textContent = String(t.datos.total);
  $("#kFamNota").textContent = "cuentas · " + (p.ok ? p.datos.total : "?") + " sin primer acceso";
}

$("#salir").addEventListener("click", async () => {
  await fetch("/api/sesion/salir", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  location.href = "/";
});

familias = iniciaFamilias({ sesion });
cargaSesion().then(() => ir(location.hash.slice(1) || "inicio", false)).catch(() => { $("#anuncio").textContent = "No se pudo leer la sesión."; });
