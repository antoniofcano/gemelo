"use strict";
// Presencia con red (?presencia=red, contratos/presencia.md): en Node y SIN LiveKit, la lógica de la sala que vive en el trozo puro de
// apps/web/motor/26_presencia.js (SalaPose y Chat): tasas 10 Hz a los cercanos / 2 Hz a todos, cercanía con margen 55/65 m, quien está en vista aérea
// no publica y sale «en vista aérea», ritmo de llegada → retardo, metadatos leídos como datos y el chat (280 caracteres, sin caracteres de control).
// Además, que el motor solo pide livekit-client con la bandera y que la versión está fijada. La prueba con dos navegadores reales es P4 (no aquí).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/26_presencia.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i);
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn { PoseCodec: PoseCodec, BufferPose: BufferPose, SalaPose: SalaPose, Chat: Chat };")();
}
const { PoseCodec, SalaPose, Chat } = puro();

const pose = (x, z, seq = 0, t = 0) => ({ tipo: 1, seq, t, cab: { p: [x, 1.6, z], q: [0, 0, 0, 1] }, izq: null, der: null });
const bytes = (x, z, seq, t) => PoseCodec.codifica(pose(x, z, seq, t));

test("tasas del contrato: sin nadie cerca, a toda la sala 1 de cada 5 tics (2 Hz); con alguien cerca, a él en cada tic (10 Hz)", () => {
  const s = SalaPose.crea(0);
  let ahora = 1000, todos = 0, aCerca = 0, nulos = 0;
  for (let i = 0; i < 50; i++, ahora += 100) {   // 5 s
    const e = SalaPose.tic(s, ahora, pose(0, 0));
    if (e === null) { nulos++; continue; }
    for (const m of e) { if (m.destinos === null) todos++; else aCerca++; assert.strictEqual(m.bytes.byteLength, 24); }
  }
  assert.strictEqual(nulos, 0); assert.strictEqual(todos, 10, "2 Hz × 5 s"); assert.strictEqual(aCerca, 0);
  // alguien a 30 m (cerca) que manda su pose
  SalaPose.entra(s, "h_cerca", null);
  let seq = 1; todos = 0; aCerca = 0;
  for (let i = 0; i < 50; i++, ahora += 100) {
    SalaPose.recibe(s, "h_cerca", bytes(30, 0, seq++, ahora), ahora);
    for (const m of SalaPose.tic(s, ahora, pose(0, 0)) || []) { if (m.destinos === null) todos++; else { aCerca++; assert.deepStrictEqual(m.destinos, ["h_cerca"]); } }
  }
  assert.strictEqual(todos, 10); assert.strictEqual(aCerca, 40, "el cercano recibe los 50 tics: 40 dirigidos + 10 a toda la sala");
});

test("entre tics no se manda nada (null) y la secuencia crece de uno en uno con cada envío", () => {
  const s = SalaPose.crea(65534);
  assert.ok(SalaPose.tic(s, 0, pose(0, 0)) !== null);
  assert.strictEqual(SalaPose.tic(s, 50, pose(0, 0)), null);
  const seqs = [];
  for (let t = 100; t <= 2000; t += 100) for (const m of SalaPose.tic(s, t, pose(0, 0)) || []) seqs.push(PoseCodec.decodifica(m.bytes).seq);
  for (let i = 1; i < seqs.length; i++) assert.strictEqual((seqs[i] - seqs[i - 1]) & 0xffff, 1);
  assert.ok(seqs.includes(0), "da la vuelta en 65535 → 0");
});

test("cercanía con margen: entra a menos de 55 m y sale a más de 65 m", () => {
  const s = SalaPose.crea(0); let ahora = 0, seq = 0;
  const en = x => { ahora += 100; SalaPose.recibe(s, "h_b", bytes(x, 0, ++seq, ahora), ahora); SalaPose.tic(s, ahora, pose(0, 0)); return s.otros["h_b"].cerca; };
  assert.strictEqual(en(60), false, "a 60 m sin haber entrado: lejos");
  assert.strictEqual(en(54), true, "a 54 m: entra");
  assert.strictEqual(en(62), true, "a 62 m: sigue cerca (no oscila en el borde)");
  assert.strictEqual(en(66), false, "a 66 m: sale");
});

