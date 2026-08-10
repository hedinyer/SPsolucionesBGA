import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContratoDataFromStored,
  type CompraContratoInput,
} from "@/lib/contracts/contrato-renting-clausulas";
import {
  generateContratoPdf,
  generateHojaVidaPdf,
} from "@/lib/contracts/contract-pdf";
import {
  hojaVidaFormToJson,
  type HojaVidaFormData,
} from "@/lib/contracts/hoja-vida-schema";

const BUCKET = "contract-documents";

/** Regenera PDFs de un contrato ya firmado (misma firma, datos actualizados). */
export async function regenerateSignedContractPdfs(
  supabase: SupabaseClient,
  args: {
    contractId: string;
    userId: number;
    hojaVida: HojaVidaFormData;
    contratoData: Record<string, unknown>;
    signaturePath: string;
    hojaVidaPdfPath: string | null;
    contratoPdfPath: string | null;
    compra: CompraContratoInput | null;
  },
): Promise<{ hojaVidaPdfPath: string; contratoPdfPath: string }> {
  const { data: sigFile, error: sigError } = await supabase.storage
    .from(BUCKET)
    .download(args.signaturePath);

  if (sigError || !sigFile) {
    throw new Error(
      `No se pudo leer la firma guardada. ${sigError?.message ?? ""}`.trim(),
    );
  }

  const signatureDataUrl = `data:image/png;base64,${Buffer.from(await sigFile.arrayBuffer()).toString("base64")}`;
  const contrato = buildContratoDataFromStored(
    {
      ...args.contratoData,
      tipo_documento_contratante: args.hojaVida.tipo_identificacion,
    },
    args.compra,
  );
  const hojaJson = hojaVidaFormToJson(args.hojaVida);

  const [hojaVidaPdf, contratoPdf] = await Promise.all([
    generateHojaVidaPdf({
      hoja: hojaJson,
      signatureDataUrl,
      comercial: {
        placa: contrato.placa,
        chasis: contrato.chasis,
        color: contrato.color,
        referencia: contrato.referencia,
        modelo: contrato.modelo,
        cuotaInicial: contrato.cuotaInicial,
        valorCuota: contrato.valorCuota,
        frecuenciaPago: contrato.frecuenciaPago,
      },
    }),
    generateContratoPdf({
      contrato,
      signatureDataUrl,
    }),
  ]);

  const base = `${args.userId}/${args.contractId}`;
  const hojaVidaPdfPath = args.hojaVidaPdfPath ?? `${base}/hoja_vida.pdf`;
  const contratoPdfPath = args.contratoPdfPath ?? `${base}/contrato.pdf`;

  const uploads = await Promise.all([
    supabase.storage.from(BUCKET).upload(hojaVidaPdfPath, hojaVidaPdf, {
      contentType: "application/pdf",
      upsert: true,
    }),
    supabase.storage.from(BUCKET).upload(contratoPdfPath, contratoPdf, {
      contentType: "application/pdf",
      upsert: true,
    }),
  ]);
  const uploadError = uploads.find((u) => u.error)?.error;
  if (uploadError) {
    throw new Error(`No se pudo subir el PDF. ${uploadError.message}`);
  }

  return { hojaVidaPdfPath, contratoPdfPath };
}
