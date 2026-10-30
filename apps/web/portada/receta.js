// La elección del avatar POR PIEZAS (AV4, ADR-0025; contratos/avatares.md §9 y doc/sistema/AVATARES-FAMILIA.md): lo puro, sin DOM, para la portada y para las pruebas
// en Node (pruebas/guardianes/avatar_portada.test.js). La portada lo pide con import() al abrir la pantalla del avatar.
//   · El estado de la pantalla: { edad, complexion, altura, tono, pelo, peloColor, vello, ropa, arriba, abajo, sombrero, movilidad, vrm }. Sin «hombre/mujer» en ningún
//     paso (criterio C8): se empieza por piezas o por «algo parecido», descrito por lo que se ve (C9); cualquier pieza vale para cualquier cuerpo (C4, C5).
//   · Los peques no se ofrecen (decisión 132): solo cuerpos con `ofrecer`.
//   · Las paletas son las del motor (Aspecto de 26_presencia.js) y las del catálogo v2 (tuberia/avatares/creador/catalogo.mjs): lo vigila el guardián.
"use strict";

export const PALETAS = {
  piel: ["#f6dcc8", "#eec5a6", "#e0ac86", "#cf9670", "#b97d57", "#a06844", "#855436", "#6b412a", "#523020", "#3b2217"]
    .map((color, i) => ({ id: "tono-" + (i + 1), nombre: "Tono " + (i + 1) + (i === 0 ? ", el más claro" : i === 9 ? ", el más oscuro" : ""), color })),
  ropa: [["verde-olivo", "Verde olivo", "#6b7f3a"], ["aceituna-negra", "Aceituna negra", "#2f2a2a"], ["tierra", "Tierra", "#8a5a3b"], ["almagra", "Almagra", "#a8432f"],
    ["trigo", "Trigo", "#d8b65e"], ["cielo", "Cielo", "#6f9fc6"], ["adelfa", "Adelfa", "#d77a9a"], ["cal", "Cal", "#ece7dc"], ["pizarra", "Pizarra", "#4b5563"], ["lavanda", "Lavanda", "#8b7bb5"]]
    .map(([id, nombre, color]) => ({ id, nombre, color })),
  pelo: [["negro", "Negro", "#1f1a17"], ["castano-oscuro", "Castaño oscuro", "#3d2a1e"], ["castano", "Castaño", "#6a4a30"], ["castano-claro", "Castaño claro", "#8f6a45"],
    ["rubio", "Rubio", "#c9a465"], ["cobrizo", "Cobrizo", "#a5522c"], ["canoso", "Canoso", "#9a9690"], ["blanco", "Blanco", "#e6e3dc"]]
    .map(([id, nombre, color]) => ({ id, nombre, color }))
};
export const EDADES = [["joven", "Joven"], ["adulta", "Adulta"], ["mayor", "Mayor"]];   // «peque» no se ofrece (decisión 132)
export const COMPLEXIONES = [["delgada", "Delgada"], ["media", "Media"], ["ancha", "Ancha"]];
export const ALTURAS = [["baja", "Más baja"], ["media", "Media"], ["alta", "Más alta"]];
export const SOMBREROS = [["ninguno", "Ninguno"], ["paja", "Sombrero de paja"], ["gorra", "Gorra"]];
export const MOVILIDADES = [["pie", "A pie"], ["baston", "Con bastón"], ["andador", "Con andador"], ["silla", "En silla de ruedas"]];
// los de antes (contrato v1: camisa 0-5 y piel 0-4): se mandan siempre, para los clientes que no conocen tono ni arriba (el más cercano)
const CAMISAS_V1 = ["#c0533a", "#3f7cc2", "#e0b23a", "#5d9b4a", "#8a5bb0", "#e8e2d4"], PIELES_V1 = ["#eec5a6", "#e0ac86", "#b97d57", "#855436", "#6b412a"];

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function cercano(lista, hexa) {
  const c = rgb(hexa); let mejor = 0, d0 = Infinity;
  lista.forEach((h, i) => { const q = rgb(h), d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < d0) { d0 = d; mejor = i; } });
  return mejor;
}

