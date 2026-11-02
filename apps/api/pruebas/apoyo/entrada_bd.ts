// Una base de mentira para las pruebas de unidad de la ENTRADA con llave sin sesión (OF13b-5): la de las llaves (llaves_bd.ts) más lo
// justo de sesiones (el almacén de auth/almacen.ts), aparatos de oficina (oficina/aparatos.ts), enlaces (auth/servicio.ts, para el
// segundo enlace) y la auditoría. Una consulta que no conoce LANZA (la de llaves_bd.ts), para que un cambio de SQL no pase en silencio.
// La validez de una sesión (el CASE de `lee()`) se reproduce aquí en JS, simplificada (sin inactividad): NO es PostgreSQL. Lo que dice
// el SQL de verdad lo comprueba pruebas/integracion/entrada_llave.test.ts (PostGIS, por el banco).
import { createHash } from "node:crypto";
import { BdDeLlaves } from "./llaves_bd.ts";

export interface SesionFalsa {
  id: number; hogar_id: number; hash: Buffer; creada_en: Date; expira_en: Date; origen: string; aparato_id: number | null;
  confirmada_en: Date | null; aparato_nombre: string | null; llave_id: number | null; revocada_en: Date | null;
}
export interface AparatoFalso {
  id: number; hogar_id: number; nombre: string; hash: Buffer; creado_en: Date; aprobado_en: Date | null; aprobado_como: string | null; revocado_en: Date | null;
}
type Resultado = { rows: Record<string, unknown>[]; rowCount: number };
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const HORA = 3_600_000;

export class BdDeEntrada extends BdDeLlaves {
  filas: SesionFalsa[] = [];
  aparatos: AparatoFalso[] = [];
  /** normas aceptadas por hogar (si falta, 1: sin primer acceso) */
  normas = new Map<number, number | null>();
  /** enlaces vivos: SHA-256 (hex) del token → hogar */
  tokens = new Map<string, number>();
  private sig = 100;

  /** Un aparato de oficina con su secreto en claro (lo que lleva la cookie __Host-gemelo-aparato). */
  aparato(a: Partial<AparatoFalso> & { hogar_id: number; secreto: string }): AparatoFalso {
    const { secreto, ...resto } = a;
    const f: AparatoFalso = { id: this.sig++, nombre: "Windows · Edge", hash: sha(secreto), creado_en: new Date(), aprobado_en: null, aprobado_como: null, revocado_en: null, ...resto };
    this.aparatos.push(f);
    return f;
  }
  /** Un enlace vivo para el hogar (el token en claro). */
  enlace(hogarId: number, token: string): void { this.tokens.set(sha(token).toString("hex"), hogarId); }

