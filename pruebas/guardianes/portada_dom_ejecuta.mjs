// Ejecutor de las pruebas de la portada con un DOM de mentira (OF13b-8b). Lo lanza pruebas/guardianes/portada_dom.test.js, UN PROCESO POR ESCENARIO
// (portada.js guarda su estado en el módulo y se ejecuta al importarlo). Sin Chrome, sin red y sin llaves reales: `document`, `fetch`, `localStorage` y
// `navigator.credentials` son de mentira; la librería @simplewebauthn/browser y portada.js son las de verdad. Imprime en la última línea un JSON con lo observado.
// NO sustituye a mirar la pantalla en un navegador (foco real, <dialog> real, lector de pantalla): eso NO está probado.
import { pathToFileURL } from "node:url";

const escenario = process.argv[2], raiz = process.argv[3];
const IDS_OCULTOS = new Set(["misLlaves", "btnReintentaLlaves", "btnOtraLlave", "campoOtraLlave", "llavesVacio", "avLlaves", "okLlaves", "salidaTotal", "avSalidaTotal", "bloqueLlave", "avLlave", "ofertaLlave"]);
const elementos = new Map(), manejadores = new Map(), foco = [], pidos = [];
let ceremoniasVivas = 0, ceremoniasMax = 0, ceremoniasEmpezadas = 0;

function elemento(id) {
  const e = {
    id, hidden: IDS_OCULTOS.has(id), textContent: "", value: "", disabled: false, open: false, dataset: {}, className: "", type: "", children: [], attrs: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(t, f) { (manejadores.get(id + ":" + t) || manejadores.set(id + ":" + t, []).get(id + ":" + t)).push(f); },
    click() { for (const f of manejadores.get(id + ":click") || []) f({ target: e }); },
    focus() { foco.push(id); }, select() {}, scrollIntoView() {},
    showModal() { e.open = true; }, close() { e.open = false; },
    setAttribute(k, v) { e.attrs[k] = v; }, removeAttribute() {}, getAttribute: k => e.attrs[k] ?? null,
    replaceChildren(...h) { e.children = h; }, append(...h) { e.children.push(...h); }, appendChild(h) { e.children.push(h); return h; },
    closest: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  return e;
}
const pide = id => elementos.get(id) || elementos.set(id, elemento(id)).get(id);
const clase = nombre => ({ ...elemento("." + nombre), className: nombre });

globalThis.document = {
  getElementById: pide, querySelector: () => pide("h1"), querySelectorAll: () => [], createElement: t => ({ ...clase(t), tagName: t }), createElementNS: (_, t) => clase(t), createTextNode: t => ({ nodeValue: t }),
  addEventListener(t, f) { (manejadores.get("document:" + t) || manejadores.set("document:" + t, []).get("document:" + t)).push(f); },
  documentElement: { dataset: {} },
};
const ventana = new Map();
globalThis.window = { addEventListener: (t, f) => ventana.set(t, f) };
globalThis.location = { hash: process.env.PORTADA_HASH || "", pathname: "/", assign() {} };
globalThis.history = { replaceState: (_a, _b, url) => { globalThis.location.hash = String(url).startsWith("#") ? String(url) : ""; } };
const almacen = new Map();
globalThis.localStorage = { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)) };
globalThis.confirm = () => false;
// `navigator.credentials` de mentira: cada ceremonia es una promesa que solo acaba si se aborta (la persona no pulsa nada) y se cuenta mientras vive
globalThis.PublicKeyCredential = function PublicKeyCredential() {};
globalThis.PublicKeyCredential.isConditionalMediationAvailable = async () => true;
globalThis.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
const credenciales = {
  get: o => new Promise((_, mal) => {
    ceremoniasVivas++; ceremoniasEmpezadas++; ceremoniasMax = Math.max(ceremoniasMax, ceremoniasVivas);
    const aborta = () => { ceremoniasVivas--; const e = new Error("abortada"); e.name = "AbortError"; mal(e); };
    if (o.signal?.aborted) return aborta();
    o.signal?.addEventListener("abort", aborta, { once: true });
  }),
  create: () => new Promise(() => {}),
};
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131", credentials: credenciales }, configurable: true });

const SESION = { primer_acceso: false, alias: "Mirlo", alias_visible: false, titular: true, entrada: "enlace", rol: "hogar", normas_version: 1 };
const LLAVE = { id: 7, nombre: "Windows Hello de este ordenador", creada_en: "2026-11-01T10:00:00Z", ultima_vez_en: null, descubrible: true, sincronizada: false, es_esta: false };
const OPCIONES = { challenge: "AAAAAAAAAAAAAAAAAAAAAA", rpId: "localhost", userVerification: "required", timeout: 60000 };
const respuestas = new Map();   // "METODO ruta" → cola de respuestas (la última se repite)
const pon = (k, ...rs) => respuestas.set(k, rs);
globalThis.fetch = async (ruta, o = {}) => {
  const k = (o.method || "GET") + " " + ruta;
  pidos.push({ k, cuerpo: o.body ? JSON.parse(o.body) : undefined });
  const cola = respuestas.get(k);
  if (!cola) throw new Error("ruta no prevista: " + k);
  const r = cola.length > 1 ? cola.shift() : cola[0];
  if (r instanceof Error) throw r;
  return { status: r.status, json: async () => r.json };
};
const reposo = (ms = 40) => new Promise(ok => setTimeout(ok, ms));
const espera = async (cond, ms = 4000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await reposo(10); };
const texto = id => pide(id).textContent;
const salida = {};

async function arranca() {
  await import(pathToFileURL(raiz + "/apps/web/portada/portada.js").href);
  await reposo(80);
}
const puro = () => import(pathToFileURL(raiz + "/apps/web/portada/llave_puro.js").href);

