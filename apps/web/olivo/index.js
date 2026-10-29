// API pública del constructor de olivos generados (ADR-0017). Módulo ES, sin DOM, sin cámara ni controles.
//
//   generarOlivo({tipo, parametros, epoca, semilla}, {THREE, materiales, nivel}) → THREE.Group      (síncrono: bloquea; para herramientas)
//   generarOlivoAsync(entrada, {THREE, materiales, nivel, fabrica})        → Promise<THREE.Group>      (trabajador o rebanadas: sin tirones)
//   recetaG(entrada) → generador · receta(entrada) → receta · aNivel(receta, "E0"|"E1"|"E2"|"E2VR") → receta
//   montaOlivo(THREE, receta, materiales) → THREE.Group · huella(receta) → Promise<sha256> · huellaNiveles(receta)
//   semillaDeCopa(copa, copas_id[i], centro_utm, copas_semilla[i]) → {semilla, provisional, guardada?} · NOMBRE_TIPO («olivos:centenario-3p») · parametrosDeCopa(copa, copas_param[i], tipo) → {tipo, parametros, origen}
//   creaCache({memMB, discoMB}) · claveReceta(entrada, nivel) (caché de recetas en memoria e IndexedDB, §5 del contrato)
//   semillaDeId(id) · GEN_VERSION · TIPOS · ESTADOS · ID_TIPO · tipoDeId · bbchAEpoca · creaMateriales · cargaFotos · creaFabrica · hornear · glb
//
// El árbol se calcula SIEMPRE con three 0.128.0 («three-gen», fijado) y se monta con el three del anfitrión (0.128 o 0.186): así no cambia
// cuando el gemelo sube de versión. Lo comprueba pruebas/guardianes/olivo.test.js.
import * as G from "three-gen";
import { recetaG as recetaGN, receta as recetaN, geosCompartidas, resuelve, triangulos } from "./nucleo.js";
import { montaOlivo as montaN, triangulosDe, liberaOlivo } from "./montaje.js";
import { aNivel, aNivelG, NIVELES, triangulosNivel, llamadasNivel } from "./niveles.js";
import { creaFabrica, aRebanadas } from "./fabrica.js";

export { GEN_VERSION } from "./version.js";
export { TIPOS, ESTADOS, RANGOS, ID_TIPO, TIPO_DE_ID, tipoDeId, bbchAEpoca } from "./tipos.js";
export { rngFrom, semillaDeId } from "./azar.js";
export { semillaDeCopa, parametrosDeCopa, CAMPOS_PARAM, ORIGEN_TRONCO } from "./copas.js";
export { CATALOGO, NOMBRE_TIPO, tipoDeNombre, tablaLocal } from "./catalogo.js";
export { huella, huellaNiveles, huellaEstructura, diferenciaMax } from "./huella.js";
export { creaMateriales, MATERIALES, encadena } from "./materiales.js";
export { cargaFotos, FOTOS } from "./texturas.js";
export { hornear, glb } from "./hornear.js";
export { creaCache, claveReceta, bytesReceta, CACHE_VERSION } from "./cache.js";
export { revision, uvDelMapa, texturaDeColor, colorLineal } from "./compat.js";
export { aNivel, aNivelG, NIVELES, triangulosNivel, llamadasNivel, creaFabrica, aRebanadas, triangulosDe, liberaOlivo, resuelve, triangulos };

/** Las geometrías compartidas (calculadas con three 0.128.0 una vez) */
export const geos = () => geosCompartidas(G);
export const recetaG = entrada => recetaGN(G, entrada);
export const receta = entrada => recetaN(G, entrada);
export const montaOlivo = (THREE, r, materiales) => montaN(THREE, r, materiales, { geos: geos() });

export function generarOlivo(entrada, opciones) {
  const { THREE, materiales, nivel } = opciones || {};
  const r = receta(entrada);
  return montaOlivo(THREE, nivel && nivel !== "E0" ? aNivel(r, nivel) : r, materiales);
}

export async function generarOlivoAsync(entrada, opciones) {
  const { THREE, materiales, nivel } = opciones || {};
  const f = opciones.fabrica || creaFabrica();
  const r = await f.receta(entrada, nivel);
  if (!opciones.fabrica) f.cierra();
  return montaOlivo(THREE, r, materiales);
}
