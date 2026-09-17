"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONTADO_TIPO_DOC,
  type ContadoTipoDocumento,
} from "@/lib/venta-contado/contado-cliente";

const clienteExtraSchema = {
  clienteTipoDocumento: z.enum(CONTADO_TIPO_DOC, {
    error: "Selecciona el tipo de documento.",
  }),
  clienteDireccion: z
    .string()
    .trim()
    .min(1, "Dirección de residencia obligatoria"),
  clienteCorreo: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("Correo electrónico inválido").optional(),
  ),
  clienteFotoUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url("URL de foto inválida").optional(),
  ),
};

const ventaMotoSchema = z.object({
  bikeId: z.number().int().positive("Selecciona una moto del catálogo."),
  modelo: z.string().trim().min(1, "Modelo obligatorio"),
  color: z.string().trim().min(1, "Color obligatorio"),
  clienteNombre: z.string().trim().min(1, "Nombre del cliente obligatorio"),
  clienteCedula: z.string().trim().min(5, "Documento inválido"),
  clienteCelular: z.string().trim().min(10, "Celular inválido"),
  ...clienteExtraSchema,
  chasis: z.string().trim().optional(),
  cuotaInicial: z.number().int().nonnegative().optional(),
  valorVenta: z.number().int().positive().optional(),
  montoPagado: z.number().int().nonnegative().optional(),
  notas: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  const pagado = data.montoPagado ?? 0;
  if (pagado > 0 && !data.valorVenta) {
    ctx.addIssue({
      code: "custom",
      message: "Indica el valor total de la venta.",
      path: ["valorVenta"],
    });
  }
  if (data.valorVenta != null && pagado > data.valorVenta) {
    ctx.addIssue({
      code: "custom",
      message: "El pago no puede superar el valor de venta.",
      path: ["montoPagado"],
    });
  }
});

export type VentaMotoInput = z.infer<typeof ventaMotoSchema>;

export interface VentaMotoRow {
  id: string;
  bikeId: number | null;
  modelo: string;
  color: string;
  placa: string | null;
  chasis: string | null;
  clienteNombre: string;
  clienteCedula: string;
  clienteCelular: string;
  clienteTipoDocumento: ContadoTipoDocumento | null;
  clienteDireccion: string | null;
  clienteCorreo: string | null;
  clienteFotoUrl: string | null;
  cuotaInicial: number | null;
  valorVenta: number | null;
  montoPagado: number;
  notas: string | null;
  createdAt: string;
  entregadaAt: string | null;
  selfieUrl?: string | null;
  motoImagenUrl?: string | null;
}

function toRow(raw: Record<string, unknown>): VentaMotoRow {
  const bike = raw.bike_table as
    | { imagen_url?: string | null }
    | { imagen_url?: string | null }[]
    | null
    | undefined;
  const bikeOne = Array.isArray(bike) ? bike[0] : bike;

  const tipoRaw = raw.cliente_tipo_documento
    ? String(raw.cliente_tipo_documento)
    : null;
  const clienteTipoDocumento = CONTADO_TIPO_DOC.includes(
    tipoRaw as ContadoTipoDocumento,
  )
    ? (tipoRaw as ContadoTipoDocumento)
    : null;

  return {
    id: String(raw.id),
    bikeId: raw.bike_id != null ? Number(raw.bike_id) : null,
    modelo: String(raw.modelo),
    color: String(raw.color),
    placa: raw.placa ? String(raw.placa) : null,
    chasis: raw.chasis ? String(raw.chasis) : null,
    clienteNombre: String(raw.cliente_nombre),
    clienteCedula: String(raw.cliente_cedula),
    clienteCelular: String(raw.cliente_celular),
    clienteTipoDocumento,
    clienteDireccion: raw.cliente_direccion
      ? String(raw.cliente_direccion)
      : null,
    clienteCorreo: raw.cliente_correo ? String(raw.cliente_correo) : null,
    clienteFotoUrl: raw.cliente_foto_url
      ? String(raw.cliente_foto_url)
      : null,
    cuotaInicial: raw.cuota_inicial != null ? Number(raw.cuota_inicial) : null,
    valorVenta: raw.valor_venta != null ? Number(raw.valor_venta) : null,
    montoPagado: Number(raw.monto_pagado ?? 0),
    notas: raw.notas ? String(raw.notas) : null,
    createdAt: String(raw.created_at),
    entregadaAt: raw.entregada_at ? String(raw.entregada_at) : null,
    selfieUrl: raw.cliente_foto_url
      ? String(raw.cliente_foto_url)
      : raw.selfieUrl != null
        ? String(raw.selfieUrl)
        : null,
    motoImagenUrl: bikeOne?.imagen_url ? String(bikeOne.imagen_url) : null,
  };
}

const VENTA_MOTO_SELECT =
  "id, bike_id, modelo, color, placa, chasis, cliente_nombre, cliente_cedula, cliente_celular, cliente_tipo_documento, cliente_direccion, cliente_correo, cliente_foto_url, cuota_inicial, valor_venta, monto_pagado, notas, created_at, entregada_at, bike_table(imagen_url)";

