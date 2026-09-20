"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import {
  clearVisitaEjecucionDraft,
  loadVisitaEjecucionDraft,
  saveVisitaEjecucionDraft,
} from "@/lib/utils/visita-ejecucion-draft";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GPS_ACCEPTABLE_ACCURACY_M = 100;
const GPS_WATCH_MS = 8000;
const GPS_MAX_SAMPLES = 3;

function mapsUrl(direccion: string, barrio?: string | null) {
  const query = [direccion, barrio].filter(Boolean).join(", ");
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === 1) {
    return "Activa el permiso de ubicación en tu celular.";
  }
  if (err.code === 2) {
    return "GPS apagado o sin señal. Activa la ubicación e intenta de nuevo.";
  }
  if (err.code === 3) {
    return "La ubicación tardó demasiado. Sal un momento al aire libre e intenta de nuevo.";
  }
  return err.message || "No se pudo obtener la ubicación.";
}

function getCurrentPositionPromise(
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** Hasta 3 lecturas en ~8s; se queda con la mejor accuracy. */
function watchBestPosition(
  options: PositionOptions,
  maxMs: number,
  maxSamples: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    let samples = 0;
    let settled = false;

    const finish = (pos: GeolocationPosition | null, err?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      if (pos) resolve(pos);
      else reject(err ?? new Error("No se pudo obtener la ubicación."));
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        samples += 1;
        if (
          !best ||
          (pos.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)
        ) {
          best = pos;
        }
        const current = best;
        if (
          current &&
          (samples >= maxSamples ||
            (current.coords.accuracy != null &&
              current.coords.accuracy <= GPS_ACCEPTABLE_ACCURACY_M))
        ) {
          finish(current);
        }
      },
      (err) => {
        if (best) finish(best);
        else finish(null, err);
      },
      options,
    );

    const timer = window.setTimeout(() => {
      if (best) finish(best);
      else {
        const timeoutErr = new Error("Timeout") as Error & { code: number };
        timeoutErr.code = 3;
        finish(null, timeoutErr as unknown as GeolocationPositionError);
      }
    }, maxMs);
  });
}

function UploadProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-black transition-[width] duration-200"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {label ?? `Subiendo… ${value}%`}
      </p>
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
  const draftRef = useRef({
    fotos: [] as VisitaEvidenciaFoto[],
    videos: [] as VisitaEvidenciaVideo[],
    ubicacion: null as VisitaUbicacionVerificada | null,
    notas: "",
  });
  const restoredRef = useRef(false);

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

  function persistDraft(next?: {
    fotos?: VisitaEvidenciaFoto[];
    videos?: VisitaEvidenciaVideo[];
    ubicacion?: VisitaUbicacionVerificada | null;
    notas?: string;
  }) {
    const payload = {
      fotos: next?.fotos ?? draftRef.current.fotos,
      videos: next?.videos ?? draftRef.current.videos,
      ubicacion:
        next && "ubicacion" in next
          ? (next.ubicacion ?? null)
          : draftRef.current.ubicacion,
      notas: next?.notas ?? draftRef.current.notas,
    };
    draftRef.current = payload;
    saveVisitaEjecucionDraft(visita.id, payload);
  }

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const draft = loadVisitaEjecucionDraft(visita.id);
    if (!draft) return;
    const hasProgress =
      draft.fotos.length > 0 ||
      draft.videos.length > 0 ||
      draft.ubicacion != null ||
      draft.notas.trim().length > 0;
    if (!hasProgress) return;

    setFotos(draft.fotos);
    setVideos(draft.videos);
    setUbicacion(draft.ubicacion);
    setNotas(draft.notas);
    draftRef.current = {
      fotos: draft.fotos,
      videos: draft.videos,
      ubicacion: draft.ubicacion,
      notas: draft.notas,
    };
    toast.message("Se recuperó el avance de esta visita.");
  }, [visita.id]);

  useEffect(() => {
    draftRef.current = { fotos, videos, ubicacion, notas };
  }, [fotos, videos, ubicacion, notas]);

  useEffect(() => {
    const flush = () => {
      saveVisitaEjecucionDraft(visita.id, draftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [visita.id]);

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
      setFotos((prev) => {
        const next = [...prev, foto];
        persistDraft({ fotos: next });
        return next;
      });
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
      setVideos((prev) => {
        const next = [...prev, video];
        persistDraft({ videos: next });
        return next;
      });
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

  async function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta geolocalización.");
      return;
    }

    setCapturingLocation(true);
    try {
      const lowOpts: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 20_000,
        maximumAge: 0,
      };
      const highOpts: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 30_000,
        maximumAge: 0,
      };

      let pos: GeolocationPosition;
      try {
        pos = await getCurrentPositionPromise(lowOpts);
      } catch {
        pos = await watchBestPosition(
          highOpts,
          GPS_WATCH_MS,
          GPS_MAX_SAMPLES,
        );
      }

      if ((pos.coords.accuracy ?? Infinity) > GPS_ACCEPTABLE_ACCURACY_M) {
        try {
          pos = await watchBestPosition(
            highOpts,
            GPS_WATCH_MS,
            GPS_MAX_SAMPLES,
          );
        } catch {
          // nos quedamos con el primer fix usable
        }
      }

      const next: VisitaUbicacionVerificada = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        captured_at: new Date().toISOString(),
      };
      setUbicacion(next);
      persistDraft({ ubicacion: next });
      toast.success("Ubicación capturada.");
    } catch (err) {
      toast.error(
        err && typeof err === "object" && "code" in err
          ? geoErrorMessage(err as GeolocationPositionError)
          : "No se pudo obtener la ubicación.",
      );
    } finally {
      setCapturingLocation(false);
    }
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
        clearVisitaEjecucionDraft(visita.id);
        toast.success("Visita completada.");
        router.push("/visitador/mis-visitas");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al completar.");
      }
    });
  }

  const photoProgressLabel =
    photoProgress != null && photoProgress < 15
      ? "Optimizando foto…"
      : photoProgress != null
        ? `Subiendo… ${photoProgress}%`
        : undefined;

  return (
    <>
      <div className="flex flex-col gap-6 pb-28">
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Si se cierra la app al sacar la foto, vuelve a esta visita: el avance
          se guarda solo.
        </p>

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
                label={
                  uploadingPhoto
                    ? photoProgress != null && photoProgress < 15
                      ? "Optimizando…"
                      : "Subiendo…"
                    : "Tomar foto"
                }
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
              <UploadProgressBar
                value={photoProgress}
                label={photoProgressLabel}
              />
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
              <ul className="flex flex-col gap-2">
                {videos.map((video, i) => (
                  <li
                    key={`${video.url}-${i}`}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      Video {i + 1} subido
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Guardado. Ábrelo solo si necesitas verificarlo.
                    </p>
                  </li>
                ))}
              </ul>
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
              onClick={() => void captureLocation()}
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
            onChange={(e) => {
              const value = e.target.value;
              setNotas(value);
              persistDraft({ notas: value });
            }}
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
