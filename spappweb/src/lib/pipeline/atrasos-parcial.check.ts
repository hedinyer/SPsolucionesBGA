import assert from "node:assert/strict";

/** Contrato de la vista atrasos: abonos parciales restan del adeudado. */
function montoAdeudado(
  periodosDebidos: number,
  cuotaPeriodo: number,
  abonos: number[],
): number {
  const pagado = abonos.reduce((s, n) => s + n, 0);
  return Math.max(0, periodosDebidos * cuotaPeriodo - pagado);
}

// Endry semanal: 3 periodos × 280k, pagó 280+280+200 → debe 80k (no 280k).
assert.equal(montoAdeudado(3, 280_000, [280_000, 280_000, 200_000]), 80_000);
assert.equal(montoAdeudado(3, 280_000, [280_000, 280_000]), 280_000);
assert.equal(montoAdeudado(1, 40_000, [8_000]), 32_000);

console.log("atrasos-parcial.check.ts: ok");
