// Genera apps/web/src/datos/contratos/<nombre>.ts desde cada contratos/*.schema.json (MUNDOS §1, MU1-11).
// Usa json-schema-to-typescript (regla 12: no hay generador propio). Salida determinista (sin fechas ni rutas locales).
//   node apps/web/herramientas/genera_tipos.mjs     escribe los ficheros
//   generaTodo()                                    (lo usa el guardián) devuelve {fichero: texto} sin escribir
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");
export const DIR_CONTRATOS = join(RAIZ, "contratos");
export const DIR_SALIDA = join(AQUI, "..", "src", "datos", "contratos");

// Esquemas que NO se traducen, con su motivo (no se traducen a medias).
export const EXCLUIDOS = {
  // (ninguno por ahora)
};

const CABECERA = "/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/{N}.schema.json. NO EDITAR.\n" +
  " * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */\n\n";

// json-schema-to-typescript lee tuplas al estilo draft-07 (items: [...] + additionalItems), no `prefixItems` de 2020-12
// (lo ignoraba y daba `never[]`). Traducción fiel, en memoria (los esquemas no se tocan):
//   {prefixItems: [a, b], items: false|S}  ->  {items: [a, b], additionalItems: false|S}
export function tuplas(nodo) {
  if (Array.isArray(nodo)) return nodo.map(tuplas);
  if (nodo === null || typeof nodo !== "object") return nodo;
  const o = {};
  for (const [k, v] of Object.entries(nodo)) o[k] = (k === "const" || k === "enum" || k === "default" || k === "examples") ? v : tuplas(v);
  if (Array.isArray(o.prefixItems)) {
    const resto = o.items === undefined ? true : o.items;
    o.items = o.prefixItems; delete o.prefixItems;
    o.additionalItems = resto;
  }
  return o;
}

const camel = n => n.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const nombres = () => readdirSync(DIR_CONTRATOS).filter(f => f.endsWith(".schema.json")).sort()
  .map(f => basename(f, ".schema.json")).filter(n => !(n in EXCLUIDOS));

export async function generaTodo() {
  const salida = {};
  const lista = [];
  for (const n of nombres()) {
    const esquema = tuplas(JSON.parse(readFileSync(join(DIR_CONTRATOS, n + ".schema.json"), "utf8")));
    // el nombre del tipo raíz sale del fichero, no del $id ni del título (que pasa a ser su descripción)
    delete esquema.$id;
    if (esquema.title) { esquema.description = esquema.description ? esquema.title + ". " + esquema.description : esquema.title; delete esquema.title; }
    const ts = await compile(esquema, n, {
      bannerComment: "", additionalProperties: false, strictIndexSignatures: false,
      cwd: DIR_CONTRATOS, format: true, maxItems: -1, style: { semi: true, singleQuote: false, printWidth: 120 }, $refOptions: { resolve: { external: false, file: false, http: false } },
    });
    salida[n + ".ts"] = CABECERA.replace("{N}", n) + ts.replace(/\r\n/g, "\n");
    lista.push(n);
  }
  salida["index.ts"] = "/* GENERADO por apps/web/herramientas/genera_tipos.mjs. NO EDITAR. */\n\n" +
    lista.map(n => `export * as ${camel(n)} from "./${n}.ts";`).join("\n") + "\n";
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const salida = await generaTodo();
  if (existsSync(DIR_SALIDA)) rmSync(DIR_SALIDA, { recursive: true });
  mkdirSync(DIR_SALIDA, { recursive: true });
  for (const [f, t] of Object.entries(salida)) writeFileSync(join(DIR_SALIDA, f), t);
  console.log(`genera_tipos: ${Object.keys(salida).length - 1} contratos -> src/datos/contratos`);
}
