// Lo que Vite define al construir y el código movido de apps/web/motor/ nombra (A3-7a): solo tipos, sin código.
// __GEMELO_VERSION__ lo inyecta apps/web/vite.config.js (define) desde VERSION; ui/mide.ts (antes 30_mide) lo lee con typeof, por si no está (Node, pruebas).
declare const __GEMELO_VERSION__: string;
// XRWebGLBinding (WebXR Layers) no está en los tipos del DOM de TypeScript; ui/mide.ts (la sonda del multiview) lo mira con typeof antes de usarlo.
declare const XRWebGLBinding: any;
