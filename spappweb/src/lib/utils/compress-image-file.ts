const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;
const TARGET_MAX_BYTES = Math.round(1.5 * 1024 * 1024);
const HARD_MAX_UNCOMPRESSED_BYTES = 3 * 1024 * 1024;
const RETRY_DIMENSION = 1024;
const RETRY_QUALITY = 0.6;

function baseNameFrom(file: File): string {
  return file.name && file.name.trim().length > 0
    ? file.name.replace(/\.[^.]+$/, "")
    : `foto-${Date.now()}`;
}

function toJpegFile(blob: Blob, baseName: string): File {
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function clearCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

async function loadViaImageBitmap(
  file: File,
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; release: () => void } | null> {
  if (!("createImageBitmap" in window)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      release: () => bitmap.close?.(),
    };
  } catch {
    return null;
  }
}

async function loadViaImageElement(
  file: File,
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; release: () => void } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen."));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      release: () => {
        img.src = "";
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

async function encodeJpeg(
  source: {
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  },
  maxDimension: number,
  quality: number,
): Promise<Blob | null> {
  const longest = Math.max(source.width, source.height);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    clearCanvas(canvas);
    return null;
  }

  try {
    source.draw(ctx, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    return blob && blob.size > 0 ? blob : null;
  } finally {
    clearCanvas(canvas);
  }
}

/**
 * Comprime a JPEG con poca RAM. En móviles viejos usa Image como fallback.
 * Rechaza originales > 3 MB si no se pudo comprimir.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (typeof window === "undefined") return file;

  const baseName = baseNameFrom(file);
  const source =
    (await loadViaImageBitmap(file)) ?? (await loadViaImageElement(file));

  if (!source) {
    if (file.size > HARD_MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        "La foto es demasiado pesada para este celular. Toma otra con menos resolución o elige una de la galería más liviana.",
      );
    }
    return file;
  }

  try {
    let blob = await encodeJpeg(source, MAX_DIMENSION, JPEG_QUALITY);
    if (blob && blob.size > TARGET_MAX_BYTES) {
      const lighter = await encodeJpeg(source, RETRY_DIMENSION, RETRY_QUALITY);
      if (lighter && lighter.size < blob.size) blob = lighter;
    }

    if (!blob) {
      if (file.size > HARD_MAX_UNCOMPRESSED_BYTES) {
        throw new Error(
          "No se pudo optimizar la foto y es demasiado pesada. Intenta de nuevo o usa la galería.",
        );
      }
      return file;
    }

    return toJpegFile(blob, baseName);
  } finally {
    source.release();
  }
}
