// La capa de vigor (componente «capa-ndvi», ADR-0023, C10 cuarta tanda): el NDVI de la fecha elegida pintado sobre el terreno, con su leyenda y su gráfica
// anual. MU5-n (A3-1a): antes el cuerpo de apps/web/motor/10b_capa_ndvi.js, que queda con su registro (Componentes.registra(Mundos.manifiestoCapaNdvi(…))).
// 10_ndvi (ndvi.ts) conserva los datos, la fecha y la escala, y avisa con «ndvi:cambia». La textura la lee el sombreador del terreno (terreno.ts) por sus
// uniformes uNdviOn y uNdviMap, que siguen siendo del núcleo (UN). ?capandvi=0 la apaga: el terreno no se tiñe, y las casillas siguen en el menú (la casilla
// «Vigor» queda sin efecto, como las de otros componentes apagados; «Copas coloreadas por NDVI» funciona igual).
// Es del exterior (mundos: ["exterior"]) y su libera() suelta la textura (dispose), apaga los uniformes y esconde la leyenda.
// Nada de aquí lee globales al cargarse: lo que necesita del legado lo pide `deps()` al montarse (el registro se evalúa sin el resto del motor).
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";

/** Lo que se usa de un elemento del DOM. */
export interface ElementoMin { checked?: boolean; hidden?: boolean; textContent?: string | null; innerHTML?: string; addEventListener(ev: string, fn: () => void): void; removeEventListener(ev: string, fn: () => void): void }
interface Lienzo2D { createImageData(w: number, h: number): { data: Uint8ClampedArray }; putImageData(im: unknown, x: number, y: number): void }
export interface LienzoCapa { width?: number; height?: number; getContext(t: string): Lienzo2D | null }
export interface TexturaCapa { magFilter?: number; minFilter?: number; generateMipmaps?: boolean; dispose(): void }
export interface DepsCapaNdvi {
  THREE: { CanvasTexture: new (cv: LienzoCapa) => TexturaCapa; LinearFilter: number };
  /** 01_datos: $ y fmt */
  $(id: string): ElementoMin;
  fmt(n: number, d?: number): string;
  documento: { createElement(t: string): LienzoCapa };
  /** 04d: los uniformes del terreno */
  UN: { uNdviOn: { value: number }; uNdviMap: { value: unknown } };
  /** 10_ndvi: los datos, la fecha elegida (ndviIdx), la rampa y pintaNdvi */
  NDV: { w: number; h: number; fechas: string[]; media: number[]; datos: Int16Array } | null;
  idx(): number;
  rampa(t: number): number[];
  pintaNdvi(): void;
}

