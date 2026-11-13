"use strict";
// Contrato de mundo interior v1.2 (contratos/mundo-interior.md §1c y §1d, ADR-0034): la luz aparte del color (luz.modo «mapa»: el
// mapa en occlusionTexture con texCoord 1) y las máquinas (maquinas[]: piezas con eje que mueve el motor). El ejemplo sintético
// modelos/interiores/ejemplo-luz/ pasa el validador y su generador da los mismos bytes; cada regla nueva tiene un caso que la rompe
// y el validador lo rechaza; el .md nombra lo que pide el esquema (regla 13). Solo Node.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path } = require("./_util");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { valida } = require(path.join(RAIZ, "tuberia", "interiores", "valida.js"));
const { bytes: generaSala } = require(path.join(RAIZ, "modelos", "interiores", "ejemplo-luz", "genera.js"));

const DIR = path.join(RAIZ, "modelos", "interiores", "ejemplo-luz");
const MAN = JSON.parse(fs.readFileSync(path.join(DIR, "mundo.json"), "utf8"));
const GLB = new Uint8Array(fs.readFileSync(path.join(DIR, "sala.glb")));
const ESQ = JSON.parse(lee("contratos/mundo-interior.schema.json"));
const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);
const copia = o => JSON.parse(JSON.stringify(o));
async function cambia(fn) { const doc = await io().readBinary(GLB); await fn(doc); return io().writeBinary(doc); }
const tiene = (r, re) => r.errores.some(e => re.test(e));
const maq = (m, id) => m.maquinas.find(q => q.id === id);

test("el ejemplo v1.2 pasa el validador sin avisos, con sus máquinas y sus mapas, y su generador da los mismos bytes", async () => {
  const r = await valida(MAN, GLB);
  assert.ok(r.ok, r.errores.join("\n"));
  assert.deepStrictEqual(r.avisos, []);
  assert.strictEqual(r.medidas.maquinas, 4);
  assert.ok(r.medidas.mapas_luz >= 1);
  assert.deepStrictEqual(new Set(MAN.maquinas.map(q => q.tipo)), new Set(["giro", "textura", "vaiven"]));
  assert.deepStrictEqual(Buffer.from(await generaSala()), Buffer.from(GLB), "sala.glb no es lo que da genera.js (regenerar con node modelos/interiores/ejemplo-luz/genera.js)");
  // aditivo: el ejemplo de la v1 sigue pasando, y sin luz ni maquinas este también (la luz «mapa» solo la pide quien la declara)
  const m = copia(MAN); delete m.luz; delete m.maquinas;
  const r2 = await valida(m, GLB);
  assert.ok(r2.ok, r2.errores.join("\n"));
  assert.ok(r2.avisos.some(a => /texCoord 1 pero luz\.modo no es «mapa»/.test(a)), "avisa de un mapa que el motor no usará");
});

test("luz «mapa»: escala obligatoria, cada material opaco sin luz lleva su mapa en texCoord 1 con TEXCOORD_1, y lo que tiene luz es de una máquina con luz propia", async () => {
  let m = copia(MAN); delete m.luz.escala;
  assert.ok(tiene(await valida(m, GLB), /sin escala/));
  let r = await valida(MAN, await cambia(d => { d.getRoot().listMaterials().find(x => x.getName() === "pared").setOcclusionTexture(null); }));
  assert.ok(tiene(r, /«pared».*no lleva su mapa de luz/), r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { d.getRoot().listMaterials().find(x => x.getName() === "suelo").getOcclusionTextureInfo().setTexCoord(0); }));
  assert.ok(tiene(r, /«suelo».*no lleva su mapa de luz/), "el mapa en texCoord 0: " + r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { for (const p of d.getRoot().listMeshes().find(x => x.getName() === "suelo").listPrimitives()) p.setAttribute("TEXCOORD_1", null); }));
  assert.ok(tiene(r, /no tiene TEXCOORD_1/), r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { d.getRoot().listMaterials().find(x => x.getName() === "pared").setExtension("KHR_materials_unlit", null); }));
  assert.ok(tiene(r, /«pared».*tiene luz \(no es unlit\) y no es de una máquina con luz propia/), r.errores.join(" | "));
  m = copia(MAN); maq(m, "rueda").luz = "horneada"; maq(m, "rodillo").luz = "horneada";
  assert.ok(tiene(await valida(m, GLB), /«hierro».*tiene luz/), "una máquina horneada con material con luz");
  m = copia(MAN); delete m.luz.sonda;
  assert.ok(tiene(await valida(m, GLB), /luz propia y no hay sonda/));
  m = copia(MAN); m.luz.sonda = m.luz.sonda.slice(0, 4);
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/luz\/sonda/), "la sonda son 9 coeficientes");
  m = copia(MAN); m.luz.modo = "otra";
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/luz\/modo/));
});

