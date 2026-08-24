import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cobraCuotaAdelantada } from "@/lib/moto-payment";
import { buildClientPipeline } from "@/lib/pipeline/step-logic";
import type {
  BikeRow,
  ClienteFacturacion,
  ClientPipeline,
  ClientSearchResult,
  CongelamientoActivo,
  DigitalContractRow,
  InboxListItem,
  InboxQueue,
  InboxQueueId,
  InventarioCategoriaRow,
  InventarioProductoRow,
  CompraProductoCreditoRow,
  ProductoCreditoRow,
  GarajeMotoRow,
  GarajeMotoVendidaRow,
  GarajeMantenimientoItemRow,
  GarajeParqueaderoRow,
  VendidaMotoRow,
  MorosoEstado,
  MorosoRow,
  MotoParaRecogerRow,
  MotoRecogerEstado,
  AtrasoSnapshot,
  PagoHistorialRow,
  PagoRow,
  RentingResumen,
  SolicitudTallerRow,
  TarifaPagadaRow,
  TarjetaPropiedadRow,
  UserDocumentRow,
  UserMotoCompraRow,
  UserRow,
  UserTrackingRow,
  EquipoVisitaDetalleItem,
  EquipoVisitasDetalle,
  VisitaRow,
  VisitadorRow,
} from "@/lib/pipeline/types";
import {
  cuotaFraction,
  cuotasFromMonto,
  describeMontoVariacion,
  roundCuotas,
} from "@/lib/payments/payment-metrics";
import {
  DIAS_MORA_BANDEJA,
  DIAS_RECOGER_BANDEJA,
  mergeRentingResumenWithAtraso,
} from "@/lib/pipeline/mora-utils";
import { formatCop } from "@/lib/utils/format";
import {
  getAdminClientReferralScope,
  isPostDeliveryCompraEstado,
  referralAllowedForScopedAdmin,
  referralMatchesAdminScope,
  SCOPED_ADMIN_HIDDEN_QUEUES,
  SCOPED_ADMIN_POST_DELIVERY_ESTADOS,
} from "@/lib/auth/admin-client-scope";
import {
  buildReferralLeaderboard,
  GUILLEN_INBOX_CUTOFF_ISO,
  isHiddenReferral,
  isSegregatedInboxReferral,
  purchaseLeaderboardReferral,
  rankLeaderboard,
  referralLabel,
  resolveReferralSource,
  type LeaderboardRow,
  type ReferralLeaderboardRow,
} from "@/lib/referrals";

/** Clientes del referral scoped que aún no tienen moto entregada/saldada. */
async function loadScopedClientUserIds(
  supabase: ReturnType<typeof createAdminClient>,
  scope: string | null,
): Promise<Set<number> | null> {
  if (!scope) return null;
  const { data, error } = await supabase
    .from("users_documents")
    .select("user_id")
    .eq("referral_source", scope);
  if (error) throw new Error(error.message);

  const ids = new Set((data ?? []).map((d) => d.user_id as number));
  if (ids.size === 0) return ids;

  const { data: delivered, error: deliveredError } = await supabase
    .from("user_moto_compra")
    .select("user_id")
    .in("user_id", [...ids])
    .in("estado", [...SCOPED_ADMIN_POST_DELIVERY_ESTADOS]);
  if (deliveredError) throw new Error(deliveredError.message);

  for (const row of delivered ?? []) {
    ids.delete(row.user_id as number);
  }
  return ids;
}

/** Guillen sin visita = solicitudes pendientes (captadores scoped + admin pleno). */
async function guillenPendingSolicitudUserIds(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number[]> {
  const [{ data: docs, error: docsError }, { data: visitas, error: visitasError }] =
    await Promise.all([
      supabase
        .from("users_documents")
        .select("user_id")
        .eq("referral_source", "guillen"),
      supabase.from("visitas").select("user_id"),
    ]);
  if (docsError) throw new Error(docsError.message);
  if (visitasError) throw new Error(visitasError.message);

  const withVisita = new Set((visitas ?? []).map((v) => v.user_id as number));
  const ids = new Set<number>();
  for (const d of docs ?? []) {
    const uid = d.user_id as number;
    if (!withVisita.has(uid)) ids.add(uid);
  }
  return [...ids];
}

function normalizeVisita(raw: unknown): VisitaRow | null {
  if (!raw) return null;
  const v = raw as VisitaRow;
  return {
    ...v,
    evidencia_fotos: v.evidencia_fotos ?? [],
    evidencia_videos: v.evidencia_videos ?? [],
    ubicacion_verificada: v.ubicacion_verificada ?? null,
    fecha_completada: v.fecha_completada ?? null,
    notas_visita: v.notas_visita ?? null,
  };
}

function joinUser(raw: unknown): UserRow | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    return { id: Number(first.id), user: String(first.user) };
  }
  const obj = raw as Record<string, unknown>;
  return { id: Number(obj.id), user: String(obj.user) };
}

/** Select anidado para enriquecer filas del inbox (nombre, celular, selfie). */
const INBOX_USER_SELECT =
  "users(id, user, users_documents(selfie_url, referral_source), digital_contracts(hoja_vida_data, created_at))";

type InboxNestedUser = {
  id: number;
  user: string;
  users_documents:
    | { selfie_url: string | null; referral_source: string | null }
    | { selfie_url: string | null; referral_source: string | null }[]
    | null;
  digital_contracts:
    | { hoja_vida_data: Record<string, unknown>; created_at: string }
    | { hoja_vida_data: Record<string, unknown>; created_at: string }[]
    | null;
};

function inboxClientFromUser(
  usersRaw: InboxNestedUser | InboxNestedUser[] | null | undefined,
  fallbackUserId: number,
  nameFallback?: string | null,
  celularFallback?: string | null,
): Pick<
  InboxListItem,
  "username" | "displayName" | "cedula" | "celular" | "selfieUrl"
