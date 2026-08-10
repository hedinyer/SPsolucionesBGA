"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Camera, ImagePlus, X } from "lucide-react";
import { compressImageFile } from "@/lib/utils/compress-image-file";
import { uploadImageFromBrowser } from "@/lib/utils/upload-image-client";
import type { AdminImageBucket } from "@/lib/supabase/storage-buckets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ImageFileFieldProps {
  label?: string;
  existingUrl?: string | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  /** Captura Ctrl+V dentro del diálogo padre (útil para comprobantes). */
  enableDialogPaste?: boolean;
  /** Botón para abrir cámara del dispositivo (capture=environment). */
  enableCamera?: boolean;
  /** IDs estables para inputs (evita problemas con useId en móvil). */
  fileInputId?: string;
  cameraInputId?: string;
  /** Se llama en cuanto el usuario elige una imagen (útil para persistir borrador). */
  onFileSelected?: (file: File) => void | Promise<void>;
  /** URL de vista previa externa (p. ej. data URL restaurada de borrador). */
  previewUrl?: string | null;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function validateImageFile(file: File): string | null {
  if (file.size === 0) return "La imagen está vacía.";
  if (file.size > MAX_INPUT_BYTES) {
    return "La imagen no puede superar 12 MB.";
  }
  const type = file.type.toLowerCase();
  if (
    !type ||
    type === "application/octet-stream" ||
    type.startsWith("image/")
  ) {
    return null;
  }
  return "Selecciona un archivo de imagen.";
}

async function prepareImageFile(file: File): Promise<File> {
  const compressed = await compressImageFile(normalizeImageFile(file));
  if (compressed.size > MAX_BYTES) {
    throw new Error("La imagen comprimida supera 5 MB. Usa otra foto.");
  }
  return compressed;
}

function normalizeImageFile(file: File): File {
  const type = file.type.toLowerCase();
  if (type && type !== "application/octet-stream" && type.startsWith("image/")) {
    return file;
  }
  const lowerName = file.name.toLowerCase();
  const mime = lowerName.endsWith(".png")
    ? "image/png"
    : lowerName.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const name =
    file.name && file.name.trim().length > 0
      ? file.name
      : `foto-${Date.now()}.jpg`;
  return new File([file], name, { type: mime, lastModified: file.lastModified });
}

function fileFromClipboardData(
  clipboardData: DataTransfer | null,
): File | null {
  if (!clipboardData?.items) return null;

  for (const item of clipboardData.items) {
    if (!item.type.startsWith("image/")) continue;
    const blob = item.getAsFile();
    if (!blob) continue;

    const type = ALLOWED_MIME.has(blob.type)
      ? blob.type
      : item.type.startsWith("image/")
        ? item.type
        : "image/png";

    if (!ALLOWED_MIME.has(type)) continue;

    return new File(
      [blob],
      `comprobante-pegado-${Date.now()}.${extensionForMime(type)}`,
      { type },
    );
  }

  return null;
}

async function applyPastedFile(
  rawFile: File | null,
  onFileChange: (file: File | null) => void,
  setPasteError: (msg: string | null) => void,
  inputRef: React.RefObject<HTMLInputElement | null>,
  onFileSelected?: (file: File) => void | Promise<void>,
): Promise<boolean> {
  if (!rawFile) return false;

  const error = validateImageFile(rawFile);
  if (error) {
    setPasteError(error);
    return false;
  }

  try {
    const prepared = await prepareImageFile(rawFile);
    setPasteError(null);
    onFileChange(prepared);
    void onFileSelected?.(prepared);
    if (inputRef.current) inputRef.current.value = "";
    return true;
  } catch (e) {
    setPasteError(e instanceof Error ? e.message : "No se pudo procesar la imagen.");
    return false;
  }
}

