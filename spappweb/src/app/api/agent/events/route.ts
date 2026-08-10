import { NextRequest, NextResponse } from "next/server";

import { getAgentApiKey, isAgentAuthorized } from "@/lib/agent/auth";
import {
  ackPipelineEvents,
  listPipelineEvents,
} from "@/lib/agent/pipeline-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function guard(request: NextRequest): NextResponse | null {
  const key = getAgentApiKey();
  if (!key) return null;
  if (!isAgentAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "No autorizado. Usa Authorization: Bearer <AGENT_API_KEY>." },
      { status: 401 },
    );
  }
  return null;
}

/**
 * Lista eventos del pipeline pendientes de notificación WhatsApp.
 * Query: `limit` (1-200, default 50), `since` (ISO), `all=true` incluye ya procesados.
 */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const limit = Number(searchParams.get("limit") ?? "50");
  const since = searchParams.get("since") ?? undefined;
  const all = searchParams.get("all") === "true";

  try {
    const events = await listPipelineEvents({
      pendingOnly: !all,
      limit: Number.isFinite(limit) ? limit : 50,
      since,
    });
    return NextResponse.json({ ok: true, count: events.length, events });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "No se pudieron listar los eventos.",
      },
      { status: 500 },
    );
  }
}

/**
 * Marca eventos como procesados tras enviar WhatsApp.
 * Body: `{ "eventIds": ["uuid", ...], "ackedBy": "hermes" }`
 */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;

  let body: { eventIds?: string[]; ackedBy?: string };
  try {
    body = (await request.json()) as { eventIds?: string[]; ackedBy?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const eventIds = (body.eventIds ?? []).filter((id) => id?.trim());
  if (!eventIds.length) {
    return NextResponse.json(
      { ok: false, error: "Falta el array 'eventIds' con al menos un id." },
      { status: 400 },
    );
  }

  try {
    const result = await ackPipelineEvents(
      eventIds,
      body.ackedBy?.trim() || "hermes",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "No se pudieron confirmar los eventos.",
      },
      { status: 500 },
    );
  }
}
