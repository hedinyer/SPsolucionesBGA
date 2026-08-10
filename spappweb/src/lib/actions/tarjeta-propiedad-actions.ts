"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TarjetaPropiedadRow } from "@/lib/pipeline/types";

const createTarjetaSchema = z.object({
  placa: z
    .string()
    .trim()
    .min(5, "Indica una placa válida")
    .transform((v) => v.toUpperCase().replace(/\s+/g, "")),
  imagen_url: z.string().trim().min(1, "Foto del frente obligatoria"),
  imagen_reverso_url: z.string().trim().min(1, "Foto del reverso obligatoria"),
});

export type CreateTarjetaPropiedadInput = z.infer<typeof createTarjetaSchema>;

function toRow(raw: Record<string, unknown>): TarjetaPropiedadRow {
  return {
    id: String(raw.id),
    numero_licencia: raw.numero_licencia != null ? String(raw.numero_licencia) : null,
    placa: raw.placa != null ? String(raw.placa) : null,
    marca: raw.marca != null ? String(raw.marca) : null,
    linea: raw.linea != null ? String(raw.linea) : null,
    modelo: raw.modelo != null ? String(raw.modelo) : null,
    cilindrada: raw.cilindrada != null ? String(raw.cilindrada) : null,
    color: raw.color != null ? String(raw.color) : null,
    servicio: raw.servicio != null ? String(raw.servicio) : null,
    clase_vehiculo: raw.clase_vehiculo != null ? String(raw.clase_vehiculo) : null,
    tipo_carroceria: raw.tipo_carroceria != null ? String(raw.tipo_carroceria) : null,
    combustible: raw.combustible != null ? String(raw.combustible) : null,
    capacidad: raw.capacidad != null ? String(raw.capacidad) : null,
    numero_motor: raw.numero_motor != null ? String(raw.numero_motor) : null,
    motor_reg: raw.motor_reg != null ? String(raw.motor_reg) : null,
    vin: raw.vin != null ? String(raw.vin) : null,
    numero_serie: raw.numero_serie != null ? String(raw.numero_serie) : null,
    serie_reg: raw.serie_reg != null ? String(raw.serie_reg) : null,
    numero_chasis: raw.numero_chasis != null ? String(raw.numero_chasis) : null,
    chasis_reg: raw.chasis_reg != null ? String(raw.chasis_reg) : null,
    propietario: raw.propietario != null ? String(raw.propietario) : null,
    identificacion_tipo:
      raw.identificacion_tipo != null ? String(raw.identificacion_tipo) : null,
    identificacion_numero:
      raw.identificacion_numero != null
        ? String(raw.identificacion_numero)
        : null,
    imagen_url: String(raw.imagen_url),
    imagen_reverso_url:
      raw.imagen_reverso_url != null ? String(raw.imagen_reverso_url) : null,
    raw_ocr_text: raw.raw_ocr_text != null ? String(raw.raw_ocr_text) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

export async function createTarjetaPropiedad(
  input: CreateTarjetaPropiedadInput,
): Promise<TarjetaPropiedadRow> {
  await requireAdminSession();
  const parsed = createTarjetaSchema.parse(input);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tarjetas_propiedad")
    .insert({
      placa: parsed.placa,
      imagen_url: parsed.imagen_url,
      imagen_reverso_url: parsed.imagen_reverso_url,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Ya existe una tarjeta con placa ${parsed.placa}.`);
    }
    throw new Error(error.message);
  }

  revalidatePath("/tarjetas-propiedad");
  revalidatePath("/licencias");
  return toRow(data as Record<string, unknown>);
}

export async function deleteTarjetaPropiedad(id: string): Promise<void> {
  await requireAdminSession();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tarjetas_propiedad")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/tarjetas-propiedad");
  revalidatePath("/licencias");
}
