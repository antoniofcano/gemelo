// Portada y pantallas de entrada (doc/sistema/UX.md §4.1–4.7). Nada de terceros; solo pide a su mismo origen (/api/…,
// contratos/api.openapi.yaml, /avatares/…); la vista previa 3D del avatar (vista3d.js) se carga con import() solo en esa pantalla. Cada pantalla es una <section> y la dirige el ancla (#entrar,
// #vincular…): atrás y adelante del navegador funcionan, y al cambiar de pantalla el foco va a su h1 y se anuncia.
// Nada de estilos en línea (la CSP de producción es style-src 'self'): todo con clases y [hidden].
"use strict";

/** Versión vigente de las normas: la misma que NORMAS_VERSION de apps/api/src/auth/servicio.ts (lo vigila un guardián). */
export const NORMAS_VERSION = 1;
const CAMISAS = [["#c0563a", "Teja"], ["#2f5d8a", "Azul"], ["#3f7f5a", "Verde"], ["#d9822b", "Naranja"], ["#7a3f8f", "Morado"], ["#e8e2cf", "Crudo"]];
const SOMBREROS = [["ninguno", "Ninguno", null], ["paja", "Paja", "#e1c46a"], ["gorra", "Gorra", "#3a3f46"]];
const PIELES = [["#f1d0b5", "Muy claro"], ["#e0b48f", "Claro"], ["#c48c63", "Medio"], ["#95623f", "Oscuro"], ["#5e3c27", "Muy oscuro"]];
const SUGERENCIAS = ["Tordo del Llano", "Abubilla", "Encina 42", "Alcaraván", "Acebuche"];
const CON_SESION = new Set(["bienvenida", "alias", "avatar", "creditos", "dispositivos"]);
const SIN_SESION = new Set(["entrar", "revisa", "vincular"]);
const TEXTO_RED = "No hemos podido conectar. Comprueba la conexión y vuelve a probar.";

const $ = id => document.getElementById(id);
const S = { sesion: null, pantalla: null, correo: "", avatar: { camisa: 0, sombrero: 1, piel: 1 }, vrm: null, catalogo: null, vista: null, pausada: false, tok: 0, vinculo: null };

