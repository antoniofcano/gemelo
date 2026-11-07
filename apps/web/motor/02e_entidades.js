// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: EntidadesPuro, Entidades, Usables
// Consume: 01_datos ($), 02c_componentes (Bus, Componentes), 02i_materiales (Materiales), 03_escena (lienzo, scene), 12_paseo (paseando, pp),
//   16_vida (enDron, dr), 29_vr (VRX)
// Nota: Talón (MU5-n, A3-7a) de apps/web/src/ui/entidades.ts, componente «seleccion-usables» de todo mundo. Servicio (ADR-0023, C7): EntidadesPuro, Entidades (registro de tipos de cosas del mundo con id estable; cada módulo registra su tipo y responde por sus cosas) y Usables (la selección única para toque, clic, rayo VR y cercanía, la ficha común #ficha, el anillo de resaltado y los eventos usable:*). Publica además window.__usables (pruebas). EntidadesPuro vive en apps/web/src/nucleo/entidades.ts (A1-11); el registro y la selección, en ui/entidades.ts; su trozo [motor:…] lo evalúa en Node pruebas/guardianes/entidades.test.js.
// ===============================================================================
  // ---------- entidades y usables (ADR-0023, C7; doc/sistema/COMPONENTES.md §6): las cosas del mundo con un id estable y UNA sola forma de elegirlas (el toque, el
  // clic, el rayo de VR y la cercanía), con la ficha común (#ficha) y el anillo de resaltado. La lógica pura vive en apps/web/src/nucleo/entidades.ts (A1-11).
  // MU5-n (A3-7a): el resto también; Entidades y Usables viven en apps/web/src/ui/entidades.ts, componente «seleccion-usables» de TODOS los mundos con un libera() que
  // suelta el anillo, la × de la ficha, su observador y la caja de acciones. Aquí solo se cablea lo del legado: casi todo lo que usa se monta DESPUÉS de este módulo
  // (scene y lienzo en 03, pp en 12, dr y enDron en 16, VRX en 29) o cambia (paseando), y entra por getter.
  // [talón] apps/web/src/ui/entidades.ts
  var EntidadesPuro = Nucleo.EntidadesPuro;
  var EntidadesUsables = Interfaz.creaEntidades({
    $: $, THREE: THREE, Bus: Bus, get Materiales() { return Materiales; }, get scene() { return scene; }, get lienzo() { return lienzo; }, get pp() { return pp; }, get dr() { return dr; },
    get enDron() { return enDron; }, get paseando() { return paseando; }, get VRX() { return VRX; }, ventana: window, documento: document
  });
  var Entidades = EntidadesUsables.Entidades, Usables = EntidadesUsables.Usables;
  Componentes.registra(Interfaz.manifiestoEntidades(EntidadesUsables));
