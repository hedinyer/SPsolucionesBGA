"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildCajaInforme,
  type CajaEgresoRow,
  type CajaInformeIngresos,
  type CajaVisitasResumen,
} from "@/lib/caja/caja-informe";
import { MEDIO_PAGO_ADMIN_LABELS } from "@/lib/pipeline/types";
import type { MedioPagoAdmin, MedioPagoAdminStored } from "@/lib/pipeline/types";
import { faltanteConcepto } from "@/lib/payments/primer-pago-progress";
import type { PagoRow, UserMotoCompraRow } from "@/lib/pipeline/types";
import {
  CAJA_MEDIO_EGRESO_VALUES,
} from "@/lib/caja/caja-medios";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const CAJA_SESION_SELECT =
  "id, fecha, monto_apertura, monto_cierre, notas_apertura, notas_cierre, opened_at, closed_at, opened_by, closed_by, informe_cierre";

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

function dayStartBogota(fecha: string): string {
  return new Date(`${fecha}T00:00:00-05:00`).toISOString();
}

function pagosDesde(openedAt: string, fecha: string): string {
  const inicioDia = dayStartBogota(fecha);
  return openedAt > inicioDia ? openedAt : inicioDia;
}

export interface CajaMovimientoRow {
  id: string;
  tipo: "entrada" | "salida";
  monto: number;
  concepto: string;
  createdAt: string;
}

export interface CajaResumen {
  ventasProducto: number;
  ventasMoto: number;
  entradas: number;
  salidas: number;
  cantidadVentasProducto: number;
  cantidadVentasMoto: number;
}

export interface CajaSesionState {
  id: string;
  fecha: string;
  montoApertura: number;
  montoCierre: number | null;
  notasApertura: string | null;
  notasCierre: string | null;
  openedAt: string;
  closedAt: string | null;
  abierta: boolean;
  resumen: CajaResumen;
  movimientos: CajaMovimientoRow[];
  egresos: CajaEgresoRow[];
  informe: CajaInformeIngresos;
  visitasResumen: CajaVisitasResumen;
  efectivoEsperado: number;
  diferencia: number | null;
}

function medioLabel(medio: string | null): string {
  if (!medio) return "Efectivo";
  if (medio in MEDIO_PAGO_ADMIN_LABELS) {
    return MEDIO_PAGO_ADMIN_LABELS[medio as MedioPagoAdminStored];
  }
  return medio;
}

function resolveClienteNombre(raw: {
  users?:
    | {
        user: string;
        visitas?:
          | { cliente_nombre: string | null; estado?: string | null }
          | { cliente_nombre: string | null; estado?: string | null }[]
          | null;
      }
    | {
        user: string;
        visitas?:
          | { cliente_nombre: string | null; estado?: string | null }
          | { cliente_nombre: string | null; estado?: string | null }[]
          | null;
      }[]
    | null;
  visitas?:
    | { cliente_nombre: string | null; estado?: string | null }
    | { cliente_nombre: string | null; estado?: string | null }[]
    | null;
}): string {
  const userRaw = raw.users;
  const user = Array.isArray(userRaw) ? userRaw[0] : userRaw;
  const visitaRaw = user?.visitas ?? raw.visitas;
  const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;
  return visita?.cliente_nombre?.trim() || user?.user || "Cliente";
}

function resolveVisitaEstado(raw: {
  users?:
    | {
        visitas?:
          | { estado?: string | null }
          | { estado?: string | null }[]
          | null;
      }
    | {
        visitas?:
          | { estado?: string | null }
          | { estado?: string | null }[]
          | null;
      }[]
    | null;
  visitas?:
    | { estado?: string | null }
    | { estado?: string | null }[]
    | null;
}): string | null {
  const userRaw = raw.users;
  const user = Array.isArray(userRaw) ? userRaw[0] : userRaw;
  const visitaRaw = user?.visitas ?? raw.visitas;
  const visita = Array.isArray(visitaRaw) ? visitaRaw[0] : visitaRaw;
  return visita?.estado ?? null;
}

