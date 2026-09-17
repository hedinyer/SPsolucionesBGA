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
