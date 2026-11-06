// La puerta de los mundos hacia el legado (MUNDOS §9.3; MU2-3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como `Mundos.<nombre>`.
// Igual que el puente del núcleo (nucleo/index.ts), pero aparte: nucleo/ no puede importar de mundos/ (dependency-cruiser), así que los mundos que el legado
// monta (hoy solo el exterior) entran por su propio alias, «@gemelo/mundos», que genera_motor.mjs escribe detrás del de «@gemelo/nucleo».
// Los interiores NO pasan por aquí: son trozos perezosos (`import("@gemelo/mundo-bodega")`). El vacío (MU2-6) es la excepción: el interior de prueba,
// sin assets, que 90_final registra para ?mundo=vacio (MU2-8).
export { creaCargaTeselas, creaExterior } from "./exterior.ts";
export type { ConEstilo, DepsAmbienteExterior, DepsCargaTeselas, DepsExterior, Visible } from "./exterior.ts";
export { creaVacio } from "./vacio.ts";
export type { DepsVacio, FabricaLuz } from "./vacio.ts";
// A3-1b (MU5-n): los componentes del exterior que salen del legado (tileset y suelo de fotos). Cada uno, con su libera() de verdad.
export { creaSueloFondo, manifiestoSueloFondo } from "./exterior/suelo-fondo.ts";
export type { DepsSueloFondo, SueloFondo } from "./exterior/suelo-fondo.ts";
export { SueloFotosPuro, creaSueloFotos, manifiestoSueloFotos } from "./exterior/suelo-fotos.ts";
export type { DepsSueloFotos, SueloFotos } from "./exterior/suelo-fotos.ts";
export { IdTiles, creaOlivosTiles, manifiestoOlivosTiles } from "./exterior/olivos-tiles.ts";
export type { DepsOlivosTiles, GanchosTiles, OlivosTiles } from "./exterior/olivos-tiles.ts";
export { LruTilesPuro, RayosPuro, creaEscena3D, limitaAviso, manifiestoEscena3D, motivoMarco } from "./exterior/escena-tiles.ts";
export type { DepsEscena3D, Escena3D, LimitesLru } from "./exterior/escena-tiles.ts";
export { creaMundo, RADIO_SUELTA, RADIO_CARGA } from "./exterior/teselas.ts";
export type { DepsMundo, Mundo, Tesela, DatosMundo, Mosaico, EstadoOrto, EstadoTeselas } from "./exterior/teselas.ts";
export { creaSombreadoTiles, uniformesTerreno, hash } from "./exterior/terreno.ts";
export type { DepsTerreno, DepsUniformes, SombreadoTiles, UniformesTerreno, ThreeTerreno, SueloFotosMin, SueloFotosPuroMin } from "./exterior/terreno.ts";
export { creaNdvi, rampa, u8aI16 } from "./exterior/ndvi.ts";
export type { DepsNdvi, DatosNdvi, IndiceNdvi, Ndvi } from "./exterior/ndvi.ts";
export { manifiestoCapaNdvi } from "./exterior/capa-ndvi.ts";
export type { DepsCapaNdvi } from "./exterior/capa-ndvi.ts";
// A3-2b (MU5-n): el tope de triángulos de los olivos del motor (Q0n; antes 02m_tope_olivos.js).
export { creaTopeOlivos, creaTopeOlivosPuro } from "./exterior/tope-olivos.ts";
export type { DepsTopeOlivos, TopeOlivos, TopeOlivosPuro, TopeTilesPuroMin } from "./exterior/tope-olivos.ts";
export { ID_MARCADORES_LIDAR, creaMarcadoresLidar, manifiestoMarcadoresLidar } from "./exterior/marcadores-lidar.ts";
export type { DepsMarcadoresLidar, MarcadoresLidar, PuntoLidar } from "./exterior/marcadores-lidar.ts";
export { NOTAS, creaMarcadores } from "./exterior/marcadores.ts";
export type { DepsMarcadores, Marcadores } from "./exterior/marcadores.ts";
// A3-2b (MU5-n): los olivos de nivel 0 (06_arboles.js).
export { ID_ARBOLES_L0, creaArbolesL0 } from "./exterior/arboles-l0.ts";
export type { ArbolesL0, DepsArbolesL0 } from "./exterior/arboles-l0.ts";
// A3-2b (MU5-n): el follaje y las sombras de los olivos (07_follaje.js).
export { ID_FOLLAJE, creaFollaje } from "./exterior/follaje.ts";
export type { DepsFollaje, Follaje } from "./exterior/follaje.ts";
// A3-2b (MU5-n): los olivos lejanos de la escalera (07ac_lejanos.js).
export { ID_LEJANOS, creaLejanos } from "./exterior/lejanos.ts";
export type { DepsLejanos, Lejanos } from "./exterior/lejanos.ts";
// A3-2b (MU5-n): los olivos del motor con tres niveles de detalle (07b_arboles.js).
export { ID_ARBOLES, creaArboles } from "./exterior/arboles.ts";
export type { Arboles, DepsArboles } from "./exterior/arboles.ts";
// A3-2a (MU5-n): el catálogo de olivos-tipo y los olivos generados, componentes del exterior con su libera() de verdad.
export { creaCatalogo, manifiestoCatalogo, ID_CATALOGO } from "./exterior/catalogo.ts";
export type { Catalogo, DepsCatalogo, Pieza as PiezaCatalogo } from "./exterior/catalogo.ts";
export { Escalera, GeneradosPuro } from "./exterior/generados-escalera.ts";
export { creaGenerados, manifiestoGenerados, ID_GENERADOS } from "./exterior/generados.ts";
export type { DepsGenerados, Generados } from "./exterior/generados.ts";
// A3-3 (MU5-n): la nube y el paisaje del exterior (la nube LiDAR, el paisaje, las balizas, las lindes, los carteles y las decoraciones), componentes con su libera() de verdad.
export { ALTO_MAX, MATERIAL_NUBE, NIV_NUBE, NubePuro, PRESUPUESTO_NUBE, creaNube, manifiestoNube } from "./exterior/nube.ts";
export type { DepsNube, Nube } from "./exterior/nube.ts";
export { ID_PAISAJE, creaPaisaje, manifiestoPaisaje } from "./exterior/paisaje.ts";
export type { DatosPaisaje, DepsPaisaje, Paisaje } from "./exterior/paisaje.ts";
export { COLB, ID_BALIZAS, creaBalizas, manifiestoBalizas } from "./exterior/balizas.ts";
export type { Balizas, DepsBalizas } from "./exterior/balizas.ts";
export { ID_LINDES, LindesPuro, creaLindes, manifiestoLindes } from "./exterior/lindes.ts";
export type { DepsLindes, EstadoLindes, LibLineas } from "./exterior/lindes.ts";
export { CartelesPuro, ID_CARTELES, creaCarteles, manifiestoCarteles } from "./exterior/carteles.ts";
export type { DepsCarteles } from "./exterior/carteles.ts";
export { DecoracionesPuro, ID_DECORACIONES, creaDecoraciones, decoracionesGeometria, manifiestoDecoraciones } from "./exterior/decoraciones.ts";
export type { DepsDecoraciones, EstadoDecoraciones, UtilesGeometria } from "./exterior/decoraciones.ts";
// A3-4 (MU5-n): el cielo, el tiempo y el suelo del exterior, componentes con su libera() de verdad.
export { creaTiempo, creaTiempoVivo, manifiestoTiempo, ID_TIEMPO } from "./exterior/tiempo.ts";
export type { DepsTiempo as DepsTiempoMundo, Tiempo } from "./exterior/tiempo.ts";
export { TiempoPuro, creaNivelSol, creaReloj, creaFormatos, num1, rumbo, esc, hace, LAT, LON, ZONA, DEMOS } from "./exterior/tiempo-puro.ts";
export { GLSL_SOMBRA, creaParcheTiempo } from "./exterior/tiempo-parche.ts";
export type { ParcheTiempo, UniformesSombra, UniformesViento } from "./exterior/tiempo-parche.ts";
export { creaCielo, pintaNubesDe, texBrilloDe, PALETA_OCASO } from "./exterior/tiempo-cielo.ts";
export { creaLluvia } from "./exterior/tiempo-lluvia.ts";
export { creaBarreras, BARRERA_ALTO } from "./exterior/tiempo-barrera.ts";
export { creaPasoTiempo } from "./exterior/tiempo-paso.ts";
export { creaFichasTiempo } from "./exterior/tiempo-fichas.ts";
export { creaHierba, manifiestoHierba, ID_HIERBA } from "./exterior/hierba.ts";
export type { DepsHierba, Hierba } from "./exterior/hierba.ts";
export { creaSonido, manifiestoSonido, ID_SONIDO } from "./exterior/sonido.ts";
export type { DepsSonido, Sonido } from "./exterior/sonido.ts";
export { creaSolReserva, manifiestoSolReserva, ID_SOL_RESERVA } from "./exterior/sol-reserva.ts";
export type { DepsSolReserva, SolReserva } from "./exterior/sol-reserva.ts";
export { creaEstacion, manifiestoEstacion, ID_ESTACION } from "./exterior/estacion.ts";
export type { DepsEstacion, Estacion } from "./exterior/estacion.ts";
// A3-5 (MU5-n): la vida del olivar. Cada uno, con su libera() de verdad.
export { ID_TRABAJO_HOY, TrabajoHoyPuro, creaTrabajoHoy, manifiestoTrabajoHoy } from "./exterior/trabajo-hoy.ts";
export type { DepsTrabajoHoy, TrabajoHoy } from "./exterior/trabajo-hoy.ts";
export { ID_AVES_MES, AvesMesPuro, creaAvesMes, manifiestoAvesMes } from "./exterior/aves-mes.ts";
export type { AvesMes, DepsAvesMes } from "./exterior/aves-mes.ts";
// A3-5: la pendiente del paseo (22_huellas) y las huellas y el polvo (22b_huellas_polvo).
export { creaHuellas } from "./exterior/huellas.ts";
export type { DepsHuellas, Huellas } from "./exterior/huellas.ts";
export { ID_HUELLAS_POLVO, creaHuellasPolvo, manifiestoHuellasPolvo } from "./exterior/huellas-polvo.ts";
export type { DepsHuellasPolvo, HuellasPolvo } from "./exterior/huellas-polvo.ts";
export type { LecturaVida, LecturaPaseo, DepsTiempo } from "./exterior/vida-tipos.ts";
export { ID_FAUNA, creaFauna, manifiestoFauna } from "./exterior/fauna.ts";
export type { DepsFauna, Fauna } from "./exterior/fauna.ts";
export { ID_PERROS, angCorto, creaPerros, manifiestoPerros } from "./exterior/perros.ts";
export type { DepsPerros, Perros } from "./exterior/perros.ts";
export { ID_VIDA, creaVida } from "./exterior/vida.ts";
export type { DepsVida, EstadoVida, Vida } from "./exterior/vida.ts";
