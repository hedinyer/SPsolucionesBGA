import type { SupabaseClient } from "@supabase/supabase-js";

/** Genera el talonario diario del producto (1 fila por día de plazo). */
export async function generateTarifasProductoCredito(
  supabase: SupabaseClient,
  input: {
    compraProductoCreditoId: string;
    userId: number;
    plazoDias: number;
    montoPorDia: number;
    /** Ancla inclusiva; el día 1 vence al día siguiente (como renting). */
    anclaDate?: string;
  },
): Promise<void> {
  const plazo = Math.floor(input.plazoDias);
  const monto = Math.floor(input.montoPorDia);
  if (plazo <= 0 || monto <= 0) return;

  const { count } = await supabase
    .from("tarifas_producto_credito")
    .select("id", { count: "exact", head: true })
    .eq("compra_producto_credito_id", input.compraProductoCreditoId);

  if ((count ?? 0) > 0) return;

  const ancla = input.anclaDate
    ? new Date(`${input.anclaDate.slice(0, 10)}T12:00:00`)
    : new Date();
  const start = new Date(ancla);
  start.setDate(start.getDate() + 1);

  const rows = Array.from({ length: plazo }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      compra_producto_credito_id: input.compraProductoCreditoId,
      user_id: input.userId,
      numero_periodo: i + 1,
      fecha_vencimiento: d.toISOString().slice(0, 10),
      monto_esperado: monto,
      estado: "pendiente" as const,
    };
  });

  const { error } = await supabase.from("tarifas_producto_credito").insert(rows);
  if (error) throw new Error(error.message);
}

/** Reparte abonos de producto_cuota sobre el talonario (orden de periodos). */
export async function recalcularTarifasProductoCredito(
  supabase: SupabaseClient,
  compraProductoCreditoId: string,
): Promise<void> {
  const [{ data: tarifas, error: tarError }, { data: abonos, error: abError }] =
    await Promise.all([
      supabase
        .from("tarifas_producto_credito")
        .select("id, numero_periodo, monto_esperado")
        .eq("compra_producto_credito_id", compraProductoCreditoId)
        .order("numero_periodo", { ascending: true }),
      supabase
        .from("pagos")
        .select("monto")
        .eq("compra_producto_credito_id", compraProductoCreditoId)
        .eq("contexto_pago", "producto_cuota")
        .eq("estado", "confirmado"),
    ]);

  if (tarError) throw new Error(tarError.message);
  if (abError) throw new Error(abError.message);
  if (!tarifas?.length) return;

  let restante = (abonos ?? []).reduce((s, r) => s + Number(r.monto), 0);
  const now = new Date().toISOString();

  for (const tarifa of tarifas) {
    const esperado = Number(tarifa.monto_esperado);
    if (restante >= esperado) {
      const { error } = await supabase
        .from("tarifas_producto_credito")
        .update({
          estado: "pagada",
          monto_pagado: esperado,
          pagada_at: now,
          confirmada_por: "admin",
        })
        .eq("id", tarifa.id);
      if (error) throw new Error(error.message);
      restante -= esperado;
    } else if (restante > 0) {
      const { error } = await supabase
        .from("tarifas_producto_credito")
        .update({
          estado: "pendiente",
          monto_pagado: restante,
          pagada_at: null,
          confirmada_por: null,
        })
        .eq("id", tarifa.id);
      if (error) throw new Error(error.message);
      restante = 0;
    } else {
      const { error } = await supabase
        .from("tarifas_producto_credito")
        .update({
          estado: "pendiente",
          monto_pagado: null,
          pagada_at: null,
          confirmada_por: null,
        })
        .eq("id", tarifa.id);
      if (error) throw new Error(error.message);
    }
  }
}
