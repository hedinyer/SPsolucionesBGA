"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, MapPin } from "lucide-react";
import { assignVisit, cancelVisit } from "@/lib/actions/admin-actions";
import type { VisitaRow, VisitadorRow, UserMotoCompraRow } from "@/lib/pipeline/types";
import {
  filterVisitadoresForReferral,
  referralLabel,
  resolveReferralSource,
} from "@/lib/referrals";
import { formatDate } from "@/lib/utils/format";
import { visitaEstadoLabel, entregaAntesVisita } from "@/lib/pipeline/step-logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ShareVisitadorLink,
  visitadorUsername,
} from "@/components/visitadores/share-visitador-link";

interface VisitActionPanelProps {
  visita: VisitaRow | null;
  visitadores: VisitadorRow[];
  userId: number;
  compra?: UserMotoCompraRow | null;
  referralSource?: string | null;
}

export function VisitActionPanel({
  visita,
  visitadores,
  userId,
  compra = null,
  referralSource = null,
}: VisitActionPanelProps) {
  const [pending, startTransition] = useTransition();
  const assignableVisitadores = filterVisitadoresForReferral(
    visitadores,
    referralSource,
  );
  const referralSlug = resolveReferralSource(referralSource);
  const lockedReferralLabel =
    referralSlug === "punto-de-venta" ? null : referralLabel(referralSlug);

  if (!visita) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          La visita se creará cuando el pago esté confirmado y la moto quede
          lista para retiro.
        </CardContent>
      </Card>
    );
  }

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  const fotos = visita.evidencia_fotos ?? [];
  const videos = visita.evidencia_videos ?? [];
  const ubicacion = visita.ubicacion_verificada;
  const assignedVisitador =
    visita.estado === "asignada"
      ? visitadores.find((v) => v.id === visita.visitador_id) ??
        visita.visitadores
      : null;
  const assignedUsername = visitadorUsername(assignedVisitador);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {visita.estado === "pendiente_asignacion"
            ? "Agendar visita domiciliaria"
            : "Visita domiciliaria"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {visita.estado === "pendiente_asignacion"
            ? entregaAntesVisita(compra)
              ? "Programa la visita después de entregar la moto."
              : "Asigna visitador y fecha antes de entregar la moto al cliente."
            : visita.estado === "cancelada"
              ? "Estado: Cancelada. Puedes volver a agendarla."
              : `Estado: ${visitaEstadoLabel(visita.estado)}`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>{visita.cliente_nombre ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Celular</dt>
            <dd>{visita.cliente_celular ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Dirección</dt>
            <dd>
              {[visita.direccion_visita, visita.barrio]
                .filter(Boolean)
                .join(", ") || "—"}
            </dd>
          </div>
        </dl>

        {visita.estado === "pendiente_asignacion" && (
          <AssignForm
            visitadores={assignableVisitadores}
            pending={pending}
            visita={visita}
            highlight
            lockedReferralLabel={lockedReferralLabel}
            onAssign={(visitadorId, fecha) =>
              run(
                () =>
                  assignVisit({
                    visitaId: visita.id,
                    userId,
                    visitadorId,
                    fechaProgramada: fecha,
                  }),
                "Visita asignada.",
              )
            }
          />
        )}

        {visita.estado === "asignada" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <p className="text-sm">
                <span className="text-muted-foreground">Visitador: </span>
                {visita.visitadores?.nombre ?? "—"}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Fecha: </span>
                {formatDate(visita.fecha_programada)}
              </p>
              {assignedVisitador && assignedUsername ? (
                <ShareVisitadorLink
                  nombre={assignedVisitador.nombre}
                  username={assignedUsername}
                  telefono={assignedVisitador.telefono}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  El visitador debe completar la visita desde la app o el portal
                  visitador, subiendo fotos, video y ubicación.
                </p>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="lg" variant="outline" disabled={pending}>
                    Cancelar visita
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-background">
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar visita?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El cliente verá que debe contactar al concesionario.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Volver</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        run(
                          () => cancelVisit(visita.id, userId),
                          "Visita cancelada.",
                        )
                      }
                    >
                      Sí, cancelar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <AssignForm
              visitadores={assignableVisitadores}
              pending={pending}
              visita={visita}
              defaultVisitadorId={visita.visitador_id}
              lockedReferralLabel={lockedReferralLabel}
              title="Reprogramar visita"
              submitLabel="Guardar cambios"
              onAssign={(visitadorId, fecha) =>
                run(
                  () =>
                    assignVisit({
                      visitaId: visita.id,
                      userId,
                      visitadorId,
                      fechaProgramada: fecha,
                    }),
                  "Visita reprogramada.",
                )
              }
            />
          </div>
        )}

        {visita.estado === "completada" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Visita completada
              {visita.fecha_completada
                ? ` el ${formatDate(visita.fecha_completada)}`
                : ""}
              . El proceso de visita domiciliaria quedó registrado.
            </p>

            {visita.notas_visita && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground">Notas del visitador</p>
                <p className="mt-1 text-muted-foreground">{visita.notas_visita}</p>
              </div>
            )}

            {fotos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Fotos de evidencia</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {fotos.map((foto, i) => (
                    <a
                      key={`${foto.url}-${i}`}
                      href={foto.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={foto.url}
                        alt={`Evidencia ${i + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {videos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Videos de evidencia</p>
                <div className="flex flex-col gap-3">
                  {videos.map((video, i) => (
                    <video
                      key={`${video.url}-${i}`}
                      src={video.url}
                      controls
                      className="w-full max-w-md rounded-lg border border-border"
                    />
                  ))}
                </div>
              </div>
            )}

            {ubicacion?.lat != null && ubicacion?.lng != null && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <MapPin className="h-4 w-4" />
                  Ubicación verificada
                </p>
                <p className="mt-1 text-muted-foreground">
                  {ubicacion.lat.toFixed(6)}, {ubicacion.lng.toFixed(6)}
                  {ubicacion.accuracy != null &&
                    ` · ±${Math.round(ubicacion.accuracy)} m`}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  Ver en Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {visita.estado === "cancelada" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Visita cancelada. Puedes volver a agendarla con otro visitador o
              fecha.
            </p>
            <AssignForm
              visitadores={assignableVisitadores}
              pending={pending}
              visita={visita}
              highlight
              defaultVisitadorId={visita.visitador_id}
              lockedReferralLabel={lockedReferralLabel}
              title="Volver a agendar visita"
              submitLabel="Volver a agendar"
              onAssign={(visitadorId, fecha) =>
                run(
                  () =>
                    assignVisit({
                      visitaId: visita.id,
                      userId,
                      visitadorId,
                      fechaProgramada: fecha,
                    }),
                  "Visita reagendada.",
                )
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssignForm({
  visita,
  visitadores,
  pending,
  highlight = false,
  defaultVisitadorId = null,
  lockedReferralLabel = null,
  title = "Asignar visitador",
  submitLabel = "Asignar visita",
  onAssign,
}: {
  visita: VisitaRow;
  visitadores: VisitadorRow[];
  pending: boolean;
  highlight?: boolean;
  defaultVisitadorId?: number | null;
  lockedReferralLabel?: string | null;
  title?: string;
  submitLabel?: string;
  onAssign: (visitadorId: number, fecha: string) => void;
}) {
  const [visitadorId, setVisitadorId] = useState(() => {
    if (
      defaultVisitadorId != null &&
      visitadores.some((v) => v.id === defaultVisitadorId)
    ) {
      return String(defaultVisitadorId);
    }
    return visitadores.length === 1 ? String(visitadores[0].id) : "";
  });
  const [fecha, setFecha] = useState(
    () => visita.fecha_programada?.slice(0, 16) ?? "",
  );

  return (
    <form
      className={`flex flex-col gap-4 rounded-lg border p-4 ${
        highlight
          ? "border-primary bg-muted/50"
          : "border-border"
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        const id = Number(visitadorId);
        if (!id || !fecha.trim()) {
          toast.error("Selecciona visitador y fecha.");
          return;
        }
        const parsed = new Date(fecha);
        if (Number.isNaN(parsed.getTime())) {
          toast.error("Fecha inválida.");
          return;
        }
        onAssign(id, parsed.toISOString());
      }}
    >
      <p className="text-sm font-medium">
        {highlight && title === "Asignar visitador"
          ? "Programar visita domiciliaria"
          : title}
      </p>
      {lockedReferralLabel && (
        <p className="text-sm text-muted-foreground">
          Cliente referido por {lockedReferralLabel}: la visita solo puede
          asignarse a {lockedReferralLabel}.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Visitador</Label>
          <TouchSelect
            aria-label="Visitador"
            value={visitadorId}
            required
            placeholder="Selecciona visitador"
            onChange={setVisitadorId}
            options={visitadores.map((v) => ({
              value: String(v.id),
              label: v.nombre,
            }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fecha">Fecha y hora</Label>
          <Input
            id="fecha"
            name="fecha"
            type="datetime-local"
            className="min-h-11 touch-manipulation text-base md:text-sm"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        className="bg-primary text-primary-foreground hover:bg-primary/80"
        disabled={pending || visitadores.length === 0}
      >
        {submitLabel}
      </Button>
      {visitadores.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {lockedReferralLabel
            ? `No hay un visitador llamado ${lockedReferralLabel}. Créalo en Equipo → Visitadores.`
            : "Crea visitadores con cuenta de acceso en el menú lateral primero."}
        </p>
      )}
    </form>
  );
}
