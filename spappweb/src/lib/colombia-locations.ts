import { getDepartamentos, getMunicipios } from "colombia-territorial";

export const DEPARTAMENTO_DEFAULT = "Santander";
export const CIUDAD_DEFAULT = "Bucaramanga";

export function listDepartamentos(): string[] {
  return getDepartamentos()
    .map((d) => d.nombre)
    .sort((a, b) => a.localeCompare(b, "es"));
}

export function listCiudades(departamento: string): string[] {
  if (!departamento) return [];
  return getMunicipios(departamento)
    .map((m) => m.nombre)
    .sort((a, b) => a.localeCompare(b, "es"));
}
