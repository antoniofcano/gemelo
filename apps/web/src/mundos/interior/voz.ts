// La lectura en voz alta (eje B): lo fino sobre speechSynthesis del navegador. Lo puro (elegir voz, trocear, texto, etiquetas) está en voz-puro.ts.
//   · lee(texto) calla lo anterior y lee por trozos, en la voz española elegida (lang es-*); sin voz española no lee: nunca en otro idioma;
//   · calla() cancela; libera() cancela y suelta el oyente de voiceschanged (las voces llegan tarde en Chrome): al salir del interior, nada colgando;
//   · alCambiar() avisa de cada cambio de estado (para repintar el botón y la fila del panel de VR).
// No probado en iPhone ni en Quest (el Quest Browser puede no traer voces: entonces se ve «Sin voz en español»).
import { VozPuro } from "./voz-puro.ts";
import type { EstadoVoz } from "./voz-puro.ts";
import type { T } from "../comun/tipos.ts";

export interface DepsVoz {
  /** window.speechSynthesis (o null: sin API, no hay botón) */
  synth: T | null;
  /** window.SpeechSynthesisUtterance */
  Utterance: (new (t: string) => T) | null;
  alCambiar?: () => void;
}

export function creaVoz(d: DepsVoz) {
  const S = d.synth, U = d.Utterance, api = !!(S && U && typeof S.speak === "function");
  let leyendo = false, gen = 0;
  const aviso = (): void => { if (d.alCambiar) d.alCambiar(); };
  const voces = (): T[] => { try { return api && S.getVoices ? Array.from(S.getVoices()) : []; } catch (e) { return []; } };
  const voz = (): T | null => { const v = voces(), i = VozPuro.elegirVoz(v); return i >= 0 ? v[i] : null; };
  const alVoces = (): void => aviso();
  if (api && S.addEventListener) S.addEventListener("voiceschanged", alVoces);

  const hayVoz = (): boolean => api && !!voz();
  const estado = (): EstadoVoz => VozPuro.estadoVoz(hayVoz(), leyendo);
  function calla(): void {
    gen++;
    if (api) { try { S.cancel(); } catch (e) { /* sin voz que callar */ } }
    if (leyendo) { leyendo = false; aviso(); }
  }
  function lee(texto: string): boolean {
    const v = voz();
    if (!api || !v) return false;
    calla();
    const trozos = VozPuro.trocea(texto); if (!trozos.length) return false;
    const mia = gen; let k = 0;
    const siguiente = (): void => {
      if (mia !== gen) return;   // callada o cambiada de ficha entretanto
      if (k >= trozos.length) { leyendo = false; aviso(); return; }
      const u = new U!(trozos[k++]!);
      u.lang = v.lang; u.voice = v; u.onend = siguiente;
      u.onerror = () => { if (mia === gen) { leyendo = false; aviso(); } };
      S.speak(u);
    };
    leyendo = true; aviso(); siguiente();
    return true;
  }
  function libera(): void {
    calla();
    if (api && S.removeEventListener) S.removeEventListener("voiceschanged", alVoces);
  }
  return { api: (): boolean => api, hayVoz, estado, lee, calla, libera, leyendo: (): boolean => leyendo };
}
export type Voz = ReturnType<typeof creaVoz>;
