"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import {
  isReferenciaDuplicada,
  normalizeReferencia,
} from "@/lib/payments/referencia";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import type { MedioPagoAdmin } from "@/lib/pipeline/types";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const MEDIO_PAGO_ADMIN_VALUES = [
  "nequi_nicolas",
  "davivienda",
  "efectivo",
  "datafono",
] as const;

function revalidateClient(userId: number) {
  revalidatePath("/inbox");
  revalidatePath("/caja");
  revalidatePath(`/clientes/${userId}`);
}

async function assertAdmin() {
  const session = await requireAdminSession();
  return { supabase: createAdminClient(), admin: session.username ?? "admin" };
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function validateImageFile(file: unknown): File {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona una imagen del comprobante.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen no puede superar 5 MB.");
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Usa JPG, PNG o WebP.");
  }
  return file;
}

function optionalImageFile(file: unknown): File | null {
  if (!(file instanceof File) || file.size === 0) return null;
  return validateImageFile(file);
}

function isPresencialMedio(medio: MedioPagoAdmin): boolean {
  return medio === "efectivo" || medio === "datafono";
}

function resolveReferenciaPresencial(
  medio: MedioPagoAdmin,
  referencia: string,
): string {
  const trimmed = referencia.trim();
  if (trimmed) return normalizeReferencia(trimmed);
  if (medio === "efectivo") return `EF-${Date.now()}`;
  if (medio === "datafono") return `DF-${Date.now()}`;
  return trimmed;
}

async function assertReferenciaUnicaPorCliente(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: number,
  referencia: string,
) {
  const normalizada = normalizeReferencia(referencia);
  if (!normalizada) {
    throw new Error("Ingresa la referencia.");
  }

  const { data, error } = await supabase
    .from("pagos")
    .select("id, referencia")
    .eq("user_id", userId)
    .not("referencia", "is", null);

  if (error) throw new Error(error.message);

  if (
    isReferenciaDuplicada(
      normalizada,
      (data ?? []).map((p) => p.referencia),
    )
  ) {
    throw new Error("Esa referencia ya está registrada para este cliente.");
  }
}

const congelarCuotasSchema = z.object({
  userId: z.number().int().positive(),
  compraId: z.string().uuid(),
  dias: z.number().int().min(1).max(365),
  observaciones: z.string().max(2000).optional(),
});

export async function congelarCuotas(
  input: z.infer<typeof congelarCuotasSchema>,
): Promise<{ cuotasAfectadas: number }> {
  const parsed = congelarCuotasSchema.parse(input);
  const { supabase, admin } = await assertAdmin();

  const { data, error } = await supabase.rpc("congelar_cuotas_compra", {
    p_compra_id: parsed.compraId,
    p_dias: parsed.dias,
    p_observaciones: parsed.observaciones ?? null,
    p_admin: admin,
  });

  if (error) throw new Error(error.message);

  revalidateClient(parsed.userId);
  return { cuotasAfectadas: Number(data) };
}

export async function saldarCredito(
  formData: FormData,
): Promise<{ pagoId: string; confirmadoAt: string }> {
  const userId = Number(formData.get("userId"));
  const compraId = String(formData.get("compraId"));
  const monto = Number(formData.get("monto"));
  const medioPagoAdmin = String(
    formData.get("medioPagoAdmin"),
  ) as MedioPagoAdmin;
  const referenciaRaw = formData.get("referencia")
    ? String(formData.get("referencia"))
    : "";
  const notas = formData.get("notas") ? String(formData.get("notas")) : undefined;
  const fechaComprobante = formData.get("fechaComprobante")
    ? String(formData.get("fechaComprobante"))
    : undefined;

  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Cliente inválido.");
  }
  if (!compraId) throw new Error("Compra inválida.");
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("Ingresa un monto válido.");
  }
  if (!MEDIO_PAGO_ADMIN_VALUES.includes(medioPagoAdmin)) {
    throw new Error("Medio de pago inválido.");
  }

  const presencial = isPresencialMedio(medioPagoAdmin);
  const file = optionalImageFile(formData.get("file"));

  if (!file && !presencial) {
    throw new Error("Sube el comprobante de pago.");
  }

  let referencia = referenciaRaw.trim();
  if (presencial) {
    referencia = resolveReferenciaPresencial(medioPagoAdmin, referencia);
  }
  if (!referencia) {
    throw new Error("Ingresa la referencia.");
  }

  const { supabase, admin } = await assertAdmin();
  await assertReferenciaUnicaPorCliente(supabase, userId, referencia);

  let comprobanteUrl: string | null = null;
  if (file) {
    const path = `${userId}/${compraId}/${Date.now()}.${extensionFor(file.type)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.pagosComprobantes)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`No se pudo subir el comprobante: ${uploadError.message}`);
    }

    comprobanteUrl = getStoragePublicUrl(
      STORAGE_BUCKETS.pagosComprobantes,
      path,
    );
    if (!comprobanteUrl) {
      throw new Error("No se pudo obtener la URL del comprobante.");
    }
  }

  let fechaIso: string | null = null;
  if (fechaComprobante?.trim()) {
    const d = new Date(fechaComprobante);
    if (Number.isNaN(d.getTime())) {
      throw new Error("Fecha inválida.");
    }
    fechaIso = d.toISOString();
  } else if (presencial) {
    fechaIso = new Date().toISOString();
  }

  const { data: pagoId, error } = await supabase.rpc("saldar_credito_compra", {
    p_compra_id: compraId,
    p_user_id: userId,
    p_monto: monto,
    p_medio_pago_admin: medioPagoAdmin,
    p_referencia: normalizeReferencia(referencia),
    p_comprobante_url: comprobanteUrl,
    p_notas_admin: notas?.trim() || null,
    p_confirmado_por: admin,
    p_fecha_comprobante: fechaIso,
  });

  if (error) throw new Error(error.message);
  if (!pagoId) throw new Error("No se registró el pago de liquidación.");

  const confirmadoAt = fechaIso ?? new Date().toISOString();
  revalidateClient(userId);
  return { pagoId: String(pagoId), confirmadoAt };
}
