"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { uploadAdminImage } from "@/lib/actions/upload-image";
import { isZonaMotoId } from "@/lib/taller/zonas-moto";
import { getOrdenTimerSeconds } from "@/lib/taller/timer-utils";
import type { MotivoPausa, OrdenTallerEstado, TareaGravedad } from "@/lib/taller/types";
import { MECANICO_COLORES } from "@/lib/taller/types";

type ActionOk<T extends object = object> = { ok: true } & T;
type ActionErr = { ok: false; error: string };
type ActionResult<T extends object = object> = ActionOk<T> | ActionErr;

async function assertAdmin() {
  const session = await requireAdminSession();
  return { supabase: createAdminClient(), session };
}

function revalidateTaller(ordenId?: string) {
  revalidatePath("/taller");
  revalidatePath("/taller/sebastian");
  revalidatePath("/taller/mecanicos");
  revalidatePath("/inventario");
  if (ordenId) revalidatePath(`/taller/${ordenId}`);
}

function errMsg(e: unknown, fallback: string) {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function actorName(session: { username?: string | null }) {
  return session.username?.trim() || "admin";
}

// ── Mecánicos ──────────────────────────────────────────────────────────────

const mecanicoSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "Escribe el nombre."),
  telefono: z.string().trim().optional(),
  activo: z.boolean().default(true),
  fotoUrl: z.string().url().nullable().optional(),
  color: z.string().trim().optional(),
});

export async function saveMecanico(
  input: z.infer<typeof mecanicoSchema>,
): Promise<ActionResult> {
  try {
    const parsed = mecanicoSchema.parse(input);
    const { supabase } = await assertAdmin();
    const payload = {
      nombre: parsed.nombre,
      telefono: parsed.telefono?.trim() || null,
      activo: parsed.activo,
      foto_url: parsed.fotoUrl ?? null,
      color:
        parsed.color?.trim() ||
        MECANICO_COLORES[
          Math.floor(Math.random() * MECANICO_COLORES.length)
        ],
    };

    if (parsed.id) {
      const { error } = await supabase
        .from("mecanicos")
        .update(payload)
        .eq("id", parsed.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("mecanicos").insert(payload);
      if (error) throw new Error(error.message);
    }

    revalidateTaller();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo guardar el mecánico.") };
  }
}

export async function deleteMecanico(id: number): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin();
    const { error } = await supabase
      .from("mecanicos")
      .update({ activo: false })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidateTaller();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo desactivar.") };
  }
}

// ── Órdenes ────────────────────────────────────────────────────────────────

const createOrdenSchema = z.object({
  userId: z.number().int().positive().optional(),
  userMotoCompraId: z.string().uuid().optional(),
  placa: z.string().trim().optional(),
  modelo: z.string().trim().min(1, "Escribe el modelo."),
  color: z.string().trim().optional(),
  contactoNombre: z.string().trim().optional(),
  contactoTelefono: z.string().trim().optional(),
  descripcionFalla: z.string().trim().optional(),
  kilometraje: z.number().int().nonnegative().optional(),
  mecanicoId: z.number().int().positive().optional(),
  fotos: z.array(z.string().url()).max(8).optional(),
});

