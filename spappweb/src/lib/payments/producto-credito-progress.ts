import type {
  CompraProductoCreditoRow,
  PagoRow,
} from "@/lib/pipeline/types";

export type ProductoCreditoPagoConcepto =
  | "producto_inicial"
  | "producto_cuota";

export function montoEsperadoProducto(
  item: CompraProductoCreditoRow,
  concepto: ProductoCreditoPagoConcepto,
): number {
  if (concepto === "producto_inicial") {
    return item.cuota_inicial_monto * item.cantidad;
  }
  const dias = item.plazo_dias ?? 0;
  return item.cuota_diaria_monto * item.cantidad * Math.max(dias, 0);
}

export function abonosProducto(
  pagos: PagoRow[],
  itemId: string,
  concepto: ProductoCreditoPagoConcepto,
): PagoRow[] {
  return pagos.filter(
    (p) =>
      p.estado === "confirmado" &&
      p.contexto_pago === concepto &&
      p.compra_producto_credito_id === itemId,
  );
}

export function sumAbonosProducto(
  pagos: PagoRow[],
  itemId: string,
  concepto: ProductoCreditoPagoConcepto,
): number {
  return abonosProducto(pagos, itemId, concepto).reduce(
    (sum, p) => sum + p.monto,
    0,
  );
}

export function faltanteProducto(
  item: CompraProductoCreditoRow,
  pagos: PagoRow[],
  concepto: ProductoCreditoPagoConcepto,
): number {
  return Math.max(
    0,
    montoEsperadoProducto(item, concepto) -
      sumAbonosProducto(pagos, item.id, concepto),
  );
}

export function conceptoProductoCompleto(
  item: CompraProductoCreditoRow,
  pagos: PagoRow[],
  concepto: ProductoCreditoPagoConcepto,
): boolean {
  return faltanteProducto(item, pagos, concepto) <= 0;
}

export function diasProductoCubiertos(
  item: CompraProductoCreditoRow,
  pagos: PagoRow[],
): number {
  const diaria = item.cuota_diaria_monto * item.cantidad;
  if (diaria <= 0) return 0;
  return Math.floor(
    sumAbonosProducto(pagos, item.id, "producto_cuota") / diaria,
  );
}
