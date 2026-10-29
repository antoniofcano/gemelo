// Núcleo del constructor de olivos (ADR-0017): el MOTOR de la maqueta «Olivos en el gemelo» (= el build() de «Olivos tipo», olivo-2), sin DOM,
// sin escena ni materiales, como GENERADOR con yield frecuente. No crea mallas: devuelve una RECETA de arrays tipados
// (contratos/olivo-generado.md §2) que montaje.js convierte en un THREE.Group con el three del anfitrión.
//
//   recetaG(G, { tipo, parametros, epoca, semilla }) → generador; su valor final (return) es la receta
//   G = el three FIJADO a 0.128.0 (paquete «three-gen»): toda la aritmética (curvas, marcos de Frenet, matrices, normales) es la de r128,
//   así el árbol no cambia cuando el gemelo sube de versión de three.
//
// Es la misma secuencia de operaciones y de llamadas al azar que la referencia (comprobado byte a byte contra el oráculo,
// pruebas/olivo/oraculo.mjs, en pruebas/guardianes/olivo.test.js). Única diferencia de cálculo: la caja final, que la referencia
// tomaba de Box3.setFromObject (que en three ≥ r1xx cuenta las instancias y en r128 no), aquí es explícita y equivalente a r128.
import { rngFrom } from "./azar.js";
import { TIPOS, ESTADOS } from "./tipos.js";
import { GEN_VERSION } from "./version.js";

const PODA_BASE = 0.2;
const CADA = 32;    // cada cuántas vueltas de un bucle caliente se cede el turno (yield)

/** Geometrías compartidas (las mismas para todos los árboles), como arrays: oliva, relleno, tocón, corte y la tarjeta de ramita */
const geosCache = new WeakMap();
export function geosCompartidas(G) {
  let g = geosCache.get(G); if (g) return g;
  const olivaGeo=(()=>{const g=new G.IcosahedronGeometry(1,0),pa=g.attributes.position,n=g.attributes.normal,v=new G.Vector3();
    for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).normalize();n.setXYZ(i,v.x,v.y,v.z);}return g;})();
  const rellenoGeo=new G.PlaneGeometry(1.2,1.2);
  const toconGeo=new G.CylinderGeometry(1,1,1,7,1,true), corteGeo=new G.CircleGeometry(1,9).rotateX(-Math.PI/2);
  const card=new G.PlaneGeometry(0.3,0.6); card.translate(0,0.27,0);
  // octaedro de las olivas de E1 (niveles.js), con las normales hacia fuera como el de la maqueta
  const octaGeo=(()=>{const g=new G.OctahedronGeometry(1,0),pa=g.attributes.position,n=g.attributes.normal,v=new G.Vector3();
    for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).normalize();n.setXYZ(i,v.x,v.y,v.z);}return g;})();
  const aArrays = geo => { geo.computeBoundingBox(); const a = { atrib: {}, indice: geo.index ? Uint32Array.from(geo.index.array) : null, caja: geo.boundingBox.clone() };
    for (const k of ["position", "normal", "uv"]) if (geo.attributes[k]) a.atrib[k] = new Float32Array(geo.attributes[k].array); return a; };
  g = { oliva: aArrays(olivaGeo), relleno: aArrays(rellenoGeo), tocon: aArrays(toconGeo), corte: aArrays(corteGeo), ramita: aArrays(card), octa: aArrays(octaGeo) };
  geosCache.set(G, g);
  return g;
}

/** Parámetros resueltos: los del tipo y, encima, los que se pasen (del LiDAR o a mano) */
export function resuelve(tipo, parametros) {
  if (tipo != null && !TIPOS[tipo]) throw new Error("tipo de olivo desconocido: " + tipo);
  if (tipo == null && !parametros) throw new Error("hace falta un tipo o los parámetros completos");
  return Object.assign({}, tipo != null ? TIPOS[tipo] : {}, parametros || {});
}

