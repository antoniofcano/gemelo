# Contrato: medidas de fluidez en aparatos (PB9)

Esquema: [medidas.schema.json](medidas.schema.json). Rutas: [api.openapi.yaml](api.openapi.yaml) (`POST /api/medidas`, `GET /api/admin/medidas`). Tabla: `apps/api/migraciones/0017_medidas_fluidez.sql`. Código: `apps/api/src/medidas/rutas.ts` (api) y `apps/web/motor/30_mide.js` (envío). Protocolo del medidor: [VR.md](../doc/sistema/VR.md#medir-con-el-medidor).

**Es MEDIDO** (CLAUDE.md, regla 5): lo que cada aparato midió de sí mismo durante 60 s (tras 3 s de calentamiento). Un número de Chrome sin GPU (SwiftShader) no es fps de nada; la oficina enseña el aparato y el navegador para poder separarlos.

## Con permiso, nada personal

- **Solo se manda si la persona pulsa «Enviar esta medida a la oficina»** al terminar la medida (pantalla, panel de VR o `?debug`). Nunca solo.
- **Qué lleva**: aparato (`escritorio` / `movil` / `quest`), navegador y versión mayor (no el agente de usuario entero), perfil de calidad, finca, modo, si era VR, mediana / p95 / peor en ms, fotogramas, duración, versión del gemelo y fecha de la medida.
- **Qué no lleva ni guarda**: hogar, correo, posición, IP, cookies, el agente de usuario completo. La api usa el hogar solo como clave del límite (10 por hogar y día, en memoria); la tabla no tiene `hogar_id` ni se audita el envío (la auditoría guarda el hogar y enlazaría la medida con una familia).
- **Esquema estricto**: campos de más, tipos mal o valores fuera de rango, 400. Además la api devuelve 422 `medida_no_creible` si no se cumple `mediana ≤ p95 ≤ peor` o si la fecha es futura o de hace más de 7 días.

## Lectura de la oficina

`GET /api/admin/medidas?aparato=&desde=&hasta=&limite=` (cuentas de oficina y admin): una fila por día (UTC), aparato y VR con el número de medidas, el **p95 mediano** del día, el peor p95, la mediana de las medianas, el peor intervalo, los fotogramas, los navegadores y versiones del gemelo vistos, el objetivo y si lo cumple. Objetivos de p95: **Quest 13,9 ms** (72 Hz, ADR-0015, criterio 5). Escritorio y móvil: **no hay umbral escrito** [SUPUESTO: lo fija Antonio al ver las primeras medidas]; se enseña solo la cifra.
