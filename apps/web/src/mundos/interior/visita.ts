// La visita del museo (eje B; contrato contratos/mundo-interior.md v1.1, §1c; MUNDOS §3, «La visita del museo»): un recorrido autoguiado por las paradas
// de un interior que las trae en su mundo.json (la fábrica). Va en el trozo perezoso del interior (index.ts la crea al entrar si hay paradas y la suelta
// al salir): en el exterior no cuesta nada. Lo puro (recorrido, etiquetas, fuentes, páginas) está en visita-puro.ts.
//   · Al entrar, se ofrece «Empezar la visita» o «Pasear libre» sin bloquear: se anda igual, y la oferta se queda en un botón pequeño.
//   · Las marcas: una por parada en el suelo, con su número (ILUSTRATIVAS, regla 5: solo dicen dónde pararse); la siguiente, más grande y más clara; las
//     vistas, apagadas. Una textura (los números, en una rejilla de 4 × 4), tres materiales y una malla de 2 triángulos por parada: N llamadas. Solo con
//     la visita en marcha (fuera de ella, el grupo no se dibuja).
//   · Al llegar (radio de la parada) se abre su ficha: título, texto, dato curioso, etiquetas de procedencia (lo que se ve / lo que cuenta) y lo pendiente
//     (solo cuántas preguntas quedan), con las fuentes plegadas. En pantalla, un recuadro del HUD (botones de verdad: teclado y táctil, ≥ 44 px; todo con
//     textContent); en VR, dos filas del panel de VR de siempre (PanelVR, pestaña «Mundo»), que se abre solo al llegar.
//   · «Siguiente parada» gira a quien visita hacia ella (sin moverlo: en VR, como un giro por saltos); «Mirar la pieza», hacia su ancla. La última parada
//     sigue por su puerta (parada.puerta): si lleva a un mundo que aún no está (la bodega), «próximamente».
// three no trae tipos en el repo: lo que se usa va como T (como porton.ts).
import type { MundoInterior, Parada } from "../../datos/contratos/mundo-interior.ts";
import type { Pose2 } from "../../nucleo/mundos.ts";
import type { T } from "../comun/tipos.ts";
import { VisitaPuro } from "./visita-puro.ts";
import type { LineaFicha } from "./visita-puro.ts";

/** las marcas: lado (m), cota sobre el suelo (m) y cuánto crece la siguiente [SUPUESTO: a ojo, sin probar andando] */
const LADO = 0.7, SOBRE = 0.015, CRECE = 1.35, CELDA = 128, REJILLA = 4;
/** la ficha en el panel de VR: líneas por página y caracteres por línea (24 px en 944 px de ancho, a 1 m: unos 2,3 cm por letra) y altos de las filas */
const POR_PAGINA = 8, POR_LINEA = 72, ALTO_FILA = 88, ALTO_FICHA = 330, LINEA = 32;

/** Lo que el cableado le da a la visita (además de lo del interior). */
export interface DepsVisitaUI {
  THREE: T;
  documento: T | null;
  PanelVR?: { filas(p: string, f: T): (() => void) | null; tapa?(fn: () => boolean): () => void; repinta?(): void } | null;
  /** en VR: el panel abierto en la pestaña «Mundo» (donde van las filas de la visita) */
  abrePanel?(): void;
}
export interface DepsVisita extends DepsVisitaUI {
  man: MundoInterior;
  escena: { add(o: T): unknown; remove(o: T): unknown };
  pose: { lee(): Pose2; pon(p: Pose2): void };
  vr(): boolean;
  existe(a: string): boolean;
}