// ---------- red
async function pide(metodo, ruta, cuerpo) {
  const o = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
  if (cuerpo !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
  const r = await fetch(ruta, o);
  let json = null;
  try { json = r.status === 204 ? null : await r.json(); } catch { json = null; }
  return { status: r.status, json };
}
async function leeSesion() {
  try { const r = await pide("GET", "/api/sesion"); S.sesion = r.status === 200 ? r.json : null; }
  catch { S.sesion = null; }
  pintaSesion();
}

// ---------- pantallas
function anuncia(t) { const a = $("anuncio"); a.textContent = ""; setTimeout(() => { a.textContent = t; }, 30); }
function destino(nombre) {
  if (!$("p-" + nombre)) return "portada";
  if (CON_SESION.has(nombre) && !S.sesion) return "portada";
  if (SIN_SESION.has(nombre) && S.sesion && !S.sesion.primer_acceso) return "portada";
  if (S.sesion && S.sesion.primer_acceso && !CON_SESION.has(nombre) && nombre !== "portada" && nombre !== "vincular") return "bienvenida";
  return nombre;
}
function ir(nombre, { foco = true } = {}) {
  const d = destino(nombre);
  if (S.pantalla === "vincular" && d !== "vincular") paraVinculo();
  if (S.pantalla === "avatar" && d !== "avatar") paraVista();
  for (const s of document.querySelectorAll(".pant")) s.hidden = s.id !== "p-" + d;
  const cambia = S.pantalla !== d;
  S.pantalla = d;
  if (("#" + d) !== location.hash && !(d === "portada" && !location.hash)) history.replaceState(null, "", d === "portada" ? location.pathname : "#" + d);
  const h1 = document.querySelector("#p-" + d + " h1");
  if (cambia && h1) { if (foco) h1.focus(); anuncia(h1.textContent); }
  al[d]?.();
}
const al = {
  vincular: () => { if (!S.vinculo) empiezaVinculo(); },
  alias: () => { const i = $("alias"); if (!i.value && S.sesion?.alias) i.value = S.sesion.alias; $("cVisible").checked = !!S.sesion?.alias_visible; },
  avatar: () => entraAvatar(),
  creditos: () => pintaCreditos(),
  dispositivos: () => { $("okVincular").hidden = true; },
};
window.addEventListener("hashchange", () => ir(location.hash.slice(1) || "portada"));

function pintaSesion() {
  const s = S.sesion, con = !!s;
  $("quien").hidden = !con || s.primer_acceso;
  $("enlCreditos").hidden = !con || s.primer_acceso;
  $("aliasBarra").textContent = s?.alias || "hogar";
  $("accionesSin").hidden = con && !s.primer_acceso;
  $("accionesCon").hidden = !con || s.primer_acceso;
  $("pistaPortada").textContent = !con ? "Para entrar necesitas una cuenta de hogar. Sin contraseña: te mandamos un enlace al correo."
    : s.primer_acceso ? "Ya has entrado. Antes de ir a la finca, faltan tres pasos cortos." : "Ya has entrado en este aparato.";
  const be = $("btnEntrar");
  if (con && s.primer_acceso) { be.textContent = "Seguir"; be.setAttribute("href", "#bienvenida"); }
  else { be.textContent = "Entrar"; be.setAttribute("href", "#entrar"); }
}

// ---------- errores de campo (UX §7: aria-invalid, aria-describedby y foco al campo)
function errorCampo(input, p, texto) {
  if (texto) { p.textContent = texto; p.hidden = false; input.setAttribute("aria-invalid", "true"); input.focus(); }
  else { p.hidden = true; p.textContent = ""; input.removeAttribute("aria-invalid"); }
}
function aviso(caja, txt, texto) { if (texto) { txt.textContent = texto; caja.hidden = false; } else caja.hidden = true; }

// ---------- 4.2 entrar con tu correo
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
async function mandaEnlace(correo) {
  try { return await pide("POST", "/api/auth/enlace", { correo }); }
  catch { return { status: 0, json: null }; }
}
$("fEntrar").addEventListener("submit", async e => {
  e.preventDefault();
  const i = $("correo"), b = $("btnMandar"), v = i.value.trim();
  aviso($("avEntrar"), $("avEntrarTxt"), null);
  if (!RE_CORREO.test(v)) return errorCampo(i, $("eCorreo"), "Ese correo no parece completo. Revisa que tenga @ y un dominio.");
  errorCampo(i, $("eCorreo"), null);
  b.disabled = true; b.textContent = "Mandando…";
  const r = await mandaEnlace(v);
  b.disabled = false; b.textContent = "Mandarme el enlace";
  if (r.status === 202) { S.correo = v; $("correoEco").textContent = v; ir("revisa"); cuentaAtras(); return; }
  if (r.status === 400) return errorCampo(i, $("eCorreo"), r.json?.mensaje || "Ese correo no parece completo. Revisa que tenga @ y un dominio.");
  aviso($("avEntrar"), $("avEntrarTxt"), r.status === 429 ? r.json?.mensaje || "Has pedido varios enlaces seguidos. Espera unos minutos." : TEXTO_RED);
  $("avEntrar").focus?.();
});

// ---------- 4.3 revisa tu correo (reenviar con 30 s de espera; cuenta para el límite)
let reloj = null;
function cuentaAtras() {
  let n = 30; const b = $("btnReenviar"), c = $("cuentaReenvio");
  clearInterval(reloj); b.disabled = true;
  const pinta = () => { c.textContent = n > 0 ? "Podrás reenviarlo en " + n + " s." : ""; b.disabled = n > 0; };
  pinta();
  reloj = setInterval(() => { n--; pinta(); if (n <= 0) clearInterval(reloj); }, 1000);
}
$("btnReenviar").addEventListener("click", async () => {
  if (!S.correo) return ir("entrar");
  const r = await mandaEnlace(S.correo);
  if (r.status === 202) { aviso($("avRevisa"), $("avRevisaTxt"), null); anuncia("Te hemos mandado otro enlace."); cuentaAtras(); }
  else aviso($("avRevisa"), $("avRevisaTxt"), r.status === 429 ? r.json?.mensaje : TEXTO_RED);
});

// ---------- 4.4 vincular las gafas (en las gafas, sin sesión): pedir código, enseñarlo y sondear
function paraVinculo() { if (S.vinculo) { clearTimeout(S.vinculo.t); clearInterval(S.vinculo.r); } S.vinculo = null; }
function pintaCodigo(c) {
  const el = $("codigo");
  el.textContent = c || "· · · - · · ·";
  // el lector de pantalla lo deletrea (K, 7, Q, guion…)
  if (c) el.setAttribute("aria-label", "Código: " + c.replace("-", "").split("").join(" "));
  else el.removeAttribute("aria-label");
}
function estadoVinculo(texto, tipo) {
  const a = $("avVincular");
  a.className = "aviso" + (tipo === "err" ? " aviso-err" : tipo === "ok" ? " aviso-ok" : "");
  $("avVincularTxt").textContent = texto;
}
async function empiezaVinculo(renovaciones = 0) {
  paraVinculo();
  const v = S.vinculo = { t: 0, r: 0, renovaciones };
  pintaCodigo(null); $("btnOtroCodigo").hidden = true; $("btnGafasFinca").hidden = true; $("codigoPista").textContent = "";
  estadoVinculo("Pidiendo un código…");
  let r;
  try { r = await pide("POST", "/api/auth/vincula", {}); } catch { r = { status: 0 }; }
  if (S.vinculo !== v) return;
  if (r.status !== 201) {
    estadoVinculo(r.status === 429 ? r.json?.mensaje || "Demasiados intentos seguidos. Espera unos minutos." : TEXTO_RED, "err");
    $("btnOtroCodigo").hidden = false; return;
  }
  Object.assign(v, { sondeo: r.json.sondeo, expira: Date.parse(r.json.expira_en), cada: Math.max(1, r.json.cada_s) * 1000 });
  pintaCodigo(r.json.codigo);
  estadoVinculo("Esperando a que lo apruebes en el otro aparato…");
  const pintaResto = () => {
    const s = Math.max(0, Math.round((v.expira - Date.now()) / 1000));
    $("codigoPista").textContent = "Caduca en " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + ".";
  };
  pintaResto(); v.r = setInterval(pintaResto, 1000);
  v.t = setTimeout(() => sondea(v), v.cada);
}
async function sondea(v) {
  if (S.vinculo !== v) return;
  let r;
  try { r = await pide("POST", "/api/auth/vincula/sondeo", { sondeo: v.sondeo }); } catch { r = { status: 0 }; }
  if (S.vinculo !== v) return;
  const e = r.status === 200 ? r.json.estado : null;
  if (e === "aprobado") {
    clearInterval(v.r); $("codigoPista").textContent = "";
    estadoVinculo("Listo: estas gafas ya han entrado con tu cuenta.", "ok");
    await leeSesion();
    S.vinculo = null;
    if (S.sesion?.primer_acceso) { ir("bienvenida"); return; }
    $("btnGafasFinca").hidden = false; $("btnPrefieroCorreo").hidden = true; $("btnGafasFinca").focus();
    return;
  }
  if (e === "rechazado") { clearInterval(v.r); estadoVinculo("Se ha rechazado desde el otro aparato. Si fue un error, pide otro código.", "err"); $("btnOtroCodigo").hidden = false; return; }
  if (e === "caducado" || Date.now() > v.expira) {
    clearInterval(v.r);
    // UX §4.4: «El código ha caducado. Te damos otro» (hasta 3 veces solas; después, con el botón, para no gastar el límite)
    if (v.renovaciones < 3) { anuncia("El código ha caducado. Te damos otro."); empiezaVinculo(v.renovaciones + 1); return; }
    estadoVinculo("El código ha caducado.", "err"); $("btnOtroCodigo").hidden = false; return;
  }
  if (r.status === 429 || r.status === 0) estadoVinculo(r.status === 0 ? "Sin conexión; seguimos probando…" : "Esperando… (vamos más despacio)");
  v.t = setTimeout(() => sondea(v), r.status === 429 ? v.cada * 4 : v.cada);
}
$("btnOtroCodigo").addEventListener("click", () => empiezaVinculo(0));

// ---------- 4.5 primer acceso: normas
$("fBienvenida").addEventListener("submit", async e => {
  e.preventDefault();
  const ok = ["cPriv", "cNormas", "cAdulto"].every(id => $(id).checked), caja = $("eBienvenida");
  if (!ok) { aviso(caja, $("eBienvenidaTxt"), "Para seguir, marca las tres casillas obligatorias."); caja.focus(); return; }
  let r; try { r = await pide("PUT", "/api/yo/normas", { version: NORMAS_VERSION, avisos_correo: $("cAvisos").checked }); } catch { r = { status: 0 }; }
  if (r.status === 204) { caja.hidden = true; await leeSesion(); ir("alias"); return; }
  if (r.status === 401) { await leeSesion(); ir("portada"); return; }
  aviso(caja, $("eBienvenidaTxt"), r.json?.mensaje || TEXTO_RED); caja.focus();
});

// ---------- 4.6 alias
const RE_ALIAS = /^[\p{L}\p{N}][\p{L}\p{N} -]{1,18}[\p{L}\p{N}]$/u;
function validaAlias(v) {
  if (v.length < 3 || v.length > 20) return "El alias tiene que tener entre 3 y 20 caracteres.";
  if (/@/.test(v) || /\d{6,}/.test(v.replace(/[ -]/g, ""))) return "No pongas correos ni teléfonos en el alias: lo ve todo el mundo.";
  if (!RE_ALIAS.test(v)) return "Solo letras, números, espacios y guiones, y que empiece y acabe en letra o número.";
  return null;
}
for (const s of SUGERENCIAS) {
  const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = s;
  b.addEventListener("click", () => { $("alias").value = s; errorCampo($("alias"), $("eAlias"), null); $("alias").focus(); });
  $("sugerencias").appendChild(b);
}
$("fAlias").addEventListener("submit", async e => {
  e.preventDefault();
  const i = $("alias"), v = i.value.trim().replace(/\s+/g, " "), m = validaAlias(v);
  if (m) return errorCampo(i, $("eAlias"), m);
  let r; try { r = await pide("PUT", "/api/yo/alias", { alias: v, visible: $("cVisible").checked }); } catch { r = { status: 0 }; }
  if (r.status === 204) { errorCampo(i, $("eAlias"), null); await leeSesion(); ir("avatar"); return; }
  if (r.status === 409) return errorCampo(i, $("eAlias"), "«" + v + "» ya lo usa otro hogar. Prueba con otro.");
  if (r.status === 400) return errorCampo(i, $("eAlias"), r.json?.mensaje === "La petición no tiene la forma esperada." ? validaAlias(v) || "Ese alias no se puede usar. Prueba con otro." : r.json?.mensaje || "Ese alias no se puede usar. Prueba con otro.");
  errorCampo(i, $("eAlias"), TEXTO_RED);
});

// ---------- 4.7 avatar (SVG con atributos de presentación: nada de style)
const NS = "http://www.w3.org/2000/svg";
function rect(g, x, y, w, h, fill, clase) {
  const r = document.createElementNS(NS, "rect");
  for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v));
  if (fill) r.setAttribute("fill", fill);
  if (clase) r.setAttribute("class", clase);
  g.appendChild(r);
}
function dibujaAvatar(svg, a) {
  svg.replaceChildren();
  const g = document.createElementNS(NS, "g"), cam = CAMISAS[a.camisa][0], piel = PIELES[a.piel][0], som = SOMBREROS[a.sombrero][2];
  g.setAttribute("transform", "scale(1.25)");
  rect(g, -9, 10, 7, 14, null, "av-pierna"); rect(g, 2, 10, 7, 14, null, "av-pierna");
  rect(g, -12, -10, 24, 22, cam, "av-borde"); rect(g, -18, -9, 6, 16, cam, "av-borde"); rect(g, 12, -9, 6, 16, cam, "av-borde");
  rect(g, -10, -32, 20, 20, piel, "av-borde"); rect(g, -6, -25, 3, 3, null, "av-ojo"); rect(g, 3, -25, 3, 3, null, "av-ojo");
  if (a.sombrero === 1) { rect(g, -16, -35, 32, 5, som); rect(g, -9, -43, 18, 9, som); }
  if (a.sombrero === 2) { rect(g, -11, -38, 22, 8, som); rect(g, 4, -33, 12, 3, som); }
  svg.appendChild(g);
}
function muestras(cont, nombre, lista, clave, color) {
  cont.replaceChildren();
  lista.forEach((it, i) => {
    const l = document.createElement("label"), inp = document.createElement("input"), sp = document.createElement("span");
    l.className = "muestra"; inp.type = "radio"; inp.name = nombre; inp.value = String(i); inp.checked = S.avatar[clave] === i;
    inp.addEventListener("change", () => { S.avatar[clave] = i; dibujaAvatar($("avatarPrev"), S.avatar); });
    const c = color(it);
    if (c) { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 26 26"); s.setAttribute("aria-hidden", "true"); rect(s, 1, 1, 24, 24, c, "av-borde"); sp.appendChild(s); }
    sp.appendChild(document.createTextNode(it[1]));
    l.append(inp, sp); cont.appendChild(l);
  });
}
function pintaAvatar() {
  muestras($("mCamisa"), "camisa", CAMISAS, "camisa", it => it[0]);
  muestras($("mSombrero"), "sombrero", SOMBREROS, "sombrero", it => it[2]);
  muestras($("mPiel"), "piel", PIELES, "piel", it => it[0]);
  dibujaAvatar($("avatarPrev"), S.avatar);
  $("aliasPrev").textContent = S.sesion?.alias || "—";
}

// ---- catálogo de avatares VRM (/avatares/catalogo.json, tras sesión; contratos/avatares.md). Sin él, solo el muñeco de bloque.
async function leeCatalogo() {
  if (S.catalogo !== null) return S.catalogo || null;
  try {
    const r = await pide("GET", "/avatares/catalogo.json");
    const c = r.status === 200 ? r.json : null;
    S.catalogo = c && c.v === 1 && Array.isArray(c.avatares) && c.avatares.length ? c : false;
  } catch { S.catalogo = false; }
  return S.catalogo || null;
}
const catalogados = () => S.catalogo?.avatares || [];
const delCatalogo = id => (id ? catalogados().find(a => a.id === id) : null) || null;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** Índice del color de la paleta más cercano a `hexa` (el catálogo da colores libres; la api guarda índices). */
function cercano(lista, hexa) {
  const c = rgb(hexa); let mejor = 0, d0 = Infinity;
  lista.forEach((it, i) => { const q = rgb(it[0]), d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < d0) { d0 = d; mejor = i; } });
  return mejor;
}
function muestra(el, si) { if (si) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); }

