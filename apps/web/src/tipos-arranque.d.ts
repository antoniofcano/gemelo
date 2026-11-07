// Solo tipos (A3-8c): lo que la entrada del cliente (src/arranque.ts) pide o lee y TypeScript no conoce. Sin código.
// three no trae tipos en el repo (no hay @types/three; MUNDOS §9.1): src/ recibe THREE por argumento. El arranque lo importa con un @ts-expect-error, como las
// pruebas que lo usan de verdad; los addons que pide con import() y el constructor de olivos (alias «gemelo-olivo» de vite.config.js, o su sustituto vacío)
// se declaran aquí, sin tipos, porque cada import() necesitaría el suyo.
declare module "three/addons/*";
declare module "gemelo-olivo";

// lo que el arranque lee o publica en window: el constructor de olivos ya cargado (apps/web/olivo/), el tiempo de prueba (pruebas) y el estado del bucle (?debug y pruebas)
interface Window {
  OlivoGen?: unknown;
  __TIEMPO_PRUEBA?: unknown;
  __bucle?: unknown;
}
