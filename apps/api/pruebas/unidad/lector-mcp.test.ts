// El lector MCP de verdad contra un servidor MCP LOCAL hecho con el SDK oficial (nunca contra OlivarTrack real):
// manda el token por cabecera, lee la salida estructurada (o el JSON del texto) y se niega si ve herramientas de escritura.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { LectorMcp } from "../../src/ot/lector-mcp.ts";

const servidores: Server[] = [];
after(() => { for (const s of servidores) s.close(); });

/** Servidor MCP sin estado; `escritura` añade una herramienta que un token de solo lectura no debería ver. */
async function levanta(opciones: { escritura?: boolean; soloTexto?: boolean }) {
  const cabeceras: (string | undefined)[] = [];
  const s = createServer(async (req: IncomingMessage, res) => {
    cabeceras.push(req.headers.authorization);
    const mcp = new McpServer({ name: "ot-sintetico", version: "0.0.0" });
    mcp.registerTool("aforo_y_avance_de_recoleccion", { description: "sintético" }, async () => {
      const datos = { consultadoEn: "2026-10-28T09:00:00Z", parcelas: [{ id: "sint:1", pctRecogido: 40 }] };
      return opciones.soloTexto
        ? { content: [{ type: "text" as const, text: JSON.stringify(datos) }] }
        : { content: [{ type: "text" as const, text: "resumen para un modelo" }], structuredContent: datos };
    });
    mcp.registerTool("novedades", { description: "sintético", inputSchema: { desde: z.string(), limite: z.number().optional() } },
      async ({ desde }) => ({ content: [{ type: "text" as const, text: "{}" }], structuredContent: { novedades: [], hayMas: false, eco: desde } }));
    if (opciones.escritura) mcp.registerTool("registrar_entrega", { description: "escritura" }, async () => ({ content: [] }));
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void t.close(); void mcp.close(); });
    await mcp.connect(t);
    await t.handleRequest(req, res);
  });
  servidores.push(s);
  await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
  return { url: "http://127.0.0.1:" + (s.address() as AddressInfo).port + "/mcp", cabeceras };
}

const TOKEN = ["sintetico", "solo", "lectura"].join("-");

test("lee la salida estructurada y manda el token en Authorization: Bearer", async () => {
  const { url, cabeceras } = await levanta({});
  const l = new LectorMcp(url, TOKEN);
  try {
    const r = await l.llama("aforo_y_avance_de_recoleccion", {}) as { parcelas: unknown[] };
    assert.equal(r.parcelas.length, 1);
    const n = await l.llama("novedades", { desde: "2026-01-01T00:00:00Z", limite: 500 }) as { eco: string };
    assert.equal(n.eco, "2026-01-01T00:00:00Z", "los argumentos llegan");
    assert.ok(cabeceras.length > 0 && cabeceras.every(c => c === "Bearer " + TOKEN));
  } finally { await l.cierra(); }
});

test("sin salida estructurada, acepta el texto si es JSON", async () => {
  const { url } = await levanta({ soloTexto: true });
  const l = new LectorMcp(url, TOKEN);
  try {
    const r = await l.llama("aforo_y_avance_de_recoleccion", {}) as { consultadoEn: string };
    assert.equal(r.consultadoEn, "2026-10-28T09:00:00Z");
  } finally { await l.cierra(); }
});

test("si el token deja ver herramientas de escritura, se niega a leer", async () => {
  const { url } = await levanta({ escritura: true });
  const l = new LectorMcp(url, TOKEN);
  try {
    await assert.rejects(l.llama("aforo_y_avance_de_recoleccion", {}), /escritura/);
  } finally { await l.cierra(); }
});

test("una herramienta fuera de la lista de lectura no se llama nunca", async () => {
  const { url, cabeceras } = await levanta({});
  const l = new LectorMcp(url, TOKEN);
  await assert.rejects(l.llama("registrar_entrega" as never, {}), /lista de lectura/);
  assert.equal(cabeceras.length, 0, "ni siquiera se conecta");
  await l.cierra();
});
