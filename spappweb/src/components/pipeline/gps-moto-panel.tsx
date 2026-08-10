"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Power, PowerOff, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  MapaGpsEnVivo,
  type PuntoRutaGps,
} from "@/components/pipeline/mapa-gps-en-vivo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  etiquetaEstadoGps,
  etiquetaProveedorGps,
} from "@/lib/gps/gpsMoto";
import {
  etiquetaIntervaloPollGps,
  intervaloPollGpsEnVivo,
  type UbicacionGpsMoto,
} from "@/lib/gps/ubicacionGps";

type GpsMotoPanelProps = {
  placa: string;
  userId: number;
  /** Sin Card propio: para embeber en el resumen del cliente. */
  embedded?: boolean;
};

function mismoPunto(a: PuntoRutaGps, b: PuntoRutaGps): boolean {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
}

function agregarPuntoRuta(
  prev: PuntoRutaGps[],
  punto: PuntoRutaGps,
): PuntoRutaGps[] {
  const ultimo = prev[prev.length - 1];
  if (ultimo && mismoPunto(ultimo, punto)) return prev;
  const next = [...prev, punto];
  return next.length > 40 ? next.slice(-40) : next;
}

function enlaceGoogleMaps(coords: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(coords)}`;
}

export function GpsMotoPanel({
  placa,
  userId,
  embedded = false,
}: GpsMotoPanelProps) {
  const [gps, setGps] = useState<UbicacionGpsMoto | null>(null);
  const [ruta, setRuta] = useState<PuntoRutaGps[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensajeSinGps, setMensajeSinGps] = useState<string | null>(null);
  const [enVivo, setEnVivo] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [errorLive, setErrorLive] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"bloquear" | "desbloquear" | null>(
    null,
  );
  const deviceIdRef = useRef(0);
  const imeiRef = useRef("");
  const gpsRef = useRef<UbicacionGpsMoto | null>(null);
  const fetchEnCursoRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const intervaloPollMs = gps
    ? intervaloPollGpsEnVivo(gps.proveedor)
    : 3000;

  const refrescarPosicion = useCallback(async () => {
    if (fetchEnCursoRef.current) return;
    fetchEnCursoRef.current = true;
    setActualizando(true);
    try {
      const params = new URLSearchParams({
        placa,
        userId: String(userId),
      });
      if (deviceIdRef.current > 0) {
        params.set("device_id", String(deviceIdRef.current));
      }
      if (imeiRef.current) params.set("imei", imeiRef.current);

      const res = await fetch(`/api/gps/live?${params}`, {
        cache: "no-store",
        signal: abortRef.current?.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorLive(data.error ?? "No se pudo actualizar el GPS");
        if (!gpsRef.current) {
          setMensajeSinGps(data.error ?? "Error al consultar GPS");
        }
        return;
      }
      if (data.gps) {
        const nuevo = data.gps as UbicacionGpsMoto;
        deviceIdRef.current = nuevo.deviceId;
        imeiRef.current = nuevo.imei ?? "";
        gpsRef.current = nuevo;
        setGps(nuevo);
        setRuta((prev) =>
          agregarPuntoRuta(prev, { lat: nuevo.lat, lng: nuevo.lng }),
        );
        setMensajeSinGps(null);
        setErrorLive(null);
      } else {
        gpsRef.current = null;
        setMensajeSinGps(
          String(data.mensaje ?? "Sin dispositivo GPS para esta placa"),
        );
        setGps(null);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setErrorLive("Sin conexión al actualizar ubicación");
      if (!gpsRef.current) setMensajeSinGps("Sin conexión al consultar GPS");
    } finally {
      fetchEnCursoRef.current = false;
      setActualizando(false);
      setCargando(false);
    }
  }, [placa, userId]);

  useEffect(() => {
    deviceIdRef.current = 0;
    imeiRef.current = "";
    gpsRef.current = null;
    setGps(null);
    setRuta([]);
    setCargando(true);
    setMensajeSinGps(null);
  }, [placa, userId]);

  useEffect(() => {
    if (!enVivo) {
      abortRef.current?.abort();
      abortRef.current = null;
      fetchEnCursoRef.current = false;
      setActualizando(false);
      return;
    }

    abortRef.current = new AbortController();
    void refrescarPosicion();
    const id = window.setInterval(
      () => void refrescarPosicion(),
      intervaloPollMs,
    );

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
      abortRef.current = null;
      fetchEnCursoRef.current = false;
    };
  }, [enVivo, refrescarPosicion, intervaloPollMs]);

  const enviarComando = useCallback(
    async (accion: "bloquear" | "desbloquear") => {
      if (!gps) return;
      const verbo = accion === "bloquear" ? "APAGAR" : "PRENDER";
      const ok = window.confirm(
        `¿Confirmas ${verbo} la moto ${placa.toUpperCase()} vía GPS?\n\n` +
          `Dispositivo: ${gps.nombreDispositivo}`,
      );
      if (!ok) return;

      setEnviando(accion);
      try {
        const res = await fetch("/api/gps/comando", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placa, userId, accion }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo enviar el comando");
          return;
        }
        toast.success(data.mensaje ?? "Comando enviado");
        void refrescarPosicion();
      } catch {
        toast.error("Sin conexión al enviar el comando");
      } finally {
        setEnviando(null);
      }
    },
    [gps, placa, userId, refrescarPosicion],
  );

  const cuerpo = (
    <>
      {cargando && !gps ? (
        <p className="text-sm text-muted-foreground">Consultando GPS…</p>
      ) : null}

      {!cargando && !gps ? (
        <p className="text-sm text-amber-800">
          {mensajeSinGps ?? "Sin dispositivo GPS para esta placa"}
        </p>
      ) : null}

      {gps ? (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <MapaGpsEnVivo
              gps={gps}
              ruta={ruta}
              seguimientoActivo={enVivo}
              proveedor={gps.proveedor}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
              {etiquetaEstadoGps(gps.online)}
            </span>
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
              {Math.round(gps.speed)} km/h
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                gps.bloqueado
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-sky-300 bg-sky-50 text-sky-800"
              }`}
            >
              Motor {gps.bloqueado ? "bloqueado" : "libre"}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">
              {placa.toUpperCase()}
              {gps ? ` · ${etiquetaProveedorGps(gps.proveedor)}` : null}
            </p>
            {gps.nombreDispositivo &&
            gps.nombreDispositivo.trim().toUpperCase().replace(/[\s-]/g, "") !==
              placa.trim().toUpperCase().replace(/[\s-]/g, "") ? (
              <p
                className="truncate text-muted-foreground"
                title={gps.nombreDispositivo}
              >
                GPS: {gps.nombreDispositivo}
              </p>
            ) : null}
            <p className="mt-1 tabular-nums">
              Última: {gps.time}
              {enVivo
                ? ` · cada ${etiquetaIntervaloPollGps(gps.proveedor)}`
                : null}
              {actualizando ? " · actualizando…" : null}
            </p>
            <p className="mt-0.5 tabular-nums">
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            </p>
          </div>

          {errorLive ? (
            <p className="text-xs text-amber-700">{errorLive}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="destructive"
              disabled={!!enviando}
              onClick={() => enviarComando("bloquear")}
            >
              <PowerOff className="h-4 w-4" />
              {enviando === "bloquear" ? "Enviando…" : "Apagar"}
            </Button>
            <Button
              disabled={!!enviando}
              onClick={() => enviarComando("desbloquear")}
            >
              <Power className="h-4 w-4" />
              {enviando === "desbloquear" ? "Enviando…" : "Prender"}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setEnVivo((v) => !v)}
            >
              {enVivo ? "Pausar" : "Reanudar"}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a
                href={enlaceGoogleMaps(gps.coords)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Maps
              </a>
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={actualizando}
          onClick={() => {
            setEnVivo(true);
            void refrescarPosicion();
          }}
        >
          Reintentar
        </Button>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">GPS moto</p>
            <p className="text-xs text-muted-foreground">
              Placa {placa.toUpperCase()}
              {gps ? ` · ${etiquetaProveedorGps(gps.proveedor)}` : null}
            </p>
          </div>
          {gps && enVivo ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <Radio className="h-3 w-3" />
              En vivo
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">{cuerpo}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>GPS moto</CardTitle>
          {gps && enVivo ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <Radio className="h-3 w-3" />
              En vivo
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Placa {placa.toUpperCase()}
          {gps ? ` · ${etiquetaProveedorGps(gps.proveedor)}` : null}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{cuerpo}</CardContent>
    </Card>
  );
}