/** Al elegir un VRM, el muñeco lejano (y la caída) lleva los colores que declara el catálogo, a la paleta más cercana. */
function muniecoDe(a) {
  const c = a.colores_muneco; if (!c) return;
  S.avatar.camisa = cercano(CAMISAS, c.camisa); S.avatar.piel = cercano(PIELES, c.piel);
  S.avatar.sombrero = Math.max(0, SOMBREROS.findIndex(x => x[0] === c.sombrero));
}

function pintaGaleria() {
  const g = $("galeria"); g.replaceChildren();
  const opciones = [{ id: "", nombre: "Muñeco de bloque", descripcion: "Estilo bloque, como la finca. Eliges camisa, sombrero y tono de piel." }].concat(catalogados());
  for (const o of opciones) {
    const l = document.createElement("label"), inp = document.createElement("input"), sp = document.createElement("span"), n = document.createElement("strong");
    l.className = "tarjeta-av"; inp.type = "radio"; inp.name = "avatar"; inp.value = o.id; inp.checked = (S.vrm || "") === o.id;
    inp.addEventListener("change", () => eligeVrm(o.id || null));
    n.textContent = o.nombre; sp.appendChild(n);
    if (o.descripcion) { const d = document.createElement("span"); d.className = "desc"; d.textContent = o.descripcion; sp.appendChild(d); }
    l.append(inp, sp); g.appendChild(l);
  }
}

