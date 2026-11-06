# Auditoría noviembre 2026 — Alcance

- **Versión:** v0.2.0 · **commit:** `4ab0ae6` (2026-11-05 23:06 +0100), rama `main`, clon superficial de solo lectura.
- **Motivo:** a petición de Antonio (2026-11-06), antes de la refactorización a mundos múltiples (exterior, fábrica/museo, bodega/conferencias). Primera auditoría del proyecto (iniciativa P2 del PLAN).
- **Método:** skill `auditoria` + `lentes.md`: diez lentes, un revisor por lente en paralelo y solo lectura; verificación de críticos y altos por el orquestador contra el código; plan por tandas; aceptados propuestos, no decididos.
- **Lentes:** 1 Rendimiento y presupuesto · 2 Memoria y fugas · 3 Corrección de datos · 4 Contratos exportador↔motor · 5 Modelado 3D · 6 Interacción y accesibilidad · 7 VR · 8 Mundos virtuales y coordenadas · 9 Seguridad y privacidad del repo público · 10 Documentación.
- **Datos:** solo el repo y el fixture sintético. Sin datos reales de la explotación, sin Chrome ni Docker (no hay banco en este entorno): **nada se ha medido en ejecución**; todo hallazgo de rendimiento o memoria es lectura de código y queda como pendiente de medir con la skill `medir`.
- **No verificable aquí (lista aparte, nunca hallazgo):** iPhone, Quest, marco de artefactos, MCP en vivo, LiveKit en vivo, build de Vite, pruebas de Chrome.
- **Qué no se revisó antes:** ninguna auditoría previa (`lentes.md`: «Ninguna todavía»).
