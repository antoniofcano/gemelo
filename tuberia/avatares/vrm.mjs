// Lo que la tubería sabe de VRM (ADR-0020 §3): leer el `meta` de un GLB, decidir si su licencia deja servirlo desde nuestro servidor a cualquiera para una
// empresa, y las extensiones de VRM como «pasantes» de @gltf-transform (que no las conoce y las tiraría al leer/escribir).
//
// Los pasantes guardan el JSON de cada extensión tal cual y lo vuelven a escribir. Dos precauciones:
//  - las TEXTURAS de MToon sí son referencias del grafo de gltf-transform (si no, al redimensionar o reordenar las texturas el índice del JSON apuntaría a otra);
//  - los NODOS, MATERIALES y MALLAS que nombran VRMC_vrm / springBone / node_constraint / expresiones van por índice: valen mientras la tubería no borre,
//    funda ni reordene nodos, materiales ni mallas (no lo hace). `construye.mjs` lo comprueba al terminar (`verificaIndices`) y se niega si algo cambió.
import { Extension, ExtensionProperty, PropertyType, TextureInfo, TextureChannel } from "@gltf-transform/core";

// ---------------------------------------------------------------------------------------------------------------- GLB a nivel de bytes
/** Lee el JSON de un GLB (cabecera, trozo JSON). Devuelve {json, bin} (bin: Buffer o null). */
export function leeGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error("no es un GLB (falta «glTF» en la cabecera)");
  if (buf.readUInt32LE(4) !== 2) throw new Error("GLB de versión " + buf.readUInt32LE(4) + " (solo glTF 2.0)");
  let pos = 12, json = null, bin = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32LE(pos), tipo = buf.readUInt32LE(pos + 4), datos = buf.subarray(pos + 8, pos + 8 + len);
    if (tipo === 0x4e4f534a && json === null) json = JSON.parse(datos.toString("utf8"));
    else if (tipo === 0x004e4942 && bin === null) bin = datos;
    pos += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error("GLB sin trozo JSON");
  return { json, bin };
}

/** Empaqueta JSON y binario en un GLB (alineados a 4 bytes: JSON con espacios, BIN con ceros). */
export function empaquetaGlb(json, bin) {
  let j = Buffer.from(JSON.stringify(json), "utf8"); j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = bin ? Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]) : null;
  const total = 12 + 8 + j.length + (b ? 8 + b.length : 0), cab = Buffer.alloc(12);
  cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(total, 8);
  const tj = Buffer.alloc(8); tj.writeUInt32LE(j.length, 0); tj.writeUInt32LE(0x4e4f534a, 4);
  const partes = [cab, tj, j];
  if (b) { const tb = Buffer.alloc(8); tb.writeUInt32LE(b.length, 0); tb.writeUInt32LE(0x004e4942, 4); partes.push(tb, b); }
  return Buffer.concat(partes);
}

// ---------------------------------------------------------------------------------------------------------------- el meta y la licencia
const SPDX_VRM0 = { CC0: "CC0-1.0", CC_BY: "LicenseRef-CC-BY" };

/**
 * Lee el `meta` de un VRM (1.0: `extensions.VRMC_vrm.meta`; 0.x: `extensions.VRM.meta`) normalizado, o lanza si el fichero no es VRM.
 * No decide nada: `evaluaLicencia` lo hace.
 */