// ---- vista previa 3D: three y three-vrm solo se piden (import) al abrir esta pantalla; sin WebGL o si falla, queda la lista y el muñeco
const PASO_GIRO = Math.PI / 8;
function hayWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}
const quietoPorPreferencia = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
function paraVista() { S.tok++; if (S.vista) { S.vista.destruye(); S.vista = null; } }
function estado3d(t) { $("estado3d").textContent = t || ""; }
function soloMuneco(texto) { muestra($("avatar3d"), false); muestra($("giro"), false); muestra($("avatarPrev"), true); estado3d(texto); }
async function vistaPrevia() {
  const tok = ++S.tok, a = delCatalogo(S.vrm);
  dibujaAvatar($("avatarPrev"), S.avatar);   // el muñeco (con los colores del catálogo): mientras carga y si no carga
  if (!a) { S.vista?.quita(); soloMuneco(""); return; }
  if (!hayWebGL()) { soloMuneco("Este aparato no enseña la vista previa en 3D. Puedes elegir «" + a.nombre + "» igualmente."); return; }
  estado3d("Cargando la vista previa de «" + a.nombre + "»…");
  try {
    if (!S.vista) {
      const m = await import("./vista3d.js");
      if (tok !== S.tok) return;
      muestra($("avatar3d"), true);   // con tamaño antes de crear la vista: el lienzo mide lo que dice el CSS
      S.vista = m.creaVista($("avatar3d"), { quieto: S.pausada, alPerder: () => soloMuneco("Se ha perdido la vista previa en 3D. Tu elección sigue siendo «" + a.nombre + "».") });
      pintaPausa();
    }
    await S.vista.carga("/avatares/" + encodeURIComponent(a.fichero) + "?v=" + a.sha256, a.sha256);
    if (tok !== S.tok) return;
    muestra($("avatarPrev"), false); muestra($("avatar3d"), true); muestra($("giro"), true); estado3d("");
    anuncia("Vista previa de " + a.nombre + ".");
  } catch {
    if (tok !== S.tok) return;
    paraVista(); soloMuneco("No hemos podido enseñar la vista previa de «" + a.nombre + "». Puedes elegirlo igualmente.");
  }
}
function pintaPausa() {
  const b = $("giroPausa");
  b.setAttribute("aria-pressed", S.pausada ? "true" : "false"); b.textContent = S.pausada ? "Seguir el giro" : "Parar el giro";
}
$("giroIzq").addEventListener("click", () => S.vista?.gira(-PASO_GIRO));
$("giroDer").addEventListener("click", () => S.vista?.gira(PASO_GIRO));
$("giroPausa").addEventListener("click", () => { S.pausada = !S.pausada; S.vista?.pausa(S.pausada); pintaPausa(); });