export async function saveVentaMoto(input: VentaMotoInput): Promise<VentaMotoRow> {
  await requireAdminSession();
  const parsed = ventaMotoSchema.parse(input);
  const supabase = createAdminClient();

  const { data: bike, error: bikeError } = await supabase
    .from("bike_table")
    .select("id, stock, activo")
    .eq("id", parsed.bikeId)
    .maybeSingle();

  if (bikeError) throw new Error(bikeError.message);
  if (!bike?.activo) {
    throw new Error("La moto seleccionada no está disponible en catálogo.");
  }
  if (bike.stock <= 0) {
    throw new Error("La moto seleccionada no tiene stock.");
  }

  const { data, error } = await supabase
    .from("ventas_moto")
    .insert({
      bike_id: parsed.bikeId,
      modelo: parsed.modelo,
      color: parsed.color,
      placa: null,
      chasis: parsed.chasis || null,
      cliente_nombre: parsed.clienteNombre,
      cliente_cedula: parsed.clienteCedula,
      cliente_celular: parsed.clienteCelular,
      cliente_tipo_documento: parsed.clienteTipoDocumento,
      cliente_direccion: parsed.clienteDireccion,
      cliente_correo: parsed.clienteCorreo ?? null,
      cliente_foto_url: parsed.clienteFotoUrl ?? null,
      cuota_inicial: parsed.cuotaInicial ?? null,
      valor_venta: parsed.valorVenta ?? null,
      monto_pagado: parsed.montoPagado ?? 0,
      notas: parsed.notas || null,
    })
    .select(VENTA_MOTO_SELECT)
    .single();

  if (error) throw new Error(error.message);

  const { data: updatedBike, error: stockError } = await supabase
    .from("bike_table")
    .update({ stock: bike.stock - 1 })
    .eq("id", parsed.bikeId)
    .eq("stock", bike.stock)
    .select("id")
    .maybeSingle();

  if (stockError || !updatedBike) {
    await supabase.from("ventas_moto").delete().eq("id", data.id);
    throw new Error("No se pudo descontar el stock. Intenta de nuevo.");
  }

  revalidatePath("/inbox");
  revalidatePath("/venta-contado");
  revalidatePath("/catalogo");
  revalidatePath("/caja");
  return toRow(data as Record<string, unknown>);
}

