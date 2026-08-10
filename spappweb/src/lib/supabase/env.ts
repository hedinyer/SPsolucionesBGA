import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/public-env";

// ponytail: credenciales embebidas; anon JWT (publishable key rompía writes en algunos entornos)
export const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "spapp-admin-local-dev-secret-32chars-min";

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

export function getConfigErrorMessage(): string | null {
  return null;
}
