// El interruptor «Avisarme por correo de los eventos» (OF11f; petición de Antonio, 2026-11-02; MU5-n, A3-7b2: antes apps/web/motor/49_avisos_correo.js, que queda como talón):
// hasta ahora el hogar solo elegía los avisos por correo en el primer acceso y no podía cambiarlo. Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. Con servidor y
// sesión pregunta GET /api/yo/avisos; si responde, añade a Configuración la pestaña «Cuenta» con una casilla (Ajustes.registra) cuyo valor MANDA LA API: al marcarla o
// desmarcarla manda PUT /api/yo/avisos y, si la api no contesta o rechaza, devuelve la casilla a lo que había. Sin servidor, sin sesión o con error, no se muestra nada.
// Lo guardado en el aparato (localStorage) es solo una copia: en cada carga se reescribe con lo que dice la api. «Restablecer» de Configuración devuelve la casilla a «no» y,
// por tanto, también lo manda a la api. Todo texto por textContent (lo pinta Ajustes). Presupuesto (regla 6): 1 petición al montar, 0 triángulos.
// Es de TODOS los mundos (mundos: "todos"): el aviso es de la cuenta, no del mundo que se vea, y Configuración no cambia al cruzar una puerta. Su libera() quita la casilla
// de Configuración y, nuevo, CANCELA las peticiones en vuelo (AbortController): antes una respuesta tardía solo se ignoraba (vivo), pero la petición seguía viva.
// Código movido tal cual (se tipan parámetros y variables); lo que el legado monta antes (D, HazasPuro) o después (Ajustes, 33) entra por dp. Los trozos [puro:…] y [motor:…]
// los evalúa en Node pruebas/guardianes/avisos_correo.test.js (como JavaScript: sin los tipos ni el «dp.»).
import type { Manifiesto } from "../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_AVISOS_CORREO = "avisos-correo";

/** Lo que el talón de 49 le da: D (01) y HazasPuro (13b); Ajustes (33), por getter (el código lo comprobaba con typeof) */
export interface DepsAvisosCorreo { D: T; HazasPuro: T; readonly Ajustes: T }

// [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/avisos_correo.test.js)
export var AvisosCorreoPuro: T = (function () {
  var CLAVE = "avisos.correo";
  // el valor de una respuesta de la api, o null si no es la forma { avisos_correo: boolean }
  function valor(j?: T) { return j && typeof j === "object" && typeof j.avisos_correo === "boolean" ? j.avisos_correo : null; }
  return { CLAVE: CLAVE, valor: valor };
})();
// [puro:fin]

// [motor:inicio] (lo evalúa también en Node pruebas/guardianes/avisos_correo.test.js con un Ajustes y un fetch de mentira)
export function AvisosCorreoMotor(dp: DepsAvisosCorreo, n?: T) {
  var P: T = AvisosCorreoPuro, API: T = dp.HazasPuro.prefijoApi(location.search, dp.D.base);
  var vivo = true, retira: T = null, silencio = false, actual = false, cola: T = Promise.resolve(), ctl: T = new AbortController();
  if (!API || typeof dp.Ajustes === "undefined" || !dp.Ajustes.registra) return { libera: function () {}, estado: function () { return { visible: false, valor: false }; } };
  function pide(metodo: T, cuerpo?: T) {
    var op: T = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal };   // libera() la cancela
    if (cuerpo) { op.headers["content-type"] = "application/json"; op.body = JSON.stringify(cuerpo); }
    return Promise.resolve().then(function () { return fetch(API + "yo/avisos", op); })
      .then(function (r: T) { return r && r.status === 200 && r.json ? r.json() : null; }).then(P.valor);
  }
  function ponLocal(v: T) { silencio = true; try { dp.Ajustes.pon(P.CLAVE, v); } finally { silencio = false; } }
  function alCambiar(k: T, v: T) {
    if (silencio || !vivo || k !== P.CLAVE) return;
    var quiero = v === true;
    // en fila: dos cambios seguidos llegan a la api en el orden en que se hicieron
    cola = cola.then(function () { return pide("PUT", { avisos_correo: quiero }); }).then(function (r: T) {
      if (!vivo) return;
      if (r === null) ponLocal(actual); else { actual = r; if (r !== quiero) ponLocal(r); }
    }).catch(function () { if (vivo) ponLocal(actual); });
  }
  pide("GET").then(function (v: T) {
    if (!vivo || v === null) return;   // sin sesión o sin api: la casilla no existe
    actual = v;
    silencio = true;
    try {
      retira = dp.Ajustes.registra("avisos", { correo: { tipo: "bool", def: false } },
        { id: "cuenta", t: "Cuenta", nota: "Avisos de la oficina sobre los eventos (cambios de fecha, cancelaciones, inscripciones). Se mandan al correo con el que entraste; siempre los ves también en la campana del gemelo.",
          campos: [{ k: "correo", t: "Avisarme por correo de los eventos" }] }, alCambiar);
    } finally { silencio = false; }
    if (retira) ponLocal(v);
  }).catch(function () {});
  return {
    libera: function () { vivo = false; ctl.abort(); if (retira) { retira(); retira = null; } },   // A3-7b2: además de quitar la casilla, cancela lo que esté en vuelo
    estado: function () { return { visible: !!retira, valor: actual }; }
  };
}
// [motor:fin]

export function creaAvisosCorreo(dp: DepsAvisosCorreo) { return AvisosCorreoMotor(dp); }
export type AvisosCorreo = ReturnType<typeof creaAvisosCorreo>;

/** El componente «avisos-correo» (de todos los mundos): lo registra el talón de 49 con Componentes.registra */
export function manifiestoAvisosCorreo(dp: DepsAvisosCorreo): Manifiesto {
  return {
    id: ID_AVISOS_CORREO, version: 1, consume: ["HazasPuro", "Ajustes"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true, url: "avisos" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // solo DOM de Configuración y una petición
    mundos: "todos",
    monta: function () { return creaAvisosCorreo(dp); },
    libera: function (api: T) { if (api) api.libera(); }
  };
}