// Rama: tubo con radio variable, acanalado y torsión (rama() de la referencia; devuelve arrays en vez de una malla)
function* rama(G,pts,r0,r1,o){
  const curve=new G.CatmullRomCurve3(pts,false,"centripetal");
  const segs=o.segs||24, rad=o.rad||12, len=curve.getLength();
  const fr=curve.computeFrenetFrames(segs,false);
  const pos=[],uv=[],idx=[],aH=[],aM=[], mk=o.marcas||[], ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  for(let i=0;i<=segs;i++){
    if(i%2===1) yield;
    const t=i/segs, p=curve.getPointAt(t), N=fr.normals[i], B=fr.binormals[i];
    let r=r0+(r1-r0)*Math.pow(t,0.85);
    if(o.flare) r*=1+o.flare*Math.pow(1-t,5);
    for(let j=0;j<=rad;j++){
      const th=j/rad*Math.PI*2, tw=o.tw*t*5+o.ph;
      const ac=1+o.gn*(0.2*Math.sin(3*th+tw)+0.11*Math.sin(5*th-tw*0.7+o.ph)+0.07*Math.sin(2*th+tw*1.3));
      let rr=r*ac, h=0, mu=0;
      for(const q of mk){
        let da=th-q.th; da=Math.atan2(Math.sin(da),Math.cos(da));
        const dth=q.dth*(q.tipo==="muerta"?1+0.35*Math.sin(t*23+q.th*5):1), d=Math.sqrt(Math.pow((t-q.t)/q.dt,2)+Math.pow(da/dth,2));
        if(q.tipo==="hueco"){ if(d<1.25){ rr*=1-q.prof*ss(0,0.6,1-d)+0.07*Math.exp(-Math.pow((d-1)/0.16,2)); h=Math.max(h,ss(0.15,0.7,1-d)); } }
        else if(d<1.2){ rr*=1-0.05*ss(0,0.4,1-d)+0.035*Math.exp(-Math.pow((d-1)/0.12,2)); mu=Math.max(mu,ss(0,0.25,1-d)); }
      }
      aH.push(h); aM.push(mu);
      const c=Math.cos(th), s=Math.sin(th);
      pos.push(p.x+(N.x*c+B.x*s)*rr,p.y+(N.y*c+B.y*s)*rr,p.z+(N.z*c+B.z*s)*rr);
      uv.push(j/rad*Math.max(1,Math.round(r0*12)),t*len*0.9);
    }
  }
  for(let i=0;i<segs;i++)for(let j=0;j<rad;j++){
    const a=i*(rad+1)+j,b=a+rad+1; idx.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new G.BufferGeometry();
  g.setAttribute("position",new G.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new G.Float32BufferAttribute(uv,2));
  g.setAttribute("aHueco",new G.Float32BufferAttribute(aH,1)); g.setAttribute("aMuerta",new G.Float32BufferAttribute(aM,1));
  g.setIndex(idx); yield* normales(G,g); g.userData.rejilla=[segs,rad];
  return {geo:g,curve};
}

/** BufferGeometry.computeVertexNormals() de three r128 (geometría indexada sin normales), copiado operación a operación y con yield:
 *  mismos bytes que la original, sin bloquear con mallas grandes */
function* normales(G,geo){
  const index=geo.index, positionAttribute=geo.getAttribute("position");
  const normalAttribute=new G.BufferAttribute(new Float32Array(positionAttribute.count*3),3); geo.setAttribute("normal",normalAttribute);
  const pA=new G.Vector3(),pB=new G.Vector3(),pC=new G.Vector3(),nA=new G.Vector3(),nB=new G.Vector3(),nC=new G.Vector3(),cb=new G.Vector3(),ab=new G.Vector3();
  for(let i=0,il=index.count;i<il;i+=3){
    if(i%1536===1533) yield;
    const vA=index.getX(i+0), vB=index.getX(i+1), vC=index.getX(i+2);
    pA.fromBufferAttribute(positionAttribute,vA); pB.fromBufferAttribute(positionAttribute,vB); pC.fromBufferAttribute(positionAttribute,vC);
    cb.subVectors(pC,pB); ab.subVectors(pA,pB); cb.cross(ab);
    nA.fromBufferAttribute(normalAttribute,vA); nB.fromBufferAttribute(normalAttribute,vB); nC.fromBufferAttribute(normalAttribute,vC);
    nA.add(cb); nB.add(cb); nC.add(cb);
    normalAttribute.setXYZ(vA,nA.x,nA.y,nA.z); normalAttribute.setXYZ(vB,nB.x,nB.y,nB.z); normalAttribute.setXYZ(vC,nC.x,nC.y,nC.z);
  }
  const v=new G.Vector3();
  for(let i=0,il=normalAttribute.count;i<il;i++){ if(i%2048===2047) yield; v.fromBufferAttribute(normalAttribute,i); v.normalize(); normalAttribute.setXYZ(i,v.x,v.y,v.z); }
}

/** Pieza «malla» con geometría propia, desde una BufferGeometry de G (se copian sus arrays) */
function piezaMalla(geo, mat, extra) {
  const atrib = {};
  for (const k of ["position", "normal", "uv", "aHueco", "aMuerta"]) if (geo.attributes[k]) atrib[k] = new Float32Array(geo.attributes[k].array);
  geo.computeBoundingBox();
  return Object.assign({ clase: "malla", mat, geo: "propia", sombra: [true, true], prof: null, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1],
    rol: null, rejilla: geo.userData.rejilla || null, atrib, indice: Uint32Array.from(geo.index.array), _caja: geo.boundingBox.clone() }, extra || {});
}
function* piezaInstancias(geo, mat, lista, opciones) {
  const n = lista.length, matrices = new Float32Array(n * 16), conColor = opciones.color !== false;
  const colores = conColor ? new Float32Array(n * 3) : null, nodo = opciones.nodo ? new Int32Array(n) : null;
  for (let i = 0; i < n; i++) {
    if (i % 256 === 255) yield;
    const x = lista[i]; matrices.set(x.m.elements, i * 16);
    if (conColor) { colores[i * 3] = x.c[0]; colores[i * 3 + 1] = x.c[1]; colores[i * 3 + 2] = x.c[2]; }
    if (nodo) nodo[i] = x.nodo;
  }
  return { clase: "instancias", mat, geo, sombra: opciones.sombra, prof: opciones.prof || null, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1],
    rol: opciones.rol || null, rejilla: null, n, matrices, colores, nodo };
}

/**
 * El árbol, como generador. Cede el turno (yield) a menudo; quien lo mueve decide cuánto tiempo le da por fotograma.
 * @returns {Generator<undefined, object>} el valor final es la receta
 */
