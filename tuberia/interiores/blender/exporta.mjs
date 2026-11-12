// Remata el glb que deja exporta.py para que cumpla contratos/mundo-interior.md, con @gltf-transform (sin código propio de glTF):
//   node exporta.mjs <mundo.glb>
//   - todos los materiales pasan a KHR_materials_unlit: la luz ya va horneada en el color base (o en COLOR_0 las hojas);
//   - los materiales con textura con alfa (las hojas) van en MASK con corte 0,5 y a dos caras; el vidrio, en BLEND;
//   - COLOR_0 se queda solo en las hojas (lleva su luz); en lo demás se quita;
//   - quita lo que no se usa y lo repetido; no comprime nada (v1 del contrato no admite meshopt, Draco ni KTX2).
// Escribe el glb en su sitio y un resumen por la salida. Después: node tuberia/interiores/valida.js <carpeta>.
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs';

export async function remata(bytes) {
  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  const doc = await io.readBinary(bytes);
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const resumen = { materiales: 0, mask: [], blend: [] };
  for (const m of doc.getRoot().listMaterials()) {
    m.setExtension('KHR_materials_unlit', unlit.createUnlit());
    m.setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]);
    m.setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    resumen.materiales++;
    if (/^vidrio/.test(m.getName())) { m.setAlphaMode('BLEND').setDoubleSided(true); resumen.blend.push(m.getName()); }
    else if (m.getAlphaMode() !== 'OPAQUE' || /^hojas/.test(m.getName())) { m.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true); resumen.mask.push(m.getName()); }
  }
  // COLOR_0 solo en las hojas (ahí lleva su luz): en lo horneado multiplicaría otra vez el color de vértice que ya va en la textura
  for (const malla of doc.getRoot().listMeshes()) for (const p of malla.listPrimitives()) {
    const m = p.getMaterial();
    if (p.getAttribute('COLOR_0') && !(m && m.getAlphaMode() === 'MASK')) { p.setAttribute('COLOR_0', null); resumen.sin_color = (resumen.sin_color || 0) + 1; }
  }
  await doc.transform(prune(), dedup());
  resumen.texturas = doc.getRoot().listTextures().length;
  return { bytes: await io.writeBinary(doc), resumen };
}

if (process.argv[1] && process.argv[1].endsWith('exporta.mjs')) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: node exporta.mjs <mundo.glb>'); process.exit(1); }
  const antes = fs.statSync(ruta).size;
  const { bytes, resumen } = await remata(new Uint8Array(fs.readFileSync(ruta)));
  fs.writeFileSync(ruta, bytes);
  console.log('REMATA ' + JSON.stringify({ ...resumen, mb_antes: +(antes / 2 ** 20).toFixed(1), mb: +(bytes.length / 2 ** 20).toFixed(1) }));
}
