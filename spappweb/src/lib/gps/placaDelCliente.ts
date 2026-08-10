import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarPlaca } from "@/lib/gps/placaGps";

/** Verifica que la placa pertenece al userId en user_moto_compra. */
export async function placaPerteneceAlCliente(
  userId: number,
  placa: string,
): Promise<boolean> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm || !Number.isFinite(userId) || userId <= 0) return false;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_moto_compra")
    .select("placa")
    .eq("user_id", userId)
    .not("placa", "is", null)
    .limit(20);

  return (data ?? []).some(
    (row) => normalizarPlaca(String(row.placa ?? "")) === placaNorm,
  );
}
