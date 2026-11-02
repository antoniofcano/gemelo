// Integración de la lógica general de llaves (OF13b-3, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md) contra PostGIS en un contenedor,
// con el rol de la api (gemelo_api) y un autenticador simulado (pruebas/apoyo/autenticador.ts) frente a la verificación real de
// @simplewebauthn/server. Sin rutas todavía (son OF13b-4 y OF13b-5): llama a llaves.ts directamente. Comprueba lo que la base de
// mentira de la unidad no puede: las restricciones de la 0021 (reto sin sesión con clave, tipo 'acceso'), el UNIQUE de la
// credencial entre cuentas, el bloqueo de la cuenta en el alta, la condición del contador y la purga de retos caducados.
// Sin Docker se SALTA con aviso. ESCRITA SIN EJECUTAR al hacer OF13b-3 (agente solo Node): queda por lanzar por el banco.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { purga } from "../../src/auth/servicio.ts";
import {
  entraConLlave, FALLO_ACCESO, gastaRetoDeAcceso, opcionesDeAcceso, opcionesDeAlta, registraLlave, usuarioDeLlave, verificaAlta,
} from "../../src/oficina/llaves.ts";
import { AutenticadorFalso, type OpcionesFalsas } from "../apoyo/autenticador.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, ORIGEN } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la lógica general de las llaves (OF13b-3) con PostGIS NO se ha comprobado";
const CFG = configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria" }).llave;
let bd: BdDePrueba;
const ids: Record<string, number> = {};
const sesiones: Record<string, number> = {};

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [["familia-acceso@example.com", "hogar"], ["otra-acceso@example.com", "hogar"], ["ofi-acceso@example.com", "oficina"]] as const) {
    const id = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
    ids[c] = id;
    sesiones[c] = Number((await bd.dueno.query<{ id: number }>(
      "INSERT INTO sesiones (hogar_id, hash, expira_en, origen) VALUES ($1, $2, now() + interval '1 day', 'enlace') RETURNING id", [id, randomBytes(32)])).rows[0]!.id);
  }
}, { timeout: 240_000 });

after(async () => { if (!SALTO) await bd.cierra(); });

const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const FAM = "familia-acceso@example.com", OTRA = "otra-acceso@example.com", OFI = "ofi-acceso@example.com";

async function daDeAlta(correo: string, a: AutenticadorFalso, o: OpcionesFalsas = {}) {
  const cuenta = await usuarioDeLlave(bd.app, ids[correo]!);
  assert.ok(cuenta);
  const op = await opcionesDeAlta(CFG, cuenta, []);
  const v = await verificaAlta(CFG, a.alta(op, o) as never, op.challenge);
  assert.ok(v.ok);
  return registraLlave(bd.app, { hogarId: ids[correo]!, sesionId: sesiones[correo]!, sesion: { origen: "enlace", conLlave: false, aparatoAprobado: true }, llave: v.llave, nombre: "Prueba", aparatoId: null });
}
async function entra(a: AutenticadorFalso, o: OpcionesFalsas = {}) {
  const { opciones, claveEnClaro } = await opcionesDeAcceso(bd.app, CFG);
  return entraConLlave(bd.app, CFG, claveEnClaro, a.entrada(opciones, o) as never);
}

test("reto sin sesión: la fila cumple la 0021 (sin sesión, con el SHA-256 de la cookie, tipo acceso), un solo uso y la purga lo borra al caducar", async t => {
  if (salta(t)) return;
  const { opciones, claveEnClaro } = await opcionesDeAcceso(bd.app, CFG);
  const f = (await bd.dueno.query("SELECT sesion_id, tipo, reto, clave, expira_en > now() + interval '4 minutes' AS cinco FROM llaves_retos WHERE reto = $1", [opciones.challenge])).rows[0];
  assert.equal(f.sesion_id, null); assert.equal(f.tipo, "acceso"); assert.equal(f.cinco, true);
  assert.ok(Buffer.from(f.clave).equals(createHash("sha256").update(claveEnClaro, "utf8").digest()));
  assert.equal(await gastaRetoDeAcceso(bd.app, claveEnClaro), opciones.challenge);
  assert.equal(await gastaRetoDeAcceso(bd.app, claveEnClaro), null);
  const c = await opcionesDeAcceso(bd.app, CFG);
  await bd.dueno.query("UPDATE llaves_retos SET expira_en = now() - interval '1 minute' WHERE reto = $1", [c.opciones.challenge]);
  await purga(bd.app);
  assert.equal((await bd.dueno.query("SELECT 1 FROM llaves_retos WHERE reto = $1", [c.opciones.challenge])).rowCount, 0);
});

