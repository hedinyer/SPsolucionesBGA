export const CAJA_MEDIO_EGRESO_VALUES = ["efectivo", "nequi", "davivienda"] as const;

export type CajaMedioEgreso = (typeof CAJA_MEDIO_EGRESO_VALUES)[number];

export const CAJA_MEDIO_EGRESO_LABELS: Record<CajaMedioEgreso, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  davivienda: "Davivienda / Daviplata",
};

export function classifyMedioPago(
  medio: string | null,
): "efectivo" | "nequi" | "davivienda" | "otro" {
  if (!medio || medio === "efectivo") return "efectivo";
  if (medio === "datafono") return "efectivo";
  if (medio === "davivienda") return "davivienda";
  if (medio.startsWith("nequi")) return "nequi";
  return "otro";
}
