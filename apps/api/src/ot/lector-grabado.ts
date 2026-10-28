// Lector de pruebas: respuestas grabadas SINTÉTICAS (ninguna es de OlivarTrack real) en <carpeta>/<herramienta>.json.
// Para `novedades`, el fichero es una lista de páginas que se sirven en orden (hayMas / siguienteDesde).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ErrorDeLectura, esHerramientaDeLectura, type HerramientaLectura, type LectorOlivarTrack } from "./lector.ts";

export class LectorGrabado implements LectorOlivarTrack {
  private readonly carpeta: string;
  private readonly paginas = new Map<string, number>();
  readonly llamadas: { herramienta: string; entrada: Record<string, string | number> }[] = [];
  /** para las pruebas: respuestas que sustituyen a las del fichero, o un error */
  readonly sustituye = new Map<HerramientaLectura, unknown | Error>();

  constructor(carpeta: string) { this.carpeta = carpeta; }

  async llama(herramienta: HerramientaLectura, entrada: Record<string, string | number>): Promise<unknown> {
    if (!esHerramientaDeLectura(herramienta)) throw new ErrorDeLectura("herramienta fuera de la lista de lectura");
    this.llamadas.push({ herramienta, entrada });
    const s = this.sustituye.get(herramienta);
    if (s instanceof Error) throw s;
    if (s !== undefined) return structuredClone(s);
    const datos = JSON.parse(readFileSync(join(this.carpeta, herramienta + ".json"), "utf8")) as unknown;
    if (herramienta !== "novedades") return datos;
    const lista = datos as unknown[];
    const i = this.paginas.get(herramienta) ?? 0;
    this.paginas.set(herramienta, i + 1);
    return lista[Math.min(i, lista.length - 1)];
  }

  reinicia(): void { this.paginas.clear(); this.llamadas.length = 0; }
  async cierra(): Promise<void> { /* nada */ }
}
