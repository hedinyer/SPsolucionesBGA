"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitPipelineEvent } from "@/lib/agent/pipeline-events";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hojaVidaFormSchema,
  hojaVidaFormToJson,
  type HojaVidaFormData,
} from "@/lib/contracts/hoja-vida-schema";
import {
  blocksNewDocumentSubmission,
  isHojaVidaComplete,
} from "@/lib/contracts/hoja-vida-validation";
import type { DigitalContractRow } from "@/lib/pipeline/types";
import { resolveReferralSource } from "@/lib/referrals";

const cedulaSchema = z
  .string()
  .trim()
  .min(5, "La cédula debe tener al menos 5 dígitos")
  .max(15, "La cédula no puede superar 15 dígitos")
  .regex(/^\d+$/, "La cédula solo puede contener números");

const submitApplicationSchema = z.object({
  documentFrontUrl: z.string().url(),
  documentBackUrl: z.string().url(),
  selfieUrl: z.string().url(),
  hojaVida: hojaVidaFormSchema,
  referralSource: z.string().optional().nullable(),
});

async function ensureUserByCedula(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  cedula: string,
): Promise<number> {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("user", cedula)
    .maybeSingle();

  if (existing) return existing.id as number;

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      user: cedula,
      password: cedula,
      status: "normal",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created.id as number;
}

async function getOrCreateContract(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: number,
  usersDocumentsId: number,
): Promise<DigitalContractRow> {
  const { data: existing } = await supabase
    .from("digital_contracts")
    .select(
      "id, user_id, users_documents_id, status, hoja_vida_data, contrato_data, admin_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path, signed_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("users_documents_id", usersDocumentsId)
    .maybeSingle();

  if (existing) return existing as DigitalContractRow;

  const { data, error } = await supabase
    .from("digital_contracts")
    .insert({
      user_id: userId,
      users_documents_id: usersDocumentsId,
      status: "borrador",
    })
    .select(
      "id, user_id, users_documents_id, status, hoja_vida_data, contrato_data, admin_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path, signed_at, created_at, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return data as DigitalContractRow;
}

/** Envío público: documentos + hoja de vida en un solo paso (sin login). */
export async function submitPublicApplication(
  input: z.infer<typeof submitApplicationSchema>,
) {
  const parsed = submitApplicationSchema.parse(input);
  const hojaVida = parsed.hojaVida;
  const referralSource = resolveReferralSource(parsed.referralSource);

  if (!isHojaVidaComplete(hojaVida)) {
    throw new Error("Completa todos los campos de la hoja de vida.");
  }

  const cedula = cedulaSchema.parse(hojaVida.numero_identificacion);
  const supabase = createAdminClient();
  const userId = await ensureUserByCedula(supabase, cedula);

  const { data: latestDoc } = await supabase
    .from("users_documents")
    .select("id, estado_solicitud, betado, referral_source")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const docPayload = {
    document_front_url: parsed.documentFrontUrl,
    document_back_url: parsed.documentBackUrl,
    selfie_url: parsed.selfieUrl,
    hora_actualizacion: new Date().toISOString(),
  };

  if (latestDoc?.estado_solicitud === "pendiente") {
    // First-touch: no pisar una atribución ya guardada.
    const updatePayload = !latestDoc.referral_source
      ? { ...docPayload, referral_source: referralSource }
      : docPayload;

    const { error: updateError } = await supabase
      .from("users_documents")
      .update(updatePayload)
      .eq("id", latestDoc.id);

    if (updateError) throw new Error(updateError.message);

    const contract = await getOrCreateContract(
      supabase,
      userId,
      latestDoc.id as number,
    );

    const { error: contractError } = await supabase
      .from("digital_contracts")
      .update({ hoja_vida_data: hojaVidaFormToJson(hojaVida) })
      .eq("id", contract.id);

    if (contractError) throw new Error(contractError.message);

    await emitPipelineEvent({
      userId,
      kind: "solicitud_recibida",
      payload: {
        displayName: hojaVida.nombre_completo,
        celular: hojaVida.celular,
        cedula,
      },
    });

    revalidatePath("/inbox");
    revalidatePath(`/clientes/${userId}`);
    revalidatePath("/visitadores");
    return { ok: true, userId, updated: true };
  }

  const blockMsg = blocksNewDocumentSubmission(
    latestDoc as { estado_solicitud: string; betado: boolean } | null,
  );
  if (blockMsg) throw new Error(blockMsg);

  const { data: document, error: docError } = await supabase
    .from("users_documents")
    .insert({
      user_id: userId,
      ...docPayload,
      referral_source: referralSource,
      estado_solicitud: "pendiente",
      betado: false,
    })
    .select("id")
    .single();

  if (docError) throw new Error(docError.message);

  const contract = await getOrCreateContract(
    supabase,
    userId,
    document.id as number,
  );

  const { error: contractError } = await supabase
    .from("digital_contracts")
    .update({ hoja_vida_data: hojaVidaFormToJson(hojaVida) })
    .eq("id", contract.id);

  if (contractError) throw new Error(contractError.message);

  await emitPipelineEvent({
    userId,
    kind: "solicitud_recibida",
    payload: {
      displayName: hojaVida.nombre_completo,
      celular: hojaVida.celular,
      cedula,
    },
  });

  revalidatePath("/inbox");
  revalidatePath(`/clientes/${userId}`);
  revalidatePath("/visitadores");
  return { ok: true, userId };
}
