// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Bus, Componentes), 02d_laminas (Laminas), 02e_entidades (Entidades, Usables),
//   03_escena (lienzo, camera, Estado), 13b_hazas (HazasPuro, Hazas), 29_vr (VRX)
// Nota: Componente «personalizacion» (P7f, decisiones 91-96 y 99-102): nombrar, colgar una foto o un dibujo, verlo y denunciarlo en los olivos de las hazas. Solo se registra; nadie lo nombra. Sin servidor (sin D.base /teselas/… ni ?api=) no pide ni crea nada. Complementa la ficha común del olivo (Entidades.complementa), reduce la imagen en el aparato, pide el aviso con casilla y habla con /api/sesion, /api/hazas/{id}/olivos, /api/medios, /api/olivos, /api/personalizaciones/{id}/denuncias y /api/hazas/{id}/sugerencias. Publica las decoraciones de la lista (P7g D3) por el Bus («decoraciones:cambian»). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/personalizacion.test.js.
// ===============================================================================

  // ---------- «personalización» (P7f; decisiones 91-96, 99-102; doc/sistema/VIDA.md y contratos/vida.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la
  // explicación viven en apps/web/src/mundos/exterior/personalizacion.ts, componente de los mundos ["exterior"] (vive de los olivos y las hazas del exterior) con un libera() que
  // cancela las peticiones en vuelo y suelta el recuadro, la lámina, los rótulos y window.__personaliza. Aquí solo se cablea lo del legado: VRX (29_vr), que el código
  // comprobaba con typeof, entra por getter.
  // [talón] apps/web/src/mundos/exterior/personalizacion.ts
  Componentes.registra(Mundos.manifiestoPersonalizacion({
    THREE: THREE, D: D, Bus: Bus, Laminas: Laminas, Entidades: Entidades, Usables: Usables, lienzo: lienzo, camera: camera, Estado: Estado, HazasPuro: HazasPuro, Hazas: Hazas,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }
  }));
