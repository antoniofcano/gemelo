// El correo de los avisos (OF11c): lo que la campana del gemelo ya recibe (tabla `avisos_hogar`) sale también por correo a los hogares que lo
// pidieron (`hogares.avisos_correo`), con el MISMO cartero del enlace mágico (src/auth/correo.ts: nodemailer; en local, Mailpit).
//  - EN SEGUNDO PLANO: ninguna petición espera al SMTP. Las rutas que crean avisos no mandan nada; el Repartidor mira la tabla —al despertarlo
//    una petición que cambió algo, y cada `cadaSeg` por si acaso— y manda lo pendiente. `despierta()` solo programa un temporizador.
//  - REINTENTO ACOTADO: cada intento se anota ANTES de mandar (`correo_intentos`, `correo_ultimo_intento`; así dos repartidores no mandan lo
//    mismo), la espera entre intentos crece (1, 3, 9, 27 min…) y al llegar a `reintentos` se desiste (`correo_desistido_en`). El aviso sigue en
//    la campana. Un aviso de más de 3 días ya no se manda.
//  - CONTENIDO: título, texto y enlace del aviso (los mismos que ve en la campana) y el .ics del evento si el aviso viene de la Agenda. Nada de
//    otras familias. Texto llano más HTML sencillo sin imágenes remotas ni seguimiento. Baja con un clic (cabecera List-Unsubscribe y enlace).
//  - AUDITORÍA: un asiento `correo.avisos` por pasada con los recuentos; nunca la dirección ni el contenido.
import { createHmac, timingSafeEqual } from "node:crypto";
import { icsDeEvento, partesDeRemitente, type EventoIcs } from "../agenda/ics.ts";
import { audita } from "../auth/servicio.ts";
import type { Cartero, Mensaje } from "../auth/correo.ts";
import type { Bd } from "../bd/pool.ts";

/** Lo único que el repartidor pide a la base (un Pool de pg lo cumple; las pruebas ponen una de mentira). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BdConsulta { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }> }

export const ANTIGUEDAD_MAXIMA_DIAS = 3;
export const LOTE = 50;

export type TipoIcs = "inscripcion" | "cambio" | "cancelacion";

// ---------------------------------------------------------------- baja de los avisos por correo
/** Firma de la baja de un hogar: HMAC del id con el secreto de sesión. No caduca (un correo antiguo debe poder darse de baja) y solo sirve para eso. */
const firma = (secreto: string, hogar: number): string => createHmac("sha256", secreto).update("baja-avisos:" + hogar).digest("base64url").slice(0, 32);
export const tokenDeBaja = (secreto: string, hogar: number): string => hogar + "." + firma(secreto, hogar);

/** El id del hogar si el token es auténtico; si no, null. */
export function hogarDeBaja(secreto: string, token: string): number | null {
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const hogar = Number(m[1]);
  const esperado = Buffer.from(firma(secreto, hogar)), dado = Buffer.from(m[2]!);
  return esperado.length === dado.length && timingSafeEqual(esperado, dado) ? hogar : null;
}
export const urlDeBaja = (urlPublica: string, secreto: string, hogar: number): string => urlPublica + "/api/avisos/baja?t=" + tokenDeBaja(secreto, hogar);

// ---------------------------------------------------------------- el mensaje
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
const sinSaltos = (s: string) => s.replace(/[\r\n]+/g, " ");

export interface DatosAviso { para: string; titulo: string; texto: string | null; enlace: string | null }

