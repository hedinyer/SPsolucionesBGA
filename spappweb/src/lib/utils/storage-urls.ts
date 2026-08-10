import { SUPABASE_URL } from "@/lib/supabase/public-env";

export function getStoragePublicUrl(
  bucket: string,
  path: string | null,
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function getContractPublicUrl(path: string | null): string | null {
  return getStoragePublicUrl("contract-documents", path);
}

/** Ruta relativa en el bucket a partir de URL pública o path guardado. */
export function storagePathFromPublicUrl(
  bucket: string,
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  if (!value.startsWith("http")) return value;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(value.slice(idx + marker.length));
}
