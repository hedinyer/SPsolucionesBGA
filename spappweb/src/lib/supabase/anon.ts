import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

// ponytail: un solo GoTrueClient por proceso/pestaña (evita el warning de instancias múltiples)
let anonClient: SupabaseClient | null = null;

export function createAnonClient() {
  if (anonClient) return anonClient;
  anonClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return anonClient;
}
