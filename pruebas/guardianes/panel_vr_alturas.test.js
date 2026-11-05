"use strict";
// Guardián: las filas de cada pestaña del panel de VR caben en el espacio útil del lienzo (1.024 px), entre y0 y el texto de los mandos.
// Lee el código (no monta nada): suma los `alto` de cada PanelVR.filas("pestaña", { id, orden, alto }) de apps/web/motor/*.js.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const MOTOR = path.join(__dirname, "..", "..", "apps", "web", "motor");
const Y0 = 196, TEXTO_MANDOS = 890 - 11;   // vrY0() sin letrero; el texto de mandos (22 px, línea media en y = 890) empieza hacia 879
const ESPACIO = TEXTO_MANDOS - Y0;          // 683 px
// Filas que solo salen en casos concretos y que hoy NO caben con el resto (deuda conocida, anotada en el informe de EV-1g): se excluyen de la suma «normal».
const EXCEPCIONES = {
  ira: { guia: "solo quien modera una visita guiada", habla: "solo con la voz activa" },
  comodidad: { multiview: "solo con ?debug", mideGuia: "solo con ?debug", mide: "solo con ?debug" },
};
function filas() {
  const out = []; const re = /PanelVR\.filas\("([a-z]+)", \{ id: "([A-Za-z_]+)", orden: (\d+), alto: (\d+)/g;
  for (const f of fs.readdirSync(MOTOR).filter(x => x.endsWith(".js")).sort()) {
    const s = fs.readFileSync(path.join(MOTOR, f), "utf8"); let m;
    while ((m = re.exec(s))) out.push({ pestana: m[1], id: m[2], orden: +m[3], alto: +m[4], fichero: f });
  }
  return out;
}
const pestanas = () => { const m = fs.readFileSync(path.join(MOTOR, "29_vr.js"), "utf8").match(/var VR_PESTANAS = (\[\[.*?\]\]),/); return JSON.parse(m[1]).map(x => x[0]); };

test("panel VR: la suma de los altos de cada pestaña cabe en el espacio útil", () => {
  const todas = filas(), tabs = pestanas(); assert.ok(todas.length >= 15, "se leyeron las filas: " + todas.length);
  for (const t of tabs) {
    const ex = EXCEPCIONES[t] || {}, fs_ = todas.filter(f => f.pestana === t);
    const suma = fs_.filter(f => !(f.id in ex)).reduce((a, f) => a + f.alto, 0);
    assert.ok(suma <= ESPACIO, "la pestaña «" + t + "» suma " + suma + " px y el espacio útil es " + ESPACIO + " (" + fs_.map(f => f.id + ":" + f.alto).join(" ") + ")");
  }
  for (const f of todas) assert.ok(tabs.includes(f.pestana), "la fila " + f.id + " va a una pestaña que no existe: " + f.pestana);
});

test("panel VR: las excepciones apuntan a filas que existen (si se arreglan, se quitan de la lista)", () => {
  const todas = filas();
  for (const [t, ex] of Object.entries(EXCEPCIONES)) for (const id of Object.keys(ex)) assert.ok(todas.some(f => f.pestana === t && f.id === id), "la excepción " + t + "/" + id + " ya no existe");
});

test("panel VR: las pestañas caben en su fila (x ≤ 984) y no se solapan", () => {
  const s = fs.readFileSync(path.join(MOTOR, "29_vr.js"), "utf8"), n = pestanas().length;
  const m = s.match(/b\("t_" \+ t\[0\], 40 \+ i \* (\d+), 104, (\d+), 64/); assert.ok(m, "geometría de las pestañas");
  assert.ok(40 + (n - 1) * +m[1] + +m[2] <= 984, "las pestañas se salen del panel");
  assert.ok(+m[2] <= +m[1], "las pestañas no se solapan");
});
