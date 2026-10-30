// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Capas
// Consume: 01_datos ($), 02_mundo (copas), 08_marcadores (capas), 14_historia (lista), 16_vida (quita)
// ===============================================================================
  // ---------- punto de extensión de las capas del mundo (ADR-0023, C2): Capas.registra(def) pone una casilla en la ventana «Capas y vista», en el grupo
  // «Datos» o «Ambiente», con la pastilla de su procedencia (regla 5 del repo: medido, deducido o ilustrativo; sin ella no se registra) y la llama al
  // encenderla y apagarla. def = { id, nombre, procedencia, grupo?: "datos"|"ambiente", activa?: bool, color?: CSS, nota?, alterna(on) }. Devuelve quita
  // (saca la casilla; si estaba encendida, la apaga antes). Las casillas de la plantilla (linde, copas, NDVI, paisaje…) siguen como estaban.
  // [puro:inicio] (sin DOM: lo evalúa en Node pruebas/guardianes/componentes.test.js)
  var CapasPuro = (function () {
    var PROC = ["medido", "deducido", "ilustrativo"], GRUPOS = ["datos", "ambiente"];
    function valida(d) {
      var e = [];
      if (!d || typeof d !== "object") return ["la capa no es un objeto"];
      if (typeof d.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(d.id)) e.push("id: minúsculas, cifras y guiones");
      if (typeof d.nombre !== "string" || !d.nombre.trim()) e.push("nombre: texto");
      if (PROC.indexOf(d.procedencia) < 0) e.push("procedencia: medido, deducido o ilustrativo (regla 5)");
      if (d.grupo !== undefined && GRUPOS.indexOf(d.grupo) < 0) e.push("grupo: datos o ambiente");
      if (typeof d.alterna !== "function") e.push("alterna(on): función");
      return e;
    }
    return { PROC: PROC, GRUPOS: GRUPOS, valida: valida };
  })();
  // [puro:fin]
  var Capas = (function () {
    var reg = {};
    function grupo(nombre) {   // el <div> que sigue al <h3> «Datos» o «Ambiente» de la ventana de capas
      var v = $("ventanaCapas"), hs = v ? v.querySelectorAll("h3") : [];
      for (var i = 0; i < hs.length; i++) if (hs[i].textContent.trim().toLowerCase() === nombre) { var n = hs[i].nextElementSibling; while (n && n.tagName !== "DIV") n = n.nextElementSibling; if (n) return n; }
      return v ? v.querySelector(".cuerpo") : null;
    }
    function registra(d) {
      var e = CapasPuro.valida(d); if (!e.length && (reg[d.id] || $("capa-" + d.id))) e = ["id repetido: " + d.id];
      if (e.length) { try { console.error("[Capas] " + (d && d.id) + ": " + e.join("; ")); } catch (er) {} return null; }
      var casa = grupo(d.grupo || "datos"); if (!casa) return null;
      var l = document.createElement("label"), i = document.createElement("input"), pu = document.createElement("span"), pi = document.createElement("span");
      l.className = "capa"; i.type = "checkbox"; i.id = "capa-" + d.id; i.checked = !!d.activa;
      pu.className = "punto"; pu.style.background = d.color || "var(--line)"; pi.className = "pill p-" + d.procedencia; pi.textContent = d.procedencia;
      l.appendChild(i); l.appendChild(pu); l.appendChild(document.createTextNode(d.nombre + " ")); l.appendChild(pi);
      if (d.nota) l.title = d.nota;
      casa.appendChild(l);
      function cambia() { try { d.alterna(i.checked); } catch (er) { try { console.error("[Capas] " + d.id, er); } catch (e2) {} } }
      i.addEventListener("change", cambia); if (i.checked) cambia();
      reg[d.id] = { d: d, l: l, i: i };
      return function () { if (i.checked) { i.checked = false; cambia(); } if (l.parentNode) l.parentNode.removeChild(l); delete reg[d.id]; };
    }
    function lista() { return Object.keys(reg).map(function (k) { return { id: k, nombre: reg[k].d.nombre, procedencia: reg[k].d.procedencia, activa: reg[k].i.checked }; }); }
    return { registra: registra, lista: lista };
  })();
