  // ---- escena
  var lienzo = $("lienzo"), visor = $("visor");
  var renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.5, Math.max(5000, EXT * 4));
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.95); scene.add(hemi);
  var sol = new THREE.DirectionalLight(0xfff0d0, 0.55); sol.position.set(-120, 160, 90); scene.add(sol);
  function colorCss(v) { var c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return new THREE.Color(c || "#888"); }
  function pintaFondo() { var c = colorCss("--sky"); scene.background = c; scene.fog = new THREE.Fog(c, FOG0, FOG1); pintaFondoTiempo(); }
  pintaFondo();
  new MutationObserver(pintaFondo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintaFondo);

  var exag = 1, modo = "nube", calidad = 1;

