// La linde y el «aplica» del exterior (A3-2b, MU5-n; antes 08_marcadores.js). Con el three de verdad y dobles de lo que recoloca. Se comprueba: que aplica() espera a
// que los datos estén, que reparte la exageración y el modo a todo lo que cuelga del terreno, que avisa por el Bus, que aplicaLuego agrupa en un fotograma y, en el
// ciclo de vida, que libera() saca el grupo de la escena y que montar y liberar deja la escena como estaba. HONESTIDAD: nada se dibuja aquí.
import { describe, expect, it } from "vitest";
import { NOTAS, creaMarcadores } from "./marcadores.ts";
import type { DepsMarcadores } from "./marcadores.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function monta(modo = "gem") {
  const scene = new THREE.Scene(), llamadas: string[] = [], avisos: string[] = [], rafs: (() => void)[] = [], estado = { listo: false };
  const casillas: Record<string, { checked: boolean; visible: boolean; textContent: string }> = {
    cLinde: { checked: true, visible: true, textContent: "" }, cSolo: { checked: false, visible: true, textContent: "" }, notaModo: { checked: false, visible: true, textContent: "" } };
  const vis = () => ({ visible: false });
  const deps: DepsMarcadores = {
    THREE, scene, Estaticos: { congela() {} }, Bus: { emite: (ev: string) => { avisos.push(ev); } } as DepsMarcadores["Bus"], D: { parcelas: [{}, {}] },
    $: (id) => casillas[id] ?? null, Estado: { exag: 2, modo }, UN: { uExag: { value: 0 }, uModoOrto: { value: 0 } },
    nube: vis(), gArboles: vis(), gFollaje: vis(), gSombras: vis(), Arboles: { refresca: () => { llamadas.push("refresca"); } },
    pintaNube: () => { llamadas.push("nube"); }, colocaBarrera: (k) => { llamadas.push("barrera" + k); }, colocaPaisaje: () => { llamadas.push("paisaje"); },
    colocaBalizas: () => { llamadas.push("balizas"); }, recoloreaSuelo: () => { llamadas.push("suelo"); }, listo: () => estado.listo, raf: (f) => { rafs.push(f); },
  };
  return { api: creaMarcadores(deps), deps, scene, llamadas, avisos, rafs, estado, casillas };
}

describe("marcadores (la linde y aplica)", () => {
  it("sin datos no hace nada; con ellos reparte exageración y modo y avisa por el Bus", () => {
    const m = monta("gem");
    m.api.aplica(); expect(m.llamadas).toEqual([]); expect(m.avisos).toEqual([]);
    m.estado.listo = true; m.api.aplica();
    expect(m.llamadas).toEqual(["refresca", "barrera0", "barrera1", "paisaje", "balizas", "suelo"]);
    expect(m.avisos).toEqual(["mundo:aplica", "capas:cambia"]);
    expect(m.deps.UN.uExag.value).toBe(2); expect(m.deps.UN.uModoOrto.value).toBe(0);
    expect([m.deps.nube.visible, m.deps.gArboles.visible, m.deps.gFollaje.visible, m.deps.gSombras.visible]).toEqual([false, true, true, true]);
    expect(m.casillas["notaModo"]!.textContent).toBe(NOTAS["gem"]);
    expect(m.api.gLinde.visible).toBe(true); expect(m.scene.children).toContain(m.api.gLinde);
  });

  it("modo nube pinta la nube; «solo» apaga árboles y nube; modo orto pone el uniforme", () => {
    const n = monta("nube"); n.estado.listo = true; n.casillas["cSolo"]!.checked = true; n.api.aplica();
    expect(n.llamadas[0]).toBe("nube"); expect([n.deps.nube.visible, n.deps.gArboles.visible]).toEqual([false, false]);
    const o = monta("orto"); o.estado.listo = true; o.api.aplica(); expect(o.deps.UN.uModoOrto.value).toBe(1);
  });

  it("aplicaLuego agrupa varias peticiones en un solo fotograma", () => {
    const m = monta(); m.estado.listo = true;
    m.api.aplicaLuego(); m.api.aplicaLuego(); expect(m.rafs).toHaveLength(1);
    m.rafs[0]!(); expect(m.avisos.filter((a) => a === "mundo:aplica")).toHaveLength(1);
    m.api.aplicaLuego(); expect(m.rafs).toHaveLength(2);
  });

  it("libera() saca el grupo de la escena y aplicaLuego ya no actúa; montar y liberar deja la escena como estaba", () => {
    for (let v = 0; v < 3; v++) {
      const m = monta(); expect(m.scene.children).toHaveLength(1);
      m.api.libera(); m.api.libera(); expect(m.scene.children).toHaveLength(0);
      m.api.aplicaLuego(); expect(m.rafs).toHaveLength(0);
    }
  });
});
