import { runPlacaGpsSelfCheck } from "@/lib/gps/placaGps";
import type {
  ClientPipeline,
  ContractStatus,
  DigitalContractRow,
  PipelineStep,
  PipelineStepId,
  SolicitudEstado,
  StepVisualState,
  UserDocumentRow,
  UserMotoCompraRow,
  UserRow,
  VisitaEstado,
  VisitaRow,
} from "@/lib/pipeline/types";

const STEP_ORDER: PipelineStepId[] = [
  "credito",
  "moto",
  "contrato",
  "pago",
  "visita",
  "entrega",
];

const STEP_LABELS: Record<PipelineStepId, string> = {
  credito: "Crédito",
  contrato: "Contrato",
  visita: "Visita",
  moto: "Moto",
  pago: "Pago",
  entrega: "Entrega",
};

export function entregaAntesVisita(compra: UserMotoCompraRow | null): boolean {
  return compra?.admin_data?.entrega_antes_visita === true;
}

function stepOrder(compra: UserMotoCompraRow | null): PipelineStepId[] {
  if (entregaAntesVisita(compra)) {
    return ["credito", "moto", "contrato", "pago", "entrega", "visita"];
  }
  return STEP_ORDER;
}

export function motoListo(compra: UserMotoCompraRow | null): boolean {
  return Boolean(compra?.placa?.trim() && compra?.chasis?.trim());
}

export function motoDone(
  compra: UserMotoCompraRow | null,
  contract: DigitalContractRow | null,
): boolean {
  if (!compra) return false;
  // ponytail: legacy — cliente eligió moto tras contrato firmado sin placa admin
  if (contractDone(contract) && !motoListo(compra)) return true;
  return motoListo(compra);
}

export function canChooseFlowOrder(
  compra: UserMotoCompraRow | null,
  visita: VisitaRow | null,
): boolean {
  if (!compra || compra.estado !== "lista_retiro") return false;
  if (deliveryDone(compra)) return false;
  if (visitDone(visita)) return false;
  if (compra.admin_data?.entrega_antes_visita !== undefined) return false;
  return true;
}

function creditDone(doc: UserDocumentRow | null): boolean {
  return doc?.estado_solicitud === "aceptada";
}

function creditError(doc: UserDocumentRow | null): boolean {
  return doc?.estado_solicitud === "rechazada";
}

function contractDone(contract: DigitalContractRow | null): boolean {
  return contract?.status === "firmado";
}

function visitDone(visita: VisitaRow | null): boolean {
  return visita?.estado === "completada";
}

function visitError(visita: VisitaRow | null): boolean {
  return visita?.estado === "cancelada";
}

function paymentDone(compra: UserMotoCompraRow | null): boolean {
  if (!compra) return false;
  return (
    compra.pago_inicial_confirmado &&
    compra.pago_cuota_confirmado &&
    (compra.estado === "lista_retiro" || compra.estado === "entregada")
  );
}

function deliveryDone(compra: UserMotoCompraRow | null): boolean {
  return compra?.estado === "entregada" || compra?.estado === "saldada";
}

function deliveryError(compra: UserMotoCompraRow | null): boolean {
  return compra?.estado === "cancelada";
}

function isStepComplete(
  stepId: PipelineStepId,
  doc: UserDocumentRow | null,
  contract: DigitalContractRow | null,
  visita: VisitaRow | null,
  compra: UserMotoCompraRow | null,
): boolean {
  switch (stepId) {
    case "credito":
      return creditDone(doc);
    case "contrato":
      return contractDone(contract);
    case "visita":
      return visitDone(visita);
    case "moto":
      return motoDone(compra, contract);
    case "pago":
      return paymentDone(compra);
    case "entrega":
      return deliveryDone(compra);
    default:
      return false;
  }
}

function isStepError(
  stepId: PipelineStepId,
  doc: UserDocumentRow | null,
  visita: VisitaRow | null,
  compra: UserMotoCompraRow | null,
): boolean {
  switch (stepId) {
    case "credito":
      return creditError(doc);
    case "visita":
      return visitError(visita);
    case "entrega":
      return deliveryError(compra);
    default:
      return false;
  }
}