export async function getVentasContado(): Promise<VentaMotoRow[]> {
  await requireAdminSession();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ventas_moto")
    .select(VENTA_MOTO_SELECT)
    .is("entregada_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toRow);
  const cedulas = [
    ...new Set(rows.map((r) => r.clienteCedula.trim()).filter(Boolean)),
  ];
  if (cedulas.length === 0) return rows;

  // ponytail: users.user suele ser la cédula; basta para selfie en mostrador
  const { data: users } = await supabase
    .from("users")
    .select("id, user, users_documents(selfie_url)")
    .in("user", cedulas);

  const selfieByCedula = new Map<string, string>();
  for (const u of users ?? []) {
    const docs = u.users_documents as
      | { selfie_url?: string | null }
      | { selfie_url?: string | null }[]
      | null;
    const doc = Array.isArray(docs) ? docs[0] : docs;
    if (doc?.selfie_url) {
      selfieByCedula.set(String(u.user), String(doc.selfie_url));
    }
  }

  return rows.map((row) => ({
    ...row,
    selfieUrl:
      row.clienteFotoUrl ??
      selfieByCedula.get(row.clienteCedula.trim()) ??
      null,
  }));
}

const abonoSchema = z.object({
  id: z.string().uuid(),
  monto: z.number().int().positive("El abono debe ser mayor a cero."),
});

export async function addAbonoVentaMoto(
  id: string,
  monto: number,
): Promise<VentaMotoRow> {
  await requireAdminSession();
  const parsed = abonoSchema.parse({ id, monto });
  const supabase = createAdminClient();

  const { data: current, error: fetchError } = await supabase
    .from("ventas_moto")
    .select(VENTA_MOTO_SELECT)
    .eq("id", parsed.id)
    .single();

  if (fetchError || !current) {
    throw new Error(fetchError?.message ?? "Venta no encontrada.");
  }

  const row = toRow(current as Record<string, unknown>);
  if (row.valorVenta == null) {
    throw new Error("Esta venta no tiene precio definido.");
  }

  const nuevoPagado = row.montoPagado + parsed.monto;
  if (nuevoPagado > row.valorVenta) {
    const saldo = row.valorVenta - row.montoPagado;
    throw new Error(
      `El abono supera el saldo pendiente (${saldo.toLocaleString("es-CO")}).`,
    );
  }

  const abonoNota = `Abono ${new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date())}: $${parsed.monto.toLocaleString("es-CO")}`;
  const notas = row.notas ? `${row.notas}\n${abonoNota}` : abonoNota;

  const { data, error } = await supabase
    .from("ventas_moto")
    .update({ monto_pagado: nuevoPagado, notas })
    .eq("id", parsed.id)
    .select(VENTA_MOTO_SELECT)
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath("/venta-contado");
  return toRow(data as Record<string, unknown>);
}

const placaSchema = z.object({
  id: z.string().uuid(),
  placa: z
    .string()
    .trim()
    .min(5, "Placa inválida.")
    .max(10, "Placa inválida.")
    .transform((s) => s.toUpperCase()),
});

const updateVentaMotoSchema = z
  .object({
    id: z.string().uuid(),
    clienteNombre: z.string().trim().min(1, "Nombre del cliente obligatorio"),
    clienteCedula: z.string().trim().min(5, "Documento inválido"),
    clienteCelular: z.string().trim().min(10, "Celular inválido"),
    ...clienteExtraSchema,
    chasis: z.string().trim().optional(),
    valorVenta: z.number().int().positive().optional(),
    montoPagado: z.number().int().nonnegative(),
    placa: z
      .string()
      .trim()
      .max(10, "Placa inválida.")
      .transform((s) => (s ? s.toUpperCase() : null)),
    notas: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const pagado = data.montoPagado;
    if (pagado > 0 && !data.valorVenta) {
      ctx.addIssue({
        code: "custom",
        message: "Indica el valor total de la venta.",
        path: ["valorVenta"],
      });
    }
    if (data.valorVenta != null && pagado > data.valorVenta) {
      ctx.addIssue({
        code: "custom",
        message: "El pago no puede superar el valor de venta.",
        path: ["montoPagado"],
      });
    }
  });

export type UpdateVentaMotoInput = z.infer<typeof updateVentaMotoSchema>;

export async function updateVentaMoto(
  input: UpdateVentaMotoInput,
): Promise<VentaMotoRow> {
  await requireAdminSession();
  const parsed = updateVentaMotoSchema.parse(input);
  const supabase = createAdminClient();

  const { data: current, error: fetchError } = await supabase
    .from("ventas_moto")
    .select(VENTA_MOTO_SELECT)
    .eq("id", parsed.id)
    .single();

  if (fetchError || !current) {
    throw new Error(fetchError?.message ?? "Venta no encontrada.");
  }

  const { data, error } = await supabase
    .from("ventas_moto")
    .update({
      cliente_nombre: parsed.clienteNombre,
      cliente_cedula: parsed.clienteCedula,
      cliente_celular: parsed.clienteCelular,
      cliente_tipo_documento: parsed.clienteTipoDocumento,
      cliente_direccion: parsed.clienteDireccion,
      cliente_correo: parsed.clienteCorreo ?? null,
      cliente_foto_url:
        parsed.clienteFotoUrl !== undefined
          ? (parsed.clienteFotoUrl ?? null)
          : ((current as { cliente_foto_url?: string | null }).cliente_foto_url ??
            null),
      chasis: parsed.chasis || null,
      valor_venta: parsed.valorVenta ?? null,
      monto_pagado: parsed.montoPagado,
      placa: parsed.placa,
      notas: parsed.notas || null,
    })
    .eq("id", parsed.id)
    .select(VENTA_MOTO_SELECT)
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath("/venta-contado");
  revalidatePath("/caja");
  return toRow(data as Record<string, unknown>);
}

export async function setPlacaVentaMoto(
  id: string,
  placa: string,
): Promise<VentaMotoRow> {
  await requireAdminSession();
  const parsed = placaSchema.parse({ id, placa });
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ventas_moto")
    .update({ placa: parsed.placa })
    .eq("id", parsed.id)
    .select(VENTA_MOTO_SELECT)
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath("/venta-contado");
  return toRow(data as Record<string, unknown>);
}

const marcarEntregadaSchema = z.object({
  id: z.string().uuid(),
});

export async function marcarEntregadaVentaMoto(
  id: string,
): Promise<VentaMotoRow> {
  await requireAdminSession();
  const parsed = marcarEntregadaSchema.parse({ id });
  const supabase = createAdminClient();

  const { data: current, error: fetchError } = await supabase
    .from("ventas_moto")
    .select(VENTA_MOTO_SELECT)
    .eq("id", parsed.id)
    .single();

  if (fetchError || !current) {
    throw new Error(fetchError?.message ?? "Venta no encontrada.");
  }

  const row = toRow(current as Record<string, unknown>);
  if (row.entregadaAt) {
    throw new Error("Esta moto ya está marcada como entregada.");
  }

  const { data, error } = await supabase
    .from("ventas_moto")
    .update({ entregada_at: new Date().toISOString() })
    .eq("id", parsed.id)
    .is("entregada_at", null)
    .select(VENTA_MOTO_SELECT)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo marcar como entregada.");

  revalidatePath("/inbox");
  revalidatePath("/venta-contado");
  revalidatePath("/historial-ventas");
  return toRow(data as Record<string, unknown>);
}
