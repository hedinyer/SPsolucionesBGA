export type TitularidadHistorialEntry = {
  from_user_id: number;
  to_user_id: number;
  from_user: string;
  to_user: string;
  motivo: string | null;
  at: string;
  by: string | null;
};

export function assertCanTransferTitularidad(input: {
  fromUserId: number;
  toUserId: number;
  compraEstado: string | null | undefined;
  destinoTieneCompra: boolean;
  destinoExiste: boolean;
}): void {
  if (!input.destinoExiste) {
    throw new Error("Cliente destino no encontrado.");
  }
  if (input.fromUserId === input.toUserId) {
    throw new Error("El destino debe ser otro cliente.");
  }
  if (!input.compraEstado) {
    throw new Error("El cliente origen no tiene compra.");
  }
  if (input.compraEstado === "cancelada") {
    throw new Error("No se puede transferir una compra cancelada.");
  }
  if (input.destinoTieneCompra) {
    throw new Error("El destino ya tiene una moto asignada.");
  }
}

export function appendTitularidadHistorial(
  adminData: Record<string, unknown> | null | undefined,
  entry: TitularidadHistorialEntry,
): Record<string, unknown> {
  const prev = adminData ?? {};
  const raw = prev.titularidad_historial;
  const hist = Array.isArray(raw)
    ? [...(raw as TitularidadHistorialEntry[])]
    : [];
  hist.push(entry);
  return { ...prev, titularidad_historial: hist };
}

export function parseTitularidadHistorial(
  adminData: Record<string, unknown> | null | undefined,
): TitularidadHistorialEntry[] {
  const raw = adminData?.titularidad_historial;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is TitularidadHistorialEntry =>
      e != null &&
      typeof e === "object" &&
      typeof (e as TitularidadHistorialEntry).from_user_id === "number" &&
      typeof (e as TitularidadHistorialEntry).to_user_id === "number",
  );
}
