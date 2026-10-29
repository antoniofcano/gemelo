// Los ArrayBuffer de una receta, sin repetir, para pasarlos por postMessage como transferibles (sin copia)
export function transferibles(r) {
  const s = new Set(), mete = a => { if (a && a.buffer instanceof ArrayBuffer) s.add(a.buffer); };
  mete(r.padre);
  for (const p of r.piezas) {
    if (p.atrib) Object.values(p.atrib).forEach(mete);
    [p.indice, p.matrices, p.colores, p.nodo, p.brote, p.posiciones].forEach(mete);
  }
  return [...s];
}