test("en vista aérea (pose null) no se publica nada, pero los demás siguen llegando; quien deja de mandar sale «en vista aérea»", () => {
  const s = SalaPose.crea(0);
  for (let t = 0; t < 3000; t += 100) assert.deepStrictEqual(SalaPose.tic(s, t, null) || [], [], "sin pose propia: nada que publicar");
  SalaPose.recibe(s, "h_a", bytes(10, 10, 1, 0), 3000);
  assert.strictEqual(SalaPose.gente(s, 3100)[0].estado, "paseando");
  assert.strictEqual(SalaPose.gente(s, 3000 + SalaPose.SIN_POSE + 1)[0].estado, "en vista aérea");
  assert.strictEqual(SalaPose.gente(s, 3000 + SalaPose.SIN_POSE + 1)[0].enMundo, false);
  SalaPose.entra(s, "h_orbita", SalaPose.leeInfo(JSON.stringify({ alias: "Abubilla" })));
  const g = SalaPose.gente(s, 3100);
  assert.strictEqual(g.find(x => x.id === "h_orbita").estado, "en vista aérea", "conectado sin pose: en vista aérea (decisión 60)");
});

test("ritmo de llegada → retardo: 10 Hz se dibuja a 150 ms y 2 Hz a 650 ms", () => {
  const s = SalaPose.crea(0); let seq = 0;
  for (let t = 0; t < 2000; t += 100) SalaPose.recibe(s, "h_r", bytes(0, 0, ++seq, t), t);
  assert.strictEqual(SalaPose.retardo(s.otros["h_r"]), 150);
  for (let t = 2000; t < 6000; t += 500) SalaPose.recibe(s, "h_r", bytes(0, 0, ++seq, t), t);
  assert.strictEqual(SalaPose.retardo(s.otros["h_r"]), 650);
});

test("lo que no es del contrato o es viejo se descarta; quien vuelve tras un rato (otra secuencia) empieza de cero", () => {
  const s = SalaPose.crea(0);
  assert.strictEqual(SalaPose.recibe(s, "h_x", new Uint8Array(23), 0), false); assert.strictEqual(s.malos, 1);
  assert.strictEqual(SalaPose.recibe(s, "h_x", bytes(0, 0, 10, 0), 0), true);
  assert.strictEqual(SalaPose.recibe(s, "h_x", bytes(0, 0, 9, 50), 50), false, "vieja"); assert.strictEqual(s.viejos, 1);
  // recarga la página: secuencia nueva «más vieja» módulo 2^16, pero tras más de SIN_POSE sin pose se acepta
  assert.strictEqual(SalaPose.recibe(s, "h_x", bytes(0, 0, 40000, 0), 100 + SalaPose.SIN_POSE + 1), true);
});

