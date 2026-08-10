import type {
  AtrasoSnapshot,
  ClientPipeline,
  MorosoRow,
  MotoParaRecogerRow,
  RentingResumen,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";

/** Días exactos para bandeja "Clientes en mora". */
export const DIAS_MORA_BANDEJA = 3;
/** Primer día en bandeja "Motos para recoger" (exclusiva con mora). */
export const DIAS_RECOGER_BANDEJA = 4;
/** Días que el cliente tiene para recuperar la moto tras la recogida. */
export const DIAS_RECUPERACION_CLIENTE = 3;

/** Plazo de recuperación post-recogida (días calendario desde fecha_recogida). */
export function getPlazoRecuperacion(fechaRecogida: string | null | undefined, now = new Date()) {
  if (!fechaRecogida) {
    return {
      diasTranscurridos: 0,
      diasRestantes: DIAS_RECUPERACION_CLIENTE,
      plazoVencido: false,
    };
  }
  const start = new Date(fechaRecogida);
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const nowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const diasTranscurridos = Math.max(
    0,
    Math.floor((nowUtc - startUtc) / 86_400_000),
  );
  const diasRestantes = Math.max(
    0,
    DIAS_RECUPERACION_CLIENTE - diasTranscurridos,
  );
  return {
    diasTranscurridos,
    diasRestantes,
    plazoVencido: diasTranscurridos >= DIAS_RECUPERACION_CLIENTE,
  };
}

type MoraMorosoInput = Partial<
  Pick<MorosoRow, "dias_atraso" | "monto_adeudado" | "estado">
>;
type MoraRecogerInput = Partial<
  Pick<MotoParaRecogerRow, "dias_atraso" | "monto_adeudado" | "estado">
>;

export function emptyRentingResumen(): RentingResumen {
  return {
    totalPagado: 0,
    totalAdeudado: 0,
    cuotasPagadas: 0,
    cuotasPendientes: 0,
    cuotasVencidas: 0,
    diasAtraso: null,
    proximoVencimiento: null,
  };
}

/** Combina tarifas con la vista `atrasos` (fuente de verdad del contrato). */
export function mergeRentingResumenWithAtraso(
  compra: UserMotoCompraRow | null,
  fromTarifas: RentingResumen | null,
  atraso: AtrasoSnapshot | null,
): RentingResumen | null {
  if (!compra || compra.estado !== "entregada") return null;

  const base = fromTarifas ?? emptyRentingResumen();
  if (!atraso) return base;

  return {
    ...base,
    totalAdeudado: Math.max(base.totalAdeudado, atraso.monto_adeudado),
    diasAtraso:
      atraso.dias_atraso > 0
        ? atraso.dias_atraso
        : base.diasAtraso,
  };
}

function recogerActivo(recoger?: MoraRecogerInput | null): boolean {
  return (
    recoger != null &&
    recoger.estado !== "recogida" &&
    recoger.estado !== "cancelada"
  );
}

export function getMoraDisplay(input: {
  atraso?: AtrasoSnapshot | null;
  moroso?: MoraMorosoInput | null;
  recoger?: MoraRecogerInput | null;
  rentingResumen?: RentingResumen | null;
}) {
  const dias =
    input.atraso?.dias_atraso ??
    input.moroso?.dias_atraso ??
    input.recoger?.dias_atraso ??
    input.rentingResumen?.diasAtraso ??
    0;
  const monto =
    input.atraso?.monto_adeudado ??
    input.moroso?.monto_adeudado ??
    input.recoger?.monto_adeudado ??
    input.rentingResumen?.totalAdeudado ??
    0;
  const tieneDeuda = monto > 0;
  const paraRecoger =
    tieneDeuda &&
    dias >= DIAS_RECOGER_BANDEJA &&
    (!input.recoger || recogerActivo(input.recoger));
  const enMoraBandeja =
    tieneDeuda &&
    dias >= DIAS_MORA_BANDEJA &&
    dias < DIAS_RECOGER_BANDEJA;

  return { dias, monto, enMoraBandeja, paraRecoger, tieneDeuda };
}

/** Guard puro: no pisar créditos liquidado/cancelado al marcar entrega. */
export function assertPuedeMarcarEntregada(estado: string): void {
  if (estado === "saldada") {
    throw new Error("Este crédito ya fue liquidado.");
  }
  if (estado === "cancelada") {
    throw new Error("Esta compra está cancelada.");
  }
}

export function pipelineTieneCuentaMora(pipeline: ClientPipeline): boolean {
  if (pipeline.compra?.estado !== "entregada") return false;
  return getMoraDisplay(pipeline).tieneDeuda;
}

export function moraEstadoLabel(atraso: AtrasoSnapshot | null | undefined): string {
  if (!atraso || atraso.monto_adeudado <= 0) return "Al día";
  if (atraso.dias_atraso >= DIAS_RECOGER_BANDEJA) return "Para recoger (4+ días)";
  if (atraso.dias_atraso >= DIAS_MORA_BANDEJA) return "En mora (3 días)";
  if (atraso.estado === "vencido") return "Vencido";
  return "Con saldo pendiente";
}
