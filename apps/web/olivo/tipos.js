// Tipos y épocas del constructor de olivos-tipo (referencia: TIPOS, CTLS y ESTADOS), sin THREE.
// Los colores de la aceituna salen de hsl() con la misma aritmética que THREE.Color.setHSL de r128 (sin gestión de color) y consumen el azar
// en el mismo orden que la referencia: dan los mismos números.

const BASE = {
  planton:   {nombre:"Plantón",     pies:1, altura:1.7, copa:1.3, tronco:0.035, nudos:0.15, torsion:0.0, densidad:0.55, cruz:0.42},
  adulto1:   {nombre:"Adulto 1 pie", pies:1, altura:4.2, copa:5.4, tronco:0.20, nudos:0.55, torsion:0.35, densidad:0.75, cruz:0.30},
  adulto2:   {nombre:"Adulto 2 pies",pies:2, altura:4.5, copa:6.0, tronco:0.16, nudos:0.6,  torsion:0.4,  densidad:0.8,  cruz:0.30},
  adulto3:   {nombre:"Adulto 3 pies",pies:3, altura:4.8, copa:6.6, tronco:0.14, nudos:0.65, torsion:0.45, densidad:0.8,  cruz:0.28},
  centenario:{nombre:"Centenario",  pies:1, altura:5.4, copa:7.4, tronco:0.48, nudos:1.0,  torsion:1.0,  densidad:0.7,  cruz:0.26, falda:0.5},
  centenario2:{nombre:"Centenario 2 pies", pies:2, altura:4.8, copa:8.6, tronco:0.3, nudos:1.0, torsion:0.8, densidad:0.95, cruz:0.27, falda:0.85, sep:0.7, asim:0.35, varetas:0.75},
  centenario3:{nombre:"Centenario 3 pies", pies:3, altura:5.0, copa:9.4, tronco:0.26, nudos:1.0, torsion:0.8, densidad:0.95, cruz:0.27, falda:0.85, sep:0.85, asim:0.35, varetas:0.75}
};
// los valores por defecto, en el mismo orden que la referencia
Object.values(BASE).forEach(t=>{if(t.falda===undefined)t.falda=t.altura<2.3?0:0.3;if(t.sep===undefined)t.sep=t.pies>1?0.35:0;
  if(t.asim===undefined)t.asim=t.altura<2.3?0:0.1;
  if(t.relieve===undefined)t.relieve=t.altura<2.3?0.1:(t.nombre.startsWith("Centenario")?0.7:0.45);
  if(t.relleno===undefined)t.relleno=t.altura<2.3?0:0.6;if(t.carga===undefined)t.carga=t.altura<2.3?0.2:0.5;if(t.rumbo===undefined)t.rumbo=135;if(t.poda===undefined)t.poda=0;if(t.varetas===undefined)t.varetas=t.altura<2.3?0:0.35;});
Object.values(BASE).forEach(Object.freeze);
/** Los 7 tipos con todos sus parámetros (congelados: se copian con Object.assign antes de tocarlos) */
export const TIPOS = Object.freeze(BASE);

/** Rango de cada parámetro (los deslizadores de la referencia): para validar lo que llega del LiDAR */
export const RANGOS = Object.freeze({
  pies:[1,3], altura:[1,7], copa:[0.8,12], tronco:[0.02,0.6], sep:[0,1.4], cruz:[0.18,0.5], nudos:[0,1.2], torsion:[0,1.5], densidad:[0.2,1],
  falda:[0,1], asim:[0,0.6], varetas:[0,1], relieve:[0,1], relleno:[0,1], rumbo:[0,355], poda:[0,1], carga:[0,1]
});

/** Ids estables de tipo (catálogo «olivo-2», 0..255 como en contratos/olivos-tipo.md): no se reutilizan para otra forma */
export const ID_TIPO = Object.freeze({ planton: 0, adulto1: 1, adulto2: 2, adulto3: 3, centenario: 4, centenario2: 5, centenario3: 6 });
export const TIPO_DE_ID = Object.freeze(Object.fromEntries(Object.entries(ID_TIPO).map(([k, v]) => [v, k])));
export const tipoDeId = id => TIPO_DE_ID[id] || null;

// THREE.Color.setHSL de three r128, copiado: euclideanModulo, clamp y hue2rgb
function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*6*(2/3-t);return p;}
export function hsl(h,s,l){
  h=((h%1)+1)%1; s=Math.max(0,Math.min(1,s)); l=Math.max(0,Math.min(1,l));
  if(s===0) return [l,l,l];
  const p=l<=0.5?l*(1+s):l+s-(l*s), q=(2*l)-p;
  return [hue2rgb(q,p,h+1/3),hue2rgb(q,p,h),hue2rgb(q,p,h-1/3)];
}

/** Las 7 épocas del año. colorFruto(R) → [r, g, b] (lineal, como lo guardaba THREE.Color en r128) */
export const ESTADOS = Object.freeze({
  reposo: {n:"Reposo",       flor:null,      fruto:0, bbch:[0,50], nota:"Invierno, tras la recogida: sin flor ni fruto."},
  boton:  {n:"Botón floral", flor:"boton",   fruto:0, bbch:[51,59], nota:"BBCH 57 · abril: racimos florales verdes en las axilas de las hojas."},
  flor:   {n:"Floración",    flor:"flor",    fruto:0, bbch:[60,69], nota:"BBCH 65 · mayo: plena floración, racimos de flor blanca."},
  cuajado:{n:"Cuajado",      flor:"cuajado", fruto:0, bbch:[70,74], nota:"BBCH 71 · junio: aceituna recién cuajada con restos de pétalo; muchas flores caen."},
  verde:  {n:"Fruto verde",  flor:null, fruto:1.5, radio:0.017, bbch:[75,80], nota:"BBCH 75 · verano: aceituna verde a medio tamaño.",
           colorFruto:R=>hsl(0.22+R()*0.03,0.42,0.34+R()*0.08)},
  envero: {n:"Envero",       flor:null, fruto:1.5, radio:0.02, bbch:[81,88], nota:"BBCH 81 · octubre-noviembre: la aceituna vira de verde amarillento a vinoso.",
           colorFruto:R=>{const r=R();return r<0.55?hsl(0.17,0.36,0.52+R()*0.08)
             :r<0.8?hsl(0.98,0.27,0.5):hsl(0.88,0.2,0.24);}},
  madura: {n:"Madura",       flor:null, fruto:1.8, radio:0.024, bbch:[89,99], nota:"BBCH 89 · diciembre-enero: aceituna negra morada, en su punto para la recogida tardía.",
           colorFruto:R=>{const r=R();return r<0.7?hsl(0.84,0.28,0.09+R()*0.05)
             :r<0.9?hsl(0.95,0.3,0.3):hsl(0.17,0.32,0.48);}}
});

/** Época a partir de un estado fenológico BBCH (p. ej. el que registra OlivarTrack): 0-50 reposo … 89-99 madura. null si no es un número */
export function bbchAEpoca(bbch) {
  const b = Number(bbch);
  if (!Number.isFinite(b)) return null;
  for (const [k, e] of Object.entries(ESTADOS)) if (b >= e.bbch[0] && b <= e.bbch[1] + 0.999) return k;
  return b < 0 ? "reposo" : "madura";
}
