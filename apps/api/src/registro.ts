// Registros en JSON (pino, el de Fastify) sin tokens ni cookies: la URL se registra SIN consulta (el enlace mágico lleva el
// token en `?t=`), no se registran cabeceras y, por si alguien añade un campo, se redactan las rutas sensibles.
// La IP se recorta (/24 en IPv4, /48 en IPv6): basta para ver abusos y no identifica un hogar.
import type { FastifyServerOptions } from "fastify";

export const REDACTADAS = [
  "req.headers.cookie", "req.headers.authorization", "req.query.t", "req.body.t", "req.body.correo",
  "res.headers[\"set-cookie\"]", "headers.cookie", "headers.authorization", "token", "correo", "clave",
];

export function recortaIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return v4[1] + "." + v4[2] + "." + v4[3] + ".0/24";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::/48";
  return "?";
}

export function sinConsulta(url: string): string {
  const i = url.indexOf("?");
  return i < 0 ? url : url.slice(0, i) + "?…";
}

export function opcionesRegistro(nivel: string, destino?: NodeJS.WritableStream): FastifyServerOptions["logger"] {
  const base = {
    level: nivel,
    redact: { paths: REDACTADAS, censor: "[REDACTADO]" },
    serializers: {
      req(req: { method: string; url: string; ip?: string; id?: string }) {
        return { metodo: req.method, url: sinConsulta(req.url), ip: recortaIp(req.ip), id: req.id };
      },
      res(res: { statusCode: number }) { return { estado: res.statusCode }; },
    },
  };
  return destino ? Object.assign(base, { stream: destino }) : base;
}
