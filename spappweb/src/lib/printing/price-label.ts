import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";

/** Cada etiqueta: 3 × 2 cm */
export const LABEL_WIDTH_MM = 30;
export const LABEL_HEIGHT_MM = 20;
export const LABEL_GAP_MM = 4;

export type LabelsPerRow = 1 | 2 | 3;

export function rowWidthMm(labelsPerRow: LabelsPerRow): number {
  return (
    LABEL_GAP_MM * 2 +
    labelsPerRow * LABEL_WIDTH_MM +
    (labelsPerRow - 1) * LABEL_GAP_MM
  );
}

export function rowHeightMm(): number {
  return LABEL_GAP_MM * 2 + LABEL_HEIGHT_MM;
}

export function labelSlotLeftMm(slot: number): number {
  return LABEL_GAP_MM + slot * (LABEL_WIDTH_MM + LABEL_GAP_MM);
}

export interface PriceLabelData {
  nombre: string;
  sku: string;
  precioFormatted: string;
}

export function toPriceLabelData(
  product: InventarioProductoRow,
): PriceLabelData {
  const nombre =
    product.nombre.length > 18
      ? `${product.nombre.slice(0, 17)}…`
      : product.nombre;

  return {
    nombre,
    sku: product.sku,
    precioFormatted: formatCop(product.costo ?? 0),
  };
}
