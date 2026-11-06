// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D), 02_mundo (suelo), 02c_componentes (Componentes), 02e_entidades (Entidades), 03_escena (scene, Estado)
// Nota: Componente «trabajo-hoy» (F4b, W1): un tractor ilustrativo en cada haza con tarea en curso (DEDUCIDO), APAGADO por defecto (?trabajo=1). TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/trabajo-hoy.ts (Mundos.manifiestoTrabajoHoy). Solo se registra; nadie lo nombra. No pide nada: escucha el evento mundo:hoy. Lo evalúa en Node pruebas/guardianes/trabajo_hoy.test.js (TrabajoHoyPuro y el motor, de Mundos).
// ===============================================================================

  // ---------- trabajo en vivo, paso estático (F4b, tarea W1; componente «trabajo-hoy»): un tractor de juguete en la haza que OlivarTrack dice que tiene una tarea en curso.
  // DEDUCIDO (regla 5): solo se sabe «en esta parcela hay una tarea abierta»; NADA POR PERSONA; el tractor es ILUSTRATIVO. APAGADO POR DEFECTO (?trabajo=1 lo enciende).
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/trabajo-hoy.ts, componente de los mundos ["exterior"] con un libera() que suelta la
  // malla, la geometría y el material, retira la entidad «trabajo» y la escucha de «mundo:hoy» (que emite 53_mundo_hoy.js). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/trabajo-hoy.ts
  Componentes.registra(Mundos.manifiestoTrabajoHoy({
    THREE: THREE, scene: scene, Entidades: Entidades, suelo: suelo, Estado: Estado, D: D
  }));
