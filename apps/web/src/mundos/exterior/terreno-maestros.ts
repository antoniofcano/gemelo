// Los «maestros» del relieve (F1d, T5): matSuelo y matOrto, que el ciclo del día tiñe (15_tiempo: su color) y cuyo color comparten el relieve de los glb del
// tileset (matSuelo) y el tinte de la ortofoto (matOrto.color, en uniformesTerreno). MU5-n (A3-8a): antes los creaba a mano 04d_sombreado_tiles.js, que así
// no era un talón; ahora los pide aquí con la fábrica de materiales (los mismos dos, sin dueño, como siempre) y queda de talón. No importa three: la fábrica sí.
/** Lo que se usa de la fábrica de materiales (nucleo/materiales.ts): estandar(clase, opciones), sin dueño. */
export interface MaterialesMaestros { estandar(clase: string, opciones?: unknown): any }

export function creaMaestrosTerreno(materiales: MaterialesMaestros) {
  var matSuelo = materiales.estandar("MeshLambertMaterial", {}), matOrto = materiales.estandar("MeshBasicMaterial", { color: 0xffffff });
  return { matSuelo: matSuelo, matOrto: matOrto };
}
