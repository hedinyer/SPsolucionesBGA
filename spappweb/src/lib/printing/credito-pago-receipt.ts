import {
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  type ContextoPago,
  type MedioPagoAdminStored,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";

export interface CreditoPagoReceiptData {
  pagoId: string;
  clienteNombre: string;
  clienteCedula: string;
  motoModelo: string;
  motoColor: string;
  concepto: ContextoPago;
  monto: number;
  medioPago: MedioPagoAdminStored;
  referencia: string | null;
  confirmadoAt: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function folio(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function fechaLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date());
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

async function qrDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function buildCreditoPagoReceiptHtml(
  recibo: CreditoPagoReceiptData,
  origin = "",
): Promise<string> {
  const f = folio(recibo.pagoId);
  const qrSrc = await qrDataUrl(f);
  const beraLogo = `${origin}/beralogo.jpg`;
  const sgLogo = `${origin}/logosolucionesgarrido.jpg`;
  const medioLabel = MEDIO_PAGO_ADMIN_LABELS[recibo.medioPago] ?? recibo.medioPago;
  const conceptoLabel = CONTEXTO_PAGO_LABELS[recibo.concepto];
  const refHtml = recibo.referencia
    ? `<div class="sub">Ref. ${esc(recibo.referencia)}</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${esc(f)}</title>
<style>
@media print { body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 11px;
  max-width: 72mm;
  margin: 8px auto;
  padding: 8px 6px;
  color: #111;
  line-height: 1.4;
}
.logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}
.logos img {
  max-width: 42%;
  max-height: 36px;
  object-fit: contain;
}
.divider {
  border: none;
  border-top: 1px dashed #ccc;
  margin: 10px 0;
}
.header { text-align: center; margin-bottom: 4px; }
.header h1 { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
.header p { font-size: 10px; color: #555; }
.section { margin-bottom: 8px; }
.label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
.value { font-size: 11px; font-weight: 600; margin-top: 2px; }
.sub { font-size: 10px; color: #444; margin-top: 2px; }
.totals {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  margin: 10px 0;
}
.totals .row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}
.totals .amount { font-weight: 700; }
.status-ok {
  margin-top: 8px;
  text-align: center;
  font-weight: 700;
  font-size: 11px;
}
.qr-block { text-align: center; margin-top: 8px; }
.qr-block img { width: 88px; height: 88px; }
.folio-qr { font-size: 9px; color: #666; margin-top: 4px; letter-spacing: 0.08em; }
.footer { text-align: center; font-size: 10px; color: #666; margin-top: 8px; }
</style></head><body>
<div class="logos">
  <img src="${esc(beraLogo)}" alt="Bera" />
  <img src="${esc(sgLogo)}" alt="Soluciones Garrido" />
</div>
<div class="header">
  <h1>RECIBO DE PAGO</h1>
  <p>Crédito moto · ${esc(conceptoLabel)}</p>
  <p>${esc(fechaLabel(recibo.confirmadoAt))}</p>
</div>
<hr class="divider" />
<div class="section">
  <div class="label">Cliente</div>
  <div class="value">${esc(recibo.clienteNombre)}</div>
  <div class="sub">C.C. ${esc(recibo.clienteCedula)}</div>
</div>
<div class="section">
  <div class="label">Moto</div>
  <div class="value">${esc(recibo.motoModelo)} · ${esc(recibo.motoColor)}</div>
</div>
<div class="section">
  <div class="label">Medio de pago</div>
  <div class="value">${esc(medioLabel)}</div>
  ${refHtml}
</div>
<div class="totals">
  <div class="row">
    <span>${esc(conceptoLabel)}</span>
    <span class="amount">${esc(formatCop(recibo.monto))}</span>
  </div>
  <div class="status-ok">✓ PAGO RECIBIDO</div>
</div>
<hr class="divider" />
<div class="qr-block">
  <img src="${qrSrc}" alt="QR ${esc(f)}" />
  <div class="folio-qr">${esc(f)}</div>
</div>
<div class="footer">Conserve este recibo</div>
</body></html>`;
}

function triggerPrint(win: Window): void {
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      // el usuario imprime con Ctrl+P desde la pestaña abierta
    }
  }, 400);
}

export async function printCreditoPagoReceipt(
  recibo: CreditoPagoReceiptData,
): Promise<void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const html = await buildCreditoPagoReceiptHtml(recibo, origin);
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    triggerPrint(popup);
    return;
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0",
  );
  iframe.src = url;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win) triggerPrint(win);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 120_000);
  };
  document.body.appendChild(iframe);
}