/** El catálogo v2 que sirve para elegir por piezas (si no, null: solo el muñeco). Los cuerpos sin `ofrecer` se quedan fuera */
export function leeV2(cat) {
  if (!cat || cat.v !== 2 || !Array.isArray(cat.cuerpos) || !Array.isArray(cat.piezas)) return null;
  const cuerpos = cat.cuerpos.filter(c => c && c.ofrecer === true && typeof c.id === "string");
  if (!cuerpos.length) return null;
  const porId = Object.fromEntries(cat.piezas.filter(p => p && typeof p.id === "string").map(p => [p.id, p]));
  const tipo = t => cat.piezas.filter(p => p.tipo === t && cuerpos.some(c => (c.piezas || []).includes(p.id)));
  return { cuerpos, porId, pelos: tipo("pelo"), vellos: tipo("vello"), ropas: tipo("ropa"), accesorios: tipo("accesorio") };
}
/** Las edades que hay de verdad en el catálogo (en el orden de EDADES) */
export function edadesDe(v2) { return v2 ? EDADES.filter(([e]) => v2.cuerpos.some(c => c.edad === e)) : []; }
/** El cuerpo de esa edad y complexión (o el más parecido de esa edad; o null) */
export function cuerpoDe(v2, edad, complexion) {
  if (!v2) return null;
  const deEdad = v2.cuerpos.filter(c => c.edad === edad);
  return deEdad.find(c => c.complexion === complexion) || deEdad.find(c => c.complexion === "media") || deEdad[0] || null;
}
const tiene = (c, id) => !!(c && id && (c.piezas || []).includes(id));

/** Estado de partida. Sin nada guardado (C2): ningún tono «de serie»; se empieza al azar en lo que es gusto (piel, pelo, colores) y en lo neutro en lo que es de la persona
 *  (edad adulta, complexión y altura medias, a pie). rnd() en [0, 1) */
export function inicial(v2, rnd = Math.random) {
  const e = { edad: "adulta", complexion: "media", altura: "media", tono: 0, pelo: null, peloColor: 0, vello: null, ropa: null, arriba: 0, abajo: 0, sombrero: "ninguno", movilidad: "pie", vrm: null };
  return azar(e, v2, rnd);
}
/** «Al azar»: sortea piel, pelo, colores, vello, ropa y sombrero; NO la edad, la complexión, la altura ni el apoyo, que son de la persona (como en la maqueta) */
export function azar(e, v2, rnd = Math.random) {
  const n = k => Math.floor(rnd() * k), o = Object.assign({}, e);
  o.tono = n(PALETAS.piel.length); o.peloColor = n(PALETAS.pelo.length); o.arriba = n(PALETAS.ropa.length); o.abajo = n(PALETAS.ropa.length);
  o.sombrero = SOMBREROS[n(SOMBREROS.length)][0];
  if (v2) {
    const c = cuerpoDe(v2, o.edad, o.complexion), de = l => l.filter(p => tiene(c, p.id));
    const pelos = de(v2.pelos), vellos = de(v2.vellos), ropas = de(v2.ropas);
    o.pelo = pelos.length ? pelos[n(pelos.length)].id : null;   // nadie empieza calvo (sin pelo se elige a mano)
    o.vello = vellos.length && rnd() < 0.3 ? vellos[n(vellos.length)].id : null;
    o.ropa = ropas.length && rnd() < 0.5 ? ropas[n(ropas.length)].id : null;
  }
  o.vrm = null;
  return o;
}

