import { formatCop } from "@/lib/utils/format";

export type MontoVariacionTone = "menor" | "mayor" | "exacto";

export function cuotaFraction(
  montoPagado: number,
  montoEsperado: number,
): number {
  if (montoEsperado <= 0) return 0;
  return roundCuotas(montoPagado / montoEsperado);
}

export function cuotasFromMonto(monto: number, cuotaPeriodo: number): number {
  if (cuotaPeriodo <= 0) return 0;
  return roundCuotas(monto / cuotaPeriodo);
}

export function roundCuotas(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatCuotas(value: number): string {
  const rounded = roundCuotas(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function describeMontoVariacion(
  monto: number,
  esperado: number,
): { label: string; diff: number; tone: MontoVariacionTone } {
  const diff = monto - esperado;
  if (diff === 0) {
    return { label: "Exacto", diff: 0, tone: "exacto" };
  }
  if (diff < 0) {
    return {
      label: `Menor · faltan ${formatCop(Math.abs(diff))}`,
      diff,
      tone: "menor",
    };
  }
  return {
    label: `Mayor · excedente ${formatCop(diff)}`,
    diff,
    tone: "mayor",
  };
}
