// F3c: una sala de LiveKit y un reloj de mentira para la voz de las guiadas (pruebas de unidad e integración). La sala imita lo que dice LiveKit:
// sin canPublish, las pistas se despublican; un atributo vacío se quita; una identidad que no está da false (el 404 de RoomService).
import type { ModeradorVoz, Papel, PresenteVoz } from "../../src/presencia/livekit.ts";
import { PATRON_SALA_GUIADA } from "../../src/presencia/livekit.ts";
import type { Reloj } from "../../src/presencia/voz.ts";

export class RelojFalso implements Reloj {
  t = 0; private n = 0; private readonly tareas = new Map<number, { en: number; fn: () => void }>();
  ahora() { return this.t; }
  programa(ms: number, fn: () => void) { const id = ++this.n; this.tareas.set(id, { en: this.t + ms, fn }); return id; }
  cancela(h: unknown) { this.tareas.delete(h as number); }
  get pendientes() { return this.tareas.size; }
  async avanza(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      const [id, x] = [...this.tareas].filter(([, v]) => v.en <= fin).sort((a, b) => a[1].en - b[1].en)[0] ?? [];
      if (id === undefined || !x) break;
      this.t = Math.max(this.t, x.en); this.tareas.delete(id); x.fn(); await vacia();
    }
    this.t = fin; await vacia();
  }
}
export const vacia = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

export interface Part { micro: boolean; atributos: Record<string, string>; papel: Papel; pistas: string[] }
export class SalaFalsa implements ModeradorVoz {
  readonly salas = new Map<string, Map<string, Part>>();
  readonly llamadas: string[] = [];
  falla = false;
  entra(sala: string, identidad: string, papel: Papel = "familia", micro = papel !== "familia") {
    if (!this.salas.has(sala)) this.salas.set(sala, new Map());
    this.salas.get(sala)!.set(identidad, { micro, atributos: {}, papel, pistas: [] });
  }
  sale(sala: string, identidad: string) { this.salas.get(sala)?.delete(identidad); }
  p(sala: string, i: string) { return this.salas.get(sala)?.get(i); }
  conMicro(sala: string) { return [...(this.salas.get(sala) ?? [])].filter(([, p]) => p.micro && p.papel === "familia").map(([i]) => i); }
  async actualiza(sala: string, identidad: string, c: { micro?: boolean; atributos?: Record<string, string> }) {
    this.llamadas.push("actualiza " + sala + " " + identidad.slice(-3) + " " + JSON.stringify(c));
    if (this.falla) throw new Error("LiveKit no responde");
    const p = this.p(sala, identidad);
    if (!p) return false;
    if (c.micro !== undefined) { p.micro = c.micro; if (!c.micro) p.pistas = []; }   // como LiveKit: sin canPublish, sus pistas se despublican
    for (const [k, v] of Object.entries(c.atributos ?? {})) { if (v === "") delete p.atributos[k]; else p.atributos[k] = v; }
    return true;
  }
  async presentes(sala: string): Promise<PresenteVoz[]> {
    return [...(this.salas.get(sala) ?? [])].map(([identidad, p]) => ({ identidad, papel: p.papel, micro: p.micro, pistasMicro: [...p.pistas] }));
  }
  async silencia(sala: string, ids: string[]) { let n = 0; for (const i of ids) { const p = this.p(sala, i); if (p) { n += p.pistas.length; p.pistas = []; } } this.llamadas.push("silencia " + ids.length); return n; }
  async expulsaHogar(sala: string, prefijo: string) { let n = 0; for (const i of [...(this.salas.get(sala)?.keys() ?? [])]) if (i.startsWith(prefijo + "_")) { this.sale(sala, i); n++; } return n; }
  async salasGuiadas() { return [...this.salas.keys()].filter(s => PATRON_SALA_GUIADA.test(s)); }
}