async function fetchVisitasForCaja(
  pagosInicio: string,
  until: string,
): Promise<CajaVisitasResumen> {
  const supabase = createAdminClient();

  const [cobradasRes, comprasRes, abonosRes] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, user_id, monto, medio_pago_admin, confirmado_at, users(user, visitas(cliente_nombre))",
      )
      .eq("estado", "confirmado")
      .eq("contexto_pago", "visita")
      .gte("confirmado_at", pagosInicio)
      .lte("confirmado_at", until)
      .not("confirmado_at", "is", null)
      .order("confirmado_at", { ascending: false }),
    supabase
      .from("user_moto_compra")
      .select(
        "id, user_id, monto_visita_monto, users(user, visitas(cliente_nombre, estado))",
      )
      .gt("monto_visita_monto", 0)
      .eq("pago_visita_confirmado", false)
      .neq("estado", "cancelada")
      .order("seleccionado_at", { ascending: false }),
    supabase
      .from("pagos")
      .select("user_moto_compra_id, monto")
      .eq("estado", "confirmado")
      .eq("contexto_pago", "visita")
      .not("user_moto_compra_id", "is", null),
  ]);

  if (cobradasRes.error) throw new Error(cobradasRes.error.message);
  if (comprasRes.error) throw new Error(comprasRes.error.message);
  if (abonosRes.error) throw new Error(abonosRes.error.message);

  const recibidoPorCompra = new Map<string, number>();
  for (const row of abonosRes.data ?? []) {
    const compraId = String(row.user_moto_compra_id);
    recibidoPorCompra.set(
      compraId,
      (recibidoPorCompra.get(compraId) ?? 0) + Number(row.monto),
    );
  }

  const cobradas = (cobradasRes.data ?? []).map((row) => ({
    pagoId: String(row.id),
    userId: Number(row.user_id),
    clienteNombre: resolveClienteNombre(row),
    monto: Number(row.monto),
    medioLabel: medioLabel(
      row.medio_pago_admin ? String(row.medio_pago_admin) : null,
    ),
    confirmadoAt: String(row.confirmado_at),
  }));

  const pendientes = (comprasRes.data ?? [])
    .filter((row) => resolveVisitaEstado(row) === "completada")
    .map((row) => {
      const compraId = String(row.id);
      const montoEsperado = Number(row.monto_visita_monto);
      const montoRecibido = recibidoPorCompra.get(compraId) ?? 0;
      const faltante = Math.max(0, montoEsperado - montoRecibido);
      return {
        userId: Number(row.user_id),
        compraId,
        clienteNombre: resolveClienteNombre(row),
        montoEsperado,
        montoRecibido,
        faltante,
      };
    })
    .filter((row) => row.faltante > 0);

  return {
    cobradas,
    pendientes,
    totalCobradoSesion: cobradas.reduce((s, row) => s + row.monto, 0),
    totalPendiente: pendientes.reduce((s, row) => s + row.faltante, 0),
  };
}

