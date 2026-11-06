/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/medidas.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Medida de fluidez de un aparato (PB9; v2 = Q0e; v3 = Q0i). Cuerpo de POST /api/medidas. Lo mide el aparato de sí mismo (MEDIDO, regla 5) con el medidor de 30_mide.js y lo manda la persona con un botón. Nada personal: ni hogar, ni posición, ni IP, ni agente de usuario entero. Contrato en contratos/medidas.md. v2 (Q0e): nueve campos OPCIONALES más que dicen por qué va como va; un cliente de v1 que no los manda sigue valiendo; v3 (Q0i): trece campos OPCIONALES más (render() y autopsia de los fotogramas lentos) y el reparto del JS por bloque (como mucho 16); un cliente de v1 o v2 sigue valiendo; lo copia apps/api/src/medidas/rutas.ts (CUERPO_MEDIDA) y lo comprueba apps/api/pruebas/unidad/medidas.test.ts.
 */
export interface Medidas {
  aparato: "escritorio" | "movil" | "quest";
  /**
   * Solo el producto: Chrome, Firefox, Safari, Edge, Quest Browser…
   */
  navegador: string;
  /**
   * Versión mayor del navegador
   */
  nav_mayor: number;
  /**
   * Perfil de calidad (índice de VR_PERFILES al terminar; -1 si no es VR)
   */
  perfil: number;
  /**
   * D.finca_id
   */
  finca: string;
  /**
   * Modo de dibujo (nube, gemelo, ortofoto…)
   */
  modo: string;
  vr: boolean;
  mediana_ms: number;
  p95_ms: number;
  peor_ms: number;
  fotogramas: number;
  duracion_s: number;
  /**
   * Versión del gemelo (VERSION)
   */
  version: string;
  /**
   * Cuándo terminó la medida (UTC); la api la rechaza si es futura o de hace más de 7 días
   */
  medida_en: string;
  /**
   * Q0e (opcional): mediana de los ms de JavaScript por fotograma (lo que tarda el bucle en su parte de JS, no el intervalo)
   */
  js_mediana_ms?: number;
  /**
   * Q0e (opcional): p95 de los ms de JavaScript por fotograma; js_mediana_ms <= js_p95_ms
   */
  js_p95_ms?: number;
  /**
   * Q0e (opcional): nivel de VR_PERFILES al empezar la medida (-1 si no es VR)
   */
  nivel_ini?: number;
  /**
   * Q0e (opcional): nivel de VR_PERFILES al terminar (el mismo valor que perfil)
   */
  nivel_fin?: number;
  /**
   * Q0e (opcional): las perillas de VR con que se midió (XrPerillas.linea() sin el prefijo «VR: »), saneado y de 80 caracteres como mucho; p. ej. «fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto»
   */
  perillas?: string;
  /**
   * Q0e (opcional): si los olivos generados estaban activos durante la medida
   */
  olivos_gen?: boolean;
  /**
   * Q0e (opcional): mediana por fotograma de renderer.info.render.calls
   */
  llamadas_med?: number;
  /**
   * Q0e (opcional): mediana por fotograma de renderer.info.render.triangles
   */
  triangulos_med?: number;
  /**
   * Q0e (opcional): personas visibles de la presencia al terminar (0 si no hay presencia); solo un número, ninguna identidad
   */
  personas?: number;
  /**
   * Q0i (opcional): mediana por fotograma de los ms de renderer.render() (parte del JS); render_mediana_ms <= render_p95_ms
   */
  render_mediana_ms?: number;
  /**
   * Q0i (opcional): p95 por fotograma de los ms de renderer.render()
   */
  render_p95_ms?: number;
  /**
   * Q0i (opcional): fotogramas lentos (por encima de 13,9 ms) de la medida; el total sobre el que se cuentan las causas
   */
  lentos_n?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con trabajo de la Cola (>= 1 ms). Las causas pueden solaparse
   */
  lentos_cola?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con la llegada de una tesela
   */
  lentos_tesela?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con un lote de olivos generados montado
   */
  lentos_lote?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con una tarea larga del navegador (>= 50 ms)
   */
  lentos_tarea?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con un programa de sombreado compilado
   */
  lentos_compila?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos coinciden con una textura subida a la GPU
   */
  lentos_textura?: number;
  /**
   * Q0i (opcional): de los lentos, cuántos no coinciden con ninguna causa conocida
   */
  lentos_sin_causa?: number;
  /**
   * Q0i (opcional): mediana de los ms que trabajaron la Cola y las teselas en los lentos en que trabajaron
   */
  lentos_cola_ms?: number;
  /**
   * Q0i (opcional): reparto del JS por bloque del motor, de mayor a menor p95, como mucho 16. Los bloques son identificadores del motor, no datos de nadie
   *
   * @maxItems 16
   */
  reparto?: {
    bloque: string;
    mediana_ms: number;
    p95_ms: number;
  }[];
  /**
   * Q0i (opcional): p95 de lo que sobra del JS tras restar render() y los bloques del reparto
   */
  otros_p95_ms?: number;
  /**
   * v3.1 (opcional): fotogramas perdidos, los de intervalo mayor de 1,5 periodos de refresco (periodo = 1000/Hz del aparato o de la sesión; sin Hz, la mediana del intervalo)
   */
  perdidos_n?: number;
  /**
   * v3.1 (opcional): vsync perdidos, suma de round(intervalo/periodo) - 1 en los fotogramas perdidos
   */
  vsync_perdidos?: number;
}
