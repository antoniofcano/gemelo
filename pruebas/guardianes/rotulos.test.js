"use strict";
// Guardián de rótulos (decisiones 220 y 221, L3-04/L3-06/L3-07; CLAUDE.md regla 5), en Node, sin navegador:
//  · el recuento de olivos es «detectado (LiDAR + regla)», nunca «medido» (medido son las copas y el relieve);
//  · las hectáreas de la cabecera son «declaradas (OlivarTrack)»;
//  · plantilla.html no lleva hectáreas ni olivos escritos a mano: la cabecera sale del índice (`textos`).
const test = require("node:test"), assert = require("node:assert");
const path = require("path"), { pathToFileURL } = require("url");
const { lee, ficheros, RAIZ } = require("./_util");

const PL = lee("apps/web/plantilla.html");
const FUENTES = ficheros().filter(f => /^(apps\/web\/(motor|oficina)\/[^/]+\.(js|html)|apps\/web\/plantilla\.html|apps\/api\/src\/.+\.ts)$/.test(f));

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
  for (const T of [{ finca: "Cerro Velasco", fincas: 1, parcelas: 5, ha: 7.1, olivos: 812 }, { finca: "Hituelo", fincas: 4, parcelas: 27, ha: 95.2, olivos: 5900, puntos_m2: 6.5 }]) {
    const out = textosFinca(PL, T);
    const ha = [...out.matchAll(/\d[\d.,]*\s*ha\b(?!\s*declaradas \(OlivarTrack\))/g)].map(m => m[0]);
    assert.deepStrictEqual(ha, [], T.finca + ": hectáreas sin «declaradas (OlivarTrack)»: " + ha.join(" | "));
    assert.match(out, /ha declaradas \(OlivarTrack\)/);
    assert.match(out, new RegExp(T.olivos + " olivos detectados"));
    assert.doesNotMatch(out, new RegExp(T.olivos + " olivos(?! detectados)"), "olivos sin «detectados»");
    if (T.finca !== "Cerro Velasco") assert.ok(!/Cerro Velasco/.test(out.replace(/medido en Cerro Velasco/g, "")), "restos de Cerro Velasco escritos a mano en otra finca");
  }
});

test("el chip de cada finca dice «declaradas» en hectáreas y olivos (13_parcelas.js)", () => {
  assert.match(lee("apps/web/motor/13_parcelas.js"), /" ha declaradas · " \+ fmt\(f\.olivos\) \+ " olivos declarados"/);
});
