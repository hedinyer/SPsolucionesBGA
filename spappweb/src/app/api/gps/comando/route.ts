import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import {
  enviarComandoMotor,
  type AccionMotorGps,
} from "@/lib/gps/gpsMoto";
import { placaPerteneceAlCliente } from "@/lib/gps/placaDelCliente";

export const runtime = "nodejs";

function parseAccion(raw: unknown): AccionMotorGps | null {
  const accion = String(raw ?? "").trim().toLowerCase();
  if (accion === "bloquear" || accion === "apagar") return "bloquear";
  if (
    accion === "desbloquear" ||
    accion === "prender" ||
    accion === "encender"
  ) {
    return "desbloquear";
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ ok: false });
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions,
    );
    if (!hasAdminAccess(session)) {
      return NextResponse.json(
        { error: "No autorizado. Vuelve a iniciar sesión." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const placa = String(body.placa ?? "").trim();
    const userId = Number(body.userId);
    const accion = parseAccion(body.accion);

    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    }
    if (!accion) {
      return NextResponse.json(
        { error: "Acción inválida. Usa bloquear o desbloquear." },
        { status: 400 },
      );
    }
    if (!(await placaPerteneceAlCliente(userId, placa))) {
      return NextResponse.json(
        { error: "La placa no pertenece a este cliente" },
        { status: 403 },
      );
    }

    const gpsMoto = String(body.gps_moto ?? "").trim();
    const resultado = await enviarComandoMotor(placa, accion, gpsMoto);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, mensaje: resultado.mensaje });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al enviar comando";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
