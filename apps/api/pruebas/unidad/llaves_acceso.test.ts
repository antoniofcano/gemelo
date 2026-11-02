// Llaves de acceso para todas las cuentas (OF13b-3, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md) sin PostgreSQL: las opciones de
// alta de una familia, el alta común (registraLlave) y la entrada SIN sesión ni correo (opcionesDeAcceso + entraConLlave) contra la
// verificación REAL de @simplewebauthn/server, con un autenticador simulado (pruebas/apoyo/autenticador.ts) y una base de mentira
// que solo entiende las consultas de llaves.ts (pruebas/apoyo/llaves_bd.ts). Lo de la base de verdad (restricciones, bloqueos):
// pruebas/integracion/llaves_acceso.test.ts. No probado con ningún navegador ni autenticador real.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Rol } from "../../src/auth/servicio.ts";
import {
  entraConLlave, esDescubrible, FALLO_ACCESO, gastaRetoDeAcceso, MIN_RETO, opcionesDeAcceso, opcionesDeAlta, registraLlave, RP_NOMBRE_FAMILIA,
  verificaAlta,
} from "../../src/oficina/llaves.ts";
import { pareceToken } from "../../src/seguridad/cripto.ts";
import { AutenticadorFalso, type OpcionesFalsas } from "../apoyo/autenticador.ts";
import { configDePrueba, ORIGEN } from "../apoyo/contexto.ts";
import { BdDeLlaves } from "../apoyo/llaves_bd.ts";

const CFG = configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria" }).llave;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Una base con dos cuentas (familia 1, oficina 2), cada una con su user handle. */
function base() {
  const b = new BdDeLlaves();
  b.hogar({ id: 1, rol: "hogar", correo: "familia@example.com", llave_usuario: Buffer.alloc(32, 1) });
  b.hogar({ id: 2, rol: "oficina", correo: "ofi@example.com", llave_usuario: Buffer.alloc(32, 2) });
  b.sesiones.push({ id: 50, hogar_id: 1, llave_id: null, revocada_en: null }, { id: 60, hogar_id: 2, llave_id: null, revocada_en: null });
  return b;
}
const cuentaDe = (b: BdDeLlaves, id: number) => {
  const h = b.hogares.find(x => x.id === id)!;
  return { usuario: new Uint8Array(h.llave_usuario!), correo: h.correo, rol: h.rol as Rol };
};

/** Da de alta una llave del autenticador en la cuenta `hogarId` (opciones reales, verificación real, registraLlave). */
async function daDeAlta(b: BdDeLlaves, a: AutenticadorFalso, hogarId: number, o: OpcionesFalsas = {}) {
  const op = await opcionesDeAlta(CFG, cuentaDe(b, hogarId), []);
  const v = await verificaAlta(CFG, a.alta(op, o) as never, op.challenge);
  assert.ok(v.ok, "el alta de partida no se verificó");
  const r = await registraLlave(b.bd, { hogarId, sesionId: hogarId === 1 ? 50 : 60, sesion: { origen: "enlace", conLlave: false, aparatoAprobado: true }, llave: v.llave, nombre: "Android · Chrome", aparatoId: hogarId === 2 ? 7 : null });
  assert.ok(r.ok, "registraLlave: " + JSON.stringify(r));
  return r;
}
/** Una ceremonia de entrada sin sesión: opciones (con la cookie) y la respuesta del autenticador a ESAS opciones. */
async function asercion(b: BdDeLlaves, a: AutenticadorFalso, o: OpcionesFalsas = {}) {
  const { opciones, claveEnClaro } = await opcionesDeAcceso(b.bd, CFG);
  return { opciones, claveEnClaro, respuesta: a.entrada(opciones, o) as never };
}

