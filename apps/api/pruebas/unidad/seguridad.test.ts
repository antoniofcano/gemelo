import assert from "node:assert/strict";
import { test } from "node:test";
import { mensajeDeEnlace } from "../../src/auth/correo.ts";
import { paginaEnlaceMalo, paginaEntrar } from "../../src/auth/paginas.ts";
import { normalizaCorreo } from "../../src/auth/servicio.ts";
import { recortaIp, sinConsulta } from "../../src/registro.ts";
import { hashToken, huella, nuevoToken, pareceToken } from "../../src/seguridad/cripto.ts";

test("tokens: 256 bits en base64url, distintos, y el hash es SHA-256 (32 bytes)", () => {
  const a = nuevoToken(), b = nuevoToken();
  assert.ok(pareceToken(a) && pareceToken(b));
  assert.notEqual(a, b);
  assert.equal(hashToken(a).length, 32);
  assert.ok(!pareceToken("corto") && !pareceToken(a + "x") && !pareceToken(a.slice(0, 42) + "/"));
  assert.equal(huella("ana@example.com"), huella("ana@example.com"));
  assert.ok(!huella("ana@example.com").includes("ana"));
});

test("correos: se normalizan y se rechaza lo raro (comentarios, grupos, comillas, espacios)", () => {
  assert.equal(normalizaCorreo("  Ana.Garcia@Example.COM "), "ana.garcia@example.com");
  for (const malo of ["", "ana", "ana@", "@example.com", "ana@example", "ana garcia@example.com", "\"ana\"@example.com",
    "ana@example.com, otro@example.com", "ana(comentario)@example.com", "<ana@example.com>", "a".repeat(65) + "@example.com"]) {
    assert.equal(normalizaCorreo(malo), null, malo);
  }
});

test("registro: la URL va sin consulta y la IP recortada", () => {
  assert.equal(sinConsulta("/api/auth/entrar?t=abc"), "/api/auth/entrar?…");
  assert.equal(sinConsulta("/api/salud"), "/api/salud");
  assert.equal(recortaIp("203.0.113.77"), "203.0.113.0/24");
  assert.equal(recortaIp("::ffff:198.51.100.9"), "198.51.100.0/24");
  assert.equal(recortaIp("2001:db8:abcd:12::1"), "2001:db8:abcd::/48");
});

test("páginas del enlace: sin scripts ni estilos (pasan la CSP), con el token escapado y el formulario por POST", () => {
  const t = nuevoToken();
  const p = paginaEntrar(t);
  assert.match(p, /<form method="post" action="\/api\/auth\/entrar">/);
  assert.ok(p.includes("value=\"" + t + "\""));
  for (const pag of [p, paginaEnlaceMalo("caducado"), paginaEnlaceMalo("usado"), paginaEnlaceMalo("no_valido")]) {
    assert.ok(!/<script|style=|<style/i.test(pag), "la página no debe llevar scripts ni estilos");
  }
  assert.match(paginaEnlaceMalo("caducado"), /caducado/);
});

test("el correo del enlace es solo texto, con el enlace y la caducidad", () => {
  const m = mensajeDeEnlace("ana@example.com", "https://gemelo.example.com/api/auth/entrar?t=X", 15);
  assert.equal(m.asunto, "Tu enlace para entrar");
  assert.match(m.texto, /15 minutos/);
  assert.match(m.texto, /entrar\?t=X/);
  assert.ok(!/<img|<a /i.test(m.texto));
});
