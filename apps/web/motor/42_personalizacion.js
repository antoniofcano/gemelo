// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02_mundo (copas), 02c_componentes (Bus, Componentes), 02d_laminas (Laminas), 02e_entidades (Entidades, Usables),
//   03_escena (lienzo, camera, exag, modo), 09_camara (suelta, elige), 12_paseo (persona), 13b_hazas (HazasPuro, Hazas), 14_historia (lista),
//   15_tiempo (hace), 16_vida (quita, mira), 29_vr (VRX, ficha)
// Nota: Componente «personalizacion» (P7f, decisiones 91-96 y 99-102): nombrar, colgar una foto o un dibujo, verlo y denunciarlo en los olivos de las hazas. Solo se registra; nadie lo nombra. Sin servidor (sin D.base /teselas/… ni ?api=) no pide ni crea nada. Complementa la ficha común del olivo (Entidades.complementa), reduce la imagen en el aparato, pide el aviso con casilla y habla con /api/sesion, /api/hazas/{id}/olivos, /api/medios, /api/olivos, /api/personalizaciones/{id}/denuncias y /api/hazas/{id}/sugerencias. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/personalizacion.test.js.
// ===============================================================================

  // ---------- «personalización» (P7f; decisiones 91-96, 99-102; doc/sistema/VIDA.md y contratos/vida.md): los árboles de la haza con nombre y con una foto o pintura.
  // Es un COMPONENTE (ADR-0023, bandera ?personaliza=0 la apaga): se registra y nadie lo nombra. Sin servidor (salida artefacto, fixture, sin ?api=) no pide nada,
  // no crea nada y no cambia ninguna ficha. Con servidor:
  //  - pide GET /api/sesion (¿titular?) y, de cada haza que se ve, GET /api/hazas/<id>/olivos (solo lo permitido, decisión 13: nombre y objeto, sin quién lo subió) y lo refresca
  //    cada 2 minutos y tras cada cambio propio;
  //  - COMPLEMENTA la ficha común del olivo (Entidades.complementa, 02e_entidades.js; no hay ficha propia): la fila «Nombre» y la imagen si las hay y, según
  //    quién mira, las acciones de Usables. El titular (sesión del enlace mágico, decisión 96) en un olivo de SU haza: «Nombrar», «Colgar foto o dibujo»,
  //    «Quitar» y «Sugerir a la oficina»; cualquiera en un olivo AJENO con nombre o imagen: «Denunciar». Solo escribe el titular y solo en su haza (lo vuelve a
  //    comprobar la api: 403 solo_titular / no_es_tu_haza); aquí solo se decide qué ofrecer. En VR solo lectura y «Denunciar» (sin motivo ni texto: «otro»):
  //    subir, nombrar y sugerir piden teclado y selector de ficheros, que no hay en VR; la ficha lo dice;
  //  - subir: el fichero (JPEG, PNG o WebP) se reduce en el aparato (canvas, ≤ 1280 px, JPEG 0,85: no gasta datos; la api lo vuelve a codificar a WebP sin EXIF
  //    ni GPS), con el AVISO obligatorio con casilla («sin caras de menores ni datos personales»), POST /api/medios?acepto=true y luego PUT /api/olivos/…;
  //  - en el mundo: el nombre sobre el olivo al acercarse (a menos de 45 m, los 12 más cercanos, en el DOM: 0 llamadas y 0 triángulos; solo se calcula si hay
  //    algo con nombre cerca) y, al elegir un olivo con imagen, una lámina pequeña colgada de él (Laminas: 1 llamada y 1 textura de 512 px, liberadas al soltar).
  // Decisión 102: hasta la EIPD solo suben las cuentas de prueba. La api no distingue cuentas: si la subida está apagada responde 503 (subidas_apagadas) y la
  // pantalla lo explica; aquí no se inventa ningún permiso. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/personalizacion.test.js.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/personalizacion.test.js)
  var PersonalizaPuro = (function () {
    var RE_FINCA = /^[a-z0-9_-]{1,32}$/, URL_MEDIO = /^\/api\/medios\/[a-f0-9]{32}\.webp$/, CARACTERES = /^[\p{L}\p{N} '’.,;:!¡¿?()-]+$/u;
    var TIPOS = ["image/jpeg", "image/png", "image/webp"], MAX_PX = 1280, MAX_BYTES = 8 * 1024 * 1024, MAX_FOTO_PX = 40e6;
    var MOTIVOS = [["menores", "Aparece la cara de un menor"], ["datos_personales", "Hay datos personales"], ["ofensivo", "Es ofensivo"], ["no_es_del_olivar", "No es del olivar"], ["otro", "Otro motivo"]];
    // el texto del AVISO es el de la api (TEXTO_AVISO, versión 1 en contratos/vida.md); lo comprueba el guardián contra apps/api/src/vida/medios.ts
    var AVISO = "Sube solo fotos o pinturas del olivo o del campo. No subas caras de menores ni datos personales (nombres, matrículas, direcciones, teléfonos). Lo que subes lo ven al momento las demás familias; la oficina puede retirarlo.";
    var AVISO_PRUEBAS = "Mientras dure la fase de pruebas, solo suben fotos las cuentas de prueba.";
    var CERCA_M = 45, MAX_ROTULOS = 12, REFRESCO_S = 120;

    // «olivo:<finca>:<copas_id>» → { finca, copas_id } o null (el id provisional «olivo:<finca>:i<n>» no se puede personalizar: no es estable, decisión 92)
    function idOlivo(id) {
      var m = /^olivo:([a-z0-9_-]{1,32}):(\d{1,10})$/.exec(String(id == null ? "" : id)); if (!m) return null;
      var n = +m[2]; return n <= 4294967295 ? { finca: m[1], copas_id: n } : null;
    }
    function clave(finca, copas) { return finca + ":" + copas; }
    // la respuesta de GET /api/hazas/<id>/olivos al mapa «finca:copas_id» → { id (de la personalización), nombre, objeto, haza, mia }. Solo entra lo que cumple la lista
    // blanca (contratos/olivos-haza.schema.json): lo demás se ignora; nunca se confía en la forma de lo que llega de la red
    function indexa(mapa, resp) {
      if (!resp || typeof resp !== "object" || !Array.isArray(resp.olivos)) return 0;
      var n = 0, mia = resp.es_mia === true;
      resp.olivos.forEach(function (o) {
        if (!o || typeof o !== "object" || !RE_FINCA.test(o.finca) || !(Number.isInteger(o.copas_id) && o.copas_id >= 0 && o.copas_id <= 4294967295) || !Number.isInteger(o.id) || o.id < 1) return;
        var nombre = typeof o.nombre === "string" && o.nombre.length >= 1 && o.nombre.length <= 40 ? o.nombre : null, obj = null, q = o.objeto;
        if (q && typeof q === "object" && (q.tipo === "foto" || q.tipo === "pintura") && typeof q.url === "string" && URL_MEDIO.test(q.url) && Number.isInteger(q.ancho) && q.ancho > 0 && Number.isInteger(q.alto) && q.alto > 0)
          obj = { tipo: q.tipo, url: q.url, ancho: q.ancho, alto: q.alto };
        if (nombre === null && obj === null) return;
        mapa[clave(o.finca, o.copas_id)] = { id: o.id, nombre: nombre, objeto: obj, haza: resp.haza_id, mia: mia }; n++;
      });
      return n;
    }
    // el nombre como lo manda el cliente: espacios normalizados, 1-40 caracteres de los que admite la api. { ok, nombre } o { ok: false, error }
    function validaNombre(txt) {
      var s = String(txt == null ? "" : txt).normalize("NFC").trim().replace(/\s+/g, " ");
      if (!s) return { ok: false, error: "Escribe un nombre (hasta 40 letras)." };
      if (s.length > 40) return { ok: false, error: "El nombre pasa de 40 letras." };
      if (!CARACTERES.test(s)) return { ok: false, error: "Solo letras, números, espacios y . , ; : ! ¡ ¿ ? ( ) -" };
      return { ok: true, nombre: s };
    }
    // el fichero elegido: tipo admitido y no absurdo; { ok } o { ok: false, error }
    function validaFichero(f) {
      if (!f || typeof f !== "object") return { ok: false, error: "Elige una foto o un dibujo." };
      if (TIPOS.indexOf(String(f.type || "").toLowerCase()) < 0) return { ok: false, error: "Solo se admiten fotos JPEG, PNG o WebP (las de iPhone en formato HEIC, pásalas a JPEG o haz la foto en «Más compatible»)." };
      if (!(f.size > 0)) return { ok: false, error: "El fichero está vacío." };
      return { ok: true };
    }
    // las medidas tras reducir: el lado mayor a lo sumo max px, sin ampliar nunca y sin deformar
    function reduce(w, h, max) {
      max = max || MAX_PX; w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      var k = Math.min(1, max / Math.max(w, h)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), reducida: k < 1 };
    }
    // el texto de un error de la api (o de la red) para quien está delante; cuerpo = el JSON de la respuesta si lo había
    function mensajeError(estado, cuerpo, que) {
      var e = cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : "";
      if (!estado) return "No hay conexión con el servidor. Prueba otra vez en un rato.";
      if (estado === 401) return "Tu sesión ha caducado. Entra de nuevo con tu enlace.";
      if (e === "solo_titular" || (estado === 403 && que !== "denuncia")) return e === "no_es_tu_haza" ? "Ese olivo no está en tu haza." : "Solo la persona titular, entrando con su enlace, puede cambiar los árboles de su haza (no desde unas gafas vinculadas).";
      if (e === "no_es_tu_haza") return "Ese olivo no está en tu haza.";
      if (estado === 503 || e === "subidas_apagadas") return "Este servidor aún no admite fotos. Por ahora solo suben fotos las cuentas de prueba, y cuando se abra se avisará.";
      if (estado === 413 || e === "imagen_demasiado_grande") return "La imagen es demasiado grande. Prueba con otra o con una más pequeña.";
      if (estado === 415 || e === "tipo_no_admitido" || e === "no_es_imagen") return "Solo se admiten fotos JPEG, PNG o WebP.";
      if (estado === 429 || e === "demasiadas_peticiones") return "Has hecho muchos cambios o subidas seguidos (hay un límite por hora). Espera un rato y vuelve a probar.";
      if (e === "ya_denunciado") return "Ya lo habías denunciado: la oficina lo está mirando.";
      if (e === "olivo_no_existe" || estado === 404) return que === "denuncia" ? "Eso ya no se ve (puede que lo hayan quitado)." : "No hay ningún olivo con ese número.";
      if (estado === 400 && cuerpo && typeof cuerpo.mensaje === "string" && cuerpo.mensaje) return cuerpo.mensaje;   // nombre_no_valido, texto_no_valido… ya vienen en español
      if (estado === 400) return "Algo del formulario no vale. Revisa lo escrito.";
      if (estado === 409) return "Otro cambio en el mismo olivo se ha cruzado con este. Vuelve a probar.";
      return "No se ha podido (error " + estado + "). Prueba otra vez más tarde.";
    }
    // qué se ofrece en la ficha de un olivo. Entra: { titular (true|false|null si aún no se sabe), mia (el olivo cae en una haza mía), dato (su personalización o null), vr, estable (tiene copas_id) }.
    // Sale: { acciones: [{ id, txt }], filas: [{ k, v, de? }] } (las filas solo avisan de lo que no se puede hacer aquí)
    function ofrece(o) {
      var ac = [], filas = [], dato = o.dato;
      if (!o.estable) return { acciones: ac, filas: filas };
      if (o.mia && o.titular === true) {
        if (o.vr) { filas.push({ k: "Nombrar y fotos", v: "no en VR: se hace desde el móvil o el ordenador (pide teclado y elegir un fichero)" }); }
        else {
          ac.push({ id: "nombrar", txt: dato && dato.nombre ? "Cambiar nombre" : "Nombrar" });
          ac.push({ id: "foto", txt: dato && dato.objeto ? "Cambiar foto o dibujo" : "Colgar foto o dibujo" });
          if (dato) ac.push({ id: "quitar", txt: "Quitar" });
          ac.push({ id: "sugerir", txt: "Sugerir a la oficina" });
        }
      } else if (o.mia && o.titular === false) {
        filas.push({ k: "Personalizar", v: "solo con tu enlace (no desde unas gafas vinculadas)" });
      } else if (!o.mia && dato) {
        ac.push({ id: "denunciar", txt: "Denunciar" });
      }
      return { acciones: ac, filas: filas };
    }
    // los rótulos que tocan: de los olivos con nombre { x, z, clave, nombre } los que están a menos de `cerca` m de (cx, cz), los `max` más cercanos, de más cerca a más lejos
    function cercanos(cands, cx, cz, cerca, max) {
      var r = [], c2 = cerca * cerca, i, q, dx, dz, d2;
      for (i = 0; i < cands.length; i++) {
        q = cands[i]; dx = q.x - cx; dz = q.z - cz; d2 = dx * dx + dz * dz;
        if (d2 >= c2) continue;
        if (r.length < max || d2 < r[r.length - 1].d2) {   // inserción en un vector corto y ordenado (max = 12): sin ordenar todo
          var it = { q: q, d2: d2 }, k = r.length; if (k < max) r.push(it); else k = max - 1;
          while (k > 0 && r[k - 1].d2 > d2) { r[k] = r[k - 1]; k--; } r[k] = it;
        }
      }
      return r.map(function (a) { return { q: a.q, d: Math.sqrt(a.d2) }; });
    }
    // el cuerpo del PUT /api/olivos/…: SOLO lo que cambia (nombre: texto o null; objeto: { tipo, medio_id } o null); lo omitido se queda como estaba (la relación permitida no
    // da el medio_id de la foto colgada: cambiar el nombre no puede volver a mandarlo)
    function cuerpoOlivo(cambia) {
      var o = {}; if (cambia && "nombre" in cambia) o.nombre = cambia.nombre; if (cambia && "objeto" in cambia) o.objeto = cambia.objeto; return o;
    }
    // el cliente de la api (mismo origen, cookie de sesión): nunca lanza; devuelve { ok, estado, cuerpo }. fetchFn(url, opciones) como el fetch del navegador
    function Cliente(prefijo, fetchFn) {
      function llama(metodo, ruta, cuerpo, cabeceras) {
        var op = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
        Object.keys(cabeceras || {}).forEach(function (k) { op.headers[k] = cabeceras[k]; });
        if (cuerpo !== undefined) op.body = cuerpo;
        return Promise.resolve().then(function () { return fetchFn(prefijo + ruta, op); }).then(function (r) {
          var t = r.status === 204 ? Promise.resolve(null) : r.json ? r.json().catch(function () { return null; }) : Promise.resolve(null);
          return t.then(function (j) { return { ok: r.status >= 200 && r.status < 300, estado: r.status, cuerpo: j }; });
        }).catch(function () { return { ok: false, estado: 0, cuerpo: null }; });
      }
      function json(metodo, ruta, o) { return llama(metodo, ruta, JSON.stringify(o), { "content-type": "application/json" }); }
      var enc = encodeURIComponent;
      return {
        sesion: function () { return llama("GET", "sesion"); },
        olivosDeHaza: function (id) { return llama("GET", "hazas/" + enc(id) + "/olivos"); },
        sube: function (blob, tipo) { return llama("POST", "medios?acepto=true", blob, { "content-type": tipo }); },   // acepto=true: la casilla del AVISO ya está marcada (la pantalla no deja llegar sin ella)
        cuelga: function (finca, copas, cuerpo) { return json("PUT", "olivos/" + enc(finca) + "/" + copas, cuerpo); },
        quita: function (finca, copas) { return llama("DELETE", "olivos/" + enc(finca) + "/" + copas); },
        denuncia: function (id, motivo, texto) { var o = { motivo: motivo }; if (texto) o.texto = texto; return json("POST", "personalizaciones/" + id + "/denuncias", o); },
        sugiere: function (haza, texto, finca, copas) { var o = { texto: texto }; if (finca) { o.finca = finca; o.copas_id = copas; } return json("POST", "hazas/" + enc(haza) + "/sugerencias", o); }
      };
    }
    // el flujo de colgar una imagen: reducir → subir → colgar. reduceFn(archivo) → Promise<{ blob, tipo }> (el navegador la hace con un canvas); devuelve { ok, error?, paso }
    function cuelgaImagen(cli, reduceFn, archivo, id, tipoObjeto) {
      var v = validaFichero(archivo); if (!v.ok) return Promise.resolve({ ok: false, error: v.error, paso: "fichero" });
      return Promise.resolve().then(function () { return reduceFn(archivo); }).then(function (r) {
        if (!r || !r.blob) return { ok: false, error: "No se ha podido leer esa imagen. Prueba con otra.", paso: "reducir" };
        if (r.blob.size > MAX_BYTES) return { ok: false, error: "La imagen sigue siendo demasiado grande. Prueba con otra.", paso: "reducir" };
        return cli.sube(r.blob, r.tipo).then(function (s) {
          if (!s.ok) return { ok: false, error: mensajeError(s.estado, s.cuerpo, "subida"), paso: "subir", estado: s.estado };
          var medio = s.cuerpo && s.cuerpo.id;
          if (!Number.isInteger(medio)) return { ok: false, error: "El servidor contestó algo raro. Prueba otra vez.", paso: "subir" };
          return cli.cuelga(id.finca, id.copas_id, cuerpoOlivo({ objeto: { tipo: tipoObjeto === "pintura" ? "pintura" : "foto", medio_id: medio } })).then(function (p) {
            return p.ok ? { ok: true, paso: "colgar" } : { ok: false, error: mensajeError(p.estado, p.cuerpo, "olivo"), paso: "colgar", estado: p.estado };
          });
        });
      });
    }
    return { CERCA_M: CERCA_M, MAX_ROTULOS: MAX_ROTULOS, REFRESCO_S: REFRESCO_S, MAX_PX: MAX_PX, MAX_BYTES: MAX_BYTES, MAX_FOTO_PX: MAX_FOTO_PX, TIPOS: TIPOS, MOTIVOS: MOTIVOS, AVISO: AVISO, AVISO_PRUEBAS: AVISO_PRUEBAS,
      idOlivo: idOlivo, clave: clave, indexa: indexa, validaNombre: validaNombre, validaFichero: validaFichero, reduce: reduce, mensajeError: mensajeError, ofrece: ofrece,
      cercanos: cercanos, cuerpoOlivo: cuerpoOlivo, Cliente: Cliente, cuelgaImagen: cuelgaImagen };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/personalizacion.test.js con un DOM, un Entidades y un Laminas de mentira)
  function PersonalizaMotor(n) {
    var P = PersonalizaPuro, API = HazasPuro.prefijoApi(location.search, D.base);
    if (!API) return { actualiza: function () {}, libera: function () {}, estado: function () { return { api: false }; } };   // sin servidor: ni pide ni crea nada
    var cli = P.Cliente(API, function (u, o) { return fetch(u, o); });
    var titular = null, mapa = {}, rotulosDe = [], cargadas = 0, hazasVistas = {}, tRefresco = 0, tarde = 0, vivo = true, pidiendo = 0;
    var recuadro = null, caja = null, pool = [], rect = null, vec = new THREE.Vector3(), imagen = null, laminaDe = "", quitaCompl = null, contador = { rotulos: 0, laminas: 0, subidas: 0 };
    var ESTILO_BOTON = "font:inherit;color:inherit;min-height:44px;min-width:44px;padding:6px 12px;border-radius:8px;cursor:pointer;background:rgba(64,240,255,0.16);border:1px solid rgba(64,240,255,0.55)";

    // ---- los datos: sesión y, de cada haza, sus olivos con nombre o imagen
    function indexaTodo() {   // reconstruye el mapa y los rótulos
      rotulosDe = [];
      Object.keys(mapa).forEach(function (k) {
        var d = mapa[k]; if (!d.nombre) return;
        var p = k.split(":"), pos = Entidades.pos("olivo:" + p[0] + ":" + p[1]); if (!pos) return;
        rotulosDe.push({ x: pos.x, z: pos.z, clave: k, nombre: d.nombre });
      });
    }
    function traeHaza(h) {
      pidiendo++;
      return cli.olivosDeHaza(h.id).then(function (r) {
        pidiendo--;
        if (!vivo) return;
        if (r.ok && r.cuerpo) { var viejas = Object.keys(mapa).filter(function (k) { return String(mapa[k].haza) === String(h.id); }); viejas.forEach(function (k) { delete mapa[k]; }); r.cuerpo.es_mia = h.es_mia; r.cuerpo.haza_id = h.id; P.indexa(mapa, r.cuerpo); cargadas++; }
        indexaTodo();
      });
    }
    function refrescaTodo() { var l = Hazas.vistas(); l.forEach(function (h) { hazasVistas[h.id] = true; }); return Promise.all(l.map(traeHaza)); }
    function refrescaUna(idHaza) { var l = Hazas.vistas().filter(function (h) { return String(h.id) === String(idHaza); }); return Promise.all(l.map(traeHaza)); }

    // ---- la ficha común (Entidades.complementa): la fila del nombre, la de la imagen y las acciones
    function contexto(id) {
      var i = P.idOlivo(id), pos = Entidades.pos(id), hz = pos ? Hazas.enPunto(pos.x, -pos.z) : null;
      return { i: i, pos: pos, haza: hz, mia: !!(hz && hz.es_mia), dato: i ? mapa[P.clave(i.finca, i.copas_id)] || null : null };
    }
    function complementa(f, id, modo) {
      var c = contexto(id); if (!c.i) return;
      var of = P.ofrece({ titular: titular, mia: c.mia, dato: c.dato, vr: modo === "vr", estable: true });
      var filas = [];
      if (c.dato && c.dato.nombre) filas.push({ k: "Nombre", v: c.dato.nombre, de: c.mia ? "puesto por tu familia" : "puesto por la familia de esa haza" });
      if (c.dato && c.dato.objeto) filas.push({ k: c.dato.objeto.tipo === "pintura" ? "Pintura" : "Foto", v: modo === "vr" ? "colgada junto al árbol" : "colgada junto al árbol al elegirlo", de: "subida por la familia; no la mide el gemelo" });
      f.filas = filas.concat(f.filas || [], of.filas);
      if (of.acciones.length) f.acciones = (f.acciones || []).concat(of.acciones.map(function (a) { return { id: a.id, txt: a.txt, fn: function () { return accion(a.id, id, modo); } }; }));
    }
    function accion(que, id, modo) {
      var c = contexto(id); if (!c.i) return false;
      if (modo === "vr") {   // en VR solo lo que no pide teclado: denunciar con el motivo «otro» (la oficina lo mira igual)
        if (que === "denunciar" && c.dato) { enviaDenuncia(id, c, "otro", ""); return true; }
        return false;
      }
      abrePanel(que, id, c); return true;
    }

    // ---- el recuadro de pantalla (nombrar, subir, quitar, denunciar, sugerir): un solo recuadro, con textContent siempre
    function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
    function cierraPanel() { if (recuadro && recuadro.parentNode) recuadro.parentNode.removeChild(recuadro); recuadro = null; caja = null; }
    function abrePanel(que, id, c) {
      cierraPanel();
      recuadro = el("div", "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);padding:12px");
      recuadro.setAttribute("id", "personalizaPanel"); recuadro.setAttribute("role", "dialog"); recuadro.setAttribute("aria-modal", "true");
      caja = el("div", "max-width:440px;width:100%;max-height:92vh;overflow:auto;background:rgba(20,28,24,0.97);color:#f1f4ee;border-radius:12px;padding:16px;font:16px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.6)");
      recuadro.appendChild(caja);
      var titulo = { nombrar: "Nombrar este olivo", foto: "Colgar una foto o un dibujo", quitar: "Quitar lo de este olivo", denunciar: "Denunciar", sugerir: "Sugerir a la oficina" }[que] || "";
      caja.appendChild(el("h2", "margin:0 0 10px;font-size:20px", titulo));
      var msg = el("p", "margin:8px 0;min-height:1.4em;color:#ffd27a"); msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite"); msg.setAttribute("data-msg", "1");
      var fila = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px");
      var ok = el("button", ESTILO_BOTON, "Guardar"), no = el("button", ESTILO_BOTON, "Cancelar"); ok.type = no.type = "button"; ok.setAttribute("data-ok", "1"); no.setAttribute("data-cancela", "1");
      no.addEventListener("click", cierraPanel);
      recuadro.addEventListener("keydown", function (e) { if (e.key === "Escape") { cierraPanel(); e.stopPropagation(); } e.stopPropagation(); });   // el teclado del recuadro no mueve el mundo
      function ocupado(si, txt) { ok.disabled = si; if (txt) msg.textContent = txt; }
      function fin(r, hecho) {
        if (r.ok) { cierraPanel(); refrescaUna(c.haza && c.haza.id).then(function () { Usables.refresca(id); if (hecho) hecho(); }); return; }
        ocupado(false, r.error || P.mensajeError(r.estado, r.cuerpo, que === "denunciar" ? "denuncia" : "olivo"));
      }
      var campo = null;
      if (que === "nombrar") {
        campo = el("input", "width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid #6b7;background:#0c120e;color:inherit"); campo.type = "text"; campo.maxLength = 40; campo.value = c.dato && c.dato.nombre || "";
        campo.setAttribute("aria-label", "Nombre del olivo"); campo.setAttribute("autocomplete", "off");
        caja.appendChild(el("p", "margin:0 0 8px", "Hasta 40 letras. Lo verán las demás familias; la oficina puede retirarlo. Sin enlaces, teléfonos ni datos personales."));
        caja.appendChild(campo);
        ok.addEventListener("click", function () {
          var v = P.validaNombre(campo.value); if (!v.ok) { msg.textContent = v.error; return; }
          ocupado(true, "Guardando…");
          cli.cuelga(c.i.finca, c.i.copas_id, P.cuerpoOlivo({ nombre: v.nombre })).then(function (r) { fin({ ok: r.ok, estado: r.estado, cuerpo: r.cuerpo }); });
        });
      } else if (que === "foto") {
        var arch = el("input", "width:100%;box-sizing:border-box;font:inherit;margin:6px 0"); arch.type = "file"; arch.accept = P.TIPOS.join(","); arch.setAttribute("aria-label", "Foto o dibujo");
        var tipo = el("select", "font:inherit;padding:8px;border-radius:8px;margin:6px 0;background:#0c120e;color:inherit"); tipo.setAttribute("aria-label", "Qué es");
        [["foto", "Es una foto"], ["pintura", "Es un dibujo o una pintura"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; tipo.appendChild(op); });
        var av = el("label", "display:flex;gap:10px;align-items:flex-start;margin:10px 0;padding:10px;border-radius:8px;background:rgba(255,210,122,0.12);border:1px solid rgba(255,210,122,0.5)");
        var chk = el("input", "min-width:24px;min-height:24px;margin-top:2px"); chk.type = "checkbox"; chk.setAttribute("data-acepta", "1");
        av.appendChild(chk); av.appendChild(el("span", "", P.AVISO + " Marco que lo he leído y que lo cumplo."));
        caja.appendChild(arch); caja.appendChild(tipo); caja.appendChild(av); caja.appendChild(el("p", "margin:4px 0;font-size:14px;opacity:.85", P.AVISO_PRUEBAS + " La foto se reduce en tu aparato antes de subirla y el servidor le quita la ubicación y los datos de la cámara."));
        ok.textContent = "Subir y colgar"; ok.disabled = true;
        chk.addEventListener("change", function () { ok.disabled = !chk.checked; });
        ok.addEventListener("click", function () {
          if (!chk.checked) { msg.textContent = "Marca que has leído el AVISO."; return; }
          var f = arch.files && arch.files[0], v = P.validaFichero(f); if (!v.ok) { msg.textContent = v.error; return; }
          ocupado(true, "Reduciendo y subiendo…");
          P.cuelgaImagen(cli, reduceImagen, f, c.i, tipo.value).then(function (r) { if (r.ok) contador.subidas++; fin(r); });
        });
      } else if (que === "quitar") {
        caja.appendChild(el("p", "margin:0 0 8px", "Se quitan el nombre y la imagen de este olivo (la oficina conserva el registro, como de lo retirado). ¿Seguro?"));
        ok.textContent = "Quitar";
        ok.addEventListener("click", function () { ocupado(true, "Quitando…"); cli.quita(c.i.finca, c.i.copas_id).then(function (r) { fin({ ok: r.ok, estado: r.estado, cuerpo: r.cuerpo }); }); });
      } else if (que === "denunciar") {
        caja.appendChild(el("p", "margin:0 0 8px", "Lo mirará la oficina. Mientras tanto se sigue viendo."));
        campo = el("select", "font:inherit;padding:8px;border-radius:8px;width:100%;margin:6px 0;background:#0c120e;color:inherit"); campo.setAttribute("aria-label", "Motivo");
        P.MOTIVOS.forEach(function (m) { var op = el("option", "", m[1]); op.value = m[0]; campo.appendChild(op); });
        var tx = el("textarea", "width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px;min-height:70px;background:#0c120e;color:inherit"); tx.maxLength = 500; tx.setAttribute("aria-label", "Qué ocurre (opcional)");
        caja.appendChild(campo); caja.appendChild(tx); ok.textContent = "Enviar denuncia";
        ok.addEventListener("click", function () { ocupado(true, "Enviando…"); enviaDenuncia(id, c, campo.value, tx.value.trim(), fin); });
      } else if (que === "sugerir") {
        caja.appendChild(el("p", "margin:0 0 8px", "Un recado para la oficina sobre este olivo o tu haza (una rama partida, un nombre que cambiar…). Sin enlaces ni teléfonos."));
        campo = el("textarea", "width:100%;box-sizing:border-box;font:inherit;padding:8px;border-radius:8px;min-height:90px;background:#0c120e;color:inherit"); campo.maxLength = 1000; campo.setAttribute("aria-label", "Sugerencia");
        caja.appendChild(campo); ok.textContent = "Enviar";
        ok.addEventListener("click", function () {
          var t = campo.value.trim(); if (!t) { msg.textContent = "Escribe qué quieres decir."; return; }
          ocupado(true, "Enviando…"); cli.sugiere(c.haza && c.haza.id, t, c.i.finca, c.i.copas_id).then(function (r) { fin({ ok: r.ok, estado: r.estado, cuerpo: r.cuerpo }); });
        });
      }
      caja.appendChild(msg); fila.appendChild(ok); fila.appendChild(no); caja.appendChild(fila);
      document.body.appendChild(recuadro);
      var primero = campo || caja.querySelector("input,select,button"); if (primero && primero.focus) { try { primero.focus(); } catch (e) {} }
    }
    function enviaDenuncia(id, c, motivo, texto, hecho) {
      if (!c.dato) { if (hecho) hecho({ ok: false, error: P.mensajeError(404, null, "denuncia") }); return; }
      cli.denuncia(c.dato.id, motivo, texto).then(function (r) {
        var res = { ok: r.ok, estado: r.estado, cuerpo: r.cuerpo, error: r.ok ? "" : P.mensajeError(r.estado, r.cuerpo, "denuncia") };
        if (hecho) hecho(res); else avisoVR(r.ok ? "Denuncia enviada: la oficina lo mirará." : res.error);   // en VR no hay recuadro: el resultado queda en estado() y en la ficha siguiente
      });
    }
    function avisoVR(txt) { lastAviso = txt; try { Bus.emite("personalizacion:resultado", { texto: txt }); } catch (e) {} }
    var lastAviso = "";

    // ---- reducir la imagen en el aparato: un canvas, ≤ 1280 px, JPEG 0,85 (la api vuelve a codificar a WebP y quita EXIF y GPS). Devuelve Promise<{ blob, tipo }>
    function reduceImagen(f) {
      var carga = typeof createImageBitmap === "function" ? createImageBitmap(f).catch(function () { return cargaImg(f); }) : cargaImg(f);
      return carga.then(function (im) {
        var w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
        if (!(w > 0 && h > 0) || w * h > P.MAX_FOTO_PX) return null;
        var d = P.reduce(w, h, P.MAX_PX), cv = document.createElement("canvas"); cv.width = d.w; cv.height = d.h;
        var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, d.w, d.h); cx.drawImage(im, 0, 0, d.w, d.h);   // fondo blanco: un PNG con transparencia no sale negro en el JPEG
        if (im.close) im.close();
        return new Promise(function (res) { cv.toBlob(function (b) { cv.width = cv.height = 0; res(b ? { blob: b, tipo: "image/jpeg" } : null); }, "image/jpeg", 0.85); });
      }).catch(function () { return null; });
    }
    function cargaImg(f) {
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(f), im = new Image();
        im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("imagen")); }; im.src = u;
      });
    }

    // ---- el nombre sobre el olivo (DOM; ver «presupuesto» arriba): hasta 12 etiquetas reutilizadas, colocadas con transform cada fotograma solo si hay alguna cerca
    var capa = null, cerca = [];
    function creaCapa() {
      if (capa) return;
      capa = el("div", "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:4;overflow:visible"); capa.setAttribute("id", "rotulosOlivos"); capa.setAttribute("aria-hidden", "true");
      document.body.appendChild(capa);
    }
    function etiqueta(k) {
      if (pool[k]) return pool[k];
      var e = el("div", "position:absolute;left:0;top:0;white-space:nowrap;padding:2px 8px;border-radius:10px;font:600 14px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,0.55);text-shadow:0 1px 2px #000;will-change:transform;display:none");
      capa.appendChild(e); pool[k] = e; return e;
    }
    function ocultaRotulos() { for (var k = 0; k < pool.length; k++) pool[k].style.display = "none"; }
    function eligeCerca() {   // cada 0,4 s: cuáles de los olivos con nombre tocan
      var vr = typeof VRX !== "undefined" && VRX && VRX.on;
      if (!rotulosDe.length || vr) { cerca = []; ocultaRotulos(); return; }
      cerca = P.cercanos(rotulosDe, camera.position.x, camera.position.z, P.CERCA_M, P.MAX_ROTULOS);
      if (cerca.length) { creaCapa(); rect = lienzo.getBoundingClientRect(); }
      for (var k = cerca.length; k < pool.length; k++) pool[k].style.display = "none";
    }
    function colocaRotulos() {   // cada fotograma, solo con algo cerca
      if (!cerca.length || !rect) return;
      var pintados = 0;
      for (var k = 0; k < cerca.length; k++) {
        var q = cerca[k].q, p = Entidades.pos("olivo:" + q.clave), e = etiqueta(k);
        if (!p) { e.style.display = "none"; continue; }
        vec.set(p.x, p.y + 6.2 * exag, p.z).project(camera);
        if (vec.z > 1 || vec.z < -1) { e.style.display = "none"; continue; }
        var sx = (vec.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;
        if (e.textContent !== q.nombre) e.textContent = q.nombre;
        e.style.display = "block"; e.style.opacity = String(Math.max(0.25, 1 - cerca[k].d / P.CERCA_M));
        e.style.transform = "translate(" + Math.round(sx) + "px," + Math.round(sy) + "px) translate(-50%,-100%)"; pintados++;
      }
      contador.rotulos = pintados;
    }

    // ---- la lámina colgada del olivo elegido (1 llamada, 1 textura de 512 px; se libera al soltar)
    function abreLamina(id) {
      var c = contexto(id); cierraLamina();
      if (!c.i || !c.dato || !c.dato.objeto || !c.pos) return;
      var o = c.dato.objeto, ancho = 1.3, alto = Math.max(0.7, Math.min(1.7, ancho * o.alto / o.ancho)), W = 512, H = Math.round(W * (alto + 0.2) / ancho), lid = "personaliza:" + id;
      var im = new Image(); imagen = im; var hecha = false;
      var dx = camera.position.x - c.pos.x, dz = camera.position.z - c.pos.z, dl = Math.hypot(dx, dz) || 1;
      Laminas.abre({ id: lid, ancho: ancho, alto: alto + 0.2, w: W, h: H, nombre: "imagen del olivo",
        en: { x: c.pos.x + dx / dl * 1.2, y: c.pos.y + 2.4 * exag, z: c.pos.z + dz / dl * 1.2 }, cierraA: { vr: 40, pantalla: 80 },
        firma: function () { return (hecha ? "1" : "0") + o.url + (c.dato.nombre || ""); },
        pinta: function (cx, w, h) {
          cx.fillStyle = "#1b231d"; cx.fillRect(0, 0, w, h);
          var ih = h - 40, cw = w - 16;
          if (hecha && im.naturalWidth) { var k = Math.min(cw / im.naturalWidth, ih / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k; cx.drawImage(im, (w - dw) / 2, 8 + (ih - dh) / 2, dw, dh); }
          else { cx.fillStyle = "#e8eee4"; cx.font = "24px system-ui,sans-serif"; cx.textAlign = "center"; cx.fillText("cargando…", w / 2, h / 2); }
          cx.fillStyle = "#e8eee4"; cx.font = "600 22px system-ui,sans-serif"; cx.textAlign = "center"; cx.fillText((c.dato.nombre || "Olivo").slice(0, 40), w / 2, h - 12);
        } });
      laminaDe = lid; contador.laminas++;
      im.onload = function () { hecha = true; if (laminaDe === lid) Laminas.repinta(lid); };
      im.onerror = function () { hecha = false; };
      im.src = o.url;
    }
    function cierraLamina() { if (laminaDe) { Laminas.cierra(laminaDe, "cerrada"); laminaDe = ""; } if (imagen) { imagen.onload = imagen.onerror = null; imagen.src = ""; imagen = null; } }

    // ---- montaje
    quitaCompl = Entidades.complementa("olivo", complementa);
    n.on("usable:elige", function (e) { if (e && P.idOlivo(e.id)) abreLamina(e.id); else cierraLamina(); });
    n.on("usable:suelta", function () { cierraLamina(); });
    cli.sesion().then(function (r) { if (r.ok && r.cuerpo && typeof r.cuerpo.titular === "boolean") titular = r.cuerpo.titular; });
    function actualiza(fase, dt) {
      if (!vivo) return;
      if (fase === "mundo") { colocaRotulos(); return; }
      tarde += dt; tRefresco += dt;
      if (!Object.keys(hazasVistas).length) { if (Hazas.vistas().length && !pidiendo) refrescaTodo(); }   // las hazas llegan después de arrancar: se espera a que estén
      else if (tRefresco >= P.REFRESCO_S && !pidiendo && !laminaDe && !recuadro) { tRefresco = 0; refrescaTodo(); }
      eligeCerca();
    }
    function estado() { return { api: true, titular: titular, hazas: Object.keys(hazasVistas).length, cargadas: cargadas, conNombre: rotulosDe.length, personalizados: Object.keys(mapa).length, rotulos: contador.rotulos, laminas: contador.laminas, lamina: laminaDe, recuadro: !!recuadro, resultado: lastAviso }; }
    function libera() {
      vivo = false; cierraPanel(); cierraLamina();
      if (quitaCompl) { quitaCompl(); quitaCompl = null; }
      if (capa && capa.parentNode) capa.parentNode.removeChild(capa); capa = null; pool = []; cerca = []; mapa = {}; rotulosDe = [];
    }
    window.__personaliza = function () { return estado(); };
    return { actualiza: actualiza, libera: libera, estado: estado };
  }
  // [motor:fin]

  Componentes.registra({
    id: "personalizacion", version: 1,
    consume: ["Entidades", "Usables", "Laminas", "Hazas", "HazasPuro", "VRX"],
    expone: [],
    eventos: { escucha: ["usable:elige", "usable:suelta"], emite: ["personalizacion:resultado"] },
    bandera: { defecto: true, url: "personaliza" },
    // nada en la escena 3D salvo la lámina del olivo elegido (1 llamada, 2 triángulos, una textura de 512 px, liberada al soltar); los nombres son DOM
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 1 },
    fases: { mundo: 0, tarde: 0.4 },
    monta: function (n) { return PersonalizaMotor(n); },
    actualiza: { mundo: function (dt, t, api) { api.actualiza("mundo", dt); }, tarde: function (dt, t, api) { api.actualiza("tarde", dt); } },
    libera: function (api) { if (api) api.libera(); }
  });
