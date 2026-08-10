import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { USER_STATUS } from "@/lib/auth/user-status";
import {
  defaultSession,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import { verifyAdminLogin } from "@/lib/auth/verify-admin-login";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = body.username?.trim() ?? "";
    const password = body.password?.trim() ?? "";

    const result = await verifyAdminLogin(username, password);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const response = NextResponse.json({ ok: true });
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions,
    );
    session.userId = result.user.id;
    session.username = result.user.user;
    session.userStatus = USER_STATUS.admin;
    session.isLoggedIn = true;
    await session.save();

    return response;
  } catch (error) {
    console.error("[login] unexpected:", error);
    return NextResponse.json(
      { error: "Error inesperado al iniciar sesión." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions,
  );
  session.userId = defaultSession.userId;
  session.username = defaultSession.username;
  session.userStatus = defaultSession.userStatus;
  session.isLoggedIn = false;
  await session.save();
  return response;
}
