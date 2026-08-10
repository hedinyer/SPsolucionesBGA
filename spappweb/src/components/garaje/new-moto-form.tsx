"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGarajeMoto } from "@/lib/actions/admin-actions";
import type {
  BikeRow,
  GarajeCondicion,
  GarajeMotoEstado,
  GarajeParqueaderoRow,
} from "@/lib/pipeline/types";
import {
  GARAJE_CONDICION_LABELS,
  GARAJE_ESTADO_LABELS,
} from "@/lib/pipeline/types";
import {
  clearGarajeNuevaMotoDraft,
  dataUrlFromFile,
  fileFromDataUrl,
  readGarajeNuevaMotoDraft,
  writeGarajeNuevaMotoDraft,
  type GarajeNuevaMotoDraft,
} from "@/lib/garaje/moto-draft-storage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TouchSelect } from "@/components/ui/touch-select";
import {
  garajeUploadFolder,
  ImageFileField,
} from "@/components/ui/image-file-field";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { uploadImageFromBrowser } from "@/lib/utils/upload-image-client";
import { cn } from "@/lib/utils";

const actionBtnClass =
  "inline-flex min-h-11 w-full touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 active:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

const outlineBtnClass =
  "inline-flex min-h-11 w-full touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 active:bg-muted/50";

const defaultDraft = (): Omit<GarajeNuevaMotoDraft, "imageDataUrl" | "imageName"> => ({
  parqueaderoId: "none",
  placa: "",
  referencia: "",
  modelo: "",
  color: "",
  condicion: "nueva",
  estado: "en_garaje",
  notas: "",
});

