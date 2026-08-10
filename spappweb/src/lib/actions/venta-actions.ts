"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { getProductoBySku, searchProductos } from "@/lib/pipeline/queries";
import type { InventarioProductoRow } from "@/lib/pipeline/types";

export async function lookupProductoBySku(
  sku: string,
): Promise<InventarioProductoRow> {
  await requireAdminSession();
  const producto = await getProductoBySku(sku);
  if (!producto) {
    throw new Error(`Producto no encontrado: ${sku.trim() || "(vacío)"}`);
  }
  return producto;
}

export async function searchProductosVenta(
  q: string,
): Promise<InventarioProductoRow[]> {
  await requireAdminSession();
  return searchProductos(q);
}
