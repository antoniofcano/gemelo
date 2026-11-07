// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 01a_aparato (Aparato), 02c_componentes (ConfigPuro, Teclas, Componentes), 02d_laminas (Laminas), 03_escena (visor),
//   29_vr (VRX, PanelVR), 33_ajustes (Ajustes), 46b_primera_vez (PrimeraVezPuro)
// Nota: Componente «habla-guiada» (F3e, ADR-0026; decisiones 157-162): la interacción de la voz en la visita guiada, solo dentro de una sala guiada y con papel. «Hablar» con botón (≥ 44 px; 56 en el navegador de Quest), tecla T y, en VR, el gatillo izquierdo (VRX.voz, que 29_vr.js lee cada fotograma), en dos modos según el ajuste «Hablar» de Configuración: pulsar para abrir y cerrar (por defecto) o mantener pulsado (familias; el guía siempre pulsa y abre su micro con el primer gesto, una vez). Sin la palabra, «Levantar la mano» / «Bajar la mano» por la api de F3c y «Estás 2.º en la cola» (la cola, de la api «Guiada» de 46). El micro siempre con icono y texto en una región aria-live; «Silenciarme» siempre a mano; el aviso de que con el micro abierto el sonido no es espacial y la casilla «Llevo auriculares» (Voz.auriculares). En VR, una lámina de 3 s al abrir o cerrar, una fila del panel («Ir a») y un pulso del mando. F3k-2: lo mismo dentro de un corro (papel «miembro»), con el micro que se cierra solo tras 60 s sin que se te oiga. Emite «habla:micro» y «habla:mano»; escucha «voz:estado», «guiada:palabra» y «depura:lineas». ?habla=0 lo apaga. Publica window.__habla (pruebas). Todo con textContent. MU5-n (A3-6b): talón; el componente vive en apps/web/src/mundos/comun/habla.ts (de todo mundo) y su lógica pura, con el aviso de voz, en apps/web/src/red/voz/habla.ts. Lo prueban habla.test.ts y en Node pruebas/guardianes/habla.test.js (HablaPuro y creaHabla, de Mundos).
// ===============================================================================
  // ---------- hablar en la visita guiada y en un corro (F3e, F3j, F3l, F3k-2; ADR-0026 y ADR-0032), componente «habla-guiada». MU5-n (A3-6b): migrado a TypeScript tal
  // cual; el componente y la explicación entera viven en apps/web/src/mundos/comun/habla.ts (dibuja: la caja, el aviso de voz, las láminas y la fila del panel de VR) y
  // su lógica pura, con el texto del aviso de voz y su AVISO_VERSION, en apps/web/src/red/voz/habla.ts. De TODO mundo (mundos: "todos"), con un libera() que cierra el
  // aviso y la tarjeta, la lámina, suelta el gatillo de VR y quita la caja y el gancho. Aquí se cablea lo del legado: lo que otros módulos reescriben (VRX, Aparato,
  // PanelVR: A3-6c) o el código de siempre comprobaba con typeof (Ajustes, PrimeraVezPuro, Laminas, Teclas) entra por getters.
  // [talón] apps/web/src/mundos/comun/habla.ts
  Componentes.registra(Mundos.manifiestoHabla({
    location: location, window: window, document: document, fetch: function (u, o) { return fetch(u, o); }, D: D, ConfigPuro: ConfigPuro, visor: visor,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get Aparato() { return Aparato; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get PrimeraVezPuro() { return PrimeraVezPuro; },
    get Laminas() { return typeof Laminas !== "undefined" ? Laminas : undefined; }, get Teclas() { return typeof Teclas !== "undefined" ? Teclas : undefined; }
  }));
