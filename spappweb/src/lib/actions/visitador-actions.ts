"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireVisitadorSession } from "@/lib/auth/visitador-session";
import { createAdminClient } from "@/lib/supabase/admin";

const completeSchema = z.object({
  visitaId: z.string().uuid(),
  fotos: z
    .array(z.object({ url: z.string().url(), captured_at: z.string() }))
    .min(1),
  videos: z
    .array(z.object({ url: z.string().url(), captured_at: z.string() }))
    .min(1),
  ubicacion: z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().optional(),
    captured_at: z.string(),
  }),
  notas: z.string().optional(),
});

export async function completeVisitaVisitador(
  input: z.infer<typeof completeSchema>,
) {
  const session = await requireVisitadorSession();
  const parsed = completeSchema.parse(input);
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("complete_visita_visitador", {
    p_visitador_id: session.visitadorId,
    p_visita_id: parsed.visitaId,
    p_evidencia_fotos: parsed.fotos,
    p_evidencia_videos: parsed.videos,
    p_ubicacion_verificada: parsed.ubicacion,
    p_notas_visita: parsed.notas?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/visitador/mis-visitas");
  revalidatePath(`/visitador/visitas/${parsed.visitaId}`);
  revalidatePath("/visitadores");
  return { ok: true };
}