> {
  const users = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
  const cedula = users?.user ? String(users.user) : null;

  const docsRaw = users?.users_documents;
  const doc = Array.isArray(docsRaw) ? docsRaw[0] : docsRaw;
  const selfieUrl = doc?.selfie_url ? String(doc.selfie_url) : null;

  const contractsRaw = users?.digital_contracts;
  const contracts = Array.isArray(contractsRaw)
    ? contractsRaw
    : contractsRaw
      ? [contractsRaw]
      : [];
  const latest = [...contracts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  const hoja = latest?.hoja_vida_data ?? {};
  const nombre = String(hoja.nombre_completo ?? "").trim();
  const celularHoja = String(hoja.celular ?? "").trim();
  const celular =
    celularHoja ||
    (celularFallback?.trim() ? celularFallback.trim() : null);

  return {
    username: cedula ?? `#${fallbackUserId}`,
    displayName:
      nombre ||
      nameFallback?.trim() ||
      cedula ||
      `Cliente ${fallbackUserId}`,
    cedula,
    celular,
    selfieUrl,
  };
}

function inboxBikeImage(
  bikeRaw:
    | { imagen_url: string | null }
    | { imagen_url: string | null }[]
    | null
    | undefined,
): string | null {
  const bike = Array.isArray(bikeRaw) ? bikeRaw[0] : bikeRaw;
  return bike?.imagen_url ? String(bike.imagen_url) : null;
}

export async function getClientPipeline(
  userId: number,
): Promise<ClientPipeline | null> {
  const supabase = createAdminClient();
  const clientScope = await getAdminClientReferralScope();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, user")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) return null;

  const { data: document } = await supabase
    .from("users_documents")
    .select(
      "id, user_id, estado_solicitud, betado, motivo_rechazo, document_front_url, document_back_url, selfie_url, ubicacion_solicitud, referral_source, hora_actualizacion, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    !referralAllowedForScopedAdmin(
      (document?.referral_source as string | null | undefined) ?? null,
      clientScope,
    )
  ) {
    return null;
  }

  const { data: contract } = await supabase
    .from("digital_contracts")
    .select(
      "id, user_id, users_documents_id, status, hoja_vida_data, contrato_data, admin_data, signature_path, hoja_vida_pdf_path, contrato_pdf_path, signed_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: visita } = await supabase
    .from("visitas")
    .select(
      "id, user_id, digital_contract_id, visitador_id, estado, cliente_nombre, cliente_celular, direccion_visita, barrio, fecha_programada, notas, evidencia_fotos, evidencia_videos, ubicacion_verificada, fecha_completada, notas_visita, created_at, updated_at, visitadores(id, nombre, foto_url, telefono, activo, user_id)",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, bike_id, modelo, color, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto, monto_total_primer_pago, estado, pago_inicial_confirmado, pago_cuota_confirmado, pago_visita_confirmado, placa, chasis, referencia, fecha_entrega, doc_tarjeta_propiedad_path, doc_soat_path, doc_tecno_path, seleccionado_at, admin_data",
    )
    .eq("user_id", userId)
    .maybeSingle();

  // Opinilla: deja de ver al cliente cuando ya le entregaron la moto.
  if (clientScope && isPostDeliveryCompraEstado(compra?.estado as string | null)) {
    return null;
  }

  const { data: tracking } = await supabase
    .from("users_tracking")
    .select("id, user_id, seguimiento, ubicacion_1")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: tarifas } = await supabase
    .from("tarifas_pagadas")
    .select(
      "id, user_moto_compra_id, user_id, numero_periodo, fecha_vencimiento, monto_esperado, monto_pagado, estado, pagada_at, confirmada_por, notas",
    )
    .eq("user_id", userId)
    .order("numero_periodo");

  const { data: moroso } = await supabase
    .from("morosos")
    .select(
      "id, user_moto_compra_id, user_id, tarifa_vencida_id, dias_atraso, monto_adeudado, estado, fecha_ingreso",
    )
    .eq("user_id", userId)
    .eq("estado", "activo")
    .maybeSingle();

  const { data: recoger } = await supabase
    .from("motos_para_recoger")
    .select(
      "id, user_moto_compra_id, moroso_id, user_id, dias_atraso, monto_adeudado, estado, fecha_ingreso, fecha_recogida, notas",
    )
    .eq("user_id", userId)
    .in("estado", ["pendiente", "asignada"])
    .maybeSingle();

  const { data: atrasoRow } = compra
    ? await supabase
        .from("atrasos")
        .select("dias_atraso, monto_adeudado, estado")
        .eq("user_moto_compra_id", compra.id)
        .maybeSingle()
    : { data: null };

  const { data: congelamientoRow } = compra
    ? await supabase
        .from("congelamientos_cuotas")
        .select("dias, created_at")
        .eq("user_moto_compra_id", compra.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const congelamiento = buildCongelamientoActivo(
    congelamientoRow as { dias: number; created_at: string } | null,
  );

  const tarifaRows = (tarifas as TarifaPagadaRow[]) ?? [];

  const { data: pagos } = compra
    ? await supabase
        .from("pagos")
        .select(
          "id, user_moto_compra_id, user_id, monto, referencia, comprobante_url, contexto_pago, fecha_comprobante, confirmado_at, tarifa_objetivo_id, estado, medio_pago_admin",
        )
        .eq("user_moto_compra_id", compra.id)
        .eq("estado", "confirmado")
        .order("confirmado_at", { ascending: false })
    : { data: [] };

  const rentingResumenFromTarifas = buildRentingResumen(
    compra as UserMotoCompraRow | null,
    tarifaRows,
  );
  const rentingResumen = mergeRentingResumenWithAtraso(
    compra as UserMotoCompraRow | null,
    rentingResumenFromTarifas,
    (atrasoRow as AtrasoSnapshot | null) ?? null,
  );

  const pagoRows = (pagos as PagoRow[]) ?? [];

  const pagosHistorial = buildPagosHistorial(
    compra as UserMotoCompraRow | null,
    pagoRows,
    tarifaRows,
  );

  const pagoIds = pagoRows.map((p) => p.id);
  const { data: aplicaciones } =
    pagoIds.length > 0
      ? await supabase
          .from("pago_tarifa_aplicaciones")
          .select("pago_id, tarifa_id")
          .in("pago_id", pagoIds)
      : { data: [] };

  const comprobanteByTarifaId = buildComprobanteByTarifa(
    pagoRows,
    (aplicaciones as { pago_id: string; tarifa_id: string }[]) ?? [],
  );

  const { data: compraProductosCredito } = compra
    ? await supabase
        .from("compra_productos_credito")
        .select(
          "id, user_moto_compra_id, user_id, producto_credito_id, nombre, cuota_inicial_monto, cuota_diaria_monto, cantidad, notas, created_at",
        )
        .eq("user_moto_compra_id", compra.id)
        .order("created_at")
    : { data: [] };

  return buildClientPipeline({
    user: user as UserRow,
    document: (document as UserDocumentRow | null) ?? null,
    contract: (contract as DigitalContractRow | null) ?? null,
    visita: normalizeVisita(visita),
    compra: (compra as UserMotoCompraRow | null) ?? null,
    tracking: (tracking as UserTrackingRow | null) ?? null,
    tarifas: tarifaRows,
    moroso: (moroso as MorosoRow | null) ?? null,
    recoger: (recoger as MotoParaRecogerRow | null) ?? null,
    atraso: (atrasoRow as AtrasoSnapshot | null) ?? null,
    congelamiento,
    rentingResumen,
    pagosHistorial,
    pagos: pagoRows,
    comprobanteByTarifaId,
    compraProductosCredito:
      (compraProductosCredito as CompraProductoCreditoRow[]) ?? [],
  });
}

function buildComprobanteByTarifa(
  pagos: PagoRow[],
  aplicaciones: { pago_id: string; tarifa_id: string }[],
): Record<string, string> {
  const urlByPago = new Map<string, string>();
  for (const pago of pagos) {
    if (pago.comprobante_url) urlByPago.set(pago.id, pago.comprobante_url);
  }

  const out: Record<string, string> = {};
  for (const pago of pagos) {
    if (pago.tarifa_objetivo_id && pago.comprobante_url) {
      out[pago.tarifa_objetivo_id] = pago.comprobante_url;
    }
  }
  for (const app of aplicaciones) {
    const url = urlByPago.get(app.pago_id);
    if (url) out[app.tarifa_id] = url;
  }
  return out;
}

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Un congelamiento pospone los vencimientos `dias` días desde que se aplicó.
 * Se considera "activo" mientras ese periodo de gracia no haya expirado.
 */
function buildCongelamientoActivo(
  row: { dias: number; created_at: string } | null,
): CongelamientoActivo | null {
  if (!row) return null;

  const fin = new Date(row.created_at);
  fin.setDate(fin.getDate() + row.dias);

  const diasRestantes = Math.ceil((fin.getTime() - Date.now()) / MS_POR_DIA);
  if (diasRestantes <= 0) return null;

  return { dias: row.dias, diasRestantes, hasta: fin.toISOString() };
}

function buildRentingResumen(
  compra: UserMotoCompraRow | null,
  tarifas: TarifaPagadaRow[],
): RentingResumen | null {
  if (!compra || compra.estado !== "entregada") return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalPagado = 0;
  let totalAdeudado = 0;
  let cuotasPagadas = 0;
  let cuotasPendientes = 0;
  let cuotasVencidas = 0;
  let diasAtraso: number | null = null;
  let proximoVencimiento: string | null = null;

  for (const tarifa of tarifas) {
    const pagadoParcial = tarifa.monto_pagado ?? 0;

    if (tarifa.estado === "pagada") {
      const pagado = pagadoParcial || tarifa.monto_esperado;
      cuotasPagadas += cuotaFraction(pagado, tarifa.monto_esperado);
      totalPagado += pagado;
    } else {
      if (pagadoParcial > 0) {
        cuotasPagadas += cuotaFraction(pagadoParcial, tarifa.monto_esperado);
        totalPagado += pagadoParcial;
      }

      if (tarifa.estado === "pendiente") {
        cuotasPendientes++;
        if (!proximoVencimiento) proximoVencimiento = tarifa.fecha_vencimiento;
      } else if (tarifa.estado === "vencida") {
        cuotasVencidas++;
        totalAdeudado += tarifa.monto_esperado - pagadoParcial;
        const venc = new Date(tarifa.fecha_vencimiento);
        venc.setHours(0, 0, 0, 0);
        const atraso = Math.floor(
          (today.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diasAtraso === null || atraso > diasAtraso) diasAtraso = atraso;
      }
    }
  }

  return {
    totalPagado,
    totalAdeudado,
    cuotasPagadas: roundCuotas(cuotasPagadas),
    cuotasPendientes,
    cuotasVencidas,
    diasAtraso,
    proximoVencimiento,
  };
}

function buildPagosHistorial(
  compra: UserMotoCompraRow | null,
  pagos: PagoRow[],
  tarifas: TarifaPagadaRow[],
): PagoHistorialRow[] {
  if (!compra) return [];

  const tarifaById = new Map(tarifas.map((t) => [t.id, t]));

  return pagos.map((pago) => {
    const tarifa = pago.tarifa_objetivo_id
      ? tarifaById.get(pago.tarifa_objetivo_id)
      : undefined;

    let montoEsperado: number | null = null;
    if (pago.contexto_pago === "inicial") {
      montoEsperado = compra.cuota_inicial_monto;
    } else if (pago.contexto_pago === "cuota_adelantada") {
      montoEsperado = compra.monto_cuota_periodo;
    } else if (tarifa) {
      montoEsperado = tarifa.monto_esperado;
    } else if (pago.contexto_pago === "tarifa") {
      montoEsperado = compra.monto_cuota_periodo;
    }

    const cuotasCubiertas =
      pago.contexto_pago === "inicial"
        ? 0
        : cuotasFromMonto(pago.monto, compra.monto_cuota_periodo);

    const variacion =
      montoEsperado != null
        ? describeMontoVariacion(pago.monto, montoEsperado)
        : { label: "—", diff: 0, tone: "exacto" as const };

    return {
      id: pago.id,
      fecha: pago.fecha_comprobante ?? pago.confirmado_at ?? "",
      monto: pago.monto,
      montoEsperado,
      referencia: pago.referencia,
      contexto_pago: pago.contexto_pago,
      numeroPeriodo: tarifa?.numero_periodo ?? null,
      cuotasCubiertas,
      variacionLabel: variacion.label,
      variacionTone: variacion.tone,
      comprobante_url: pago.comprobante_url,
    };
  });
}

/** user_ids con solicitud pendiente (users_documents) y sin ninguna visita. */
async function clientUserIdsWithoutVisita(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number[]> {
  const [{ data: docs }, { data: visitas }] = await Promise.all([
    supabase
      .from("users_documents")
      .select("user_id, referral_source, created_at")
      .eq("estado_solicitud", "pendiente"),
    supabase.from("visitas").select("user_id"),
  ]);
  const withVisita = new Set((visitas ?? []).map((v) => v.user_id as number));
  const ids = new Set<number>();
  for (const d of docs ?? []) {
    if (
      isSegregatedInboxReferral(
        d.referral_source as string | null,
        d.created_at as string | null,
      )
    ) {
      continue;
    }
    const uid = d.user_id as number;
    if (!withVisita.has(uid)) ids.add(uid);
  }
  return [...ids];
}

function sinVisitaSubtitle(
  estado: string,
  referralSource?: string | null,
): string {
  const base =
    estado === "aceptada"
      ? "Crédito aprobado · sin visita"
      : estado === "rechazada"
        ? "Crédito rechazado · sin visita"
        : "Solicitud pendiente · sin visita";
  const label = referralLabel(referralSource);
  return label ? `${base} · ${label}` : base;
}

/** Syncs morosos / motos_para_recoger from vista atrasos (cron alone leaves cancelada stuck). */
// ponytail: throttle 60s in-memory; upgrade to Redis/pg advisory lock if multi-instance drift matters
let lastMoraSyncAt = 0;
let moraSyncInFlight: Promise<void> | null = null;
const MORA_SYNC_TTL_MS = 60_000;

function kickMoraSync(supabase: ReturnType<typeof createAdminClient>): void {
  void ensureMoraSynced(supabase).catch(() => {});
}

async function ensureMoraSynced(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const now = Date.now();
  if (now - lastMoraSyncAt < MORA_SYNC_TTL_MS) return;
  if (moraSyncInFlight) return moraSyncInFlight;

  lastMoraSyncAt = now;
  moraSyncInFlight = (async () => {
    const { error } = await supabase.rpc("evaluar_mora_diaria");
    if (error) {
      lastMoraSyncAt = 0;
      throw new Error(error.message);
    }
  })().finally(() => {
    moraSyncInFlight = null;
  });

  return moraSyncInFlight;
}

export async function getInboxQueues(): Promise<InboxQueue[]> {
  const supabase = createAdminClient();
  kickMoraSync(supabase);
  const clientScope = await getAdminClientReferralScope();
  const scopedIds = await loadScopedClientUserIds(supabase, clientScope);
  const scopedUserIds = scopedIds ? [...scopedIds] : null;
  const scopedEmpty = scopedUserIds != null && scopedUserIds.length === 0;
  // ponytail: any corta la recursión de tipos del query builder de Supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeIn = (query: any) =>
    scopedUserIds?.length ? query.in("user_id", scopedUserIds) : query;
  const emptyCount = { count: 0, error: null as null };

  const [
    creditosIdsRaw,
    clientesGuillen,
    visitasSinAsignar,
    visitasProgramadas,
    pagos,
    retiro,
    entrega,
    morosos,
    recoger,
    solicitudesTaller,
  ] = await Promise.all([
    clientUserIdsWithoutVisita(supabase),
    clientScope
      ? referralAllowedForScopedAdmin("guillen", clientScope)
        ? guillenPendingSolicitudUserIds(supabase).then((ids) => ({
            data: ids.map((user_id) => ({ user_id })),
            error: null,
          }))
        : Promise.resolve({ data: [] as { user_id: number }[], error: null })
      : supabase
          .from("users_documents")
          .select("user_id")
          .eq("referral_source", "guillen")
          .lt("created_at", GUILLEN_INBOX_CUTOFF_ISO),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("visitas")
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente_asignacion"),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("visitas")
            .select("id", { count: "exact", head: true })
            .eq("estado", "asignada"),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("user_moto_compra")
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente_pago")
            .or(
              "pago_inicial_confirmado.eq.false,pago_cuota_confirmado.eq.false",
            ),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("user_moto_compra")
            .select("id", { count: "exact", head: true })
            .eq("estado", "lista_retiro")
            .is("placa", null),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("user_moto_compra")
            .select("id", { count: "exact", head: true })
            .eq("estado", "lista_retiro")
            .not("placa", "is", null),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("morosos")
            .select("id", { count: "exact", head: true })
            .eq("estado", "activo")
            .gte("dias_atraso", DIAS_MORA_BANDEJA)
            .lt("dias_atraso", DIAS_RECOGER_BANDEJA),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("motos_para_recoger")
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente"),
        ),
    scopedEmpty
      ? Promise.resolve(emptyCount)
      : scopeIn(
          supabase
            .from("solicitudes_taller")
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente"),
        ),
  ]);

  if (clientesGuillen.error) throw new Error(clientesGuillen.error.message);
  const clientesGuillenCount = new Set(
    (clientesGuillen.data ?? []).map((d) => d.user_id as number),
  ).size;

  const creditosIds = scopedIds
    ? creditosIdsRaw.filter((id) => scopedIds.has(id))
    : creditosIdsRaw;

  const queues: InboxQueue[] = [
    {
      id: "creditos",
      label: "Revisar solicitudes",
      description: "Solicitudes pendientes sin visita",
      count: creditosIds.length,
    },
    {
      id: "clientes_guillen",
      label: clientScope ? "Solicitudes Guillen" : "Clientes (Guillen)",
      description: clientScope
        ? "Pendientes del link Guillén (sin visita)"
        : "Link Guillén anteriores al cambio de flujo",
      count: clientesGuillenCount,
    },
    {
      id: "pagos",
      label: "Confirmar pagos",
      description: "Pagos iniciales por verificar",
      count: pagos.count ?? 0,
    },
    {
      id: "retiro",
      label: "Preparar retiro",
      description: "Motos pagadas sin datos de placa",
      count: retiro.count ?? 0,
    },
    {
      id: "entrega",
      label: "Registrar entrega",
      description: "Motos listas para marcar como entregadas",
      count: entrega.count ?? 0,
    },
    {
      id: "visitas_sin_asignar",
      label: "Asignar visitas",
      description: "Visitas domiciliarias sin visitador",
      count: visitasSinAsignar.count ?? 0,
    },
    {
      id: "visitas_programadas",
      label: "Completar visitas",
      description: "Visitas ya programadas con visitador",
      count: visitasProgramadas.count ?? 0,
    },
    {
      id: "morosos",
      label: "Clientes en mora",
      description: "Exactamente 3 días de atraso en tarifas",
      count: morosos.count ?? 0,
    },
    {
      id: "recoger",
      label: "Motos para recoger",
      description: "Mora de 4+ días — recuperación",
      count: recoger.count ?? 0,
    },
    {
      id: "solicitudes_taller",
      label: "Solicitudes taller",
      description: "Repuestos, reparaciones y cambio de aceite",
      count: solicitudesTaller.count ?? 0,
    },
  ];

  // ponytail: PDV BGA sin captador Guillén — no mostrar ni contar esa cola.
  const withoutGuillen = queues.filter((q) => q.id !== "clientes_guillen");

  if (clientScope) {
    return withoutGuillen.filter((q) => {
      if ((SCOPED_ADMIN_HIDDEN_QUEUES as readonly string[]).includes(q.id)) {
        return false;
      }
      return true;
    });
  }
  return withoutGuillen;
}

export async function getInboxListItems(
  queueId: InboxQueueId,
): Promise<InboxListItem[]> {
  const supabase = createAdminClient();
  const clientScope = await getAdminClientReferralScope();
  if (
    clientScope &&
    (SCOPED_ADMIN_HIDDEN_QUEUES as readonly string[]).includes(queueId)
  ) {
    return [];
  }
  if (
    queueId === "clientes_guillen" &&
    clientScope &&
    !referralAllowedForScopedAdmin("guillen", clientScope)
  ) {
    return [];
  }
  const scopedIds = await loadScopedClientUserIds(supabase, clientScope);

  if (queueId === "morosos" || queueId === "recoger") {
    await ensureMoraSynced(supabase);
  }

  const filterScoped = (items: InboxListItem[]) =>
    scopedIds ? items.filter((item) => scopedIds.has(item.userId)) : items;

  switch (queueId) {
    case "creditos": {
      // La UI filtra Pendiente / Aprobado / Rechazado; hay que cargar los tres.
      // El badge de la cola sigue contando solo pendientes (clientUserIdsWithoutVisita).
      let docsQuery = supabase
        .from("users_documents")
        .select(
          "user_id, estado_solicitud, created_at, selfie_url, referral_source, users(id, user), digital_contracts(hoja_vida_data)",
        )
        .in("estado_solicitud", ["pendiente", "aceptada", "rechazada"])
        .order("created_at", { ascending: false });
      if (clientScope) {
        docsQuery = docsQuery.eq("referral_source", clientScope);
      }
      const [docsRes, visitasRes] = await Promise.all([
        docsQuery,
        supabase.from("visitas").select("user_id"),
      ]);

      if (docsRes.error) throw new Error(docsRes.error.message);
      if (visitasRes.error) throw new Error(visitasRes.error.message);

      const withVisita = new Set(
        (visitasRes.data ?? []).map((v) => v.user_id as number),
      );
      const seen = new Set<number>();
      const items: InboxListItem[] = [];
      for (const row of docsRes.data ?? []) {
        const uid = row.user_id as number;
        if (withVisita.has(uid) || seen.has(uid)) continue;
        if (
          isSegregatedInboxReferral(
            row.referral_source as string | null,
            row.created_at as string | null,
          )
        ) {
          continue;
        }
        seen.add(uid);
        const users = joinUser(row.users);
        const cedula = users?.user ?? null;
        const contractsRaw = row.digital_contracts as
          | { hoja_vida_data: Record<string, unknown> }
          | { hoja_vida_data: Record<string, unknown> }[]
          | null;
        const contract = Array.isArray(contractsRaw)
          ? contractsRaw[0]
          : contractsRaw;
        const nombreHoja = String(
          contract?.hoja_vida_data?.nombre_completo ?? "",
        ).trim();
        const celularHoja = String(
          contract?.hoja_vida_data?.celular ?? "",
        ).trim();
        items.push({
          userId: uid,
          username: cedula ?? `#${uid}`,
          displayName: nombreHoja || cedula || `Cliente ${uid}`,
          cedula,
          celular: celularHoja || null,
          selfieUrl: (row.selfie_url as string | null) ?? null,
          createdAt: row.created_at as string,
          estadoSolicitud: row.estado_solicitud as string,
          referralSource: (row.referral_source as string | null) ?? null,
          subtitle: sinVisitaSubtitle(
            row.estado_solicitud as string,
            row.referral_source as string | null,
          ),
          queueId,
        });
      }
      return filterScoped(items);
    }
    case "clientes_guillen": {
      // Opinilla: todas las pendientes Guillen (sin visita). Admin pleno: legado pre-corte.
      let docsQuery = supabase
        .from("users_documents")
        .select(
          "user_id, estado_solicitud, created_at, selfie_url, referral_source, users(id, user), digital_contracts(hoja_vida_data)",
        )
        .eq("referral_source", "guillen")
        .order("created_at", { ascending: false });
      if (!clientScope) {
        docsQuery = docsQuery.lt("created_at", GUILLEN_INBOX_CUTOFF_ISO);
      }

      const [docsRes, visitasRes] = await Promise.all([
        docsQuery,
        clientScope
          ? supabase.from("visitas").select("user_id")
          : Promise.resolve({ data: [] as { user_id: number }[], error: null }),
      ]);

      if (docsRes.error) throw new Error(docsRes.error.message);
      if (visitasRes.error) throw new Error(visitasRes.error.message);

      const withVisita = new Set(
        (visitasRes.data ?? []).map((v) => v.user_id as number),
      );
      const data = docsRes.data ?? [];
      const seen = new Set<number>();
      const items: InboxListItem[] = [];
      for (const row of data) {
        const uid = row.user_id as number;
        if (seen.has(uid)) continue;
        if (clientScope && withVisita.has(uid)) continue;
        seen.add(uid);
        const users = joinUser(row.users);
        const cedula = users?.user ?? null;
        const contractsRaw = row.digital_contracts as
          | { hoja_vida_data: Record<string, unknown> }
          | { hoja_vida_data: Record<string, unknown> }[]
          | null;
        const contract = Array.isArray(contractsRaw)
          ? contractsRaw[0]
          : contractsRaw;
        const nombreHoja = String(
          contract?.hoja_vida_data?.nombre_completo ?? "",
        ).trim();
        const celularHoja = String(
          contract?.hoja_vida_data?.celular ?? "",
        ).trim();
        const estado = row.estado_solicitud as string;
        const estadoLabel =
          estado === "aceptada"
            ? "Crédito aprobado"
            : estado === "rechazada"
              ? "Crédito rechazado"
              : "Solicitud pendiente";
        items.push({
          userId: uid,
          username: cedula ?? `#${uid}`,
          displayName: nombreHoja || cedula || `Cliente ${uid}`,
          cedula,
          celular: celularHoja || null,
          selfieUrl: (row.selfie_url as string | null) ?? null,
          createdAt: row.created_at as string,
          estadoSolicitud: estado,
          referralSource: "guillen",
          subtitle: `${estadoLabel} · Guillen`,
          queueId,
        });
      }
      // No filtrar por scope Olga: esta cola es Guillen a propósito.
      return items;
    }
    case "visitas_sin_asignar":
    case "visitas_programadas": {
      const estado =
        queueId === "visitas_sin_asignar"
          ? "pendiente_asignacion"
          : "asignada";
      const { data } = await supabase
        .from("visitas")
        .select(
          `user_id, cliente_nombre, cliente_celular, created_at, ${INBOX_USER_SELECT}`,
        )
        .eq("estado", estado)
        .order("created_at", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
            row.cliente_nombre as string | null,
            row.cliente_celular as string | null,
          );
          return {
            userId: row.user_id as number,
            ...client,
            subtitle:
              queueId === "visitas_sin_asignar"
                ? "Visita sin asignar"
                : "Visita programada",
            queueId,
          };
        }),
      );
    }
    case "pagos": {
      const { data } = await supabase
        .from("user_moto_compra")
        .select(
          `user_id, modelo, color, placa, bike_table(imagen_url), ${INBOX_USER_SELECT}`,
        )
        .eq("estado", "pendiente_pago")
        .or(
          "pago_inicial_confirmado.eq.false,pago_cuota_confirmado.eq.false",
        )
        .order("seleccionado_at", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(
              row.bike_table as
                | { imagen_url: string | null }
                | { imagen_url: string | null }[]
                | null,
            ),
            subtitle: `${row.modelo} · ${row.color}`,
            queueId,
          };
        }),
      );
    }
    case "retiro": {
      const { data } = await supabase
        .from("user_moto_compra")
        .select(
          `user_id, modelo, color, placa, bike_table(imagen_url), ${INBOX_USER_SELECT}`,
        )
        .eq("estado", "lista_retiro")
        .is("placa", null)
        .order("updated_at", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(
              row.bike_table as
                | { imagen_url: string | null }
                | { imagen_url: string | null }[]
                | null,
            ),
            subtitle: `${row.modelo} · Falta placa`,
            queueId,
          };
        }),
      );
    }
    case "entrega": {
      const { data } = await supabase
        .from("user_moto_compra")
        .select(
          `user_id, modelo, color, placa, bike_table(imagen_url), ${INBOX_USER_SELECT}`,
        )
        .eq("estado", "lista_retiro")
        .not("placa", "is", null)
        .order("updated_at", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(
              row.bike_table as
                | { imagen_url: string | null }
                | { imagen_url: string | null }[]
                | null,
            ),
            subtitle: `${row.modelo} · Placa ${row.placa}`,
            queueId,
          };
        }),
      );
    }
    case "morosos": {
      const { data } = await supabase
        .from("morosos")
        .select(
          `user_id, dias_atraso, monto_adeudado, ${INBOX_USER_SELECT}, user_moto_compra(modelo, color, placa, bike_table(imagen_url))`,
        )
        .eq("estado", "activo")
        .gte("dias_atraso", DIAS_MORA_BANDEJA)
        .lt("dias_atraso", DIAS_RECOGER_BANDEJA)
        .order("dias_atraso", { ascending: false });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          const compraRaw = row.user_moto_compra as
            | {
                modelo?: string;
                color?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }
            | {
                modelo?: string;
                color?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }[]
            | null;
          const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(compra?.bike_table),
            subtitle: `${compra?.modelo ?? "Moto"} · ${row.dias_atraso} días · ${formatCop(row.monto_adeudado)} · ${compra?.placa ?? "sin placa"}`,
            queueId,
          };
        }),
      );
    }
    case "recoger": {
      const { data } = await supabase
        .from("motos_para_recoger")
        .select(
          `user_id, dias_atraso, monto_adeudado, ${INBOX_USER_SELECT}, user_moto_compra(modelo, color, placa, bike_table(imagen_url))`,
        )
        .eq("estado", "pendiente")
        .order("fecha_ingreso", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          const compraRaw = row.user_moto_compra as
            | {
                modelo?: string;
                color?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }
            | {
                modelo?: string;
                color?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }[]
            | null;
          const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(compra?.bike_table),
            subtitle: `Recoger ${compra?.modelo ?? "moto"} · ${row.dias_atraso} días · ${formatCop(row.monto_adeudado)}`,
            queueId,
          };
        }),
      );
    }
    case "solicitudes_taller": {
      const { data } = await supabase
        .from("solicitudes_taller")
        .select(
          `id, user_id, tipo, estado, total_estimado, created_at, ${INBOX_USER_SELECT}, user_moto_compra(modelo, placa, bike_table(imagen_url))`,
        )
        .eq("estado", "pendiente")
        .order("created_at", { ascending: true });

      return filterScoped(
        (data ?? []).map((row) => {
          const client = inboxClientFromUser(
            row.users as InboxNestedUser | InboxNestedUser[] | null,
            row.user_id as number,
          );
          const compraRaw = row.user_moto_compra as
            | {
                modelo?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }
            | {
                modelo?: string;
                placa?: string | null;
                bike_table?:
                  | { imagen_url: string | null }
                  | { imagen_url: string | null }[]
                  | null;
              }[]
            | null;
          const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;
          const tipoLabel =
            row.tipo === "repuestos"
              ? "Repuestos"
              : row.tipo === "reparacion"
                ? "Reparación"
                : "Cambio aceite";
          return {
            userId: row.user_id as number,
            ...client,
            motoImagenUrl: inboxBikeImage(compra?.bike_table),
            subtitle: `${tipoLabel} · ${compra?.modelo ?? "Moto"}`,
            queueId,
          };
        }),
      );
    }
    default:
      return [];
  }
}

