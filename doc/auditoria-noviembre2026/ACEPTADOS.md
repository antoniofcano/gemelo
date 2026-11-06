# Auditoría noviembre 2026 — Aceptados (propuesta)

Regla del skill: un agente **propone**; lo de producto, datos o legal lo acepta Antonio. Nada de esta lista está aceptado hasta que Antonio lo firme aquí con fecha. Los bajos que no aparecen van al PLAN (se arreglan en la tanda que les toca).

## Propuestos para aceptar por escrito (bajos y medios de coste alto y valor bajo)

| Id | Qué se acepta | Por qué |
|---|---|---|
| L9-05 | CSP solo informativa (`Report-Only`) | Decisión ya documentada en DECISIONS-PENDING; se revisará al activar la CSP completa en la tanda de seguridad de la fase siguiente, no ahora |
| L5-03 | Manchas de sombra planas que no siguen la pendiente | Estética; el coste (proyectar por tesela) no compensa frente a sombras reales en una fase posterior |
| L5-05, L5-06, L5-09 | Hierba con normal fija, color HSL sin espacio lineal en paisaje, efectos aplicados tras la niebla | Se resuelven de raíz al reescribir los materiales como `NodeMaterial` (propuesta de arquitectura); arreglarlos en GLSL hoy es trabajo que se tira |
| L5-10, L5-11 | Sombreadores que no portan a WGSL tal cual | Mismo motivo: se reescriben en TSL, no se parchean |
| L7-08 | Textura nueva vacía un fotograma con multiview | Inherente al parche de super-three; desaparece si la build de Quest deja de depender del parche |
| L7-11 | `?xrnear=0.3` deja el velo en el plano cercano | Parámetro de depuración, no de producto |
| L7-14 | Comando de VR simulada en CLAUDE.md no coincide | Se corrige en la tanda 8 de documentación; aquí solo para que no cuente como abierto |
| L3-16, L3-17, L3-18 | Alturas con suelo mínimo, «el arroyo lleva agua» por lluvia semanal, fecha de ISRIC escrita a mano | Ilustrativos ya rotulados como tales; la fecha de ISRIC pasa al índice cuando se regenere una finca |
| L3-23 | «Olivo N» por posición en el array | Cambiará con `copas_id` estable; hasta entonces es cosmético |
| L8-10, L8-11 | Azimut del sol y viento como si el norte fuera +Z exacto; `?hora` en zona del navegador | Error < 1° por convergencia de meridiano a esta escala; `?hora` es de depuración |
| L8-13, L8-14 | `pintaOrto` en vistas de borde; `Uint16Array` sin comprobación de `nv` | El fixture y las fincas actuales no llegan a 65.535 vértices por fusión; añadir una aserción es un bajo de la tanda 3 si sobra tiempo |
| L6-14..L6-18, L6-20..L6-22 | Contrastes, tamaños < 44 px, `aria-label`, `tabIndex` | Se recogen en una sola pasada de accesibilidad con revisión en iPhone (tanda 7), no uno a uno |
| L10-12..L10-24 | Cifras y textos desactualizados de documentación | Tanda 8 con `/documentalista`; se aceptan como grupo |
| L1-09..L1-12 | Reclasificación con cámara quieta, `Ajustes.lee` sin caché, horneado de lejanos fuera de la Cola | Bajos de rendimiento que se miden primero (tanda 1) y se arreglan solo si la medida los señala |

## Decisiones que son de Antonio (no se aceptan ni se arreglan sin él)

| Id | Decisión | Opciones |
|---|---|---|
| L9-01 | ¿Es privado el vínculo entre Cano y Damas y los ids de parcela (polígono/parcela) de OlivarTrack, y los nombres internos de parcela? | (a) Público: se acepta y se documenta en DECISIONS-PENDING. (b) Privado: sube a crítico, se anonimiza en el código, se reescribe el historial (`git filter-repo`) y se avisa de que el repo público ya lo expuso. |
| L9-02 | Coordenadas UTM exactas de nave, postes y frutal de Cerro | Mismas opciones; menor impacto. |
| Historial git | Autorizar un clon completo y pasar `gitleaks` | Sin esto la lente 9 no se puede cerrar. |
| L3-06 | Rotular el recuento de olivos como «detectado» y no «medido» | Es una afirmación de producto hacia los hogares de Cuarenta hazas. |
| L3-07 | Hectáreas: ¿declaradas (OlivarTrack) o medidas sobre el polígono? Si medidas, hay que calcularlas | Afecta a lo que ve el cliente en la cabecera. |
| L6-07 | ¿«Bloquear» debe poder deshacerse por el cliente, o solo por la oficina? | Moderación: decisión de producto. |
| L2-02 / L2-04 | ¿Se acepta que la nube LiDAR se precargue siempre (como función) o se carga bajo demanda? | Afecta a la memoria en Quest; si precarga, hay que medirla y ponerle tope. |
| PLAN tanda 2 | Autorizar medidas en Quest con datos reales de Hituelo (fuera del repo) | Sin medida real, las tandas 2, 3 y 6 no se pueden dar por cerradas. |

Firma y fecha de Antonio para cada fila aceptada: _(pendiente)_