// ---------------------------------------------------------------- opciones de alta
test("opciones de alta de una familia: residente y UV obligatorias, sin attestation, user handle y correo de la cuenta, RP ID exacto, excluye las suyas", async () => {
  const b = base();
  const op = await opcionesDeAlta(CFG, cuentaDe(b, 1), [{ credencialId: "AAAAAAAAAAAAAAAAAAAAAA", transports: ["internal"] }, { credencialId: "BBBBBBBBBBBBBBBBBBBBBB", transports: [] }]);
  assert.equal(op.rp.id, "gemelo.example.com", "el host exacto del gemelo");
  assert.equal(op.rp.name, RP_NOMBRE_FAMILIA, "a una familia no se le enseña «Oficina»");
  assert.equal(op.user.id, Buffer.alloc(32, 1).toString("base64url"), "user.id = hogares.llave_usuario");
  assert.equal(op.user.name, "familia@example.com", "decisión 185: el correo");
  assert.equal(op.user.displayName, "familia@example.com");
  assert.deepEqual(op.authenticatorSelection, { residentKey: "required", userVerification: "required", requireResidentKey: true });
  assert.equal(op.attestation, "none");
  assert.equal(op.extensions?.credProps, true);
  assert.deepEqual(op.excludeCredentials?.map(c => c.id), ["AAAAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBB"]);
  assert.equal(op.timeout, MIN_RETO * 60_000);
  assert.equal((await opcionesDeAlta(CFG, cuentaDe(b, 2), [])).rp.name, CFG.rpNombre, "la oficina, el nombre de la configuración");
});

test("descubrible: sí salvo que credProps diga expresamente que no (se pidió residentKey required)", () => {
  assert.equal(esDescubrible({ clientExtensionResults: { credProps: { rk: true } } }), true);
  assert.equal(esDescubrible({ clientExtensionResults: {} }), true, "sin credProps: muchos aparatos no la devuelven");
  assert.equal(esDescubrible({ clientExtensionResults: { credProps: {} } }), true);
  assert.equal(esDescubrible({ clientExtensionResults: { credProps: { rk: false } } }), false);
});

// ---------------------------------------------------------------- alta común
test("alta de una familia que ya tiene llaves: se guarda (descubrible, respaldada, sin aparato), la sesión queda con ella, se audita y pide aviso", async () => {
  const b = base();
  for (let i = 0; i < 3; i++) b.llave({ hogar_id: 1, credencial_id: "VIEJA" + i + "AAAAAAAAAAAAAAAA", clave_publica: Buffer.alloc(77) });
  const a = new AutenticadorFalso(ORIGEN);
  const op = await opcionesDeAlta(CFG, cuentaDe(b, 1), []);
  const v = await verificaAlta(CFG, a.alta(op, { respaldada: true, credProps: { rk: true } }) as never, op.challenge);
  assert.ok(v.ok);
  assert.equal(v.llave.respaldada, true); assert.equal(v.llave.descubrible, true);
  const r = await registraLlave(b.bd, { hogarId: 1, sesionId: 50, sesion: { origen: "enlace", conLlave: false, aparatoAprobado: false }, llave: v.llave, nombre: "iPhone · Safari", aparatoId: 99 });
  assert.deepEqual(r, { ok: true, id: r.ok ? r.id : 0, tipo: "familia", avisar: true, yaTenia: 3 });
  const l = b.llaves.find(x => x.credencial_id === a.id)!;
  assert.equal(l.descubrible, true); assert.equal(l.respaldada, true);
  assert.equal(l.aparato_id, null, "una familia no tiene aparato de oficina");
  assert.equal(b.sesiones.find(s => s.id === 50)!.llave_id, l.id);
  const au = b.auditoria.at(-1)!;
  assert.equal(au.accion, "llave.alta");
  assert.deepEqual(au.detalle, { llave: l.id, respaldada: true, descubrible: true, ya_tenia: 3 });
  assert.ok(!JSON.stringify(b.auditoria).includes(a.id) && !JSON.stringify(b.auditoria).includes("@"), "ni el id de credencial ni el correo en la auditoría");
});