export async function createOrdenTaller(
  input: z.infer<typeof createOrdenSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createOrdenSchema.parse(input);
    const { supabase, session } = await assertAdmin();

    const { data, error } = await supabase
      .from("ordenes_taller")
      .insert({
        user_id: parsed.userId ?? null,
        user_moto_compra_id: parsed.userMotoCompraId ?? null,
        placa: parsed.placa?.trim().toUpperCase() || null,
        modelo: parsed.modelo.trim(),
        color: parsed.color?.trim() || null,
        contacto_nombre: parsed.contactoNombre?.trim() || null,
        contacto_telefono: parsed.contactoTelefono?.trim() || null,
        descripcion_falla: parsed.descripcionFalla?.trim() || null,
        kilometraje: parsed.kilometraje ?? null,
        fotos: parsed.fotos ?? [],
        mecanico_id: parsed.mecanicoId ?? null,
        estado: "recibida",
        created_by: actorName(session),
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    if (parsed.mecanicoId) {
      const { error: assignErr } = await supabase.rpc(
        "taller_asignar_mecanico",
        {
          p_orden_id: data.id,
          p_mecanico_id: parsed.mecanicoId,
        },
      );
      if (assignErr) throw new Error(assignErr.message);
    }

    revalidateTaller(data.id);
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo crear la orden.") };
  }
}

export async function assignOrdenMecanico(input: {
  ordenId: string;
  mecanicoId: number | null;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const mecanicoId =
      input.mecanicoId == null
        ? null
        : z.number().int().positive().parse(input.mecanicoId);
    const { supabase } = await assertAdmin();

    const { error } = await supabase.rpc("taller_asignar_mecanico", {
      p_orden_id: ordenId,
      p_mecanico_id: mecanicoId,
    });
    if (error) throw new Error(error.message);

    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo asignar.") };
  }
}

export async function updateOrdenEstado(input: {
  ordenId: string;
  estado: OrdenTallerEstado;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const estado = z
      .enum(["en_reparacion", "lista", "entregada", "cancelada"])
      .parse(input.estado);
    const { supabase } = await assertAdmin();

    const { error } = await supabase.rpc("taller_cambiar_estado", {
      p_orden_id: ordenId,
      p_estado: estado,
    });
    if (error) throw new Error(error.message);

    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo cambiar el estado.") };
  }
}

export async function updateOrdenFotos(input: {
  ordenId: string;
  fotos: string[];
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const fotos = z.array(z.string().url()).max(8).parse(input.fotos);
    const { supabase } = await assertAdmin();
    const { error } = await supabase
      .from("ordenes_taller")
      .update({ fotos })
      .eq("id", ordenId);
    if (error) throw new Error(error.message);
    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudieron guardar las fotos.") };
  }
}

export async function subirFotoTaller(
  formData: FormData,
): Promise<ActionResult<{ publicUrl: string }>> {
  try {
    await requireAdminSession();
    formData.set("bucket", STORAGE_BUCKETS.tallerFotos);
    if (!formData.get("folder")) formData.set("folder", "ingresos");
    const result = await uploadAdminImage(formData);
    return { ok: true, publicUrl: result.publicUrl };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo subir la foto.") };
  }
}

// ── Tareas (zonas) ─────────────────────────────────────────────────────────

const addTareaSchema = z.object({
  ordenId: z.string().uuid(),
  zona: z.string().min(1),
  nota: z.string().trim().min(1, "Escribe qué se va a hacer."),
  gravedad: z.enum(["bien", "pronto", "urgente"]).optional(),
});

export async function addTarea(
  input: z.infer<typeof addTareaSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = addTareaSchema.parse(input);
    if (!isZonaMotoId(parsed.zona) && parsed.zona.length > 40) {
      throw new Error("Parte no válida.");
    }
    const { supabase, session } = await assertAdmin();
    const { data, error } = await supabase
      .from("orden_taller_zonas")
      .insert({
        orden_id: parsed.ordenId,
        zona: parsed.zona,
        nota: parsed.nota,
        gravedad: (parsed.gravedad as TareaGravedad | undefined) ?? "pronto",
        created_by: actorName(session),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidateTaller(parsed.ordenId);
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo guardar la tarea.") };
  }
}

/** @deprecated usar addTarea */
export async function upsertOrdenZona(input: {
  ordenId: string;
  zona: string;
  nota: string;
}): Promise<ActionResult> {
  const r = await addTarea(input);
  if (!r.ok) return r;
  return { ok: true };
}

export async function toggleTareaHecha(input: {
  ordenId: string;
  tareaId: string;
  hecho: boolean;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const tareaId = z.string().uuid().parse(input.tareaId);
    const { supabase } = await assertAdmin();
    const { error } = await supabase
      .from("orden_taller_zonas")
      .update({
        hecho: input.hecho,
        hecho_at: input.hecho ? new Date().toISOString() : null,
      })
      .eq("id", tareaId)
      .eq("orden_id", ordenId);
    if (error) throw new Error(error.message);
    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo actualizar.") };
  }
}

export async function removeTarea(input: {
  ordenId: string;
  tareaId: string;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const tareaId = z.string().uuid().parse(input.tareaId);
    const { supabase } = await assertAdmin();
    const { error } = await supabase
      .from("orden_taller_zonas")
      .delete()
      .eq("id", tareaId)
      .eq("orden_id", ordenId);
    if (error) throw new Error(error.message);
    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo borrar.") };
  }
}

export async function removeOrdenZona(input: {
  ordenId: string;
  zonaId: string;
}): Promise<ActionResult> {
  return removeTarea({ ordenId: input.ordenId, tareaId: input.zonaId });
}

// ── Repuestos ──────────────────────────────────────────────────────────────

const addRepuestoSchema = z
  .object({
    ordenId: z.string().uuid(),
    productoId: z.number().int().positive().optional(),
    descripcion: z.string().trim().optional(),
    cantidad: z.number().int().positive().default(1),
    zona: z.string().optional(),
    notas: z.string().trim().optional(),
  })
  .refine(
    (v) => v.productoId != null || (v.descripcion?.trim()?.length ?? 0) > 0,
    { message: "Elige un producto o escribe qué falta." },
  );

export async function addOrdenRepuesto(
  input: z.infer<typeof addRepuestoSchema>,
): Promise<ActionResult<{ stockWarning: string | null }>> {
  try {
    const parsed = addRepuestoSchema.parse(input);
    const { supabase, session } = await assertAdmin();

    let stockWarning: string | null = null;
    if (parsed.productoId) {
      const { data: producto } = await supabase
        .from("inventario_productos")
        .select("id, nombre, stock")
        .eq("id", parsed.productoId)
        .maybeSingle();
      if (!producto) throw new Error("Producto no encontrado.");
      if ((producto.stock as number) < parsed.cantidad) {
        stockWarning = `Hay ${producto.stock}. Sebastian puede esperar a que llegue.`;
      }
    }

    const { error } = await supabase.from("orden_taller_repuestos").insert({
      orden_id: parsed.ordenId,
      producto_id: parsed.productoId ?? null,
      descripcion: parsed.descripcion?.trim() || null,
      cantidad: parsed.cantidad,
      zona: parsed.zona || null,
      notas: parsed.notas?.trim() || null,
      estado: "solicitado",
      created_by: actorName(session),
    });
    if (error) throw new Error(error.message);

    revalidateTaller(parsed.ordenId);
    return { ok: true, stockWarning };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo pedir el repuesto.") };
  }
}

export async function updateOrdenRepuesto(input: {
  repuestoId: string;
  ordenId: string;
  productoId?: number;
  descripcion?: string;
  cantidad: number;
  zona?: string;
  notas?: string;
}): Promise<ActionResult> {
  try {
    const repuestoId = z.string().uuid().parse(input.repuestoId);
    const ordenId = z.string().uuid().parse(input.ordenId);
    const cantidad = z.number().int().positive().parse(input.cantidad);
    const { supabase } = await assertAdmin();

    const { data: item } = await supabase
      .from("orden_taller_repuestos")
      .select("estado")
      .eq("id", repuestoId)
      .maybeSingle();
    if (!item) throw new Error("Este pedido ya no existe.");
    if (item.estado === "aprobado") {
      throw new Error("Ya está aprobado. No se puede editar.");
    }

    const { error } = await supabase
      .from("orden_taller_repuestos")
      .update({
        producto_id: input.productoId ?? null,
        descripcion: input.descripcion?.trim() || null,
        cantidad,
        zona: input.zona || null,
        notas: input.notas?.trim() || null,
        estado: "solicitado",
        motivo_rechazo: null,
        rechazado_por: null,
        rechazado_at: null,
      })
      .eq("id", repuestoId);
    if (error) throw new Error(error.message);

    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo corregir.") };
  }
}

export async function corregirRepuesto(input: {
  repuestoId: string;
  ordenId: string;
  productoId?: number;
  descripcion?: string;
  cantidad: number;
}): Promise<ActionResult> {
  return updateOrdenRepuesto(input);
}

export async function removeOrdenRepuesto(
  repuestoId: string,
  ordenId: string,
): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin();
    const { data: item } = await supabase
      .from("orden_taller_repuestos")
      .select("id, producto_id, cantidad, estado")
      .eq("id", repuestoId)
      .maybeSingle();
    if (!item) throw new Error("Este pedido ya no existe.");

    if (item.estado === "aprobado") {
      const { error: revErr } = await supabase.rpc("taller_revertir_repuesto", {
        p_repuesto_id: repuestoId,
      });
      if (revErr) throw new Error(revErr.message);
    }

    const { error } = await supabase
      .from("orden_taller_repuestos")
      .delete()
      .eq("id", repuestoId);
    if (error) throw new Error(error.message);

    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo quitar.") };
  }
}

