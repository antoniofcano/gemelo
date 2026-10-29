// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: lienzo, visor, renderer, scene, camera, SRGB, LUZ_SOL, LUZ_CIELO, hemi, sol, texColor, colorVertSRGB, colorCss, exag, modo, calidad
// Consume: 01_datos ($, EXT, FOG0, FOG1), 05_nube (nube), 15_tiempo (pintaFondoTiempo)
// ===============================================================================
  // ---- escena
  var lienzo = $("lienzo"), visor = $("visor");
  var renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.5, Math.max(5000, EXT * 4));
  // Color y luz modernos (three r152 y r155, ADR-0016): el motor calcula la luz en sRGB lineal y la salida se codifica en sRGB (outputColorSpace).
  // Convenio del motor: los colores escritos a mano en JS o en GLSL (por vértice, por instancia, literales de los sombreadores, multiplicadores de color)
  // son números «tal como se ven», en sRGB, y se pasan a lineal donde entran en la luz: Color.setRGB(r, g, b, SRGB), texColor(), ot_lin() o sRGBTransferEOTF().
  // Lo que se toca DESPUÉS de colorspace_fragment (sombra de nubes, escarcha, capa NDVI, modo Ortofoto) ya está en sRGB y se deja como está.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  var SRGB = THREE.SRGBColorSpace;
  // Luces físicas (r155): la intensidad ya no lleva el factor π implícito de r128, que aquí se devuelve. Encima, la calibración a ojo con capturas (ADR-0016):
  // con la luz en lineal, la misma intensidad aclara las sombras y apaga lo soleado; el sol sube un 50 % y el cielo un 10 % para que la tierra al sol
  // y a la sombra quede cerca de como se veía con r128 sin quemarse
  var LUZ_SOL = Math.PI * 1.5, LUZ_CIELO = Math.PI * 1.1;
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.95 * LUZ_CIELO); scene.add(hemi);
  var sol = new THREE.DirectionalLight(0xfff0d0, 0.55 * LUZ_SOL); sol.position.set(-120, 160, 90); scene.add(sol);
  function texColor(t) { t.colorSpace = SRGB; return t; }   // una textura que es color (canvas pintado a mano): three la pasa a lineal al leerla
  // colores por vértice o por instancia escritos en sRGB: el sombreador de vértices los pasa a lineal al leerlos (sRGBTransferEOTF solo existe en el de fragmentos)
  var GLSL_LIN = "vec3 ot_lin(vec3 c){ return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }\n";
  function colorVertSRGB(sh) {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_LIN)
      .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif");
  }
  function colorCss(v) { var c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return new THREE.Color(c || "#888"); }
  function pintaFondo() { var c = colorCss("--sky"); scene.background = c; scene.fog = new THREE.Fog(c, FOG0, FOG1); pintaFondoTiempo(); }
  pintaFondo();
  new MutationObserver(pintaFondo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintaFondo);

  var exag = 1, modo = "nube", calidad = 1;

