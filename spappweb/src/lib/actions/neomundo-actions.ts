"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export type NeomundoActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const telefonoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .regex(/^3\d{9}$/, "Ingresa un celular colombiano de 10 dígitos (empieza en 3)."),
  );

const schema = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre completo."),
  telefono: telefonoSchema,
});

export async function submitNeomundoParticipante(
  _prev: NeomundoActionState,
  formData: FormData,
): Promise<NeomundoActionState> {
  const parsed = schema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { nombre, telefono } = parsed.data;
  const supabase = createAdminClient();
  const { error } = await supabase.from("neomundo_participantes").insert({
    nombre,
    telefono_whatsapp: telefono,
  });

  if (error) {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }

  return { ok: true };
}
