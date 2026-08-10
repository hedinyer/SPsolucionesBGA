import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { z } from "zod";
import { approveCreditOp, rejectCreditOp } from "@/lib/admin/credit-ops";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    documentId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal("reject"),
    documentId: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive(),
    motivo: z.string().min(3),
    betado: z.boolean(),
  }),
]);

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
        { ok: false, error: "No autorizado. Vuelve a iniciar sesión." },
        { status: 401 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos." },
        { status: 400 },
      );
    }

    const result =
      parsed.data.action === "approve"
        ? await approveCreditOp(parsed.data.documentId, parsed.data.userId)
        : await rejectCreditOp(parsed.data);

    if (result.ok) {
      revalidatePath("/inbox");
      revalidatePath(`/clientes/${parsed.data.userId}`);
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[api/admin/credit]", error);
    return NextResponse.json(
      { ok: false, error: "Error del servidor al procesar el crédito." },
      { status: 500 },
    );
  }
}