export function creaVisita(d: DepsVisita) {
  const V = VisitaPuro, P = (d.man.paradas || []) as Parada[], n = P.length, rec = V.creaRecorrido(P);
  let grupo: T = null, mats: T[] = [], tex: T = null, lienzo: T = null, raiz: T = null, aviso: T = null, cuerpo: T = null, pagina = 0, montada = false;
  const quitar: Array<() => void> = [];
  const est = { ofertas: 0, empezadas: 0, abiertas: 0, giros: 0 };

  // ---- las marcas
  function creaMarcas(): void {
    if (grupo || !d.documento) return;
    const THREE = d.THREE;
    lienzo = d.documento.createElement("canvas"); lienzo.width = CELDA * REJILLA; lienzo.height = CELDA * REJILLA;
    const c = lienzo.getContext("2d");
    if (c) for (let i = 0; i < n; i++) {
      const x = (i % REJILLA) * CELDA + CELDA / 2, y = Math.floor(i / REJILLA) * CELDA + CELDA / 2;
      c.beginPath(); c.arc(x, y, CELDA * 0.44, 0, Math.PI * 2); c.fillStyle = "rgba(16,20,24,0.62)"; c.fill();
      c.lineWidth = 7; c.strokeStyle = "#e9d48a"; c.stroke();
      c.fillStyle = "#ffffff"; c.font = "700 66px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(i + 1), x, y + 3);
    }
    tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = (color: number, opacity: number): T => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    mats = [mat(0xffffff, 0.55), mat(0xffffff, 1), mat(0x8a8a8a, 0.35)];   // normal, siguiente, vista
    grupo = new THREE.Group(); grupo.name = "visita-marcas"; grupo.visible = false;
    P.forEach((p, i) => {
      const g = new THREE.PlaneGeometry(LADO, LADO), uv = g.attributes.uv, col = i % REJILLA, fil = Math.floor(i / REJILLA);
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / REJILLA, 1 - (fil + 1) / REJILLA + uv.getY(k) / REJILLA);
      uv.needsUpdate = true; g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mats[0]); m.name = "parada-" + p.id; m.renderOrder = 4;
      m.position.set(p.pos[0], p.pos[1] + SOBRE, p.pos[2]); grupo.add(m);
    });
    d.escena.add(grupo);
  }
  function marcas(): void {
    if (!grupo) return;
    grupo.visible = rec.modo() === "visita";
    grupo.children.forEach((m: T, i: number) => {
      const sig = i === rec.sig() && i !== rec.abierta();
      m.material = sig ? mats[1] : rec.vista(i) ? mats[2] : mats[0]; m.scale.setScalar(sig ? CRECE : 1);
    });
  }

  // ---- girar a quien visita (sin moverlo) hacia un punto del glb
  function mira(p: readonly number[] | null | undefined): void {
    if (!p) return;
    const q = d.pose.lee();
    d.pose.pon({ x: q.x, y: q.y, ang: V.angHacia(q.x, q.y, p) }); est.giros++;
  }
  const abierta = (): Parada | null => (rec.abierta() >= 0 ? P[rec.abierta()]! : null);
  const sigueDe = (p: Parada) => V.sigue(p, d.man.puertas, d.existe);
  const puertaPos = (id: string): number[] | null => { const pu = d.man.puertas.find(x => x.id === id); return pu ? pu.pos : null; };

  // ---- lo que se puede hacer (los botones de pantalla y de VR llaman a lo mismo)
  function accion(a: string): void {
    if (a === "empieza") { rec.empieza(); est.empezadas++; creaMarcas(); pagina = 0; }
    else if (a === "libre" || a === "sal") rec.deja();
    else if (a === "orienta") { const k = rec.sig(); if (k < n) mira(P[k]!.pos); else rec.deja(); }
    else if (a === "siguiente") { const k = rec.siguiente(); if (k >= 0) mira(P[k]!.pos); else rec.deja(); }
    else if (a === "mira") { const p = abierta(); if (p) mira(p.ancla.pos); }
    else if (a === "puerta") { const p = abierta(), s = p ? sigueDe(p) : null; if (s) mira(puertaPos(s.puerta)); }
    else if (a === "pag+") pagina = Math.min(pagina + 1, paginas().length - 1);
    else if (a === "pag-") pagina = Math.max(0, pagina - 1);
    cambia();
  }
  function cambia(): void { marcas(); pinta(); if (d.PanelVR && d.PanelVR.repinta) d.PanelVR.repinta(); }

  // ---- cada fotograma (desde actualiza() del interior): ¿se llega a una parada o se aleja de la abierta?
  function cada(): void {
    if (!montada || rec.modo() !== "visita") return;
    const q = d.pose.lee(), ev = rec.paso(q.x, q.y);
    if (!ev) return;
    if (ev.abre !== undefined) {
      est.abiertas++; pagina = 0;
      const p = P[ev.abre]!;
      if (aviso) aviso.textContent = "Parada " + (ev.abre + 1) + ": " + p.ficha.titulo;
      if (d.vr() && d.abrePanel) d.abrePanel();
    }
    cambia();
  }

  // ---- en pantalla: el recuadro (textContent siempre; los botones, de verdad)
  function el(tag: string, txt?: string, cls?: string): T {
    const e = d.documento.createElement(tag); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e;
  }
  function boton(caja: T, accionId: string, txt: string, primario?: boolean, desactivado?: boolean): void {
    const b = el("button", txt, primario ? "visita-primario" : undefined); b.type = "button"; b.setAttribute("data-accion", accionId);
    if (desactivado) { b.disabled = true; b.setAttribute("aria-disabled", "true"); }
    caja.appendChild(b);
  }
  function pinta(): void {
    if (!cuerpo) return;
    cuerpo.textContent = "";
    const modo = rec.modo(), p = abierta(), bot = el("div", undefined, "visita-botones");
    raiz.classList.toggle("visita-compacta", modo === "libre");
    if (modo === "oferta") {
      cuerpo.appendChild(el("h3", "Visita del museo"));
      cuerpo.appendChild(el("p", n + (n === 1 ? " parada" : " paradas") + " con su ficha. Las marcas numeradas del suelo son ilustrativas: solo dicen dónde pararse. Puedes pasear libre y empezarla luego."));
      boton(bot, "empieza", "Empezar la visita", true); boton(bot, "libre", "Pasear libre");
    } else if (modo === "libre") {
      boton(bot, "empieza", "Empezar la visita del museo", true);
    } else if (p) {
      const i = rec.abierta(), f = p.ficha, et = V.etiquetas(f), pe = V.pendiente(f), fu = V.fuentesDe(f, d.man.fuentes), s = sigueDe(p);
      cuerpo.appendChild(el("h3", (i + 1) + ". " + f.titulo));
      cuerpo.appendChild(el("p", f.texto));
      if (f.dato_curioso) { const dc = el("p", undefined, "visita-dato"); dc.appendChild(el("strong", "Dato curioso: ")); dc.appendChild(d.documento.createTextNode(f.dato_curioso)); cuerpo.appendChild(dc); }
      const pr = el("p", undefined, "visita-procedencia");
      pr.appendChild(el("span", et.visible + (f.nota_visible ? ". " + f.nota_visible : ""))); pr.appendChild(el("br")); pr.appendChild(el("span", et.texto));
      if (pe) { pr.appendChild(el("br")); pr.appendChild(el("span", pe)); }
      cuerpo.appendChild(pr);
      if (fu.length) {
        const det = el("details"), lista = el("ul");
        det.appendChild(el("summary", "Fuentes (" + fu.length + ")"));
        for (const x of fu) {
          const li = el("li", V.fuenteTexto(x));
          if (x.url) { const a = el("a", "enlace"); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; li.appendChild(d.documento.createTextNode(" · ")); li.appendChild(a); }
          lista.appendChild(li);
        }
        det.appendChild(lista); cuerpo.appendChild(det);
      }
      boton(bot, "mira", "Mirar la pieza");
      if (s) boton(bot, "puerta", s.texto, false, !s.abierta);
      if (i + 1 < n) { boton(bot, "siguiente", "Siguiente parada", true); boton(bot, "sal", "Salir de la visita"); }
      else boton(bot, "sal", "Terminar la visita", true);
    } else if (rec.fin()) {
      cuerpo.appendChild(el("p", "Has visto las " + n + " paradas."));
      boton(bot, "sal", "Terminar la visita", true);
    } else {
      const k = rec.sig();
      cuerpo.appendChild(el("p", "Parada " + (k + 1) + " de " + n + ": " + P[k]!.ficha.titulo + ". Sigue la marca resaltada del suelo."));
      boton(bot, "orienta", "Mirar hacia ella", true); boton(bot, "sal", "Salir de la visita");
    }
    cuerpo.appendChild(bot);
  }
  function alPulsar(e: T): void {
    const b = e && e.target && e.target.closest ? e.target.closest("button[data-accion]") : null;
    if (b && !b.disabled) accion(b.getAttribute("data-accion"));
  }
  function creaRecuadro(): void {
    if (!d.documento) return;
    const doc = d.documento, junto = doc.getElementById ? doc.getElementById("ficha") : null;
    raiz = el("section", undefined, "ficha visita"); raiz.id = "visitaMuseo"; raiz.setAttribute("aria-label", "Visita del museo");
    aviso = el("p", "", "visita-anuncio"); aviso.setAttribute("role", "status"); aviso.setAttribute("aria-live", "polite");
    cuerpo = el("div");
    raiz.appendChild(aviso); raiz.appendChild(cuerpo);
    raiz.addEventListener("click", alPulsar);
    ((junto && junto.parentNode) || doc.body).appendChild(raiz);
  }

  // ---- en VR: dos filas del panel (pestaña «Mundo»): los botones y, con una ficha abierta, la ficha por páginas
  function paginas(): LineaFicha[][] {
    const p = abierta(); if (!p) return [[]];
    const s = sigueDe(p);
    return V.paginas(p.ficha, d.man.fuentes, POR_LINEA, POR_PAGINA, s ? "Sigue: " + s.texto : null);
  }
  function filasVR(): void {
    const PV = d.PanelVR; if (!PV) return;
    const q1 = PV.filas("mundo", {
      id: "visita", orden: 4, alto: ALTO_FILA,
      firma: () => rec.modo() + ":" + rec.abierta() + ":" + rec.sig() + ":" + pagina,
      pinta: (_cx: T, y: number, _W: T, h: T) => {
        const m = rec.modo(), k = rec.abierta();
        h.fila(m !== "visita" ? "Visita del museo" : k >= 0 ? "Parada " + (k + 1) + " de " + n : rec.fin() ? "Visita: vista" : "Siguiente: " + (rec.sig() + 1) + " de " + n, y);
      },
      botones: (b: T, y: number) => {
        const m = rec.modo(), k = rec.abierta(), go = (a: string) => () => accion(a);
        if (m === "oferta") { b("vis-empieza", 420, y, 300, 64, "Empezar la visita", go("empieza"), true); b("vis-libre", 736, y, 248, 64, "Pasear libre", go("libre"), false); }
        else if (m === "libre") b("vis-empieza", 420, y, 470, 64, "Empezar la visita", go("empieza"), false);
        else if (k >= 0) {
          b("vis-pag-", 250, y, 80, 64, "‹", go("pag-"), false); b("vis-pag+", 346, y, 80, 64, "›", go("pag+"), false);
          b("vis-mira", 442, y, 160, 64, "Mirar", go("mira"), false);
          if (k + 1 < n) { b("vis-siguiente", 618, y, 200, 64, "Siguiente", go("siguiente"), true); b("vis-sal", 834, y, 150, 64, "Salir", go("sal"), false); }
          else b("vis-sal", 618, y, 366, 64, "Terminar la visita", go("sal"), true);
        } else if (rec.fin()) b("vis-sal", 420, y, 470, 64, "Terminar la visita", go("sal"), true);
        else { b("vis-orienta", 420, y, 300, 64, "Mirar hacia ella", go("orienta"), true); b("vis-sal", 736, y, 248, 64, "Salir", go("sal"), false); }
      },
      debug: () => ({ visita: estado() }),
    });
    const q2 = PV.filas("mundo", {
      id: "visita-ficha", orden: 5, alto: ALTO_FICHA, visible: () => rec.abierta() >= 0,
      firma: () => rec.abierta() + ":" + pagina,
      pinta: (cx: T, y: number, W: number) => {
        const p = abierta(); if (!p) return;
        const pags = paginas(); pagina = Math.min(pagina, pags.length - 1);
        cx.fillStyle = "rgba(233,212,138,0.10)"; cx.fillRect(28, y + 4, W - 56, ALTO_FICHA - 12);
        cx.textBaseline = "top"; cx.textAlign = "left"; cx.fillStyle = "#ffffff"; cx.font = "bold 30px system-ui, sans-serif";
        cx.fillText((rec.abierta() + 1) + ". " + p.ficha.titulo, 40, y + 12, W - 200);
        cx.textAlign = "right"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.fillText((pagina + 1) + " / " + pags.length + " ›", W - 40, y + 18);
        cx.textAlign = "left";
        (pags[pagina] || []).forEach((l, i) => {
          cx.fillStyle = l.e === "destacado" ? "#e9d48a" : l.e === "etiqueta" ? "#7fe3ff" : l.e === "pie" ? "#c2ccd2" : "#e6edf1";
          cx.font = (l.e === "destacado" ? "bold " : "") + (l.e === "pie" ? "22px" : "24px") + " system-ui, sans-serif";
          cx.fillText(l.t, 40, y + 56 + i * LINEA, W - 80);
        });
      },
    });
    for (const q of [q1, q2]) if (q) quitar.push(q);
    if (PV.tapa) quitar.push(PV.tapa(() => rec.abierta() >= 0));   // con la ficha en el panel, no sale la ficha con botones de otra cosa
  }

  function monta(): void {
    if (montada || !n) return;
    montada = true; est.ofertas++;
    creaRecuadro(); filasVR(); pinta();
    if (d.vr() && d.abrePanel) d.abrePanel();
  }
  function libera(): void {
    montada = false;
    for (const q of quitar.splice(0)) { try { q(); } catch (e) { /* ya suelto */ } }
    if (raiz) { raiz.removeEventListener("click", alPulsar); if (raiz.parentNode) raiz.parentNode.removeChild(raiz); }
    raiz = null; cuerpo = null; aviso = null;
    if (grupo) { d.escena.remove(grupo); grupo.children.forEach((m: T) => m.geometry.dispose()); grupo = null; }
    for (const m of mats) m.dispose();
    mats = [];
    if (tex) { tex.dispose(); tex = null; }
    if (lienzo) { lienzo.width = 1; lienzo.height = 1; lienzo = null; }
    if (d.PanelVR && d.PanelVR.repinta) d.PanelVR.repinta();
  }
  function estado() {
    return { ...est, modo: rec.modo(), paradas: n, siguiente: rec.sig(), abierta: rec.abierta(), pagina, marcas: grupo ? grupo.children.length : 0, marcasVisibles: !!(grupo && grupo.visible), recuadro: !!raiz };
  }
  return { monta, cada, libera, accion, estado };
}
export type Visita = ReturnType<typeof creaVisita>;