/** Puntos de partida («Empieza por algo parecido»): descritos por lo que se ve, sin género ni parentesco (C9). Solo los que el catálogo puede hacer */
const PARECIDOS = [
  ["Persona mayor, pelo canoso y sombrero, con bastón", { edad: "mayor", complexion: "media", pelo: "pelo-corto", peloColor: 6, vello: null, ropa: "ropa-faena", arriba: 7, abajo: 2, sombrero: "paja", movilidad: "baston" }],
  ["Persona adulta, ropa de faena y gorra", { edad: "adulta", complexion: "ancha", pelo: "pelo-rapado", peloColor: 0, vello: null, ropa: "ropa-faena", arriba: 0, abajo: 1, sombrero: "gorra", movilidad: "pie" }],
  ["Persona joven, pelo largo y camiseta", { edad: "joven", complexion: "media", pelo: "pelo-largo", peloColor: 1, vello: null, ropa: null, arriba: 4, abajo: 5, sombrero: "ninguno", movilidad: "pie" }],
  ["Persona mayor, moño blanco y andador", { edad: "mayor", complexion: "ancha", pelo: "pelo-recogido", peloColor: 7, vello: null, ropa: "ropa-faena", arriba: 9, abajo: 8, sombrero: "ninguno", movilidad: "andador" }],
  ["Persona adulta en silla de ruedas, pelo afro", { edad: "adulta", complexion: "media", pelo: "pelo-afro", peloColor: 0, vello: null, ropa: null, arriba: 3, abajo: 1, sombrero: "ninguno", movilidad: "silla" }],
  ["Persona adulta, barba y sombrero de paja", { edad: "adulta", complexion: "delgada", pelo: "pelo-corto", peloColor: 2, vello: "vello-barba", ropa: "ropa-faena", arriba: 5, abajo: 2, sombrero: "paja", movilidad: "pie" }],
];
export function parecidos(v2) {
  return PARECIDOS.filter(([, r]) => {
    if (!v2) return !r.pelo && !r.vello && !r.ropa;   // sin catálogo: ninguno lleva piezas, así que no se ofrecen
    const c = cuerpoDe(v2, r.edad, r.complexion);
    return !!c && c.edad === r.edad && [r.pelo, r.vello, r.ropa].every(id => !id || tiene(c, id));
  }).map(([nombre, r]) => ({ nombre, receta: r }));
}
/** Aplica un punto de partida: el tono de piel NO se toca (es de la persona: C2, nada de «la piel de serie» de un personaje) */
export function aplica(e, r) { const o = Object.assign({}, e, r); o.tono = e.tono; o.vrm = null; return o; }

/** Lo que se dibuja con ese estado (como 26b_avatares.js: piezasDe y tinte): { cuerpo, mallas: {pieza_x: true}, cubre, colores: {piel, ropa_base, ropa_abajo, pelo, sombrero} } */
export function vestido(v2, e) {
  const c = cuerpoDe(v2, e.edad, e.complexion), out = { cuerpo: c, mallas: {}, cubre: false, colores: {} };
  const pon = (id, tipo) => { const p = v2 && tiene(c, id) ? v2.porId[id] : null; if (!p || p.tipo !== tipo) return null; out.mallas[p.malla] = true; if (p.cubre_ropa_base) out.cubre = true; return p; };
  if (c) {
    pon(e.pelo, "pelo"); pon(e.vello, "vello"); pon(e.ropa, "ropa");
    const s = e.sombrero !== "ninguno" ? v2.accesorios.find(p => p.sombrero === e.sombrero && tiene(c, p.id)) : null;
    if (s) { pon(s.id, "accesorio"); out.colores.sombrero = s.color || null; }
  }
  out.colores.piel = PALETAS.piel[e.tono].color; out.colores.ropa_base = PALETAS.ropa[e.arriba].color; out.colores.ropa_abajo = PALETAS.ropa[e.abajo].color;
  out.colores.pelo = PALETAS.pelo[e.peloColor].color;
  return out;
}

/** El cuerpo de PUT /api/yo/avatar (contratos/api.openapi.yaml): lo de siempre (camisa 0-5, sombrero, piel 0-4: los más cercanos, para clientes de antes), el aspecto (AV2) y la
 *  receta (AV4) solo si hay cuerpo en el catálogo; `vrm` solo si se eligió un avatar ya hecho (v1). La receta va corta: sin los valores neutros (altura media, a pie) */
