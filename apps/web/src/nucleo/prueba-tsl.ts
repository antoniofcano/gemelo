// Compilar en Node, sin GPU, el grafo de nodos de una variante TSL (A4-0, preparación de MU6). Solo lo importan los *.test.ts: no es parte del motor ni
// del paquete (no importa three: three/webgpu y three/tsl entran por argumento, como en la fábrica).
//
// Qué hace: monta lo mínimo de un renderizador (la biblioteca de nodos, la niebla, las luces, la cámara) y pide a los constructores de three
// (WGSLNodeBuilder, el del backend WebGPU, y GLSLNodeBuilder, el del backend WebGL del WebGPURenderer) que construyan el material como lo haría
// Nodes._createNodeBuilder en el primer dibujo. Eso evalúa cada Fn, infiere los tipos, resuelve atributos, varyings y uniformes y escribe el texto del
// sombreador: caza los errores que con un NodeMaterial recién creado no salen (un nodo mal encadenado, un tipo que no casa, un atributo que no existe,
// un Fn que lanza). Los avisos y errores de three por consola durante la construcción se recogen y cuentan como fallo.
// Qué NO hace (HONESTIDAD): no valida el WGSL ni el GLSL con un compilador de verdad (Tint, naga o el del controlador): un sombreador que se escribe bien
// pero no lo acepta la tarjeta solo lo destapa el navegador (MU6, banco). Ni dibuja: las capturas clásico frente a TSL son de MU6.
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export interface NodosPrueba { W: N; T: N }
/** three/webgpu y three/tsl de verdad (por variable: three no trae tipos y así no entra en el grafo de dependency-cruiser). */
export async function cargaNodos(): Promise<NodosPrueba> {
  const rutaW = "three/webgpu", rutaT = "three/tsl";
  const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
  return { W, T };
}

export interface OpcCompila {
  /** el objeto que dibuja el material: una malla (por defecto), puntos, líneas, una malla instanciada (con `instancias`) o un sprite */
  objeto?: "malla" | "puntos" | "lineas" | "instanciada" | "sprite" | "lote";
  /** la geometría (por defecto, una caja con posición, normal y uv; para puntos y líneas, la misma) */
  geometria?: N;
  /** atributos que añadir a la geometría: nombre → [tamaño del elemento, instanciado] (con datos de ceros) */
  atributos?: Record<string, [number, boolean?]>;
  /** cuántas instancias (malla instanciada) */
  instancias?: number;
  /** la niebla de la escena (por defecto, sí, como el exterior) */
  niebla?: boolean;
  /** solo uno de los dos constructores (por defecto, los dos) */
  solo?: "wgsl" | "glsl";
  /** el objeto ya hecho (p. ej. un Line2 o un BatchedMesh): manda sobre `objeto` */
  hecho?: N;
}
export interface Compilado {
  wgsl: { vertice: string; fragmento: string }; glsl: { vertice: string; fragmento: string }; avisos: string[];
  /** lo que haría NodeFrame antes de cada dibujo: el updateBefore() y el update() de cada nodo que los pide (los dos constructores) */
  actualiza(): void;
  /** las texturas que leería el sombreador WGSL ahora mismo (el value de cada TextureNode que acabó como uniforme), por orden */
  texturas(): N[];
}

function renderizadorMinimo(W: N, T: N, webgpu: boolean): N {
  const lib = new W.StandardNodeLibrary();
  return {
    library: lib, contextNode: T.context(), lighting: { enabled: true, createNode: (l: N) => new W.LightsNode().setLights(l) },
    toneMapping: W.NoToneMapping, toneMappingExposure: 1, outputColorSpace: W.SRGBColorSpace, currentColorSpace: W.SRGBColorSpace,
    getRenderTarget() { return null; }, getOutputRenderTarget() { return null; }, getColorBufferType() { return W.UnsignedByteType; }, getMRT() { return null; },
    coordinateSystem: webgpu ? W.WebGPUCoordinateSystem : W.WebGLCoordinateSystem, inspector: new W.InspectorBase(),
    backend: { isWebGPUBackend: webgpu, isWebGLBackend: !webgpu, capabilities: { getUniformBufferLimit() { return 65536; } }, extensions: { has() { return false; }, get() { return null; } },
      utils: { getTextureSampleData() { return { primarySamples: 1 }; } } },
    debug: { onNodeBuilderCreated: null, getShaderAsync: null, diagnostics: { keywords: false } }, nodes: { library: lib },
    logarithmicDepthBuffer: false, reversedDepthBuffer: false, shadowMap: { enabled: false }, samples: 0, currentSamples: 0, highPrecision: false, xr: { enabled: false },
    depth: true, stencil: false, info: {}, _currentRenderContext: null,
    hasFeature() { return false; }, hasCompatibility() { return false; }, getCanvasTarget() { return null; }
  };
}

