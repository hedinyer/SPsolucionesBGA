"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const ventaProductoSchema = z
  .object({
    clienteNombre: z.string().trim().min(1, "Nombre del cliente obligatorio"),
    clienteCedula: z.string().trim().optional(),
    clienteCelular: z.string().trim().min(10, "Celular inválido"),
    montoPagado: z.number().int().nonnegative().optional(),
    notas: z.string().trim().optional(),
    items: z
      .array(
        z.object({
          productoId: z.number().int().positive(),
          cantidad: z.number().int().positive(),
        }),
      )
      .min(1, "Agrega al menos un producto."),
  })
  .superRefine((data, ctx) => {
    const pagado = data.montoPagado ?? 0;
    if (pagado > 0 && data.items.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Agrega productos a la venta.",
        path: ["items"],
      });
    }
  });

export type VentaProductoInput = z.infer<typeof ventaProductoSchema>;

export interface VentaProductoItemRow {
  id: string;
  productoId: number;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VentaProductoRow {
  id: string;
  clienteNombre: string;
  clienteCedula: string | null;
  clienteCelular: string;
  total: number;
  montoPagado: number;
  notas: string | null;
  createdAt: string;
  items: VentaProductoItemRow[];
  /** Selfie del cliente renting (si se resolvió por placa/celular). */
  clienteSelfieUrl: string | null;
  /** Foto de catálogo de la moto asociada. */
  motoImagenUrl: string | null;
  motoPlaca: string | null;
  motoModelo: string | null;
  motoColor: string | null;
  /** Nombre real del cliente si clienteNombre era la placa. */
  clienteNombreReal: string | null;
}

interface ResolvedLine {
  productoId: number;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  stock: number;
}

const VENTA_PRODUCTO_SELECT =
  "id, cliente_nombre, cliente_cedula, cliente_celular, total, monto_pagado, notas, created_at";

function toItemRow(
  raw: Record<string, unknown>,
  producto: { sku: string; nombre: string },
): VentaProductoItemRow {
  return {
    id: String(raw.id),
    productoId: Number(raw.producto_id),
    sku: producto.sku,
    nombre: producto.nombre,
    cantidad: Number(raw.cantidad),
    precioUnitario: Number(raw.precio_unitario),
    subtotal: Number(raw.subtotal),
  };
}

function toVentaRow(
  raw: Record<string, unknown>,
  items: VentaProductoItemRow[],
): VentaProductoRow {
  return {
    id: String(raw.id),
    clienteNombre: String(raw.cliente_nombre),
    clienteCedula: raw.cliente_cedula ? String(raw.cliente_cedula) : null,
    clienteCelular: String(raw.cliente_celular),
    total: Number(raw.total),
    montoPagado: Number(raw.monto_pagado ?? 0),
    notas: raw.notas ? String(raw.notas) : null,
    createdAt: String(raw.created_at),
    items,
    clienteSelfieUrl: null,
    motoImagenUrl: null,
    motoPlaca: null,
    motoModelo: null,
    motoColor: null,
    clienteNombreReal: null,
  };
}

function normalizePlaca(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function looksLikePlaca(value: string): boolean {
  return /^[A-Z]{3}\d{2}[A-Z0-9]?$/i.test(normalizePlaca(value));
}

function normalizeCelular(value: string): string {
  return value.replace(/\D/g, "");
}

function hojaNombre(hoja: Record<string, unknown> | null | undefined): string | null {
  if (!hoja) return null;
  const completo = hoja.nombre_completo;
  if (typeof completo === "string" && completo.trim()) return completo.trim();
  const nombres = typeof hoja.nombres === "string" ? hoja.nombres.trim() : "";
  const apellidos = typeof hoja.apellidos === "string" ? hoja.apellidos.trim() : "";
  const joined = `${nombres} ${apellidos}`.trim();
  return joined || null;
}

async function enrichVentasConClienteMoto(
  supabase: ReturnType<typeof createAdminClient>,
  ventas: VentaProductoRow[],
): Promise<VentaProductoRow[]> {
  if (ventas.length === 0) return ventas;

  const plates = [
    ...new Set(
      ventas
        .map((v) => normalizePlaca(v.clienteNombre))
        .filter((p) => looksLikePlaca(p)),
    ),
  ];

  const { data: comprasRaw } = await supabase
    .from("user_moto_compra")
    .select("placa, modelo, color, user_id, bike_id, bike_table(imagen_url)")
    .in("estado", ["entregada", "saldada"])
    .not("placa", "is", null);

  const compraByPlaca = new Map<
    string,
    {
      placa: string;
      modelo: string;
      color: string;
      userId: number;
      motoImagenUrl: string | null;
    }
  >();

  for (const row of comprasRaw ?? []) {
    const placa = row.placa ? normalizePlaca(String(row.placa)) : "";
    if (!placa) continue;
    const bike = row.bike_table as { imagen_url?: string | null } | null;
    compraByPlaca.set(placa, {
      placa,
      modelo: String(row.modelo ?? ""),
      color: String(row.color ?? ""),
      userId: Number(row.user_id),
      motoImagenUrl: bike?.imagen_url ? String(bike.imagen_url) : null,
    });
  }

  type CompraMatch = {
    placa: string;
    modelo: string;
    color: string;
    userId: number;
    motoImagenUrl: string | null;
  };

  const compraByUserId = new Map<number, CompraMatch>();
  for (const c of compraByPlaca.values()) {
    if (!compraByUserId.has(c.userId)) compraByUserId.set(c.userId, c);
  }

  const userIds = new Set<number>();
  for (const plate of plates) {
    const c = compraByPlaca.get(plate);
    if (c) userIds.add(c.userId);
  }

  // También por celular cuando el nombre no es placa
  const celulares = [
    ...new Set(
      ventas
        .filter((v) => !looksLikePlaca(v.clienteNombre))
        .map((v) => normalizeCelular(v.clienteCelular))
        .filter((c) => c.length >= 10),
    ),
  ];

  const userIdByCelular = new Map<string, number>();
  if (celulares.length > 0) {
    const { data: visitas } = await supabase
      .from("visitas")
      .select("user_id, cliente_celular")
      .not("cliente_celular", "is", null)
      .limit(2000);
    for (const v of visitas ?? []) {
      const cel = normalizeCelular(String(v.cliente_celular ?? ""));
      if (celulares.includes(cel) && v.user_id != null) {
        userIdByCelular.set(cel, Number(v.user_id));
        userIds.add(Number(v.user_id));
      }
    }
  }

  const selfieByUser = new Map<number, string>();
  const nombreByUser = new Map<number, string>();
  if (userIds.size > 0) {
    const ids = [...userIds];
    const [{ data: docs }, { data: contracts }] = await Promise.all([
      supabase
        .from("users_documents")
        .select("user_id, selfie_url")
        .in("user_id", ids),
      supabase
        .from("digital_contracts")
        .select("user_id, hoja_vida_data")
        .in("user_id", ids)
        .eq("status", "firmado"),
    ]);
    for (const d of docs ?? []) {
      if (d.selfie_url) selfieByUser.set(Number(d.user_id), String(d.selfie_url));
    }
    for (const c of contracts ?? []) {
      const nombre = hojaNombre(c.hoja_vida_data as Record<string, unknown> | null);
      if (nombre) nombreByUser.set(Number(c.user_id), nombre);
    }
  }

  return ventas.map((venta) => {
    const placaKey = normalizePlaca(venta.clienteNombre);
    let match: CompraMatch | undefined = looksLikePlaca(placaKey)
      ? compraByPlaca.get(placaKey)
      : undefined;
    if (!match) {
      const uid = userIdByCelular.get(normalizeCelular(venta.clienteCelular));
      if (uid != null) match = compraByUserId.get(uid);
    }
    if (!match) return venta;

    return {
      ...venta,
      clienteSelfieUrl: selfieByUser.get(match.userId) ?? null,
      motoImagenUrl: match.motoImagenUrl,
      motoPlaca: match.placa,
      motoModelo: match.modelo || null,
      motoColor: match.color || null,
      clienteNombreReal: nombreByUser.get(match.userId) ?? null,
    };
  });
}

export async function listVentasProductoHistorial(
  limit = 200,
): Promise<VentaProductoRow[]> {
  await requireAdminSession();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ventas_producto")
    .select(
      "id, cliente_nombre, cliente_cedula, cliente_celular, total, monto_pagado, notas, created_at, venta_producto_items(id, producto_id, cantidad, precio_unitario, subtotal, inventario_productos(sku, nombre))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const ventas = (data ?? []).map((raw) => {
    const rawItems =
      (raw.venta_producto_items as Record<string, unknown>[] | null) ?? [];
    const items = rawItems.map((item) => {
      const prod = item.inventario_productos as
        | { sku?: string | null; nombre?: string | null }
        | null;
      return toItemRow(item, {
        sku: prod?.sku ? String(prod.sku) : "—",
        nombre: prod?.nombre ? String(prod.nombre) : "Producto eliminado",
      });
    });
    return toVentaRow(raw as Record<string, unknown>, items);
  });

  return enrichVentasConClienteMoto(supabase, ventas);
}

export async function saveVentaProducto(
  input: VentaProductoInput,
): Promise<VentaProductoRow> {
  await requireAdminSession();
  const parsed = ventaProductoSchema.parse(input);
  const supabase = createAdminClient();

  const ids = [...new Set(parsed.items.map((i) => i.productoId))];
  const { data: productos, error: prodError } = await supabase
    .from("inventario_productos")
    .select("id, sku, nombre, precio, costo, stock, activo")
    .in("id", ids);

  if (prodError) throw new Error(prodError.message);

  const byId = new Map(
    (productos ?? []).map((p) => [Number(p.id), p as Record<string, unknown>]),
  );

  const qtyByProduct = new Map<number, number>();
  for (const item of parsed.items) {
    qtyByProduct.set(
      item.productoId,
      (qtyByProduct.get(item.productoId) ?? 0) + item.cantidad,
    );
  }

  const lines: ResolvedLine[] = [];
  for (const [productoId, cantidad] of qtyByProduct) {
    const raw = byId.get(productoId);
    if (!raw || !raw.activo) {
      throw new Error(`Producto #${productoId} no disponible.`);
    }
    const stock = Number(raw.stock);
    if (stock < cantidad) {
      throw new Error(
        `Stock insuficiente para ${String(raw.nombre)} (disponible: ${stock}).`,
      );
    }
    const precioUnitario = Math.max(
      Number(raw.precio) || 0,
      Number(raw.costo) || 0,
    );
    lines.push({
      productoId,
      sku: String(raw.sku),
      nombre: String(raw.nombre),
      cantidad,
      precioUnitario,
      subtotal: precioUnitario * cantidad,
      stock,
    });
  }

  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const montoPagado = parsed.montoPagado ?? total;
  if (montoPagado > total) {
    throw new Error("El pago no puede superar el total de la venta.");
  }

  const { data: ventaRaw, error: ventaError } = await supabase
    .from("ventas_producto")
    .insert({
      cliente_nombre: parsed.clienteNombre,
      cliente_cedula: parsed.clienteCedula || null,
      cliente_celular: parsed.clienteCelular,
      total,
      monto_pagado: montoPagado,
      notas: parsed.notas || null,
    })
    .select(VENTA_PRODUCTO_SELECT)
    .single();

  if (ventaError || !ventaRaw) throw new Error(ventaError?.message ?? "Error al guardar.");

  const ventaId = String(ventaRaw.id);

  const { data: insertedItems, error: itemsError } = await supabase
    .from("venta_producto_items")
    .insert(
      lines.map((l) => ({
        venta_id: ventaId,
        producto_id: l.productoId,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        subtotal: l.subtotal,
      })),
    )
    .select("id, producto_id, cantidad, precio_unitario, subtotal");

  if (itemsError || !insertedItems) {
    await supabase.from("ventas_producto").delete().eq("id", ventaId);
    throw new Error(itemsError?.message ?? "Error al guardar ítems.");
  }

  const decremented: { productoId: number; prevStock: number }[] = [];
  try {
    for (const line of lines) {
      const { data: updated, error: stockError } = await supabase
        .from("inventario_productos")
        .update({ stock: line.stock - line.cantidad })
        .eq("id", line.productoId)
        .eq("stock", line.stock)
        .select("id")
        .maybeSingle();

      if (stockError || !updated) {
        throw new Error(
          `No se pudo descontar stock de ${line.nombre}. Intenta de nuevo.`,
        );
      }
      decremented.push({ productoId: line.productoId, prevStock: line.stock });
    }
  } catch (err) {
    for (const d of [...decremented].reverse()) {
      await supabase
        .from("inventario_productos")
        .update({ stock: d.prevStock })
        .eq("id", d.productoId);
    }
    await supabase.from("venta_producto_items").delete().eq("venta_id", ventaId);
    await supabase.from("ventas_producto").delete().eq("id", ventaId);
    throw err instanceof Error ? err : new Error("No se pudo descontar stock.");
  }

  const itemRows = (insertedItems as Record<string, unknown>[]).map((raw) => {
    const line = lines.find((l) => l.productoId === Number(raw.producto_id))!;
    return toItemRow(raw, { sku: line.sku, nombre: line.nombre });
  });

  revalidatePath("/inbox");
  revalidatePath("/inventario");
  revalidatePath("/venta");
  revalidatePath("/caja");

  return toVentaRow(ventaRaw as Record<string, unknown>, itemRows);
}
