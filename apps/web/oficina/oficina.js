// La oficina, OF1: enseña la sesión de oficina (GET /api/oficina/sesion) y deja salir. Mismo origen; nada en línea.
const anuncio = document.getElementById("anuncio");
const pon = (id, texto) => { document.getElementById(id).textContent = texto; };
const hora = iso => iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";

async function carga() {
  const r = await fetch("/api/oficina/sesion", { credentials: "same-origin", headers: { accept: "application/json" } });
  if (r.status === 401) { location.href = "/"; return; }
  if (!r.ok) { anuncio.textContent = "No se pudo leer la sesión (" + r.status + ")."; return; }
  const s = await r.json();
  pon("s-rol", s.rol === "admin" ? "admin" : "oficina");
  pon("s-aparato", s.aparato.nombre + " (" + s.aparato.estado + ")");
  pon("s-caduca", hora(s.caduca_en) + ", o tras " + s.inactividad_min + " min sin actividad");
  pon("s-confirmacion", s.confirmacion_vigente ? "sí (entraste hace poco)" : "no: lo delicado te pedirá un enlace nuevo");
}

document.getElementById("salir").addEventListener("click", async () => {
  await fetch("/api/sesion/salir", { method: "POST", credentials: "same-origin" });
  location.href = "/";
});

carga().catch(() => { anuncio.textContent = "No se pudo leer la sesión."; });
