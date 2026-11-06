// Primer módulo de apps/web/src/ (cimientos de TypeScript, MUNDOS §9). Sin dependencias: `nucleo` no importa de nadie.

/** Versión X.Y.Z → [X, Y, Z]; null si no tiene esa forma. */
export function partesDeVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
