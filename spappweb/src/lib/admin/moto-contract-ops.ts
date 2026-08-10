import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { emitPipelineEvent } from "@/lib/agent/pipeline-events";
import { calcMotoPayment, MIN_CUOTA_INICIAL } from "@/lib/moto-payment";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCop } from "@/lib/utils/format";

function motoAdminData(compra: {
  modelo: string;
  color: string;
  frecuencia_pago: string;
  cuota_inicial_monto: number;
  monto_cuota_periodo: number;
  monto_total_primer_pago: number;
  placa: string | null;
  chasis: string | null;
  referencia: string | null;
  estado: string;
  pago_inicial_confirmado: boolean;
  pago_cuota_confirmado: boolean;
}) {
  return {
    moto_modelo: compra.modelo,
    moto_color: compra.color,
    frecuencia_pago: compra.frecuencia_pago,
    cuota_inicial: compra.cuota_inicial_monto,
    valor_cuota: compra.monto_cuota_periodo,
    monto_total_primer_pago: compra.monto_total_primer_pago,
    placa: compra.placa,
    chasis: compra.chasis,
    referencia: compra.referencia,
    compra_estado: compra.estado,
    pago_inicial_confirmado: compra.pago_inicial_confirmado,
    pago_cuota_confirmado: compra.pago_cuota_confirmado,
  };
}

export async function ensureContractForCompra(
  supabase: SupabaseClient,
  userId: number,
  documentId: number,
  compraId: string,
): Promise<string | null> {
  const { data: compra, error } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, digital_contract_id, modelo, color, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, monto_total_primer_pago, placa, chasis, referencia, estado, pago_inicial_confirmado, pago_cuota_confirmado",
    )
    .eq("id", compraId)
    .single();

  if (error || !compra) throw new Error("Compra no encontrada.");
  if (!compra.placa?.trim() || !compra.chasis?.trim()) return null;

  const motoData = motoAdminData(compra);
  let contractId = compra.digital_contract_id as string | null;

  if (!contractId) {
    const { data: existing } = await supabase
      .from("digital_contracts")
      .select("id, admin_data")
      .eq("user_id", userId)
      .eq("users_documents_id", documentId)
      .maybeSingle();

    if (existing) {
      contractId = existing.id as string;
      const merged = {
        ...((existing.admin_data as Record<string, unknown>) ?? {}),
        ...motoData,
      };
      const { error: updateError } = await supabase
        .from("digital_contracts")
        .update({ admin_data: merged })
        .eq("id", contractId);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { data: sibling } = await supabase
        .from("digital_contracts")
        .select("hoja_vida_data")
        .eq("user_id", userId)
        .not("hoja_vida_data", "eq", "{}")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: created, error: insertError } = await supabase
        .from("digital_contracts")
        .insert({
          user_id: userId,
          users_documents_id: documentId,
          status: "borrador",
          admin_data: motoData,
          ...(sibling?.hoja_vida_data
            ? { hoja_vida_data: sibling.hoja_vida_data }
            : {}),
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      contractId = created.id as string;
    }
  } else {
    const { data: contract } = await supabase
      .from("digital_contracts")
      .select("admin_data")
      .eq("id", contractId)
      .single();
    const merged = {
      ...((contract?.admin_data as Record<string, unknown>) ?? {}),
      ...motoData,
    };
    const { error: updateError } = await supabase
      .from("digital_contracts")
      .update({ admin_data: merged })
      .eq("id", contractId);
    if (updateError) throw new Error(updateError.message);
  }

  const { error: linkError } = await supabase
    .from("user_moto_compra")
    .update({ digital_contract_id: contractId })
    .eq("id", compraId);

  if (linkError) throw new Error(linkError.message);
  return contractId;
}

