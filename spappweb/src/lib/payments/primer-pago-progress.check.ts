import assert from "node:assert/strict";
import {
  conceptoCompleto,
  montoEsperadoConcepto,
  puedeEditarAbonoConcepto,
  puedeEditarFrecuenciaPago,
} from "./primer-pago-progress.ts";

function compra(estado: string) {
  return {
    estado,
    cuota_inicial_monto: 1_000_000,
    monto_cuota_periodo: 280_000,
    monto_visita_monto: 100_000,
  } as Parameters<typeof puedeEditarAbonoConcepto>[0];
}

const pagos: Parameters<typeof puedeEditarAbonoConcepto>[1] = [];

assert.equal(
  puedeEditarAbonoConcepto(compra("pendiente_pago"), pagos, "inicial"),
  true,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("lista_retiro"), pagos, "inicial"),
  true,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("lista_retiro"), pagos, "cuota_adelantada"),
  true,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("entregada"), pagos, "inicial"),
  false,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("cancelada"), pagos, "visita"),
  false,
);

const sinAdelantada = {
  ...compra("pendiente_pago"),
  admin_data: { cobra_cuota_adelantada: false },
  pago_cuota_confirmado: true,
} as Parameters<typeof montoEsperadoConcepto>[0];

assert.equal(montoEsperadoConcepto(sinAdelantada, "cuota_adelantada"), 0);
assert.equal(conceptoCompleto(sinAdelantada, pagos, "cuota_adelantada"), true);
assert.equal(montoEsperadoConcepto(compra("pendiente_pago"), "cuota_adelantada"), 280_000);
assert.equal(puedeEditarFrecuenciaPago(sinAdelantada, pagos), true);

console.log("primer-pago-progress.check OK");
