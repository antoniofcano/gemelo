// Portada y pantallas de entrada (doc/sistema/UX.md §4.1–4.7). Nada de terceros; solo pide a su mismo origen (/api/…,
// contratos/api.openapi.yaml, /avatares/…); la vista previa 3D del avatar (vista3d.js) se carga con import() solo en esa pantalla. Cada pantalla es una <section> y la dirige el ancla (#entrar,
// #vincular…): atrás y adelante del navegador funcionan, y al cambiar de pantalla el foco va a su h1 y se anuncia.
// Nada de estilos en línea (la CSP de producción es style-src 'self'): todo con clases y [hidden].
"use strict";

/** Versión vigente de las normas: la misma que NORMAS_VERSION de apps/api/src/auth/servicio.ts (lo vigila un guardián). */
export const NORMAS_VERSION = 1;
const COLOR_SOMBRERO = { ninguno: null, paja: "#d9bf6a", gorra: "#2e5d34" };   // los del muñeco del motor (26_presencia.js)
const SUGERENCIAS = ["Tordo del Llano", "Abubilla", "Encina 42", "Alcaraván", "Acebuche"];
const CON_SESION = new Set(["bienvenida", "alias", "avatar", "creditos", "dispositivos"]);
const SIN_SESION = new Set(["entrar", "revisa", "vincular"]);
const TEXTO_RED = "No hemos podido conectar. Comprueba la conexión y vuelve a probar.";

