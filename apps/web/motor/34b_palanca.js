// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 03_escena (lienzo, visor, modo), 08_marcadores (aplica), 09_camara (sensMirar),
//   12_paseo (paseando, primera, PalancaPuro, ponPalanca, giraPalanca, actualizaPaseo), 15_tiempo (hace), 16_vida (quad, dron), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- la palanca flotante (EV2-B2, doc/sistema/VIABILIDAD-INTERACCION.md §B): andar con el pulgar, encendida por defecto en pantalla táctil.
  // Nace donde apoyas el dedo (nipplejs 1.0.4, modo «dynamic», MIT; regla 12) en la mitad del pulgar (#palanca en plantilla.html: la izquierda, la derecha con
  // mano zurda); arrastrar la otra mitad gira al paseante. Alimenta el paseo por el camino que ya hay: ponPalanca/giraPalanca de 12_paseo.js, que actualizaPaseo suma al
  // teclado y a la cruceta (la física, los troncos, el quad y el dron son los de siempre). La cuenta (zona muerta, curva, dirección) es PalancaPuro (12_paseo.js).
  // Apagada con el ajuste «controles.palanca» (Configuración → Controles) o con ?palanca=0; en escritorio sin pantalla táctil no aparece (?palanca=1 la fuerza, para probar con ratón).
  // Apagada, o sin paseo, no se descarga nipplejs ni se crea nada: la cruceta de siempre (.pad-mov) sigue ahí. nipplejs se pide con import() la primera vez que hace falta.
  // CSP (infra/Caddyfile: style-src 'self'): nipplejs da estilo a sus elementos con element.style (CSSOM), que la CSP permite; no escribe atributos style= ni <style>.
  (function () {
    var zona = $("palanca"); if (!zona) return;
    var raiz = document.documentElement, joy = null, pidiendo = false, giro = null;
    function quiere() {
      var aj = true; try { aj = Ajustes.lee("controles.palanca"); } catch (e) {}
      var tac = false; try { tac = Ajustes.tactil(); } catch (e) {}
      return PalancaPuro.activa(tac, aj, location.search);
    }
    function apaga() { if (joy) { try { joy.destroy(); } catch (e) {} joy = null; } ponPalanca(0, 0); }
    function enciende() {
      if (joy || pidiendo) return; pidiendo = true;
      import("nipplejs").then(function (m) {
        pidiendo = false; if (joy || !quiere()) return;
        var nip = m.default || m; joy = nip.create({ zone: zona, mode: "dynamic", multitouch: false, size: 120, color: "#ffffff", restOpacity: 0.55, fadeTime: 120, threshold: 0.05 });
        joy.on("move", function (e) { var d = e && e.data, v = d && d.vector ? PalancaPuro.lee(d.vector.x, d.vector.y) : null; if (v) ponPalanca(v.av, v.lat); });   // nipplejs 1.0: un solo argumento, los datos en e.data (en 0.x eran (e, datos))
        joy.on("end", function () { ponPalanca(0, 0); });
      }).catch(function () { pidiendo = false; raiz.setAttribute("data-palanca", "no"); });   // si no carga, vuelve la cruceta: nunca sin mando
    }
    function aplica() {
      var q = quiere(); raiz.setAttribute("data-palanca", q ? "si" : "no");
      if (q && paseando) enciende(); else if (!q) apaga();
    }
    aplica();
    try { Ajustes.alCambiar(function (c) { if (c === "controles.palanca" || c === "controles.tactil") aplica(); }); } catch (e) {}
    try { matchMedia("(pointer: coarse)").addEventListener("change", aplica); } catch (e) {}
    // al empezar o dejar de pasear, venga de donde venga (el botón, ir andando a un punto, entrar en VR, el selector de modo): el visor cambia su clase «paseo»
    function alPasear() { if (paseando) { if (quiere()) enciende(); } else ponPalanca(0, 0); }
    if (typeof MutationObserver !== "undefined" && typeof visor !== "undefined" && visor) new MutationObserver(alPasear).observe(visor, { attributes: true, attributeFilter: ["class"] });
    $("btnPaseo").addEventListener("click", function () { setTimeout(alPasear, 0); });
    // mirar: arrastrar el dedo por la otra mitad (la que no es de la palanca); el toque corto sigue eligiendo lo que haya debajo (09_camara.js)
    function esMitadDelGiro(x) { var r = lienzo.getBoundingClientRect(), izq = x < r.left + r.width / 2; return raiz.getAttribute("data-mano") === "zurda" ? izq : !izq; }
    lienzo.addEventListener("pointerdown", function (e) {
      if (!paseando || raiz.getAttribute("data-palanca") !== "si" || giro) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (esMitadDelGiro(e.clientX)) giro = { id: e.pointerId, x: e.clientX };
    });
    lienzo.addEventListener("pointermove", function (e) { if (giro && e.pointerId === giro.id) { giraPalanca(PalancaPuro.giro(e.clientX - giro.x, sensMirar().k)); giro.x = e.clientX; } });
    ["pointerup", "pointercancel"].forEach(function (ev) { lienzo.addEventListener(ev, function (e) { if (giro && e.pointerId === giro.id) giro = null; }); });
  })();
