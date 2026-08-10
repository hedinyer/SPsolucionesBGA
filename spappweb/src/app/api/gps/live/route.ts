import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import {
  buscarUbicacionGpsEnVivo,
  mensajeGpsNoDisponible,
} from "@/lib/gps/gpsMoto";
import { placaPerteneceAlCliente } from "@/lib/gps/placaDelCliente";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const placa = searchParams.get("placa")?.trim();
    const userId = Number(searchParams.get("userId"));
    if (!placa) {
      return NextResponse.json(
        { error: "Falta el parámetro placa" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "Falta el parámetro userId" },
        { status: 400 },
      );
    }
    if (!(await placaPerteneceAlCliente(userId, placa))) {
      return NextResponse.json(
        { error: "La placa no pertenece a este cliente" },
        { status: 403 },
      );
    }

    const deviceIdRaw = searchParams.get("device_id");
    const deviceId = deviceIdRaw ? Number(deviceIdRaw) : undefined;
    const imei = searchParams.get("imei")?.trim() || undefined;
    const gpsMoto = searchParams.get("gps_moto");

    const resultado = await buscarUbicacionGpsEnVivo(placa, {
      gpsMoto,
      deviceId:
        Number.isFinite(deviceId) && deviceId! > 0 ? deviceId : undefined,
      imei,
    });

    if (!resultado.ok) {
      return NextResponse.json({
        gps: null,
        mensaje: mensajeGpsNoDisponible(placa, resultado.motivo, gpsMoto),
      });
    }

    return NextResponse.json({
      gps: resultado.gps,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar GPS";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
