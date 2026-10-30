// El envío de correo detrás de una interfaz: SMTP (el de OVH en producción, decisión 15) o un buzón en memoria para las
// pruebas. El correo es solo texto: sin imágenes remotas ni seguimiento (doc/sistema/UX.md §4.3).
import nodemailer, { type Transporter } from "nodemailer";

export interface Mensaje { para: string; asunto: string; texto: string }

export interface Cartero {
  envia(m: Mensaje): Promise<void>;
  cierra(): Promise<void>;
}

/** Buzón de pruebas: guarda los mensajes en memoria. Nunca en producción (lo impide config.ts). */
export class BuzonDePruebas implements Cartero {
  readonly mensajes: Mensaje[] = [];
  falla = false;
  async envia(m: Mensaje): Promise<void> {
    if (this.falla) throw new Error("fallo simulado del buzón");
    this.mensajes.push(m);
  }
  ultimoPara(para: string): Mensaje | undefined {
    return [...this.mensajes].reverse().find(m => m.para === para);
  }
  async cierra(): Promise<void> { /* nada */ }
}

export interface OpcionesSmtp { host: string; puerto: number; tls: boolean; usuario: string | undefined; clave: string | undefined; remitente: string }

/**
 * SMTP. En producción, TLS obligatorio y con usuario (config.ts lo exige). Para OVH: ssl0.ovh.net, puerto 465 (TLS directo)
 * o 587 (STARTTLS) [NO VERIFICADO contra el buzón real]. Sin TLS ni usuario solo en local (Mailpit de infra/dev).
 */
export class CarteroSmtp implements Cartero {
  private readonly t: Transporter;
  private readonly remitente: string;
  constructor(o: OpcionesSmtp) {
    this.remitente = o.remitente;
    this.t = nodemailer.createTransport({
      host: o.host,
      port: o.puerto,
      secure: o.tls && o.puerto === 465,
      requireTLS: o.tls && o.puerto !== 465,
      ignoreTLS: !o.tls,
      ...(o.usuario ? { auth: { user: o.usuario, pass: o.clave ?? "" } } : {}),
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  async envia(m: Mensaje): Promise<void> {
    await this.t.sendMail({ from: this.remitente, to: m.para, subject: m.asunto, text: m.texto });
  }
  async cierra(): Promise<void> { this.t.close(); }
}

export function mensajeDeEnlace(para: string, enlace: string, minutos: number): Mensaje {
  return {
    para,
    asunto: "Tu enlace para entrar",
    texto:
      "Hola:\n\n" +
      "Para entrar en el gemelo del olivar, abre este enlace en el mismo dispositivo donde lo pediste. " +
      "Caduca en " + minutos + " minutos y sirve una sola vez:\n\n" +
      enlace + "\n\n" +
      "Si no lo has pedido tú, ignora este correo: nadie puede entrar sin él.\n",
  };
}

/** El enlace de bienvenida de una cuenta recién dada de alta (o que aún no ha entrado): mismo enlace, otro texto. */
export function mensajeDeBienvenida(para: string, enlace: string, minutos: number): Mensaje {
  return {
    para,
    asunto: "Bienvenida al gemelo del olivar",
    texto:
      "Hola:\n\n" +
      "Cano & Damas Oleicultores te ha dado acceso al gemelo del olivar, para que veas tu haza y pasees por la finca. " +
      "Para entrar por primera vez, abre este enlace en el dispositivo donde quieras usarlo. " +
      "Caduca en " + minutos + " minutos y sirve una sola vez:\n\n" +
      enlace + "\n\n" +
      "Si caduca, no pasa nada: se puede pedir otro desde la portada con este mismo correo. " +
      "Si no esperabas este mensaje, ignóralo: nadie puede entrar sin el enlace.\n",
  };
}
