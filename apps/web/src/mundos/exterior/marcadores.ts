// La linde y lo que cuelga del terreno al aplicar (MU5-n, A3-2b; antes apps/web/motor/08_marcadores.js, que queda como talón con `listo`, que escribe 90_final).
// Las copas del LiDAR, los anillos de OlivarTrack y el desfase son el componente «marcadores-lidar» (marcadores-lidar.ts): aplica() les avisa con «mundo:aplica» y
// capas() con «capas:cambia»; sin él (?marcadores=0) esas tres casillas no hacen nada.
// aplica() es el punto único por el que un cambio de exageración, de modo o de datos llega a todo lo que cuelga del terreno: el uniforme del relieve, la nube, los
// olivos (07b), las barreras de las parcelas, el paisaje, las balizas y el suelo. Su libera() quita el grupo de las lindes de la escena (lo que cuelga de él —las
// barreras de 15_tiempo y la linde de 44— lo libera quien lo creó) y deja de aceptar aplicaLuego.
// Medido / deducido / ilustrativo (regla 5): las notas de cada modo (NOTAS) lo dicen al usuario; aquí no cambian.
// Del legado recibe por argumento lo que necesita (THREE, la escena, el Estado y las piezas que recoloca); no lee globales.
import type { BusComponentes } from "../../nucleo/componentes.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

interface ConVisible { visible: boolean }
export interface DepsMarcadores {
  THREE: T3;
  scene: { add(o: unknown): void; remove(o: unknown): void };
  Estaticos: { congela(o: unknown): void };
  Bus: Pick<BusComponentes, "emite">;
  D: { parcelas: unknown[] };
  /** el DOM del menú y de la nota de modo */
  $(id: string): (ConVisible & { checked: boolean; textContent: string }) | null;
  Estado: { exag: number; modo: string };
  UN: { uExag: { value: number }; uModoOrto: { value: number } };
  nube: ConVisible;
  gArboles: ConVisible; gFollaje: ConVisible; gSombras: ConVisible;
  Arboles: { refresca(): void };
  pintaNube(): void; colocaBarrera(k: number): void; colocaPaisaje(): void; colocaBalizas(): void; recoloreaSuelo(): void;
  /** ¿ya están los datos de las teselas? (lo escribe 90_final en el legado: va por función) */
  listo(): boolean;
  /** requestAnimationFrame (se inyecta para probar sin navegador) */
  raf(f: () => void): void;
}

/** lo que dice la nota de cada modo del menú (qué es medido y qué ilustrativo) */
export const NOTAS: Record<string, string> = {
  nube: "Los puntos del vuelo de 2024, con el color de la ortofoto corregido por altura. Los puntos bajos bajo cada copa, en color corteza, son el tronco.",
  gem: "Cada punto del LiDAR es un montoncito de hojas de olivo, de modo que la copa conserva el volumen medido. Los troncos y las ramas son una forma ilustrativa con los 2 o 3 pies habituales del olivo en vaso: el LiDAR mide la copa, no cuántos pies tiene cada árbol (solo llega un punto por olivo a la altura del tronco). Color de la ortofoto.",
  orto: "El terreno real con la ortofoto del PNOA tal cual, sin vegetación en 3D. Las copas se ven desplazadas hacia el este."
};

export function creaMarcadores(d: DepsMarcadores) {
  const THREE = d.THREE, Estado = d.Estado, UN = d.UN, $ = d.$, bus = d.Bus;
  const gLinde = new THREE.Group();
  d.Estaticos.congela(gLinde);   // AG-1.15: las barreras (15_tiempo) y la linde (44_lindes) cuelgan de aquí y se congelan al crearlas
  gLinde.name = "lindes"; d.scene.add(gLinde);   // el nombre lo usa el desglose de llamadas de las pruebas
  // (las lindes son ahora una barrera de luz: ver el bloque del tiempo)
  const tmp = new THREE.Object3D();
  let suelto = false;
  function marcadores(): void {
    d.D.parcelas.forEach(function (_pr, k) {
      d.colocaBarrera(k);
    });
    bus.emite("mundo:aplica");   // el componente de los marcadores recoloca copas, anillos y desfase
  }
  function aplica(): void {
    if (!d.listo()) return;
    UN.uExag.value = Estado.exag; if (Estado.modo === "nube") d.pintaNube(); if (Estado.modo === "gem") d.Arboles.refresca(); marcadores(); d.colocaPaisaje(); d.colocaBalizas(); d.recoloreaSuelo();
    UN.uModoOrto.value = Estado.modo === "orto" ? 1 : 0;   // el relieve (04d) pinta la ortofoto del glb tal cual
    d.nube.visible = Estado.modo === "nube"; d.gArboles.visible = Estado.modo === "gem"; d.gFollaje.visible = Estado.modo === "gem"; d.gSombras.visible = Estado.modo === "gem";
    ($("notaModo") as { textContent: string }).textContent = NOTAS[Estado.modo] as string; capas();
    const solo = $("cSolo");
    if (solo && solo.checked) { d.gArboles.visible = false; d.gFollaje.visible = false; d.gSombras.visible = false; d.nube.visible = false; }
  }
  function capas(): void { gLinde.visible = ($("cLinde") as { checked: boolean }).checked; bus.emite("capas:cambia"); }   // las casillas de copas, marcas y desfase las atiende su componente
  let pendiente = false;
  function aplicaLuego(): void { if (pendiente || suelto) return; pendiente = true; d.raf(function () { pendiente = false; aplica(); }); }
  /** quita el grupo de las lindes de la escena; después, aplicaLuego ya no hace nada. Llamarlo dos veces no rompe. */
  function libera(): void { if (suelto) return; suelto = true; d.scene.remove(gLinde); }
  return { gLinde, tmp, aplica, capas, aplicaLuego, libera };
}
export type Marcadores = ReturnType<typeof creaMarcadores>;
