// Las máquinas de un interior (eje B; contrato contratos/mundo-interior.md v1.2, §1e; ADR-0034): el motor mueve sin clips los nodos de maquinas[]. Va en
// el trozo perezoso del interior (index.ts las crea en carga() si el manifiesto trae máquinas): en el exterior y en un interior sin máquinas no cuesta nada.
//   · Giro: el nodo gira en torno a `eje` (marco del padre) por su origen (el pivote); vaivén y traslación: el nodo va por `eje` desde su reposo; textura:
//     el color de `material` corre en la dirección `uv` (el desplazamiento de su mapa; el mapa se clona para no arrastrar a otros materiales que lo
//     compartan: el clon comparte la imagen, no sube nada nuevo a la GPU). La órbita (un rulo con la cruceta) la da la jerarquía del glb.
//   · Las velocidades y las fases, en maquinas-puro.ts (Vitest). Cada fotograma: una escritura de cuaternión, posición o desplazamiento por máquina,
//     sin reservas; parada del todo, nada.
//   · La marcha: arrancan solas al entrar (con rampa), salvo con «reducir movimiento» (prefers-reduced-motion), que entran paradas. Un solo interruptor,
//     «Parar las máquinas» / «Poner en marcha las máquinas»: en pantalla, un botón (aria-pressed, 44 px) en un recuadro pequeño; en VR, una fila del panel
//     (pestaña «Mundo»). No mueve la cámara (regla 1 de la skill interaccion): solo se mueven las piezas.
//   · En una visita guiada (decisión 236; seguimiento.ts), con el estado del guía (maquinas no null): la marcha del grupo para todos, salvo «reducir
//     movimiento» (paradas en su aparato, con el aviso «el guía las ha puesto en marcha») o «Parar para mí»; la familia no tiene su interruptor, solo ese.
//     El guía ve «Máquinas para todos: en marcha / paradas», que pide el cambio a la api (guiada:pide). Quien entra tarde las ve donde los demás (fija).
// three no trae tipos en el repo: lo que se usa va como T (como visita.ts).
import type { Maquina } from "../../datos/contratos/mundo-interior.ts";
import type { T } from "../comun/tipos.ts";
import { MaquinasPuro } from "./maquinas-puro.ts";
import { GuiadaPuro } from "./guiada-puro.ts";
import type { MandoMaquinas, VisitaGuiada } from "./guiada-puro.ts";
import type { GuiadaParaInterior } from "./seguimiento.ts";

export interface DepsMaquinas {
  maquinas: readonly Maquina[];
  /** la raíz del glb (getObjectByName, traverse) */
  raiz: T;
  consola?: { warn(...a: unknown[]): void } | null;
}
export interface DepsMaquinasUI {
  documento: T | null;
  PanelVR?: { filas(p: string, f: T): (() => void) | null; repinta?(): void } | null;
  /** ¿pide el sistema reducir el movimiento? (entonces entran paradas) */
  reducido?(): boolean;
  /** la visita guiada (seguimiento.ts): quién manda en las máquinas y, el guía, pedir el cambio para todos */
  guiada?: GuiadaParaInterior | null;
  /** un aviso en el HUD (el guía las ha puesto en marcha y aquí siguen paradas) */
  aviso?(s: string, ms?: number): void;
  /** reloj en ms epoch (Date.now), el de «desde» de la api */
  reloj?(): number;
}

interface Pieza { i: number; nodo: T; q0: number[]; p0: number[]; eje: number[]; mapas: Array<{ t: T; u0: number; v0: number }> }

