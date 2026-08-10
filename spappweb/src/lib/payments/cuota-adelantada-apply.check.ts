/**
 * ponytail: self-check of how many daily periods a cuota_adelantada covers.
 * Ceiling: ignores partial last period rounding edge (floor only) — upgrade with remainder cents if tarifas ever use non-integer COP.
 */
export function periodosCubiertosPorAdelantada(
  montoAdelantada: number,
  montoCuotaPeriodo: number,
): number {
  if (montoCuotaPeriodo <= 0) return 0;
  return Math.floor(montoAdelantada / montoCuotaPeriodo);
}

export function runCuotaAdelantadaApplySelfCheck(): void {
  // Jhonayker: $400.000 / $40.000 = 10 días
  if (periodosCubiertosPorAdelantada(400_000, 40_000) !== 10) {
    throw new Error("adelantada 400k/40k debe cubrir 10 períodos");
  }
  // Solo 1 cuota (caso mínimo)
  if (periodosCubiertosPorAdelantada(40_000, 40_000) !== 1) {
    throw new Error("adelantada exacta de 1 cuota debe cubrir 1 período");
  }
  // Excedente parcial no inventa período extra
  if (periodosCubiertosPorAdelantada(50_000, 40_000) !== 1) {
    throw new Error("50k/40k debe cubrir 1 período completo (parcial aparte)");
  }
}

runCuotaAdelantadaApplySelfCheck();
