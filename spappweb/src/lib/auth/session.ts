import { getIronSession, SessionOptions } from "iron-session";
import { cookies, headers } from "next/headers";
import { isAdminStatus, type UserStatus } from "@/lib/auth/user-status";
import { isAgentAuthorized } from "@/lib/agent/auth";
import { SESSION_SECRET } from "@/lib/supabase/env";

export interface SessionData {
  userId?: number;
  username?: string;
  userStatus?: UserStatus;
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password: SESSION_SECRET,
  cookieName: "spapp_admin_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export function hasAdminAccess(session: SessionData): boolean {
  return (
    session.isLoggedIn === true &&
    session.userId != null &&
    isAdminStatus(session.userStatus)
  );
}

/**
 * Permite que un agente IA actúe con permisos admin sobre las server actions, sin
 * cookie. Se concede si: (a) la petición trae `Authorization: Bearer
 * <AGENT_API_KEY>` válido, o (b) la ejecución corre dentro del contexto de la ruta
 * `/api/agent/tools` (modo abierto, cuando no hay AGENT_API_KEY configurada).
 */
async function hasAgentAccess(): Promise<boolean> {
  try {
    const h = await headers();
    if (isAgentAuthorized(h.get("authorization"))) return true;
  } catch {
    // sin acceso a headers en este contexto
  }
  try {
    const { isInAgentContext } = await import("@/lib/agent/agent-context");
    return isInAgentContext();
  } catch {
    return false;
  }
}

export async function requireAdminSession() {
  const session = await getSession();
  if (hasAdminAccess(session)) return session;
  if (await hasAgentAccess()) return session;
  throw new Error("No autorizado");
}
