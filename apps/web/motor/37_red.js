// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Componentes)
// Nota: Componente «red-salas» (ADR-0023, C5): el único que habla con LiveKit (import("livekit-client") la primera vez que alguien se une a una sala). Solo se registra; expone «Red» por n.api: salas por clave, unirse, salir o cambiar, publicar y escuchar por tema, estado y participantes. Emite «red:estado». MU5-n (A3-6a): talón; el código vive en apps/web/src/red/salas.ts (componente de todo mundo). Lo prueban salas.test.ts y pruebas/guardianes/red.test.js con un LiveKit de mentira.
// ===============================================================================
  // ---------- la red en tiempo real (C5, ADR-0023; doc/sistema/COMPONENTES.md §6): el componente «red-salas» es el ÚNICO que habla con LiveKit. MU5-n (A3-6a): migrado a
  // TypeScript; el código y la explicación entera viven en apps/web/src/red/salas.ts, componente de TODO mundo (mundos: "todos") con un libera() que cierra todas las salas.
  // Aquí se cablea lo del legado: la importación dinámica de livekit-client se queda escrita aquí, en carga, para que Vite la trocee como antes (solo se llama cuando alguien
  // se une a una sala).
  // [talón] apps/web/src/red/salas.ts
  Componentes.registra(Mundos.manifiestoRed({
    carga: function () { return import("livekit-client"); }, base: function () { return location.href; }, consola: console
  }));
