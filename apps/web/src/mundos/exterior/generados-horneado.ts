// Las variantes HORNEADAS de los olivos generados (ADR-0018, contratos/olivo-horneado.md, O7e) y la fila de impostores que casa con ellas (contratos/olivo-impostor.md):
// lo que se lee del manifiesto de la finca, sin THREE ni estado. MU5-n (A3-2a): antes dentro de Generados en apps/web/motor/07ab_generados.js; el código es el de siempre,
// movido a funciones que reciben lo que antes leían del cierre (el manifiesto, las variantes del motor, el constructor M y la red). Lo usa generados.ts.
// Con la página servida por el servidor (D.base /teselas/…) se pide <D.base>olivos/manifiesto.json (mismo origen, con la cookie); si su formato, GEN_VERSION y
// CACHE_VERSION son las del motor, los tipos y semillas de las variantes salen de él, y cada variante se descarga (<huella>.br, Content-Encoding: br), se comprueba
// (tamaño, huella, cabecera, clave) y se decodifica. Cualquier fallo, o sin manifiesto: se calcula, como siempre (plan B).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export const ORDEN_EPOCAS = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];

/** la carpeta de lo horneado: ?olivosDir= (solo una ruta relativa del mismo origen acabada en «/», como ?api= de 13b) o, con la página del servidor
 *  (D.base /teselas/<finca>/), <D.base>olivos/; si no, ninguna (null) */
