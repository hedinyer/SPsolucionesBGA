import { parseReceiptText, type ParsedReceipt } from "./receipt-parser";

export type ClientOcrResult = ParsedReceipt & { rawText: string };

// ponytail: OCR en el browser evita timeouts de Vercel; reutiliza worker por sesión
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("spa");
    })();
  }
  return workerPromise;
}

export async function ocrReceiptFile(file: File): Promise<ClientOcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(file);
  const rawText = data.text ?? "";
  return { ...parseReceiptText(rawText), rawText };
}