export async function getAllCategorias(): Promise<InventarioCategoriaRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("inventario_categorias")
    .select("id, nombre, slug, descripcion, activo, orden")
    .order("orden")
    .order("nombre");
  return (data as InventarioCategoriaRow[]) ?? [];
}

export async function getAllProductos(): Promise<InventarioProductoRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("inventario_productos")
    .select(
      "id, categoria_id, sku, nombre, descripcion, precio, costo, stock, stock_minimo, ubicacion, imagen_url, compatible_modelos, activo, inventario_categorias(id, nombre, slug, descripcion, activo, orden)",
    )
    .order("stock", { ascending: true })
    .order("nombre");
  return ((data ?? []) as unknown as InventarioProductoRow[]);
}

export async function getAllProductosCredito(): Promise<ProductoCreditoRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("productos_credito")
    .select(
      "id, nombre, descripcion, cuota_inicial, cuota_diaria, imagen_url, activo, orden",
    )
    .order("orden")
    .order("nombre");
  return (data as ProductoCreditoRow[]) ?? [];
}

const productoSelect =
  "id, categoria_id, sku, nombre, descripcion, precio, costo, stock, stock_minimo, ubicacion, imagen_url, compatible_modelos, activo, inventario_categorias(id, nombre, slug, descripcion, activo, orden)";

