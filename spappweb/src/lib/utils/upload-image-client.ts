import { createBrowserClient } from "@/lib/supabase/browser";
import type { AdminImageBucket } from "@/lib/supabase/storage-buckets";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { compressImageFile } from "@/lib/utils/compress-image-file";

function sanitizeFolder(folder: string): string {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 120);
}

/** Sube directo a Supabase Storage desde el navegador (evita límite de Server Actions en Vercel). */
export async function uploadImageFromBrowser(
  bucket: AdminImageBucket,
  folder: string,
  file: File,
): Promise<string> {
  const compressed = await compressImageFile(file);
  const safeFolder = sanitizeFolder(folder);
  const path = `${safeFolder}/${Date.now()}.jpg`;
  const supabase = createBrowserClient();

  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  const publicUrl = getStoragePublicUrl(bucket, path);
  if (!publicUrl) {
    throw new Error("No se pudo obtener la URL de la imagen.");
  }

  return publicUrl;
}
