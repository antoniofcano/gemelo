// Comprueba un tileset generado contra el contrato v2 del que sale (la identidad de cada olivo, no la geometría estándar, que la
// valida 3d-tiles-validator): cada instancia de cada glb se resuelve como lo hará el motor —lista de copas del cuadro de la tesela,
// comprobada con su huella— y casa con el registro; en las hojas está cada olivo una vez; _TIPO casa con copas_tipo por la tabla.
//
//   node tuberia/tiles3d/comprueba.mjs --entrada <carpeta con indice.json | indice.json> --tileset <carpeta del tileset>
//        [--catalogo <catalogo.json>]   (el mismo que se pasó a genera.mjs; sin él, el catálogo «olivos»)
//   (sin --entrada se lee GEMELO_DATOS, que apunta al indice.json). La raíz no tiene contenido (generador ≥ 0.3.0): se salta.
//
// Contrato: contratos/tileset.schema.json y doc/sistema/TILES3D.md («Identidad y tipo por instancia»).
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshGPUInstancing } from "@gltf-transform/extensions";
import { leeContrato, relieve, listaCopas, idsDe, huella, esOlivo, tablaTipos, catalogoTipos } from "./genera.mjs";

export async function comprueba(entrada, dir, catalogo) {
  const { I, teselas } = leeContrato(entrada), R = relieve(I, teselas), ids = idsDe(I);
  const TS = JSON.parse(fs.readFileSync(path.join(dir, "tileset.json"), "utf8")), G = TS.extras.gemelo, errores = [];
  const mal = m => { if (errores.length < 50) errores.push(m); };
  if (G.huella_registro !== huella(ids)) mal("huella_registro no casa con el registro");
  if (G.id_fuente !== (I.copas_id ? "copas_id" : "indice")) mal("id_fuente " + G.id_fuente);
  const nombreDe = new Map(Object.entries(G.tipos).map(([n, nombre]) => [Number(n), nombre]));
  const tt = tablaTipos(I, catalogoTipos(catalogo)), tipoEsperado = g => tt.tabla[tt.local.get(I.copas_tipo ? I.copas_tipo[g] : -1)];
  if (G.catalogo_tipos !== tt.catalogo) mal("catalogo_tipos " + G.catalogo_tipos + ", esperado " + tt.catalogo);
  if (TS.root.content) mal("la raíz no debe tener contenido");
  if (JSON.stringify(Object.entries(G.tipos).sort()) !== JSON.stringify(Object.entries(tt.tabla).sort())) mal("la tabla de tipos no es la del registro");
  const nodos = []; (function recorre(n, prof) { nodos.push([n, prof]); (n.children || []).forEach(h => recorre(h, prof + 1)); })(TS.root, 0);
  const profHoja = Math.max(...nodos.map(([, p]) => p)), io = new NodeIO().registerExtensions([EXTMeshGPUInstancing]);
  const enHojas = new Map(); let instancias = 0;
  for (const [n, prof] of nodos) {
    if (!n.content) { if (n !== TS.root) mal("nodo sin contenido que no es la raíz"); continue; }
    const doc = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(dir, n.content.uri))));
    const inst = doc.getRoot().listNodes().map(x => x.getExtension("EXT_mesh_gpu_instancing")).filter(Boolean);
    const e = n.extras && n.extras.gemelo;
    if (!inst.length) { if (e) mal(n.content.uri + ": extras.gemelo sin olivos"); continue; }
    if (inst.length !== 1 || !e) { mal(n.content.uri + ": " + inst.length + " nodos instanciados, extras " + !!e); continue; }
    const A = k => inst[0].getAttribute(k), cuenta = A("TRANSLATION").getCount();
    const lista = listaCopas(I, ...e.cuadro);
    if (lista.length !== e.olivos || cuenta !== e.olivos) mal(n.content.uri + ": lista " + lista.length + ", extras " + e.olivos + ", instancias " + cuenta);
    if (huella(lista.map(g => ids[g])) !== e.huella) mal(n.content.uri + ": la huella no casa con la lista rehecha desde el json");
    for (const k of ["_INDICE_COPA", "_TIPO"]) { const a = A(k); if (!a || a.getNormalized() || !/^(Uint8|Uint16|Int16|Float32)Array$/.test(a.getArray().constructor.name)) mal(n.content.uri + ": " + k + " ausente, normalizado o de tipo inesperado"); }
    for (let i = 0; i < cuenta; i++) {
      instancias++;
      const k = A("_INDICE_COPA").getScalar(i), g = lista[k], c = I.copas[g];
      if (!Number.isInteger(k) || g === undefined) { mal(n.content.uri + ": instancia " + i + " con índice " + k + " fuera de la lista"); continue; }
      if (!esOlivo(c)) mal(n.content.uri + ": la copa " + g + " no es olivo");
      const p = A("TRANSLATION").getElement(i, []), s = A("SCALE").getElement(i, []);
      if (Math.abs(p[0] - c[0]) > 1e-3 || Math.abs(p[2] + c[1]) > 1e-3 || Math.abs(p[1] - R.H(c[0], c[1])) > 1e-3) mal(n.content.uri + ": olivo " + ids[g] + " fuera de su sitio");
      if (Math.abs(s[1] - c[2]) > 1e-4) mal(n.content.uri + ": olivo " + ids[g] + " con otra altura");
      const t = A("_TIPO").getScalar(i);
      if (!nombreDe.has(t) || nombreDe.get(t) !== tipoEsperado(g)) mal(n.content.uri + ": olivo " + ids[g] + " con _TIPO " + t + " (" + nombreDe.get(t) + "), esperado " + tipoEsperado(g));
      if (prof === profHoja) enHojas.set(g, (enHojas.get(g) || 0) + 1);
    }
  }
  const olivos = I.copas.filter(esOlivo).length, duplicados = [...enHojas.values()].filter(v => v > 1).length;
  if (enHojas.size !== olivos) mal("en las hojas hay " + enHojas.size + " olivos distintos de " + olivos);
  if (duplicados) mal(duplicados + " olivos repetidos en las hojas");
  if (new Set(ids).size !== ids.length) mal("ids repetidos en el registro");
  return { errores, copas: I.copas.length, olivos, en_hojas: enHojas.size, duplicados, instancias, nodos: nodos.length, glb: nodos.filter(([n]) => n.content).length, teselas_contrato: teselas.size, id_fuente: G.id_fuente, tipos: G.tipos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  const a = process.argv.slice(2), arg = k => a[a.indexOf("--" + k) + 1];
  const entrada = a.includes("--entrada") ? arg("entrada") : process.env.GEMELO_DATOS;
  if (!entrada || !a.includes("--tileset")) throw new Error("uso: node comprueba.mjs --entrada <carpeta|indice.json> --tileset <carpeta> (o GEMELO_DATOS=<indice.json>)");
  const r = await comprueba(entrada, arg("tileset"), a.includes("--catalogo") ? arg("catalogo") : undefined);
  console.log(JSON.stringify(r, null, 1));
  process.exitCode = r.errores.length ? 1 : 0;
}
