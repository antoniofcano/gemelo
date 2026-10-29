// Código corto de las gafas (contratos/sesion.md § Código corto), sin base: formato, alfabeto sin ambiguos, normalización
// de lo tecleado y HMAC con el secreto del servidor. Lo que toca la base lo prueba la integración (api.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALFABETO, hashCodigo, LARGO, MINUTOS, normalizaCodigo, nuevoCodigo, PATRON_ENTRADA } from "../../src/auth/vinculo.ts";

test("formato K7Q-4M2: 6 símbolos de un alfabeto de 31 sin ambiguos (ni 0/O ni 1/I/L), 5 minutos", () => {
  assert.equal(ALFABETO.length, 31);
  for (const ambiguo of "01OIL") assert.ok(!ALFABETO.includes(ambiguo), ambiguo + " es ambiguo");
  assert.equal(new Set(ALFABETO).size, ALFABETO.length, "sin repetidos");
  assert.equal(LARGO, 6);
  assert.equal(MINUTOS, 5);
  for (let i = 0; i < 2000; i++) assert.match(nuevoCodigo(), /^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
});

test("al azar: 20 000 códigos sin apenas repetidos y todos los símbolos en todas las posiciones", () => {
  const vistos = new Set<string>(), porPos = Array.from({ length: LARGO }, () => new Set<string>());
  for (let i = 0; i < 20000; i++) {
    const c = normalizaCodigo(nuevoCodigo())!;
    vistos.add(c);
    for (let p = 0; p < LARGO; p++) porPos[p]!.add(c[p]!);
  }
  // con 31^6 ≈ 8,9·10^8 combinaciones, la esperanza de choques en 20 000 es ≈ 0,23
  assert.ok(vistos.size >= 19995, "demasiados repetidos: " + (20000 - vistos.size));
  for (const s of porPos) assert.equal(s.size, ALFABETO.length);
});

test("lo tecleado se normaliza (minúsculas, sin guion ni espacios) y lo que no puede ser un código, fuera", () => {
  assert.equal(normalizaCodigo("k7q-4m2"), "K7Q4M2");
  assert.equal(normalizaCodigo(" K7Q 4M2 "), "K7Q4M2");
  assert.equal(normalizaCodigo("K7Q4M2"), "K7Q4M2");
  for (const malo of ["", "K7Q-4M", "K7Q-4M22", "K0Q-4M2", "KOQ-4M2", "K1Q-4M2", "KIQ-4M2", "KLQ-4M2", "K7Q_4M2", "K7Q-4M2;", "ñ7Q-4M2"]) {
    assert.equal(normalizaCodigo(malo), null, malo);
  }
  const re = new RegExp(PATRON_ENTRADA);
  assert.ok(re.test("K7Q-4M2") && re.test("k7q 4m2") && !re.test("K7Q") && !re.test("K7Q-4M2-K7Q-4M2"));
});

test("en la base va un HMAC del código con el secreto del servidor, no el código ni su SHA-256 a secas", () => {
  const a = hashCodigo("K7Q4M2", "s".repeat(32)), b = hashCodigo("K7Q4M2", "t".repeat(32));
  assert.equal(a.length, 32);
  assert.notDeepEqual(a, b, "otro secreto, otro hash: una copia de la base sin el secreto no sirve");
  assert.deepEqual(a, hashCodigo("K7Q4M2", "s".repeat(32)));
  assert.notDeepEqual(hashCodigo("K7Q4M3", "s".repeat(32)), a);
});
