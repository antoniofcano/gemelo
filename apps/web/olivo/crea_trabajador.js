// El trabajador de módulo (Vite lo empaqueta por este patrón literal). En el IIFE se sustituye por sin_trabajador.js.
export const creaTrabajador = () => new Worker(new URL("./trabajador.js", import.meta.url), { type: "module" });
