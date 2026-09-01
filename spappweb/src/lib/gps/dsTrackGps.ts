import "server-only";

import {
  extraerPlacasDeTexto,
  normalizarPlaca,
  variantesPlaca,
} from "@/lib/gps/placaGps";
import {
  prioridadConexionGps,
  type AccionMotorGps,
  type UbicacionGpsMoto,
} from "@/lib/gps/ubicacionGps";

const DSTRACK_BASE_URL = "https://dstrack.uno";
const DSTRACK_USER = "solucionespinilla";
const DSTRACK_PASSWORD = "SPinilla91222";
const DSTRACK_BASIC = Buffer.from(
  `${DSTRACK_USER}:${DSTRACK_PASSWORD}`,
  "utf8",
).toString("base64");

const CACHE_TTL_MS = 45_000;
const NUDOS_A_KMH = 1.852;

type DsDevice = {
  id?: number;
  name?: string;
  uniqueId?: string;
  status?: string;
  lastUpdate?: string;
  disabled?: boolean;
  attributes?: { plate?: string };
};

type DsPosition = {
  deviceId?: number;
  latitude?: number;
  longitude?: number;
  speed?: number;
  course?: number;
  deviceTime?: string;
  fixTime?: string;
  serverTime?: string;
  attributes?: { blocked?: boolean };
};

type DsDeviceIndex = {
  deviceId: number;
  imei: string;
  nombre: string;
  status: string;
  lastUpdate: string;
};

let cacheDispositivos: {
  fetchedAt: number;
  porPlaca: Map<string, DsDeviceIndex>;
  porDeviceId: Map<number, DsDeviceIndex>;
  porImei: Map<string, DsDeviceIndex>;
} | null = null;

