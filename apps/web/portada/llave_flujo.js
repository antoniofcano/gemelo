// Los recorridos de las llaves de acceso en la portada (OF13b-7, ADR-0029): entrar con la llave (botón y autorrelleno), la oferta tras el
// primer enlace, «Mis llaves». Sin DOM y sin importar la librería: todo lo de fuera entra por `creaLlaves()` (portada.js le pasa fetch,
// @simplewebauthn/browser y localStorage; las pruebas, de mentira: pruebas/guardianes/portada_llave.test.js). Devuelve resultados, nunca
// toca la pantalla. La ceremonia la hace @simplewebauthn/browser (regla 12).
import { TEXTO_ERROR_ENTRADA, TEXTO_ERROR_LISTA, TEXTO_LISTA_LIMITE, debeOfrecer, destinoSeguro, leeRecuerdo, nombrePropuesto, recuerdoDe, textoErrorLlave, textoFalloAlta, textoFalloSalidaTotal } from "./llave_puro.js";

/**
 * @param {object} d
 * @param {(metodo: string, ruta: string, cuerpo?: object) => Promise<{status: number, json: any}>} d.pide  fetch a la api; sin cuerpo no manda content-type
 * @param {object} d.lib  { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, platformAuthenticatorIsAvailable, startAuthentication, startRegistration, cancelCeremony }
 * @param {{lee: () => string|null, guarda: (bruto: string) => void}} d.memoria  el recuerdo de la oferta (localStorage con try/catch)
 * @param {() => number} d.ahora
 * @param {string} d.agente  navigator.userAgent
 */