export async function aprobarOrdenRepuesto(input: {
  repuestoId: string;
}): Promise<ActionResult> {
  try {
    const repuestoId = z.string().uuid().parse(input.repuestoId);
    const { supabase, session } = await assertAdmin();
    const { error } = await supabase.rpc("taller_aprobar_repuesto", {
      p_repuesto_id: repuestoId,
      p_por: actorName(session),
    });
    if (error) throw new Error(error.message);
    revalidateTaller();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo aprobar.") };
  }
}

export async function rechazarOrdenRepuesto(input: {
  repuestoId: string;
  motivo: string;
}): Promise<ActionResult> {
  try {
    const repuestoId = z.string().uuid().parse(input.repuestoId);
    const motivo = z
      .string()
      .trim()
      .min(1, "Di por qué no.")
      .parse(input.motivo);
    const { supabase, session } = await assertAdmin();

    const { data: item } = await supabase
      .from("orden_taller_repuestos")
      .select("id, orden_id, estado")
      .eq("id", repuestoId)
      .maybeSingle();
    if (!item) throw new Error("Este pedido ya no existe.");
    if (item.estado !== "solicitado") {
      throw new Error("Solo se pueden rechazar pedidos pendientes.");
    }

    const { error } = await supabase
      .from("orden_taller_repuestos")
      .update({
        estado: "rechazado",
        motivo_rechazo: motivo,
        rechazado_por: actorName(session),
        rechazado_at: new Date().toISOString(),
      })
      .eq("id", repuestoId);
    if (error) throw new Error(error.message);

    revalidateTaller(item.orden_id as string);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo rechazar.") };
  }
}