export function dirHorneado(busqueda: string, base: string | undefined): string | null {
  var m = /[?&]olivosDir=([^&#]*)/.exec(busqueda);
  if (m) { var p = decodeURIComponent(m[1] as string); return p.length > 1 && p.charAt(p.length - 1) === "/" && !/[^A-Za-z0-9_\-./]/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
  return /^\/teselas\//.test(base || "") ? base + "olivos/" : null;
}
/** longitud exacta y sin caracteres de fuera */
export function esCadena(x: A, n: number, prohibido: RegExp): boolean { return typeof x === "string" && x.length === n && !prohibido.test(x); }
/** "" si el manifiesto vale para este constructor (M: FORMATO_HORNEADO, GEN_VERSION, CACHE_VERSION, TIPOS); si no, por qué */
export function manifiestoNoVale(m: A, M: A): string {
  var ORDEN = ORDEN_EPOCAS;
  if (!m || typeof m !== "object") return "manifiesto ilegible";
  if (m.v !== 1) return "manifiesto v" + m.v;
  if (m.formato !== M.FORMATO_HORNEADO) return "formato " + m.formato + " (el motor lee el " + M.FORMATO_HORNEADO + ")";
  if (m.gen_version !== M.GEN_VERSION) return "gen_version " + m.gen_version + " (la del motor es " + M.GEN_VERSION + ")";
  if (m.cache_version !== M.CACHE_VERSION) return "cache_version " + m.cache_version + " (la del motor es " + M.CACHE_VERSION + ")";
  if (!Array.isArray(m.variantes) || !Array.isArray(m.epocas) || !m.epocas.length || ORDEN.indexOf(m.actual) < 0) return "manifiesto sin variantes, épocas o época actual";
  for (var i = 0; i < m.variantes.length; i++) {   // la huella va en la URL: solo 32 hexadecimales
    var v = m.variantes[i];
    if (!v || !esCadena(v.huella, 32, /[^0-9a-f]/) || !M.TIPOS[v.tipo] || ORDEN.indexOf(v.epoca) < 0 || !(v.semilla >= 0 && v.semilla <= 4294967295 && v.semilla % 1 === 0) || !(v.bytes > 0)) return "fila de variante " + i + " mal formada";
  }
  for (var j = 0; j < m.epocas.length; j++) { var w = m.epocas[j]; if (!w || ORDEN.indexOf(w.epoca) < 0 || !esCadena(w.desde, 5, /[^0-9-]/) || !esCadena(w.hasta, 5, /[^0-9-]/)) return "época " + j + " mal formada"; }
  return "";
}
/** la fila del manifiesto de la variante e (tipo, semilla, época) en el nivel niv, o null */
export function filaDe(manif: A, e: A, niv: string): A {
  if (!manif) return null;
  for (var i = 0; i < manif.variantes.length; i++) { var v = manif.variantes[i]; if (v.tipo === e.tipo && v.semilla === e.semilla && v.nivel === niv && v.epoca === e.epoca) return v; }
  return null;
}
/** las variantes (tipo, semilla) de la época ep en el manifiesto, sin repetir y en su orden; null si no hay ninguna */
export function variantesDeEpoca(m: A, ep: string): { tipo: string; semilla: number }[] | null {
  var vistos: Record<string, boolean> = {}, varSem: { tipo: string; semilla: number }[] = [];
  m.variantes.forEach(function (v: A) { var k = v.tipo + "|" + v.semilla; if (v.epoca === ep && !vistos[k]) { vistos[k] = true; varSem.push({ tipo: v.tipo, semilla: v.semilla }); } });
  return varSem.length ? varSem : null;
}
/** una variante horneada: descarga (el navegador ya deshizo el brotli), tamaño, huella, cabecera (formato, versiones, nivel y la MISMA clave de la caché) y decodifica.
 *  red: el fetch del mismo origen; dir: la carpeta de lo horneado; M: el constructor */
export function descarga(red: A, dir: string, M: A, fila: A, ck: string, niv: string): Promise<A> {
  return red(dir + fila.huella + ".br", { credentials: "same-origin" })
    .then(function (r: A) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
    .then(function (ab: A) {
      var b = new Uint8Array(ab);
      if (b.length !== fila.bytes) throw new Error("tamaño " + b.length + " ≠ " + fila.bytes);
      return M.huellaBytes(b).then(function (h: A) {
        if (h !== fila.huella) throw new Error("huella distinta");
        var cab = M.leeCabecera(b);
        if (cab.formato !== M.FORMATO_HORNEADO || cab.gen_version !== M.GEN_VERSION || cab.cache_version !== M.CACHE_VERSION || cab.nivel !== niv || cab.clave !== ck) throw new Error("cabecera que no es la pedida");
        var r = M.decodifica(b).receta;   // las normales, tal cual (sin renormalizar: el sombreador normaliza)
        if (!r || !Array.isArray(r.piezas) || !r.escala || !r.medidas) throw new Error("receta incompleta");
        return r;
      });
    });
}
/** la fila de impostores (contratos/olivo-impostor.md, formato 1) de la época ep que se dibuja, solo si casa con las variantes que dibuja el motor (varSem):
 *  mismas variantes en el mismo orden (tipo, semilla) y cada `fuente` es la huella de su E2 en el manifiesto; si no, {motivo}; sin impostores, null */
export function filaImpostor(manif: A, varSem: A, M: A, ep: string): A {
  if (!manif || !Array.isArray(manif.impostores) || !varSem || !M || !M.IMPOSTOR) return null;
  var f = manif.impostores.filter(function (x: A) { return x && x.epoca === ep; })[0];
  if (!f) return null;
  var no = M.validaFilaImpostor(f);
  if (!no.length && f.variantes.length !== varSem.length) no.push(f.variantes.length + " variantes en el impostor y " + varSem.length + " en el motor");
  if (!no.length) f.variantes.forEach(function (v: A, k: number) {
    var e2 = filaDe(manif, { tipo: varSem[k].tipo, semilla: varSem[k].semilla, epoca: ep }, "E2");
    if (v.tipo !== varSem[k].tipo || v.semilla !== varSem[k].semilla || !e2 || e2.huella !== v.fuente) no.push("la variante " + k + " del impostor no es la E2 del motor");
  });
  return no.length ? { motivo: no.join("; ").slice(0, 120) } : f;
}
