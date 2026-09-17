"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const ubicacionEnum = z.enum(["Soluciones", "Bera", "Bodega"]);

const trasladarSchema = z
  .object({
    productoId: z.number().int().positive(),
    desde: ubicacionEnum,
    hacia: ubicacionEnum,
    cantidad: z.number().int().positive(),
    autor: z.string().trim().min(1, "Indica quién traslada."),
    nota: z.string().trim().optional(),
    gavetaDestino: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.desde === data.hacia) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Origen y destino deben ser distintos.",
        path: ["hacia"],
      });
    }
  });

export type TrasladarInventarioInput = z.infer<typeof trasladarSchema>;

export async function trasladarInventario(input: TrasladarInventarioInput) {
  await requireAdminSession();
  try {
    const parsed = trasladarSchema.parse(input);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("trasladar_inventario", {
      p_producto_id: parsed.productoId,
      p_desde: parsed.desde,
      p_hacia: parsed.hacia,
      p_cantidad: parsed.cantidad,
      p_autor: parsed.autor,
      p_nota: parsed.nota || null,
      p_gaveta_destino: parsed.gavetaDestino || null,
    });
    if (error) {
      return { ok: false as const, error: error.message };
    }
    revalidatePath("/inventario");
    revalidatePath("/venta");
    return { ok: true as const, trasladoId: data as string };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return {
        ok: false as const,
        error: e.issues[0]?.message ?? "Datos inválidos.",
      };
    }
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "No se pudo trasladar.",
    };
  }
}

export async function fetchProductoTraslados(productoId: number) {
  await requireAdminSession();
  const { getProductoTraslados } = await import("@/lib/pipeline/queries");
  return getProductoTraslados(productoId);
}
