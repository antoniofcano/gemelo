"use strict";
// Reporter de node:test (--test-reporter): recoge los fallos de las pruebas y los entrega como JSON al final (a --test-reporter-destination).
// Ignora los fallos de agrupación («subtestsFailed»): cuenta la prueba que falló de verdad.
module.exports = async function* (fuente) {
  const fallos = [];
  for await (const ev of fuente) {
    if (ev.type !== "test:fail") continue;
    const d = ev.data, err = d.details && d.details.error;
    if (err && err.failureType === "subtestsFailed") continue;
    const causa = err && err.cause;
    const mensaje = [err && err.message, causa && (causa.message || String(causa)), err && err.stack].filter(Boolean).join("\n");
    fallos.push({ file: d.file || null, name: d.name, mensaje: mensaje || "(sin mensaje)" });
  }
  yield JSON.stringify(fallos);
};
