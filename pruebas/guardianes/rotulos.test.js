"use strict";
// Guardián de rótulos (decisiones 220 y 221, L3-04/L3-06/L3-07; CLAUDE.md regla 5), en Node, sin navegador:
//  · el recuento de olivos es «detectado (LiDAR + regla)», nunca «medido» (medido son las copas y el relieve);
//  · las hectáreas de la cabecera son «declaradas (OlivarTrack)»;
//  · plantilla.html no lleva hectáreas ni olivos escritos a mano: la cabecera sale del índice (`textos`).
const test = require("node:test"), assert = require("node:assert");
const path = require("path"), { pathToFileURL } = require("url");
const { lee, ficheros, RAIZ } = require("./_util");

const PL = lee("apps/web/plantilla.html");
// el cliente vive en apps/web/src/ desde A3-8c (motor/ ya no existe: hasta el 2026-11-14 esta regla no miraba el código del cliente; re-verificación de la auditoría)
const FUENTES = ficheros().filter(f => /^(apps\/web\/src\/.+\.ts|apps\/web\/oficina\/[^/]+\.(js|html)|apps\/web\/plantilla\.html|apps\/api\/src\/.+\.ts)$/.test(f) && !/\.test\.ts$/.test(f));
test("la regla mira el código de verdad: hay fuentes del cliente (apps/web/src) entre las que revisa", () => {
  assert.ok(FUENTES.filter(f => f.startsWith("apps/web/src/")).length > 50, "pocas fuentes del cliente: ¿se ha movido apps/web/src?");
});

test("plantilla.html no lleva cifras de hectáreas ni de olivos escritas a mano (la cabecera sale del índice)", () => {
  const malas = [...PL.matchAll(/\d[\d.,]*\s*(?:ha\b|hect[áa]reas|olivos)/gi)].map(m => m[0]);
  assert.deepStrictEqual(malas, [], "cifras de la finca escritas a mano en la plantilla: " + malas.join(" | "));
});

test("ninguna cifra de olivos aparece junto a «medido»: ni en la plantilla, ni en el motor, ni en la oficina, ni en la api", () => {
  const malas = [];
  for (const f of FUENTES) lee(f).split("\n").forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;   // los comentarios no se ven
    const m = l.match(/(?:olivos?[^\n]{0,60}\bmedid[oa]s?\b|\bmedid[oa]s?\b[^\n]{0,60}olivos)/i);
    if (m && !/no medid[oa]|no es medid[oa]|no medidos|medidas del LiDAR|volumen medido|la copa de cada olivo es medida/i.test(l)) malas.push(f + ":" + (i + 1) + " " + m[0]);
  });
  assert.deepStrictEqual(malas, [], "olivos rotulados «medido» (debe decir «detectado (LiDAR + regla)»):\n" + malas.join("\n"));
  // el recuento de la ventana del mapa lleva la pastilla de «detectado»
  assert.match(PL, /<dt>Olivos <span class="pill p-detectado">detectado \(LiDAR \+ regla\)<\/span><\/dt><dd id="kCopas">/);
  assert.match(lee("apps/web/plantilla.css"), /\.p-detectado \{/);
});

test("el contrato de la haza rotula el conteo de LiDAR como «detectado» y el declarado como «declarado»", () => {
  const s = JSON.parse(lee("contratos/haza.schema.json")), o = s.properties.olivos.properties;
  assert.deepStrictEqual(o.lidar.properties.naturaleza.enum, ["detectado"]);
  assert.deepStrictEqual(o.declarado.properties.naturaleza.enum, ["declarado"]);
});

test("la cabecera sale del índice: las hectáreas llevan «declaradas (OlivarTrack)» y los olivos «detectados», para una finca y para varias", async () => {
  const { textosFinca } = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "herramientas", "genera_motor.mjs")).href);
  for (const T of [{ finca: "Finca sintética", fincas: 1, parcelas: 5, ha: 7.1, olivos: 812 }, { finca: "Hituelo", fincas: 4, parcelas: 27, ha: 95.2, olivos: 5900, puntos_m2: 6.5 }]) {
    const out = textosFinca(PL, T);
    const ha = [...out.matchAll(/\d[\d.,]*\s*ha\b(?!\s*declaradas \(OlivarTrack\))/g)].map(m => m[0]);
    assert.deepStrictEqual(ha, [], T.finca + ": hectáreas sin «declaradas (OlivarTrack)»: " + ha.join(" | "));
    assert.match(out, /ha declaradas \(OlivarTrack\)/);
    assert.match(out, new RegExp(T.olivos + " olivos detectados"));
    assert.doesNotMatch(out, new RegExp(T.olivos + " olivos(?! detectados)"), "olivos sin «detectados»");
    assert.ok(!/\bcerro\b|velasco/i.test(out), "restos de la finca que salió del mundo (decisión 229) en la cabecera de " + T.finca);
    assert.match(out, /corrida hacia el este según su altura\) que se midió en otra finca y aquí se aplica sin recalibrar/, "la corrección de la ortofoto dice que no se midió en esta finca (regla 5)");
  }
});

test("el chip de cada finca dice «declaradas» en hectáreas y olivos (13_parcelas.js)", () => {
  assert.match(require("./_fuente").fuenteMotor("13_parcelas.js"), /" ha declaradas · " \+ fmt\(f\.olivos\) \+ " olivos declarados"/);
});

test("L3-02: el pie dice que el olivo se dibuja a la mitad del radio medido (no que la copa es medida a secas)", async () => {
  const { textosFinca } = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "herramientas", "genera_motor.mjs")).href);
  for (const out of [PL, textosFinca(PL, { finca: "F", fincas: 1, parcelas: 5, ha: 7.1, olivos: 812 })]) {
    const pie = out.match(/<p class="pie">[\s\S]*?<\/p>/)[0];
    assert.match(pie, /a la mitad de ese radio/);
    assert.doesNotMatch(pie, /La copa de cada olivo es medida/);
  }
  assert.match(lee("apps/web/src/mundos/exterior/marcadores.ts"), /a la mitad del radio medido/);
});

test("L3-03 y L3-21: la nota del NDVI dice de dónde sale la escala y el desfase se rotula como mediana", () => {
  assert.match(PL, /relativo a toda la ventana de la finca[^<]*toda la rejilla/);
  assert.doesNotMatch(PL, /relativo dentro de esta parcela/);
  // ndvi.ts calcula los percentiles de NDV.w * NDV.h (toda la rejilla): si deja de hacerlo, la nota miente
  assert.match(lee("apps/web/src/mundos/exterior/ndvi.ts"), /const n = NDV\.w \* NDV\.h/);
  assert.match(PL, /<dt>Desfase típico \(mediana\)<\/dt>/);
  assert.doesNotMatch(PL, /Desfase medio/);
});

test("L3-07: el linde no se rotula «medido» (viene de la oficina) y la superficie calculada sobre el linde tiene su fila", () => {
  assert.doesNotMatch(PL, /Linde \(barrera de luz\) <span class="pill p-medido">/);
  assert.match(PL, /Linde \(barrera de luz\) <span class="pill p-guardado">oficial<\/span>/);
  assert.match(PL, /<dt>Superficie <span class="pill p-deducido">calculada sobre el linde<\/span><\/dt><dd id="kSup">/);
});