export function creaLlaves({ pide, lib, memoria, ahora, agente }) {
  let ceremonia = 0;   // un solo reto vivo por navegador: cada intento nuevo invalida al anterior

  const llama = async (metodo, ruta, cuerpo) => {
    try { return await pide(metodo, ruta, cuerpo); } catch { return { status: 0, json: null }; }
  };
  const soporte = () => { try { return !!lib.browserSupportsWebAuthn(); } catch { return false; } };
  const aborta = () => { try { lib.cancelCeremony(); } catch { /* nada que cancelar */ } };
  const abortada = e => !!e && (e.code === "ERROR_CEREMONY_ABORTED" || e.name === "AbortError");

  /** ¿Se puede arrancar la mediación condicional (el navegador sugiere la llave al tocar el campo del correo)? */
  async function admiteAutorrelleno() {
    if (!soporte()) return false;
    try { return !!(await lib.browserSupportsWebAuthnAutofill()); } catch { return false; }
  }

  /**
   * Entrar con la llave, sin correo. `condicional`: lo arranca la pantalla al abrirse (autorrelleno): si falla o se aborta no molesta.
   * Resultado: { ok: true, destino, primer_acceso } | { ok: false, obsoleta: true } (otro intento la sustituyó) | { ok: false, texto } (mismo texto siempre).
   * ANTES de pedir las opciones se aborta la ceremonia anterior: pedir otras opciones pisa la cookie del reto (hallazgo de OF13b-5).
   */
  async function entra({ condicional = false } = {}) {
    if (!soporte()) return { ok: false, texto: TEXTO_ERROR_ENTRADA };
    const mio = ++ceremonia;
    aborta();
    const fallo = () => (condicional ? { ok: false, silencioso: true, texto: TEXTO_ERROR_ENTRADA } : { ok: false, texto: TEXTO_ERROR_ENTRADA });
    const o = await llama("POST", "/api/auth/llave/opciones", {});
    if (mio !== ceremonia) return { ok: false, obsoleta: true };
    if (o.status !== 200 || !o.json) return fallo();
    let respuesta;
    try { respuesta = await lib.startAuthentication({ optionsJSON: o.json, useBrowserAutofill: condicional }); }
    catch (e) { return mio !== ceremonia || abortada(e) ? { ok: false, obsoleta: true } : fallo(); }
    if (mio !== ceremonia) return { ok: false, obsoleta: true };
    const r = await llama("POST", "/api/auth/llave", { respuesta });
    const destino = r.status === 200 && r.json && r.json.ok === true ? destinoSeguro(r.json.destino) : null;
    // si la persona ya eligió la llave y la api la rechaza, se le dice aunque venga del autorrelleno
    return destino ? { ok: true, destino, primer_acceso: r.json.primer_acceso === true } : { ok: false, texto: TEXTO_ERROR_ENTRADA };
  }

  /** Deja de esperar (al salir de la pantalla de entrar): la mediación condicional no queda colgada. */
  function paraEntrada() { ceremonia++; aborta(); }

  /** Las llaves de la cuenta: { ok, llaves, maximo, puede_anadir } | { ok: false, texto }. */
  async function lista() {
    const r = await llama("GET", "/api/yo/llaves");
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.llaves)) return { ok: false, status: r.status, texto: r.status === 429 ? TEXTO_LISTA_LIMITE : TEXTO_ERROR_LISTA };
    return { ok: true, llaves: r.json.llaves, maximo: r.json.maximo, puede_anadir: r.json.puede_anadir === true };
  }

  /** ¿Hay que ofrecer «Crear una llave en este aparato»? Mira primero lo barato y solo entonces pide la lista. */
  async function evalua(sesion) {
    const recuerdo = leeRecuerdo(memoria.lee(), ahora());
    if (!debeOfrecer({ sesion, llaves: { puede_anadir: true }, soporte: soporte(), recuerdo })) return { ofrecer: false };
    let plataforma = false;
    try { plataforma = !!(await lib.platformAuthenticatorIsAvailable()); } catch { plataforma = false; }
    if (!plataforma) return { ofrecer: false };
    const l = await lista();
    return l.ok && debeOfrecer({ sesion, llaves: l, soporte: true, recuerdo }) ? { ofrecer: true, llaves: l } : { ofrecer: false };
  }

  /** «Ahora no» (30 días) y «Este aparato no es mío» (siempre): se recuerda en este navegador, que es solo comodidad. */
  function responde(tipo) {
    const bruto = recuerdoDe(tipo, ahora());
    if (!bruto) return;
    try { memoria.guarda(bruto); } catch { /* sin almacenamiento: se volverá a preguntar */ }
  }

  /** Alta en dos pasos. Un fallo no rompe nada: { ok: false, texto, cancelada? }. */
  async function crea(nombre) {
    if (!soporte()) return { ok: false, texto: "Este navegador no admite llaves de acceso." };
    ++ceremonia;
    aborta();
    const o = await llama("POST", "/api/yo/llaves/opciones", {});
    if (o.status !== 200 || !o.json) return { ok: false, texto: textoFalloAlta(o) };
    let respuesta;
    try { respuesta = await lib.startRegistration({ optionsJSON: o.json }); }
    catch (e) { return { ok: false, cancelada: abortada(e) || (e && e.name === "NotAllowedError"), texto: textoErrorLlave(e) }; }
    const nom = (nombre || nombrePropuesto(agente)).trim().slice(0, 40);
    const r = await llama("POST", "/api/yo/llaves", { nombre: nom, respuesta });
    if (r.status !== 201) return { ok: false, texto: textoFalloAlta(r) };
    responde("hecha");
    return { ok: true, nombre: (r.json && r.json.nombre) || nom };
  }

  /** Quita una llave: sin cuerpo ni content-type JSON (hallazgo de OF13b-4). { ok, quedan, era_esta } | { ok: false, texto }. */
  async function quita(id) {
    const r = await llama("DELETE", "/api/yo/llaves/" + encodeURIComponent(String(id)));
    if (r.status === 200 && r.json) return { ok: true, quedan: r.json.quedan, era_esta: r.json.era_esta === true };
    if (r.status === 404) return { ok: false, texto: "Esa llave ya no está. Se ha actualizado la lista.", yaNoEsta: true };
    return { ok: false, texto: textoFalloAlta(r).replace("guardar", "quitar") };
  }

  /**
   * «Salir de todos y quitar las llaves»: un solo POST con `{ confirmar: true }`. Se invalida cualquier ceremonia en vuelo (ya no hay con qué entrar).
   * { ok: true, sesiones, llaves } | { ok: false, status, texto } (la sesión sigue abierta). Si el recuerdo de este navegador era «hecha» (ya tenía una
   * llave aquí), se borra: la llave ya no existe y se podrá volver a ofrecer; «nunca» (este aparato no es mío) se respeta.
   */
  async function quitaTodas() {
    ++ceremonia;
    aborta();
    const r = await llama("POST", "/api/yo/llaves/quitar-todas", { confirmar: true });
    if (r.status !== 200 || !r.json) return { ok: false, status: r.status, texto: textoFalloSalidaTotal(r) };
    try { if (leeRecuerdo(memoria.lee(), ahora()).tipo === "hecha") memoria.guarda(""); } catch { /* sin almacenamiento: solo comodidad */ }
    return { ok: true, sesiones: Number(r.json.sesiones_cerradas) || 0, llaves: Number(r.json.llaves_quitadas) || 0 };
  }

  return { soporte, admiteAutorrelleno, entra, paraEntrada, lista, evalua, responde, crea, quita, quitaTodas, nombrePropuesto: () => nombrePropuesto(agente) };
}