const assignMotoSchema = z.object({
  userId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  bikeId: z.number().int().positive(),
  frecuencia: z.enum(["diario", "semanal", "quincenal", "mensual"]),
  placa: z.string().trim().min(1).optional(),
  chasis: z.string().trim().min(1).optional(),
  referencia: z.string().trim().optional(),
  cuotaInicial: z.number().int().min(MIN_CUOTA_INICIAL).optional(),
  cuotaDiaria: z.number().int().positive().optional(),
  montoVisita: z.number().int().min(0).optional(),
});

export async function assignMotoByAdminOp(
  input: z.infer<typeof assignMotoSchema>,
) {
  const parsed = assignMotoSchema.parse(input);
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("users_documents")
    .select("id, estado_solicitud")
    .eq("id", parsed.documentId)
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (!doc || doc.estado_solicitud !== "aceptada") {
    throw new Error("El crédito debe estar aprobado.");
  }

  const { data: bike, error: bikeError } = await supabase
    .from("bike_table")
    .select("id, modelo, color, stock, activo, cuota_inicial, cuota_diaria, monto_visita")
    .eq("id", parsed.bikeId)
    .maybeSingle();

  if (bikeError) throw new Error(bikeError.message);
  if (!bike || !bike.activo) {
    throw new Error("La moto seleccionada no está disponible.");
  }

  const cuotaInicial = parsed.cuotaInicial ?? (bike.cuota_inicial as number);
  const cuotaDiaria = parsed.cuotaDiaria ?? (bike.cuota_diaria as number);
  const montoVisita = parsed.montoVisita ?? (bike.monto_visita as number);

  if (cuotaInicial < MIN_CUOTA_INICIAL) {
    throw new Error(
      `La cuota inicial no puede ser menor a ${formatCop(MIN_CUOTA_INICIAL)}.`,
    );
  }
  if (cuotaDiaria <= 0) {
    throw new Error("La cuota diaria debe ser mayor a cero.");
  }
  if (montoVisita < 0) {
    throw new Error("El monto de visita no puede ser negativo.");
  }

  const payment = calcMotoPayment(bike, parsed.frecuencia, {
    cuotaInicial,
    cuotaDiaria,
    montoVisita,
  });

  const placa = parsed.placa?.trim().toUpperCase() || null;
  const chasis = parsed.chasis?.trim() || null;
  const referencia = parsed.referencia?.trim() || null;

  const { data: existing } = await supabase
    .from("user_moto_compra")
    .select("id, estado")
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (existing && existing.estado !== "pendiente_pago") {
    throw new Error("La compra ya avanzó; no se puede cambiar la moto.");
  }

  let compraId: string;

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("user_moto_compra")
      .update({
        bike_id: bike.id,
        modelo: bike.modelo,
        color: bike.color,
        frecuencia_pago: parsed.frecuencia,
        ...payment,
        placa,
        chasis,
        referencia,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updateError) throw new Error(updateError.message);
    compraId = updated.id as string;
  } else {
    if (bike.stock <= 0) {
      throw new Error("La moto seleccionada no tiene stock.");
    }
    const { data: inserted, error: insertError } = await supabase
      .from("user_moto_compra")
      .insert({
        user_id: parsed.userId,
        bike_id: bike.id,
        modelo: bike.modelo,
        color: bike.color,
        frecuencia_pago: parsed.frecuencia,
        ...payment,
        placa,
        chasis,
        referencia,
        estado: "pendiente_pago",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    compraId = inserted.id as string;
  }

  let contractId: string | null = null;
  if (placa && chasis) {
    contractId = await ensureContractForCompra(
      supabase,
      parsed.userId,
      parsed.documentId,
      compraId,
    );
  }

  if (placa && chasis) {
    await emitPipelineEvent({
      userId: parsed.userId,
      kind: "moto_asignada",
      payload: {
        contractId: contractId ?? undefined,
        moto: {
          modelo: bike.modelo as string,
          color: bike.color as string,
          placa,
          chasis,
        },
      },
    });
  }

  return { ok: true as const, compraId, contractId };
}
