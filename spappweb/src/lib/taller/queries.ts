import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ClienteTallerHit,
  MecanicoRow,
  MecanicoStats,
  OrdenHistorialItem,
  OrdenTallerRow,
  RepuestoProducto,
  RepuestoRow,
  TiempoRow,
  TrabajoRow,
} from "@/lib/taller/types";

const MECANICO_SELECT =
  "id, nombre, telefono, activo, foto_url, color";

const PRODUCTO_EMBED =
  "id, nombre, sku, stock, precio, imagen_url";

const ORDEN_DETAIL_SELECT = `
  id, numero, user_id, user_moto_compra_id, placa, modelo, color,
  contacto_nombre, contacto_telefono, descripcion_falla, kilometraje,
  fotos, mecanico_id, estado, timer_running, timer_started_at,
  segundos_acumulados, notas, created_by, created_at, lista_at, entregada_at,
  mecanico:mecanicos(${MECANICO_SELECT}),
  trabajos:orden_taller_zonas(
    id, orden_id, zona, nota, hecho, hecho_at, gravedad, created_at
  ),
  repuestos:orden_taller_repuestos(
    id, orden_id, producto_id, descripcion, zona, cantidad, estado,
    motivo_rechazo, costo_unitario, created_by, aprobado_por, aprobado_at,
    rechazado_por, rechazado_at, created_at,
    producto:inventario_productos(${PRODUCTO_EMBED})
  )
`;

type RawTrabajo = Omit<TrabajoRow, "gravedad"> & {
  gravedad: TrabajoRow["gravedad"];
};

type RawRepuesto = Omit<RepuestoRow, "producto"> & {
  producto: RepuestoProducto | RepuestoProducto[] | null;
};

type RawOrden = Omit<OrdenTallerRow, "mecanico" | "trabajos" | "repuestos" | "fotos"> & {
  fotos: string[] | null;
  mecanico: MecanicoRow | MecanicoRow[] | null;
  trabajos: RawTrabajo[] | null;
  repuestos: RawRepuesto[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapOrden(raw: RawOrden): OrdenTallerRow {
  return {
    ...raw,
    fotos: raw.fotos ?? [],
    mecanico: one(raw.mecanico),
    trabajos: [...(raw.trabajos ?? [])].sort((a, b) => {
      const rank = (g: string | null) =>
        g === "urgente" ? 0 : g === "pronto" ? 1 : 2;
      const byGravedad = rank(a.gravedad) - rank(b.gravedad);
      if (byGravedad !== 0) return byGravedad;
      return a.created_at.localeCompare(b.created_at);
    }),
    repuestos: (raw.repuestos ?? []).map((r) => ({
      ...r,
      producto: one(r.producto),
    })),
  };
}

export async function getMecanicos(activosOnly = false): Promise<MecanicoRow[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("mecanicos")
    .select(MECANICO_SELECT)
    .order("nombre");
  if (activosOnly) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as MecanicoRow[]) ?? [];
}

/** Alias usado por páginas legacy / reexports. */
export async function getAllMecanicos(): Promise<MecanicoRow[]> {
  return getMecanicos(false);
}

export async function getTableroTaller(): Promise<OrdenTallerRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ordenes_taller")
    .select(ORDEN_DETAIL_SELECT)
    .not("estado", "in", '("entregada","cancelada")')
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as RawOrden[]) ?? []).map(mapOrden);
}

/** Alias. */
export async function getAllOrdenesTaller(): Promise<OrdenTallerRow[]> {
  return getTableroTaller();
}

