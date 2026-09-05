import assert from "node:assert/strict";
import {
  allocateCobroPrimerPago,
  conceptoCompleto,
  faltanteTotal,
  montoEsperadoConcepto,
  puedeEditarAbonoConcepto,
  puedeEditarFrecuenciaPago,
  primerPagoCubierto,
} from "./primer-pago-progress.ts";
import type { PagoRow, UserMotoCompraRow } from "../pipeline/types.ts";

function compra(estado: string, overrides: Partial<UserMotoCompraRow> = {}) {
  return {
    id: "c1",
    user_id: 1,
    bike_id: 1,
    garaje_moto_id: null,
    modelo: "X",
    color: "Y",
    frecuencia_pago: "semanal",
    estado,
    cuota_inicial_monto: 1_000_000,
    monto_cuota_periodo: 280_000,
    monto_cuota_adelantada: 280_000,
    monto_visita_monto: 100_000,
    monto_total_primer_pago: 1_380_000,
    pago_inicial_confirmado: false,
    pago_cuota_confirmado: false,
    pago_visita_confirmado: false,
    placa: null,
    chasis: null,
    referencia: null,
    fecha_entrega: null,
    doc_tarjeta_propiedad_path: null,
    doc_soat_path: null,
    doc_tecno_path: null,
    seleccionado_at: "",
    ...overrides,
  } as UserMotoCompraRow;
}

function pago(
  contexto: "inicial" | "cuota_adelantada" | "visita",
  monto: number,
): PagoRow {
  return {
    id: `p-${contexto}-${monto}`,
    user_moto_compra_id: "c1",
    user_id: 1,
    monto,
    dias_cubiertos: null,
    medio_pago_usuario: "efectivo",
    medio_pago_admin: "efectivo",
    referencia: `R-${contexto}-${monto}`,
    comprobante_url: null,
    origen: "admin",
    estado: "confirmado",
    reportado_at: "",
    confirmado_at: "",
    confirmado_por: "admin",
    fecha_comprobante: null,
    tarifa_objetivo_id: null,
    contexto_pago: contexto,
    notas_admin: null,
    created_at: "",
    updated_at: "",
  };
}

const pagos: PagoRow[] = [];

assert.equal(
  puedeEditarAbonoConcepto(compra("pendiente_pago"), pagos, "inicial"),
  true,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("lista_retiro"), pagos, "inicial"),
  true,
);
assert.equal(
  puedeEditarAbonoConcepto(compra("entregada"), pagos, "inicial"),
  false,
);

const sinAdelantada = compra("pendiente_pago", {
  monto_cuota_adelantada: 0,
  admin_data: { cobra_cuota_adelantada: false },
  pago_cuota_confirmado: true,
});

assert.equal(montoEsperadoConcepto(sinAdelantada, "cuota_adelantada"), 0);
assert.equal(conceptoCompleto(sinAdelantada, pagos, "cuota_adelantada"), true);
assert.equal(
  montoEsperadoConcepto(compra("pendiente_pago"), "cuota_adelantada"),
  280_000,
);
assert.equal(puedeEditarFrecuenciaPago(sinAdelantada, pagos), true);

const c = compra("pendiente_pago", { monto_cuota_adelantada: 50_000 });
assert.equal(montoEsperadoConcepto(c, "cuota_adelantada"), 50_000);
assert.equal(faltanteTotal(c, pagos), 1_000_000 + 50_000 + 100_000);

const alloc = allocateCobroPrimerPago(c, pagos, 1_020_000);
assert.deepEqual(alloc, [
  { contexto: "inicial", monto: 1_000_000 },
  { contexto: "cuota_adelantada", monto: 20_000 },
]);

const over = allocateCobroPrimerPago(c, pagos, 9_999_999);
assert.equal(
  over.reduce((s, a) => s + a.monto, 0),
  faltanteTotal(c, pagos),
);

const partialPagos = [pago("inicial", 400_000)];
const alloc2 = allocateCobroPrimerPago(c, partialPagos, 700_000);
assert.deepEqual(alloc2, [
  { contexto: "inicial", monto: 600_000 },
  { contexto: "cuota_adelantada", monto: 50_000 },
  { contexto: "visita", monto: 50_000 },
]);

const cero = compra("pendiente_pago", {
  cuota_inicial_monto: 0,
  monto_cuota_adelantada: 0,
  monto_visita_monto: 0,
  monto_total_primer_pago: 0,
});
assert.equal(primerPagoCubierto(cero, []), true);
assert.equal(faltanteTotal(cero, []), 0);

console.log("primer-pago-progress.check OK");
