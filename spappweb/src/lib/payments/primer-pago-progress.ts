import type { PagoRow, UserMotoCompraRow } from "@/lib/pipeline/types";

export type PrimerPagoConcepto = "inicial" | "cuota_adelantada" | "visita";

export function montoEsperadoConcepto(
  compra: UserMotoCompraRow,
  contexto: PrimerPagoConcepto,
): number {
  if (contexto === "inicial") return compra.cuota_inicial_monto;
  if (contexto === "cuota_adelantada") return compra.monto_cuota_periodo;
  return compra.monto_visita_monto ?? 0;
}

export function abonosPorConcepto(
  pagos: PagoRow[],
  contexto: PrimerPagoConcepto,
): PagoRow[] {
  return pagos.filter(
    (p) => p.contexto_pago === contexto && p.estado === "confirmado",
  );
}

export function sumAbonos(
  pagos: PagoRow[],
  contexto: PrimerPagoConcepto,
): number {
  return abonosPorConcepto(pagos, contexto).reduce((s, p) => s + p.monto, 0);
}

export function faltanteConcepto(
  compra: UserMotoCompraRow,
  pagos: PagoRow[],
  contexto: PrimerPagoConcepto,
): number {
  const esperado = montoEsperadoConcepto(compra, contexto);
  if (esperado <= 0) return 0;
  const recibido = sumAbonos(pagos, contexto);
  return Math.max(0, esperado - recibido);
}

export function conceptoCompleto(
  compra: UserMotoCompraRow,
  pagos: PagoRow[],
  contexto: PrimerPagoConcepto,
): boolean {
  return faltanteConcepto(compra, pagos, contexto) === 0;
}

export function puedeEditarAbonoConcepto(
  compra: UserMotoCompraRow,
  _pagos: PagoRow[],
  _contexto: PrimerPagoConcepto,
): boolean {
  // ponytail: allow fix-ups after confirm until delivery; flags re-sync via DB trigger
  return (
    compra.estado === "pendiente_pago" || compra.estado === "lista_retiro"
  );
}

export function puedeEditarFrecuenciaPago(
  compra: UserMotoCompraRow,
  pagos: PagoRow[],
): boolean {
  if (
    compra.estado === "entregada" ||
    compra.estado === "saldada" ||
    compra.estado === "cancelada"
  ) {
    return false;
  }
  if (compra.estado !== "pendiente_pago") return false;
  if (compra.pago_cuota_confirmado) return false;
  if (conceptoCompleto(compra, pagos, "cuota_adelantada")) return false;
  return true;
}

export function puedeEditarMontoVisita(
  compra: UserMotoCompraRow,
  pagos: PagoRow[],
): boolean {
  if (
    compra.estado === "entregada" ||
    compra.estado === "saldada" ||
    compra.estado === "cancelada"
  ) {
    return false;
  }
  if (compra.estado === "pendiente_pago") return true;
  if (compra.estado === "lista_retiro") {
    return !conceptoCompleto(compra, pagos, "visita");
  }
  return false;
}
