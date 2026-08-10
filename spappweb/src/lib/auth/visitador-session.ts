import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { SESSION_SECRET } from "@/lib/supabase/env";

export interface VisitadorSessionData {
  userId?: number;
  username?: string;
  visitadorId?: number;
  isLoggedIn: boolean;
}

export const defaultVisitadorSession: VisitadorSessionData = {
  isLoggedIn: false,
};

export const visitadorSessionOptions: SessionOptions = {
  password: SESSION_SECRET,
  cookieName: "spapp_visitador_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getVisitadorSession() {
  return getIronSession<VisitadorSessionData>(
    await cookies(),
    visitadorSessionOptions,
  );
}

export function hasVisitadorAccess(
  session: VisitadorSessionData,
): session is VisitadorSessionData & {
  userId: number;
  visitadorId: number;
  username: string;
} {
  return (
    session.isLoggedIn === true &&
    session.userId != null &&
    session.visitadorId != null &&
    session.username != null
  );
}

export async function requireVisitadorSession() {
  const session = await getVisitadorSession();
  if (!hasVisitadorAccess(session)) {
    throw new Error("No autorizado");
  }
  return session;
}