export function creaMaquinas(d: DepsMaquinas) {
  const M = MaquinasPuro, piezas: Pieza[] = [], faltan: string[] = [];
  // los nodos y su reposo; las texturas que corren, clonadas (un clon por máquina, en todos los materiales con ese nombre)
  d.maquinas.forEach((m, i) => {
    const nodo = d.raiz.getObjectByName(m.nodo);
    if (!nodo) { faltan.push(m.nodo); return; }
    const pz: Pieza = { i, nodo, q0: [nodo.quaternion.x, nodo.quaternion.y, nodo.quaternion.z, nodo.quaternion.w], p0: [nodo.position.x, nodo.position.y, nodo.position.z], eje: m.eje ? [...m.eje] : [0, 1, 0], mapas: [] };
    if (m.tipo === "textura") {
      const clones = new Map<T, T>();
      nodo.traverse((o: T) => {
        if (!o.isMesh) return;
        for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!mt || mt.name !== m.material || !mt.map) continue;
          let c = clones.get(mt.map);
          if (!c) { c = mt.map.clone(); clones.set(mt.map, c); pz.mapas.push({ t: c, u0: c.offset.x, v0: c.offset.y }); }
          mt.map = c;
        }
      });
      if (!pz.mapas.length) faltan.push(m.material + " (material de «" + m.id + "»)");
    }
    piezas.push(pz);
  });
  if (faltan.length && d.consola) d.consola.warn("[maquinas] no están en el glb: " + faltan.join(", "));
  const marcha = M.creaMarcha(d.maquinas), q = [0, 0, 0, 1];
  let aplicada = true;   // ¿las piezas ya están donde dice la marcha? (parada y aplicada: nada que hacer)

  function aplica(): void {
    for (const pz of piezas) {
      const m = d.maquinas[pz.i]!, v = marcha.valor(pz.i), n = pz.nodo;
      if (m.tipo === "giro") { M.rotaEnPadre(pz.eje, v, pz.q0, q); n.quaternion.set(q[0], q[1], q[2], q[3]); }
      else if (m.tipo === "textura") { const w = marcha.valorV(pz.i); for (const x of pz.mapas) x.t.offset.set(x.u0 + v, x.v0 + w); }
      else n.position.set(pz.p0[0]! + pz.eje[0]! * v, pz.p0[1]! + pz.eje[1]! * v, pz.p0[2]! + pz.eje[2]! * v);
    }
  }
  /** cada fotograma (actualiza del interior) */
  function cada(dt: number): void {
    if (marcha.quieta() && aplicada) return;
    marcha.avanza(dt); aplica(); aplicada = true;
  }

  // ---- el interruptor: en pantalla y en VR llaman a lo mismo
  let ui: DepsMaquinasUI | null = null, raizUI: T = null, boton: T = null;
  const quitar: Array<() => void> = [];
  const est = { conmutaciones: 0, guiadas: 0, pedidas: 0 };
  // la visita guiada: quién manda (propio, o el guía), «Parar para mí» y el último «desde» atendido (para avisar una vez por cambio)
  let mando: MandoMaquinas = { mando: "propio" }, paraMi = false, grupo: VisitaGuiada["maquinas"] = null, desdeVisto = NaN;
  const guia = (): boolean => !!(ui && ui.guiada && ui.guiada.enGuiada() && ui.guiada.soyGuia());
  const reducido = (): boolean => !!(ui && ui.reducido && ui.reducido());
  const delGrupo = (): boolean => (grupo ? grupo.marcha : marcha.enMarcha());
  /** lo que dice el interruptor: el de siempre; el del guía (para todos); el de la familia (solo «Parar para mí») */
  function texto(): string {
    if (guia()) return "Máquinas para todos: " + (delGrupo() ? "en marcha" : "paradas");
    if (mando.mando === "guia") return mando.motivo === "reducido" ? "Paradas aquí (reducir movimiento)" : paraMi ? "Volver a la marcha del grupo" : mando.grupo ? "Parar para mí" : "El guía las ha parado";
    return marcha.enMarcha() ? "Parar las máquinas" : "Poner en marcha las máquinas";
  }
  /** aria-pressed: las del guía y las de siempre, en marcha; las de la familia, «Parar para mí» puesto */
  const pulsado = (): boolean => (guia() ? delGrupo() : mando.mando === "guia" ? paraMi : marcha.enMarcha());
  /** sin efecto: la familia con las máquinas paradas por el guía o por reducir movimiento */
  const inerte = (): boolean => !guia() && mando.mando === "guia" && (mando.motivo === "reducido" || (!mando.grupo && !paraMi));
  function rotula(): void {
    if (boton) { boton.textContent = texto(); boton.setAttribute("aria-pressed", pulsado() ? "true" : "false"); boton.disabled = inerte(); }
    if (ui && ui.PanelVR && ui.PanelVR.repinta) ui.PanelVR.repinta();
  }
  function pon(on: boolean): void {
    if (on === marcha.enMarcha()) return;
    marcha.objetivo(on); aplicada = false; est.conmutaciones++;
    rotula();
  }
  /** la marcha que manda la guiada en este aparato (GuiadaPuro.maquinas), con las fases de los demás si se llega tarde (MaquinasPuro.sincroniza) */
  function aplicaGuiada(): void {
    mando = GuiadaPuro.maquinas(grupo, reducido(), paraMi);
    if (mando.mando === "guia") {
      if (mando.marcha && grupo) {
        const t = ((ui && ui.reloj ? ui.reloj() : Date.now()) - grupo.desde) / 1000, s = MaquinasPuro.sincroniza(marcha.marcha(), t);
        if (s === "fija") { marcha.fija(t); aplicada = false; } else if (s === "cero") marcha.aCero();
      }
      pon(mando.marcha);
    }
    rotula();
  }
  /** el estado del guía ha cambiado (seguimiento.ts → index.ts), o la guiada ha terminado (null): cada uno vuelve a lo suyo, tal como estén */
  function alGuiada(v: VisitaGuiada | null): void {
    const m = v ? v.maquinas : null, nuevo = !!m && m.desde !== desdeVisto;
    est.guiadas++;
    if (!m) paraMi = false;
    // el mismo estado otra vez (otra parada, n que sube): nada que sincronizar
    if (m && grupo && !nuevo && m.marcha === grupo.marcha) { grupo = m; rotula(); return; }
    grupo = m;
    aplicaGuiada();
    if (nuevo && m) {
      desdeVisto = m.desde;
      if (m.marcha && !guia() && mando.mando === "guia" && mando.motivo === "reducido" && ui && ui.aviso) ui.aviso("El guía ha puesto las máquinas en marcha; aquí siguen paradas porque tu aparato pide reducir el movimiento", 5000);
    }
  }
  function alPulsar(): void {
    if (guia()) {   // el guía: para todos, por la api (la marcha vuelve con guiada:visita)
      est.pedidas++;
      if (ui && ui.guiada && !ui.guiada.pide({ maquinas: { marcha: !delGrupo() } }) && ui.aviso) ui.aviso("No se ha podido pedir: no estás en la visita guiada", 4000);
      return;
    }
    if (mando.mando === "guia") { if (!inerte()) { paraMi = !paraMi; aplicaGuiada(); } return; }
    pon(!marcha.enMarcha());
  }
  /** al entrar: la marcha (salvo reducir movimiento) y el interruptor */
  function monta(u: DepsMaquinasUI | null): void {
    ui = u;
    pon(!(u && u.reducido && u.reducido()));
    // en una visita guiada con el estado del guía, manda el grupo (salvo reducir movimiento)
    const g = u && u.guiada ? u.guiada.estado() : null;
    if (g) alGuiada(g);
    if (!u || !piezas.length) return;
    if (u.documento) {
      const doc = u.documento, junto = doc.getElementById ? doc.getElementById("ficha") : null;
      raizUI = doc.createElement("section"); raizUI.id = "maquinasInterior"; raizUI.className = "ficha maquinas"; raizUI.setAttribute("aria-label", "Máquinas");
      boton = doc.createElement("button"); boton.type = "button"; boton.title = "Las piezas y su movimiento son ilustrativos"; boton.textContent = texto(); boton.setAttribute("aria-pressed", pulsado() ? "true" : "false"); boton.disabled = inerte();
      boton.addEventListener("click", alPulsar);
      const fila = doc.createElement("div"); fila.className = "maquinas-botones"; fila.appendChild(boton);   // dentro de un div: «.ficha > button» es la × de cerrar
      raizUI.appendChild(fila);
      ((junto && junto.parentNode) || doc.body).appendChild(raizUI);
    }
    if (u.PanelVR) {
      const f = u.PanelVR.filas("mundo", {
        id: "maquinas", orden: 3, alto: 88, firma: () => texto() + ":" + pulsado(),
        pinta: (_cx: T, y: number, _W: T, h: T) => { h.fila("Máquinas (ilustrativo)", y); },
        botones: (b: T, y: number) => { b("maq-marcha", 420, y, 470, 64, texto(), () => { if (!inerte()) alPulsar(); }, pulsado()); },
      });
      if (f) quitar.push(f);
    }
  }
  /** al salir: fuera el interruptor (las piezas se quedan donde estén: el interior se libera) */
  function desmonta(): void {
    for (const f of quitar.splice(0)) { try { f(); } catch (e) { /* ya suelto */ } }
    if (boton) boton.removeEventListener("click", alPulsar);
    if (raizUI && raizUI.parentNode) raizUI.parentNode.removeChild(raizUI);
    raizUI = null; boton = null;
    if (ui && ui.PanelVR && ui.PanelVR.repinta) ui.PanelVR.repinta();
    ui = null;
  }
  function estado() {
    return { maquinas: d.maquinas.length, piezas: piezas.length, faltan: faltan.slice(), enMarcha: marcha.enMarcha(), marcha: marcha.marcha(), interruptor: !!raizUI, ...est, mando: mando.mando === "guia" ? mando.motivo : "propio", paraMi, texto: texto() };
  }
  return { cada, pon, monta, desmonta, estado, alGuiada, enMarcha: (): boolean => marcha.enMarcha() };
}
export type Maquinas = ReturnType<typeof creaMaquinas>;
