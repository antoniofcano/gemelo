// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: colocaBalizas, avisoBaliza, dibujaBalizasMini, actualizaBalizas
// Consume: 01_datos (D, $), 02_mundo (suelo), 02c_componentes (Bus, Componentes), 02e_entidades (Entidades, Usables), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (visor, scene, camera, Estado), 09_camara (objetivo), 12_paseo (paseando, pp), 12b_llegada (Llegada),
//   13_parcelas (parcelas), 13b_hazas (HazasPuro), 14_historia (OT, VIVO), 15_tiempo (num1, esc), 16_vida (tVida, enQuad), 24_pantalla (TR),
//   26_presencia (Encuentro, sitioJunto), 29_vr (VRX)
// Nota: Registra el tipo baliza en Entidades (C7). Publica además window.__vrBalizas (pruebas VR: el pie de cada columna de luz).
// ===============================================================================
  // ---------- las balizas: una por parcela, con lo que OlivarTrack sabe de ella; en el paseo, al acercarte, sale su ficha
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/balizas.ts (Mundos.creaBalizas), componente «balizas-parcela» de los mundos ["exterior"] con un
  // libera() que suelta el grupo, las geometrías, los materiales, el tipo «baliza» de Entidades, el oyente de la ficha, el aviso del minimapa y window.__vrBalizas (L2-05).
  // Aquí solo se cablea lo del legado. OT, VIVO, paseando, enQuad y tVida los reescriben otros módulos (primitivas del legado, no pueden ser importaciones, MUNDOS §9.3): entran
  // como funciones que los leen en cada uso. TR (24_pantalla), Encuentro y sitioJunto (26_presencia) y VRX (29_vr) se montan DESPUÉS de este módulo: también por función.
  // [talón] apps/web/src/mundos/exterior/balizas.ts
  var Balizas = Mundos.creaBalizas({
    THREE: THREE, $: $, suelo: suelo, bus: Bus, Entidades: Entidades, Usables: Usables, Materiales: Materiales, Estaticos: Estaticos, visor: visor, scene: scene, camera: camera, Estado: Estado,
    objetivo: objetivo, pp: pp, Llegada: Llegada, parcelas: parcelas, HazasPuro: HazasPuro, D: D, num1: num1, esc: esc, documento: document, ventana: window,
    paseando: function () { return paseando; }, OT: function () { return OT; }, VIVO: function () { return VIVO; }, tVida: function () { return tVida; }, enQuad: function () { return enQuad; },
    TR: function () { return TR; }, Encuentro: function () { return Encuentro; }, VRX: function () { return VRX; }, sitioJunto: function (c, desde, r, dist) { return sitioJunto(c, desde, r, dist); }
  });
  var colocaBalizas = Balizas.colocaBalizas, avisoBaliza = Balizas.avisoBaliza, dibujaBalizasMini = Balizas.dibujaBalizasMini, actualizaBalizas = Balizas.actualizaBalizas;
  Componentes.registra(Mundos.manifiestoBalizas(Balizas));
