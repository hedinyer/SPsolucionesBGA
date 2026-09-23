export const CONTADO_TIPO_DOC = ["cc", "ppt", "p", "nit"] as const;
export type ContadoTipoDocumento = (typeof CONTADO_TIPO_DOC)[number];

export const CONTADO_TIPO_DOC_LABELS: Record<ContadoTipoDocumento, string> = {
  cc: "Cédula",
  ppt: "PPT",
  p: "Pasaporte vigente",
  nit: "NIT",
};

export function contadoNombreLabel(tipo: ContadoTipoDocumento): string {
  return tipo === "nit" ? "Razón social" : "Nombre del cliente";
}

export function contadoDocumentoLabel(tipo: ContadoTipoDocumento): string {
  return tipo === "nit" ? "NIT" : "Número de documento";
}

export interface ContadoClienteMatch {
  id: string;
  clienteNombre: string;
  clienteCedula: string;
  clienteCelular: string;
  clienteTipoDocumento: ContadoTipoDocumento;
  clienteDireccion: string;
  clienteCorreo: string;
  clienteFotoUrl: string | null;
  origen: "contado" | "credito";
}

export function toContadoTipoDocumento(
  raw: string | null | undefined,
): ContadoTipoDocumento {
  const v = raw?.trim().toLowerCase();
  if (v && CONTADO_TIPO_DOC.includes(v as ContadoTipoDocumento)) {
    return v as ContadoTipoDocumento;
  }
  return "cc";
}

export function contadoClienteKey(cedula: string, nombre: string): string {
  const doc = cedula.replace(/\D/g, "") || cedula.trim().toLowerCase();
  const name = nombre.trim().toLowerCase();
  return doc || name;
}

export function contadoClienteFotoFolder(cedula: string): string {
  const slug =
    cedula
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cliente";
  return `ventas-contado/${slug}`;
}
