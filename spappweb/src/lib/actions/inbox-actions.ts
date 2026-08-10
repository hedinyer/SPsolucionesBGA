"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { getInboxQueues } from "@/lib/pipeline/queries";

export async function refreshInboxQueues() {
  await requireAdminSession();
  return getInboxQueues();
}
