"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { getClienteFacturacion } from "@/lib/pipeline/queries";
import type { ClienteFacturacion } from "@/lib/pipeline/types";

export async function fetchClienteFacturacion(
  userId: number,
): Promise<ClienteFacturacion | null> {
  await requireAdminSession();
  return getClienteFacturacion(userId);
}