function formatFechaGps(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function mapearEstadoOnline(status: string): string {
  const st = status.trim().toLowerCase();
  if (st === "online") return "online";
  if (st === "offline") return "offline";
  return "ack";
}

function preferirIndex(actual: DsDeviceIndex, candidato: DsDeviceIndex): DsDeviceIndex {
  const diff =
    prioridadConexionGps(mapearEstadoOnline(candidato.status)) -
    prioridadConexionGps(mapearEstadoOnline(actual.status));
  if (diff !== 0) return diff > 0 ? candidato : actual;
  return candidato.lastUpdate >= actual.lastUpdate ? candidato : actual;
}

async function fetchDs<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${DSTRACK_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${DSTRACK_BASIC}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`DS Track respondió ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function indexarDispositivo(
  device: DsDevice,
  destino: {
    porPlaca: Map<string, DsDeviceIndex>;
    porDeviceId: Map<number, DsDeviceIndex>;
    porImei: Map<string, DsDeviceIndex>;
  },
): void {
  const deviceId = Number(device.id);
  if (!Number.isFinite(deviceId) || deviceId <= 0 || device.disabled) return;

  const index: DsDeviceIndex = {
    deviceId,
    imei: String(device.uniqueId ?? "").trim(),
    nombre: String(device.name ?? "").trim() || String(device.uniqueId ?? "").trim(),
    status: String(device.status ?? "").trim() || "offline",
    lastUpdate: String(device.lastUpdate ?? ""),
  };

  const prevId = destino.porDeviceId.get(deviceId);
  destino.porDeviceId.set(
    deviceId,
    prevId ? preferirIndex(prevId, index) : index,
  );
  if (index.imei) destino.porImei.set(index.imei, index);

  const textos = [index.nombre, String(device.attributes?.plate ?? "")];
  for (const texto of textos) {
    for (const placa of extraerPlacasDeTexto(texto)) {
      const existente = destino.porPlaca.get(placa);
      destino.porPlaca.set(
        placa,
        existente ? preferirIndex(existente, index) : index,
      );
    }
  }
}

async function cargarIndiceDispositivos(): Promise<{
  porPlaca: Map<string, DsDeviceIndex>;
  porDeviceId: Map<number, DsDeviceIndex>;
  porImei: Map<string, DsDeviceIndex>;
}> {
  const ahora = Date.now();
  if (cacheDispositivos && ahora - cacheDispositivos.fetchedAt < CACHE_TTL_MS) {
    return cacheDispositivos;
  }

  const lista = await fetchDs<DsDevice[]>("/api/devices");
  if (!Array.isArray(lista)) {
    throw new Error("Respuesta inválida de DS Track");
  }

  const porPlaca = new Map<string, DsDeviceIndex>();
  const porDeviceId = new Map<number, DsDeviceIndex>();
  const porImei = new Map<string, DsDeviceIndex>();
  for (const device of lista) {
    indexarDispositivo(device, { porPlaca, porDeviceId, porImei });
  }

  cacheDispositivos = { fetchedAt: ahora, porPlaca, porDeviceId, porImei };
  return cacheDispositivos;
}

async function fetchDispositivo(deviceId: number): Promise<DsDevice | null> {
  const data = await fetchDs<DsDevice>(`/api/devices/${deviceId}`);
  if (!data || Number(data.id) !== deviceId) return null;
  return data;
}

async function fetchPosicion(deviceId: number): Promise<DsPosition | null> {
  const data = await fetchDs<DsPosition[] | DsPosition>(
    `/api/positions?deviceId=${deviceId}`,
  );
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || !Number.isFinite(Number(item.latitude))) return null;
  return item;
}

function mapearUbicacion(
  index: DsDeviceIndex,
  position: DsPosition,
): UbicacionGpsMoto | null {
  const lat = Number(position.latitude);
  const lng = Number(position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const time =
    formatFechaGps(position.fixTime) ||
    formatFechaGps(position.deviceTime) ||
    formatFechaGps(position.serverTime) ||
    formatFechaGps(index.lastUpdate) ||
    "—";

  return {
    proveedor: "dstrack",
    deviceId: index.deviceId,
    imei: index.imei,
    lat,
    lng,
    speed: Math.round((Number(position.speed) || 0) * NUDOS_A_KMH),
    course: Number(position.course) || 0,
    time,
    online: mapearEstadoOnline(index.status),
    coords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    bloqueado: position.attributes?.blocked === true,
    nombreDispositivo: index.nombre || index.imei || "—",
  };
}

async function hidratar(index: DsDeviceIndex): Promise<UbicacionGpsMoto | null> {
  const position = await fetchPosicion(index.deviceId);
  if (!position) return null;
  return mapearUbicacion(index, position);
}

async function buscarIndexPorPlaca(placa: string): Promise<DsDeviceIndex | null> {
  const exacta = normalizarPlaca(placa);
  if (!exacta) return null;
  const { porPlaca } = await cargarIndiceDispositivos();
  const hitExacto = porPlaca.get(exacta);
  if (hitExacto) return hitExacto;
  for (const clave of variantesPlaca(placa)) {
    if (clave === exacta) continue;
    const hit = porPlaca.get(clave);
    if (hit) return hit;
  }
  return null;
}

export function invalidarCacheDsTrack(): void {
  cacheDispositivos = null;
}

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

export async function buscarUbicacionGpsDs(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  try {
    const index = await buscarIndexPorPlaca(placa);
    if (!index) return { ok: false, motivo: "sin_dispositivo" };
    const gps = await hidratar(index);
    if (!gps) return { ok: false, motivo: "sin_dispositivo" };
    return { ok: true, gps };
  } catch (e) {
    console.warn("[dsTrackGps]", e instanceof Error ? e.message : e);
    invalidarCacheDsTrack();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export async function buscarUbicacionGpsDsEnVivo(
  placa: string,
  deviceId?: number,
  imei?: string,
): Promise<ResultadoBusquedaGps> {
  try {
    if (deviceId && deviceId > 0) {
      const device = await fetchDispositivo(deviceId);
      if (device) {
        const destino = {
          porPlaca: new Map<string, DsDeviceIndex>(),
          porDeviceId: new Map<number, DsDeviceIndex>(),
          porImei: new Map<string, DsDeviceIndex>(),
        };
        indexarDispositivo(device, destino);
        const index = destino.porDeviceId.get(deviceId);
        if (index) {
          const gps = await hidratar(index);
          if (gps) return { ok: true, gps };
        }
      }
    }

    if (imei?.trim()) {
      const { porImei } = await cargarIndiceDispositivos();
      const index = porImei.get(imei.trim());
      if (index) {
        const gps = await hidratar(index);
        if (gps) return { ok: true, gps };
      }
    }

    return buscarUbicacionGpsDs(placa);
  } catch (e) {
    console.warn("[dsTrackGps] en vivo:", e instanceof Error ? e.message : e);
    invalidarCacheDsTrack();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function enviarComandoMotorDs(
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  try {
    const index = await buscarIndexPorPlaca(placa);
    if (!index) {
      return { ok: false, error: "No se encontró el dispositivo DS Track de esa placa." };
    }

    const type = accion === "bloquear" ? "engineStop" : "engineResume";
    const res = await fetch(`${DSTRACK_BASE_URL}/api/commands/send`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${DSTRACK_BASIC}`,
      },
      body: JSON.stringify({ deviceId: index.deviceId, type }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (res.ok || res.status === 202) {
      invalidarCacheDsTrack();
      return {
        ok: true,
        mensaje:
          accion === "bloquear"
            ? "Corte enviado (DS Track)."
            : "Restablecimiento enviado (DS Track).",
      };
    }

    let detalle = "";
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      detalle = String(data.error ?? data.message ?? "").trim();
    } catch {
      detalle = "";
    }
    return {
      ok: false,
      error: detalle || "DS Track no pudo enviar el comando.",
    };
  } catch (e) {
    console.warn("[dsTrackGps] comando:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: "No se pudo contactar DS Track. Intenta de nuevo.",
    };
  }
}

export function mensajeGpsDsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
): string {
  const placaNorm = normalizarPlaca(placa);
  if (motivo === "error_proveedor") {
    return "No se pudo consultar DS Track en este momento. Intenta de nuevo en unos segundos.";
  }
  return `La placa ${placaNorm} no aparece en DS Track con esta cuenta GPS.`;
}