function eligeVrm(id) {
  S.vrm = delCatalogo(id) ? id : null;
  const a = delCatalogo(S.vrm);
  if (a) muniecoDe(a);
  muestra($("bloqueMuneco"), !a);
  pintaAvatar(); vistaPrevia();
}
async function entraAvatar() {
  const primero = !!S.sesion?.primer_acceso;
  muestra($("pasosAvatar"), primero); muestra($("atrasAvatar"), primero); muestra($("volverAvatar"), !primero);
  S.pausada = quietoPorPreferencia();
  pintaAvatar(); soloMuneco("");
  // lo que ya tiene elegido el hogar (si lo hay) y el catálogo, a la vez
  const [guardado] = await Promise.all([pide("GET", "/api/yo/avatar").catch(() => null), leeCatalogo()]);
  if (S.pantalla !== "avatar") return;
  if (guardado?.status === 401) { await leeSesion(); ir("portada"); return; }
  if (guardado?.status === 200 && guardado.json) {
    const j = guardado.json;
    S.avatar = { camisa: j.camisa, sombrero: Math.max(0, SOMBREROS.findIndex(x => x[0] === j.sombrero)), piel: j.piel };
    S.vrm = delCatalogo(j.vrm) ? j.vrm : null;
  }
  const hay = catalogados().length > 0;
  muestra($("fsGaleria"), hay);
  if (hay) pintaGaleria();
  muestra($("bloqueMuneco"), !delCatalogo(S.vrm));
  pintaAvatar();
  if (delCatalogo(S.vrm)) vistaPrevia();
}
$("btnAzar").addEventListener("click", () => {
  const az = n => Math.floor(Math.random() * n), ids = [null].concat(catalogados().map(a => a.id)), id = ids[az(ids.length)];
  S.avatar = { camisa: az(CAMISAS.length), sombrero: az(SOMBREROS.length), piel: az(PIELES.length) };
  S.vrm = id; if (id) muniecoDe(delCatalogo(id));
  if (catalogados().length) pintaGaleria();
  muestra($("bloqueMuneco"), !id);
  pintaAvatar(); vistaPrevia();
  anuncia("Avatar cambiado al azar" + (id ? ": " + delCatalogo(id).nombre : "") + ".");
});
$("fAvatar").addEventListener("submit", async e => {
  e.preventDefault();
  const a = S.avatar;
  let r; try { r = await pide("PUT", "/api/yo/avatar", { camisa: a.camisa, sombrero: SOMBREROS[a.sombrero][0], piel: a.piel, vrm: S.vrm }); } catch { r = { status: 0 }; }
  if (r.status === 204) { aviso($("eAvatar"), $("eAvatarTxt"), null); await leeSesion(); ir("portada"); anuncia("Ya está. Puedes seguir a la finca."); $("btnSeguir").focus(); return; }
  if (r.status === 401) { await leeSesion(); ir("portada"); return; }
  aviso($("eAvatar"), $("eAvatarTxt"), r.json?.mensaje || TEXTO_RED);
});

