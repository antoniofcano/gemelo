// Lo tuyo en pantalla (EV2-A4, doc/historico/VIABILIDAD-INTERACCION.md; MU5-n, A3-7a: antes apps/web/motor/31b_hud_personal.js, que queda como talón): «hora · tu haza ·
// hablar · volver» juntos, bajo el tiempo del HUD. Es HTML (#hudPersonal en plantilla.html): 0 llamadas de dibujo. Componente «hud-personal» de TODOS los mundos (es de
// la página): su libera() para su reloj de 500 ms (L2-11: antes no lo paraba nadie), quita las escuchas de sus cuatro botones y se borra del Bus («voz:estado»).
// Código movido tal cual (solo se tipan parámetros y variables, y «x.addEventListener(» pasa a «escucha(x, »); lo que el legado reescribe (paseando) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import { creaSoltador } from "./soltador.ts";
import type { T } from "./tipos.ts";

export const ID_HUD_PERSONAL = "hud-personal";

/** Lo que el talón de 31b le da: $ y el Bus; Hazas (13b), horaMundoTexto (15_tiempo), objetivo (09_camara), pp (12_paseo), Usables (02e) y Hud (31); paseando, por getter */
export interface DepsHudPersonal { $(id: string): T; Bus: T; Hazas: T; horaMundoTexto(): string; objetivo: T; pp: T; Usables: T; Hud: T; readonly paseando: boolean }

  // ---------- lo tuyo en pantalla (EV2-A4, doc/historico/VIABILIDAD-INTERACCION.md): «hora · tu haza · hablar · volver» juntos, bajo el tiempo del HUD.
  // Es HTML (#hudPersonal en plantilla.html, clases en plantilla.css): 0 llamadas de dibujo y 0 estilos en línea. No reinventa nada: la hora es la del mundo
  // (15_tiempo.js), la haza es la de 13b_hazas.js (la misma ficha que la tecla H), hablar es el micrófono de 47_habla.js (por el Bus, «habla:alterna») y
  // volver es lo que ya hacen Inicio y 0 (Hud.alInicio). Se oculta con el ajuste «Mostrar hora, tu haza, hablar y volver» (vista.personal, 33_ajustes.js).
  // En VR no se ve (el HUD es de pantalla); su equivalente en la muñeca es EV2-A3, aparte.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ux_hud_personal.test.js)
export var HudPersonalPuro: T = (function () {
    // la hora del mundo, "HH:MM" (si no, un guion: ni se inventa ni se rompe)
    function hora(txt?: T) {
      var ok: T = typeof txt === "string" && /^[0-2][0-9]:[0-5][0-9]$/.test(txt), t: T = ok ? txt : "--:--";
      return { texto: t, nombre: ok ? "Hora del mundo: " + t + ". Abre el tiempo" : "Hora del mundo: sin dato. Abre el tiempo" };
    }
    // tu haza: h = { id, es_mia } de la haza donde estás, o null; hay = ¿se han leído hazas? (sin ellas, el botón no sale)
    function haza(h?: T, hay?: T) {
      if (!hay) return { visible: false, texto: "", nombre: "Tu haza" };
      if (!h) return { visible: true, texto: "Sin haza", nombre: "Sin haza: no estás dentro de ninguna haza. Avisa de ello" };
      return h.es_mia ? { visible: true, texto: "Tu haza", nombre: "Tu haza: estás en una haza tuya. Ver su ficha" }
        : { visible: true, texto: "Otra haza", nombre: "Otra haza: de otro hogar. Ver su ficha" };
    }
    // hablar: e = el estado de la voz ("voz:estado": dentro, guiada, corro, puede, micro) o null. Solo sale dentro de una visita guiada o de un corro (F3k-2) y con permiso de hablar
    function hablar(e?: T) {
      var vis: T = !!(e && e.dentro && (e.guiada || e.corro) && e.puede), micro: T = e && typeof e.micro === "string" ? e.micro : "cerrado";
      if (!vis) return { visible: false, texto: "Hablar", nombre: "Hablar", pulsado: false };
      if (micro === "abriendo") return { visible: true, texto: "Abriendo…", nombre: "Abriendo…: el micrófono se está abriendo", pulsado: true };
      if (micro !== "cerrado") return { visible: true, texto: "Callar", nombre: "Callar: cerrar el micrófono", pulsado: true };
      return { visible: true, texto: "Hablar", nombre: "Hablar: abrir el micrófono", pulsado: false };
    }
    // volver: a la vista aérea; ya en ella, al inicio de la órbita (lo mismo que Inicio y 0)
    function volver(modo?: T) { return { texto: "Volver", nombre: modo === "aereo" ? "Volver al inicio de la vista aérea" : "Volver a la vista aérea" }; }
    return { hora: hora, haza: haza, hablar: hablar, volver: volver };
  })();
  // [puro:fin]
