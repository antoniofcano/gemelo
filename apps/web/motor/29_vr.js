// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Vr, VRX, vrRig, vrDebugExtra, vrMano, vrRayoDe, vrCierra, vrAbre, vrFundido, vrAparece, creaLamina, panel, vrBajoRayo, vrRect, vrAj,
//   PanelVR, vrPintaFicha, vrRecoloca, vrPulso, vrActualiza, vrFin
// Consume: 01_datos (D, $, fmt, VRP), 01a_aparato (Aparato), 02_mundo (suelo, copas), 02b_cola (Cola),
//   02c_componentes (ComponentesPuro, Bus, Config), 02d_laminas (LaminasPuro, Laminas), 02e_entidades (EntidadesPuro, Entidades, Usables),
//   02f_xr_perillas (XrPerillas), 02g_vr_presupuesto (VrControlPuro, VrPresupuesto), 02h_render (InfoDibujo), 02i_materiales (Materiales),
//   03_escena (renderer, scene, camera, sol, texColor, Estado), 04b_escena3d (Escena3D), 04d_sombreado_tiles (UN), 07b_arboles (Arboles),
//   09_camara (pon), 10_ndvi (NDV, ndviIdx), 12_paseo (paseando, persona, teclas, primera, pp, entraPaseo, salePaseo, actualizaPaseo),
//   12b_llegada (Llegada), 13_parcelas (parcelas, fincas), 15_tiempo (meta, pasoHoraMundo, horaMundoTexto), 22_huellas (pendFactor),
//   24_pantalla (TR), 33_ajustes (Ajustes), 90_final (tamano, gm, cuadro, bucle)
// Nota: Publica además window.__vrDebug, __vrOlivo, __vrBotones, __vrVuelo y VR_ESTADO (depuración y pruebas VR).
// ===============================================================================
  // ---------- modo VR inmersivo (WebXR, Meta Quest Browser): el paseo en primera persona con mandos, un panel flotante y un perfil de rendimiento propio.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/ (vr.ts, que reúne vr-rig.ts, vr-teletransporte.ts, vr-panel.ts, vr-sesion.ts y vr-puros.ts),
  // componente «vr» de TODOS los mundos (la VR es de todo mundo) con un libera() que suelta de verdad lo que crea y quita sus escuchas (lo registra 90_final.js, como Vida).
  // Aquí solo se cablea lo del legado: lo que otros módulos reescriben (paseando, primera, persona, teclas, ndviIdx…) o se declara después (Ajustes, TR, gm, cuadro, tamano, bucle)
  // entra por función; los nombres de siempre (VRX, PanelVR, vrActualiza…) son los de Vr.
  // [talón] apps/web/src/mundos/comun/vr.ts
  var Vr = Mundos.creaVr({
    THREE: THREE, renderer: renderer, scene: scene, camera: camera, Estado: Estado, sol: sol, texColor: texColor, D: D, $: $, fmt: fmt, VRP: VRP, Aparato: Aparato,
    suelo: suelo, copas: function () { return copas; }, Cola: Cola, ComponentesPuro: ComponentesPuro, Bus: Bus, Config: Config, LaminasPuro: LaminasPuro, Laminas: Laminas,
    EntidadesPuro: EntidadesPuro, Entidades: Entidades, Usables: Usables, XrPerillas: XrPerillas, VrControlPuro: VrControlPuro, VrPresupuesto: VrPresupuesto, InfoDibujo: InfoDibujo,
    Materiales: Materiales, UN: UN, Arboles: Arboles, Escena3D: Escena3D, pon: function (m) { pon(m); },
    NDV: function () { return NDV; }, ndviIdx: function () { return ndviIdx; }, parcelas: function () { return parcelas; }, fincas: function () { return fincas; }, meta: meta,
    pasoHoraMundo: function (d) { pasoHoraMundo(d); }, horaMundoTexto: function () { return horaMundoTexto(); },
    paseando: function () { return paseando; }, primera: function () { return primera; }, ponPrimera: function (v) { primera = v; }, persona: function () { return persona; },
    teclas: function () { return teclas; }, pp: pp, entraPaseo: function () { entraPaseo(); }, salePaseo: function () { salePaseo(); }, actualizaPaseo: function (dt) { actualizaPaseo(dt); },
    Llegada: Llegada, pendFactor: function () { return pendFactor(); }, TR: TR,
    Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    gm: function () { return gm; }, cuadro: function (t) { cuadro(t); }, tamano: function () { tamano(); }, pideFotograma: function () { requestAnimationFrame(bucle); },
    busqueda: typeof location !== "undefined" ? location.search : "", navegador: navigator, documento: document, ventana: window
  });
  var VRX = Vr.VRX, vrRig = Vr.vrRig, vrDebugExtra = Vr.vrDebugExtra, vrMano = Vr.vrMano, vrRayoDe = Vr.vrRayoDe, vrCierra = Vr.vrCierra, vrAbre = Vr.vrAbre, vrFundido = Vr.vrFundido;
  var vrAparece = Vr.vrAparece, creaLamina = Vr.creaLamina, panel = Vr.panel, vrBajoRayo = Vr.vrBajoRayo, vrRect = Vr.vrRect, vrAj = Vr.vrAj, PanelVR = Vr.PanelVR;
  var vrPintaFicha = Vr.vrPintaFicha, vrRecoloca = Vr.vrRecoloca, vrPulso = Vr.vrPulso, vrActualiza = Vr.vrActualiza, vrFin = Vr.vrFin;
