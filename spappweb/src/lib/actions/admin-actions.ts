"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { approveCreditOp, rejectCreditOp } from "@/lib/admin/credit-ops";
import { assignMotoByAdminOp } from "@/lib/admin/moto-contract-ops";
import {
  emitPagoCompletoOnTransition,
  emitPipelineEvent,
} from "@/lib/agent/pipeline-events";
import { canChooseFlowOrder } from "@/lib/pipeline/step-logic";
import { MIN_CUOTA_INICIAL } from "@/lib/moto-payment";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";
import type { CompraContratoInput } from "@/lib/contracts/contrato-renting-clausulas";
import {
  hojaVidaFormSchema,
  hojaVidaFormToJson,
  patchContratoDataFromHoja,
} from "@/lib/contracts/hoja-vida-schema";
import { regenerateSignedContractPdfs } from "@/lib/contracts/regenerate-signed-pdfs";
import type {
  FrecuenciaPago,
  UserMotoCompraRow,
  VisitaRow,
} from "@/lib/pipeline/types";
import {
  appendTitularidadHistorial,
  assertCanTransferTitularidad,
} from "@/lib/admin/titularidad";
import { assertVisitadorAllowedForReferral } from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { storagePathFromPublicUrl } from "@/lib/utils/storage-urls";

function revalidateClient(userId: number) {
  revalidatePath("/inbox");
  revalidatePath(`/clientes/${userId}`);
  revalidatePath("/visitadores");
}

async function assertAdmin() {
  await requireAdminSession();
  return createAdminClient();
}

function mapDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("foreign key") || lower.includes("violates foreign key")) {
    if (lower.includes("solicitud_repuesto_items") || lower.includes("producto_id")) {
      return "Este producto tiene solicitudes de taller asociadas. Desactívalo en lugar de eliminarlo.";
    }
    if (lower.includes("inventario_productos") || lower.includes("categoria_id")) {
      return "Esta categoría tiene productos. Elimínalos o reasígnalos primero.";
    }
    if (lower.includes("user_moto_compra") || lower.includes("bike_id")) {
      return "Esta moto tiene compras asociadas. Desactívala en lugar de eliminarla.";
    }
    return "No se puede eliminar: hay registros relacionados.";
  }
  if (lower.includes("permission denied")) {
    return "Sin permisos para actualizar en la base de datos.";
  }
  return message;
}

async function adminDelete(
  supabase: SupabaseClient,
  table: string,
  id: number | string,
  path: string,
) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(mapDbError(error.message));
  if (!data?.length) {
    throw new Error("No se eliminó nada (sin permisos o referencias activas).");
  }
  revalidatePath(path);
  return { ok: true as const };
}

type CreditActionResult =
  | { ok: true; contractId?: string }
  | { ok: false; error: string };

export async function approveCredit(
  documentId: number,
  userId: number,
): Promise<CreditActionResult> {
  try {
    await requireAdminSession();
    const result = await approveCreditOp(documentId, userId);
    if (result.ok) revalidateClient(Number(userId));
    return result;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo aprobar el crédito.",
    };
  }
}

const rejectSchema = z.object({
  documentId: z.number(),
  userId: z.number(),
  motivo: z.string().min(3, "Escribe un motivo de al menos 3 caracteres"),
  betado: z.boolean(),
});

export async function rejectCredit(
  input: z.infer<typeof rejectSchema>,
): Promise<CreditActionResult> {
  try {
    await requireAdminSession();
    const result = await rejectCreditOp(input);
    if (result.ok) revalidateClient(input.userId);
    return result;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo rechazar.",
    };
  }
}

const assignMotoSchema = z.object({
  userId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  bikeId: z.number().int().positive(),
  frecuencia: z.enum(["diario", "semanal", "quincenal", "mensual"]),
  placa: z.string().trim().optional(),
  chasis: z.string().trim().min(1),
  referencia: z.string().trim().optional(),
  cuotaInicial: z.number().int().min(MIN_CUOTA_INICIAL).optional(),
  cuotaDiaria: z.number().int().positive().optional(),
  montoVisita: z.number().int().min(0).optional(),
});

export async function assignMotoByAdmin(
  input: z.infer<typeof assignMotoSchema>,
) {
  await requireAdminSession();
  const result = await assignMotoByAdminOp(input);
  revalidateClient(input.userId);
  return result;
}

const assignVisitSchema = z.object({
  visitaId: z.string().uuid(),
  userId: z.number(),
  visitadorId: z.number(),
  fechaProgramada: z.string().min(1),
});

const updateContractHojaVidaSchema = z.object({
  contractId: z.string().uuid(),
  userId: z.number().int().positive(),
  hojaVida: hojaVidaFormSchema,
});

/** Admin corrige hoja de vida, sincroniza contrato_data y regenera PDFs si ya está firmado. */
export async function updateContractHojaVida(
  input: z.infer<typeof updateContractHojaVidaSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parsed = updateContractHojaVidaSchema.parse(input);
    const supabase = await assertAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("digital_contracts")
      .select(
        "contrato_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path, status",
      )
      .eq("id", parsed.contractId)
      .eq("user_id", parsed.userId)
      .maybeSingle();

    if (fetchError) return { ok: false, error: mapDbError(fetchError.message) };
    if (!existing) return { ok: false, error: "Contrato no encontrado." };

    const contratoData = patchContratoDataFromHoja(
      (existing.contrato_data as Record<string, unknown> | null) ?? null,
      parsed.hojaVida,
    );

    const updatePayload: Record<string, unknown> = {
      hoja_vida_data: hojaVidaFormToJson(parsed.hojaVida),
      contrato_data: contratoData,
      updated_at: new Date().toISOString(),
    };

    const signaturePath =
      typeof existing.signature_path === "string" ? existing.signature_path : null;
    if (existing.status === "firmado" && signaturePath) {
      const { data: compra } = await supabase
        .from("user_moto_compra")
        .select(
          "modelo, color, placa, chasis, referencia, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo",
        )
        .eq("user_id", parsed.userId)
        .maybeSingle();

      const compraInput: CompraContratoInput | null = compra?.placa
        ? {
            modelo: compra.modelo as string,
            color: compra.color as string,
            placa: compra.placa as string,
            chasis: (compra.chasis as string) ?? "",
            referencia: (compra.referencia as string | null) ?? null,
            frecuencia_pago: compra.frecuencia_pago as FrecuenciaPago,
            cuota_inicial_monto: compra.cuota_inicial_monto as number,
            monto_cuota_periodo: compra.monto_cuota_periodo as number,
          }
        : null;

      const paths = await regenerateSignedContractPdfs(supabase, {
        contractId: parsed.contractId,
        userId: parsed.userId,
        hojaVida: parsed.hojaVida,
        contratoData,
        signaturePath,
        hojaVidaPdfPath:
          (existing.hoja_vida_pdf_path as string | null) ?? null,
        contratoPdfPath:
          (existing.contrato_pdf_path as string | null) ?? null,
        compra: compraInput,
      });

      updatePayload.hoja_vida_pdf_path = paths.hojaVidaPdfPath;
      updatePayload.contrato_pdf_path = paths.contratoPdfPath;
    }

    const { error } = await supabase
      .from("digital_contracts")
      .update(updatePayload)
      .eq("id", parsed.contractId)
      .eq("user_id", parsed.userId);

    if (error) return { ok: false, error: mapDbError(error.message) };
    revalidateClient(parsed.userId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar la hoja de vida.",
    };
  }
}