test("alta común: la oficina con llave y el enlace solo no; la misma credencial en dos cuentas no; desde las gafas no", async () => {
  const b = base();
  const a = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, a, 2);
  assert.equal(b.auditoria.at(-1)!.accion, "oficina.llave_alta", "el nombre de OF13 se mantiene para la oficina");
  assert.equal(b.llaves.at(-1)!.aparato_id, 7);
  // otra llave con el enlace solo, sin rehabilitar: no (el buzón solo no añade a una cuenta de oficina que ya tuvo llave)
  const a2 = new AutenticadorFalso(ORIGEN);
  const op = await opcionesDeAlta(CFG, cuentaDe(b, 2), []);
  const v = await verificaAlta(CFG, a2.alta(op) as never, op.challenge);
  assert.ok(v.ok);
  const sesion = { origen: "enlace" as const, conLlave: false, aparatoAprobado: true };
  assert.deepEqual(await registraLlave(b.bd, { hogarId: 2, sesionId: 60, sesion, llave: v.llave, nombre: "x", aparatoId: 7 }), { ok: false, error: "entra_con_llave" });
  assert.deepEqual(await registraLlave(b.bd, { hogarId: 2, sesionId: 60, sesion: { ...sesion, conLlave: true, aparatoAprobado: false }, llave: v.llave, nombre: "x", aparatoId: 7 }), { ok: false, error: "aparato_pendiente" });
  // la credencial de la oficina, en la cuenta de la familia: repetida
  const op3 = await opcionesDeAlta(CFG, cuentaDe(b, 1), []);
  const v3 = await verificaAlta(CFG, a.alta(op3) as never, op3.challenge);
  assert.ok(v3.ok);
  assert.deepEqual(await registraLlave(b.bd, { hogarId: 1, sesionId: 50, sesion, llave: v3.llave, nombre: "x", aparatoId: null }), { ok: false, error: "repetida" });
  assert.deepEqual(await registraLlave(b.bd, { hogarId: 1, sesionId: 50, sesion: { ...sesion, origen: "vinculo" }, llave: v.llave, nombre: "x", aparatoId: null }), { ok: false, error: "no_titular" });
  b.hogares[0]!.activo = false;
  assert.deepEqual(await registraLlave(b.bd, { hogarId: 1, sesionId: 50, sesion, llave: v.llave, nombre: "x", aparatoId: null }), { ok: false, error: "sin_cuenta" });
  assert.equal(b.llaves.length, 1, "nada más se guardó");
});

// ---------------------------------------------------------------- entrada sin sesión: el reto
test("opciones de acceso: sin allowCredentials, UV obligatoria, RP ID exacto; la base guarda el SHA-256 de la cookie, nunca la cookie", async () => {
  const b = base();
  const { opciones, claveEnClaro } = await opcionesDeAcceso(b.bd, CFG);
  assert.equal(opciones.allowCredentials, undefined, "credenciales descubribles: el aparato elige");
  assert.equal(opciones.userVerification, "required");
  assert.equal(opciones.rpId, "gemelo.example.com");
  assert.equal(opciones.timeout, MIN_RETO * 60_000);
  assert.ok(pareceToken(claveEnClaro), "32 bytes al azar en base64url (43): lo que va en __Host-gemelo-reto");
  const [r] = b.retos;
  assert.equal(b.retos.length, 1);
  assert.equal(r!.tipo, "acceso"); assert.equal(r!.sesion_id, null); assert.equal(r!.reto, opciones.challenge);
  assert.ok(r!.clave!.equals(sha(claveEnClaro)), "solo el hash");
  assert.ok(!JSON.stringify(b.consultas).includes(claveEnClaro));
  const plazo = r!.expira_en.getTime() - Date.now();
  assert.ok(plazo > (MIN_RETO - 1) * 60_000 && plazo <= MIN_RETO * 60_000, "5 minutos");
  const otra = await opcionesDeAcceso(b.bd, CFG);
  assert.notEqual(otra.claveEnClaro, claveEnClaro); assert.notEqual(otra.opciones.challenge, opciones.challenge);
});

test("reto sin sesión: un solo uso, caduca, y una cookie que no tiene forma ni se busca", async () => {
  const b = base();
  const { opciones, claveEnClaro } = await opcionesDeAcceso(b.bd, CFG);
  assert.equal(await gastaRetoDeAcceso(b.bd, claveEnClaro), opciones.challenge);
  assert.equal(await gastaRetoDeAcceso(b.bd, claveEnClaro), null, "gastado");
  const c = await opcionesDeAcceso(b.bd, CFG);
  b.retos[0]!.expira_en = new Date(Date.now() - 1000);
  assert.equal(await gastaRetoDeAcceso(b.bd, c.claveEnClaro), null, "caducado");
  assert.equal(b.retos.length, 0, "el caducado también se borra al intentarlo");
  const n = b.consultas.length;
  for (const malo of [undefined, "", "corto", 42, "x".repeat(43) + "=", "ñ".repeat(43)]) assert.equal(await gastaRetoDeAcceso(b.bd, malo), null);
  assert.equal(b.consultas.length, n, "sin consulta a la base");
});

