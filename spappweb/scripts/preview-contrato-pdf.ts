/**
 * ponytail: one-shot preview of the signed-contract PDF look.
 * Run: npx tsx scripts/preview-contrato-pdf.ts
 */
import Module from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const req = Module.prototype.require;
Module.prototype.require = function (this: NodeModule, id: string) {
  if (id === "server-only") return {};
  return req.apply(this, arguments as unknown as [string]);
};

async function main() {
  const { generateContratoPdf } = await import(
    "../src/lib/contracts/contract-pdf"
  );
  const {
    buildContratoComercial,
    colombiaDateParts,
  } = await import("../src/lib/contracts/contrato-renting-clausulas");

  const fecha = colombiaDateParts();
  const comercial = buildContratoComercial({
    modelo: "BRZ 200",
    color: "Rojo",
    placa: "ABC12D",
    chasis: "9AB12345678901234",
    referencia: "REF-001",
    frecuencia_pago: "diario",
    cuota_inicial_monto: 500_000,
    monto_cuota_periodo: 25_000,
  });

  // 1x1 transparent PNG — placeholder for client signature
  const blankSig =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const buf = await generateContratoPdf({
    contrato: {
      ...comercial,
      nombreContratante: "JUAN CARLOS EJEMPLO",
      cedulaContratante: "1.234.567.890",
      tipoDocumentoContratante: "C.C.",
      direccionNotificaciones: "Calle 45 #12-34, barrio Centro",
      ciudadContratante: "Bucaramanga",
      departamentoContratante: "Santander",
      fechaFirmaDia: fecha.dia,
      fechaFirmaMes: fecha.mes,
      fechaFirmaAnio: fecha.anio,
    },
    signatureDataUrl: blankSig,
  });

  const out = path.join(process.cwd(), "preview-contrato-pinilla.pdf");
  await writeFile(out, buf);
  console.log("OK", out, buf.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