export async function assignVisit(input: z.infer<typeof assignVisitSchema>) {
  const parsed = assignVisitSchema.parse(input);
  const supabase = await assertAdmin();

  const [{ data: visitador, error: visitadorError }, { data: doc }] =
    await Promise.all([
      supabase
        .from("visitadores")
        .select("nombre")
        .eq("id", parsed.visitadorId)
        .maybeSingle(),
      supabase
        .from("users_documents")
        .select("referral_source")
        .eq("user_id", parsed.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (visitadorError) throw new Error(visitadorError.message);
  if (!visitador?.nombre) throw new Error("Visitador no encontrado.");

  assertVisitadorAllowedForReferral(
    visitador.nombre as string,
    (doc?.referral_source as string | null | undefined) ?? null,
  );

  const { error } = await supabase
    .from("visitas")
    .update({
      visitador_id: parsed.visitadorId,
      fecha_programada: parsed.fechaProgramada,
      estado: "asignada",
    })
    .eq("id", parsed.visitaId);

  if (error) throw new Error(error.message);

  await emitPipelineEvent({
    userId: parsed.userId,
    kind: "visita_asignada",
    payload: {
      fechaProgramada: parsed.fechaProgramada,
      visitadorNombre: visitador.nombre as string,
    },
  });

  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function completeVisit(visitaId: string, userId: number) {
  const supabase = await assertAdmin();
  const { error } = await supabase
    .from("visitas")
    .update({ estado: "completada" })
    .eq("id", visitaId);

  if (error) throw new Error(error.message);

  await emitPipelineEvent({ userId, kind: "visita_completada" });

  revalidateClient(userId);
  return { ok: true };
}

export async function cancelVisit(visitaId: string, userId: number) {
  const supabase = await assertAdmin();
  const { error } = await supabase
    .from("visitas")
    .update({ estado: "cancelada" })
    .eq("id", visitaId);

  if (error) throw new Error(error.message);

  await emitPipelineEvent({ userId, kind: "visita_cancelada" });

  revalidateClient(userId);
  return { ok: true };
}

const paymentSchema = z.object({
  compraId: z.string().uuid(),
  userId: z.number(),
  field: z.enum(["inicial", "cuota"]),
  value: z.boolean(),
});

export async function confirmPayment(input: z.infer<typeof paymentSchema>) {
  const parsed = paymentSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: compraBefore } = await supabase
    .from("user_moto_compra")
    .select("estado")
    .eq("id", parsed.compraId)
    .maybeSingle();

  const update =
    parsed.field === "inicial"
      ? { pago_inicial_confirmado: parsed.value }
      : { pago_cuota_confirmado: parsed.value };

  const { error } = await supabase
    .from("user_moto_compra")
    .update(update)
    .eq("id", parsed.compraId);

  if (error) throw new Error(error.message);

  await emitPagoCompletoOnTransition(
    parsed.userId,
    parsed.compraId,
    compraBefore?.estado as string | null,
  );

  revalidateClient(parsed.userId);
  return { ok: true };
}

const deliverySchema = z.object({
  compraId: z.string().uuid(),
  userId: z.number(),
  placa: z.string().min(1),
  chasis: z.string().min(1),
  referencia: z.string().optional(),
  fechaEntrega: z.string().min(1).optional(),
});

export async function updateDelivery(input: z.infer<typeof deliverySchema>) {
  const parsed = deliverySchema.parse(input);
  const supabase = await assertAdmin();
  const update: {
    placa: string;
    chasis: string;
    referencia?: string | null;
    fecha_entrega?: string;
  } = {
    placa: parsed.placa.trim().toUpperCase(),
    chasis: parsed.chasis.trim(),
  };
  if (parsed.referencia !== undefined) {
    update.referencia = parsed.referencia.trim() || null;
  }
  if (parsed.fechaEntrega) {
    update.fecha_entrega = parsed.fechaEntrega;
  }
  const { error } = await supabase
    .from("user_moto_compra")
    .update(update)
    .eq("id", parsed.compraId);

  if (error) throw new Error(error.message);
  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function markDelivered(compraId: string, userId: number) {
  const supabase = await assertAdmin();

  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select("modelo, color, placa, chasis, estado, garaje_moto_id")
    .eq("id", compraId)
    .maybeSingle();

  if (!compra) throw new Error("Compra no encontrada.");
  const { assertPuedeMarcarEntregada } = await import("@/lib/pipeline/mora-utils");
  assertPuedeMarcarEntregada(String(compra.estado));
  if (compra.estado === "entregada") {
    return { ok: true };
  }

  const { error } = await supabase
    .from("user_moto_compra")
    .update({ estado: "entregada" })
    .eq("id", compraId)
    .neq("estado", "saldada")
    .neq("estado", "cancelada");

  if (error) throw new Error(error.message);

  // ponytail: deliveries often lack garaje_moto_id; placa match covers those
  if (compra.garaje_moto_id) {
    await supabase
      .from("garaje_motos")
      .update({ estado: "vendida" })
      .eq("id", compra.garaje_moto_id);
    revalidatePath("/garaje");
  } else if (compra.placa) {
    await supabase
      .from("garaje_motos")
      .update({ estado: "vendida" })
      .eq("placa", compra.placa)
      .neq("estado", "vendida");
    revalidatePath("/garaje");
  }

  await emitPipelineEvent({
    userId,
    kind: "entrega_marcada",
    payload: {
      moto: {
        modelo: String(compra.modelo ?? ""),
        color: String(compra.color ?? ""),
        placa: (compra.placa as string | null) ?? null,
        chasis: (compra.chasis as string | null) ?? null,
      },
    },
  });

  revalidateClient(userId);
  revalidatePath("/catalogo");
  revalidatePath("/vendidas");
  return { ok: true };
}

export async function setEntregaAntesVisita(
  compraId: string,
  userId: number,
  entregaAntesVisita: boolean,
) {
  const supabase = await assertAdmin();

  const { data: compra, error: fetchError } = await supabase
    .from("user_moto_compra")
    .select("id, user_id, estado, admin_data")
    .eq("id", compraId)
    .single();

  if (fetchError || !compra) throw new Error("Compra no encontrada.");

  const { data: visita } = await supabase
    .from("visitas")
    .select("estado")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    !canChooseFlowOrder(
      compra as UserMotoCompraRow,
      visita as VisitaRow | null,
    )
  ) {
    throw new Error("Ya no se puede cambiar el orden visita/entrega.");
  }

  const adminData = {
    ...((compra.admin_data as Record<string, unknown>) ?? {}),
    entrega_antes_visita: entregaAntesVisita,
  };

  const { error } = await supabase
    .from("user_moto_compra")
    .update({ admin_data: adminData })
    .eq("id", compraId);

  if (error) throw new Error(error.message);
  revalidateClient(userId);
  return { ok: true };
}

export async function cancelCompra(compraId: string, userId: number) {
  const supabase = await assertAdmin();

  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select("garaje_moto_id")
    .eq("id", compraId)
    .maybeSingle();

  const { error } = await supabase
    .from("user_moto_compra")
    .update({ estado: "cancelada" })
    .eq("id", compraId);

  if (error) throw new Error(error.message);

  if (compra?.garaje_moto_id) {
    await supabase
      .from("garaje_motos")
      .update({ estado: "disponible" })
      .eq("id", compra.garaje_moto_id);
    revalidatePath("/garaje");
  }

  await emitPipelineEvent({ userId, kind: "compra_cancelada" });

  revalidateClient(userId);
  return { ok: true };
}

export async function setTracking(
  userId: number,
  seguimiento: boolean,
) {
  const supabase = await assertAdmin();
  const { error } = await supabase
    .from("users_tracking")
    .update({ seguimiento })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  revalidateClient(userId);
  return { ok: true };
}

const confirmTarifaSchema = z.object({
  tarifaId: z.string().uuid(),
  userId: z.number(),
  notas: z.string().optional(),
});

export async function confirmTarifaPago(
  input: z.infer<typeof confirmTarifaSchema>,
) {
  const parsed = confirmTarifaSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: tarifa, error: fetchError } = await supabase
    .from("tarifas_pagadas")
    .select("id, monto_esperado, estado")
    .eq("id", parsed.tarifaId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!tarifa) throw new Error("Tarifa no encontrada.");
  if (tarifa.estado === "pagada") throw new Error("Esta tarifa ya está pagada.");

  const { error } = await supabase
    .from("tarifas_pagadas")
    .update({
      estado: "pagada",
      monto_pagado: tarifa.monto_esperado,
      pagada_at: new Date().toISOString(),
      confirmada_por: "admin",
      notas: parsed.notas?.trim() || null,
    })
    .eq("id", parsed.tarifaId);

  if (error) throw new Error(error.message);
  revalidateClient(parsed.userId);
  return { ok: true };
}

const resolveMorosoSchema = z.object({
  morosoId: z.string().uuid(),
  userId: z.number(),
});

export async function resolveMoroso(input: z.infer<typeof resolveMorosoSchema>) {
  const parsed = resolveMorosoSchema.parse(input);
  const supabase = await assertAdmin();

  const { count, error: countError } = await supabase
    .from("tarifas_pagadas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", parsed.userId)
    .eq("estado", "vencida");

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      "Aún hay cuotas vencidas sin pagar. Confírmalas antes de regularizar.",
    );
  }

  const { error } = await supabase
    .from("morosos")
    .update({ estado: "regularizado" })
    .eq("id", parsed.morosoId);

  if (error) throw new Error(error.message);
  revalidateClient(parsed.userId);
  return { ok: true };
}