export function creaHudPersonal(dp: DepsHudPersonal) {
  var sol = creaSoltador(), escucha = sol.escucha;

  (function () {
    var cont: T = dp.$("hudPersonal"); if (!cont) return;
    var bHora: T = dp.$("hpHora"), bHaza: T = dp.$("hpHaza"), bHablar: T = dp.$("hpHablar"), bVolver: T = dp.$("hpVolver");
    var tHora: T = dp.$("hpHoraT"), tHaza: T = dp.$("hpHazaT"), tHablar: T = dp.$("hpHablarT"), voz: T = null;
    function ponTxt(el?: T, t?: T) { if (el && el.textContent !== t) el.textContent = t; }
    function ponAt(el?: T, at?: T, v?: T) { if (el && el.getAttribute(at) !== v) el.setAttribute(at, v); }
    function hazaAqui() {   // donde estás: al pasear, donde andas; en la órbita, el punto al que miras (como la tecla H de 13b_hazas.js)
      try { return dp.paseando ? dp.Hazas.enPunto(dp.pp.x, dp.pp.y) : dp.Hazas.enPunto(dp.objetivo.x, -dp.objetivo.z); } catch (e: T) { return null; }
    }
    function refresca() {
      var h: T = HudPersonalPuro.hora(dp.horaMundoTexto());
      ponTxt(tHora, h.texto); ponAt(bHora, "aria-label", h.nombre);
      var hay: T = false; try { hay = !!dp.Hazas.estado().activo; } catch (e: T) {}
      var z: T = HudPersonalPuro.haza(hay ? hazaAqui() : null, hay);
      if (bHaza.hidden === z.visible) bHaza.hidden = !z.visible;
      ponTxt(tHaza, z.texto); ponAt(bHaza, "aria-label", z.nombre);
      var hb: T = HudPersonalPuro.hablar(voz);
      if (bHablar.hidden === hb.visible) bHablar.hidden = !hb.visible;
      ponTxt(tHablar, hb.texto); ponAt(bHablar, "aria-label", hb.nombre); ponAt(bHablar, "aria-pressed", String(hb.pulsado));
      ponAt(bVolver, "aria-label", HudPersonalPuro.volver(dp.Hud.modo()).nombre);
    }
    escucha(bHora, "click", function () { dp.Hud.alterna("tiempo", bHora); });
    escucha(bHaza, "click", function () {   // lo mismo que la tecla H
      var q: T = hazaAqui();
      if (q) dp.Usables.elige("haza:" + q.id, "tecla"); else dp.Usables.mensaje("Hazas", [{ k: "Aquí", v: "No estás dentro de ninguna haza." }]);
    });
    escucha(bHablar, "click", function () { dp.Bus.emite("habla:alterna", {}); });
    escucha(bVolver, "click", function () { dp.Hud.alInicio(); });
    sol.quita(dp.Bus.on("voz:estado", function (e?: T) { voz = e || null; refresca(); }));
    sol.intervalo(setInterval(refresca, 500)); refresca();   // L2-11: libera() lo para
  })();
  return { libera: function () { sol.suelta(); } };
}
export type HudPersonal = ReturnType<typeof creaHudPersonal>;

/** El componente «hud-personal» (solo ciclo de vida; de todos los mundos): lo registra el talón de 31b con Componentes.registra */
export function manifiestoHudPersonal(api: { libera(): void }): Manifiesto {
  return {
    id: ID_HUD_PERSONAL, version: 1, consume: [], expone: [], eventos: { escucha: ["voz:estado"], emite: ["habla:alterna"] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}
