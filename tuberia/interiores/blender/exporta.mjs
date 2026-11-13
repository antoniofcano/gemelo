// Remata el glb que deja exporta.py para que cumpla contratos/mundo-interior.md, con @gltf-transform (sin código propio de glTF):
//   node exporta.mjs <mundo.glb> [--luz <luz_aparte.json>]
//   - todos los materiales pasan a KHR_materials_unlit: la luz ya va horneada en el color base (o en COLOR_0 las hojas);
//   - los materiales con textura con alfa (las hojas) van en MASK con corte 0,5 y a dos caras; el vidrio, en BLEND;
//   - COLOR_0 se queda solo en las hojas (lleva su luz); en lo demás se quita;
//   - quita lo que no se usa y lo repetido; no comprime nada (v1 del contrato no admite meshopt, Draco ni KTX2).
// Con --luz (exporta.py --modo aparte, contrato v1.2 §1c): cada material del JSON lleva su mapa de luz en occlusionTexture con
// texCoord 1 (la imagen RGB de verdad, el JPEG del atlas: el exportador de Blender solo pone una de oclusión); es unlit salvo
// los de las máquinas con luz propia («unlit»: false), que guardan su metal y su rugosidad; y COLOR_0 (el envejecido, que
// multiplica al albedo) se queda en todos.
// Escribe el glb en su sitio y un resumen por la salida. Después: node tuberia/interiores/valida.js <carpeta>.
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

export async function remata(bytes, luz = null, leeFichero = f => fs.readFileSync(f)) {
  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  const doc = await io.readBinary(bytes);
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const resumen = { materiales: 0, mask: [], blend: [], mapas: 0, con_luz: [] };
  const imagenes = new Map();
  for (const m of doc.getRoot().listMaterials()) {
    const l = luz && luz[m.getName()];
    resumen.materiales++;
    if (l) {
      if (!imagenes.has(l.mapa)) imagenes.set(l.mapa, doc.createTexture(path.basename(l.mapa)).setImage(new Uint8Array(leeFichero(l.mapa))).setMimeType('image/jpeg'));
      m.setOcclusionTexture(imagenes.get(l.mapa)); m.getOcclusionTextureInfo().setTexCoord(1); resumen.mapas++;
      m.setNormalTexture(null).setEmissiveFactor([0, 0, 0]).setEmissiveTexture(null);
      if (l.unlit === false) { resumen.con_luz.push(m.getName()); m.setExtension('KHR_materials_unlit', null); continue; }
      m.setExtension('KHR_materials_unlit', unlit.createUnlit()).setMetallicFactor(0).setRoughnessFactor(1).setMetallicRoughnessTexture(null);
      continue;
    }
    m.setExtension('KHR_materials_unlit', unlit.createUnlit());
    m.setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]);
    m.setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    if (/^vidrio/.test(m.getName())) { m.setAlphaMode('BLEND').setDoubleSided(true); resumen.blend.push(m.getName()); }
    else if (m.getAlphaMode() !== 'OPAQUE' || /^hojas/.test(m.getName())) { m.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true); resumen.mask.push(m.getName()); }
  }
  // COLOR_0 solo en las hojas (ahí lleva su luz): en lo horneado multiplicaría otra vez el color de vértice que ya va en la textura.
  // Con la luz aparte, el color de vértice es parte del albedo y se queda.
  if (!luz) for (const malla of doc.getRoot().listMeshes()) for (const p of malla.listPrimitives()) {
    const m = p.getMaterial();
    if (p.getAttribute('COLOR_0') && !(m && m.getAlphaMode() === 'MASK')) { p.setAttribute('COLOR_0', null); resumen.sin_color = (resumen.sin_color || 0) + 1; }
  }
  // los materiales propios de una máquina (base__maq_<id>, maquinas_def.py) no se juntan: una correa que corre desplaza el
  // mapa de SU material, y dos correas iguales con un solo material correrían a la misma velocidad. dedup compara los extras.
  for (const m of doc.getRoot().listMaterials()) if (/__maq_/.test(m.getName())) m.setExtras({ ...m.getExtras(), gemelo_material: m.getName() });
  await doc.transform(prune(), dedup());
  // dedup junta mapas iguales y deja la ranura con texCoord 0: se vuelve a poner
  if (luz) for (const m of doc.getRoot().listMaterials()) if (luz[m.getName()] && m.getOcclusionTexture()) m.getOcclusionTextureInfo().setTexCoord(1);
  resumen.texturas = doc.getRoot().listTextures().length;
  return { bytes: await io.writeBinary(doc), resumen };
}

if (process.argv[1] && process.argv[1].endsWith('exporta.mjs')) {
  const ruta = process.argv[2], k = process.argv.indexOf('--luz');
  if (!ruta) { console.error('uso: node exporta.mjs <mundo.glb> [--luz <luz_aparte.json>]'); process.exit(1); }
  const luz = k > 0 ? JSON.parse(fs.readFileSync(process.argv[k + 1], 'utf8')) : null;
  const base = k > 0 ? path.dirname(process.argv[k + 1]) : '.';
  const antes = fs.statSync(ruta).size;
  const { bytes, resumen } = await remata(new Uint8Array(fs.readFileSync(ruta)), luz, f => fs.readFileSync(path.resolve(base, f)));
  fs.writeFileSync(ruta, bytes);
  console.log('REMATA ' + JSON.stringify({ ...resumen, mb_antes: +(antes / 2 ** 20).toFixed(1), mb: +(bytes.length / 2 ** 20).toFixed(1) }));
}