const $ = id => document.getElementById(id);
const S = { sesion: null, pantalla: null, correo: "", R: null, e: null, v2: null, lejos: false, cuerpoCargado: null, catalogo: null, vista: null, pausada: false, tok: 0, vinculo: null };

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
  if (S.pantalla === "entrar" && d !== "entrar") llavesListas?.L.paraEntrada();
  for (const s of document.querySelectorAll(".pant")) s.hidden = s.id !== "p-" + d;
  const cambia = S.pantalla !== d;
  S.pantalla = d;
  if (("#" + d) !== location.hash && !(d === "portada" && !location.hash)) history.replaceState(null, "", d === "portada" ? location.pathname : "#" + d);
  const h1 = document.querySelector("#p-" + d + " h1");
  if (cambia && h1) { if (foco) h1.focus(); anuncia(h1.textContent); }
  al[d]?.();
}
const al = {
  portada: () => revisaOferta(),
  entrar: () => pantallaEntrar(),
  vincular: () => { if (!S.vinculo) empiezaVinculo(); },
  alias: () => { const i = $("alias"); if (!i.value && S.sesion?.alias) i.value = S.sesion.alias; $("cVisible").checked = !!S.sesion?.alias_visible; },
  avatar: () => entraAvatar(),
  creditos: () => pintaCreditos(),
  dispositivos: () => { $("okVincular").hidden = true; avisaLlave($("avSalidaTotal"), $("avSalidaTotalTxt"), null); pintaSalidaTotal(); pintaMisLlaves(); },
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
// «¿No es ese? Cambiarlo»: vuelve al campo con el correo escrito y el foco va al campo (no al título)
$("lnkCambiar").addEventListener("click", e => {
  e.preventDefault();
  const i = $("correo");
  i.value = S.correo;
  ir("entrar", { foco: false });
  i.focus();
});
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

// ---------- 4.7 avatar, por piezas (AV4, ADR-0025; doc/sistema/AVATARES-FAMILIA.md). Lo puro (estado, receta, «algo parecido», al azar) está en receta.js y se pide con import()
// al abrir esta pantalla, como la vista 3D. Sin «hombre/mujer» en ningún paso (C8); los peques no se ofrecen (decisión 132). SVG con atributos de presentación: nada de style.
const NS = "http://www.w3.org/2000/svg";
function rect(g, x, y, w, h, fill, clase) {
  const r = document.createElementNS(NS, "rect");
  for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v));
  if (fill) r.setAttribute("fill", fill);
  if (clase) r.setAttribute("class", clase);
  g.appendChild(r);
}
function circulo(g, cx, cy, r, fill, trazo) {
  const c = document.createElementNS(NS, "circle");
  for (const [k, v] of Object.entries({ cx, cy, r })) c.setAttribute(k, String(v));
  c.setAttribute("fill", fill || "none"); if (trazo) { c.setAttribute("stroke", trazo); c.setAttribute("stroke-width", "2.5"); }
  g.appendChild(c);
}
/** El muñeco de lejos (como lo verán los demás a distancia: piel, ropa de arriba y de abajo, sombrero, altura, complexión y silla; C13) */
function dibujaMuneco(svg, e) {
  svg.replaceChildren();
  const P = S.R.PALETAS, g = document.createElementNS(NS, "g"), piel = P.piel[e.tono].color, cam = P.ropa[e.arriba].color, pan = P.ropa[e.abajo].color, som = COLOR_SOMBRERO[e.sombrero];
  const fa = { baja: 0.93, media: 1, alta: 1.07 }[e.altura] || 1, fc = { delgada: 0.84, media: 1, ancha: 1.24 }[e.complexion] || 1, silla = e.movilidad === "silla";
  g.setAttribute("transform", "translate(0 24) scale(" + (1.25 * fa).toFixed(3) + ") translate(0 -24)");
  const w = 24 * fc, dy = silla ? 8 : 0;
  if (silla) { circulo(g, -w / 2 - 3, 18, 10, null, "#22262a"); circulo(g, w / 2 + 3, 18, 10, null, "#22262a"); rect(g, -w / 2 - 2, 10, w + 4, 3, "#4a4f55"); }
  if (silla) { rect(g, -9 * fc, 10 + dy - 8, 7 * fc, 8, pan, "av-borde"); rect(g, 2 * fc, 10 + dy - 8, 7 * fc, 8, pan, "av-borde"); }
  else { rect(g, -9 * fc, 10, 7 * fc, 14, pan, "av-borde"); rect(g, 2 * fc, 10, 7 * fc, 14, pan, "av-borde"); }
  rect(g, -w / 2, -10 + dy, w, 22, cam, "av-borde"); rect(g, -w / 2 - 6, -9 + dy, 6, 16, cam, "av-borde"); rect(g, w / 2, -9 + dy, 6, 16, cam, "av-borde");
  rect(g, -10, -32 + dy, 20, 20, piel, "av-borde"); rect(g, -6, -25 + dy, 3, 3, null, "av-ojo"); rect(g, 3, -25 + dy, 3, 3, null, "av-ojo");
  if (e.sombrero === "paja") { rect(g, -16, -35 + dy, 32, 5, som); rect(g, -9, -43 + dy, 18, 9, som); }
  if (e.sombrero === "gorra") { rect(g, -11, -38 + dy, 22, 8, som); rect(g, 4, -33 + dy, 12, 3, som); }
  if (e.movilidad === "baston") rect(g, w / 2 + 6, 2, 2, 22, "#5a3d22");
  if (e.movilidad === "andador") { rect(g, -w / 2 - 8, 0, 2, 24, "#a9b1b8"); rect(g, w / 2 + 6, 0, 2, 24, "#a9b1b8"); rect(g, -w / 2 - 8, 0, w + 16, 2, "#a9b1b8"); }
  svg.appendChild(g);
}
/** Un grupo de radios; `color` da el de su muestra (o null). Cada radio dentro de su <label>, con nombre visible; el elegido se ve sin depender del color (borde y sombra) */
function muestras(cont, nombre, lista, valor, color, alCambiar) {
  cont.replaceChildren();
  lista.forEach(([v, texto]) => {
    const l = document.createElement("label"), inp = document.createElement("input"), sp = document.createElement("span");
    l.className = "muestra"; inp.type = "radio"; inp.name = nombre; inp.value = String(v); inp.checked = valor === v;
    inp.addEventListener("change", () => alCambiar(v));
    const c = color ? color(v) : null;
    if (c) { const s2 = document.createElementNS(NS, "svg"); s2.setAttribute("viewBox", "0 0 26 26"); s2.setAttribute("aria-hidden", "true"); rect(s2, 1, 1, 24, 24, c, "av-borde"); sp.appendChild(s2); }
    sp.appendChild(document.createTextNode(texto));
    l.append(inp, sp); cont.appendChild(l);
  });
}
function cambia(k, v) { S.e = Object.assign({}, S.e, { [k]: v }, k === "vrm" ? {} : { vrm: null }); pintaAvatar(); vistaPrevia(); }
function pintaAvatar() {
  const R = S.R, e = S.e, v2 = S.v2, P = R.PALETAS, deTipo = l => l.filter(p => { const c = R.cuerpoDe(v2, e.edad, e.complexion); return c && (c.piezas || []).includes(p.id); });
  const idx = l => l.map((x, i) => [i, x.nombre]);
  muestra($("fsEdad"), !!v2); muestra($("dPelo"), !!v2); muestra($("fsRopa"), !!v2);
  if (v2) muestras($("mEdad"), "edad", R.edadesDe(v2), e.edad, null, v => cambia("edad", v));
  muestras($("mComplexion"), "complexion", R.COMPLEXIONES, e.complexion, null, v => cambia("complexion", v));
  muestras($("mAltura"), "altura", R.ALTURAS, e.altura, null, v => cambia("altura", v));
  muestras($("mPiel"), "piel", idx(P.piel), e.tono, i => P.piel[i].color, v => cambia("tono", v));
  if (v2) {
    muestras($("mPelo"), "pelo", [[null, "Sin pelo"]].concat(deTipo(v2.pelos).map(p => [p.id, p.nombre])), e.pelo, null, v => cambia("pelo", v));
    muestras($("mPeloColor"), "pelo_color", idx(P.pelo), e.peloColor, i => P.pelo[i].color, v => cambia("peloColor", v));
    muestras($("mVello"), "vello", [[null, "Ninguno"]].concat(deTipo(v2.vellos).map(p => [p.id, p.nombre])), e.vello, null, v => cambia("vello", v));
    muestras($("mRopa"), "ropa", [[null, "Camiseta y pantalón corto"]].concat(deTipo(v2.ropas).map(p => [p.id, p.nombre])), e.ropa, null, v => cambia("ropa", v));
  }
  muestras($("mArriba"), "arriba", idx(P.ropa), e.arriba, i => P.ropa[i].color, v => cambia("arriba", v));
  muestras($("mAbajo"), "abajo", idx(P.ropa), e.abajo, i => P.ropa[i].color, v => cambia("abajo", v));
  muestras($("mSombrero"), "sombrero", R.SOMBREROS, e.sombrero, v => COLOR_SOMBRERO[v], v => cambia("sombrero", v));
  muestras($("mMovilidad"), "movilidad", R.MOVILIDADES, e.movilidad, null, v => cambia("movilidad", v));
  const par = R.parecidos(v2); muestra($("fsParecidos"), par.length > 0);
  $("parecidos").replaceChildren(...par.map(p => {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = p.nombre;
    b.addEventListener("click", () => { S.e = R.aplica(S.e, p.receta); pintaAvatar(); vistaPrevia(); anuncia("Empiezas por: " + p.nombre + ". Cambia lo que quieras."); });
    return b;
  }));
  const hay = catalogados().length > 0; muestra($("fsGaleria"), hay);
  if (hay) pintaGaleria();
  muestra($("bloquePiezas"), !delCatalogo(e.vrm));
  dibujaMuneco($("avatarPrev"), e);
  $("descAvatar").textContent = delCatalogo(e.vrm) ? delCatalogo(e.vrm).nombre + (delCatalogo(e.vrm).descripcion ? ": " + delCatalogo(e.vrm).descripcion : "") : R.describe(v2, e);
  $("aliasPrev").textContent = S.sesion?.alias || "—";
}

