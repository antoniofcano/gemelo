// Cliente MCP de OlivarTrack (SDK oficial, transporte Streamable HTTP) con el token PROPIO de solo lectura del gemelo
// (decisión 17) en la cabecera Authorization. El filtro de verdad está en el servidor de OlivarTrack; aquí hay dos
// barreras más: solo se llaman herramientas de la lista cerrada y, si el servidor ofrece alguna de escritura a este
// token, el lector se niega a seguir (el token estaría mal emitido). [NO VERIFICADO contra el OlivarTrack real]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorDeLectura, esHerramientaDeLectura, type HerramientaLectura, type LectorOlivarTrack, PREFIJOS_ESCRITURA } from "./lector.ts";

export class LectorMcp implements LectorOlivarTrack {
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
    const { tools } = await c.listTools();
    const escritura = tools.map(x => x.name).filter(n => PREFIJOS_ESCRITURA.some(p => n.startsWith(p)));
    if (escritura.length) {
      await c.close();
      throw new ErrorDeLectura("el token de OlivarTrack deja ver herramientas de escritura (" + escritura.length + "): debe ser de solo lectura");
    }
    this.cliente = c;
    return c;
  }

  async llama(herramienta: HerramientaLectura, entrada: Record<string, string | number>): Promise<unknown> {
    if (!esHerramientaDeLectura(herramienta)) throw new ErrorDeLectura("herramienta fuera de la lista de lectura");
    const c = await this.conecta();
    const r = await c.callTool({ name: herramienta, arguments: entrada }, undefined, { timeout: 60_000 });
    if (r.isError) throw new ErrorDeLectura(herramienta + " devolvió un error");
    if (r.structuredContent && typeof r.structuredContent === "object") return r.structuredContent;
    // sin salida estructurada: el primer bloque de texto debe ser JSON (si no, la sincronía no se fía: ARQUITECTURA-MULTIUSUARIO)
    const bloques = Array.isArray(r.content) ? r.content : [];
    const texto = bloques.find((b): b is { type: "text"; text: string } => !!b && typeof b === "object" && (b as { type?: string }).type === "text");
    if (!texto) throw new ErrorDeLectura(herramienta + " no devolvió datos estructurados");
    try { return JSON.parse(texto.text) as unknown; }
    catch { throw new ErrorDeLectura(herramienta + " devolvió texto que no es JSON"); }
  }

  async cierra(): Promise<void> {
    await this.cliente?.close();
    this.cliente = null;
  }
}
