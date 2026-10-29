// Hornero de olivos (ADR-0018, O7c): hornea las VARIANTES compartidas de una finca (tipo × semilla × nivel E2/E2VR × época actual y siguiente) en
// objetos inmutables `<huella>.br` y escribe el manifiesto de la finca el ÚLTIMO (contratos/olivo-horneado.md, contratos/hornero-manifiesto.schema.json).
//
//   GEMELO_DATOS=<indice.json o su carpeta> node tuberia/olivos/hornero.mjs --salida <carpeta> [opciones]
//     --finca <id>       id de la finca (por defecto, el finca_id del índice; con --indice explícito además se comprueba que coincida)
//     --indice <ruta>    índice.json o su carpeta (por defecto GEMELO_DATOS; sin índice basta --finca: las variantes no dependen de los olivos)
//     --salida <carpeta> raíz de lo servido: se escribe en <salida>/<finca>/olivos/ (la que Caddy sirve como /teselas/<finca>/olivos/)
//     --fecha AAAA-MM-DD fecha para la época actual (por defecto hoy, en UTC); la siguiente sale del ciclo (epocas.js)
//     --release          brotli 11 en vez de 9 (el manifiesto lo dice; con otra calidad que la del manifiesto anterior, todo se vuelve a comprimir)
//     --limpia           borra los objetos que ni el manifiesto nuevo ni el anterior (manifiesto.anterior.json) referencian
//     --estado <ruta>    dónde escribir estado.json (por defecto <salida>/<finca>/olivos/estado.json)
//     --calendario <ruta> otro epocas-calendario.json (por defecto contratos/epocas-calendario.json)
//     --propios          NO implementado (propios E0/E1 por tesela con su manifiesto binario): sale con error
//   Avance por stderr y en estado.json ({fase, hechas, total, error...}); stdout, una línea JSON con el resumen.
//
// Incremental: lo que el manifiesto existente ya tiene (misma versión de generador, de caché, de formato y calidad de brotli y el objeto en disco con su
// tamaño) se reutiliza sin generar; si no, se genera, y si el objeto con esa huella ya existe no se vuelve a escribir. Una segunda corrida sin cambios no
// toca nada (ni el manifiesto: conserva su horneado_en). Todo se escribe a un temporal y se renombra: nadie ve un objeto a medias.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const imp = f => import(pathToFileURL(path.join(OLIVO, f)).href);

/** Lo que hornea hoy, igual que el motor (apps/web/motor/07ab_generados.js: tipo «centenario3», SEM_VAR); el motor usará las del manifiesto cuando lo haya (O7e) */
export const TIPOS_VARIANTE = ["centenario3"], SEMILLAS_VARIANTE = [11, 23, 37, 51], NIVELES_VARIANTE = ["E2", "E2VR"];

/** El generador real (three-gen: requiere `cd apps/web/olivo && npm i`); las pruebas pasan uno sintético con la misma forma */
export async function generadorReal() {
  const O = await imp("index.js");
  return { GEN_VERSION: O.GEN_VERSION, CACHE_VERSION: O.CACHE_VERSION, claveReceta: O.claveReceta, receta: O.receta, aNivel: O.aNivel };
}

const ahoraISO = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const clavefila = f => [f.tipo, f.semilla, f.nivel, f.epoca].join("|");
const leeJson = ruta => { try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (e) { return null; } };
function escribeAtomico(ruta, datos) {
  const tmp = ruta + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, datos); fs.renameSync(tmp, ruta);
}

/** Valida el manifiesto contra su esquema (ajv, del package.json de la raíz) y lo que el esquema no dice. Devuelve [] o las líneas que fallan. */
export function validaManifiesto(m, carpeta) {
  const requiere = createRequire(path.join(RAIZ, "package.json"));
  let Ajv2020; try { Ajv2020 = requiere("ajv/dist/2020").default; } catch (e) { throw new Error("falta ajv: npm i en la raíz del repo"); }
  const v = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "hornero-manifiesto.schema.json"), "utf8")));
  const err = v(m) ? [] : v.errors.map(e => (e.instancePath || "/") + ": " + e.message);
  if (err.length) return err;
  if (!m.epocas.some(e => e.epoca === m.actual)) err.push("la época actual (" + m.actual + ") no está entre las horneadas");
  const vistas = new Set();
  for (const f of m.variantes) {
    const k = clavefila(f); if (vistas.has(k)) err.push("fila repetida: " + k); vistas.add(k);
    if (!m.epocas.some(e => e.epoca === f.epoca)) err.push("la fila " + k + " es de una época que no está en `epocas`");
    if (carpeta) {
      const r = path.join(carpeta, f.huella + ".br");
      if (!fs.existsSync(r)) err.push("falta el objeto " + f.huella + ".br"); else if (fs.statSync(r).size !== f.bytes_br) err.push(f.huella + ".br no pesa bytes_br");
    }
  }
  return err;
}