export async function getProductoBySku(
  sku: string,
): Promise<InventarioProductoRow | null> {
  const normalized = sku.trim().toUpperCase();
  if (!normalized) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("inventario_productos")
    .select(productoSelect)
    .eq("sku", normalized)
    .eq("activo", true)
    .maybeSingle();
  return (data as InventarioProductoRow | null) ?? null;
}

export async function searchProductos(
  q: string,
  limit = 8,
): Promise<InventarioProductoRow[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const safe = trimmed.replace(/[%_\\]/g, "");
  if (!safe) return [];

  const pattern = `%${safe}%`;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inventario_productos")
    .select(productoSelect)
    .eq("activo", true)
    .or(`nombre.ilike."${pattern}",sku.ilike."${pattern}"`)
    .order("nombre")
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as InventarioProductoRow[]);
}

export async function getAllSolicitudesTaller(): Promise<SolicitudTallerRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("solicitudes_taller")
    .select(
      "id, user_id, user_moto_compra_id, tipo, estado, notas_cliente, notas_admin, fecha_preferida, descripcion_falla, total_estimado, created_at, updated_at, users(id, user), user_moto_compra(id, modelo, color, placa, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, monto_total_primer_pago, estado, pago_inicial_confirmado, pago_cuota_confirmado, bike_id, seleccionado_at), solicitud_repuesto_items(id, solicitud_id, producto_id, cantidad, precio_unitario, subtotal, inventario_productos(id, nombre, sku, precio))",
    )
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as SolicitudTallerRow[]);
}

