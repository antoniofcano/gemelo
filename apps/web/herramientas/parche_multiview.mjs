// Parche de super-three 0.185.0 en la build de VR (ADR-0031, doc/sistema/MULTIVIEW.md §«Texturas en negro»).
// Con multiview, WebGLRenderer.render() llama a textures.setDeferTextureUploads(true) antes de dibujar los dos ojos de una vez, pero NADIE llama
// después a textures.runDeferredUploads() ni vuelve a poner la bandera en false: desde el primer fotograma en VR, toda textura nueva o con needsUpdate
// se queda en la cola sin subir y se muestrea vacía (negro). Lo vio Antonio en el Quest 3 (2026-11-05): terreno y olivos en negro; lindes, haces y
// cielo (sin textura) bien. El parche sube lo aplazado justo después del dibujo multiview, en el mismo render(). Si super-three cambia ese trozo,
// el build falla aquí (no se parchea a ciegas): hay que mirar si el fallo sigue y quitar o adaptar el parche.
export const ORIGINAL = "textures.setDeferTextureUploads( true );\n\n\t\t\t\t\t\trenderScene( currentRenderList, scene, camera, camera.cameras[ 0 ].viewport );\n";
export const PARCHEADO = ORIGINAL + "\n\t\t\t\t\t\ttextures.setDeferTextureUploads( false ); textures.runDeferredUploads();   // gemelo: parche_multiview.mjs\n";
const FICHERO = /[\\/]super-three[\\/]build[\\/]three\.module\.js$/;

// el texto parcheado, o un error si el trozo esperado no está exactamente una vez
export function parcheaMultiview(code) {
  const n = code.split(ORIGINAL).length - 1;
  if (n !== 1) throw new Error("parche_multiview: el trozo de setDeferTextureUploads de super-three aparece " + n + " veces (se esperaba 1): revisa apps/web/herramientas/parche_multiview.mjs");
  if (!code.includes("function runDeferredUploads(")) throw new Error("parche_multiview: super-three ya no trae runDeferredUploads: revisa el parche");
  return code.replace(ORIGINAL, PARCHEADO);
}

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
