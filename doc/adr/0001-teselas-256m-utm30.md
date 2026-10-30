# ADR-0001 — Teselas de 256 m alineadas a múltiplos en UTM30

- **Estado:** Superado por ADR-0021
- **Fecha:** 2026-10-28 (decidido en el diseño del 27-oct)

## Contexto
El gemelo original era «una ventana» fija sobre Cerro Velasco (0,35 km²). Hituelo son 95 ha de parcelas en una caja de 4,2 km² (≈12× más superficie y ≈10× más olivos). Cuatro bloques (nube, MDT, CHM, ortofoto) eran el 97 % de los datos y todos crecen con la superficie; repetir el esquema pesaría ≈85–90 MB frente a un límite de 16 MB por página. El coste por fotograma debe depender de la distancia a la cámara, no de la superficie.

## Decisión
El mundo es un conjunto de teselas de 256 m alineadas a múltiplos de 256 en UTM 30N (`kx = floor(E/256)`, `ky = floor(N/256)`, nombre `kx_ky`). Solo se generan las que tocan una parcela más 60 m. Las funciones `suelo`, `copaAlta`, `orto`, `ndviRel`, `cubierta` y `D.ext` conservan firma y cambian de interior.

## Alternativas consideradas
- **Ventana única ampliada** — no cabe en 16 MB y el recoloreo y las normales en CPU escalan con la superficie (1,35 s hoy, ×10 inviable).
- **Cuadrícula relativa a cada finca** — las teselas de Cerro e Hituelo se solaparían o no compartirían esquema si se añaden fincas.
- **Teselas de otro tamaño** — 256 = 2⁸ da rejillas de 1 m (257² con margen) y ficheros de ≈1 MB, adecuados a los límites de la plataforma.

## Consecuencias
- **Positivas:** carga y descarga por demanda; las fincas comparten esquema; el 77 % sin árboles se modela barato.
- **Negativas / coste:** costuras entre teselas y niveles (faldones de 1,5 m, margen de una celda); el mundo es un mosaico con huecos donde no hay datos (pendiente M6); más ficheros (el diseño preveía ≈245 con 5 capas; la implementación los agrupa en 2 por tesela: 92 en Hituelo).
- **Implicaciones futuras:** una finca nueva se añade generando sus teselas; no hay que tocar el motor.

## Comprobación
Cerro (12 teselas) y Hituelo (46) cargan con 0 errores; capturas de Cerro antes/después casi idénticas. Contrato en [CONTRATOS](../sistema/CONTRATOS.md).

## Enmienda 2026-10-30
Superado por [ADR-0021](0021-se-retira-la-salida-artefacto-y-la-escena-de-siempre.md) (con [ADR-0015](0015-escena-en-3d-tiles.md), fase 2). La rejilla de 256 m alineada a UTM30 se conserva para los datos de `Mundo` (`t/*.json`, `t/*.jpg`); lo que se retira es la escena que dibujaba esas teselas.