// ---------------------------------------------------------------- entrada sin sesión: la asercion
test("entrar con llave sin correo: la credencial se busca en todas las cuentas y devuelve la dueña; sube el contador y se audita", async () => {
  const b = base();
  const fam = new AutenticadorFalso(ORIGEN), ofi = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, fam, 1); await daDeAlta(b, ofi, 2);
  const lf = b.llaves.find(l => l.credencial_id === fam.id)!, lo = b.llaves.find(l => l.credencial_id === ofi.id)!;
  const e1 = await asercion(b, fam);
  assert.deepEqual(await entraConLlave(b.bd, CFG, e1.claveEnClaro, e1.respuesta), { ok: true, hogarId: 1, rol: "hogar", llaveId: lf.id });
  assert.equal(lf.contador, 1); assert.ok(lf.ultima_vez_en);
  assert.equal(b.retos.length, 0, "reto gastado");
  const e2 = await asercion(b, ofi);
  assert.deepEqual(await entraConLlave(b.bd, CFG, e2.claveEnClaro, e2.respuesta), { ok: true, hogarId: 2, rol: "oficina", llaveId: lo.id });
  const au = b.auditoria.filter(x => x.accion === "llave.acceso");
  assert.deepEqual(au.map(x => [x.hogar_id, x.detalle]), [[1, { llave: lf.id, rol: "hogar" }], [2, { llave: lo.id, rol: "oficina" }]]);
  assert.ok(!JSON.stringify(b.auditoria).includes(fam.id) && !JSON.stringify(b.auditoria).includes(ofi.id) && !JSON.stringify(b.auditoria).includes("@"));
  assert.equal(b.sesiones.every(s => s.llave_id === null || [lf.id, lo.id].includes(s.llave_id)), true, "entraConLlave no toca sesiones (las del alta, sí)");
});

test("entrar con llave: el reto es de un uso y de ESTE navegador (otra cookie, ninguna o caducada: fallo, y el reto se gasta)", async () => {
  const b = base();
  const a = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, a, 1);
  const e = await asercion(b, a);
  assert.ok((await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta)).ok);
  assert.equal(await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta), FALLO_ACCESO, "repetir la misma respuesta con la misma cookie");
  // la respuesta al reto de un navegador presentada con la cookie de otro: el reto no cuadra; el del otro queda gastado
  const mio = await asercion(b, a);
  const otro = await opcionesDeAcceso(b.bd, CFG);
  assert.equal(await entraConLlave(b.bd, CFG, otro.claveEnClaro, mio.respuesta), FALLO_ACCESO);
  assert.equal(await gastaRetoDeAcceso(b.bd, otro.claveEnClaro), null, "gastado aunque falló");
  assert.equal(await entraConLlave(b.bd, CFG, undefined, mio.respuesta), FALLO_ACCESO, "sin cookie");
  assert.ok((await entraConLlave(b.bd, CFG, mio.claveEnClaro, mio.respuesta)).ok, "el suyo seguía vivo");
  const tarde = await asercion(b, a);
  b.retos.find(r => r.reto === tarde.opciones.challenge)!.expira_en = new Date(Date.now() - 1);
  assert.equal(await entraConLlave(b.bd, CFG, tarde.claveEnClaro, tarde.respuesta), FALLO_ACCESO, "caducado");
});

test("entrar con llave: userHandle de otra cuenta, sin userHandle, cuenta de baja o llave revocada: fallo", async () => {
  const b = base();
  const a = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, a, 1);
  const motivos: string[] = [];
  const intenta = async (o: OpcionesFalsas) => {
    const e = await asercion(b, a, o);
    const r = await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta);
    motivos.push(String(b.auditoria.at(-1)!.detalle["motivo"]));
    return r;
  };
  assert.equal(await intenta({ userHandle: Buffer.alloc(32, 2).toString("base64url") }), FALLO_ACCESO, "el user handle de la oficina con la credencial de la familia (A10)");
  assert.equal(await intenta({ userHandle: null }), FALLO_ACCESO, "sin userHandle");
  b.hogares[0]!.activo = false;
  assert.equal(await intenta({}), FALLO_ACCESO, "cuenta de baja");
  b.hogares[0]!.activo = true;
  b.llaves[0]!.revocada_en = new Date();
  assert.equal(await intenta({}), FALLO_ACCESO, "llave revocada");
  assert.deepEqual(motivos, ["usuario", "usuario", "desconocida", "desconocida"], "el motivo solo queda en la auditoría");
  b.llaves[0]!.revocada_en = null;
  assert.ok((await intenta({})).ok, "con todo en orden, entra");
});

