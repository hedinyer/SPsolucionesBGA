"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcMotoPayment } from "@/lib/moto-payment";
import { createAdminClient } from "@/lib/supabase/admin";

const selectSchema = z
  .object({
    contractId: z.string().uuid(),
    bikeId: z.number().int().positive().optional(),
    garajeMotoId: z.string().uuid().optional(),
    frecuencia: z.enum(["diario", "semanal", "quincenal", "mensual"]),
  })
  .refine((d) => Boolean(d.bikeId) !== Boolean(d.garajeMotoId), {
    message: "Elige una moto del catálogo o una recuperada del garaje.",
  });

export async function selectMotoFromContract(
  input: z.infer<typeof selectSchema>,
) {
  const parsed = selectSchema.parse(input);
  const supabase = createAdminClient();

  const { data: contract, error: contractError } = await supabase
    .from("digital_contracts")
    .select("id, user_id, status")
    .eq("id", parsed.contractId)
    .maybeSingle();

  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("Enlace no válido.");
  if (contract.status !== "firmado") {
    throw new Error("Primero debes firmar el contrato.");
  }

  const userId = contract.user_id as number;

  const { data: existing } = await supabase
    .from("user_moto_compra")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) throw new Error("Ya registraste tu selección de moto.");

  if (parsed.garajeMotoId) {
    const { data: garaje, error: garajeError } = await supabase
      .from("garaje_motos")
      .select(
        "id, modelo, color, placa, referencia, estado, cuota_inicial, cuota_diaria, monto_visita",
      )
      .eq("id", parsed.garajeMotoId)
      .maybeSingle();

    if (garajeError) throw new Error(garajeError.message);
    if (
      !garaje ||
      garaje.estado !== "disponible" ||
      garaje.cuota_inicial == null ||
      garaje.cuota_diaria == null
    ) {
      throw new Error("La moto recuperada ya no está disponible.");
    }

    const { data: ocupada } = await supabase
      .from("user_moto_compra")
      .select("id")
      .eq("garaje_moto_id", garaje.id)
      .not("estado", "in", "(cancelada,saldada)")
      .maybeSingle();
    if (ocupada) throw new Error("Esa moto ya tiene un crédito activo.");

    const payment = calcMotoPayment(
      {
        cuota_inicial: garaje.cuota_inicial,
        cuota_diaria: garaje.cuota_diaria,
        monto_visita: garaje.monto_visita ?? 0,
      },
      parsed.frecuencia,
    );

    const { error: insertError } = await supabase.from("user_moto_compra").insert({
      user_id: userId,
      digital_contract_id: contract.id,
      bike_id: null,
      garaje_moto_id: garaje.id,
      modelo: garaje.modelo,
      color: garaje.color,
      placa: garaje.placa,
      referencia: garaje.referencia,
      frecuencia_pago: parsed.frecuencia,
      ...payment,
      estado: "pendiente_pago",
    });

    if (insertError) throw new Error(insertError.message);

    revalidatePath("/inbox");
    revalidatePath(`/clientes/${userId}`);
    revalidatePath(`/moto/${parsed.contractId}`);
    revalidatePath("/garaje");
    revalidatePath("/visitadores");
    return { ok: true };
  }

  const { data: bike, error: bikeError } = await supabase
    .from("bike_table")
    .select("id, modelo, color, stock, activo, cuota_inicial, cuota_diaria, monto_visita")
    .eq("id", parsed.bikeId!)
    .maybeSingle();

  if (bikeError) throw new Error(bikeError.message);
  if (!bike || !bike.activo || bike.stock <= 0) {
    throw new Error("La moto seleccionada ya no está disponible.");
  }

  const payment = calcMotoPayment(bike, parsed.frecuencia);

  const { error: insertError } = await supabase.from("user_moto_compra").insert({
    user_id: userId,
    digital_contract_id: contract.id,
    bike_id: bike.id,
    modelo: bike.modelo,
    color: bike.color,
    frecuencia_pago: parsed.frecuencia,
    ...payment,
    estado: "pendiente_pago",
  });

  if (insertError) throw new Error(insertError.message);

  revalidatePath("/inbox");
  revalidatePath(`/clientes/${userId}`);
  revalidatePath(`/moto/${parsed.contractId}`);
  revalidatePath("/visitadores");
  return { ok: true };
}