// ---- catálogo de avatares (/avatares/catalogo.json, tras sesión; contratos/avatares.md). v2: cuerpos y piezas; v1 (o los `avatares` de la v2): avatares ya hechos. Sin él, el muñeco.
async function leeCatalogo() {
  if (S.catalogo !== null) return S.catalogo || null;
  try {
    const r = await pide("GET", "/avatares/catalogo.json");
    const c = r.status === 200 ? r.json : null;
    S.catalogo = c && (c.v === 1 || c.v === 2) && ((Array.isArray(c.avatares) && c.avatares.length) || (Array.isArray(c.cuerpos) && c.cuerpos.length)) ? c : false;
  } catch { S.catalogo = false; }
  return S.catalogo || null;
}
const catalogados = () => S.catalogo?.avatares || [];
const delCatalogo = id => (id ? catalogados().find(a => a.id === id) : null) || null;
function muestra(el, si) { if (si) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); }

function pintaGaleria() {
  const g = $("galeria"); g.replaceChildren();
  const opciones = [{ id: "", nombre: "Hecho por piezas", descripcion: "El tuyo, con las piezas de arriba." }].concat(catalogados());
  for (const o of opciones) {
    const l = document.createElement("label"), inp = document.createElement("input"), sp = document.createElement("span"), n = document.createElement("strong");
    l.className = "tarjeta-av"; inp.type = "radio"; inp.name = "avatar"; inp.value = o.id; inp.checked = (S.e.vrm || "") === o.id;
    inp.addEventListener("change", () => eligeVrm(o.id || null));
    n.textContent = o.nombre; sp.appendChild(n);
    if (o.descripcion) { const d = document.createElement("span"); d.className = "desc"; d.textContent = o.descripcion; sp.appendChild(d); }
    l.append(inp, sp); g.appendChild(l);
  }
}

