"use strict";
// genera_motor.mjs incrusta el índice de la finca en la página dentro de <script type="application/json" id="datos"> (L9-04). Un texto del
// índice con «</script» o «<!--» cerraría el bloque antes de tiempo y lo que siguiera sería HTML de la página. Este guardián prueba que no
// pasa: el HTML generado tiene un único cierre por bloque, el JSON leído devuelve el texto original y los textos de cabecera salen escapados.
// Solo Node (sin Chrome ni Docker).
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, fs, path, os } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web");
const HOSTIL = '</script><img src=x onerror=alert(1)><!-- "x" \'y\' & \u2028 \u2029';
let G; test.before(async () => { G = await import(pathToFileURL(path.join(WEB, "herramientas", "genera_motor.mjs")).href); });

/** El contenido del bloque #datos tal como lo lee el navegador: desde su apertura hasta el primer </script> */
function bloqueDatos(html) {
  const ab = '<script type="application/json" id="datos">', i = html.indexOf(ab);
  assert.ok(i >= 0, "la página no tiene el bloque #datos");
  const ini = i + ab.length, fin = html.indexOf("</script>", ini);
  assert.ok(fin >= 0, "el bloque #datos no se cierra");
  return html.slice(ini, fin);
}

test("escapaJsonEnScript: el texto hostil no deja «</script» ni «<!--» ni < > & ni U+2028/2029, y el JSON lee lo mismo", () => {
  const obj = { textos: { finca: HOSTIL }, parcelas: [{ nombre: HOSTIL }] };
  const txt = JSON.stringify(obj, null, 1);
  const esc = G.escapaJsonEnScript(txt);
  assert.ok(!/<\/script/i.test(esc), "queda «</script» en el JSON escapado");
  assert.ok(!esc.includes("<!--"), "queda «<!--» en el JSON escapado");
  assert.ok(!/[<>&\u2028\u2029]/.test(esc), "quedan caracteres que hay que escapar");
  assert.deepStrictEqual(JSON.parse(esc), obj, "el JSON escapado no lee el mismo valor");
});

test("genera(): con un índice hostil, la página tiene un único cierre por bloque y el #datos lee el texto original", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-genera-")), idx = path.join(raiz, "indice.json");
  try {
    const J = { finca_id: "prueba", textos: { finca: HOSTIL, fincas: 1, parcelas: 1, ha: 3.5, olivos: 10, desfase_txt: HOSTIL, intro_historia: HOSTIL, sin_historia: false },
      parcelas: [{ nombre: HOSTIL }], teselas: {} };
    fs.writeFileSync(idx, JSON.stringify(J, null, 1));
    const dest = path.join(raiz, "salida");
    G.genera(idx, dest);
    const html = fs.readFileSync(path.join(dest, "index.html"), "utf8");
    assert.strictEqual((html.match(/<\/script>/g) || []).length, 2, "debe haber exactamente dos cierres: el de #datos y el de la entrada del motor");
    assert.strictEqual((html.match(/<script\b/g) || []).length, 2, "debe haber exactamente dos aperturas de script");
    assert.ok(!html.includes("<img src=x"), "el marcado hostil llegó a la página sin escapar");
    assert.deepStrictEqual(JSON.parse(bloqueDatos(html)), J, "el JSON leído de #datos no es el índice original");
    // los textos de la cabecera (título, encabezado, entradilla, pie) salen escapados
    assert.ok(html.includes("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;"), "el nombre de la finca no se escapó en la cabecera");
    assert.ok(!/<title>[^<]*<img/.test(html) && !/<h1>[^<]*<img/.test(html), "el nombre hostil llegó al <title> o al <h1>");
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});

test("escapaHtml: escapa & < > \" ' en un texto de cabecera", () => {
  assert.strictEqual(G.escapaHtml(`Cano & Damas <"'>`), "Cano &amp; Damas &lt;&quot;&#39;&gt;");
});
