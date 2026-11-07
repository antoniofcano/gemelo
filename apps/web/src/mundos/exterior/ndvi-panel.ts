// La fecha del NDVI elegida y las casillas del panel que la tocan (el deslizador #ndviSel, «Tinte NDVI» #cTinte y «Solo el terreno» #cSolo). MU5-n (A3-8a):
// antes vivía en apps/web/motor/10_ndvi.js como extracción parcial, con la fecha en una primitiva (ndviIdx) que reescribía 14_historia; ahora la fecha es
// estado de aquí (FechaNdvi.E.idx; 14_historia la cambia con FechaNdvi.pon(i)) y 10_ndvi.js queda de talón. Mismas escuchas, en el mismo orden, al cargarse.
// El tinte de la copa (la casilla «Tinte NDVI») es estado de TinteOrto (orto-tinte.ts, de 02_mundo), que se le da aquí.
// Nada de aquí lee globales: el DOM, los datos y lo que se enseña o se esconde entran por argumento.

interface ConVisible { visible: boolean }
interface Casilla { checked: boolean; addEventListener(t: string, f: (e: any) => void): void }
interface Deslizador { max: number | string; value: number | string; addEventListener(t: string, f: (e: any) => void): void }

export interface DepsFechaNdvi {
  $(id: string): any;
  /** los datos del NDVI (Ndvi.NDV de ndvi.ts); null sin NDVI en el índice */
  NDV: { fechas: unknown[] } | null;
  /** Ndvi.pinta: la escala de la fecha y el aviso «ndvi:cambia» */
  pintaNdvi(): void;
  /** 08_marcadores: aplica en el fotograma siguiente */
  aplicaLuego(): void;
  /** el estado del tinte de la copa (TinteOrto.E, de 02_mundo) */
  tinte: { tinte: boolean };
  Estado: { modo: string };
  gArboles: ConVisible; gFollaje: ConVisible; gSombras: ConVisible; nube: ConVisible;
}

export function creaFechaNdvi(d: DepsFechaNdvi) {
  var $ = d.$, NDV = d.NDV, T = d.tinte, Estado = d.Estado;
  /** la fecha elegida (índice de NDV.fechas): la última al empezar */
  var E = { idx: NDV ? NDV.fechas.length - 1 : 0 };
  ($("cTinte") as Casilla).addEventListener("change", function () { T.tinte = ($("cTinte") as Casilla).checked; if (NDV) d.pintaNdvi(); d.aplicaLuego(); });
  if (NDV) { ($("ndviSel") as Deslizador).addEventListener("change", function () { if (T.tinte) d.aplicaLuego(); }); }
  if (NDV) { var sel = $("ndviSel") as Deslizador; sel.max = NDV.fechas.length - 1; sel.value = E.idx; sel.addEventListener("input", function (e: { target: { value: string } }) { E.idx = Number(e.target.value); d.pintaNdvi(); }); }
  ($("cSolo") as Casilla).addEventListener("change", function () { var o = ($("cSolo") as Casilla).checked; d.gArboles.visible = !o && Estado.modo === "gem"; d.gFollaje.visible = !o && Estado.modo === "gem"; d.gSombras.visible = !o && Estado.modo === "gem"; d.nube.visible = !o && Estado.modo === "nube"; });
  /** 14_historia: elige otra fecha (sin repintar: lo hace quien la llama, como antes) */
  function pon(i: number): void { E.idx = i; }
  return { E: E, pon: pon };
}
export type FechaNdvi = ReturnType<typeof creaFechaNdvi>;