export function peticion(v2, e) {
  const b = { camisa: cercano(CAMISAS_V1, PALETAS.ropa[e.arriba].color), sombrero: e.sombrero, piel: cercano(PIELES_V1, PALETAS.piel[e.tono].color), vrm: e.vrm || null,
    tono: e.tono, arriba: e.arriba, abajo: e.abajo, complexion: e.complexion };
  if (e.altura !== "media") b.altura = e.altura;
  if (e.movilidad !== "pie") b.movilidad = e.movilidad;
  const c = !e.vrm ? cuerpoDe(v2, e.edad, e.complexion) : null;
  if (c) {
    b.cuerpo = c.id; b.pelo_color = e.peloColor;
    for (const k of ["pelo", "vello", "ropa"]) if (e[k] && tiene(c, e[k])) b[k] = e[k];
  }
  return b;
}

/** De lo guardado (GET /api/yo/avatar) al estado; lo que no esté en el catálogo, al valor neutro */
export function deGuardado(v2, j, catV1 = []) {
  const e = inicial(v2, () => 0);
  const ent = (v, n) => Number.isInteger(v) && v >= 0 && v < n ? v : null;
  e.tono = ent(j.tono, 10) ?? cercano(PALETAS.piel.map(p => p.color), PIELES_V1[ent(j.piel, 5) ?? 1]);
  e.arriba = ent(j.arriba, 10) ?? cercano(PALETAS.ropa.map(p => p.color), CAMISAS_V1[ent(j.camisa, 6) ?? 0]);
  e.abajo = ent(j.abajo, 10) ?? 8;
  e.peloColor = ent(j.pelo_color, PALETAS.pelo.length) ?? 0;
  for (const [k, l] of [["altura", ALTURAS], ["complexion", COMPLEXIONES], ["sombrero", SOMBREROS], ["movilidad", MOVILIDADES]]) if (l.some(x => x[0] === j[k])) e[k] = j[k];
  const c = v2 && typeof j.cuerpo === "string" ? v2.cuerpos.find(x => x.id === j.cuerpo) : null;
  if (c) { e.edad = c.edad; e.complexion = c.complexion; }
  for (const k of ["pelo", "vello", "ropa"]) e[k] = c && tiene(c, j[k]) ? j[k] : (k === "pelo" && c ? e.pelo : null);
  e.vrm = typeof j.vrm === "string" && catV1.some(a => a.id === j.vrm) ? j.vrm : null;
  return e;
}

/** La alternativa en texto (aria-live): lo que se ve, sin género */
export function describe(v2, e) {
  const nom = (l, v) => (l.find(x => x[0] === v) || [, v])[1].toLowerCase(), partes = [];
  const c = cuerpoDe(v2, e.edad, e.complexion);
  partes.push(c ? "Persona " + nom(EDADES, e.edad) + ", complexión " + nom(COMPLEXIONES, e.complexion) : "Muñeco de bloque, complexión " + nom(COMPLEXIONES, e.complexion));
  if (e.altura !== "media") partes.push(nom(ALTURAS, e.altura));
  partes.push("piel de " + PALETAS.piel[e.tono].nombre.toLowerCase());
  if (c) {
    const p = e.pelo && v2.porId[e.pelo];
    partes.push(p ? "pelo " + p.nombre.toLowerCase() + " " + PALETAS.pelo[e.peloColor].nombre.toLowerCase() : "sin pelo");
    if (e.vello && v2.porId[e.vello]) partes.push(v2.porId[e.vello].nombre.toLowerCase());
    partes.push(e.ropa && v2.porId[e.ropa] ? v2.porId[e.ropa].nombre.toLowerCase().replace(/ \(.*\)$/, "") : "camiseta y pantalón corto");
  }
  partes.push("arriba " + PALETAS.ropa[e.arriba].nombre.toLowerCase() + " y abajo " + PALETAS.ropa[e.abajo].nombre.toLowerCase());
  if (e.sombrero !== "ninguno") partes.push(nom(SOMBREROS, e.sombrero));
  if (e.movilidad !== "pie") partes.push(nom(MOVILIDADES, e.movilidad));
  return partes.join(", ") + ".";
}
