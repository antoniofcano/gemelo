"use strict";
// Turno de lo pesado (política de pruebas, doc/operacion/TESTING.md §«Banco de pruebas»): en este equipo solo puede haber UN Chrome sin
// pantalla o UN entorno Docker de pruebas a la vez, lo lance la puerta, un guardián suelto o un agente desde su worktree. El candado vive
// en la carpeta temporal del sistema (común a todos los worktrees) y lo lleva proper-lockfile: si el proceso que lo tiene muere, el
// candado caduca solo (stale), así que un proceso colgado no deja el turno cogido para siempre.
//   GEMELO_BANCO   carpeta común del banco (por defecto <tmp>/gemelo-banco)
//   GEMELO_TURNO   «dentro» si el proceso ya está dentro de un turno (lo pone la puerta a sus hijos): no se vuelve a pedir
const fs = require("fs"), os = require("os"), path = require("path");
const cerrojo = require("proper-lockfile");

const BANCO = process.env.GEMELO_BANCO || path.join(os.tmpdir(), "gemelo-banco");
const FICHERO = path.join(BANCO, "turno");
const QUIEN = path.join(BANCO, "turno.quien.json");

function prepara() { fs.mkdirSync(BANCO, { recursive: true }); if (!fs.existsSync(FICHERO)) fs.writeFileSync(FICHERO, ""); }

/** Quién tiene el turno ahora (o null): { que, pid, desde, cwd } */
function quien() {
  prepara();
  if (!cerrojo.checkSync(FICHERO, { stale: 60000 })) return null;
  try { return JSON.parse(fs.readFileSync(QUIEN, "utf8")); } catch (e) { return { que: "?" }; }
}

/** Espera el turno y devuelve una función que lo suelta. `que` dice para qué (sale en `quien()` y en los avisos de espera). */
async function pide(que, { esperaMs = 3 * 3600000, aviso = m => process.stderr.write(m + "\n") } = {}) {
  if (process.env.GEMELO_TURNO === "dentro") return async () => {};
  prepara();
  const t0 = Date.now();
  let avisado = 0;
  for (;;) {
    try {
      const suelta = await cerrojo.lock(FICHERO, { stale: 60000, update: 15000, realpath: false, onCompromised: e => aviso("turno: el candado se ha perdido (" + e.message + ")") });
      fs.writeFileSync(QUIEN, JSON.stringify({ que, pid: process.pid, desde: new Date().toISOString(), cwd: process.cwd() }));
      process.env.GEMELO_TURNO = "dentro";   // lo que este proceso (y sus hijos) pida dentro del turno no lo vuelve a pedir: el candado no es reentrante
      return async () => { delete process.env.GEMELO_TURNO; try { fs.rmSync(QUIEN, { force: true }); await suelta(); } catch (e) { /* ya caducado */ } };
    } catch (e) {
      if (e.code !== "ELOCKED") throw e;
      if (Date.now() - t0 > esperaMs) throw new Error("turno: más de " + Math.round(esperaMs / 60000) + " min esperando a " + JSON.stringify(quien()));
      if (Date.now() - avisado > 60000) { avisado = Date.now(); aviso("turno: «" + que + "» espera; lo tiene " + JSON.stringify(quien())); }
      await new Promise(ok => setTimeout(ok, 3000));
    }
  }
}

/** Ejecuta fn dentro del turno y lo suelta siempre */
async function conTurno(que, fn, opciones) {
  const suelta = await pide(que, opciones);
  try { return await fn(); } finally { await suelta(); }
}

module.exports = { BANCO, pide, conTurno, quien };
