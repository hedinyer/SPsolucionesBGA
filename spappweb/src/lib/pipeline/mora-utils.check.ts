import assert from "node:assert/strict";
import {
  assertPuedeMarcarEntregada,
  DIAS_RECUPERACION_CLIENTE,
  getMoraDisplay,
  getPlazoRecuperacion,
  motoYaRecogida,
  puedeMarcarMotoRecogida,
} from "./mora-utils.ts";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

{
  const sameDay = getPlazoRecuperacion(new Date().toISOString());
  assert.equal(sameDay.diasTranscurridos, 0);
  assert.equal(sameDay.diasRestantes, DIAS_RECUPERACION_CLIENTE);
  assert.equal(sameDay.plazoVencido, false);
}

{
  const day2 = getPlazoRecuperacion(daysAgo(2));
  assert.equal(day2.diasTranscurridos, 2);
  assert.equal(day2.diasRestantes, 1);
  assert.equal(day2.plazoVencido, false);
}

{
  const day3 = getPlazoRecuperacion(daysAgo(3));
  assert.equal(day3.diasTranscurridos, 3);
  assert.equal(day3.diasRestantes, 0);
  assert.equal(day3.plazoVencido, true);
}

{
  const late = getPlazoRecuperacion(daysAgo(10));
  assert.equal(late.plazoVencido, true);
  assert.equal(late.diasRestantes, 0);
}

assert.doesNotThrow(() => assertPuedeMarcarEntregada("entregada"));
assert.doesNotThrow(() => assertPuedeMarcarEntregada("pendiente_pago"));
assert.throws(
  () => assertPuedeMarcarEntregada("saldada"),
  /liquidado/,
);
assert.throws(
  () => assertPuedeMarcarEntregada("cancelada"),
  /cancelada/,
);

{
  assert.equal(motoYaRecogida({ recoger: { estado: "recogida" } }), true);
  assert.equal(motoYaRecogida({ estadoFisico: "recogida" }), true);
  assert.equal(motoYaRecogida({ recoger: { estado: "pendiente" } }), false);
}

{
  const display = getMoraDisplay({
    atraso: { dias_atraso: 15, monto_adeudado: 100_000, estado: "moroso" },
    recoger: { estado: "recogida", dias_atraso: 15, monto_adeudado: 100_000 },
  });
  assert.equal(display.yaRecogida, true);
  assert.equal(display.paraRecoger, false);
}

{
  const display = getMoraDisplay({
    atraso: { dias_atraso: 15, monto_adeudado: 100_000, estado: "moroso" },
  });
  assert.equal(display.paraRecoger, true);
  assert.equal(display.yaRecogida, false);
}

{
  assert.equal(
    puedeMarcarMotoRecogida({
      compraEstado: "entregada",
      diasAtraso: 5,
      montoAdeudado: 50_000,
    }),
    true,
  );
  assert.equal(
    puedeMarcarMotoRecogida({
      compraEstado: "entregada",
      diasAtraso: 5,
      montoAdeudado: 50_000,
      estadoFisico: "recogida",
    }),
    false,
  );
}

console.log("mora-utils.check OK");
