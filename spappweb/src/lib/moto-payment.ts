import type { BikeRow, FrecuenciaPago } from "@/lib/pipeline/types";

/** Piso negociable de cuota inicial (COP). 0 = sin mínimo. */
export const MIN_CUOTA_INICIAL = 0;

export function cobraCuotaAdelantada(
  compra?: {
    monto_cuota_adelantada?: number | null;
    admin_data?: { cobra_cuota_adelantada?: boolean };
  } | null,
): boolean {
  if (compra?.monto_cuota_adelantada != null) {
    return compra.monto_cuota_adelantada > 0;
  }
  return compra?.admin_data?.cobra_cuota_adelantada !== false;
}

export function montoCuotaPeriodo(
  cuotaDiaria: number,
  frecuencia: FrecuenciaPago,
): number {
  switch (frecuencia) {
    case "diario":
      return cuotaDiaria;
    case "semanal":
      return cuotaDiaria * 7;
    case "quincenal":
      return cuotaDiaria * 15;
    case "mensual":
      return cuotaDiaria * 30;
  }
}

export function cuotaDiariaFromPeriodo(
  montoCuotaPeriodo: number,
  frecuencia: FrecuenciaPago,
): number {
  switch (frecuencia) {
    case "diario":
      return montoCuotaPeriodo;
    case "semanal":
      return Math.round(montoCuotaPeriodo / 7);
    case "quincenal":
      return Math.round(montoCuotaPeriodo / 15);
    case "mensual":
      return Math.round(montoCuotaPeriodo / 30);
  }
}

export function calcMotoPayment(
  bike: Pick<BikeRow, "cuota_inicial" | "cuota_diaria" | "monto_visita">,
  frecuencia: FrecuenciaPago,
  overrides?: {
    cuotaInicial?: number;
    cuotaDiaria?: number;
    montoVisita?: number;
    cobraCuotaAdelantada?: boolean;
    cuotaAdelantada?: number;
  },
) {
  const cuota_inicial_monto = overrides?.cuotaInicial ?? bike.cuota_inicial;
  const cuotaDiaria = overrides?.cuotaDiaria ?? bike.cuota_diaria;
  const monto_visita_monto = overrides?.montoVisita ?? bike.monto_visita ?? 0;
  const monto_cuota_periodo = montoCuotaPeriodo(cuotaDiaria, frecuencia);

  let monto_cuota_adelantada: number;
  if (overrides?.cuotaAdelantada != null) {
    monto_cuota_adelantada = Math.max(0, overrides.cuotaAdelantada);
  } else if (overrides?.cobraCuotaAdelantada === false) {
    monto_cuota_adelantada = 0;
  } else {
    monto_cuota_adelantada = monto_cuota_periodo;
  }

  return {
    cuota_inicial_monto,
    monto_cuota_periodo,
    monto_cuota_adelantada,
    monto_visita_monto,
    monto_total_primer_pago:
      cuota_inicial_monto + monto_cuota_adelantada + monto_visita_monto,
  };
}

export const FRECUENCIA_PERIOD: Record<FrecuenciaPago, string> = {
  diario: "por día",
  semanal: "7 días · por adelantado",
  quincenal: "15 días · por adelantado",
  mensual: "30 días · por adelantado",
};
