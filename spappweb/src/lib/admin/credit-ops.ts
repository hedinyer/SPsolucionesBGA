import "server-only";

import { z } from "zod";
import { emitPipelineEvent } from "@/lib/agent/pipeline-events";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreditOpResult =
  | { ok: true; contractId?: string }
  | { ok: false; error: string };

function mapDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("permission denied")) {
    return "Sin permisos para actualizar en la base de datos.";
  }
  return message;
}

export async function approveCreditOp(
  documentId: number,
  userId: number,
): Promise<CreditOpResult> {
  const docId = Number(documentId);
  const uid = Number(userId);
  if (!Number.isFinite(docId) || !Number.isFinite(uid)) {
    return { ok: false, error: "Datos de solicitud inválidos." };
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("users_documents")
    .update({
      estado_solicitud: "aceptada",
      hora_actualizacion: new Date().toISOString(),
    })
    .eq("id", docId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mapDbError(error.message) };
  if (!updated) {
    return { ok: false, error: "Solicitud no encontrada o sin permisos." };
  }

  await emitPipelineEvent({ userId: uid, kind: "credito_aprobado" });

  return { ok: true };
}

const rejectSchema = z.object({
  documentId: z.number().int().positive(),
  userId: z.number().int().positive(),
  motivo: z.string().min(3, "Escribe un motivo de al menos 3 caracteres"),
  betado: z.boolean(),
});

export async function rejectCreditOp(
  input: z.infer<typeof rejectSchema>,
): Promise<CreditOpResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("users_documents")
    .update({
      estado_solicitud: "rechazada",
      motivo_rechazo: parsed.data.motivo.trim(),
      betado: parsed.data.betado,
      hora_actualizacion: new Date().toISOString(),
    })
    .eq("id", parsed.data.documentId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mapDbError(error.message) };
  if (!updated) {
    return { ok: false, error: "Solicitud no encontrada o sin permisos." };
  }

  await emitPipelineEvent({
    userId: parsed.data.userId,
    kind: "credito_rechazado",
    payload: { motivo: parsed.data.motivo.trim() },
  });

  return { ok: true };
}
