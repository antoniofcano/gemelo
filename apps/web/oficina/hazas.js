// Hazas (OF3, doc/sistema/OFICINA.md §4, decisiones 12 y 95): el editor de las lindes sobre la ortofoto y las copas medidas de la finca.
// Mapa con OpenLayers en ETRS89 / UTM 30N (EPSG:25830, definida con proj4), sin pasar por Web Mercator: la base, el motor y la api usan
// las mismas coordenadas. Dibujar, mover vértices (ratón y teclado), mover la haza, añadir y quitar vértices, partir por dos vértices,
// juntar dos vecinas, deshacer y ajustar a vértices y bordes de hazas y parcelas vecinas son interacciones de OpenLayers (Draw, Modify,
// Translate, Snap); lo que este fichero añade es el teclado, el estado y la conversación con la api. El recuento y la superficie que se
// ven mientras se edita son ORIENTATIVOS (hazas_puro.js, en el navegador); los que valen los calcula PostGIS al guardar.
// Datos: /teselas/<finca>/indice.json (mosaico, copas, parcelas) y /teselas/<finca>/t/<kx>_<ky>.jpg, tras la misma sesión (mismo origen).
import "ol/ol.css";
import Map from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import Collection from "ol/Collection.js";
import { MultiPolygon, Point, LineString } from "ol/geom.js";
import TileLayer from "ol/layer/Tile.js";
import ImageLayer from "ol/layer/Image.js";
import VectorLayer from "ol/layer/Vector.js";
import TileImage from "ol/source/TileImage.js";
import ImageStatic from "ol/source/ImageStatic.js";
import ImageCanvasSource from "ol/source/ImageCanvas.js";
import VectorSource from "ol/source/Vector.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import { defaults as controlesBase, ScaleLine } from "ol/control.js";
import { defaults as interaccionesBase, Draw, Modify, Snap, Translate } from "ol/interaction.js";
import { Circle as CirculoEstilo, Fill, Stroke, Style, Text } from "ol/style.js";
import { register } from "ol/proj/proj4.js";
import { get as proyeccion } from "ol/proj.js";
import proj4 from "proj4";
import { $, api, aviso, conConfirmacion, confirma, fecha, h, vacia } from "./comun.js";
import { area, codigoLibre, cuenta, inserta, mueve, num, quita, redondea, sePisan, verticeCercano, vertices } from "./hazas_puro.js";