// ---- vista previa: de cerca, el VRM de verdad con three (vista3d.js, import() solo en esta pantalla): el cuerpo de la receta con sus piezas y sus colores, o el avatar ya
// hecho; de lejos (y sin WebGL, sin catálogo o si falla), el muñeco en SVG, que es como te verán a distancia
const PASO_GIRO = Math.PI / 8;
function hayWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}
const quietoPorPreferencia = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
function paraVista() { S.tok++; S.cuerpoCargado = null; if (S.vista) { S.vista.destruye(); S.vista = null; } }
function estado3d(t) { $("estado3d").textContent = t || ""; }
function soloMuneco(texto) { muestra($("avatar3d"), false); muestra($("giro"), false); muestra($("avatarPrev"), true); estado3d(texto); }
function pintaVistas() { $("vistaCerca").setAttribute("aria-pressed", S.lejos ? "false" : "true"); $("vistaLejos").setAttribute("aria-pressed", S.lejos ? "true" : "false"); }
async function vistaPrevia() {
  const tok = ++S.tok, e = S.e, a = delCatalogo(e.vrm), v = a ? null : S.R.vestido(S.v2, e), c = v ? v.cuerpo : null;
  const nombre = a ? a.nombre : "tu avatar", fichero = a ? a.fichero : c ? c.fichero : null, sha = a ? a.sha256 : c ? c.sha256 : null;
  dibujaMuneco($("avatarPrev"), e);   // el muñeco: mientras carga, de lejos y si no carga
  if (!fichero || S.lejos) { S.vista?.quita(); S.cuerpoCargado = null; soloMuneco(S.lejos && fichero ? "De lejos te verán así, como un muñeco con tus colores." : ""); return; }
  if (!hayWebGL()) { soloMuneco("Este aparato no enseña la vista previa en 3D. Puedes elegir igualmente."); return; }
  try {
    if (!S.vista) {
      const m = await import("./vista3d.js");
      if (tok !== S.tok) return;
      muestra($("avatar3d"), true);   // con tamaño antes de crear la vista: el lienzo mide lo que dice el CSS
      S.vista = m.creaVista($("avatar3d"), { quieto: S.pausada, alPerder: () => soloMuneco("Se ha perdido la vista previa en 3D. Tu elección se guarda igual.") });
      pintaPausa();
    }
    if (S.cuerpoCargado !== fichero) {
      estado3d("Cargando la vista previa…");
      await S.vista.carga("/avatares/" + encodeURIComponent(fichero) + "?v=" + sha, sha, { realista: !!c });
      if (tok !== S.tok) return;
      S.cuerpoCargado = fichero;
    }
    if (v) S.vista.viste(v);
    muestra($("avatarPrev"), false); muestra($("avatar3d"), true); muestra($("giro"), true); estado3d("");
    anuncia("Vista previa de " + nombre + ".");
  } catch {
    if (tok !== S.tok) return;
    paraVista(); soloMuneco("No hemos podido enseñar la vista previa en 3D. Puedes elegir igualmente.");
  }
}
function pintaPausa() {
  const b = $("giroPausa");
  b.setAttribute("aria-pressed", S.pausada ? "true" : "false"); b.textContent = S.pausada ? "Seguir el giro" : "Parar el giro";
}
$("giroIzq").addEventListener("click", () => S.vista?.gira(-PASO_GIRO));
$("giroDer").addEventListener("click", () => S.vista?.gira(PASO_GIRO));
$("giroPausa").addEventListener("click", () => { S.pausada = !S.pausada; S.vista?.pausa(S.pausada); pintaPausa(); });
$("vistaCerca").addEventListener("click", () => { S.lejos = false; pintaVistas(); vistaPrevia(); });
$("vistaLejos").addEventListener("click", () => { S.lejos = true; pintaVistas(); vistaPrevia(); });

