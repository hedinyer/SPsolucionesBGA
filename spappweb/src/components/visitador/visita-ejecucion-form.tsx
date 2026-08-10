"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  Upload,
  Video,
  VideoIcon,
} from "lucide-react";
import { completeVisitaVisitador } from "@/lib/actions/visitador-actions";
import type {
  VisitaEvidenciaFoto,
  VisitaEvidenciaVideo,
  VisitaRow,
  VisitaUbicacionVerificada,
} from "@/lib/pipeline/types";
import {
  uploadVisitaPhotoFromBrowser,
  uploadVisitaVideoFromBrowser,
} from "@/lib/utils/upload-visita-evidencia-client";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function mapsUrl(direccion: string, barrio?: string | null) {
  const query = [direccion, barrio].filter(Boolean).join(", ");
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

function UploadProgressBar({ value }: { value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-black transition-[width] duration-200"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">Subiendo… {value}%</p>
    </div>
  );
}

function MediaActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors active:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function VisitaEjecucionForm({
  visita,
  visitadorId,
}: {
  visita: VisitaRow;
  visitadorId: number;
}) {
  const router = useRouter();
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const videoCameraRef = useRef<HTMLInputElement>(null);
  const videoGalleryRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [fotos, setFotos] = useState<VisitaEvidenciaFoto[]>([]);
  const [videos, setVideos] = useState<VisitaEvidenciaVideo[]>([]);
  const [ubicacion, setUbicacion] = useState<VisitaUbicacionVerificada | null>(
    null,
  );
  const [notas, setNotas] = useState("");
  const [capturingLocation, setCapturingLocation] = useState(false);

  const direccionCompleta =
    [visita.direccion_visita, visita.barrio].filter(Boolean).join(", ") || null;

  const canComplete =
    fotos.length >= 1 && videos.length >= 1 && ubicacion?.lat != null;

  const isBusy = pending || uploadingPhoto || uploadingVideo;

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    setPhotoProgress(0);
    try {
      const foto = await uploadVisitaPhotoFromBrowser(
        visitadorId,
        visita.id,
        file,
        setPhotoProgress,
      );
      setFotos((prev) => [...prev, foto]);
      toast.success("Foto subida.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al subir foto.",
      );
      throw err;
    } finally {
      setUploadingPhoto(false);
      setPhotoProgress(null);
    }
  }

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true);
    setVideoProgress(0);
    try {
      const video = await uploadVisitaVideoFromBrowser(
        visitadorId,
        visita.id,
        file,
        setVideoProgress,
      );
      setVideos((prev) => [...prev, video]);
      toast.success("Video subido.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al subir video.",
      );
      throw err;
    } finally {
      setUploadingVideo(false);
      setVideoProgress(null);
    }
  }

  async function onPhotoSelected(file: File | undefined) {
    if (!file) return;
    try {
      await handlePhotoUpload(file);
    } catch {
      // toast ya mostrado
    }
  }

  async function onVideoSelected(file: File | undefined) {
    if (!file) return;
    try {
      await handleVideoUpload(file);
    } catch {
      // toast ya mostrado
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta geolocalización.");
      return;
    }

    setCapturingLocation(true);

    const save = (pos: GeolocationPosition) => {
      setUbicacion({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        captured_at: new Date().toISOString(),
      });
      setCapturingLocation(false);
      toast.success("Ubicación capturada.");
    };

    const fail = (err: GeolocationPositionError, retried: boolean) => {
      if (!retried) {
        navigator.geolocation.getCurrentPosition(
          save,
          (retryErr) => fail(retryErr, true),
          { enableHighAccuracy: false, timeout: 25000, maximumAge: 120_000 },
        );
        return;
      }
      setCapturingLocation(false);
      toast.error(
        err.code === 1
          ? "Activa el permiso de ubicación en tu celular."
          : err.message || "No se pudo obtener la ubicación.",
      );
    };

    navigator.geolocation.getCurrentPosition(
      save,
      (err) => fail(err, false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  }

  function handleComplete() {
    if (!ubicacion) return;

    startTransition(async () => {
      try {
        await completeVisitaVisitador({
          visitaId: visita.id,
          fotos,
          videos,
          ubicacion,
          notas,
        });
        toast.success("Visita completada.");
        router.push("/visitador/mis-visitas");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al completar.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-6 pb-28">
        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">{visita.cliente_nombre}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Programada: {formatDate(visita.fecha_programada)}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Celular: </span>
              {visita.cliente_celular ? (
                <a
                  href={`tel:${visita.cliente_celular.replace(/\s/g, "")}`}
                  className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {visita.cliente_celular}
                </a>
              ) : (
                "—"
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Dirección: </span>
              {direccionCompleta ? (
                <a
                  href={mapsUrl(
                    visita.direccion_visita ?? "",
                    visita.barrio,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  {direccionCompleta}
                </a>
              ) : (
                "—"
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Fotos de evidencia</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mínimo 1 foto del domicilio o moto. Se comprimen automáticamente
              para subir más rápido.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <input
              ref={photoCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={isBusy}
              onChange={async (e) => {
                await onPhotoSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={photoGalleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isBusy}
              onChange={async (e) => {
                await onPhotoSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2">
              <MediaActionButton
                icon={Camera}
                label={uploadingPhoto ? "Subiendo…" : "Tomar foto"}
                disabled={isBusy}
                onClick={() => photoCameraRef.current?.click()}
              />
              <MediaActionButton
                icon={ImagePlus}
                label="Galería"
                disabled={isBusy}
                onClick={() => photoGalleryRef.current?.click()}
              />
            </div>
            {uploadingPhoto && photoProgress != null && (
              <UploadProgressBar value={photoProgress} />
            )}
            {fotos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
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
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Video de evidencia</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mínimo 1 video corto (máx. 50 MB). Sube directo, ideal para
              internet lento.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <input
              ref={videoCameraRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              disabled={isBusy}
              onChange={async (e) => {
                await onVideoSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={videoGalleryRef}
              type="file"
              accept="video/*"
              className="hidden"
              disabled={isBusy}
              onChange={async (e) => {
                await onVideoSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2">
              <MediaActionButton
                icon={Video}
                label={uploadingVideo ? "Subiendo…" : "Grabar video"}
                disabled={isBusy}
                onClick={() => videoCameraRef.current?.click()}
              />
              <MediaActionButton
                icon={VideoIcon}
                label="Galería"
                disabled={isBusy}
                onClick={() => videoGalleryRef.current?.click()}
              />
            </div>
            {uploadingVideo && videoProgress != null && (
              <UploadProgressBar value={videoProgress} />
            )}
            {videos.length > 0 && (
              <div className="flex flex-col gap-3">
                {videos.map((video, i) => (
                  <video
                    key={`${video.url}-${i}`}
                    src={video.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-lg border border-border"
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Ubicación exacta</CardTitle>
            <p className="text-sm text-muted-foreground">
              Necesitamos confirmar que estás en el domicilio del cliente.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="min-h-11 w-full touch-manipulation"
              disabled={isBusy || capturingLocation}
              onClick={captureLocation}
            >
              <MapPin className="mr-2 h-4 w-4" />
              {capturingLocation ? "Obteniendo…" : "Obtener ubicación"}
            </Button>
            {ubicacion && (
              <p className="text-sm text-green-700">
                {ubicacion.lat.toFixed(6)}, {ubicacion.lng.toFixed(6)}
                {ubicacion.accuracy != null &&
                  ` · ±${Math.round(ubicacion.accuracy)} m`}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-4 safe-area-bottom">
        <Button
          size="lg"
          className="min-h-11 w-full touch-manipulation bg-primary text-primary-foreground hover:bg-primary/80"
          disabled={isBusy || !canComplete}
          onClick={handleComplete}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {pending ? "Completando…" : "Completar visita"}
        </Button>
        {!canComplete && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Sube al menos 1 foto, 1 video y captura la ubicación.
          </p>
        )}
      </div>
    </>
  );
}
