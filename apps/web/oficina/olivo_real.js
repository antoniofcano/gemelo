// Olivo real (OF8, doc/sistema/OFICINA.md §9.1): busca un olivo de una finca por su id estable (copas_id) y pone sus escalones lado a lado, con sus triángulos.
// Los escalones los calcula el CONSTRUCTOR (apps/web/olivo, receta() y aNivel()), no esta pantalla; llega con import() perezoso, solo al pulsar «Ver escalones»
// (lleva dentro su three 0.128, el del constructor: la oficina no importa three ni el motor). Las cuentas, en olivo_real_puro.js. Todo el DOM va con textContent.
// Es la forma ILUSTRATIVA del árbol con las medidas del LiDAR (copa y altura medidas; asimetría y falda, deducidas; tronco y ramas, ilustrativos).
import { $, aviso, h, vacia } from "./comun.js";
import { EPOCAS, EPOCA_POR_DEFECTO, ESCALONES, buscaOlivo, entradaDeOlivo, fichaDeOlivo, filasEscalones, miles, pct } from "./olivo_real_puro.js";

const FINCA_POR_DEFECTO = "hituelo";
const ORIGEN = { medido: "medido (LiDAR)", deducido: "deducido", tipo: "del tipo (ilustrativo)" };
const coma = (n, d) => n.toFixed(d).replace(".", ",");

