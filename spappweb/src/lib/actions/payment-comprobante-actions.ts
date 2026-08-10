"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitPagoCompletoOnTransition } from "@/lib/agent/pipeline-events";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import {
  cuotaDiariaFromPeriodo,
  montoCuotaPeriodo,
} from "@/lib/moto-payment";
import {
  faltanteConcepto,
  type PrimerPagoConcepto,
} from "@/lib/payments/primer-pago-progress";
import type { FrecuenciaPago } from "@/lib/pipeline/types";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import {
  isReferenciaDuplicada,
  normalizeReferencia,
} from "@/lib/payments/referencia";
import type {
  BancoOrigen,
  ContextoPago,
  MedioPagoAdmin,
  PagoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import { BANCO_ORIGEN_LABELS } from "@/lib/pipeline/types";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const MEDIO_PAGO_ADMIN_VALUES = [
  "nequi_nicolas",
  "davivienda",
  "efectivo",
  "datafono",
] as const;

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

function revalidateClient(userId: number) {
  revalidatePath("/inbox");
  revalidatePath("/caja");
  revalidatePath(`/clientes/${userId}`);
}

async function assertAdmin() {
  await requireAdminSession();
  return createAdminClient();
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

function medioPagoUsuarioFromAdmin(
  medio: MedioPagoAdmin,
): "nequi" | "davivienda" | "efectivo" | "datafono" {
  if (medio === "davivienda") return "davivienda";
  if (medio === "efectivo") return "efectivo";
  if (medio === "datafono") return "datafono";
  return "nequi";
}

async function assertReferenciaUnicaPorCliente(
  supabase: Awaited<ReturnType<typeof assertAdmin>>,
  userId: number,
  referencia: string,
  excludePagoId?: string,
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

  const usadas = (data ?? [])
    .filter((row) => row.id !== excludePagoId)
    .map((row) => String(row.referencia));

  if (isReferenciaDuplicada(normalizada, usadas)) {
    throw new Error("Esta referencia ya fue usada en otro pago de este cliente.");
  }
}

async function assertConceptoNoCubierto(
  supabase: Awaited<ReturnType<typeof assertAdmin>>,
  compraId: string,
  contexto: PrimerPagoConcepto,
) {
  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select(
      "id, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto, estado, pago_inicial_confirmado, pago_cuota_confirmado, pago_visita_confirmado",
    )
    .eq("id", compraId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");

  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    throw new Error("No se pueden registrar abonos en este estado.");
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select(
      "id, monto, contexto_pago, estado, medio_pago_admin, user_moto_compra_id, user_id, referencia, comprobante_url, origen, reportado_at, confirmado_at, confirmado_por, fecha_comprobante, tarifa_objetivo_id, notas_admin, created_at, updated_at, dias_cubiertos, medio_pago_usuario",
    )
    .eq("user_moto_compra_id", compraId)
    .eq("estado", "confirmado");

  if (pagosError) throw new Error(pagosError.message);

  const faltante = faltanteConcepto(
    compra as UserMotoCompraRow,
    (pagos ?? []) as PagoRow[],
    contexto,
  );

  if (faltante <= 0) {
    const msg: Record<PrimerPagoConcepto, string> = {
      inicial: "La cuota inicial ya está cubierta.",
      cuota_adelantada: "La cuota adelantada ya está cubierta.",
      visita: "La visita domiciliaria ya está cubierta.",
    };
    throw new Error(msg[contexto]);
  }

  return { compra: compra as UserMotoCompraRow, faltante };
}

export async function checkReferenciaPagoUsada(input: {
  userId: number;
  referencia: string;
}): Promise<{ duplicada: boolean }> {
  await requireAdminSession();
  const supabase = createAdminClient();
  const normalizada = normalizeReferencia(input.referencia);
  if (!normalizada) return { duplicada: false };

  const { data, error } = await supabase
    .from("pagos")
    .select("referencia")
    .eq("user_id", input.userId)
    .not("referencia", "is", null);

  if (error) throw new Error(error.message);

  return {
    duplicada: isReferenciaDuplicada(
      normalizada,
      (data ?? []).map((row) => String(row.referencia)),
    ),
  };
}

const confirmPagoSchema = z.object({
  userId: z.number(),
  compraId: z.string().uuid(),
  contexto: z.enum(["tarifa", "inicial", "cuota_adelantada", "visita"]),
  tarifaId: z.string().uuid().optional(),
  referencia: z.string().optional(),
  monto: z.number().int().positive("El monto debe ser mayor a 0"),
  fechaComprobante: z.string().optional(),
  medioPagoAdmin: z.enum(MEDIO_PAGO_ADMIN_VALUES),
  bancoOrigen: z.enum([
    "nequi",
    "davivienda",
    "bancolombia",
    "banco_bogota",
    "pse",
    "otro",
  ]),
  entradaManual: z.boolean(),
  notas: z.string().optional(),
});

export async function confirmPagoConComprobante(
  formData: FormData,
): Promise<{ ok: true; pagoId: string; referencia: string; confirmadoAt: string }> {
  const supabase = await assertAdmin();

  const parsed = confirmPagoSchema.parse({
    userId: Number(formData.get("userId")),
    compraId: String(formData.get("compraId")),
    contexto: String(formData.get("contexto")) as ContextoPago,
    tarifaId: formData.get("tarifaId")
      ? String(formData.get("tarifaId"))
      : undefined,
    referencia: formData.get("referencia")
      ? String(formData.get("referencia")).trim()
      : undefined,
    monto: Number(formData.get("monto")),
    fechaComprobante: formData.get("fechaComprobante")
      ? String(formData.get("fechaComprobante"))
      : undefined,
    medioPagoAdmin: String(
      formData.get("medioPagoAdmin"),
    ) as MedioPagoAdmin,
    bancoOrigen: String(formData.get("bancoOrigen")) as BancoOrigen,
    entradaManual: formData.get("entradaManual") === "true",
    notas: formData.get("notas")
      ? String(formData.get("notas"))
      : undefined,
  });

  const isPrimerPago =
    parsed.contexto === "inicial" ||
    parsed.contexto === "cuota_adelantada" ||
    parsed.contexto === "visita";
  const presencial = isPresencialMedio(parsed.medioPagoAdmin);
  const file = optionalImageFile(formData.get("file"));

  if (parsed.contexto === "tarifa" && !parsed.tarifaId) {
    throw new Error("Falta la tarifa a confirmar.");
  }

  if (parsed.contexto === "tarifa" && !file && !presencial) {
    throw new Error("Sube el comprobante de pago.");
  }

  if (isPrimerPago && !file && !presencial) {
    throw new Error("Sube el comprobante de pago.");
  }

  if (isPrimerPago) {
    await assertConceptoNoCubierto(
      supabase,
      parsed.compraId,
      parsed.contexto as PrimerPagoConcepto,
    );
  }

  if (parsed.contexto === "tarifa") {
    const { data: tarifa, error: tarifaError } = await supabase
      .from("tarifas_pagadas")
      .select("id, estado, monto_esperado")
      .eq("id", parsed.tarifaId!)
      .maybeSingle();

    if (tarifaError) throw new Error(tarifaError.message);
    if (!tarifa) throw new Error("Tarifa no encontrada.");
    if (tarifa.estado === "pagada") {
      throw new Error("Esta tarifa ya está pagada.");
    }
  }

  let referencia = parsed.referencia?.trim() ?? "";
  if (presencial) {
    referencia = resolveReferenciaPresencial(parsed.medioPagoAdmin, referencia);
  }
  if (!referencia) {
    throw new Error("Ingresa la referencia.");
  }

  await assertReferenciaUnicaPorCliente(
    supabase,
    parsed.userId,
    referencia,
  );

  let comprobanteUrl: string | null = null;
  if (file) {
    const path = `${parsed.userId}/${parsed.compraId}/${Date.now()}.${extensionFor(file.type)}`;
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

  let fechaComprobante = parsed.fechaComprobante?.trim() ?? "";
  if (!fechaComprobante) {
    if (presencial) {
      fechaComprobante = new Date().toISOString();
    } else {
      throw new Error("Ingresa la fecha del comprobante.");
    }
  }

  const notasAdmin = [
    parsed.notas?.trim(),
    parsed.entradaManual ? "Entrada manual" : null,
    parsed.bancoOrigen !== "nequi" && parsed.bancoOrigen !== "davivienda"
      ? BANCO_ORIGEN_LABELS[parsed.bancoOrigen]
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;

  const { data: compraBefore } = await supabase
    .from("user_moto_compra")
    .select("estado")
    .eq("id", parsed.compraId)
    .maybeSingle();

  const { data: inserted, error: insertError } = await supabase
    .from("pagos")
    .insert({
      user_moto_compra_id: parsed.compraId,
      user_id: parsed.userId,
      monto: parsed.monto,
      medio_pago_usuario: medioPagoUsuarioFromAdmin(parsed.medioPagoAdmin),
      medio_pago_admin: parsed.medioPagoAdmin,
      referencia: normalizeReferencia(referencia),
      comprobante_url: comprobanteUrl,
      origen: "admin",
      estado: "confirmado",
      confirmado_at: new Date().toISOString(),
      confirmado_por: "admin",
      fecha_comprobante: fechaComprobante,
      tarifa_objetivo_id:
        parsed.contexto === "tarifa" ? parsed.tarifaId! : null,
      contexto_pago: parsed.contexto,
      notas_admin: notasAdmin,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new Error("Esta referencia ya fue usada en otro pago de este cliente.");
    }
    throw new Error(insertError.message);
  }

  await emitPagoCompletoOnTransition(
    parsed.userId,
    parsed.compraId,
    compraBefore?.estado as string | null,
  );

  revalidateClient(parsed.userId);
  return {
    ok: true,
    pagoId: inserted.id as string,
    referencia: normalizeReferencia(referencia),
    confirmadoAt: new Date().toISOString(),
  };
}

export async function removePagoAbono(
  pagoId: string,
  userId: number,
): Promise<{ ok: true }> {
  const supabase = await assertAdmin();

  const { data: pago, error: pagoError } = await supabase
    .from("pagos")
    .select("id, contexto_pago, user_moto_compra_id")
    .eq("id", pagoId)
    .maybeSingle();

  if (pagoError) throw new Error(pagoError.message);
  if (!pago) throw new Error("Abono no encontrado.");

  if (
    pago.contexto_pago !== "inicial" &&
    pago.contexto_pago !== "cuota_adelantada" &&
    pago.contexto_pago !== "visita"
  ) {
    throw new Error("Solo se pueden eliminar abonos del primer pago.");
  }

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select("estado")
    .eq("id", pago.user_moto_compra_id)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");

  if (compra.estado === "entregada" || compra.estado === "cancelada") {
    throw new Error("No se pueden eliminar abonos en este estado.");
  }

  const { error: deleteError } = await supabase
    .from("pagos")
    .delete()
    .eq("id", pagoId);

  if (deleteError) throw new Error(deleteError.message);

  revalidateClient(userId);
  return { ok: true };
}

export async function updatePagoAbono(input: {
  pagoId: string;
  userId: number;
  monto: number;
  referencia: string;
  medioPagoAdmin: MedioPagoAdmin;
  contexto: PrimerPagoConcepto;
}): Promise<{ ok: true }> {
  const parsed = z
    .object({
      pagoId: z.string().uuid(),
      userId: z.number().int().positive(),
      monto: z.number().int().positive("El monto debe ser mayor a 0"),
      referencia: z.string().min(1, "Ingresa la referencia."),
      medioPagoAdmin: z.enum(MEDIO_PAGO_ADMIN_VALUES),
      contexto: z.enum(["inicial", "cuota_adelantada", "visita"]),
    })
    .parse(input);

  const supabase = await assertAdmin();

  const { data: pago, error: pagoError } = await supabase
    .from("pagos")
    .select("id, contexto_pago, user_moto_compra_id, user_id, referencia")
    .eq("id", parsed.pagoId)
    .maybeSingle();

  if (pagoError) throw new Error(pagoError.message);
  if (!pago) throw new Error("Abono no encontrado.");
  if (pago.user_id !== parsed.userId) {
    throw new Error("El abono no pertenece a este cliente.");
  }

  if (
    pago.contexto_pago !== "inicial" &&
    pago.contexto_pago !== "cuota_adelantada" &&
    pago.contexto_pago !== "visita"
  ) {
    throw new Error("Solo se pueden editar abonos del primer pago.");
  }

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select("estado")
    .eq("id", pago.user_moto_compra_id)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");

  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    throw new Error("No se pueden editar abonos en este estado.");
  }

  const referencia = isPresencialMedio(parsed.medioPagoAdmin)
    ? resolveReferenciaPresencial(parsed.medioPagoAdmin, parsed.referencia)
    : normalizeReferencia(parsed.referencia);

  if (!referencia) {
    throw new Error("Ingresa la referencia.");
  }

  await assertReferenciaUnicaPorCliente(
    supabase,
    parsed.userId,
    referencia,
    parsed.pagoId,
  );

  const { error: updateError } = await supabase
    .from("pagos")
    .update({
      monto: parsed.monto,
      referencia,
      medio_pago_admin: parsed.medioPagoAdmin,
      medio_pago_usuario: medioPagoUsuarioFromAdmin(parsed.medioPagoAdmin),
      contexto_pago: parsed.contexto,
    })
    .eq("id", parsed.pagoId);

  if (updateError) {
    if (updateError.code === "23505") {
      throw new Error("Esta referencia ya fue usada en otro pago de este cliente.");
    }
    throw new Error(updateError.message);
  }

  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function updateMontosPrimerPagoCompra(input: {
  userId: number;
  compraId: string;
  cuotaInicial: number;
  montoCuotaPeriodo: number;
}): Promise<{ ok: true }> {
  const parsed = z
    .object({
      userId: z.number().int().positive(),
      compraId: z.string().uuid(),
      cuotaInicial: z.number().int().min(0),
      montoCuotaPeriodo: z.number().int().min(0),
    })
    .parse(input);

  const supabase = await assertAdmin();

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select(
      "id, digital_contract_id, estado, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto",
    )
    .eq("id", parsed.compraId)
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    throw new Error("No se pueden cambiar las cuotas en este estado.");
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("monto, contexto_pago, estado")
    .eq("user_moto_compra_id", parsed.compraId)
    .in("contexto_pago", ["inicial", "cuota_adelantada"])
    .eq("estado", "confirmado");

  if (pagosError) throw new Error(pagosError.message);

  let recibidoInicial = 0;
  let recibidoCuota = 0;
  for (const p of pagos ?? []) {
    if (p.contexto_pago === "inicial") recibidoInicial += Number(p.monto);
    if (p.contexto_pago === "cuota_adelantada") recibidoCuota += Number(p.monto);
  }

  if (parsed.cuotaInicial < recibidoInicial) {
    throw new Error(
      `Ya se recibieron ${recibidoInicial.toLocaleString("es-CO")} de cuota inicial; el monto no puede ser menor.`,
    );
  }
  if (parsed.montoCuotaPeriodo < recibidoCuota) {
    throw new Error(
      `Ya se recibieron ${recibidoCuota.toLocaleString("es-CO")} de cuota adelantada; el monto no puede ser menor.`,
    );
  }

  const montoTotal =
    parsed.cuotaInicial +
    parsed.montoCuotaPeriodo +
    Number(compra.monto_visita_monto);

  const { error: updateError } = await supabase
    .from("user_moto_compra")
    .update({
      cuota_inicial_monto: parsed.cuotaInicial,
      monto_cuota_periodo: parsed.montoCuotaPeriodo,
      monto_total_primer_pago: montoTotal,
    })
    .eq("id", parsed.compraId);

  if (updateError) throw new Error(updateError.message);

  // Flags de confirmación dependen de montos esperados; el trigger solo corre en pagos
  const { error: syncError } = await supabase.rpc("sync_compra_pago_flags", {
    p_compra_id: parsed.compraId,
  });
  if (syncError) throw new Error(syncError.message);

  const contractId = compra.digital_contract_id as string | null;
  if (contractId) {
    const { data: contract, error: contractError } = await supabase
      .from("digital_contracts")
      .select("admin_data")
      .eq("id", contractId)
      .maybeSingle();

    if (contractError) throw new Error(contractError.message);

    const adminData = {
      ...((contract?.admin_data as Record<string, unknown>) ?? {}),
      cuota_inicial: parsed.cuotaInicial,
      valor_cuota: parsed.montoCuotaPeriodo,
      monto_total_primer_pago: montoTotal,
    };

    const { error: contractUpdateError } = await supabase
      .from("digital_contracts")
      .update({ admin_data: adminData })
      .eq("id", contractId);

    if (contractUpdateError) throw new Error(contractUpdateError.message);
  }

  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function updateMontoVisitaCompra(input: {
  userId: number;
  compraId: string;
  montoVisita: number;
}): Promise<{ ok: true }> {
  const parsed = z
    .object({
      userId: z.number().int().positive(),
      compraId: z.string().uuid(),
      montoVisita: z.number().int().min(0),
    })
    .parse(input);

  const supabase = await assertAdmin();

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select(
      "id, estado, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto",
    )
    .eq("id", parsed.compraId)
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    throw new Error("No se puede cambiar el monto de visita en este estado.");
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("monto, contexto_pago, estado")
    .eq("user_moto_compra_id", parsed.compraId)
    .eq("contexto_pago", "visita")
    .eq("estado", "confirmado");

  if (pagosError) throw new Error(pagosError.message);

  const recibido = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  if (parsed.montoVisita < recibido) {
    throw new Error(
      `Ya se recibieron ${recibido.toLocaleString("es-CO")} por visita; el monto no puede ser menor.`,
    );
  }

  const montoTotal =
    Number(compra.cuota_inicial_monto) +
    Number(compra.monto_cuota_periodo) +
    parsed.montoVisita;

  const { error: updateError } = await supabase
    .from("user_moto_compra")
    .update({
      monto_visita_monto: parsed.montoVisita,
      monto_total_primer_pago: montoTotal,
    })
    .eq("id", parsed.compraId);

  if (updateError) throw new Error(updateError.message);

  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function updateFrecuenciaPagoCompra(input: {
  userId: number;
  compraId: string;
  frecuencia: FrecuenciaPago;
}): Promise<{ ok: true }> {
  const parsed = z
    .object({
      userId: z.number().int().positive(),
      compraId: z.string().uuid(),
      frecuencia: z.enum(["diario", "semanal", "quincenal", "mensual"]),
    })
    .parse(input);

  const supabase = await assertAdmin();

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, digital_contract_id, estado, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto, pago_cuota_confirmado",
    )
    .eq("id", parsed.compraId)
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "pendiente_pago") {
    throw new Error("Solo se puede cambiar la frecuencia antes de confirmar pagos.");
  }
  if (compra.pago_cuota_confirmado) {
    throw new Error("La cuota adelantada ya está confirmada.");
  }
  if (compra.frecuencia_pago === parsed.frecuencia) {
    return { ok: true };
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("monto, contexto_pago, estado")
    .eq("user_moto_compra_id", parsed.compraId)
    .eq("contexto_pago", "cuota_adelantada")
    .eq("estado", "confirmado");

  if (pagosError) throw new Error(pagosError.message);

  const recibidoCuota = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const cuotaDiaria = cuotaDiariaFromPeriodo(
    Number(compra.monto_cuota_periodo),
    compra.frecuencia_pago as FrecuenciaPago,
  );
  const montoCuotaPeriodoNuevo = montoCuotaPeriodo(
    cuotaDiaria,
    parsed.frecuencia,
  );

  if (montoCuotaPeriodoNuevo < recibidoCuota) {
    throw new Error(
      `Ya se recibieron ${recibidoCuota.toLocaleString("es-CO")} por cuota adelantada; el nuevo monto (${montoCuotaPeriodoNuevo.toLocaleString("es-CO")}) no alcanza.`,
    );
  }

  const montoTotal =
    Number(compra.cuota_inicial_monto) +
    montoCuotaPeriodoNuevo +
    Number(compra.monto_visita_monto);

  const { error: updateError } = await supabase
    .from("user_moto_compra")
    .update({
      frecuencia_pago: parsed.frecuencia,
      monto_cuota_periodo: montoCuotaPeriodoNuevo,
      monto_total_primer_pago: montoTotal,
    })
    .eq("id", parsed.compraId);

  if (updateError) throw new Error(updateError.message);

  const contractId = compra.digital_contract_id as string | null;
  if (contractId) {
    const { data: contract, error: contractError } = await supabase
      .from("digital_contracts")
      .select("admin_data")
      .eq("id", contractId)
      .maybeSingle();

    if (contractError) throw new Error(contractError.message);

    const adminData = {
      ...((contract?.admin_data as Record<string, unknown>) ?? {}),
      frecuencia_pago: parsed.frecuencia,
      valor_cuota: montoCuotaPeriodoNuevo,
      monto_total_primer_pago: montoTotal,
    };

    const { error: contractUpdateError } = await supabase
      .from("digital_contracts")
      .update({ admin_data: adminData })
      .eq("id", contractId);

    if (contractUpdateError) throw new Error(contractUpdateError.message);
  }

  revalidateClient(parsed.userId);
  return { ok: true };
}
