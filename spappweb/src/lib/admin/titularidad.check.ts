import assert from "node:assert/strict";
import {
  appendTitularidadHistorial,
  assertCanTransferTitularidad,
  parseTitularidadHistorial,
} from "./titularidad.ts";

assert.throws(
  () =>
    assertCanTransferTitularidad({
      fromUserId: 1,
      toUserId: 2,
      compraEstado: "entregada",
      destinoTieneCompra: false,
      destinoExiste: false,
    }),
  /no encontrado/,
);

assert.throws(
  () =>
    assertCanTransferTitularidad({
      fromUserId: 1,
      toUserId: 1,
      compraEstado: "entregada",
      destinoTieneCompra: false,
      destinoExiste: true,
    }),
  /otro cliente/,
);

assert.throws(
  () =>
    assertCanTransferTitularidad({
      fromUserId: 1,
      toUserId: 2,
      compraEstado: null,
      destinoTieneCompra: false,
      destinoExiste: true,
    }),
  /no tiene compra/,
);

assert.throws(
  () =>
    assertCanTransferTitularidad({
      fromUserId: 1,
      toUserId: 2,
      compraEstado: "cancelada",
      destinoTieneCompra: false,
      destinoExiste: true,
    }),
  /cancelada/,
);

assert.throws(
  () =>
    assertCanTransferTitularidad({
      fromUserId: 1,
      toUserId: 2,
      compraEstado: "entregada",
      destinoTieneCompra: true,
      destinoExiste: true,
    }),
  /ya tiene una moto/,
);

assert.doesNotThrow(() =>
  assertCanTransferTitularidad({
    fromUserId: 1,
    toUserId: 2,
    compraEstado: "entregada",
    destinoTieneCompra: false,
    destinoExiste: true,
  }),
);

{
  const merged = appendTitularidadHistorial(
    { entrega_antes_visita: true },
    {
      from_user_id: 1,
      to_user_id: 2,
      from_user: "111",
      to_user: "222",
      motivo: "cesión",
      at: "2026-07-22T12:00:00.000Z",
      by: "admin",
    },
  );
  assert.equal(merged.entrega_antes_visita, true);
  const hist = parseTitularidadHistorial(merged);
  assert.equal(hist.length, 1);
  assert.equal(hist[0]?.from_user, "111");
  assert.equal(hist[0]?.to_user, "222");
  assert.equal(hist[0]?.motivo, "cesión");

  const again = appendTitularidadHistorial(merged, {
    from_user_id: 2,
    to_user_id: 3,
    from_user: "222",
    to_user: "333",
    motivo: null,
    at: "2026-07-23T12:00:00.000Z",
    by: null,
  });
  assert.equal(parseTitularidadHistorial(again).length, 2);
}

assert.deepEqual(parseTitularidadHistorial(null), []);
assert.deepEqual(parseTitularidadHistorial({ titularidad_historial: "x" }), []);

console.log("titularidad.check OK");
