import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  defaultVisitadorSession,
  visitadorSessionOptions,
  type VisitadorSessionData,
} from "@/lib/auth/visitador-session";
import { verifyVisitadorLogin } from "@/lib/auth/verify-visitador-login";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = body.username?.trim() ?? "";
    const password = body.password?.trim() ?? "";

    const result = await verifyVisitadorLogin(username, password);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const response = NextResponse.json({ ok: true });
    const session = await getIronSession<VisitadorSessionData>(
      request,
      response,
      visitadorSessionOptions,
    );
    session.userId = result.user.id;
    session.username = result.user.user;
    session.visitadorId = result.user.visitador_id;
    session.isLoggedIn = true;
    await session.save();

    return response;
  } catch (error) {
    console.error("[visitador/login] unexpected:", error);
    return NextResponse.json(
      { error: "Error inesperado al iniciar sesión." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<VisitadorSessionData>(
    request,
    response,
    visitadorSessionOptions,
  );
  session.userId = defaultVisitadorSession.userId;
  session.username = defaultVisitadorSession.username;
  session.visitadorId = defaultVisitadorSession.visitadorId;
  session.isLoggedIn = false;
  await session.save();
  return response;
}