export async function getActiveVisitadores(): Promise<VisitadorRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("visitadores")
    .select("id, nombre, foto_url, telefono, activo, user_id, users(id, user)")
    .eq("activo", true)
    .not("user_id", "is", null)
    .order("nombre");
  return ((data ?? []) as unknown as VisitadorRow[]);
}

export async function getAllVisitadores(): Promise<VisitadorRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("visitadores")
    .select("id, nombre, foto_url, telefono, activo, user_id, users(id, user)")
    .order("nombre");
  return ((data ?? []) as unknown as VisitadorRow[]);
}

export async function getReferralLeaderboard(range?: {
  startIso: string;
  endExclusiveIso: string;
}): Promise<ReferralLeaderboardRow[]> {
  const supabase = createAdminClient();
  // Solo clientes que ya compraron moto a crédito (no solo llenaron la hoja).
  let q = supabase
    .from("user_moto_compra")
    .select("users!inner(users_documents(referral_source))")
    .neq("estado", "cancelada");
  if (range) {
    q = q
      .gte("seleccionado_at", range.startIso)
      .lt("seleccionado_at", range.endExclusiveIso);
  }

  const { data, error } = await q;

  if (error) throw new Error(error.message);

  type UserWithDocs = {
    users_documents:
      | { referral_source: string | null }[]
      | { referral_source: string | null }
      | null;
  };

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const usersRaw = row.users as UserWithDocs | UserWithDocs[] | null;
    const user = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
    const docs = Array.isArray(user?.users_documents)
      ? user.users_documents
      : user?.users_documents
        ? [user.users_documents]
        : [];
    const rawReferral =
      docs.find((d) => d.referral_source)?.referral_source ?? null;
    const slug = purchaseLeaderboardReferral(rawReferral);
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return buildReferralLeaderboard(counts);
}

/** Ranking por hojas de vida llenadas vía link de captación. */
export async function getReferralLinkLeaderboard(range?: {
  startIso: string;
  endExclusiveIso: string;
}): Promise<ReferralLeaderboardRow[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("users_documents")
    .select("referral_source")
    .not("referral_source", "is", null);
  if (range) {
    q = q
      .gte("created_at", range.startIso)
      .lt("created_at", range.endExclusiveIso);
  }

  const { data, error } = await q;

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const slug = row.referral_source as string | null;
    if (!slug || isHiddenReferral(slug)) continue;
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return buildReferralLeaderboard(counts);
}

/** Visitas asignadas/completadas + ranking de visitadores por completadas. */
export async function getEquipoVisitasDetalle(range?: {
  startIso: string;
  endExclusiveIso: string;
}): Promise<EquipoVisitasDetalle & { leaderboard: LeaderboardRow[] }> {
  const supabase = createAdminClient();
  const [{ data, error }, { data: visitadores, error: visitadoresError }] =
    await Promise.all([
      supabase
        .from("visitas")
        .select(
          `id, user_id, estado, cliente_nombre, cliente_celular, fecha_programada, fecha_completada, created_at, visitador_id,
           visitadores(id, nombre),
           users(id, user, users_documents(selfie_url, referral_source), digital_contracts(hoja_vida_data, created_at))`,
        )
        .in("estado", ["asignada", "completada"]),
      supabase
        .from("visitadores")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
    ]);

  if (error) throw new Error(error.message);
  if (visitadoresError) throw new Error(visitadoresError.message);

  const completedByVisitador = new Map<
    string,
    { label: string; count: number }
  >();
  for (const v of visitadores ?? []) {
    completedByVisitador.set(String(v.id), {
      label: String(v.nombre),
      count: 0,
    });
  }

  const asignadas: { item: EquipoVisitaDetalleItem; sortAt: number }[] = [];
  const completadas: { item: EquipoVisitaDetalleItem; sortAt: number }[] = [];

  type VisitaDetalleUser = {
    id: number;
    user: string;
    users_documents:
      | { selfie_url: string | null; referral_source: string | null }
      | { selfie_url: string | null; referral_source: string | null }[]
      | null;
    digital_contracts: InboxNestedUser["digital_contracts"];
  };

  const inRange = (iso: string | null | undefined) => {
    if (!range || !iso) return !range;
    return iso >= range.startIso && iso < range.endExclusiveIso;
  };

  for (const row of data ?? []) {
    const createdAt = row.created_at as string;
    const fechaCompletada = row.fecha_completada as string | null;
    // Completadas → fecha_completada; asignadas → created_at.
    const periodAt =
      row.estado === "completada" ? (fechaCompletada ?? createdAt) : createdAt;
    if (!inRange(periodAt)) continue;

    const usersRaw = row.users as unknown as
      | VisitaDetalleUser
      | VisitaDetalleUser[]
      | null;

    const user = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
    const docs = Array.isArray(user?.users_documents)
      ? user.users_documents
      : user?.users_documents
        ? [user.users_documents]
        : [];
    const slug = resolveReferralSource(
      docs.find((d) => d.referral_source)?.referral_source,
    );

    const client = inboxClientFromUser(
      user,
      row.user_id as number,
      row.cliente_nombre as string | null,
      row.cliente_celular as string | null,
    );
    const visitadorRaw = row.visitadores as
      | { id: number; nombre: string | null }
      | { id: number; nombre: string | null }[]
      | null;
    const visitador = Array.isArray(visitadorRaw)
      ? visitadorRaw[0]
      : visitadorRaw;
    const visitadorNombre = visitador?.nombre?.trim() || null;
    const visitadorKey =
      visitador?.id != null
        ? String(visitador.id)
        : row.visitador_id != null
          ? String(row.visitador_id)
          : null;

    if (row.estado === "completada" && visitadorKey) {
      const prev = completedByVisitador.get(visitadorKey);
      if (prev) {
        prev.count += 1;
      } else {
        completedByVisitador.set(visitadorKey, {
          label: visitadorNombre ?? `Visitador ${visitadorKey}`,
          count: 1,
        });
      }
    }

    const item: EquipoVisitaDetalleItem = {
      id: String(row.id),
      userId: row.user_id as number,
      displayName: client.displayName,
      selfieUrl: client.selfieUrl ?? null,
      referralLabel: referralLabel(slug) ?? slug,
      visitadorNombre,
    };

    if (row.estado === "completada") {
      completadas.push({
        item,
        sortAt: new Date(fechaCompletada ?? createdAt).getTime(),
      });
    } else {
      asignadas.push({
        item,
        sortAt: new Date(
          (row.fecha_programada as string | null) ?? createdAt,
        ).getTime(),
      });
    }
  }

  asignadas.sort((a, b) => a.sortAt - b.sortAt);
  completadas.sort((a, b) => b.sortAt - a.sortAt);

  return {
    leaderboard: rankLeaderboard(
      [...completedByVisitador.entries()].map(([slug, row]) => ({
        slug,
        label: row.label,
        count: row.count,
      })),
    ),
    asignadas: asignadas.map((x) => x.item),
    completadas: completadas.map((x) => x.item),
  };
}

export async function getAllBikes(): Promise<BikeRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("bike_table")
    .select(
      "id, modelo, color, imagen_url, stock, cuota_inicial, cuota_diaria, monto_visita, precio_venta, descripcion, activo",
    )
    .order("modelo")
    .order("color");
  return (data as BikeRow[]) ?? [];
}

export async function getAvailableBikes(): Promise<BikeRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("bike_table")
    .select(
      "id, modelo, color, imagen_url, stock, cuota_inicial, cuota_diaria, monto_visita, precio_venta, descripcion, activo",
    )
    .eq("activo", true)
    .gt("stock", 0)
    .order("modelo")
    .order("color");
  return (data as BikeRow[]) ?? [];
}

