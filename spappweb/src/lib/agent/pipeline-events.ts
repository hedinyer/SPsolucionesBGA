import "server-only";

import type { PipelineStepId } from "@/lib/pipeline/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/utils/site-url";

export const PIPELINE_EVENT_KINDS = [
  "solicitud_recibida",
  "credito_aprobado",
  "credito_rechazado",
  "moto_asignada",
  "contrato_firmado",
  "pago_completo",
  "visita_asignada",
  "visita_completada",
  "visita_cancelada",
  "entrega_marcada",
  "compra_cancelada",
] as const;

export type PipelineEventKind = (typeof PIPELINE_EVENT_KINDS)[number];

const STEP_LABELS: Record<PipelineStepId, string> = {
  credito: "Crédito",
  moto: "Moto",
  contrato: "Contrato",
  pago: "Pago",
  visita: "Visita",
  entrega: "Entrega",
};

const KIND_STEP: Partial<Record<PipelineEventKind, PipelineStepId>> = {
  solicitud_recibida: "credito",
  credito_aprobado: "credito",
  credito_rechazado: "credito",
  moto_asignada: "moto",
  contrato_firmado: "contrato",
  pago_completo: "pago",
  visita_asignada: "visita",
  visita_completada: "visita",
  visita_cancelada: "visita",
  entrega_marcada: "entrega",
  compra_cancelada: "entrega",
};

export interface PipelineEventPayload {
  displayName: string;
  celular: string | null;
  cedula: string | null;
  stepId: PipelineStepId | null;
  stepLabel: string | null;
  moto?: {
    modelo: string;
    color: string;
    placa: string | null;
    chasis: string | null;
  };
  contractId?: string;
  contractUrl?: string;
  fechaProgramada?: string | null;
  visitadorNombre?: string | null;
  motivo?: string | null;
  extra?: Record<string, unknown>;
}

export interface PipelineEventRow {
  id: string;
  userId: number;
  kind: PipelineEventKind;
  stepId: PipelineStepId | null;
  payload: PipelineEventPayload;
  whatsappHint: string;
  createdAt: string;
  ackedAt: string | null;
  ackedBy: string | null;
}

interface ClientContact {
  displayName: string;
  celular: string | null;
  cedula: string | null;
  contractId: string | null;
}

function normalizeCelular(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `57${digits}`;
  if (digits.startsWith("57") && digits.length >= 12) return digits;
  return digits;
}

function hojaNombre(hoja: Record<string, unknown> | null | undefined): string {
  if (!hoja) return "";
  const full = String(hoja.nombre_completo ?? "").trim();
  if (full) return full;
  const nombres = String(hoja.nombres ?? "").trim();
  const apellidos = String(hoja.apellidos ?? "").trim();
  if (nombres && apellidos) return `${nombres} ${apellidos}`;
  return String(hoja.nombre ?? "").trim();
}

