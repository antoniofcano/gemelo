// Épocas del olivo por fecha (decisión 64: calendario fijo en el repo, que ajusta Antonio): contratos/epocas-calendario.json. Sin DOM ni dependencias.
// Cada época es una ventana «MM-DD» a «MM-DD» (ambas incluidas, sin año; si desde > hasta, cruza el fin de año).
export const ORDEN_EPOCAS = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];   // el ciclo; tras madura vuelve reposo

/** La tabla que vale para una finca: la suya si el calendario la tiene (reemplaza a la común entera) y si no, la común */
export const tablaDe = (cal, finca) => (cal.fincas && cal.fincas[finca]) || cal.comun;
const dentro = (m, v) => (v.desde <= v.hasta ? m >= v.desde && m <= v.hasta : m >= v.desde || m <= v.hasta);
const mmdd = f => { const d = f instanceof Date ? f : new Date(f); return String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); };

/** Época de una fecha (Date o ISO; se mira el día en UTC) según la tabla; null si ninguna ventana la contiene */
export function epocaDeFecha(tabla, fecha) {
  const m = mmdd(fecha);
  return ORDEN_EPOCAS.find(e => tabla[e] && dentro(m, tabla[e])) || null;
}
export const siguienteEpoca = e => ORDEN_EPOCAS[(ORDEN_EPOCAS.indexOf(e) + 1) % ORDEN_EPOCAS.length];
/** [] si la tabla cubre los 366 días de un año bisiesto con UNA sola época cada uno; si no, lo que falla (hasta 10 líneas) */
export function validaTabla(tabla) {
  const err = [];
  for (const e of ORDEN_EPOCAS) if (!tabla[e]) err.push("falta la época " + e);
  if (err.length) return err;
  for (let d = 0; d < 366; d++) {
    const m = mmdd(new Date(Date.UTC(2024, 0, 1 + d))), cuales = ORDEN_EPOCAS.filter(e => dentro(m, tabla[e]));
    if (cuales.length !== 1) err.push(m + ": " + (cuales.length ? "en varias épocas (" + cuales.join(", ") + ")" : "sin época"));
  }
  return err.slice(0, 10);
}
