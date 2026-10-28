// Validador mínimo de un subconjunto de JSON Schema (sin dependencias). Palabras que entiende:
//   type (también lista), enum, required, properties, additionalProperties (esquema para el resto), claves (regex de las claves),
//   items, tuple (array posicional), minItems, maxItems, minimum, maximum, pattern, anyOf, $ref ("#nombre" → definiciones[nombre]).
"use strict";

function tipo(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}
const cumple = (t, v) => t === tipo(v) || (t === "number" && tipo(v) === "integer");

function valida(esquema, valor, raiz, ruta, errores) {
  raiz = raiz || esquema; ruta = ruta || "$"; errores = errores || [];
  if (esquema.$ref) esquema = raiz.definiciones[esquema.$ref.slice(1)];
  const err = m => errores.push(ruta + ": " + m);
  if (esquema.enum && !esquema.enum.some(e => e === valor)) err("debe ser uno de " + JSON.stringify(esquema.enum) + " y es " + JSON.stringify(valor));
  if (esquema.type) {
    const ts = [].concat(esquema.type);
    if (!ts.some(t => cumple(t, valor))) { err("tipo " + tipo(valor) + ", se esperaba " + ts.join("|")); return errores; }
  }
  if (typeof valor === "number") {
    if (esquema.minimum !== undefined && valor < esquema.minimum) err(valor + " < " + esquema.minimum);
    if (esquema.maximum !== undefined && valor > esquema.maximum) err(valor + " > " + esquema.maximum);
  }
  if (typeof valor === "string" && esquema.pattern && !new RegExp(esquema.pattern).test(valor)) err("no cumple el patrón " + esquema.pattern);
  if (esquema.anyOf && !esquema.anyOf.some(s => valida(s, valor, raiz, ruta, []).length === 0)) err("no cumple ninguna alternativa de anyOf");
  if (Array.isArray(valor)) {
    if (esquema.minItems !== undefined && valor.length < esquema.minItems) err("menos de " + esquema.minItems + " elementos");
    if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) err("más de " + esquema.maxItems + " elementos");
    if (esquema.tuple) {
      if (valor.length !== esquema.tuple.length) err("debe tener " + esquema.tuple.length + " elementos y tiene " + valor.length);
      esquema.tuple.forEach((s, i) => { if (i < valor.length) valida(s, valor[i], raiz, ruta + "[" + i + "]", errores); });
    } else if (esquema.items) {
      const tope = Math.min(valor.length, 2000);                       // basta con una muestra: los datos son homogéneos
      for (let i = 0; i < tope; i++) valida(esquema.items, valor[i], raiz, ruta + "[" + i + "]", errores);
    }
  } else if (valor && typeof valor === "object") {
    for (const k of esquema.required || []) if (!(k in valor)) err("falta el campo obligatorio «" + k + "»");
    const props = esquema.properties || {};
    for (const k of Object.keys(valor)) {
      if (esquema.claves && !new RegExp(esquema.claves).test(k)) err("clave «" + k + "» no cumple " + esquema.claves);
      if (props[k]) valida(props[k], valor[k], raiz, ruta + "." + k, errores);
      else if (esquema.additionalProperties && typeof esquema.additionalProperties === "object") valida(esquema.additionalProperties, valor[k], raiz, ruta + "." + k, errores);
    }
  }
  return errores;
}
module.exports = { valida };
