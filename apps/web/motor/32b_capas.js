// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos ($), 02c_componentes (Componentes)
// ===============================================================================
  // ---------- punto de extensión de las capas del mundo (ADR-0023, C2): Capas.registra(def) pone una casilla en la ventana «Capas y vista», con la pastilla de su
  // procedencia (regla 5). MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/capas.ts (CapasPuro y Capas), componente «capas-mundo» de TODOS
  // los mundos con un libera() que saca las casillas registradas. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/ui/capas.ts
  var CapasPuro = Interfaz.CapasPuro;
  var Capas = Interfaz.creaCapas({ $: $, documento: document });
  Componentes.registra(Interfaz.manifiestoCapas(Capas));
