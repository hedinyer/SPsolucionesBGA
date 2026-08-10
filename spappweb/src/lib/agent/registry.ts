import { z } from "zod";

import { hojaVidaFormSchema } from "@/lib/contracts/hoja-vida-schema";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";

/**
 * Cargadores perezosos (dynamic import) de las capas de negocio. Mantienen el
 * módulo del registro y la ruta `/api/agent/tools` libres de dependencias pesadas
 * (Supabase server-only, `sharp`, `tesseract.js`), de modo que el catálogo se
 * pueda generar siempre, incluso en cold-start de Vercel. Cada handler carga su
 * módulo solo cuando se invoca.
 */
const loadQueries = () => import("@/lib/pipeline/queries");
const loadAdminActions = () => import("@/lib/actions/admin-actions");
const loadPaymentActions = () =>
  import("@/lib/actions/payment-comprobante-actions");
const loadClientActions = () => import("@/lib/actions/client-actions");
const loadPipelineEvents = () => import("@/lib/agent/pipeline-events");
const loadVentaMotoActions = () => import("@/lib/actions/venta-moto-actions");
const loadVentaProductoActions = () =>
  import("@/lib/actions/venta-producto-actions");
const loadHistorialMotosActions = () =>
  import("@/lib/actions/historial-motos-actions");
const loadCajaActions = () => import("@/lib/actions/caja-actions");

const INBOX_QUEUE_IDS = [
  "creditos",
  "clientes_guillen",
  "pagos",
  "retiro",
  "entrega",
  "visitas_sin_asignar",
  "visitas_programadas",
  "morosos",
  "recoger",
  "solicitudes_taller",
] as const;

export type AgentToolCategory =
  | "lectura"
  | "notificaciones"
  | "credito"
  | "visitas"
  | "pagos"
  | "entrega"
  | "mora"
  | "clientes"
  | "catalogo"
  | "inventario"
  | "garaje"
  | "taller";

interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  category: AgentToolCategory;
  description: string;
  input: S;
  handler: (args: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const empty = z.object({});

/**
 * Registro central de herramientas del agente IA.
 *
 * Cada handler delega en las server actions y queries existentes del panel,
 * que son la única fuente de verdad de la lógica de negocio (validación Zod,
 * guardas de estado, triggers de Supabase). Añadir una entrada aquí la expone
 * automáticamente vía `/api/agent/tools` y al plugin de Hermes.
 */
export const AGENT_TOOLS = {
  // ---------------------------------------------------------------- LECTURA
  inbox_queues: tool({
    category: "lectura",
    description:
      "Devuelve las 9 colas accionables de la bandeja con su conteo: créditos pendientes, pagos por confirmar, retiros, entregas, visitas, morosos, motos para recoger y solicitudes de taller.",
    input: empty,
    handler: async () => (await loadQueries()).getInboxQueues(),
  }),
  inbox_list: tool({
    category: "lectura",
    description:
      "Lista los clientes/items pendientes de una cola específica de la bandeja.",
    input: z.object({
      queueId: z.enum(INBOX_QUEUE_IDS).describe("Identificador de la cola"),
    }),
    handler: async ({ queueId }) => (await loadQueries()).getInboxListItems(queueId),
  }),
  search_clients: tool({
    category: "lectura",
    description:
      "Busca clientes por nombre, cédula, placa o usuario (mínimo 2 caracteres). Devuelve resumen con userId, moto, estado de compra y cuotas pagadas.",
    input: z.object({
      query: z.string().min(2, "Mínimo 2 caracteres"),
    }),
    handler: async ({ query }) => (await loadQueries()).searchClients(query),
  }),
  get_client_pipeline: tool({
    category: "lectura",
    description:
      "Vista 360° de un cliente: datos, documento/crédito, contrato, moto comprada, pagos, tarifas, mora, tracking, visita y pasos del pipeline. Úsala antes de cualquier acción sobre el cliente.",
    input: z.object({
      userId: z.number().int().positive(),
    }),
    handler: async ({ userId }) => (await loadQueries()).getClientPipeline(userId),
  }),
  list_pipeline_events: tool({
    category: "notificaciones",
    description:
      "Cola de eventos del pipeline (crédito→moto→contrato→pago→visita→entrega) pendientes de WhatsApp. Cada evento incluye celular, paso, payload y whatsappHint sugerido. Consulta periódicamente y envía mensajes al cliente.",
    input: z.object({
      limit: z.number().int().min(1).max(200).optional(),
      since: z.string().optional().describe("ISO timestamp; solo eventos posteriores"),
      includeAcked: z
        .boolean()
        .optional()
        .describe("Si true, incluye eventos ya procesados"),
    }),
    handler: async ({ limit, since, includeAcked }) =>
      (await loadPipelineEvents()).listPipelineEvents({
        limit,
        since,
        pendingOnly: !includeAcked,
      }),
  }),
  ack_pipeline_events: tool({
    category: "notificaciones",
    description:
      "Marca eventos del pipeline como procesados tras enviar el WhatsApp al cliente.",
    input: z.object({
      eventIds: z.array(z.string().uuid()).min(1),
      ackedBy: z.string().optional().describe("Identificador del agente, ej. hermes"),
    }),
    handler: async ({ eventIds, ackedBy }) =>
      (await loadPipelineEvents()).ackPipelineEvents(eventIds, ackedBy),
  }),
  list_bikes: tool({
    category: "catalogo",
    description: "Catálogo completo de motos (bike_table).",
    input: empty,
    handler: async () => (await loadQueries()).getAllBikes(),
  }),
  list_categorias: tool({
    category: "inventario",
    description: "Categorías de inventario de repuestos.",
    input: empty,
    handler: async () => (await loadQueries()).getAllCategorias(),
  }),
  list_productos: tool({
    category: "inventario",
    description: "Productos de inventario (repuestos) con su categoría.",
    input: empty,
    handler: async () => (await loadQueries()).getAllProductos(),
  }),
  list_solicitudes_taller: tool({
    category: "taller",
    description: "Solicitudes de taller (repuestos, reparación, cambio de aceite).",
    input: empty,
    handler: async () => (await loadQueries()).getAllSolicitudesTaller(),
  }),
  list_visitadores: tool({
    category: "visitas",
    description: "Todos los visitadores registrados.",
    input: empty,
    handler: async () => (await loadQueries()).getAllVisitadores(),
  }),
  list_active_visitadores: tool({
    category: "visitas",
    description: "Visitadores activos con usuario, aptos para asignar visitas.",
    input: empty,
    handler: async () => (await loadQueries()).getActiveVisitadores(),
  }),
  list_garaje_parqueaderos: tool({
    category: "garaje",
    description: "Parqueaderos del garaje.",
    input: empty,
    handler: async () => (await loadQueries()).getAllGarajeParqueaderos(),
  }),
  list_garaje_motos: tool({
    category: "garaje",
    description: "Motos físicas en el garaje (inventario físico/recuperaciones).",
    input: empty,
    handler: async () => (await loadQueries()).getAllGarajeMotos(),
  }),
  list_vendidas: tool({
    category: "garaje",
    description:
      "Motos de crédito/renting entregadas (en calle) con estado físico y mora. NO son ventas de contado — para contado usa list_ventas_contado.",
    input: empty,
    handler: async () => (await loadQueries()).getAllVendidasMotos(),
  }),
  list_ventas_contado: tool({
    category: "lectura",
    description:
      "Ventas de motos al contado / abono en mostrador (tabla ventas_moto). Incluye cliente, modelo, placa, valorVenta, montoPagado y saldo.",
    input: z.object({
      query: z
        .string()
        .optional()
        .describe("Filtro opcional por nombre, cédula, placa, celular o modelo"),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    handler: async ({ query, limit }) => {
      const rows = await (await loadVentaMotoActions()).getVentasContado();
      const q = query?.trim().toLowerCase();
      const filtered = q
        ? rows.filter((r) =>
            [r.clienteNombre, r.clienteCedula, r.clienteCelular, r.placa, r.modelo, r.color]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
        : rows;
      return filtered.slice(0, limit ?? 100).map((r) => ({
        ...r,
        saldo:
          r.valorVenta != null
            ? Math.max(0, r.valorVenta - r.montoPagado)
            : null,
        estadoPago:
          r.valorVenta != null && r.montoPagado >= r.valorVenta
            ? "contado"
            : r.montoPagado > 0
              ? "abono"
              : "sin_pago",
      }));
    },
  }),
  list_ventas_producto: tool({
    category: "lectura",
    description:
      "Ventas de productos/repuestos de tienda (ventas_producto). Incluye ítems, total y montoPagado.",
    input: z.object({
      query: z
        .string()
        .optional()
        .describe("Filtro opcional por nombre, cédula o celular del cliente"),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    handler: async ({ query, limit }) => {
      const rows = await (
        await loadVentaProductoActions()
      ).listVentasProductoHistorial(limit ?? 100);
      const q = query?.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((r) =>
        [r.clienteNombre, r.clienteCedula, r.clienteCelular]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    },
  }),
  list_motos_credito_liquidado: tool({
    category: "lectura",
    description:
      "Motos de crédito ya saldadas (historial). Complementa list_ventas_contado y list_vendidas.",
    input: empty,
    handler: async () =>
      (await loadHistorialMotosActions()).listHistorialMotosCredito(),
  }),
  get_caja_hoy: tool({
    category: "lectura",
    description:
      "Sesión de caja de hoy (America/Bogota): apertura/cierre, movimientos, egresos e informe de recaudos. Null si aún no se abrió caja.",
    input: empty,
    handler: async () => (await loadCajaActions()).getCajaSesionHoy(),
  }),

  // ---------------------------------------------------------------- CRÉDITO
  approve_credit: tool({
    category: "credito",
    description:
      "Aprueba la solicitud de crédito de un cliente (users_documents → aceptada).",
    input: z.object({
      documentId: z.number().int().positive(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ documentId, userId }) =>
      (await loadAdminActions()).approveCredit(documentId, userId),
  }),
  reject_credit: tool({
    category: "credito",
    description:
      "Rechaza una solicitud de crédito con motivo. Si betado=true, el cliente queda vetado de reenviar.",
    input: z.object({
      documentId: z.number().int().positive(),
      userId: z.number().int().positive(),
      motivo: z.string().min(3),
      betado: z.boolean(),
    }),
    handler: async (args) => (await loadAdminActions()).rejectCredit(args),
  }),

  // ---------------------------------------------------------------- VISITAS
  assign_visit: tool({
    category: "visitas",
    description:
      "Asigna un visitador y fecha a una visita domiciliaria (estado → asignada).",
    input: z.object({
      visitaId: z.string().uuid(),
      userId: z.number().int().positive(),
      visitadorId: z.number().int().positive(),
      fechaProgramada: z
        .string()
        .min(1)
        .describe("Fecha/hora ISO 8601 de la visita"),
    }),
    handler: async (args) => (await loadAdminActions()).assignVisit(args),
  }),
  complete_visit: tool({
    category: "visitas",
    description: "Marca una visita como completada.",
    input: z.object({
      visitaId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ visitaId, userId }) =>
      (await loadAdminActions()).completeVisit(visitaId, userId),
  }),
  cancel_visit: tool({
    category: "visitas",
    description: "Cancela una visita.",
    input: z.object({
      visitaId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ visitaId, userId }) =>
      (await loadAdminActions()).cancelVisit(visitaId, userId),
  }),

  // ---------------------------------------------------------------- PAGOS
  confirm_payment_flag: tool({
    category: "pagos",
    description:
      "Marca/desmarca la confirmación del pago inicial o de la cuota de una compra (flags pago_inicial_confirmado / pago_cuota_confirmado).",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
      field: z.enum(["inicial", "cuota"]),
      value: z.boolean(),
    }),
    handler: async (args) => (await loadAdminActions()).confirmPayment(args),
  }),
  confirm_tarifa_pago: tool({
    category: "pagos",
    description:
      "Confirma el pago de una tarifa/cuota de renting (tarifas_pagadas → pagada con monto esperado).",
    input: z.object({
      tarifaId: z.string().uuid(),
      userId: z.number().int().positive(),
      notas: z.string().optional(),
    }),
    handler: async (args) => (await loadAdminActions()).confirmTarifaPago(args),
  }),
  register_payment: tool({
    category: "pagos",
    description:
      "Registra un pago confirmado con todos sus datos (sin comprobante adjunto). Contexto: 'tarifa' (requiere tarifaId y comprobante, no soportado por agente), 'inicial' o 'cuota_adelantada'. Aplica validación de referencia única por cliente.",
    input: z.object({
      userId: z.number().int().positive(),
      compraId: z.string().uuid(),
      contexto: z.enum(["tarifa", "inicial", "cuota_adelantada"]),
      tarifaId: z.string().uuid().optional(),
      referencia: z.string().optional(),
      monto: z.number().int().positive(),
      fechaComprobante: z.string().optional().describe("ISO 8601"),
      medioPagoAdmin: z.enum([
        "nequi_nicolas",
        "davivienda",
        "efectivo",
        "datafono",
      ]),
      bancoOrigen: z.enum([
        "nequi",
        "davivienda",
        "bancolombia",
        "banco_bogota",
        "pse",
        "otro",
      ]),
      entradaManual: z.boolean().default(true),
      notas: z.string().optional(),
    }),
    handler: async (args) => {
      const fd = new FormData();
      fd.set("userId", String(args.userId));
      fd.set("compraId", args.compraId);
      fd.set("contexto", args.contexto);
      if (args.tarifaId) fd.set("tarifaId", args.tarifaId);
      if (args.referencia) fd.set("referencia", args.referencia);
      fd.set("monto", String(args.monto));
      if (args.fechaComprobante) fd.set("fechaComprobante", args.fechaComprobante);
      fd.set("medioPagoAdmin", args.medioPagoAdmin);
      fd.set("bancoOrigen", args.bancoOrigen);
      fd.set("entradaManual", String(args.entradaManual));
      if (args.notas) fd.set("notas", args.notas);
      return (await loadPaymentActions()).confirmPagoConComprobante(fd);
    },
  }),
  check_referencia_usada: tool({
    category: "pagos",
    description:
      "Verifica si una referencia de pago ya fue usada por un cliente (anti-duplicado).",
    input: z.object({
      userId: z.number().int().positive(),
      referencia: z.string().min(1),
    }),
    handler: async (args) =>
      (await loadPaymentActions()).checkReferenciaPagoUsada(args),
  }),
  remove_pago_abono: tool({
    category: "pagos",
    description:
      "Elimina un abono del primer pago (contexto inicial o cuota_adelantada) si la compra no está entregada/cancelada.",
    input: z.object({
      pagoId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ pagoId, userId }) =>
      (await loadPaymentActions()).removePagoAbono(pagoId, userId),
  }),
  update_pago_abono: tool({
    category: "pagos",
    description:
      "Corrige monto, referencia, medio o concepto de un abono del primer pago (antes de entregar).",
    input: z.object({
      pagoId: z.string().uuid(),
      userId: z.number().int().positive(),
      monto: z.number().int().positive(),
      referencia: z.string().min(1),
      medioPagoAdmin: z.enum([
        "nequi_nicolas",
        "davivienda",
        "efectivo",
        "datafono",
      ]),
      contexto: z.enum(["inicial", "cuota_adelantada", "visita"]),
    }),
    handler: async (args) =>
      (await loadPaymentActions()).updatePagoAbono(args),
  }),

  // ---------------------------------------------------------------- ENTREGA
  update_delivery: tool({
    category: "entrega",
    description:
      "Registra los datos de entrega de la moto (placa, chasis, referencia, fecha de entrega).",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
      placa: z.string().min(1),
      chasis: z.string().min(1),
      referencia: z.string().optional(),
      fechaEntrega: z.string().min(1).describe("Fecha ISO/date de entrega"),
    }),
    handler: async (args) => (await loadAdminActions()).updateDelivery(args),
  }),
  mark_delivered: tool({
    category: "entrega",
    description: "Marca la compra como entregada (dispara generación de tarifas).",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ compraId, userId }) =>
      (await loadAdminActions()).markDelivered(compraId, userId),
  }),
  cancel_compra: tool({
    category: "entrega",
    description: "Cancela una compra de moto.",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ compraId, userId }) =>
      (await loadAdminActions()).cancelCompra(compraId, userId),
  }),
  update_vendida_estado_fisico: tool({
    category: "entrega",
    description:
      "Actualiza el estado físico de una moto ya entregada (activa, recogida, robada, en_transito, en_patio).",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
      estadoFisico: z.enum([
        "activa",
        "recogida",
        "robada",
        "en_transito",
        "en_patio",
      ]),
    }),
    handler: async (args) =>
      (await loadAdminActions()).updateVendidaEstadoFisico(args),
  }),
  delete_vendida_moto: tool({
    category: "entrega",
    description:
      "Elimina una compra entregada y sus motos de garaje asociadas. Acción destructiva.",
    input: z.object({
      compraId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async ({ compraId, userId }) =>
      (await loadAdminActions()).deleteVendidaMoto(compraId, userId),
  }),

  // ---------------------------------------------------------------- MORA / TRACKING
  set_tracking: tool({
    category: "mora",
    description: "Activa o desactiva el seguimiento GPS de un cliente.",
    input: z.object({
      userId: z.number().int().positive(),
      seguimiento: z.boolean(),
    }),
    handler: async ({ userId, seguimiento }) =>
      (await loadAdminActions()).setTracking(userId, seguimiento),
  }),
  resolve_moroso: tool({
    category: "mora",
    description:
      "Regulariza a un cliente moroso. Falla si quedan tarifas vencidas sin pagar.",
    input: z.object({
      morosoId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async (args) => (await loadAdminActions()).resolveMoroso(args),
  }),
  mark_moto_recogida: tool({
    category: "mora",
    description: "Marca una moto en cola de recogida como recogida.",
    input: z.object({
      recogerId: z.string().uuid(),
      userId: z.number().int().positive(),
    }),
    handler: async (args) => (await loadAdminActions()).markMotoRecogida(args),
  }),

  // ---------------------------------------------------------------- CLIENTES
  create_client: tool({
    category: "clientes",
    description:
      "Crea un usuario cliente por cédula (usuario=cédula, password=cédula, status normal).",
    input: z.object({
      cedula: z
        .string()
        .min(5)
        .max(15)
        .regex(/^\d+$/, "Solo dígitos"),
    }),
    handler: async ({ cedula }) =>
      (await loadAdminActions()).createClientUser({ cedula }),
  }),
  submit_public_application: tool({
    category: "clientes",
    description:
      "Envía una solicitud pública de crédito (documentos + hoja de vida). Requiere URLs ya subidas a Storage de cédula frente/reverso y selfie, más la hoja de vida completa.",
    input: z.object({
      documentFrontUrl: z.string().url(),
      documentBackUrl: z.string().url(),
      selfieUrl: z.string().url(),
      hojaVida: hojaVidaFormSchema,
    }),
    handler: async (args) =>
      (await loadClientActions()).submitPublicApplication(args),
  }),

  // ---------------------------------------------------------------- VISITADORES (CRUD)
  save_visitador: tool({
    category: "visitas",
    description:
      "Crea o edita un visitador. Al crear (sin id) se requieren username y password; se genera su usuario con status visitador.",
    input: z.object({
      id: z.number().int().positive().optional(),
      nombre: z.string().min(2),
      telefono: z.string().optional(),
      fotoUrl: z.string().optional(),
      activo: z.boolean(),
      username: z.string().min(3).optional(),
      password: z.string().min(4).optional(),
    }),
    handler: async (args) => (await loadAdminActions()).saveVisitador(args),
  }),
  delete_visitador: tool({
    category: "visitas",
    description: "Elimina un visitador y su usuario asociado.",
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }) => (await loadAdminActions()).deleteVisitador(id),
  }),

  // ---------------------------------------------------------------- CATÁLOGO (CRUD)
  save_bike: tool({
    category: "catalogo",
    description: "Crea o edita una moto del catálogo (bike_table).",
    input: z.object({
      id: z.number().int().positive().optional(),
      modelo: z.string().min(1),
      color: z.string().min(1),
      imagenUrl: z.string().optional(),
      stock: z.number().int().min(0),
      cuotaInicial: z.number().int().min(0),
      cuotaDiaria: z.number().int().min(0),
      montoVisita: z.number().int().min(0).default(MONTO_VISITA_DEFAULT),
      precioVenta: z.number().int().positive().optional().nullable(),
      descripcion: z.string().optional(),
      activo: z.boolean(),
    }),
    handler: async (args) => (await loadAdminActions()).saveBike(args),
  }),
  delete_bike: tool({
    category: "catalogo",
    description: "Elimina una moto del catálogo.",
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }) => (await loadAdminActions()).deleteBike(id),
  }),

  // ---------------------------------------------------------------- INVENTARIO (CRUD)
  save_categoria: tool({
    category: "inventario",
    description: "Crea o edita una categoría de inventario.",
    input: z.object({
      id: z.number().int().positive().optional(),
      nombre: z.string().min(1),
      slug: z.string().min(1),
      descripcion: z.string().optional(),
      activo: z.boolean(),
      orden: z.number().int().min(0),
    }),
    handler: async (args) => (await loadAdminActions()).saveCategoria(args),
  }),
  delete_categoria: tool({
    category: "inventario",
    description: "Elimina una categoría de inventario.",
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }) => (await loadAdminActions()).deleteCategoria(id),
  }),
  save_producto: tool({
    category: "inventario",
    description: "Crea o edita un producto/repuesto de inventario.",
    input: z.object({
      id: z.number().int().positive().optional(),
      categoriaId: z.number().int().positive(),
      sku: z.string().min(1),
      nombre: z.string().min(1),
      descripcion: z.string().optional(),
      precio: z.number().int().min(0),
      costo: z.number().int().min(0),
      stock: z.number().int().min(0),
      stockMinimo: z.number().int().min(0),
      imagenUrl: z.string().optional(),
      compatibleModelos: z.array(z.string()).optional(),
      activo: z.boolean(),
    }),
    handler: async (args) => (await loadAdminActions()).saveProducto(args),
  }),
  delete_producto: tool({
    category: "inventario",
    description: "Elimina un producto de inventario.",
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }) => (await loadAdminActions()).deleteProducto(id),
  }),

  // ---------------------------------------------------------------- TALLER
  update_solicitud_estado: tool({
    category: "taller",
    description:
      "Cambia el estado de una solicitud de taller y opcionalmente sus notas admin.",
    input: z.object({
      solicitudId: z.string().uuid(),
      estado: z.enum(["pendiente", "en_proceso", "completada", "cancelada"]),
      notasAdmin: z.string().optional(),
    }),
    handler: async (args) =>
      (await loadAdminActions()).updateSolicitudEstado(args),
  }),

  // ---------------------------------------------------------------- GARAJE (CRUD)
  save_garaje_parqueadero: tool({
    category: "garaje",
    description: "Crea o edita un parqueadero del garaje.",
    input: z.object({
      id: z.number().int().positive().optional(),
      nombre: z.string().min(1),
      slug: z.string().min(1),
      activo: z.boolean(),
      orden: z.number().int().min(0),
    }),
    handler: async (args) =>
      (await loadAdminActions()).saveGarajeParqueadero(args),
  }),
  delete_garaje_parqueadero: tool({
    category: "garaje",
    description:
      "Elimina un parqueadero. Falla si hay motos asignadas a él.",
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }) =>
      (await loadAdminActions()).deleteGarajeParqueadero(id),
  }),
  save_garaje_moto: tool({
    category: "garaje",
    description:
      "Crea o edita una moto física del garaje. Para registros manuales nuevos la foto de placa es obligatoria.",
    input: z.object({
      id: z.string().uuid().optional(),
      parqueaderoId: z.number().int().positive().nullable(),
      placa: z.string().optional(),
      placaFotoUrl: z.string().optional(),
      referencia: z.string().min(1),
      modelo: z.string().min(1),
      color: z.string().min(1),
      origen: z.enum(["manual", "recuperacion"]),
      condicion: z.enum(["nueva", "segunda_mano", "recuperada"]),
      estado: z.enum(["en_garaje", "disponible", "vendida", "baja"]),
      notas: z.string().optional(),
      isNewManual: z.boolean().optional(),
    }),
    handler: async (args) => (await loadAdminActions()).saveGarajeMoto(args),
  }),
  delete_garaje_moto: tool({
    category: "garaje",
    description: "Elimina una moto del garaje.",
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }) => (await loadAdminActions()).deleteGarajeMoto(id),
  }),
} satisfies Record<string, ToolDef>;