function eligeVrm(id) { cambia("vrm", delCatalogo(id) ? id : null); }
async function entraAvatar() {
  const primero = !!S.sesion?.primer_acceso;
  muestra($("pasosAvatar"), primero); muestra($("atrasAvatar"), primero); muestra($("volverAvatar"), !primero);
  S.pausada = quietoPorPreferencia(); S.lejos = false; pintaVistas();
  // lo puro (receta.js), lo que ya tiene elegido el hogar (si lo hay) y el catálogo, a la vez
  const [R, guardado] = await Promise.all([S.R ? S.R : import("./receta.js"), pide("GET", "/api/yo/avatar").catch(() => null), leeCatalogo()]);
  S.R = R;
  if (S.pantalla !== "avatar") return;
  if (guardado?.status === 401) { await leeSesion(); ir("portada"); return; }
  S.v2 = R.leeV2(S.catalogo || null);
  S.e = guardado?.status === 200 && guardado.json ? R.deGuardado(S.v2, guardado.json, catalogados()) : R.inicial(S.v2);
  pintaAvatar(); soloMuneco("");
  vistaPrevia();
}
$("btnAzar").addEventListener("click", () => {
  if (!S.R) return;
  S.e = S.R.azar(S.e, S.v2);
  pintaAvatar(); vistaPrevia();
  anuncia("Cambiado al azar: " + S.R.describe(S.v2, S.e));
});
$("fAvatar").addEventListener("submit", async e => {
  e.preventDefault();
  if (!S.R || !S.e) return;
  let r; try { r = await pide("PUT", "/api/yo/avatar", S.R.peticion(S.v2, S.e)); } catch { r = { status: 0 }; }
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
  // los avatares ya hechos (v1) y los cuerpos del creador que se ofrecen (v2; los peques no, decisión 132)
  for (const a of [...(cat.avatares || []), ...(cat.cuerpos || []).filter(c => c.ofrecer)]) {
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
const TEXTO_GAFAS_OFICINA = "Aprobado. Las gafas entrarán en unos segundos como visitante, sin las herramientas de la oficina, y valdrán 12 horas.";
async function decide(aprobar) {
  const i = $("codigoTecleado"), v = i.value.trim(), limpio = v.replace(/[\s-]/g, "").toUpperCase();
  aviso($("okVincular"), $("okVincularTxt"), null);
  if (!/^[2-9A-HJKMNP-Z]{6}$/.test(limpio)) {
    return errorCampo(i, $("eCodigo"), /[01OIL]/.test(limpio) ? "El código no lleva 0, O, 1, I ni L: revisa esa letra en las gafas." : "El código tiene 6 letras y números, como K7Q-4M2.");
  }
  let r; try { r = await pide("POST", "/api/yo/dispositivos/vincular", { codigo: v, aprobar }); } catch { r = { status: 0 }; }
  if (r.status === 204) {
    errorCampo(i, $("eCodigo"), null); i.value = "";
    // ADR-0028: las gafas que aprueba una cuenta de la oficina entran como visitante (sin la oficina) y valen 12 horas
    const deOficina = S.sesion && (S.sesion.rol === "oficina" || S.sesion.rol === "admin");
    aviso($("okVincular"), $("okVincularTxt"), !aprobar ? "Rechazado. Esas gafas no entrarán."
      : deOficina ? TEXTO_GAFAS_OFICINA : "Aprobado. Las gafas entrarán con tu cuenta en unos segundos.");
    anuncia($("okVincularTxt").textContent); return;
  }
  if (r.status === 401) { await leeSesion(); ir("portada"); return; }
  errorCampo(i, $("eCodigo"), r.json?.mensaje || TEXTO_RED);
}
$("fVincular").addEventListener("submit", e => { e.preventDefault(); decide(true); });
$("btnRechazar").addEventListener("click", () => decide(false));

// ---------- llaves de acceso (OF13b-7, ADR-0029; doc/sistema/LLAVES-DE-ACCESO.md §3 y UX.md §4.2b). La librería (@simplewebauthn/browser) y la lógica
// (llave_flujo.js, llave_puro.js) se piden con import() al abrir «Entrar», la portada con sesión o «Mis dispositivos»: el arranque no importa nada.
// Cualquier fallo al cargarlas deja la portada como estaba (solo el enlace por correo).
let llavesListas = null, llavesCarga = null;
function cargaLlaves() {
  llavesCarga ||= (async () => {
    const [web, flujo, P] = await Promise.all([import("@simplewebauthn/browser"), import("./llave_flujo.js"), import("./llave_puro.js")]);
    const L = flujo.creaLlaves({
      pide,
      lib: {
        browserSupportsWebAuthn: web.browserSupportsWebAuthn, browserSupportsWebAuthnAutofill: web.browserSupportsWebAuthnAutofill,
        platformAuthenticatorIsAvailable: web.platformAuthenticatorIsAvailable, startAuthentication: web.startAuthentication, startRegistration: web.startRegistration,
        cancelCeremony: () => web.WebAuthnAbortService.cancelCeremony(),
      },
      memoria: {
        lee: () => { try { return localStorage.getItem(P.CLAVE_RECUERDO); } catch { return null; } },
        guarda: b => { try { localStorage.setItem(P.CLAVE_RECUERDO, b); } catch { /* solo comodidad */ } },
      },
      ahora: () => Date.now(), agente: navigator.userAgent,
    });
    return (llavesListas = { L, P });
  })().catch(() => { llavesCarga = null; return null; });
  return llavesCarga;
}
/** Un aviso con role=alert o status: el texto, visible y con el foco (UX §7: el cambio de estado se anuncia y se alcanza). */
function avisaLlave(caja, txt, texto, { foco = true } = {}) {
  if (!texto) { caja.hidden = true; return; }
  txt.textContent = texto; caja.hidden = false;
  if (foco) caja.focus();
}

// -- entrar con la llave (UX §4.2): botón grande y autorrelleno del campo del correo
async function trasEntrarConLlave(r) {
  const { P } = llavesListas;
  if (r.obsoleta || r.silencioso) return;
  if (!r.ok) { avisaLlave($("avLlave"), $("avLlaveTxt"), r.texto); armaAutorrelleno(); return; }
  const ancla = P.anclaDeDestino(r.destino);
  if (ancla) { await leeSesion(); ir(ancla); return; }   // «/#bienvenida»: primer acceso o normas nuevas, dentro de la misma portada
  location.assign(r.destino);
}
async function armaAutorrelleno() {
  const { L } = llavesListas;
  if (S.pantalla !== "entrar" || !(await L.admiteAutorrelleno()) || S.pantalla !== "entrar") return;
  trasEntrarConLlave(await L.entra({ condicional: true }));
}
async function pantallaEntrar() {
  avisaLlave($("avLlave"), $("avLlaveTxt"), null);
  const ll = await cargaLlaves();
  if (!ll || S.pantalla !== "entrar") { $("bloqueLlave").hidden = true; return; }
  const hay = ll.L.soporte();
  $("bloqueLlave").hidden = !hay;   // sin soporte de WebAuthn solo se ofrece el enlace, sin errores
  if (hay) armaAutorrelleno();
}
$("btnLlave").addEventListener("click", async () => {
  const b = $("btnLlave"), ll = await cargaLlaves();
  if (!ll) return;
  avisaLlave($("avLlave"), $("avLlaveTxt"), null);
  b.disabled = true;
  try { await trasEntrarConLlave(await ll.L.entra({ condicional: false })); } finally { b.disabled = false; }
});

// -- la oferta tras el primer enlace (LLAVES-DE-ACCESO §3.1): solo si toca
let ofertaTok = 0;
async function revisaOferta() {
  const tok = ++ofertaTok, caja = $("ofertaLlave");
  caja.hidden = true;
  const s = S.sesion;
  if (!s || s.primer_acceso || s.entrada !== "enlace") return;   // lo barato primero: sin esto no se carga nada
  const ll = await cargaLlaves();
  if (!ll) return;
  const r = await ll.L.evalua(s);
  if (tok !== ofertaTok || S.pantalla !== "portada" || !r.ofrecer) return;
  $("llaveNombre").value = ll.L.nombrePropuesto();
  $("campoOferta").hidden = false; $("botonesOferta").hidden = false;
  avisaLlave($("avOferta"), $("avOfertaTxt"), null); avisaLlave($("okOferta"), $("okOfertaTxt"), null);
  caja.hidden = false;
}
function cierraOferta(texto) {
  $("ofertaLlave").hidden = true;
  anuncia(texto); $("btnSeguir").focus();
}
$("ofertaAhoraNo").addEventListener("click", () => { llavesListas?.L.responde("ahora_no"); cierraOferta("Vale. No te lo volveremos a preguntar en 30 días."); });
$("ofertaNunca").addEventListener("click", () => { llavesListas?.L.responde("nunca"); cierraOferta("Vale. No te lo volveremos a preguntar en este navegador."); });
$("ofertaSi").addEventListener("click", async () => {
  const b = $("ofertaSi"), ll = llavesListas;
  if (!ll) return;
  avisaLlave($("avOferta"), $("avOfertaTxt"), null);
  b.disabled = true;
  const r = await ll.L.crea($("llaveNombre").value.trim());
  b.disabled = false;
  // un fallo del alta no rompe la entrada: la persona ya está dentro, solo se le dice y puede volver a probar o seguir
  if (!r.ok) { avisaLlave($("avOferta"), $("avOfertaTxt"), r.texto); return; }
  $("campoOferta").hidden = true; $("botonesOferta").hidden = true;
  avisaLlave($("okOferta"), $("okOfertaTxt"), "Listo: se ha guardado la llave «" + r.nombre + "». La próxima vez podrás entrar con ella. También intentamos avisarte por correo de este cambio.");
});

// -- Mis llaves, en Mis dispositivos (UX §4.11): lista, añadir otra y quitar con confirmación
let quitando = null;
async function pintaMisLlaves() {
  const c = $("misLlaves");
  c.hidden = true;
  const s = S.sesion;
  if (!s || s.titular !== true || s.entrada === "codigo") return;   // nunca desde unas gafas
  const ll = await cargaLlaves();
  if (!ll) return;
  const r = await ll.L.lista();
  if (S.pantalla !== "dispositivos") return;
  if (!r.ok) {
    if (r.status === 401) { await leeSesion(); ir("portada"); return; }
    // sin lista no se enseña una vacía que engañaría: el aviso y «Probar otra vez» (el resto de «Mis dispositivos» sigue igual)
    c.hidden = false; $("listaLlaves").replaceChildren(); $("llavesVacio").hidden = true; $("btnOtraLlave").hidden = true; $("campoOtraLlave").hidden = true;
    $("btnReintentaLlaves").hidden = false;
    avisaLlave($("okLlaves"), $("okLlavesTxt"), null);
    avisaLlave($("avLlaves"), $("avLlavesTxt"), r.texto, { foco: false });
    return;
  }
  $("btnReintentaLlaves").hidden = true; avisaLlave($("avLlaves"), $("avLlavesTxt"), null);
  c.hidden = false;
  repintaLlaves(ll, r);
}
$("btnReintentaLlaves").addEventListener("click", async () => {
  const b = $("btnReintentaLlaves"); b.disabled = true;
  await pintaMisLlaves();
  b.disabled = false;
  if (!$("btnReintentaLlaves").hidden) b.focus();
});
function repintaLlaves(ll, r) {
  const ul = $("listaLlaves"), ahora = Date.now();
  ul.replaceChildren();
  for (const l of r.llaves) {
    const li = document.createElement("li"), datos = document.createElement("div"), n = document.createElement("p"), nom = document.createElement("strong"), p = document.createElement("p"), q = document.createElement("button");
    datos.className = "datos"; nom.textContent = l.nombre; n.appendChild(nom);
    if (l.es_esta) { const e = document.createElement("span"); e.className = "pill"; e.textContent = "esta"; n.append(" ", e); }
    p.className = "pista"; p.textContent = ll.P.resumenMiLlave(l, ahora);
    q.type = "button"; q.className = "btn btn-peligro"; q.textContent = "Quitar"; q.setAttribute("aria-label", "Quitar la llave «" + l.nombre + "»");
    q.addEventListener("click", () => pideQuitar(ll, l, r.llaves.length, q));
    datos.append(n, p); li.append(datos, q); ul.appendChild(li);
  }
  $("llavesVacio").hidden = r.llaves.length > 0;
  const puede = r.puede_anadir && ll.L.soporte();
  $("btnOtraLlave").hidden = !puede; $("campoOtraLlave").hidden = true;
  $("btnOtraLlave").textContent = r.llaves.length ? "Añadir otra llave" : "Crear una llave en este aparato";
}
async function recargaLlaves(ll, aviso) {
  const r = await ll.L.lista();
  if (r.ok) repintaLlaves(ll, r);
  if (aviso) avisaLlave($("okLlaves"), $("okLlavesTxt"), aviso);
}
function pideQuitar(ll, l, total, boton) {
  quitando = { ll, l, total, boton };
  $("dlgQuitarTxt").textContent = ll.P.textoQuitar(l, total);
  const d = $("dlgQuitar");
  if (typeof d.showModal === "function") { d.showModal(); $("dlgQuitarNo").focus(); }
  else if (confirm($("dlgQuitarTxt").textContent)) confirmaQuitar();   // navegador sin <dialog>: la confirmación nativa de siempre
}
async function confirmaQuitar() {
  const q = quitando; quitando = null;
  const d = $("dlgQuitar");
  if (d.open) d.close();
  if (!q) return;
  avisaLlave($("avLlaves"), $("avLlavesTxt"), null); avisaLlave($("okLlaves"), $("okLlavesTxt"), null);
  const r = await q.ll.L.quita(q.l.id);
  if (!r.ok && !r.yaNoEsta) { avisaLlave($("avLlaves"), $("avLlavesTxt"), r.texto); return; }
  if (r.ok && r.era_esta) {   // con esa llave se había abierto esta sesión: la api la cerró
    await leeSesion(); ir("portada"); anuncia("Has quitado la llave con la que entraste. Vuelve a entrar con un enlace o con otra llave."); return;
  }
  const aviso = !r.ok ? r.texto : r.quedan === 0 ? "Llave quitada. " + q.ll.P.TEXTO_ULTIMA_LLAVE :"Llave quitada.";
  await recargaLlaves(q.ll, aviso);
  const b = $("btnOtraLlave"); (b.hidden ? $("okLlaves") : b).focus();
}
$("dlgQuitarSi").addEventListener("click", confirmaQuitar);
$("dlgQuitarNo").addEventListener("click", () => { quitando = null; $("dlgQuitar").close(); });
$("dlgQuitar").addEventListener("cancel", () => { quitando = null; });
$("btnOtraLlave").addEventListener("click", async () => {
  const ll = llavesListas, campo = $("campoOtraLlave"), nombre = $("llaveNombreOtra");
  if (!ll) return;
  avisaLlave($("avLlaves"), $("avLlavesTxt"), null); avisaLlave($("okLlaves"), $("okLlavesTxt"), null);
  if (campo.hidden) { nombre.value = ll.L.nombrePropuesto(); campo.hidden = false; nombre.focus(); nombre.select(); return; }   // primer toque: pide el nombre
  const b = $("btnOtraLlave"); b.disabled = true;
  const r = await ll.L.crea(nombre.value.trim());
  b.disabled = false;
  if (!r.ok) { avisaLlave($("avLlaves"), $("avLlavesTxt"), r.texto); return; }
  await recargaLlaves(ll, "Listo: se ha guardado la llave «" + r.nombre + "». También intentamos avisarte por correo de este cambio.");
});

// -- «Salir de todos y quitar las llaves» (LLAVES-DE-ACCESO §5.4): <dialog> de confirmación y un solo paso en la api
function pintaSalidaTotal() {
  $("salidaTotal").hidden = true;   // sin las piezas de las llaves (no cargan) o sin ser titular de una familia, no se ofrece
  cargaLlaves().then(ll => { if (ll && S.pantalla === "dispositivos") $("salidaTotal").hidden = !ll.P.muestraSalidaTotal(S.sesion); });
}
$("btnSalirYQuitar").addEventListener("click", async () => {
  avisaLlave($("avSalidaTotal"), $("avSalidaTotalTxt"), null);
  const ll = await cargaLlaves();
  if (!ll) { avisaLlave($("avSalidaTotal"), $("avSalidaTotalTxt"), TEXTO_RED); return; }
  $("dlgSalirTodoTxt").textContent = ll.P.TEXTO_SALIDA_TOTAL;
  const d = $("dlgSalirTodo");
  if (typeof d.showModal === "function") { d.showModal(); $("dlgSalirTodoNo").focus(); }
  else if (confirm($("dlgSalirTodoTxt").textContent)) confirmaSalidaTotal();
});
async function confirmaSalidaTotal() {
  const d = $("dlgSalirTodo");
  if (d.open) d.close();
  const ll = llavesListas, b = $("btnSalirYQuitar");
  if (!ll) return;
  b.disabled = true;
  const r = await ll.L.quitaTodas();
  b.disabled = false;
  if (!r.ok && r.status === 401) { await leeSesion(); ir("portada"); return; }   // la sesión ya no estaba
  if (!r.ok) { avisaLlave($("avSalidaTotal"), $("avSalidaTotalTxt"), r.texto); return; }   // sigue la sesión: se dice y se puede reintentar
  S.sesion = null; pintaSesion(); ir("portada"); anuncia(ll.P.TEXTO_SALIDA_TOTAL_HECHA);
}
$("dlgSalirTodoSi").addEventListener("click", confirmaSalidaTotal);
$("dlgSalirTodoNo").addEventListener("click", () => { $("dlgSalirTodo").close(); $("btnSalirYQuitar").focus(); });

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
