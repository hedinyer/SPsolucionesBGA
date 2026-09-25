import type { ClientSearchResult } from "@/lib/pipeline/types";

export const JHON_FECHA_DESDE = "2026-09-17";
export const JHON_FECHA_HASTA = "2026-09-20";

export type JhonCliente = ClientSearchResult & {
  celular: string | null;
  montoAdeudado: number;
};
