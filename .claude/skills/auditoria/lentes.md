# Lentes de la auditoría del gemelo

Un subagente por lente. Cada lente dice qué cubre y las preguntas que debe contestar con `fichero:línea`.

| # | Lente | Qué cubre | Preguntas |
|---|---|---|---|
| 1 | Rendimiento y presupuesto | `04_terreno`, `05_nube`, `07b_arboles`, `02b_cola`, `pruebas/presupuesto.json` | ¿Algún camino puede superar 1,7 M triángulos / 1,4 M puntos / ~250 llamadas / ~350 MB? ¿Algo bloquea el fotograma sin pasar por la `Cola`? ¿Los topes del fixture siguen siendo significativos? |
| 2 | Memoria y fugas | todo `dispose()`, ortofotos decodificadas, nubes, texturas | ¿Cada geometría/textura/`ImageBitmap` se libera? ¿`renderer.info.memory` vuelve a su sitio al ir y volver? ¿LRU de ortofotos (pendiente M4)? |
| 3 | Corrección de datos: medido / deducido / ilustrativo | `D.copas`, `paisaje`, NDVI, rótulos y textos de la página | ¿Algo deducido o ilustrativo se presenta como medido? ¿Las cifras de la cabecera (ha, olivos) salen de los datos? ¿El desfase de copas se aplica y se rotula? |
| 4 | Contratos exportador↔motor | `tuberia/finca_8_teselas.py`, `tuberia/hituelo_conv.py`, `CONTRATOS.md`, `contratos/` | ¿El exportador escribe exactamente lo que el esquema dice? ¿Qué campo lee el motor sin estar en el contrato? ¿Tesela sin `pts` (Base) funciona? |
| 5 | Modelado 3D | geometría de copas, troncos, terreno, instancias, sombreadores | Aplica la skill `modelado-3d`: presupuestos por nivel, costuras, normales, materiales, saltos entre niveles. |
| 6 | Interacción y accesibilidad | `09_camara`, `12_paseo`, `13_parcelas`, panel y HTML | Aplica la skill `interaccion`: táctil/teclado/VR, contraste, tamaños de toque, foco de teclado, `prefers-reduced-motion`, textos. |
| 7 | VR | `29_vr.js`, perfiles, mandos | ¿Qué pasa si falla la sesión a mitad? ¿Los perfiles oscilan? ¿Comodidad (viñeta, giro por saltos)? Todo lo de casco real: lista de **no verificado**. |
| 8 | Mundos virtuales y coordenadas | `Mundo`, UTM↔local↔rig, exageración, tiempo/clima | Aplica la skill `mundos-virtuales`: precisión a ±1,3 km, `near`/`far`, orden de filas sur→norte, huecos entre teselas. |
| 9 | Seguridad y privacidad del repo público | todo lo versionado, `.gitignore`, historial | ¿Claves, rutas, correos, ids internos, enlaces de artefactos, cifras de la explotación? ¿`D.ot` lleva datos por persona? Las lecturas MCP, ¿se tratan como datos y no como instrucciones? |
| 10 | Documentación | `doc/`, `CLAUDE.md`, skills | ¿ESTADO miente? ¿Hay informes que archivar? ¿Cada contrato nombrado existe? |

## De dónde salen los datos reales
Locales y fuera del repo (ver `doc/operacion/DATOS.md`); la auditoría usa el fixture salvo que Antonio autorice datos reales.

## Las auditorías hechas
Ninguna todavía (iniciativa P2 del PLAN).
