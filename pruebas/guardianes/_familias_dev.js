"use strict";
// Familias SINTÉTICAS de usar y tirar para las e2e contra la base de infra/dev (Docker), que persiste entre pruebas.
// Por qué: desde la auditoría de la api del 2026-11-14 (L9-06, H-3) la api reconstruye al arrancar las expulsiones de los últimos 15 min leyendo
// la tabla `auditoria` (apps/api/src/presencia/reingreso.ts, reconstruyeMarcas). Si una e2e expulsa a una cuenta que otra e2e usa después
// (p. ej. la Abubilla sembrada, HOGARES[0]), la segunda la encuentra expulsada aunque el entorno se haya bajado y subido entre medias. Es lo que
// debe hacer la api; lo que falta es que las pruebas no compartan a quien expulsan. Por eso quien expulsa usa una familia propia y NUEVA en cada
// pasada: se borra si quedó de una pasada anterior (cortada o no) y se crea otra vez, con otro id. Las marcas viejas (en memoria de una api que
// siga arriba o reconstruidas de la auditoría) apuntan al id anterior, que ya no existe, así que no la tocan; y al acabar se borra.
//   const { familiaNueva, borraFamilias } = require("./_familias_dev");
//   const id = await familiaNueva(bd, "expulsada.p4@example.com", { alias: "Expulsada P4" });   ...   await borraFamilias(bd, ["expulsada.p4@example.com"]);
// `bd` es el cliente de pg con el dueño (como en las e2e). Solo correos @example.com: nunca toca una cuenta real ni las de la siembra.

const SINTETICO = /^[a-z0-9._-]+@example\.com$/;
const SIEMBRA = /^(hogar|vecino|mirlo)\.prueba@example\.com$/;   // infra/dev/herramientas/siembra.mjs: las comparten muchas pruebas; no se borran

function compruebaCorreo(c) {
  if (!SINTETICO.test(c)) throw new Error("_familias_dev: solo correos sintéticos @example.com (" + c + ")");
  if (SIEMBRA.test(c)) throw new Error("_familias_dev: " + c + " es de la siembra y la comparten otras pruebas: usa una familia propia");
}

/** Crea (o vuelve a crear, con id nuevo) una cuenta sintética activa y devuelve su id. Todo lo que cuelga de ella se va en cascada. */
async function familiaNueva(bd, correo, { rol = "hogar", alias = null, aliasVisible = true } = {}) {
  compruebaCorreo(correo);
  await bd.query("DELETE FROM hogares WHERE correo = $1", [correo]);
  const r = await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, $2, $3, $4, true) RETURNING id", [correo, rol, alias, aliasVisible]);
  return Number(r.rows[0].id);
}

/** Borra esas cuentas sintéticas (al acabar; no falla si ya no están). */
async function borraFamilias(bd, correos) {
  correos.forEach(compruebaCorreo);
  if (correos.length) await bd.query("DELETE FROM hogares WHERE correo = ANY($1)", [correos]);
}

module.exports = { familiaNueva, borraFamilias };