  override async query(sql: string, p: unknown[] = []): Promise<Resultado> {
    const q = sql.replace(/\s+/g, " ").trim();
    const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length): Resultado => ({ rows, rowCount });
    const ahora = Date.now();
    // ---- sesiones (auth/almacen.ts)
    if (q.startsWith("SELECT s.id AS sid, s.origen, h.id AS hogar_id")) {
      this.consultas.push(q);
      const s = this.filas.find(x => x.hash.equals(p[0] as Buffer) && !x.revocada_en && x.expira_en.getTime() > ahora);
      const h = s && this.hogares.find(x => x.id === s.hogar_id && x.activo);
      if (!s || !h) return r();
      const a = this.aparatos.find(x => x.id === s.aparato_id && x.hogar_id === s.hogar_id && !x.revocado_en) ?? null;
      const l = this.llaves.find(x => x.id === s.llave_id && x.hogar_id === s.hogar_id && !x.revocada_en) ?? null;
      const oficina = h.rol === "oficina" || h.rol === "admin";
      const reciente = s.creada_en.getTime() > ahora - (p[2] as number) * HORA;
      const vale = oficina && s.origen === "vinculo" ? reciente
        : oficina ? a !== null && (s.origen === "enlace" || (s.origen === "llave" && l !== null)) && reciente
        : s.origen !== "llave" || l !== null;
      if (!vale) return r();
      const conf = s.confirmada_en !== null && s.confirmada_en.getTime() > ahora - (p[4] as number) * 60_000;
      return r([{ sid: s.id, origen: s.origen, hogar_id: h.id, rol: h.rol, alias: null, alias_visible: false, normas_version: this.normas.get(h.id) ?? 1,
        expira_en: s.expira_en, refrescar: false, aparato_id: a?.id ?? null, aparato_aprobado: a?.aprobado_en != null, confirmada_en: s.confirmada_en,
        confirmacion_vigente: conf, llave_id: l?.id ?? null }]);
    }
    if (q.startsWith("INSERT INTO sesiones (hogar_id, hash, expira_en, origen, aparato_id, confirmada_en, aparato_nombre, llave_id)")) {
      this.consultas.push(q);
      const hash = p[1] as Buffer;
      if (this.filas.some(x => x.hash.equals(hash))) return r([], 0);   // ON CONFLICT: solo la actividad
      this.filas.push({ id: this.sig++, hogar_id: p[0] as number, hash, creada_en: new Date(), expira_en: p[2] as Date, origen: p[3] as string,
        aparato_id: p[4] as number | null, confirmada_en: p[5] as Date | null, aparato_nombre: p[6] as string | null, llave_id: p[7] as number | null, revocada_en: null });
      return r([], 1);
    }
    if (q.startsWith("UPDATE sesiones SET revocada_en = now() WHERE hash = $1 AND revocada_en IS NULL")) {
      this.consultas.push(q);
      const s = this.filas.find(x => x.hash.equals(p[0] as Buffer) && !x.revocada_en);
      if (s) s.revocada_en = new Date();
      return r([], s ? 1 : 0);
    }
    if (q.startsWith("UPDATE sesiones SET ultima_actividad_en = now() WHERE id = $1")) { this.consultas.push(q); return r([], 1); }
    if (q.startsWith("SELECT normas_version FROM hogares WHERE id = $1")) {
      this.consultas.push(q);
      return r(this.hogares.filter(h => h.id === p[0]).map(h => ({ normas_version: this.normas.has(h.id) ? this.normas.get(h.id) : 1 })));
    }
    // ---- aparatos de oficina (oficina/aparatos.ts y oficina/rutas.ts)
    if (q.startsWith("SELECT id, hogar_id, aprobado_en IS NOT NULL AS aprobado, revocado_en IS NOT NULL AS revocado")) {
      this.consultas.push(q);
      return r(this.aparatos.filter(a => a.hash.equals(p[0] as Buffer)).map(a => ({
        id: a.id, hogar_id: a.hogar_id, aprobado: a.aprobado_en !== null, revocado: a.revocado_en !== null,
        maduro: a.creado_en.getTime() <= ahora - (p[1] as number) * 60_000, vigente: a.creado_en.getTime() > ahora - (p[2] as number) * HORA,
      })));
    }
    if (q.startsWith("UPDATE aparatos_oficina SET ultimo_uso_en = now() WHERE id = $1")) { this.consultas.push(q); return r([], 1); }
    if (q.startsWith("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'segundo_enlace'")) {
      this.consultas.push(q);
      const a = this.aparatos.find(x => x.id === p[0] && !x.aprobado_en && !x.revocado_en);
      if (a) { a.aprobado_en = new Date(); a.aprobado_como = "segundo_enlace"; }
      return r([], a ? 1 : 0);
    }
    if (q.startsWith("UPDATE aparatos_oficina SET revocado_en = now() WHERE id = $1")) {
      this.consultas.push(q);
      const a = this.aparatos.find(x => x.id === p[0] && !x.revocado_en);
      if (a) a.revocado_en = new Date();
      return r([], a ? 1 : 0);
    }
    if (q.startsWith("INSERT INTO aparatos_oficina (hogar_id, nombre, hash) VALUES ($1, $2, $3) RETURNING id")) {
      this.consultas.push(q);
      const a: AparatoFalso = { id: this.sig++, hogar_id: p[0] as number, nombre: p[1] as string, hash: p[2] as Buffer, creado_en: new Date(), aprobado_en: null, aprobado_como: null, revocado_en: null };
      this.aparatos.push(a);
      return r([{ id: a.id }]);
    }
    if (q.startsWith("SELECT nombre FROM aparatos_oficina WHERE id = $1")) {
      this.consultas.push(q);
      return r(this.aparatos.filter(a => a.id === p[0]).map(a => ({ nombre: a.nombre })));
    }
    // ---- el enlace (auth/servicio.ts consumeEnlace), para el segundo enlace que aprueba un aparato pendiente
    if (q.startsWith("UPDATE tokens_acceso t SET usado_en = now() FROM hogares h")) {
      this.consultas.push(q);
      const k = (p[0] as Buffer).toString("hex"), id = this.tokens.get(k);
      const h = id !== undefined ? this.hogares.find(x => x.id === id && x.activo) : undefined;
      if (!h) return r();
      this.tokens.delete(k);
      return r([{ hogar_id: h.id, rol: h.rol, normas_version: this.normas.get(h.id) ?? 1 }]);
    }
    return super.query(sql, p);
  }
}
