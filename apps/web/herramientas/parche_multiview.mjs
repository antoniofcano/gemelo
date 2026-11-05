// Parches de super-three 0.185.0 en la build de VR (ADR-0031, doc/sistema/MULTIVIEW.md §«Texturas en negro»). Con multiview encendido, en el Quest 3
// (2026-11-05, consola remota de Antonio) NINGÚN material de three compilaba (Lambert, Basic, Standard, Sprite, Points, Line…): terreno y olivos en
// negro, mandos y rótulos invisibles; solo se veían los sombreadores propios sin <common> (lindes, haces, cielo). Tres fallos, los tres de super-three:
//  1. textures: render() aplaza las subidas de texturas (setDeferTextureUploads(true)) y nadie llama a runDeferredUploads() → se suben justo tras el dibujo.
//  2. nombres: el multiview hace «#define viewMatrix viewMatrices[VIEW_ID]», y el código común de three tiene funciones con un PARÁMETRO llamado
//     viewMatrix (transformNormalByInverseViewMatrix, transformDirectionByInverseViewMatrix, getIBLVolumeRefraction): el parámetro pasa a ser un array
//     de tamaño no constante y el sombreador no compila («array size must be a constant integer expression»). Se renombra el parámetro; todas las
//     llamadas de three le pasan viewMatrix, así que el resultado es el mismo con y sin multiview.
//  3. extensiones: el prefijo multiview pone «layout(num_views…) in;» ANTES de las «#extension» del material (GL_ANGLE_multi_draw de BatchedMesh),
//     y en ESSL3 toda #extension va antes de cualquier otra cosa: se colocan detrás de la del multiview.
// Cada trozo debe aparecer exactamente una vez: si super-three cambia, el build falla aquí (no se parchea a ciegas) y hay que revisar si el fallo sigue.
const T = "\t\t\t\t\t\t";
export const PARCHES = [
  {
    nombre: "texturas aplazadas",
    original: "textures.setDeferTextureUploads( true );\n\n" + T + "renderScene( currentRenderList, scene, camera, camera.cameras[ 0 ].viewport );\n",
    nuevo: "textures.setDeferTextureUploads( true );\n\n" + T + "renderScene( currentRenderList, scene, camera, camera.cameras[ 0 ].viewport );\n\n" + T + "textures.setDeferTextureUploads( false ); textures.runDeferredUploads();   // gemelo: parche_multiview.mjs\n",
  },
  {
    nombre: "parámetro viewMatrix de transformNormalByInverseViewMatrix",
    original: "vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {\\n\\treturn normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );",
    nuevo: "vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 matrix ) {\\n\\treturn normalize( ( vec4( normal, 0.0 ) * matrix ).xyz );",
  },
  {
    nombre: "parámetro viewMatrix de transformDirectionByInverseViewMatrix",
    original: "vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {\\n\\treturn normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );",
    nuevo: "vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 matrix ) {\\n\\treturn normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );",
  },
  {
    // el cuerpo sigue usando viewMatrix: el uniforme (o, con multiview, la del ojo), que es lo que la única llamada le pasa
    nombre: "parámetro viewMatrix de getIBLVolumeRefraction",
    original: "const in mat4 modelMatrix,\\n\\t\\tconst in mat4 viewMatrix, const in mat4 projMatrix,",
    nuevo: "const in mat4 modelMatrix,\\n\\t\\tconst in mat4 viewMatrixIBL, const in mat4 projMatrix,",
  },
  {
    nombre: "orden de las #extension en el prefijo multiview",
    original: "\t\t\t\t'#extension GL_OVR_multiview : require',\n\t\t\t\t'layout(num_views = ' + numMultiviewViews + ') in;',\n\t\t\t\t'#define VIEW_ID gl_ViewID_OVR'\n\t\t\t].join( '\\n' ) + '\\n' + prefixVertex;",
    nuevo: "\t\t\t\t'#extension GL_OVR_multiview : require',\n\t\t\t\tcustomVertexExtensions,   // gemelo: parche_multiview.mjs (las #extension, antes del layout)\n\t\t\t\t'layout(num_views = ' + numMultiviewViews + ') in;',\n\t\t\t\t'#define VIEW_ID gl_ViewID_OVR'\n\t\t\t].join( '\\n' ) + '\\n' + ( customVertexExtensions ? prefixVertex.replace( customVertexExtensions, '' ) : prefixVertex );",
  },
];
const FICHERO = /[\\/]super-three[\\/]build[\\/]three\.module\.js$/;

// el texto parcheado, o un error si algún trozo esperado no está exactamente una vez
export function parcheaMultiview(code) {
  if (!code.includes("function runDeferredUploads(")) throw new Error("parche_multiview: super-three ya no trae runDeferredUploads: revisa el parche");
  for (const p of PARCHES) {
    const n = code.split(p.original).length - 1;
    if (n !== 1) throw new Error("parche_multiview: «" + p.nombre + "» aparece " + n + " veces en super-three (se esperaba 1): revisa apps/web/herramientas/parche_multiview.mjs");
    code = code.replace(p.original, () => p.nuevo);
  }
  return code;
}

// compatibilidad con la prueba y el build de la primera versión del parche
export const ORIGINAL = PARCHES[0].original;

// el plugin de Vite: solo toca el three.module.js de super-three (la build de pantalla resuelve «three» a three y no pasa por aquí)
export function multiviewSubeTexturas() {
  return {
    name: "gemelo-multiview-sube-texturas",
    transform(code, id) {
      if (!FICHERO.test(id.split("?")[0])) return null;
      return { code: parcheaMultiview(code), map: null };
    },
  };
}
