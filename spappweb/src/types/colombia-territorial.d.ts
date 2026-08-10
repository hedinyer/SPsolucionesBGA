declare module "colombia-territorial" {
  export interface Municipio {
    nombre: string;
    codigo_dane: string;
  }

  export interface Departamento {
    nombre: string;
    codigo_dane: string;
    capital: string;
    municipios: Municipio[];
  }

  export function getDepartamentos(): Departamento[];
  export function getMunicipios(departamento: string): Municipio[];
}
