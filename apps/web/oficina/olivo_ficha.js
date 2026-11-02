// La ficha de un olivo (OF15b, doc/sistema/OFICINA.md §4 y §9): se llega por «#olivo/<finca>/<copas_id>» (el enlace del panel de Hazas). Pide la ficha a
// GET /api/admin/olivos/<finca>/<copas_id> y la pinta en dos bloques que no se mezclan (regla 5): lo MEDIDO (LiDAR) y lo que PUSO LA FAMILIA (ilustrativo).
// Las cuentas están en olivo_ficha_puro.js. Todo el DOM va con h() y textContent; los enlaces son <a> reales con el hash de enlaces_puro.js.
// Las fotos no salen aquí (EIPD pendiente, decisión 165): si hay una, se dice «Hay una foto colgada (id N)»; para moderarla está la bandeja.
import { $, api, aviso, confirma, h, vacia } from "./comun.js";
import { MAX_MOTIVO, MOTIVOS_DECORACION, accionesDecoracion, cuerpoRetirar, enlacesFicha, filasFicha, mensajeFallo, textosDecoracion } from "./olivo_ficha_puro.js";

export function iniciaFichaOlivo() {
  const indices = new Map();   // finca → índice (solo para «posición N»; sin él, esa fila no sale)
  let pedida = 0, ultima = null, actual = null;

  async function indiceDe(finca) {
    if (indices.has(finca)) return indices.get(finca);
    let d = null;
    try { const r = await fetch("/teselas/" + encodeURIComponent(finca) + "/indice.json", { credentials: "same-origin" }); if (r.ok) d = await r.json(); } catch { /* sin red */ }
    if (d && !Array.isArray(d.copas)) d = null;
    indices.set(finca, d);
    return d;
  }
  const tabla = (titulo, nota, filas) => h("div", { class: "bloque" }, h("h3", null, titulo), nota,
    h("dl", { class: "datos" }, ...filas.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)])));

  // D5 (decisión 178): la oficina solo ve y retira decoraciones. Retirar pide confirmación y motivo (diálogo nativo); restaurar es un clic.
  // Tras actuar se vuelve a leer la ficha y el foco va al botón que queda (o al título).
  function bloqueDecoracion(f) {
    const a = accionesDecoracion(f);
    if (!a.retirar && !a.restaurar) return null;
    const t = textosDecoracion(f), error = h("p", { class: "error", role: "alert" });
    // devuelve el texto de un fallo para que el diálogo siga abierto con él, o undefined si ya está resuelto (hecho, o el 404 de algo que ya cambió)
    const termina = async (hecho, r, accion) => {
      if (r.ok) { aviso(hecho); await abre(actual, true); return undefined; }
      const m = mensajeFallo(r, accion);
      if (r.estado === 404) { aviso(m, "mal"); await abre(actual, true); return undefined; }
      error.textContent = m;
      return m;
    };
    const barra = h("div", { class: "barra-h" });
    if (a.retirar) {
      const boton = h("button", { class: "boton peligro-suave", type: "button", id: "oDecoRetirar", onclick: () => {
        const motivo = h("select", { id: "oDecoMotivo" }, ...MOTIVOS_DECORACION.map(([k, n]) => h("option", { value: k }, n)));
        const nota = h("input", { id: "oDecoNota", type: "text", maxlength: String(MAX_MOTIVO - 40), autocomplete: "off" });
        confirma({
          titulo: t.dialogoTitulo, si: t.dialogoSi,
          cuerpo: [h("p", null, t.dialogoCuerpo),
            h("label", { class: "campo", for: "oDecoMotivo" }, "Motivo (lo lee la familia)"), motivo,
            h("label", { class: "campo", for: "oDecoNota" }, "Una nota breve (opcional)"), nota],
          hecho: async () => {
            const r = await api("POST", a.retirar.ruta, cuerpoRetirar(motivo.value, nota.value));
            return await termina(t.hechoRetirar, r, "retirar");
          },
        });
        motivo.focus();
      } }, t.retirar);
      barra.append(boton);
    }
    if (a.restaurar) {
      barra.append(h("button", { class: "boton", type: "button", id: "oDecoRestaurar", onclick: async e => {
        const boton = e.currentTarget;
        boton.disabled = true;
        const r = await api("POST", a.restaurar.ruta);
        const m = await termina(t.hechoRestaurar, r, "restaurar");
        if (m) boton.disabled = false;
      } }, t.restaurar));
    }
    return h("div", { class: "bloque", id: "oDecoracion" }, h("h3", null, t.titulo),
      h("p", { class: "nota" }, a.restaurar ? t.notaRestaurar : "Solo la oficina puede retirarla; no se puede poner desde aquí. La familia recibe un aviso con el motivo."),
      barra, error);
  }

  async function abre(param, conFoco) {
    actual = param;
    const sitio = vacia($("#oFicha")), n = ++pedida, [finca, id] = String(param).split("/");
    sitio.setAttribute("aria-busy", "true");
    sitio.append(h("h2", { tabindex: "-1", id: "oFichaT" }, "Olivo " + id + " de " + finca), h("p", { class: "nota" }, "Leyendo la ficha…"));
    const [r, indice] = await Promise.all([api("GET", "/api/admin/olivos/" + encodeURIComponent(finca) + "/" + encodeURIComponent(id)), indiceDe(finca)]);
    if (n !== pedida) return;   // otra ficha pedida entretanto
    vacia(sitio); sitio.setAttribute("aria-busy", "false");
    if (!r.ok) {
      ultima = null;
      sitio.append(h("h2", { tabindex: "-1", id: "oFichaT" }, "Olivo " + id + " de " + finca),
        h("p", { class: "error", role: "alert" }, r.estado === 404 ? "No hay ningún olivo con el número " + id + " en " + finca + " (o está retirado del censo)." : r.mensaje),
        h("p", null, h("a", { class: "boton", href: "#hazas", "data-enlace": "hazas" }, "Volver a Hazas")));
      return;
    }
    const f = r.datos, v = filasFicha(f, indice);
    ultima = f;
    sitio.append(h("h2", { tabindex: "-1", id: "oFichaT" }, "Olivo " + f.copas_id + " de " + f.finca),
      tabla("Lo medido", h("p", null, h("span", { class: "pill p-ok" }, "medido (LiDAR 2024)"), " La copa y la altura salen del vuelo; el id, de la finca."), v.medido),
      v.familia
        ? tabla("Lo que le ha puesto la familia", h("p", null, h("span", { class: "pill p-ilustrativo" }, "ilustrativo"), " Lo elige la familia: no es un dato de la explotación."), v.familia)
        : h("div", { class: "bloque" }, h("h3", null, "Lo que le ha puesto la familia"), h("p", { class: "nota" }, v.nota)),
      bloqueDecoracion(f),
      h("nav", { class: "enlaces", "aria-label": "Ir a" }, ...enlacesFicha(f).map(e => h("a", { class: "boton", href: e.hash, "data-enlace": e.clave }, e.texto))));
    // el foco, al botón que queda (o al título); tras el diálogo, cuando ya se ha cerrado y devuelto el foco
    if (conFoco) setTimeout(() => { const b = $("#oDecoRetirar") || $("#oDecoRestaurar") || $("#oFichaT"); if (b) b.focus(); }, 0);
  }

  return { abre, /** Solo lectura, para la prueba de Chrome. */ estado: () => ultima };
}
