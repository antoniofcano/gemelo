// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02c_componentes (Componentes), 02d_laminas (Laminas), 03_escena (visor), 13b_hazas (HazasPuro), 26_presencia (Chat),
//   29_vr (VRX), 31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Talón (MU5-n, A3-7b2; partido en A3-8b) de apps/web/src/ui/oficina-mundo.ts, componente «oficina-mundo» de todo mundo (OF10, ADR-0023 y ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo y tiene que llegar en cualquiera. Solo se registra; nadie lo nombra. Consume la red (sala «visita») y la presencia. Anuncios (tema «anuncio»: aviso arriba, lámina en VR y chat), invitación a otra sala (tema «sala»: «Ir» o «Quedarme») y, si tu rol en la sala es de oficina, la ventana «Oficina» (anunciar, invitar y, en el exterior, poner baliza). Valida también el tema «balizas» y se lo pasa a 39b. Los tres temas solo valen SIN participante (los manda la api). Emite oficina:anuncio y oficina:sala. Publica window.__oficinaMundo (pruebas: el estado de los dos). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/oficina_mundo.test.js.
// ===============================================================================
  // ---------- el mundo en modo oficina (OF10). A3-8b: los anuncios, las invitaciones y el panel, componente de todo mundo; las balizas oficiales, del exterior, en 39b. VRX, por getter.
  // [talón] apps/web/src/ui/oficina-mundo.ts
  Componentes.registra(Interfaz.manifiestoOficinaMundo({
    D: D, Componentes: Componentes, Laminas: Laminas, visor: visor, HazasPuro: HazasPuro, Chat: Chat, Hud: Hud, Ventanas: Ventanas, get VRX() { return VRX; } }));
