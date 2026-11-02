// Una base de mentira, solo para las pruebas de unidad de las llaves de acceso (OF13b-3): entiende exactamente las consultas de
// src/oficina/llaves.ts (retos con y sin sesión, llaves_acceso con hogares, el alta en transacción y la auditoría) y nada más;
// una consulta que no conoce LANZA, para que un cambio de SQL no pase en silencio. No es PostgreSQL: lo que de verdad dice la base
// (restricciones, bloqueos, tipos) lo comprueban pruebas/integracion/llaves_acceso.test.ts y migracion_llaves_acceso.test.ts.
import type { Bd } from "../../src/bd/pool.ts";

export interface HogarFalso { id: number; rol: string; activo: boolean; correo: string; llave_usuario: Buffer | null; llave_rehabilitada_hasta: Date | null }
export interface LlaveFalsa {
  id: number; hogar_id: number; credencial_id: string; clave_publica: Buffer; contador: number; transports: string[]; nombre: string;
  respaldada: boolean; descubrible: boolean; aparato_id: number | null; ultima_vez_en: Date | null; revocada_en: Date | null;
}
export interface RetoFalso { sesion_id: number | null; tipo: string; reto: string; clave: Buffer | null; expira_en: Date }
export interface AuditoriaFalsa { hogar_id: number | null; accion: string; detalle: Record<string, unknown> }

type Resultado = { rows: Record<string, unknown>[]; rowCount: number };

export class BdDeLlaves {
  hogares: HogarFalso[] = [];
  llaves: LlaveFalsa[] = [];
  retos: RetoFalso[] = [];
  auditoria: AuditoriaFalsa[] = [];
  sesiones: { id: number; hogar_id: number; llave_id: number | null; revocada_en: Date | null }[] = [];
  consultas: string[] = [];
  private siguiente = 1;

  /** como pg.Pool para lo que usa llaves.ts (query y connect para enTransaccion) */
  get bd(): Bd { return this as unknown as Bd; }

  hogar(h: Partial<HogarFalso> & { id: number }): HogarFalso {
    const f: HogarFalso = { rol: "hogar", activo: true, correo: "h" + h.id + "@example.com", llave_usuario: null, llave_rehabilitada_hasta: null, ...h };
    this.hogares.push(f);
    return f;
  }
  llave(l: Partial<LlaveFalsa> & { hogar_id: number; credencial_id: string; clave_publica: Buffer }): LlaveFalsa {
    const f: LlaveFalsa = { id: this.siguiente++, contador: 0, transports: [], nombre: "Llave", respaldada: false, descubrible: true, aparato_id: null, ultima_vez_en: null, revocada_en: null, ...l };
    this.llaves.push(f);
    return f;
  }

  async connect() { return { query: (sql: string, p?: unknown[]) => this.query(sql, p), release() { /* nada */ } }; }

  async query(sql: string, p: unknown[] = []): Promise<Resultado> {
    const q = sql.replace(/\s+/g, " ").trim();
    this.consultas.push(q);
    const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length): Resultado => ({ rows, rowCount });
    if (q === "BEGIN" || q === "COMMIT" || q === "ROLLBACK") return r();
    if (q.startsWith("INSERT INTO auditoria")) { this.auditoria.push({ hogar_id: p[0] as number | null, accion: p[1] as string, detalle: JSON.parse(p[2] as string) }); return r([], 1); }
    if (q.startsWith("INSERT INTO llaves_retos (sesion_id, tipo, reto, clave, expira_en) VALUES (NULL, 'acceso'")) {
      const clave = p[1] as Buffer;
      if (this.retos.some(x => x.clave && x.clave.equals(clave))) throw new Error("clave repetida (UNIQUE)");
      this.retos.push({ sesion_id: null, tipo: "acceso", reto: p[0] as string, clave, expira_en: new Date(Date.now() + (p[2] as number) * 60_000) });
      return r([], 1);
    }
    if (q.startsWith("DELETE FROM llaves_retos WHERE clave = $1 AND tipo = 'acceso'")) {
      const i = this.retos.findIndex(x => x.tipo === "acceso" && x.clave !== null && x.clave.equals(p[0] as Buffer));
      if (i < 0) return r();
      const [f] = this.retos.splice(i, 1);
      return r([{ reto: f!.reto, vivo: f!.expira_en.getTime() > Date.now() }]);
    }
    if (q.startsWith("SELECT l.id, l.hogar_id, l.credencial_id, l.clave_publica, l.contador, l.transports, h.rol::text AS rol, h.llave_usuario FROM llaves_acceso l JOIN hogares h")) {
      return r(this.llaves.filter(l => l.credencial_id === p[0] && l.revocada_en === null).flatMap(l => {
        const h = this.hogares.find(x => x.id === l.hogar_id);
        return h && h.activo ? [{ ...l, rol: h.rol, llave_usuario: h.llave_usuario }] : [];
      }));
    }
    if (q.startsWith("UPDATE llaves_acceso SET contador = $2, ultima_vez_en = now() WHERE id = $1 AND revocada_en IS NULL AND (contador < $2 OR (contador = 0 AND $2 = 0))")) {
      const n = p[1] as number;
      const l = this.llaves.find(x => x.id === p[0] && x.revocada_en === null && (x.contador < n || (x.contador === 0 && n === 0)));
      if (!l) return r([], 0);
      l.contador = n; l.ultima_vez_en = new Date();
      return r([], 1);
    }
    if (q.startsWith("SELECT id FROM hogares WHERE id = $1 FOR UPDATE")) return r(this.hogares.filter(h => h.id === p[0]).map(h => ({ id: h.id })));
    if (q.startsWith("SELECT (SELECT count(*) FROM llaves_acceso")) {
      const h = this.hogares.find(x => x.id === p[0]);
      if (!h) return r();
      const suyas = this.llaves.filter(l => l.hogar_id === h.id);
      return r([{ activas: String(suyas.filter(l => !l.revocada_en).length), alguna_vez: String(suyas.length), rehabilitada_hasta: h.llave_rehabilitada_hasta, rol: h.rol, activo: h.activo }]);
    }
    if (q.startsWith("SELECT 1 FROM llaves_acceso WHERE credencial_id = $1")) return r(this.llaves.filter(l => l.credencial_id === p[0]).map(() => ({ "?column?": 1 })));
    if (q.startsWith("INSERT INTO llaves_acceso (hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada, descubrible, aparato_id, ultima_vez_en)")) {
      const f = this.llave({ hogar_id: p[0] as number, credencial_id: p[1] as string, clave_publica: p[2] as Buffer, contador: p[3] as number, transports: p[4] as string[],
        nombre: p[5] as string, respaldada: p[6] as boolean, descubrible: p[7] as boolean, aparato_id: p[8] as number | null, ultima_vez_en: new Date() });
      return r([{ id: String(f.id) }]);
    }
    if (q.startsWith("UPDATE hogares SET llave_rehabilitada_hasta = NULL WHERE id = $1")) {
      for (const h of this.hogares) if (h.id === p[0]) h.llave_rehabilitada_hasta = null;
      return r([], 1);
    }
    if (q.startsWith("UPDATE sesiones SET llave_id = $2, confirmada_en = now() WHERE id = $1 AND hogar_id = $3")) {
      const s = this.sesiones.find(x => x.id === p[0] && x.hogar_id === p[2] && !x.revocada_en);
      if (s) s.llave_id = p[1] as number;
      return r([], s ? 1 : 0);
    }
    throw new Error("BdDeLlaves: consulta que no conozco: " + q.slice(0, 120));
  }
}