/**
 * @param o { finca, salida, fecha (Date | ISO), release, limpia, estado (ruta), calendario (objeto), generador, tipos, semillas, niveles, log (fn), ahora () → ISO }
 * @returns resumen { finca, carpeta, actual, siguiente, total, horneadas, reutilizadas, ya_existian, borrados, escribio_manifiesto, ms, bytes_por_nivel, ... }
 */
export async function hornea(o) {
  const t0 = Date.now(), log = o.log || (() => {});
  if (!o.finca || !/^[a-z0-9_]+$/.test(o.finca)) throw new Error("finca inválida: " + o.finca);
  if (!o.salida) throw new Error("falta la carpeta de salida");
  const H = await imp("horneado_node.js"), F = await imp("horneado.js"), E = await imp("epocas.js"), G = o.generador || await generadorReal();
  const cal = o.calendario || JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "epocas-calendario.json"), "utf8"));
  const tabla = E.tablaDe(cal, o.finca), calidad = o.release ? H.BROTLI_RELEASE : H.BROTLI_DIA;
  const faltaTabla = E.validaTabla(tabla); if (faltaTabla.length) throw new Error("calendario de épocas roto: " + faltaTabla.join("; "));
  const fecha = o.fecha ? (o.fecha instanceof Date ? o.fecha : new Date(String(o.fecha).length === 10 ? o.fecha + "T00:00:00Z" : o.fecha)) : new Date();
  if (isNaN(fecha)) throw new Error("fecha inválida: " + o.fecha);
  const actual = E.epocaDeFecha(tabla, fecha), siguiente = E.siguienteEpoca(actual), epocas = [actual, siguiente];
  const carpeta = path.join(o.salida, o.finca, "olivos"), rutaEstado = o.estado || path.join(carpeta, "estado.json"), rutaMan = path.join(carpeta, "manifiesto.json"), rutaAnt = path.join(carpeta, "manifiesto.anterior.json");
  fs.mkdirSync(carpeta, { recursive: true });

  // lo que hay que tener: tipo × semilla × nivel × época (el orden del manifiesto: época, nivel, tipo, semilla)
  const tipos = o.tipos || TIPOS_VARIANTE, semillas = o.semillas || SEMILLAS_VARIANTE, niveles = o.niveles || NIVELES_VARIANTE, quiero = [];
  for (const epoca of epocas) for (const nivel of niveles) for (const tipo of tipos) for (const semilla of semillas) quiero.push({ tipo, semilla, nivel, epoca });
  const st = { v: 1, finca: o.finca, fase: "inicio", hechas: 0, total: quiero.length, horneadas: 0, reutilizadas: 0, ya_existian: 0, epoca_actual: actual, error: null, empezado_en: ahoraISO(), actualizado_en: ahoraISO(), terminado_en: null, pid: process.pid };
  const publica = (fase, extra) => {
    Object.assign(st, extra || {}, { fase, actualizado_en: ahoraISO() });
    try { fs.mkdirSync(path.dirname(rutaEstado), { recursive: true }); escribeAtomico(rutaEstado, JSON.stringify(st, null, 2) + "\n"); } catch (e) { /* el estado nunca tumba el trabajo */ }
    log("[hornero " + o.finca + "] " + fase + " " + st.hechas + "/" + st.total + (st.error ? " ERROR " + st.error : ""));
  };
  try {
    if (o.propios) throw new Error("--propios no está implementado (ADR-0018 §1: opcional, apagado por defecto)");
    publica("leyendo el manifiesto anterior");
    // el manifiesto anterior solo vale si es de este mismo generador, formato y calidad: si no, no se reutiliza ninguna fila
    const ant = leeJson(rutaMan);
    const filasAnt = new Map(); // clave → fila
    if (ant && ant.finca === o.finca && ant.formato === F.FORMATO && ant.gen_version === G.GEN_VERSION && ant.cache_version === G.CACHE_VERSION && ant.brotli === calidad && Array.isArray(ant.variantes)) {
      for (const f of ant.variantes) {
        const r = path.join(carpeta, f.huella + ".br");
        if (fs.existsSync(r) && fs.statSync(r).size === f.bytes_br) filasAnt.set(clavefila(f), f);
      }
    }

    publica("horneando");
    const variantes = [], cacheE0 = new Map();   // E0 por (tipo, semilla, época): los dos niveles salen de la misma
    for (const q of quiero) {
      const viva = filasAnt.get(clavefila(q));
      if (viva) { variantes.push(viva); st.reutilizadas++; st.hechas++; publica("horneando"); continue; }
      const entrada = { tipo: q.tipo, epoca: q.epoca, semilla: q.semilla }, kE0 = [q.tipo, q.semilla, q.epoca].join("|");
      if (!cacheE0.has(kE0)) cacheE0.set(kE0, G.receta(entrada));
      const r = G.aNivel(cacheE0.get(kE0), q.nivel), clave = G.claveReceta(entrada, q.nivel);
      const ob = await H.horneaObjeto(r, { nivel: q.nivel, clave, gen_version: G.GEN_VERSION, cache_version: G.CACHE_VERSION }, calidad), destino = path.join(carpeta, ob.huella + ".br");
      if (fs.existsSync(destino) && fs.statSync(destino).size === ob.bytes_br) st.ya_existian++;
      else { escribeAtomico(destino, ob.br); st.horneadas++; }
      variantes.push({ tipo: q.tipo, semilla: q.semilla, nivel: q.nivel, epoca: q.epoca, huella: ob.huella, bytes: ob.bytes, bytes_br: ob.bytes_br });
      st.hechas++; publica("horneando");
    }

    // el manifiesto, el último; si no cambió nada, no se toca (conserva su horneado_en)
    publica("escribiendo el manifiesto");
    const nuevo = { v: 1, finca: o.finca, formato: F.FORMATO, gen_version: G.GEN_VERSION, cache_version: G.CACHE_VERSION, horneado_en: o.ahora ? o.ahora() : ahoraISO(), brotli: calidad, actual,
      epocas: epocas.map(e => ({ epoca: e, desde: tabla[e].desde, hasta: tabla[e].hasta })), variantes, propios: { activos: false } };
    const err = validaManifiesto(nuevo, carpeta);
    if (err.length) throw new Error("el manifiesto no valida: " + err.join("; "));
    const sinFecha = m => JSON.stringify(Object.assign({}, m, { horneado_en: "" }));
    let escribio = false;
    if (!ant || sinFecha(ant) !== sinFecha(nuevo)) {
      if (ant && ant.finca === o.finca) escribeAtomico(rutaAnt, JSON.stringify(ant, null, 2) + "\n");   // el anterior se conserva para quien lo tenga cargado
      escribeAtomico(rutaMan, JSON.stringify(nuevo, null, 2) + "\n"); escribio = true;
    }

    let borrados = 0;
    if (o.limpia) {
      publica("limpiando");
      const vivos = new Set(); for (const m of [leeJson(rutaMan), leeJson(rutaAnt)]) if (m) for (const f of m.variantes) vivos.add(f.huella + ".br");
      for (const n of fs.readdirSync(carpeta)) if (/^[0-9a-f]{32}\.br$/.test(n) && !vivos.has(n)) { fs.unlinkSync(path.join(carpeta, n)); borrados++; }
      st.borrados = borrados;
    }
    const bytes_por_nivel = {};
    for (const f of variantes) { const b = bytes_por_nivel[f.nivel] || (bytes_por_nivel[f.nivel] = { objetos: 0, bytes: 0, bytes_br: 0 }); b.objetos++; b.bytes += f.bytes; b.bytes_br += f.bytes_br; }
    st.terminado_en = ahoraISO(); publica("listo");
    return { finca: o.finca, carpeta, actual, siguiente, brotli: calidad, total: quiero.length, horneadas: st.horneadas, reutilizadas: st.reutilizadas, ya_existian: st.ya_existian, borrados,
      escribio_manifiesto: escribio, ms: Date.now() - t0, bytes_por_nivel, bytes_total: variantes.reduce((s, f) => s + f.bytes, 0), bytes_br_total: variantes.reduce((s, f) => s + f.bytes_br, 0) };
  } catch (e) {
    st.error = String(e && e.message || e); st.terminado_en = ahoraISO(); publica("error");
    throw e;
  }
}

