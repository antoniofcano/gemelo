"use strict";
// Un proceso pesado que no es Chrome (Blender en segundo plano, por ejemplo) dentro del turno del banco (TESTING.md §«Banco de pruebas»):
// espera a que haya memoria libre, pide el turno, lanza la orden y lo suelta al acabar. Así no coincide con un Chrome sin pantalla ni con Docker.
//   node pruebas/banco/proceso.js [--que <para qué>] [--memoria-gb 1.5] [--espera-min 60] -- <orden> [argumentos…]
// Sale con el código de la orden (o 1 si no pudo lanzarla). La memoria se mira con os.freemem() antes de pedir el turno y otra vez ya dentro.
const { spawn } = require("child_process");
const os = require("os");
const { conTurno } = require("./turno");

function lee(argv) {
  const o = { que: "proceso", memoriaGb: 1.5, esperaMin: 60, orden: null };
  const fin = argv.indexOf("--");
  if (fin < 0 || fin === argv.length - 1) throw new Error("falta la orden tras «--»");
  o.orden = argv.slice(fin + 1);
  const a = argv.slice(0, fin);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--que") o.que = a[++i];
    else if (a[i] === "--memoria-gb") o.memoriaGb = Number(a[++i]);
    else if (a[i] === "--espera-min") o.esperaMin = Number(a[++i]);
    else throw new Error("argumento desconocido: " + a[i]);
  }
  return o;
}

const libreGb = () => os.freemem() / 1024 ** 3;

/** Espera hasta que haya `gb` libres (o lanza pasados `min` minutos) */
async function esperaMemoria(gb, min, que) {
  const t0 = Date.now(); let avisado = 0;
  while (libreGb() < gb) {
    if (Date.now() - t0 > min * 60000) throw new Error("proceso: más de " + min + " min esperando " + gb + " GB libres (hay " + libreGb().toFixed(2) + ")");
    if (Date.now() - avisado > 60000) { avisado = Date.now(); process.stderr.write("proceso: «" + que + "» espera memoria: " + libreGb().toFixed(2) + " GB libres, pide " + gb + "\n"); }
    await new Promise(ok => setTimeout(ok, 5000));
  }
}

async function principal() {
  const o = lee(process.argv.slice(2));
  await esperaMemoria(o.memoriaGb, o.esperaMin, o.que);
  return conTurno(o.que, async () => {
    await esperaMemoria(o.memoriaGb, o.esperaMin, o.que);
    process.stderr.write("proceso: «" + o.que + "» con turno y " + libreGb().toFixed(2) + " GB libres\n");
    return new Promise(ok => {
      const h = spawn(o.orden[0], o.orden.slice(1), { stdio: "inherit" });
      h.on("error", e => { process.stderr.write("proceso: no se pudo lanzar: " + e.message + "\n"); ok(1); });
      h.on("exit", c => ok(c == null ? 1 : c));
    });
  });
}

if (require.main === module) principal().then(c => process.exit(c), e => { console.error(e.message); process.exit(1); });
module.exports = { lee, esperaMemoria };
