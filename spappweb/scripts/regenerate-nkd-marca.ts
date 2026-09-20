/**
 * Regenera PDFs de contratos firmados de motos NKD (marca BERA → NKD).
 * Run: npx tsx scripts/regenerate-nkd-marca.ts
 */
import Module from "node:module";

const req = Module.prototype.require;
Module.prototype.require = function (this: NodeModule, id: string) {
  if (id === "server-only") return {};
  return req.apply(this, arguments as unknown as [string]);
};

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { parseHojaVidaForm } = await import(
    "../src/lib/contracts/hoja-vida-schema"
  );
  const { regenerateSignedContractPdfs } = await import(
    "../src/lib/contracts/regenerate-signed-pdfs"
  );
  const {
    condicionFromAdminData,
    diasContratoFromAdminData,
    esRenovacionFromAdminData,
    buildContratoDataFromStored,
    marcaMotoFromModelo,
  } = await import("../src/lib/contracts/contrato-renting-clausulas");

  const supabase = createAdminClient();

  const { data: compras, error: comprasError } = await supabase
    .from("user_moto_compra")
    .select("user_id, modelo, placa")
    .ilike("modelo", "%nkd%");
  if (comprasError) throw new Error(comprasError.message);

  const nkdUserIds = [
    ...new Set((compras ?? []).map((c) => c.user_id as number)),
  ];
  if (nkdUserIds.length === 0) {
    console.log("No hay compras NKD.");
    return;
  }

  const modeloByUser = new Map(
    (compras ?? []).map((c) => [c.user_id as number, String(c.modelo)]),
  );

  const { data: rows, error } = await supabase
    .from("digital_contracts")
    .select(
      "id, user_id, hoja_vida_data, contrato_data, admin_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path",
    )
    .eq("status", "firmado")
    .not("signature_path", "is", null)
    .in("user_id", nkdUserIds);

  if (error) throw new Error(error.message);
  if (!rows?.length) {
    console.log("No hay contratos firmados NKD.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const userId = row.user_id as number;
    if (!row.signature_path) {
      skipped += 1;
      continue;
    }

    try {
      const hojaVida = parseHojaVidaForm(
        (row.hoja_vida_data as Record<string, unknown>) ?? {},
      );
      const { data: compra } = await supabase
        .from("user_moto_compra")
        .select(
          "modelo, color, placa, chasis, referencia, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, admin_data",
        )
        .eq("user_id", userId)
        .maybeSingle();

      const compraInput =
        compra?.placa && compra.chasis
          ? {
              modelo: compra.modelo as string,
              color: compra.color as string,
              placa: compra.placa as string,
              chasis: compra.chasis as string,
              referencia: (compra.referencia as string | null) ?? null,
              frecuencia_pago: compra.frecuencia_pago as
                | "diario"
                | "semanal"
                | "quincenal"
                | "mensual",
              cuota_inicial_monto: compra.cuota_inicial_monto as number,
              monto_cuota_periodo: compra.monto_cuota_periodo as number,
              condicion: condicionFromAdminData(compra.admin_data),
              diasContrato: diasContratoFromAdminData(compra.admin_data),
              esRenovacion: esRenovacionFromAdminData(compra.admin_data),
            }
          : null;

      if (!compraInput) {
        console.warn(
          `SKIP user ${userId}: sin placa/chasis (modelo ${modeloByUser.get(userId) ?? "?"})`,
        );
        skipped += 1;
        continue;
      }

      const marca = marcaMotoFromModelo(compraInput.modelo);
      if (marca !== "NKD") {
        console.warn(
          `SKIP user ${userId}: modelo ${compraInput.modelo} → marca ${marca}`,
        );
        skipped += 1;
        continue;
      }

      const contratoData: Record<string, unknown> = {
        ...((row.contrato_data as Record<string, unknown>) ?? {}),
        celular_contratante: hojaVida.celular,
        moto_marca: marca,
        moto_modelo: compraInput.modelo,
      };

      const paths = await regenerateSignedContractPdfs(supabase, {
        contractId: row.id as string,
        userId,
        hojaVida,
        contratoData,
        signaturePath: row.signature_path as string,
        hojaVidaPdfPath: (row.hoja_vida_pdf_path as string | null) ?? null,
        contratoPdfPath: (row.contrato_pdf_path as string | null) ?? null,
        compra: compraInput,
      });

      const rebuilt = buildContratoDataFromStored(contratoData, compraInput);
      const { error: updateError } = await supabase
        .from("digital_contracts")
        .update({
          contrato_data: {
            ...contratoData,
            moto_marca: rebuilt.marca,
            moto_placa: rebuilt.placa,
            moto_estado: rebuilt.estado,
            moto_modelo: rebuilt.modelo,
            moto_color: rebuilt.color,
            moto_chasis: rebuilt.chasis,
            celular_contratante: hojaVida.celular,
            valor_cuota:
              compraInput.monto_cuota_periodo ?? contratoData.valor_cuota,
            cuota_inicial:
              compraInput.cuota_inicial_monto ?? contratoData.cuota_inicial,
            frecuencia_pago:
              compraInput.frecuencia_pago ?? contratoData.frecuencia_pago,
            total_contrato: rebuilt.totalContrato,
            dias_contrato: rebuilt.diasContrato,
          },
          hoja_vida_pdf_path: paths.hojaVidaPdfPath,
          contrato_pdf_path: paths.contratoPdfPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);

      ok += 1;
      console.log(
        `OK user ${userId} · ${compraInput.modelo} · placa ${rebuilt.placa} · marca ${rebuilt.marca}`,
      );
    } catch (e) {
      failed += 1;
      console.error(
        `FAIL user ${userId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(`\nListo: ${ok} OK · ${skipped} skip · ${failed} fail`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