export type AgentToolName = keyof typeof AGENT_TOOLS;

export interface AgentToolSchema {
  name: string;
  category: AgentToolCategory;
  description: string;
  parameters: Record<string, unknown>;
}

function safeJsonSchema(input: z.ZodTypeAny): Record<string, unknown> {
  try {
    return z.toJSONSchema(input, { target: "draft-7" }) as Record<string, unknown>;
  } catch {
    return { type: "object", properties: {}, additionalProperties: true };
  }
}

/** Catálogo OpenAI/Hermes-compatible (function-calling) generado desde Zod. */
export function getAgentToolCatalog(): AgentToolSchema[] {
  return (Object.keys(AGENT_TOOLS) as AgentToolName[]).map((name) => {
    const def = AGENT_TOOLS[name];
    return {
      name,
      category: def.category,
      description: def.description,
      parameters: safeJsonSchema(def.input),
    };
  });
}

export interface DispatchResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Valida los argumentos y ejecuta la herramienta indicada. */
export async function dispatchAgentTool(
  name: string,
  args: unknown,
): Promise<DispatchResult> {
  const def = (AGENT_TOOLS as Record<string, ToolDef | undefined>)[name];
  if (!def) {
    return { ok: false, error: `Herramienta desconocida: ${name}` };
  }

  const parsed = def.input.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Argumentos inválidos: ${issues}` };
  }

  try {
    const result = await def.handler(parsed.data);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al ejecutar la herramienta.",
    };
  }
}
