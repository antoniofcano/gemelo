// Hablar en la visita guiada y en un corro (F3e, F3j, F3k-2; ADR-0026 y ADR-0032): la lógica pura del micro de cada uno (MU5-n, A3-6b: antes el trozo puro de
// apps/web/motor/47_habla.js). Movida tal cual: los modos (pulsar, mantener), lo que se enseña según papel, permiso, micro y mano, la cola, el cierre tras 60 s de
// silencio en un corro y EL AVISO DE VOZ (el texto que acepta cada familia, con su AVISO_VERSION; EIPD-VOZ §3, contratos/voz-consentimiento.md). Sin DOM ni three:
// vive en red/voz/ con la voz. El componente que la usa (lo que se ve: la caja, el diálogo, la lámina de VR) es mundos/comun/habla.ts.
// Si cambias una palabra del aviso, sube AVISO_VERSION y VOZ_AVISO_VERSION de apps/api/src/presencia/consentimiento_voz.ts en el mismo commit (lo comprueban
// apps/api/pruebas/unidad/voz_consentimiento.test.ts y pruebas/guardianes/habla.test.js).

// [puro:inicio] (sin DOM ni THREE: lo prueban habla.test.ts y, en Node, pruebas/guardianes/habla.test.js como Mundos.HablaPuro)
export const HablaPuro: any = (function () {
  var MODOS: any = ["pulsar", "mantener"], DEFECTO: any = "pulsar", SALA: any = /^guiada-([1-9][0-9]{0,9})$/, MANO_MS: any = 3000, AVISO_S: any = 3, MENSAJE_S: any = 6;
  // ---- el aviso de voz (F3j; decisión 163; EIPD-VOZ §3): lo que se enseña a una familia la primera vez que va a pedir la palabra o abrir el micro. AVISO_VERSION es
  // la versión de ESTE texto: la api guarda la que aceptó cada hogar y, si no es la vigente (apps/api/src/presencia/consentimiento_voz.ts, VOZ_AVISO_VERSION; un
  // guardián comprueba que son la misma), se vuelve a pedir. Si cambias una palabra del texto, sube las dos. [BORRADOR] pendiente de la asesoría.
  var AVISO_VERSION: any = 1;
  var AVISO: any = {
    version: AVISO_VERSION, borrador: true,
    titulo: "Antes de hablar: tu voz en esta visita",
    puntos: [
      "Tu voz se oye en directo para las personas que estén en la sala de esta visita guiada.",
      "No se graba ni se transcribe: no se guarda nada de lo que dices.",
      "Solo hablas cuando el guía te da la palabra, y puedes dejar de hablar cuando quieras cerrando el micrófono.",
      "La cuenta es de una persona adulta. Si hay menores cerca, recuerda que se les puede oír.",
      "Puedes retirar este permiso cuando quieras en Configuración, apartado Hablar, sin que pase nada."
    ],
    enlace: { texto: "Más información sobre privacidad", href: "/#privacidad" },
    enlaceVR: "Más información: en la portada, apartado «Tu privacidad».",
    nota: "Texto provisional, pendiente de revisión por la asesoría.",
    aceptar: "Aceptar", ahoraNo: "Ahora no"
  };
  var URL_CONSENTIMIENTO: any = "/api/presencia/voz/consentimiento";
  // lo que dice la api (GET/PUT) → "si" | "no": solo vale la versión vigente de ESTE texto, aceptada
  function consentimiento(j?: any) { return j && typeof j === "object" && j.version === AVISO_VERSION && j.aceptada === true ? "si" : "no"; }
  // ¿hace falta el aviso antes de esta acción? accion: "levantar" (pedir la palabra) | "micro" (abrir el micro); cons: "si" | "no" | "?" (aún no se sabe).
  // Solo las familias: el guía y la oficina hablan por su cargo (la base de su voz es de la asesoría, EIPD-VOZ §3). → "nada" | "comprobar" | "aviso"
  function requiere(papel?: any, accion?: any, cons?: any) {
    if (papel !== "familia" || (accion !== "levantar" && accion !== "micro")) return "nada";
    // al abrir el micro, «aún no se sabe» no frena: para tener la palabra la api ya comprobó el consentimiento (Palabra.da); el aviso solo sale si se SABE que no
    return cons === "si" ? "nada" : cons === "no" ? "aviso" : accion === "micro" ? "nada" : "comprobar";
  }
  // por qué falló aceptar (estado HTTP + cuerpo) → texto para la persona
  function errorAceptar(status?: any, j?: any) {
    if (status === 409 && j && j.error === "version_distinta") return "El aviso ha cambiado: recarga la página para leerlo de nuevo.";
    return j && typeof j.mensaje === "string" && j.mensaje ? j.mensaje : "No se pudo guardar tu respuesta. Inténtalo otra vez.";
  }
  // parte un texto en líneas de como mucho `ancho` px; medir(texto) → px (en la lámina de VR, el canvas)
  function lineas(texto?: any, ancho?: any, medir?: any) {
    var palabras: any = String(texto).split(/\s+/).filter(Boolean), out: any = [], actual: any = "";
    palabras.forEach(function (p?: any) {
      var prueba: any = actual ? actual + " " + p : p;
      if (actual && medir(prueba) > ancho) { out.push(actual); actual = p; } else actual = prueba;
    });
    if (actual) out.push(actual);
    return out;
  }
  var AVISO_ESPACIAL: any = "Con el micrófono abierto el sonido no es espacial; con auriculares sí.";
  // F3k-2 (decisión 207, P1 provisional): en un corro no hay turno que cierre el micro: lo cierra el silencio. SILENCIO_S segundos sin que se te oiga hablar
  // (ActiveSpeakers de LiveKit, «voz:habla» con yo) y se cierra solo. o = { corro, micro, habla (¿se te oye ahora?), t (s callado hasta ahora), dt } → { t, cierra }
  var SILENCIO_S: any = 60;
  function silencio(o?: any) {
    if (!o || !o.corro || o.micro !== "abierto" || o.habla) return { t: 0, cierra: false };
    var t: any = (typeof o.t === "number" && isFinite(o.t) ? o.t : 0) + (typeof o.dt === "number" && o.dt > 0 ? o.dt : 0);
    return t >= SILENCIO_S ? { t: 0, cierra: true } : { t: t, cierra: false };
  }
  // ¿se enseña la caja del micro? En una guiada, con papel (guía, oficina o familia); en un corro (F3k-2), con el papel «miembro» de su token
  function enSala(e?: any) { return !!e && ((!!e.guiada && ["guia", "oficina", "familia"].indexOf(e.papel) >= 0) || (!!e.corro && e.papel === "miembro")); }
  function modo(v?: any) { return MODOS.indexOf(v) >= 0 ? v : DEFECTO; }
  function evento(sala?: any) { var m: any = typeof sala === "string" ? SALA.exec(sala) : null; return m ? Number(m[1]) : null; }
  function modera(papel?: any) { return papel === "guia" || papel === "oficina"; }
  function ordinal(n?: any) { return n + ".º"; }
  // el puesto (1 = la siguiente) de esta identidad en la cola de manos que da 46 (en orden de llegada), o null
  function puestoDe(manos?: any, yo?: any) { var i: any = Array.isArray(manos) && typeof yo === "string" && yo ? manos.indexOf(yo) : -1; return i >= 0 ? i + 1 : null; }
  function textoCola(puesto?: any) { return typeof puesto === "number" && puesto >= 1 ? "Estás " + ordinal(Math.floor(puesto)) + " en la cola." : "Tienes la mano levantada."; }
  // el micro, con icono y TEXTO: e = { papel, puede, micro (cerrado|abriendo|abierto), motivo } → { clave, icono, texto }
  function textoMicro(e?: any) {
    // en un corro, el indicador que promete su aviso (contratos/voz-consentimiento.md, «cercania» v1): «● Tu micro está abierto»
    if (e.micro === "abierto" && e.corro) return { clave: "abierto", icono: "●", texto: "Tu micro está abierto: te oye el corro." };
    if (e.micro === "abierto") return { clave: "abierto", icono: "🎙", texto: "Micrófono abierto: te oyen." };
    if (e.micro === "abriendo") return { clave: "abriendo", icono: "⏳", texto: "Abriendo el micrófono…" };
    if (e.motivo === "micro_denegado") return { clave: "denegado", icono: "🚫", texto: "El navegador no deja usar el micrófono: permítelo en los ajustes del sitio." };
    if (e.motivo === "sin_micro") return { clave: "sin_micro", icono: "🚫", texto: "No se encuentra ningún micrófono." };
    if (e.motivo === "error_micro") return { clave: "error", icono: "🚫", texto: "No se pudo abrir el micrófono." };
    if (!e.puede) return { clave: "sin_permiso", icono: "🚫", texto: e.papel === "familia" ? "Micrófono cerrado: no tienes la palabra." : "Micrófono sin permiso." };
    return { clave: "cerrado", icono: "🔇", texto: "Micrófono cerrado: no te oyen." };
  }
  // lo que se enseña: e = { guiada, papel, puede, micro, motivo, auriculares, mano (¿la tienes levantada?), puesto (n | null), ocupado (¿una petición en vuelo?) }, m = modo
  function vista(e?: any, m?: any) {
    m = modo(m);
    if (!enSala(e)) return { visible: false, micro: null, primaria: { accion: "ninguna", texto: "", aria: "", off: true }, silenciar: false, cola: "", auric: false, aviso: "" };
    var abierto: any = e.micro !== "cerrado", mant: any = m === "mantener" && !modera(e.papel), t: any = textoMicro(e), p: any;
    if (e.puede || abierto) {
      p = abierto
        ? { accion: "micro", texto: mant ? "Hablando · suelta para callar" : "Silenciarme", aria: mant ? "Hablando: suelta para silenciar tu micrófono" : "Silenciar mi micrófono" }
        : { accion: "micro", texto: mant ? "Mantén pulsado para hablar" : "Hablar", aria: mant ? "Mantén pulsado para hablar" : "Hablar: abrir mi micrófono" };
      p.off = e.micro === "abriendo" && !mant;
    } else if (e.papel === "familia") {
      p = e.mano ? { accion: "bajar", texto: "Bajar la mano", aria: "Bajar la mano", off: !!e.ocupado } : { accion: "levantar", texto: "Levantar la mano", aria: "Levantar la mano para pedir la palabra", off: !!e.ocupado };
    } else p = { accion: "ninguna", texto: "Sin permiso de micrófono", aria: "Sin permiso de micrófono", off: true };
    return { visible: true, micro: t, primaria: p, silenciar: abierto && p.accion === "micro" && mant,
      cola: e.papel === "familia" && !e.puede && e.mano ? textoCola(e.puesto) : "", auric: !!e.puede || abierto, aviso: abierto && !e.auriculares ? AVISO_ESPACIAL : "" };
  }
  // un gesto sobre el botón, la tecla o el gatillo: o = { modo, papel, tipo ("baja" | "suelta"), micro, sosten (¿lo abrió este mismo gesto, aún apretado?) }
  // → { accion: "abre" | "cierra" | "nada", sosten }. «baja» alterna (abre si está cerrado; si no, cierra); en mantener, «suelta» cierra lo que abrió «baja»
  function entrada(o?: any) {
    var mant: any = modo(o.modo) === "mantener" && !modera(o.papel);
    if (o.tipo === "baja") return o.micro === "cerrado" ? { accion: "abre", sosten: mant } : { accion: "cierra", sosten: false };
    if (o.tipo === "suelta" && mant && o.sosten) return { accion: o.micro === "cerrado" ? "nada" : "cierra", sosten: false };
    return { accion: "nada", sosten: !!o.sosten && o.tipo !== "suelta" };
  }
  // ¿se puede usar esto como micro ahora (la tecla y el gatillo lo respetan)?
  function activo(v?: any) { return !!(v && v.visible && v.primaria.accion === "micro"); }
  // el texto único de la región aria-live: el micro y, si hay, la cola
  function textoEstado(v?: any) { return v && v.visible ? v.micro.texto + (v.cola ? " " + v.cola : "") : ""; }
  return { AVISO_VERSION: AVISO_VERSION, AVISO: AVISO, URL_CONSENTIMIENTO: URL_CONSENTIMIENTO, consentimiento: consentimiento, requiere: requiere, errorAceptar: errorAceptar, lineas: lineas,
    MODOS: MODOS, DEFECTO: DEFECTO, MANO_MS: MANO_MS, AVISO_S: AVISO_S, MENSAJE_S: MENSAJE_S, AVISO_ESPACIAL: AVISO_ESPACIAL, SILENCIO_S: SILENCIO_S, silencio: silencio, enSala: enSala, modo: modo, evento: evento, modera: modera, ordinal: ordinal, puestoDe: puestoDe,
    textoCola: textoCola, textoMicro: textoMicro, vista: vista, entrada: entrada, activo: activo, textoEstado: textoEstado };
})();
// [puro:fin]
