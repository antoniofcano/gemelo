"use strict";
// Pruebas inestables a la vista (PB6). Lógica pura, sin lanzar nada: el ejecutor se inyecta (la puerta pasa el de node:test; la prueba, uno falso).
//  - firmas: lista corta y versionada (inestables.json) de fallos de infraestructura;
//  - orquesta(): ejecuta, reintenta UNA vez los ficheros cuyos fallos casan TODOS con alguna firma, y decide el código de salida;
//  - registro: pruebas/salida/inestables.json (no versionado), una entrada por fallo;
//  - informe(): lo que se dice en voz alta al final.
const fs = require("fs");
const path = require("path");

const FIRMAS = path.join(__dirname, "inestables.json");
const REGISTRO = path.join(__dirname, "..", "salida", "inestables.json");

function cargaFirmas(fichero) {
  const j = JSON.parse(fs.readFileSync(fichero || FIRMAS, "utf8"));
  return j.firmas.map(f => {
    if (!f.id || !f.patron || !f.motivo || !f.tarea) throw new Error("firma sin id, patrón, motivo o tarea: " + JSON.stringify(f));
    return Object.assign({}, f, { re: new RegExp(f.patron) });
  });
}
const casa = (mensaje, firmas) => firmas.find(f => f.re.test(mensaje)) || null;
const resumen = m => (String(m).split("\n").find(l => l.trim()) || "").trim().slice(0, 160);

function leeRegistro(fichero) { try { return JSON.parse(fs.readFileSync(fichero || REGISTRO, "utf8")); } catch (e) { return []; } }
function apunta(entradas, fichero) {
  if (!entradas.length) return;
  fichero = fichero || REGISTRO;
  fs.mkdirSync(path.dirname(fichero), { recursive: true });
  fs.writeFileSync(fichero, JSON.stringify(leeRegistro(fichero).concat(entradas), null, 1));
}

// ejecuta(ficheros|null) -> Promise<{codigo, fallos:[{file,name,mensaje}]}>; null = todo lo pedido.
// Devuelve {codigo, pasaronAlReintento, fallidas, entradas}.
async function orquesta({ ejecuta, firmas, ahora }) {
  const fecha = (ahora ? ahora() : new Date()).toISOString();
  const primera = await ejecuta(null);
  const porFichero = new Map();
  for (const f of primera.fallos) { const k = f.file || ""; if (!porFichero.has(k)) porFichero.set(k, []); porFichero.get(k).push(f); }
  const entradas = [], pasaronAlReintento = [], fallidas = [];
  for (const [file, fallos] of porFichero) {
    const sig = fallos.map(f => casa(f.mensaje, firmas));
    const reintentable = !!file && sig.every(Boolean);
    let paso = null;
    if (reintentable) paso = (await ejecuta([file])).codigo === 0;
    fallos.forEach((f, i) => {
      const e = { prueba: (file ? path.basename(file) : "?") + " :: " + f.name, fecha, motivo: sig[i] ? sig[i].id + ": " + sig[i].motivo : resumen(f.mensaje), reintento: reintentable ? (paso ? "pasó" : "falló") : "no se reintenta" };
      entradas.push(e);
      if (reintentable && paso) pasaronAlReintento.push({ prueba: e.prueba, firma: sig[i] });
    });
    if (!reintentable || !paso) fallidas.push(file || "(sin fichero)");
  }
  // código distinto de 0 sin fallos recogidos (el reporter no vio nada): fallo real, nunca se reintenta
  const codigo = primera.codigo !== 0 && !porFichero.size ? primera.codigo : (fallidas.length ? 1 : 0);
  return { codigo, pasaronAlReintento, fallidas, entradas };
}

function informe(res, registro) {
  const l = [];
  if (res.pasaronAlReintento.length) {
    l.push("PRUEBAS INESTABLES: " + res.pasaronAlReintento.length + " pasaron al segundo intento (cuentan como pasadas):");
    for (const p of res.pasaronAlReintento) {
      const antes = registro.filter(e => e.prueba === p.prueba), desde = antes.map(e => e.fecha).sort()[0];
      l.push("  - pasó al segundo intento: " + p.firma.motivo + " [" + p.prueba + "] -> " + p.firma.tarea + "; " + (antes.length ? "falla a veces desde " + desde.slice(0, 10) + " (" + antes.length + " registros)" : "primera vez registrada"));
    }
  } else l.push("Pruebas inestables: ninguna pasó al reintento.");
  const reales = res.entradas.filter(e => e.reintento !== "pasó");
  if (reales.length) l.push("Siguen en rojo " + reales.length + " fallo(s) (" + reales.filter(e => e.reintento === "falló").length + " reintentados sin éxito, " + reales.filter(e => e.reintento === "no se reintenta").length + " sin firma conocida).");
  return l.join("\n");
}

module.exports = { cargaFirmas, casa, leeRegistro, apunta, orquesta, informe, REGISTRO, FIRMAS };