test("metadatos de la sala: se leen como datos (tipos y rangos), lo raro toma un valor neutro", () => {
  assert.deepStrictEqual(SalaPose.leeInfo(JSON.stringify({ alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra", piel: 3 }, rol: "guia", dispositivo: "quest" })),
    { alias: "Mirlo", rol: "guia", dispositivo: "quest", camisa: 2, piel: 3, sombrero: 2, vrm: null,   // vrm (P7c): sin avatar del catálogo, null
      aspecto: { tono: null, arriba: null, abajo: null, altura: "media", complexion: "media", movilidad: "pie" } });   // AV2: sin aspecto elegido, el neutro
  const malo = SalaPose.leeInfo(JSON.stringify({ alias: "<img src=x onerror=alert(1)>‮" + "x".repeat(50), avatar: { camisa: 99, sombrero: "corona", piel: -1 }, rol: "root", dispositivo: "nevera" }));
  assert.strictEqual(malo.rol, "hogar"); assert.strictEqual(malo.dispositivo, "escritorio");
  assert.strictEqual(malo.camisa, 0); assert.strictEqual(malo.piel, 1); assert.strictEqual(malo.sombrero, 1);
  assert.ok(Array.from(malo.alias).length <= 24 && !malo.alias.includes("‮"), "alias recortado y sin caracteres de dirección (se pinta como texto, nunca como HTML)");
  for (const raro of [undefined, "", "no es json", "null", "[1,2]", "7"]) assert.strictEqual(SalaPose.leeInfo(raro).alias, "Visitante");
});

test("chat: UTF-8 de como mucho 280 caracteres, sin caracteres de control ni de dirección; lo que no cumple se descarta", () => {
  assert.strictEqual(Chat.MAX, 280);
  assert.strictEqual(Chat.decodifica(Chat.codifica("  ¿Qué tal   la aceituna?  ")), "¿Qué tal la aceituna?");
  assert.strictEqual(Chat.decodifica(Chat.codifica("olé 🫒")), "olé 🫒");
  assert.strictEqual(Chat.limpia("a\u0007b‮c⁦d\nE"), "a b c d E");
  assert.strictEqual(Chat.limpia("   "), null); assert.strictEqual(Chat.codifica(""), null); assert.strictEqual(Chat.limpia(7), null);
  assert.strictEqual(Array.from(Chat.limpia("🫒".repeat(300))).length, 280, "al escribir se recorta a 280 caracteres (no bytes)");
  assert.strictEqual(Chat.decodifica(new TextEncoder().encode("x".repeat(281))), null, "al recibir, más de 280 se descarta");
  assert.strictEqual(Chat.decodifica(new Uint8Array([0xff, 0xfe, 0x41])), null, "UTF-8 roto se descarta");
  assert.strictEqual(Chat.decodifica(new Uint8Array(0)), null);
});

test("el motor solo pide livekit-client cuando alguien se une a una sala (la presencia, con ?presencia=red) y la versión está fijada en apps/web/package.json", () => {
  // C5: la conexión es del componente de la red (37_red.js, el único que nombra livekit-client); la presencia (38_presencia_compartida.js) solo usa su api
  const RED = lee("apps/web/motor/37_red.js"), PRES = lee("apps/web/motor/38_presencia_compartida.js");
  const motor = require("fs").readdirSync(require("path").join(__dirname, "..", "..", "apps", "web", "motor")).filter(f => f.endsWith(".js"));
  assert.deepStrictEqual(motor.filter(f => /livekit-client"\)/.test(lee("apps/web/motor/" + f))), ["37_red.js"], "solo la red importa livekit-client");
  assert.strictEqual((RED.replace(/^\s*\/\/.*$/gm, "").match(/import\("livekit-client"\)/g) || []).length, 1, "un solo import (fuera de los comentarios)");
  assert.match(RED, /carga: function \(\) \{ return import\("livekit-client"\); \}/, "el import es el cargador de la red: se llama la primera vez que una sala se une (carga() dentro de une())");
  assert.ok(RED.indexOf("return carga().then(") > RED.indexOf("function une(cred, opc)"), "carga() va dentro de une()");
  assert.match(PRES, /\[\?&\]presencia=\(sim\|red\)\\b/, "la bandera decide la variante");
  assert.ok(PRES.indexOf("SR.une(") > PRES.indexOf("async function conecta"), "la presencia solo se une en conecta(), que solo llama iniciaRed()");
  assert.match(PRES, /sala\.publica\("pose", e\.bytes, op\)/); assert.match(PRES, /var op = \{ fiable: false \};/); assert.match(PRES, /sala\.publica\("chat", Chat\.codifica\(txt\), \{ fiable: true \}\)/);
  assert.match(RED, /var op = \{ reliable: !!opc\.fiable, topic: tema \}; if \(opc\.destinos\) op\.destinationIdentities = opc\.destinos;/, "la red pasa fiable/tema/destinos a LiveKit tal cual");
  const p = JSON.parse(lee("apps/web/package.json"));
  assert.match(p.dependencies["livekit-client"], /^\d+\.\d+\.\d+$/, "versión exacta (regla 12)");
  assert.ok(!/innerHTML/.test(PRES) && !/innerHTML/.test(RED), "lo que llega de la sala nunca se pone como HTML");
});

test("I1: a quién se dibuja, sale en el minimapa y se puede ir: con pose reciente y sin bloquear; «en vista aérea» y bloqueados, no", () => {
  const s = SalaPose.crea(0), ahora = 10000;
  SalaPose.entra(s, "h_pasea", null); SalaPose.entra(s, "h_aerea", null); SalaPose.entra(s, "h_bloq", null);
  SalaPose.recibe(s, "h_pasea", bytes(1, 1, 1, ahora), ahora); SalaPose.recibe(s, "h_bloq", bytes(2, 2, 1, ahora), ahora);
  const bl = { h_bloq: true };
  assert.deepStrictEqual(["h_pasea", "h_aerea", "h_bloq", "h_nadie"].filter(id => SalaPose.seVe(s, id, ahora + 100, bl)), ["h_pasea"]);
  assert.strictEqual(SalaPose.seVe(s, "h_pasea", ahora + SalaPose.SIN_POSE + 1, bl), false, "sin pose en 2 s pasa a vista aérea: deja de verse");
  assert.strictEqual(SalaPose.seVe(s, "h_bloq", ahora + 100, {}), true, "desbloqueado, vuelve");
});
test("P6: el panel Gente dice «en quad» o «con el dron» con el modo de la pose", () => {
  const s = SalaPose.crea(0), ahora = 5000;
  [["h_a", 0], ["h_b", 1], ["h_c", 2]].forEach(([id, modo]) => { SalaPose.entra(s, id, null); SalaPose.recibe(s, id, PoseCodec.codifica({ ...pose(0, 0, 1, ahora), modo }), ahora); });
  assert.deepStrictEqual(SalaPose.gente(s, ahora + 10).map(g => g.estado).sort(), ["con el dron", "en quad", "paseando"]);
});
