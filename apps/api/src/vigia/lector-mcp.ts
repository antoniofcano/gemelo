// Cliente MCP de Vigía (SDK oficial, transporte Streamable HTTP) con el token del gemelo en la cabecera Authorization,
// como el de OlivarTrack (ot/lector-mcp.ts). Solo llama a las dos herramientas del tiempo, sin argumentos.
// [NO VERIFICADO contra el Vigía real: la forma de las respuestas se leyó por el conector de claude.ai el 2026-10-30]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorDeVigia, esHerramientaTiempo, type HerramientaTiempo, type LectorVigia } from "./lector.ts";

export class LectorVigiaMcp implements LectorVigia {
  readonly origen = "vigia" as const;
  private readonly url: URL;
  private readonly token: string;
  private cliente: Client | null = null;

  constructor(url: string, token: string) {
    this.url = new URL(url);
    this.token = token;
  }

  private async conecta(): Promise<Client> {
    if (this.cliente) return this.cliente;
    const c = new Client({ name: "gemelo-api", version: "0.2.0" });
    const t = new StreamableHTTPClientTransport(this.url, {
      requestInit: { headers: { Authorization: "Bearer " + this.token }, redirect: "error" },
    });
    await c.connect(t);
    this.cliente = c;
    return c;
  }

  async llama(herramienta: HerramientaTiempo): Promise<unknown> {
    if (!esHerramientaTiempo(herramienta)) throw new ErrorDeVigia("herramienta fuera de la lista del tiempo");
    let c: Client;
    try { c = await this.conecta(); } catch { throw new ErrorDeVigia("no se pudo conectar con Vigía"); }
    let r: Awaited<ReturnType<Client["callTool"]>>;
    try { r = await c.callTool({ name: herramienta, arguments: {} }, undefined, { timeout: 20_000 }); }
    catch {
      // la sesión MCP pudo caducar o cortarse: la próxima vez se conecta de nuevo
      await this.cierra().catch(() => undefined);
      throw new ErrorDeVigia(herramienta + ": Vigía no respondió");
    }
    if (r.isError) throw new ErrorDeVigia(herramienta + " devolvió un error");
    if (r.structuredContent && typeof r.structuredContent === "object") return r.structuredContent;
    // sin salida estructurada: el primer bloque de texto debe ser JSON
    const bloques = Array.isArray(r.content) ? r.content : [];
    const texto = bloques.find((b): b is { type: "text"; text: string } => !!b && typeof b === "object" && (b as { type?: string }).type === "text");
    if (!texto) throw new ErrorDeVigia(herramienta + " no devolvió datos estructurados");
    try { return JSON.parse(texto.text) as unknown; }
    catch { throw new ErrorDeVigia(herramienta + " devolvió texto que no es JSON"); }
  }

  async cierra(): Promise<void> {
    const c = this.cliente;
    this.cliente = null;
    await c?.close();
  }
}
