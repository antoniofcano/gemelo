// El .ics de un evento de la Agenda (OF11c): una librería mantenida (ical-generator) y el VTIMEZONE de Europe/Madrid de @touch4it/ical-timezones,
// para que las horas lleguen con su zona (TZID=Europe/Madrid) y no «flotantes» ni en UTC. Sin base de datos: recibe el evento ya leído.
//  - PUBLISH: lo bajan el hogar (GET /api/agenda/:id/evento.ics) y los correos de inscripción y de cambio de fecha o lugar. Mismo UID y un
//    SEQUENCE que sube con cada edición (segundos de `actualizada_en`): el calendario del hogar actualiza el evento en vez de duplicarlo.
//  - CANCEL: el correo de cancelación (STATUS:CANCELLED, con ORGANIZER y ATTENDEE, que es lo que los calendarios piden para aplicarlo).
// El texto del evento es el que escribió la oficina para todos los hogares; nunca lleva datos de las familias apuntadas.
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";

export const ZONA = "Europe/Madrid";

export interface EventoIcs {
  id: number; titulo: string; descripcion: string | null; lugar: string | null; finca: string | null;
  empieza_en: Date; termina_en: Date | null; actualizada_en: Date;
}
export interface OpcionesIcs {
  metodo: "PUBLISH" | "CANCEL";
  /** https://gemelo.canoydamas.es, sin barra final: da el dominio del UID y el enlace del evento */
  urlPublica: string;
  /** solo en CANCEL: quién organiza (el remitente de los correos) y a quién va */
  organizador?: { nombre: string; correo: string };
  asistente?: string;
}

/** «Nombre <a@b>» o «a@b» → nombre y dirección (sin dependencias: el remitente lo escribe el operador en GEMELO_CORREO_REMITENTE). */
export function partesDeRemitente(remitente: string, urlPublica: string): { nombre: string; correo: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/.exec(remitente);
  if (m) return { nombre: m[1]?.trim() || "Gemelo del olivar", correo: m[2]! };
  if (/^[^<>\s]+@[^<>\s]+$/.test(remitente.trim())) return { nombre: "Gemelo del olivar", correo: remitente.trim() };
  return { nombre: "Gemelo del olivar", correo: "gemelo@" + new URL(urlPublica).hostname };
}

export const uidDeEvento = (id: number, urlPublica: string): string => "evento-" + id + "@" + new URL(urlPublica).hostname;

export function icsDeEvento(e: EventoIcs, o: OpcionesIcs): string {
  const cancela = o.metodo === "CANCEL";
  const cal = ical({ prodId: { company: "gemelo", product: "agenda", language: "ES" }, method: cancela ? ICalCalendarMethod.CANCEL : ICalCalendarMethod.PUBLISH });
  cal.timezone({ name: ZONA, generator: getVtimezoneComponent });
  const fin = e.termina_en ?? new Date(e.empieza_en.getTime() + 3600_000);
  const lugar = [e.lugar, e.finca].filter((x): x is string => !!x).join(" · ");
  const url = o.urlPublica + "/finca/";
  const ev = cal.createEvent({
    id: uidDeEvento(e.id, o.urlPublica),
    sequence: Math.floor(e.actualizada_en.getTime() / 1000),
    stamp: e.actualizada_en,
    start: e.empieza_en,
    end: fin,
    timezone: ZONA,
    summary: e.titulo,
    description: (e.descripcion ? e.descripcion + "\n\n" : "") + "Gemelo del olivar: " + url,
    url,
    status: cancela ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
  });
  if (lugar) ev.location(lugar);
  if (cancela && o.organizador) ev.organizer({ name: o.organizador.nombre, email: o.organizador.correo });
  if (cancela && o.asistente) ev.createAttendee({ email: o.asistente });
  // con la zona puesta, la librería escribe DTSTAMP en hora de Madrid y sin Z; el RFC 5545 lo quiere siempre en UTC
  const sello = e.actualizada_en.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return cal.toString().replace(/^DTSTAMP:[^\r\n]*/m, "DTSTAMP:" + sello);
}
