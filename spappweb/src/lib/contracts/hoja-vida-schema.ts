import { z } from "zod";

export const TIPO_IDENTIFICACION = ["ppt", "cc", "p", "cv"] as const;
export const ESTADO_CIVIL = ["soltero", "casado", "union_libre"] as const;

export type TipoIdentificacion = (typeof TIPO_IDENTIFICACION)[number];
export type EstadoCivil = (typeof ESTADO_CIVIL)[number];

export const referenciaSchema = z.object({
  nombre: z.string(),
  celular: z.string(),
});

export const hojaVidaFormSchema = z.object({
  nombre_completo: z.string(),
  tipo_identificacion: z.enum(TIPO_IDENTIFICACION).nullable(),
  numero_identificacion: z.string(),
  fecha_nacimiento: z.string(),
  celular: z.string(),
  direccion: z.string(),
  barrio: z.string(),
  correo: z.string(),
  trabaja_empresa: z.boolean().nullable(),
  nombre_empresa: z.string(),
  telefono_empresa: z.string(),
  direccion_empresa: z.string(),
  independiente: z.boolean().nullable(),
  habilidad: z.string(),
  estado_civil: z.enum(ESTADO_CIVIL).nullable(),
  nombre_conyuge: z.string(),
  celular_conyuge: z.string(),
  referencias: z.array(referenciaSchema).length(2),
});

export type HojaVidaFormData = z.infer<typeof hojaVidaFormSchema>;

export const emptyHojaVidaForm = (): HojaVidaFormData => ({
  nombre_completo: "",
  tipo_identificacion: null,
  numero_identificacion: "",
  fecha_nacimiento: "",
  celular: "",
  direccion: "",
  barrio: "",
  correo: "",
  trabaja_empresa: null,
  nombre_empresa: "",
  telefono_empresa: "",
  direccion_empresa: "",
  independiente: null,
  habilidad: "",
  estado_civil: null,
  nombre_conyuge: "",
  celular_conyuge: "",
  referencias: [
    { nombre: "", celular: "" },
    { nombre: "", celular: "" },
  ],
});

export function parseHojaVidaForm(raw: Record<string, unknown>): HojaVidaFormData {
  const refsRaw = raw.referencias;
  const refs =
    Array.isArray(refsRaw) && refsRaw.length > 0
      ? refsRaw.map((r) => {
          const item = r as Record<string, unknown>;
          return {
            nombre: String(item.nombre ?? ""),
            celular: String(item.celular ?? ""),
          };
        })
      : [{ nombre: "", celular: "" }, { nombre: "", celular: "" }];

  while (refs.length < 2) {
    refs.push({ nombre: "", celular: "" });
  }

  const tipo = raw.tipo_identificacion;
  const estado = raw.estado_civil;

  return {
    nombre_completo: String(raw.nombre_completo ?? ""),
    tipo_identificacion: TIPO_IDENTIFICACION.includes(tipo as TipoIdentificacion)
      ? (tipo as TipoIdentificacion)
      : null,
    numero_identificacion: String(raw.numero_identificacion ?? ""),
    fecha_nacimiento: String(raw.fecha_nacimiento ?? ""),
    celular: String(raw.celular ?? ""),
    direccion: String(raw.direccion ?? ""),
    barrio: String(raw.barrio ?? ""),
    correo: String(raw.correo ?? ""),
    trabaja_empresa:
      typeof raw.trabaja_empresa === "boolean" ? raw.trabaja_empresa : null,
    nombre_empresa: String(raw.nombre_empresa ?? ""),
    telefono_empresa: String(raw.telefono_empresa ?? ""),
    direccion_empresa: String(raw.direccion_empresa ?? ""),
    independiente:
      typeof raw.independiente === "boolean" ? raw.independiente : null,
    habilidad: String(raw.habilidad ?? ""),
    estado_civil: ESTADO_CIVIL.includes(estado as EstadoCivil)
      ? (estado as EstadoCivil)
      : null,
    nombre_conyuge: String(raw.nombre_conyuge ?? ""),
    celular_conyuge: String(raw.celular_conyuge ?? ""),
    referencias: refs.slice(0, 2) as HojaVidaFormData["referencias"],
  };
}

export function hojaVidaFormToJson(form: HojaVidaFormData): Record<string, unknown> {
  return {
    nombre_completo: form.nombre_completo,
    tipo_identificacion: form.tipo_identificacion,
    numero_identificacion: form.numero_identificacion,
    fecha_nacimiento: form.fecha_nacimiento,
    celular: form.celular,
    direccion: form.direccion,
    barrio: form.barrio,
    correo: form.correo,
    trabaja_empresa: form.trabaja_empresa,
    nombre_empresa: form.nombre_empresa,
    telefono_empresa: form.telefono_empresa,
    direccion_empresa: form.direccion_empresa,
    independiente: form.independiente,
    habilidad: form.habilidad,
    estado_civil: form.estado_civil,
    nombre_conyuge: form.nombre_conyuge,
    celular_conyuge: form.celular_conyuge,
    referencias: form.referencias,
  };
}

export function buildDireccionNotificaciones(hoja: HojaVidaFormData): string {
  const calle = hoja.direccion.trim();
  const barrio = hoja.barrio.trim();
  if (!calle) return "";
  if (!barrio) return calle;
  return `${calle}, barrio ${barrio}`;
}

/** Abreviatura en firma/PDF: PPT, C.C., PV, CV. */
export function documentoAbreviatura(
  tipo: TipoIdentificacion | string | null | undefined,
): string {
  switch (tipo) {
    case "ppt":
      return "PPT";
    case "p":
      return "PV";
    case "cv":
      return "CV";
    case "cc":
    default:
      return "C.C.";
  }
}

/** Campos personales del contrato que salen de la hoja de vida. */
export function patchContratoDataFromHoja(
  contratoData: Record<string, unknown> | null | undefined,
  hoja: HojaVidaFormData,
): Record<string, unknown> {
  return {
    ...(contratoData ?? {}),
    nombre_contratante: hoja.nombre_completo.trim(),
    cedula_contratante: hoja.numero_identificacion.trim(),
    tipo_documento_contratante: hoja.tipo_identificacion,
    direccion_notificaciones: buildDireccionNotificaciones(hoja),
  };
}

export const TIPO_IDENTIFICACION_LABELS: Record<TipoIdentificacion, string> = {
  ppt: "Permiso Temporal de Permanencia (PPT)",
  cc: "Cédula de Ciudadanía (CC)",
  p: "Pasaporte Venezolano (PV)",
  cv: "Cédula Venezolana (CV)",
};

export const ESTADO_CIVIL_LABELS: Record<EstadoCivil, string> = {
  soltero: "Soltero(a)",
  casado: "Casado(a)",
  union_libre: "Unión libre",
};
