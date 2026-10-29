// Generador pseudoaleatorio del constructor de olivos-tipo, tal cual (mulberry32): rngFrom(semilla) → función que da [0, 1).
// No se toca: cualquier cambio cambia todos los árboles (y exige subir GEN_VERSION).
export function rngFrom(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/** Semilla de un árbol del gemelo: su id estable (copas_id, entero ≥ 0) como uint32. Sin id (−1) no hay semilla estable: null */
export function semillaDeId(id) {
  if (!Number.isInteger(id) || id < 0) return null;
  return id >>> 0;
}