/** Texto llano y HTML sencillo de un aviso. Solo lo del propio aviso, el enlace al gemelo y la forma de dejar de recibirlos. */
export function mensajeDeAviso(d: DatosAviso, urlPublica: string, urlBaja: string): Mensaje {
  const abre = urlPublica + (d.enlace ?? "/");
  const asunto = sinSaltos(d.titulo);
  const texto =
    "Hola:\n\n" + d.titulo + "\n" + (d.texto ? "\n" + d.texto + "\n" : "") +
    "\nVer en el gemelo del olivar: " + abre + "\n\n" +
    "--\nRecibes este correo porque, al entrar en el gemelo, marcaste que querías los avisos por correo.\n" +
    "Para dejar de recibirlos, abre este enlace y pulsa el botón: " + urlBaja + "\n";
  const html =
    "<!doctype html><html lang=\"es\"><body style=\"font-family:sans-serif;line-height:1.45;color:#222\">" +
    "<p>Hola:</p><h2 style=\"font-size:1.1em\">" + esc(d.titulo) + "</h2>" +
    (d.texto ? "<p style=\"white-space:pre-line\">" + esc(d.texto) + "</p>" : "") +
    "<p><a href=\"" + esc(abre) + "\">Ver en el gemelo del olivar</a></p>" +
    "<hr><p style=\"font-size:.85em;color:#555\">Recibes este correo porque, al entrar en el gemelo, marcaste que querías los avisos por correo. " +
    "<a href=\"" + esc(urlBaja) + "\">Dejar de recibirlos</a>.</p></body></html>";
  return {
    para: d.para, asunto, texto, html,
    cabeceras: { "List-Unsubscribe": "<" + urlBaja + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// ---------------------------------------------------------------- el repartidor
export interface OpcionesRepartidor {
  urlPublica: string;
  /** secreto de sesión: firma los enlaces de baja */
  secreto: string;
  /** el remitente configurado (GEMELO_CORREO_REMITENTE) o null en el buzón de pruebas */
  remitente: string | null;
  /** intentos por aviso y hogar antes de desistir */
  reintentos: number;
  /** cada cuántos segundos mira si hay pendientes aunque nadie lo despierte (0 = nunca) */
  cadaSeg: number;
  /** espera entre el aviso de una petición y la pasada (agrupa las ráfagas), en ms */
  retardoMs?: number;
  log?: { warn(o: object, m: string): void; info(o: object, m: string): void };
}

interface Pendiente { aviso_id: number; hogar_id: number; correo_intentos: number; correo: string; titulo: string; texto: string | null; enlace: string | null; evento_id: number | null; ics: TipoIcs | null }
export interface Resumen { enviados: number; fallidos: number; desistidos: number }

export class Repartidor {
  private reloj: NodeJS.Timeout | undefined;
  private temporizador: NodeJS.Timeout | undefined;
  private corriendo: Promise<Resumen> | undefined;
  private otraVez = false;
  private readonly bd: BdConsulta;
  private readonly cartero: Cartero;
  private readonly o: OpcionesRepartidor;
  constructor(bd: BdConsulta, cartero: Cartero, o: OpcionesRepartidor) { this.bd = bd; this.cartero = cartero; this.o = o; }

  /** Se llama tras una petición que pudo crear avisos. NO espera ni bloquea: solo programa una pasada (y las ráfagas se juntan en una). */
  despierta(): void {
    if (this.temporizador) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      void this.reparte().catch(() => undefined);
    }, this.o.retardoMs ?? 1500);
    this.temporizador.unref();
  }

  inicia(): void {
    if (this.o.cadaSeg > 0 && !this.reloj) {
      this.reloj = setInterval(() => { void this.reparte().catch(() => undefined); }, this.o.cadaSeg * 1000);
      this.reloj.unref();
    }
    this.despierta();
  }

  async para(): Promise<void> {
    if (this.reloj) clearInterval(this.reloj);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.reloj = this.temporizador = undefined;
    await this.corriendo?.catch(() => undefined);
  }

  /** Una pasada: si ya hay una en marcha, pide otra al terminar y devuelve la actual. */
  reparte(): Promise<Resumen> {
    if (this.corriendo) { this.otraVez = true; return this.corriendo; }
    this.corriendo = (async () => {
      const total: Resumen = { enviados: 0, fallidos: 0, desistidos: 0 };
      try {
        do {
          this.otraVez = false;
          const r = await this.pasada();
          total.enviados += r.enviados; total.fallidos += r.fallidos; total.desistidos += r.desistidos;
        } while (this.otraVez);
      } finally { this.corriendo = undefined; }
      return total;
    })();
    return this.corriendo;
  }

  private async pasada(): Promise<Resumen> {
    const { bd, cartero, o } = this;
    // reclamar es contar el intento: con dos repartidores, cada pendiente lo lleva solo uno (SKIP LOCKED)
    const filas: Pendiente[] = (await bd.query(
      `WITH c AS (
         SELECT ah.aviso_id, ah.hogar_id FROM avisos_hogar ah
           JOIN avisos a ON a.id = ah.aviso_id
           JOIN hogares h ON h.id = ah.hogar_id AND h.activo AND h.avisos_correo
          WHERE ah.correo_enviado_en IS NULL AND ah.correo_desistido_en IS NULL
            AND (a.caduca_en IS NULL OR a.caduca_en > now())
            AND a.creado_en > now() - make_interval(days => ${ANTIGUEDAD_MAXIMA_DIAS})
            AND (ah.correo_ultimo_intento IS NULL OR ah.correo_ultimo_intento <= now() - make_interval(mins => power(3, ah.correo_intentos - 1)::int))
          ORDER BY a.id, ah.hogar_id LIMIT ${LOTE} FOR UPDATE OF ah SKIP LOCKED)
       UPDATE avisos_hogar ah SET correo_intentos = ah.correo_intentos + 1, correo_ultimo_intento = now()
         FROM c JOIN avisos a ON a.id = c.aviso_id JOIN hogares h ON h.id = c.hogar_id
        WHERE ah.aviso_id = c.aviso_id AND ah.hogar_id = c.hogar_id
       RETURNING ah.aviso_id, ah.hogar_id, ah.correo_intentos, h.correo, a.titulo, a.texto, a.enlace, a.evento_id, a.ics`)).rows;
    const r: Resumen = { enviados: 0, fallidos: 0, desistidos: 0 };
    for (const f of filas) {
      try {
        const m = mensajeDeAviso({ para: f.correo, titulo: f.titulo, texto: f.texto, enlace: f.enlace }, o.urlPublica, urlDeBaja(o.urlPublica, o.secreto, Number(f.hogar_id)));
        const ics = await this.invitacion(f);
        if (ics) m.ics = ics;
        await cartero.envia(m);
        await bd.query("UPDATE avisos_hogar SET correo_enviado_en = now() WHERE aviso_id = $1 AND hogar_id = $2", [f.aviso_id, f.hogar_id]);
        r.enviados++;
      } catch (e) {
        r.fallidos++;
        // solo el código del fallo: el texto de un error SMTP puede traer la dirección
        o.log?.warn({ evento: "correo_aviso_fallido", aviso: Number(f.aviso_id), hogar: Number(f.hogar_id), intento: f.correo_intentos, codigo: (e as { code?: string }).code ?? "?" }, "no se pudo mandar el aviso por correo");
        if (f.correo_intentos >= o.reintentos) {
          await bd.query("UPDATE avisos_hogar SET correo_desistido_en = now() WHERE aviso_id = $1 AND hogar_id = $2", [f.aviso_id, f.hogar_id]).catch(() => undefined);
          r.desistidos++;
        }
      }
    }
    if (filas.length) await audita(bd as Bd, null, "correo.avisos", { ...r }).catch(() => undefined);
    return r;
  }

  /** La invitación de calendario de un aviso de la Agenda, o null (sin evento, evento borrado o ya cancelado cuando el aviso no es de cancelación). */
  private async invitacion(f: Pendiente): Promise<Mensaje["ics"] | null> {
    if (!f.ics || f.evento_id === null) return null;
    const e: (EventoIcs & { estado: string }) | undefined = (await this.bd.query(
      "SELECT id, titulo, descripcion, lugar, finca, empieza_en, termina_en, actualizada_en, estado FROM visitas WHERE id = $1", [f.evento_id])).rows[0];
    if (!e) return null;
    const cancela = f.ics === "cancelacion";
    if (cancela !== (e.estado === "cancelada")) return null;
    const org = partesDeRemitente(this.o.remitente ?? "", this.o.urlPublica);
    return {
      metodo: cancela ? "CANCEL" : "PUBLISH",
      contenido: icsDeEvento({ ...e, id: Number(e.id) }, { metodo: cancela ? "CANCEL" : "PUBLISH", urlPublica: this.o.urlPublica, ...(cancela ? { organizador: org, asistente: f.correo } : {}) }),
    };
  }
}