// ETRS89 / UTM 30N, la de la base, el motor y la api (EPSG:25830)
proj4.defs("EPSG:25830", "+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
register(proj4);
const UTM = proyeccion("EPSG:25830");
const PASO = 0.5, PASO_GRANDE = 5;           // m por pulsación de flecha (Mayús: × 10)
const BORDE = 1;                              // m: «olivo pegado a la linde»
const FINCA_POR_DEFECTO = "hituelo";          // la de las familias (decisión 91) cuando aún no hay hazas

const ACCIONES = { inicial: "versión inicial", carga: "cargada por la tubería", crear: "dibujada", editar: "editada", partir: "partida", partida_de: "nace al partir otra",
  juntar: "juntada con otra", juntada_en: "juntada en otra", volver: "vuelta atrás", borrar: "borrada" };

export function iniciaHazas({ sesion }) {
  let mapa = null, finca = null, indice = null, puntos = [], hazas = [], familias = [];
  let sel = null, guardada = null, pila = [], vk = -1, modo = null, corte = [], versiones = [], vista = null, cargando = 0;
  const fuenteHazas = new VectorSource(), fuenteParcelas = new VectorSource(), fuenteBorrador = new VectorSource(), fuenteMarcas = new VectorSource();
  const enEdicion = new Collection();

  // ---------------------------------------------------------------- estilos
  const COLOR = { libre: "#3d7fd9", familia: "#9dc16a", sel: "#ffd166", mal: "#f07174" };
  function estiloHaza(f) {
    const d = f.get("haza"), es = f === sel, pisa = f.get("pisa");
    const c = pisa ? COLOR.mal : es ? COLOR.sel : d && d.hogar_id ? COLOR.familia : COLOR.libre;
    return new Style({
      fill: new Fill({ color: hexa(c, es ? 0.22 : 0.14) }),
      stroke: new Stroke({ color: c, width: es ? 3.5 : 2, lineDash: pisa ? [8, 6] : undefined }),
      text: new Text({ text: d ? d.codigo : "", font: "600 13px system-ui, sans-serif", fill: new Fill({ color: "#111" }), stroke: new Stroke({ color: "#fff", width: 3 }), overflow: true }),
    });
  }
  const hexa = (hex, a) => "rgba(" + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",") + "," + a + ")";
  const estiloParcela = f => new Style({
    stroke: new Stroke({ color: "#f0b13f", width: 1.5, lineDash: [6, 4] }),
    text: new Text({ text: f.get("nombre") || "", font: "12px system-ui, sans-serif", fill: new Fill({ color: "#f0b13f" }), stroke: new Stroke({ color: "#000", width: 3 }), placement: "line" }),
  });
  const estiloMarca = f => {
    const t = f.get("tipo");
    if (t === "corte") return new Style({ stroke: new Stroke({ color: COLOR.mal, width: 3, lineDash: [10, 6] }) });
    if (t === "vista") return new Style({ stroke: new Stroke({ color: "#ffffff", width: 2.5, lineDash: [4, 4] }) });
    return new Style({ image: new CirculoEstilo({ radius: t === "vertice" ? 8 : 6, fill: new Fill({ color: t === "vertice" ? COLOR.sel : COLOR.mal }), stroke: new Stroke({ color: "#111", width: 2 }) }) });
  };

  // ---------------------------------------------------------------- capas
  const capaMosaico = new ImageLayer({ properties: { nombre: "orto" } });
  const capaTeselas = new TileLayer({ maxResolution: 2.5, properties: { nombre: "orto" } });
  const fuenteCopas = new ImageCanvasSource({ ratio: 1, canvasFunction: dibujaCopas });
  const capaCopas = new ImageLayer({ source: fuenteCopas, maxResolution: 4 });
  const capaParcelas = new VectorLayer({ source: fuenteParcelas, style: estiloParcela });
  const capaHazas = new VectorLayer({ source: fuenteHazas, style: estiloHaza });
  const capaBorrador = new VectorLayer({ source: fuenteBorrador });
  const capaMarcas = new VectorLayer({ source: fuenteMarcas, style: estiloMarca });

  /** Las copas medidas (LiDAR) como círculos de su radio medio, dibujadas de una vez en un lienzo (decenas de miles de árboles). */
  function dibujaCopas(extent, resolucion, ratioPx, tam) {
    const lienzo = document.createElement("canvas");
    lienzo.width = tam[0]; lienzo.height = tam[1];
    if (!indice) return lienzo;
    const c = lienzo.getContext("2d"), [cx, cy] = indice.centro_utm, k = ratioPx / resolucion;
    c.fillStyle = "rgba(157, 193, 106, 0.30)"; c.strokeStyle = "rgba(20, 24, 15, 0.85)"; c.lineWidth = Math.max(1, ratioPx);
    c.beginPath();
    for (const q of indice.copas) {
      const x = cx + q[0], y = cy + q[1];
      if (x < extent[0] - 10 || x > extent[2] + 10 || y < extent[1] - 10 || y > extent[3] + 10) continue;
      const r8 = q[3], rm = Array.isArray(r8) ? r8.reduce((s, v) => s + v, 0) / r8.length : 2;
      const px = (x - extent[0]) * k, py = (extent[3] - y) * k;
      c.moveTo(px + rm * k, py); c.arc(px, py, Math.max(1.5, rm * k), 0, Math.PI * 2);
    }
    c.fill(); c.stroke();
    return lienzo;
  }

  // ---------------------------------------------------------------- interacciones (OpenLayers)
  const modifica = new Modify({ features: enEdicion, pixelTolerance: 10 });
  const traslada = new Translate({ features: enEdicion });
  const dibuja = new Draw({ source: fuenteBorrador, type: "Polygon" });
  const ajusteH = new Snap({ source: fuenteHazas, pixelTolerance: 12 });
  const ajusteP = new Snap({ source: fuenteParcelas, pixelTolerance: 12 });
  traslada.setActive(false); dibuja.setActive(false);
  modifica.on("modifystart", () => apila());
  modifica.on("modifyend", () => { cambiado(); });
  traslada.on("translatestart", () => apila());
  traslada.on("translateend", () => cambiado());
  dibuja.on("drawend", e => { const g = e.feature.getGeometry(); setTimeout(() => { fuenteBorrador.clear(); pideDatosNueva(g.getCoordinates()); }, 0); });

  function creaMapa() {
    mapa = new Map({
      target: "mapa",
      layers: [capaMosaico, capaTeselas, capaCopas, capaParcelas, capaHazas, capaBorrador, capaMarcas],
      controls: controlesBase({ attribution: false, rotate: false }).extend([new ScaleLine()]),
      // sin el teclado de OpenLayers: las flechas son del editor (mover vértices) y, sin vértice elegido, mueven el mapa (abajo)
      interactions: interaccionesBase({ keyboard: false, altShiftDragRotate: false, pinchRotate: false, doubleClickZoom: false }),
      view: new View({ projection: UTM, center: [0, 0], resolution: 2, minResolution: 0.05, maxResolution: 40 }),
    });
    // orden: lo último que se añade recibe el evento primero; los ajustes van detrás de Modify y Draw
    for (const i of [traslada, modifica, dibuja, ajusteH, ajusteP]) mapa.addInteraction(i);
    mapa.on("singleclick", clic);
    mapa.on("pointermove", e => {
      const [x, y] = e.coordinate, [lon, lat] = proj4("EPSG:25830", "EPSG:4326", [x, y]);
      $("#mCoord").textContent = "E " + num(x, 1) + " · N " + num(y, 1) + " (" + lat.toFixed(5) + "°, " + lon.toFixed(5) + "°)";
    });
    $("#mapa").addEventListener("keydown", teclado);
  }

  // ---------------------------------------------------------------- carga
  async function abre() {
    if (!mapa) creaMapa();
    if (sucia()) { setTimeout(() => mapa.updateSize(), 0); return; }   // volver a la sección no pierde una linde a medio editar
    const n = ++cargando;
    const [rh, rf] = await Promise.all([api("GET", "/api/admin/hazas?geometria=true"), api("GET", "/api/admin/hogares?limite=200")]);
    if (n !== cargando) return;
    if (!rh.ok) { aviso(rh.mensaje, "mal"); return; }
    hazas = rh.datos.hazas;
    familias = rf.ok ? rf.datos.hogares.filter(f => f.rol === "hogar" && f.activo) : [];
    const fincas = [...new Set(hazas.map(z => z.finca))].sort();
    if (!fincas.length) fincas.push(FINCA_POR_DEFECTO);
    const sf = $("#hFinca");
    if (!finca || !fincas.includes(finca)) finca = fincas.includes(FINCA_POR_DEFECTO) ? FINCA_POR_DEFECTO : fincas[0];
    vacia(sf).append(...fincas.map(f => h("option", { value: f, selected: f === finca }, f)));
    sf.disabled = fincas.length < 2;
    if (!indice || indice.__finca !== finca) await cargaFinca();
    pintaHazas();
    setTimeout(() => mapa.updateSize(), 0);
  }

  async function cargaFinca() {
    estadoMapa("Cargando la ortofoto y las copas de " + finca + "…");
    const base = "/teselas/" + encodeURIComponent(finca) + "/";
    let d = null;
    try { const r = await fetch(base + "indice.json", { credentials: "same-origin" }); if (r.ok) d = await r.json(); } catch { /* sin red */ }
    if (!d || !Array.isArray(d.centro_utm)) {
      indice = { __finca: finca, centro_utm: [0, 0], copas: [] }; puntos = [];
      estadoMapa("No se pudo leer el índice de " + finca + " (" + base + "indice.json): el mapa va sin ortofoto ni copas.");
      capaMosaico.setSource(null); capaTeselas.setSource(null); fuenteParcelas.clear(); fuenteCopas.changed();
      return;
    }
    d.__finca = finca; indice = d;
    const [cx, cy] = d.centro_utm;
    puntos = d.copas.map(q => [cx + q[0], cy + q[1]]);
    const M = d.mosaico;
    if (M && M.jpg) {
      capaMosaico.setSource(new ImageStatic({ url: M.jpg, projection: UTM, imageExtent: [cx + M.x0, cy + M.yN - M.h * M.res, cx + M.x0 + M.w * M.res, cy + M.yN], interpolate: true }));
    }
    // teselas de la ortofoto: (kx, ky) cubre en UTM [kx·256, kx·256+256) × [ky·256, ky·256+256), fila 0 = norte (CONTRATOS.md §1.3)
    const prefijo = typeof d.base === "string" && d.base.startsWith("/") ? d.base : base + (d.base || "");
    const px = d.orto_px || 512;
    const rejilla = new TileGrid({ origin: [0, 0], resolutions: [256 / px], tileSize: px });
    capaTeselas.setSource(new TileImage({
      projection: UTM, tileGrid: rejilla, transition: 0,
      tileUrlFunction: tc => { const clave = tc[1] + "_" + (-tc[2] - 1); return d.teselas && d.teselas[clave] ? prefijo + "t/" + clave + ".jpg" : undefined; },
    }));
    fuenteParcelas.clear();
    for (const p of d.parcelas || []) {
      if (!Array.isArray(p.linde) || p.linde.length < 3) continue;
      const an = p.linde.map(q => [cx + q[0], cy + q[1]]);
      if (an[0][0] !== an[an.length - 1][0] || an[0][1] !== an[an.length - 1][1]) an.push(an[0]);
      fuenteParcelas.addFeature(new Feature({ geometry: new LineString(an), nombre: p.nombre || p.id }));
    }
    fuenteCopas.changed();
    const e = d.ext ? [cx + d.ext[0], cy + d.ext[3], cx + d.ext[2], cy + d.ext[1]] : null;
    if (e) mapa.getView().fit(e, { padding: [20, 20, 20, 20] });
    estadoMapa(puntos.length ? num(puntos.length) + " copas medidas cargadas. Elige una haza en el mapa o en la lista." : "Esta finca no trae copas en su índice.");
  }

  function pintaHazas() {
    const elegida = sel ? sel.getId() : null;
    fuenteHazas.clear();
    for (const z of hazas.filter(x => x.finca === finca)) {
      const f = new Feature({ geometry: new MultiPolygon(z.geometria.coordinates), haza: z });
      f.setId(z.id);
      fuenteHazas.addFeature(f);
    }
    marcaSolapes();
    const s = $("#hSel");
    vacia(s).append(h("option", { value: "" }, "Elige una haza…"), ...hazas.filter(x => x.finca === finca).map(z => h("option", { value: z.id }, z.codigo + " · " + z.nombre)));
    eligeId(elegida, false);
  }

  // ---------------------------------------------------------------- elegir
  function eligeId(id, centra) {
    const f = id !== null ? fuenteHazas.getFeatureById(id) : null;
    sel = f; guardada = f ? f.getGeometry().clone() : null; pila = []; vk = -1; corte = []; vista = null;
    enEdicion.clear(); if (f) enEdicion.push(f);
    $("#hSel").value = f ? String(id) : "";
    if (modo !== "nueva") sal();
    if (f && centra) mapa.getView().fit(f.getGeometry().getExtent(), { padding: [60, 60, 60, 60], maxZoom: 22, duration: 250 });
    capaHazas.changed();
    marcas(); ficha();
    versiones = [];
    if (f) cargaVersiones(id);
  }
  async function cambiaA(id, centra) {
    if (sel && sel.getId() === id) return;
    if (sucia()) {
      let decide;
      const p = new Promise(r => { decide = r; });
      confirma({ titulo: "Hay cambios sin guardar", si: "Descartarlos", cuerpo: h("p", null, "La linde de " + sel.get("haza").codigo + " tiene cambios sin guardar. ¿Los descartas?"), hecho: () => { descarta(); decide(true); } });
      $("#dlgConfirma").addEventListener("close", () => decide(false), { once: true });
      if (!(await p)) { $("#hSel").value = String(sel.getId()); return; }
    }
    eligeId(id, centra);
  }

  function clic(e) {
    if (modo === "nueva") return;
    if (modo === "partir" && sel) {
      const c = coords(), k = verticeCercano(c, e.coordinate[0], e.coordinate[1], mapa.getView().getResolution() * 12);
      if (k < 0) { estadoMapa("Toca justo un vértice de " + sel.get("haza").codigo + " (los puntos de su linde)."); return; }
      marcaCorte(k);
      return;
    }
    const f = mapa.forEachFeatureAtPixel(e.pixel, x => x, { layerFilter: l => l === capaHazas, hitTolerance: 3 });
    if (f && f !== sel) cambiaA(f.getId(), false);
  }

  // ---------------------------------------------------------------- edición
  const coords = () => sel.getGeometry().getCoordinates();
  const pon = c => { sel.getGeometry().setCoordinates(c); };
  const sucia = () => !!(sel && guardada && JSON.stringify(redondea(coords())) !== JSON.stringify(redondea(guardada.getCoordinates())));
  function apila() { if (sel) { pila.push(coords()); if (pila.length > 100) pila.shift(); } }
  function cambiado() { marcaSolapes(); marcas(); ficha(); }
  function deshace() {
    if (modo === "nueva") { dibuja.removeLastPoint(); return; }
    if (!sel || !pila.length) { estadoMapa("Nada que deshacer."); return; }
    pon(pila.pop()); vk = Math.min(vk, vertices(coords()).length - 1); cambiado(); estadoMapa("Deshecho.");
  }
  function descarta() { if (sel && guardada) { pon(guardada.getCoordinates()); pila = []; vk = -1; cambiado(); } }

  function teclado(e) {
    const k = e.key, mayus = e.shiftKey, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === "z" || k === "Z")) { e.preventDefault(); deshace(); return; }
    if (k === "Escape") { if (modo) { sal(); estadoMapa("Cancelado."); } else if (vk >= 0) { vk = -1; marcas(); estadoMapa("Vértice suelto."); } return; }
    if (modo === "nueva") {
      if (k === "Enter") { e.preventDefault(); dibuja.finishDrawing(); }
      if (k === "Backspace") { e.preventDefault(); dibuja.removeLastPoint(); }
      return;
    }
    const v = sel ? vertices(coords()) : [];
    if (k === "Tab" && sel && v.length) {
      const sig = vk + (mayus ? -1 : 1);
      if (sig < 0 || sig >= v.length) { vk = -1; marcas(); return; }   // al pasar del primero o del último, el foco sale del mapa (sin trampa)
      e.preventDefault(); vk = sig; marcas(); dice(); return;
    }
    const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (flechas[k]) {
      e.preventDefault();
      if (sel && vk >= 0) {
        const p = mayus ? PASO_GRANDE : PASO;
        apila(); pon(mueve(coords(), vk, flechas[k][0] * p, flechas[k][1] * p)); cambiado(); dice();
      } else {
        const vw = mapa.getView(), c = vw.getCenter(), r = vw.getResolution() * 80;
        vw.setCenter([c[0] + flechas[k][0] * r, c[1] + flechas[k][1] * r]);
      }
      return;
    }
    if (k === "+" || k === "=") { e.preventDefault(); mapa.getView().setZoom(mapa.getView().getZoom() + 1); return; }
    if (k === "-" || k === "_") { e.preventDefault(); mapa.getView().setZoom(mapa.getView().getZoom() - 1); return; }
    if ((k === "Delete" || k === "Backspace") && sel && vk >= 0) { e.preventDefault(); quitaVertice(); return; }
    if (k === "Insert" && sel && vk >= 0) { e.preventDefault(); anadeVertice(); return; }
    if (k === "Enter" && modo === "partir" && sel && vk >= 0) { e.preventDefault(); marcaCorte(vk); }
  }
  function dice() {
    if (!sel || vk < 0) return;
    const v = vertices(coords()), q = coords()[v[vk].p][v[vk].r][v[vk].v];
    estadoMapa("Vértice " + (vk + 1) + " de " + v.length + " de " + sel.get("haza").codigo + ": E " + num(q[0], 2) + ", N " + num(q[1], 2));
  }
  function quitaVertice() {
    if (!sel) return;
    if (vk < 0) { estadoMapa("Elige antes un vértice (Tab con el mapa enfocado, o tócalo en modo partir)."); return; }
    const n = quita(coords(), vk);
    if (!n) { estadoMapa("Un anillo necesita al menos tres vértices."); return; }
    apila(); pon(n); vk = Math.min(vk, vertices(n).length - 1); cambiado(); dice();
  }
  function anadeVertice() {
    if (!sel) return;
    const r = inserta(coords(), vk < 0 ? 0 : vk);
    apila(); pon(r.coords); vk = r.k; cambiado(); dice();
  }

  // ---------------------------------------------------------------- marcas: vértice elegido, corte, versión vista
  function marcas() {
    fuenteMarcas.clear();
    if (sel && vk >= 0) {
      const v = vertices(coords())[vk];
      if (v) fuenteMarcas.addFeature(new Feature({ geometry: new Point(coords()[v.p][v.r][v.v]), tipo: "vertice" }));
    }
    if (sel && modo === "partir") {
      const c = coords(), pts = corte.map(k => { const v = vertices(c)[k]; return c[v.p][v.r][v.v]; });
      for (const q of pts) fuenteMarcas.addFeature(new Feature({ geometry: new Point(q), tipo: "corte-punto" }));
      if (pts.length === 2) fuenteMarcas.addFeature(new Feature({ geometry: new LineString(pts), tipo: "corte" }));
    }
    if (vista) fuenteMarcas.addFeature(new Feature({ geometry: new MultiPolygon(vista.geometria.coordinates), tipo: "vista" }));
  }
  function marcaSolapes() {
    const fs = fuenteHazas.getFeatures();
    for (const f of fs) f.set("pisa", false, true);
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      if (sePisan(fs[i].getGeometry().getCoordinates(), fs[j].getGeometry().getCoordinates())) { fs[i].set("pisa", true, true); fs[j].set("pisa", true, true); }
    }
    capaHazas.changed();
  }

  // ---------------------------------------------------------------- modos
  function sal() {
    modo = null; corte = [];
    dibuja.abortDrawing(); dibuja.setActive(false); traslada.setActive(false); modifica.setActive(true);
    $("#bNueva").textContent = "✏️ Nueva haza"; $("#bNueva").setAttribute("aria-pressed", "false");
    $("#bPartir").setAttribute("aria-pressed", "false"); $("#bMover").setAttribute("aria-pressed", "false");
    marcas();
  }
  function modoNueva() {
    if (modo === "nueva") { dibuja.finishDrawing(); return; }
    sal(); modo = "nueva"; modifica.setActive(false); dibuja.setActive(true);
    $("#bNueva").textContent = "✔ Terminar"; $("#bNueva").setAttribute("aria-pressed", "true");
    estadoMapa("Nueva haza: toca el mapa para poner vértices (se ajustan a los de las vecinas). Doble clic, Intro o «Terminar» para cerrarla; Retroceso quita el último; Esc cancela.");
    $("#mapa").focus();
  }
  function modoMover() {
    if (!sel) { estadoMapa("Elige antes una haza."); return; }
    const on = modo !== "mover";
    sal();
    if (on) { modo = "mover"; traslada.setActive(true); modifica.setActive(false); $("#bMover").setAttribute("aria-pressed", "true"); estadoMapa("Arrastra la haza entera. Vuelve a pulsar «Mover haza» para seguir con los vértices."); }
  }
  function modoPartir() {
    if (!sel) { estadoMapa("Elige antes una haza."); return; }
    const on = modo !== "partir";
    sal();
    if (on) {
      if (sucia()) { estadoMapa("Guarda o descarta antes los cambios de la linde: el corte se hace sobre la versión guardada."); return; }
      modo = "partir"; modifica.setActive(false); $("#bPartir").setAttribute("aria-pressed", "true");
      estadoMapa("Partir " + sel.get("haza").codigo + ": toca el primer vértice de la línea de corte (o elígelo con Tab e Intro).");
    }
  }
  function marcaCorte(k) {
    if (corte.includes(k)) return;
    corte.push(k); marcas();
    if (corte.length === 1) { estadoMapa("Partir " + sel.get("haza").codigo + ": ahora el segundo vértice (no vecino del primero)."); return; }
    const c = coords(), [a, b] = corte.map(i => { const v = vertices(c)[i]; return c[v.p][v.r][v.v]; });
    pideDatosParte(a, b);
  }

  // ---------------------------------------------------------------- diálogo de código y nombre (nueva y partir)
  function pideDatos(titulo, explica, alAceptar) {
    const dl = $("#dlgHaza"), codigos = hazas.map(z => z.codigo);
    $("#dlgHazaT").textContent = titulo; $("#dlgHazaTexto").textContent = explica;
    $("#hzCodigo").value = codigoLibre(codigos); $("#hzNombre").value = ""; $("#hzError").textContent = "";
    $("#hzCancela").onclick = () => dl.close();
    dl.onclose = () => { if (modo) sal(); };
    $("#fHazaNueva").onsubmit = async e => {
      e.preventDefault();
      const codigo = $("#hzCodigo").value.trim(), nombre = $("#hzNombre").value.trim();
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(codigo)) { $("#hzError").textContent = "El código: letras, números, guion y guion bajo (hasta 32)."; return; }
      if (!nombre) { $("#hzError").textContent = "Ponle un nombre."; return; }
      $("#hzOk").disabled = true;
      const err = await alAceptar(codigo, nombre);
      $("#hzOk").disabled = false;
      if (err) $("#hzError").textContent = err; else dl.close();
    };
    dl.showModal(); $("#hzNombre").focus();
  }
  function pideDatosNueva(c) {
    const anillos = redondea([c]);
    const cuentas = cuenta(anillos, puntos, BORDE);
    pideDatos("Nueva haza", num(area(anillos) / 10000, 2) + " ha y " + num(cuentas.olivos) + " olivos medidos dentro (orientativo; el servidor lo recuenta al guardar).", async (codigo, nombre) => {
      const r = await api("POST", "/api/admin/hazas", { codigo, nombre, finca, geometria: { type: "Polygon", coordinates: anillos[0] } });
      if (!r.ok) return mensajeDe(r);
      hazas.push(r.datos.haza); sal(); pintaHazas(); eligeId(r.datos.haza.id, false);
      aviso("Haza " + codigo + " creada: " + resumenServidor(r.datos.haza));
    });
  }
  function pideDatosParte(a, b) {
    const z = sel.get("haza");
    pideDatos("Partir " + z.codigo, "El trozo mayor sigue siendo " + z.codigo + " (con su familia, si la tiene); el otro será una haza nueva sin familia.", async (codigo, nombre) => {
      const r = await api("POST", "/api/admin/hazas/" + z.id + "/partir", { a, b, version: z.version, codigo, nombre });
      if (!r.ok) return mensajeDe(r);
      reemplaza(r.datos.haza); hazas.push(r.datos.nueva); sal(); pintaHazas(); eligeId(z.id, false);
      aviso(z.codigo + " partida: " + z.codigo + " " + resumenServidor(r.datos.haza) + " · " + codigo + " " + resumenServidor(r.datos.nueva));
    });
  }
  const resumenServidor = z => num(z.superficie_ha, 2) + " ha, " + num(z.olivos) + " olivos (recuento del servidor)";
  function mensajeDe(r) {
    if (r.error === "solape" && r.datos && r.datos.solapes) return r.mensaje;
    if (r.error === "version_cambiada") { setTimeout(abre, 0); return r.mensaje + " (recargada)."; }
    return r.mensaje + (r.datos && r.datos.motivo ? " (" + r.datos.motivo + ")" : "");
  }
  function reemplaza(z) { const i = hazas.findIndex(x => x.id === z.id); if (i >= 0) hazas[i] = z; else hazas.push(z); }

  // ---------------------------------------------------------------- guardar, juntar, borrar, volver
  async function guarda() {
    if (!sel) { estadoMapa("Elige antes una haza."); return; }
    if (!sucia()) { aviso("No hay cambios que guardar."); return; }
    const z = sel.get("haza"), c = redondea(coords());
    $("#bGuarda").disabled = true;
    const r = await api("PUT", "/api/admin/hazas/" + z.id + "/geom", { geometria: { type: "MultiPolygon", coordinates: c }, version: z.version });
    $("#bGuarda").disabled = false;
    if (!r.ok) { aviso(mensajeDe(r), "mal"); ficha(r.mensaje); return; }
    reemplaza(r.datos.haza); sel.set("haza", r.datos.haza); guardada = new MultiPolygon(r.datos.haza.geometria.coordinates); pila = [];
    pon(guardada.getCoordinates()); cambiado(); cargaVersiones(z.id);
    aviso("Versión " + r.datos.haza.version + " de " + z.codigo + " guardada: " + resumenServidor(r.datos.haza) +
      (r.datos.personalizados_fuera ? " · ⚠ " + r.datos.personalizados_fuera + " árboles con nombre de la familia quedan fuera" : ""));
  }
  function junta(otroId) {
    if (!sel || !otroId) return;
    const a = sel.get("haza"), b = hazas.find(x => x.id === otroId);
    $("#sJuntar").value = "";
    if (!b) return;
    if (sucia()) { estadoMapa("Guarda o descarta antes los cambios de la linde."); return; }
    confirma({
      titulo: "Juntar " + a.codigo + " y " + b.codigo, si: "Juntar",
      cuerpo: [h("p", null, b.codigo + " desaparece y su superficie pasa a " + a.codigo + " (unión en PostGIS). Lo que colgaba de " + b.codigo + " (árboles con nombre, diario, lotes) pasa a " + a.codigo + "."),
        h("p", null, b.hogar_correo ? "Familia de " + b.codigo + ": " + b.hogar_correo + (a.hogar_id ? "" : " (pasa a " + a.codigo + ")") + "." : b.codigo + " no tiene familia."),
        h("p", { class: "nota" }, "La historia de " + b.codigo + " se conserva. Pide haber entrado hace poco.")],
      hecho: async () => {
        const r = await conConfirmacion(() => api("POST", "/api/admin/hazas/juntar", { a: a.id, b: b.id, version_a: a.version, version_b: b.version }));
        if (!r.ok) return mensajeDe(r);
        hazas = hazas.filter(x => x.id !== b.id); reemplaza(r.datos.haza); pintaHazas(); eligeId(a.id, true);
        aviso(a.codigo + " y " + b.codigo + " juntadas: " + resumenServidor(r.datos.haza));
      },
    });
  }
  function borra() {
    const z = sel && sel.get("haza");
    if (!z) return;
    confirma({
      titulo: "Borrar " + z.codigo, si: "Borrar", escribe: z.codigo,
      cuerpo: [h("p", null, "Se borra la haza " + z.codigo + " · " + z.nombre + ". Solo se puede si no tiene familia ni nada colgado (si lo tiene, mejor juntarla con una vecina)."), h("p", { class: "nota" }, "Su historia se conserva. Pide haber entrado hace poco.")],
      hecho: async () => {
        const r = await conConfirmacion(() => api("DELETE", "/api/admin/hazas/" + z.id + "?version=" + z.version));
        if (!r.ok) return mensajeDe(r);
        hazas = hazas.filter(x => x.id !== z.id); sel = null; pintaHazas(); eligeId(null, false);
        aviso("Haza " + z.codigo + " borrada.");
      },
    });
  }
  async function cargaVersiones(id) {
    const r = await api("GET", "/api/admin/hazas/" + id + "/versiones");
    if (!sel || sel.getId() !== id) return;
    versiones = r.ok ? r.datos.versiones : [];
    ficha();
  }
  function vuelve(v) {
    const z = sel.get("haza");
    confirma({
      titulo: "Volver a la versión " + v.version, si: "Guardar como versión " + (z.version + 1),
      cuerpo: [h("p", null, "Se guarda una COPIA de la linde de la versión " + v.version + " (" + num(v.superficie_ha, 2) + " ha) como versión nueva de " + z.codigo + ". Las versiones de en medio no se tocan.")],
      hecho: async () => {
        const r = await api("POST", "/api/admin/hazas/" + z.id + "/volver/" + v.version, { version_actual: z.version });
        if (!r.ok) return mensajeDe(r);
        reemplaza(r.datos.haza); vista = null; pintaHazas(); eligeId(z.id, false);
        aviso(z.codigo + " vuelve a la linde de la versión " + v.version + " (ahora versión " + r.datos.haza.version + "): " + resumenServidor(r.datos.haza));
      },
    });
  }

  // ---------------------------------------------------------------- ficha
  function ficha(error) {
    const el = vacia($("#hFicha"));
    const junto = $("#sJuntar");
    vacia(junto).append(h("option", { value: "" }, "Juntar con…"));
    junto.disabled = !sel;
    if (!sel) {
      el.append(h("h2", null, "Hazas de " + (finca || "…")), h("p", { class: "nota" }, "Elige una haza en el mapa o en la lista, o dibuja una nueva."),
        h("p", { class: "nota" }, num(hazas.filter(x => x.finca === finca).length) + " hazas · azul: sin familia · verde: con familia · rojo discontinuo: se pisan"));
      botones(); return;
    }
    const z = sel.get("haza"), c = coords(), s = sucia(), cl = cuenta(c, puntos, BORDE), ha = area(c) / 10000;
    for (const o of hazas.filter(x => x.finca === finca && x.id !== z.id)) junto.append(h("option", { value: o.id }, o.codigo + " · " + o.nombre));
    const pisa = fuenteHazas.getFeatures().filter(f => f !== sel && sePisan(c, f.getGeometry().getCoordinates())).map(f => f.get("haza").codigo);
    el.append(...[   // Element.append pondría «null» como texto: lo que no toca se filtra
      h("h2", { tabindex: "-1" }, z.codigo + " · " + z.nombre),
      h("p", { class: "nota" }, "Versión " + z.version + " · guardada " + fecha(z.actualizada_en) + (s ? " · " : ""), s ? h("b", { class: "p-aviso" }, "cambios sin guardar") : null),
      h("div", { class: "cifras" },
        h("div", null, h("small", null, "Superficie"), h("span", { class: "cifra" }, num(s ? ha : z.superficie_ha, 2)), " ha"),
        h("div", null, h("small", null, "Olivos ", h("span", { class: "pill p-ok" }, "medido")), h("span", { class: "cifra" }, num(s ? cl.olivos : z.olivos))),
        h("div", null, h("small", null, "Declarados"), z.olivos_declarados !== null ? h("span", { class: "cifra" }, num(z.olivos_declarados)) : h("span", { class: "nota" }, "sin dato"))),
      h("p", { class: "nota" }, s
        ? "Ahora, en tu navegador (orientativo): " + num(ha, 2) + " ha, " + num(cl.olivos) + " olivos. Lo guardado (PostGIS): " + num(z.superficie_ha, 2) + " ha, " + num(z.olivos) + " olivos."
        : "Recuento del servidor (PostGIS, al guardar): olivos del vuelo LiDAR 2024 dentro o en la linde." + (z.olivos_declarados_fuente ? " Declarados: " + z.olivos_declarados_fuente + "." : "")),
      (s ? cl.borde : z.olivos_borde) ? h("p", { class: "p-aviso" }, "⚠ " + num(s ? cl.borde : z.olivos_borde) + " olivos a menos de " + BORDE + " m de la linde: revisa que caen del lado que toca.") : null,
      pisa.length || (!s && z.solapes.length)
        ? h("p", { class: "p-mal" }, "⚠ Se pisa con " + (pisa.length ? pisa.join(", ") : z.solapes.map(x => x.codigo + " (" + x.m2 + " m²)").join(", ")) + ": el servidor no guardará una linde que pise otra haza.")
        : h("p", { class: "p-ok" }, "✓ No se pisa con ninguna haza"),
      error ? h("p", { class: "error", role: "alert" }, error) : null,
      h("p", { class: "nota" }, "Parcelas de OlivarTrack: " + (z.parcelas.length ? z.parcelas.map(p => p.id).join(", ") : "ninguna")),
      selectorFamilia(z),
      h("h3", null, "Historial"),
      versiones.length ? h("ul", { class: "historial" }, versiones.map(v => h("li", { class: "aparato" },
        h("span", null, "v" + v.version + " · " + (ACCIONES[v.accion] || v.accion) + (v.desde_version ? " (a la v" + v.desde_version + ")" : ""), h("br"),
          h("span", { class: "nota" }, fecha(v.cuando) + " · " + (v.autor || "sin autor") + " · " + num(v.superficie_ha, 2) + " ha" + (v.nota ? " · " + v.nota : ""))),
        v.version === z.version ? h("span", { class: "pill p-ok" }, "actual") : h("span", { class: "en-linea" },
          h("button", { class: "boton peq", type: "button", "aria-pressed": String(vista === v), onclick: () => { vista = vista === v ? null : v; marcas(); ficha(); } }, "Ver"),
          h("button", { class: "boton peq", type: "button", "data-volver": v.version, onclick: () => vuelve(v) }, "Volver"))))) : h("p", { class: "nota" }, "Cargando el historial…"),
      h("p", null, h("button", { class: "boton peq peligro-suave", type: "button", onclick: borra }, "Borrar la haza…"))].filter(x => x !== null));
    botones();
  }
  function selectorFamilia(z) {
    const s = h("select", { class: "entrada", id: "hFam" }, h("option", { value: "" }, "Sin familia"),
      familias.map(f => h("option", { value: f.id, selected: f.id === z.hogar_id }, (f.alias || f.correo) + (f.hazas.length && !f.hazas.includes(z.codigo) ? " (tiene " + f.hazas.join(", ") + ")" : ""))));
    s.addEventListener("change", () => asigna(z, s.value ? Number(s.value) : null, s));
    return h("div", { class: "campo" }, h("label", { for: "hFam" }, "Familia"), s);
  }
  async function asigna(z, hogar, s) {
    if (sucia()) { s.value = z.hogar_id ? String(z.hogar_id) : ""; aviso("Guarda o descarta antes los cambios de la linde.", "mal"); return; }
    const f = familias.find(x => x.id === hogar);
    const hace = async () => {
      const r = hogar ? await api("PUT", "/api/admin/hogares/" + hogar + "/haza", { haza_id: z.id }) : await api("PUT", "/api/admin/hazas/" + z.id + "/hogar", { hogar_id: null });
      if (!r.ok) return r.mensaje;
      await abre();
      aviso(hogar ? z.codigo + " asignada a " + (f.alias || f.correo) : z.codigo + " queda sin familia");
    };
    const avisos = [];
    if (z.hogar_correo && hogar) avisos.push("Ahora es de " + z.hogar_correo + ": se le quita.");
    if (f && f.hazas.length && !f.hazas.includes(z.codigo)) avisos.push((f.alias || f.correo) + " tiene " + f.hazas.join(", ") + ": una familia tiene una haza (decisión 91), así que la suelta.");
    if (!hogar && z.hogar_correo) avisos.push("Lo que colgó " + z.hogar_correo + " en ella dejará de verse.");
    if (!avisos.length) { const e = await hace(); if (e) aviso(e, "mal"); return; }
    confirma({ titulo: hogar ? "Asignar " + z.codigo : "Quitar la familia de " + z.codigo, si: hogar ? "Asignar" : "Quitar", cuerpo: avisos.map(t => h("p", null, t)), hecho: hace });
    $("#dlgConfirma").addEventListener("close", () => { s.value = z.hogar_id ? String(z.hogar_id) : ""; }, { once: true });
  }
  function botones() {
    const hay = !!sel, s = sucia();
    for (const id of ["#bMover", "#bMas", "#bMenos", "#bPartir"]) $(id).disabled = !hay || modo === "nueva";
    $("#bDeshacer").disabled = !(modo === "nueva" || (hay && pila.length));
    $("#bDescartar").disabled = !s; $("#bGuarda").disabled = !s;
  }
  function estadoMapa(t) { $("#mEstado").textContent = t; }

  // ---------------------------------------------------------------- botones y capas
  $("#bNueva").addEventListener("click", modoNueva);
  $("#bMover").addEventListener("click", modoMover);
  $("#bPartir").addEventListener("click", modoPartir);
  $("#bMas").addEventListener("click", anadeVertice);
  $("#bMenos").addEventListener("click", quitaVertice);
  $("#bDeshacer").addEventListener("click", deshace);
  $("#bDescartar").addEventListener("click", () => { descarta(); estadoMapa("Cambios descartados."); });
  $("#bGuarda").addEventListener("click", guarda);
  $("#sJuntar").addEventListener("change", e => junta(Number(e.target.value) || null));
  $("#hSel").addEventListener("change", e => cambiaA(e.target.value ? Number(e.target.value) : null, true));
  $("#hFinca").addEventListener("change", async e => { finca = e.target.value; sel = null; await cargaFinca(); pintaHazas(); });
  $("#cOrto").addEventListener("change", e => { capaMosaico.setVisible(e.target.checked); capaTeselas.setVisible(e.target.checked); });
  $("#cCopas").addEventListener("change", e => capaCopas.setVisible(e.target.checked));
  $("#cParc").addEventListener("change", e => capaParcelas.setVisible(e.target.checked));
  $("#cAjuste").addEventListener("change", e => { ajusteH.setActive(e.target.checked); ajusteP.setActive(e.target.checked); });
  window.addEventListener("beforeunload", e => { if (sucia()) e.preventDefault(); });
  void sesion;   // el rol no cambia nada aquí: oficina y admin editan igual (ADR-0024)

  /** Para las pruebas de Chrome: estado legible sin tocar nada (no hay forma de cambiar datos desde aquí). */
  const estado = () => ({ finca, hazas: fuenteHazas.getFeatures().length, sel: sel ? sel.get("haza").codigo : null, vertice: vk, sucia: sucia(), copas: puntos.length,
    resolucion: mapa ? mapa.getView().getResolution() : null, vertices: sel ? vertices(coords()).length : 0,
    pixelDe: (x, y) => (mapa ? mapa.getPixelFromCoordinate([x, y]) : null), coordsSel: sel ? coords() : null });
  return { abre, estado };
}
