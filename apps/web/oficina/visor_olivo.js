// Visor 3D del olivo real (OF8b, doc/sistema/OFICINA.md §9.1): en «Olivo real», tras calcular los escalones, «Ver el árbol en 3D» dibuja E0, E1, E2 y E2-VR
// lado a lado con el constructor real (apps/web/olivo/visor.js, three 0.128 del constructor), cada uno con su rótulo y sus triángulos y llamadas.
// three llega con import() perezoso («gemelo-olivo-visor») SOLO al abrir el visor (decisión 144): la oficina no lo carga. Las cuentas (celdas, cámara,
// rótulos), en visor_olivo_puro.js. Todo el DOM va con textContent y sin estilos en línea (CSP style-src 'self'): las columnas son una clase.
// Girar y acercar: OrbitControls de three (ratón o dedo) y, para el teclado, botones. Esc cierra. Al cerrar o cambiar de olivo se libera la GPU.
import { $, h, vacia } from "./comun.js";
import { PASO_GIRO, PASO_ZOOM, TEXTOS, acerca, columnas, encuadre, escalonesDelVisor, gira, pixelRatio, rectGL, rotulos } from "./visor_olivo_puro.js";

export function creaVisorOlivo(contenedor) {
  let V = null, visor = null, abierto = false, abriendo = false, actual = null, enc = null, celdas = [], cols = 0;
  const msg = h("p", { class: "nota", id: "rVisorMsg", role: "status", "aria-live": "polite" });
  const bAbre = h("button", { class: "boton prim", id: "rVer3d", type: "button", onclick: () => abre() }, "Ver el árbol en 3D");
  const boton = (id, texto, etiqueta, fn) => h("button", { class: "boton peq", id, type: "button", "aria-label": etiqueta, onclick: fn }, texto);
  const mandos = h("div", { class: "barra-h", id: "rVisorMandos", role: "toolbar", "aria-label": "Mover la cámara del visor", hidden: true },
    boton("rGiraI", "⟲ Girar", "Girar a la izquierda", () => mueve(p => gira(p.posicion, p.objetivo, -PASO_GIRO))),
    boton("rGiraD", "Girar ⟳", "Girar a la derecha", () => mueve(p => gira(p.posicion, p.objetivo, PASO_GIRO))),
    boton("rAcerca", "＋ Acercar", "Acercar", () => mueve(p => acerca(p.posicion, p.objetivo, PASO_ZOOM, p.minDistancia, p.maxDistancia))),
    boton("rAleja", "－ Alejar", "Alejar", () => mueve(p => acerca(p.posicion, p.objetivo, 1 / PASO_ZOOM, p.minDistancia, p.maxDistancia))),
    boton("rEncuadra", "Encuadrar", "Volver al encuadre inicial", () => { if (visor && enc) visor.camara(enc); }),
    h("button", { class: "boton suave empuja", id: "rCierra3d", type: "button", onclick: () => cierra(true) }, "Cerrar el visor (Esc)"));
  const rejilla = h("div", { class: "visor-celdas", id: "rVisorCeldas" });
  const host = h("div", { class: "visor-host", id: "rVisorHost", hidden: true }, rejilla);
  const tarjeta = h("div", { class: "tarjeta visor-olivo", id: "rVisor", hidden: true },
    h("h3", null, "El árbol en 3D, escalón a escalón"),
    h("p", { class: "nota" }, TEXTOS.honesto),
    h("div", { class: "barra-h" }, bAbre), mandos, msg, host,
    h("p", { class: "nota", id: "rVisorUso", hidden: true }, TEXTOS.uso + " " + TEXTOS.escena),
    h("span", { class: "pill p-ilustrativo" }, "ilustrativo: la forma del árbol; medidas del LiDAR 2024"));
  contenedor.append(tarjeta);
  // Esc cierra el visor desde cualquier sitio de la página (al girar con el ratón el foco no entra en el lienzo: OrbitControls evita el foco),
  // salvo si hay un diálogo abierto, que se queda con su Esc
  const alEsc = e => { if (e.key === "Escape" && abierto && !e.defaultPrevented && !document.querySelector("dialog[open]")) { e.preventDefault(); cierra(true); } };
  const aviso = (t, mal) => { msg.textContent = t || ""; msg.classList.toggle("mal", !!mal); };

  /** Las celdas en la vista de WebGL (px CSS, origen abajo a la izquierda), las lee visor.js en cada dibujo */
  const vistas = () => { const l = host.getBoundingClientRect(); return celdas.map(c => Object.assign({ k: c.k }, rectGL(c.el.getBoundingClientRect(), l))); };
  function reparte() {
    const n = celdas.length, c = columnas(n, rejilla.clientWidth || contenedor.clientWidth || 0);
    if (c !== cols) { rejilla.classList.remove("cols-" + cols); rejilla.classList.add("cols-" + c); cols = c; }
  }
  const vigia = typeof ResizeObserver === "function" ? new ResizeObserver(() => reparte()) : null;
  if (vigia) vigia.observe(tarjeta);

  function pintaCeldas(u) {
    const ks = escalonesDelVisor(u.filas, u.recetas), porK = Object.fromEntries(rotulos(u.filas).map(r => [r.k, r]));
    vacia(rejilla); celdas = [];
    for (const k of ks) {
      const r = porK[k];
      const el = h("div", { class: "visor-celda", id: "v3d-" + k, role: "img", "aria-label": r.etiqueta + " (forma ilustrativa)" },
        h("div", { class: "visor-rotulo" }, h("strong", null, r.titulo), h("small", null, r.cifras)));
      rejilla.append(el); celdas.push({ k, el });
    }
    cols = 0; reparte();
    return ks;
  }

  async function pon(u) {
    const ks = pintaCeldas(u), recetas = Object.fromEntries(ks.map(k => [k, u.recetas[k]]));
    const c0 = celdas[0] && celdas[0].el.getBoundingClientRect();
    enc = encuadre({ alto: u.alto, copa: u.copa }, c0 && c0.height ? c0.width / c0.height : 0.8);
    await visor.pon(recetas, u.entrada.epoca, enc);
    const av = visor.avisos();
    aviso(av.length ? "Sin alguna foto de corteza: " + av.join(" · ") : "");
  }

  async function abre() {
    if (abierto || abriendo || !actual) return;
    abriendo = true; bAbre.disabled = true; aviso(TEXTOS.cargando);
    try {
      if (!V) {
        const m = await import("gemelo-olivo-visor");
        if (m.sinConstructor || typeof m.creaVisor !== "function") throw new Error("Este build no lleva el constructor de olivos (falta instalar apps/web/olivo: cd apps/web/olivo && npm ci).");
        V = m;
      }
      if (!V.hayWebGL()) { aviso(TEXTOS.sinWebgl, true); return; }
      host.hidden = false; mandos.hidden = false; $("#rVisorUso", tarjeta).hidden = false; bAbre.hidden = true;
      visor = V.creaVisor(host, { pixelRatio: pixelRatio(window.devicePixelRatio), celdas: vistas, alPerder: () => { aviso("El navegador ha perdido el dibujo 3D (contexto WebGL). Cierra y vuelve a abrir el visor.", true); } });
      abierto = true; document.addEventListener("keydown", alEsc);
      await pon(actual);
      $("#rGiraD", tarjeta).focus();
    } catch (e) {
      cierra(false);
      aviso(e && e.message ? e.message : "No se pudo abrir el visor 3D.", true);
    } finally { abriendo = false; bAbre.disabled = false; }
  }

  function mueve(fn) { if (visor) visor.mueve(fn(visor.vista())); }

  /** Libera la GPU (árboles, materiales, renderer) y deja la tarjeta con su botón */
  function cierra(conFoco) {
    if (visor) { visor.libera(); visor = null; }
    abierto = false; document.removeEventListener("keydown", alEsc); host.hidden = true; mandos.hidden = true; $("#rVisorUso", tarjeta).hidden = true; bAbre.hidden = false;
    vacia(rejilla); celdas = []; aviso("");
    if (conFoco) bAbre.focus();
  }

  return {
    /** Un olivo nuevo (o la misma época cambiada): si el visor está abierto, se redibuja con lo nuevo (los árboles de antes se liberan) */
    async muestra(u) {
      actual = u; tarjeta.hidden = !u;
      if (abierto && u) { try { await pon(u); } catch (e) { aviso(e && e.message ? e.message : "No se pudo dibujar el olivo.", true); } }
    },
    cierra: () => cierra(false),
    abierto: () => abierto,
    /** Solo lectura, para la prueba de Chrome */
    estado: () => (visor ? Object.assign({ abierto, cols, celdas: celdas.map(c => c.k) }, visor.info()) : { abierto, cols, celdas: [] }),
    muestreo: () => (visor ? visor.muestreo() : null),
  };
}
