import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { filterClientSearchResults } from "@/lib/clientes/clientes-list-filters";
import {
  JHON_FECHA_DESDE,
  JHON_FECHA_HASTA,
  type JhonCliente,
} from "@/lib/jhon/types";
import { listClientesMotoCredito } from "@/lib/pipeline/queries";
import type { ClientSearchResult } from "@/lib/pipeline/types";

export { JHON_FECHA_DESDE, JHON_FECHA_HASTA, type JhonCliente };

function mergeClientes(
  ...lists: ClientSearchResult[][]
): ClientSearchResult[] {
  const seen = new Set<string>();
  const merged: ClientSearchResult[] = [];
  for (const list of lists) {
    for (const client of list) {
      const key = client.compraId ?? `u-${client.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(client);
    }
  }
  return merged;
}

async function loadCelulares(
  userIds: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(userIds)];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;

  const supabase = createAdminClient();
  const [{ data: contracts }, { data: visitas }] = await Promise.all([
    supabase
      .from("digital_contracts")
      .select("user_id, hoja_vida_data, created_at")
      .in("user_id", unique)
      .order("created_at", { ascending: false }),
    supabase
      .from("visitas")
      .select("user_id, cliente_celular, created_at")
      .in("user_id", unique)
      .order("created_at", { ascending: false }),
  ]);

  for (const row of contracts ?? []) {
    const userId = Number(row.user_id);
    if (map.has(userId)) continue;
    const hoja = (row.hoja_vida_data ?? {}) as Record<string, unknown>;
    const celular = String(hoja.celular ?? "").trim();
    if (celular) map.set(userId, celular);
  }

  for (const row of visitas ?? []) {
    const userId = Number(row.user_id);
    if (map.has(userId)) continue;
    const celular = String(row.cliente_celular ?? "").trim();
    if (celular) map.set(userId, celular);
  }

  return map;
}

async function loadMontosAdeudados(
  compraIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (compraIds.length === 0) return map;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("atrasos")
    .select("user_moto_compra_id, monto_adeudado")
    .in("user_moto_compra_id", compraIds);

  for (const row of data ?? []) {
    const id = String(row.user_moto_compra_id);
    map.set(id, Number(row.monto_adeudado) || 0);
  }
  return map;
}

export async function listClientesJhon(): Promise<JhonCliente[]> {
  const [normal, guillen] = await Promise.all([
    listClientesMotoCredito(800),
    listClientesMotoCredito(800, { onlyGuillen: true }),
  ]);

  const filtered = filterClientSearchResults(mergeClientes(normal, guillen), {
    situacion: "all",
    compraEstado: "all",
    fechaDesde: JHON_FECHA_DESDE,
    fechaHasta: JHON_FECHA_HASTA,
  });

  const userIds = filtered.map((client) => client.userId);
  const compraIds = filtered
    .map((client) => client.compraId)
    .filter((id): id is string => Boolean(id));

  const [phones, deudas] = await Promise.all([
    loadCelulares(userIds),
    loadMontosAdeudados(compraIds),
  ]);

  return filtered
    .map((client) => ({
      ...client,
      celular: phones.get(client.userId) ?? null,
      montoAdeudado: client.compraId
        ? (deudas.get(client.compraId) ?? 0)
        : 0,
    }))
    .sort((a, b) => {
      const aDay = a.fechaVenta?.slice(0, 10) ?? "";
      const bDay = b.fechaVenta?.slice(0, 10) ?? "";
      if (aDay !== bDay) return aDay.localeCompare(bDay);
      return a.displayName.localeCompare(b.displayName, "es");
    });
}
