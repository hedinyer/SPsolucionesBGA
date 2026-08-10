"use server";

import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const draftItemSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().positive(),
});

const publishSchema = z
  .array(draftItemSchema)
  .min(1, "Agrega al menos un producto.");

export interface VentaCarritoDraftLine {
  productoId: number;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  stock: number;
  activo: boolean;
  subtotal: number;
  error?: string;
}

export interface VentaCarritoDraftLoaded {
  code: string;
  expiresAt: string;
  lines: VentaCarritoDraftLine[];
  total: number;
  hasErrors: boolean;
}

function randomSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function mergeDraftItems(
  items: z.infer<typeof draftItemSchema>[],
): z.infer<typeof draftItemSchema>[] {
  const qty = new Map<number, number>();
  for (const item of items) {
    qty.set(item.productoId, (qty.get(item.productoId) ?? 0) + item.cantidad);
  }
  return [...qty.entries()].map(([productoId, cantidad]) => ({
    productoId,
    cantidad,
  }));
}

async function resolveDraftLines(
  items: z.infer<typeof draftItemSchema>[],
): Promise<VentaCarritoDraftLine[]> {
  const merged = mergeDraftItems(items);
  const supabase = createAdminClient();
  const ids = merged.map((i) => i.productoId);

  const { data: productos, error } = await supabase
    .from("inventario_productos")
    .select("id, sku, nombre, precio, stock, activo")
    .in("id", ids);

  if (error) throw new Error(error.message);

  const byId = new Map(
    (productos ?? []).map((p) => [Number(p.id), p as Record<string, unknown>]),
  );

  return merged.map((item) => {
    const raw = byId.get(item.productoId);
    if (!raw) {
      return {
        productoId: item.productoId,
        sku: "—",
        nombre: `Producto #${item.productoId}`,
        cantidad: item.cantidad,
        precioUnitario: 0,
        stock: 0,
        activo: false,
        subtotal: 0,
        error: "Producto no encontrado.",
      };
    }

    const activo = Boolean(raw.activo);
    const stock = Number(raw.stock);
    const precioUnitario = Number(raw.precio);
    let lineError: string | undefined;
    if (!activo) lineError = "Producto inactivo.";
    else if (stock < item.cantidad) {
      lineError = `Stock insuficiente (disponible: ${stock}).`;
    }

    return {
      productoId: item.productoId,
      sku: String(raw.sku),
      nombre: String(raw.nombre),
      cantidad: item.cantidad,
      precioUnitario,
      stock,
      activo,
      subtotal: precioUnitario * item.cantidad,
      error: lineError,
    };
  });
}

export async function publishVentaCarritoDraft(
  items: z.infer<typeof publishSchema>,
): Promise<{ code: string; expiresAt: string }> {
  const session = await requireAdminSession();
  const parsed = publishSchema.parse(items);
  const supabase = createAdminClient();
  const payload = mergeDraftItems(parsed);

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("venta_producto_borradores").insert({
      code,
      items: payload,
      created_by: session.userId ?? null,
      expires_at: expiresAt,
    });

    if (!error) return { code, expiresAt };
    if (error.code !== "23505") throw new Error(error.message);
  }

  throw new Error("No se pudo generar un código. Intenta de nuevo.");
}

export async function loadVentaCarritoDraft(
  codeRaw: string,
): Promise<VentaCarritoDraftLoaded> {
  await requireAdminSession();
  const code = codeRaw.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    throw new Error("Ingresa un código de 6 dígitos.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("venta_producto_borradores")
    .select("code, items, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Código inválido o expirado.");

  const expiresAt = String(data.expires_at);
  if (new Date(expiresAt).getTime() < Date.now()) {
    await supabase.from("venta_producto_borradores").delete().eq("code", code);
    throw new Error("Código inválido o expirado.");
  }

  const items = z.array(draftItemSchema).parse(data.items);
  const lines = await resolveDraftLines(items);
  const hasErrors = lines.some((l) => l.error);
  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);

  return { code, expiresAt, lines, total, hasErrors };
}

export async function deleteVentaCarritoDraft(codeRaw: string): Promise<void> {
  await requireAdminSession();
  const code = codeRaw.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("venta_producto_borradores")
    .delete()
    .eq("code", code);

  if (error) throw new Error(error.message);
}
