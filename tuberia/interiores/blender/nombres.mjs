// Lógica pura de la base de interiores en Blender (sin dependencias: la prueba de Node la importa sin instalar nada).

/** Ranura de un material en la que se usa una textura → sufijo del nombre del PNG */
export const RANURAS = { baseColorTexture: "color", normalTexture: "normal", metallicRoughnessTexture: "orm", occlusionTexture: "orm", emissiveTexture: "emision" };

/**
 * Nombre legible de cada imagen a partir de los materiales que la usan (lógica pura, la vigila la prueba).
 * @param {{nombre:string, ranuras:Record<string,number>}[]} materiales ranura → índice de imagen
 * @param {number} nImagenes
 * @returns {string[]} un nombre único por imagen, sin extensión (p. ej. «madera_color», «madera_orm»)
 */
export function nombraImagenes(materiales, nImagenes) {
  const nombres = new Array(nImagenes).fill(null);
  for (const m of materiales) {
    for (const [ranura, i] of Object.entries(m.ranuras)) {
      if (i == null || nombres[i]) continue;
      nombres[i] = limpia(m.nombre) + "_" + (RANURAS[ranura] || ranura);
    }
  }
  const vistos = new Map();
  return nombres.map((n, i) => {
    const base = n || "imagen_" + String(i).padStart(2, "0");
    const k = (vistos.get(base) || 0) + 1; vistos.set(base, k);
    return k === 1 ? base : base + "_" + k;
  });
}

export function limpia(s) { return String(s || "sin_nombre").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_"); }