export async function getOrdenTaller(
  id: string,
): Promise<OrdenTallerRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ordenes_taller")
    .select(
      `${ORDEN_DETAIL_SELECT},
      tiempos:orden_taller_tiempos(
        id, orden_id, mecanico_id, inicio, fin, motivo_pausa
      )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const mapped = mapOrden(data as RawOrden);
  mapped.tiempos = ((data as { tiempos?: TiempoRow[] }).tiempos ?? []).sort(
    (a, b) => b.inicio.localeCompare(a.inicio),
  );
  return mapped;
}

export async function getOrdenTallerById(
  id: string,
): Promise<OrdenTallerRow | null> {
  return getOrdenTaller(id);
}

export async function getPendientesSebastian(): Promise<OrdenTallerRow[]> {
  const supabase = createAdminClient();
  const { data: pendientes, error: pErr } = await supabase
    .from("orden_taller_repuestos")
    .select("orden_id")
    .eq("estado", "solicitado");
  if (pErr) throw new Error(pErr.message);

  const ids = [...new Set((pendientes ?? []).map((p) => p.orden_id as string))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("ordenes_taller")
    .select(ORDEN_DETAIL_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as RawOrden[]) ?? []).map(mapOrden);
}

export async function getOrdenesPendientesSebastian(): Promise<OrdenTallerRow[]> {
  return getPendientesSebastian();
}

export async function countPendientesSebastian(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("orden_taller_repuestos")
    .select("id", { count: "exact", head: true })
    .eq("estado", "solicitado");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function secondsBetween(inicio: string, fin: string | null, nowMs: number) {
  const start = new Date(inicio).getTime();
  const end = fin ? new Date(fin).getTime() : nowMs;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export async function getMecanicosConStats(): Promise<MecanicoStats[]> {
  const supabase = createAdminClient();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const start30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [mecanicos, tiemposRes, activasRes, terminadasRes] = await Promise.all([
    getMecanicos(false),
    supabase
      .from("orden_taller_tiempos")
      .select("id, orden_id, mecanico_id, inicio, fin, motivo_pausa")
      .gte("inicio", startOfWeek.toISOString()),
    supabase
      .from("ordenes_taller")
      .select(
        "id, numero, placa, modelo, mecanico_id, timer_running, timer_started_at, segundos_acumulados, estado",
      )
      .not("estado", "in", '("entregada","cancelada")')
      .not("mecanico_id", "is", null),
    supabase
      .from("ordenes_taller")
      .select("id, mecanico_id, segundos_acumulados, entregada_at")
      .eq("estado", "entregada")
      .gte("entregada_at", start30d.toISOString()),
  ]);

  if (tiemposRes.error) throw new Error(tiemposRes.error.message);
  if (activasRes.error) throw new Error(activasRes.error.message);
  if (terminadasRes.error) throw new Error(terminadasRes.error.message);

  const tiempos = (tiemposRes.data ?? []) as TiempoRow[];
  const activas = activasRes.data ?? [];
  const terminadas = terminadasRes.data ?? [];
  const todayIso = startOfToday.toISOString();

  return mecanicos.map((m) => {
    const mTiempos = tiempos.filter((t) => t.mecanico_id === m.id);
    let segundosHoy = 0;
    let segundosSemana = 0;
    for (const t of mTiempos) {
      const secs = secondsBetween(t.inicio, t.fin, now);
      segundosSemana += secs;
      if (t.inicio >= todayIso || (t.fin && t.fin >= todayIso) || !t.fin) {
        const clipStart = Math.max(
          new Date(t.inicio).getTime(),
          startOfToday.getTime(),
        );
        const clipEnd = t.fin ? new Date(t.fin).getTime() : now;
        segundosHoy += Math.max(0, Math.floor((clipEnd - clipStart) / 1000));
      }
    }

    const mActivas = activas.filter((o) => o.mecanico_id === m.id);
    const working = mActivas.find((o) => o.timer_running);
    const mTerminadas = terminadas.filter((o) => o.mecanico_id === m.id);
    const totalSecs = mTerminadas.reduce(
      (acc, o) => acc + (o.segundos_acumulados as number),
      0,
    );

    return {
      ...m,
      motosActivas: mActivas.length,
      segundosHoy,
      segundosSemana,
      terminadas30d: mTerminadas.length,
      promedioPorMoto:
        mTerminadas.length > 0
          ? Math.round(totalSecs / mTerminadas.length)
          : null,
      trabajandoEn: working
        ? {
            ordenId: working.id as string,
            numero: working.numero as number,
            placa: (working.placa as string | null) ?? null,
            modelo: working.modelo as string,
            desde: (working.timer_started_at as string) ?? new Date().toISOString(),
            segundosPrevios: working.segundos_acumulados as number,
          }
        : null,
    };
  });
}

export async function getHistorialPorPlaca(
  placa: string,
): Promise<OrdenHistorialItem[]> {
  const clean = placa.trim().toUpperCase();
  if (!clean) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ordenes_taller")
    .select(
      `id, numero, estado, created_at, entregada_at, segundos_acumulados, modelo,
       trabajos:orden_taller_zonas(nota)`,
    )
    .ilike("placa", clean)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    id: string;
    numero: number;
    estado: OrdenHistorialItem["estado"];
    created_at: string;
    entregada_at: string | null;
    segundos_acumulados: number;
    modelo: string;
    trabajos: { nota: string }[] | null;
  }>).map((o) => ({
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    created_at: o.created_at,
    entregada_at: o.entregada_at,
    segundos_acumulados: o.segundos_acumulados,
    modelo: o.modelo,
    trabajos: (o.trabajos ?? []).map((t) => t.nota).filter(Boolean),
  }));
}

export async function buscarClienteParaTaller(
  q: string,
): Promise<ClienteTallerHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const supabase = createAdminClient();
  const pattern = `%${term}%`;

  const hits = new Map<number, ClienteTallerHit>();

  const [byUser, byPlaca, byContrato] = await Promise.all([
    supabase.from("users").select("id, user").ilike("user", pattern).limit(15),
    supabase
      .from("user_moto_compra")
      .select("id, user_id, placa, modelo, color, estado")
      .ilike("placa", pattern)
      .limit(15),
    supabase
      .from("digital_contracts")
      .select("user_id, hoja_vida_data, admin_data")
      .or(
        `hoja_vida_data->>nombres.ilike.${pattern},hoja_vida_data->>apellidos.ilike.${pattern},hoja_vida_data->>nombre_completo.ilike.${pattern},admin_data->>nombre.ilike.${pattern}`,
      )
      .limit(15),
  ]);

  const ensureHit = async (userId: number, nombreHint?: string) => {
    if (hits.has(userId)) return hits.get(userId)!;
    const { data: user } = await supabase
      .from("users")
      .select("id, user")
      .eq("id", userId)
      .maybeSingle();
    if (!user) return null;
    const { data: motos } = await supabase
      .from("user_moto_compra")
      .select("id, placa, modelo, color, estado")
      .eq("user_id", userId)
      .limit(10);
    const { data: contract } = await supabase
      .from("digital_contracts")
      .select("hoja_vida_data, admin_data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hv = (contract?.hoja_vida_data ?? {}) as Record<string, unknown>;
    const ad = (contract?.admin_data ?? {}) as Record<string, unknown>;
    const nombre =
      nombreHint ||
      [hv.nombres, hv.apellidos].filter(Boolean).join(" ").trim() ||
      (typeof hv.nombre_completo === "string" ? hv.nombre_completo : "") ||
      (typeof ad.nombre === "string" ? ad.nombre : "") ||
      String(user.user);
    const telefono =
      (typeof hv.celular === "string" ? hv.celular : null) ||
      (typeof hv.telefono === "string" ? hv.telefono : null) ||
      null;
    const hit: ClienteTallerHit = {
      userId,
      nombre,
      telefono,
      motos: ((motos ?? []) as Array<{
        id: string;
        placa: string | null;
        modelo: string;
        color: string | null;
        estado: string | null;
      }>)
        .filter((m) => m.estado !== "cancelada")
        .map((m) => ({
          id: m.id,
          placa: m.placa,
          modelo: m.modelo,
          color: m.color,
        })),
    };
    hits.set(userId, hit);
    return hit;
  };

  for (const u of byUser.data ?? []) {
    await ensureHit(u.id as number, String(u.user));
  }
  for (const m of byPlaca.data ?? []) {
    if (m.user_id != null) await ensureHit(m.user_id as number);
  }
  for (const c of byContrato.data ?? []) {
    if (c.user_id == null) continue;
    const hv = (c.hoja_vida_data ?? {}) as Record<string, unknown>;
    const ad = (c.admin_data ?? {}) as Record<string, unknown>;
    const nombre =
      [hv.nombres, hv.apellidos].filter(Boolean).join(" ").trim() ||
      (typeof hv.nombre_completo === "string" ? hv.nombre_completo : "") ||
      (typeof ad.nombre === "string" ? ad.nombre : "") ||
      undefined;
    await ensureHit(c.user_id as number, nombre);
  }

  return [...hits.values()].slice(0, 20);
}
