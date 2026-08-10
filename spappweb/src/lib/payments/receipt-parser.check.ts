/**
 * ponytail: self-check del parser multi-banco (sin framework).
 * Run: npx tsx src/lib/payments/receipt-parser.check.ts
 */
import { parseReceiptText, type BancoDetectado } from "./receipt-parser";

interface Fixture {
  name: string;
  text: string;
  expectBanco: BancoDetectado;
  expectReferencia: string;
  expectMonto: number;
}

const FIXTURES: Fixture[] = [
  {
    name: "Nequi",
    text: `
      Nequi
      Enviaste
      Cuánto?
      $ 45.000
      Referencia M12636825
      12 de julio de 2026 a las 3:45 p.m.
    `,
    expectBanco: "nequi",
    expectReferencia: "M12636825",
    expectMonto: 45000,
  },
  {
    name: "Davivienda",
    text: `
      Davivienda
      Transferencia exitosa
      Valor $846.331
      Numero de comprobante TR1622000038
      7 marzo 2025 16:22:57
    `,
    expectBanco: "davivienda",
    expectReferencia: "TR1622000038",
    expectMonto: 846331,
  },
  {
    name: "Daviplata",
    text: `
      Daviplata
      Monto: $12.500
      Referencia: 9876543210
      19 de octubre de 2025 a las 2:12 p.m.
    `,
    expectBanco: "davivienda",
    expectReferencia: "9876543210",
    expectMonto: 12500,
  },
  {
    name: "Bancolombia",
    text: `
      Bancolombia
      Transferencia a otros bancos
      Valor a transferir $80.000
      Numero de referencia 1234567890
      15/06/2026 10:30
    `,
    expectBanco: "bancolombia",
    expectReferencia: "1234567890",
    expectMonto: 80000,
  },
  {
    name: "Banco de Bogota",
    text: `
      Banco de Bogota
      Transferencia exitosa
      Valor $250.000
      Numero de autorizacion 5566778899
      03/01/2026 09:15:22
    `,
    expectBanco: "banco_bogota",
    expectReferencia: "5566778899",
    expectMonto: 250000,
  },
  {
    name: "PSE",
    text: `
      Comprobante en linea
      Pago PSE
      7 marzo 2025 16:22:57
      Pago exitoso
      CUS 1320660038
      Valor del Pago $846.331
      Numero de factura 105087934
    `,
    expectBanco: "pse",
    expectReferencia: "1320660038",
    expectMonto: 846331,
  },
];

let failed = 0;

for (const fixture of FIXTURES) {
  const result = parseReceiptText(fixture.text);
  const errors: string[] = [];

  if (result.bancoDetectado !== fixture.expectBanco) {
    errors.push(
      `banco: got ${result.bancoDetectado}, want ${fixture.expectBanco}`,
    );
  }
  if (result.referencia !== fixture.expectReferencia) {
    errors.push(
      `referencia: got ${result.referencia}, want ${fixture.expectReferencia}`,
    );
  }
  if (result.monto !== fixture.expectMonto) {
    errors.push(`monto: got ${result.monto}, want ${fixture.expectMonto}`);
  }
  if (!result.fechaComprobante) {
    errors.push("fecha: missing");
  }
  if (result.confidence < 3) {
    errors.push(`confidence: got ${result.confidence}, want 3`);
  }

  if (errors.length) {
    failed += 1;
    console.error(`FAIL ${fixture.name}`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    console.log(`OK   ${fixture.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${FIXTURES.length} fixtures failed`);
  process.exit(1);
}

console.log(`\nAll ${FIXTURES.length} fixtures passed`);