test("alta de familia con llaves ya puestas (decisión 183): se guarda descubrible, la sesión queda con ella y se audita sin el id de credencial", async t => {
  if (salta(t)) return;
  const a1 = new AutenticadorFalso(ORIGEN), a2 = new AutenticadorFalso(ORIGEN);
  const r1 = await daDeAlta(FAM, a1);
  const r2 = await daDeAlta(FAM, a2, { respaldada: true });
  assert.ok(r1.ok && r2.ok);
  assert.equal(r2.ok && r2.yaTenia, 1); assert.equal(r2.ok && r2.avisar, true); assert.equal(r2.ok && r2.tipo, "familia");
  const l = (await bd.dueno.query("SELECT descubrible, respaldada, aparato_id FROM llaves_acceso WHERE credencial_id = $1", [a2.id])).rows[0];
  assert.deepEqual(l, { descubrible: true, respaldada: true, aparato_id: null });
  const s = (await bd.dueno.query("SELECT llave_id FROM sesiones WHERE id = $1", [sesiones[FAM]])).rows[0];
  assert.equal(Number(s.llave_id), r2.ok ? r2.id : 0);
  const au = (await bd.dueno.query("SELECT detalle::text AS d FROM auditoria WHERE accion = 'llave.alta' AND hogar_id = $1", [ids[FAM]])).rows;
  assert.equal(au.length, 2);
  assert.ok(au.every(x => !x.d.includes(a1.id) && !x.d.includes(a2.id) && !x.d.includes("@")));
});

test("la misma credencial no entra en dos cuentas; dos altas a la vez de la misma no se cuelan", async t => {
  if (salta(t)) return;
  const a = new AutenticadorFalso(ORIGEN);
  const [x, y] = await Promise.all([daDeAlta(OTRA, a), daDeAlta(OTRA, a)]);
  assert.deepEqual([x.ok, y.ok].sort(), [false, true], JSON.stringify([x, y]));
  assert.deepEqual(await daDeAlta(FAM, a), { ok: false, error: "repetida" });
});

test("entrar sin sesión ni correo: la dueña, el contador sube; userHandle de otra cuenta, cuenta de baja, revocada o desconocida: el mismo fallo", async t => {
  if (salta(t)) return;
  const a = new AutenticadorFalso(ORIGEN);
  const r = await daDeAlta(OFI, a);
  assert.ok(r.ok);
  assert.deepEqual(await entra(a), { ok: true, hogarId: ids[OFI], rol: "oficina", llaveId: r.id });
  assert.equal(Number((await bd.dueno.query("SELECT contador FROM llaves_acceso WHERE id = $1", [r.id])).rows[0].contador), 1);
  const otro = (await bd.dueno.query<{ u: Buffer }>("SELECT llave_usuario AS u FROM hogares WHERE id = $1", [ids[FAM]])).rows[0]!.u;
  assert.equal(await entra(a, { userHandle: Buffer.from(otro).toString("base64url") }), FALLO_ACCESO);
  assert.equal(await entra(new AutenticadorFalso(ORIGEN)), FALLO_ACCESO, "desconocida");
  assert.equal(await entra(a, { claveAjena: true }), FALLO_ACCESO, "firma mala");
  await bd.dueno.query("UPDATE hogares SET activo = false WHERE id = $1", [ids[OFI]]);
  assert.equal(await entra(a), FALLO_ACCESO, "de baja");
  await bd.dueno.query("UPDATE hogares SET activo = true WHERE id = $1", [ids[OFI]]);
  await bd.dueno.query("UPDATE llaves_acceso SET revocada_en = now() WHERE id = $1", [r.id]);
  assert.equal(await entra(a), FALLO_ACCESO, "revocada");
  const fallos = (await bd.dueno.query("SELECT detalle->>'motivo' AS m, detalle::text AS d FROM auditoria WHERE accion = 'llave.acceso_fallido' ORDER BY id")).rows;
  assert.deepEqual(fallos.map(f => f.m), ["usuario", "desconocida", "no_verificada", "desconocida", "desconocida"]);
  assert.ok(fallos.every(f => !f.d.includes(a.id)), "nunca el id de credencial");
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM llaves_retos WHERE tipo = 'acceso'")).rows[0].n, 0, "todos los retos gastados");
});
