export type SolicitudEstado = "pendiente" | "aceptada" | "rechazada";
export type ContractStatus = "borrador" | "completado" | "firmado";
export type VisitaEstado =
  | "pendiente_asignacion"
  | "asignada"
  | "completada"
  | "cancelada";
export type MotoCompraEstado =
  | "pendiente_pago"
  | "lista_retiro"
  | "entregada"
  | "saldada"
  | "cancelada";
export type VendidaEstadoFisico =
  | "activa"
  | "recogida"
  | "robada"
  | "en_transito"
  | "en_patio";
export type FrecuenciaPago = "diario" | "semanal" | "quincenal" | "mensual";
export type TarifaEstado = "pendiente" | "pagada" | "vencida";
export type MorosoEstado = "activo" | "regularizado";
export type MotoRecogerEstado =
  | "pendiente"
  | "asignada"
  | "recogida"
  | "cancelada";

export type PipelineStepId =
  | "credito"
  | "contrato"
  | "visita"
  | "moto"
  | "pago"
  | "entrega";

export type StepVisualState =
  | "completado"
  | "actual"
  | "pendiente"
  | "bloqueado"
  | "error";

export interface PipelineStep {
  id: PipelineStepId;
  label: string;
  state: StepVisualState;
  adminActionRequired: boolean;
}

export interface UserRow {
  id: number;
  user: string;
}

export interface VisitaUbicacionVerificada {
  lat: number;
  lng: number;
  accuracy?: number;
  captured_at: string;
}

/** GPS al enviar solicitud web (users_documents.ubicacion_solicitud). */
export type SolicitudUbicacion = VisitaUbicacionVerificada;

export interface UserDocumentRow {
  id: number;
  user_id: number;
  estado_solicitud: SolicitudEstado;
  betado: boolean;
  motivo_rechazo: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  selfie_url: string | null;
  ubicacion_solicitud: SolicitudUbicacion | null;
  /** Quién captó la solicitud (p. ej. guillen, yhosmer). */
  referral_source: string | null;
  hora_actualizacion: string | null;
  created_at: string;
}