export function NewMotoForm({
  parqueaderos,
  catalogoBikes = [],
  initialModelo = "",
  initialColor = "",
}: {
  parqueaderos: GarajeParqueaderoRow[];
  catalogoBikes?: Pick<BikeRow, "id" | "modelo" | "color">[];
  initialModelo?: string;
  initialColor?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const [parqueaderoId, setParqueaderoId] = useState("none");
  const [placa, setPlaca] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [referencia, setReferencia] = useState("");
  const [modelo, setModelo] = useState(initialModelo);
  const [color, setColor] = useState(initialColor);
  const [condicion, setCondicion] = useState<GarajeCondicion>("nueva");
  const [estado, setEstado] = useState<GarajeMotoEstado>("en_garaje");
  const [notas, setNotas] = useState("");
  const imageDataUrlRef = useRef<string | undefined>(undefined);
  const imageNameRef = useRef<string | undefined>(undefined);
  const urlPrefill =
    initialModelo.trim().length > 0 || initialColor.trim().length > 0;

  const catalogOptions = useMemo(
    () =>
      catalogoBikes.map((b) => ({
        value: String(b.id),
        label: `${b.modelo} · ${b.color}`,
      })),
    [catalogoBikes],
  );

  const catalogValue = useMemo(() => {
    const match = catalogoBikes.find(
      (b) => b.modelo === modelo && b.color === color,
    );
    return match ? String(match.id) : "";
  }, [catalogoBikes, modelo, color]);

  const persistDraft = useCallback(
    (overrides?: Partial<GarajeNuevaMotoDraft>) => {
      writeGarajeNuevaMotoDraft({
        ...defaultDraft(),
        parqueaderoId,
        placa,
        referencia,
        modelo,
        color,
        condicion,
        estado,
        notas,
        imageDataUrl: imageDataUrlRef.current,
        imageName: imageNameRef.current,
        ...overrides,
      });
    },
    [
      parqueaderoId,
      placa,
      referencia,
      modelo,
      color,
      condicion,
      estado,
      notas,
    ],
  );

  const restoreDraft = useCallback(async () => {
    const draft = readGarajeNuevaMotoDraft();
    if (!draft) {
      if (urlPrefill) {
        setModelo(initialModelo);
        setColor(initialColor);
        if (initialModelo) setReferencia(initialModelo);
      }
      return;
    }

    setParqueaderoId(draft.parqueaderoId ?? "none");
    setPlaca(draft.placa ?? "");
    const draftRef = draft.referencia ?? "";
    // ponytail: URL deep-link wins over draft for modelo/color
    setModelo(urlPrefill ? initialModelo : (draft.modelo ?? ""));
    setColor(urlPrefill ? initialColor : (draft.color ?? ""));
    setReferencia(
      urlPrefill && initialModelo && !draftRef.trim()
        ? initialModelo
        : draftRef,
    );
    setCondicion(draft.condicion ?? "nueva");
    setEstado(draft.estado ?? "en_garaje");
    setNotas(draft.notas ?? "");
    imageDataUrlRef.current = draft.imageDataUrl;
    imageNameRef.current = draft.imageName;

    if (draft.imageDataUrl) {
      setImagePreviewUrl(draft.imageDataUrl);
      const restored = await fileFromDataUrl(
        draft.imageDataUrl,
        draft.imageName ?? "foto-placa.jpg",
      );
      if (restored) setImageFile(restored);
    }
  }, [initialColor, initialModelo, urlPrefill]);

  useEffect(() => {
    void restoreDraft().finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void restoreDraft();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [restoreDraft]);

  useEffect(() => {
    if (!hydrated) return;
    persistDraft();
  }, [
    hydrated,
    persistDraft,
    parqueaderoId,
    placa,
    referencia,
    modelo,
    color,
    condicion,
    estado,
    notas,
  ]);

  async function handleImageSelected(file: File) {
    try {
      const dataUrl = await dataUrlFromFile(file);
      imageDataUrlRef.current = dataUrl;
      imageNameRef.current = file.name;
      setImagePreviewUrl(dataUrl);
      persistDraft({
        imageDataUrl: dataUrl,
        imageName: file.name,
      });
    } catch {
      toast.error("No se pudo guardar la foto en el borrador.");
    }
  }

  function handleImageClear() {
    imageDataUrlRef.current = undefined;
    imageNameRef.current = undefined;
    setImageFile(null);
    setImagePreviewUrl(null);
    persistDraft({ imageDataUrl: undefined, imageName: undefined });
  }

  function applyCatalog(bikeId: string) {
    if (!bikeId) return;
    const bike = catalogoBikes.find((b) => String(b.id) === bikeId);
    if (!bike) return;
    setModelo(bike.modelo);
    setColor(bike.color);
    if (!referencia.trim()) setReferencia(bike.modelo);
  }

  const requiresPhoto = condicion !== "nueva";
  const canSave =
    !pending &&
    referencia.trim() &&
    modelo.trim() &&
    color.trim() &&
    (!requiresPhoto || imageFile != null);

  function handleSubmit() {
    if (!canSave) return;
    if (requiresPhoto && !imageFile) return;

    const modeloSaved = modelo.trim();
    const colorSaved = color.trim();

    startTransition(async () => {
      try {
        let placaFotoUrl: string | undefined;
        if (imageFile) {
          placaFotoUrl = await uploadImageFromBrowser(
            STORAGE_BUCKETS.garajeImagenes,
            garajeUploadFolder(placa || referencia),
            imageFile,
          );
        }

        const result = await saveGarajeMoto({
          parqueaderoId:
            parqueaderoId === "none" ? null : Number(parqueaderoId),
          placa,
          placaFotoUrl,
          referencia,
          modelo: modeloSaved,
          color: colorSaved,
          origen: "manual",
          condicion,
          estado,
          notas,
          isNewManual: true,
        });

        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        clearGarajeNuevaMotoDraft();
        const contadoQs = new URLSearchParams({
          nuevo: "1",
          modelo: modeloSaved,
          color: colorSaved,
        });
        toast.success("Moto registrada.", {
          duration: 8000,
          action: {
            label: "Vender contado",
            onClick: () => router.push(`/venta-contado?${contadoQs}`),
          },
        });
        router.push("/garaje");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {catalogOptions.length > 0 ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="garaje-catalogo-modelo">Modelo del catálogo</Label>
            <TouchSelect
              id="garaje-catalogo-modelo"
              aria-label="Modelo del catálogo"
              value={catalogValue}
              onChange={applyCatalog}
              placeholder="Elegir del catálogo…"
              options={catalogOptions}
            />
            <p className="text-xs text-muted-foreground">
              Rellena modelo y color. Si el modelo no existe, créalo antes en{" "}
              <Link
                href="/catalogo"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Modelos
              </Link>
              .
            </p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <ImageFileField
            label={
              condicion === "nueva"
                ? "Foto de placa (opcional)"
                : "Foto de placa"
            }
            file={imageFile}
            previewUrl={imagePreviewUrl}
            onFileChange={(file) => {
              if (!file) {
                handleImageClear();
                return;
              }
              setImageFile(file);
            }}
            disabled={pending}
            enableCamera
            fileInputId="garaje-nueva-moto-file"
            cameraInputId="garaje-nueva-moto-camera"
            onFileSelected={handleImageSelected}
          />
        </div>
        <Field label="Placa" value={placa} onChange={setPlaca} />
        <Field label="Referencia moto" value={referencia} onChange={setReferencia} />
        <Field label="Modelo" value={modelo} onChange={setModelo} />
        <Field label="Color" value={color} onChange={setColor} />
        <div className="flex flex-col gap-2">
          <Label>Parqueadero</Label>
          <TouchSelect
            aria-label="Parqueadero"
            value={parqueaderoId}
            onChange={setParqueaderoId}
            options={[
              { value: "none", label: "Sin asignar" },
              ...parqueaderos.map((p) => ({
                value: String(p.id),
                label: p.nombre,
              })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Condición</Label>
          <TouchSelect
            aria-label="Condición"
            value={condicion}
            onChange={(v) => setCondicion(v as GarajeCondicion)}
            options={(
              Object.keys(GARAJE_CONDICION_LABELS) as GarajeCondicion[]
            ).map((c) => ({
              value: c,
              label: GARAJE_CONDICION_LABELS[c],
            }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Estado</Label>
          <TouchSelect
            aria-label="Estado"
            value={estado}
            onChange={(v) => setEstado(v as GarajeMotoEstado)}
            options={(
              Object.keys(GARAJE_ESTADO_LABELS) as GarajeMotoEstado[]
            ).map((e) => ({
              value: e,
              label: GARAJE_ESTADO_LABELS[e],
            }))}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Notas</Label>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="min-h-24 touch-manipulation text-base md:text-sm"
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-background p-4 safe-area-bottom sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <Link href="/garaje" className={outlineBtnClass}>
          Cancelar
        </Link>
        <button
          type="submit"
          className={cn(actionBtnClass, "sm:w-auto")}
          disabled={!canSave}
        >
          {pending ? "Guardando…" : "Guardar moto"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
    </div>
  );
}