// ---- créditos de los avatares del catálogo (los de licencia que los pide, aparte)
const esHttps = u => typeof u === "string" && /^https:\/\//.test(u);
function enlace(texto, url) {
  if (!esHttps(url)) return document.createTextNode(texto);
  const a = document.createElement("a"); a.href = url; a.textContent = texto; a.rel = "noopener noreferrer"; a.target = "_blank";
  return a;
}
async function pintaCreditos() {
  const cat = await leeCatalogo(), obl = $("listaCredObl"), lib = $("listaCredLib");
  obl.replaceChildren(); lib.replaceChildren();
  muestra($("creditosObligatorios"), false); muestra($("creditosLibres"), false);
  muestra($("avCreditos"), !cat);
  $("avCreditosTxt").textContent = "No hay catálogo de avatares disponible ahora mismo.";
  if (!cat) return;
  for (const a of cat.avatares) {
    const li = document.createElement("li"), p1 = document.createElement("p"), p2 = document.createElement("p"), p3 = document.createElement("p"), n = document.createElement("strong");
    n.textContent = a.nombre; p1.append(n, " — de " + a.autor);
    p2.append("Licencia: ", enlace(a.licencia.spdx, a.licencia.url));
    if (a.licencia.texto_credito) p2.append(". " + a.licencia.texto_credito);
    p3.className = "pista"; p3.append("Fuente: ", enlace(a.fuente.nombre, a.fuente.url));
    li.append(p1, p2, p3);
    (a.licencia.credito_obligatorio ? obl : lib).appendChild(li);
  }
  muestra($("creditosObligatorios"), obl.children.length > 0); muestra($("creditosLibres"), lib.children.length > 0);
}