test("máquinas: nodo único que existe, pivote en el origen del nodo, ejes unitarios, campos de su tipo, velocidad o relación y relaciones sin ciclos", async () => {
  let m = copia(MAN); maq(m, "rueda").nodo = "no-esta";
  assert.ok(tiene(await valida(m, GLB), /«no-esta», que no está en el glb/));
  m = copia(MAN); maq(m, "correa").nodo = "rueda";
  assert.ok(tiene(await valida(m, GLB), /lo mueven dos máquinas/));
  m = copia(MAN); maq(m, "rueda").pivote = [0, 1.5, -5.7];
  assert.ok(tiene(await valida(m, GLB), /«rueda»: el pivote/), "pivote 10 cm fuera del origen del nodo");
  m = copia(MAN); maq(m, "rodillo").pivote = [0.4, 0, 0.05];
  assert.ok(tiene(await valida(m, GLB), /«rodillo»: el pivote/), "el pivote va en el marco del glb, no en el del padre");
  m = copia(MAN); maq(m, "rueda").eje = [0, 0, 2];
  assert.ok(tiene(await valida(m, GLB), /eje no es unitario/));
  m = copia(MAN); delete maq(m, "piston").recorrido;
  assert.ok(tiene(await valida(m, GLB), /«piston» \(vaiven\) pide recorrido/));
  m = copia(MAN); maq(m, "rueda").relacion = { con: "piston", factor: 1 };
  assert.ok(tiene(await valida(m, GLB), /velocidad o relación, una sola/));
  m = copia(MAN); delete maq(m, "rueda").velocidad; maq(m, "rueda").relacion = { con: "rodillo", factor: 1 };
  assert.ok(tiene(await valida(m, GLB), /forman un ciclo/));
  m = copia(MAN); maq(m, "correa").relacion.con = "molino";
  assert.ok(tiene(await valida(m, GLB), /«molino», que no existe/));
  m = copia(MAN); maq(m, "correa").material = "pared";
  assert.ok(tiene(await valida(m, GLB), /no tiene textura de color que correr/));
  m = copia(MAN); m.maquinas.push(copia(m.maquinas[3]));
  assert.ok(tiene(await valida(m, GLB), /id de máquina repetido/));
  m = copia(MAN); maq(m, "rueda").fuente = "medido";
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/maquinas\/0\/fuente/), "una máquina movida no es medida (regla 5)");
  m = copia(MAN); maq(m, "rueda").tipo = "orbita";
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/maquinas\/0\/tipo/), "la órbita es un hijo en el glb, no un tipo");
  // un nodo no lo mueven a la vez un clip del glb y una máquina
  const r = await valida(m = copia(MAN), await cambia(d => {
    const n = d.getRoot().listNodes().find(x => x.getName() === "piston"), b = d.getRoot().listBuffers()[0];
    const s = d.createAnimationSampler().setInput(d.createAccessor("t").setArray(new Float32Array([0, 1])).setBuffer(b)).setOutput(d.createAccessor("y").setType("VEC3").setArray(new Float32Array([-2, 0.3, -4, -2, 0.6, -4])).setBuffer(b));
    d.createAnimation("sube").addSampler(s).addChannel(d.createAnimationChannel().setTargetNode(n).setTargetPath("translation").setSampler(s));
  }));
  assert.ok(tiene(r, /también lo mueve una animación del glb/), r.errores.join(" | "));
});

test("contratos/mundo-interior.md cuenta la v1.2: los campos de luz y de máquina del esquema, los tipos y la forma de llevar el mapa", () => {
  const md = lee("contratos/mundo-interior.md");
  for (const k of Object.keys(ESQ.$defs.luz.properties)) assert.ok(md.includes("`" + k + "`"), "el .md no nombra luz." + k);
  for (const k of Object.keys(ESQ.$defs.maquina.properties)) assert.ok(md.includes("`" + k + "`"), "el .md no nombra el campo de máquina " + k);
  for (const t of ESQ.$defs.maquina.properties.tipo.enum) assert.ok(md.includes("`" + t + "`"), "el .md no nombra el tipo " + t);
  assert.ok(md.includes("`occlusionTexture`") && md.includes("`texCoord` 1") && md.includes("`TEXCOORD_1`"), "el .md dice dónde viaja el mapa de luz");
  assert.ok(md.includes("ejemplo-luz"), "el .md enlaza el ejemplo v1.2");
});
