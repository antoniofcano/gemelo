// Los ganchos de pruebas que el código movido de apps/web/motor/ cuelga de la ventana (A3-7b1): solo tipos, sin código. Los contratos están en contratos/interfaces.json (ganchos_window).
interface Window {
  /** 35_fichas_tiempo (mundos/exterior/fichas-tiempo.ts): abre, cierra y resume la lámina del tiempo (pruebas) */
  __fichaTiempo?: (accion?: string) => unknown;
  /** 51_fichas_mundo (mundos/exterior/fichas-mundo.ts): qué fichas hay colgadas del mundo (pruebas y ?debug) */
  __fichasMundo?: () => unknown;
}
