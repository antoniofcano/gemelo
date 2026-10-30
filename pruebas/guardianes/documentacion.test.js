"use strict";
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, ficheros, lee, fs, path } = require("./_util");

const TODOS = ficheros();
const MD = TODOS.filter(f => f.endsWith(".md"));
const existe = f => fs.existsSync(path.join(RAIZ, f));

/** ancla como la calcula GitHub: minúsculas, sin signos (conserva letras con tilde), espacios → guiones */
const slug = t => t.trim().toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
function anclas(f) {
  const s = lee(f), a = new Set();
  for (const m of s.matchAll(/^#{1,6}\s+(.+)$/gm)) a.add(slug(m[1]));
  for (const m of s.matchAll(/<a\s+id="([^"]+)"/g)) a.add(m[1]);
  return a;
}
function enlaces(f) {
  const s = lee(f).replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");   // sin bloques ni trozos de código (ahí hay plantillas de enlace, no enlaces)
  return [...s.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u));
}

test("hay documentación que revisar", () => assert.ok(MD.length >= 25, "sólo " + MD.length + " .md"));

test("los enlaces relativos de todos los .md apuntan a ficheros y anclas que existen", () => {
  const mal = [];
  for (const f of MD) {
    for (const u of enlaces(f)) {
      const [ruta, ancla] = u.split("#");
      const destino = ruta ? path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURIComponent(ruta))) : f;
      if (!existe(destino)) { mal.push(f + " → " + u + " (no existe " + destino + ")"); continue; }
      if (ancla && destino.endsWith(".md") && !anclas(destino).has(decodeURIComponent(ancla).toLowerCase())) mal.push(f + " → " + u + " (no hay ancla en " + destino + ")");
    }
  }
  assert.deepStrictEqual(mal, []);
});

test("las rutas de ficheros citadas entre comillas inversas en los .md existen", () => {
  const re = /`((?:src|pruebas|doc|contratos|datos|\.claude)\/[A-Za-z0-9_./\-]+\.(?:js|py|md|json|html))`/g, mal = [];
  for (const f of MD) {
    if (f.startsWith("doc/historico/") || f === "CHANGELOG.md") continue;   // las fotos y el CHANGELOG citan cosas de su momento
    for (const m of lee(f).matchAll(re)) {
      if (/(^|\/)salida\//.test(m[1]) || m[1].includes("<")) continue;     // generados
      if (!existe(m[1])) mal.push(f + " cita " + m[1]);
    }
  }
  assert.deepStrictEqual(mal, [], "rutas citadas que no existen (si es una foto, archívala en doc/historico/)");
});

test("ADR: una fila de índice por fichero, en orden, con estado, y cada ADR tiene Estado y Fecha", () => {
  const adrs = TODOS.filter(f => /^doc\/adr\/\d{4}-.*\.md$/.test(f)).sort();
  assert.ok(adrs.length >= 8, "se esperaban ≥ 8 ADR y hay " + adrs.length);
  const indice = lee("doc/adr/README.md");
  const filas = [...indice.matchAll(/^\| \[(\d{4})\]\(([^)]+)\) \| (.+?) \| (.+?) \|$/gm)];
  assert.deepStrictEqual(filas.map(m => "doc/adr/" + m[2]), adrs, "el índice debe tener exactamente una fila por ADR y en orden");
  adrs.forEach((f, i) => {
    assert.strictEqual(Number(path.basename(f).slice(0, 4)), i + 1, "numeración correlativa rota en " + f);
    const s = lee(f);
    assert.match(s, /^# ADR-\d{4} — /m, f + ": falta el título «# ADR-NNNN — …»");
    const est = /^- \*\*Estado:\*\* (Propuesto|Aceptado|Superado por ADR-\d{4})/m.exec(s);
    assert.ok(est, f + ": falta «Estado: Propuesto|Aceptado|Superado por ADR-XXXX»");
    assert.match(s, /^- \*\*Fecha:\*\* \d{4}-\d{2}-\d{2}/m, f + ": falta la fecha");
    assert.ok(filas[i][4].startsWith(est[1].split(" ")[0]) || filas[i][4].startsWith("Superado"), f + ": el estado del índice (" + filas[i][4] + ") no coincide con el del ADR (" + est[1] + ")");
  });
});

test("doc/README.md enlaza todo documento vivo de doc/", () => {
  const enlazados = new Set(enlaces("doc/README.md").map(u => path.posix.normalize(path.posix.join("doc", u.split("#")[0]))));
  const vivos = MD.filter(f => f.startsWith("doc/") && f !== "doc/README.md" && !/^doc\/adr\/\d{4}-/.test(f) && f !== "doc/adr/_template.md");
  const sin = vivos.filter(f => !enlazados.has(f));
  assert.deepStrictEqual(sin, [], "documentos que faltan en doc/README.md (el índice de todo)");
});

test("en la raíz de doc/ sólo hay README.md y ESTADO.md (una carpeta por pregunta)", () => {
  const sueltos = MD.filter(f => /^doc\/[^/]+\.md$/.test(f)).sort();
  assert.deepStrictEqual(sueltos, ["doc/ESTADO.md", "doc/README.md"]);
});

test("doc/historico: cada foto dice arriba que no se mantiene", () => {
  const fotos = MD.filter(f => f.startsWith("doc/historico/"));
  const mal = fotos.filter(f => !/foto[^\n]{0,30}no se mantiene/i.test(lee(f).split("\n").slice(0, 6).join("\n")));
  assert.deepStrictEqual(mal, [], "faltan la línea «foto, no se mantiene» en: " + mal.join(", "));
});

test("techos de tamaño: ESTADO ≤ 150 líneas, CLAUDE.md ≤ 300, líneas de PLAN ≤ 600 caracteres", () => {
  assert.ok(lee("doc/ESTADO.md").split("\n").length <= 150, "ESTADO.md se pasa de 150 líneas: se queda en lo vigente, lo hecho va al CHANGELOG");
  assert.ok(lee("CLAUDE.md").split("\n").length <= 300, "CLAUDE.md se pasa de 300 líneas: lo largo va a doc/");
  const largas = lee("doc/rumbo/PLAN.md").split("\n").filter(l => l.length > 600);
  assert.strictEqual(largas.length, 0, "líneas de PLAN > 600 caracteres: el detalle va a un ADR");
});

test("ESTADO tiene «Al día a» y la fecha no está en el futuro", () => {
  const m = /Al día a: (\d{4}-\d{2}-\d{2})/.exec(lee("doc/ESTADO.md"));
  assert.ok(m, "falta «**Al día a: AAAA-MM-DD**» en ESTADO.md");
  assert.ok(new Date(m[1]) <= new Date(Date.now() + 86400000), "«Al día a» está en el futuro");
});

test("skills: cada .claude/skills/<n>/SKILL.md tiene name (= carpeta) y description, y CLAUDE.md las nombra todas", () => {
  const skills = TODOS.filter(f => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f));
  assert.ok(skills.length >= 10, "se esperaban ≥ 10 skills y hay " + skills.length);
  const claude = lee("CLAUDE.md");
  for (const f of skills) {
    const dir = f.split("/")[2], s = lee(f);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(s);
    assert.ok(fm, f + ": falta el frontmatter");
    assert.match(fm[1], new RegExp("^name: " + dir + "$", "m"), f + ": name debe ser «" + dir + "»");
    assert.match(fm[1], /^description: .{40,}/m, f + ": description demasiado corta (debe decir cuándo se dispara)");
    assert.ok(claude.includes("`" + dir + "`"), "CLAUDE.md no nombra la skill `" + dir + "`");
  }
});
