# ADR-0002 — Niveles de detalle de terreno, olivos y nube

- **Estado:** Aceptado
- **Fecha:** 2026-10-28 (decidido en el diseño del 27-oct)

## Contexto
Presupuesto objetivo por fotograma: ≈1,7 M triángulos, ≈1 M puntos, ≈250 llamadas, ≈350 MB. El gemelo original dibujaba 1,68 M triángulos y 0,97 M puntos para 1.131 copas; con 10× más olivos hay que mostrar menos por árbol.

## Decisión
- **Terreno** por tesela en 3 niveles con topología compartida: L0 1 m (<130 m), L1 2 m (130–400 m), L2 8 m (>400 m); costuras con faldones de 1,5 m.
- **Olivos**: L0 modelo completo en celdas de 64 m alrededor del foco (máx. 450), L1 instanciado (máx. 3.000, ~170 tri), L2 instanciado (máx. 16.000, ~30 tri); más lejos nada (ya está en la ortofoto). Histéresis para evitar parpadeo.
- **Nube LiDAR**: un `Points` por tesela con orden barajado; `setDrawRange` da el LOD.
- Color del suelo, NDVI y exageración vertical en el sombreador, no en CPU.

## Alternativas consideradas
- **Cargar menos finca** — pierde el objetivo (ver toda la finca).
- **`logarithmicDepthBuffer`** — desactiva el depth test temprano en iOS **[SUPUESTO]**; se usa `near` dinámico.
- **Unir vértices entre niveles** — más complejo que faldones y solo se nota desde arriba con exageración.

## Consecuencias
- **Positivas:** Cerro a distancia pasa de 1,68 M a 261 k triángulos y de 185 a 83 MB de heap; Hituelo cerca ≈1,4 M triángulos.
- **Negativas / coste:** «salto» visual entre niveles de olivos (pendiente M3); L1/L2 algo verde-gris y uniformes.
- **Nota de contraste con el diseño:** el diseño decía L1 ≈120 tri / máx. 3.000 y L2 ≈12 tri / máx. 12.000; el código real usa ≈170 / 3.000 y ≈30 / 16.000 (`07b_arboles.js`). Manda el código.

## Comprobación
Cifras antes/después en [MEDIDAS](../sistema/MEDIDAS.md) (solo SwiftShader). **No probado en iPhone ni Quest.** Topes en `pruebas/presupuesto.json`.