async function fetchSesionData(
  openedAt: string,
  closedAt: string | null,
  sesionId: string,
  montoApertura: number,
  fecha: string,
): Promise<{
  resumen: CajaResumen;
  movimientos: CajaMovimientoRow[];
  egresos: CajaEgresoRow[];
  informe: CajaInformeIngresos;
  visitasResumen: CajaVisitasResumen;
}> {
  const supabase = createAdminClient();
  const until = closedAt ?? new Date().toISOString();
  const inicioPagos = pagosDesde(openedAt, fecha);

  const [vpRes, vmRes, movRes, pagosRes, egresosRes, visitasResumen] =
    await Promise.all([
    supabase
      .from("ventas_producto")
      .select("monto_pagado")
      .gte("created_at", openedAt)
      .lte("created_at", until),
    supabase
      .from("ventas_moto")
      .select("monto_pagado")
      .gte("created_at", openedAt)
      .lte("created_at", until),
    supabase
      .from("caja_movimientos")
      .select("id, tipo, monto, concepto, created_at")
      .eq("sesion_id", sesionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("pagos")
      .select(
        "id, user_id, monto, medio_pago_admin, contexto_pago, confirmado_at, users(user, visitas(cliente_nombre))",
      )
      .eq("estado", "confirmado")
      .gte("confirmado_at", inicioPagos)
      .lte("confirmado_at", until)
      .not("confirmado_at", "is", null),
    supabase
      .from("caja_egresos")
      .select("id, concepto, beneficiario, monto, medio_pago, notas, created_at")
      .eq("sesion_id", sesionId)
      .order("created_at", { ascending: true }),
    fetchVisitasForCaja(inicioPagos, until),
  ]);

  if (vpRes.error) throw new Error(vpRes.error.message);
  if (vmRes.error) throw new Error(vmRes.error.message);
  if (movRes.error) throw new Error(movRes.error.message);
  if (pagosRes.error) throw new Error(pagosRes.error.message);
  if (egresosRes.error) throw new Error(egresosRes.error.message);

  const ventasProducto = (vpRes.data ?? []).reduce(
    (sum, v) => sum + Number(v.monto_pagado ?? 0),
    0,
  );
  const ventasMoto = (vmRes.data ?? []).reduce(
    (sum, v) => sum + Number(v.monto_pagado ?? 0),
    0,
  );

  const movimientos: CajaMovimientoRow[] = (movRes.data ?? []).map((m) => ({
    id: String(m.id),
    tipo: m.tipo as "entrada" | "salida",
    monto: Number(m.monto),
    concepto: String(m.concepto),
    createdAt: String(m.created_at),
  }));

  const entradas = movimientos
    .filter((m) => m.tipo === "entrada")
    .reduce((sum, m) => sum + m.monto, 0);
  const salidas = movimientos
    .filter((m) => m.tipo === "salida")
    .reduce((sum, m) => sum + m.monto, 0);

  const informe = buildCajaInforme({
    montoApertura,
    ventasProducto,
    ventasMoto,
    entradas,
    salidas,
    pagosRaw: (pagosRes.data ?? []).map((p) => ({
      id: String(p.id),
      user_id: Number(p.user_id),
      cliente_nombre: resolveClienteNombre(p),
      monto: Number(p.monto),
      medio_pago_admin: p.medio_pago_admin ? String(p.medio_pago_admin) : null,
      contexto_pago: p.contexto_pago ? String(p.contexto_pago) : null,
      confirmado_at: String(p.confirmado_at),
    })),
    egresosRaw: (egresosRes.data ?? []).map((e) => ({
      id: String(e.id),
      concepto: String(e.concepto),
      beneficiario: e.beneficiario ? String(e.beneficiario) : null,
      monto: Number(e.monto),
      medio_pago: String(e.medio_pago),
      notas: e.notas ? String(e.notas) : null,
      created_at: String(e.created_at),
    })),
  });

  return {
    resumen: {
      ventasProducto,
      ventasMoto,
      entradas,
      salidas,
      cantidadVentasProducto: vpRes.data?.length ?? 0,
      cantidadVentasMoto: vmRes.data?.length ?? 0,
    },
    movimientos,
    egresos: informe.egresosDetalle,
    informe,
    visitasResumen,
  };
}

function toSesionState(
  raw: Record<string, unknown>,
  resumen: CajaResumen,
  movimientos: CajaMovimientoRow[],
  egresos: CajaEgresoRow[],
  informe: CajaInformeIngresos,
  visitasResumen: CajaVisitasResumen,
): CajaSesionState {
  const montoApertura = Number(raw.monto_apertura);
  const montoCierre =
    raw.monto_cierre != null ? Number(raw.monto_cierre) : null;
  const closedAt = raw.closed_at ? String(raw.closed_at) : null;
  const efectivoEsperado = informe.efectivo.esperadoEnCaja;

  return {
    id: String(raw.id),
    fecha: String(raw.fecha),
    montoApertura,
    montoCierre,
    notasApertura: raw.notas_apertura ? String(raw.notas_apertura) : null,
    notasCierre: raw.notas_cierre ? String(raw.notas_cierre) : null,
    openedAt: String(raw.opened_at),
    closedAt,
    abierta: closedAt == null,
    resumen,
    movimientos,
    egresos,
    informe,
    visitasResumen,
    efectivoEsperado,
    diferencia: montoCierre != null ? montoCierre - efectivoEsperado : null,
  };
}

export async function getCajaSesionHoy(): Promise<CajaSesionState | null> {
  await requireAdminSession();
  const supabase = createAdminClient();
  const fecha = todayBogota();

  const { data, error } = await supabase
    .from("caja_sesiones")
    .select(CAJA_SESION_SELECT)
    .eq("fecha", fecha)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  const storedInforme = raw.informe_cierre as CajaInformeIngresos | null;

  const { resumen, movimientos, egresos, informe, visitasResumen } =
    await fetchSesionData(
      String(raw.opened_at),
      raw.closed_at ? String(raw.closed_at) : null,
      String(raw.id),
      Number(raw.monto_apertura),
      String(raw.fecha),
    );

  const informeFinal =
    raw.closed_at && storedInforme
      ? {
          ...storedInforme,
          visitas:
            storedInforme.visitas ??
            informe.visitas,
        }
      : informe;

  return toSesionState(
    raw,
    resumen,
    movimientos,
    egresos,
    informeFinal,
    visitasResumen,
  );
}

const aperturaSchema = z.object({
  montoApertura: z.number().int().positive("El efectivo inicial debe ser mayor a 0."),
  notas: z.string().trim().optional(),
});

export async function abrirCaja(input: z.infer<typeof aperturaSchema>) {
  const session = await requireAdminSession();
  const parsed = aperturaSchema.parse(input);
  const supabase = createAdminClient();
  const fecha = todayBogota();

  const { data: existing } = await supabase
    .from("caja_sesiones")
    .select("id, closed_at")
    .eq("fecha", fecha)
    .maybeSingle();

  if (existing && !existing.closed_at) {
    throw new Error("La caja de hoy ya está abierta.");
  }
  if (existing?.closed_at) {
    throw new Error("La caja de hoy ya fue cerrada.");
  }

  const { data, error } = await supabase
    .from("caja_sesiones")
    .insert({
      fecha,
      monto_apertura: parsed.montoApertura,
      notas_apertura: parsed.notas || null,
      opened_by: session.userId ?? null,
    })
    .select(CAJA_SESION_SELECT)
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo abrir la caja.");

  revalidatePath("/caja");
  return getCajaSesionHoy();
}

const cierreSchema = z.object({
  sesionId: z.string().uuid(),
  montoCierre: z.number().int().nonnegative(),
  notas: z.string().trim().optional(),
});

export async function cerrarCaja(input: z.infer<typeof cierreSchema>) {
  const session = await requireAdminSession();
  const parsed = cierreSchema.parse(input);
  const supabase = createAdminClient();

  const { data: sesion, error: fetchError } = await supabase
    .from("caja_sesiones")
    .select(CAJA_SESION_SELECT)
    .eq("id", parsed.sesionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!sesion) throw new Error("Sesión de caja no encontrada.");
  if (sesion.closed_at) throw new Error("La caja ya está cerrada.");

  const raw = sesion as Record<string, unknown>;
  const { informe } = await fetchSesionData(
    String(raw.opened_at),
    null,
    parsed.sesionId,
    Number(raw.monto_apertura),
    String(raw.fecha),
  );

  const efectivoEsperado = informe.efectivo.esperadoEnCaja;
  const closedAt = new Date().toISOString();

  const { error } = await supabase
    .from("caja_sesiones")
    .update({
      monto_cierre: parsed.montoCierre,
      notas_cierre: parsed.notas || null,
      closed_at: closedAt,
      closed_by: session.userId ?? null,
      informe_cierre: informe,
    })
    .eq("id", parsed.sesionId)
    .is("closed_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/caja");

  const state = await getCajaSesionHoy();
  return {
    state,
    informe,
    efectivoEsperado,
    diferencia: parsed.montoCierre - efectivoEsperado,
  };
}

const movimientoSchema = z.object({
  sesionId: z.string().uuid(),
  tipo: z.enum(["entrada", "salida"]),
  monto: z.number().int().positive(),
  concepto: z.string().trim().min(1, "Indica el concepto."),
});

export async function registrarMovimientoCaja(
  input: z.infer<typeof movimientoSchema>,
) {
  const session = await requireAdminSession();
  const parsed = movimientoSchema.parse(input);
  const supabase = createAdminClient();

  const { data: sesion, error: fetchError } = await supabase
    .from("caja_sesiones")
    .select("id, closed_at")
    .eq("id", parsed.sesionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!sesion) throw new Error("Sesión de caja no encontrada.");
  if (sesion.closed_at) throw new Error("La caja está cerrada.");

  const { error } = await supabase.from("caja_movimientos").insert({
    sesion_id: parsed.sesionId,
    tipo: parsed.tipo,
    monto: parsed.monto,
    concepto: parsed.concepto,
    created_by: session.userId ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/caja");
  return getCajaSesionHoy();
}

const egresoSchema = z.object({
  sesionId: z.string().uuid(),
  concepto: z.string().trim().min(1, "Indica el concepto del pago."),
  beneficiario: z.string().trim().optional(),
  monto: z.number().int().positive(),
  medioPago: z.enum(CAJA_MEDIO_EGRESO_VALUES),
  notas: z.string().trim().optional(),
});

export async function registrarEgresoCaja(input: z.infer<typeof egresoSchema>) {
  const session = await requireAdminSession();
  const parsed = egresoSchema.parse(input);
  const supabase = createAdminClient();

  const { data: sesion, error: fetchError } = await supabase
    .from("caja_sesiones")
    .select("id, closed_at")
    .eq("id", parsed.sesionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!sesion) throw new Error("Sesión de caja no encontrada.");
  if (sesion.closed_at) throw new Error("La caja está cerrada.");

  const { error } = await supabase.from("caja_egresos").insert({
    sesion_id: parsed.sesionId,
    concepto: parsed.concepto,
    beneficiario: parsed.beneficiario || null,
    monto: parsed.monto,
    medio_pago: parsed.medioPago,
    notas: parsed.notas || null,
    created_by: session.userId ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/caja");
  return getCajaSesionHoy();
}

const cobroVisitaSchema = z.object({
  sesionId: z.string().uuid(),
  compraId: z.string().uuid(),
  userId: z.number().int().positive(),
  medioPagoAdmin: z
    .enum(["efectivo", "datafono", "nequi_nicolas", "davivienda"])
    .optional()
    .default("efectivo"),
});

function medioPagoUsuarioFromAdmin(
  medio: MedioPagoAdmin,
): "nequi" | "davivienda" | "efectivo" | "datafono" {
  if (medio === "davivienda") return "davivienda";
  if (medio === "efectivo") return "efectivo";
  if (medio === "datafono") return "datafono";
  return "nequi";
}

export async function registrarCobroVisitaDesdeCaja(
  input: z.infer<typeof cobroVisitaSchema>,
): Promise<CajaSesionState | null> {
  await requireAdminSession();
  const parsed = cobroVisitaSchema.parse(input);
  const supabase = createAdminClient();

  const { data: sesion, error: sesionError } = await supabase
    .from("caja_sesiones")
    .select("id, closed_at")
    .eq("id", parsed.sesionId)
    .maybeSingle();

  if (sesionError) throw new Error(sesionError.message);
  if (!sesion) throw new Error("Sesión de caja no encontrada.");
  if (sesion.closed_at) throw new Error("La caja está cerrada.");

  const { data: compra, error: compraError } = await supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, monto_visita_monto, estado, cuota_inicial_monto, monto_cuota_periodo",
    )
    .eq("id", parsed.compraId)
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (compraError) throw new Error(compraError.message);
  if (!compra) throw new Error("Compra no encontrada.");
  if (compra.estado === "cancelada") {
    throw new Error("No se puede registrar la visita en este estado.");
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select(
      "id, monto, contexto_pago, estado, medio_pago_admin, user_moto_compra_id, user_id, referencia, comprobante_url, origen, reportado_at, confirmado_at, confirmado_por, fecha_comprobante, tarifa_objetivo_id, notas_admin, created_at, updated_at, dias_cubiertos, medio_pago_usuario",
    )
    .eq("user_moto_compra_id", parsed.compraId)
    .eq("estado", "confirmado");

  if (pagosError) throw new Error(pagosError.message);

  const faltante = faltanteConcepto(
    compra as UserMotoCompraRow,
    (pagos ?? []) as PagoRow[],
    "visita",
  );

  if (faltante <= 0) {
    throw new Error("La visita de este cliente ya está registrada como cobrada.");
  }

  const now = new Date().toISOString();
  const referencia = `VIS-${Date.now()}`;

  const { error: insertError } = await supabase.from("pagos").insert({
    user_moto_compra_id: parsed.compraId,
    user_id: parsed.userId,
    monto: faltante,
    medio_pago_usuario: medioPagoUsuarioFromAdmin(parsed.medioPagoAdmin),
    medio_pago_admin: parsed.medioPagoAdmin,
    referencia,
    comprobante_url: null,
    origen: "admin",
    estado: "confirmado",
    confirmado_at: now,
    confirmado_por: "admin",
    fecha_comprobante: now,
    contexto_pago: "visita",
    notas_admin: "Cobro visita · registrado en caja",
  });

  if (insertError) throw new Error(insertError.message);

  revalidatePath("/caja");
  revalidatePath(`/clientes/${parsed.userId}`);
  revalidatePath("/inbox");
  return getCajaSesionHoy();
}
