// L9-07: la api rechaza los alias que suplantan a la oficina o a un papel del sistema con la MISMA normalización que el cliente
// (apps/web/src/red/sala.ts): antes solo rechazaba la palabra exacta y pasaban «Ofícina», «La Oficina», «0ficina» u «Oficina 1». Sin base ni Docker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aliasReservado, normalizaAlias, pareceTelefono } from "../../src/yo/alias.ts";

test("aliasReservado: rechaza las variantes de «oficina» y los papeles del sistema, con o sin tildes, mayúsculas o cifras por letras", () => {
  for (const a of ["Oficina", "oficina", "Ofícina", "OFICINA", "La Oficina", "0ficina", "Oficina 1", "Of1cina", "La oficina de Ana", "Guía", "guia", "GUIA",
    "Admin", "Administración", "administracion", "Corresponsal", "OlivarTrack", "0livartrack"]) {
    assert.equal(aliasReservado(a), true, "debería rechazar «" + a + "»");
  }
});

test("aliasReservado: deja pasar alias normales (también los que contienen «guia» o «admin» dentro de otra palabra)", () => {
  for (const a of ["Mirlo", "Pepa Real", "Los del Cortijo", "Aguilar", "Guiomar", "Familia Admiral", "Olivo 12", "Ana-Lu"]) {
    assert.equal(aliasReservado(a), false, "no debería rechazar «" + a + "»");
  }
});

test("pareceTelefono: seis cifras seguidas o más, sin contar espacios ni guiones", () => {
  assert.equal(pareceTelefono("Casa 600 123 456"), true);
  assert.equal(pareceTelefono("Casa 600-123"), true);
  assert.equal(pareceTelefono("Olivo 12345"), false);
});

test("la normalización de la api es la del cliente (apps/web/src/red/sala.ts): si una cambia, esto falla", () => {
  const cadena = '.normalize("NFD").toLowerCase().replace(/0/g, "o").replace(/[1l|!]/g, "i").replace(/[^a-z]/g, "")';
  const sala = readFileSync(new URL("../../../web/src/red/sala.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("../../src/yo/alias.ts", import.meta.url), "utf8");
  assert.ok(sala.includes(cadena), "sala.ts ya no normaliza el alias así: actualiza apps/api/src/yo/alias.ts a la vez");
  assert.ok(api.includes(cadena), "yo/alias.ts debe normalizar como sala.ts");
  assert.ok(sala.includes("/oficina/.test(alias"), "sala.ts ya no oculta los alias que contienen «oficina»");
  assert.equal(normalizaAlias("La 0fícina 1"), "iaoficinai");   // también la «l» de «La» pasa a «i», como en el cliente
});
