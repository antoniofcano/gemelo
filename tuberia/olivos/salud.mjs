// Salud del servicio hornero (ADR-0018 §4, O7f). Lo usan el healthcheck de Docker y `npm run dev:estado`.
//   node tuberia/olivos/salud.mjs [--json]      sale con 0 si está sano y con 1 si no
// Lee lo que escribe el servicio: <GEMELO_HORNERO_ESTADO>/<finca>.json (el estado.json del hornero) y servicio.json (el latido).
//   sano     : la última vuelta terminó en «listo» (con o sin «durmiendo hasta <fecha>»), o hay una en curso que se movió hace menos del tope
//   enfermo  : la última vuelta acabó en «error», no hay estado, una vuelta en curso lleva más del tope sin moverse, o el servicio no late
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const leeJson = r => { try { return JSON.parse(fs.readFileSync(r, "utf8")); } catch (e) { return null; } };
const edadS = (iso, ahora) => (ahora - Date.parse(iso)) / 1000;

/**
 * Pura. estados: { finca: estado.json | null }; latido: servicio.json | null; o: { ahora (ms), topeVueltaS, latidoMaxS }.
 * Devuelve { sano, fincas: { finca: { sano, texto } }, texto }.
 */
export function evaluaSalud(estados, latido, o) {
  const ahora = o.ahora ?? Date.now(), tope = o.topeVueltaS ?? 900, fincas = {};
  for (const [f, st] of Object.entries(estados)) {
    const dur = latido && latido.fincas && latido.fincas[f] && latido.fincas[f].durmiendo_hasta;
    let sano, texto;
    if (!st) { sano = false; texto = "sin estado todavía"; }
    else if (st.fase === "error") { sano = false; texto = "ERROR: " + st.error; }
    else if (st.fase === "listo") {
      sano = true; texto = "listo (" + st.hechas + "/" + st.total + ", época " + st.epoca_actual + ")" + (dur ? ", durmiendo hasta " + dur : "");
    } else {
      const e = edadS(st.actualizado_en, ahora);
      sano = e < tope; texto = "en curso: " + st.fase + " " + st.hechas + "/" + st.total + (sano ? "" : " ATASCADO (sin moverse hace " + Math.round(e) + " s)");
    }
    fincas[f] = { sano, texto };
  }
  // el latido solo se exige cuando nada está en curso (en una vuelta larga lo escribe el propio hornero, en estado.json)
  const enCurso = Object.values(estados).some(s => s && !["listo", "error"].includes(s.fase));
  let latidoOk = true, textoLatido = "";
  if (!enCurso) {
    const max = o.latidoMaxS ?? 1860;
    if (!latido) { latidoOk = false; textoLatido = "el servicio no ha latido"; }
    else if (edadS(latido.latido_en, ahora) > max) { latidoOk = false; textoLatido = "el servicio no late desde hace " + Math.round(edadS(latido.latido_en, ahora)) + " s"; }
  }
  const sano = latidoOk && Object.keys(fincas).length > 0 && Object.values(fincas).every(x => x.sano);
  return { sano, fincas, texto: Object.entries(fincas).map(([f, x]) => f + ": " + x.texto).concat(textoLatido ? [textoLatido] : []).join("; ") };
}

export function leeYEvalua(env = process.env, ahora = Date.now()) {
  const dir = env.GEMELO_HORNERO_ESTADO || "/estado", fincas = (env.GEMELO_HORNERO_FINCAS || "").split(",").map(s => s.trim()).filter(Boolean);
  const estados = Object.fromEntries(fincas.map(f => [f, leeJson(path.join(dir, f + ".json"))]));
  const topeVueltaS = Number(env.GEMELO_HORNERO_TOPE_S || 900), compruebaS = Number(env.GEMELO_HORNERO_COMPRUEBA_S || 600);
  return evaluaSalud(estados, leeJson(path.join(dir, "servicio.json")), { ahora, topeVueltaS, latidoMaxS: 3 * compruebaS + 60 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = leeYEvalua();
  console.log(process.argv.includes("--json") ? JSON.stringify(r) : (r.sano ? "sano: " : "ENFERMO: ") + r.texto);
  process.exit(r.sano ? 0 : 1);
}
