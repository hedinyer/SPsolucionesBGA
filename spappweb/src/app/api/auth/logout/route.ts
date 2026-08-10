import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  defaultSession,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
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