function objetoDe(W: N, material: N, o: OpcCompila): N {
  if (o.hecho) return o.hecho;
  const geo = o.geometria || new W.BoxGeometry(1, 1, 1);
  for (const [nom, [tam, inst]] of Object.entries(o.atributos || {})) {
    const n = inst ? (o.instancias || 4) : geo.attributes.position.count, C = inst ? W.InstancedBufferAttribute : W.BufferAttribute;
    geo.setAttribute(nom, new C(new Float32Array(n * tam), tam));
  }
  switch (o.objeto) {
    case "puntos": return new W.Points(geo, material);
    case "lineas": return new W.LineSegments(geo, material);
    case "sprite": return new W.Sprite(material);
    case "instanciada": { const m = new W.InstancedMesh(geo, material, o.instancias || 4); m.instanceColor = new W.InstancedBufferAttribute(new Float32Array((o.instancias || 4) * 3), 3); return m; }
    default: return new W.Mesh(geo, material);
  }
}

/** Construye el material con los dos constructores de three (WGSL y GLSL) y devuelve el texto de sus sombreadores. Lanza si three lanza o avisa. */
export function compila(n: NodosPrueba, material: N, o: OpcCompila = {}): Compilado {
  const { W, T } = n, avisos: string[] = [];
  const escena = new W.Scene(), cam = new W.PerspectiveCamera(60, 1, 0.1, 1000), obj = objetoDe(W, material, o);
  cam.position.set(0, 2, 5); cam.updateMatrixWorld();
  escena.add(obj); escena.add(new W.HemisphereLight()); const sol = new W.DirectionalLight(); escena.add(sol);
  const luces = new W.LightsNode().setLights([escena.children[1], sol]);
  const fog = o.niebla === false ? null : T.fog(T.color(0xb0c0d0), T.rangeFogFactor(T.float(10), T.float(500)));
  const constructores: N[] = [];
  const out: Compilado = {
    wgsl: { vertice: "", fragmento: "" }, glsl: { vertice: "", fragmento: "" }, avisos,
    actualiza() {
      const g = globalThis as unknown as Record<string, unknown>; if (typeof g["ImageBitmap"] === "undefined") g["ImageBitmap"] = class ImageBitmap {};   // TextureNode.update lo mira (flipY)
      for (const b of constructores) for (const nodo of b.updateBeforeNodes) nodo.updateBefore({ object: obj, material, camera: cam, scene: escena, renderer: b.renderer, frameId: 1 });
      for (const b of constructores) for (const nodo of b.updateNodes) nodo.update({ object: obj, material, camera: cam, scene: escena, renderer: b.renderer, frameId: 1 }); },
    texturas() {
      const b = constructores[0], vistas = new Set<N>(), r: N[] = [];
      for (const etapa of ["vertex", "fragment"]) for (const u of b.uniforms[etapa]) { const nd = u.node && (u.node.node || u.node); if (nd && nd.isTextureNode && !vistas.has(nd)) { vistas.add(nd); r.push(nd.value); } }
      return r;
    }
  };
  const consola = console as unknown as Record<string, (...a: unknown[]) => void>, guardados = { warn: consola["warn"], error: consola["error"] };
  consola["warn"] = (...a: unknown[]) => { avisos.push(a.map(String).join(" ")); };
  consola["error"] = (...a: unknown[]) => { avisos.push(a.map(String).join(" ")); };
  try {
    for (const [clave, B] of [["wgsl", W.WGSLNodeBuilder], ["glsl", W.GLSLNodeBuilder]] as const) {
      if (o.solo && o.solo !== clave) continue;
      const b = new B(obj, renderizadorMinimo(W, T, clave === "wgsl"));
      b.scene = escena; b.material = material; b.camera = cam; b.context.material = material;
      b.lightsNode = luces; b.environmentNode = null; b.fogNode = material.fog ? fog : null; b.clippingContext = null;
      b.build(); constructores.push(b);
      out[clave] = { vertice: String(b.vertexShader || ""), fragmento: String(b.fragmentShader || "") };
    }
  } finally { consola["warn"] = guardados.warn as (...a: unknown[]) => void; consola["error"] = guardados.error as (...a: unknown[]) => void; }
  if (avisos.length) throw new Error("three avisó al construir los nodos:\n" + avisos.join("\n"));
  if ((o.solo !== "glsl" && !out.wgsl.fragmento) || (o.solo !== "wgsl" && !out.glsl.fragmento)) throw new Error("los constructores no escribieron el sombreador");
  return out;
}
