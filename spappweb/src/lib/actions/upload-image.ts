"use server";

import sharp from "sharp";
import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STORAGE_BUCKETS,
  type AdminImageBucket,
} from "@/lib/supabase/storage-buckets";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";

const ALLOWED_BUCKETS: AdminImageBucket[] = [
  STORAGE_BUCKETS.visitadorFotos,
  STORAGE_BUCKETS.bikeImages,
  STORAGE_BUCKETS.inventarioImagenes,
  STORAGE_BUCKETS.pagosComprobantes,
  STORAGE_BUCKETS.garajeImagenes,
];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function sanitizeFolder(folder: string): string {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 120);
}

export async function uploadAdminImage(formData: FormData): Promise<{
  path: string;
  publicUrl: string;
}> {
  await requireAdminSession();

  const bucket = String(formData.get("bucket") ?? "") as AdminImageBucket;
  const folder = sanitizeFolder(String(formData.get("folder") ?? "uploads"));
  const file = formData.get("file");

  if (!ALLOWED_BUCKETS.includes(bucket)) {
    throw new Error("Destino de imagen no válido.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona una imagen.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("La imagen no puede superar 12 MB.");
  }

  const rawBytes = Buffer.from(await file.arrayBuffer());
  let bytes: Buffer = rawBytes;
  let contentType = "image/jpeg";
  try {
    bytes = await sharp(rawBytes)
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    const mime = file.type.toLowerCase();
    if (
      mime === "image/jpeg" ||
      mime === "image/png" ||
      mime === "image/webp"
    ) {
      bytes = rawBytes;
      contentType = mime;
    } else {
      throw new Error(
        "No se pudo procesar la imagen. Prueba con otra foto (JPG o PNG).",
      );
    }
  }
  if (bytes.length > MAX_BYTES) {
    throw new Error("La imagen no puede superar 5 MB después de procesarla.");
  }

  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${folder}/${Date.now()}.${ext}`;
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  const publicUrl = getStoragePublicUrl(bucket, path);
  if (!publicUrl) {
    throw new Error("No se pudo obtener la URL de la imagen.");
  }

  return { path, publicUrl };
}
