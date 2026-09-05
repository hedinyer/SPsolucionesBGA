import assert from "node:assert/strict";
import {
  calcMotoPayment,
  cobraCuotaAdelantada,
  MIN_CUOTA_INICIAL,
} from "./moto-payment.ts";

assert.equal(MIN_CUOTA_INICIAL, 0);

const bike = {
  cuota_inicial: 400_000,
  cuota_diaria: 40_000,
  monto_visita: 35_000,
};

const conAdelantada = calcMotoPayment(bike, "semanal");
assert.equal(conAdelantada.monto_cuota_periodo, 280_000);
assert.equal(conAdelantada.monto_cuota_adelantada, 280_000);
assert.equal(conAdelantada.monto_total_primer_pago, 400_000 + 280_000 + 35_000);

const sinAdelantada = calcMotoPayment(bike, "semanal", {
  cobraCuotaAdelantada: false,
});
assert.equal(sinAdelantada.monto_cuota_periodo, 280_000);
assert.equal(sinAdelantada.monto_cuota_adelantada, 0);
assert.equal(sinAdelantada.monto_total_primer_pago, 400_000 + 35_000);

const parcial = calcMotoPayment(bike, "semanal", {
  cuotaAdelantada: 50_000,
});
assert.equal(parcial.monto_cuota_adelantada, 50_000);
assert.equal(parcial.monto_total_primer_pago, 400_000 + 50_000 + 35_000);

const ceroInicial = calcMotoPayment(bike, "semanal", {
  cuotaInicial: 0,
  cuotaAdelantada: 0,
  montoVisita: 0,
});
assert.equal(ceroInicial.monto_total_primer_pago, 0);

assert.equal(cobraCuotaAdelantada(null), true);
assert.equal(cobraCuotaAdelantada({}), true);
assert.equal(
  cobraCuotaAdelantada({ admin_data: { cobra_cuota_adelantada: false } }),
  false,
);
assert.equal(
  cobraCuotaAdelantada({ monto_cuota_adelantada: 0 }),
  false,
);
assert.equal(
  cobraCuotaAdelantada({ monto_cuota_adelantada: 10_000 }),
  true,
);

console.log("moto-payment.check OK");
