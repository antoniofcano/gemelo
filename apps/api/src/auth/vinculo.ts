// Código corto para vincular un aparato sin teclado cómodo (las Meta Quest): contratos/sesion.md § Código corto.
// Es el patrón de «autorización de dispositivo» (RFC 8628) recortado a lo que hace falta aquí:
//   1. las gafas, sin sesión, piden un código (POST /api/auth/vincula) y reciben el código para enseñarlo y un secreto de
//      sondeo (256 bits) que solo ellas tienen;
//   2. en un aparato con sesión, la persona lo teclea (POST /api/yo/dispositivos/vincular) y lo aprueba o lo rechaza;
//   3. las gafas sondean con su secreto (POST /api/auth/vincula/sondeo); al verlo aprobado se gasta (un solo uso, atómico)
//      y reciben su propia sesión, como con el enlace mágico.
// En la base no hay nada en claro: el código va como HMAC con el secreto de la sesión y el sondeo como SHA-256.
import { createHmac, randomInt } from "node:crypto";
import type { Bd } from "../bd/pool.ts";
import { hashToken, nuevoToken } from "../seguridad/cripto.ts";
import { audita } from "./servicio.ts";

/** Sin caracteres que se confundan al leerlos en las gafas o al teclearlos: ni 0/O, ni 1/I/L. 31 símbolos. */
export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LARGO = 6;                 // 31^6 ≈ 8,9·10^8 combinaciones (≈ 29,7 bits)
export const MINUTOS = 5;               // decisión 46
export const SONDEO_S = 3;              // cada cuánto sondean las gafas (lo dice la respuesta; el límite por IP lo deja holgado)
const RE_CODIGO = new RegExp("^[" + ALFABETO + "]{" + LARGO + "}$");
/** Lo que acepta la api al teclear: el código con o sin guion y con espacios; se normaliza antes de mirar la base. */
export const PATRON_ENTRADA = "^[ A-Za-z0-9-]{6,12}$";

/** Un código nuevo al azar (crypto), con el guion para leerlo: «K7Q-4M2». */
export function nuevoCodigo(): string {
  let s = "";
  for (let i = 0; i < LARGO; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s.slice(0, 3) + "-" + s.slice(3);
}

/** Lo tecleado → las 6 letras del código (mayúsculas, sin guion ni espacios), o null si no puede ser un código. */
export function normalizaCodigo(s: string): string | null {
  const c = s.replace(/[\s-]/g, "").toUpperCase();
  return RE_CODIGO.test(c) ? c : null;
}

/** HMAC del código normalizado con el secreto del servidor: una copia de la base sola no permite sacar los códigos. */
export function hashCodigo(normalizado: string, secreto: string): Buffer {
  return createHmac("sha256", secreto).update("vinculo:" + normalizado, "utf8").digest();
}

export interface CodigoNuevo { codigo: string; sondeo: string; expiraEn: Date }

/** Crea un código para unas gafas. Si chocara con uno existente (casi imposible), prueba otro. */
export async function creaCodigo(bd: Bd, secreto: string): Promise<CodigoNuevo> {
  for (let intento = 0; intento < 4; intento++) {
    const codigo = nuevoCodigo(), sondeo = nuevoToken();
    try {
      const r = await bd.query<{ expira_en: Date }>(
        `INSERT INTO codigos_vinculo (codigo_hash, sondeo_hash, expira_en) VALUES ($1, $2, now() + make_interval(mins => $3))
         RETURNING expira_en`, [hashCodigo(normalizaCodigo(codigo)!, secreto), hashToken(sondeo), MINUTOS]);
      await audita(bd, null, "vinculo.pedido");
      return { codigo, sondeo, expiraEn: r.rows[0]!.expira_en };
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("no se pudo crear un código de vínculo único");
}

/**
 * El hogar de la sesión aprueba (o rechaza) el código que ve en sus gafas. Solo un código vivo, sin decidir: si no, false,
 * y quien llama responde lo MISMO tanto si no existe como si caducó o ya se decidió (no se puede sondear qué códigos hay).
 */
export async function decideCodigo(bd: Bd, secreto: string, hogarId: number, tecleado: string, aprobar: boolean): Promise<boolean> {
  const n = normalizaCodigo(tecleado);
  if (!n) { await audita(bd, hogarId, "vinculo.fallido"); return false; }
  const vivo = "codigo_hash = $1 AND aprobado_en IS NULL AND rechazado_en IS NULL AND expira_en > now()";
  const h = hashCodigo(n, secreto);
  const r = aprobar
    ? await bd.query("UPDATE codigos_vinculo SET hogar_id = $2, aprobado_en = now() WHERE " + vivo, [h, hogarId])
    : await bd.query("UPDATE codigos_vinculo SET rechazado_en = now() WHERE " + vivo, [h]);
  const ok = (r.rowCount ?? 0) === 1;
  await audita(bd, hogarId, ok ? (aprobar ? "vinculo.aprobado" : "vinculo.rechazado") : "vinculo.fallido");
  return ok;
}

export type EstadoSondeo = { estado: "esperando" | "rechazado" | "caducado" } | { estado: "aprobado"; hogarId: number; normasVersion: number | null };

/**
 * Lo que ven las gafas al sondear. Si está aprobado, lo GASTA de forma atómica (dos sondeos a la vez: entra uno) y
 * devuelve el hogar, para abrirle la sesión. Un secreto que no existe se ve como «caducado».
 */
export async function sondea(bd: Bd, sondeo: string): Promise<EstadoSondeo> {
  const h = hashToken(sondeo);
  const g = await bd.query<{ hogar_id: number; normas_version: number | null }>(
    `UPDATE codigos_vinculo c SET usado_en = now() FROM hogares h
      WHERE c.sondeo_hash = $1 AND c.aprobado_en IS NOT NULL AND c.usado_en IS NULL AND c.expira_en > now()
        AND h.id = c.hogar_id AND h.activo
      RETURNING c.hogar_id, h.normas_version`, [h]);
  const f = g.rows[0];
  if (f) { await audita(bd, f.hogar_id, "vinculo.usado"); return { estado: "aprobado", hogarId: f.hogar_id, normasVersion: f.normas_version }; }
  const r = await bd.query<{ rechazado: boolean; vivo: boolean; esperando: boolean }>(
    `SELECT rechazado_en IS NOT NULL AS rechazado, expira_en > now() AS vivo, aprobado_en IS NULL AND rechazado_en IS NULL AS esperando
       FROM codigos_vinculo WHERE sondeo_hash = $1`, [h]);
  const e = r.rows[0];
  if (!e || !e.vivo) return { estado: "caducado" };
  if (e.rechazado) return { estado: "rechazado" };
  return { estado: e.esperando ? "esperando" : "caducado" };   // aprobado y ya usado (o el hogar desactivado): no hay nada que dar
}
