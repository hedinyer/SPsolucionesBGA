export type BancoDetectado =
  | "nequi"
  | "davivienda"
  | "bancolombia"
  | "banco_bogota"
  | "pse"
  | "otro"
  | null;

export interface ParsedReceipt {
  referencia: string | null;
  monto: number | null;
  fechaComprobante: string | null;
  bancoDetectado: BancoDetectado;
  confidence: number;
}

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MES_PATTERN =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

function normalizeOcrText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I");
}

function parseColombianAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (/,/.test(cleaned) && /\./.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/,/.test(cleaned)) {
    const parts = cleaned.split(",");
    if (parts[1]?.length === 2) {
      normalized = parts[0].replace(/\./g, "") + "." + parts[1];
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else {
    normalized = cleaned.replace(/\./g, "");
  }

  const value = Math.round(parseFloat(normalized));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractReferencia(text: string): string | null {
  const patterns = [
    /(?:numero\s+de\s+)?(?:comprobante|autorizacion|autorización)\s*[:\-]?\s*([A-Z]{0,3}\d{6,15})/i,
    /(?:numero\s+de\s+)?referencia\s*[:\-]?\s*([A-Z]?\d{5,15})/i,
    /cus\s*[:\-]?\s*(\d{6,15})/i,
    /(?:numero\s+de\s+)?factura\s*[:\-]?\s*(\d{6,15})/i,
    /\b(TR\d{6,14})\b/i,
    /\b(M\d{5,12})\b/i,
    /\b([A-Z]{1,2}\d{6,12})\b/,
    /\b(\d{8,12})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

function extractMonto(text: string): number | null {
  const cuantoPatterns = [
    /cu[aá]nto\s*\??\s*\$?\s*([\d.,\s]+)/i,
    /valor(?:\s+del\s+pago|\s+a\s+transferir)?\s*[:\-]?\s*\$?\s*([\d.,\s]+)/i,
    /monto\s*[:\-]?\s*\$?\s*([\d.,\s]+)/i,
    /\$\s*([\d]{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)/,
  ];

  for (const pattern of cuantoPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parsed = parseColombianAmount(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

function toIsoLocal(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds = 0,
): string | null {
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoLocal = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}-05:00`;
  const date = new Date(isoLocal);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseAmPmHours(hours: number, meridiem: string): number {
  const isPm = /p/i.test(meridiem);
  if (isPm && hours < 12) return hours + 12;
  if (!isPm && hours === 12) return 0;
  return hours;
}

function extractFecha(text: string): string | null {
  // "12 de julio de 2026 a las 3:45 p.m."
  const longEs = text.match(
    new RegExp(
      `(\\d{1,2})\\s+de\\s+(${MES_PATTERN})\\s+de\\s+(\\d{4})(?:\\s+a\\s+las\\s+(\\d{1,2})\\s*:\\s*(\\d{2})\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?))?`,
      "i",
    ),
  );
  if (longEs) {
    const day = parseInt(longEs[1], 10);
    const month = MESES[longEs[2].toLowerCase()];
    const year = parseInt(longEs[3], 10);
    let hours = 12;
    let minutes = 0;
    if (longEs[4] && longEs[5] && longEs[6]) {
      hours = parseAmPmHours(parseInt(longEs[4], 10), longEs[6]);
      minutes = parseInt(longEs[5], 10);
    }
    const iso = toIsoLocal(year, month, day, hours, minutes);
    if (iso) return iso;
  }

  // "7 marzo 2025 16:22:57" / "7 marzo 2025"
  const shortMonth = text.match(
    new RegExp(
      `(\\d{1,2})\\s+(${MES_PATTERN})\\s+(\\d{4})(?:\\s+(\\d{1,2})\\s*:\\s*(\\d{2})(?:\\s*:\\s*(\\d{2}))?)?`,
      "i",
    ),
  );
  if (shortMonth) {
    const day = parseInt(shortMonth[1], 10);
    const month = MESES[shortMonth[2].toLowerCase()];
    const year = parseInt(shortMonth[3], 10);
    const hours = shortMonth[4] ? parseInt(shortMonth[4], 10) : 12;
    const minutes = shortMonth[5] ? parseInt(shortMonth[5], 10) : 0;
    const seconds = shortMonth[6] ? parseInt(shortMonth[6], 10) : 0;
    const iso = toIsoLocal(year, month, day, hours, minutes, seconds);
    if (iso) return iso;
  }

  // "07/03/2025 16:22" or "07-03-2025"
  const numeric = text.match(
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?)?/,
  );
  if (numeric) {
    const day = parseInt(numeric[1], 10);
    const month = parseInt(numeric[2], 10);
    const year = parseInt(numeric[3], 10);
    const hours = numeric[4] ? parseInt(numeric[4], 10) : 12;
    const minutes = numeric[5] ? parseInt(numeric[5], 10) : 0;
    const seconds = numeric[6] ? parseInt(numeric[6], 10) : 0;
    const iso = toIsoLocal(year, month, day, hours, minutes, seconds);
    if (iso) return iso;
  }

  return null;
}

function detectBanco(text: string): BancoDetectado {
  const lower = text.toLowerCase();
  if (lower.includes("nequi")) return "nequi";
  if (lower.includes("davivienda") || lower.includes("daviplata")) {
    return "davivienda";
  }
  if (lower.includes("bancolombia")) return "bancolombia";
  if (
    lower.includes("banco de bogota") ||
    lower.includes("banco de bogotá") ||
    lower.includes("tag aval")
  ) {
    return "banco_bogota";
  }
  if (
    lower.includes("pago pse") ||
    lower.includes("bre-b") ||
    lower.includes("breb") ||
    (/\bcus\b/i.test(text) && /pago|comprobante|factura/i.test(text))
  ) {
    return "pse";
  }
  return null;
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = normalizeOcrText(rawText);
  const referencia = extractReferencia(text);
  const monto = extractMonto(text);
  const fechaComprobante = extractFecha(text);
  const bancoDetectado = detectBanco(text);

  let confidence = 0;
  if (referencia) confidence += 1;
  if (monto) confidence += 1;
  if (fechaComprobante) confidence += 1;

  return {
    referencia,
    monto,
    fechaComprobante,
    bancoDetectado,
    confidence,
  };
}