function isBlockedForStep(
  stepId: PipelineStepId,
  doc: UserDocumentRow | null,
  contract: DigitalContractRow | null,
  visita: VisitaRow | null,
  compra: UserMotoCompraRow | null,
): boolean {
  switch (stepId) {
    case "credito":
      return false;
    case "moto":
      return !creditDone(doc);
    case "contrato":
      return !creditDone(doc) || !motoDone(compra, contract);
    case "pago":
      return !contractDone(contract) || !motoDone(compra, contract);
    case "visita":
      if (entregaAntesVisita(compra)) return !deliveryDone(compra);
      return !paymentDone(compra) && compra?.estado !== "lista_retiro";
    case "entrega":
      if (entregaAntesVisita(compra)) {
        return !paymentDone(compra) && compra?.estado !== "lista_retiro";
      }
      return !visitDone(visita);
    default:
      return true;
  }
}

export function detectAdminActionStep(
  doc: UserDocumentRow | null,
  contract: DigitalContractRow | null,
  visita: VisitaRow | null,
  compra: UserMotoCompraRow | null,
): PipelineStepId | null {
  if (doc?.estado_solicitud === "pendiente") return "credito";

  if (creditDone(doc) && !motoDone(compra, contract)) {
    if (!contractDone(contract)) return "moto";
    if (!compra) return null;
  }

  if (
    compra &&
    contractDone(contract) &&
    compra.estado === "pendiente_pago" &&
    (!compra.pago_inicial_confirmado || !compra.pago_cuota_confirmado)
  ) {
    return "pago";
  }
  if (
    compra &&
    (compra.estado === "lista_retiro" || paymentDone(compra)) &&
    !deliveryDone(compra)
  ) {
    if (entregaAntesVisita(compra)) return "entrega";
    if (
      !visita ||
      visita.estado === "pendiente_asignacion" ||
      visita.estado === "asignada" ||
      visita.estado === "cancelada"
    ) {
      return "visita";
    }
    if (compra.estado === "lista_retiro" && visitDone(visita)) {
      return "entrega";
    }
  }
  if (deliveryDone(compra) && visita && !visitDone(visita)) {
    return "visita";
  }
  return null;
}

export function buildPipelineSteps(
  doc: UserDocumentRow | null,
  contract: DigitalContractRow | null,
  visita: VisitaRow | null,
  compra: UserMotoCompraRow | null,
): PipelineStep[] {
  const adminStep = detectAdminActionStep(doc, contract, visita, compra);

  return stepOrder(compra).map((id) => {
    let state: StepVisualState = "pendiente";

    if (isStepError(id, doc, visita, compra)) {
      state = "error";
    } else if (isStepComplete(id, doc, contract, visita, compra)) {
      state = "completado";
    } else if (isBlockedForStep(id, doc, contract, visita, compra)) {
      state = "bloqueado";
    } else if (adminStep === id) {
      state = "actual";
    } else if (
      id === "contrato" &&
      motoDone(compra, contract) &&
      contract &&
      !contractDone(contract)
    ) {
      state = "pendiente";
    }

    return {
      id,
      label: STEP_LABELS[id],
      state,
      adminActionRequired: adminStep === id,
    };
  });
}

export function resolveDisplayName(
  user: UserRow,
  contract: DigitalContractRow | null,
  visita: VisitaRow | null,
): string {
  const hoja = contract?.hoja_vida_data as
    | {
        nombre_completo?: string;
        nombres?: string;
        apellidos?: string;
        nombre?: string;
      }
    | undefined;
  const fromHoja =
    hoja?.nombre_completo?.trim() ||
    (hoja?.nombres && hoja?.apellidos
      ? `${hoja.nombres} ${hoja.apellidos}`.trim()
      : hoja?.nombre?.trim());
  if (fromHoja) return fromHoja;
  if (visita?.cliente_nombre) return visita.cliente_nombre;
  return user.user;
}

