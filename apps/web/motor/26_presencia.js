// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro, AutoPresencia, Reintento, sitioJunto
// Consume: 01_datos (D), 02_mundo (suelo, copas)
// Nota: No es un componente ni monta nada: el protocolo y la lógica pura de la presencia compartida (PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro) y sitioJunto. MU5-n (A3-6a): talón; el código vive en apps/web/src/red/pose.ts y sala.ts (lo que es red) y en apps/web/src/mundos/comun/muneco.ts (el muñeco, el encuentro y la cuenta). La presencia que los usa es el componente de 38_presencia_compartida.js (C5). Lo prueban pose.test.ts, sala.test.ts, muneco.test.ts y pruebas/guardianes/presencia.test.js, presencia_red.test.js y muneco_aspecto.test.js.
// ===============================================================================

  // ---------- presencia compartida (F2, contratos/presencia.md): el protocolo y la lógica pura que comparten la presencia y quien la usa. Este fichero NO es un
  // componente ni monta nada. MU5-n (A3-6a): migrado a TypeScript tal cual; lo que es red (sin three) vive en apps/web/src/red/ (pose.ts: PoseCodec y BufferPose;
  // sala.ts: Aspecto, SalaPose, Chat, AutoPresencia y Reintento) y lo que es de dibujo y de mundo, en apps/web/src/mundos/comun/muneco.ts (Muneco, Encuentro, Cuenta
  // y sitioJunto, que también usan las balizas). Aquí se cablean los nombres de siempre: las copas, el recuadro y el suelo de 02_mundo entran por argumento.
  // La presencia que los usa es el componente «presencia-compartida» (38_presencia_compartida.js); la red, 37_red.js; los avatares VRM, 26b_avatares.js.
  // [talón] apps/web/src/red/sala.ts
  var PoseCodec = Mundos.PoseCodec, BufferPose = Mundos.BufferPose, Aspecto = Mundos.Aspecto, SalaPose = Mundos.SalaPose, Chat = Mundos.Chat;
  var Muneco = Mundos.Muneco, Encuentro = Mundos.Encuentro, Cuenta = Mundos.Cuenta, AutoPresencia = Mundos.AutoPresencia, Reintento = Mundos.Reintento;
  var sitioJunto = Mundos.creaSitioJunto({ get copas() { return copas; }, D: D, suelo: function (x, y) { return suelo(x, y); } });