export function* recetaG(G, { tipo, parametros, epoca, semilla }) {
  const P = resuelve(tipo, parametros), estado = epoca || "envero";
  if (!ESTADOS[estado]) throw new Error("época desconocida: " + estado);
  if (!Number.isFinite(semilla)) throw new Error("semilla no válida: " + semilla);
  if (!Number.isInteger(semilla) || semilla < 0 || semilla > 4294967295) throw new Error("la semilla es un entero de 0 a 2^32 − 1: " + semilla);
  const semillaE = semilla;
  const GEOS = geosCompartidas(G);
  const piezas = [];
  let vueltas = 0;
  const R = rngFrom(semilla*131+P.pies*17), V = (a,b)=>a+(b-a)*R();
  const H=P.altura, Rc=P.copa/2, tr=P.tronco, pies=Math.round(P.pies), gn=P.nudos, tw=P.torsion;
  const hCruz=Math.max(0.35,H*P.cruz);
  const madres=[];

  // Cepa común cuando hay varios pies
  if(pies>1&&P.sep<0.45){
    const rc=tr*(1.15+0.35*pies);
    piezas.push(piezaMalla((yield* rama(G,[new G.Vector3(0,-0.05,0),new G.Vector3(0,0.18,0),new G.Vector3(0,0.32,0)],
      rc,rc*0.8,{gn:gn*1.2,tw,ph:R()*6,flare:0.5,segs:6,rad:18})).geo,"corteza"));
  }
  // Rumbo: 0 = norte (-z), 90 = este (+x)
  const giro0=R()*Math.PI*2, dirA=(P.rumbo-90)*Math.PI/180, asim=g=>1+P.asim*Math.cos(g-dirA);
  for(let i=0;i<pies;i++){
    const a=giro0+i/pies*Math.PI*2+V(-0.25,0.25);
    const central=pies===3&&i===1, trI=central?tr*0.78:tr, separados=pies>1&&P.sep>=0.45;
    const off=pies>1?(separados?P.sep/(2*Math.sin(Math.PI/pies)):tr*(0.9+0.25*pies)):0, dx=Math.cos(a), dz=Math.sin(a);
    const abre=central?V(0.12,0.25):(pies>1?(separados?V(0.62,0.95):V(0.35,0.6)):V(0,0.12));
    const base=new G.Vector3(dx*off,0,dz*off);
    const top=new G.Vector3(dx*(off+abre*hCruz)+V(-.1,.1),hCruz,dz*(off+abre*hCruz)+V(-.1,.1));
    const mid=base.clone().lerp(top,0.5).add(new G.Vector3(V(-1,1)*tw*0.18,0,V(-1,1)*tw*0.18));
    const mkPie=[];
    if(P.nudos>0.6&&trI>0.12){
      const nh=1+(R()*2|0);
      for(let k=0;k<nh;k++) mkPie.push({tipo:"hueco",t:V(0.15,0.6),th:V(0,6.28),dt:V(0.09,0.16),dth:V(0.45,0.7),prof:V(0.4,0.6)});
      if(i===0||R()<0.35) mkPie.push({tipo:"muerta",t:V(0.35,0.55),th:V(0,6.28),dt:V(0.22,0.34),dth:V(0.3,0.45)});
    }
    const pie=yield* rama(G,[base,mid,top],trI,trI*0.72,{gn,tw,ph:R()*6,flare:(pies>1&&!separados)?0.15:0.55+gn*0.4,segs:mkPie.length?44:20,rad:mkPie.length?40:16,marcas:mkPie});
    piezas.push(piezaMalla(pie.geo,central?"musgo":"pies"));
    yield;

    // Raíces en garra en la base de cada pie
    if(trI>0.12){
      const nr=5+(R()*3|0);
      for(let b=0;b<nr;b++){
        const ab=b/nr*Math.PI*2+V(-0.3,0.3), cx=Math.cos(ab), cz=Math.sin(ab);
        const s=base.clone().add(new G.Vector3(cx*trI*0.45,trI*V(1.3,2.0),cz*trI*0.45));
        const e=base.clone().add(new G.Vector3(cx*trI*V(1.7,2.3),-0.05,cz*trI*V(1.7,2.3)));
        const m=s.clone().lerp(e,0.5).add(new G.Vector3(cx*trI*0.25,-trI*0.15,cz*trI*0.25));
        piezas.push(piezaMalla((yield* rama(G,[s,m,e],trI*V(0.28,0.4),trI*0.1,{gn:0.6,tw:0,ph:R()*6,segs:8,rad:8})).geo,"raiz"));
      }
    }
    // Muñón de una poda vieja
    if(P.nudos>0.8&&i===pies-1){
      const s=pie.curve.getPointAt(0.88);
      const e=s.clone().add(new G.Vector3(dx*0.28+V(-.1,.1),0.32,dz*0.28+V(-.1,.1)));
      piezas.push(piezaMalla((yield* rama(G,[s,s.clone().lerp(e,0.5),e],trI*0.5,trI*0.42,{gn:0.8,tw:0,ph:R()*6,segs:6,rad:12})).geo,"muerta"));
    }
    // Ramas madre
    const nb=pies===1?(H<2.3?3:V(3,4.99)|0):2;
    for(let k=0;k<nb;k++){
      const ak=pies===1? giro0+k/nb*Math.PI*2+V(-.3,.3) : a+(k-(nb-1)/2)*V(0.7,1.1);
      const s0=pie.curve.getPointAt(V(0.86,0.98)), fa=asim(ak);
      const end=new G.Vector3(Math.cos(ak)*Rc*V(0.32,0.42)*fa,H*V(0.46,0.54),Math.sin(ak)*Rc*V(0.32,0.42)*fa);
      const m1=s0.clone().lerp(end,0.45); m1.y-=H*0.03; m1.x+=Math.cos(ak)*Rc*0.06; m1.z+=Math.sin(ak)*Rc*0.06;
      const rm=trI*(pies===1?0.62:0.55);
      const madre=yield* rama(G,[s0,m1,end],rm,rm*0.5,{gn:gn*0.5,tw:tw*0.4,ph:R()*6,segs:16,rad:10});
      piezas.push(piezaMalla(madre.geo,"corteza"));
      madres.push({curve:madre.curve,ak,fa,r:rm*0.5});
    }
    yield;
  }

  // Volumen de copa
  const lobulos=[];
  madres.forEach(m=>{
    const fa=m.fa, rc=Rc*V(0.4,0.66)*fa, c=new G.Vector3(Math.cos(m.ak)*rc,H*(0.6+P.relieve*V(-0.09,0.06))*(fa>1?1-0.2*(fa-1):1),Math.sin(m.ak)*rc);
    const rh=Rc*V(0.38,0.56)*Math.sqrt(fa), ru=H*(0.32+P.relieve*V(-0.1,0.12)), rd=Math.max(0.2,Math.min(c.y-0.12,H*(0.16+0.36*P.falda)));
    lobulos.push({c,rx:rh,rz:rh,ru,rd});
    const nsub=3+(R()*3|0)+Math.round(P.relieve*4);
    for(let q=0;q<nsub;q++){
      const lateral=q%2===0, az=m.ak+V(-1.1,1.1), el=lateral?V(-0.45,0.3):V(-0.15+0.5*P.relieve,1.2), dist=lateral?V(0.7,1.0):0.72;
      const cs=c.clone().add(new G.Vector3(Math.cos(az)*Math.cos(el)*rh*dist,Math.sin(el)*(lateral?rd:ru)*0.7,Math.sin(az)*Math.cos(el)*rh*dist));
      const rs=rh*(0.28+V(0,0.2)*(0.6+0.6*P.relieve));
      lobulos.push({c:cs,rx:rs,rz:rs,ru:rs*V(0.7,0.95)*(1+P.relieve*V(0,0.9)),rd:rs*V(0.7,0.95)});
    }
  });
  (function(){
    const mg=0.12*Math.min(1.1,Math.max(0.3,Rc/4.7)); let top=0; const bx=new G.Box2();
    lobulos.forEach(L=>{const r=Math.max(L.rx,L.rz)*0.72;bx.expandByPoint(new G.Vector2(L.c.x-r,L.c.z-r));bx.expandByPoint(new G.Vector2(L.c.x+r,L.c.z+r));top=Math.max(top,L.c.y+L.ru*0.95);});
    const ext=Math.max(bx.max.x-bx.min.x,bx.max.y-bx.min.y)/2;
    const kx=Math.min(1.3,Math.max(0.6,(Rc-4*mg)/Math.max(0.1,ext))), ky=Math.min(1.3,Math.max(0.65,(H-mg*3)/Math.max(0.1,top)));
    lobulos.forEach(L=>{L.c.x*=kx;L.c.z*=kx;L.rx*=kx;L.rz*=kx;L.c.y*=ky;L.ru*=ky;L.rd*=ky;});
  })();
  const dLob=(p,L)=>{const ab=p.y<L.c.y?1-0.3*Math.min(1,(L.c.y-p.y)/L.rd):1, dx=(p.x-L.c.x)/(L.rx*ab), dz=(p.z-L.c.z)/(L.rz*ab), dy=(p.y-L.c.y)/(p.y>L.c.y?L.ru:L.rd); return Math.sqrt(dx*dx+dy*dy+dz*dz);};
  const campo=p=>{let m=9;for(const L of lobulos){const d=dLob(p,L);if(d<m)m=d;}return m;};
  yield;

  // Puntos de atracción
  const atr=[], caja=new G.Box3();
  lobulos.forEach(L=>{caja.expandByPoint(new G.Vector3(L.c.x-L.rx,L.c.y-L.rd,L.c.z-L.rz));caja.expandByPoint(new G.Vector3(L.c.x+L.rx,L.c.y+L.ru,L.c.z+L.rz));});
  const esc=Math.min(1,Math.max(0.12,Math.pow(Rc/4.7,2))), nAtr=Math.round((800+1100*P.densidad)*esc), grosor=0.16+0.14*P.densidad;
  for(let i=0;i<nAtr*60&&atr.length<nAtr;i++){
    if(++vueltas%CADA===0) yield;
    const p=new G.Vector3(V(caja.min.x,caja.max.x),V(Math.max(0.15,caja.min.y),caja.max.y),V(caja.min.z,caja.max.z));
    const rr=Math.min(1,Math.hypot(p.x,p.z)/Rc), yMin=H*(0.08+0.4*Math.pow(1-rr,1.2)*(1-0.3*P.falda));
    if(p.y<yMin) continue;
    const f=campo(p); if(f<=1&&(f>1-grosor||R()<0.08)) atr.push(p);
  }
  yield;

  // Colonización del espacio
  const paso=Math.max(0.05,Rc*0.07), radioInf=paso*6, muerte2=Math.pow(paso*1.6,2), inf2=radioInf*radioInf;
  const nodos=[], rejilla=new Map(), ck=(x,y,z)=>x+","+y+","+z;
  const meter=i=>{const p=nodos[i].p,k=ck(Math.floor(p.x/radioInf),Math.floor(p.y/radioInf),Math.floor(p.z/radioInf));let l=rejilla.get(k);if(!l){l=[];rejilla.set(k,l);}l.push(i);};
  madres.forEach(m=>{for(let t=0.5;t<=1.001;t+=0.125){nodos.push({p:m.curve.getPointAt(t).clone(),parent:-1,raiz:true,r:m.r,hijos:0,dir:m.curve.getTangentAt(t)});meter(nodos.length-1);}});
  const vivos=atr.map(()=>true); let quedan=atr.length;
  const tope=Math.round(6000*esc)+300;
  for(let it=0;it<90&&quedan>0&&nodos.length<tope;it++){
    const empuje=new Map();
    for(let ai=0;ai<atr.length;ai++){
      if(++vueltas%CADA===0) yield;
      const a=atr[ai];
      if(!vivos[ai]) continue;
      const gx=Math.floor(a.x/radioInf),gy=Math.floor(a.y/radioInf),gz=Math.floor(a.z/radioInf);
      let best=-1,bd=inf2;
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
        const l=rejilla.get(ck(gx+x,gy+y,gz+z)); if(!l) continue;
        for(const ni of l){const d=nodos[ni].p.distanceToSquared(a); if(d<bd){bd=d;best=ni;}}
      }
      if(best<0) continue;
      if(bd<muerte2){vivos[ai]=false;quedan--;continue;}
      const v=a.clone().sub(nodos[best].p).normalize(), e=empuje.get(best);
      if(e) e.add(v); else empuje.set(best,v);
    }
    if(!empuje.size) break;
    for(const [ni,v] of empuje){
      if(++vueltas%CADA===0) yield;
      if(v.lengthSq()<1e-6) continue;
      v.normalize(); const pn=nodos[ni].p, hl=Math.hypot(pn.x,pn.z)||1;
      v.x+=pn.x/hl*0.35+V(-.12,.12); v.y+=0.1+V(-.06,.12); v.z+=pn.z/hl*0.35+V(-.12,.12); v.normalize();
      nodos.push({p:nodos[ni].p.clone().addScaledVector(v,paso),parent:ni,dir:v,r:0,hijos:0});
      nodos[ni].hijos++; meter(nodos.length-1);
    }
    yield;
  }
  // Brotes de superficie
  const escR=Math.min(1.1,Math.max(0.3,Rc/4.7));
  nodos.forEach(n=>n.hE=n.hijos);
  const estructurales=nodos.length;
  const cercano=p=>{
    const gx=Math.floor(p.x/radioInf),gy=Math.floor(p.y/radioInf),gz=Math.floor(p.z/radioInf); let best=-1,bd=Infinity;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const l=rejilla.get(ck(gx+x,gy+y,gz+z)); if(!l) continue;
      for(const ni of l){const d=nodos[ni].p.distanceToSquared(p); if(d<bd){bd=d;best=ni;}}}
    if(best<0) for(let ni=0;ni<estructurales;ni++){const d=nodos[ni].p.distanceToSquared(p); if(d<bd){bd=d;best=ni;}}
    return [best,Math.sqrt(bd)];
  };
  const brote=(p,datos)=>{
    const [pa,d]=cercano(p); if(pa<0||d>2.2*escR) return;
    let padre=pa;
    if(d>0.5*escR){
      const m=nodos[pa].p.clone().lerp(p,0.5); m.y-=0.06*d;
      nodos.push({p:m,parent:pa,dir:m.clone().sub(nodos[pa].p).normalize(),r:0,hijos:1,sup:"eje"}); nodos[pa].hijos++; padre=nodos.length-1;
    } else nodos[pa].hijos++;
    nodos.push(Object.assign({p:p.clone(),parent:padre,dir:p.clone().sub(nodos[padre].p).normalize(),r:0,hijos:0},datos));
  };
  if(H>2.3) for(const L of lobulos){
    const sx=L.rx*0.66, sy=L.ru*0.6, sz=L.rz*0.66, cy=L.c.y+L.ru*0.1;
    const vol=4.18879*sx*sy*sz, nr=Math.round(vol/(0.3*Math.pow(escR,3))*(0.15+1.3*P.relleno));
    for(let k=0,intentos=0;k<nr&&intentos<nr*4;intentos++){
      if(++vueltas%CADA===0) yield;
      const u=new G.Vector3(V(-1,1),V(-1,1),V(-1,1)); if(u.lengthSq()>1) continue;
      const t=u.length(), pr=new G.Vector3(L.c.x+u.x*sx,cy+u.y*sy,L.c.z+u.z*sz);
      const rq=Math.min(1,Math.hypot(pr.x,pr.z)/Rc); if(pr.y<H*(0.08+0.4*Math.pow(1-rq,1.2)*(1-0.3*P.falda))) continue;
      k++; brote(pr,{sup:"relleno",tR:t,rot:new G.Euler(V(0,6.28),V(0,6.28),V(0,6.28)),e:escR*V(0.9,1.4)});
    }
    const area=4*Math.PI*((sx*sy+sx*sz+sy*sz)/3), nk=Math.round(area/(0.07*escR*escR)*(0.55+0.5*P.densidad));
    const u=new G.Vector3(), q=new G.Vector3();
    for(let k=0;k<nk;k++){
      if(++vueltas%CADA===0) yield;
      u.set(V(-1,1),V(-1,1),V(-1,1)); if(u.lengthSq()>1||u.lengthSq()<0.01){k--;continue;} u.normalize();
      q.set(L.c.x+u.x*sx*1.04,cy+u.y*sy*1.04,L.c.z+u.z*sz*1.04);
      const nrm=new G.Vector3(u.x/sx,u.y/sy,u.z/sz).normalize();
      const hl=Math.hypot(q.x,q.z)||1; if(nrm.y<0.3&&(nrm.x*q.x+nrm.z*q.z)/hl<-0.35) continue;
      const rr=Math.min(1,hl/Rc); if(q.y<H*(0.08+0.4*Math.pow(1-rr,1.2)*(1-0.3*P.falda))) continue;
      brote(q,{sup:"hoja",nrm,bajo:Math.max(0,Math.min(1,(H*0.55-q.y)/(H*0.45)))});
    }
  }
  yield;
  // Peso de la cosecha
  const pesoEst=ESTADOS[estado].fruto?(estado==="verde"?0.6:1):0, kVence=P.carga*P.carga*pesoEst;
  const tVence=p=>{const t=Math.max(0,Math.min(1,(Math.hypot(p.x,p.z)-0.4*Rc)/(0.7*Rc)));return t*t;};
  const vence=p=>{if(kVence>0){p.y=Math.max(0.3,p.y-kVence*0.2*H*tVence(p));}return p;};
  nodos.forEach(n=>{if(!n.raiz) vence(n.p);});
  yield;
  // Grosor por el modelo de tubería
  const rPunta=Math.max(0.004,0.008*Math.sqrt(Rc/4.7)), EXP=2.9, rMax=0.07*Math.min(1,Math.max(0.3,Rc/4.7));
  nodos.forEach(n=>n.pw=0);
  for(let i=nodos.length-1;i>=0;i--){
    const n=nodos[i]; if(n.raiz) continue;
    if(!n.hijos) n.pw=Math.pow(rPunta,EXP);
    n.r=Math.min(rMax,Math.pow(n.pw,1/EXP));
    const pa=nodos[n.parent]; if(pa.raiz) n.r=Math.min(n.r,pa.r*0.75); else pa.pw+=n.pw;
  }
  yield;
  // Poda reciente (base: una poda ligera del 20 %)
  const podaEf=PODA_BASE+(1-PODA_BASE)*P.poda;
  const quitado=new Uint8Array(nodos.length), cortes=[];
  if(podaEf>0){
    const Rp=rngFrom(semilla*313+7), tam=new Int32Array(nodos.length);
    for(let i=nodos.length-1;i>=0;i--){const n=nodos[i]; if(n.sup||n.raiz) continue; tam[i]+=1; tam[n.parent]+=tam[i];}
    const tMin=Math.max(3,Math.round(estructurales*0.004)), tMax=Math.max(tMin+2,Math.round(estructurales*0.12));
    yield;
    for(let i=0;i<nodos.length;i++){
      if(++vueltas%(CADA*16)===0) yield;
      const n=nodos[i]; if(n.raiz) continue;
      if(quitado[n.parent]){quitado[i]=1;continue;}
      if(n.sup||tam[i]<tMin||tam[i]>tMax) continue;
      const hd=Math.hypot(n.p.x,n.p.z)/Rc, interior=hd<0.45&&n.p.y>hCruz*1.2, chupon=n.dir.y>0.85;
      if(Rp()<podaEf*(chupon?0.8:interior?0.35:0.035)){quitado[i]=1;cortes.push(i);}
    }
  }
  yield;
  // Todas las ramas finas en una sola malla de prismas de 5 caras (como build(); la huella olivo-2 es esta). Metadato aparte, fuera de la huella:
  // brote[k] = 1 si el prisma k es de un brote de superficie (la malla «brotes» del MOTOR de la maqueta), para los niveles de detalle
  {
    const brote=[];
    const pos=[],uv=[],idx=[],SID=5,t=new G.Vector3(),n1=new G.Vector3(),n2=new G.Vector3(),aux=new G.Vector3();
    let b=0;
    for(let ni=0;ni<nodos.length;ni++){
      if(++vueltas%CADA===0) yield;
      const n=nodos[ni];
      if(n.raiz||n.sup==="relleno"||quitado[ni]) continue; const pa=nodos[n.parent];
      t.subVectors(n.p,pa.p); const L=t.length(); if(L<1e-5) continue; t.divideScalar(L);
      aux.set(0,1,0); if(Math.abs(t.y)>0.9) aux.set(1,0,0); n1.crossVectors(t,aux).normalize(); n2.crossVectors(t,n1);
      const r0=pa.raiz?n.r*1.15:Math.min(pa.r,n.r*1.25), r1=n.r;
      [[pa.p,r0,0],[n.p,r1,L*2]].forEach(([c,r,v])=>{
        for(let j=0;j<=SID;j++){const an=j/SID*Math.PI*2,cx=Math.cos(an)*r,sy=Math.sin(an)*r;
          pos.push(c.x+n1.x*cx+n2.x*sy,c.y+n1.y*cx+n2.y*sy,c.z+n1.z*cx+n2.z*sy); uv.push(j/SID,v);}
      });
      for(let j=0;j<SID;j++){const a0=b+j,a1=b+SID+1+j; idx.push(a0,a1,a0+1,a1,a1+1,a0+1);}
      b+=2*(SID+1); brote.push(n.sup?1:0);
    }
    const g=new G.BufferGeometry();
    g.setAttribute("position",new G.Float32BufferAttribute(pos,3)); g.setAttribute("uv",new G.Float32BufferAttribute(uv,2));
    g.setIndex(idx); yield* normales(G,g);
    piezas.push(piezaMalla(g,"corteza",{rol:"ramas",brote:Uint8Array.from(brote)}));
  }
  yield;
  // Tocones de la poda; color del corte: gris viejo sin poda reciente, claro cuanto más reciente y fuerte
  const corte=new G.Color(0x6f665a).lerp(new G.Color(0xe2cf9c),Math.min(1,P.poda*3)).toArray();
  if(cortes.length){
    const lado=[], cara=[];
    const Qt=new G.Quaternion(), St=new G.Vector3(), d=new G.Vector3(), c=new G.Vector3();
    cortes.forEach(i=>{
      const n=nodos[i], pa=nodos[n.parent]; d.subVectors(n.p,pa.p); const L=d.length(); d.divideScalar(L||1);
      const lt=Math.min(0.06,L*0.5), r=Math.max(0.006,n.r*1.05);
      Qt.setFromUnitVectors(new G.Vector3(0,1,0),d);
      c.copy(pa.p).addScaledVector(d,lt/2); St.set(r,lt,r); lado.push({m:new G.Matrix4().compose(c,Qt,St)});
      c.copy(pa.p).addScaledVector(d,lt); St.set(r,1,r); cara.push({m:new G.Matrix4().compose(c,Qt,St)});
    });
    piezas.push(yield* piezaInstancias("tocon","corteza",lado,{color:false,sombra:[true,false]}));
    piezas.push(yield* piezaInstancias("corte","corte",cara,{color:false,sombra:[false,false]}));
  }
  // Tutor del plantón
  if(H<2.3){
    const g=new G.CylinderGeometry(0.012,0.012,H*0.9,8);
    piezas.push(piezaMalla(g,"tutor",{sombra:[true,false],pos:[tr*2.2,H*0.45,0]}));
  }
  yield;

  // Copa: ramitas en las puntas de esas ramas, mirando hacia fuera; en la falda se doblan hacia abajo
  const M=new G.Matrix4(),Q=new G.Quaternion(),Q2=new G.Quaternion(),S=new G.Vector3(),col=new G.Color();
  const UP=new G.Vector3(0,1,0), dv=new G.Vector3(), pos=new G.Vector3();
  const Rf=rngFrom(semilla*977+5), Vf=(a,b)=>a+(b-a)*Rf(), cf=0.15+1.7*P.carga;
  const caja2=new G.Box3();
  const ramitas=[], frutos=[], est=ESTADOS[estado];
  let nodoActual=-1;
  const ponRamita=(p,dir,s)=>{
    Q.setFromUnitVectors(UP,dir); Q2.setFromAxisAngle(dir,V(0,6.28)); Q.premultiply(Q2);
    pos.copy(p).addScaledVector(dir,-0.1*s); S.set(s,s,s); M.compose(pos,Q,S);
    const b=V(0.95,1.22); col.setRGB(b,b,b*V(0.88,0.98));
    ramitas.push({m:M.clone(),c:col.toArray(),t:R()<0.5?0:1,nodo:nodoActual});
    caja2.expandByPoint(pos.clone().addScaledVector(dir,0.57*s));
  };
  for(let ni=0;ni<nodos.length;ni++){
    if(++vueltas%CADA===0) yield;
    const n=nodos[ni];
    if(n.raiz||n.sup||quitado[ni]) continue; nodoActual=ni;
    const punta=n.hE===0, nc=Math.round((punta?9+(R()*5|0):n.hijos<=2?3+(R()*2|0):(R()<0.6?1:0))*(0.55+0.55*P.densidad));
    const bajo=Math.max(0,Math.min(1,(H*0.55-n.p.y)/(H*0.45)));
    for(let k=0;k<nc;k++){
      dv.copy(n.dir).add(new G.Vector3(V(-.55,.55),V(-.35,.5),V(-.55,.55)));
      dv.y-=bajo*P.falda*0.8+kVence*0.9*tVence(n.p); dv.normalize();
      ponRamita(n.p,dv.clone(),escR*V(1.0,1.35));
    }
    if(punta&&n.p.y>H*0.78&&R()<P.varetas*0.25*(1-podaEf)){
      for(let k=0;k<2;k++) ponRamita(n.p.clone().add(new G.Vector3(0,0.2*escR,0)),new G.Vector3(V(-.15,.15),1,V(-.15,.15)).normalize(),escR*0.8);
    }
    if(est.fruto&&punta){
      const nf=Math.round(est.fruto*cf*Vf(0.5,3));
      for(let k=0;k<nf;k++){
        pos.set(Vf(-.3,.3)*escR,Vf(-.38,-.05)*escR,Vf(-.3,.3)*escR).add(n.p);
        Q.setFromEuler(new G.Euler(Vf(-.3,.3),0,Vf(-.3,.3)));
        const ro=est.radio*Vf(0.85,1.15); S.set(ro,ro*1.3,ro); M.compose(pos,Q,S);
        frutos.push({m:M.clone(),c:est.colorFruto(Rf),nodo:ni});
      }
    }
  }
  yield;
  // Fondo de follaje y contorno: cada pieza sobre su brote de madera
  const rellenos=[];
  for(let ni=0;ni<nodos.length;ni++){
    if(++vueltas%CADA===0) yield;
    const n=nodos[ni];
    if(quitado[ni]) continue;
    if(n.sup==="relleno"){
      Q.setFromEuler(n.rot); S.set(n.e,n.e,n.e); M.compose(n.p,Q,S);
      const bb=(0.5+0.45*n.tR)*(0.85+0.3*Math.max(0,(n.p.y-H*0.4)/(H*0.6))); col.setRGB(bb,bb,bb*0.95);
      rellenos.push({m:M.clone(),c:col.toArray(),nodo:ni});
    } else if(n.sup==="hoja"){
      nodoActual=ni;
      dv.copy(n.nrm).add(new G.Vector3(V(-.45,.45),V(-.25,.4),V(-.45,.45))); dv.y-=n.bajo*P.falda*0.7+kVence*0.9*tVence(n.p); dv.normalize();
      ponRamita(n.p,dv.clone(),escR*V(0.95,1.3));
      if(est.fruto&&Rf()<0.35){
        const nf=Math.round(est.fruto*cf*Vf(0.5,2.5));
        for(let j=0;j<nf;j++){
          pos.set(Vf(-.25,.25)*escR,Vf(-.3,0)*escR,Vf(-.25,.25)*escR).add(n.p).addScaledVector(n.nrm,(est.flor===null&&est.radio>0.02?0.24:0.12)*escR);
          Q.setFromEuler(new G.Euler(Vf(-.3,.3),0,Vf(-.3,.3)));
          const ro=est.radio*Vf(0.85,1.15); S.set(ro,ro*1.3,ro); M.compose(pos,Q,S);
          frutos.push({m:M.clone(),c:est.colorFruto(Rf),nodo:ni});
        }
      }
    }
  }
  if(rellenos.length) piezas.push(yield* piezaInstancias("relleno","relleno",rellenos,{nodo:true,sombra:[true,true],prof:"relleno_sombra",rol:"relleno"}));
  const padre=Int32Array.from(nodos,n=>n.raiz?-1:n.parent);
  const sinMadera=ramitas.filter(x=>x.nodo<0).length+rellenos.filter(x=>x.nodo<0).length+frutos.filter(x=>x.nodo<0).length;
  const cuenta={cortes:cortes.length,quitados:quitado.reduce((a,b)=>a+b,0),sinMadera,brotes:nodos.length-estructurales,rellenos:rellenos.length,ramitas:ramitas.length,frutos:frutos.length,nodos:nodos.length};
  for (const t of [0,1]) {
    const lista=ramitas.filter(x=>x.t===t); if(!lista.length) continue;
    piezas.push(yield* piezaInstancias("ramita","ramita"+t,lista,{nodo:true,sombra:[true,true],prof:"ramita"+t+"_sombra",rol:"ramitas"}));
  }
  if(frutos.length) piezas.push(yield* piezaInstancias("oliva","oliva",frutos,{nodo:true,sombra:[true,false],rol:"olivas"}));
  yield;

  // Medida (madera + puntas de ramitas) y ajuste a la altura y el diámetro pedidos. Caja como la de Box3.setFromObject en r128: la caja de la
  // geometría de cada hija con la matriz de la hija (las instancias NO cuentan: una InstancedMesh aporta solo la caja de su geometría base)
  const medida=new G.Box3(), bx=new G.Box3(), mh=new G.Matrix4(), v3=new G.Vector3(), q4=new G.Quaternion(), s3=new G.Vector3();
  for(const p of piezas){
    bx.copy(p.geo==="propia"?p._caja:GEOS[p.geo].caja);
    mh.compose(v3.fromArray(p.pos),q4.fromArray(p.rot),s3.fromArray(p.esc));
    bx.applyMatrix4(mh); medida.union(bx);
    delete p._caja;
  }
  medida.union(caja2);
  const ancho=Math.max(medida.max.x-medida.min.x,medida.max.z-medida.min.z);
  const fy=Math.min(1.4,Math.max(0.6,H/Math.max(0.1,medida.max.y))), fxz=Math.min(1.4,Math.max(0.6,P.copa/Math.max(0.1,ancho)));

  const entrada={tipo:tipo==null?null:tipo,epoca:estado,semilla:semillaE};
  if(parametros) entrada.parametros=parametros;
  return { v: GEN_VERSION, entrada, escala: [fxz, fy, fxz], corte, cuenta, padre, piezas,
    medidas: { altura_m: medida.max.y * fy, copa_m: ancho * fxz, pies } };
}

/** El generador hasta el final, de una vez (para Node, el oráculo y el trabajador) */
export function receta(G, entrada) {
  const g = recetaG(G, entrada);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

/** Triángulos de una receta (lo que dibuja montaOlivo) */
export function triangulos(r, G) {
  const TRI = { oliva: 20, relleno: 2, tocon: 14, corte: 9, ramita: 2 };
  return r.piezas.reduce((t, p) => t + (p.indice ? p.indice.length / 3 : TRI[p.geo]) * (p.clase === "instancias" ? p.n : 1), 0);
}