export function leeMeta(json) {
  const ext = json.extensions || {};
  if (ext.VRMC_vrm && ext.VRMC_vrm.meta) {
    const m = ext.VRMC_vrm.meta;
    return {
      version: "1.0", especificacion: ext.VRMC_vrm.specVersion || null, nombre: String(m.name || ""), autores: (m.authors || []).map(String),
      licenciaUrl: m.licenseUrl || null, permisoAvatar: m.avatarPermission || "onlyAuthor", usoComercial: m.commercialUsage || "personalNonProfit",
      redistribucion: m.allowRedistribution === true, modificacion: m.modification || "prohibited", credito: m.creditNotation || "required",
      textoCredito: [m.copyrightInformation, m.thirdPartyLicenses].filter(Boolean).join(" · ") || null, contacto: m.contactInformation || null,
      referencias: (m.references || []).map(String), otraLicenciaUrl: m.otherLicenseUrl || null, licenciaNombre: null
    };
  }
  if (ext.VRM && ext.VRM.meta) {
    const m = ext.VRM.meta;
    return {
      version: "0.x", especificacion: ext.VRM.specVersion || null, nombre: String(m.title || ""), autores: m.author ? [String(m.author)] : [],
      licenciaUrl: m.otherLicenseUrl || null, permisoAvatar: m.allowedUserName || "OnlyAuthor", usoComercial: m.commercialUssageName || "Disallow",
      // en 0.x la redistribución y la modificación van dentro del nombre de la licencia
      redistribucion: m.licenseName === "CC0" || m.licenseName === "CC_BY", modificacion: m.licenseName === "CC0" || m.licenseName === "CC_BY" ? "allowModificationRedistribution" : "prohibited",
      credito: m.licenseName === "CC0" ? "unnecessary" : "required", textoCredito: null, contacto: m.contactInformation || null,
      referencias: m.reference ? [String(m.reference)] : [], otraLicenciaUrl: m.otherPermissionUrl || null, licenciaNombre: m.licenseName || null
    };
  }
  throw new Error("no es un VRM (ni VRMC_vrm ni VRM en extensions)");
}

/**
 * ¿Puede entrar al catálogo? (ADR-0020 §3, para una empresa que sirve el fichero a cualquiera y lo optimiza)
 * VRM 1.0: avatarPermission = everyone, commercialUsage = corporation, allowRedistribution = true y modification = allowModificationRedistribution
 * (la tubería MODIFICA el fichero —lo optimiza— y lo REDISTRIBUYE). VRM 0.x: allowedUserName = Everyone, commercialUssageName = Allow y licenseName CC0 o CC_BY.
 * Devuelve {ok, motivos[]}: los motivos dicen cada condición que falla.
 */
export function evaluaLicencia(meta) {
  const motivos = [];
  if (!meta.nombre) motivos.push("el meta no trae nombre");
  if (!meta.autores.length) motivos.push("el meta no trae autor");
  if (meta.version === "1.0") {
    if (meta.permisoAvatar !== "everyone") motivos.push("avatarPermission = «" + meta.permisoAvatar + "» (debe ser «everyone»)");
    if (meta.usoComercial !== "corporation") motivos.push("commercialUsage = «" + meta.usoComercial + "» (debe ser «corporation»: Cano & Damas es una empresa)");
    if (!meta.redistribucion) motivos.push("allowRedistribution = false (se sirve desde nuestro servidor)");
    if (meta.modificacion !== "allowModificationRedistribution") motivos.push("modification = «" + meta.modificacion + "» (se optimiza y se redistribuye: debe ser «allowModificationRedistribution»)");
    if (!meta.licenciaUrl) motivos.push("el meta no trae licenseUrl");
  } else {
    if (meta.permisoAvatar !== "Everyone") motivos.push("allowedUserName = «" + meta.permisoAvatar + "» (debe ser «Everyone»)");
    if (meta.usoComercial !== "Allow") motivos.push("commercialUssageName = «" + meta.usoComercial + "» (debe ser «Allow»)");
    if (!SPDX_VRM0[meta.licenciaNombre]) motivos.push("licenseName = «" + meta.licenciaNombre + "» (solo CC0 o CC_BY)");
  }
  return { ok: motivos.length === 0, motivos };
}

/** Identificador SPDX declarado por el meta (solo VRM 0.x lo da con CC0/CC_BY); para 1.0 lo declara quien da de alta el avatar */
export const spdxDeMeta = meta => SPDX_VRM0[meta.licenciaNombre] || null;

