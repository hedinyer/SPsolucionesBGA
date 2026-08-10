"use client";

import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import {
  VentaCotizacionPdfDoc,
  type VentaCartLine,
} from "@/lib/printing/venta-cotizacion-pdf";
import { formatCop } from "@/lib/utils/format";

export type { VentaCartLine };

export function cartTotal(lines: VentaCartLine[]): number {
  return lines.reduce(
    (sum, line) => sum + line.precioUnitario * line.cantidad,
    0,
  );
}

export function buildCotizacionText(lines: VentaCartLine[]): string {
  const total = cartTotal(lines);
  const header = "Hola, te envío la cotización de repuestos:\n";
  const items = lines
    .map(
      (line) =>
        `• ${line.nombre} (${line.sku}) — ${line.cantidad} × ${formatCop(line.precioUnitario)} = ${formatCop(line.precioUnitario * line.cantidad)}`,
    )
    .join("\n");
  return `${header}\n${items}\n\nTotal: ${formatCop(total)}`;
}

export async function buildVentaCotizacionPdfBlob(
  lines: VentaCartLine[],
): Promise<Blob> {
  const total = cartTotal(lines);
  const fecha = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const doc = (
    <VentaCotizacionPdfDoc lines={lines} total={total} fecha={fecha} />
  );
  return pdf(doc).toBlob();
}

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareCotizacionWhatsApp(
  lines: VentaCartLine[],
  celular: string,
): Promise<void> {
  if (lines.length === 0) {
    throw new Error("El carrito está vacío.");
  }

  const digits = celular.replace(/\D/g, "");
  if (digits.length < 10) {
    throw new Error("Ingresa un celular válido (mínimo 10 dígitos).");
  }

  const blob = await buildVentaCotizacionPdfBlob(lines);
  const text = buildCotizacionText(lines);
  const filename = `cotizacion-${new Date().toISOString().slice(0, 10)}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  const waUrl = `https://wa.me/57${digits}?text=${encodeURIComponent(text)}`;

  // ponytail: en celular wa.me abre el chat del cliente; share() no elige número
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    window.location.assign(waUrl);
    return;
  }

  if (navigator.canShare?.({ files: [file], text })) {
    await navigator.share({ files: [file], text });
    return;
  }

  downloadPdf(blob, filename);
  window.open(waUrl, "_blank", "noopener,noreferrer");
  toast.info("Adjunta el PDF descargado en WhatsApp.");
}