async function loadClientContact(userId: number): Promise<ClientContact> {
  const supabase = createAdminClient();

  const [{ data: user }, { data: contract }, { data: visita }] = await Promise.all([
    supabase.from("users").select("user").eq("id", userId).maybeSingle(),
    supabase
      .from("digital_contracts")
      .select("id, hoja_vida_data, contrato_data")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("visitas")
      .select("cliente_nombre, cliente_celular")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hoja = (contract?.hoja_vida_data ?? {}) as Record<string, unknown>;
  const contratoData = (contract?.contrato_data ?? {}) as Record<string, unknown>;
  const displayName =
    hojaNombre(hoja) ||
    String(contratoData.nombre_contratante ?? "").trim() ||
    String(visita?.cliente_nombre ?? "").trim() ||
    String(user?.user ?? `Cliente ${userId}`);

  const celular =
    normalizeCelular(String(hoja.celular ?? "")) ||
    normalizeCelular(String(visita?.cliente_celular ?? "")) ||
    null;

  return {
    displayName,
    celular,
    cedula: String(user?.user ?? "").trim() || null,
    contractId: (contract?.id as string | undefined) ?? null,
  };
}

function buildWhatsAppHint(
  kind: PipelineEventKind,
  contact: ClientContact,
  payload: PipelineEventPayload,
): string {
  const nombre = contact.displayName;
  const moto = payload.moto;
  const contrato = payload.contractUrl ?? "";

  switch (kind) {
    case "solicitud_recibida":
      return `Hola ${nombre}, recibimos tu solicitud de crédito en Soluciones Garrido. La estamos revisando y te avisaremos pronto.`;
    case "credito_aprobado":
      return `¡Felicitaciones ${nombre}! Tu crédito fue aprobado. Pronto te contactaremos para continuar con la asignación de tu moto.`;
    case "credito_rechazado":
      return `Hola ${nombre}, lamentamos informarte que tu solicitud de crédito no fue aprobada${payload.motivo ? `: ${payload.motivo}` : "."}`;
    case "moto_asignada":
      return `Hola ${nombre}, tu moto ${moto?.modelo ?? ""} ${moto?.color ?? ""} fue asignada${moto?.placa ? ` (placa ${moto.placa})` : ""}. Firma tu contrato aquí: ${contrato}`;
    case "contrato_firmado":
      return `Hola ${nombre}, tu contrato fue firmado correctamente. Realiza tu primer pago para continuar con la entrega de tu moto.`;
    case "pago_completo":
      return `¡Excelente ${nombre}! Confirmamos tu primer pago. Tu moto está lista para el siguiente paso (visita o entrega según corresponda).`;
    case "visita_asignada":
      return `Hola ${nombre}, tu visita domiciliaria quedó programada${payload.fechaProgramada ? ` para ${payload.fechaProgramada}` : ""}${payload.visitadorNombre ? ` con ${payload.visitadorNombre}` : ""}.`;
    case "visita_completada":
      return `Hola ${nombre}, tu visita domiciliaria fue completada. Gracias por tu colaboración.`;
    case "visita_cancelada":
      return `Hola ${nombre}, tu visita domiciliaria fue cancelada${payload.motivo ? `: ${payload.motivo}` : "."} Te contactaremos para reprogramar.`;
    case "entrega_marcada":
      return `¡Felicitaciones ${nombre}! Tu moto${moto?.placa ? ` placa ${moto.placa}` : ""} fue entregada. ¡Bienvenido a la familia Garrido!`;
    case "compra_cancelada":
      return `Hola ${nombre}, tu proceso de compra fue cancelado${payload.motivo ? `: ${payload.motivo}` : "."}`;
    default:
      return `Actualización de tu proceso en Soluciones Garrido, ${nombre}.`;
  }
}

function toRow(raw: Record<string, unknown>): PipelineEventRow {
  return {
    id: String(raw.id),
    userId: Number(raw.user_id),
    kind: String(raw.kind) as PipelineEventKind,
    stepId: (raw.step_id as PipelineStepId | null) ?? null,
    payload: (raw.payload ?? {}) as PipelineEventPayload,
    whatsappHint: String(raw.whatsapp_hint ?? ""),
    createdAt: String(raw.created_at),
    ackedAt: raw.acked_at ? String(raw.acked_at) : null,
    ackedBy: raw.acked_by ? String(raw.acked_by) : null,
  };
}

/** Registra un evento del pipeline para que Hermes envíe WhatsApp. No lanza si falla el insert. */
export async function emitPipelineEvent(input: {
  userId: number;
  kind: PipelineEventKind;
  payload?: Partial<PipelineEventPayload>;
}): Promise<void> {
  try {
    const contact = await loadClientContact(input.userId);
    const stepId =
      input.payload?.stepId ?? KIND_STEP[input.kind] ?? null;
    const stepLabel =
      input.payload?.stepLabel ??
      (stepId ? STEP_LABELS[stepId] : null);

    const contractId = input.payload?.contractId ?? contact.contractId ?? undefined;
    const contractUrl =
      input.payload?.contractUrl ??
      (contractId ? `${getSiteUrl()}/contrato/${contractId}` : undefined);

    const payload: PipelineEventPayload = {
      displayName: input.payload?.displayName ?? contact.displayName,
      celular: input.payload?.celular ?? contact.celular,
      cedula: input.payload?.cedula ?? contact.cedula,
      stepId,
      stepLabel,
      ...input.payload,
      contractId,
      contractUrl,
    };

    const whatsappHint = buildWhatsAppHint(input.kind, contact, payload);
    const supabase = createAdminClient();

    const { error } = await supabase.from("pipeline_events").insert({
      user_id: input.userId,
      kind: input.kind,
      step_id: stepId,
      payload,
      whatsapp_hint: whatsappHint,
    });

    if (error) {
      console.error("[pipeline-events] insert failed:", error.message);
    }
  } catch (e) {
    console.error(
      "[pipeline-events] emit failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

/** Tras confirmar pagos, emite `pago_completo` solo si la compra acaba de pasar a lista_retiro. */
export async function emitPagoCompletoOnTransition(
  userId: number,
  compraId: string,
  previousEstado: string | null | undefined,
): Promise<void> {
  if (previousEstado === "lista_retiro") return;

  const supabase = createAdminClient();
  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select(
      "estado, pago_inicial_confirmado, pago_cuota_confirmado, modelo, color, placa, chasis",
    )
    .eq("id", compraId)
    .maybeSingle();

  if (
    !compra ||
    compra.estado !== "lista_retiro" ||
    !compra.pago_inicial_confirmado ||
    !compra.pago_cuota_confirmado
  ) {
    return;
  }

  await emitPipelineEvent({
    userId,
    kind: "pago_completo",
    payload: {
      moto: {
        modelo: String(compra.modelo ?? ""),
        color: String(compra.color ?? ""),
        placa: (compra.placa as string | null) ?? null,
        chasis: (compra.chasis as string | null) ?? null,
      },
    },
  });
}

export async function listPipelineEvents(options?: {
  pendingOnly?: boolean;
  limit?: number;
  since?: string;
}): Promise<PipelineEventRow[]> {
  const supabase = createAdminClient();
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

  let query = supabase
    .from("pipeline_events")
    .select(
      "id, user_id, kind, step_id, payload, whatsapp_hint, created_at, acked_at, acked_by",
    )
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.pendingOnly !== false) {
    query = query.is("acked_at", null);
  }
  if (options?.since) {
    query = query.gte("created_at", options.since);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toRow);
}

export async function ackPipelineEvents(
  eventIds: string[],
  ackedBy = "hermes",
): Promise<{ acked: number }> {
  if (!eventIds.length) return { acked: 0 };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("pipeline_events")
    .update({ acked_at: now, acked_by: ackedBy })
    .in("id", eventIds)
    .is("acked_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  return { acked: data?.length ?? 0 };
}