/** el manifiesto del componente; deps() se llama al montarlo (en el motor, cuando ya están todos los módulos) */
export function manifiestoCapaNdvi(deps: () => DepsCapaNdvi): Manifiesto {
  let suelta: (() => void) | null = null;   // lo que libera el componente montado
  function CapaNdviMotor(n: ContextoComponente): { textura(): TexturaCapa | null } {
    const d = deps(), $ = d.$, fmt = d.fmt, UN = d.UN, rampa = d.rampa, NDV = d.NDV as NonNullable<DepsCapaNdvi["NDV"]>, THREE = d.THREE;
    let tex: TexturaCapa | null = null, disp = false;
    const cas = $("cNdvi");
    function chispa(): void {   // evolución del NDVI medio de la ventana en el último año
      const W2 = 250, H2 = 46, m = NDV.media, mn = Math.min.apply(null, m), mx = Math.max.apply(null, m), r = Math.max(mx - mn, 0.02), k = m.length, p: string[] = [], ndviIdx = d.idx();
      for (let i = 0; i < k; i++) p.push((6 + i / (k - 1) * (W2 - 12)).toFixed(1) + "," + (H2 - 6 - ((m[i] as number) - mn) / r * (H2 - 14)).toFixed(1));
      const cxp = 6 + ndviIdx / (k - 1) * (W2 - 12), cyp = H2 - 6 - ((m[ndviIdx] as number) - mn) / r * (H2 - 14);
      $("chispa").innerHTML = '<svg viewBox="0 0 ' + W2 + " " + H2 + '" role="img" aria-label="Evolución del NDVI medio en el último año"><polyline points="' + p.join(" ") + '" fill="none" stroke="var(--olivo)" stroke-width="1.6"/><line x1="' + cxp + '" x2="' + cxp + '" y1="2" y2="' + (H2 - 2) + '" stroke="var(--guardado)" stroke-width="1.2"/><circle cx="' + cxp + '" cy="' + cyp + '" r="3.4" fill="var(--guardado)"/></svg>';
    }
    function pinta(e: { lo: number; hi: number }): void {   // la fecha o la escala cambiaron (pintaNdvi de 10_ndvi.js): rehace la textura, la leyenda y la gráfica
      const ndviIdx = d.idx(), k = NDV.w * NDV.h, off = ndviIdx * k, lo = e.lo, hi = e.hi, ancho = Math.max(hi - lo, 0.02);
      const cv = d.documento.createElement("canvas"); cv.width = NDV.w; cv.height = NDV.h; const cx = cv.getContext("2d") as Lienzo2D, im = cx.createImageData(NDV.w, NDV.h);
      for (let i = 0; i < k; i++) {
        const q = NDV.datos[off + i] as number, c = q > -30000 ? rampa((q / 1000 - lo) / ancho) : [0.5, 0.5, 0.5];
        im.data[i * 4] = (c[0] as number) * 255; im.data[i * 4 + 1] = (c[1] as number) * 255; im.data[i * 4 + 2] = (c[2] as number) * 255; im.data[i * 4 + 3] = q > -30000 ? 255 : 0;
      }
      cx.putImageData(im, 0, 0);
      if (tex) tex.dispose();
      tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      UN.uNdviMap.value = tex;
      $("ndviFecha").textContent = (NDV.fechas[ndviIdx] as string).split("-").reverse().join("/");
      $("ndviRango").textContent = "medio " + fmt(NDV.media[ndviIdx] as number, 2) + " · escala de " + fmt(lo, 2) + " a " + fmt(hi, 2);
      chispa();
    }
    function casilla(): void { const si = !!cas.checked; UN.uNdviOn.value = si ? 1 : 0; $("bNdvi").hidden = !si; if (si) d.pintaNdvi(); }
    n.on("ndvi:cambia", pinta);
    cas.addEventListener("change", casilla);
    n.limpia(function () { cas.removeEventListener("change", casilla); });
    if (cas.checked) casilla();   // montado tarde (la configuración del servidor, a mano), con la casilla ya marcada
    suelta = function () {
      if (disp) return; disp = true;
      UN.uNdviOn.value = 0; UN.uNdviMap.value = null; $("bNdvi").hidden = true;
      if (tex) tex.dispose(); tex = null;
    };
    return { textura: function () { return tex; } };
  }
  return {
    id: "capa-ndvi", version: 1,
    consume: ["NDV", "FechaNdvi", "rampa", "pintaNdvi", "fmt", "UN"],
    expone: [],
    eventos: { escucha: ["ndvi:cambia"], emite: [] },
    bandera: { defecto: true, url: "capandvi" },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: 1 },   // no añade mallas: la dibuja el sombreador del terreno. [SUPUESTO] 1 MB = textura RGBA de hasta 500 × 500 celdas de 10 m (5 km de lado), sin mipmaps; la rejilla de la maqueta, medida en componentes_c10d.test.js
    fases: {}, actualiza: {}, mundos: ["exterior"],
    dom: [{ sel: "#cNdvi", sube: "label" }, "#bNdvi"],   // A3-8b: su casilla y su leyenda de «Capas y vista», escondidas fuera del exterior (COMPONENTES §3.2)
    monta: function (n) { return CapaNdviMotor(n); },
    libera: function () { if (suelta) suelta(); suelta = null; }
  };
}
