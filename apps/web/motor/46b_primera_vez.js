// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: PrimeraVezPuro
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- la tarjeta del estreno del micro (F3l). Va DESPUÉS del consentimiento (F3j, 47_habla.js; en un corro, el «cercania» de 47b) y no
  // lo sustituye: el consentimiento es legal y se acepta o no (base: consentimiento, decisión 163); la tarjeta es de comodidad, no pide nada y se cierra con «Entendido».
  // Dice en tres líneas con quién se oye, cómo cortar el micro y que no se graba. Las cifras no se inventan: el alcance de un corro es el de 45_voz.js (la
  // misma cifra, que un guardián compara), y lo que se dice de no grabar es lo del ADR-0026 §5 y del texto legal. Solo las familias y los miembros de un
  // corro: el guía y la oficina hablan por su cargo y no pasan por aquí (como por el consentimiento).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/primera_vez.test.js)
  var PrimeraVezPuro = (function () {
    var CLAVE = "habla.tarjeta";   // la clave guardada en el aparato (localStorage) donde se guarda que ya se vio
    var ALCANCE_CORRO = 20;   // m: a partir de aquí se deja de oír a un miembro del corro (ADR-0032 b); es DIST_CORRO.corte de 45_voz.js: primera_vez.test.js comprueba que son la misma cifra
    var TITULO = "Tu micrófono, en pocas palabras", BOTON = "Entendido";
    var VOLVER_PANTALLA = "Puedes volver a leer esto en Configuración → Hablar.", VOLVER_VR = "Puedes volver a leerlo en las gafas, fila «Micrófono».";
    var FILA_VOLVER = "Cómo funciona mi micrófono";
    // ¿qué sala es? e = estado de la voz { corro, guiada } → "corro" | "guiada" | ""
    function ambitoDe(e) { return e && e.corro ? "corro" : e && e.guiada ? "guiada" : ""; }
    // ¿se enseña ahora? visto: ¿ya se vio en este aparato?; papel: el de la voz. Solo familia y miembro de un corro
    function debeVerse(visto, papel) { return visto !== true && (papel === "familia" || papel === "miembro"); }
    // la tarjeta: o = { ambito: "guiada" | "corro", forma: "pulsar" | "mantener", corte (m: a cuántos metros se deja de oír a alguien del corro), vr }
    // → { titulo, boton, pie, lineas: [{ k, t (el tema), txt (el texto) }] }
    function tarjeta(o) {
      var corro = !!o && o.ambito === "corro", mant = !!o && o.forma === "mantener", vr = !!o && o.vr === true;
      var corte = o && typeof o.corte === "number" && isFinite(o.corte) && o.corte > 0 ? Math.round(o.corte) : 0;
      var quien = corro
        ? "Te oyen solo las personas de tu corro (hasta 5 hogares)" + (corte ? ", y cada vez menos cuanto más lejos: a más de " + corte + " m dejáis de oíros" : "") + ". Nadie más te oye."
        : "Te oyen el guía y las demás familias de esta visita guiada. Solo hablas cuando el guía te da la palabra.";
      var corta = (mant ? "Deja de apretar el botón «Hablar» (o la tecla T) y el micro se cierra. En las gafas, deja de apretar el gatillo izquierdo."
        : "Pulsa «Silenciarme» (o la tecla T) y el micro se cierra. En las gafas, pulsa el gatillo izquierdo.") + (corro ? " Se cierra solo tras un minuto sin hablar, y al salir del corro." : "");
      return { titulo: TITULO, boton: BOTON, pie: vr ? VOLVER_VR : VOLVER_PANTALLA,
        lineas: [{ k: "quien", t: "Quién te oye", txt: quien }, { k: "corta", t: "Cómo cortar el micro", txt: corta },
          { k: "graba", t: "Qué no pasa", txt: "No se graba ni se transcribe nada de lo que dices: la voz es solo en directo." }] };
    }
    return { CLAVE: CLAVE, TITULO: TITULO, BOTON: BOTON, FILA_VOLVER: FILA_VOLVER, VOLVER_PANTALLA: VOLVER_PANTALLA, VOLVER_VR: VOLVER_VR, ALCANCE_CORRO: ALCANCE_CORRO, ambitoDe: ambitoDe, debeVerse: debeVerse, tarjeta: tarjeta };
  })();
  // [puro:fin]