/** Los huesos humanoides obligatorios de VRM 1.0 (y 0.x) que el motor (ADR-0020 §4) mueve; si falta uno, el avatar no sirve */
export const HUESOS_OBLIGATORIOS = ["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
/** Huesos humanoides declarados (nombre → índice de nodo) en 1.0 y 0.x */
export function huesos(json) {
  const ext = json.extensions || {};
  if (ext.VRMC_vrm) return Object.fromEntries(Object.entries(ext.VRMC_vrm.humanoid && ext.VRMC_vrm.humanoid.humanBones || {}).map(([k, v]) => [k, v.node]));
  if (ext.VRM) return Object.fromEntries(((ext.VRM.humanoid && ext.VRM.humanoid.humanBones) || []).map(h => [h.bone, h.node]));
  return {};
}

// ---------------------------------------------------------------------------------------------------------------- las extensiones pasantes
const clona = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

/** Extensión de nivel raíz (VRMC_vrm, VRMC_springBone, VRM): el JSON entero, tal cual */
function pasanteRaiz(nombre) {
  return class extends Extension {
    static EXTENSION_NAME = nombre;
    extensionName = nombre;
    crudo = null;
    read(ctx) { const e = ctx.jsonDoc.json.extensions; this.crudo = e && e[nombre] ? clona(e[nombre]) : null; }
    write(ctx) {
      if (!this.crudo) return;
      const j = ctx.jsonDoc.json; j.extensions = j.extensions || {}; j.extensions[nombre] = clona(this.crudo);
    }
  };
}

/** Extensión de nivel nodo (VRMC_node_constraint): el JSON de cada nodo, tal cual; los nodos de la restricción van por índice (no se reordenan) */
function pasanteNodo(nombre) {
  return class extends Extension {
    static EXTENSION_NAME = nombre;
    extensionName = nombre;
    porNodo = new Map();
    read(ctx) {
      (ctx.jsonDoc.json.nodes || []).forEach((def, i) => { if (def.extensions && def.extensions[nombre]) this.porNodo.set(ctx.nodes[i], clona(def.extensions[nombre])); });
    }
    write(ctx) {
      for (const [nodo, crudo] of this.porNodo) {
        const i = ctx.nodeIndexMap.get(nodo); if (i === undefined) continue;
        const def = ctx.jsonDoc.json.nodes[i]; def.extensions = def.extensions || {}; def.extensions[nombre] = clona(crudo);
      }
    }
  };
}

const TEXTURAS_MTOON = ["shadeMultiplyTexture", "shadingShiftTexture", "matcapTexture", "rimMultiplyTexture", "outlineWidthMultiplyTexture", "uvAnimationMaskTexture"];
const MTOON = "VRMC_materials_mtoon";

/** El MToon de un material: el JSON tal cual salvo las texturas, que son referencias del grafo */
class MToon extends ExtensionProperty {
  static EXTENSION_NAME = MTOON;
  init() { this.extensionName = MTOON; this.propertyType = "MToon"; this.parentTypes = [PropertyType.MATERIAL]; }
  getDefaults() {
    const d = Object.assign(super.getDefaults(), { crudo: {} });
    for (const t of TEXTURAS_MTOON) { d[t] = null; d[t + "Info"] = new TextureInfo(this.graph, t + "Info"); d[t + "Extra"] = null; }
    return d;
  }
  getCrudo() { return this.get("crudo"); }
  setCrudo(v) { return this.set("crudo", v); }
  getTextura(t) { return this.getRef(t); }
  setTextura(t, tex) { return this.setRef(t, tex, { channels: TextureChannel.R | TextureChannel.G | TextureChannel.B | TextureChannel.A }); }
  getTexturaInfo(t) { return this.getRef(t + "Info"); }
  getTexturaExtra(t) { return this.get(t + "Extra"); }
  setTexturaExtra(t, v) { return this.set(t + "Extra", v); }
}

export class MToonExtension extends Extension {
  static EXTENSION_NAME = MTOON;
  extensionName = MTOON;
  /** Los materiales con MToon de esta extensión (para quien quiera quitar el contorno) */
  crea() { return new MToon(this.document.getGraph()); }
  read(ctx) {
    const defs = ctx.jsonDoc.json.materials || [], texDefs = ctx.jsonDoc.json.textures || [];
    defs.forEach((def, i) => {
      const d = def.extensions && def.extensions[MTOON]; if (!d) return;
      const mt = this.crea(), crudo = clona(d);
      for (const t of TEXTURAS_MTOON) {
        if (!d[t]) continue;
        mt.setTextura(t, ctx.textures[texDefs[d[t].index].source]); ctx.setTextureInfo(mt.getTexturaInfo(t), d[t]);
        const extra = clona(d[t]); delete extra.index; delete extra.texCoord; delete extra.extensions; mt.setTexturaExtra(t, extra); delete crudo[t];
      }
      mt.setCrudo(crudo); ctx.materials[i].setExtension(MTOON, mt);
    });
  }
  write(ctx) {
    for (const m of this.document.getRoot().listMaterials()) {
      const mt = m.getExtension(MTOON); if (!mt) continue;
      const def = ctx.jsonDoc.json.materials[ctx.materialIndexMap.get(m)], d = clona(mt.getCrudo());
      for (const t of TEXTURAS_MTOON) {
        const tex = mt.getTextura(t); if (!tex) continue;
        d[t] = Object.assign({}, mt.getTexturaExtra(t), ctx.createTextureInfoDef(tex, mt.getTexturaInfo(t)));
      }
      def.extensions = def.extensions || {}; def.extensions[MTOON] = d;
    }
  }
}

/**
 * VRM 0.x: `extensions.VRM` nombra las texturas por índice de `textures` (materialProperties.textureProperties), pero gltf-transform vuelve a crear `textures`
 * al escribir. Se traducen: índice de origen → imagen de origen → entrada de `textures` de la salida con esa imagen (se añade si ninguna material la usa).
 */
class PasanteVRM0 extends pasanteRaiz("VRM") {
  fuentes = [];
  read(ctx) { super.read(ctx); this.fuentes = (ctx.jsonDoc.json.textures || []).map(t => ({ source: t.source, sampler: t.sampler })); }
  write(ctx) {
    super.write(ctx);
    const j = ctx.jsonDoc.json, tp = j.extensions && j.extensions.VRM && j.extensions.VRM.materialProperties; if (!tp) return;
    j.textures = j.textures || [];
    const nuevo = viejo => {
      const f = this.fuentes[viejo]; if (!f) return viejo;
      let k = j.textures.findIndex(t => t.source === f.source); if (k < 0) { j.textures.push(f.sampler === undefined ? { source: f.source } : { source: f.source }); k = j.textures.length - 1; }
      return k;
    };
    for (const p of tp) if (p.textureProperties) for (const c of Object.keys(p.textureProperties)) p.textureProperties[c] = nuevo(p.textureProperties[c]);
  }
}
export const VRM_RAIZ = pasanteRaiz("VRMC_vrm"), VRM_MUELLES = pasanteRaiz("VRMC_springBone"), VRM0 = PasanteVRM0, VRM_RESTRICCION = pasanteNodo("VRMC_node_constraint");
export const EXTENSIONES_VRM = [VRM_RAIZ, VRM_MUELLES, VRM0, VRM_RESTRICCION, MToonExtension];

/** Cuenta los materiales con contorno de MToon (outlineWidthMode ≠ none) en 1.0 o en 0.x (_OutlineWidthMode); y los apaga si `apaga` (solo 1.0) */
export function contornos(doc, json0, apaga) {
  let n = 0;
  for (const m of doc.getRoot().listMaterials()) {
    const mt = m.getExtension(MTOON); if (!mt) continue;
    const c = mt.getCrudo();
    if (c.outlineWidthMode && c.outlineWidthMode !== "none") { n++; if (apaga) { c.outlineWidthMode = "none"; delete c.outlineWidthFactor; delete c.outlineLightingMixFactor; mt.setCrudo(c); } }
  }
  const mp = (json0.extensions && json0.extensions.VRM && json0.extensions.VRM.materialProperties) || [];
  for (const p of mp) if (p.floatProperties && p.floatProperties._OutlineWidthMode > 0) n++;
  return n;
}

/** Los índices que las extensiones nombran no cambiaron: mismos nodos, materiales, mallas y texturas (por nombre y por número) y mismo JSON de las extensiones de raíz */
export function verificaIndices(jsonAntes, jsonDespues) {
  const fallos = [];
  for (const k of ["nodes", "materials", "meshes"]) {
    const a = jsonAntes[k] || [], b = jsonDespues[k] || [];
    if (a.length !== b.length) fallos.push(k + ": " + a.length + " antes, " + b.length + " después");
    else for (let i = 0; i < a.length; i++) if ((a[i].name || "") !== (b[i].name || "")) { fallos.push(k + "[" + i + "]: «" + a[i].name + "» pasó a «" + b[i].name + "»"); break; }
  }
  // humanBones/expresiones/muelles nombran nodos y mallas por índice: el JSON de raíz debe salir igual
  for (const e of ["VRMC_vrm", "VRMC_springBone"]) {
    const a = jsonAntes.extensions && jsonAntes.extensions[e], b = jsonDespues.extensions && jsonDespues.extensions[e];
    if (JSON.stringify(a || null) !== JSON.stringify(b || null)) fallos.push("extensions." + e + " cambió");
  }
  return fallos;
}
