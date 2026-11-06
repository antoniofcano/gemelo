// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: lienzo, visor, renderer, scene, camera, SRGB, LUZ_SOL, LUZ_CIELO, hemi, sol, texColor, colorVertSRGB, colorCss, Estado
// Consume: 01_datos ($), 01a_aparato (Aparato), 02f_xr_perillas (XrPerillas), 02h_render (Render)
// ===============================================================================
  // ---- escena
  var lienzo = $("lienzo"), visor = $("visor");
  // F2a (doc/sistema/MULTIVIEW.md, ADR-0031): en la build de VR (super-three) se pide el multiview del WebGLRenderer clásico, `multiviewStereo`, salvo con la perilla xrmv a 0 (02f);
  // super-three solo lo enciende en una sesión XR con capas de proyección y OCULUS_multiview (29_vr pide «layers»). En la build de pantalla no se pasa nada:
  // el renderer se crea exactamente como siempre
  var opcionesRd = { canvas: lienzo, antialias: XrPerillas.aa }, MV = XrPerillas.multiview(Render.build);   // el MSAA lo decide la perilla de pruebas VR (02f)
  if (MV.activo) opcionesRd.multiviewStereo = true;
  if (MV.ignorado) console.warn("VR: ?" + MV.ignorado.param + "=" + MV.ignorado.valor + " ignorado: " + MV.ignorado.motivo);
  var renderer = new THREE.WebGLRenderer(opcionesRd);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  Aparato.enlaza({ vr: function () { return renderer.xr.isPresenting; }, gl: function () { return renderer.getContext(); }, sesion: function () { return renderer.xr.getSession(); } });   // AG-0.3: el aparato mide en este contexto
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1);   // MU2-7: el near/far, el fondo, la niebla y qué luces cuelgan son del Ambiente del mundo activo (src/nucleo/ambiente.ts; el del exterior, src/mundos/exterior.ts), que el gestor de 90_final aplica al entrar
  Render.enlaza({ rd: renderer, escena: scene, camara: camera, camaraXr: function () { return renderer.xr.isPresenting ? renderer.xr.getCamera() : null; } });   // MUNDOS §6: Render.info(), .memoria() y .compila()
  // Color y luz modernos (three r152 y r155, ADR-0016): el motor calcula la luz en sRGB lineal y la salida se codifica en sRGB (outputColorSpace).
  // Convenio del motor: los colores escritos a mano en JS o en GLSL (por vértice, por instancia, literales de los sombreadores, multiplicadores de color)
  // son números «tal como se ven», en sRGB, y se pasan a lineal donde entran en la luz: Color.setRGB(r, g, b, SRGB), texColor(), ot_lin() o sRGBTransferEOTF().
  // Lo que se toca DESPUÉS de colorspace_fragment (sombra de nubes, escarcha, capa NDVI, modo Ortofoto) ya está en sRGB y se deja como está.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AG-2.5: ?tono=agx|aces|neutral (doc/sistema/TONE-MAPPING.md). Sin la perilla (o «neutro») no se toca nada: three deja NoToneMapping, como siempre. Igual en las dos builds (three y super-three tienen las cuatro constantes)
  if (Render.tono.tono !== "neutro" && THREE[Render.tono.constante] !== undefined) { renderer.toneMapping = THREE[Render.tono.constante]; renderer.toneMappingExposure = Render.tono.expo; }
  var SRGB = THREE.SRGBColorSpace;
  // Luces físicas (r155): la intensidad ya no lleva el factor π implícito de r128, que aquí se devuelve. Encima, la calibración a ojo con capturas (ADR-0016):
  // con la luz en lineal, la misma intensidad aclara las sombras y apaga lo soleado; el sol sube un 50 % y el cielo un 10 % para que la tierra al sol
  // y a la sombra quede cerca de como se veía con r128 sin quemarse
  var LUZ_SOL = Math.PI * 1.5, LUZ_CIELO = Math.PI * 1.1;
  // las luces del exterior (las mueven 11_sol y 15_tiempo); no se cuelgan aquí: las cuelga su Ambiente al entrar en el exterior y las descuelga el de otro mundo
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.95 * LUZ_CIELO);
  var sol = new THREE.DirectionalLight(0xfff0d0, 0.55 * LUZ_SOL); sol.position.set(-120, 160, 90);
  function texColor(t) { t.colorSpace = SRGB; return t; }   // una textura que es color (canvas pintado a mano): three la pasa a lineal al leerla
  // colores por vértice o por instancia escritos en sRGB: el sombreador de vértices los pasa a lineal al leerlos (sRGBTransferEOTF solo existe en el de fragmentos)
  var GLSL_LIN = "vec3 ot_lin(vec3 c){ return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }\n";
  function colorVertSRGB(sh) {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_LIN)
      .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif");
  }
  function colorCss(v) { var c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return new THREE.Color(c || "#888"); }

  var Estado = Nucleo.creaEstado();   // A1-13 (MU1-9, MUNDOS §9.4 fila 7): exag, modo y calidad, el estado que reescriben varios módulos, en un objeto (apps/web/src/nucleo/estado.ts)