export function buildClientPipeline(input: {
  user: UserRow;
  document: UserDocumentRow | null;
  contract: DigitalContractRow | null;
  visita: VisitaRow | null;
  compra: UserMotoCompraRow | null;
  tracking: import("@/lib/pipeline/types").UserTrackingRow | null;
  tarifas?: import("@/lib/pipeline/types").TarifaPagadaRow[];
  moroso?: import("@/lib/pipeline/types").MorosoRow | null;
  recoger?: import("@/lib/pipeline/types").MotoParaRecogerRow | null;
  atraso?: import("@/lib/pipeline/types").AtrasoSnapshot | null;
  congelamiento?: import("@/lib/pipeline/types").CongelamientoActivo | null;
  rentingResumen?: import("@/lib/pipeline/types").RentingResumen | null;
  pagosHistorial?: import("@/lib/pipeline/types").PagoHistorialRow[];
  pagos?: import("@/lib/pipeline/types").PagoRow[];
  comprobanteByTarifaId?: Record<string, string>;
  compraProductosCredito?: import("@/lib/pipeline/types").CompraProductoCreditoRow[];
}): ClientPipeline {
  const steps = buildPipelineSteps(
    input.document,
    input.contract,
    input.visita,
    input.compra,
  );

  return {
    ...input,
    tarifas: input.tarifas ?? [],
    moroso: input.moroso ?? null,
    recoger: input.recoger ?? null,
    atraso: input.atraso ?? null,
    congelamiento: input.congelamiento ?? null,
    rentingResumen: input.rentingResumen ?? null,
    pagosHistorial: input.pagosHistorial ?? [],
    pagos: input.pagos ?? [],
    comprobanteByTarifaId: input.comprobanteByTarifaId ?? {},
    compraProductosCredito: input.compraProductosCredito ?? [],
    steps,
    currentAdminStep: detectAdminActionStep(
      input.document,
      input.contract,
      input.visita,
      input.compra,
    ),
    displayName: resolveDisplayName(
      input.user,
      input.contract,
      input.visita,
    ),
  };
}

export function contractStatusLabel(status: ContractStatus | undefined): string {
  switch (status) {
    case "borrador":
      return "Borrador";
    case "completado":
      return "Completado";
    case "firmado":
      return "Firmado";
    default:
      return "Sin contrato";
  }
}

export function solicitudLabel(estado: SolicitudEstado | undefined): string {
  switch (estado) {
    case "pendiente":
      return "En revisión";
    case "aceptada":
      return "Aprobada";
    case "rechazada":
      return "Rechazada";
    default:
      return "Sin solicitud";
  }
}

export function visitaEstadoLabel(estado: VisitaEstado | undefined): string {
  switch (estado) {
    case "pendiente_asignacion":
      return "Sin asignar";
    case "asignada":
      return "Programada";
    case "completada":
      return "Completada";
    case "cancelada":
      return "Cancelada";
    default:
      return "—";
  }
}

export function runPipelineSelfCheck(): void {
  runPlacaGpsSelfCheck();

  const docAceptada = { estado_solicitud: "aceptada" } as UserDocumentRow;
  const contractFirmado = { status: "firmado" } as DigitalContractRow;
  const compraLista: UserMotoCompraRow = {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: 1,
    bike_id: 1,
    garaje_moto_id: null,
    modelo: "X",
    color: "Y",
    frecuencia_pago: "semanal",
    cuota_inicial_monto: 1,
    monto_cuota_periodo: 1,
    monto_visita_monto: 0,
    monto_total_primer_pago: 2,
    estado: "lista_retiro",
    pago_inicial_confirmado: true,
    pago_cuota_confirmado: true,
    pago_visita_confirmado: true,
    placa: "ABC123",
    chasis: "CH1",
    referencia: null,
    fecha_entrega: null,
    doc_tarjeta_propiedad_path: null,
    doc_soat_path: null,
    doc_tecno_path: null,
    seleccionado_at: "",
  };
  const visitaPendiente: VisitaRow = {
    id: "v1",
    user_id: 1,
    digital_contract_id: null,
    visitador_id: null,
    estado: "pendiente_asignacion",
    cliente_nombre: null,
    cliente_celular: null,
    direccion_visita: null,
    barrio: null,
    fecha_programada: null,
    notas: null,
    evidencia_fotos: [],
    evidencia_videos: [],
    ubicacion_verificada: null,
    fecha_completada: null,
    notas_visita: null,
    visitadores: null,
    created_at: "",
    updated_at: "",
  };

  if (detectAdminActionStep(docAceptada, null, null, null) !== "moto") {
    throw new Error("post-credit: moto first");
  }
  if (
    detectAdminActionStep(
      docAceptada,
      contractFirmado,
      visitaPendiente,
      compraLista,
    ) !== "visita"
  ) {
    throw new Error("default: visita first");
  }
  const compraExcepcion = {
    ...compraLista,
    admin_data: { entrega_antes_visita: true },
  };
  if (
    detectAdminActionStep(
      docAceptada,
      contractFirmado,
      visitaPendiente,
      compraExcepcion,
    ) !== "entrega"
  ) {
    throw new Error("exception: entrega first");
  }
}