export function iniciaOlivoReal() {
  let indice = null, fincaCargada = null, ultimo = null, ocupado = false, generador = null;
  const sFinca = $("#rFinca"), sEpoca = $("#rEpoca");
  sFinca.append(h("option", { value: FINCA_POR_DEFECTO }, FINCA_POR_DEFECTO));
  for (const e of EPOCAS) sEpoca.append(h("option", { value: e, selected: e === EPOCA_POR_DEFECTO }, e));
  $("#rBusca").addEventListener("submit", e => { e.preventDefault(); ve(); });

  async function cargaIndice(finca) {
    if (indice && fincaCargada === finca) return indice;
    let d = null;
    try { const r = await fetch("/teselas/" + encodeURIComponent(finca) + "/indice.json", { credentials: "same-origin" }); if (r.ok) d = await r.json(); } catch { /* sin red */ }
    if (!d || !Array.isArray(d.copas)) throw new Error("No se pudo leer el índice de " + finca + " (/teselas/" + finca + "/indice.json).");
    indice = d; fincaCargada = finca;
    return d;
  }
  /** El constructor, una sola vez (import() perezoso: three 0.128 y el generador van en un trozo aparte). Sin él (sin_olivo.js), un mensaje claro. */
  async function traeGenerador() {
    if (generador) return generador;
    const O = await import("gemelo-olivo");
    if (O.sinConstructor || typeof O.receta !== "function") throw new Error("Este build no lleva el constructor de olivos (falta instalar apps/web/olivo: cd apps/web/olivo && npm ci).");
    return (generador = O);
  }
  const mensaje = (t, mal) => { const m = $("#rMsg"); m.textContent = t || ""; m.classList.toggle("mal", !!mal); };

  async function ve() {
    if (ocupado) return;
    const finca = sFinca.value || FINCA_POR_DEFECTO, epoca = sEpoca.value;
    ocupado = true; $("#rVer").disabled = true; mensaje("Leyendo el índice de " + finca + "…");
    try {
      const d = await cargaIndice(finca), q = buscaOlivo(d, $("#rId").value, finca);
      if (q.error) { mensaje(q.error, true); vacia($("#rSalida")); ultimo = null; return; }
      const O = await traeGenerador(), entrada = entradaDeOlivo(d, q.i, epoca), ficha = fichaDeOlivo(d, q.i);
      mensaje("Calculando los escalones con el constructor…");
      await new Promise(r => setTimeout(r, 0));   // deja pintar el aviso antes de la cuenta síncrona
      const t0 = performance.now(), r0 = O.receta(entrada), tReceta = performance.now() - t0, medidas = {};
      for (const [k] of ESCALONES) {
        const t = performance.now(), rk = O.aNivel(r0, k);
        medidas[k] = { triangulos: O.triangulosNivel(rk), mallas: O.llamadasNivel(rk), ms: (k === "E0" ? tReceta : 0) + performance.now() - t };
      }
      ultimo = { finca, i: q.i, id: q.id, entrada, ficha, medidas, filas: filasEscalones(medidas), alto: r0.medidas.altura_m, copa: r0.medidas.copa_m };
      pinta(ultimo);
      mensaje("");
    } catch (e) {
      mensaje(e && e.message ? e.message : "No se pudo calcular el olivo.", true); aviso("No se pudo calcular el olivo", "mal");
    } finally { ocupado = false; $("#rVer").disabled = false; }
  }

  function pinta(u) {
    const f = u.ficha, tit = u.id >= 0 ? "olivo:" + u.finca + ":" + u.id : "Olivo de la posición " + u.i + " (sin id estable)";
    const cabecera = h("div", { class: "tarjeta" }, h("h3", null, tit),
      h("p", { class: "nota" }, "Semilla " + u.entrada.semilla + (u.entrada.provisional ? " (provisional: el id viene de la posición UTM, no del censo)" : "") + " · tipo " + u.entrada.tipo + " · época " + u.entrada.epoca +
        " · " + coma(u.alto, 1) + " m de alto y " + coma(u.copa, 1) + " m de copa en el árbol dibujado."),
      h("div", { class: "tabla-env" }, h("table", { "aria-label": "Parámetros del olivo y su origen" },
        h("thead", null, h("tr", null, ...["Parámetro del generador", "Valor", "Origen"].map(x => h("th", { scope: "col" }, x)))),
        h("tbody", null, ...Object.keys(f.parametros).map(k => h("tr", null, h("th", { scope: "row" }, k), h("td", null, String(Math.round(f.parametros[k] * 1000) / 1000).replace(".", ",")), h("td", null, ORIGEN[f.origen[k]] || f.origen[k])))))),
      h("p", { class: "nota" }, f.con_copas_param ? "Con sus copas_param del LiDAR (altura p95, copa, desplazamiento del tronco, rumbo, densidad, base, rugosidad)." :
        "Sin copas_param en el índice: solo la altura y la copa salen del registro (h y r8); lo demás es del tipo (ilustrativo)."));
    const tabla = h("div", { class: "tarjeta" }, h("h3", null, "Escalones lado a lado"),
      h("div", { class: "escalones" }, ...u.filas.map(x => h("div", { class: "escalon", id: "esc-" + x.k },
        h("h4", null, x.nombre), h("p", { class: "cifra" }, miles(x.triangulos)), h("small", null, "triángulos · " + x.mallas + " mallas"),
        h("meter", { min: 0, max: 1, value: Math.min(1, x.parteDeE0), "aria-label": x.nombre + ": " + pct(x.parteDeE0) + " de los triángulos de E0" }),
        h("small", null, pct(x.parteDeE0) + " de E0 · " + Math.round(x.ms) + " ms"), h("p", { class: "nota" }, x.nota)))),
      h("p", { class: "nota" }, "Triángulos contados por el constructor sobre la receta de ese olivo (los puntos no cuentan). El impostor del escalón lejano es un cartel, no una malla de olivo, y no entra en la cuenta. " +
        "Solo cifras: la vista 3D de cada escalón sigue en la herramienta del constructor (apps/web/olivo/herramienta), no en la oficina."),
      h("span", { class: "pill p-ilustrativo" }, "ilustrativo: la forma del árbol; medidas del LiDAR 2024"));
    vacia($("#rSalida")).append(cabecera, tabla);
  }

  return {
    abre() { if (!$("#rId").value) $("#rId").focus(); },
    /** Solo lectura, para la prueba de Chrome. */
    estado() { return ultimo && { finca: ultimo.finca, i: ultimo.i, id: ultimo.id, entrada: ultimo.entrada, medidas: ultimo.medidas, filas: ultimo.filas.map(x => x.k) }; },
  };
}
