"use server";

import { redirect } from "next/navigation";
import { USER_STATUS } from "@/lib/auth/user-status";
import {
  defaultSession,
  getSession,
} from "@/lib/auth/session";
import { getVisitadorSession, defaultVisitadorSession } from "@/lib/auth/visitador-session";
import { verifyAdminLogin } from "@/lib/auth/verify-admin-login";
import { verifyVisitadorLogin } from "@/lib/auth/verify-visitador-login";

export type LoginActionState = { error?: string } | null;

export async function loginAdminAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  const result = await verifyAdminLogin(username, password);
  if ("error" in result) {
    return { error: result.error };
  }

  const session = await getSession();
  session.userId = result.user.id;
  session.username = result.user.user;
  session.userStatus = USER_STATUS.admin;
  session.isLoggedIn = true;
  await session.save();

  redirect("/inbox");
}

export async function loginVisitadorAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  const result = await verifyVisitadorLogin(username, password);
  if ("error" in result) {
    return { error: result.error };
  }

  const session = await getVisitadorSession();
  session.userId = result.user.id;
  session.username = result.user.user;
  session.visitadorId = result.user.visitador_id;
  session.isLoggedIn = true;
  await session.save();

  redirect("/visitador/mis-visitas");
}

export async function logoutAdminAction() {
  const session = await getSession();
  session.userId = defaultSession.userId;
  session.username = defaultSession.username;
  session.userStatus = defaultSession.userStatus;
  session.isLoggedIn = false;
  await session.save();
  redirect("/login");
}

export async function logoutVisitadorAction() {
  const session = await getVisitadorSession();
  session.userId = defaultVisitadorSession.userId;
  session.username = defaultVisitadorSession.username;
  session.visitadorId = defaultVisitadorSession.visitadorId;
  session.isLoggedIn = false;
  await session.save();
  redirect("/visitador/login");
}
