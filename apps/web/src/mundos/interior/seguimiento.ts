// La visita guiada compartida, del lado de quien sigue al guía (decisiones 233-238; el acuerdo de la visita compartida, §4). Componente «visita-compartida»
// de TODOS los mundos (lo registra cableaInteriores; va en el paquete principal porque el aviso «La visita está en la fábrica» se ve también fuera).
//   · Escucha «guiada:visita» del Bus ({mundo, parada, maquinas, n, soyGuia}: lo emite la presencia al leer los metadatos de la sala guiada, también al
//     entrar tarde) y decide con GuiadaPuro.decide qué ofrecer a la familia: «El guía va a la parada N · título [Ir] [Me quedo]» o «La visita está en la
//     fábrica [Ir] [Me quedo]». Al guía, nada (lo ha pedido él).
//   · «Ir» en el mismo mundo: fundido (Llegada.funde, el de «Ir con alguien») y de pie en tu puesto del anillo alrededor de la parada mirando a su ancla
//     (InteriorGuiado.puesto: GuiadaPuro.puesto con las zonas del interior), con la ficha abierta (Recorrido.vaA). En otro mundo: el cambio de mundo de
//     siempre (gm.cambia por el cableado, con su fundido); al entrar, el interior pide la parada pendiente (pendiente(id)) y te deja ya en tu puesto, a oscuras.
//   · En VR, el aviso es una lámina y solo se va con el gatillo sobre «Ir» (nunca se mueve a nadie sin su gesto: decisión 234). En pantalla, un recuadro con
//     botones de verdad (44 px, teclado y táctil) y el interruptor «Seguir al guía» (aria-pressed), apagado por defecto: encendido, «Ir» se hace solo.
//   · Lo que el interior necesita de la guiada (la lectura automática apagada, el interruptor de las máquinas, los botones del guía) lo pregunta aquí:
//     enGuiada(), soyGuia(), estado(), pide(cuerpo) (el guía: «guiada:pide», que ui/guiada.ts lleva a POST /api/presencia/guiadas/:evento/visita).
// Lo que llega de la sala es dato de otros: se comprueba (GuiadaPuro.lee) y se pinta con textContent.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";
import type { IdMundo, Pose2, ResultadoCambio } from "../../nucleo/mundos.ts";
import type { T } from "../comun/tipos.ts";
import { GuiadaPuro } from "./guiada-puro.ts";
import type { Aviso, VisitaGuiada } from "./guiada-puro.ts";

export const ID_SEGUIMIENTO = "visita-compartida";
const LAMINA = "guiada-oferta";

/** Lo que el interior activo ofrece a la visita guiada (index.ts) */
export interface InteriorGuiado {
  /** los títulos de sus paradas (vacío sin visita) */
  titulos(): string[];
  /** tu puesto en el anillo de la parada k, o null si no cabe nadie */
  puesto(k: number, identidad: string): Pose2 | null;
  /** la ficha de k abierta (la visita en marcha si no lo estaba); false si no hay visita o k no existe */
  vaA(k: number): boolean;
  /** el estado del guía ha cambiado (o la guiada ha terminado: null): las máquinas y los botones */
  alGuiada(v: VisitaGuiada | null): void;
}
/** Lo que este seguimiento da al interior (DepsInterior.guiada) */
export interface GuiadaParaInterior {
  enGuiada(): boolean;
  soyGuia(): boolean;
  estado(): VisitaGuiada | null;
  /** al entrar en id: la parada a la que se iba (con «Ir» desde otro mundo), una sola vez; null si nada */
  pendiente(id: string): number | null;
  identidad(): string;
  /** el guía: pide a la api un cambio de la visita (mundo, parada, máquinas); false si no hay quien lo lleve (sin la guiada de la interfaz) */
  pide(cuerpo: { mundo?: string; parada?: number | null; maquinas?: { marcha: boolean } }): boolean;
}

export interface DepsSeguimiento {
  /** el mundo activo (gm.actual) */
  actual(): string | null;
  /** el interior ya creado de ese id (cableado: creados), si es el activo */
  interior(id: string): InteriorGuiado | null;
  /** el cambio de mundo del cableado (gm.cambia con su fundido y ?mundo=) */
  cambia(a: IdMundo): Promise<ResultadoCambio>;
  /** el fundido y el salto de «Ir con alguien» (mundos/comun/llegada.ts) */
  Llegada?: { funde(fn: () => void): boolean; aparece(x: number, y: number, ang?: number): void } | null;
  pose: { pon(p: Pose2): void };
  vr(): boolean;
  documento: T | null;
  Laminas?: { abre(o: T): unknown; cierra(id: string, motivo?: string): boolean; hay(id: string): boolean; repinta(id: string, forzar?: boolean): boolean } | null;
  aviso(s: string, ms?: number): void;
}

