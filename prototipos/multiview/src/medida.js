// El medidor mínimo de la página de humo: una ventana de `seg` s tras `calent` s de calentamiento; por fotograma, el intervalo con el anterior,
// los ms de JS del fotograma, los ms de renderer.render(), las llamadas y los triángulos. La estadística (mediana, p95, p99, peor; descartes) es
// la del medidor del gemelo, MideEst de apps/web/motor/30_mide.js, y la lectura de renderer.info la de RenderPuro (02h_render.js): las cifras se
// cuentan igual que en el gemelo y se pueden comparar con doc/sistema/MEDIDAS.md. No envía nada a ningún servidor.
import MideEst from "gemelo-puro:30_mide/MideEst";
import RenderPuro from "gemelo-puro:02h_render/RenderPuro";

export { MideEst, RenderPuro };

export function creaMedidor(calent, seg, alTerminar) {
  let estado = "parado", tIni = 0, m = null, resultado = null;
  const api = {
    get estado() { return estado; },
    get resultado() { return resultado; },
    segundos() { return estado === "parado" || estado === "hecho" ? 0 : (performance.now() - tIni) / 1000; },
    arma() { m = { t: [], ms: [], js: [], rd: [], ll: [], tr: [], oc: [] }; tIni = performance.now(); estado = "calentando"; resultado = null; },
    para() { estado = "parado"; m = null; },
    // intervalo, js, rd en ms; info: renderer.info (se lee con RenderPuro); oculta: la pestaña no se veía
    fotograma(intervalo, js, rd, info, oculta) {
      if (estado !== "calentando" && estado !== "midiendo") return;
      const t = (performance.now() - tIni) / 1000;
      if (intervalo > 0) {   // el primer fotograma tras armar no tiene anterior
        m.t.push(t); m.ms.push(intervalo); m.js.push(js); m.rd.push(rd); m.oc.push(oculta ? 1 : 0);
        m.ll.push(RenderPuro.llamadas(info)); m.tr.push(RenderPuro.triangulos(info));
      }
      if (estado === "calentando" && t >= calent) estado = "midiendo";
      if (t >= calent + seg) { resultado = MideEst.calcula(m, calent, seg); estado = "hecho"; m = null; if (alTerminar) alTerminar(resultado); }
    },
  };
  return api;
}

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const sn = v => (v === true ? "sí" : v === false ? "no" : "n/d");

/** El texto plano para pegar en el chat. c = { fecha, modo, renderizador, p, plan, sonda, sesion, ua, vr } */
export function texto(e, c) {
  const L = [], p = c.p;
  L.push("Humo multiview (F2b) · " + c.fecha);
  L.push("Modo: " + p.modo + " · " + c.renderizador + " · multiview pedido " + sn(p.mv) + (p.modo === "nuevo" ? " · DirectRenderPipeline " + sn(p.directo) : ""));
  L.push("Caso: n=" + p.n + " llamadas por ojo · tri=" + p.tri + " por ojo · msaa " + sn(p.msaa) + " · escala " + p.escala + " · foveación " + p.fov);
  L.push("Escena (esperado por ojo): " + c.plan.llamadas + " llamadas + 1 del panel · " + c.plan.triangulos + " triángulos");
  L.push("Aparato: " + (c.vr ? "VR" : "pantalla") + " · " + MideEst.resumeUA(c.ua) + (c.sesion && c.sesion.frecuencia ? " · " + c.sesion.frecuencia + " Hz" : ""));
  if (c.sesion) L.push("Sesión XR: multiview activo " + sn(c.sesion.multiview) + " · capa " + (c.sesion.capa || "n/d") + (c.sesion.capas != null ? " (textureArrayLength " + c.sesion.capas + ")" : "") +
    " · foveación de la capa " + (c.sesion.foveacion == null ? "n/d" : c.sesion.foveacion));
  const s = c.sonda || {};
  L.push("Sonda: WebGL2 " + sn(s.webgl2) + " · OVR_multiview2 " + sn(s.ovr2) + " (con MSAA " + sn(s.ovr2msaa) + ") · OCULUS_multiview " + sn(s.oculus) + " (con MSAA " + sn(s.oculusMsaa) + ")" +
    " · MAX_VIEWS_OVR " + (s.maxViews == null ? "n/d" : s.maxViews) + " · createProjectionLayer " + sn(s.capasXR) + " · antialias del contexto " + sn(s.antialias));
  if (!e) { L.push("Sin medida."); return L.join("\n"); }
  L.push(e.n + " fotogramas en " + c.seg + " s (tras " + c.calent + " s de calentamiento)" + (e.descartados.ocultos ? " · descartados por pestaña oculta " + e.descartados.ocultos : ""));
  L.push("Intervalo (ms): mediana " + f1(e.ms.mediana) + " · p95 " + f1(e.ms.p95) + " · p99 " + f1(e.ms.p99) + " · peor " + f1(e.ms.peor));
  L.push("JS por fotograma (ms): mediana " + f1(e.js.mediana) + " · p95 " + f1(e.js.p95) + " · peor " + f1(e.js.peor));
  if (e.rd) L.push("  de ellos, renderer.render() (ms): mediana " + f1(e.rd.mediana) + " · p95 " + f1(e.rd.p95) + " · peor " + f1(e.rd.peor));
  if (e.ll || e.tr) L.push("Por fotograma (mediana, renderer.info, los dos ojos): " + Math.round(e.ll.mediana) + " llamadas · " + Math.round(e.tr.mediana) + " triángulos");
  L.push("Por encima de 13,9 ms: " + e.sobre + " (" + f1(e.pctSobre) + " %) · p95 ≤ 13,9 ms: " + sn(e.ms.p95 <= 13.9));
  return L.join("\n");
}

/** La sonda del multiview sobre el contexto WebGL del renderizador (sin tocar el estado de dibujo) */
export function sonda(gl) {
  const o = { webgl2: null, ovr2: null, ovr2msaa: null, oculus: null, oculusMsaa: null, maxViews: null, capasXR: null, antialias: null };
  try { o.capasXR = typeof XRWebGLBinding !== "undefined" && "createProjectionLayer" in XRWebGLBinding.prototype; } catch (e) { /* sin WebXR */ }
  if (!gl) return o;
  try {
    o.webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const a = gl.getExtension("OVR_multiview2"), b = gl.getExtension("OCULUS_multiview");
    o.ovr2 = !!a; o.ovr2msaa = !!(a && typeof a.framebufferTextureMultisampleMultiviewOVR === "function");
    o.oculus = !!b; o.oculusMsaa = !!(b && typeof b.framebufferTextureMultisampleMultiviewOVR === "function");
    if (a) o.maxViews = gl.getParameter(a.MAX_VIEWS_OVR);
    const at = gl.getContextAttributes(); o.antialias = at ? !!at.antialias : null;
  } catch (e) { console.warn("sonda:", e); }
  return o;
}
