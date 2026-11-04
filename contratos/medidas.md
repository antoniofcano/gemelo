# Contrato: medidas de fluidez en aparatos (PB9; v2 = Q0e)

Esquema: [medidas.schema.json](medidas.schema.json). Rutas: [api.openapi.yaml](api.openapi.yaml) (`POST /api/medidas`, `GET /api/admin/medidas`). Tabla: `apps/api/migraciones/0017_medidas_fluidez.sql` (v1) y `0022_medidas_fluidez_porque.sql` (v2). Ejemplos: [medidas-ejemplo.json](medidas-ejemplo.json) (v2) y [medidas-v1-ejemplo.json](medidas-v1-ejemplo.json) (v1, sigue valiendo). Código: `apps/api/src/medidas/rutas.ts` (api) y `apps/web/motor/30_mide.js` (envío). Protocolo del medidor: [VR.md](../doc/sistema/VR.md#medir-con-el-medidor).

**Es MEDIDO** (CLAUDE.md, regla 5): lo que cada aparato midió de sí mismo durante 60 s (tras 3 s de calentamiento). Un número de Chrome sin GPU (SwiftShader) no es fps de nada; la oficina enseña el aparato y el navegador para poder separarlos.

## Con permiso, nada personal

- **Solo se manda si la persona pulsa «Enviar esta medida a la oficina»** al terminar la medida (pantalla, panel de VR o `?debug`). Nunca solo.
- **Qué lleva**: aparato (`escritorio` / `movil` / `quest`), navegador y versión mayor (no el agente de usuario entero), perfil de calidad, finca, modo, si era VR, mediana / p95 / peor en ms, fotogramas, duración, versión del gemelo y fecha de la medida.
- **Versión 2 (Q0e, 2026-11-02): por qué va como va.** El primer Quest real (perfil 3, el más bajo) dio mediana 14,3 ms y p95 20,7 ms sin que se supiera si el límite era la CPU, la GPU o la carga de teselas. Se añaden nueve campos, **todos opcionales** (compatible hacia atrás: un cliente de la v1 que no los manda sigue valiendo y su cuerpo es válido tal cual):
  - `js_mediana_ms`, `js_p95_ms`: ms de JavaScript por fotograma (el mismo `js` que ya calculaba el medidor; mediana y p95 con el mismo método que el intervalo). `js_mediana_ms <= js_p95_ms`, o 422.
  - `nivel_ini`, `nivel_fin`: nivel del controlador adaptativo (`VR_PERFILES`) al empezar y al terminar (-1 si no es VR). `perfil` se mantiene por compatibilidad y **es el nivel final** (`perfil` = `nivel_fin` en VR).
  - `perillas`: la línea de `XrPerillas.linea()` sin el prefijo «VR: » (p. ej. «fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto»), saneada a letras, cifras, espacio y `, . : ; = ( ) + _ % · -`, de 1 a 80 caracteres. Solo en VR.
  - `olivos_gen`: si los olivos generados estaban activos al terminar (`__olivosGen().estado === "activo"`).
  - `llamadas_med`, `triangulos_med`: mediana por fotograma de `renderer.info.render.calls` y `.triangles` (el último `render()` del fotograma).
  - `personas`: número de personas visibles de la presencia (`__presencia().vistos`) al terminar, 0 si no hay presencia. Solo el número; ninguna identidad.
  - **Sigue sin llevar hogar, posición, IP ni identidad.** El texto del botón de enviar enseña lo que se manda.
- **Qué no lleva ni guarda**: hogar, correo, posición, IP, cookies, el agente de usuario completo. La api usa el hogar solo como clave del límite (10 por hogar y día, en memoria; una sesión de admin no tiene tope diario mientras se depura, decisión de Antonio del 2026-11-04, y el freno de 10 por minuto sigue para todos); la tabla no tiene `hogar_id` ni se audita el envío (la auditoría guarda el hogar y enlazaría la medida con una familia).
- **Esquema estricto**: campos de más, tipos mal o valores fuera de rango, 400. Además la api devuelve 422 `medida_no_creible` si no se cumple `mediana ≤ p95 ≤ peor` o si la fecha es futura o de hace más de 7 días.

## Lectura de la oficina

`GET /api/admin/medidas?aparato=&desde=&hasta=&limite=` (cuentas de oficina y admin): una fila por día (UTC), aparato y VR con el número de medidas, el **p95 mediano** del día, el peor p95, la mediana de las medianas, el peor intervalo, los fotogramas, los navegadores y versiones del gemelo vistos, el objetivo y si lo cumple. Desde la v2 también la **mediana de cada campo nuevo** por día y aparato (`js_mediana_ms`, `js_p95_ms`, `nivel_ini`, `nivel_fin`, `llamadas_med`, `triangulos_med`, `personas`), las `perillas` más repetidas y cuántas medidas traían los olivos generados activos (`olivos_gen_si` de `olivos_gen_de` con dato); `null` (o 0) si ninguna medida del día lo traía. Lectura: si el JS pasa de 13 ms manda la CPU; si no, mira la GPU (resolución, triángulos, teselas). Objetivos de p95: **Quest 13,9 ms** (72 Hz, ADR-0015, criterio 5). Escritorio y móvil: **no hay umbral escrito** [SUPUESTO: lo fija Antonio al ver las primeras medidas]; se enseña solo la cifra.
