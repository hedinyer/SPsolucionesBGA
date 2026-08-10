import { createBrowserClient } from "@/lib/supabase/browser";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { compressImageFile } from "@/lib/utils/compress-image-file";

export type DocumentPhotoKey = "document_front" | "document_back" | "selfie";

/** Sube foto de identidad. folder: userId numérico o pending/uuid */
export async function uploadDocumentPhotoFromBrowser(
  folder: string | number,
  type: DocumentPhotoKey,
  file: File,
): Promise<string> {
  const compressed = await compressImageFile(file);
  const path = `${folder}/${type}_${Date.now()}.jpg`;
  const supabase = createBrowserClient();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.userDocuments)
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  const publicUrl = getStoragePublicUrl(STORAGE_BUCKETS.userDocuments, path);
  if (!publicUrl) {
    throw new Error("No se pudo obtener la URL de la imagen.");
  }

  return publicUrl;
}
