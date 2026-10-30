// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: OT, hist, VIVO, FINCA, marca, dd, tabla, lista, nMarc, sw, avTipo, pintaAvance, rango, aviso
// Consume: 01_datos (D, $, fmt), 02_mundo (suelo, orto, copas, cIn, marc, med), 03_escena (scene, exag), 05_nube (nube),
//   08_marcadores (aplica, pendiente), 09_camara (objetivo, orb, pon), 10_ndvi (NDV, ndviIdx, pintaNdvi),
//   12_paseo (paseando, persona, primera, salePaseo), 13_parcelas (parcelas, fincas, claseUsda, elegirParcela, elegirFinca), 15_tiempo (ins),
//   16_vida (esfera, mira), 18_paisaje (postes, cable), 21_suelo (cubierta), 22_huellas (hSig), 29_vr (panel), 90_final (cuadro)
// ===============================================================================
  // ---------- la historia: un recorrido guiado que cruza el gemelo con lo que sabe OlivarTrack
  // Los datos de OlivarTrack son la instantánea que trae el índice (D.ot): el navegador no lee en vivo (decisión 79, sin conector de claude.ai).
  // Una lectura en vivo pediría una ruta de la api (tarea anotada); VIVO queda en null y lo sigue leyendo 19_balizas. Los textos se calculan siempre de los datos.
  var OT = D.ot, hist = -1, overlays = [], VIVO = null;
  var FINCA = "Cerro Velasco";
  var COL = { ok: 0x2e8b3d, atencion: 0xe0a030, nada: 0x8a8a8a, pase: 0x3b82c4 }, PALETA = [0x2e8b3d, 0xd98c2b, 0x3b82c4, 0x8e5bc4, 0xc4504a];
  function creaOverlay(k) {  // la parcela pegada al terreno (retícula de 2 m sobre el relieve); se construye la primera vez que se resalta
    var poly = parcelas[k].linde, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, PA = 2;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    function dentro(x, y) { var ins = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { if (((poly[i][1] > y) !== (poly[j][1] > y)) && (x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1] + 1e-12) + poly[i][0])) ins = !ins; } return ins; }
    var ia = Math.floor(minx / PA) - 1, ib = Math.ceil(maxx / PA) + 1, ja = Math.floor(miny / PA) - 1, jb = Math.ceil(maxy / PA) + 1, nx = ib - ia + 1, ny = jb - ja + 1, pos = new Float32Array(nx * ny * 3), arr = [];
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) { var x = (ia + i) * PA, y = (jb - j) * PA, o = (j * nx + i) * 3; pos[o] = x; pos[o + 1] = suelo(x, y) + 0.15; pos[o + 2] = -y; }   // filas de norte a sur
    for (var j2 = 0; j2 < ny - 1; j2++) for (var i2 = 0; i2 < nx - 1; i2++) {
      if (!dentro((ia + i2 + 0.5) * PA, (jb - j2 - 0.5) * PA)) continue;
      var a = j2 * nx + i2, b = a + 1, c = a + nx, d = c + 1; arr.push(a, c, b, b, c, d);
    }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(Uint32Array.from(arr), 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3((minx + maxx) / 2, 40, -(miny + maxy) / 2), Math.hypot(maxx - minx, maxy - miny) / 2 + 400);
    var m = overlays[k]; m.geometry.dispose(); m.geometry = g; m.userData.listo = true;
  }
  parcelas.forEach(function (pr, k) {   // una malla vacía por parcela; la geometría llega al resaltarla. Sigue la exageración vertical con el mismo uniforme del terreno
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mat.onBeforeCompile = function (sh) { sh.uniforms.uExag = UN.uExag; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uExag;").replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.y *= uExag;"); };
    var m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.frustumCulled = false; m.renderOrder = 3; m.visible = false; scene.add(m); overlays.push(m);
  });
  function resalta(mapa) { overlays.forEach(function (m, k) { if (mapa && mapa[k] !== undefined) { if (!m.userData.listo) creaOverlay(k); m.material.color.setHex(mapa[k]); m.visible = true; } else m.visible = false; }); }
  function marca(id, v) { var e = $(id); if (e.checked !== v) { e.checked = v; e.dispatchEvent(new Event("change")); } }
  function vistaDe(k, az, el, f) { elegirParcela(k); orb.az = az; orb.el = el; orb.dist = orb.dist * f; }
  function ndviEn(iso) { // la imagen Sentinel-2 más cercana a esa fecha
    var best = 0, bd = 1e12; NDV.fechas.forEach(function (f, i) { var d = Math.abs(new Date(f) - new Date(iso)); if (d < bd) { bd = d; best = i; } });
    ndviIdx = best; $("ndviSel").value = best; marca("cNdvi", true); pintaNdvi();
  }
  function dd(iso) { return iso ? iso.split("-").reverse().join("/") : "–"; }
  function tabla(cab, filas) {
    var h = '<table class="h-tabla"><thead><tr>' + cab.map(function (c, i) { return '<th' + (i ? ' class="n"' : "") + ">" + c + "</th>"; }).join("") + "</tr></thead><tbody>";
    filas.forEach(function (f) { h += "<tr" + (f.cls ? ' class="' + f.cls + '"' : "") + ">" + f.c.map(function (c, i) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; });
    return h + "</tbody></table>";
  }
  var lista = function (a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1]; };
  function tareasDe(k, tipo) { var e = OT.parcelas[parcelas[k].id]; return e ? e.tareas.filter(function (t) { return !tipo || t.tipo === tipo; }) : []; }
  var hechasDe = function (k, tipo) { return tareasDe(k, tipo).filter(function (t) { return t.estado === "completado"; }); };
  var nMarc = function (k) { return marc.filter(function (m) { return m.parc === k; }).length; };
  var nLidar = function (k) { return cIn.filter(function (c) { return c.parc === k; }).length; };
  var nAnd = function (k) { var t = hechasDe(k, "varetas")[0]; return t && t.andados != null ? t.andados : null; };
  var sw = function (k) { return '<i class="h-sw" style="background:#' + PALETA[k].toString(16).padStart(6, "0") + '"></i>'; };
  var volCopa = function (c) { var rm = c.perfil.reduce(function (a, b) { return a + b; }, 0) / 8; return (2 / 3) * Math.PI * rm * rm * Math.max(c.h - 1.2, 0.5); };
  var minMax = function (a) { var s = a.slice().sort(); return [s[0], s[s.length - 1]]; };
  function resumenConteo() { // la lectura sale de los datos, no de un texto fijo
    var d = parcelas.map(function (p, k) { var a = nMarc(k); return a ? Math.round((nLidar(k) - a) / a * 100) : 0; });
    var sumM = 0, sumL = 0; parcelas.forEach(function (p, k) { sumM += nMarc(k); sumL += nLidar(k); });
    var grandes = parcelas.map(function (p, k) { return { n: p.nombre, d: d[k] }; }).filter(function (x) { return x.d <= -10; });
    var tot = Math.round((sumL - sumM) / sumM * 100);
    return "<p>En el conjunto de la finca el LiDAR ve <strong>" + fmt(sumL) + " copas frente a " + fmt(sumM) + " marcados (" + tot + " %)</strong>. " +
      (grandes.length ? "Las diferencias mayores están en <strong>" + grandes.map(function (x) { return x.n + " (" + x.d + " %)"; }).join(" y ") + "</strong>. " : "") +
      "Puede ser que copas que se tocan cuenten como una sola, o que haya marcas de olivos que ya no están: son sitios a mirar, no un veredicto.</p>";
  }
  function origenDatos() { return OT.fuente === "vivo" ? "<p class='h-nota'>Leído en vivo de OlivarTrack el " + dd(OT.fecha_consulta) + ".</p>" : "<p class='h-nota'>Instantánea de OlivarTrack del " + dd(OT.fecha_consulta) + ".</p>"; }

  // ---------- avance árbol a árbol (prototipo): el estado de una tarea sobre cada olivo, sin personas
  var AV = D.avance, avTipo = null, gAvance = new THREE.Group(); gAvance.visible = false; scene.add(gAvance);
  var cAv = { ok: new THREE.Color(0x2e8b3d), no: new THREE.Color(0xd23a2a), sin: new THREE.Color(0x8e5bc4) };
  var anilloAv = new THREE.RingGeometry(0.5, 0.9, 20); anilloAv.rotateX(-Math.PI / 2);
  var mAvAnillo = new THREE.InstancedMesh(anilloAv, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), marc.length + 1);
  var mAvBaliza = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd23a2a }), marc.length + 1);
  var mAvSin = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0x8e5bc4 }), copas.length + 1);
  [mAvAnillo, mAvBaliza, mAvSin].forEach(function (m) { m.frustumCulled = false; gAvance.add(m); });   // r151: la esfera de una InstancedMesh se calcula una vez; estas se rehacen al cambiar de tarea
  function pintaAvance(tipo) {
    avTipo = tipo; if (!tipo || !AV) { gAvance.visible = false; return; }
    var ms = AV.marcas[tipo], cs = AV.copas[tipo], na = 0, nb = 0, ns = 0, o = new THREE.Object3D();
    marc.forEach(function (m, i) {
      var e = ms.charAt(i); if (e !== "1" && e !== "0") return; var gz = suelo(m.x, m.y);
      o.position.set(m.x, (gz + 0.5) * exag, -m.y); o.scale.set(1.5, 1.5, 1.5); o.updateMatrix(); mAvAnillo.setMatrixAt(na, o.matrix); mAvAnillo.setColorAt(na, e === "1" ? cAv.ok : cAv.no); na++;
      if (e === "0") { o.position.set(m.x, (gz + 4) * exag, -m.y); o.scale.set(1, 1, 1); o.updateMatrix(); mAvBaliza.setMatrixAt(nb++, o.matrix); }
    });
    copas.forEach(function (c, i) { if (cs.charAt(i) !== "2" || !c.oliv) return; o.position.set(c.x, (suelo(c.x, c.y) + c.h + 1.6) * exag, -c.y); o.scale.set(1, 1, 1); o.updateMatrix(); mAvSin.setMatrixAt(ns++, o.matrix); });
    mAvAnillo.count = na; mAvBaliza.count = nb; mAvSin.count = ns;
    [mAvAnillo, mAvBaliza, mAvSin].forEach(function (m) { m.instanceMatrix.needsUpdate = true; }); if (mAvAnillo.instanceColor) mAvAnillo.instanceColor.needsUpdate = true;
    gAvance.visible = true;
  }
  var cuentaAv = function (k, tipo) { return AV && AV.cuentas[String(k)] && AV.cuentas[String(k)][tipo]; };

  var ESCENAS_C = [
    { t: "Una finca, cinco parcelas", fuente: "OlivarTrack · fincas y olivosParcela",
      ir: function () { pon("nube"); marca("cLinde", true); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); marca("cSolo", false); vistaDe(-1, -0.55, 0.62, 1); var m = {}; parcelas.forEach(function (p, k) { m[k] = PALETA[k]; }); resalta(m); },
      html: function () {
        var tot = parcelas.reduce(function (a, p) { return a + p.ha; }, 0), nm = marc.length;
        return "<p>La finca Cerro Velasco, de Cano &amp; Damas, ocupa <strong>" + fmt(tot, 1) + " ha</strong> repartidas en cinco parcelas, con <strong>" + fmt(nm) + " olivos marcados</strong> en OlivarTrack. Lo que ves es un gemelo: la forma sale de los puntos del vuelo LiDAR de 2024 (9 por m²) y el color, de la ortofoto del PNOA.</p>" +
          tabla(["Parcela", "ha", "Olivos"], parcelas.map(function (p, k) { return { c: [sw(k) + p.nombre, fmt(p.ha, 2), fmt(nMarc(k))] }; })) +
          "<p class='h-nota'>A partir de aquí cada escena cruza este modelo con algo que OlivarTrack ya sabe.</p>"; } },

    { t: "Tres formas de contar los olivos", fuente: "OlivarTrack · olivosParcela · trabajos (olivos andados) · LiDAR 2024",
      ir: function () { pon("nube"); marca("cCopas", true); marca("cMarc", true); marca("cLinde", true); vistaDe(-1, -0.4, 0.72, 0.8); var m = {}; parcelas.forEach(function (p, k) { var a = nMarc(k); if (a && Math.round((nLidar(k) - a) / a * 100) <= -10) m[k] = COL.atencion; }); resalta(m); },
      html: function () {
        var filas = parcelas.map(function (p, k) { var a = nMarc(k), l = nLidar(k), d = a ? Math.round((l - a) / a * 100) : 0, an = nAnd(k);
          return { cls: d <= -10 ? "h-aviso" : "", c: [p.nombre, fmt(a), an == null ? "–" : fmt(an), fmt(l), (d > 0 ? "+" : "") + d + " %"] }; });
        return "<p>OlivarTrack cuenta los olivos de tres maneras: los <strong>marcados</strong> sobre la ortofoto, los <strong>andados</strong> en la jornada de desvarete y, ahora, las <strong>copas</strong> que ve el LiDAR.</p>" +
          tabla(["Parcela", "Marcados", "Andados", "LiDAR", "Dif."], filas) + resumenConteo() +
          "<p class='h-nota'>Las copas del LiDAR no incluyen postes ni cables (todo lo que pasa de 7,5 m), que antes sumaban copas falsas.</p>" + origenDatos(); } },

    { t: "Por qué tus marcas caen 1,5 m al este", fuente: "OlivarTrack · olivosParcela · detectarOlivos · ortofoto PNOA",
      ir: function () { pon("orto"); marca("cCopas", true); marca("cMarc", true); marca("cDesf", true); marca("cLinde", true); resalta({}); vistaDe(0, -0.2, 1.05, 0.5); },
      html: function () {
        var filas = parcelas.map(function (p) { var d = p.desfase; return { c: [p.nombre, fmt(Math.hypot(d[0], d[1]), 2) + " m"] }; });
        var ds = parcelas.map(function (p) { return Math.hypot(p.desfase[0], p.desfase[1]); });
        return "<p>Las copas del LiDAR aparecen siempre <strong>entre " + fmt(Math.min.apply(null, ds), 1) + " y " + fmt(Math.max.apply(null, ds), 1) + " m al oeste</strong> de tus marcas, en las cinco parcelas. No es un error del LiDAR ni del panel: las marcas se pusieron sobre la ortofoto del PNOA, que muestra cada copa corrida hacia el este cuanto más alta es (unos 1,2 m a 1 m de altura y unos 2,5 m a 4 m).</p>" +
          tabla(["Parcela", "Desfase medio"], filas) +
          "<p class='h-decision'><strong>Propuesta para OlivarTrack:</strong> guardar con cada olivo, además del punto marcado, su posición sobre el terreno ya corregida, y usarla para cruzar con LiDAR, NDVI y Vigía.</p>"; } },

    { t: "El desvarete, parcela a parcela", fuente: "OlivarTrack · trabajo_realizado (MCP) · trabajos",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); var m = {}; parcelas.forEach(function (p, k) { m[k] = hechasDe(k, "varetas").length ? COL.ok : COL.nada; }); resalta(m); vistaDe(-1, -0.5, 0.68, 0.9); },
      html: function () {
        var hechas = parcelas.map(function (p, k) { return { k: k, t: hechasDe(k, "varetas")[0] }; }).filter(function (x) { return x.t; });
        var filas = parcelas.map(function (p, k) { var t = hechasDe(k, "varetas")[0]; if (!t) return { cls: "h-aviso", c: [p.nombre, "sin dato", "–", "–"] };
          return { c: [p.nombre, dd(t.fecha), t.andados != null ? fmt(t.andados) + " / " + fmt(t.objetivo) : "anotado a mano", t.avance != null ? fmt(t.avance) + " %" : "–"] }; });
        var fe = hechas.length ? minMax(hechas.map(function (x) { return x.t.fecha; })) : null;
        var cortas = hechas.filter(function (x) { return x.t.andados != null && x.t.objetivo != null && x.t.andados < x.t.objetivo; });
        return "<p>" + (fe ? "Entre el <strong>" + dd(fe[0]) + "</strong> y el <strong>" + dd(fe[1]) + "</strong> se completó el desvarete en <strong>" + hechas.length + " de las " + parcelas.length + " parcelas</strong>. La fecha es la de finalización en OlivarTrack, no la prevista." : "OlivarTrack no tiene ningún desvarete completado en esta finca.") + "</p>" +
          tabla(["Parcela", "Completado", "Olivos andados", "Avance"], filas) +
          (cortas.length ? "<p>" + cortas.map(function (x) { return "<strong>" + parcelas[x.k].nombre + "</strong> cerró al " + fmt(x.t.avance) + " %: " + fmt(x.t.andados) + " de " + fmt(x.t.objetivo) + " olivos andados"; }).join("; ") + ". Los que faltan son una pista de qué mirar antes de dar la parcela por cerrada.</p>" : "") +
          (OT.fuente === "vivo" ? "<p class='h-nota'>El MCP no trae la parcela de cada trabajo: aquí se asigna por el número de olivos objetivo, que en esta finca es distinto en cada parcela.</p>" : "") + origenDatos(); } },

    { t: "Riego: goteros y una tarea abierta", fuente: "OlivarTrack · trabajo_realizado y tareas_abiertas (MCP) · Hoy › Atención",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); var m = {}; parcelas.forEach(function (p, k) { var ab = tareasDe(k, "riego").some(function (t) { return t.estado !== "completado"; }); m[k] = ab ? COL.atencion : (hechasDe(k, "riego").length ? COL.ok : COL.nada); }); resalta(m); var ka = -1; parcelas.forEach(function (p, k) { if (tareasDe(k, "riego").some(function (t) { return t.estado !== "completado"; })) ka = k; }); vistaDe(ka >= 0 ? ka : -1, -0.5, 0.65, ka >= 0 ? 1.25 : 0.9); },
      html: function () {
        var g = []; parcelas.forEach(function (p, k) { hechasDe(k, "riego").forEach(function (t) { if (/gotero/i.test(t.titulo || "")) g.push({ k: k, t: t }); }); });
        var ab = []; parcelas.forEach(function (p, k) { tareasDe(k, "riego").forEach(function (t) { if (t.estado !== "completado") ab.push({ k: k, t: t }); }); });
        var sin = parcelas.filter(function (p, k) { return !g.some(function (x) { return x.k === k; }); }).map(function (p) { return p.nombre; });
        var fe = g.length ? minMax(g.map(function (x) { return x.t.fecha; })) : null, pc = g.map(function (x) { return x.t.avance; }).filter(function (v) { return v != null; });
        return (g.length ? "<p>Los <strong>goteros se sustituyeron en " + g.length + " parcelas</strong>, completados entre el " + dd(fe[0]) + " y el " + dd(fe[1]) + (pc.length ? " (del " + Math.min.apply(null, pc) + " al " + Math.max.apply(null, pc) + " % de los olivos)" : "") + (sin.length ? "; no consta en " + lista(sin) : "") + ".</p>" : "<p>No hay cambios de goteros completados en esta finca.</p>") +
          (ab.length ? ab.map(function (x) { return "<p>En <strong>" + parcelas[x.k].nombre + "</strong> sigue abierta, desde el " + dd(x.t.fecha) + " y al " + fmt(x.t.avance || 0) + " %, la tarea «" + x.t.titulo + "».</p>"; }).join("") : "<p>No hay tareas de riego abiertas.</p>") +
          "<p class='h-nota'>En el panel, una tarea abierta sale en Hoy › Atención; aquí se ve <em>dónde</em> está: la parcela en ámbar.</p>" + origenDatos(); } },

    { t: "Árbol a árbol: los olivos que faltan (prototipo)", fuente: "OlivarTrack · trabajos y zonas recorridas de los partes · estado por olivo, sin personas",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); resalta({ 1: COL.atencion }); vistaDe(1, -0.45, 0.85, 0.85); pintaAvance("goteros"); },
      alMostrar: function () { var b = $("hTexto").querySelectorAll("[data-av]"); for (var i = 0; i < b.length; i++) b[i].addEventListener("click", function (e) { var t = e.currentTarget.getAttribute("data-av"); pintaAvance(t === "ninguno" ? null : t); }); },
      html: function () {
        var filas = [], fuera = [], sinMarca = 0, ko = [];
        parcelas.forEach(function (p, k) { var c = cuentaAv(k, "goteros"); if (!c || !c.reproduce) return; var nf = c.marcas - c.marcas_en_zona;
          filas.push({ cls: nf ? "h-aviso" : "", c: [p.nombre, fmt(c.marcas), fmt(c.marcas_en_zona), fmt(nf), fmt(c.copas_sin_marca)] });
          if (nf) fuera.push({ k: k, nf: nf, conCopa: c.no_andadas_con_copa }); sinMarca += c.copas_sin_marca; });
        var d = cuentaAv(2, "varetas");
        var txtFuera = fuera.length ? fuera.map(function (x) { return "<strong>" + parcelas[x.k].nombre + "</strong>: " + x.nf + " marcas fuera de la zona, " + (x.conCopa === 0 ? "ninguna con copa en el LiDAR" : x.conCopa + " con copa en el LiDAR"); }).join("; ") + "." : "Todas las marcas están dentro de la zona recorrida.";
        return "<p>Hoy OlivarTrack da el avance de una tarea como una cifra. Si cada olivo tuviera un identificador, se podría pintar <strong>cuál sí y cuál no</strong>. Aquí cada olivo recibe el estado de la tarea según si su marca cae dentro de la zona recorrida que se guardó al validar el parte: la misma regla con la que OlivarTrack cuenta los olivos andados.</p>" +
          "<p><span class='h-bola' style='background:#2e8b3d'></span>andado · <span class='h-bola' style='background:#d23a2a'></span>fuera de la zona (con baliza roja) · <span class='h-bola' style='background:#8e5bc4'></span>copa del LiDAR sin una marca a menos de 3 m</p>" +
          "<p>Tarea: <button type='button' class='h-btn' data-av='goteros'>Sustituir goteros</button> <button type='button' class='h-btn' data-av='ninguno'>Quitar</button></p>" +
          tabla(["Parcela", "Marcas", "En zona", "Fuera", "Copas sin marca"], filas) +
          "<p>" + txtFuera + " Es decir: <strong>los olivos que faltan en Nave podrían ser marcas sin árbol</strong>; hay que mirarlo en el campo, no darlo por hecho.</p>" +
          (d && !d.reproduce ? "<p class='h-aviso-t'><strong>Una discrepancia para revisar:</strong> el desvarete de Canario figura como " + fmt(d.declarados) + " de " + fmt(d.objetivo) + " olivos, pero las zonas guardadas en sus partes cubren solo " + fmt(d.marcas_en_zona) + " marcas. No se pinta porque no se puede reproducir.</p>" : "") +
          "<p class='h-decision'><strong>Propuesta para el MCP:</strong> una herramienta <code>olivos_andados_de_la_tarea</code>, calculada en el servidor, que devuelva ids de olivo y estado, sin ninguna persona; y un identificador estable por olivo en <code>olivosParcela</code>. Del dato solo sale un estado por olivo y tarea, no las zonas ni quién las recorrió.</p>" +
          "<p class='h-nota'>«Copa sin marca» significa que el LiDAR ve una copa sin marca a menos de 3 m; puede ser un olivo sin marcar o una copa partida en dos.</p>"; } },

    { t: "Fenología: el fruto en agosto", fuente: "OlivarTrack · novedades › fenologia.registrada (MCP) · Vigía (capa de vigor)",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); var fs = []; parcelas.forEach(function (p) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f) { fs.push(f.fecha); }); }); ndviEn(fs.length ? minMax(fs)[0] : "2026-08-27"); var m = {}; parcelas.forEach(function (p, k) { var e = OT.parcelas[p.id]; m[k] = e && e.fenologia.length ? COL.ok : COL.nada; }); resalta(m); vistaDe(-1, -0.5, 0.68, 0.9); },
      html: function () {
        var filas = parcelas.map(function (p) { var e = OT.parcelas[p.id], f = e && e.fenologia[e.fenologia.length - 1]; return { cls: f ? "" : "h-aviso", c: [p.nombre, f ? dd(f.fecha) : "sin dato", f ? "BBCH " + f.bbch : "–"] }; });
        var con = filas.filter(function (f) { return !f.cls; }).length, sinN = parcelas.filter(function (p) { var e = OT.parcelas[p.id]; return !(e && e.fenologia.length); }).map(function (p) { return p.nombre; });
        var bb = []; parcelas.forEach(function (p) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f) { bb.push(f.bbch); }); });
        return "<p><strong>" + con + " de " + parcelas.length + " parcelas</strong> tienen fenología registrada" + (bb.length ? " (BBCH " + minMax(bb.map(function (b) { return String(b); })).join("-") + "; el 75 es el fruto al 50 % de su tamaño final)" : "") + (sinN.length ? ". <strong>" + lista(sinN) + "</strong> no tienen ninguna, y el gemelo lo enseña en gris" : "") + ".</p>" +
          tabla(["Parcela", "Fecha", "Estado"], filas) +
          "<p>Debajo, el NDVI de Sentinel-2 más cercano (" + dd(NDV.fechas[ndviIdx]) + "): vigor medio de la finca " + fmt(NDV.media[ndviIdx], 2) + ". La escala es relativa dentro de la finca, como en Vigía.</p>" + origenDatos(); } },

    { t: "Vigor: ¿dónde mirar hoy?", fuente: "Vigía · estado_del_olivar_hoy (MCP) · Sentinel-2",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); ndviEn(NDV.fechas[NDV.fechas.length - 1]); marca("cTinte", true); resalta({}); vistaDe(-1, -0.45, 0.5, 0.75); },
      html: function () {
        var v = VIVO && VIVO.vigia, nombres = parcelas.map(function (p) { return p.nombre.toLowerCase(); });
        var propia = v ? v.filter(function (x) { var n = String(x.parcela || "").toLowerCase(); return nombres.some(function (m) { return m === n || n.indexOf(m) >= 0 || m.indexOf(n) >= 0; }); }) : [];
        var vig = !v ? "<p>Vigía mira cada día toda la explotación y marca las parcelas que se desvían del resto. Este recorrido no la lee en vivo.</p>"
          : "<p>Vigía, que mira toda la explotación, <strong>hoy marca " + v.length + " " + (v.length === 1 ? "parcela" : "parcelas") + "</strong>" + (propia.length ? ", y " + lista(propia.map(function (x) { return "<strong>" + x.parcela + "</strong> (" + x.gravedad + ")"; })) + " es de esta finca" : ", ninguna de esta finca") + (VIVO.vigiaFrescura ? " (dato de las " + VIVO.vigiaFrescura + ")" : "") + ".</p>";
        return "<p>Última imagen Sentinel-2: <strong>" + dd(NDV.fechas[NDV.fechas.length - 1]) + "</strong>. Las copas toman el tono del vigor de su zona (marrón, menos; verde, más), con la escala relativa de esa fecha.</p>" + vig +
          "<p>Cruzar las dos miradas sirve para decidir dónde ir, no para decir que algo está enfermo: ninguna capa está calibrada con observación de campo. A 10 m, cada cuadro cubre varios olivos; es el vigor de una zona, no de un árbol.</p>"; } },

    { t: "Del albarán al pase de abonado", fuente: "MCP · proponer_abono · proponer_pase (Oficultor) · ejemplo ilustrativo",
      ir: function () { pon("gem"); marca("cNdvi", false); marca("cTinte", false); marca("cCopas", false); marca("cMarc", false); resalta({ 2: COL.pase }); vistaDe(2, -0.4, 0.75, 1.15); },
      html: function () {
        var ha = parcelas[2].ha, cubas = Math.ceil(ha * 1000 / 2000), cubren = cubas * 2000 / 1000;
        var np = VIVO && VIVO.pasesFinca != null ? VIVO.pasesFinca : OT.pases_finca;
        return "<p>Le das a Claude (o a Oficultor) un albarán y le pides el pase en esta parcela. Con el MCP de OlivarTrack, el abono y el pase nacen como <strong>propuesta</strong>: ninguno se aplica solo.</p>" +
          '<div class="h-pase"><div class="h-pase-cab"><strong>Pase en borrador · Canario · ' + fmt(ha, 2) + ' ha</strong><span class="h-pill">propuesto por el agente</span></div>' +
          tabla(["Abono", "Albarán", "Por cuba"], [{ c: ["Calcio foliar 15", "40 L", fmt(40 / cubas) + " L"] }, { c: ["Boro 10", "8 kg", fmt(8 / cubas) + " kg"] }]) +
          "<p class='h-nota'>" + cubas + " cubas de 2.000 L a 1.000 L/ha cubren " + fmt(cubren) + " ha y la parcela tiene " + fmt(ha, 2) + ": aviso, no error (puede haber una cuba a medias). La <strong>dosis por hectárea queda vacía</strong> y el abono, sin validar: la oficina completa ambas en el panel antes de aplicar.</p></div>" +
          "<p class='h-nota'>Ejemplo ilustrativo con datos inventados. " + (np === 0 ? "OlivarTrack no tiene hoy ningún pase de esta finca." : "OlivarTrack tiene " + np + " pase(s) de esta finca.") + "</p>"; } },

    { t: "La campaña, árbol a árbol (propuesta)", fuente: "OlivarTrack · aforo_y_avance_de_recoleccion · orden_de_recoleccion",
      ir: function () { pon("nube"); marca("cNdvi", false); marca("cTinte", false); resalta({}); vistaDe(-1, -0.5, 0.66, 0.85); },
      html: function () {
        var filas = parcelas.map(function (p, k) { var cs = cIn.filter(function (c) { return c.parc === k; }); var v = cs.length ? cs.reduce(function (a, c) { return a + volCopa(c); }, 0) / cs.length : 0;
          return { c: [p.nombre, fmt(med(cs.map(function (c) { return c.h; })), 1) + " m", fmt(v)] }; });
        return "<p>Todo lo anterior mira el pasado y el presente. El gemelo permite una unidad más fina: <strong>el olivo</strong>. Con el volumen de copa de cada árbol se puede estimar el aforo, ordenar la recolección o pintar sobre el modelo qué árboles ya se han recogido.</p>" +
          tabla(["Parcela", "Altura", "Copa media (m³)"], filas) +
          "<p class='h-nota'>El volumen de copa es un indicador geométrico aproximado, sin calibrar con producción: haría falta contrastarlo con las entregas de esta campaña. " + (OT.entregas_finca === 0 ? "En la instantánea, OlivarTrack no tiene ninguna entrega de esta finca." : "") + "</p>"; } },

    { t: "Qué conecta con OlivarTrack", fuente: "MCP · API de referencia · Vigía",
      ir: function () { pon("nube"); marca("cNdvi", false); marca("cTinte", false); marca("cCopas", true); marca("cMarc", true); marca("cDesf", false); var m = {}; parcelas.forEach(function (p, k) { m[k] = PALETA[k]; }); resalta(m); vistaDe(-1, -0.55, 0.62, 1); },
      html: function () {
        return "<div class='h-dos'><div><h4>OlivarTrack → gemelo (lectura, ya en uso)</h4><ul><li>Trabajos y su avance: <code>trabajo_realizado</code>, <code>tareas_abiertas</code></li><li>Fenología: <code>novedades</code></li><li>Pases y atención del día: <code>pases_del_periodo</code>, <code>atencion_de_hoy</code></li><li>Lo que marca Vigía: <code>estado_del_olivar_hoy</code></li></ul></div>" +
          "<div><h4>Gemelo → OlivarTrack (propuestas)</h4><ul><li>Posición corregida de cada olivo</li><li>Lista de parcelas a revisar</li><li>Abonos y pases en borrador</li><li>Observaciones de campo para Vigía</li></ul></div></div>" +
          "<h4>Huecos del MCP que ha destapado el gemelo</h4><ul><li><code>trabajo_realizado</code> no trae la parcela de cada trabajo (<code>parcela: null</code>): hoy se deduce por el número de olivos objetivo.</li><li>No hay una herramienta de olivos por parcela ni de fenología por parcela con su BBCH y fecha de campo.</li><li>Los olivos no tienen un identificador estable, y por eso hoy el avance es una cifra y no una lista de árboles.</li></ul>" +
          "<h4>Decisiones abiertas</h4><ol><li>¿Guardar la posición corregida junto a cada olivo?</li><li>¿Leer el NDVI directamente de Vigía, para tener una sola fuente?</li><li>¿Usar la 3ª cobertura LiDAR como fuente de olivosParcela?</li><li>¿Llevarlo a las 37 parcelas?</li></ol>" +
          "<p class='h-nota'>Nada por persona: todo agregado por parcela.</p>" + origenDatos(); } }
  ];

  // ---------- la historia de Hituelo: cada escena sale de lo que OlivarTrack sabe de verdad (instantánea D.ot) y de lo que mide el gemelo.
  // Solo hay escenas donde los datos las sostienen; lo que falta se dice en la última («Lo que no sabemos aún»). Sin personas.
  var esH = D.finca_id === "hituelo";
  var PALF = [0x2e8b3d, 0xd98c2b, 0x3b82c4, 0x8e5bc4], COL_CANC = 0xc4504a;
  var colF = function (k) { return PALF[parcelas[k].finca % PALF.length]; };
  var swH = function (k) { return '<i class="h-sw" style="background:#' + colF(k).toString(16).padStart(6, "0") + '"></i>'; };
  var swFinca = function (f) { return '<i class="h-sw" style="background:#' + PALF[f % PALF.length].toString(16).padStart(6, "0") + '"></i>'; };
  var pct = function (a, b) { return b ? Math.round((a - b) / b * 100) : null; };
  var conSigno = function (d) { return (d > 0 ? "+" : "") + d + " %"; };
  var rango = function (a, d) { var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); return fmt(lo, d) === fmt(hi, d) ? fmt(lo, d) : fmt(lo, d) + "–" + fmt(hi, d); };
  var sumaK = function (ks, fn) { return ks.reduce(function (a, k) { return a + fn(k); }, 0); };
  var todasK = function () { return parcelas.map(function (p, k) { return k; }); };
  function vistaFinca(f, az, el, fac) { elegirFinca(f); orb.az = az; orb.el = el; orb.dist = orb.dist * fac; }
  function pintaTodo(fn) { var m = {}; parcelas.forEach(function (p, k) { var c = fn(k); if (c != null) m[k] = c; }); resalta(m); }
  function origenH() {
    return "<p class='h-nota'>Instantánea de OlivarTrack del " + dd(OT.fecha_consulta) + ". La lectura en vivo (MCP) no está activada en Hituelo: el MCP no devuelve la parcela de cada trabajo y, con 27 parcelas, no hay forma segura de asignarlo.</p>";
  }
  var tareaH = function (k, titulo) { return tareasDe(k).filter(function (t) { return t.titulo === titulo; })[0]; };
  function celdaTarea(t) {
    if (!t) return "–";
    if (t.estado === "completado") return dd(t.fecha) + (t.andados != null && t.objetivo != null ? " · " + fmt(t.andados) + "/" + fmt(t.objetivo) : "");
    return t.estado === "cancelada" ? "cancelada" : "pendiente";
  }
  function desfaseH(ok) {   // diferencia marca − copa pareada, en metros (x este, y norte)
    var dx = [], dy = [];
    marc.forEach(function (m) { if (m.par >= 0 && ok(m.parc)) { dx.push(m.x - copas[m.par].x); dy.push(m.y - copas[m.par].y); } });
    return { n: dx.length, dx: med(dx), dy: med(dy), d: Math.hypot(med(dx), med(dy)) };
  }
  var fincaConMasTareas = function () {
    var mejor = 0, n = -1; fincas.forEach(function (f, i) { var c = sumaK(f.parcelas, function (k) { return tareasDe(k).length; }); if (c > n) { n = c; mejor = i; } }); return mejor;
  };

  var ESCENAS_H = !esH ? [] : [
    { t: "Cuatro fincas, veintisiete parcelas", fuente: "OlivarTrack · fincas y olivosParcela",
      ir: function () { pon("orto"); marca("cLinde", true); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); marca("cSolo", false); pintaTodo(colF); vistaFinca(-1, -0.5, 0.78, 1); },
      html: function () {
        var ha = parcelas.reduce(function (a, p) { return a + p.ha; }, 0), pastos = parcelas.filter(function (p) { return p.pasto; });
        var filas = fincas.map(function (f, i) { return { c: [swFinca(i) + f.nombre, fmt(f.parcelas.length), fmt(f.ha, 1), fmt(sumaK(f.parcelas, nMarc))] }; });
        return "<p>OlivarTrack tiene dadas de alta en Hituelo <strong>" + fincas.length + " fincas con " + parcelas.length + " parcelas</strong>: <strong>" + fmt(ha, 1) + " ha</strong> y <strong>" + fmt(marc.length) + " olivos marcados</strong>. " +
          "Lo que ves es un gemelo: la forma sale de los puntos del vuelo LiDAR de 2024 y el color, de la ortofoto del PNOA (vuelo de julio de 2022).</p>" +
          tabla(["Finca", "Parcelas", "ha", "Olivos"], filas) +
          "<p class='h-nota'>" + pastos.length + " de las parcelas son pasto (" + fmt(pastos.reduce(function (a, p) { return a + p.ha; }, 0), 1) + " ha) y no llevan olivos marcados. A partir de aquí cada escena cruza el modelo con algo que OlivarTrack ya sabe, y la última dice lo que todavía no.</p>"; } },

    { t: "Cuántos olivos hay y cuántos vemos", fuente: "OlivarTrack · olivosParcela · LiDAR 2024 (detector de copas)",
      ir: function () { pon("nube"); marca("cCopas", true); marca("cMarc", true); marca("cLinde", true); marca("cDesf", false); marca("cNdvi", false); pintaTodo(function (k) { var a = nMarc(k), d = a ? pct(nLidar(k), a) : 0; return a && Math.abs(d) >= 10 ? COL.atencion : null; }); vistaFinca(-1, -0.4, 0.8, 0.9); },
      html: function () {
        var filas = fincas.map(function (f, i) { var a = sumaK(f.parcelas, nMarc), l = sumaK(f.parcelas, nLidar); return { c: [swFinca(i) + f.nombre, fmt(a), fmt(l), conSigno(pct(l, a))] }; });
        var A = marc.length, L = cIn.length;
        var difs = parcelas.map(function (p, k) { var a = nMarc(k); return a ? { n: p.nombre, d: pct(nLidar(k), a), a: a, l: nLidar(k) } : null; }).filter(function (x) { return x && Math.abs(x.d) >= 10; }).sort(function (p, q) { return Math.abs(q.d) - Math.abs(p.d); });
        return "<p>El LiDAR ve <strong>" + fmt(L) + " copas de olivo frente a " + fmt(A) + " olivos marcados (" + conSigno(pct(L, A)) + ")</strong> en el conjunto. Por finca:</p>" +
          tabla(["Finca", "Marcados", "LiDAR", "Dif."], filas) +
          (difs.length ? "<p>Las parcelas en las que se separan <strong>10 % o más</strong> (en ámbar) son " + lista(difs.map(function (x) { return "<strong>" + x.n + "</strong> (" + fmt(x.l) + " copas, " + fmt(x.a) + " marcas, " + conSigno(x.d) + ")"; })) + ". " : "<p>Ninguna parcela se separa un 10 % o más. ") +
          "Puede ser que copas que se tocan cuenten como una sola, que haya marcas de olivos que ya no están o árboles sin marcar: son sitios a mirar, no un veredicto.</p>" +
          "<p class='h-nota'>Las copas del LiDAR excluyen lo que pasa de ~8 m (postes, pinos, cables) y los árboles que no son olivo, que se dibujan aparte. Las tres parcelas de pasto no cuentan.</p>"; } },

    { t: "Las marcas caen un metro al este", fuente: "OlivarTrack · olivosParcela · ortofoto PNOA (julio de 2022)",
      ir: function () { pon("orto"); marca("cCopas", true); marca("cMarc", true); marca("cDesf", true); marca("cLinde", true); marca("cNdvi", false); resalta({}); var kM = 0, n = -1; parcelas.forEach(function (p, k) { if (nMarc(k) > n) { n = nMarc(k); kM = k; } }); vistaDe(kM, -0.2, 1.0, 0.55); },
      html: function () {
        var g = desfaseH(function () { return true; }), conPar = g.n;
        var filas = fincas.map(function (f, i) { var s = {}; f.parcelas.forEach(function (k) { s[k] = 1; }); var d = desfaseH(function (k) { return s[k]; }); return { c: [swFinca(i) + f.nombre, fmt(d.n), fmt(d.d, 1) + " m"] }; });
        var dir = Math.abs(g.dx) >= Math.abs(g.dy) ? (g.dx > 0 ? "al este" : "al oeste") : (g.dy > 0 ? "al norte" : "al sur");
        return "<p>Las marcas de OlivarTrack caen <strong>" + fmt(g.d, 1) + " m " + dir + "</strong> de las copas del LiDAR (mediana de " + fmt(conPar) + " marcas con copa pareada, el " + Math.round(conPar / marc.length * 100) + " % de las " + fmt(marc.length) + "). " +
          "No es un error del LiDAR ni del panel: las marcas se pusieron sobre la ortofoto, y en una ortofoto los árboles altos aparecen desplazados respecto a su pie. El LiDAR sí está bien georreferenciado.</p>" +
          tabla(["Finca", "Marcas con copa", "Desfase"], filas) +
          "<p class='h-nota'>Activa «Desfase entre ambos» arriba para ver las flechas marca → copa.</p>" +
          "<p class='h-decision'><strong>Propuesta para OlivarTrack:</strong> guardar con cada olivo, además del punto marcado, su posición sobre el terreno ya corregida, y usarla para cruzar con LiDAR, NDVI y Vigía.</p>"; } },

    { t: "Preparación del suelo y desvarete", fuente: "OlivarTrack · trabajos (instantánea) · sin personas",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true);
        pintaTodo(function (k) { var v = tareaH(k, "Desvaretar"); if (v && v.estado === "completado") return COL.ok; return tareasDe(k).length ? COL.atencion : COL.nada; }); vistaFinca(fincaConMasTareas(), -0.5, 0.8, 1); },
      html: function () {
        var ks = todasK().filter(function (k) { return tareasDe(k).length; }), nf = fincas.filter(function (f) { return f.parcelas.some(function (k) { return tareasDe(k).length; }); }).length;
        var filas = ks.map(function (k) { return { c: [swH(k) + parcelas[k].nombre, celdaTarea(tareaH(k, "Soplar Hojas")), celdaTarea(tareaH(k, "Rastra")), celdaTarea(tareaH(k, "Desvaretar"))] }; });
        var hechas = ks.filter(function (k) { var v = tareaH(k, "Desvaretar"); return v && v.estado === "completado"; });
        var fe = hechas.length ? minMax(hechas.map(function (k) { return tareaH(k, "Desvaretar").fecha; })) : null;
        var sinT = fincas.filter(function (f) { return !f.parcelas.some(function (k) { return tareasDe(k).length; }); });
        var raras = [];
        ks.forEach(function (k) { tareasDe(k).forEach(function (t) { var a = nMarc(k); if (t.estado === "completado" && t.objetivo != null && a && Math.abs(t.objetivo - a) / a > 0.15) raras.push("<strong>" + parcelas[k].nombre + "</strong>: «" + t.titulo + "» figura con " + fmt(t.andados) + " olivos andados de un objetivo de " + fmt(t.objetivo) + ", y la parcela tiene " + fmt(a) + " marcados"); }); });
        return "<p>OlivarTrack tiene trabajos de este otoño en <strong>" + ks.length + " de las " + parcelas.length + " parcelas</strong> (" + nf + " de las " + fincas.length + " fincas). " +
          (fe ? "El desvarete está completado en <strong>" + hechas.length + "</strong> de ellas, entre el " + dd(fe[0]) + " y el " + dd(fe[1]) + ". " : "") + "En cada celda: fecha de cierre y olivos andados / objetivo.</p>" +
          tabla(["Parcela", "Soplar hojas", "Rastra", "Desvaretar"], filas) +
          (sinT.length ? "<p class='h-aviso-t'><strong>" + lista(sinT.map(function (f) { return f.nombre; })) + "</strong> " + (sinT.length === 1 ? "no tiene" : "no tienen") + " ningún trabajo registrado" + (sinT.length === 1 ? " (" + fmt(sinT[0].ha, 1) + " ha y " + fmt(sumaK(sinT[0].parcelas, nMarc)) + " olivos marcados)" : "") + ": en gris en el mapa. O no se ha hecho, o no se ha anotado: el panel no distingue entre las dos cosas.</p>" : "") +
          (raras.length ? "<p><strong>Cifras que no cuadran:</strong> " + raras.join("; ") + ". Puede que el objetivo se guardara con otra zona; conviene mirarlo antes de fiarse del avance.</p>" : "") + origenH(); } },

    { t: "Lo que sigue abierto y lo cancelado", fuente: "OlivarTrack · tareas abiertas y canceladas (instantánea) · sin personas",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cLinde", true);
        pintaTodo(function (k) { var ts = tareasDe(k); if (ts.some(function (t) { return t.estado === "pendiente"; })) return COL.atencion; if (ts.some(function (t) { return t.estado === "cancelada"; })) return COL_CANC; return null; }); vistaFinca(fincaConMasTareas(), -0.5, 0.8, 1); },
      html: function () {
        var ab = [], ca = [];
        parcelas.forEach(function (p, k) { tareasDe(k).forEach(function (t) { if (t.estado === "pendiente") ab.push({ k: k, t: t }); else if (t.estado === "cancelada") ca.push({ k: k, t: t }); }); });
        var fila = function (x, e) { return { c: [swH(x.k) + parcelas[x.k].nombre, x.t.titulo, dd(x.t.fecha), e] }; };
        var filas = ab.map(function (x) { return fila(x, "abierta" + (x.t.avance ? " · " + fmt(x.t.avance) + " %" : "")); }).concat(ca.map(function (x) { return fila(x, "cancelada"); }));
        var desv = ca.filter(function (x) { return x.t.titulo === "Desvaretar"; });
        return "<p>Hay <strong>" + ab.length + " tareas abiertas</strong> (en ámbar) y <strong>" + ca.length + " canceladas</strong> (en rojo apagado). En el panel una tarea abierta sale en Hoy › Atención; aquí se ve <em>dónde</em> está.</p>" +
          tabla(["Parcela", "Tarea", "Fecha", "Estado"], filas) +
          (desv.length ? "<p><strong>" + lista(desv.map(function (x) { return parcelas[x.k].nombre; })) + "</strong>: el desvarete figura como cancelado el " + dd(desv[0].t.fecha) + ", así que esa parcela no tiene el desvarete hecho aunque las de su alrededor sí.</p>" : "") +
          "<p class='h-nota'>«Cancelada» es el estado que guarda OlivarTrack; el motivo no se guarda con la tarea.</p>" + origenH(); } },

    { t: "Fenología: casi nada registrado", fuente: "OlivarTrack · fenología (instantánea) · Sentinel-2",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cLinde", true); var fs = []; parcelas.forEach(function (p) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f) { fs.push(f.fecha); }); }); ndviEn(fs.length ? minMax(fs)[0] : "2026-08-25"); marca("cTinte", false);
        pintaTodo(function (k) { var e = OT.parcelas[parcelas[k].id]; return e && e.fenologia.length ? COL.ok : null; });
        var kk = -1; parcelas.forEach(function (p, k) { var e = OT.parcelas[p.id]; if (kk < 0 && e && e.fenologia.length) kk = k; }); if (kk >= 0) vistaDe(kk, -0.4, 0.8, 1); else vistaFinca(-1, -0.45, 0.7, 0.9); },
      html: function () {
        var reg = []; parcelas.forEach(function (p, k) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f) { reg.push({ k: k, f: f }); }); });
        var con = {}; reg.forEach(function (x) { con[x.k] = 1; });
        var filas = reg.map(function (x) { return { c: [swH(x.k) + parcelas[x.k].nombre, dd(x.f.fecha), "BBCH " + x.f.bbch] }; });
        var raro = false; reg.forEach(function (a) { reg.forEach(function (b) { if (a !== b && a.k === b.k && a.f.fecha === b.f.fecha && Math.abs(a.f.bbch - b.f.bbch) >= 10) raro = true; }); });
        return "<p>Solo <strong>" + Object.keys(con).length + " de las " + parcelas.length + " parcelas</strong> " + (Object.keys(con).length === 1 ? "tiene" : "tienen") + " fenología registrada" + (reg.length ? " (" + reg.length + " anotaciones)" : "") + ". El resto del mapa está sin dato.</p>" +
          (filas.length ? tabla(["Parcela", "Fecha", "Estado"], filas) : "") +
          (raro ? "<p class='h-aviso-t'><strong>Una discrepancia para revisar:</strong> hay dos anotaciones del mismo día con estados muy distintos (65 es plena floración; 75, fruto al 50 % de su tamaño final). Una de las dos está mal, o son dos zonas distintas de la parcela.</p>" : "") +
          "<p>Debajo, el NDVI de Sentinel-2 más cercano (" + dd(NDV.fechas[ndviIdx]) + "): vigor medio de la zona " + fmt(NDV.media[ndviIdx], 2) + ". La escala es relativa, como en Vigía.</p>" + origenH(); } },

    { t: "Cómo está el campo hoy", fuente: "Sentinel-2 L2A (Copernicus) · NDVI a 10 m, 48 fechas",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cLinde", true); ndviEn(NDV.fechas[NDV.fechas.length - 1]); marca("cTinte", true); resalta({}); vistaFinca(-1, -0.45, 0.65, 0.9); },
      html: function () {
        var n = NDV.fechas.length, im = 0, ix = 0; NDV.media.forEach(function (v, i) { if (v > NDV.media[ix]) ix = i; if (v < NDV.media[im]) im = i; });
        return "<p>Última imagen Sentinel-2 útil: <strong>" + dd(NDV.fechas[n - 1]) + "</strong>, con un vigor medio de <strong>" + fmt(NDV.media[n - 1], 2) + "</strong>. En el último año (" + n + " fechas) el máximo fue de " + fmt(NDV.media[ix], 2) + " el " + dd(NDV.fechas[ix]) + " y el mínimo de " + fmt(NDV.media[im], 2) + " el " + dd(NDV.fechas[im]) + ".</p>" +
          "<p>Las copas toman el tono del vigor de su zona (marrón, menos; verde, más), con la escala relativa de esa fecha. Arrastra la fecha en «NDVI» para ver cómo cambia el año.</p>" +
          "<p>Ojo con lo que mide: a 10 m cada cuadro cubre varios olivos <em>y</em> la cubierta del suelo, así que la subida de primavera es sobre todo hierba entre calles. Es el vigor de una zona, no de un árbol, y ninguna capa está calibrada con observación de campo.</p>" +
          "<p class='h-nota'>En esta versión no se consulta Vigía: lo que ves es solo la imagen de satélite.</p>"; } },

    { t: "El suelo, parcela a parcela", fuente: "SoilGrids (ISRIC) · consulta de producción del 26-oct-2026",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); pintaTodo(colF); vistaFinca(-1, -0.5, 0.78, 1); },
      html: function () {
        var filas = fincas.map(function (f, i) {
          var ks = f.parcelas.filter(function (k) { return parcelas[k].suelo; }), cl = {}, phs = [], mos = [];
          ks.forEach(function (k) { var r = parcelas[k].suelo[0]; var c = claseUsda(r.a, r.l, r.c); cl[c] = (cl[c] || 0) + 1; phs.push(r.ph); mos.push(r.mo); });
          var txt = Object.keys(cl).sort(function (a, b) { return cl[b] - cl[a]; }).map(function (c) { return c + " (" + cl[c] + ")"; }).join(", ");
          return { c: [swFinca(i) + f.nombre, txt || "sin dato", phs.length ? rango(phs, 1) : "–", mos.length ? rango(mos, 1) : "–"] };
        });
        var sin = parcelas.filter(function (p) { return !p.suelo; }).length;
        return "<p>SoilGrids da la textura, el pH y la materia orgánica de la capa de 0 a 5 cm de " + (parcelas.length - sin) + " de las " + parcelas.length + " parcelas. Resumen por finca (entre paréntesis, nº de parcelas):</p>" +
          tabla(["Finca", "Textura", "pH", "MO %"], filas) +
          "<p class='h-nota'>Es un modelo mundial a 250 m, no una analítica: un valor por parcela, y las parcelas cercanas comparten celda, así que salen casi iguales. Elige una parcela arriba para ver el perfil completo. OlivarTrack no tiene hoy ninguna analítica de suelo de Hituelo con la que contrastarlo.</p>"; } },

    { t: "Relieve, cauces y construcciones", fuente: "LiDAR 2024 (PNOA, CNIG) · MDT de 0,5 m · deducciones del gemelo",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); resalta({}); vistaFinca(-1, -0.9, 0.5, 0.85); },
      html: function () {
        var P = D.paisaje || {}, ed = (P.edificios || []).length, po = P.tendido && P.tendido.postes ? P.tendido.postes.length : 0, ca = P.arroyo && P.arroyo.ejes ? P.arroyo.ejes : [];
        var noOl = P.arboles || [], nf = noOl.filter(function (a) { return a.tipo === "frondosa"; }).length, nb = noOl.filter(function (a) { return a.tipo === "arbusto"; }).length;
        var filas = fincas.map(function (f, i) {
          var zs = f.parcelas.map(function (k) { return D.z0 + suelo(parcelas[k].centro[0], parcelas[k].centro[1]); });
          return { c: [swFinca(i) + f.nombre, rango(zs.map(function (z) { return Math.round(z / 5) * 5; }), 0) + " m"] };
        });
        return "<p>Altitud del centro de las parcelas de cada finca, a ± unos metros:</p>" + tabla(["Finca", "Altitud"], filas) +
          "<p>Sobre el terreno, el gemelo dibuja <strong>" + ed + " edificios</strong> (medidos: el LiDAR los clasifica), <strong>" + po + " postes de un tendido</strong> y <strong>" + ca.length + " cauces secos</strong>, y <strong>" + fmt(noOl.length) + " árboles que no son olivo</strong> (" + fmt(nf) + " frondosas y " + fmt(nb) + " arbustos).</p>" +
          "<p class='h-nota'>Deducido, no medido: el tendido sale de la alineación de los postes (no hay retornos de cable, el hilo es una curva estimada); los cauces salen de dónde se acumularía el agua según el relieve (no hay clase de agua) y se dibujan secos con una anchura de regla; el tipo de cada árbol sale de su forma. Los cortijos cercanos se funden en una sola huella.</p>"; } },

    { t: "Lo que no sabemos aún", fuente: "OlivarTrack (instantánea) · lo medido por el gemelo",
      ir: function () { pon("orto"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); pintaTodo(function (k) { return tareasDe(k).length ? null : COL.nada; }); vistaFinca(-1, -0.5, 0.75, 1); },
      html: function () {
        var sinT = fincas.filter(function (f) { return !f.parcelas.some(function (k) { return tareasDe(k).length; }); });
        var nFen = parcelas.filter(function (p) { var e = OT.parcelas[p.id]; return e && e.fenologia.length; }).length;
        var li = [];
        sinT.forEach(function (f) { li.push("<strong>" + f.nombre + "</strong> (" + f.parcelas.length + " parcelas, " + fmt(f.ha, 1) + " ha, " + fmt(sumaK(f.parcelas, nMarc)) + " olivos marcados) no tiene trabajos, fenología ni analíticas registrados: el mapa la pinta en gris."); });
        li.push("OlivarTrack no tiene ningún pase, entrega ni analítica de estas fincas (" + fmt(OT.pases_finca || 0) + " pases, " + fmt(OT.entregas_finca || 0) + " entregas, " + fmt(OT.analiticas_finca || 0) + " analíticas), y la fenología está en " + nFen + " de " + parcelas.length + " parcelas.");
        li.push("<strong>Frutales:</strong> ninguno está marcado. El LiDAR no distingue un frutal de otro árbol; hay que señalarlos a mano, como se hizo en Cerro Velasco.");
        li.push("<strong>Tendido, cauces y tipo de árbol</strong> son deducciones (escena anterior), no medidas.");
        li.push("<strong>La ortofoto es de julio de 2022 y el LiDAR de 2024:</strong> un arranque o un replante entre medias se ve en la nube y no en la foto.");
        li.push("<strong>Borde norte:</strong> faltan dos hojas LiDAR (404-4181 y 406-4181). Tres teselas de ese borde tienen suelo, pero no nube de puntos ni copas completas.");
        li.push("<strong>Lectura en vivo:</strong> la historia no lee OlivarTrack en vivo (solo la instantánea de arriba). El MCP no devuelve la parcela de cada trabajo y, con 27 parcelas, asignarlos por el nº de olivos daría falsos emparejamientos.");
        return "<p>Un gemelo que solo cuenta lo que sabe sería deshonesto. Esto es lo que <strong>no</strong> sabemos, o sabemos a medias:</p><ul>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; } }
  ];
  var ESCENAS = esH ? ESCENAS_H : ESCENAS_C;

  // ---------- el aviso de la ventana
  function aviso(txt, tipo) { var e = $("hEstado"); e.textContent = txt; e.setAttribute("data-t", tipo || ""); }
  function pintaEscena() {
    var e = ESCENAS[hist]; $("hTitulo").textContent = (hist + 1) + ". " + e.t; $("hTexto").innerHTML = e.html();
    if (e.alMostrar) e.alMostrar();
    $("hFuente").innerHTML = "<span class=\"h-pill\">Conecta con OlivarTrack</span> " + e.fuente; $("hCont").textContent = (hist + 1) + " de " + ESCENAS.length;
    var pts = $("hPuntos").children; for (var i = 0; i < pts.length; i++) pts[i].setAttribute("aria-current", String(i === hist));
    $("hAnt").disabled = hist === 0; $("hSig").disabled = hist === ESCENAS.length - 1;
  }
  function vaA(i) { hist = Math.max(0, Math.min(ESCENAS.length - 1, i)); $("hIntro").hidden = true; $("hCuerpo").hidden = false; $("hIni").textContent = "Volver a empezar"; if (paseando) salePaseo(); pintaAvance(null); ESCENAS[hist].ir(); pintaEscena(); }
  function saleHistoria() { pintaAvance(null); hist = -1; $("hCuerpo").hidden = true; $("hIntro").hidden = false; $("hIni").textContent = "Empezar el recorrido"; resalta({}); }
  (function () {
    var cont = $("hPuntos"); ESCENAS.forEach(function (e, i) { var b = document.createElement("button"); b.type = "button"; b.className = "h-punto"; b.setAttribute("aria-label", "Escena " + (i + 1) + ": " + e.t); b.title = e.t; b.addEventListener("click", function () { vaA(i); }); cont.appendChild(b); });
    $("hIni").addEventListener("click", function () { vaA(0); }); $("hAnt").addEventListener("click", function () { vaA(hist - 1); }); $("hSig").addEventListener("click", function () { vaA(hist + 1); }); $("hFin").addEventListener("click", saleHistoria);
    window.addEventListener("keydown", function (e) {
      if (hist < 0 || paseando) return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON") return;
      if (e.code === "ArrowRight") { vaA(hist + 1); e.preventDefault(); } else if (e.code === "ArrowLeft") { vaA(hist - 1); e.preventDefault(); }
    });
    aviso("Datos: instantánea de OlivarTrack del " + dd(OT.fecha_consulta) + " · sin lectura en vivo", "");
  })();