export async function getAllVendidasMotos(): Promise<VendidaMotoRow[]> {
  const supabase = createAdminClient();
  const clientScope = await getAdminClientReferralScope();
  // Opinilla no opera cartera post-entrega; Vendidas/En calle son de admin pleno.
  if (clientScope) return [];
  // ponytail: hint FK — user_moto_compra↔garaje_motos tiene 2 relaciones
  const [{ data, error }, { data: atrasos, error: atrasosError }] =
    await Promise.all([
      supabase
        .from("user_moto_compra")
        .select(
          "id, user_id, bike_id, modelo, color, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo, monto_total_primer_pago, estado, pago_inicial_confirmado, pago_cuota_confirmado, placa, chasis, referencia, fecha_entrega, estado_fisico, seleccionado_at, users(id, user, users_documents(selfie_url, referral_source)), bike_table(imagen_url), morosos(estado, dias_atraso, monto_adeudado), motos_para_recoger(estado, dias_atraso), garaje_motos!garaje_motos_user_moto_compra_id_fkey(id)",
        )
        .in("estado", ["entregada", "saldada"])
        .order("fecha_entrega", { ascending: false, nullsFirst: false })
        .order("seleccionado_at", { ascending: false }),
      supabase
        .from("atrasos")
        .select("user_moto_compra_id, dias_atraso, monto_adeudado, estado"),
    ]);

  if (error) throw new Error(error.message);
  if (atrasosError) throw new Error(atrasosError.message);

  const atrasoMap = new Map(
    ((atrasos ?? []) as Array<
      AtrasoSnapshot & { user_moto_compra_id: string }
    >).map((a) => [a.user_moto_compra_id, a]),
  );

  return ((data ?? []) as unknown as Array<
    Omit<VendidaMotoRow, "users" | "bike_table"> & {
      users?:
        | {
            id: number;
            user: string;
            users_documents?:
              | { selfie_url: string | null }
              | { selfie_url: string | null }[]
              | null;
          }
        | {
            id: number;
            user: string;
            users_documents?:
              | { selfie_url: string | null }
              | { selfie_url: string | null }[]
              | null;
          }[]
        | null;
      bike_table?:
        | { imagen_url: string | null }
        | { imagen_url: string | null }[]
        | null;
    }
  >).map((row) => {
    const usersRaw = row.users;
    const user = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
    const docRaw = user?.users_documents;
    const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
    const bikeRaw = row.bike_table;
    const bike = Array.isArray(bikeRaw) ? bikeRaw[0] : bikeRaw;
    const morososRaw = row.morosos as
      | { estado: MorosoEstado; dias_atraso: number; monto_adeudado?: number }
      | { estado: MorosoEstado; dias_atraso: number; monto_adeudado?: number }[]
      | null;
    const recogerRaw = row.motos_para_recoger as
      | { estado: MotoRecogerEstado; dias_atraso?: number }
      | { estado: MotoRecogerEstado; dias_atraso?: number }[]
      | null;
    const atrasoRaw = atrasoMap.get(row.id);

    return {
      ...row,
      users: user ? { id: user.id, user: user.user } : null,
      morosos: Array.isArray(morososRaw) ? morososRaw[0] : morososRaw,
      motos_para_recoger: Array.isArray(recogerRaw)
        ? recogerRaw[0]
        : recogerRaw,
      garaje_motos: row.garaje_motos ?? [],
      atraso: atrasoRaw
        ? {
            dias_atraso: atrasoRaw.dias_atraso,
            monto_adeudado: atrasoRaw.monto_adeudado,
            estado: atrasoRaw.estado as AtrasoSnapshot["estado"],
          }
        : null,
      selfieUrl: doc?.selfie_url ? String(doc.selfie_url) : null,
      motoImagenUrl: bike?.imagen_url ? String(bike.imagen_url) : null,
    } satisfies VendidaMotoRow;
  });
}

export async function getAllGarajeParqueaderos(): Promise<GarajeParqueaderoRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("garaje_parqueaderos")
    .select("id, nombre, slug, activo, orden, created_at, updated_at")
    .order("orden")
    .order("nombre");
  return (data as GarajeParqueaderoRow[]) ?? [];
}

export async function getAllGarajeMotos(): Promise<GarajeMotoRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("garaje_motos")
    .select(
      "id, parqueadero_id, placa, placa_foto_url, referencia, modelo, color, origen, condicion, estado, moto_para_recoger_id, user_moto_compra_id, cuota_inicial, cuota_diaria, monto_visita, notas, created_at, updated_at, garaje_parqueaderos(nombre), motos_para_recoger(fecha_recogida, user_id), user_moto_compra!garaje_motos_user_moto_compra_id_fkey(user_id)",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<
    Omit<GarajeMotoRow, "parqueadero_nombre" | "fecha_recogida" | "origen_user_id"> & {
      garaje_parqueaderos: { nombre: string } | { nombre: string }[] | null;
      motos_para_recoger:
        | { fecha_recogida: string | null; user_id: number }
        | { fecha_recogida: string | null; user_id: number }[]
        | null;
      user_moto_compra:
        | { user_id: number }
        | { user_id: number }[]
        | null;
    }
  >).map((row) => {
    const parq = row.garaje_parqueaderos;
    const parqueaderoNombre = Array.isArray(parq)
      ? (parq[0]?.nombre ?? null)
      : (parq?.nombre ?? null);
    const recoger = Array.isArray(row.motos_para_recoger)
      ? row.motos_para_recoger[0]
      : row.motos_para_recoger;
    const compra = Array.isArray(row.user_moto_compra)
      ? row.user_moto_compra[0]
      : row.user_moto_compra;
    return {
      id: row.id,
      parqueadero_id: row.parqueadero_id,
      parqueadero_nombre: parqueaderoNombre,
      placa: row.placa,
      placa_foto_url: row.placa_foto_url,
      referencia: row.referencia,
      modelo: row.modelo,
      color: row.color,
      origen: row.origen,
      condicion: row.condicion,
      estado: row.estado,
      moto_para_recoger_id: row.moto_para_recoger_id,
      user_moto_compra_id: row.user_moto_compra_id,
      cuota_inicial: row.cuota_inicial,
      cuota_diaria: row.cuota_diaria,
      monto_visita: row.monto_visita,
      notas: row.notas,
      created_at: row.created_at,
      updated_at: row.updated_at,
      fecha_recogida: recoger?.fecha_recogida ?? null,
      origen_user_id: compra?.user_id ?? recoger?.user_id ?? null,
    };
  });
}

export async function getGarajeMotosVendidas(): Promise<GarajeMotoVendidaRow[]> {
  const supabase = createAdminClient();
  const { data: motos, error } = await supabase
    .from("garaje_motos")
    .select("id, placa, referencia, modelo, color, condicion, updated_at")
    .eq("estado", "vendida")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!motos?.length) return [];

  const ids = motos.map((m) => m.id as string);
  const placas = [
    ...new Set(
      motos
        .map((m) => (m.placa as string | null)?.trim().toUpperCase())
        .filter((p): p is string => Boolean(p)),
    ),
  ];

  const { data: compras, error: comprasError } = await supabase
    .from("user_moto_compra")
    .select(
      "garaje_moto_id, placa, fecha_entrega, seleccionado_at, updated_at, users(users_documents(selfie_url))",
    )
    .or(
      `garaje_moto_id.in.(${ids.join(",")})${placas.length ? `,placa.in.(${placas.join(",")})` : ""}`,
    );

  if (comprasError) throw new Error(comprasError.message);

  type CompraJoin = {
    garaje_moto_id: string | null;
    placa: string | null;
    fecha_entrega: string | null;
    seleccionado_at: string | null;
    updated_at: string | null;
    users:
      | { users_documents: { selfie_url: string | null } | { selfie_url: string | null }[] | null }
      | { users_documents: { selfie_url: string | null } | { selfie_url: string | null }[] | null }[]
      | null;
  };

  const byGaraje = new Map<string, CompraJoin>();
  const byPlaca = new Map<string, CompraJoin>();
  for (const row of (compras ?? []) as unknown as CompraJoin[]) {
    if (row.garaje_moto_id && !byGaraje.has(row.garaje_moto_id)) {
      byGaraje.set(row.garaje_moto_id, row);
    }
    const p = row.placa?.trim().toUpperCase();
    if (p && !byPlaca.has(p)) byPlaca.set(p, row);
  }

  function selfieOf(compra: CompraJoin | undefined): string | null {
    if (!compra) return null;
    const users = Array.isArray(compra.users) ? compra.users[0] : compra.users;
    const docs = users?.users_documents;
    const doc = Array.isArray(docs) ? docs[0] : docs;
    return doc?.selfie_url ? String(doc.selfie_url) : null;
  }

  return motos.map((m) => {
    const placaKey = (m.placa as string | null)?.trim().toUpperCase() ?? "";
    const compra =
      byGaraje.get(m.id as string) ?? (placaKey ? byPlaca.get(placaKey) : undefined);
    return {
      id: m.id as string,
      placa: (m.placa as string | null) ?? null,
      referencia: String(m.referencia ?? ""),
      modelo: String(m.modelo ?? ""),
      color: String(m.color ?? ""),
      condicion: m.condicion as GarajeMotoVendidaRow["condicion"],
      // ponytail: fecha_entrega often null on legacy rows → fall back
      fechaVenta:
        compra?.fecha_entrega ??
        compra?.seleccionado_at ??
        compra?.updated_at ??
        (m.updated_at as string | null) ??
        null,
      selfieUrl: selfieOf(compra),
    } satisfies GarajeMotoVendidaRow;
  });
}

