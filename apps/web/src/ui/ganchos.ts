// Los ganchos de depuración y de prueba (MU5-n, A3-7a: antes apps/web/motor/27_debug.js, que queda como talón): window.__g, el gancho de las pruebas (su contrato, en
// contratos/interfaces.json → ganchos_window y doc/sistema/CONTRATOS.md). Solo lectura y ajuste de cámara; sinDibujo(true) deja el bucle sin pintar el mundo (PB8).
// No es un componente: no crea nada que soltar (un objeto en window) y tiene que vivir lo que la página, porque las pruebas lo piden en cualquier momento. Vive en ui/
// con el contador y el medidor, que son la otra cara de la depuración; lo de los mundos que enseña (Arboles, Catalogo, Escena3D…) le llega por argumento.
// Código movido tal cual (solo se tipan parámetros y variables); lo que el legado reescribe (paseando, teclas, listo) entra por getter.
import type { T } from "./tipos.ts";

/** Lo que el talón de 27 le da: lo del exterior y del motor por valor (como antes, al cargarse); por getter, lo que cambia (paseando, teclas, listo) */
export interface DepsGanchos {
  Arboles: T; Catalogo: T; Escena3D: T; OlivosTiles: T; Cola: T; SueloFotos: T; Generados: T; Lejanos: T; Mundo: T; InfoDibujo: T; Estado: T; copas: T; suelo: T;
  orb: T; objetivo: T; camera: T; renderer: T; scene: T; pon: T; aplica: T; entraPaseo: T; salePaseo: T; pp: T;
  readonly paseando: boolean; readonly teclas: T; readonly listo: T; ventana: T;
}

export function creaGanchos(dp: DepsGanchos) {
  var window: T = dp.ventana;

  // ---------- ganchos de depuración y de prueba (solo lectura/ajuste de cámara; ?debug muestra el contador)
  // pendientes(): la Cola más la cola propia de los olivos generados (?olivos=gen) y, con ?olivos=escalera, la capa de lejanos hasta que esté (07ac):
  // lo espera mide() de las pruebas antes de medir
  // sinDibujo(true) deja el bucle sin pintar el mundo (renderer.render no hace nada; sinDibujo(false) lo devuelve): para las pruebas de Chrome que miran el DOM y no el dibujo 3D
  // (PB8; antes cada una se parcheaba a mano). No toca nada más: la lógica del fotograma sigue corriendo. Devuelve si queda sin dibujo
  var renderOriginal: T = null;
  function sinDibujo(si?: T) {
    if (si && !renderOriginal) { renderOriginal = dp.renderer.render; dp.renderer.render = function () {}; }
    else if (!si && renderOriginal) { dp.renderer.render = renderOriginal; renderOriginal = null; }
    return !!renderOriginal;
  }
  // infoDibujo(): lo dibujado con la misma forma para los dos renderizadores (InfoDibujo de 02h_render, F1 de ADR-0031)
  window.__g = {
    sinDibujo: sinDibujo,
    infoDibujo: function () { return dp.InfoDibujo.lee(dp.renderer); },
    Arboles: dp.Arboles, Catalogo: dp.Catalogo, Escena3D: dp.Escena3D, OlivosTiles: dp.OlivosTiles, Cola: dp.Cola, SueloFotos: dp.SueloFotos, copas: dp.copas, suelo: dp.suelo, Mundo: dp.Mundo, orb: dp.orb, objetivo: dp.objetivo, camera: dp.camera, renderer: dp.renderer, scene: dp.scene, pon: dp.pon,
    listo: function () { return dp.listo; }, modo: function () { return dp.Estado.modo; }, Generados: dp.Generados,
    pendientes: function () { return dp.Cola.pendientes() + dp.Generados.pendientes() + dp.Lejanos.pendientes(); },
    ponExag: function (v?: T) { dp.Estado.exag = v; dp.aplica(); }, aplica: dp.aplica,
    paseoEn: function (x?: T, y?: T, ang?: T) { if (!dp.paseando) dp.entraPaseo(); dp.pp.x = x; dp.pp.y = y; dp.pp.ang = ang || 0; },
    paseoSale: function () { if (dp.paseando) dp.salePaseo(); },
    paseoTecla: function (d?: T, v?: T) { dp.teclas[d] = !!v; },
    paseoEstado: function () { return { paseando: dp.paseando, x: dp.pp.x, y: dp.pp.y, ang: dp.pp.ang }; }
  };
  return { sinDibujo: sinDibujo };
}
export type Ganchos = ReturnType<typeof creaGanchos>;
