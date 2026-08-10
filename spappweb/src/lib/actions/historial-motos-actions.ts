"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export interface HistorialMotoVentaRow {
  id: string;
  origen: "contado" | "credito_liquidado";
  fecha: string;
  clienteNombre: string;
  clienteCedula: string | null;
  placa: string | null;
  modelo: string;
  color: string;
  monto: number;
  userId: number | null;
}

export async function listHistorialMotosCredito(): Promise<
  HistorialMotoVentaRow[]
> {
  await requireAdminSession();
  const supabase = createAdminClient();

  const { data: compras, error } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, modelo, color, placa, fecha_entrega, updated_at, users(user)",
    )
    .eq("estado", "saldada")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows: HistorialMotoVentaRow[] = [];
  for (const c of compras ?? []) {
    const { data: liq } = await supabase
      .from("pagos")
      .select("monto")
      .eq("user_moto_compra_id", c.id)
      .eq("contexto_pago", "liquidacion")
      .eq("estado", "confirmado")
      .order("confirmado_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const users = c.users as { user: string } | { user: string }[] | null;
    const username = Array.isArray(users) ? users[0]?.user : users?.user;

    rows.push({
      id: c.id as string,
      origen: "credito_liquidado",
      fecha: String(c.updated_at ?? c.fecha_entrega),
      clienteNombre: username ?? `#${c.user_id}`,
      clienteCedula: username ?? null,
      placa: (c.placa as string | null) ?? null,
      modelo: String(c.modelo),
      color: String(c.color),
      monto: Number(liq?.monto ?? 0),
      userId: Number(c.user_id),
    });
  }
  return rows;
}
