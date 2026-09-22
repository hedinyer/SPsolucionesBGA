"use server";

import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContextoPago, MedioPagoAdminStored } from "@/lib/pipeline/types";

const LIMIT = 500;

const listSchema = z.object({
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  q: z.string().trim().max(80).optional(),
});

export type HistorialPagoRow = {
  id: string;
  fecha: string;
  monto: number;
  referencia: string | null;
  contextoPago: ContextoPago | null;
  medioPagoAdmin: MedioPagoAdminStored | string | null;
  comprobanteUrl: string | null;
  clienteNombre: string;
  cedula: string;
  placa: string | null;
  modelo: string | null;
  userId: number;
  compraId: string | null;
};

export type ListHistorialPagosResult = {
  rows: HistorialPagoRow[];
  truncated: boolean;
  totalMonto: number;
};

function dayStartBogota(fecha: string): string {
  return new Date(`${fecha}T00:00:00-05:00`).toISOString();
}

function dayEndBogota(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999-05:00`).toISOString();
}

function resolveClienteNombre(raw: {
  users?:
    | {
        user: string;
        visitas?:
          | { cliente_nombre: string | null }
          | { cliente_nombre: string | null }[]
          | null;
      }
    | {
        user: string;
        visitas?:
          | { cliente_nombre: string | null }
          | { cliente_nombre: string | null }[]
          | null;
      }[]
    | null;
}): { nombre: string; cedula: string } {
  const userRaw = raw.users;
  const user = Array.isArray(userRaw) ? userRaw[0] : userRaw;
  const visitaRaw = user?.visitas;
  const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;
  const cedula = user?.user?.trim() || "";
  const nombre = visita?.cliente_nombre?.trim() || cedula || "Cliente";
  return { nombre, cedula };
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesQuery(
  row: HistorialPagoRow,
  terms: string[],
): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeSearch(
    [
      row.clienteNombre,
      row.cedula,
      row.placa ?? "",
      row.modelo ?? "",
      row.referencia ?? "",
    ].join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

export async function listHistorialPagos(
  input: z.infer<typeof listSchema>,
): Promise<ListHistorialPagosResult> {
  const parsed = listSchema.parse(input);
  await requireAdminSession();

  if (parsed.fechaDesde > parsed.fechaHasta) {
    throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  }

  const supabase = createAdminClient();
  const desde = dayStartBogota(parsed.fechaDesde);
  const hasta = dayEndBogota(parsed.fechaHasta);

  const { data, error } = await supabase
    .from("pagos")
    .select(
      "id, user_id, user_moto_compra_id, monto, referencia, comprobante_url, contexto_pago, medio_pago_admin, fecha_comprobante, confirmado_at, users(user, visitas(cliente_nombre)), user_moto_compra(placa, modelo)",
    )
    .eq("estado", "confirmado")
    .gte("confirmado_at", desde)
    .lte("confirmado_at", hasta)
    .not("confirmado_at", "is", null)
    .order("confirmado_at", { ascending: false })
    .limit(LIMIT + 1);

  if (error) throw new Error(error.message);

  const truncated = (data?.length ?? 0) > LIMIT;
  const slice = (data ?? []).slice(0, LIMIT);

  const rows: HistorialPagoRow[] = slice.map((raw) => {
    const { nombre, cedula } = resolveClienteNombre(raw);
    const compraRaw = raw.user_moto_compra as
      | { placa: string | null; modelo: string | null }
      | { placa: string | null; modelo: string | null }[]
      | null
      | undefined;
    const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;

    return {
      id: raw.id as string,
      fecha:
        (raw.fecha_comprobante as string | null) ||
        (raw.confirmado_at as string),
      monto: Number(raw.monto) || 0,
      referencia: (raw.referencia as string | null) ?? null,
      contextoPago: (raw.contexto_pago as ContextoPago | null) ?? null,
      medioPagoAdmin:
        (raw.medio_pago_admin as MedioPagoAdminStored | string | null) ?? null,
      comprobanteUrl: (raw.comprobante_url as string | null) ?? null,
      clienteNombre: nombre,
      cedula,
      placa: compra?.placa?.trim() || null,
      modelo: compra?.modelo?.trim() || null,
      userId: Number(raw.user_id),
      compraId: (raw.user_moto_compra_id as string | null) ?? null,
    };
  });

  const q = parsed.q?.trim() ?? "";
  const terms = q
    ? normalizeSearch(q)
        .split(/\s+/)
        .filter(Boolean)
    : [];
  const filtered = terms.length > 0 ? rows.filter((r) => matchesQuery(r, terms)) : rows;

  return {
    rows: filtered,
    truncated: truncated && terms.length === 0,
    totalMonto: filtered.reduce((sum, r) => sum + r.monto, 0),
  };
}