export interface DigitalContractRow {
  id: string;
  user_id: number;
  users_documents_id: number | null;
  status: ContractStatus;
  hoja_vida_data: Record<string, unknown>;
  contrato_data: Record<string, unknown>;
  admin_data: Record<string, unknown>;
  signature_path: string | null;
  hoja_vida_pdf_path: string | null;
  contrato_pdf_path: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitaEvidenciaFoto {
  url: string;
  captured_at: string;
}

export interface VisitaEvidenciaVideo {
  url: string;
  captured_at: string;
  duration_sec?: number;
}

export interface VisitadorRow {
  id: number;
  nombre: string;
  foto_url: string | null;
  telefono: string | null;
  activo: boolean;
  user_id: number | null;
  users?: { id: number; user: string } | { id: number; user: string }[] | null;
}

export interface VisitaRow {
  id: string;
  user_id: number;
  digital_contract_id: string | null;
  visitador_id: number | null;
  estado: VisitaEstado;
  cliente_nombre: string | null;
  cliente_celular: string | null;
  direccion_visita: string | null;
  barrio: string | null;
  fecha_programada: string | null;
  notas: string | null;
  evidencia_fotos: VisitaEvidenciaFoto[];
  evidencia_videos: VisitaEvidenciaVideo[];
  ubicacion_verificada: VisitaUbicacionVerificada | null;
  fecha_completada: string | null;
  notas_visita: string | null;
  visitadores: VisitadorRow | null;
  created_at: string;
  updated_at: string;
}

/** Fila de detalle en métricas de Equipo (visitas asignadas/completadas). */
export interface EquipoVisitaDetalleItem {
  id: string;
  userId: number;
  displayName: string;
  selfieUrl: string | null;
  referralLabel: string;
  visitadorNombre: string | null;
}

export interface EquipoVisitasDetalle {
  asignadas: EquipoVisitaDetalleItem[];
  completadas: EquipoVisitaDetalleItem[];
}

export interface UserMotoCompraRow {
  id: string;
  user_id: number;
  bike_id: number | null;
  garaje_moto_id: string | null;
  modelo: string;
  color: string;
  frecuencia_pago: FrecuenciaPago;
  cuota_inicial_monto: number;
  monto_cuota_periodo: number;
  monto_visita_monto: number;
  monto_total_primer_pago: number;
  estado: MotoCompraEstado;
  pago_inicial_confirmado: boolean;
  pago_cuota_confirmado: boolean;
  pago_visita_confirmado: boolean;
  placa: string | null;
  chasis: string | null;
  referencia: string | null;
  fecha_entrega: string | null;
  doc_tarjeta_propiedad_path: string | null;
  doc_soat_path: string | null;
  doc_tecno_path: string | null;
  seleccionado_at: string;
  admin_data?: { entrega_antes_visita?: boolean };
}

export interface VendidaMotoRow extends UserMotoCompraRow {
  estado_fisico: VendidaEstadoFisico;
  users?: { id: number; user: string } | { id: number; user: string }[] | null;
  morosos?: { estado: MorosoEstado; dias_atraso: number; monto_adeudado?: number } | null;
  motos_para_recoger?: {
    estado: MotoRecogerEstado;
    dias_atraso?: number;
  } | null;
  garaje_motos?: { id: string }[] | null;
  atraso?: AtrasoSnapshot | null;
  selfieUrl?: string | null;
  motoImagenUrl?: string | null;
}

export type AtrasoEstado = "al_dia" | "vencido" | "moroso";

export interface AtrasoSnapshot {
  dias_atraso: number;
  monto_adeudado: number;
  estado: AtrasoEstado;
}

export const VENDIDA_ESTADO_FISICO_LABELS: Record<VendidaEstadoFisico, string> =
  {
    activa: "Activa",
    recogida: "Recogida",
    robada: "Robada",
    en_transito: "En tránsito",
    en_patio: "En patio",
  };

export interface TrackingLocation {
  lat?: number;
  lng?: number;
  accuracy?: number;
  captured_at?: string;
}

export interface UserTrackingRow {
  id: number;
  user_id: number;
  seguimiento: boolean;
  ubicacion_1?: TrackingLocation | null;
}

export interface TarifaPagadaRow {
  id: string;
  user_moto_compra_id: string;
  user_id: number;
  numero_periodo: number;
  fecha_vencimiento: string;
  monto_esperado: number;
  monto_pagado: number | null;
  estado: TarifaEstado;
  pagada_at: string | null;
  confirmada_por: string | null;
  notas: string | null;
}

export interface MorosoRow {
  id: string;
  user_moto_compra_id: string;
  user_id: number;
  tarifa_vencida_id: string | null;
  dias_atraso: number;
  monto_adeudado: number;
  estado: MorosoEstado;
  fecha_ingreso: string;
}

export interface MotoParaRecogerRow {
  id: string;
  user_moto_compra_id: string;
  moroso_id: string | null;
  user_id: number;
  dias_atraso: number;
  monto_adeudado: number;
  estado: MotoRecogerEstado;
  fecha_ingreso: string;
  fecha_recogida: string | null;
  notas: string | null;
}

export type GarajeOrigen = "manual" | "recuperacion";
export type GarajeCondicion = "nueva" | "segunda_mano" | "recuperada";
export type GarajeMotoEstado =
  | "en_garaje"
  | "retenida"
  | "en_mantenimiento"
  | "disponible"
  | "vendida"
  | "devuelta"
  | "baja";

export interface GarajeParqueaderoRow {
  id: number;
  nombre: string;
  slug: string;
  activo: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface GarajeMotoRow {
  id: string;
  parqueadero_id: number | null;
  parqueadero_nombre: string | null;
  placa: string | null;
  placa_foto_url: string | null;
  referencia: string;
  modelo: string;
  color: string;
  origen: GarajeOrigen;
  condicion: GarajeCondicion;
  estado: GarajeMotoEstado;
  moto_para_recoger_id: string | null;
  user_moto_compra_id: string | null;
  cuota_inicial: number | null;
  cuota_diaria: number | null;
  monto_visita: number | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  /** Desde join con motos_para_recoger (solo recuperadas). */
  fecha_recogida?: string | null;
  /** Cliente de origen (compra vinculada). */
  origen_user_id?: number | null;
}

/** Unidad de garaje marcada vendida + datos de la compra/cliente. */
export interface GarajeMotoVendidaRow {
  id: string;
  placa: string | null;
  referencia: string;
  modelo: string;
  color: string;
  condicion: GarajeCondicion;
  fechaVenta: string | null;
  selfieUrl: string | null;
}

export interface GarajeMantenimientoItemRow {
  id: string;
  garaje_moto_id: string;
  producto_id: number;
  cantidad: number;
  costo_unitario: number;
  notas: string | null;
  created_at: string;
  created_by: string | null;
  producto_nombre?: string | null;
  producto_sku?: string | null;
}

export const GARAJE_CONDICION_LABELS: Record<GarajeCondicion, string> = {
  nueva: "Nueva",
  segunda_mano: "Segunda mano",
  recuperada: "Recuperada",
};

export const GARAJE_ORIGEN_LABELS: Record<GarajeOrigen, string> = {
  manual: "Manual",
  recuperacion: "Recuperación",
};

export const GARAJE_ESTADO_LABELS: Record<GarajeMotoEstado, string> = {
  en_garaje: "En garaje",
  retenida: "Retenida (plazo cliente)",
  en_mantenimiento: "En mantenimiento",
  disponible: "Disponible",
  vendida: "Vendida",
  devuelta: "Devuelta al cliente",
  baja: "Baja",
};

export interface RentingResumen {
  totalPagado: number;
  totalAdeudado: number;
  /** Suma fraccional de cuotas cubiertas (ej. 2.5). */
  cuotasPagadas: number;
  cuotasPendientes: number;
  cuotasVencidas: number;
  diasAtraso: number | null;
  proximoVencimiento: string | null;
}

export interface CongelamientoActivo {
  /** Días de la última congelación aplicada. */
  dias: number;
  /** Días que aún restan del periodo congelado (redondeado hacia arriba). */
  diasRestantes: number;
  /** Fecha ISO en la que expira el congelamiento. */
  hasta: string;
}

export interface PagoHistorialRow {
  id: string;
  fecha: string;
  monto: number;
  montoEsperado: number | null;
  referencia: string | null;
  contexto_pago: ContextoPago | null;
  numeroPeriodo: number | null;
  cuotasCubiertas: number;
  variacionLabel: string;
  variacionTone: "menor" | "mayor" | "exacto";
  comprobante_url: string | null;
}

export interface ClientPipeline {
  user: UserRow;
  document: UserDocumentRow | null;
  contract: DigitalContractRow | null;
  visita: VisitaRow | null;
  compra: UserMotoCompraRow | null;
  tracking: UserTrackingRow | null;
  tarifas: TarifaPagadaRow[];
  moroso: MorosoRow | null;
  recoger: MotoParaRecogerRow | null;
  atraso: AtrasoSnapshot | null;
  congelamiento: CongelamientoActivo | null;
  rentingResumen: RentingResumen | null;
  pagosHistorial: PagoHistorialRow[];
  pagos: PagoRow[];
  /** tarifa_id → URL del comprobante de pago (si se subió foto). */
  comprobanteByTarifaId: Record<string, string>;
  compraProductosCredito: CompraProductoCreditoRow[];
  steps: PipelineStep[];
  currentAdminStep: PipelineStepId | null;
  displayName: string;
}

export type InboxQueueId =
  | "creditos"
  | "clientes_guillen"
  | "visitas_sin_asignar"
  | "visitas_programadas"
  | "pagos"
  | "retiro"
  | "entrega"
  | "morosos"
  | "recoger"
  | "solicitudes_taller";

export interface InboxQueue {
  id: InboxQueueId;
  label: string;
  description: string;
  count: number;
}

export interface InboxListItem {
  userId: number;
  username: string;
  displayName: string;
  subtitle: string;
  queueId: InboxQueueId;
  cedula?: string | null;
  celular?: string | null;
  selfieUrl?: string | null;
  motoImagenUrl?: string | null;
  createdAt?: string;
  estadoSolicitud?: string;
  referralSource?: string | null;
}

export interface ClienteFacturacion {
  userId: number;
  clienteNombre: string;
  clienteCedula: string;
  compraId: string | null;
  motoModelo: string | null;
  motoColor: string | null;
  cuotaInicial: number | null;
  cuotaAdelantada: number | null;
  montoVisita: number | null;
  totalPrimerPago: number | null;
}

export interface ClientSearchResult {
  userId: number;
  username: string;
  displayName: string;
  cedula: string | null;
  placa: string | null;
  motoLabel: string | null;
  compraEstado: MotoCompraEstado | null;
  cuotasPagadas: number;
  diasAtraso: number;
  matchLabel: string;
  seleccionadoAt: string | null;
  selfieUrl: string | null;
  motoImagenUrl: string | null;
  /** Quién captó al cliente (Guillen, Punto de venta, …). */
  referralLabel: string;
}

export interface BikeRow {
  id: number;
  modelo: string;
  color: string;
  imagen_url: string | null;
  stock: number;
  cuota_inicial: number;
  cuota_diaria: number;
  monto_visita: number;
  precio_venta: number | null;
  descripcion: string | null;
  activo: boolean;
}

export const FRECUENCIA_LABELS: Record<FrecuenciaPago, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

export const VISITA_ESTADO_LABELS: Record<VisitaEstado, string> = {
  pendiente_asignacion: "Sin asignar",
  asignada: "Programada",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const COMPRA_ESTADO_LABELS: Record<MotoCompraEstado, string> = {
  pendiente_pago: "Pendiente de pago",
  lista_retiro: "Lista para retiro",
  entregada: "Entregada",
  saldada: "Saldada",
  cancelada: "Cancelada",
};

export const TARIFA_ESTADO_LABELS: Record<TarifaEstado, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  vencida: "Vencida",
};

export type ContextoPago =
  | "tarifa"
  | "inicial"
  | "cuota_adelantada"
  | "visita"
  | "liquidacion";
export type MedioPagoAdmin =
  | "nequi_nicolas"
  | "davivienda"
  | "efectivo"
  | "datafono";

export type MedioPagoAdminLegacy =
  | "nequi_pedro"
  | "nequi_marisol";

export type MedioPagoAdminStored = MedioPagoAdmin | MedioPagoAdminLegacy;

export const MEDIO_PAGO_ADMIN_OPTIONS: MedioPagoAdmin[] = [
  "nequi_nicolas",
  "davivienda",
  "efectivo",
  "datafono",
];
export type BancoOrigen =
  | "nequi"
  | "davivienda"
  | "bancolombia"
  | "banco_bogota"
  | "pse"
  | "otro";
export type PagoEstado = "pendiente_confirmacion" | "confirmado" | "rechazado";

export interface PagoRow {
  id: string;
  user_moto_compra_id: string;
  user_id: number;
  monto: number;
  dias_cubiertos: number | null;
  medio_pago_usuario: "nequi" | "davivienda" | "efectivo" | "datafono";
  medio_pago_admin: MedioPagoAdminStored | null;
  referencia: string | null;
  comprobante_url: string | null;
  origen: "usuario" | "admin";
  estado: PagoEstado;
  reportado_at: string;
  confirmado_at: string | null;
  confirmado_por: string | null;
  fecha_comprobante: string | null;
  tarifa_objetivo_id: string | null;
  contexto_pago: ContextoPago | null;
  notas_admin: string | null;
  created_at: string;
  updated_at: string;
}

export const CONTEXTO_PAGO_LABELS: Record<ContextoPago, string> = {
  tarifa: "Tarifa de renting",
  inicial: "Cuota inicial",
  cuota_adelantada: "Cuota adelantada",
  visita: "Visita domiciliaria",
  liquidacion: "Liquidación de crédito",
};

export const MEDIO_PAGO_ADMIN_LABELS: Record<MedioPagoAdminStored, string> = {
  nequi_nicolas: "Nequi — Nicolás",
  nequi_pedro: "Nequi — Pedro",
  nequi_marisol: "Nequi — Marisol",
  davivienda: "Davivienda",
  efectivo: "Efectivo",
  datafono: "Datáfono",
};

export const BANCO_ORIGEN_LABELS: Record<BancoOrigen, string> = {
  nequi: "Nequi",
  davivienda: "Davivienda / Daviplata",
  bancolombia: "Bancolombia",
  banco_bogota: "Banco de Bogotá",
  pse: "PSE / Bre-B",
  otro: "Otro banco",
};

export type SolicitudTallerTipo = "repuestos" | "reparacion" | "cambio_aceite";
export type SolicitudTallerEstado =
  | "pendiente"
  | "en_proceso"
  | "completada"
  | "cancelada";

export interface InventarioCategoriaRow {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

export interface InventarioProductoRow {
  id: number;
  categoria_id: number;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  costo: number;
  stock: number;
  stock_minimo: number;
  imagen_url: string | null;
  compatible_modelos: string[];
  activo: boolean;
  inventario_categorias?: InventarioCategoriaRow | null;
}

export interface ProductoCreditoRow {
  id: number;
  nombre: string;
  descripcion: string | null;
  cuota_inicial: number;
  cuota_diaria: number;
  imagen_url: string | null;
  activo: boolean;
  orden: number;
}

export interface CompraProductoCreditoRow {
  id: string;
  user_moto_compra_id: string;
  user_id: number;
  producto_credito_id: number | null;
  nombre: string;
  cuota_inicial_monto: number;
  cuota_diaria_monto: number;
  cantidad: number;
  notas: string | null;
  created_at: string;
  productos_credito?: ProductoCreditoRow | null;
}

export interface SolicitudRepuestoItemRow {
  id: string;
  solicitud_id: string;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  inventario_productos?: InventarioProductoRow | null;
}

export interface SolicitudTallerRow {
  id: string;
  user_id: number;
  user_moto_compra_id: string | null;
  tipo: SolicitudTallerTipo;
  estado: SolicitudTallerEstado;
  notas_cliente: string | null;
  notas_admin: string | null;
  fecha_preferida: string | null;
  descripcion_falla: string | null;
  total_estimado: number;
  created_at: string;
  updated_at: string;
  users?: UserRow | null;
  user_moto_compra?: UserMotoCompraRow | null;
  solicitud_repuesto_items?: SolicitudRepuestoItemRow[];
}

export const SOLICITUD_TIPO_LABELS: Record<SolicitudTallerTipo, string> = {
  repuestos: "Repuestos",
  reparacion: "Reparación",
  cambio_aceite: "Cambio de aceite",
};

export const SOLICITUD_ESTADO_LABELS: Record<SolicitudTallerEstado, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
};

/** Licencia de Tránsito (tarjeta de propiedad) archivada con fotos. */
export interface TarjetaPropiedadRow {
  id: string;
  numero_licencia: string | null;
  placa: string | null;
  marca: string | null;
  linea: string | null;
  modelo: string | null;
  cilindrada: string | null;
  color: string | null;
  servicio: string | null;
  clase_vehiculo: string | null;
  tipo_carroceria: string | null;
  combustible: string | null;
  capacidad: string | null;
  numero_motor: string | null;
  motor_reg: string | null;
  vin: string | null;
  numero_serie: string | null;
  serie_reg: string | null;
  numero_chasis: string | null;
  chasis_reg: string | null;
  propietario: string | null;
  identificacion_tipo: string | null;
  identificacion_numero: string | null;
  /** Anverso (frente). */
  imagen_url: string;
  /** Reverso. */
  imagen_reverso_url: string | null;
  raw_ocr_text: string | null;
  created_at: string;
  updated_at: string;
}