export async function getGarajeMotosDisponiblesCredito(): Promise<
  GarajeMotoRow[]
> {
  const all = await getAllGarajeMotos();
  const supabase = createAdminClient();
  const { data: activas } = await supabase
    .from("user_moto_compra")
    .select("garaje_moto_id")
    .not("garaje_moto_id", "is", null)
    .not("estado", "in", "(cancelada,saldada)");

  const ocupadas = new Set(
    (activas ?? [])
      .map((r) => r.garaje_moto_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );

  return all.filter(
    (m) =>
      m.estado === "disponible" &&
      m.cuota_inicial != null &&
      m.cuota_diaria != null &&
      !ocupadas.has(m.id),
  );
}

type GarajeMantenimientoItemQueryRow = GarajeMantenimientoItemRow & {
  inventario_productos:
    | { nombre: string; sku: string | null }
    | { nombre: string; sku: string | null }[]
    | null;
};

function mapGarajeMantenimientoItem(
  row: GarajeMantenimientoItemQueryRow,
): GarajeMantenimientoItemRow {
  const prod = Array.isArray(row.inventario_productos)
    ? row.inventario_productos[0]
    : row.inventario_productos;
  return {
    id: row.id,
    garaje_moto_id: row.garaje_moto_id,
    producto_id: row.producto_id,
    cantidad: row.cantidad,
    costo_unitario: row.costo_unitario,
    notas: row.notas,
    created_at: row.created_at,
    created_by: row.created_by,
    producto_nombre: prod?.nombre ?? null,
    producto_sku: prod?.sku ?? null,
  };
}

export async function getGarajeMantenimientoItems(
  garajeMotoId: string,
): Promise<GarajeMantenimientoItemRow[]> {
  const byMoto = await getGarajeMantenimientoItemsByMotoIds([garajeMotoId]);
  return byMoto[garajeMotoId] ?? [];
}

export async function getGarajeMantenimientoItemsByMotoIds(
  garajeMotoIds: string[],
): Promise<Record<string, GarajeMantenimientoItemRow[]>> {
  if (garajeMotoIds.length === 0) return {};

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("garaje_mantenimiento_items")
    .select(
      "id, garaje_moto_id, producto_id, cantidad, costo_unitario, notas, created_at, created_by, inventario_productos(nombre, sku)",
    )
    .in("garaje_moto_id", garajeMotoIds)
    .order("created_at", { ascending: false });

  const byMoto: Record<string, GarajeMantenimientoItemRow[]> = {};
  for (const id of garajeMotoIds) byMoto[id] = [];

  for (const row of (data ?? []) as unknown as GarajeMantenimientoItemQueryRow[]) {
    const mapped = mapGarajeMantenimientoItem(row);
    (byMoto[mapped.garaje_moto_id] ??= []).push(mapped);
  }

  return byMoto;
}

export async function getFirstPendingUserId(
  queueId: InboxQueueId,
): Promise<number | null> {
  const items = await getInboxListItems(queueId);
  return items[0]?.userId ?? null;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function setMatchLabel(
  map: Map<number, string>,
  userId: number,
  label: string,
  priority: number,
  priorities: Map<number, number>,
) {
  const current = priorities.get(userId);
  if (current === undefined || priority < current) {
    map.set(userId, label);
    priorities.set(userId, priority);
  }
}

export async function searchClients(
  query: string,
): Promise<ClientSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = createAdminClient();
  const clientScope = await getAdminClientReferralScope();
  const pattern = `%${escapeIlike(q)}%`;
  const matchLabels = new Map<number, string>();
  const matchPriorities = new Map<number, number>();

  const [
    { data: byPlaca },
    { data: byCedulaHoja },
    { data: byCedulaContrato },
    { data: byVisitaNombre },
    { data: byUser },
    { data: byNombreCompleto },
  ] = await Promise.all([
    supabase.from("user_moto_compra").select("user_id").ilike("placa", pattern),
    supabase
      .from("digital_contracts")
      .select("user_id")
      .filter("hoja_vida_data->>numero_identificacion", "ilike", pattern),
    supabase
      .from("digital_contracts")
      .select("user_id")
      .filter("contrato_data->>cedula_contratante", "ilike", pattern),
    supabase.from("visitas").select("user_id").ilike("cliente_nombre", pattern),
    supabase.from("users").select("id").ilike("user", pattern),
    supabase
      .from("digital_contracts")
      .select("user_id")
      .filter("hoja_vida_data->>nombre_completo", "ilike", pattern),
  ]);

  for (const row of byPlaca ?? []) {
    setMatchLabel(matchLabels, row.user_id as number, "Placa", 0, matchPriorities);
  }
  for (const row of [...(byCedulaHoja ?? []), ...(byCedulaContrato ?? [])]) {
    setMatchLabel(matchLabels, row.user_id as number, "Cédula", 1, matchPriorities);
  }
  for (const row of [...(byVisitaNombre ?? []), ...(byNombreCompleto ?? [])]) {
    setMatchLabel(matchLabels, row.user_id as number, "Nombre", 2, matchPriorities);
  }
  for (const row of byUser ?? []) {
    setMatchLabel(matchLabels, row.id as number, "Usuario", 3, matchPriorities);
  }

  const userIds = [...matchLabels.keys()];
  if (userIds.length === 0) return [];

  const [{ data: users }, { data: paidTarifas }, { data: atrasos }] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "id, user, users_documents(selfie_url, referral_source), user_moto_compra(id, modelo, color, placa, estado, bike_table(imagen_url)), visitas(cliente_nombre), digital_contracts(hoja_vida_data, contrato_data, created_at)",
        )
        .in("id", userIds),
      supabase
        .from("tarifas_pagadas")
        .select("user_id")
        .in("user_id", userIds)
        .eq("estado", "pagada"),
      supabase
        .from("atrasos")
        .select("user_id, dias_atraso")
        .in("user_id", userIds),
    ]);

  const paidCount = new Map<number, number>();
  for (const row of paidTarifas ?? []) {
    const id = row.user_id as number;
    paidCount.set(id, (paidCount.get(id) ?? 0) + 1);
  }

  const diasByUser = new Map<number, number>();
  for (const row of atrasos ?? []) {
    diasByUser.set(row.user_id as number, Number(row.dias_atraso) || 0);
  }

  const results: ClientSearchResult[] = (users ?? []).flatMap((raw) => {
    const user = raw as {
      id: number;
      user: string;
      users_documents:
        | { selfie_url: string | null; referral_source: string | null }
        | { selfie_url: string | null; referral_source: string | null }[]
        | null;
      user_moto_compra:
        | {
            id: string;
            modelo: string;
            color: string;
            placa: string | null;
            estado: ClientSearchResult["compraEstado"];
            bike_table: { imagen_url: string | null } | { imagen_url: string | null }[] | null;
          }
        | {
            id: string;
            modelo: string;
            color: string;
            placa: string | null;
            estado: ClientSearchResult["compraEstado"];
            bike_table: { imagen_url: string | null } | { imagen_url: string | null }[] | null;
          }[]
        | null;
      visitas: { cliente_nombre: string | null } | { cliente_nombre: string | null }[] | null;
      digital_contracts:
        | {
            hoja_vida_data: Record<string, unknown>;
            contrato_data: Record<string, unknown>;
            created_at: string;
          }
        | {
            hoja_vida_data: Record<string, unknown>;
            contrato_data: Record<string, unknown>;
            created_at: string;
          }[]
        | null;
    };

    const compraRaw = user.user_moto_compra;
    const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;
    const bikeRaw = compra?.bike_table;
    const bike = Array.isArray(bikeRaw) ? bikeRaw[0] : bikeRaw;

    const docRaw = user.users_documents;
    const docs = Array.isArray(docRaw) ? docRaw : docRaw ? [docRaw] : [];
    const doc = docs[0] ?? null;
    const rawReferral =
      docs.find((d) => d.referral_source)?.referral_source ?? null;
    if (!referralMatchesAdminScope(rawReferral, clientScope)) return [];

    const visitaRaw = user.visitas;
    const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;

    const contractsRaw = user.digital_contracts;
    const contracts = Array.isArray(contractsRaw)
      ? contractsRaw
      : contractsRaw
        ? [contractsRaw]
        : [];
    const latestContract = contracts.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const hoja = latestContract?.hoja_vida_data ?? null;
    const contrato = latestContract?.contrato_data ?? null;
    const cedulaFromHoja = hoja?.numero_identificacion as string | undefined;
    const cedulaFromContrato = contrato?.cedula_contratante as string | undefined;
    const cedula =
      cedulaFromHoja?.trim() ||
      cedulaFromContrato?.trim() ||
      null;

    const nombreFromHoja = hoja?.nombre_completo as string | undefined;
    const displayName =
      nombreFromHoja?.trim() ||
      visita?.cliente_nombre?.trim() ||
      user.user;

    return [
      {
        userId: user.id,
        username: user.user,
        displayName,
        cedula,
        placa: compra?.placa ?? null,
        motoLabel: compra ? `${compra.modelo} · ${compra.color}` : null,
        compraEstado: compra?.estado ?? null,
        cuotasPagadas: paidCount.get(user.id) ?? 0,
        diasAtraso: diasByUser.get(user.id) ?? 0,
        matchLabel: matchLabels.get(user.id) ?? "—",
        seleccionadoAt: null,
        selfieUrl: doc?.selfie_url ? String(doc.selfie_url) : null,
        motoImagenUrl: bike?.imagen_url ? String(bike.imagen_url) : null,
        referralLabel:
          referralLabel(resolveReferralSource(rawReferral)) ?? "Punto de venta",
      },
    ];
  });

  return results.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es"),
  );
}