// ---------- línea de órdenes
function lee(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (["--release", "--limpia", "--propios"].includes(x)) a[x.slice(2)] = true;
    else if (["--finca", "--indice", "--salida", "--fecha", "--estado", "--calendario"].includes(x)) a[x.slice(2)] = argv[++i];
    else throw new Error("opción desconocida: " + x);
  }
  return a;
}
export async function principal(argv) {
  const a = lee(argv), idx = a.finca ? a.indice : (a.indice || process.env.GEMELO_DATOS);   // con --finca no hace falta leer el índice (pesado): las variantes no dependen de los olivos
  let fincaIndice = null;
  if (idx) {
    const ruta = fs.statSync(idx).isDirectory() ? path.join(idx, "indice.json") : idx, D = JSON.parse(fs.readFileSync(ruta, "utf8"));
    fincaIndice = D.finca_id || null;
  }
  if (a.finca && fincaIndice && a.finca !== fincaIndice) throw new Error("--finca " + a.finca + " no es la del índice (" + fincaIndice + ")");
  const finca = a.finca || fincaIndice; if (!finca) throw new Error("falta --finca o un índice (--indice / GEMELO_DATOS)");
  if (!a.salida) throw new Error("falta --salida");
  return hornea({ finca, salida: a.salida, fecha: a.fecha, release: a.release, limpia: a.limpia, estado: a.estado, propios: a.propios,
    calendario: a.calendario ? JSON.parse(fs.readFileSync(a.calendario, "utf8")) : undefined, log: m => process.stderr.write(m + "\n") });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(r => { console.log(JSON.stringify(r)); }, e => { process.stderr.write("hornero: " + (e && e.message || e) + "\n"); process.exit(1); });
}
