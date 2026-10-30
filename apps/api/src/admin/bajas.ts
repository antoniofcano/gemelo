// Bajas con 30 días (decisión 108, doc/sistema/OFICINA.md §3): una cuenta de baja (hogares.baja_en) se borra del todo, en cascada,
// cuando pasan DIAS_DE_BAJA días. Antes, la oficina puede reactivarla o exportar sus datos. El borrado inmediato por RGPD sigue
// existiendo (DELETE /api/admin/hogares/:id).
import type { Bd } from "../bd/pool.ts";
import { audita } from "../auth/servicio.ts";
import { borraFicheros, clavesDelHogar } from "../vida/medios.ts";

export const DIAS_DE_BAJA = 30;

/** Borra las cuentas de baja desde hace más de DIAS_DE_BAJA días (y los ficheros de sus fotos). Devuelve cuántas. */
export async function purgaBajas(bd: Bd, carpetaMedios: string | null): Promise<number> {
  const r = await bd.query<{ id: number }>(
    "SELECT id FROM hogares WHERE NOT activo AND baja_en IS NOT NULL AND baja_en < now() - make_interval(days => $1)", [DIAS_DE_BAJA]);
  for (const { id } of r.rows) {
    const claves = await clavesDelHogar(bd, id);
    await bd.query("DELETE FROM hogares WHERE id = $1 AND NOT activo", [id]);
    await borraFicheros(carpetaMedios, claves);
    await audita(bd, null, "hogar.borrado", { por: "baja_30_dias" });
  }
  return r.rows.length;
}
