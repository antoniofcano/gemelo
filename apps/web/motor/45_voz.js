// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01a_aparato (Aparato), 02c_componentes (Componentes), 03_escena (camera), 29_vr (VRX)
// Nota: Componente «voz-guiada» (F3d, ADR-0026; decisiones 157-162): la voz de las visitas guiadas, SOLO en una sala «guiada-<evento>» de la red (Voz.entra(evento) con el token de F3c, Voz.usa(clave) o ?guiada=<evento>; F3f: con ?presencia=red viaja la presencia y la voz usa su conexión, y se engancha sola a una sala de la red que entra en una guiada, «red:estado»). Consume la red y la presencia (Presencia.cabeza: de dónde sale cada voz). Pide las pistas de micrófono, cada una a un <audio> silenciado y de él a Web Audio (ganancia por distancia y PannerNode HRTF; la escucha, la cámara o la cabeza en VR); con tu micrófono abierto y sin auriculares, plano por los <audio> (cancelación de eco). Abre tu micrófono solo con permiso y tras un gesto (Voz.abre; lo dispara F3e). F3k-2: también la sala solo de audio de un corro de la visita libre («corro-<id>», Voz.entraCorro con el token de POST /api/presencia/corros/token, clave «corro» de la red) con su curva (sin suelo mínimo, fundido de 15 a 20 m en 1 s); Voz.silencia deja de pedir la pista de quien silencias (F3k-3). Emite «voz:habla» y «voz:estado»; escucha «audio:desbloquea», «depura:lineas» y «red:estado». Sin grabación. ?voz=0 lo apaga; ?voz=plano, sin espacializar. Publica window.__voz (pruebas). MU5-n (A3-6b): talón; el código vive en apps/web/src/red/voz/voz.ts (componente de todo mundo). Lo prueban voz.test.ts y en Node pruebas/guardianes/voz.test.js (VozPuro y creaVoz, de Mundos).
// ===============================================================================
  // ---------- la voz de las visitas guiadas y de los corros (F3d, F3k-2; ADR-0026 y ADR-0032), componente «voz-guiada». MU5-n (A3-6b): migrado a TypeScript tal cual;
  // el código y la explicación entera viven en apps/web/src/red/voz/voz.ts, componente de TODO mundo (mundos: "todos") con un libera() que sale de su sala de voz,
  // cierra el micrófono, suelta cada voz (<audio>, fuente, ganancia y panner) y cierra el AudioContext. Aquí se cablea lo del legado: lo que otros módulos reescriben
  // (VRX, Aparato) o puede no existir (navigator, MediaStream, PannerNode) entra por getters; la cámara y la aritmética de three (Quaternion, Vector3), por valor.
  // [talón] apps/web/src/red/voz/voz.ts
  Componentes.registra(Mundos.manifiestoVoz({
    THREE: THREE, location: location, window: window, document: document, consola: console, fetch: function (u, o) { return fetch(u, o); }, camera: camera,
    get VRX() { return VRX; }, get Aparato() { return Aparato; }, get navigator() { return typeof navigator !== "undefined" ? navigator : undefined; },
    get MediaStream() { return MediaStream; }, get PannerNode() { return typeof PannerNode === "function" ? PannerNode : undefined; }
  }));
