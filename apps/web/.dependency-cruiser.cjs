// Las cuatro fronteras de apps/web/src/ (MUNDOS §1, ADR-0033). Se ejecuta desde apps/web:
//   npx depcruise --config .dependency-cruiser.cjs src
// Lo comprueba pruebas/guardianes/tipos_web.test.js (también que una frontera rota SÍ se detecta).
//
//   nucleo/  no importa de nadie            datos/   no importa de nadie
//   red/     importa solo de datos          mundos/  importa de nucleo, datos y red; un mundo no importa a otro
//   ui/      cliente de todo                motor/   (legado) fuera de src/: nada de src/ lo importa
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "sin-ciclos",
      comment: "Ninguna dependencia circular dentro de src/.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "nucleo-no-importa-de-nadie",
      comment: "nucleo/ es la base: no importa de datos, red, mundos ni ui.",
      severity: "error",
      from: { path: "^src/nucleo/" },
      to: { path: "^src/(datos|red|mundos|ui)/" },
    },
    {
      name: "datos-no-importa-de-nadie",
      comment: "datos/ (contratos, índice, teselas) no importa de nucleo, red, mundos ni ui.",
      severity: "error",
      from: { path: "^src/datos/" },
      to: { path: "^src/(nucleo|red|mundos|ui)/" },
    },
    {
      name: "red-solo-importa-de-datos",
      comment: "red/ no sabe qué hay dentro de un mundo: solo conoce salas e identidades (importa de datos, no de nucleo, mundos ni ui).",
      severity: "error",
      from: { path: "^src/red/" },
      to: { path: "^src/(nucleo|mundos|ui)/" },
    },
    {
      name: "mundos-no-importa-de-ui",
      comment: "mundos/ depende de nucleo, datos y red; nunca de ui.",
      severity: "error",
      from: { path: "^src/mundos/" },
      to: { path: "^src/ui/" },
    },
    {
      name: "un-mundo-no-importa-a-otro",
      comment: "Cada mundo (mundos/exterior, molino, bodega) es un paquete: no importa de otro mundo.",
      severity: "error",
      from: { path: "^src/mundos/([^/]+)/" },
      to: { path: "^src/mundos/([^/]+)/", pathNot: "^src/mundos/$1/" },
    },
    {
      name: "renderer-solo-en-nucleo-render",
      comment: "Solo nucleo/render y la fábrica de materiales importan lo que depende del renderer (three/webgpu).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/nucleo/(render|materiales)" },
      to: { path: "node_modules/three/build/three\\.(webgpu|tsl)" },
    },
    {
      name: "src-no-importa-del-legado",
      comment: "Nada en src/ importa de apps/web/motor/: el legado llega por argumento (MUNDOS §9.3).",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "(^|/)motor/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    moduleSystems: ["es6", "cjs"],
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