const createClientSchema = z.object({
  cedula: z
    .string()
    .trim()
    .min(5, "La cédula debe tener al menos 5 dígitos")
    .max(15, "La cédula no puede superar 15 dígitos")
    .regex(/^\d+$/, "La cédula solo puede contener números"),
});

export async function createClientUser(input: z.infer<typeof createClientSchema>) {
  const parsed = createClientSchema.parse(input);
  const supabase = await assertAdmin();
  const cedula = parsed.cedula;

  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("user", cedula)
    .maybeSingle();

  if (existingUser) {
    throw new Error("Ya existe un usuario con esa cédula.");
  }

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      user: cedula,
      password: cedula,
      status: "normal",
    })
    .select("id, user")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/clientes");
  revalidatePath("/inbox");
  return { ok: true, userId: newUser.id, username: newUser.user };
}

const visitadorSchema = z.object({
  id: z.number().optional(),
  nombre: z.string().min(2),
  telefono: z.string().optional(),
  fotoUrl: z.string().optional(),
  activo: z.boolean(),
  username: z.string().min(3).optional(),
  password: z.string().min(4).optional(),
});

export async function saveVisitador(input: z.infer<typeof visitadorSchema>) {
  const parsed = visitadorSchema.parse(input);
  const supabase = await assertAdmin();

  const payload = {
    nombre: parsed.nombre.trim(),
    telefono: parsed.telefono?.trim() || null,
    foto_url: parsed.fotoUrl?.trim() || null,
    activo: parsed.activo,
  };

  if (parsed.id) {
    const { data: existing, error: fetchError } = await supabase
      .from("visitadores")
      .select("user_id")
      .eq("id", parsed.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    if (parsed.password?.trim() && existing?.user_id) {
      const { error: pwdError } = await supabase
        .from("users")
        .update({ password: parsed.password.trim() })
        .eq("id", existing.user_id);
      if (pwdError) throw new Error(pwdError.message);
    }

    const { error } = await supabase
      .from("visitadores")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const username = parsed.username?.trim();
    const password = parsed.password?.trim();
    if (!username || !password) {
      throw new Error("Usuario y contraseña son obligatorios al crear visitador.");
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("user", username)
      .maybeSingle();

    if (existingUser) {
      throw new Error("Ese nombre de usuario ya existe.");
    }

    const { data: newUser, error: userError } = await supabase
      .from("users")
      .insert({
        user: username,
        password,
        status: "visitador",
      })
      .select("id")
      .single();

    if (userError) throw new Error(userError.message);

    const { error } = await supabase.from("visitadores").insert({
      ...payload,
      user_id: newUser.id,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/visitadores");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function deleteVisitador(id: number) {
  const parsed = z.number().int().positive().parse(id);
  const supabase = await assertAdmin();

  const { data: visitador, error: fetchError } = await supabase
    .from("visitadores")
    .select("user_id")
    .eq("id", parsed)
    .maybeSingle();

  if (fetchError) throw new Error(mapDbError(fetchError.message));

  await adminDelete(supabase, "visitadores", parsed, "/visitadores");

  if (visitador?.user_id) {
    await supabase.from("users").delete().eq("id", visitador.user_id);
  }

  revalidatePath("/inbox");
  return { ok: true };
}

const bikeSchema = z.object({
  id: z.number().optional(),
  modelo: z.string().min(1),
  color: z.string().min(1),
  imagenUrl: z.string().optional(),
  stock: z.number().int().min(0),
  cuotaInicial: z.number().int().min(0),
  cuotaDiaria: z.number().int().min(0),
  montoVisita: z.number().int().min(0).default(MONTO_VISITA_DEFAULT),
  precioVenta: z.number().int().positive().optional().nullable(),
  descripcion: z.string().optional(),
  activo: z.boolean(),
});

export async function saveBike(input: z.infer<typeof bikeSchema>) {
  const parsed = bikeSchema.parse(input);
  const supabase = await assertAdmin();

  const payload = {
    modelo: parsed.modelo.trim(),
    color: parsed.color.trim(),
    imagen_url: parsed.imagenUrl?.trim() || null,
    stock: parsed.stock,
    cuota_inicial: parsed.cuotaInicial,
    cuota_diaria: parsed.cuotaDiaria,
    monto_visita: parsed.montoVisita,
    precio_venta: parsed.precioVenta ?? null,
    descripcion: parsed.descripcion?.trim() || null,
    activo: parsed.activo,
  };

  if (parsed.id) {
    const { error } = await supabase
      .from("bike_table")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("bike_table").insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function deleteBike(id: number) {
  const supabase = await assertAdmin();
  return adminDelete(supabase, "bike_table", id, "/catalogo");
}

const categoriaSchema = z.object({
  id: z.number().optional(),
  nombre: z.string().min(1),
  slug: z.string().min(1),
  descripcion: z.string().optional(),
  activo: z.boolean(),
  orden: z.number().int().min(0),
});

export async function saveCategoria(input: z.infer<typeof categoriaSchema>) {
  const parsed = categoriaSchema.parse(input);
  const supabase = await assertAdmin();
  const payload = {
    nombre: parsed.nombre.trim(),
    slug: parsed.slug.trim().toLowerCase(),
    descripcion: parsed.descripcion?.trim() || null,
    activo: parsed.activo,
    orden: parsed.orden,
  };
  if (parsed.id) {
    const { error } = await supabase
      .from("inventario_categorias")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("inventario_categorias")
      .insert(payload);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/inventario");
  return { ok: true };
}

export async function deleteCategoria(id: number) {
  const supabase = await assertAdmin();
  return adminDelete(supabase, "inventario_categorias", id, "/inventario");
}

const productoSchema = z.object({
  id: z.number().optional(),
  categoriaId: z.number().int().positive(),
  sku: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  precio: z.number().int().min(0),
  costo: z.number().int().min(0),
  stock: z.number().int().min(0),
  stockMinimo: z.number().int().min(0),
  imagenUrl: z.string().optional(),
  compatibleModelos: z.array(z.string()).optional(),
  activo: z.boolean(),
});

export async function saveProducto(input: z.infer<typeof productoSchema>) {
  const parsed = productoSchema.parse(input);
  const supabase = await assertAdmin();
  const payload = {
    categoria_id: parsed.categoriaId,
    sku: parsed.sku.trim().toUpperCase(),
    nombre: parsed.nombre.trim(),
    descripcion: parsed.descripcion?.trim() || null,
    precio: parsed.precio,
    costo: parsed.costo,
    stock: parsed.stock,
    stock_minimo: parsed.stockMinimo,
    imagen_url: parsed.imagenUrl?.trim() || null,
    compatible_modelos: parsed.compatibleModelos ?? [],
    activo: parsed.activo,
  };
  if (parsed.id) {
    const { error } = await supabase
      .from("inventario_productos")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("inventario_productos")
      .insert(payload);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/inventario");
  return { ok: true };
}

export async function deleteProducto(id: number) {
  const supabase = await assertAdmin();
  return adminDelete(supabase, "inventario_productos", id, "/inventario");
}

const updateSolicitudSchema = z.object({
  solicitudId: z.string().uuid(),
  estado: z.enum(["pendiente", "en_proceso", "completada", "cancelada"]),
  notasAdmin: z.string().optional(),
});

export async function updateSolicitudEstado(
  input: z.infer<typeof updateSolicitudSchema>,
) {
  const parsed = updateSolicitudSchema.parse(input);
  const supabase = await assertAdmin();
  const { error } = await supabase
    .from("solicitudes_taller")
    .update({
      estado: parsed.estado,
      notas_admin: parsed.notasAdmin?.trim() || null,
    })
    .eq("id", parsed.solicitudId);
  if (error) throw new Error(error.message);
  revalidatePath("/solicitudes");
  revalidatePath("/inbox");
  return { ok: true };
}

const garajeParqueaderoSchema = z.object({
  id: z.number().optional(),
  nombre: z.string().min(1),
  slug: z.string().min(1),
  activo: z.boolean(),
  orden: z.number().int().min(0),
});

export async function saveGarajeParqueadero(
  input: z.infer<typeof garajeParqueaderoSchema>,
) {
  const parsed = garajeParqueaderoSchema.parse(input);
  const supabase = await assertAdmin();
  const payload = {
    nombre: parsed.nombre.trim(),
    slug: parsed.slug.trim().toLowerCase(),
    activo: parsed.activo,
    orden: parsed.orden,
  };
  if (parsed.id) {
    const { error } = await supabase
      .from("garaje_parqueaderos")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("garaje_parqueaderos")
      .insert(payload);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/garaje");
  return { ok: true };
}

export async function deleteGarajeParqueadero(id: number) {
  const supabase = await assertAdmin();
  const { count, error: countError } = await supabase
    .from("garaje_motos")
    .select("id", { count: "exact", head: true })
    .eq("parqueadero_id", id);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("No se puede eliminar: hay motos asignadas a este parqueadero.");
  }
  return adminDelete(supabase, "garaje_parqueaderos", id, "/garaje");
}

const garajeMotoSchema = z
  .object({
    id: z.string().uuid().optional(),
    parqueaderoId: z.number().int().positive().nullable(),
    placa: z.string().optional(),
    placaFotoUrl: z.string().optional(),
    referencia: z.string().min(1),
    modelo: z.string().min(1),
    color: z.string().min(1),
    origen: z.enum(["manual", "recuperacion"]),
    condicion: z.enum(["nueva", "segunda_mano", "recuperada"]),
    estado: z.enum([
      "en_garaje",
      "retenida",
      "en_mantenimiento",
      "disponible",
      "vendida",
      "devuelta",
      "baja",
    ]),
    cuotaInicial: z.number().int().nonnegative().nullable().optional(),
    cuotaDiaria: z.number().int().nonnegative().nullable().optional(),
    montoVisita: z.number().int().nonnegative().nullable().optional(),
    notas: z.string().optional(),
    isNewManual: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Motos nuevas suelen no tener placa aún.
    if (
      data.isNewManual &&
      data.condicion !== "nueva" &&
      !data.placaFotoUrl?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La foto de placa es obligatoria para registros manuales.",
        path: ["placaFotoUrl"],
      });
    }
  });

export async function saveGarajeMoto(
  input: z.infer<typeof garajeMotoSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const parsed = garajeMotoSchema.parse(input);
    const supabase = createAdminClient();
    const payload = {
      parqueadero_id: parsed.parqueaderoId,
      placa: parsed.placa?.trim() || null,
      placa_foto_url: parsed.placaFotoUrl?.trim() || null,
      referencia: parsed.referencia.trim(),
      modelo: parsed.modelo.trim(),
      color: parsed.color.trim(),
      origen: parsed.origen,
      condicion: parsed.condicion,
      estado: parsed.estado,
      cuota_inicial: parsed.cuotaInicial ?? null,
      cuota_diaria: parsed.cuotaDiaria ?? null,
      monto_visita: parsed.montoVisita ?? null,
      notas: parsed.notas?.trim() || null,
    };
    if (parsed.id) {
      const { error } = await supabase
        .from("garaje_motos")
        .update(payload)
        .eq("id", parsed.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("garaje_motos").insert({
        ...payload,
        origen: parsed.origen ?? "manual",
      });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/garaje");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al guardar la moto.",
    };
  }
}

export async function deleteGarajeMoto(id: string) {
  const supabase = await assertAdmin();
  return adminDelete(supabase, "garaje_motos", id, "/garaje");
}

const liberarGarajeSchema = z.object({
  garajeMotoId: z.string().uuid(),
});

/** Plazo de 3 días vencido → pasa a mantenimiento antes de reventa. */
export async function liberarGarajeMotoParaVenta(
  input: z.infer<typeof liberarGarajeSchema>,
) {
  const parsed = liberarGarajeSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: moto, error: fetchError } = await supabase
    .from("garaje_motos")
    .select("id, estado, moto_para_recoger_id")
    .eq("id", parsed.garajeMotoId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!moto) throw new Error("Moto no encontrada en garaje.");
  if (moto.estado !== "retenida") {
    throw new Error("Solo se pueden liberar motos retenidas.");
  }

  if (moto.moto_para_recoger_id) {
    const { data: recoger } = await supabase
      .from("motos_para_recoger")
      .select("fecha_recogida")
      .eq("id", moto.moto_para_recoger_id)
      .maybeSingle();
    const { getPlazoRecuperacion } = await import("@/lib/pipeline/mora-utils");
    const plazo = getPlazoRecuperacion(recoger?.fecha_recogida);
    if (!plazo.plazoVencido) {
      throw new Error(
        `Aún quedan ${plazo.diasRestantes} día(s) de plazo para que el cliente recupere la moto.`,
      );
    }
  }

  const { error } = await supabase
    .from("garaje_motos")
    .update({ estado: "en_mantenimiento" })
    .eq("id", parsed.garajeMotoId);
  if (error) throw new Error(error.message);

  revalidatePath("/garaje");
  return { ok: true };
}

const devolverGarajeSchema = z.object({
  garajeMotoId: z.string().uuid(),
});

/** Cliente pagó parte de la deuda → moto vuelve al cliente. */
export async function devolverGarajeMotoAlCliente(
  input: z.infer<typeof devolverGarajeSchema>,
) {
  const parsed = devolverGarajeSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: moto, error: fetchError } = await supabase
    .from("garaje_motos")
    .select("id, estado, user_moto_compra_id, moto_para_recoger_id")
    .eq("id", parsed.garajeMotoId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!moto) throw new Error("Moto no encontrada en garaje.");
  if (moto.estado !== "retenida") {
    throw new Error("Solo se pueden devolver motos retenidas.");
  }

  const { error } = await supabase
    .from("garaje_motos")
    .update({ estado: "devuelta" })
    .eq("id", parsed.garajeMotoId);
  if (error) throw new Error(error.message);

  if (moto.user_moto_compra_id) {
    await supabase
      .from("user_moto_compra")
      .update({ estado_fisico: "activa" })
      .eq("id", moto.user_moto_compra_id);
  }

  if (moto.moto_para_recoger_id) {
    await supabase
      .from("motos_para_recoger")
      .update({ estado: "cancelada", notas: "Moto devuelta al cliente tras pago parcial." })
      .eq("id", moto.moto_para_recoger_id);
  }

  revalidatePath("/garaje");
  revalidatePath("/vendidas");
  if (moto.user_moto_compra_id) {
    const { data: compra } = await supabase
      .from("user_moto_compra")
      .select("user_id")
      .eq("id", moto.user_moto_compra_id)
      .maybeSingle();
    if (compra?.user_id) revalidateClient(compra.user_id as number);
  }
  return { ok: true };
}

const addMantenimientoSchema = z.object({
  garajeMotoId: z.string().uuid(),
  productoId: z.number().int().positive(),
  cantidad: z.number().int().positive(),
  notas: z.string().optional(),
});

export async function addGarajeMantenimientoItem(
  input: z.infer<typeof addMantenimientoSchema>,
) {
  const parsed = addMantenimientoSchema.parse(input);
  const session = await requireAdminSession();
  const supabase = createAdminClient();

  const { data: moto } = await supabase
    .from("garaje_motos")
    .select("id, estado")
    .eq("id", parsed.garajeMotoId)
    .maybeSingle();
  if (!moto) throw new Error("Moto no encontrada.");
  if (moto.estado !== "en_mantenimiento" && moto.estado !== "disponible") {
    throw new Error("La moto debe estar en mantenimiento o disponible.");
  }

  const { data: producto, error: prodError } = await supabase
    .from("inventario_productos")
    .select("id, stock, costo, nombre")
    .eq("id", parsed.productoId)
    .maybeSingle();
  if (prodError) throw new Error(prodError.message);
  if (!producto) throw new Error("Producto no encontrado.");
  if ((producto.stock as number) < parsed.cantidad) {
    throw new Error(
      `Stock insuficiente de ${producto.nombre} (hay ${producto.stock}).`,
    );
  }

  const { error: stockError } = await supabase
    .from("inventario_productos")
    .update({ stock: (producto.stock as number) - parsed.cantidad })
    .eq("id", parsed.productoId);
  if (stockError) throw new Error(stockError.message);

  const { error: insertError } = await supabase
    .from("garaje_mantenimiento_items")
    .insert({
      garaje_moto_id: parsed.garajeMotoId,
      producto_id: parsed.productoId,
      cantidad: parsed.cantidad,
      costo_unitario: (producto.costo as number) ?? 0,
      notas: parsed.notas?.trim() || null,
      created_by: session.username ?? "admin",
    });
  if (insertError) {
    await supabase
      .from("inventario_productos")
      .update({ stock: producto.stock })
      .eq("id", parsed.productoId);
    throw new Error(insertError.message);
  }

  if (moto.estado === "disponible") {
    await supabase
      .from("garaje_motos")
      .update({ estado: "en_mantenimiento" })
      .eq("id", parsed.garajeMotoId);
  }

  revalidatePath("/garaje");
  revalidatePath("/inventario");
  return { ok: true };
}

export async function removeGarajeMantenimientoItem(itemId: string) {
  await requireAdminSession();
  const supabase = createAdminClient();

  const { data: item, error: fetchError } = await supabase
    .from("garaje_mantenimiento_items")
    .select("id, producto_id, cantidad")
    .eq("id", itemId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!item) throw new Error("Ítem no encontrado.");

  const { data: producto } = await supabase
    .from("inventario_productos")
    .select("stock")
    .eq("id", item.producto_id)
    .maybeSingle();

  const { error: delError } = await supabase
    .from("garaje_mantenimiento_items")
    .delete()
    .eq("id", itemId);
  if (delError) throw new Error(delError.message);

  if (producto) {
    await supabase
      .from("inventario_productos")
      .update({ stock: (producto.stock as number) + (item.cantidad as number) })
      .eq("id", item.producto_id);
  }

  revalidatePath("/garaje");
  revalidatePath("/inventario");
  return { ok: true };
}

const terminarMantenimientoSchema = z.object({
  garajeMotoId: z.string().uuid(),
  cuotaInicial: z.number().int().positive(),
  cuotaDiaria: z.number().int().positive(),
  montoVisita: z.number().int().nonnegative().optional(),
});

export async function terminarGarajeMantenimiento(
  input: z.infer<typeof terminarMantenimientoSchema>,
) {
  const parsed = terminarMantenimientoSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: moto } = await supabase
    .from("garaje_motos")
    .select("id, estado")
    .eq("id", parsed.garajeMotoId)
    .maybeSingle();
  if (!moto) throw new Error("Moto no encontrada.");
  if (moto.estado !== "en_mantenimiento") {
    throw new Error("La moto no está en mantenimiento.");
  }

  const { error } = await supabase
    .from("garaje_motos")
    .update({
      estado: "disponible",
      cuota_inicial: parsed.cuotaInicial,
      cuota_diaria: parsed.cuotaDiaria,
      monto_visita: parsed.montoVisita ?? MONTO_VISITA_DEFAULT,
    })
    .eq("id", parsed.garajeMotoId);
  if (error) throw new Error(error.message);

  revalidatePath("/garaje");
  return { ok: true };
}

const markMotoRecogidaSchema = z.object({
  recogerId: z.string().uuid(),
  userId: z.number(),
});

export async function markMotoRecogida(
  input: z.infer<typeof markMotoRecogidaSchema>,
) {
  const parsed = markMotoRecogidaSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from("motos_para_recoger")
    .select("id, estado")
    .eq("id", parsed.recogerId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Registro de recogida no encontrado.");
  if (existing.estado === "recogida") {
    throw new Error("Esta moto ya fue marcada como recogida.");
  }

  const { error } = await supabase
    .from("motos_para_recoger")
    .update({
      estado: "recogida",
      fecha_recogida: new Date().toISOString(),
    })
    .eq("id", parsed.recogerId);
  if (error) throw new Error(error.message);

  revalidatePath("/garaje");
  revalidateClient(parsed.userId);
  return { ok: true };
}

const vendidaEstadoFisicoSchema = z.object({
  compraId: z.string().uuid(),
  userId: z.number(),
  estadoFisico: z.enum([
    "activa",
    "recogida",
    "robada",
    "en_transito",
    "en_patio",
  ]),
});

export async function updateVendidaEstadoFisico(
  input: z.infer<typeof vendidaEstadoFisicoSchema>,
) {
  const parsed = vendidaEstadoFisicoSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select("id, modelo, color, placa, referencia, chasis, estado")
    .eq("id", parsed.compraId)
    .eq("estado", "entregada")
    .maybeSingle();
  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra entregada no encontrada.");

  const { error } = await supabase
    .from("user_moto_compra")
    .update({ estado_fisico: parsed.estadoFisico })
    .eq("id", parsed.compraId)
    .eq("estado", "entregada");

  if (error) throw new Error(error.message);

  // ponytail: al pasar a patio/recogida, refleja la unidad física en garaje
  if (
    parsed.estadoFisico === "recogida" ||
    parsed.estadoFisico === "en_patio"
  ) {
    const { data: existing } = await supabase
      .from("garaje_motos")
      .select("id")
      .eq("user_moto_compra_id", parsed.compraId)
      .maybeSingle();

    if (!existing) {
      const { error: garajeError } = await supabase.from("garaje_motos").insert({
        placa: compra.placa,
        referencia:
          (compra.referencia as string | null)?.trim() ||
          (compra.chasis as string | null)?.trim() ||
          "sin-referencia",
        modelo: compra.modelo,
        color: compra.color,
        origen: "recuperacion",
        condicion: "recuperada",
        estado: "retenida",
        user_moto_compra_id: parsed.compraId,
        notas: `Creada al marcar estado físico: ${parsed.estadoFisico}.`,
      });
      if (garajeError) throw new Error(garajeError.message);
    }
  }

  revalidatePath("/vendidas");
  revalidatePath("/garaje");
  revalidateClient(parsed.userId);
  return { ok: true };
}

function addStoragePath(
  bucket: string,
  paths: Set<string>,
  value: string | null | undefined,
) {
  const path = storagePathFromPublicUrl(bucket, value);
  if (path) paths.add(path);
}

async function removeStorageBucket(
  supabase: SupabaseClient,
  bucket: string,
  paths: Set<string>,
) {
  if (paths.size === 0) return;
  await supabase.storage.from(bucket).remove([...paths]);
}

export async function deleteClienteSinVisita(userId: number) {
  const parsed = z.number().int().positive().parse(userId);
  const supabase = await assertAdmin();

  const { data: userRow, error: userFetchError } = await supabase
    .from("users")
    .select("id, status")
    .eq("id", parsed)
    .maybeSingle();
  if (userFetchError) throw new Error(mapDbError(userFetchError.message));
  if (!userRow) throw new Error("Cliente no encontrado.");
  if (userRow.status !== "normal") {
    throw new Error("Solo se pueden eliminar clientes.");
  }

  const [
    { data: docs },
    { data: contracts },
    { data: visitas },
    { data: pagos },
    { data: compras },
  ] = await Promise.all([
    supabase
      .from("users_documents")
      .select("document_front_url, document_back_url, selfie_url")
      .eq("user_id", parsed),
    supabase
      .from("digital_contracts")
      .select("signature_path, hoja_vida_pdf_path, contrato_pdf_path")
      .eq("user_id", parsed),
    supabase
      .from("visitas")
      .select("evidencia_fotos, evidencia_videos")
      .eq("user_id", parsed),
    supabase.from("pagos").select("comprobante_url").eq("user_id", parsed),
    supabase.from("user_moto_compra").select("id").eq("user_id", parsed),
  ]);

  const compraIds = (compras ?? []).map((row) => row.id as string);

  const userDocPaths = new Set<string>();
  for (const doc of docs ?? []) {
    for (const url of [
      doc.document_front_url,
      doc.document_back_url,
      doc.selfie_url,
    ]) {
      addStoragePath(STORAGE_BUCKETS.userDocuments, userDocPaths, url as string);
    }
  }

  const contractPaths = new Set<string>();
  for (const contract of contracts ?? []) {
    for (const path of [
      contract.signature_path,
      contract.hoja_vida_pdf_path,
      contract.contrato_pdf_path,
    ]) {
      if (path) contractPaths.add(path as string);
    }
  }

  const visitaPaths = new Set<string>();
  for (const visita of visitas ?? []) {
    for (const foto of (visita.evidencia_fotos as { url?: string }[]) ?? []) {
      addStoragePath(STORAGE_BUCKETS.visitaEvidencias, visitaPaths, foto.url);
    }
    for (const video of (visita.evidencia_videos as { url?: string }[]) ?? []) {
      addStoragePath(STORAGE_BUCKETS.visitaEvidencias, visitaPaths, video.url);
    }
  }

  const pagoPaths = new Set<string>();
  for (const pago of pagos ?? []) {
    addStoragePath(
      STORAGE_BUCKETS.pagosComprobantes,
      pagoPaths,
      pago.comprobante_url as string | null,
    );
  }

  const garajePaths = new Set<string>();
  if (compraIds.length > 0) {
    const { data: garajeRows } = await supabase
      .from("garaje_motos")
      .select("placa_foto_url")
      .in("user_moto_compra_id", compraIds);
    for (const row of garajeRows ?? []) {
      addStoragePath(
        STORAGE_BUCKETS.garajeImagenes,
        garajePaths,
        row.placa_foto_url as string | null,
      );
    }
    const { error: garajeError } = await supabase
      .from("garaje_motos")
      .delete()
      .in("user_moto_compra_id", compraIds);
    if (garajeError) throw new Error(mapDbError(garajeError.message));
  }

  const { error: contractsError } = await supabase
    .from("digital_contracts")
    .delete()
    .eq("user_id", parsed);
  if (contractsError) throw new Error(mapDbError(contractsError.message));

  const { error: docsError } = await supabase
    .from("users_documents")
    .delete()
    .eq("user_id", parsed);
  if (docsError) throw new Error(mapDbError(docsError.message));

  const relatedDeletes = await Promise.all([
    supabase.from("visitas").delete().eq("user_id", parsed),
    supabase.from("user_moto_compra").delete().eq("user_id", parsed),
    supabase.from("users_tracking").delete().eq("user_id", parsed),
    supabase.from("pipeline_events").delete().eq("user_id", parsed),
    supabase.from("solicitudes_taller").delete().eq("user_id", parsed),
    supabase.from("compra_productos_credito").delete().eq("user_id", parsed),
  ]);
  for (const { error } of relatedDeletes) {
    if (error) throw new Error(mapDbError(error.message));
  }

  const { data: deleted, error: userError } = await supabase
    .from("users")
    .delete()
    .eq("id", parsed)
    .select("id");
  if (userError) throw new Error(mapDbError(userError.message));
  if (!deleted?.length) throw new Error("Cliente no encontrado.");

  await removeStorageBucket(supabase, STORAGE_BUCKETS.userDocuments, userDocPaths);
  const { data: folderFiles } = await supabase.storage
    .from(STORAGE_BUCKETS.userDocuments)
    .list(String(parsed));
  if (folderFiles?.length) {
    await supabase.storage
      .from(STORAGE_BUCKETS.userDocuments)
      .remove(folderFiles.map((f) => `${parsed}/${f.name}`));
  }

  await removeStorageBucket(supabase, "contract-documents", contractPaths);
  await removeStorageBucket(supabase, STORAGE_BUCKETS.visitaEvidencias, visitaPaths);
  await removeStorageBucket(supabase, STORAGE_BUCKETS.pagosComprobantes, pagoPaths);
  await removeStorageBucket(supabase, STORAGE_BUCKETS.garajeImagenes, garajePaths);

  revalidatePath("/inbox");
  revalidatePath("/clientes");
  revalidatePath("/vendidas");
  revalidatePath("/garaje");
  revalidateClient(parsed);
  return { ok: true };
}

export async function deleteVendidaMoto(compraId: string, userId: number) {
  const supabase = await assertAdmin();

  const { error: garajeError } = await supabase
    .from("garaje_motos")
    .delete()
    .eq("user_moto_compra_id", compraId);
  if (garajeError) throw new Error(mapDbError(garajeError.message));

  const { data, error } = await supabase
    .from("user_moto_compra")
    .delete()
    .eq("id", compraId)
    .select("id");
  if (error) throw new Error(mapDbError(error.message));
  if (!data?.length) throw new Error("Compra no encontrada.");

  revalidatePath("/vendidas");
  revalidatePath("/garaje");
  revalidatePath("/inbox");
  revalidateClient(userId);
  return { ok: true };
}

const productoCreditoSchema = z.object({
  id: z.number().optional(),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  cuotaInicial: z.number().int().min(0),
  cuotaDiaria: z.number().int().positive(),
  imagenUrl: z.string().optional(),
  activo: z.boolean(),
  orden: z.number().int().min(0),
});

export async function saveProductoCredito(
  input: z.infer<typeof productoCreditoSchema>,
) {
  const parsed = productoCreditoSchema.parse(input);
  const supabase = await assertAdmin();
  const payload = {
    nombre: parsed.nombre.trim(),
    descripcion: parsed.descripcion?.trim() || null,
    cuota_inicial: parsed.cuotaInicial,
    cuota_diaria: parsed.cuotaDiaria,
    imagen_url: parsed.imagenUrl?.trim() || null,
    activo: parsed.activo,
    orden: parsed.orden,
  };
  if (parsed.id) {
    const { error } = await supabase
      .from("productos_credito")
      .update(payload)
      .eq("id", parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("productos_credito").insert(payload);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/productos-credito");
  return { ok: true };
}

export async function deleteProductoCredito(id: number) {
  const supabase = await assertAdmin();
  return adminDelete(supabase, "productos_credito", id, "/productos-credito");
}

const addCompraProductoCreditoSchema = z.object({
  compraId: z.string().uuid(),
  userId: z.number().int().positive(),
  productoCreditoId: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1).optional(),
  cuotaInicial: z.number().int().min(0).optional(),
  cuotaDiaria: z.number().int().positive().optional(),
  cantidad: z.number().int().positive().default(1),
  notas: z.string().trim().optional(),
});

export async function addCompraProductoCredito(
  input: z.infer<typeof addCompraProductoCreditoSchema>,
) {
  const parsed = addCompraProductoCreditoSchema.parse(input);
  const supabase = await assertAdmin();

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select("id, user_id, estado")
    .eq("id", parsed.compraId)
    .single();

  if (compraError || !compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "pendiente_pago") {
    throw new Error("Solo se pueden agregar productos mientras el pago está pendiente.");
  }

  let nombre = parsed.nombre?.trim() ?? "";
  let cuotaInicial = parsed.cuotaInicial ?? 0;
  let cuotaDiaria = parsed.cuotaDiaria ?? 0;
  let productoCreditoId: number | null = parsed.productoCreditoId ?? null;

  if (parsed.productoCreditoId) {
    const { data: catalogo, error: catError } = await supabase
      .from("productos_credito")
      .select("id, nombre, cuota_inicial, cuota_diaria, activo")
      .eq("id", parsed.productoCreditoId)
      .maybeSingle();

    if (catError) throw new Error(catError.message);
    if (!catalogo || !catalogo.activo) {
      throw new Error("El producto del catálogo no está disponible.");
    }

    nombre = nombre || (catalogo.nombre as string);
    cuotaInicial = parsed.cuotaInicial ?? (catalogo.cuota_inicial as number);
    cuotaDiaria = parsed.cuotaDiaria ?? (catalogo.cuota_diaria as number);
    productoCreditoId = catalogo.id as number;
  }

  if (!nombre) throw new Error("Indica el nombre del producto.");
  if (cuotaDiaria <= 0) throw new Error("La cuota diaria debe ser mayor a cero.");

  const { error: insertError } = await supabase
    .from("compra_productos_credito")
    .insert({
      user_moto_compra_id: parsed.compraId,
      user_id: parsed.userId,
      producto_credito_id: productoCreditoId,
      nombre,
      cuota_inicial_monto: cuotaInicial,
      cuota_diaria_monto: cuotaDiaria,
      cantidad: parsed.cantidad,
      notas: parsed.notas?.trim() || null,
    });

  if (insertError) throw new Error(insertError.message);
  revalidateClient(parsed.userId);
  return { ok: true };
}

export async function removeCompraProductoCredito(
  itemId: string,
  userId: number,
) {
  const supabase = await assertAdmin();

  const { data: item, error: fetchError } = await supabase
    .from("compra_productos_credito")
    .select("id, user_moto_compra_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Producto no encontrado.");

  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select("estado")
    .eq("id", item.user_moto_compra_id)
    .single();

  if (compra?.estado !== "pendiente_pago") {
    throw new Error("Solo se pueden quitar productos mientras el pago está pendiente.");
  }

  const { error } = await supabase
    .from("compra_productos_credito")
    .delete()
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidateClient(userId);
  return { ok: true };
}

export type MotoDocumentoTipo = "tarjeta" | "soat" | "tecno";

const MOTO_DOC_META: Record<
  MotoDocumentoTipo,
  { column: "doc_tarjeta_propiedad_path" | "doc_soat_path" | "doc_tecno_path"; file: string }
> = {
  tarjeta: { column: "doc_tarjeta_propiedad_path", file: "tarjeta.pdf" },
  soat: { column: "doc_soat_path", file: "soat.pdf" },
  tecno: { column: "doc_tecno_path", file: "tecno.pdf" },
};

const MOTO_DOC_MAX_BYTES = 10 * 1024 * 1024;

export async function uploadMotoDocumento(formData: FormData) {
  const supabase = await assertAdmin();
  const compraId = String(formData.get("compraId") ?? "");
  const userId = Number(formData.get("userId"));
  const tipo = String(formData.get("tipo") ?? "") as MotoDocumentoTipo;
  const file = formData.get("file");

  if (!compraId || !Number.isFinite(userId)) {
    throw new Error("Datos de compra inválidos.");
  }
  if (!(tipo in MOTO_DOC_META)) {
    throw new Error("Tipo de documento no válido.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona un PDF.");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Solo se aceptan archivos PDF.");
  }
  if (file.size > MOTO_DOC_MAX_BYTES) {
    throw new Error("El PDF no puede superar 10 MB.");
  }

  const { data: compra, error: fetchError } = await supabase
    .from("user_moto_compra")
    .select("id, user_id, estado")
    .eq("id", compraId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "entregada" && compra.estado !== "saldada") {
    throw new Error("Solo se pueden subir documentos tras la entrega.");
  }

  const meta = MOTO_DOC_META[tipo];
  const path = `${compraId}/${meta.file}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.motoDocumentos)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`No se pudo subir el PDF: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from("user_moto_compra")
    .update({ [meta.column]: path })
    .eq("id", compraId)
    .eq("user_id", userId);

  if (updateError) throw new Error(updateError.message);

  revalidateClient(userId);
  return { ok: true as const, path };
}

export async function getMotoDocumentoDownloadUrls(compraId: string, userId: number) {
  const supabase = await assertAdmin();

  const { data: compra, error } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, estado, placa, doc_tarjeta_propiedad_path, doc_soat_path, doc_tecno_path",
    )
    .eq("id", compraId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !compra) throw new Error("Compra no encontrada.");
  if (compra.estado !== "entregada" && compra.estado !== "saldada") {
    throw new Error("Solo se pueden enviar documentos tras la entrega.");
  }

  const items: { tipo: MotoDocumentoTipo; label: string; filename: string; url: string }[] =
    [];
  const placa = (compra.placa ?? "moto").replace(/\s+/g, "");

  const candidates: { tipo: MotoDocumentoTipo; label: string; path: string | null }[] = [
    {
      tipo: "tarjeta",
      label: "Tarjeta de propiedad",
      path: compra.doc_tarjeta_propiedad_path,
    },
    { tipo: "soat", label: "SOAT", path: compra.doc_soat_path },
    { tipo: "tecno", label: "Tecnomecánica", path: compra.doc_tecno_path },
  ];

  for (const c of candidates) {
    if (!c.path) continue;
    const { data, error: signError } = await supabase.storage
      .from(STORAGE_BUCKETS.motoDocumentos)
      .createSignedUrl(c.path, 120);
    if (signError || !data?.signedUrl) {
      throw new Error(`No se pudo preparar ${c.label}: ${signError?.message ?? "sin URL"}`);
    }
    items.push({
      tipo: c.tipo,
      label: c.label,
      filename: `${c.tipo}-${placa}.pdf`,
      url: data.signedUrl,
    });
  }

  if (items.length === 0) {
    throw new Error("No hay documentos cargados para enviar.");
  }

  return {
    placa: compra.placa,
    items,
  };
}

const transferirTitularidadSchema = z.object({
  compraId: z.string().uuid(),
  fromUserId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  motivo: z.string().max(500).optional(),
});

const TITULARIDAD_USER_ID_TABLES = [
  "tarifas_pagadas",
  "pagos",
  "morosos",
  "motos_para_recoger",
  "congelamientos_cuotas",
  "compra_productos_credito",
  "solicitudes_taller",
] as const;

export async function transferirTitularidad(
  input: z.infer<typeof transferirTitularidadSchema>,
): Promise<{ ok: true; toUserId: number }> {
  const session = await requireAdminSession();
  const supabase = createAdminClient();
  const parsed = transferirTitularidadSchema.parse(input);

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select("id, user_id, estado, admin_data")
    .eq("id", parsed.compraId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra || Number(compra.user_id) !== parsed.fromUserId) {
    throw new Error("Compra no encontrada para este cliente.");
  }

  const [{ data: fromUser }, { data: toUser }, { data: destCompra }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, user")
        .eq("id", parsed.fromUserId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("id, user")
        .eq("id", parsed.toUserId)
        .maybeSingle(),
      supabase
        .from("user_moto_compra")
        .select("id")
        .eq("user_id", parsed.toUserId)
        .maybeSingle(),
    ]);

  assertCanTransferTitularidad({
    fromUserId: parsed.fromUserId,
    toUserId: parsed.toUserId,
    compraEstado: compra.estado as string,
    destinoTieneCompra: Boolean(destCompra),
    destinoExiste: Boolean(toUser),
  });

  if (!fromUser) throw new Error("Cliente origen no encontrado.");

  const adminData = appendTitularidadHistorial(
    (compra.admin_data as Record<string, unknown>) ?? {},
    {
      from_user_id: parsed.fromUserId,
      to_user_id: parsed.toUserId,
      from_user: String(fromUser.user),
      to_user: String(toUser!.user),
      motivo: parsed.motivo?.trim() || null,
      at: new Date().toISOString(),
      by: session.username ?? null,
    },
  );

  const { error: updateCompraError } = await supabase
    .from("user_moto_compra")
    .update({ user_id: parsed.toUserId, admin_data: adminData })
    .eq("id", parsed.compraId)
    .eq("user_id", parsed.fromUserId);

  if (updateCompraError) {
    if (updateCompraError.message.toLowerCase().includes("unique")) {
      throw new Error("El destino ya tiene una moto asignada.");
    }
    throw new Error(updateCompraError.message);
  }

  for (const table of TITULARIDAD_USER_ID_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ user_id: parsed.toUserId })
      .eq("user_moto_compra_id", parsed.compraId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  revalidateClient(parsed.fromUserId);
  revalidateClient(parsed.toUserId);
  revalidatePath("/clientes");
  revalidatePath("/vendidas");
  revalidatePath("/inbox");

  return { ok: true, toUserId: parsed.toUserId };
}
