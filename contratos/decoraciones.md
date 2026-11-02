# Decoraciones de temporada de un olivo (P7g)

Decisiones 175-179 ([DECISIONS-PENDING](../doc/rumbo/DECISIONS-PENDING.md)); diseño en [doc/sistema/DECORACIONES.md](../doc/sistema/DECORACIONES.md). Catálogo: [decoraciones.json](decoraciones.json) con su esquema [decoraciones.schema.json](decoraciones.schema.json) (`v: 1`). Lo leen la api (`apps/api/src/vida/decoraciones.ts`) y el motor. **Ilustrativo** (regla 5): ninguna pieza mide nada.

## Catálogo

| `id` | Nombre | Época | Triángulos (máx.) |
|---|---|---|---|
| `flores` | Flores | primavera | 32 |
| `cinta` | Cinta de color | verano | 24 |
| `farolillo` | Farolillo | otoño (`otono`) | 36 |
| `cosecha` | Cosecha | otoño (`otono`) | 40 |
| `luces` | Luces | invierno | 40 |
| `lazo` | Lazo | invierno | 24 |

## La época actual

Es la **estación astronómica** del día, en hora de Madrid, con fechas fijas (función pura `epocaDeLaFecha`): primavera 21-mar a 20-jun; verano 21-jun a 22-sep; otoño 23-sep a 20-dic; invierno 21-dic a 20-mar. **No** es el calendario fenológico del olivo de [epocas-calendario.json](epocas-calendario.json) (reposo, botón, flor…): ese describe el árbol, este describe la fiesta. El motor debe calcular la época con las mismas fechas (y la misma zona) para ofrecer solo las piezas de la época; la api lo vuelve a comprobar.

## Qué se guarda y quién puede

Una columna `personalizaciones.decoracion` (migración 0019): el `id` de la pieza, o NULL. **Una sola por olivo y hogar**: la nueva sustituye a la anterior. Valida la api contra este catálogo (la base solo exige la forma de slug, para poder ampliar el catálogo sin migrar). Poner o cambiar: **titular** de la haza, en un olivo de su haza, solo una pieza **de la época actual**. Lo ya puesto se queda hasta que se cambie o se quite, aunque cambie la estación. Quitar: el titular. La oficina solo **ve y retira**; no pone. Los demás hogares la ven en la lista blanca de la haza. Sin texto libre ni imagen: no hay denuncia nueva.

## Rutas ([api.openapi.yaml](api.openapi.yaml))

| Acción | Ruta | Cuerpo | Respuestas |
|---|---|---|---|
| Poner o cambiar | `PUT /api/olivos/{finca}/{copas_id}/decoracion` | `{ "pieza": "<id>" }` | `200 { id, pieza }`; 400 `pieza_no_existe`; 422 `fuera_de_epoca`; 403 `solo_titular` / `no_es_tu_haza`; 404 `olivo_no_existe`; 401; 409 `a_la_vez`; 429 |
| Quitar la mía | `DELETE /api/olivos/{finca}/{copas_id}/decoracion` | — | `204`; 404 `no_existe` (no había); 403 `solo_titular`; 401 |
| Retirar (oficina) | `POST /api/admin/personalizaciones/{id}/decoracion/retirar` | `{ "motivo": "…" }` | `204`; 404 `no_existe` (sin decoración visible); 401/403 |

Lista blanca (`GET /api/hazas/{id}/olivos`, [olivos-haza.schema.json](olivos-haza.schema.json)): cada olivo lleva ahora `decoracion` (`id` de la pieza o `null`). Un olivo con solo decoración sale con `nombre: null` y `objeto: null`; su `id` es el de la personalización (es el que usa la oficina para retirarla). Auditoría: `vida.decoracion`, `vida.decoracion_quitada`, `admin.decoracion_retirada`.