export async function aprobarTodosRepuestosOrden(input: {
  ordenId: string;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const { supabase, session } = await assertAdmin();
    const { data: pendientes } = await supabase
      .from("orden_taller_repuestos")
      .select("id")
      .eq("orden_id", ordenId)
      .eq("estado", "solicitado");

    for (const item of pendientes ?? []) {
      const { error } = await supabase.rpc("taller_aprobar_repuesto", {
        p_repuesto_id: item.id,
        p_por: actorName(session),
      });
      if (error) throw new Error(error.message);
    }

    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudieron aprobar todos.") };
  }
}

export async function deshacerDecisionRepuesto(input: {
  repuestoId: string;
}): Promise<ActionResult> {
  try {
    const repuestoId = z.string().uuid().parse(input.repuestoId);
    const { supabase } = await assertAdmin();
    const { error } = await supabase.rpc("taller_revertir_repuesto", {
      p_repuesto_id: repuestoId,
    });
    if (error) throw new Error(error.message);
    revalidateTaller();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo deshacer.") };
  }
}

// ── Cronómetro ─────────────────────────────────────────────────────────────

export async function startOrdenTimer(input: {
  ordenId: string;
}): Promise<ActionResult<{ pausadas: number }>> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const { supabase } = await assertAdmin();
    const { data, error } = await supabase.rpc("taller_timer_start", {
      p_orden_id: ordenId,
    });
    if (error) throw new Error(error.message);
    revalidateTaller(ordenId);
    return { ok: true, pausadas: (data as number) ?? 0 };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo empezar.") };
  }
}

export async function pauseOrdenTimer(input: {
  ordenId: string;
  motivo?: MotivoPausa | string | null;
}): Promise<ActionResult> {
  try {
    const ordenId = z.string().uuid().parse(input.ordenId);
    const { supabase } = await assertAdmin();
    const { error } = await supabase.rpc("taller_timer_stop", {
      p_orden_id: ordenId,
      p_motivo: input.motivo?.trim() || null,
    });
    if (error) throw new Error(error.message);
    revalidateTaller(ordenId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, "No se pudo pausar.") };
  }
}

export async function stopOrdenTimer(input: {
  ordenId: string;
  motivo?: string | null;
}): Promise<ActionResult> {
  return pauseOrdenTimer(input);
}

export async function getOrdenTimerSnapshot(ordenId: string) {
  const { supabase } = await assertAdmin();
  const { data, error } = await supabase
    .from("ordenes_taller")
    .select("timer_running, timer_started_at, segundos_acumulados")
    .eq("id", ordenId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No encontramos esta moto.");
  return {
    seconds: getOrdenTimerSeconds({
      timer_running: data.timer_running as boolean,
      timer_started_at: data.timer_started_at as string | null,
      segundos_acumulados: data.segundos_acumulados as number,
    }),
    running: data.timer_running as boolean,
    serverNow: Date.now(),
  };
}

export async function buscarClienteTallerAction(q: string) {
  await requireAdminSession();
  const { buscarClienteParaTaller } = await import("@/lib/taller/queries");
  return buscarClienteParaTaller(q);
}

export async function historialPlacaAction(placa: string) {
  await requireAdminSession();
  const { getHistorialPorPlaca } = await import("@/lib/taller/queries");
  return getHistorialPorPlaca(placa);
}
