import { createAnonClient } from "@/lib/supabase/anon";
import { USER_STATUS } from "@/lib/auth/user-status";
import { getConfigErrorMessage } from "@/lib/supabase/env";

export type VerifiedVisitadorUser = {
  id: number;
  user: string;
  status: string;
  visitador_id: number;
};

function normalizeVisitadorUser(result: unknown): VerifiedVisitadorUser | null {
  if (result == null) return null;
  const row = Array.isArray(result)
    ? (result[0] as Record<string, unknown> | undefined)
    : (result as Record<string, unknown>);
  if (!row || Object.keys(row).length === 0) return null;

  const visitadorId = Number(row.visitador_id);
  if (!visitadorId) return null;

  const username = String(row.username ?? row.user ?? "");
  if (!username) return null;

  return {
    id: Number(row.id),
    user: username,
    status: String(row.status),
    visitador_id: visitadorId,
  };
}

export async function verifyVisitadorLogin(
  username: string,
  password: string,
): Promise<
  { user: VerifiedVisitadorUser } | { error: string; status: number }
> {
  if (!username || !password) {
    return { error: "Ingresa usuario y contraseña.", status: 400 };
  }

  const configError = getConfigErrorMessage();
  if (configError) {
    return { error: configError, status: 500 };
  }

  const anon = createAnonClient();
  const { data: loginResult, error: loginError } = await anon.rpc(
    "verify_visitador_login",
    { p_user: username, p_password: password },
  );

  if (loginError) {
    console.error("[visitador/login] verify_visitador_login:", loginError.message);
    return { error: "No se pudo conectar con el servidor.", status: 500 };
  }

  const user = normalizeVisitadorUser(loginResult);
  if (!user || user.status !== USER_STATUS.visitador) {
    return {
      error:
        "Usuario o contraseña incorrectos, o la cuenta no es de visitador.",
      status: 401,
    };
  }

  return { user };
}
