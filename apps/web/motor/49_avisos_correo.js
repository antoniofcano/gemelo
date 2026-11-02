// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Componentes), 13b_hazas (HazasPuro), 26_presencia (Cuenta), 33_ajustes (Ajustes)
// Nota: Componente «avisos-correo» (OF11f; petición de Antonio, 2026-11-02): el interruptor «Avisarme por correo de los eventos» en Configuración (pestaña «Cuenta»). Solo se registra; nadie lo nombra. Con servidor y sesión pregunta GET /api/yo/avisos y, si responde, registra la casilla con Ajustes.registra; al cambiarla manda PUT /api/yo/avisos y, si falla, la devuelve a lo que había. Sin servidor, sin sesión o con error no se muestra. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/avisos_correo.test.js.
// ===============================================================================
  // ---------- el interruptor «Avisarme por correo de los eventos» (OF11f; petición de Antonio, 2026-11-02): hasta ahora el hogar solo elegía los avisos por correo en
  // el primer acceso y no podía cambiarlo. Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. Con servidor y sesión pregunta GET /api/yo/avisos; si responde,
  // añade a Configuración la pestaña «Cuenta» con una casilla (Ajustes.registra) cuyo valor MANDA LA API: al marcarla o desmarcarla manda PUT /api/yo/avisos y, si la
  // api no contesta o rechaza, devuelve la casilla a lo que había. Sin servidor, sin sesión o con error, no se muestra nada (como el resto de lo que depende de /api/sesion).
  // Lo guardado en el aparato (localStorage) es solo una copia: en cada carga se reescribe con lo que dice la api. «Restablecer» de Configuración devuelve la casilla a «no»
  // y, por tanto, también lo manda a la api. Todo texto por textContent (lo pinta Ajustes). Presupuesto (regla 6): 1 petición al montar, 0 triángulos.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/avisos_correo.test.js)
  var AvisosCorreoPuro = (function () {
    var CLAVE = "avisos.correo";
    // el valor de una respuesta de la api, o null si no es la forma { avisos_correo: boolean }
    function valor(j) { return j && typeof j === "object" && typeof j.avisos_correo === "boolean" ? j.avisos_correo : null; }
    return { CLAVE: CLAVE, valor: valor };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/avisos_correo.test.js con un Ajustes y un fetch de mentira)
  function AvisosCorreoMotor(n) {
    var P = AvisosCorreoPuro, API = HazasPuro.prefijoApi(location.search, D.base);
    var vivo = true, retira = null, silencio = false, actual = false, cola = Promise.resolve();
    if (!API || typeof Ajustes === "undefined" || !Ajustes.registra) return { libera: function () {}, estado: function () { return { visible: false, valor: false }; } };
    function pide(metodo, cuerpo) {
      var op = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
      if (cuerpo) { op.headers["content-type"] = "application/json"; op.body = JSON.stringify(cuerpo); }
      return Promise.resolve().then(function () { return fetch(API + "yo/avisos", op); })
        .then(function (r) { return r && r.status === 200 && r.json ? r.json() : null; }).then(P.valor);
    }
    function ponLocal(v) { silencio = true; try { Ajustes.pon(P.CLAVE, v); } finally { silencio = false; } }
    function alCambiar(k, v) {
      if (silencio || !vivo || k !== P.CLAVE) return;
      var quiero = v === true;
      // en fila: dos cambios seguidos llegan a la api en el orden en que se hicieron
      cola = cola.then(function () { return pide("PUT", { avisos_correo: quiero }); }).then(function (r) {
        if (!vivo) return;
        if (r === null) ponLocal(actual); else { actual = r; if (r !== quiero) ponLocal(r); }
      }).catch(function () { if (vivo) ponLocal(actual); });
    }
    pide("GET").then(function (v) {
      if (!vivo || v === null) return;   // sin sesión o sin api: la casilla no existe
      actual = v;
      silencio = true;
      try {
        retira = Ajustes.registra("avisos", { correo: { tipo: "bool", def: false } },
          { id: "cuenta", t: "Cuenta", nota: "Avisos de la oficina sobre los eventos (cambios de fecha, cancelaciones, inscripciones). Se mandan al correo con el que entraste; siempre los ves también en la campana del gemelo.",
            campos: [{ k: "correo", t: "Avisarme por correo de los eventos" }] }, alCambiar);
      } finally { silencio = false; }
      if (retira) ponLocal(v);
    }).catch(function () {});
    return {
      libera: function () { vivo = false; if (retira) { retira(); retira = null; } },
      estado: function () { return { visible: !!retira, valor: actual }; }
    };
  }
  // [motor:fin]

  Componentes.registra({
    id: "avisos-correo", version: 1,
    consume: ["HazasPuro", "Ajustes"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "avisos" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // solo DOM de Configuración y una petición
    monta: function (n) { return AvisosCorreoMotor(n); },
    libera: function (api) { if (api) api.libera(); }
  });
