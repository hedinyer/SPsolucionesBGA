import { createAnonClient } from "@/lib/supabase/anon";
import { USER_STATUS, type UserStatus } from "@/lib/auth/user-status";
import { getConfigErrorMessage } from "@/lib/supabase/env";

export type VerifiedAdminUser = {
  id: number;
  user: string;
  status: UserStatus;
};

/** Escape ILIKE wildcards for case-insensitive exact match. */
function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function rowUsername(row: Record<string, unknown>): string {
  return String(row.username ?? row.user ?? "");
}

function normalizeAdminUser(result: unknown): VerifiedAdminUser | null {
  if (result == null) return null;
  const row = Array.isArray(result)
    ? (result[0] as Record<string, unknown> | undefined)
    : (result as Record<string, unknown>);
  if (!row || Object.keys(row).length === 0) return null;
  const username = rowUsername(row);
  if (!username) return null;
  return {
    id: Number(row.id),
    user: username,
    status: String(row.status) as UserStatus,
  };
}

export async function verifyAdminLogin(
  username: string,
  password: string,
): Promise<{ user: VerifiedAdminUser } | { error: string; status: number }> {
  if (!username || !password) {
    return { error: "Ingresa usuario y contraseña.", status: 400 };
  }

  const configError = getConfigErrorMessage();
  if (configError) {
    return { error: configError, status: 500 };
  }

  const anon = createAnonClient();

  // Case-insensitive username; password exact. Prefer table read so casing in DB
  // (Opinilla vs opinilla) does not block login.
  const { data: rows, error: selectError } = await anon
    .from("users")
    .select("id, user, status")
    .eq("status", USER_STATUS.admin)
    .eq("password", password)
    .ilike("user", ilikeExact(username))
    .limit(1);

  if (selectError) {
    console.error("[login] users select:", selectError.message);
    // Fallback: legacy RPC (exact username match)
    const { data: loginResult, error: loginError } = await anon.rpc(
      "verify_admin_login",
      { p_user: username, p_password: password },
    );
    if (loginError) {
      console.error("[login] verify_admin_login:", loginError.message);
      return { error: "No se pudo conectar con el servidor.", status: 500 };
    }
    const rpcUser = normalizeAdminUser(loginResult);
    if (!rpcUser || rpcUser.status !== USER_STATUS.admin) {
      return {
        error:
          "Usuario o contraseña incorrectos, o la cuenta no es administrador.",
        status: 401,
      };
    }
    return { user: rpcUser };
  }

  const user = normalizeAdminUser(rows);
  if (!user || user.status !== USER_STATUS.admin) {
    return {
      error:
        "Usuario o contraseña incorrectos, o la cuenta no es administrador.",
      status: 401,
    };
  }

  return { user };
}
