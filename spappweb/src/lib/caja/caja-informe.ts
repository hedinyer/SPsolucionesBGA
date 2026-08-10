import { CONTEXTO_PAGO_LABELS, MEDIO_PAGO_ADMIN_LABELS } from "@/lib/pipeline/types";
import type { MedioPagoAdminStored } from "@/lib/pipeline/types";
import {
  CAJA_MEDIO_EGRESO_LABELS,
  classifyMedioPago,
  type CajaMedioEgreso,
} from "@/lib/caja/caja-medios";

export interface CajaPagoConfirmadoRow {
  id: string;
  userId?: number;
  clienteNombre?: string;
  monto: number;
  medio: MedioPagoAdminStored | "efectivo";
  medioLabel: string;
  contexto: string | null;
  contextoLabel: string;
  confirmadoAt: string;
}

export interface CajaVisitaPendiente {
  userId: number;
  compraId: string;
  clienteNombre: string;
  montoEsperado: number;
  montoRecibido: number;
  faltante: number;
}

export interface CajaVisitaCobrada {
  pagoId: string;
  userId: number;
  clienteNombre: string;
  monto: number;
  medioLabel: string;
  confirmadoAt: string;
}

export interface CajaVisitasResumen {
  cobradas: CajaVisitaCobrada[];
  pendientes: CajaVisitaPendiente[];
  totalCobradoSesion: number;
  totalPendiente: number;
}

export interface CajaEgresoRow {
  id: string;
  concepto: string;
  beneficiario: string | null;
  monto: number;
  medio: CajaMedioEgreso;
  medioLabel: string;
  notas: string | null;
  createdAt: string;
}

export interface CajaInformeEgresos {
  efectivo: number;
  nequi: number;
  davivienda: number;
  total: number;
  cantidad: number;
}

export interface CajaInformeIngresos {
  efectivo: {
    apertura: number;
    ventasProducto: number;
    ventasMoto: number;
    pagosCredito: number;
    pagosVisitaEfectivo: number;
    entradasManuales: number;
    salidasManuales: number;
    pagosSalida: number;
    esperadoEnCaja: number;
  };
  nequi: {
    monto: number;
    cantidad: number;
    pagosCredito: number;
    pagosSalida: number;
  };
  davivienda: {
    monto: number;
    cantidad: number;
    pagosCredito: number;
    pagosSalida: number;
  };
  ingresosDia: number;
  egresosDia: number;
  netoDia: number;
  totalRecaudado: number;
  visitas: {
    monto: number;
    cantidad: number;
  };
  pagos: CajaPagoConfirmadoRow[];
  egresos: CajaInformeEgresos;
  egresosDetalle: CajaEgresoRow[];
}

function medioLabel(medio: string | null): string {
  if (!medio) return "Sin medio";
  if (medio in MEDIO_PAGO_ADMIN_LABELS) {
    return MEDIO_PAGO_ADMIN_LABELS[medio as MedioPagoAdminStored];
  }
  if (medio in CAJA_MEDIO_EGRESO_LABELS) {
    return CAJA_MEDIO_EGRESO_LABELS[medio as CajaMedioEgreso];
  }
  return medio;
}

