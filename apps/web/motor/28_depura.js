// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: depuraCuadro
// Consume: 01a_aparato (Aparato), 02_mundo (Mundo), 02b_cola (Cola), 02c_componentes (Bus, Componentes), 02f_xr_perillas (XrPerillas),
//   02h_render (InfoDibujo), 03_escena (visor, renderer), 07b_arboles (Arboles), 29_vr (vrDebugExtra), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- ?debug: un contador en la esquina del visor para medir en el móvil (ms de JS por fotograma, llamadas, triángulos, teselas y olivos por nivel)
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/depura.ts, componente «contador-depura» de TODOS los mundos con un libera() que saca su caja.
  // Aquí solo se cablea lo del legado: vrDebugExtra (29_vr) y Ajustes (33) se montan después y entran por getter.
  // [talón] apps/web/src/ui/depura.ts
  var Depura = Interfaz.creaDepura({
    Aparato: Aparato, Mundo: Mundo, Cola: Cola, Bus: Bus, XrPerillas: XrPerillas, InfoDibujo: InfoDibujo, visor: visor, renderer: renderer, Arboles: Arboles,
    get vrDebugExtra() { return vrDebugExtra; }, get Ajustes() { return Ajustes; }, ventana: window, documento: document
  });
  var depuraCuadro = Depura.depuraCuadro;
  Componentes.registra(Interfaz.manifiestoDepura(Depura));
