import type { GarajeMotoEstado, GarajeMotoRow } from "@/lib/pipeline/types";

/** Estados que siguen contando como stock en patio. */
const EN_PATIO = new Set<GarajeMotoEstado>([
  "en_garaje",
  "retenida",
  "en_mantenimiento",
  "disponible",
]);

export function bikeStockKey(modelo: string, color: string): string {
  return `${modelo.trim()}|${color.trim()}`;
}

/** Cuenta unidades segunda_mano en patio, agrupadas por modelo|color. */
export function countStockSegundaMano(
  motos: GarajeMotoRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of motos) {
    if (m.condicion !== "segunda_mano") continue;
    if (!EN_PATIO.has(m.estado)) continue;
    const key = bikeStockKey(m.modelo, m.color);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
