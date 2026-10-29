import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cargaConfig, cargaConfigBd, ErrorDeConfig } from "../../src/config.ts";

const dir = mkdtempSync(join(tmpdir(), "gemelo-config-"));
const fichero = (nombre: string, contenido: string) => { const p = join(dir, nombre); writeFileSync(p, contenido + "\n"); return p; };

const base = {
  GEMELO_URL_PUBLICA: "https://gemelo.example.com",
  GEMELO_DB_URL: "postgresql://gemelo_api@db:5432/gemelo",
};
const prod = {
  ...base, NODE_ENV: "production",
  GEMELO_DB_CLAVE_FICHERO: fichero("bd", "clave-sintetica-de-prueba"),
  GEMELO_SESION_SECRETO_FICHERO: fichero("sesion", "x".repeat(40)),
  GEMELO_SMTP_HOST: "smtp.example.com", GEMELO_SMTP_USUARIO: "gemelo@example.com",
  GEMELO_SMTP_CLAVE_FICHERO: fichero("smtp", "clave-smtp-sintetica"),
  GEMELO_CORREO_REMITENTE: "Gemelo <gemelo@example.com>",
};

test("valores por defecto: puerto 8000 (el enchufe de infra/dev), buzón fuera de producción, 2 saltos de proxy", () => {
  const c = cargaConfig(base);
  assert.equal(c.puerto, 8000);
  assert.equal(c.correo.modo, "buzon");
  assert.equal(c.saltosProxy, 2);
  assert.deepEqual(c.origenes, ["https://gemelo.example.com"]);
  assert.equal(c.enlace.minutos, 15);
  assert.ok(c.sesion.secreto.length >= 32, "fuera de producción se inventa un secreto");
});

test("GEMELO_DB_URL: usuario, servidor, puerto y base; nunca la contraseña dentro", () => {
  assert.deepEqual(cargaConfigBd({ GEMELO_DB_URL: "postgresql://gemelo@db:5433/gemelo", GEMELO_DB_CLAVE: "x" }),
    { host: "db", puerto: 5433, base: "gemelo", usuario: "gemelo", clave: "x", max: 10 });
  assert.throws(() => cargaConfigBd({ GEMELO_DB_URL: "postgresql://u:" + "p@db/g" }), ErrorDeConfig);
  assert.throws(() => cargaConfigBd({ GEMELO_DB_URL: "mysql://u@db/g" }), ErrorDeConfig);
});

test("producción completa se carga y lee los secretos de fichero", () => {
  const c = cargaConfig(prod);
  assert.equal(c.produccion, true);
  assert.equal(c.bd.clave, "clave-sintetica-de-prueba");
  assert.equal(c.correo.modo, "smtp");
  if (c.correo.modo === "smtp") { assert.equal(c.correo.tls, true); assert.equal(c.correo.puerto, 465); }
});

test("producción rechaza lo inseguro", () => {
  assert.throws(() => cargaConfig({ ...prod, GEMELO_URL_PUBLICA: "http://gemelo.example.com" }), /https/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_CORREO: "buzon" }), /buzón/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_SMTP_TLS: "no" }), /TLS/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_OT: "grabado", GEMELO_OT_GRABACIONES: dir }), /grabación/);
  const { GEMELO_SESION_SECRETO_FICHERO: _s, ...sinSecreto } = prod;
  assert.throws(() => cargaConfig(sinSecreto), /GEMELO_SESION_SECRETO_FICHERO/);
  const { GEMELO_DB_CLAVE_FICHERO: _b, ...conVariable } = prod;
  assert.throws(() => cargaConfig({ ...conVariable, GEMELO_DB_CLAVE: "en-la-variable" }), /fichero/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_SESION_SECRETO_FICHERO: fichero("corto", "corto") }), /32/);
});

test("OlivarTrack por MCP exige https y token de fichero", () => {
  assert.throws(() => cargaConfig({ ...base, GEMELO_OT: "mcp", GEMELO_OT_MCP_URL: "http://ot.example.com/mcp", GEMELO_OT_TOKEN: "t" }), /https/);
  const c = cargaConfig({ ...base, GEMELO_OT: "mcp", GEMELO_OT_MCP_URL: "https://ot.example.com/mcp", GEMELO_OT_TOKEN_FICHERO: fichero("ot", "token-sintetico") });
  assert.equal(c.ot.modo, "mcp");
  if (c.ot.modo === "mcp") assert.equal(c.ot.token, "token-sintetico");
});
