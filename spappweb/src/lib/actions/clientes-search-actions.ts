"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { searchClients } from "@/lib/pipeline/queries";
import type { ClientSearchResult } from "@/lib/pipeline/types";

export async function searchClientesAction(
  query: string,
): Promise<ClientSearchResult[]> {
  await requireAdminSession();
  const q = query.trim();
  if (q.length < 2) return [];
  return searchClients(q);
}
