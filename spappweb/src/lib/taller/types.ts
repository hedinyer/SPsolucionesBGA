export type OrdenTallerEstado =
  | "recibida"
  | "en_reparacion"
  | "lista"
  | "entregada"
  | "cancelada";

export type RepuestoEstado = "solicitado" | "aprobado" | "rechazado";

export type TareaGravedad = "bien" | "pronto" | "urgente";

export type MotivoPausa =
  | "almuerzo"
  | "esperando_repuesto"
  | "otra_moto"
  | "fin_dia"
  | "otro";

export interface MecanicoRow {
  id: number;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  foto_url: string | null;
  color: string | null;
}

export interface TrabajoRow {
  id: string;
  orden_id: string;
  zona: string;
  nota: string;
  hecho: boolean;
  hecho_at: string | null;
  gravedad: TareaGravedad | null;
  created_at: string;
}

export interface RepuestoProducto {
  id: number;
  nombre: string;
  sku: string;
  stock: number;
  precio: number;
  imagen_url: string | null;
}

export interface RepuestoRow {
  id: string;
  orden_id: string;
  producto_id: number | null;
  descripcion: string | null;
  zona: string | null;
  cantidad: number;
  estado: RepuestoEstado;
  motivo_rechazo: string | null;
  costo_unitario: number | null;
  created_by: string | null;
  aprobado_por: string | null;
  aprobado_at: string | null;
  rechazado_por: string | null;
  rechazado_at: string | null;
  created_at: string;
  producto: RepuestoProducto | null;
}

export interface TiempoRow {
  id: string;
  orden_id: string;
  mecanico_id: number | null;
  inicio: string;
  fin: string | null;
  motivo_pausa: string | null;
}

export interface OrdenTallerRow {
  id: string;
  numero: number;
  user_id: number | null;
  user_moto_compra_id: string | null;
  placa: string | null;
  modelo: string;
  color: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  descripcion_falla: string | null;
  kilometraje: number | null;
  fotos: string[];
  mecanico_id: number | null;
  estado: OrdenTallerEstado;
  timer_running: boolean;
  timer_started_at: string | null;
  segundos_acumulados: number;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  lista_at: string | null;
  entregada_at: string | null;
  mecanico: MecanicoRow | null;
  trabajos: TrabajoRow[];
  repuestos: RepuestoRow[];
  tiempos?: TiempoRow[];
}

export interface OrdenHistorialItem {
  id: string;
  numero: number;
  estado: OrdenTallerEstado;
  created_at: string;
  entregada_at: string | null;
  segundos_acumulados: number;
  trabajos: string[];
  modelo: string;
}

export interface MecanicoStats extends MecanicoRow {
  motosActivas: number;
  segundosHoy: number;
  segundosSemana: number;
  terminadas30d: number;
  promedioPorMoto: number | null;
  trabajandoEn: {
    ordenId: string;
    numero: number;
    placa: string | null;
    modelo: string;
    desde: string;
    segundosPrevios: number;
  } | null;
}

export interface ClienteTallerHit {
  userId: number;
  nombre: string;
  telefono: string | null;
  motos: {
    id: string;
    placa: string | null;
    modelo: string;
    color: string | null;
  }[];
}

export const ORDEN_ESTADO_LABEL: Record<OrdenTallerEstado, string> = {
  recibida: "Esperando mecánico",
  en_reparacion: "En reparación",
  lista: "Lista para entregar",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const REPUESTO_ESTADO_LABEL: Record<RepuestoEstado, string> = {
  solicitado: "Esperando a Sebastian",
  aprobado: "Aprobado",
  rechazado: "No aprobado",
};

export const GRAVEDAD_LABEL: Record<TareaGravedad, string> = {
  bien: "Bien",
  pronto: "Pronto",
  urgente: "Urgente",
};

export const MOTIVO_PAUSA_LABEL: Record<MotivoPausa, string> = {
  almuerzo: "Almuerzo",
  esperando_repuesto: "Esperando repuesto",
  otra_moto: "Otra moto",
  fin_dia: "Fin del día",
  otro: "Otro",
};

export const MECANICO_COLORES = [
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#db2777",
] as const;

export function isOrdenAbierta(estado: OrdenTallerEstado) {
  return estado !== "entregada" && estado !== "cancelada";
}

export function repuestoNombre(r: RepuestoRow) {
  return r.producto?.nombre ?? r.descripcion ?? "Repuesto";
}

export function ordenTienePendientesSebastian(orden: OrdenTallerRow) {
  return orden.repuestos.some((r) => r.estado === "solicitado");
}

export function ordenTieneRechazados(orden: OrdenTallerRow) {
  return orden.repuestos.some((r) => r.estado === "rechazado");
}

export function ordenListaChecklist(orden: OrdenTallerRow) {
  const tareasPendientes = orden.trabajos.filter((t) => !t.hecho).length;
  const repuestosPendientes = orden.repuestos.filter(
    (r) => r.estado === "solicitado",
  ).length;
  const repuestosRechazados = orden.repuestos.filter(
    (r) => r.estado === "rechazado",
  ).length;
  return {
    tareasPendientes,
    repuestosPendientes,
    repuestosRechazados,
    puedeMarcarLista:
      orden.trabajos.length > 0 &&
      tareasPendientes === 0 &&
      repuestosPendientes === 0 &&
      repuestosRechazados === 0,
  };
}
