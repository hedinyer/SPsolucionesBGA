import type { GarajeCondicion, GarajeMotoEstado } from "@/lib/pipeline/types";

export const GARAJE_NUEVA_MOTO_DRAFT_KEY = "garaje-nueva-moto-draft";

export type GarajeNuevaMotoDraft = {
  parqueaderoId: string;
  placa: string;
  referencia: string;
  modelo: string;
  color: string;
  condicion: GarajeCondicion;
  estado: GarajeMotoEstado;
  notas: string;
  imageDataUrl?: string;
  imageName?: string;
};

export function readGarajeNuevaMotoDraft(): GarajeNuevaMotoDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GARAJE_NUEVA_MOTO_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GarajeNuevaMotoDraft;
  } catch {
    return null;
  }
}

export function writeGarajeNuevaMotoDraft(draft: GarajeNuevaMotoDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GARAJE_NUEVA_MOTO_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage full — ignore
  }
}

export function clearGarajeNuevaMotoDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(GARAJE_NUEVA_MOTO_DRAFT_KEY);
}

export async function fileFromDataUrl(
  dataUrl: string,
  name: string,
): Promise<File | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const type = blob.type || "image/jpeg";
    return new File([blob], name || "foto-placa.jpg", { type });
  } catch {
    return null;
  }
}

export async function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