test("entrar con llave: el fallo es idéntico para una credencial desconocida y una firma mala (y para origen, RP ID, UV o contador)", async () => {
  const b = base();
  const a = new AutenticadorFalso(ORIGEN), extraña = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, a, 1);
  extraña.usuario = Buffer.alloc(32, 1).toString("base64url");   // aunque traiga el user handle de una cuenta real
  const resultados: unknown[] = [];
  const casos: [AutenticadorFalso, OpcionesFalsas, string][] = [
    [extraña, {}, "desconocida"], [a, { claveAjena: true }, "no_verificada"], [a, { origen: "https://malo.example.net" }, "origen"],
    [a, { rpId: "example.com" }, "rp_id"], [a, { verifica: false }, "sin_verificacion"],
  ];
  for (const [au, o, motivo] of casos) {
    const e = await asercion(b, au, o);
    const r = await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta);
    resultados.push(r);
    assert.equal(b.auditoria.at(-1)!.accion, "llave.acceso_fallido");
    assert.equal(b.auditoria.at(-1)!.detalle["motivo"], motivo, JSON.stringify(o));
  }
  for (const r of resultados) { assert.equal(r, FALLO_ACCESO); assert.deepEqual(r, { ok: false }); }
  assert.ok(Object.isFrozen(FALLO_ACCESO));
  assert.equal(b.auditoria.find(x => x.detalle["motivo"] === "desconocida")!.hogar_id, null, "desconocida: sin cuenta");
  assert.equal(b.llaves[0]!.contador, 0, "ningún fallo toca el contador");
  // la credencial desconocida pasa por la misma verificación (contra la clave de señuelo), no sale antes: el reto se gasta igual
  assert.equal(b.retos.length, 0);
});

test("entrar con llave: el contador que no sube se rechaza (clon); el 0 de una llave sincronizada vale siempre que no haya subido", async () => {
  const b = base();
  const a = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, a, 1);
  let e = await asercion(b, a, { contador: 5 });
  assert.ok((await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta)).ok);
  e = await asercion(b, a, { contador: 5 });
  assert.equal(await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta), FALLO_ACCESO, "mismo contador");
  e = await asercion(b, a, { contador: 0 });
  assert.equal(await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta), FALLO_ACCESO, "baja a 0 tras subir");
  assert.equal(b.llaves[0]!.contador, 5);
  // una llave sincronizada (contador siempre 0)
  const s = new AutenticadorFalso(ORIGEN);
  await daDeAlta(b, s, 2, { respaldada: true });
  for (let i = 0; i < 2; i++) {
    e = await asercion(b, s, { contador: 0, respaldada: true });
    assert.equal((await entraConLlave(b.bd, CFG, e.claveEnClaro, e.respuesta)).ok, true, "contador 0, vez " + (i + 1));
  }
  // dos entradas a la vez con el mismo contador: la base solo deja pasar una (la condición del UPDATE)
  const l = b.llaves[0]!;
  const e1 = await asercion(b, a, { contador: 6 });
  // otra entrada lo sube a 6 entre la lectura (la librería ve 5) y la escritura
  const original = b.query.bind(b);
  let primera = true;
  b.query = async (sql: string, p?: unknown[]) => {
    if (primera && sql.startsWith("SELECT l.id")) { primera = false; const r = await original(sql, p); l.contador = 6; (r.rows[0] as { contador: number }).contador = 5; return r; }
    return original(sql, p);
  };
  l.contador = 5;
  assert.equal(await entraConLlave(b.bd, CFG, e1.claveEnClaro, e1.respuesta), FALLO_ACCESO, "carrera: el contador ya era 6");
  assert.equal(b.auditoria.at(-1)!.detalle["motivo"], "contador");
});
