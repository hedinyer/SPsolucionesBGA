"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, MapPin, Radio } from "lucide-react";
import { toast } from "sonner";
import { setTracking } from "@/lib/actions/admin-actions";
import type {
  AtrasoSnapshot,
  MorosoRow,
  MotoParaRecogerRow,
  TrackingLocation,
  UserTrackingRow,
} from "@/lib/pipeline/types";
import { getMoraDisplay } from "@/lib/pipeline/mora-utils";
import { createAnonClient } from "@/lib/supabase/anon";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TrackingPanelProps {
  tracking: UserTrackingRow | null;
  userId: number;
  moroso?: MorosoRow | null;
  recoger?: MotoParaRecogerRow | null;
  atraso?: AtrasoSnapshot | null;
}

function isLiveLocation(location: TrackingLocation | null | undefined) {
  if (!location?.captured_at) return false;
  const captured = new Date(location.captured_at).getTime();
  if (Number.isNaN(captured)) return false;
  return Date.now() - captured <= 90_000;
}

export function TrackingPanel({
  tracking,
  userId,
  moroso,
  recoger,
  atraso,
}: TrackingPanelProps) {
  const [pending, startTransition] = useTransition();
  const [liveTracking, setLiveTracking] = useState(tracking);

  useEffect(() => {
    setLiveTracking(tracking);
  }, [tracking]);

  useEffect(() => {
    const supabase = createAnonClient();
    const channel = supabase
      .channel(`admin_tracking_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users_tracking",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setLiveTracking(payload.new as UserTrackingRow);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const mora = getMoraDisplay({ moroso, recoger, atraso });
  const needsIntensiveTracking = mora.tieneDeuda && mora.dias >= 1;
  const location = liveTracking?.ubicacion_1 ?? null;
  const hasLocation = location?.lat != null && location?.lng != null;
  const liveNow = useMemo(() => isLiveLocation(location), [location]);
  const mapsUrl = hasLocation
    ? `https://www.google.com/maps?q=${location!.lat},${location!.lng}`
    : null;

  if (!liveTracking) {
    return null;
  }

  return (
    <Card
      className={
        needsIntensiveTracking && !liveTracking.seguimiento
          ? "border-amber-300 bg-amber-50/40"
          : undefined
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Seguimiento GPS</CardTitle>
          {liveNow && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <Radio className="h-3 w-3" />
              En vivo
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          La ubicación la envía la app del cliente en tiempo real a{" "}
          <span className="font-medium text-foreground">ubicacion_1</span>.
        </p>
        {mora.tieneDeuda && (
          <p className="text-sm font-medium text-amber-800">
            Cuenta de mora: {mora.dias > 0 ? `${mora.dias} días · ` : ""}
            adeudado {formatCop(mora.monto)}
          </p>
        )}
        {needsIntensiveTracking && !liveTracking.seguimiento && (
          <p className="text-sm font-medium text-amber-800">
            {mora.paraRecoger
              ? "Moto para recoger: activa seguimiento intensivo para forzar GPS en segundo plano."
              : "Cliente con atraso: activa seguimiento intensivo para forzar GPS en segundo plano."}
          </p>
        )}
        {mora.paraRecoger && (
          <p className="text-sm text-red-700">
            Moto marcada para recoger ({mora.dias} días de mora).
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="seguimiento" className="font-normal">
            Seguimiento intensivo (mora)
          </Label>
          <Switch
            id="seguimiento"
            checked={liveTracking.seguimiento}
            disabled={pending}
            onCheckedChange={(v) => {
              startTransition(async () => {
                try {
                  await setTracking(userId, v);
                  setLiveTracking((prev) =>
                    prev ? { ...prev, seguimiento: v } : prev,
                  );
                  toast.success(
                    v
                      ? "Seguimiento intensivo activado en la app."
                      : "Seguimiento intensivo desactivado.",
                  );
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Error al actualizar.",
                  );
                }
              });
            }}
          />
        </div>

        {needsIntensiveTracking && !liveTracking.seguimiento && (
          <Button
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  await setTracking(userId, true);
                  setLiveTracking((prev) =>
                    prev ? { ...prev, seguimiento: true } : prev,
                  );
                  toast.success("Seguimiento intensivo activado.");
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Error al activar GPS.",
                  );
                }
              });
            }}
          >
            Activar seguimiento intensivo
          </Button>
        )}

        {hasLocation ? (
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  Última ubicación (app cliente)
                </p>
                <p className="mt-1 text-muted-foreground">
                  {location.lat!.toFixed(5)}, {location.lng!.toFixed(5)}
                </p>
                {location.accuracy != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Precisión ±{Math.round(location.accuracy)} m
                  </p>
                )}
                {location.captured_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(location.captured_at)}
                    {liveNow ? " · recibiendo en vivo" : ""}
                  </p>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Ver en Google Maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin ubicación aún. El cliente debe tener la app abierta (o
            seguimiento intensivo activo) y permisos de GPS concedidos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