export async function listClientesMotoCredito(
  limit = 200,
  options?: { onlyGuillen?: boolean },
): Promise<ClientSearchResult[]> {
  const supabase = createAdminClient();
  const clientScope = await getAdminClientReferralScope();
  const onlyGuillen = options?.onlyGuillen === true;
  if (
    onlyGuillen &&
    clientScope &&
    !referralAllowedForScopedAdmin("guillen", clientScope)
  ) {
    return [];
  }
  const { data: compras, error } = await supabase
    .from("user_moto_compra")
    .select(
      "id, modelo, color, placa, estado, seleccionado_at, user_id, bike_table(imagen_url), users(id, user, users_documents(selfie_url, referral_source), visitas(cliente_nombre), digital_contracts(hoja_vida_data, contrato_data, created_at))",
    )
    .neq("estado", "cancelada")
    .order("seleccionado_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!compras?.length) return [];

  const userIds = compras.map((row) => row.user_id as number);
  const compraIds = compras.map((row) => row.id as string);

  const [{ data: paidTarifas }, { data: atrasos }] = await Promise.all([
    supabase
      .from("tarifas_pagadas")
      .select("user_id")
      .in("user_id", userIds)
      .eq("estado", "pagada"),
    supabase
      .from("atrasos")
      .select("user_moto_compra_id, dias_atraso")
      .in("user_moto_compra_id", compraIds),
  ]);

  const paidCount = new Map<number, number>();
  for (const row of paidTarifas ?? []) {
    const id = row.user_id as number;
    paidCount.set(id, (paidCount.get(id) ?? 0) + 1);
  }

  const diasByCompra = new Map<string, number>();
  for (const row of atrasos ?? []) {
    diasByCompra.set(
      row.user_moto_compra_id as string,
      Number(row.dias_atraso) || 0,
    );
  }

  const results = compras.flatMap((raw) => {
    const compra = raw as unknown as {
      id: string;
      modelo: string;
      color: string;
      placa: string | null;
      estado: ClientSearchResult["compraEstado"];
      seleccionado_at: string;
      user_id: number;
      bike_table:
        | { imagen_url: string | null }
        | { imagen_url: string | null }[]
        | null;
      users:
        | {
            id: number;
            user: string;
            users_documents:
              | { selfie_url: string | null; referral_source: string | null }
              | { selfie_url: string | null; referral_source: string | null }[]
              | null;
            visitas:
              | { cliente_nombre: string | null }
              | { cliente_nombre: string | null }[]
              | null;
            digital_contracts:
              | {
                  hoja_vida_data: Record<string, unknown>;
                  contrato_data: Record<string, unknown>;
                  created_at: string;
                }
              | {
                  hoja_vida_data: Record<string, unknown>;
                  contrato_data: Record<string, unknown>;
                  created_at: string;
                }[]
              | null;
          }
        | {
            id: number;
            user: string;
            users_documents:
              | { selfie_url: string | null; referral_source: string | null }
              | { selfie_url: string | null; referral_source: string | null }[]
              | null;
            visitas:
              | { cliente_nombre: string | null }
              | { cliente_nombre: string | null }[]
              | null;
            digital_contracts:
              | {
                  hoja_vida_data: Record<string, unknown>;
                  contrato_data: Record<string, unknown>;
                  created_at: string;
                }
              | {
                  hoja_vida_data: Record<string, unknown>;
                  contrato_data: Record<string, unknown>;
                  created_at: string;
                }[]
              | null;
          }[]
        | null;
    };

    const usersRaw = compra.users;
    const user = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
    if (!user) {
      return [
        {
          userId: compra.user_id,
          username: String(compra.user_id),
          displayName: String(compra.user_id),
          cedula: null,
          placa: compra.placa,
          motoLabel: `${compra.modelo} · ${compra.color}`,
          compraEstado: compra.estado,
          cuotasPagadas: paidCount.get(compra.user_id) ?? 0,
          diasAtraso: diasByCompra.get(compra.id) ?? 0,
          matchLabel: "",
          seleccionadoAt: compra.seleccionado_at,
          selfieUrl: null,
          motoImagenUrl: null,
          referralLabel: "Punto de venta",
        },
      ];
    }

    const visitaRaw = user.visitas;
    const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;
    const docRaw = user.users_documents;
    const docs = Array.isArray(docRaw) ? docRaw : docRaw ? [docRaw] : [];
    const doc = docs[0] ?? null;
    const rawReferral =
      docs.find((d) => d.referral_source)?.referral_source ?? null;
    const isGuillen = isHiddenReferral(rawReferral);
    if (onlyGuillen) {
      if (!isGuillen) return [];
      if (!referralAllowedForScopedAdmin("guillen", clientScope)) return [];
    } else {
      if (isGuillen) return [];
      if (!referralMatchesAdminScope(rawReferral, clientScope)) return [];
    }    const bikeRaw = compra.bike_table;
    const bike = Array.isArray(bikeRaw) ? bikeRaw[0] : bikeRaw;

    const contractsRaw = user.digital_contracts;
    const contracts = Array.isArray(contractsRaw)
      ? contractsRaw
      : contractsRaw
        ? [contractsRaw]
        : [];
    const latestContract = contracts.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const hoja = latestContract?.hoja_vida_data ?? null;
    const contrato = latestContract?.contrato_data ?? null;
    const cedula =
      (hoja?.numero_identificacion as string | undefined)?.trim() ||
      (contrato?.cedula_contratante as string | undefined)?.trim() ||
      null;

    const nombreFromHoja = hoja?.nombre_completo as string | undefined;
    const displayName =
      nombreFromHoja?.trim() ||
      visita?.cliente_nombre?.trim() ||
      user.user;

    return [
      {
        userId: user.id,
        username: user.user,
        displayName,
        cedula,
        placa: compra.placa,
        motoLabel: `${compra.modelo} · ${compra.color}`,
        compraEstado: compra.estado,
        cuotasPagadas: paidCount.get(user.id) ?? 0,
        diasAtraso: diasByCompra.get(compra.id) ?? 0,
        matchLabel: "",
        seleccionadoAt: compra.seleccionado_at,
        selfieUrl: doc?.selfie_url ? String(doc.selfie_url) : null,
        motoImagenUrl: bike?.imagen_url ? String(bike.imagen_url) : null,
        referralLabel:
          referralLabel(resolveReferralSource(rawReferral)) ?? "Punto de venta",
      },
    ];
  });

  return results.sort((a, b) => {
    if (b.diasAtraso !== a.diasAtraso) return b.diasAtraso - a.diasAtraso;
    const aAt = a.seleccionadoAt ? new Date(a.seleccionadoAt).getTime() : 0;
    const bAt = b.seleccionadoAt ? new Date(b.seleccionadoAt).getTime() : 0;
    return bAt - aAt;
  });
}

export async function getClienteFacturacion(
  userId: number,
): Promise<ClienteFacturacion | null> {
  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "id, user, visitas(cliente_nombre), digital_contracts(hoja_vida_data, contrato_data, created_at), user_moto_compra(id, modelo, color, cuota_inicial_monto, monto_cuota_periodo, monto_visita_monto, monto_total_primer_pago, admin_data)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw new Error(userError.message);
  if (!user) return null;

  const compraRaw = user.user_moto_compra;
  const compra = Array.isArray(compraRaw) ? compraRaw[0] : compraRaw;

  const contracts = user.digital_contracts ?? [];
  const latestContract = [...contracts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  const hoja = latestContract?.hoja_vida_data ?? null;
  const contrato = latestContract?.contrato_data ?? null;
  const visitaRaw = user.visitas;
  const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;

  const cedula =
    (hoja?.numero_identificacion as string | undefined)?.trim() ||
    (contrato?.cedula_contratante as string | undefined)?.trim() ||
    "";

  const clienteNombre =
    (hoja?.nombre_completo as string | undefined)?.trim() ||
    visita?.cliente_nombre?.trim() ||
    user.user;

  return {
    userId: user.id as number,
    clienteNombre,
    clienteCedula: cedula,
    compraId: (compra?.id as string | undefined) ?? null,
    motoModelo: (compra?.modelo as string | undefined) ?? null,
    motoColor: (compra?.color as string | undefined) ?? null,
    cuotaInicial: (compra?.cuota_inicial_monto as number | undefined) ?? null,
    cuotaAdelantada: cobraCuotaAdelantada(
      compra as { admin_data?: { cobra_cuota_adelantada?: boolean } } | null,
    )
      ? ((compra?.monto_cuota_periodo as number | undefined) ?? null)
      : 0,
    montoVisita: (compra?.monto_visita_monto as number | undefined) ?? null,
    totalPrimerPago: (compra?.monto_total_primer_pago as number | undefined) ?? null,
  };
}

export async function getAllTarjetasPropiedad(): Promise<TarjetaPropiedadRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tarjetas_propiedad")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as TarjetaPropiedadRow[];
}

/** Consulta pública por placa: solo fotos + placa (sin OCR / datos personales). */
export async function getTarjetaPropiedadByPlaca(
  placa: string,
): Promise<Pick<
  TarjetaPropiedadRow,
  "id" | "placa" | "imagen_url" | "imagen_reverso_url"
> | null> {
  const normalized = placa.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized.length < 5) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tarjetas_propiedad")
    .select("id, placa, imagen_url, imagen_reverso_url")
    .eq("placa", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
