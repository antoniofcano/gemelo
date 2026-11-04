// La página de humo (F2b), común a los tres modos. Cada entrada (entrada_<modo>.js) le pasa su THREE y su «fábrica»:
//   { renderizador: texto, crea(THREE, p, lienzo) → Promise<{ renderer, dibuja(escena, camara), gl, multiviewActivo() }>, sombreador(THREE, a, b) }
// En VR la medida empieza sola al entrar (3 s de calentamiento + 60 s) y se repite con el gatillo; el resultado sale en un panel dentro de VR,
// en la consola y, al salir de VR, en la página con un botón «Copiar». En pantalla, el botón «Medir en pantalla» (comprobación, no vale como fps).
import { lee } from "./plan.js";
import { creaEscena } from "./escena.js";
import { creaMedidor, texto, sonda, MideEst } from "./medida.js";

function panelVR(THREE, camara) {
  const lienzo = document.createElement("canvas"); lienzo.width = 1024; lienzo.height = 640;
  const ctx = lienzo.getContext("2d"), tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
  malla.position.set(0, 1.45, -1.6); malla.frustumCulled = false;   // siempre una llamada más, mire donde mire
  return {
    malla,
    pinta(lineas) {
      ctx.fillStyle = "#12140f"; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.fillStyle = "#e8e6dc"; ctx.font = "26px monospace";
      lineas.slice(0, 22).forEach((l, i) => { ctx.fillText(l.length > 70 ? l.slice(0, 69) + "…" : l, 20, 40 + i * 27); });
      tex.needsUpdate = true;
    },
  };
}

export async function arranca(THREE, fabrica, modoBuild) {
  const p = lee(location.search, modoBuild), $ = id => document.getElementById(id);
  const estado = $("estado"), botonMedir = $("medir"), botonCopiar = $("copiar"), salida = $("resultado");
  const E = creaEscena(THREE, p, fabrica.sombreador);
  const lienzo = document.createElement("canvas"); document.body.appendChild(lienzo);
  const R = await fabrica.crea(THREE, p, lienzo);
  const renderer = R.renderer;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const tamaño = () => { renderer.setSize(window.innerWidth, window.innerHeight); E.camara.aspect = window.innerWidth / window.innerHeight; E.camara.updateProjectionMatrix(); };
  tamaño(); window.addEventListener("resize", tamaño);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.xr.setFramebufferScaleFactor(p.escala);
  renderer.xr.setFoveation(p.fov);
  const panel = panelVR(THREE, E.camara); E.escena.add(panel.malla);

  const sondaIni = sonda(R.gl);
  let sesion = null, ultimo = "";
  const contexto = () => ({ fecha: new Date().toISOString().slice(0, 19).replace("T", " "), renderizador: fabrica.renderizador, p, plan: E.plan, sonda: sondaIni,
    sesion, ua: navigator.userAgent, vr: renderer.xr.isPresenting, seg: p.seg, calent: p.calent });
  const muestra = txt => {
    ultimo = txt; salida.textContent = txt; console.log(txt);
    panel.pinta(txt.split("\n"));
    botonCopiar.hidden = renderer.xr.isPresenting;
  };
  const medidor = creaMedidor(p.calent, p.seg, r => muestra(texto(r, contexto())));
  const cabecera = () => texto(null, contexto()).split("\n").slice(0, -1);

  // los botones: VR (VRButton de la misma three: pide local-floor, bounded-floor y layers), medir en pantalla y copiar
  const { VRButton } = fabrica;
  document.body.appendChild(VRButton.createButton(renderer));
  botonMedir.hidden = false;
  botonMedir.onclick = () => { medidor.arma(); estado.textContent = "Midiendo en pantalla (no vale como fps de VR)…"; };
  botonCopiar.onclick = async () => {
    try { await navigator.clipboard.writeText(ultimo); botonCopiar.textContent = "Copiado"; }
    catch (e) { const r = document.createRange(); r.selectNodeContents(salida); const s = getSelection(); s.removeAllRanges(); s.addRange(r); botonCopiar.textContent = "Seleccionado: copia a mano"; }
    setTimeout(() => { botonCopiar.textContent = "Copiar"; }, 2500);
  };

  renderer.xr.addEventListener("sessionstart", () => {
    const s = renderer.xr.getSession(), capa = renderer.xr.getBaseLayer ? renderer.xr.getBaseLayer() : null;
    sesion = {
      multiview: R.multiviewActivo(),
      capa: capa ? capa.constructor && capa.constructor.name : null,
      capas: capa && typeof capa.textureArrayLength === "number" ? capa.textureArrayLength : null,
      foveacion: capa && typeof capa.fixedFoveation === "number" ? Math.round(capa.fixedFoveation * 100) / 100 : null,
      frecuencia: s && typeof s.frameRate === "number" ? s.frameRate : null,
    };
    medidor.arma(); panel.pinta(cabecera().concat(["", "Calentando " + p.calent + " s y midiendo " + p.seg + " s…", "Quédate quieto mirando al frente."]));
    estado.textContent = "En VR: midiendo.";
  });
  renderer.xr.addEventListener("sessionend", () => {
    if (medidor.estado !== "hecho") medidor.para();
    estado.textContent = ultimo ? "Fuera de VR. Resultado abajo: «Copiar» y pégalo en el chat." : "Fuera de VR, sin medida completa.";
    botonCopiar.hidden = !ultimo;
  });
  // en VR, el gatillo repite la medida (cuando la anterior terminó)
  for (let i = 0; i < 2; i++) renderer.xr.getController(i).addEventListener("select", () => {
    if (medidor.estado === "hecho" || medidor.estado === "parado") { medidor.arma(); panel.pinta(cabecera().concat(["", "Otra vez: calentando y midiendo…"])); }
  });

  let anterior = -1;
  document.addEventListener("visibilitychange", () => { anterior = -1; });
  renderer.setAnimationLoop(t => {
    const t0 = performance.now(), intervalo = anterior < 0 ? 0 : t - anterior; anterior = t;
    E.animar(t);
    const r0 = performance.now(); R.dibuja(E.escena, E.camara); const r1 = performance.now();
    medidor.fotograma(intervalo, performance.now() - t0, r1 - r0, renderer.info, document.hidden);
  });
  estado.textContent = "Listo: " + fabrica.renderizador + ". Entra en VR (la medida empieza sola) o mide en pantalla.";
  panel.pinta(cabecera());
  salida.textContent = cabecera().join("\n");
  console.log("humo multiview: modo=" + p.modo + " · " + fabrica.renderizador + " · three r" + THREE.REVISION, p, E.plan, sondaIni);
  window.__humo = { p, plan: E.plan, sonda: sondaIni, medidor, MideEst, renderer };
}
