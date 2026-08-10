import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/public-env";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import type {
  VisitaEvidenciaFoto,
  VisitaEvidenciaVideo,
} from "@/lib/pipeline/types";
import { compressImageFile } from "@/lib/utils/compress-image-file";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

function buildPath(
  visitadorId: number,
  visitaId: string,
  kind: "fotos" | "videos",
  ext: string,
) {
  return `${visitadorId}/${visitaId}/${kind}/${Date.now()}.${ext}`;
}

function extensionForVideo(mime: string): string {
  switch (mime) {
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
  }
}

function normalizeVideoFile(file: File): File {
  const type = file.type?.toLowerCase() ?? "";
  if (type && type !== "application/octet-stream" && VIDEO_MIME.has(type)) {
    return file;
  }

  const lowerName = file.name.toLowerCase();
  const mime = lowerName.endsWith(".webm")
    ? "video/webm"
    : lowerName.endsWith(".mov") || lowerName.endsWith(".qt")
      ? "video/quicktime"
      : "video/mp4";
  const name =
    file.name && file.name.trim().length > 0
      ? file.name
      : `video-${Date.now()}.${extensionForVideo(mime)}`;
  return new File([file], name, { type: mime, lastModified: file.lastModified });
}

function validateVideo(file: File): string | null {
  if (file.size === 0) return "El video está vacío.";
  if (file.size > MAX_VIDEO_BYTES) {
    return "El video no puede superar 50 MB. Graba uno más corto o elige otro.";
  }
  const normalized = normalizeVideoFile(file);
  if (!VIDEO_MIME.has(normalized.type)) {
    return "Usa MP4, WebM o MOV.";
  }
  return null;
}

/** ponytail: XHR directo a Storage para barra de progreso en conexiones lentas. */
function uploadWithProgress(
  path: string,
  body: Blob,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${STORAGE_BUCKETS.visitaEvidencias}/${path}`;

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "No se pudo subir el archivo.";
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        // ignore
      }
      reject(new Error(message));
    };

    xhr.onerror = () => {
      reject(
        new Error(
          "Conexión inestable. Verifica tu señal e intenta de nuevo.",
        ),
      );
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          "La subida tardó demasiado. Prueba con mejor señal o un archivo más pequeño.",
        ),
      );
    };

    xhr.timeout = 10 * 60 * 1000;
    xhr.send(body);
  });
}

async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    try {
      return await fn();
    } catch {
      throw first;
    }
  }
}

export async function uploadVisitaPhotoFromBrowser(
  visitadorId: number,
  visitaId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<VisitaEvidenciaFoto> {
  if (file.size === 0) throw new Error("La foto está vacía.");

  onProgress?.(5);
  const compressed = await compressImageFile(file);
  onProgress?.(15);

  const path = buildPath(visitadorId, visitaId, "fotos", "jpg");

  await runWithRetry(() =>
    uploadWithProgress(path, compressed, "image/jpeg", (pct) => {
      onProgress?.(15 + Math.round(pct * 0.85));
    }),
  );

  const url = getStoragePublicUrl(STORAGE_BUCKETS.visitaEvidencias, path);
  if (!url) throw new Error("No se pudo obtener la URL de la foto.");

  onProgress?.(100);
  return { url, captured_at: new Date().toISOString() };
}

export async function uploadVisitaVideoFromBrowser(
  visitadorId: number,
  visitaId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<VisitaEvidenciaVideo> {
  const error = validateVideo(file);
  if (error) throw new Error(error);

  const normalized = normalizeVideoFile(file);
  const path = buildPath(
    visitadorId,
    visitaId,
    "videos",
    extensionForVideo(normalized.type),
  );

  await runWithRetry(() =>
    uploadWithProgress(path, normalized, normalized.type, onProgress),
  );

  const url = getStoragePublicUrl(STORAGE_BUCKETS.visitaEvidencias, path);
  if (!url) throw new Error("No se pudo obtener la URL del video.");

  onProgress?.(100);
  return { url, captured_at: new Date().toISOString() };
}
