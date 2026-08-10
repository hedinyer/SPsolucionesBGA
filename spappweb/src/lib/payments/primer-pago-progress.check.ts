import assert from "node:assert/strict";
import { puedeEditarAbonoConcepto } from "./primer-pago-progress.ts";

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

console.log("primer-pago-progress.check OK");