export function creaSeguimiento(d: DepsSeguimiento) {
  const G = GuiadaPuro;
  let n: ContextoComponente | null = null, ultimo: VisitaGuiada | null = null, enG = false, papelGuia = false, ident = "";
  let oferta: Exclude<Aviso, { tipo: "nada" }> | null = null, seguir = false, pend: { mundo: string; k: number | null } | null = null, llevado: string | null = null;
  let caja: T = null, texto: T = null, botones: T = null, bSeguir: T = null;
  const est = { eventos: 0, descartados: 0, ofertas: 0, idas: 0, cambios: 0, quedas: 0, pedidas: 0 };
  const sesion = "s" + Math.floor(Math.random() * 1e9).toString(36);   // sin identidad de la sala (la voz sin presencia), una de esta pestaña: el reparto solo pide que sea estable

  // ---- lo que se pregunta a la guiada de la interfaz (ui/guiada.ts: su estado) y a la presencia (su identidad); en tarde() y al llegar un evento, no por fotograma
  function leeGuiada(callado = false): void {
    const g = n ? (n.api("visita-guiada") as T) : null, e = g && g.estado ? g.estado() : null;
    const antes = enG;
    enG = !!(e && e.evento !== null && e.evento !== undefined);
    papelGuia = !!(e && (e.papel === "guia" || e.papel === "oficina"));
    if (e && typeof e.yo === "string" && e.yo) ident = e.yo;
    if (callado) return;
    if (antes && !enG) termina();
    else if (!antes && enG) { const w = interiorActivo(); if (w) w.alGuiada(ultimo); }   // la lectura automática y los botones del guía, ya
  }
  function termina(): void {
    ultimo = null; pend = null; cierraOferta();
    const w = interiorActivo(); if (w) w.alGuiada(null);
    pinta();
  }
  const interiorActivo = (): InteriorGuiado | null => { const a = d.actual(); return a ? d.interior(a) : null; };
  const titulosAqui = (): string[] => { const w = interiorActivo(); return w ? w.titulos() : []; };

  // ---- lo que llega del guía
  function alVisita(x: unknown): void {
    const v = G.lee(x);
    if (!v) { est.descartados++; return; }
    est.eventos++;
    leeGuiada(true); enG = true;
    const antes = ultimo; ultimo = v;
    if (v.soyGuia) papelGuia = true;
    const w = interiorActivo(); if (w) w.alGuiada(v);
    const a = G.decide(v, antes, { mundo: d.actual() || "exterior", titulos: titulosAqui() });
    if (a.tipo !== "nada") ofrece(a);
    else if (oferta && oferta.tipo === "mundo" && v.mundo === d.actual()) cierraOferta();   // la visita ha venido adonde estás
    else pinta();
  }
  function alEntraMundo(x: T): void {
    const id = x && typeof x.id === "string" ? x.id : null;
    if (!id) return;
    if (oferta && oferta.tipo === "mundo" && oferta.mundo === id) cierraOferta();
    if (llevado === id) { llevado = null; return; }   // se ha ido con «Ir»: ya está en su puesto
    // ha cruzado una puerta por su cuenta: dónde está la visita (una vez por entrada; «Me quedo» lo quita)
    if (enG && ultimo && !ultimo.soyGuia && !papelGuia) {
      const a = G.decide(ultimo, null, { mundo: id, titulos: titulosAqui() });
      if (a.tipo !== "nada") ofrece(a);
    }
  }

  // ---- la oferta y lo que se hace con ella
  function ofrece(a: Exclude<Aviso, { tipo: "nada" }>): void {
    oferta = a; est.ofertas++;
    if (seguir && !d.vr()) { ir(); return; }
    pinta();
  }
  function cierraOferta(): void {
    oferta = null;
    if (d.Laminas && d.Laminas.hay(LAMINA)) d.Laminas.cierra(LAMINA);
    pinta();
  }
  function quedo(): void { if (oferta) est.quedas++; cierraOferta(); }
  /** «Ir»: a tu puesto de la parada (mismo mundo) o al mundo de la visita (y, si tiene parada, a su puesto al entrar) */
  function ir(): boolean {
    const a = oferta; if (!a) return false;
    cierraOferta();
    if (a.tipo === "mundo") {
      // la parada, la de ahora (la oferta pudo quedarse vieja mientras se leía)
      const k = ultimo && ultimo.mundo === a.mundo ? ultimo.parada : a.parada;
      pend = { mundo: a.mundo, k }; llevado = a.mundo; est.cambios++;
      d.cambia(a.mundo as IdMundo).then(r => {
        if (r.ok) return;
        pend = null; llevado = null;
        if (r.motivo !== "ocupado") d.aviso("No se ha podido ir con la visita", 4000);
      });
      return true;
    }
    const w = interiorActivo(); if (!w) return false;
    const p = w.puesto(a.k, identidad()), k = a.k;
    const salta = (): void => {
      if (p) { if (d.Llegada) d.Llegada.aparece(p.x, p.y, p.ang); else d.pose.pon(p); }
      w.vaA(k);
    };
    est.idas++;
    if (!d.Llegada || !d.Llegada.funde(salta)) salta();
    return true;
  }
  function identidad(): string { return ident || sesion; }

  // ---- en pantalla: el recuadro (solo a la familia, durante la guiada): la oferta con «Ir» y «Me quedo», y «Seguir al guía»
  function el(tag: string, txt?: string): T { const e = d.documento.createElement(tag); if (txt !== undefined) e.textContent = txt; return e; }
  function boton(txt: string, fn: () => void, primario?: boolean): T {
    const b = el("button", txt); b.type = "button"; if (primario) b.className = "visita-primario";
    b.addEventListener("click", fn); return b;
  }
  function montaCaja(): void {
    if (caja || !d.documento) return;
    const doc = d.documento, junto = doc.getElementById ? doc.getElementById("ficha") : null;
    caja = el("section"); caja.id = "guiadaSigue"; caja.className = "ficha"; caja.setAttribute("aria-label", "Visita guiada: seguir al guía");
    texto = el("p"); texto.setAttribute("role", "status"); texto.setAttribute("aria-live", "polite");
    botones = el("div"); botones.className = "visita-botones";
    bSeguir = boton("Seguir al guía", () => { seguir = !seguir; pinta(); if (seguir && oferta) ir(); });
    bSeguir.setAttribute("aria-label", "Seguir al guía: ir solo a cada parada y a cada sala adonde lleve al grupo");
    caja.appendChild(texto); caja.appendChild(botones);
    ((junto && junto.parentNode) || doc.body).appendChild(caja);
  }
  function quitaCaja(): void {
    if (caja && caja.parentNode) caja.parentNode.removeChild(caja);
    caja = texto = botones = bSeguir = null;
  }
  function pinta(): void {
    const familia = enG && !papelGuia && !(ultimo && ultimo.soyGuia);
    // VR: la lámina, solo con oferta (y el recuadro de pantalla fuera)
    if (d.vr()) { quitaCaja(); if (familia && oferta) abreLamina(); return; }
    if (d.Laminas && d.Laminas.hay(LAMINA)) d.Laminas.cierra(LAMINA);
    if (!familia) { quitaCaja(); return; }
    montaCaja(); if (!caja) return;
    texto.textContent = oferta ? oferta.texto : "";
    texto.hidden = !oferta;
    caja.classList.toggle("visita-compacta", !oferta);
    botones.textContent = "";
    if (oferta) { botones.appendChild(boton("Ir", () => { ir(); }, true)); botones.appendChild(boton("Me quedo", quedo)); }
    bSeguir.setAttribute("aria-pressed", seguir ? "true" : "false");
    bSeguir.textContent = seguir ? "Siguiendo al guía" : "Seguir al guía";
    botones.appendChild(bSeguir);
  }

  // ---- en VR: una lámina con «Ir» y «Me quedo», que solo se tocan con el rayo y el gatillo
  function abreLamina(): void {
    const L = d.Laminas; if (!L || !oferta) return;
    if (L.hay(LAMINA)) { L.repinta(LAMINA); return; }
    L.abre({
      id: LAMINA, nombre: "Visita guiada", ancho: 1.0, alto: 0.3, w: 800, h: 240,
      firma: () => (oferta ? oferta.texto : ""),
      pinta: (cx: T, w: number, h: number) => {
        cx.fillStyle = "rgba(16,20,24,0.95)"; cx.fillRect(0, 0, w, h);
        cx.textBaseline = "top"; cx.textAlign = "left"; cx.fillStyle = "#ffd58a"; cx.font = "600 30px system-ui, sans-serif"; cx.fillText("Visita guiada", 28, 18);
        cx.fillStyle = "#ffffff"; cx.font = "28px system-ui, sans-serif"; cx.fillText(oferta ? oferta.texto : "", 28, 62, w - 56);
        const caja2 = (x: number, t: string, primario: boolean): void => {
          cx.fillStyle = primario ? "rgba(64,240,255,0.28)" : "rgba(255,255,255,0.10)"; cx.fillRect(x, 130, 352, 84);
          cx.strokeStyle = primario ? "#40f0ff" : "rgba(255,255,255,0.5)"; cx.lineWidth = 3; cx.strokeRect(x, 130, 352, 84);
          cx.fillStyle = "#ffffff"; cx.font = "600 32px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText(t, x + 176, 154); cx.textAlign = "left";
        };
        caja2(28, "Ir", true); caja2(420, "Me quedo", false);
      },
      // la mitad de abajo: a la izquierda «Ir», a la derecha «Me quedo»; arriba no hace nada (el gatillo sigue con lo suyo)
      alTocar: (u: number, v: number) => { if (v < 130 / 240) return false; if (u < 0.5) ir(); else quedo(); return true; },
      alCierra: () => { /* lejos o al salir de la VR: la oferta sigue (en pantalla, en el recuadro) */ },
    });
  }

  const api: GuiadaParaInterior & { ir(): boolean; quedo(): void; seguir(on?: boolean): boolean; estadoSeguimiento(): unknown } = {
    enGuiada: () => enG,
    soyGuia: () => papelGuia || !!(ultimo && ultimo.soyGuia),
    estado: () => (enG ? ultimo : null),
    pendiente(id: string): number | null {
      if (!pend || pend.mundo !== id) return null;
      const k = pend.k; pend = null; return k;
    },
    identidad,
    pide(cuerpo): boolean { est.pedidas++; return !!n && n.emite("guiada:pide", cuerpo) > 0; },
    ir, quedo,
    seguir(on?: boolean): boolean { if (typeof on === "boolean") { seguir = on; pinta(); } return seguir; },
    estadoSeguimiento: () => ({ ...est, enGuiada: enG, guia: api.soyGuia(), ultimo, oferta: oferta ? { ...oferta } : null, seguir, pendiente: pend ? { ...pend } : null, recuadro: !!caja, lamina: !!(d.Laminas && d.Laminas.hay(LAMINA)) }),
  };
  function monta(c: ContextoComponente): void {
    n = c;
    n.on("guiada:visita", alVisita);
    n.on("mundo:entra", alEntraMundo);
  }
  function tarde(): void { leeGuiada(); pinta(); }
  function libera(): void {
    if (d.Laminas && d.Laminas.hay(LAMINA)) d.Laminas.cierra(LAMINA);
    quitaCaja(); n = null; ultimo = null; oferta = null; pend = null; enG = false;
  }
  return { ...api, monta, tarde, libera };
}
export type Seguimiento = ReturnType<typeof creaSeguimiento>;

/** El componente (ADR-0023): de todos los mundos (el aviso de «la visita está en la fábrica» se ve también fuera); ?seguir=0 lo apaga */
export function manifiestoSeguimiento(s: Seguimiento): Manifiesto {
  return {
    id: ID_SEGUIMIENTO, version: 1,
    consume: [], expone: [],
    eventos: { escucha: ["guiada:visita", "mundo:entra"], emite: ["guiada:pide"] },
    bandera: { defecto: true, url: "seguir" },
    // la lámina de la oferta en VR (1 llamada, 2 triángulos, 800 × 240 sin mipmaps: ≈ 0,8 MB, solo mientras se ve); en pantalla, DOM
    presupuesto: { llamadas: 1, triangulos: 2, texturasMB: 1 },
    fases: { tarde: 0.5 },
    actualiza: { tarde: () => { s.tarde(); } },
    mundos: "todos",
    monta: c => { s.monta(c); return s; },
    libera: () => { s.libera(); },
  };
}