if (escenario === "lista_falla" || escenario === "lista_429") {
  const P = await puro();
  process.env.PORTADA_HASH = "";
  globalThis.location.hash = "#dispositivos";
  pon("GET /api/sesion", { status: 200, json: SESION });
  pon("GET /api/yo/llaves", escenario === "lista_429" ? { status: 429, json: { error: "demasiadas_peticiones", mensaje: "x" } } : { status: 500, json: null }, { status: 200, json: { llaves: [LLAVE], maximo: 10, puede_anadir: true } });
  await arranca();
  await espera(() => !pide("btnReintentaLlaves").hidden);
  salida.fallo = { tarjeta_oculta: pide("misLlaves").hidden, aviso_visible: !pide("avLlaves").hidden, aviso: texto("avLlavesTxt"), reintento_visible: !pide("btnReintentaLlaves").hidden,
    lista_vacia: pide("listaLlaves").children.length === 0, vacio_oculto: pide("llavesVacio").hidden, texto_esperado: escenario === "lista_429" ? P.TEXTO_LISTA_LIMITE : P.TEXTO_ERROR_LISTA,
    vincular_sigue: pide("fVincular") !== undefined, salida_total_visible: !pide("salidaTotal").hidden };
  pide("btnReintentaLlaves").click();
  await espera(() => pide("btnReintentaLlaves").hidden);
  salida.tras = { tarjeta_oculta: pide("misLlaves").hidden, aviso_oculto: pide("avLlaves").hidden, reintento_oculto: pide("btnReintentaLlaves").hidden, llaves: pide("listaLlaves").children.length, peticiones_lista: pidos.filter(p => p.k === "GET /api/yo/llaves").length };
} else if (escenario === "salida_total" || escenario === "salida_total_falla" || escenario === "salida_total_oficina" || escenario === "salida_total_gafas") {
  const P = await puro();
  globalThis.location.hash = "#dispositivos";
  const sesion = escenario === "salida_total_oficina" ? { ...SESION, rol: "oficina" } : escenario === "salida_total_gafas" ? { ...SESION, titular: false, entrada: "codigo" } : SESION;
  pon("GET /api/sesion", { status: 200, json: sesion });
  pon("GET /api/yo/llaves", { status: 200, json: { llaves: [LLAVE], maximo: 10, puede_anadir: true } });
  pon("POST /api/yo/llaves/quitar-todas", escenario === "salida_total_falla" ? { status: 500, json: null } : { status: 200, json: { sesiones_cerradas: 2, llaves_quitadas: 1 } });
  await arranca();
  await reposo(80);
  salida.visible = !pide("salidaTotal").hidden;
  if (salida.visible) {
    pide("btnSalirYQuitar").click();
    await espera(() => pide("dlgSalirTodo").open);
    salida.dialogo = { abierto: pide("dlgSalirTodo").open, texto: texto("dlgSalirTodoTxt"), texto_esperado: P.TEXTO_SALIDA_TOTAL, foco_en_no: foco.at(-1) === "dlgSalirTodoNo" };
    pide("dlgSalirTodoNo").click();
    salida.tras_no = { cerrado: !pide("dlgSalirTodo").open, posts: pidos.filter(p => p.k === "POST /api/yo/llaves/quitar-todas").length, foco_en_boton: foco.at(-1) === "btnSalirYQuitar" };
    pide("btnSalirYQuitar").click();
    await espera(() => pide("dlgSalirTodo").open);
    pide("dlgSalirTodoSi").click();
    await espera(() => pidos.some(p => p.k === "POST /api/yo/llaves/quitar-todas"));
    await reposo(120);
    salida.tras_si = {
      cerrado: !pide("dlgSalirTodo").open, posts: pidos.filter(p => p.k === "POST /api/yo/llaves/quitar-todas"),
      sesion_cerrada: pide("accionesCon").hidden === true, aviso_error: pide("avSalidaTotal").hidden ? null : texto("avSalidaTotalTxt"),
      anuncio: texto("anuncio"), anuncio_esperado: P.TEXTO_SALIDA_TOTAL_HECHA, boton_libre: pide("btnSalirYQuitar").disabled === false,
    };
  }
} else if (escenario === "ceremonias") {
  // «Entrar con mi llave» seguido de otro intento (y del autorrelleno de la pantalla) no deja ceremonias colgadas: solo una viva a la vez, y ninguna al salir
  globalThis.location.hash = "#entrar";
  pon("GET /api/sesion", { status: 401, json: { error: "sin_sesion" } });
  pon("POST /api/auth/llave/opciones", { status: 200, json: OPCIONES });
  await arranca();
  await espera(() => ceremoniasVivas >= 1);
  salida.tras_autorrelleno = { vivas: ceremoniasVivas, empezadas: ceremoniasEmpezadas, boton_visible: !pide("bloqueLlave").hidden };
  pide("btnLlave").click(); await reposo(80);
  salida.tras_boton = { vivas: ceremoniasVivas, empezadas: ceremoniasEmpezadas };
  pide("btnLlave").click(); await reposo(80);
  pide("btnLlave").click(); await reposo(80);
  salida.tras_tres = { vivas: ceremoniasVivas, empezadas: ceremoniasEmpezadas, max: ceremoniasMax };
  globalThis.location.hash = "";
  ventana.get("hashchange")?.(); await reposo(80);
  salida.al_salir = { vivas: ceremoniasVivas, max: ceremoniasMax };
} else {
  throw new Error("escenario desconocido: " + escenario);
}
console.log("RESULTADO " + JSON.stringify(salida));
process.exit(0);
