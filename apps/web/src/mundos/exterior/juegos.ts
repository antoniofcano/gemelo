// El anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md; MU5-n, A3-7b2: antes apps/web/motor/40_juegos.js, que queda como talón). Componente de los mundos
// ["exterior"]: los juegos son del olivar (la época de la partida es la de la finca) y el anfitrión pone el mundo en pausa con Pausa (02c) y se apoya en su propio icono, su tecla J y
// su ventana; en un interior no habría juegos que ofrecer. No dibuja nada en la escena 3D: un canvas 2D por encima (o la lámina de VR) y el mundo en pausa.
// ---------- el anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md): recoge los juegos casuales que se le ofrecen por el Bus, los enseña
// en la ventana «Juegos» (icono de la barra y tecla J), abre uno a pantalla completa sobre el mundo EN PAUSA (Pausa de 02c: el bucle sigue, pero el mundo no
// avanza ni se pinta; solo corre la fase «pausa», que es la de aquí), lo cierra con Esc o con su botón y devuelve a quien juega donde estaba. Guarda el
// récord: en el aparato (localStorage, con try/catch) y, si la página la sirve el servidor, el de la familia en la api (POST /api/juegos/<id>/partidas
// y GET …/records; contrato en contratos/api.openapi.yaml). El récord es el del propio hogar; además (C9c, decisión 137) la clasificación por alias entre familias (GET …/clasificacion): puesto, puntos y el alias solo si el hogar lo hizo visible («Una familia» si no), en la ventana y al acabar la partida.
// Un juego es OTRO componente: se ofrece con «juego:ofrece» { id, titulo, descripcion, ayuda?, crea(ctx) → partida } (si llega antes que el anfitrión,
// el anfitrión le pregunta con «juego:pide») y se retira con «juego:retira» { id }. ctx = { lienzo, mandos, epoca, semilla, reducido }; la partida da
// redimensiona(w, h, dpr), actualiza(dt) → ¿repintar?, pinta(), tecla(code) → ¿usada?, pausa(si), pausada(), estado() { puntos, fin }, resultado()
// { puntos, duracion_s } y libera(). El anfitrión pone la barra (título, puntos, récord, Pausa y Cerrar), el teclado (Esc y P son suyas) y el final.
// Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?juegos=0 o la configuración del servidor (decisión 118) lo apagan: sin icono, sin ventana.
// En VR (C9b) el juego es una LÁMINA (Laminas, 02d): el panel VR lo ofrece en la pestaña Mundo (fila «Juegos») si el juego trae `vr` ({ botones, palanca, ayuda? }
// y pintaEn(g, w, h), firma(), accion(a) en su partida); se pinta con el dibujo del propio juego, el mundo NO se pausa y el rayo con el gatillo toca las zonas
// (izquierda, girar, derecha, soltar; Pausa y Salir arriba). La palanca derecha hace lo mismo y B pausa; pulsar la palanca sale. Si se entra en VR con un juego abierto en pantalla, se cierra.
// Código movido tal cual (se tipan parámetros y variables; lo del legado entra por dp, y lo que otros reescriben (VRX, PanelVR) por getter). Su libera() ya cerraba la partida (devolviendo
// la pausa al mundo) y la lámina de VR, y soltaba el icono, la ventana, la tecla J, el observador y window.__juegos; A3-7b2 añade que CANCELA las peticiones a la api en vuelo
// (AbortController: el récord de la familia, la clasificación y guardar la partida). Los trozos [puro:…] y el cuerpo de JuegosMotor los evalúa en Node
// pruebas/guardianes/juego_cosecha.test.js (el .ts, leído como JavaScript: sin tipos ni «dp.»).
import type { Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = any;

export const ID_JUEGOS = "juegos";

/** Lo que el talón de 40 le da: D (01), Pausa, ConfigPuro, Teclas y Config (02c), Laminas (02d), Hud (31) y Ventanas (32); VRX y PanelVR (29_vr, que el código comprobaba con typeof), por getter */
export interface DepsJuegos { D: T; Pausa: T; ConfigPuro: T; Config: T; Teclas: T; Laminas: T; Hud: T; Ventanas: T; readonly VRX: T; readonly PanelVR: T }

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js)
export var JuegosPuro: T = (function () {
  var ID: T = /^[a-z][a-z0-9-]{1,31}$/;
  // un juego ofrecido: los errores (vacía si vale)
  function validaJuego(d?: T) {
    var e: T = [];
    if (!d || typeof d !== "object") return ["el juego no es un objeto"];
    if (typeof d.id !== "string" || !ID.test(d.id)) e.push("id: minúsculas, cifras y guiones (2-32), empezando por letra");
    if (typeof d.titulo !== "string" || !d.titulo.trim()) e.push("titulo");
    if (typeof d.crea !== "function") e.push("crea: función");
    return e;
  }
  // el mejor de dos récords ({ puntos, duracion_s, fecha } o null)
  function mejor(a?: T, b?: T) { if (!a || !(a.puntos >= 0)) return b && b.puntos >= 0 ? b : null; if (!b || !(b.puntos >= 0)) return a; return b.puntos > a.puntos ? b : a; }
  function claveLocal(id?: T) { return "gemelo.record." + id; }
  function leeLocal(almacen?: T, id?: T) {
    try { var v: T = almacen && almacen.getItem(claveLocal(id)); if (!v) return null; var j: T = JSON.parse(v); return j && typeof j.puntos === "number" && j.puntos >= 0 ? j : null; } catch (e: T) { return null; }
  }
  // guarda en el aparato si es mejor; devuelve { record, nuevo }
  function guardaLocal(almacen?: T, id?: T, res?: T, fecha?: T) {
    var antes: T = leeLocal(almacen, id), r: T = { puntos: res.puntos, duracion_s: res.duracion_s, fecha: fecha };
    if (antes && antes.puntos >= res.puntos) return { record: antes, nuevo: false };
    try { if (almacen) almacen.setItem(claveLocal(id), JSON.stringify(r)); } catch (e: T) {}
    return { record: r, nuevo: res.puntos > 0 };
  }
  function rutaPartidas(prefijo?: T, id?: T) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/partidas" : null; }
  function rutaClasificacion(prefijo?: T, id?: T, n?: T) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/clasificacion?n=" + (n || 5) : null; }
  // la respuesta de la clasificación, validada y sin nada de más (lista blanca, contratos/juegos-clasificacion.schema.json); null si no es lo esperado
  function validaClasificacion(j?: T, id?: T) {
    function puesto(p?: T) {
      if (!p || typeof p !== "object" || !(p.puesto >= 1) || !(p.puntos >= 1) || typeof p.es_mia !== "boolean") return null;
      if (p.alias !== null && (typeof p.alias !== "string" || p.alias.length > 20)) return null;
      return { puesto: Math.floor(p.puesto), alias: p.alias, puntos: Math.floor(p.puntos), es_mia: p.es_mia };
    }
    if (!j || typeof j !== "object" || j.juego !== id || !(j.total >= 0) || !Array.isArray(j["puestos"])) return null;
    var filas: T = []; for (var i = 0; i < j["puestos"].length && i < 20; i++) { var q: T = puesto(j["puestos"][i]); if (!q) return null; filas.push(q); }
    var mia: T = j.mia == null ? null : puesto(j.mia); if (j.mia != null && !mia) return null;
    return { total: Math.floor(j.total), puestos: filas, mia: mia };
  }
  // cómo se llama una fila: el alias si es visible; la propia, «(tú)»; sin alias, «Una familia»
  function nombrePuesto(p?: T) { return p.es_mia ? (p.alias ? p.alias + " (tú)" : "Tu familia") : (p.alias || "Una familia"); }
  function textoPuesto(c?: T) {
    if (!c || !c.mia) return "Aún no estás en la clasificación.";
    return "Tu puesto: " + c.mia.puesto + ".º de " + c.total + (c.total === 1 ? " familia" : " familias");
  }
  // C9b+: la clasificación en la lámina de VR (sin DOM): { puesto: texto, filas: [{ t: «1.º  alias», p: puntos, mia }] } con como mucho `max` filas; la propia, si no cabe, va la última
  function filasVR(c?: T, max?: T) {
    if (!c) return null;
    var f: T = c.puestos.slice(0, max).map(function (q?: T) { return { t: q.puesto + ".º  " + nombrePuesto(q), p: fmtPuntos(q.puntos), mia: q.es_mia }; });
    if (c.mia && !c.puestos.slice(0, max).some(function (q?: T) { return q.es_mia; })) f.push({ t: c.mia.puesto + ".º  " + nombrePuesto(c.mia), p: fmtPuntos(c.mia.puntos), mia: true });
    return { puesto: textoPuesto(c), filas: f };
  }
  function rutaRecords(prefijo?: T, id?: T) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/records" : null; }
  // una semilla por partida (o la de ?semilla=N, para las pruebas)
  function semilla(busqueda?: T, ahora?: T) { var m: T = /[?&]semilla=(\d{1,9})(?:[&#]|$)/.exec(busqueda || ""); return m ? Number(m[1]) : (Math.floor(ahora) % 2147483646) + 1; }
  function fmtDuracion(s?: T) { s = Math.max(0, Math.round(s)); var m: T = Math.floor(s / 60), r: T = s % 60; return m ? m + " min " + r + " s" : r + " s"; }
  function fmtPuntos(n?: T) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  // ---- VR (C9b): la lámina del juego (px del lienzo; 1,1 × 1,4 m a 800 px/m) y qué hace cada sitio donde cae el rayo con el gatillo
  var VR: T = { w: 880, h: 1120, barra: 100, recordY: 100, tabY: 140, tabH: 780, pieY: 930, pieH: 130, ayudaY: 1068 };
  function dentro(r?: T, x?: T, y?: T) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  // los rectángulos de la lámina: Pausa y Salir arriba; abajo, n botones del juego (o «Otra partida» y «Salir» si ha acabado)
  function geoVR(n?: T) {
    var g: T = { pausa: { x: 470, y: 14, w: 230, h: 72 }, salir: { x: 716, y: 14, w: 150, h: 72 }, botones: [] }, hueco = 12, k: T = Math.max(1, n), ancho: T = (VR.w - 24 - hueco * (k - 1)) / k;
    for (var i = 0; i < k; i++) g.botones.push({ x: 12 + i * (ancho + hueco), y: VR.pieY, w: ancho, h: VR.pieH });
    return g;
  }
  // (u, v) de la lámina (0 a 1, v de arriba abajo) → { tipo: "accion", a } | { tipo: "pausa" } | { tipo: "salir" } | { tipo: "otra" } | null
  // botones: las acciones del juego, de izquierda a derecha; fin: la partida ha acabado (entonces el pie es «Otra partida» y «Salir»)
  function zonaVR(u?: T, v?: T, botones?: T, fin?: T) {
    var x: T = u * VR.w, y: T = v * VR.h, g: T = geoVR(fin ? 2 : botones.length);
    if (dentro(g.salir, x, y)) return { tipo: "salir" };
    if (!fin && dentro(g.pausa, x, y)) return { tipo: "pausa" };
    for (var i = 0; i < g.botones.length; i++) if (dentro(g.botones[i], x, y)) return fin ? { tipo: i ? "salir" : "otra" } : { tipo: "accion", a: botones[i].a };
    return null;
  }
  // la palanca del mando derecho: st = { dir, t } (empieza en { dir: "", t: 0 }); devuelve las órdenes que salen en este fotograma ("izquierda", "derecha",
  // "arriba" o "abajo"). Se mira el eje que más se inclina; a los lados se repite (0,35 s y luego cada 0,14 s), arriba y abajo solo al inclinar. Con la palanca
  // quieta (< 0,35) se rearma. y negativo = hacia delante (como en WebXR).
  function palanca(st?: T, x?: T, y?: T, dt?: T) {
    var mx: T = Math.abs(x), my: T = Math.abs(y), dir = "";
    if (Math.max(mx, my) >= 0.6) dir = mx >= my ? (x < 0 ? "izquierda" : "derecha") : (y < 0 ? "arriba" : "abajo");
    else if (Math.max(mx, my) >= 0.35) dir = st.dir;   // histéresis
    var sale: T = [];
    if (dir !== st.dir) { st.dir = dir; st.t = 0.35; if (dir) sale.push(dir); }
    else if (dir === "izquierda" || dir === "derecha") { st.t -= dt; if (st.t <= 0) { st.t = 0.14; sale.push(dir); } }
    return sale;
  }
  return { VR: VR, geoVR: geoVR, zonaVR: zonaVR, palanca: palanca, ID: ID, validaJuego: validaJuego, mejor: mejor, claveLocal: claveLocal, leeLocal: leeLocal, guardaLocal: guardaLocal, rutaPartidas: rutaPartidas,
    rutaClasificacion: rutaClasificacion, validaClasificacion: validaClasificacion, nombrePuesto: nombrePuesto, textoPuesto: textoPuesto, filasVR: filasVR, rutaRecords: rutaRecords, semilla: semilla, fmtDuracion: fmtDuracion, fmtPuntos: fmtPuntos };
})();
// [puro:fin]

export function JuegosMotor(dp: DepsJuegos, n: T) {
  var ctl: T = new AbortController();   // A3-7b2: libera() cancela lo que esté en vuelo
  var JP: T = JuegosPuro, juegos: T = {}, orden: T = [], records: T = {}, clasif: T = {}, cuerpo: T = null, abierto: T = null, vr: T = null, LAM = "juego-vr", mide: T = { n: 0, ms: 0, pintadas: 0 };
  var prefijo: T = dp.ConfigPuro.prefijoApi(location.search, dp.D && dp.D.base);
  var almacen: T = null; try { almacen = window.localStorage; } catch (e: T) { almacen = null; }

  function el(tag?: T, css?: T, txt?: T) { var x: T = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
  var BOTON = "min-height:48px;min-width:48px;padding:0 16px;border-radius:12px;border:2px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.14);color:#fff;font:600 17px system-ui,sans-serif;cursor:pointer";
  function recordDe(id?: T) { var r: T = records[id] || {}; return { familia: r.familia || null, aparato: JP.leeLocal(almacen, id) }; }
  function textoRecord(id?: T) {
    var r: T = recordDe(id);
    if (r.familia) return "Récord de la familia: " + JP.fmtPuntos(r.familia.puntos);
    if (r.aparato) return "Récord en este aparato: " + JP.fmtPuntos(r.aparato.puntos);
    return "Sin récord todavía";
  }
  // el récord de la familia (solo con servidor); sin servidor, sin sesión o sin red, queda el del aparato y no se dice nada en la consola
  function pideRecord(id?: T) {
    var url: T = JP.rutaRecords(prefijo, id); if (!url || typeof fetch !== "function") return;
    fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" }, signal: ctl.signal }).then(function (r?: T) { return r.status === 200 ? r.json() : null; })
      .then(function (j?: T) { if (j && j.juego === id) { records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista(); pintaBarra(); if (vr && vr.id === id) vr.recordTxt = textoRecord(id); } }).catch(function () {});
  }
  // la clasificación entre familias por alias (solo con servidor); sin servidor, sin sesión o sin red, no se enseña y no se dice nada
  function pideClasificacion(id?: T) {
    var url: T = JP.rutaClasificacion(prefijo, id, 5);
    if (!url || typeof fetch !== "function") return Promise.resolve(null);
    return fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" }, signal: ctl.signal }).then(function (r?: T) { return r.status === 200 ? r.json() : null; })
      .then(function (j?: T) { var c: T = JP.validaClasificacion(j, id); if (c) { clasif[id] = c; if (!abierto) pintaLista(); } return c; }).catch(function () { return null; });
  }
  // el puesto y las primeras filas dentro de `cont` (textContent siempre: el alias lo escribe quien juega)
  function pintaTabla(cont?: T, c?: T) {
    cont.textContent = "";
    cont.appendChild(el("p", "margin:0 0 4px;font-size:16px;font-weight:700", JP.textoPuesto(c)));
    if (!c.puestos.length) { cont.appendChild(el("p", "margin:0;font-size:14px;opacity:.8", "Todavía nadie ha puntuado.")); return; }
    var t: T = el("ol", "margin:0;padding:0;list-style:none;font-size:15px;text-align:left");
    c.puestos.forEach(function (f?: T) {
      var li: T = el("li", "display:flex;gap:8px;padding:2px 0" + (f.es_mia ? ";font-weight:700;color:#ffe9a8" : ""));
      li.appendChild(el("span", "flex:0 0 2.2em;opacity:.85", f.puesto + ".º")); li.appendChild(el("span", "flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", JP.nombrePuesto(f)));
      li.appendChild(el("span", "flex:0 0 auto", JP.fmtPuntos(f.puntos))); t.appendChild(li);
    });
    cont.appendChild(t);
    if (c.mia && c.mia.puesto > c.puestos.length && !c.puestos.some(function (f?: T) { return f.es_mia; })) {
      var m: T = el("div", "display:flex;gap:8px;padding:4px 0 0;font-weight:700;color:#ffe9a8;font-size:15px;text-align:left");
      m.appendChild(el("span", "flex:0 0 2.2em", c.mia.puesto + ".º")); m.appendChild(el("span", "flex:1 1 auto", JP.nombrePuesto(c.mia))); m.appendChild(el("span", "flex:0 0 auto", JP.fmtPuntos(c.mia.puntos)));
      cont.appendChild(m);
    }
  }
  function guarda(id?: T, res?: T) {
    var loc: T = JP.guardaLocal(almacen, id, res, new Date().toISOString()), url: T = JP.rutaPartidas(prefijo, id);
    if (!url || typeof fetch !== "function") return Promise.resolve({ nuevo: loc.nuevo, donde: "aparato" });
    var antes: T = (records[id] && records[id].familia) || null;
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ puntos: res.puntos, duracion_s: res.duracion_s }), signal: ctl.signal })
      .then(function (r?: T) { return r.status === 201 ? r.json() : null; })
      .then(function (j?: T) {
        if (!j) return { nuevo: loc.nuevo, donde: "aparato" };
        records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista();
        return { nuevo: !!j.es_record && (!antes || res.puntos > antes.puntos), donde: "familia" };
      }).catch(function () { return { nuevo: loc.nuevo, donde: "aparato" }; });
  }

  // --- la ventana «Juegos»: una tarjeta por juego con su récord y «Jugar»
  function pintaLista() {
    if (!cuerpo) return;
    cuerpo.textContent = "";
    if (!orden.length) { cuerpo.appendChild(el("p", "margin:8px 0", "No hay juegos encendidos.")); return; }
    orden.forEach(function (id?: T) {
      var d: T = juegos[id], t: T = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)");
      t.appendChild(el("h3", "margin:0 0 4px;font-size:18px", d.titulo));
      if (d.descripcion) t.appendChild(el("p", "margin:0 0 6px;font-size:16px;line-height:1.35", d.descripcion));
      var rec: T = el("p", "margin:0 0 8px;font-size:15px;opacity:.85", textoRecord(id)); rec.setAttribute("data-record", id); t.appendChild(rec);
      var b: T = el("button", BOTON, "Jugar"); b.type = "button"; b.setAttribute("data-juega", id); b.addEventListener("click", function () { abre(id); });
      t.appendChild(b);
      if (clasif[id]) { var cl: T = el("div", "margin:10px 0 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.08)"); cl.setAttribute("data-clasificacion", id); cl.appendChild(el("h4", "margin:0 0 4px;font-size:15px;opacity:.85", "Clasificación")); var ct: T = el("div"); pintaTabla(ct, clasif[id]); cl.appendChild(ct); t.appendChild(cl); }
      cuerpo.appendChild(t);
    });
    cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:14px;opacity:.75", "El mundo se queda en pausa mientras juegas. Sin compras ni anuncios. " +
      (prefijo ? "El récord es el de tu familia. En la clasificación, las otras familias salen con su alias si lo hicieron visible, y si no, como «Una familia»." : "El récord se guarda en este aparato.")));
  }

  // --- la partida a pantalla completa
  function pintaBarra() {
    if (!abierto) return;
    var est: T = abierto.partida.estado();
    abierto.puntos.textContent = JP.fmtPuntos(est.puntos) + " puntos";
    abierto.record.textContent = textoRecord(abierto.id);
    abierto.bPausa.textContent = abierto.partida.pausada() ? "Seguir" : "Pausa";
    abierto.bPausa.setAttribute("aria-pressed", abierto.partida.pausada() ? "true" : "false");
  }
  function medidas() {
    if (!abierto) return;
    var r: T = abierto.area.getBoundingClientRect();
    abierto.partida.redimensiona(r.width, r.height, window.devicePixelRatio || 1);
  }
  // lo que el anfitrión da a quien crea una partida, salvo el lienzo y los botones (la época del olivo de hoy, la semilla, el movimiento reducido)
  function ctxBase() {
    var ep: T = null; try { var m: T = /[?&]epoca=([a-z]+)/.exec(location.search); ep = m ? m[1] : (dp.Config.tablaEpocas(dp.D.finca_id) ? dp.Config.epocaDeFecha(dp.Config.tablaEpocas(dp.D.finca_id), new Date()) : null); } catch (e: T) { ep = null; }
    var reducido = false; try { reducido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e: T) {}
    return { epoca: ep, semilla: JP.semilla(location.search, Date.now()), reducido: reducido };
  }
  function nuevaPartida() {
    var a: T = abierto, d: T = juegos[a.id];
    if (a.partida) a.partida.libera();
    a.fin.hidden = true; a.guardado = false; a.mandos.textContent = "";
    try { a.partida = d.crea(Object.assign(ctxBase(), { lienzo: a.lienzo, mandos: a.mandos })); }
    catch (e: T) { a.partida = null; try { console.error("[juegos] " + a.id, e); } catch (e2: T) {} cierra(); return false; }
    medidas(); pintaBarra(); a.partida.pinta();
    return true;
  }
  function abre(id?: T) {
    if (typeof dp.VRX !== "undefined" && dp.VRX.on) return abreVR(id);   // en VR, una lámina (C9b)
    if (abierto || !juegos[id]) return false;
    if (dp.Ventanas.abierta()) dp.Ventanas.cierra();
    var d: T = juegos[id], previo: T = document.activeElement;
    var capa: T = el("div", "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:rgba(14,20,15,0.96);color:#fff;font:16px system-ui,sans-serif;" +
      "padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));box-sizing:border-box");
    capa.id = "juegoCapa"; capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", d.titulo); capa.tabIndex = -1;
    var barra: T = el("div", "display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:52px");
    var titulo: T = el("h2", "margin:0;font-size:20px;flex:0 0 auto", d.titulo), puntos: T = el("span", "font-size:19px;font-weight:700;flex:0 0 auto"), record: T = el("span", "font-size:15px;opacity:.85;flex:1 1 auto");
    puntos.setAttribute("data-puntos", ""); puntos.setAttribute("aria-live", "off");
    var bPausa: T = el("button", BOTON, "Pausa"), bCerrar: T = el("button", BOTON + ";font-size:24px;padding:0 14px", "×");
    bPausa.type = "button"; bCerrar.type = "button"; bCerrar.setAttribute("aria-label", "Salir del juego y volver al olivar (Esc)"); bCerrar.title = "Volver al olivar · Esc";
    [titulo, puntos, record, bPausa, bCerrar].forEach(function (x?: T) { barra.appendChild(x); });
    var area: T = el("div", "flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;justify-content:center");
    var tela: T = el("canvas", "display:block;max-width:100%;max-height:100%"); tela.setAttribute("role", "img"); area.appendChild(tela);
    var mandos: T = el("div", "display:flex;gap:8px;justify-content:center;padding-top:8px;flex:0 0 auto");
    var ayuda: T = d.ayuda ? el("p", "margin:6px 0 0;font-size:14px;opacity:.75;text-align:center", d.ayuda) : null;
    var fin: T = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,14,10,0.82)"); fin.hidden = true;
    fin.setAttribute("role", "alertdialog"); fin.setAttribute("aria-live", "polite");
    area.appendChild(fin);
    capa.appendChild(barra); capa.appendChild(area); capa.appendChild(mandos); if (ayuda) capa.appendChild(ayuda);
    document.body.appendChild(capa);
    abierto = { id: id, capa: capa, area: area, lienzo: tela, mandos: mandos, fin: fin, puntos: puntos, record: record, bPausa: bPausa, previo: previo, partida: null, quitar: [], guardado: false };
    function on(x?: T, ev?: T, fn?: T, op?: T) { x.addEventListener(ev, fn, op); abierto.quitar.push(function () { x.removeEventListener(ev, fn, op); }); }
    on(bCerrar, "click", function () { cierra(); });
    on(bPausa, "click", function () { alternaPausa(); });
    // el teclado, mientras está abierto, es del juego: se coge en la fase de captura y no llega al paseo, al HUD ni a las otras teclas
    on(window, "keydown", function (ev?: T) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      ev.stopImmediatePropagation();
      if (ev.code === "Escape") { ev.preventDefault(); cierra(); return; }
      if (ev.code === "KeyP") { ev.preventDefault(); if (!ev.repeat) alternaPausa(); return; }
      var t: T = ev.target && ev.target.tagName;
      if (t === "BUTTON" && (ev.code === "Enter" || ev.code === "Space" || ev.code === "NumpadEnter")) return;   // Intro sobre un botón lo pulsa
      if (abierto.partida && !abierto.fin.hidden) return;
      if (abierto.partida && abierto.partida.tecla(ev.code)) ev.preventDefault();
    }, true);
    on(window, "resize", medidas);
    on(document, "visibilitychange", function () { if (document.hidden && abierto && abierto.partida && !abierto.partida.pausada() && !abierto.partida.estado().fin) alternaPausa(); });
    dp.Pausa.pon("juegos");
    if (!nuevaPartida()) return false;
    capa.focus({ preventScroll: true });
    if (!records[id]) pideRecord(id);
    return true;
  }

  // ---------- el juego en VR (C9b): una lámina (Laminas, 02d) delante, a la altura de los ojos y anclada al mundo. El mundo NO se pausa (sigue dibujándose alrededor);
  // la lámina pinta con la función del juego (pintaEn) solo cuando cambia su firma. Mandos: el rayo con el gatillo toca las zonas (alTocar), la palanca derecha
  // (VRX.captura, que 29_vr.js lee en lugar del giro y el teletransporte) mueve, gira y suelta, B pausa y pulsar la palanca sale.
  function ofrecidosVR() { return orden.filter(function (id?: T) { var d: T = juegos[id]; return d && d.vr && d.vr.botones && d.vr.botones.length; }); }
  function rrect(cx?: T, x?: T, y?: T, w?: T, h?: T, r?: T) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function botonVR(cx?: T, r?: T, txt?: T, tam?: T, relleno?: T) {
    cx.fillStyle = relleno || "rgba(255,255,255,0.14)"; rrect(cx, r.x, r.y, r.w, r.h, 18); cx.fill(); cx.lineWidth = 3; cx.strokeStyle = "rgba(255,255,255,0.55)"; cx.stroke();
    cx.fillStyle = "#fff"; cx.font = "700 " + tam + "px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
  function pintaVR(cx?: T, w?: T, h?: T) {
    var v: T = vr; if (!v) return;
    var V: T = JP.VR, p: T = v.partida, est: T = p.estado(), fin: T = est.fin, g: T = JP.geoVR(fin ? 2 : v.def.vr.botones.length);
    cx.fillStyle = "#0e140f"; cx.fillRect(0, 0, w, h);
    cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#fff"; cx.font = "700 40px system-ui, sans-serif"; cx.fillText(v.def.titulo, 24, 38);
    cx.font = "700 36px system-ui, sans-serif"; cx.fillStyle = "#ffe9a8"; cx.fillText(JP.fmtPuntos(est.puntos), 24, 82);
    cx.font = "600 28px system-ui, sans-serif"; cx.fillStyle = "#cfdccb"; cx.fillText(v.recordTxt, 190, 84);
    if (!fin) botonVR(cx, g.pausa, p.pausada() ? "Seguir" : "Pausa", 32);
    botonVR(cx, g.salir, "Salir", 32);
    cx.save(); cx.beginPath(); cx.rect(0, V.tabY, w, V.tabH); cx.clip(); cx.translate(0, V.tabY); p.pintaEn(cx, w, V.tabH); cx.restore();
    if (fin) {
      var r: T = p.resultado(); cx.fillStyle = "rgba(10,14,10,0.86)"; rrect(cx, 80, V.tabY + 200, w - 160, 330, 24); cx.fill();
      cx.textAlign = "center"; cx.fillStyle = "#fff"; cx.font = "700 46px system-ui, sans-serif"; cx.fillText("Se acabó la partida", w / 2, V.tabY + 270);
      cx.font = "700 52px system-ui, sans-serif"; cx.fillStyle = "#ffe9a8"; cx.fillText(JP.fmtPuntos(r.puntos) + " puntos", w / 2, V.tabY + 350);
      cx.font = "600 30px system-ui, sans-serif"; cx.fillStyle = "#e8eee4"; cx.fillText("en " + JP.fmtDuracion(r.duracion_s), w / 2, V.tabY + 410); cx.fillText(v.mensaje, w / 2, V.tabY + 470);
      var cl: T = v.clasif && JP.filasVR(v.clasif, 4);   // C9b+: tu puesto y la tabla corta (solo si el servidor la dio; textos siempre con fillText)
      if (cl) {
        var y0: T = V.tabY + 560; cx.fillStyle = "rgba(10,14,10,0.86)"; rrect(cx, 80, y0 - 30, w - 160, 70 + cl.filas.length * 38, 20); cx.fill();
        cx.textAlign = "center"; cx.fillStyle = "#fff"; cx.font = "700 32px system-ui, sans-serif"; cx.fillText(cl.puesto, w / 2, y0);
        cx.font = "600 28px system-ui, sans-serif";
        cl.filas.forEach(function (f?: T, i?: T) { var yy: T = y0 + 44 + i * 38; cx.fillStyle = f.mia ? "#ffe9a8" : "#e8eee4"; cx.textAlign = "left"; cx.fillText(f.t.length > 24 ? f.t.slice(0, 23) + "…" : f.t, 110, yy); cx.textAlign = "right"; cx.fillText(f.p, w - 110, yy); });
        cx.textAlign = "center";
      }
      botonVR(cx, g.botones[0], "Otra partida", 34); botonVR(cx, g.botones[1], "Salir", 34);
    } else v.def.vr.botones.forEach(function (b?: T, i?: T) { botonVR(cx, g.botones[i], b.t, 36); });
    cx.textAlign = "center"; cx.font = "600 24px system-ui, sans-serif"; cx.fillStyle = "#a9bba5"; cx.fillText(v.def.vr.ayuda || "", w / 2, V.ayudaY + 16);
  }
  function firmaVR() { var v: T = vr; return v ? v.partida.firma() + "|" + v.mensaje + "|" + v.recordTxt + "|" + (v.clasif ? v.clasif.total + ":" + (v.clasif.mia ? v.clasif.mia.puesto : "-") : "") : ""; }
  function nuevaVR() {
    var v: T = vr, d: T = v.def;
    if (v.partida) v.partida.libera();
    v.guardado = false; v.mensaje = ""; v.clasif = null; v.recordTxt = textoRecord(v.id);
    try { v.partida = d.crea(Object.assign(ctxBase(), { lienzo: null, mandos: null, vr: true })); } catch (e: T) { v.partida = null; try { console.error("[juegos] " + v.id, e); } catch (e2: T) {} return false; }
    return true;
  }
  function zonaTocada(z?: T) {
    var v: T = vr; if (!v || !z) return;
    if (z.tipo === "salir") cierraVR();
    else if (z.tipo === "otra") nuevaVR();
    else if (z.tipo === "pausa") alternaPausaVR();
    else if (z.tipo === "accion") v.partida.accion(z.a);
  }
  function alternaPausaVR() { var v: T = vr; if (!v || !v.partida || v.partida.estado().fin) return; v.partida.pausa(!v.partida.pausada()); }
  function abreVR(id?: T) {
    var d: T = juegos[id]; if (!d || !d.vr || !d.vr.botones || typeof dp.VRX === "undefined" || !dp.VRX.on || typeof dp.Laminas === "undefined") return false;
    if (vr) cierraVR();
    if (abierto) cierra();
    var v: T = { id: id, def: d, partida: null, guardado: false, mensaje: "", recordTxt: textoRecord(id), pal: { dir: "", t: 0 } };
    vr = v;
    if (!nuevaVR()) { vr = null; return false; }
    var ok: T = dp.Laminas.abre({ id: LAM, nombre: "juegoVR", ancho: JP.VR.w / 800, alto: JP.VR.h / 800, w: JP.VR.w, h: JP.VR.h, modo: "vr", bajo: { vr: 0.15 },
      pinta: function (cx?: T, w?: T, h?: T) { pintaVR(cx, w, h); }, firma: firmaVR,
      alTocar: function (u?: T, vv?: T) { zonaTocada(JP.zonaVR(u, vv, v.def.vr.botones, v.partida && v.partida.estado().fin)); return true; },
      alCierra: function () {
        try { if (v.partida) v.partida.libera(); } catch (e: T) {}
        if (vr === v) { vr = null; dp.VRX.captura = null; }
        if (typeof dp.PanelVR !== "undefined") dp.PanelVR.repinta();
      } });
    if (!ok) { if (vr === v) vr = null; try { v.partida.libera(); } catch (e: T) {} return false; }
    dp.VRX.captura = {
      palanca: function (x?: T, y?: T, dt?: T) { if (vr !== v || !v.partida) return; JP.palanca(v.pal, x, y, dt).forEach(function (o?: T) { var a: T = v.def.vr.palanca && v.def.vr.palanca[o]; if (a) v.partida.accion(a); }); },
      boton: function (k?: T) { if (vr !== v) return false; if (k === "B") { alternaPausaVR(); return true; } if (k === "palanca") { cierraVR(); return true; } return false; }
    };
    if (typeof dp.PanelVR !== "undefined") { dp.PanelVR.cierra(); dp.PanelVR.repinta(); }
    if (!records[id]) pideRecord(id);
    return true;
  }
  function cierraVR() { return dp.Laminas.cierra(LAM, "cerrada"); }
  // cada fotograma en VR (fase «mundo»: el mundo no está en pausa): avanza la partida y, si cambió lo que se ve, repinta la lámina (la textura solo se sube con firma nueva)
  function turnoVR(dt?: T) {
    var v: T = vr; if (!v || !v.partida) return;
    v.partida.actualiza(dt);
    if (v.partida.estado().fin && !v.guardado) {
      v.guardado = true; v.mensaje = "Guardando…";
      guarda(v.id, v.partida.resultado()).then(function (g?: T) { if (vr === v) v.mensaje = (g.nuevo ? "¡Récord nuevo! " : "") + textoRecord(v.id); return pideClasificacion(v.id); })
        .then(function (cl?: T) { if (cl && vr === v && v.partida && v.partida.estado().fin) v.clasif = cl; });
    }
    dp.Laminas.repinta(LAM);
  }
  function alternaPausa() { if (!abierto || !abierto.partida || abierto.partida.estado().fin) return; abierto.partida.pausa(!abierto.partida.pausada()); pintaBarra(); }
  function cierra() {
    if (!abierto) return false;
    var a: T = abierto; abierto = null;
    try { if (a.partida) a.partida.libera(); } catch (e: T) {}
    a.quitar.splice(0).forEach(function (fn?: T) { try { fn(); } catch (e: T) {} });
    if (a.capa.parentNode) a.capa.parentNode.removeChild(a.capa);
    dp.Pausa.quita("juegos");
    if (a.previo && a.previo.focus && document.contains(a.previo)) { try { a.previo.focus({ preventScroll: true }); } catch (e: T) {} }
    pintaLista();
    return true;
  }
  function acaba() {
    var a: T = abierto, res: T = a.partida.resultado(); a.guardado = true;
    a.fin.textContent = "";
    var c: T = el("div", "max-width:360px;margin:12px;padding:20px;border-radius:16px;background:#22301f;border:2px solid rgba(255,255,255,0.35);text-align:center");
    c.appendChild(el("h3", "margin:0 0 10px;font-size:24px", "Se acabó la partida"));
    c.appendChild(el("p", "margin:0 0 6px;font-size:22px;font-weight:700", JP.fmtPuntos(res.puntos) + " puntos"));
    c.appendChild(el("p", "margin:0 0 12px;font-size:16px;opacity:.85", "en " + JP.fmtDuracion(res.duracion_s)));
    var linea: T = el("p", "margin:0 0 16px;font-size:17px", "Guardando…"); c.appendChild(linea);
    var puesto: T = el("div", "margin:0 0 14px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.08)"); puesto.setAttribute("data-clasificacion", a.id); puesto.hidden = true; c.appendChild(puesto);
    var otra: T = el("button", BOTON + ";margin:4px", "Otra partida"), volver: T = el("button", BOTON + ";margin:4px", "Volver al olivar");
    otra.type = "button"; volver.type = "button"; otra.addEventListener("click", function () { if (abierto === a) nuevaPartida(); }); volver.addEventListener("click", function () { cierra(); });
    c.appendChild(otra); c.appendChild(volver); a.fin.appendChild(c); a.fin.hidden = false; otra.focus({ preventScroll: true });
    guarda(a.id, res).then(function (g?: T) {
      linea.textContent = (g.nuevo ? "¡Récord nuevo! " : "") + textoRecord(a.id);
      if (abierto === a) pintaBarra();
      return pideClasificacion(a.id);
    }).then(function (cl?: T) { if (cl && abierto === a) { pintaTabla(puesto, cl); puesto.hidden = false; } });
  }
  // la fase «pausa» (solo con el mundo en pausa): avanza la partida y la pinta si cambió
  function turno(dt?: T) {
    if (!abierto || !abierto.partida) return;
    var t0: T = performance.now(), p: T = abierto.partida;
    if (p.actualiza(dt)) { if (p.pinta()) mide.pintadas++; pintaBarra(); }
    if (p.estado().fin && !abierto.guardado) acaba();
    mide.n++; mide.ms += performance.now() - t0;
  }

  n.on("juego:ofrece", function (d?: T) {
    var e: T = JP.validaJuego(d); if (e.length) { try { console.warn("[juegos] juego no válido: " + e.join("; ")); } catch (er: T) {} return; }
    if (!juegos[d.id]) orden.push(d.id);
    juegos[d.id] = d; pintaLista();
  });
  n.on("juego:retira", function (d?: T) {
    var id: T = d && d.id; if (!juegos[id]) return;
    if (abierto && abierto.id === id) cierra();
    delete juegos[id]; orden = orden.filter(function (x?: T) { return x !== id; }); pintaLista();
  });
  n.on("vr:entra", function () { cierra(); });
  n.on("vr:sale", function () { if (vr) cierraVR(); });
  if (typeof dp.PanelVR !== "undefined") {   // la fila «Juegos» de la pestaña Mundo del panel VR: un botón por juego que sabe jugarse en VR
    n.limpia(dp.PanelVR.filas("mundo", { id: "juegos", orden: 60, alto: 88, visible: function () { return ofrecidosVR().length > 0; },
      pinta: function (cx?: T, y?: T, W?: T, h?: T) { h.fila("Juegos", y); },
      botones: function (b?: T, y?: T) {
        var ids: T = ofrecidosVR(), k: T = Math.max(1, ids.length), w: T = (470 - 12 * (k - 1)) / k;
        ids.forEach(function (id?: T, i?: T) { var on: T = !!(vr && vr.id === id); b("juego:" + id, 420 + i * (w + 12), y, w, 64, on ? "Cerrar" : juegos[id].titulo, function () { if (on) cierraVR(); else abreVR(id); }, on); });
      },
      firma: function () { return ofrecidosVR().join(",") + "|" + (vr ? vr.id : ""); } }));
  }
  n.limpia(dp.Ventanas.registra("juegos", { titulo: "Juegos", construye: function (cu?: T) { cuerpo = cu; pintaLista(); } }));
  // al abrir la ventana se pide el récord de la familia (solo con servidor)
  if (cuerpo && (window as T).MutationObserver && cuerpo.parentNode) {
    var mo: T = new MutationObserver(function () { if (!cuerpo.parentNode.hidden) orden.forEach(function (id?: T) { pideRecord(id); pideClasificacion(id); }); });
    mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); n.limpia(function () { mo.disconnect(); });
  }
  n.limpia(dp.Hud.icono({ id: "juegos", ico: "🎲", txt: "Juegos", tecla: "J", prio: 2, ventana: "juegos" }));
  n.limpia(dp.Teclas.registra("KeyJ", function () { if (typeof dp.VRX !== "undefined" && dp.VRX.on) return false; dp.Hud.alterna("juegos", null); }, "juegos"));
  n.limpia(function () { cierra(); if (vr) cierraVR(); cuerpo = null; });
  (window as T).__juegos = function () {
    return { juegos: orden.slice(), abierto: abierto ? abierto.id : null, pausaMundo: dp.Pausa.activa(), estado: abierto && abierto.partida ? abierto.partida.estado() : null,
      vr: vr ? { id: vr.id, estado: vr.partida ? vr.partida.estado() : null, pausada: !!(vr.partida && vr.partida.pausada()), clasif: vr.clasif || null, lamina: dp.Laminas.info(LAM) } : null,
      ofrecidosVR: ofrecidosVR(), tocaVR: function (u?: T, v?: T) { return vr ? zonaTocada(JP.zonaVR(u, v, vr.def.vr.botones, vr.partida.estado().fin)) : null; },
      msPorCuadro: mide.n ? mide.ms / mide.n : 0, cuadros: mide.n, pintadas: mide.pintadas, prefijo: prefijo, clasificacion: clasif, record: abierto ? recordDe(abierto.id) : null,
      reinicia: function () { mide.n = 0; mide.ms = 0; mide.pintadas = 0; } };
  };
  n.limpia(function () { try { delete (window as T).__juegos; } catch (e: T) { (window as T).__juegos = undefined; } });
  n.emite("juego:pide", {});
  // A3-7b2: lo que el núcleo no soltaba solo: las peticiones en vuelo (el récord, la clasificación, guardar la partida). Cerrar la partida o la lámina, el icono, la ventana, la tecla J,
  // el observador y window.__juegos ya los suelta n.limpia (y cierra() devuelve la pausa al mundo).
  function libera() { ctl.abort(); cierra(); if (vr) cierraVR(); }
  return { libera: libera, abre: abre, cierra: cierra, turno: turno, turnoVR: turnoVR, abreVR: abreVR, cierraVR: cierraVR, abierto: function () { return abierto ? abierto.id : null; } };
}

export function creaJuegos(dp: DepsJuegos, n: T) { return JuegosMotor(dp, n); }
export type Juegos = ReturnType<typeof creaJuegos>;

// el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?juegos=0 lo apaga; ?juegos=1 lo enciende.
export function manifiestoJuegos(dp: DepsJuegos): Manifiesto {
  return {
    id: ID_JUEGOS, version: 1,
    consume: ["Hud", "Ventanas", "Teclas", "VRX", "Laminas", "PanelVR"],
    expone: [],
    eventos: { escucha: ["juego:ofrece", "juego:retira", "vr:entra", "vr:sale"], emite: ["juego:pide"] },
    bandera: { defecto: true, url: "juegos" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // nada en la escena 3D: un canvas 2D por encima y el mundo en pausa (sin render) mientras se juega
    fases: { pausa: 0, mundo: 0 },
    mundos: ["exterior"],
    monta: function (n) { return creaJuegos(dp, n as T); },
    actualiza: { pausa: function (dt, _t, api: T) { api.turno(dt); }, mundo: function (dt, _t, api: T) { api.turnoVR(dt); } },
    libera: function (api: T) { if (api) api.libera(); }
  };
}