export function buildCajaInforme(input: {
  montoApertura: number;
  ventasProducto: number;
  ventasMoto: number;
  entradas: number;
  salidas: number;
  pagosRaw: Array<{
    id: string;
    user_id?: number;
    cliente_nombre?: string | null;
    monto: number;
    medio_pago_admin: string | null;
    contexto_pago: string | null;
    confirmado_at: string;
  }>;
  egresosRaw: Array<{
    id: string;
    concepto: string;
    beneficiario: string | null;
    monto: number;
    medio_pago: string;
    notas: string | null;
    created_at: string;
  }>;
}): CajaInformeIngresos {
  const pagos: CajaPagoConfirmadoRow[] = input.pagosRaw.map((p) => {
    const contexto = p.contexto_pago;
    const contextoLabel =
      contexto && contexto in CONTEXTO_PAGO_LABELS
        ? CONTEXTO_PAGO_LABELS[contexto as keyof typeof CONTEXTO_PAGO_LABELS]
        : "Pago crédito";
    return {
      id: p.id,
      userId: p.user_id,
      clienteNombre: p.cliente_nombre ?? undefined,
      monto: p.monto,
      medio: (p.medio_pago_admin ?? "efectivo") as MedioPagoAdminStored | "efectivo",
      medioLabel: medioLabel(p.medio_pago_admin),
      contexto,
      contextoLabel,
      confirmadoAt: p.confirmado_at,
    };
  });

  const egresosDetalle: CajaEgresoRow[] = input.egresosRaw.map((e) => ({
    id: e.id,
    concepto: e.concepto,
    beneficiario: e.beneficiario,
    monto: e.monto,
    medio: e.medio_pago as CajaMedioEgreso,
    medioLabel: CAJA_MEDIO_EGRESO_LABELS[e.medio_pago as CajaMedioEgreso],
    notas: e.notas,
    createdAt: e.created_at,
  }));

  let pagosEfectivo = 0;
  let pagosCreditoEfectivo = 0;
  let pagosVisitaEfectivo = 0;
  let pagosNequi = 0;
  let pagosDavivienda = 0;
  let pagosVisita = 0;
  let countVisita = 0;
  let countNequi = 0;
  let countDavivienda = 0;

  for (const p of pagos) {
    const kind = classifyMedioPago(p.medio);
    const isVisita = p.contexto === "visita";

    if (isVisita) {
      pagosVisita += p.monto;
      countVisita += 1;
      if (kind === "efectivo") pagosVisitaEfectivo += p.monto;
    }

    if (kind === "efectivo") {
      pagosEfectivo += p.monto;
      if (!isVisita) pagosCreditoEfectivo += p.monto;
    } else if (kind === "nequi") {
      pagosNequi += p.monto;
      countNequi += 1;
    } else if (kind === "davivienda") {
      pagosDavivienda += p.monto;
      countDavivienda += 1;
    } else {
      pagosEfectivo += p.monto;
      if (!isVisita) pagosCreditoEfectivo += p.monto;
    }
  }

  let egresoEfectivo = 0;
  let egresoNequi = 0;
  let egresoDavivienda = 0;

  for (const e of egresosDetalle) {
    if (e.medio === "efectivo") egresoEfectivo += e.monto;
    else if (e.medio === "nequi") egresoNequi += e.monto;
    else if (e.medio === "davivienda") egresoDavivienda += e.monto;
  }

  const egresosDia =
    egresoEfectivo + egresoNequi + egresoDavivienda;

  const ingresosDia =
    input.ventasProducto +
    input.ventasMoto +
    pagosEfectivo +
    pagosNequi +
    pagosDavivienda +
    input.entradas -
    input.salidas;

  const esperadoEnCaja =
    input.montoApertura +
    input.ventasProducto +
    input.ventasMoto +
    pagosEfectivo +
    input.entradas -
    input.salidas -
    egresoEfectivo;

  return {
    efectivo: {
      apertura: input.montoApertura,
      ventasProducto: input.ventasProducto,
      ventasMoto: input.ventasMoto,
      pagosCredito: pagosCreditoEfectivo,
      pagosVisitaEfectivo,
      entradasManuales: input.entradas,
      salidasManuales: input.salidas,
      pagosSalida: egresoEfectivo,
      esperadoEnCaja,
    },
    nequi: {
      monto: pagosNequi,
      cantidad: countNequi,
      pagosCredito: pagosNequi,
      pagosSalida: egresoNequi,
    },
    davivienda: {
      monto: pagosDavivienda,
      cantidad: countDavivienda,
      pagosCredito: pagosDavivienda,
      pagosSalida: egresoDavivienda,
    },
    ingresosDia,
    egresosDia,
    netoDia: ingresosDia - egresosDia,
    totalRecaudado: ingresosDia + input.montoApertura,
    visitas: {
      monto: pagosVisita,
      cantidad: countVisita,
    },
    pagos,
    egresos: {
      efectivo: egresoEfectivo,
      nequi: egresoNequi,
      davivienda: egresoDavivienda,
      total: egresosDia,
      cantidad: egresosDetalle.length,
    },
    egresosDetalle,
  };
}