export function ImageFileField({
  label = "Foto",
  existingUrl,
  file,
  onFileChange,
  disabled,
  enableDialogPaste = false,
  enableCamera = false,
  fileInputId = "image-file-picker",
  cameraInputId = "image-camera-picker",
  onFileSelected,
  previewUrl,
}: ImageFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setPreview(String(reader.result));
    };
    reader.onerror = () => {
      if (!cancelled) {
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
      }
    };
    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
    };
  }, [file]);

  const displayUrl = previewUrl ?? preview ?? existingUrl ?? null;

  useEffect(() => {
    if (disabled || !enableDialogPaste) return;

    function handleDocumentPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      const dialog = containerRef.current?.closest(
        '[data-slot="dialog-content"]',
      );
      if (!dialog) return;

      const pasted = fileFromClipboardData(e.clipboardData);
      if (!pasted) return;

      e.preventDefault();
      void applyPastedFile(
        pasted,
        onFileChange,
        setPasteError,
        inputRef,
        onFileSelected,
      );
    }

    document.addEventListener("paste", handleDocumentPaste);
    return () => document.removeEventListener("paste", handleDocumentPaste);
  }, [disabled, enableDialogPaste, onFileChange, onFileSelected]);

  function handlePasteEvent(e: React.ClipboardEvent) {
    if (disabled) return;
    const pasted = fileFromClipboardData(e.clipboardData);
    if (!pasted) return;
    e.preventDefault();
    void applyPastedFile(
      pasted,
      onFileChange,
      setPasteError,
      inputRef,
      onFileSelected,
    );
  }

  async function pasteFromClipboard() {
    if (disabled) return;

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (!type.startsWith("image/") || !ALLOWED_MIME.has(type)) continue;
          const blob = await item.getType(type);
          const pasted = new File(
            [blob],
            `comprobante-pegado-${Date.now()}.${extensionForMime(type)}`,
            { type },
          );
          if (
            await applyPastedFile(
              pasted,
              onFileChange,
              setPasteError,
              inputRef,
              onFileSelected,
            )
          ) {
            return;
          }
        }
      }
      setPasteError("No hay imagen en el portapapeles.");
    } catch {
      setPasteError("No se pudo leer el portapapeles. Prueba con Ctrl+V.");
    }
  }

  async function selectFile(selected: File | null) {
    if (!selected) {
      onFileChange(null);
      return;
    }
    const error = validateImageFile(selected);
    if (error) {
      setPasteError(error);
      return;
    }
    try {
      const prepared = await prepareImageFile(selected);
      setPasteError(null);
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(prepared);
      onFileChange(prepared);
      void onFileSelected?.(prepared);
    } catch (e) {
      setPasteError(
        e instanceof Error ? e.message : "No se pudo procesar la imagen.",
      );
    }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label}</Label>
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        tabIndex={disabled ? undefined : 0}
        onPaste={handlePasteEvent}
      >
        <div className="relative size-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt="Vista previa"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-400">
              <ImagePlus className="h-8 w-8" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id={fileInputId}
            name={fileInputId}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              selectFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {enableCamera && (
            <input
              ref={cameraInputRef}
              id={cameraInputId}
              name={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                selectFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {enableCamera && (
              <label
                htmlFor={cameraInputId}
                className={cn(
                  "inline-flex min-h-11 touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted",
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                <Camera className="pointer-events-none h-4 w-4" />
                Tomar foto
              </label>
            )}
            <label
              htmlFor={fileInputId}
              className={cn(
                "inline-flex min-h-11 touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <ImagePlus className="pointer-events-none h-4 w-4" />
              Elegir imagen
            </label>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 touch-manipulation"
              disabled={disabled}
              onClick={pasteFromClipboard}
            >
              <ClipboardPaste className="h-4 w-4" />
              Pegar imagen
            </Button>
          </div>
          {file && (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={() => {
                  onFileChange(null);
                  setPasteError(null);
                  if (inputRef.current) inputRef.current.value = "";
                  if (cameraInputRef.current) cameraInputRef.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {!file && existingUrl && (
            <p className="text-xs text-muted-foreground">
              Imagen actual guardada. Elige otra para reemplazarla.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            JPG, PNG o WebP · máx. 5 MB · también puedes pegar con Ctrl+V
          </p>
          {pasteError && (
            <p className="text-xs text-red-600">{pasteError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export async function uploadImageFile(
  bucket: AdminImageBucket,
  folder: string,
  file: File,
): Promise<string> {
  // ponytail: subida directa + compresión en cliente (mismo camino que garaje)
  return uploadImageFromBrowser(bucket, folder, file);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function visitadorUploadFolder(
  visitadorId: number | undefined,
  nombre: string,
): string {
  const slug = slugify(nombre) || "visitador";
  return visitadorId
    ? `visitadores/${visitadorId}-${slug}`
    : `visitadores/nuevo-${slug}-${Date.now()}`;
}

export function bikeUploadFolder(modelo: string, color: string): string {
  const slug = slugify(`${modelo}-${color}`) || "moto";
  return `catalogo/${slug}`;
}

export function productoUploadFolder(sku: string, nombre: string): string {
  const slug = slugify(`${sku}-${nombre}`) || "producto";
  return `productos/${slug}`;
}

export function garajeUploadFolder(placa: string, id?: string): string {
  const slug = slugify(placa) || id?.slice(0, 8) || "moto";
  return `garaje/${slug}`;
}
