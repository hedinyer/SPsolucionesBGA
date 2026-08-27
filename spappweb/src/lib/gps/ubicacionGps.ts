export type ProveedorGps = "system_track" | "iopgps" | "dstrack";

export type AccionMotorGps = "bloquear" | "desbloquear";

export type UbicacionGpsMoto = {
  proveedor: ProveedorGps;
  /** ID numérico del dispositivo en su plataforma. */
  deviceId: number;
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  time: string;
  online: string;
  coords: string;
  bloqueado: boolean;
  nombreDispositivo: string;
  /** Cuenta IOP (appid) que reportó el dispositivo, para comandos. */
  iopCuenta?: string;
};

export function resolverProveedorGps(raw: string | null | undefined): ProveedorGps {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, " ");
  if (s.includes("system")) return "system_track";
  if (s.includes("dstrack") || s.includes("ds track") || s.includes("traccar")) {
    return "dstrack";
  }
  return "iopgps";
}

export function etiquetaProveedorGps(proveedor: ProveedorGps): string {
  if (proveedor === "iopgps") return "IOP GPS";
  if (proveedor === "dstrack") return "DS Track";
  return "System Track";
}

/** Valor para columna `gps_moto` según el dispositivo elegido. */
export function gpsMotoDesdeProveedor(proveedor: ProveedorGps): string {
  if (proveedor === "iopgps") return "iop gps";
  if (proveedor === "dstrack") return "ds track";
  return "system track";
}

export function etiquetaEstadoGps(online: string): string {
  switch (online.toLowerCase()) {
    case "online":
      return "En línea";
    case "ack":
      return "Conectado";
    case "offline":
      return "Sin señal";
    default:
      return online || "Desconocido";
  }
}

/** Intervalo de consulta en vivo (ms). System Track suele refrescar más rápido que IOP. */
export function intervaloPollGpsEnVivo(proveedor: ProveedorGps): number {
  return proveedor === "iopgps" ? 3000 : 2000;
}

/** Duración inicial de interpolación entre fixes GPS (ms), antes de medir intervalos reales. */
export function duracionAnimacionGpsInicial(proveedor: ProveedorGps): number {
  return proveedor === "iopgps" ? 9000 : 6000;
}

export function etiquetaIntervaloPollGps(proveedor: ProveedorGps): string {
  const s = intervaloPollGpsEnVivo(proveedor) / 1000;
  return s % 1 === 0 ? `${s} s` : `${s.toFixed(1).replace(".", ",")} s`;
}

export function deviceIdDesdeImei(imei: string): number {
  const digits = imei.replace(/\D/g, "");
  const n = parseInt(digits.slice(-9) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function prioridadConexionGps(online: string): number {
  switch (online.toLowerCase()) {
    case "online":
      return 3;
    case "ack":
      return 2;
    case "offline":
      return 1;
    default:
      return 0;
  }
}

/** GPS reportando señal reciente (en línea o conectado, no offline). */
export function gpsConectadoFuncional(online: string): boolean {
  const o = online.toLowerCase();
  return o === "online" || o === "ack";
}

export function preferirDispositivoGps(
  actual: UbicacionGpsMoto,
  candidato: UbicacionGpsMoto,
): UbicacionGpsMoto {
  const diff =
    prioridadConexionGps(candidato.online) -
    prioridadConexionGps(actual.online);
  if (diff !== 0) return diff > 0 ? candidato : actual;
  return candidato.time >= actual.time ? candidato : actual;
}

/** ponytail: falla si un valor de gps_moto no resuelve al proveedor esperado. */
export function runUbicacionGpsSelfCheck(): void {
  if (resolverProveedorGps("iop gps") !== "iopgps") {
    throw new Error("resolverProveedorGps debe reconocer IOP GPS");
  }
  if (resolverProveedorGps("ds track") !== "dstrack") {
    throw new Error("resolverProveedorGps debe reconocer DS Track");
  }
  if (resolverProveedorGps("dstrack") !== "dstrack") {
    throw new Error("resolverProveedorGps debe reconocer dstrack");
  }
  if (resolverProveedorGps("system track") !== "system_track") {
    throw new Error("resolverProveedorGps debe reconocer System Track");
  }
  if (etiquetaProveedorGps("dstrack") !== "DS Track") {
    throw new Error("etiquetaProveedorGps debe etiquetar DS Track");
  }
  if (gpsMotoDesdeProveedor("dstrack") !== "ds track") {
    throw new Error("gpsMotoDesdeProveedor debe devolver ds track");
  }
  if (resolverProveedorGps("ds-track") !== "dstrack") {
    throw new Error("resolverProveedorGps debe reconocer ds-track");
  }
}