// ---------- configuración → mis dispositivos → vincular (en el aparato con sesión)
async function decide(aprobar) {
  const i = $("codigoTecleado"), v = i.value.trim(), limpio = v.replace(/[\s-]/g, "").toUpperCase();
  aviso($("okVincular"), $("okVincularTxt"), null);
  if (!/^[2-9A-HJKMNP-Z]{6}$/.test(limpio)) {
    return errorCampo(i, $("eCodigo"), /[01OIL]/.test(limpio) ? "El código no lleva 0, O, 1, I ni L: revisa esa letra en las gafas." : "El código tiene 6 letras y números, como K7Q-4M2.");
  }
  let r; try { r = await pide("POST", "/api/yo/dispositivos/vincular", { codigo: v, aprobar }); } catch { r = { status: 0 }; }
  if (r.status === 204) {
    errorCampo(i, $("eCodigo"), null); i.value = "";
    aviso($("okVincular"), $("okVincularTxt"), aprobar ? "Aprobado. Las gafas entrarán con tu cuenta en unos segundos." : "Rechazado. Esas gafas no entrarán.");
    anuncia($("okVincularTxt").textContent); return;
  }
  if (r.status === 401) { await leeSesion(); ir("portada"); return; }
  errorCampo(i, $("eCodigo"), r.json?.mensaje || TEXTO_RED);
}
$("fVincular").addEventListener("submit", e => { e.preventDefault(); decide(true); });
$("btnRechazar").addEventListener("click", () => decide(false));

// ---------- salir
async function salir(todas) {
  try { await pide("POST", todas ? "/api/sesion/salir-todas" : "/api/sesion/salir"); } catch { /* sin red: se limpia igual en pantalla */ }
  S.sesion = null; pintaSesion(); ir("portada"); anuncia(todas ? "Has cerrado la sesión en todos tus aparatos." : "Has cerrado la sesión.");
}
document.addEventListener("click", e => {
  const b = e.target.closest?.("[data-accion]");
  if (!b) return;
  if (b.dataset.accion === "salir") salir(false);
  if (b.dataset.accion === "salirTodas") salir(true);
});

// ---------- arranque
// en las Quest (UX §8): texto de 19 px, objetivos de 56 px y el código más grande
if (/OculusBrowser|Quest/i.test(navigator.userAgent)) document.documentElement.dataset.disp = "quest";
await leeSesion();
ir(location.hash.slice(1) || "portada", { foco: !!location.hash });
document.documentElement.dataset.listo = "1";
