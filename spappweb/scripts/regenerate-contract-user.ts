/** npx tsx scripts/regenerate-contract-user.ts [userId] */
import Module from "node:module";

const req = Module.prototype.require;
Module.prototype.require = function (this: NodeModule, id: string) {
  if (id === "server-only") return {};
  return req.apply(this, arguments as unknown as [string]);
};

const userIdArg = process.argv[2];
const onlyUserId = userIdArg ? Number(userIdArg) : null;
if (userIdArg && (!Number.isFinite(onlyUserId) || onlyUserId <= 0)) {
  console.error("Usage: npx tsx scripts/regenerate-contract-user.ts [userId]");
  process.exit(1);
}

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
    buildContratoDataFromStored,
  } = await import("../src/lib/contracts/contrato-renting-clausulas");

  const supabase = createAdminClient();

  let query = supabase
    .from("digital_contracts")
    .select(
      "id, user_id, hoja_vida_data, contrato_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path",
    )
    .eq("status", "firmado")
    .not("signature_path", "is", null);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows?.length) {
    throw new Error(
      onlyUserId
        ? `Sin contrato firmado user ${onlyUserId}`
        : "No hay contratos firmados.",
    );
  }

  for (const row of rows) {
    const userId = row.user_id as number;
    if (!row.signature_path) continue;

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
          }
        : null;

    const contratoData = {
      ...((row.contrato_data as Record<string, unknown>) ?? {}),
      celular_contratante: hojaVida.celular,
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
          moto_placa: rebuilt.placa,
          moto_estado: rebuilt.estado,
          celular_contratante: hojaVida.celular,
        },
        hoja_vida_pdf_path: paths.hojaVidaPdfPath,
        contrato_pdf_path: paths.contratoPdfPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    console.log(
      `OK user ${userId} · placa ${rebuilt.placa} · ${paths.contratoPdfPath}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
