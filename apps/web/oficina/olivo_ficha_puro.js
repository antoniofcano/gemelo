// La ficha del olivo en la oficina (OF15b, doc/sistema/OFICINA.md §4 y §9): las cuentas, sin DOM ni red, para que la prueba de Node las ejercite
// (pruebas/guardianes/oficina_olivo_ficha.test.js). Dos cosas bien separadas (regla 5): lo MEDIDO (el LiDAR: posición, altura, id) y lo que PUSO LA FAMILIA
// (nombre, decoración, foto o pintura: ilustrativo, no es un dato de la explotación). Una fila solo existe si su dato existe.
import { construyeHash } from "./enlaces_puro.js";
import { buscaOlivo } from "./olivo_real_puro.js";

const coma = (n, d) => Number(n).toFixed(d).replace(".", ",");
const EPOCAS = { primavera: "primavera", verano: "verano", otono: "otoño", invierno: "invierno" };

/**
 * Qué copa del mapa hay bajo el clic (x, y en UTM): la más cercana cuyo radio medio la alcanza (con un mínimo de `toleranciaM`, para poder
 * acertar con el dedo a la escala del mapa). Devuelve { i, id, d } o null. `indice` es el de la finca (centro_utm y copas [x, y, h, r8, …]).
 */
export function copaEn(indice, x, y, toleranciaM = 1.5) {
  if (!indice || !Array.isArray(indice.centro_utm) || !Array.isArray(indice.copas)) return null;
  const [cx, cy] = indice.centro_utm;
  let mejor = null;
  for (let i = 0; i < indice.copas.length; i++) {
    const q = indice.copas[i];
    const dx = cx + q[0] - x, dy = cy + q[1] - y;
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) continue;
    const d = Math.hypot(dx, dy), r8 = q[3], rm = Array.isArray(r8) && r8.length ? r8.reduce((s, v) => s + v, 0) / r8.length : 2;
    if (d <= Math.max(rm, toleranciaM) && (!mejor || d < mejor.d)) mejor = { i, d };
  }
  if (!mejor) return null;
  return { i: mejor.i, id: Array.isArray(indice.copas_id) ? indice.copas_id[mejor.i] : -1, d: mejor.d };
}

/** Lo que ya cargan las copas del mapa (sin api): para el panel breve de Hazas. `id` < 0 = el índice no trae copas_id (no hay ficha que pedir). */
export function resumenDeCopa(indice, finca, i) {
  const q = indice.copas[i], [cx, cy] = indice.centro_utm;
  const id = Array.isArray(indice.copas_id) ? indice.copas_id[i] : -1;
  return { finca, i, numero: i + 1, id, e: cx + q[0], n: cy + q[1], altura_m: typeof q[2] === "number" ? q[2] : null, hash: id >= 0 ? construyeHash("olivo", finca + "/" + id) : null };
}

/** Las filas del panel breve de Hazas (solo medido). */
export function filasResumen(r) {
  const f = [["Olivo", "Olivo " + r.numero + " de la ficha"]];
  if (r.id >= 0) f.push(["Id real", "olivo:" + r.finca + ":" + r.id]);
  if (r.altura_m !== null) f.push(["Altura", coma(r.altura_m, 1) + " m"]);
  f.push(["Posición UTM 30N", "E " + coma(r.e, 1) + " · N " + coma(r.n, 1)]);
  return f;
}

/** Enlaces de la ficha (hashes ya construidos y validados): el árbol en 3D, la haza y la familia, solo los que existen. */
export function enlacesFicha(f) {
  const e = [{ clave: "3d", texto: "Ver el árbol en 3D", hash: construyeHash("olivos", f.finca + "/" + f.copas_id) }];
  if (f.haza) {
    e.push({ clave: "haza", texto: "Ver la haza " + f.haza.codigo, hash: construyeHash("hazas", f.haza.codigo) });
    if (f.haza.titular) e.push({ clave: "familia", texto: "Ver la familia", hash: construyeHash("familias", f.haza.titular.hogar_id) });
  }
  return e;
}

/**
 * La ficha → { medido: [[etiqueta, valor], …], familia: [[etiqueta, valor], …] | null, nota }. `indice` (opcional) es el índice de la finca, para
 * «posición N» como en OF8c (la posición del olivo en el índice + 1: el número que enseña la ficha del mundo).
 */
export function filasFicha(f, indice) {
  const medido = [["Id real", "olivo:" + f.finca + ":" + f.copas_id]];
  if (indice) {
    const q = buscaOlivo(indice, String(f.copas_id), f.finca);
    if (!q.error && q.i >= 0) medido.push(["Número en la ficha del mundo", "Olivo " + (q.i + 1) + " (posición " + (q.i + 1) + ")"]);
  }
  if (f.altura_m !== null) medido.push(["Altura", coma(f.altura_m, 1) + " m"]);
  medido.push(["Posición UTM 30N", "E " + coma(f.posicion.e, 2) + " · N " + coma(f.posicion.n, 2)]);
  if (f.haza) medido.push(["Haza", f.haza.codigo + (f.haza.titular ? "" : " (sin familia asignada)")]);
  const p = f.personalizacion;
  if (!p) return { medido, familia: null, nota: f.haza && f.haza.titular ? "La familia todavía no le ha puesto nada a este olivo." : "Sin familia en su haza: nadie le ha puesto nada." };
  const familia = [];
  if (p.nombre) familia.push(["Nombre", "«" + p.nombre + "»"]);
  if (p.decoracion) familia.push(["Decoración", (p.decoracion.nombre || "una pieza que ya no está en el catálogo (" + p.decoracion.id + ")") + (p.decoracion.epoca && EPOCAS[p.decoracion.epoca] ? " · de " + EPOCAS[p.decoracion.epoca] : "")]);
  // Fotos (EIPD pendiente, decisión 165): solo se dice que hay una y su id; la imagen no sale por esta ficha (para moderar, la bandeja)
  if (p.objeto) familia.push([p.objeto.tipo === "pintura" ? "Pintura" : "Foto", "Hay " + (p.objeto.tipo === "pintura" ? "una pintura colgada" : "una foto colgada") + " (id " + p.objeto.medio_id + ")"]);
  familia.push(["Estado", p.estado === "retirado" ? "retirado por la oficina" : "visible para las familias"]);
  return { medido, familia, nota: "" };
}
