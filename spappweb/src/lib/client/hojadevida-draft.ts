import type { HojaVidaFormData } from "@/lib/contracts/hoja-vida-schema";
import { clearDraft, readDraft, writeDraft } from "@/lib/client/form-draft-storage";

export const HOJADEVIDA_DRAFT_KEY = "hojadevida-draft";
export const HOJADEVIDA_UPLOAD_FOLDER_KEY = "hojadevida-upload-folder";

export type HojadevidaPhotoUrls = {
  documentFrontUrl: string;
  documentBackUrl: string;
  selfieUrl: string;
};

export type HojadevidaApplicationDraft = {
  uploadFolder: string;
  photoUrls?: HojadevidaPhotoUrls;
  form?: HojaVidaFormData;
  formStepIndex?: number;
  resumeStep?: "photos" | "hoja";
  referralSource?: string | null;
};

export function readHojadevidaDraft(): HojadevidaApplicationDraft | null {
  return readDraft<HojadevidaApplicationDraft>(HOJADEVIDA_DRAFT_KEY);
}

export function writeHojadevidaDraft(draft: HojadevidaApplicationDraft): void {
  writeDraft(HOJADEVIDA_DRAFT_KEY, draft);
}

export function clearHojadevidaDraft(): void {
  clearDraft(HOJADEVIDA_DRAFT_KEY);
  clearDraft(HOJADEVIDA_UPLOAD_FOLDER_KEY);
}

export function getStableUploadFolder(): string {
  if (typeof window === "undefined") return "pending/ssr";
  let folder = sessionStorage.getItem(HOJADEVIDA_UPLOAD_FOLDER_KEY);
  if (!folder) {
    folder = `pending/${crypto.randomUUID()}`;
    sessionStorage.setItem(HOJADEVIDA_UPLOAD_FOLDER_KEY, folder);
  }
  return folder;
}

export function contratoDraftKey(contractId: string): string {
  return `contrato-draft-${contractId}`;
}

export type ContratoSignDraft = {
  step: number;
  nombre: string;
  cedula: string;
  direccion: string;
  departamento: string;
  ciudad: string;
  aceptaClausulas: boolean;
  aceptaFirma: boolean;
};
